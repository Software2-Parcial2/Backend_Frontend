import { randomUUID } from 'node:crypto';
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { HorariosService } from '../../application/horarios/horarios.service.js';
import { AgendaService } from '../../application/horarios/agenda.service.js';
import { aplicar, iniciar } from '../../application/saga/saga-machine.js';
import { DEFAULT_POLICY } from '../../application/saga/saga-policy.js';
import { DynamoAgendaRepository } from './dynamo-agenda.repository.js';
import { DynamoCitaRepository } from './dynamo-cita.repository.js';

// Integracion contra DynamoDB Local (docker compose up -d dynamodb). Se omite si no responde.
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const raw = new DynamoDBClient({ endpoint, region: 'sa-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const doc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
const suffix = randomUUID().slice(0, 8);
const tables = { citas: `test_agenda_${suffix}`, outbox: `test_agenda_outbox_${suffix}` };

const available = await (async () => {
  try {
    await raw.send(
      new CreateTableCommand({
        TableName: tables.citas,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          ...['gsi1', 'gsi2', 'gsi3', 'gsi4'].flatMap((n) => [
            { AttributeName: `${n}pk`, AttributeType: 'S' as const },
            { AttributeName: `${n}sk`, AttributeType: 'N' as const },
          ]),
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: ['gsi1', 'gsi2', 'gsi3', 'gsi4'].map((n) => ({
          IndexName: n,
          KeySchema: [
            { AttributeName: `${n}pk`, KeyType: 'HASH' as const },
            { AttributeName: `${n}sk`, KeyType: 'RANGE' as const },
          ],
          Projection: { ProjectionType: 'ALL' as const },
        })),
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    await raw.send(new CreateTableCommand({ TableName: tables.outbox, AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }], KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }], BillingMode: 'PAY_PER_REQUEST' }));
    return true;
  } catch {
    return false;
  }
})();

const T0 = Date.parse('2026-11-03T12:00:00Z'); // martes 3 nov, 08:00 local
const lunes = (medicoId: string) => ({ medicoId, duracionMin: 30, dias: [{ dia: 1, atiende: true, desde: '08:00', hasta: '10:00', consultorio: 'Cons. 3' }] });

describe.skipIf(!available)('agenda: proyecciones, plantilla, bloqueos y publicacion de horarios (DynamoDB Local)', () => {
  const agenda = new DynamoAgendaRepository(doc, tables.citas, () => T0);
  const citas = new DynamoCitaRepository(doc, tables, () => T0, true); // modo estricto: solo horarios publicados
  const horarios = new HorariosService({ agenda, citas, newId: randomUUID, now: () => T0 });
  const vista = new AgendaService({ agenda, citas });

  afterAll(async () => {
    await raw.send(new DeleteTableCommand({ TableName: tables.citas })).catch(() => undefined);
    await raw.send(new DeleteTableCommand({ TableName: tables.outbox })).catch(() => undefined);
  });

  it('las proyecciones descartan los eventos viejos que llegan tarde', async () => {
    const id = randomUUID();
    await agenda.guardarPerfilPaciente({ pacienteId: id, nombre: 'Nombre nuevo', numeroHistoria: 'HC-000001' }, 2000);
    await agenda.guardarPerfilPaciente({ pacienteId: id, nombre: 'Nombre viejo', numeroHistoria: 'HC-000001' }, 1000);
    expect((await agenda.perfilesPaciente([id, randomUUID()])).get(id)?.nombre).toBe('Nombre nuevo');
    const m = randomUUID();
    await agenda.guardarPerfilMedico({ medicoId: m, nombre: 'Dra. Antelo', especialidad: 'cardiologia', especialidadNombre: 'Cardiologia', activo: true }, 1);
    await agenda.guardarPerfilMedico({ medicoId: m, nombre: 'Dra. Antelo', especialidad: 'cardiologia', especialidadNombre: 'Cardiologia', consultorio: 'Cons. 3', activo: true, usuarioKeycloak: 'medico' }, 2);
    expect((await agenda.perfilMedico(m))?.consultorio).toBe('Cons. 3');
    expect((await agenda.listarMedicos()).map((x) => x.medicoId)).toContain(m);
  });

  it('plantilla: se guarda, se versiona y la vacia es el valor por defecto', async () => {
    const m = randomUUID();
    expect((await horarios.plantilla(m)).dias.every((d) => !d.atiende)).toBe(true);
    const p1 = await horarios.guardarPlantilla(m, 30, lunes(m).dias);
    const p2 = await horarios.guardarPlantilla(m, 30, lunes(m).dias);
    expect([p1.version, p2.version]).toEqual([1, 2]);
    expect((await horarios.plantilla(m)).dias.find((d) => d.dia === 1)).toMatchObject({ atiende: true, desde: '08:00' });
    await expect(horarios.guardarPlantilla(m, 25, [])).rejects.toThrow();
  });

  it('generar publica los horarios, es idempotente y exige una plantilla con dias de atencion', async () => {
    const m = randomUUID();
    await expect(horarios.generar(m, '2026-11-09', '2026-11-15')).rejects.toMatchObject({ code: 'PLANTILLA_VACIA' });
    await horarios.guardarPlantilla(m, 30, lunes(m).dias);
    const r1 = await horarios.generar(m, '2026-11-09', '2026-11-22'); // dos lunes de 4 horarios
    expect(r1).toMatchObject({ creados: 8, existentes: 0, bloqueados: 0, total: 8 });
    const r2 = await horarios.generar(m, '2026-11-09', '2026-11-22');
    expect(r2).toMatchObject({ creados: 0, existentes: 8 });
    const lista = await citas.disponibilidad({ medicoId: m, desde: '2026-11-09T00:00:00Z', hasta: '2026-11-10T00:00:00Z', soloLibres: true }, 50);
    expect(lista.items.map((h) => h.fechaHora)).toEqual(['2026-11-09T12:00:00.000Z', '2026-11-09T12:30:00.000Z', '2026-11-09T13:00:00.000Z', '2026-11-09T13:30:00.000Z']);
  });

  it('en modo estricto solo se reserva lo publicado, y la SAGA sigue funcionando sobre esos horarios', async () => {
    const m = randomUUID();
    await horarios.guardarPlantilla(m, 30, lunes(m).dias);
    await horarios.generar(m, '2026-11-09', '2026-11-09');
    const deps = { now: T0, policy: DEFAULT_POLICY, random: () => 0, newId: randomUUID };
    const publicado = iniciar({ pacienteId: randomUUID(), medicoId: m, especialidad: 'cardiologia', fechaHora: '2026-11-09T12:00:00.000Z' }, deps);
    await citas.aplicar({ aggregate: publicado.aggregate, expectedVersion: null, horarioOps: publicado.horarioOps, messages: [] });
    const fuera = iniciar({ pacienteId: randomUUID(), medicoId: m, especialidad: 'cardiologia', fechaHora: '2026-11-09T18:00:00.000Z' }, deps);
    await expect(citas.aplicar({ aggregate: fuera.aggregate, expectedVersion: null, horarioOps: fuera.horarioOps, messages: [] })).rejects.toThrow(/no esta disponible/);
    // y la cita confirma su horario normalmente
    const conf = aplicar(publicado.aggregate, { type: 'COBRO_REGISTRADO', facturaId: 'f', monto: 1 }, deps)!;
    await citas.aplicar({ aggregate: conf.aggregate, expectedVersion: 0, horarioOps: conf.horarioOps, messages: [] });
  });

  it('bloqueo: bloquea los libres, informa las citas afectadas y al quitarlo libera solo lo que ningun otro bloqueo cubre', async () => {
    const m = randomUUID();
    await horarios.guardarPlantilla(m, 30, lunes(m).dias);
    await horarios.generar(m, '2026-11-09', '2026-11-09');
    // una cita reservada a las 08:30 local (12:30Z) dentro del futuro bloqueo
    const deps = { now: T0, policy: DEFAULT_POLICY, random: () => 0, newId: randomUUID };
    const t = iniciar({ pacienteId: randomUUID(), medicoId: m, especialidad: 'cardiologia', fechaHora: '2026-11-09T12:30:00.000Z' }, deps);
    await citas.aplicar({ aggregate: t.aggregate, expectedVersion: null, horarioOps: t.horarioOps, messages: [] });

    const b = await horarios.crearBloqueo(m, '2026-11-09T04:00:00Z', '2026-11-09T23:59:59Z', 'Congreso de cardiologia', 'administrador');
    expect(b.horariosBloqueados).toBe(3); // los 4 menos el reservado
    expect(b.citasAfectadas).toEqual([expect.objectContaining({ citaId: t.aggregate.citaId, estado: 'RESERVADA' })]);
    const dia = await citas.disponibilidad({ medicoId: m, desde: '2026-11-09T00:00:00Z', hasta: '2026-11-10T00:00:00Z' }, 50);
    expect(dia.items.map((h) => h.estado)).toEqual(['BLOQUEADO', 'RESERVADO', 'BLOQUEADO', 'BLOQUEADO']);

    // un segundo bloqueo solapado: al quitar el primero, el solapado sigue cubriendo
    const b2 = await horarios.crearBloqueo(m, '2026-11-09T13:00:00Z', '2026-11-09T14:00:00Z', 'Reunion', 'administrador');
    expect(b2.horariosBloqueados).toBe(0);
    const r = await horarios.eliminarBloqueo(m, b.bloqueo.id);
    expect(r?.horariosLiberados).toBe(1); // solo 12:00Z; 13:00Z y 13:30Z siguen bloqueados por 'Reunion'
    const despues = await citas.disponibilidad({ medicoId: m, desde: '2026-11-09T00:00:00Z', hasta: '2026-11-10T00:00:00Z' }, 50);
    expect(despues.items.map((h) => h.estado)).toEqual(['LIBRE', 'RESERVADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(await horarios.eliminarBloqueo(m, randomUUID())).toBeNull();
    expect((await horarios.bloqueos(m)).map((x) => x.motivo)).toEqual(['Reunion']);
  });

  it('generar respeta los bloqueos existentes (publica esos horarios ya bloqueados)', async () => {
    const m = randomUUID();
    await horarios.guardarPlantilla(m, 30, lunes(m).dias);
    await horarios.crearBloqueo(m, '2026-11-16T04:00:00Z', '2026-11-16T23:59:59Z', 'Ausencia', 'admin');
    const r = await horarios.generar(m, '2026-11-16', '2026-11-16');
    expect(r).toMatchObject({ creados: 4, bloqueados: 4 });
    expect((await citas.disponibilidad({ medicoId: m, desde: '2026-11-16T00:00:00Z', hasta: '2026-11-17T00:00:00Z', soloLibres: true }, 50)).items).toHaveLength(0);
  });

  it('la agenda del dia muestra horarios libres, bloqueados y citas con el nombre del paciente', async () => {
    const m = randomUUID();
    const p = randomUUID();
    await agenda.guardarPerfilMedico({ medicoId: m, nombre: 'Dr. Prueba', especialidad: 'neumologia', especialidadNombre: 'Neumologia', consultorio: 'Cons. 5', activo: true }, 1);
    await agenda.guardarPerfilPaciente({ pacienteId: p, nombre: 'Pedro Cuellar', numeroHistoria: 'HC-003781' }, 1);
    await horarios.guardarPlantilla(m, 30, lunes(m).dias);
    await horarios.generar(m, '2026-11-23', '2026-11-23');
    const deps = { now: T0, policy: DEFAULT_POLICY, random: () => 0, newId: randomUUID };
    const t = iniciar({ pacienteId: p, medicoId: m, especialidad: 'neumologia', fechaHora: '2026-11-23T12:00:00.000Z' }, deps);
    await citas.aplicar({ aggregate: t.aggregate, expectedVersion: null, horarioOps: t.horarioOps, messages: [] });
    await horarios.crearBloqueo(m, '2026-11-23T13:00:00Z', '2026-11-23T13:30:00Z', 'Reunion clinica', 'admin');

    const r = await vista.agendaDelDia('2026-11-23', { especialidad: 'neumologia' });
    const col = r.medicos.find((x) => x.medicoId === m)!;
    expect(col).toMatchObject({ nombre: 'Dr. Prueba', consultorio: 'Cons. 5' });
    expect(col.celdas.map((c) => [c.hora, c.estado])).toEqual([['08:00', 'RESERVA_TEMPORAL'], ['08:30', 'LIBRE'], ['09:00', 'BLOQUEADO'], ['09:30', 'BLOQUEADO']]);
    expect(col.celdas[0].paciente).toEqual({ id: p, nombre: 'Pedro Cuellar', numeroHistoria: 'HC-003781' });
    expect(col.celdas[2].motivo).toBe('Reunion clinica');
    expect(col.resumen).toMatchObject({ libres: 1, reservasTemporales: 1 });
  });
});
