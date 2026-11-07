import { randomUUID } from 'node:crypto';
import type { Canal, CitaRecordable, Contacto, Notificacion, Plantilla, PreferenciasPersonal, RespuestaSaga } from '../domain/notificacion.js';
import { claveDe, PreferenciasInvalidasError, ReglaNotificacionError, VinculoInvalidoError } from '../domain/notificacion.js';
import { NotificacionesService } from './notificaciones.service.js';
import type { ContactoRepository, NotificacionRepository, NotificationSender, RecordatorioRepository } from './ports.js';

class Repos {
  notifs = new Map<string, Notificacion>();
  respuestas: RespuestaSaga[] = [];
  contactos = new Map<string, Contacto>();
  vinculos = new Map<string, { pacienteId: string; expiraEn: number; usado: boolean }>();
  citas = new Map<string, CitaRecordable & { marcado: boolean }>();
  private k = (c: string, t: string) => `${c}|${t}`;
  async obtener(a: string, b?: string): Promise<never> {
    return (b ? this.notifs.get(this.k(a, b)) ?? null : null) as never;
  }
  async guardar(n: Notificacion | Contacto, r?: RespuestaSaga | null): Promise<void> {
    if ('tipo' in n) {
      this.notifs.set(this.k(n.citaId, claveDe(n.tipo, n.fechaHora)), structuredClone(n));
      if (r) this.respuestas.push(r);
    } else this.contactos.set(n.pacienteId, structuredClone(n));
  }
  async vencidas(now: number) {
    return [...this.notifs.values()].filter((n) => n.estado === 'PENDIENTE' && (n.proximoIntento ?? Infinity) <= now).map((n) => ({ citaId: n.citaId, tipo: claveDe(n.tipo, n.fechaHora) }));
  }
  async porCita(c: string) {
    return [...this.notifs.values()].filter((n) => n.citaId === c);
  }
  async crearVinculo(codigo: string, pacienteId: string, expiraEn: number) {
    this.vinculos.set(codigo, { pacienteId, expiraEn, usado: false });
  }
  async consumirVinculo(codigo: string, now: number) {
    const v = this.vinculos.get(codigo);
    if (!v || v.usado || v.expiraEn < now) return null;
    v.usado = true;
    return v.pacienteId;
  }
  async registrar(c: CitaRecordable) {
    this.citas.set(c.citaId, { ...c, marcado: false });
  }
  async pendientes(desde: number, hasta: number) {
    return [...this.citas.values()].filter((c) => !c.marcado && Date.parse(c.fechaHora) >= desde && Date.parse(c.fechaHora) <= hasta);
  }
  async marcar(c: string) {
    this.citas.get(c)!.marcado = true;
  }
  async cancelar(c: string) {
    if (this.citas.has(c)) this.citas.get(c)!.marcado = true;
  }
  async reprogramar(c: CitaRecordable) {
    this.citas.set(c.citaId, { ...c, marcado: false });
  }
  plantillas = new Map<string, Plantilla>();
  personal = new Map<string, PreferenciasPersonal>();
}
// El mismo objeto implementa varios puertos con `obtener` distinto: se separan en fachadas.
function setup(opts: { fallos?: Record<string, number>; requiereDestinatario?: boolean } = {}) {
  const repos = new Repos();
  const todas = () => [...repos.notifs.values()];
  const notificaciones: NotificacionRepository = {
    obtener: (c, t) => repos.obtener(c, t) as never,
    guardar: (n, r) => repos.guardar(n, r),
    vencidas: (n) => repos.vencidas(n),
    porCita: (c) => repos.porCita(c),
    obtenerPorId: async (id) => todas().find((n) => n.id === id) ?? null,
    historial: async (f, limite) => ({ items: todas().filter((n) => n.pacienteId === f.pacienteId && (!f.estado || n.estado === f.estado) && (!f.tipo || n.tipo === f.tipo)).slice(0, limite), siguiente: null }),
    entreFechas: async (d, h) => todas().filter((n) => Date.parse(n.creadaEn) >= d && Date.parse(n.creadaEn) < h),
    marcarLeida: async (id, ahora, pac) => {
      const n = todas().find((x) => x.id === id);
      if (!n || (pac && n.pacienteId !== pac)) return null;
      n.leida = true;
      n.leidaEn = ahora;
      return n;
    },
  };
  const contactos: ContactoRepository = {
    obtener: async (p) => repos.contactos.get(p) ?? null,
    guardar: (c) => repos.guardar(c),
    desvincularTelegram: async (p) => void delete repos.contactos.get(p)!.telegramChatId,
    crearVinculo: (a, b, c) => repos.crearVinculo(a, b, c),
    consumirVinculo: (a, b) => repos.consumirVinculo(a, b),
  };
  const recordatorios: RecordatorioRepository = {
    registrar: (c) => repos.registrar(c),
    pendientes: (d, h) => repos.pendientes(d, h),
    obtener: async (c) => repos.citas.get(c) ?? null,
    marcar: (c) => repos.marcar(c),
    cancelar: (c) => repos.cancelar(c),
    reprogramar: (c) => repos.reprogramar(c),
  };
  const enviados: { canal: Canal; destinatario: string; asunto: string; texto: string }[] = [];
  const fallos = { ...(opts.fallos ?? {}) } as Record<string, number>;
  const sender: NotificationSender = {
    requiereDestinatario: opts.requiereDestinatario ?? true,
    enviar: async ({ canal, destinatario, mensaje }) => {
      if ((fallos[canal] ?? 0) > 0) {
        fallos[canal]--;
        throw new Error(`${canal} caido`);
      }
      enviados.push({ canal, destinatario, asunto: mensaje.asunto, texto: mensaje.texto });
    },
  };
  const alertas: string[] = [];
  let now = Date.UTC(2026, 11, 1, 12, 0, 0);
  const service = new NotificacionesService({
    sender,
    alertas: { alertar: async (t) => void alertas.push(t) },
    notificaciones,
    contactos,
    recordatorios,
    plantillas: {
      vigente: async (t, c) => repos.plantillas.get(`${t}|${c}`) ?? null,
      guardar: async (p) => void repos.plantillas.set(`${p.tipo}|${p.canal}`, p),
    },
    personal: { obtener: async (u) => repos.personal.get(u) ?? null, guardar: async (p) => void repos.personal.set(p.usuarioId, p) },
    newId: randomUUID,
    now: () => now,
    config: { maxIntentos: 3, backoffBaseMs: 1000 },
  });
  return { service, repos, enviados, alertas, avanzar: (ms: number) => (now += ms), ahora: () => now };
}

