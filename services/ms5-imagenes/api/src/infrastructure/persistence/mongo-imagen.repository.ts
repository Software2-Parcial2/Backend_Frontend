import mongoose, { type Connection, type Model } from 'mongoose';
import type { FiltroImagenes, ImagenRepository, PaginaImagenes } from '../../application/ports.js';
import type { Imagen, ImagenEstado, InformeValidado, ResultadoAnalisis, Validacion } from '../../domain/imagen.js';

const schema = new mongoose.Schema<Imagen & { _id: string }>(
  {
    _id: { type: String, required: true },
    pacienteId: { type: String, required: true },
    estudio: { type: String, required: true },
    estado: { type: String, required: true, enum: ['SUBIDA', 'ANALIZANDO', 'ANALIZADA', 'FALLIDA'] },
    hashSha256: { type: String, required: true },
    mime: { type: String, required: true },
    bytes: { type: Number, required: true },
    bucket: { type: String, required: true },
    objectKey: { type: String, required: true },
    usuarioId: { type: String, required: true },
    origen: { type: String, required: true, enum: ['MEDICO', 'PACIENTE'], default: 'MEDICO' },
    validacion: { type: String, required: true, enum: ['PENDIENTE', 'VALIDADO', 'DESCARTADO'], default: 'PENDIENTE' },
    informe: { type: Object },
    eventoPendiente: { type: Boolean },
    observaciones: { type: String },
    pacienteNombre: { type: String },
    numeroHistoria: { type: String },
    gradcamKey: { type: String },
    resultado: { type: Object },
    error: { type: String },
    intentosAnalisis: { type: Number, default: 0 },
    creadaEn: { type: Number, required: true },
    actualizadaEn: { type: Number, required: true },
  },
  { collection: 'imagenes', versionKey: false },
);
// Listado por paciente (mas recientes primero) y barrido de imagenes atascadas.
schema.index({ pacienteId: 1, creadaEn: -1, _id: -1 });
schema.index({ estado: 1, actualizadaEn: 1 });
schema.index({ validacion: 1, creadaEn: -1, _id: -1 });
schema.index({ pacienteId: 1, hashSha256: 1 });
schema.index({ eventoPendiente: 1 }, { sparse: true });

type Doc = Imagen & { _id: string };
const aImagen = (d: Doc): Imagen => {
  const { _id, ...rest } = d;
  return { ...rest, id: _id } as Imagen;
};

/** Metadatos de imagenes en MongoDB. Las transiciones de estado son condicionales (findOneAndUpdate) y por tanto idempotentes. */
export class MongoImagenRepository implements ImagenRepository {
  private readonly model: Model<Doc>;

  constructor(connection: Connection) {
    this.model = connection.models.Imagen ?? connection.model<Doc>('Imagen', schema);
  }

  async guardar(i: Imagen): Promise<void> {
    const { id, ...rest } = i;
    await this.model.create({ _id: id, ...rest });
  }

  async obtener(id: string): Promise<Imagen | null> {
    const d = await this.model.findById(id).lean<Doc>();
    return d ? aImagen(d) : null;
  }

  async buscar(f: FiltroImagenes, limite: number, cursor?: string): Promise<PaginaImagenes> {
    const filtro: Record<string, unknown> = {};
    if (f.pacienteId) filtro.pacienteId = f.pacienteId;
    if (f.validacion) filtro.validacion = f.validacion;
    if (f.estado) filtro.estado = f.estado;
    if (f.q?.trim()) {
      const re = new RegExp(f.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtro.$and = [{ $or: [{ pacienteNombre: re }, { numeroHistoria: re }, { estudio: re }] }];
    }
    if (cursor) {
      const { t, id } = decodificar(cursor);
      const keyset = { $or: [{ creadaEn: { $lt: t } }, { creadaEn: t, _id: { $lt: id } }] };
      filtro.$and = [...((filtro.$and as unknown[]) ?? []), keyset];
    }
    const docs = await this.model.find(filtro).sort({ creadaEn: -1, _id: -1 }).limit(limite + 1).lean<Doc[]>();
    const hayMas = docs.length > limite;
    const items = docs.slice(0, limite).map(aImagen);
    const ultimo = items.at(-1);
    return { items, siguiente: hayMas && ultimo ? Buffer.from(JSON.stringify({ t: ultimo.creadaEn, id: ultimo.id })).toString('base64url') : null };
  }

  async porHash(pacienteId: string, hashSha256: string): Promise<Imagen | null> {
    const d = await this.model.findOne({ pacienteId, hashSha256 }).lean<Doc>();
    return d ? aImagen(d) : null;
  }

  async validar(id: string, informe: InformeValidado, validacion: Validacion, ahora: number): Promise<boolean> {
    const r = await this.model
      .findOneAndUpdate({ _id: id, estado: 'ANALIZADA', validacion: 'PENDIENTE' }, { $set: { informe, validacion, eventoPendiente: true, actualizadaEn: ahora } }, { new: false })
      .lean();
    return r !== null;
  }

  async marcarEventoPublicado(id: string): Promise<void> {
    await this.model.updateOne({ _id: id }, { $unset: { eventoPendiente: '' } });
  }

  async conEventoPendiente(limite: number): Promise<Imagen[]> {
    const docs = await this.model.find({ eventoPendiente: true }).sort({ actualizadaEn: 1 }).limit(limite).lean<Doc[]>();
    return docs.map(aImagen);
  }

  async transicion(
    id: string,
    desde: ImagenEstado[],
    cambios: { estado: ImagenEstado; resultado?: ResultadoAnalisis; error?: string; gradcamKey?: string },
    ahora: number,
  ): Promise<boolean> {
    const r = await this.model.findOneAndUpdate({ _id: id, estado: { $in: desde } }, { $set: { ...cambios, actualizadaEn: ahora } }, { new: false }).lean();
    return r !== null;
  }

  async marcarEnvio(id: string, desde: ImagenEstado[], ahora: number): Promise<Imagen | null> {
    const d = await this.model
      .findOneAndUpdate({ _id: id, estado: { $in: desde } }, { $set: { estado: 'ANALIZANDO', actualizadaEn: ahora }, $inc: { intentosAnalisis: 1 } }, { new: true })
      .lean<Doc>();
    return d ? aImagen(d) : null;
  }

  async atascadas(antesDe: number, limite: number): Promise<Imagen[]> {
    const docs = await this.model.find({ estado: { $in: ['SUBIDA', 'ANALIZANDO'] }, actualizadaEn: { $lt: antesDe } }).sort({ actualizadaEn: 1 }).limit(limite).lean<Doc[]>();
    return docs.map(aImagen);
  }
}

export class CursorInvalidoError extends Error {}

function decodificar(cursor: string): { t: number; id: string } {
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t: unknown; id: unknown };
    if (typeof v.t !== 'number' || typeof v.id !== 'string') throw new Error();
    return { t: v.t, id: v.id };
  } catch {
    throw new CursorInvalidoError('cursor invalido');
  }
}
