<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  consultarTexto, consultarVoz, descargar, exportarReporte,
  type FormatoExportacion, type RespuestaAgente,
} from '../lib/api'
import { formatearCelda, opcionGrafico } from '../lib/graficos'
import { detectarEntorno, elegirEstrategia, ERRORES_WEB_SPEECH_RECUPERABLES, tipoGrabacion } from '../lib/voz'
import Grafico from './Grafico.vue'

const props = defineProps<{ token: () => string }>()

const texto = ref('')
const respuesta = ref<RespuestaAgente | null>(null)
const error = ref('')
const trabajando = ref(false)
const escuchando = ref(false)
const aviso = ref('')
const enLinea = ref(navigator.onLine)
const exportando = ref<FormatoExportacion | null>(null)

const entorno = ref(detectarEntorno())
const estrategia = computed(() => elegirEstrategia({ ...entorno.value, enLinea: enLinea.value }))
const opcion = computed(() => (respuesta.value?.reporte ? opcionGrafico(respuesta.value.reporte) : null))

const alConexion = () => { enLinea.value = navigator.onLine }
onMounted(() => { window.addEventListener('online', alConexion); window.addEventListener('offline', alConexion) })
onBeforeUnmount(() => { window.removeEventListener('online', alConexion); window.removeEventListener('offline', alConexion); detener() })

async function enviarTexto() {
  const t = texto.value.trim()
  if (t.length < 3) { error.value = 'Escribe al menos 3 caracteres.'; return }
  await ejecutar(() => consultarTexto(props.token(), t))
}

async function ejecutar(f: () => Promise<RespuestaAgente>) {
  trabajando.value = true
  error.value = ''
  try {
    const r = await f()
    respuesta.value = r
    if (r.transcripcion) texto.value = r.transcripcion.texto // el usuario puede corregirla y volver a consultar
  } catch (e) {
    respuesta.value = null
    error.value = e instanceof Error ? e.message : 'No se pudo completar la consulta.'
  } finally {
    trabajando.value = false
  }
}

// --- Voz -------------------------------------------------------------------------------------
let reconocimiento: { stop(): void; abort(): void } | null = null
let grabadora: MediaRecorder | null = null
let flujo: MediaStream | null = null
let temporizador: ReturnType<typeof setTimeout> | undefined

function detener() {
  clearTimeout(temporizador)
  reconocimiento?.stop()
  if (grabadora && grabadora.state !== 'inactive') grabadora.stop()
  flujo?.getTracks().forEach((t) => t.stop())
  escuchando.value = false
}

async function alternarMicrofono() {
  if (escuchando.value) { detener(); return }
  error.value = ''
  aviso.value = ''
  if (estrategia.value === 'web-speech') iniciarWebSpeech()
  else if (estrategia.value === 'whisper') await iniciarGrabacion()
  else error.value = 'Tu navegador no permite capturar voz. Escribe la consulta.'
}

function iniciarWebSpeech() {
  const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition!
  const r = new Ctor()
  r.lang = 'es-ES'
  r.interimResults = true
  r.continuous = false
  r.onresult = (e: any) => { texto.value = Array.from(e.results as ArrayLike<any>).map((x) => x[0].transcript).join(' ').trim() }
  r.onerror = async (e: { error: string }) => {
    escuchando.value = false
    if (ERRORES_WEB_SPEECH_RECUPERABLES.has(e.error) && entorno.value.grabadora) {
      aviso.value = 'El reconocimiento del navegador no está disponible; se usará la transcripción del servidor.'
      await iniciarGrabacion()
    } else if (e.error !== 'aborted' && e.error !== 'no-speech') error.value = `Error del micrófono: ${e.error}`
  }
  r.onend = () => { escuchando.value = false; if (texto.value.trim()) aviso.value = 'Revisa el texto reconocido y pulsa «Consultar».' }
  reconocimiento = r
  escuchando.value = true
  r.start()
}

async function iniciarGrabacion() {
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    error.value = 'No se pudo acceder al micrófono (permiso denegado).'
    return
  }
  const mimeType = tipoGrabacion((t) => MediaRecorder.isTypeSupported(t))
  const partes: Blob[] = []
  grabadora = new MediaRecorder(flujo, mimeType ? { mimeType } : undefined)
  grabadora.ondataavailable = (e) => { if (e.data.size) partes.push(e.data) }
  grabadora.onstop = async () => {
    flujo?.getTracks().forEach((t) => t.stop())
    escuchando.value = false
    if (!partes.length) return
    aviso.value = 'Transcribiendo en el servidor…'
    await ejecutar(() => consultarVoz(props.token(), new Blob(partes, { type: grabadora?.mimeType || 'audio/webm' })))
    aviso.value = respuesta.value ? 'Esto fue lo que entendí; si es incorrecto, edita el texto y vuelve a consultar.' : ''
  }
  grabadora.start()
  escuchando.value = true
  temporizador = setTimeout(detener, 30_000) // el servidor rechaza audios de mas de 60 s
}

// --- Exportacion -----------------------------------------------------------------------------
async function exportar(formato: FormatoExportacion) {
  if (!respuesta.value?.reporte) return
  exportando.value = formato
  error.value = ''
  try {
    const { blob, nombre } = await exportarReporte(props.token(), respuesta.value.reporte.especificacion, formato)
    descargar(blob, nombre)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo exportar el reporte.'
  } finally {
    exportando.value = null
  }
}
</script>

