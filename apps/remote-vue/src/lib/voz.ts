/** Estrategias de captura de voz y cuando usar cada una. */
export type EstrategiaVoz = 'web-speech' | 'whisper' | 'ninguna'

export interface EntornoVoz {
  /** Hay SpeechRecognition / webkitSpeechRecognition en el navegador. */
  webSpeech: boolean
  /** Hay MediaRecorder y getUserMedia. */
  grabadora: boolean
  /** navigator.onLine. */
  enLinea: boolean
}

/**
 * Web Speech API cuando hay conexion (la mayoria de navegadores la envia a un servicio en la nube) y el navegador la soporta;
 * si no hay conexion o no la soporta, se graba el audio y se sube al endpoint de MS7 (Whisper, dentro de la red de la clinica).
 */
export function elegirEstrategia(e: EntornoVoz): EstrategiaVoz {
  if (e.webSpeech && e.enLinea) return 'web-speech'
  if (e.grabadora) return 'whisper'
  return 'ninguna'
}

/** Errores de Web Speech tras los cuales conviene reintentar con la grabadora + Whisper. */
export const ERRORES_WEB_SPEECH_RECUPERABLES = new Set(['network', 'service-not-allowed', 'language-not-supported'])

export function detectarEntorno(win: Window & typeof globalThis = window): EntornoVoz {
  const w = win as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
  return {
    webSpeech: !!(w.SpeechRecognition ?? w.webkitSpeechRecognition),
    grabadora: typeof win.MediaRecorder !== 'undefined' && !!win.navigator.mediaDevices?.getUserMedia,
    enLinea: win.navigator.onLine,
  }
}

/** Tipo MIME de grabacion que admite el navegador (webm/opus en Chrome y Firefox; mp4 en Safari). */
export function tipoGrabacion(soporta: (t: string) => boolean): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(soporta)
}
