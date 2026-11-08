<script setup lang="ts">
import type { ApolloClient } from '@apollo/client'
import { computed, onMounted, ref } from 'vue'
import { DEMANDA, RIESGO_INASISTENCIA } from '../lib/consultas'
import { ApiError } from '../lib/api'
import { usarLectura } from '../lib/usar'
import EstadoError from './EstadoError.vue'

const props = defineProps<{ cliente: ApolloClient }>()

interface Modelo { version: string; umbral: number; metricas: { precision: number; recall: number; f1: number; auc: number; prevalencia_inasistencia: number }; features: string[]; entrenadoEn: string; dataset: string; sintetico: boolean; importancias: { variable: string; importancia: number | null }[] }
interface CitaRiesgo { citaId: string; especialidad: string; fechaHora: string; riesgo: { probabilidad: number; riesgo: string; sintetico: boolean; versionModelo: string } | null }
interface Demanda { k: number; silueta: number; sintetico: boolean; especialidades: { especialidad: string; etiqueta: string; citasPorSemana: number }[] }

const modelo = usarLectura((api, signal) => api.get<Modelo>('/api/inteligencia/ml/modelo', { signal }))
const citas = ref<CitaRiesgo[]>([])
const demanda = ref<Demanda | null>(null)
const errCitas = ref<ApiError | null>(null)
const errDemanda = ref<ApiError | null>(null)
const cargando = ref(true)

async function graphql<T>(f: () => Promise<{ data?: T | null; error?: unknown }>, alFallar: (e: ApiError) => void): Promise<T | null> {
  try {
    const r = await f()
    if (r.error) throw r.error
    return r.data ?? null
  } catch (e) {
    alFallar(new ApiError(0, undefined, e instanceof Error ? e.message : 'No se pudo consultar'))
    return null
  }
}
async function cargar() {
  cargando.value = true
  modelo.recargar()
  const [r, d] = await Promise.all([
    graphql(() => props.cliente.query<{ riesgoInasistencia: CitaRiesgo[] }>({ query: RIESGO_INASISTENCIA, variables: { dias: 7, limite: 12 } }), (e) => (errCitas.value = e)),
    graphql(() => props.cliente.query<{ demandaEspecialidades: Demanda }>({ query: DEMANDA }), (e) => (errDemanda.value = e)),
  ])
  citas.value = (r?.riesgoInasistencia ?? []).filter((c) => c.riesgo).sort((a, b) => b.riesgo!.probabilidad - a.riesgo!.probabilidad)
  demanda.value = d?.demandaEspecialidades ?? null
  cargando.value = false
}
onMounted(cargar)

