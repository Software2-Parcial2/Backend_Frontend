<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  consultarTexto, consultarVoz, descargar, exportarReporte,
  type FormatoExportacion, type RespuestaAgente,
} from '../lib/api'
import { formatearCelda, opcionGrafico } from '../lib/graficos'
import { detectarEntorno, elegirEstrategia, ERRORES_WEB_SPEECH_RECUPERABLES, tipoGrabacion } from '../lib/voz'
import Grafico from './Grafico.vue'
import VistaVoz from './VistaVoz.vue'

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

function terminar() {
  const hablado = estrategia.value === 'web-speech'
  detener()
  // Con Web Speech el texto final llega en onend; con grabadora, onstop ya consulta al servidor.
  if (hablado) setTimeout(() => { if (texto.value.trim().length >= 3) void enviarTexto() }, 700)
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
  <VistaVoz v-if="escuchando" :texto="texto" @cancelar="detener" @terminar="terminar" />
  <section v-else aria-labelledby="t-asistente" class="col" style="gap: 20px">
    <div class="ph">
      <div><h1 id="t-asistente" class="h1">Asistente de reportes</h1><p class="sub">Pida un reporte escribiendo o hablando. Consulta datos agregados de citas, ingresos, demanda y políticas; no accede a información clínica.</p></div>
      <span class="sp"></span>
      <span v-if="!enLinea" class="chip warn">Sin conexión a internet</span>
      <span v-else class="chip warn">Requiere conexión</span>
    </div>

    <div class="card">
      <form @submit.prevent="enviarTexto" class="col" style="gap: 12px">
        <div class="field">
          <label for="consulta">Tu pregunta</label>
          <textarea id="consulta" class="in" v-model="texto" rows="2" maxlength="1000" placeholder="Ej.: ¿Cuántas citas hubo por especialidad en los últimos 3 meses? / Genera un reporte de ingresos por mes" />
        </div>
        <div class="fx wrap" style="gap: 8px">
          <button type="submit" class="btn pri" :disabled="trabajando || escuchando">{{ trabajando ? 'Consultando…' : 'Consultar' }}</button>
          <button type="button" class="btn" :class="{ dng: escuchando }" :aria-pressed="escuchando" :disabled="trabajando || estrategia === 'ninguna'" @click="alternarMicrofono">
            <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
            {{ escuchando ? 'Detener' : 'Hablar' }}
          </button>
          <span class="sm muted" v-if="estrategia === 'web-speech'">Voz: reconocimiento del navegador (con conexión)</span>
          <span class="sm muted" v-else-if="estrategia === 'whisper'">Voz: se grabará el audio y se transcribirá en el servidor{{ enLinea ? '' : ' (sin conexión a internet)' }}</span>
          <span class="sm muted" v-else>Voz no disponible en este navegador</span>
        </div>
        <div class="sm muted">El agente solo recibe cifras agregadas, nunca nombres ni identificadores de pacientes. <a href="#/asistente/voz">Ver pantalla de dictado de ejemplo</a></div>
      </form>
    </div>

    <div v-if="aviso" class="banner" role="status"><div><span>{{ aviso }}</span></div></div>
    <div v-if="error" class="banner err" role="alert"><div><b>No se pudo completar</b><span>{{ error }}</span></div></div>

    <article v-if="respuesta" class="col" style="gap: 16px" aria-live="polite">
      <div class="card col" style="gap: 12px">
        <div v-if="respuesta.transcripcion" class="msg me">{{ respuesta.transcripcion.texto }}</div>
        <div v-if="respuesta.transcripcion" class="sm muted tr">Dictado por voz · {{ respuesta.transcripcion.duracionS }} s</div>
        <div class="msg" style="max-width: 100%; white-space: pre-wrap">{{ respuesta.respuesta }}</div>
        <div v-if="respuesta.incompleta" class="banner warn"><div><span>La respuesta está incompleta (se alcanzó un límite). Prueba con una pregunta más concreta.</span></div></div>
        <div class="fx wrap" style="gap: 6px" v-if="respuesta.herramientasUsadas.length">
          <span class="sm muted">Herramientas usadas:</span>
          <span v-for="(h, i) in respuesta.herramientasUsadas" :key="i" class="chip" :class="h.ok ? 'pri' : 'err'" :title="JSON.stringify(h.argumentos)">
            {{ h.nombre }} <span class="sm">{{ h.ok ? `${h.ms} ms` : 'rechazada/error' }}</span>
          </span>
        </div>
        <span class="sm muted">Modelo: {{ respuesta.proveedor }} / {{ respuesta.modelo }}</span>
      </div>

      <div v-if="respuesta.reporte" class="card col" style="gap: 14px">
        <div class="fx wrap">
          <div><div class="ct">{{ respuesta.reporte.titulo }}</div><a class="sm" href="#/asistente/pdf">Ver ejemplo de PDF exportado</a><div v-if="respuesta.reporte.nota" class="sm muted">{{ respuesta.reporte.nota }}</div></div>
          <span class="sp"></span>
          <button v-for="f in (['xlsx', 'csv', 'pdf'] as const)" :key="f" type="button" class="btn s" :class="{ pri: f === 'pdf' }" :disabled="exportando !== null" @click="exportar(f)">
            {{ exportando === f ? 'Generando…' : f === 'xlsx' ? 'Excel' : f.toUpperCase() }}
          </button>
        </div>
        <div v-if="respuesta.reporte.sintetico" class="banner warn"><div><span>Incluye predicciones de un modelo entrenado con datos sintéticos (solo demostración).</span></div></div>
        <Grafico :opcion="opcion" :etiqueta="`Gráfico del reporte ${respuesta.reporte.titulo}`" />
        <div class="scroll">
          <table class="tbl" style="min-width: 420px">
            <thead><tr><th v-for="c in respuesta.reporte.columnas" :key="c.clave" scope="col">{{ c.titulo }}</th></tr></thead>
            <tbody>
              <tr v-for="(f, i) in respuesta.reporte.filas" :key="i">
                <td v-for="c in respuesta.reporte.columnas" :key="c.clave" :class="{ tr: c.tipo !== 'texto' && c.tipo !== 'fecha' }">{{ formatearCelda(f[c.clave] ?? null, c.tipo) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </article>
  </section>
</template>
