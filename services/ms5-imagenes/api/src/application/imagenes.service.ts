import { createHash } from 'node:crypto';
import {
  ArchivoInvalidoError,
  AVISO_CLINICO,
  PacienteInexistenteError,
  ReglaImagenError,
  type Decision,
  type Imagen,
  type InformeValidado,
  type Origen,
  type ResultadoAnalisis,
} from '../domain/imagen.js';
import { detectarTipo } from './firma-archivo.js';
import type { AnalisisPublisher, FiltroImagenes, ImagenRepository, ObjectStore, PacienteGateway, PaginaImagenes, ValidacionPublisher } from './ports.js';

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
  validaciones: ValidacionPublisher;
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
  origen: Origen;
  observaciones?: string;
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
    const paciente = await this.d.pacientes.resumen(cmd.pacienteId, cmd.token);
    if (!paciente) throw new PacienteInexistenteError(cmd.pacienteId);
    const hashSha256 = createHash('sha256').update(cmd.archivo).digest('hex');
    // La misma radiografia no se sube dos veces para el mismo paciente.
    const previa = await this.d.repo.porHash(cmd.pacienteId, hashSha256);
    if (previa) throw new ReglaImagenError('IMAGEN_DUPLICADA', 409, `Esta radiografia ya fue subida (estudio ${previa.id})`);

    const id = this.d.newId();
    const ahora = this.now();
    const imagen: Imagen = {
      id,
      pacienteId: cmd.pacienteId,
      estudio: cmd.estudio,
      estado: 'SUBIDA',
      hashSha256,
      mime: tipo.mime,
      bytes: cmd.archivo.length,
      bucket,
      // Clave no adivinable: el paciente y un azar de 256 bits; la extension sale de la firma, no del nombre subido.
      objectKey: `radiografias/${cmd.pacienteId}/${this.d.randomKey()}.${tipo.ext}`,
      usuarioId: cmd.usuarioId,
      origen: cmd.origen,
      validacion: 'PENDIENTE',
      observaciones: cmd.observaciones,
      pacienteNombre: paciente.nombre || undefined,
      numeroHistoria: paciente.numeroHistoria ?? undefined,
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

  listar(filtro: FiltroImagenes, limite: number, cursor?: string): Promise<PaginaImagenes> {
    return this.d.repo.buscar(filtro, Math.min(Math.max(limite, 1), 100), cursor);
  }

  /** URL temporal del mapa de calor (Grad-CAM); 404 si la inferencia no lo genero. */
  async urlGradcam(imagen: Imagen): Promise<{ url: string; expiraEn: string }> {
    if (!imagen.gradcamKey) throw new ReglaImagenError('GRADCAM_NO_DISPONIBLE', 404, 'Este estudio no tiene mapa de calor');
    const s = this.d.config.urlSegundos;
    return { url: await this.d.store.urlTemporal(imagen.bucket, imagen.gradcamKey, s), expiraEn: new Date(this.now() + s * 1000).toISOString() };
  }

  /**
   * Validacion medica del informe. Solo sobre un estudio ya analizado y aun pendiente; firma con la huella del contenido y
   * publica `imagen.informe-validado`. Si RabbitMQ falla, el evento queda pendiente y el barrido lo reenvia.
   */
  async validar(cmd: { imagenId: string; decision: Decision; texto?: string; usuarioId: string; medicoId?: string | null }): Promise<Imagen> {
    const imagen = await this.d.repo.obtener(cmd.imagenId);
    if (!imagen) throw new ReglaImagenError('IMAGEN_NO_ENCONTRADA', 404, `No existe la imagen ${cmd.imagenId}`);
    if (imagen.estado !== 'ANALIZADA') throw new ReglaImagenError('ANALISIS_PENDIENTE', 409, `El estudio esta ${imagen.estado}: espere el resultado del analisis`);
    if (imagen.validacion !== 'PENDIENTE') throw new ReglaImagenError('YA_VALIDADO', 409, 'El informe de este estudio ya fue validado o descartado');
    const texto = cmd.texto?.trim() || null;
    if (cmd.decision !== 'CONFIRMA' && !texto) {
      throw new ReglaImagenError('INFORME_REQUERIDO', 422, cmd.decision === 'MODIFICA' ? 'Modificar el informe exige el texto corregido' : 'Descartar exige indicar el motivo');
    }
    const validadoEn = this.now();
    const versionModelo = imagen.resultado?.version_modelo ?? null;
    const huella = createHash('sha256')
      .update(JSON.stringify({ imagenId: imagen.id, hashSha256: imagen.hashSha256, decision: cmd.decision, texto, validadoPor: cmd.usuarioId, validadoEn, versionModelo }))
      .digest('hex');
    const informe: InformeValidado = { decision: cmd.decision, texto, validadoPor: cmd.usuarioId, medicoId: cmd.medicoId ?? null, validadoEn, huella, versionModelo };
    const validacion = cmd.decision === 'DESCARTA' ? 'DESCARTADO' : 'VALIDADO';
    if (!(await this.d.repo.validar(imagen.id, informe, validacion, validadoEn))) {
      throw new ReglaImagenError('YA_VALIDADO', 409, 'El informe de este estudio ya fue validado o descartado');
    }
    const guardada = (await this.d.repo.obtener(imagen.id)) ?? imagen;
    await this.publicarValidacion(guardada);
    return guardada;
  }

  private async publicarValidacion(i: Imagen): Promise<void> {
    try {
      await this.d.validaciones.publicar(i);
      await this.d.repo.marcarEventoPublicado(i.id);
    } catch (e) {
      this.d.log?.(`no se pudo publicar la validacion de ${i.id}: ${(e as Error).message}; queda pendiente y se reintenta`);
    }
  }

  async republicarValidaciones(): Promise<number> {
    const pendientes = await this.d.repo.conEventoPendiente(25);
    for (const i of pendientes) await this.publicarValidacion(i);
    return pendientes.length;
  }

  async urlTemporal(imagen: Imagen): Promise<{ url: string; expiraEn: string }> {
    const s = this.d.config.urlSegundos;
    return { url: await this.d.store.urlTemporal(imagen.bucket, imagen.objectKey, s), expiraEn: new Date(this.now() + s * 1000).toISOString() };
  }

  // --- respuestas de la inferencia (idempotentes: la transicion solo ocurre desde SUBIDA/ANALIZANDO) ---------

  async aplicarResultado(imagenId: string, r: Omit<ResultadoAnalisis, 'aviso'> & { aviso?: string }, gradcamKey?: string): Promise<boolean> {
    return this.d.repo.transicion(
      imagenId,
      ['SUBIDA', 'ANALIZANDO'],
      { estado: 'ANALIZADA', resultado: { ...r, aviso: r.aviso ?? AVISO_CLINICO }, ...(gradcamKey ? { gradcamKey } : {}) },
      this.now(),
    );
  }

  async aplicarFallo(imagenId: string, motivo: string): Promise<boolean> {
    return this.d.repo.transicion(imagenId, ['SUBIDA', 'ANALIZANDO'], { estado: 'FALLIDA', error: motivo }, this.now());
  }

  /** Barrido: reenvia el analisis de imagenes sin respuesta y marca FALLIDA las que agotaron los envios. */
  async reintentarAtascadas(): Promise<number> {
    const { analisisTimeoutMs, maxEnvios } = this.d.config;
    let n = await this.republicarValidaciones();
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
