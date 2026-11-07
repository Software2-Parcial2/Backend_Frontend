<script setup lang="ts">
import type { ApolloClient } from '@apollo/client'
import { computed, onMounted, ref } from 'vue'
import { opcionGrafico } from '../lib/graficos'
import { DEMANDA, INGRESOS, RESUMEN_CITAS, rangoDias } from '../lib/consultas'
import Grafico from './Grafico.vue'

const props = defineProps<{ cliente: ApolloClient; roles: string[] }>()

interface Grupo { clave: string; total: number; confirmadas: number; canceladas: number }
const cargando = ref(true)
const errores = ref<string[]>([])
const grupos = ref<Grupo[]>([])
const totalCitas = ref(0)
const ingresos = ref<{ periodo: string; confirmado: number; provisional: number }[]>([])
const demanda = ref<{ especialidad: string; etiqueta: string; citasPorSemana: number }[]>([])
const demandaSintetica = ref(false)

const puedeVerIngresos = computed(() => props.roles.some((r) => ['administrador', 'caja'].includes(r)))
const confirmadas = computed(() => grupos.value.reduce((s, g) => s + g.confirmadas, 0))
const canceladas = computed(() => grupos.value.reduce((s, g) => s + g.canceladas, 0))
const totalIngresos = computed(() => ingresos.value.reduce((s, i) => s + i.confirmado, 0))

const col = (clave: string, titulo: string) => ({ clave, titulo, tipo: 'numero' as const })
const graficoCitas = computed(() => opcionGrafico({ filas: grupos.value.map((g) => ({ ...g })), columnas: [col('total', 'Citas')], grafico: { tipo: 'barras', x: 'clave', y: 'total' } }))
const graficoIngresos = computed(() => opcionGrafico({ filas: ingresos.value.map((i) => ({ ...i })), columnas: [col('confirmado', 'Confirmado (Bs)')], grafico: { tipo: 'lineas', x: 'periodo', y: 'confirmado' } }))
const graficoDemanda = computed(() => opcionGrafico({ filas: demanda.value.map((d) => ({ ...d })), columnas: [col('citasPorSemana', 'Citas por semana')], grafico: { tipo: 'barras', x: 'especialidad', y: 'citasPorSemana' } }))

// Cada consulta falla por separado: un servicio caido no oculta el resto del panel.
async function consultar<T>(nombre: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f()
  } catch (e) {
    errores.value.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

async function cargar() {
  cargando.value = true
  errores.value = []
  const { desde, hasta } = rangoDias(90)
  const [r, i, d] = await Promise.all([
    consultar('Citas', () => props.cliente.query<{ resumenCitas: { total: number; grupos: Grupo[] } }>({ query: RESUMEN_CITAS, variables: { desde, hasta } })),
    puedeVerIngresos.value
      ? consultar('Ingresos', () => props.cliente.query<{ ingresos: typeof ingresos.value }>({ query: INGRESOS, variables: { desde, hasta } }))
      : Promise.resolve(null),
    consultar('Demanda', () => props.cliente.query<{ demandaEspecialidades: { sintetico: boolean; especialidades: typeof demanda.value } }>({ query: DEMANDA })),
  ])
  grupos.value = r?.data?.resumenCitas.grupos ?? []
  totalCitas.value = r?.data?.resumenCitas.total ?? 0
  ingresos.value = i?.data?.ingresos ?? []
  demanda.value = d?.data?.demandaEspecialidades.especialidades ?? []
  demandaSintetica.value = d?.data?.demandaEspecialidades.sintetico ?? false
  cargando.value = false
}
onMounted(cargar)
defineExpose({ cargar })
</script>

<template>
  <section aria-labelledby="t-resumen" class="col" style="gap: 20px">
    <div class="ph">
      <div><h1 id="t-resumen" class="h1">Dashboard empresarial</h1><p class="sub">Indicadores consolidados desde citas, caja y atención (últimos 90 días y próximos 30)</p></div>
      <span class="sp"></span>
      <span v-if="demandaSintetica" class="chip warn">Datos sintéticos de demostración</span>
      <button type="button" class="btn" @click="cargar" :disabled="cargando">{{ cargando ? 'Cargando…' : 'Actualizar' }}</button>
    </div>
    <div v-if="errores.length" class="banner err" role="alert">
      <div><b>Algunos indicadores no se pudieron cargar</b><span v-for="e in errores" :key="e" style="display: block">{{ e }}</span></div>
    </div>
    <div class="g4">
      <div class="card kpi"><span class="l">Citas</span><span class="v">{{ totalCitas }}</span></div>
      <div class="card kpi"><span class="l">Confirmadas</span><span class="v">{{ confirmadas }}</span></div>
      <div class="card kpi"><span class="l">Canceladas</span><span class="v">{{ canceladas }}</span></div>
      <div v-if="puedeVerIngresos" class="card kpi"><span class="l">Ingresos (Bs)</span><span class="v">{{ totalIngresos.toLocaleString('es-BO', { minimumFractionDigits: 2 }) }}</span></div>
    </div>
    <div class="g2">
      <div class="card"><div class="ch"><div class="ct">Citas por especialidad</div></div><Grafico :opcion="graficoCitas" etiqueta="Gráfico de barras de citas por especialidad" /></div>
      <div v-if="puedeVerIngresos" class="card"><div class="ch"><div class="ct">Ingresos confirmados por mes</div></div><Grafico :opcion="graficoIngresos" etiqueta="Gráfico de líneas de ingresos por mes" /></div>
      <div class="card">
        <div class="ch"><div class="ct">Demanda semanal por especialidad</div><span class="sp"></span><span v-if="demandaSintetica" class="sm muted">datos sintéticos</span></div>
        <Grafico :opcion="graficoDemanda" etiqueta="Gráfico de barras de la demanda por especialidad" />
      </div>
    </div>
    <div class="card fx wrap" style="gap: 14px">
      <div><div class="ct">Siguiente paso</div><p class="ink2">Pida un reporte en lenguaje natural, por texto o por voz.</p></div>
      <span class="sp"></span>
      <a class="btn" href="#/ml">Ver Machine Learning</a>
      <a class="btn pri" href="#/asistente">Abrir asistente de reportes</a>
    </div>
  </section>
</template>
