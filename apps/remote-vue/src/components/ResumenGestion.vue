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
  <section aria-labelledby="t-resumen">
    <div class="cabecera">
      <h2 id="t-resumen">Resumen (últimos 90 días y próximos 30)</h2>
      <button type="button" @click="cargar" :disabled="cargando">{{ cargando ? 'Cargando…' : 'Actualizar' }}</button>
    </div>
    <ul v-if="errores.length" class="errores" role="alert">
      <li v-for="e in errores" :key="e">{{ e }}</li>
    </ul>
    <div class="tarjetas">
      <div class="tarjeta"><span>Citas</span><strong>{{ totalCitas }}</strong></div>
      <div class="tarjeta"><span>Confirmadas</span><strong>{{ confirmadas }}</strong></div>
      <div class="tarjeta"><span>Canceladas</span><strong>{{ canceladas }}</strong></div>
      <div v-if="puedeVerIngresos" class="tarjeta"><span>Ingresos (Bs)</span><strong>{{ totalIngresos.toLocaleString('es-BO', { minimumFractionDigits: 2 }) }}</strong></div>
    </div>
    <div class="graficos">
      <figure><figcaption>Citas por especialidad</figcaption><Grafico :opcion="graficoCitas" etiqueta="Gráfico de barras de citas por especialidad" /></figure>
      <figure v-if="puedeVerIngresos"><figcaption>Ingresos confirmados por mes</figcaption><Grafico :opcion="graficoIngresos" etiqueta="Gráfico de líneas de ingresos por mes" /></figure>
      <figure>
        <figcaption>Demanda semanal por especialidad <small v-if="demandaSintetica">(datos sintéticos de demostración)</small></figcaption>
        <Grafico :opcion="graficoDemanda" etiqueta="Gráfico de barras de la demanda por especialidad" />
      </figure>
    </div>
  </section>
</template>

<style scoped>
.cabecera { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin: 0.75rem 0; }
.tarjeta { background: #f4f6fa; border-radius: 8px; padding: 0.75rem; display: flex; flex-direction: column; }
.tarjeta span { color: #555; font-size: 0.85rem; }
.tarjeta strong { font-size: 1.5rem; }
.graficos { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
figure { margin: 0; }
figcaption { font-weight: 600; margin-bottom: 0.25rem; }
.errores { color: #8a1c1c; background: #fdecec; padding: 0.5rem 1.25rem; border-radius: 6px; }
</style>
