export interface Paciente { id: string; numeroHistoria: string; nombre: string; documento: string; fechaNacimiento: string; edad: number; telefono: string | null; email: string | null; direccion: string | null }
export interface Cita { citaId: string; estado: string; pacienteId: string; medicoId: string; especialidad: string; fechaHora: string; facturaId?: string | null; motivoFallo?: string | null }
export interface Medico { id: string; nombre: string; especialidad: { codigo: string; nombre: string }; consultorio: string | null }
export interface Especialidad { id: string; codigo: string; nombre: string; activa: boolean }
export interface Franja { fechaHora: string; estado: string }
export interface Contacto { id: string; nombre: string; parentesco: string; telefono: string }
export interface SolicitudDato { id: string; campo: 'TELEFONO' | 'EMAIL' | 'DIRECCION'; valorPropuesto: string; estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; motivoRechazo: string | null; solicitadaEn: string }
export interface Estudio { id: string; estudio: string; validacion: string; creadaEn: string; informe: { decision: string; texto: string; validadoEn: string } | null; aviso: string }
export interface Preferencias { pacienteId: string; canales: ('EMAIL' | 'TELEGRAM')[]; email: string | null; telegramVinculado: boolean; tiposAviso: string[]; antelacionHoras: number }
export interface Aviso { id: string; tipo: string; estado: string; creadaEn: string; leida: boolean; canales: string[] }
export interface Factura { id: string; monto: string; moneda: string; estado: string }
