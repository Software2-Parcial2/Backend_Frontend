import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AgendaRepository, HorarioPublicado, PerfilMedico, PerfilPaciente } from '../../application/horarios/agenda-repository.js';
import type { Bloqueo, Plantilla } from '../../application/horarios/horarios.js';

/**
 * Agenda en DynamoDB (misma tabla `citas`, pk/sk):
 *   PACIENTE#<id>/PERFIL   proyeccion del paciente
 *   MEDICO#<id>/PERFIL     proyeccion del medico (gsi4pk = 'MEDICO' lista a todos sin Scan)
 *   MEDICO#<id>/PLANTILLA  horario semanal
 *   MEDICO#<id>/BLOQUEO#<desde ISO>#<id>
 *   HORARIO#<medico>/<ISO>  los horarios que reserva la SAGA (ver DynamoCitaRepository)
 */
export class DynamoAgendaRepository implements AgendaRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly table = 'citas',
    private readonly now: () => number = Date.now,
  ) {}

  // --- proyecciones -------------------------------------------------------------------------

  async guardarPerfilPaciente(p: PerfilPaciente, ocurridoEn: number): Promise<void> {
    await this.putSiMasNuevo({ pk: `PACIENTE#${p.pacienteId}`, sk: 'PERFIL', ...p, ocurridoEn }, ocurridoEn);
  }

  async guardarPerfilMedico(m: PerfilMedico, ocurridoEn: number): Promise<void> {
    await this.putSiMasNuevo({ pk: `MEDICO#${m.medicoId}`, sk: 'PERFIL', ...m, ocurridoEn, gsi4pk: 'MEDICO', gsi4sk: 0 }, ocurridoEn);
  }

  private async putSiMasNuevo(item: Record<string, unknown>, ocurridoEn: number) {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.table,
          Item: item,
          ConditionExpression: 'attribute_not_exists(pk) OR attribute_not_exists(ocurridoEn) OR ocurridoEn <= :t',
          ExpressionAttributeValues: { ':t': ocurridoEn },
        }),
      );
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e; // llego un evento mas viejo que el guardado: se descarta
    }
  }

  async perfilesPaciente(ids: string[]): Promise<Map<string, PerfilPaciente>> {
    const unicos = [...new Set(ids)];
    const res = new Map<string, PerfilPaciente>();
    for (let i = 0; i < unicos.length; i += 100) {
      const lote = unicos.slice(i, i + 100);
      const r = await this.doc.send(new BatchGetCommand({ RequestItems: { [this.table]: { Keys: lote.map((id) => ({ pk: `PACIENTE#${id}`, sk: 'PERFIL' })) } } }));
      for (const it of r.Responses?.[this.table] ?? []) res.set(String(it.pacienteId), { pacienteId: String(it.pacienteId), nombre: String(it.nombre), numeroHistoria: String(it.numeroHistoria) });
    }
    return res;
  }

  async perfilMedico(medicoId: string): Promise<PerfilMedico | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: `MEDICO#${medicoId}`, sk: 'PERFIL' } }));
    return r.Item ? aPerfilMedico(r.Item) : null;
  }

  async listarMedicos(): Promise<PerfilMedico[]> {
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({ TableName: this.table, IndexName: 'gsi4', KeyConditionExpression: 'gsi4pk = :p', ExpressionAttributeValues: { ':p': 'MEDICO' }, ExclusiveStartKey: start }),
      );
      items.push(...(r.Items ?? []));
      start = r.LastEvaluatedKey;
    } while (start);
    return items.map(aPerfilMedico).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  // --- plantilla y bloqueos -----------------------------------------------------------------

  async plantilla(medicoId: string): Promise<Plantilla | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk: `MEDICO#${medicoId}`, sk: 'PLANTILLA' }, ConsistentRead: true }));
    if (!r.Item) return null;
    const { pk: _pk, sk: _sk, ...p } = r.Item;
    return p as unknown as Plantilla;
  }

  async guardarPlantilla(p: Plantilla): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: `MEDICO#${p.medicoId}`, sk: 'PLANTILLA', ...p } }));
  }

  async bloqueos(medicoId: string): Promise<Bloqueo[]> {
    const r = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :p AND begins_with(sk, :b)',
        ExpressionAttributeValues: { ':p': `MEDICO#${medicoId}`, ':b': 'BLOQUEO#' },
        ConsistentRead: true,
      }),
    );
    return (r.Items ?? []).map((i) => ({ id: String(i.id), medicoId: String(i.medicoId), desde: String(i.desde), hasta: String(i.hasta), motivo: String(i.motivo), creadoPor: String(i.creadoPor), creadoEn: Number(i.creadoEn) }));
  }

  async guardarBloqueo(b: Bloqueo): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: { pk: `MEDICO#${b.medicoId}`, sk: `BLOQUEO#${b.desde}#${b.id}`, ...b } }));
  }

  async eliminarBloqueo(medicoId: string, id: string): Promise<Bloqueo | null> {
    const existente = (await this.bloqueos(medicoId)).find((b) => b.id === id);
    if (!existente) return null;
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk: `MEDICO#${medicoId}`, sk: `BLOQUEO#${existente.desde}#${id}` } }));
    return existente;
  }

  // --- horarios -----------------------------------------------------------------------------

  async publicarHorarios(medicoId: string, horarios: HorarioPublicado[], ttlSegundos: number): Promise<{ creados: number; existentes: number }> {
    let creados = 0;
    let existentes = 0;
    await enLotes(horarios, 20, async (h) => {
      try {
        await this.doc.send(
          new PutCommand({
            TableName: this.table,
            Item: {
              pk: `HORARIO#${medicoId}`,
              sk: h.fechaHora,
              medicoId,
              fechaHora: h.fechaHora,
              estado: h.estado,
              ...(h.motivo ? { motivo: h.motivo } : {}),
              expiresAt: Math.floor(Date.parse(h.fechaHora) / 1000) + ttlSegundos,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
        creados++;
      } catch (e) {
        if (!(e instanceof ConditionalCheckFailedException)) throw e;
        existentes++;
      }
    });
    return { creados, existentes };
  }

  async bloquearHorarios(medicoId: string, desde: string, hasta: string, motivo: string): Promise<number> {
    let n = 0;
    for (const h of await this.horariosEn(medicoId, desde, hasta)) {
      // una reserva vencida cuenta como libre (la expiracion se comprueba al escribir, como en la SAGA)
      if (h.estado !== 'LIBRE' && !(h.estado === 'RESERVADO' && Number(h.reservaExpiraEn ?? 0) < this.now())) continue;
      try {
        await this.doc.send(
          new UpdateCommand({
            TableName: this.table,
            Key: { pk: `HORARIO#${medicoId}`, sk: h.sk },
            UpdateExpression: 'SET estado = :b, motivo = :m REMOVE citaId, reservaExpiraEn',
            ConditionExpression: 'estado = :libre OR (estado = :reservado AND reservaExpiraEn < :now)',
            ExpressionAttributeValues: { ':b': 'BLOQUEADO', ':m': motivo, ':libre': 'LIBRE', ':reservado': 'RESERVADO', ':now': this.now() },
          }),
        );
        n++;
      } catch (e) {
        if (!(e instanceof ConditionalCheckFailedException)) throw e; // alguien lo reservo mientras tanto: no se bloquea
      }
    }
    return n;
  }

  async desbloquearHorarios(medicoId: string, desde: string, hasta: string, siguenBloqueados: (fechaHora: string) => boolean): Promise<number> {
    let n = 0;
    for (const h of await this.horariosEn(medicoId, desde, hasta)) {
      if (h.estado !== 'BLOQUEADO' || siguenBloqueados(String(h.sk))) continue;
      try {
        await this.doc.send(
          new UpdateCommand({
            TableName: this.table,
            Key: { pk: `HORARIO#${medicoId}`, sk: h.sk },
            UpdateExpression: 'SET estado = :libre REMOVE motivo',
            ConditionExpression: 'estado = :b',
            ExpressionAttributeValues: { ':libre': 'LIBRE', ':b': 'BLOQUEADO' },
          }),
        );
        n++;
      } catch (e) {
        if (!(e instanceof ConditionalCheckFailedException)) throw e;
      }
    }
    return n;
  }

  private async horariosEn(medicoId: string, desde: string, hasta: string) {
    const items: Record<string, unknown>[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'pk = :p AND sk BETWEEN :a AND :b',
          ExpressionAttributeValues: { ':p': `HORARIO#${medicoId}`, ':a': desde, ':b': hasta },
          ConsistentRead: true,
          ExclusiveStartKey: start,
        }),
      );
      items.push(...(r.Items ?? []));
      start = r.LastEvaluatedKey;
    } while (start);
    return items as Array<{ sk: string; estado: string; reservaExpiraEn?: number }>;
  }
}

function aPerfilMedico(i: Record<string, unknown>): PerfilMedico {
  return {
    medicoId: String(i.medicoId),
    nombre: String(i.nombre),
    especialidad: String(i.especialidad),
    especialidadNombre: String(i.especialidadNombre),
    ...(i.consultorio ? { consultorio: String(i.consultorio) } : {}),
    activo: i.activo !== false,
    ...(i.usuarioKeycloak ? { usuarioKeycloak: String(i.usuarioKeycloak) } : {}),
  };
}

/** Ejecuta `f` sobre cada elemento con a lo sumo `n` en paralelo. */
async function enLotes<T>(items: T[], n: number, f: (t: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(f));
}