const tonoRiesgo = (r: string) => (r === 'ALTO' ? 'err' : r === 'MEDIO' ? 'warn' : 'ok')
const textoRiesgo = (c: CitaRiesgo) => `${c.riesgo!.riesgo === 'ALTO' ? 'Alto' : c.riesgo!.riesgo === 'MEDIO' ? 'Medio' : 'Bajo'} · ${Math.round(c.riesgo!.probabilidad * 100)} %`
const fecha = (iso: string) => new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const pct = (n: number) => `${(n * 100).toFixed(0)} %`
const importancias = computed(() => (modelo.datos.value?.importancias ?? []).filter((i) => typeof i.importancia === 'number'))
const segmentos = computed(() => {
  const g = new Map<string, { especialidad: string; citasPorSemana: number }[]>()
  for (const e of demanda.value?.especialidades ?? []) g.set(e.etiqueta, [...(g.get(e.etiqueta) ?? []), e])
  const total = (xs: { citasPorSemana: number }[]) => xs.reduce((s, x) => s + x.citasPorSemana, 0)
  return [...g.entries()].sort((a, b) => total(b[1]) - total(a[1])).map(([nombre, xs]) => ({ nombre, xs: xs.sort((a, b) => b.citasPorSemana - a.citasPorSemana), total: total(xs) }))
})
const maxCitas = computed(() => Math.max(1, ...(demanda.value?.especialidades ?? []).map((e) => e.citasPorSemana)))
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-ml">
    <div class="ph"><div><h1 id="t-ml" class="h1">Machine Learning</h1><p class="sub">Predicción de inasistencias y patrones de demanda para decisiones administrativas</p></div><span class="sp"></span>
      <span v-if="modelo.datos.value?.sintetico || demanda?.sintetico" class="chip warn" data-testid="sintetico">Datos sintéticos</span></div>
    <div class="g2">
      <div class="card col" style="gap: 14px">
        <div class="fx"><div class="ct">Riesgo de inasistencia · próximos 7 días</div><span class="sp"></span><span class="chip pri">Random Forest</span></div>
        <EstadoError v-if="errCitas" :error="errCitas" @reintentar="cargar" />
        <p v-else-if="cargando" class="muted" role="status">Calculando riesgo…</p>
        <p v-else-if="!citas.length" class="muted" data-testid="sin-citas">No hay citas próximas con riesgo calculado.</p>
        <div v-else class="scroll">
          <table class="tbl" style="min-width: 420px">
            <thead><tr><th>Cita</th><th>Fecha</th><th>Riesgo</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in citas" :key="c.citaId" data-testid="cita-riesgo">
                <td><div class="mono">{{ c.citaId.slice(0, 8) }}</div><div class="sm muted">{{ c.especialidad }}</div></td>
                <td>{{ fecha(c.fechaHora) }}</td>
                <td><span class="chip" :class="tonoRiesgo(c.riesgo!.riesgo)">{{ textoRiesgo(c) }}</span></td>
                <td class="tr"><a class="btn s" :href="`/clinica#/cita?id=${c.citaId}`">Ver cita</a></td>
              </tr>
            </tbody>
          </table>
        </div>
        <hr class="hr" />
        <div class="ct" style="font-size: 14px">Calidad del modelo</div>
        <EstadoError v-if="modelo.error.value" :error="modelo.error.value" @reintentar="modelo.recargar()" />
        <div v-else-if="modelo.datos.value" data-testid="modelo">
          <div class="li" style="padding: 4px 0"><span class="muted">Versión</span><span class="sp"></span><span class="mono">{{ modelo.datos.value.version }}</span></div>
          <div class="li" style="padding: 4px 0"><span class="muted">AUC</span><span class="sp"></span><span class="b">{{ modelo.datos.value.metricas.auc.toFixed(2) }}</span></div>
          <div class="li" style="padding: 4px 0"><span class="muted">Precisión / exhaustividad</span><span class="sp"></span><span class="b">{{ pct(modelo.datos.value.metricas.precision) }} / {{ pct(modelo.datos.value.metricas.recall) }}</span></div>
          <div class="li" style="padding: 4px 0"><span class="muted">Variables</span><span class="sp"></span><span>{{ modelo.datos.value.features.length }}</span></div>
        </div>
        <div v-for="v in importancias" :key="v.variable" class="fi"><span>{{ v.variable }}</span><i :style="{ width: `${Math.round((v.importancia ?? 0) * 100)}%` }"></i><span class="b">{{ pct(v.importancia ?? 0) }}</span></div>
        <div class="sm muted">No usa atributos clínicos para no favorecer ni discriminar a nadie. Resultado de apoyo.<template v-if="modelo.datos.value?.sintetico"> Este modelo se entrenó con datos sintéticos, no con el dataset real.</template></div>
      </div>

      <div class="card col" style="gap: 14px">
        <div class="fx"><div class="ct">Patrones de demanda</div><span class="sp"></span><span class="chip pri">K-means</span></div>
        <EstadoError v-if="errDemanda" :error="errDemanda" @reintentar="cargar" />
        <p v-else-if="cargando" class="muted" role="status">Calculando segmentos…</p>
        <template v-else-if="demanda">
          <div v-for="(s, i) in segmentos" :key="s.nombre" class="col" style="gap: 6px" data-testid="segmento">
            <div class="li" style="padding: 4px 0"><span class="chip pri">{{ i + 1 }}</span><div><div class="b">{{ s.nombre }}</div><div class="sm muted">{{ s.total.toFixed(0) }} citas por semana en total</div></div></div>
            <div v-for="e in s.xs" :key="e.especialidad" class="fi"><span>{{ e.especialidad }}</span><i :style="{ width: `${(e.citasPorSemana / maxCitas) * 100}%` }"></i><span class="b">{{ e.citasPorSemana.toFixed(0) }}</span></div>
          </div>
          <div class="sm muted">{{ demanda.k }} segmentos, silueta {{ demanda.silueta.toFixed(2) }}. Se agrupan las especialidades por su demanda semanal.<template v-if="demanda.sintetico"> Calculado con datos sintéticos declarados como tales.</template></div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fi { display: grid; grid-template-columns: minmax(120px, 190px) 1fr 44px; align-items: center; gap: 12px; }
.fi i { display: block; height: 12px; background: var(--pri); border-radius: 0 6px 6px 0; }
</style>
