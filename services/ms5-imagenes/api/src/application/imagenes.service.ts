import { createHash } from 'node:crypto';
import {
  ArchivoInvalidoError,
  AVISO_CLINICO,
  PacienteInexistenteError,
  type Imagen,
  type ResultadoAnalisis,
} from '../domain/imagen.js';
import { detectarTipo } from './firma-archivo.js';
import type { AnalisisPublisher, ImagenRepository, ObjectStore, PacienteGateway, PaginaImagenes } from './ports.js';

export interface ImagenesConfig {
  bucket: string;
  maxBytes: number;
  urlSegundos: number;
  /** Tiempo sin respuesta tras el que se reenvia la solicitud de analisis, y maximo de envios antes de marcar FALLIDA. */
  analisisTimeoutMs: number;
  maxEnvios: number;
}

export interface ImagenesDeps {
  repo: ImagenRepository;
  store: ObjectStore;
  pacientes: PacienteGateway;
  publisher: AnalisisPublisher;
  newId: () => string;
  /** Genera la parte aleatoria (no adivinable) de la clave del objeto. */
  randomKey: () => string;
  now?: () => number;
  config: ImagenesConfig;
  log?: (m: string) => void;
}

export interface SubirComando {
  pacienteId: string;
  estudio: string;
  archivo: Uint8Array;
  usuarioId: string;
  /** Token del usuario, para comprobar la existencia del paciente en MS2 en su nombre. */
  token: string;
}

/** Casos de uso de imagenes. Sin framework. */
export class ImagenesService {
  private readonly now: () => number;

  constructor(private readonly d: ImagenesDeps) {
    this.now = d.now ?? Date.now;
  }

  async subir(cmd: SubirComando): Promise<Imagen> {
    const { maxBytes, bucket } = this.d.config;
    if (cmd.archivo.length === 0) throw new ArchivoInvalidoError('el archivo esta vacio');
    if (cmd.archivo.length > maxBytes) throw new ArchivoInvalidoError(`el archivo supera el maximo de ${maxBytes} bytes`);
    // El tipo se decide por la firma real del archivo, no por la extension ni por el Content-Type del cliente.
    const tipo = detectarTipo(cmd.archivo);
    if (!tipo) throw new ArchivoInvalidoError('tipo de archivo no permitido: solo JPEG, PNG o DICOM (se comprueba la firma del archivo)');
    if (!(await this.d.pacientes.existe(cmd.pacienteId, cmd.token))) throw new PacienteInexistenteError(cmd.pacienteId);

    const id = this.d.newId();
    const ahora = this.now();
    const imagen: Imagen = {
      id,
      pacienteId: cmd.pacienteId,
      estudio: cmd.estudio,
      estado: 'SUBIDA',
      hashSha256: createHash('sha256').update(cmd.archivo).digest('hex'),
      mime: tipo.mime,
      bytes: cmd.archivo.length,
      bucket,
      // Clave no adivinable: el paciente y un azar de 256 bits; la extension sale de la firma, no del nombre subido.
      objectKey: `radiografias/${cmd.pacienteId}/${this.d.randomKey()}.${tipo.ext}`,
      usuarioId: cmd.usuarioId,
      intentosAnalisis: 0,
      creadaEn: ahora,
      actualizadaEn: ahora,
    };
    await this.d.store.subir(bucket, imagen.objectKey, cmd.archivo, tipo.mime);
    await this.d.repo.guardar(imagen);
    return this.solicitarAnalisis(imagen);
  }

  /** Publica la solicitud de analisis. Si RabbitMQ falla la imagen queda SUBIDA y el barrido la reenvia (nunca se pierde). */
  private async solicitarAnalisis(imagen: Imagen): Promise<Imagen> {
    try {
      await this.d.publisher.solicitar(imagen);
    } catch (e) {
      this.d.log?.(`no se pudo publicar el analisis de ${imagen.id}: ${(e as Error).message}; queda SUBIDA y se reintenta`);
      return imagen;
    }
    const enviada = await this.d.repo.marcarEnvio(imagen.id, ['SUBIDA', 'ANALIZANDO'], this.now());
    return enviada ?? imagen;
  }

  async obtener(id: string): Promise<Imagen | null> {
    return this.d.repo.obtener(id);
  }

  listar(pacienteId: string, limite: number, cursor?: string): Promise<PaginaImagenes> {
    return this.d.repo.porPaciente(pacienteId, Math.min(Math.max(limite, 1), 100), cursor);
  }

  async urlTemporal(imagen: Imagen): Promise<{ url: string; expiraEn: string }> {
    const s = this.d.config.urlSegundos;
    return { url: await this.d.store.urlTemporal(imagen.bucket, imagen.objectKey, s), expiraEn: new Date(this.now() + s * 1000).toISOString() };
  }

  // --- respuestas de la inferencia (idempotentes: la transicion solo ocurre desde SUBIDA/ANALIZANDO) ---------

  async aplicarResultado(imagenId: string, r: Omit<ResultadoAnalisis, 'aviso'> & { aviso?: string }): Promise<boolean> {
    return this.d.repo.transicion(
      imagenId,
      ['SUBIDA', 'ANALIZANDO'],
      { estado: 'ANALIZADA', resultado: { ...r, aviso: r.aviso ?? AVISO_CLINICO } },
      this.now(),
    );
  }

  async aplicarFallo(imagenId: string, motivo: string): Promise<boolean> {
    return this.d.repo.transicion(imagenId, ['SUBIDA', 'ANALIZANDO'], { estado: 'FALLIDA', error: motivo }, this.now());
  }

  /** Barrido: reenvia el analisis de imagenes sin respuesta y marca FALLIDA las que agotaron los envios. */
  async reintentarAtascadas(): Promise<number> {
    const { analisisTimeoutMs, maxEnvios } = this.d.config;
    let n = 0;
    for (const i of await this.d.repo.atascadas(this.now() - analisisTimeoutMs, 25)) {
      if (i.intentosAnalisis >= maxEnvios) {
        if (await this.aplicarFallo(i.id, `sin respuesta del servicio de analisis tras ${i.intentosAnalisis} envios`)) n++;
        continue;
      }
      await this.solicitarAnalisis(i);
      n++;
    }
    return n;
  }
}
