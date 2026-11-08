<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usarAccion, usarLectura } from '../lib/usar'
import EstadoError from './EstadoError.vue'

const props = defineProps<{ id: string; roles: string[] }>()

interface Alerta { id: string; agenteId: string; nivel: 'ALTO' | 'MEDIO' | 'BAJO'; estado: 'ABIERTA' | 'ATENDIDA'; titulo: string; detalle: string; datos: Record<string, unknown>; creadaEn: string; atendidaEn: string | null; atendidaPor: string | null; nota: string | null }

const alerta = usarLectura((api, signal) => api.get<Alerta>(`/api/inteligencia/alertas/${props.id}`, { signal }))
const nota = ref('')
const atender = usarAccion((api) => api.post<Alerta>(`/api/inteligencia/alertas/${props.id}/atender`, { nota: nota.value.trim() || undefined }))
const puedeAtender = computed(() => props.roles.some((r) => r === 'administrador' || r === 'recepcion'))
onMounted(() => alerta.recargar())

const SUGERENCIAS: Record<string, string[]> = {
  cancelaciones: ['Revisar el motivo de las cancelaciones y la disponibilidad de horarios', 'Reforzar el recordatorio previo a la cita'],
  inasistencias: ['Reforzar el aviso a las citas de riesgo alto', 'Confirmar por teléfono las citas del día siguiente'],
  demanda: ['Revisar la plantilla de horarios de las especialidades con más demanda', 'Considerar turnos adicionales'],
  ingresos: ['Revisar cargos por cobrar y anulaciones recientes', 'Comparar con la agenda de la semana'],
}
const etiquetas: Record<string, string> = { tasa: 'Tasa', desde: 'Desde', hasta: 'Hasta', total: 'Total de citas', umbral: 'Umbral', parcial: 'Datos parciales', canceladas: 'Canceladas' }
const filas = computed(() => Object.entries(alerta.datos.value?.datos ?? {}).map(([k, v]) => [etiquetas[k] ?? k, typeof v === 'number' && k.match(/tasa|umbral/) ? `${(v * 100).toFixed(0)} %` : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v)]))
const nivel = (n: string) => (n === 'ALTO' ? { t: 'Alta', tono: 'err' } : n === 'MEDIO' ? { t: 'Media', tono: 'warn' } : { t: 'Baja', tono: '' })
const cuando = (iso: string) => new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
async function marcar() { if (await atender.ejecutar()) alerta.recargar() }
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-ad">
    <EstadoError v-if="alerta.error.value" :error="alerta.error.value" @reintentar="alerta.recargar()" />
    <p v-else-if="!alerta.datos.value" class="muted" role="status">Cargando la alerta…</p>
    <template v-else>
      <div class="ph">
        <div><h1 id="t-ad" class="h1">{{ alerta.datos.value.titulo }}</h1><p class="sub">Detectada {{ cuando(alerta.datos.value.creadaEn) }} · agente {{ alerta.datos.value.agenteId }}</p></div>
        <span class="chip" :class="nivel(alerta.datos.value.nivel).tono">{{ nivel(alerta.datos.value.nivel).t }}</span>
        <span class="chip" :class="alerta.datos.value.estado === 'ATENDIDA' ? 'ok' : 'warn'" data-testid="estado-alerta">{{ alerta.datos.value.estado === 'ATENDIDA' ? 'Atendida' : 'Abierta' }}</span><span class="sp"></span>
        <a class="btn" href="#/alertas">Volver</a>
      </div>
      <div class="g2" style="align-items: start">
        <div class="card col" style="gap: 10px">
          <div class="ct">Por qué se generó</div>
          <div class="ink2">{{ alerta.datos.value.detalle }}</div>
          <div class="col" style="gap: 6px"><div v-for="[k, v] in filas" :key="k" class="li" style="padding: 4px 0"><span class="muted">{{ k }}</span><span class="sp"></span><span class="b">{{ v }}</span></div></div>
          <div class="sm muted">Solo cifras agregadas, sin pacientes.</div>
        </div>
        <div class="col" style="gap: 16px">
          <div class="card col" style="gap: 8px"><div class="ct">Acciones sugeridas</div><div v-for="s in SUGERENCIAS[alerta.datos.value.agenteId] ?? []" :key="s" class="li" style="padding: 8px 0">{{ s }}</div></div>
          <div v-if="alerta.datos.value.estado === 'ATENDIDA'" class="card col" style="gap: 6px" data-testid="atendida">
            <div class="ct">Atendida</div><div class="sm muted">{{ alerta.datos.value.atendidaEn ? cuando(alerta.datos.value.atendidaEn) : '' }}</div><div v-if="alerta.datos.value.nota" class="ink2">{{ alerta.datos.value.nota }}</div>
          </div>
          <div v-else-if="puedeAtender" class="card col" style="gap: 10px">
            <div class="ct">Marcar como atendida</div>
            <div class="field"><label for="nota">Nota (opcional)</label><textarea id="nota" v-model="nota" class="in" rows="2" maxlength="500"></textarea></div>
            <EstadoError v-if="atender.error.value" :error="atender.error.value" :reintentable="false" />
            <button type="button" class="btn pri" data-testid="atender" :disabled="atender.enCurso.value" @click="marcar">Marcar como atendida</button>
          </div>
          <div class="banner"><div><b>Es una sugerencia</b><span>La alerta no modifica agendas ni cobros; la decisión es de Dirección.</span></div></div>
        </div>
      </div>
    </template>
  </section>
</template>
