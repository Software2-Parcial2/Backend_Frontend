import { randomUUID } from 'node:crypto';
import { ArchivoInvalidoError, PacienteInexistenteError, ReglaImagenError, ServicioNoDisponibleError, type Imagen, type ImagenEstado, type InformeValidado, type ResultadoAnalisis, type Validacion } from '../domain/imagen.js';
import { ImagenesService, type ImagenesConfig } from './imagenes.service.js';
import type { FiltroImagenes, ImagenRepository, PaginaImagenes } from './ports.js';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(7)]);
const PAC = randomUUID();

class MemRepo implements ImagenRepository {
  m = new Map<string, Imagen>();
  async guardar(i: Imagen) { this.m.set(i.id, structuredClone(i)); }
  async obtener(id: string) { return structuredClone(this.m.get(id) ?? null); }
  async buscar(f: FiltroImagenes): Promise<PaginaImagenes> { return { items: [...this.m.values()].filter((i) => (!f.pacienteId || i.pacienteId === f.pacienteId) && (!f.validacion || i.validacion === f.validacion)), siguiente: null }; }
  async porHash(pacienteId: string, h: string) { return [...this.m.values()].find((i) => i.pacienteId === pacienteId && i.hashSha256 === h) ?? null; }
  async validar(id: string, informe: InformeValidado, validacion: Validacion, ahora: number) {
    const i = this.m.get(id);
    if (!i || i.estado !== 'ANALIZADA' || i.validacion !== 'PENDIENTE') return false;
    Object.assign(i, { informe, validacion, eventoPendiente: true, actualizadaEn: ahora });
    return true;
  }
  async marcarEventoPublicado(id: string) { delete this.m.get(id)!.eventoPendiente; }
  async conEventoPendiente() { return [...this.m.values()].filter((i) => i.eventoPendiente).map((i) => structuredClone(i)); }
  async transicion(id: string, desde: ImagenEstado[], c: { estado: ImagenEstado; resultado?: ResultadoAnalisis; error?: string }, ahora: number) {
    const i = this.m.get(id);
    if (!i || !desde.includes(i.estado)) return false;
    Object.assign(i, c, { actualizadaEn: ahora });
    return true;
  }
  async marcarEnvio(id: string, desde: ImagenEstado[], ahora: number) {
    const i = this.m.get(id);
    if (!i || !desde.includes(i.estado)) return null;
    Object.assign(i, { estado: 'ANALIZANDO', actualizadaEn: ahora, intentosAnalisis: i.intentosAnalisis + 1 });
    return structuredClone(i);
  }
  async atascadas(antesDe: number) { return [...this.m.values()].filter((i) => ['SUBIDA', 'ANALIZANDO'].includes(i.estado) && i.actualizadaEn < antesDe).map((i) => structuredClone(i)); }
}

function setup(over: { existe?: boolean | Error; publicarFalla?: boolean; maxBytes?: number } = {}) {
  const eventos: string[] = [];
  const validacion = { falla: false };
  let now = 1_000_000;
  const repo = new MemRepo();
  const subidos: { key: string; mime: string; n: number }[] = [];
  const solicitudes: string[] = [];
  const state = { publicarFalla: over.publicarFalla ?? false };
  const config: ImagenesConfig = { bucket: 'radiografias', maxBytes: over.maxBytes ?? 1000, urlSegundos: 300, analisisTimeoutMs: 1000, maxEnvios: 3 };
  const service = new ImagenesService({
    repo,
    store: { subir: async (_b, key, c, mime) => void subidos.push({ key, mime, n: c.length }), urlTemporal: async (b, k, s) => `http://s3/${b}/${k}?X-Amz-Expires=${s}` },
    pacientes: { resumen: async () => { if (over.existe instanceof Error) throw over.existe; return (over.existe ?? true) ? { nombre: 'Carla Rojas', numeroHistoria: 'HC-1' } : null; } },
    validaciones: { publicar: async (i) => { if (validacion.falla) throw new Error('RabbitMQ caido'); eventos.push(i.id); } },
    publisher: { solicitar: async (i) => { if (state.publicarFalla) throw new Error('RabbitMQ caido'); solicitudes.push(i.id); } },
    newId: randomUUID,
    randomKey: () => randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
    now: () => now,
    config,
  });
  return { service, repo, subidos, solicitudes, state, eventos, validacion, avanzar: (ms: number) => (now += ms) };
}
const cmd = (archivo: Uint8Array = JPEG) => ({ pacienteId: PAC, estudio: 'torax', archivo, usuarioId: 'u1', origen: 'MEDICO' as const, token: 'Bearer t' });

