import mongoose, { type Connection, type Model } from 'mongoose';
import type { ImagenRepository, PaginaImagenes } from '../../application/ports.js';
import type { Imagen, ImagenEstado, ResultadoAnalisis } from '../../domain/imagen.js';

const schema = new mongoose.Schema<Imagen & { _id: string }>(
  {
    _id: { type: String, required: true },
    pacienteId: { type: String, required: true, index: true },
    estudio: { type: String, required: true },
    estado: { type: String, required: true, enum: ['SUBIDA', 'ANALIZANDO', 'ANALIZADA', 'FALLIDA'] },
    hashSha256: { type: String, required: true },
    mime: { type: String, required: true },
    bytes: { type: Number, required: true },
    bucket: { type: String, required: true },
    objectKey: { type: String, required: true },
    usuarioId: { type: String, required: true },
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

  async porPaciente(pacienteId: string, limite: number, cursor?: string): Promise<PaginaImagenes> {
    const filtro: Record<string, unknown> = { pacienteId };
    if (cursor) {
      const { t, id } = decodificar(cursor);
      filtro.$or = [{ creadaEn: { $lt: t } }, { creadaEn: t, _id: { $lt: id } }];
    }
    const docs = await this.model.find(filtro).sort({ creadaEn: -1, _id: -1 }).limit(limite + 1).lean<Doc[]>();
    const hayMas = docs.length > limite;
    const items = docs.slice(0, limite).map(aImagen);
    const ultimo = items.at(-1);
    return { items, siguiente: hayMas && ultimo ? Buffer.from(JSON.stringify({ t: ultimo.creadaEn, id: ultimo.id })).toString('base64url') : null };
  }

  async transicion(
    id: string,
    desde: ImagenEstado[],
    cambios: { estado: ImagenEstado; resultado?: ResultadoAnalisis; error?: string },
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
