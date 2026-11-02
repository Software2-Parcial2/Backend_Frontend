import { randomUUID } from 'node:crypto';
import { ArchivoInvalidoError, PacienteInexistenteError, ServicioNoDisponibleError, type Imagen, type ImagenEstado, type ResultadoAnalisis } from '../domain/imagen.js';
import { ImagenesService, type ImagenesConfig } from './imagenes.service.js';
import type { ImagenRepository, PaginaImagenes } from './ports.js';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(7)]);
const PAC = randomUUID();

class MemRepo implements ImagenRepository {
  m = new Map<string, Imagen>();
  async guardar(i: Imagen) { this.m.set(i.id, structuredClone(i)); }
  async obtener(id: string) { return structuredClone(this.m.get(id) ?? null); }
  async porPaciente(): Promise<PaginaImagenes> { return { items: [], siguiente: null }; }
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
  let now = 1_000_000;
  const repo = new MemRepo();
  const subidos: { key: string; mime: string; n: number }[] = [];
  const solicitudes: string[] = [];
  const state = { publicarFalla: over.publicarFalla ?? false };
  const config: ImagenesConfig = { bucket: 'radiografias', maxBytes: over.maxBytes ?? 1000, urlSegundos: 300, analisisTimeoutMs: 1000, maxEnvios: 3 };
  const service = new ImagenesService({
    repo,
    store: { subir: async (_b, key, c, mime) => void subidos.push({ key, mime, n: c.length }), urlTemporal: async (b, k, s) => `http://s3/${b}/${k}?X-Amz-Expires=${s}` },
    pacientes: { existe: async () => { if (over.existe instanceof Error) throw over.existe; return over.existe ?? true; } },
    publisher: { solicitar: async (i) => { if (state.publicarFalla) throw new Error('RabbitMQ caido'); solicitudes.push(i.id); } },
    newId: randomUUID,
    randomKey: () => randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
    now: () => now,
    config,
  });
  return { service, repo, subidos, solicitudes, state, avanzar: (ms: number) => (now += ms) };
}
const cmd = (archivo: Uint8Array = JPEG) => ({ pacienteId: PAC, estudio: 'torax', archivo, usuarioId: 'u1', token: 'Bearer t' });

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
    for (let n = 0; n < 5; n++) claves.add((await t.service.subir(cmd())).objectKey);
    expect(claves.size).toBe(5); // la misma imagen subida varias veces no repite clave
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
});