<template>
  <section aria-labelledby="t-asistente">
    <h2 id="t-asistente">Asistente de gestión</h2>
    <p class="nota">Apoyo a la gestión: consulta datos agregados de citas, ingresos, demanda y políticas. No accede a información clínica.</p>

    <form @submit.prevent="enviarTexto" class="consulta">
      <label for="consulta">Tu pregunta</label>
      <textarea id="consulta" v-model="texto" rows="2" maxlength="1000" placeholder="Ej.: ¿Cuántas citas hubo por especialidad en los últimos 3 meses? / Genera un reporte de ingresos por mes" />
      <div class="botones">
        <button type="submit" :disabled="trabajando || escuchando">{{ trabajando ? 'Consultando…' : 'Consultar' }}</button>
        <button type="button" :class="{ activo: escuchando }" :aria-pressed="escuchando" :disabled="trabajando || estrategia === 'ninguna'" @click="alternarMicrofono">
          {{ escuchando ? '⏹ Detener' : '🎤 Hablar' }}
        </button>
        <small class="modo" v-if="estrategia === 'web-speech'">Voz: reconocimiento del navegador (con conexión)</small>
        <small class="modo" v-else-if="estrategia === 'whisper'">Voz: se grabará el audio y se transcribirá en el servidor{{ enLinea ? '' : ' (sin conexión a internet)' }}</small>
        <small class="modo" v-else>Voz no disponible en este navegador</small>
      </div>
    </form>

    <p v-if="aviso" class="aviso" role="status">{{ aviso }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <article v-if="respuesta" class="respuesta" aria-live="polite">
      <p v-if="respuesta.transcripcion" class="transcripcion">
        <strong>Entendí:</strong> «{{ respuesta.transcripcion.texto }}» ({{ respuesta.transcripcion.duracionS }} s)
      </p>
      <p class="texto">{{ respuesta.respuesta }}</p>
      <p v-if="respuesta.incompleta" class="aviso">La respuesta está incompleta (se alcanzó un límite). Prueba con una pregunta más concreta.</p>

      <div class="herramientas" v-if="respuesta.herramientasUsadas.length">
        <span>Herramientas usadas:</span>
        <span v-for="(h, i) in respuesta.herramientasUsadas" :key="i" class="chip" :class="{ fallo: !h.ok }" :title="JSON.stringify(h.argumentos)">
          {{ h.nombre }} <small>{{ h.ok ? `${h.ms} ms` : 'rechazada/error' }}</small>
        </span>
      </div>
      <small class="proveedor">Modelo: {{ respuesta.proveedor }} / {{ respuesta.modelo }}</small>

      <div v-if="respuesta.reporte" class="reporte">
        <h3>{{ respuesta.reporte.titulo }}</h3>
        <p v-if="respuesta.reporte.sintetico" class="aviso">Incluye predicciones de un modelo entrenado con datos sintéticos (solo demostración).</p>
        <p v-if="respuesta.reporte.nota" class="nota">{{ respuesta.reporte.nota }}</p>
        <Grafico :opcion="opcion" :etiqueta="`Gráfico del reporte ${respuesta.reporte.titulo}`" />
        <div class="tabla-envoltorio">
          <table>
            <thead><tr><th v-for="c in respuesta.reporte.columnas" :key="c.clave" scope="col">{{ c.titulo }}</th></tr></thead>
            <tbody>
              <tr v-for="(f, i) in respuesta.reporte.filas" :key="i">
                <td v-for="c in respuesta.reporte.columnas" :key="c.clave" :class="{ num: c.tipo !== 'texto' && c.tipo !== 'fecha' }">{{ formatearCelda(f[c.clave] ?? null, c.tipo) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="botones">
          <span>Exportar:</span>
          <button v-for="f in (['xlsx', 'csv', 'pdf'] as const)" :key="f" type="button" :disabled="exportando !== null" @click="exportar(f)">
            {{ exportando === f ? 'Generando…' : f === 'xlsx' ? 'Excel' : f.toUpperCase() }}
          </button>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.nota { color: #555; font-size: 0.9rem; }
.consulta { display: flex; flex-direction: column; gap: 0.5rem; }
textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 0.5rem; }
.botones { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
button { padding: 0.45rem 0.9rem; cursor: pointer; }
button.activo { background: #b00020; color: #fff; }
.modo { color: #555; }
.aviso { background: #fff7e0; border-left: 4px solid #e0a800; padding: 0.4rem 0.75rem; }
.error { background: #fdecec; border-left: 4px solid #b00020; padding: 0.4rem 0.75rem; color: #8a1c1c; }
.respuesta { margin-top: 1rem; border: 1px solid #dde2ea; border-radius: 8px; padding: 0.75rem 1rem; }
.texto { white-space: pre-wrap; }
.transcripcion { color: #333; }
.herramientas { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
.chip { background: #e8f0fe; border-radius: 12px; padding: 0.1rem 0.6rem; font-size: 0.85rem; }
.chip.fallo { background: #fdecec; }
.proveedor { color: #777; }
.tabla-envoltorio { overflow-x: auto; margin: 0.5rem 0; }
table { border-collapse: collapse; min-width: 100%; }
th, td { border-bottom: 1px solid #e3e6ec; padding: 0.35rem 0.6rem; text-align: left; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