describe('ImagenesService', () => {
  it('sube con clave no adivinable, calcula el SHA-256, guarda metadatos y encola el analisis (ANALIZANDO)', async () => {
    const t = setup();
    const i = await t.service.subir(cmd());
    expect(i.estado).toBe('ANALIZANDO');
    expect(i.hashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(i.mime).toBe('image/jpeg');
    expect(t.subidos).toHaveLength(1);
    expect(t.subidos[0].key).toMatch(new RegExp(`^radiografias/${PAC}/[0-9a-f]{64}\\.jpg$`)); // 256 bits aleatorios, extension de la firma
    expect(t.solicitudes).toEqual([i.id]);
    const claves = new Set<string>();
    for (let n = 0; n < 5; n++) claves.add((await t.service.subir(cmd(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, n, ...Array(60).fill(7)])))).objectKey);
    expect(claves.size).toBe(5); // nunca se repite la clave
  });

  it('rechaza lo que no es JPEG/PNG/DICOM aunque el nombre diga .png, y no toca S3 ni la base', async () => {
    const t = setup();
    await expect(t.service.subir(cmd(new TextEncoder().encode('no soy una imagen')))).rejects.toBeInstanceOf(ArchivoInvalidoError);
    expect(t.subidos).toHaveLength(0);
    expect(t.repo.m.size).toBe(0);
  });

  it('rechaza archivos vacios y los que superan el maximo configurable', async () => {
    const t = setup({ maxBytes: 50 });
    await expect(t.service.subir(cmd(new Uint8Array(0)))).rejects.toThrow(/vacio/);
    await expect(t.service.subir(cmd(JPEG))).rejects.toThrow(/maximo de 50 bytes/);
  });

  it('exige que el paciente exista; si MS2 no responde propaga un error de servicio (no sube nada)', async () => {
    const a = setup({ existe: false });
    await expect(a.service.subir(cmd())).rejects.toBeInstanceOf(PacienteInexistenteError);
    expect(a.subidos).toHaveLength(0);
    const b = setup({ existe: new ServicioNoDisponibleError('MS2 caido') });
    await expect(b.service.subir(cmd())).rejects.toBeInstanceOf(ServicioNoDisponibleError);
  });

  it('si RabbitMQ falla la imagen queda SUBIDA (no se pierde) y el barrido la reenvia', async () => {
    const t = setup({ publicarFalla: true });
    const i = await t.service.subir(cmd());
    expect(i.estado).toBe('SUBIDA');
    expect(t.solicitudes).toHaveLength(0);
    t.state.publicarFalla = false;
    t.avanzar(2000);
    expect(await t.service.reintentarAtascadas()).toBe(1);
    expect(t.solicitudes).toEqual([i.id]);
    expect((await t.service.obtener(i.id))!.estado).toBe('ANALIZANDO');
  });

  it('el resultado es idempotente: el primero gana, un duplicado o tardio se ignora', async () => {
    const t = setup();
    const i = await t.service.subir(cmd());
    const r = { probabilidad_neumonia: 0.31, clase: 'NORMAL' as const, version_modelo: 'v0', modelo: 'stub-no-clinico' };
    expect(await t.service.aplicarResultado(i.id, r)).toBe(true);
    expect(await t.service.aplicarResultado(i.id, { ...r, probabilidad_neumonia: 0.99 })).toBe(false);
    expect(await t.service.aplicarFallo(i.id, 'tarde')).toBe(false);
    const fin = (await t.service.obtener(i.id))!;
    expect(fin).toMatchObject({ estado: 'ANALIZADA', resultado: { probabilidad_neumonia: 0.31, modelo: 'stub-no-clinico' } });
    expect(fin.resultado!.aviso).toMatch(/no es un diagnostico/i); // aviso clinico siempre presente
  });

  it('sin respuesta, reenvia el analisis y tras maxEnvios la marca FALLIDA', async () => {
    const t = setup();
    const i = await t.service.subir(cmd()); // envio 1
    for (let n = 0; n < 2; n++) {
      t.avanzar(1500);
      await t.service.reintentarAtascadas(); // envios 2 y 3
    }
    expect(t.solicitudes).toHaveLength(3);
    t.avanzar(1500);
    await t.service.reintentarAtascadas();
    expect(await t.service.obtener(i.id)).toMatchObject({ estado: 'FALLIDA' });
    expect((await t.service.obtener(i.id))!.error).toMatch(/sin respuesta/);
  });

  it('la URL temporal usa el bucket privado y caduca', async () => {
    const t = setup();
    const i = await t.service.subir(cmd());
    const u = await t.service.urlTemporal(i);
    expect(u.url).toContain('X-Amz-Expires=300');
    expect(Date.parse(u.expiraEn)).toBe(1_000_000 + 300_000); // reloj simulado + 300 s
  });

  it('guarda origen, validacion pendiente y el snapshot del paciente; rechaza la misma radiografia (IMAGEN_DUPLICADA)', async () => {
    const t = setup();
    const i = await t.service.subir(cmd());
    expect(i).toMatchObject({ origen: 'MEDICO', validacion: 'PENDIENTE', pacienteNombre: 'Carla Rojas', numeroHistoria: 'HC-1' });
    await expect(t.service.subir(cmd())).rejects.toMatchObject({ code: 'IMAGEN_DUPLICADA', status: 409 });
    expect(t.subidos).toHaveLength(1);
  });

  describe('validacion medica', () => {
    const resultado = { probabilidad_neumonia: 0.8, clase: 'NEUMONIA' as const, version_modelo: 'v1', modelo: 'm' };
    async function analizada(t: ReturnType<typeof setup>) {
      const i = await t.service.subir(cmd());
      await t.service.aplicarResultado(i.id, resultado);
      return i;
    }

    it('confirma, firma con huella, publica el evento y no permite validar dos veces', async () => {
      const t = setup();
      const i = await analizada(t);
      const v = await t.service.validar({ imagenId: i.id, decision: 'CONFIRMA', usuarioId: 'dr', medicoId: 'm1' });
      expect(v.validacion).toBe('VALIDADO');
      expect(v.informe).toMatchObject({ decision: 'CONFIRMA', validadoPor: 'dr', versionModelo: 'v1' });
      expect(v.informe!.huella).toMatch(/^[0-9a-f]{64}$/);
      expect(t.eventos).toEqual([i.id]);
      expect((await t.service.obtener(i.id))!.eventoPendiente).toBeUndefined();
      await expect(t.service.validar({ imagenId: i.id, decision: 'DESCARTA', texto: 'x', usuarioId: 'dr' })).rejects.toMatchObject({ code: 'YA_VALIDADO' });
    });

    it('modificar y descartar exigen texto; descartar deja DESCARTADO', async () => {
      const t = setup();
      const i = await analizada(t);
      await expect(t.service.validar({ imagenId: i.id, decision: 'MODIFICA', usuarioId: 'dr' })).rejects.toMatchObject({ code: 'INFORME_REQUERIDO', status: 422 });
      const d = await t.service.validar({ imagenId: i.id, decision: 'DESCARTA', texto: 'imagen borrosa', usuarioId: 'dr' });
      expect(d.validacion).toBe('DESCARTADO');
    });

    it('no se valida un estudio sin analizar ni uno inexistente', async () => {
      const t = setup();
      const i = await t.service.subir(cmd());
      await expect(t.service.validar({ imagenId: i.id, decision: 'CONFIRMA', usuarioId: 'dr' })).rejects.toMatchObject({ code: 'ANALISIS_PENDIENTE', status: 409 });
      await expect(t.service.validar({ imagenId: randomUUID(), decision: 'CONFIRMA', usuarioId: 'dr' })).rejects.toBeInstanceOf(ReglaImagenError);
    });

    it('si RabbitMQ falla el evento queda pendiente y el barrido lo publica', async () => {
      const t = setup();
      const i = await analizada(t);
      t.validacion.falla = true;
      const v = await t.service.validar({ imagenId: i.id, decision: 'CONFIRMA', usuarioId: 'dr' });
      expect(v.eventoPendiente).toBe(true);
      expect(t.eventos).toHaveLength(0);
      t.validacion.falla = false;
      expect(await t.service.republicarValidaciones()).toBe(1);
      expect(t.eventos).toEqual([i.id]);
      expect(await t.service.republicarValidaciones()).toBe(0);
    });

    it('el Grad-CAM se guarda desde el resultado y su URL falla con 404 si no existe', async () => {
      const t = setup();
      const a = await t.service.subir(cmd());
      await expect(t.service.urlGradcam(a)).rejects.toMatchObject({ code: 'GRADCAM_NO_DISPONIBLE', status: 404 });
      await t.service.aplicarResultado(a.id, resultado, 'gradcam/a.png');
      const u = await t.service.urlGradcam((await t.service.obtener(a.id))!);
      expect(u.url).toContain('gradcam/a.png');
    });
  });
});
