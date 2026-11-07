// Datos semilla de SIGEC: FICTICIOS, deterministas y coherentes entre servicios (mismos ids en MS2, MS3, MS4, MS5, MS6 y MS8).
// Los ids tienen la forma <prefijo>000000-0000-4000-8000-<n en hexadecimal> para reconocerlos y limpiarlos con `make seed-reset`.
// Ninguno es un dato real de personas; los correos usan el dominio reservado example.test.

export const uid = (prefijo, n) => `${prefijo}000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const PAC = (n) => uid('a0', n); // a0000000-...-000000000001 = paciente del usuario `paciente` de Keycloak (claim paciente_id)
const ESP = (n) => uid('e0', n);
const MED = (n) => uid('d0', n);
const CITA = (n) => uid('c0', n);
const FAC = (n) => uid('f0', n);
const TAR = (n) => uid('f1', n);
const HIST = (n) => uid('b0', n);
const CONS = (n) => uid('90', n);
const ANT = (n) => uid('91', n);
const CONSENT = (n) => uid('92', n);
const IMG = (n) => uid('51', n);

export const ESPECIALIDADES = [
  { id: ESP(1), codigo: 'general', nombre: 'Medicina general', tarifa: 100 },
  { id: ESP(2), codigo: 'pediatria', nombre: 'Pediatria', tarifa: 150 },
  { id: ESP(3), codigo: 'odontologia', nombre: 'Odontologia', tarifa: 120 },
  { id: ESP(4), codigo: 'cardiologia', nombre: 'Cardiologia', tarifa: 250 },
];

export const MEDICOS = [
  { id: MED(1), nombre: 'Dr. Andres Soliz Peña', documento: 'SEED-M001', matricula: 'MAT-SEED-001', esp: 'general', usuario: 'medico', email: 'andres.soliz@example.test', telefono: '+59170010001' },
  { id: MED(2), nombre: 'Dra. Patricia Egüez Roca', documento: 'SEED-M002', matricula: 'MAT-SEED-002', esp: 'pediatria', usuario: null, email: 'patricia.eguez@example.test', telefono: '+59170010002' },
  { id: MED(3), nombre: 'Dr. Marcelo Antelo Vaca', documento: 'SEED-M003', matricula: 'MAT-SEED-003', esp: 'odontologia', usuario: null, email: 'marcelo.antelo@example.test', telefono: '+59170010003' },
  { id: MED(4), nombre: 'Dra. Lucia Barrientos Paz', documento: 'SEED-M004', matricula: 'MAT-SEED-004', esp: 'cardiologia', usuario: null, email: 'lucia.barrientos@example.test', telefono: '+59170010004' },
];

// pNoShow: probabilidad usada SOLO para generar el historial de asistencia sintetico.
export const PACIENTES = [
  { id: PAC(1), nombre: 'Carla Mendoza Rojas', documento: 'SEED-P001', nacimiento: '1990-03-14', telefono: '+59171000001', email: 'carla.mendoza@example.test', beca: false, seguro: 'PRIVADO', pNoShow: 0.05 },
  { id: PAC(2), nombre: 'Luis Fernando Quispe Mamani', documento: 'SEED-P002', nacimiento: '2001-07-22', telefono: '+59171000002', email: 'luis.quispe@example.test', beca: true, seguro: 'PUBLICO', pNoShow: 0.35 },
  { id: PAC(3), nombre: 'Maria Elena Vargas Suarez', documento: 'SEED-P003', nacimiento: '1975-11-02', telefono: '+59171000003', email: 'maria.vargas@example.test', beca: false, seguro: 'NINGUNO', pNoShow: 0.15 },
  { id: PAC(4), nombre: 'Diego Salvatierra Lijeron', documento: 'SEED-P004', nacimiento: '1988-05-30', telefono: '+59171000004', email: 'diego.salvatierra@example.test', beca: false, seguro: 'PUBLICO', pNoShow: 0.25 },
  { id: PAC(5), nombre: 'Valeria Rocha Pinto', documento: 'SEED-P005', nacimiento: '2005-01-19', telefono: '+59171000005', email: 'valeria.rocha@example.test', beca: true, seguro: 'NINGUNO', pNoShow: 0.45 },
  { id: PAC(6), nombre: 'Ramiro Choque Alanes', documento: 'SEED-P006', nacimiento: '1962-09-08', telefono: '+59171000006', email: 'ramiro.choque@example.test', beca: false, seguro: 'PRIVADO', pNoShow: 0.1 },
];

/** PRNG determinista (mulberry32) para que dos ejecuciones generen exactamente lo mismo. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HORAS_UTC = [12, 13, 14, 15]; // 08:00-12:00 hora de Bolivia (UTC-4)
const diaHabil = (d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
const iso = (d) => d.toISOString();

const MOTIVOS = ['Control de rutina', 'Dolor de cabeza persistente', 'Revision anual', 'Control de presion arterial', 'Dolor dental', 'Control de crecimiento', 'Seguimiento de tratamiento', 'Malestar general'];
const DIAGNOSTICOS = ['Cefalea tensional (dato ficticio)', 'Sin hallazgos relevantes (dato ficticio)', 'Hipertension arterial leve (dato ficticio)', 'Caries simple (dato ficticio)', 'Faringitis aguda (dato ficticio)'];

/**
 * Genera todo el conjunto. `hoy` (Date) solo desplaza los horarios futuros; el historial pasado usa fechas fijas
 * (2026-07-06 a 2026-10-30) para que dos ejecuciones produzcan los mismos ids y fechas.
 */
export function generar(hoy = new Date()) {
  const rnd = prng(20261106);
  const inicioHoy = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());

  // --- Historial pasado: citas con asistencia / inasistencia (alimenta el modelo de inasistencia de MS7) ---
  const citas = [];
  const usados = new Set();
  let n = 1;
  const fin = Date.UTC(2026, 9, 30);
  for (let dia = Date.UTC(2026, 6, 6); dia <= fin && citas.length < 72; dia += 86_400_000) {
    const d = new Date(dia);
    if (!diaHabil(d)) continue;
    for (const hora of HORAS_UTC) {
      if (citas.length >= 72 || rnd() > 0.5) continue;
      const medico = MEDICOS[Math.floor(rnd() * MEDICOS.length)];
      const paciente = PACIENTES[Math.floor(rnd() * PACIENTES.length)];
      const fecha = new Date(dia + hora * 3_600_000);
      const clave = `${medico.id}|${iso(fecha)}`;
      if (usados.has(clave)) continue;
      usados.add(clave);
      const r = rnd();
      const estado = r < 0.04 ? 'CANCELADA' : r < 0.06 ? 'ANULADA' : 'CONFIRMADA';
      const asistencia = estado === 'CONFIRMADA' ? (rnd() < paciente.pNoShow ? 'NO_ASISTIO' : 'ASISTIO') : undefined;
      const esp = ESPECIALIDADES.find((e) => e.codigo === medico.esp);
      citas.push({
        id: CITA(n++), pacienteId: paciente.id, medicoId: medico.id, especialidad: esp.codigo, fechaHora: iso(fecha), estado, asistencia, monto: esp.tarifa,
        motivo: MOTIVOS[Math.floor(rnd() * MOTIVOS.length)], futura: false,
      });
    }
  }

  // --- Una cita futura confirmada para el paciente de Keycloak (demo: recordatorio pendiente, horario ocupado) ---
  const manana2 = new Date(inicioHoy + 2 * 86_400_000);
  const dFut = diaHabil(manana2) ? manana2 : new Date(inicioHoy + 4 * 86_400_000);
  const medicoFut = MEDICOS[0];
  const futura = {
    id: CITA(900), pacienteId: PACIENTES[0].id, medicoId: medicoFut.id, especialidad: 'general', fechaHora: iso(new Date(dFut.getTime() + 13 * 3_600_000)),
    estado: 'CONFIRMADA', asistencia: undefined, monto: 100, motivo: 'Control de rutina', futura: true,
  };
  citas.push(futura);

  // --- Horarios libres: proximos 14 dias habiles-calendario, 4 por medico y dia (TTL: slot + 7 dias) ---
  const horarios = [];
  for (const m of MEDICOS) {
    for (let i = 1; i <= 14; i++) {
      const d = new Date(inicioHoy + i * 86_400_000);
      if (!diaHabil(d)) continue;
      for (const hora of HORAS_UTC) {
        const fecha = new Date(d.getTime() + hora * 3_600_000);
        if (m.id === futura.medicoId && iso(fecha) === futura.fechaHora) continue; // ocupado por la cita futura
        horarios.push({ medicoId: m.id, fechaHora: iso(fecha), expiresAt: Math.floor(fecha.getTime() / 1000) + 7 * 86_400 });
      }
    }
  }

  // --- MS6: facturas de las citas cobradas ---
  const facturas = citas
    .filter((c) => c.estado !== 'CANCELADA')
    .map((c, i) => ({ id: FAC(i + 1), citaId: c.id, pacienteId: c.pacienteId, monto: c.estado === 'ANULADA' ? 0 : c.monto, estado: c.estado === 'ANULADA' ? 'ANULADA' : 'CONFIRMADA', creada: new Date(Date.parse(c.fechaHora) - 3 * 86_400_000) }));
  // La cita futura solo tiene cobro PROVISIONAL (como en la SAGA, antes de asistir).
  const fFut = facturas.find((f) => f.citaId === futura.id);
  fFut.estado = 'PROVISIONAL';
  const facturaDe = new Map(facturas.map((f) => [f.citaId, f.id]));
  for (const c of citas) c.facturaId = facturaDe.get(c.id);

  const tarifas = ESPECIALIDADES.map((e, i) => ({ id: TAR(i + 1), especialidad: e.codigo, monto: e.tarifa, desde: '2026-01-01' }));

  // --- MS4: historias, consultas (de las citas a las que asistieron), antecedentes y consentimientos ---
  const historias = PACIENTES.map((p, i) => ({ id: HIST(i + 1), pacienteId: p.id, numero: `HC-${String(i + 1).padStart(6, '0')}`, nombre: p.nombre }));
  const historiaDe = new Map(historias.map((h) => [h.pacienteId, h.id]));
  let nc = 1;
  const consultas = citas
    .filter((c) => c.asistencia === 'ASISTIO')
    .slice(0, 30)
    .map((c) => ({
      id: CONS(nc++), historiaId: historiaDe.get(c.pacienteId), medicoId: c.medicoId, citaId: c.id, fecha: c.fechaHora, motivo: c.motivo,
      diagnostico: DIAGNOSTICOS[nc % DIAGNOSTICOS.length], tratamiento: 'Indicaciones generales y control (dato ficticio)',
      firmada: nc - 1 <= 24, // las 6 ultimas quedan en BORRADOR para probar la edicion
    }));
  const antecedentes = [
    { id: ANT(1), historiaId: HIST(1), tipo: 'ALERGIA', descripcion: 'Alergia a la penicilina (dato ficticio)' },
    { id: ANT(2), historiaId: HIST(2), tipo: 'PERSONAL', descripcion: 'Asma infantil controlada (dato ficticio)' },
    { id: ANT(3), historiaId: HIST(3), tipo: 'FAMILIAR', descripcion: 'Diabetes tipo 2 en madre (dato ficticio)' },
    { id: ANT(4), historiaId: HIST(6), tipo: 'MEDICACION', descripcion: 'Losartan 50 mg diarios (dato ficticio)' },
    { id: ANT(5), historiaId: HIST(6), tipo: 'QUIRURGICO', descripcion: 'Apendicectomia en 1998 (dato ficticio)' },
  ];
  const consentimientos = [
    ...PACIENTES.map((p, i) => ({ id: CONSENT(i + 1), pacienteId: p.id, tipo: 'TRATAMIENTO_DATOS', version: 'v1' })),
    { id: CONSENT(10), pacienteId: PAC(1), tipo: 'IMAGENES_IA', version: 'v1' },
    { id: CONSENT(11), pacienteId: PAC(3), tipo: 'IMAGENES_IA', version: 'v1' },
  ];

  // --- MS8: contactos, notificaciones enviadas de las ultimas citas y el recordatorio de la cita futura ---
  const contactos = PACIENTES.map((p) => ({ pacienteId: p.id, nombre: p.nombre, email: p.email, canales: ['EMAIL'] }));
  const notificaciones = citas
    .filter((c) => c.estado === 'CONFIRMADA' && !c.futura)
    .slice(-12)
    .map((c) => ({ citaId: c.id, pacienteId: c.pacienteId, fechaHora: c.fechaHora, motivo: c.motivo, enviada: new Date(Date.parse(c.fechaHora) - 3 * 86_400_000).toISOString() }));

  // --- MS5: metadatos de imagenes de ejemplo (sin objeto en S3: objectKey apunta a un objeto inexistente) ---
  const imagenes = [1, 3, 6].map((p, i) => ({
    id: IMG(i + 1), pacienteId: PAC(p), creadaEn: Date.UTC(2026, 9, 10 + i, 14, 0, 0),
    hash: Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join(''),
    probabilidad: [0.12, 0.81, 0.34][i], clase: [0.12, 0.81, 0.34][i] >= 0.5 ? 'NEUMONIA' : 'NORMAL',
  }));

  return { citas, futura, horarios, facturas, tarifas, historias, consultas, antecedentes, consentimientos, contactos, notificaciones, imagenes };
}