const PAC = randomUUID();
const cmd = (over = {}) => ({ mensajeId: randomUUID(), correlationId: randomUUID(), citaId: randomUUID(), pacienteId: PAC, tipo: 'CITA_CONFIRMADA' as const, fechaHora: '2026-12-02T14:30:00.000Z', ...over });

describe('NotificacionesService', () => {
  it('entrega por email, queda ENVIADA y responde ...enviada con el correlationId de la SAGA', async () => {
    const t = setup();
    await t.service.registrarContacto({ pacienteId: PAC, nombre: 'Ana', email: 'ana@x.com' });
    const c = cmd();
    const n = await t.service.recibirComando(c);
    expect(n.estado).toBe('ENVIADA');
    expect(t.enviados).toHaveLength(1);
    expect(t.enviados[0]).toMatchObject({ canal: 'EMAIL', destinatario: 'ana@x.com', asunto: 'Tu cita esta confirmada' });
    expect(t.enviados[0].texto).toContain('Hola Ana');
    expect(t.repos.respuestas[0]).toMatchObject({ type: 'notificaciones.cita-confirmada.enviada', correlationId: c.correlationId, causationId: c.mensajeId });
  });

  it('un fallo NO rompe la SAGA: queda PENDIENTE con backoff, sin responder todavia', async () => {
    const t = setup({ fallos: { EMAIL: 1 } });
    await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
    const n = await t.service.recibirComando(cmd());
    expect(n).toMatchObject({ estado: 'PENDIENTE', intentos: 1, ultimoError: 'EMAIL: EMAIL caido' });
    expect(n.proximoIntento).toBe(t.ahora() + 1000);
    expect(t.repos.respuestas).toHaveLength(0);

    t.avanzar(999);
    expect(await t.service.reintentarPendientes()).toBe(0); // aun no vence
    t.avanzar(1);
    expect(await t.service.reintentarPendientes()).toBe(1);
    const fin = (await t.service.porCita(n.citaId))[0];
    expect(fin.estado).toBe('ENVIADA');
    expect(t.repos.respuestas.map((r) => r.type)).toEqual(['notificaciones.cita-confirmada.enviada']);
  });

  it('el backoff es exponencial y tras maxIntentos pasa a FALLIDA, responde ...fallida y alerta', async () => {
    const t = setup({ fallos: { EMAIL: 99 } });
    await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
    const n1 = await t.service.recibirComando(cmd());
    expect(n1.proximoIntento).toBe(t.ahora() + 1000); // intento 1
    t.avanzar(1000);
    await t.service.reintentarPendientes();
    const n2 = (await t.service.porCita(n1.citaId))[0];
    expect([n2.intentos, n2.proximoIntento]).toEqual([2, t.ahora() + 2000]); // 1000 * 2^1
    t.avanzar(2000);
    await t.service.reintentarPendientes();
    const n3 = (await t.service.porCita(n1.citaId))[0];
    expect(n3).toMatchObject({ estado: 'FALLIDA', intentos: 3 });
    expect(t.repos.respuestas.map((r) => r.type)).toEqual(['notificaciones.cita-confirmada.fallida']);
    expect(t.repos.respuestas[0].payload.motivo).toContain('EMAIL caido');
    expect(t.alertas).toHaveLength(1);
    expect(t.alertas[0]).toContain('FALLIDA');
  });

  it('con varios canales un reintento solo repite el que fallo', async () => {
    const t = setup({ fallos: { TELEGRAM: 1 } });
    await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
    await t.service.guardarPreferencias(PAC, ['EMAIL', 'TELEGRAM']);
    const { codigo } = await t.service.generarCodigoVinculo(PAC, 'ABCD1234');
    await t.service.vincularTelegram(codigo, '555');
    const n = await t.service.recibirComando(cmd());
    expect(n.estado).toBe('PENDIENTE');
    expect(n.canalesEnviados).toEqual(['EMAIL']);
    t.avanzar(1000);
    await t.service.reintentarPendientes();
    expect(t.enviados.map((e) => e.canal)).toEqual(['EMAIL', 'TELEGRAM']); // el email NO se reenvio
    expect((await t.service.porCita(n.citaId))[0].estado).toBe('ENVIADA');
  });

  it('sin canal de contacto es un fallo reintentable y termina FALLIDA', async () => {
    const t = setup();
    const n = await t.service.recibirComando(cmd({ pacienteId: randomUUID() }));
    expect(n.estado).toBe('PENDIENTE');
    expect(n.ultimoError).toMatch(/sin canal de contacto/);
  });

  it('el adaptador simulado no necesita destinatario', async () => {
    const t = setup({ requiereDestinatario: false });
    const n = await t.service.recibirComando(cmd({ pacienteId: randomUUID() }));
    expect(n.estado).toBe('ENVIADA');
    expect(t.enviados[0].destinatario).toBe('simulado');
  });

  it('un comando repetido es idempotente: no reenvia y repite la respuesta final', async () => {
    const t = setup();
    await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
    const c = cmd();
    await t.service.recibirComando(c);
    await t.service.recibirComando({ ...c, mensajeId: randomUUID() }); // reintento de MS3 con otro id
    expect(t.enviados).toHaveLength(1);
    expect(t.repos.respuestas).toHaveLength(2); // la segunda repite ...enviada
  });

  it('la cancelacion avisa al paciente, no responde a la SAGA y dispara una alerta interna', async () => {
    const t = setup();
    await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
    const n = await t.service.recibirComando(cmd({ tipo: 'CITA_CANCELADA', motivo: 'cobro rechazado: paciente bloqueado' }));
    expect(n.estado).toBe('ENVIADA');
    expect(t.repos.respuestas).toHaveLength(0);
    expect(t.alertas[0]).toContain('SAGA compensada');
    expect(t.enviados[0].texto).not.toContain('bloqueado'); // el motivo interno no llega al paciente
  });

  it('las plantillas no incluyen datos clinicos y Telegram es aun mas corto', async () => {
    const t = setup();
    await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
    await t.service.guardarPreferencias(PAC, ['EMAIL', 'TELEGRAM']);
    await t.service.generarCodigoVinculo(PAC, 'ZZZZ0000');
    await t.service.vincularTelegram('ZZZZ0000', '77');
    await t.service.recibirComando(cmd());
    const email = t.enviados.find((e) => e.canal === 'EMAIL')!;
    const tg = t.enviados.find((e) => e.canal === 'TELEGRAM')!;
    expect(tg.texto.length).toBeLessThan(email.texto.length);
    for (const e of [email, tg]) expect(e.texto).not.toMatch(/especialidad|medico|diagn/i);
    expect(email.texto).toContain('2 de diciembre'); // fecha en espanol
    expect(email.texto).toContain('10:30'); // 14:30Z = 10:30 en La Paz
  });

  describe('Telegram y preferencias', () => {
    it('el codigo es de un solo uso y expira a los 10 minutos', async () => {
      const t = setup();
      const { expiraEn } = await t.service.generarCodigoVinculo(PAC, 'CODIGO01');
      expect(Date.parse(expiraEn) - t.ahora()).toBe(10 * 60_000);
      await expect(t.service.vincularTelegram('codigo01', '123')).resolves.toEqual({ pacienteId: PAC }); // insensible a mayusculas
      await expect(t.service.vincularTelegram('CODIGO01', '999')).rejects.toBeInstanceOf(VinculoInvalidoError); // ya usado
      await t.service.generarCodigoVinculo(PAC, 'CODIGO02');
      t.avanzar(10 * 60_000 + 1);
      await expect(t.service.vincularTelegram('CODIGO02', '123')).rejects.toBeInstanceOf(VinculoInvalidoError); // expirado
      await expect(t.service.vincularTelegram('NOEXISTE', '123')).rejects.toBeInstanceOf(VinculoInvalidoError);
    });

    it('vincular asocia el chat, agrega TELEGRAM a las preferencias y conserva el email', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, nombre: 'Ana', email: 'ana@x.com' });
      await t.service.generarCodigoVinculo(PAC, 'CODIGO03');
      await t.service.vincularTelegram('CODIGO03', '4242');
      expect(await t.service.obtenerPreferencias(PAC)).toMatchObject({ telegramChatId: '4242', canales: ['EMAIL', 'TELEGRAM'], email: 'ana@x.com' });
    });

    it('valida las preferencias', async () => {
      const t = setup();
      await expect(t.service.guardarPreferencias(PAC, [])).rejects.toBeInstanceOf(PreferenciasInvalidasError);
      await expect(t.service.guardarPreferencias(PAC, ['SMS'])).rejects.toBeInstanceOf(PreferenciasInvalidasError);
      await expect(t.service.guardarPreferencias(PAC, ['EMAIL', 'SMS'])).rejects.toBeInstanceOf(PreferenciasInvalidasError);
      expect((await t.service.guardarPreferencias(PAC, ['TELEGRAM', 'EMAIL', 'EMAIL'])).canales).toEqual(['TELEGRAM', 'EMAIL']);
    });

    it('registrarContacto no pisa las preferencias ni el chat ya vinculado', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      await t.service.guardarPreferencias(PAC, ['TELEGRAM']);
      await t.service.registrarContacto({ pacienteId: PAC, nombre: 'Ana', email: null });
      expect(await t.service.obtenerPreferencias(PAC)).toMatchObject({ canales: ['TELEGRAM'], email: 'a@x.com', nombre: 'Ana' });
    });
  });

  describe('recordatorios', () => {
    it('devuelve las citas de las proximas 24 h sin recordatorio, lo envia una sola vez y las saca de la lista', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      const dentro = randomUUID();
      const lejos = randomUUID();
      const pasada = randomUUID();
      await t.service.registrarCitaConfirmada({ citaId: dentro, pacienteId: PAC, fechaHora: new Date(t.ahora() + 5 * 3_600_000).toISOString() });
      await t.service.registrarCitaConfirmada({ citaId: lejos, pacienteId: PAC, fechaHora: new Date(t.ahora() + 30 * 3_600_000).toISOString() });
      await t.service.registrarCitaConfirmada({ citaId: pasada, pacienteId: PAC, fechaHora: new Date(t.ahora() - 3_600_000).toISOString() });
      expect((await t.service.recordatoriosPendientes()).map((c) => c.citaId)).toEqual([dentro]);

      const n = await t.service.enviarRecordatorio(dentro);
      expect(n).toMatchObject({ tipo: 'RECORDATORIO', estado: 'ENVIADA' });
      expect(t.enviados[0].asunto).toBe('Recordatorio de tu cita');
      expect(t.repos.respuestas).toHaveLength(0); // sin respuesta de SAGA
      expect(await t.service.recordatoriosPendientes()).toEqual([]);
      await t.service.enviarRecordatorio(dentro); // repetido: no reenvia
      expect(t.enviados).toHaveLength(1);
      expect(await t.service.enviarRecordatorio(randomUUID())).toBeNull();
    });
  });

  describe('Fase 6: eventos, historial y gestion', () => {
    const cita = (t: ReturnType<typeof setup>, horas: number) => ({ citaId: randomUUID(), pacienteId: PAC, fechaHora: new Date(t.ahora() + horas * 3_600_000).toISOString() });

    it('cita.reprogramada recuerda la nueva fecha y avisa una sola vez por fecha; cita.cancelada deja de recordar', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      const c = cita(t, 30);
      await t.service.registrarCitaConfirmada(c);
      const nueva = { ...c, fechaHora: new Date(t.ahora() + 5 * 3_600_000).toISOString() };
      const n = await t.service.citaReprogramada(nueva);
      expect(n).toMatchObject({ tipo: 'CITA_REPROGRAMADA', estado: 'ENVIADA' });
      expect(t.enviados[0].asunto).toBe('Tu cita fue reprogramada');
      await t.service.citaReprogramada(nueva); // reentrega
      expect(t.enviados).toHaveLength(1);
      expect((await t.service.recordatoriosPendientes()).map((x) => x.citaId)).toEqual([c.citaId]); // ahora cae dentro de 24 h
      await t.service.citaReprogramada({ ...c, fechaHora: new Date(t.ahora() + 6 * 3_600_000).toISOString() }); // otra fecha: otro aviso
      expect(t.enviados).toHaveLength(2);
      await t.service.citaCancelada(c.citaId);
      expect(await t.service.recordatoriosPendientes()).toEqual([]);
    });

    it('el paciente fija antelacion y tipos de aviso; los recordatorios se adaptan', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      const c = cita(t, 10);
      await t.service.registrarCitaConfirmada(c);
      await t.service.guardarPreferencias(PAC, undefined, { antelacionHoras: 6 });
      expect(await t.service.recordatoriosPendientes()).toEqual([]); // faltan 10 h y pidio 6
      t.avanzar(5 * 3_600_000);
      expect((await t.service.recordatoriosPendientes()).map((x) => x.citaId)).toEqual([c.citaId]);
      await t.service.guardarPreferencias(PAC, undefined, { tiposAviso: ['ESTUDIO_VALIDADO'] }); // apaga recordatorios
      expect(await t.service.recordatoriosPendientes()).toEqual([]);
      expect(await t.service.enviarRecordatorio(c.citaId)).toBe('OMITIDO');
      expect(t.enviados).toHaveLength(0);
      await expect(t.service.guardarPreferencias(PAC, undefined, { antelacionHoras: 5 })).rejects.toBeInstanceOf(PreferenciasInvalidasError);
      await expect(t.service.guardarPreferencias(PAC, undefined, { tiposAviso: ['CITA_CONFIRMADA'] })).rejects.toBeInstanceOf(PreferenciasInvalidasError);
    });

    it('estudio validado avisa sin datos clinicos y no se repite; reforzar es uno por cita', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      const imagenId = randomUUID();
      expect(await t.service.estudioValidado({ imagenId, pacienteId: PAC })).toMatchObject({ tipo: 'ESTUDIO_VALIDADO', estado: 'ENVIADA' });
      await t.service.estudioValidado({ imagenId, pacienteId: PAC });
      expect(t.enviados).toHaveLength(1);
      expect(t.enviados[0].texto).not.toMatch(/neumon|diagn|resultado/i);
      const c = cita(t, 3);
      await t.service.registrarCitaConfirmada(c);
      expect(await t.service.reforzarRecordatorio(c.citaId)).toMatchObject({ tipo: 'RECORDATORIO_REFUERZO' });
      await t.service.reforzarRecordatorio(c.citaId);
      expect(t.enviados.filter((e) => e.asunto.includes('importante'))).toHaveLength(1);
      expect(await t.service.reforzarRecordatorio(randomUUID())).toBeNull();
    });

    it('reenviar solo sirve para FALLIDAS y no responde otra vez a la SAGA', async () => {
      const t = setup({ fallos: { EMAIL: 3 } });
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      const n = await t.service.recibirComando(cmd());
      await expect(t.service.reenviar(n.id)).rejects.toMatchObject({ code: 'NOTIFICACION_NO_REENVIABLE', status: 409 }); // aun PENDIENTE
      t.avanzar(1000);
      await t.service.reintentarPendientes();
      t.avanzar(2000);
      await t.service.reintentarPendientes();
      expect((await t.service.porCita(n.citaId))[0].estado).toBe('FALLIDA');
      expect(t.repos.respuestas).toHaveLength(1); // ...fallida
      const r = await t.service.reenviar(n.id);
      expect(r.estado).toBe('ENVIADA');
      expect(t.repos.respuestas).toHaveLength(1); // no se publica otra respuesta
      await expect(t.service.reenviar(randomUUID())).rejects.toMatchObject({ code: 'NOTIFICACION_NO_ENCONTRADA', status: 404 });
    });

    it('marcar leidas solo afecta a las propias', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      const n = await t.service.recibirComando(cmd());
      expect(await t.service.marcarLeidas([n.id], randomUUID())).toEqual({ marcadas: 0 });
      expect(await t.service.marcarLeidas([n.id, n.id], PAC)).toEqual({ marcadas: 1 });
      expect((await t.service.porCita(n.citaId))[0]).toMatchObject({ leida: true });
    });

    it('resumen del dia en hora de la clinica', async () => {
      const t = setup({ fallos: { EMAIL: 3 } });
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      await t.service.recibirComando(cmd()); // pendiente
      const r = await t.service.resumen('2026-12-01');
      expect(r).toMatchObject({ fecha: '2026-12-01', total: 1, pendientes: 1, enviadas: 0, fallidas: 0, tasaEntrega: null, porTipo: { CITA_CONFIRMADA: 1 } });
      expect((await t.service.resumen('2026-12-02')).total).toBe(0);
      await expect(t.service.resumen('ayer')).rejects.toMatchObject({ code: 'FECHA_INVALIDA' });
    });

    it('desvincular Telegram quita el chat y deja EMAIL si era el unico canal', async () => {
      const t = setup();
      await t.service.registrarContacto({ pacienteId: PAC, email: 'a@x.com' });
      await expect(t.service.desvincularTelegram(PAC)).rejects.toMatchObject({ code: 'TELEGRAM_NO_VINCULADO', status: 404 });
      await t.service.generarCodigoVinculo(PAC, 'DESV0001');
      await t.service.vincularTelegram('DESV0001', '9');
      await t.service.guardarPreferencias(PAC, ['TELEGRAM']);
      const c = await t.service.desvincularTelegram(PAC);
      expect(c.canales).toEqual(['EMAIL']);
      expect(c.telegramChatId).toBeUndefined();
    });

    it('preferencias del personal: por defecto todo activo y se pueden cambiar', async () => {
      const t = setup();
      expect((await t.service.obtenerPreferenciasPersonal('u1')).alertas).toEqual({ sagaCompensada: true, notificacionFallida: true, colaDeErrores: true });
      await t.service.guardarPreferenciasPersonal('u1', { sagaCompensada: false, notificacionFallida: true, colaDeErrores: false });
      expect((await t.service.obtenerPreferenciasPersonal('u1')).alertas.sagaCompensada).toBe(false);
    });

    describe('plantillas editables', () => {
      const asunto = 'Tu cita';
      it('muestra la de fabrica (version 0), guarda versiones y las usa al enviar', async () => {
        const t = setup();
        await t.service.registrarContacto({ pacienteId: PAC, nombre: 'Ana', email: 'a@x.com' });
        const f = await t.service.plantilla('CITA_CONFIRMADA', 'EMAIL');
        expect(f).toMatchObject({ version: 0, deFabrica: true });
        expect(f.cuerpo).toContain('{{cuando}}');
        const v1 = await t.service.guardarPlantilla('CITA_CONFIRMADA', 'EMAIL', asunto, 'Hola {{nombre}}, te esperamos {{cuando}}.', 0, 'admin');
        expect(v1.version).toBe(1);
        await t.service.recibirComando(cmd());
        expect(t.enviados[0]).toMatchObject({ asunto: 'Tu cita' });
        expect(t.enviados[0].texto).toMatch(/Hola Ana, te esperamos el .*2 de diciembre a las 10:30/);
        await expect(t.service.guardarPlantilla('CITA_CONFIRMADA', 'EMAIL', asunto, 'Otra {{cuando}}', 0, 'otro')).rejects.toMatchObject({ code: 'VERSION_CONFLICTO', status: 409, extras: { versionVigente: 1 } });
        expect((await t.service.guardarPlantilla('CITA_CONFIRMADA', 'EMAIL', asunto, 'Otra {{cuando}}', 1, 'admin')).version).toBe(2);
        expect((await t.service.listarPlantillas()).filter((p) => p.tipo === 'CITA_CONFIRMADA' && p.canal === 'EMAIL')[0].version).toBe(2);
      });

      it('valida variables, contenido clinico, fecha obligatoria y largo en Telegram', async () => {
        const t = setup();
        const ok = (cuerpo: string, tipo: Parameters<typeof t.service.guardarPlantilla>[0] = 'ESTUDIO_VALIDADO', canal: Canal = 'EMAIL') => t.service.guardarPlantilla(tipo, canal, asunto, cuerpo, 0, 'a');
        await expect(ok('Hola {{apellido}}')).rejects.toMatchObject({ code: 'PLANTILLA_VARIABLE_INVALIDA', status: 422 });
        await expect(ok('Hola {{nombre')).rejects.toMatchObject({ code: 'PLANTILLA_VARIABLE_INVALIDA' });
        await expect(ok('Tu diagnostico esta listo')).rejects.toMatchObject({ code: 'PLANTILLA_CONTENIDO_CLINICO' });
        await expect(ok('Toma 500 mg cada 8 horas')).rejects.toMatchObject({ code: 'PLANTILLA_CONTENIDO_CLINICO' });
        await expect(ok('Sin fecha', 'RECORDATORIO')).rejects.toMatchObject({ code: 'PLANTILLA_SIN_FECHA' });
        await expect(ok('x'.repeat(301), 'ESTUDIO_VALIDADO', 'TELEGRAM')).rejects.toMatchObject({ code: 'PLANTILLA_INVALIDA' });
        await expect(t.service.guardarPlantilla('NADA' as never, 'EMAIL', asunto, 'x', 0, 'a')).rejects.toBeInstanceOf(ReglaNotificacionError);
        expect((await ok('Tu informe ya esta listo, {{nombre}}.')).version).toBe(1);
      });

      it('la vista previa renderiza sin guardar', async () => {
        const t = setup();
        const m = t.service.vistaPrevia('RECORDATORIO', 'EMAIL', 'Recordatorio', 'Hola {{nombre}}: {{cuando}}');
        expect(m.texto).toContain('Hola Ana: el ');
        expect((await t.service.plantilla('RECORDATORIO', 'EMAIL')).version).toBe(0);
        expect(() => t.service.vistaPrevia('RECORDATORIO', 'EMAIL', 'x', 'sin fecha')).toThrow(ReglaNotificacionError);
      });
    });
  });
});
