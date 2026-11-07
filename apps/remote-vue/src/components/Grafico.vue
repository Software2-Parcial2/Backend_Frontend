<script setup lang="ts">
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{ opcion: Record<string, unknown> | null; alto?: number; etiqueta: string }>()
const el = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null

function pintar() {
  if (!props.opcion || !el.value) {
    // El contenedor solo existe con datos: si desaparece, hay que liberar la instancia (apuntaria a un nodo desmontado).
    if (!el.value) { chart?.dispose(); chart = null }
    return
  }
  if (chart && chart.getDom() !== el.value) { chart.dispose(); chart = null }
  chart ??= echarts.init(el.value)
  chart.setOption(props.opcion as echarts.EChartsCoreOption, true)
}

onMounted(() => {
  observer = new ResizeObserver(() => chart?.resize())
})
// 'post': el contenedor (v-if) ya esta en el DOM cuando llegan los datos; se observa tambien el propio elemento.
watch([() => props.opcion, el], () => {
  pintar()
  if (el.value) observer?.observe(el.value)
}, { deep: true, flush: 'post', immediate: false })
onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div v-if="opcion" ref="el" role="img" :aria-label="etiqueta" :style="{ width: '100%', height: `${alto ?? 280}px` }" />
  <p v-else class="vacio">Sin datos para graficar.</p>
</template>

<style scoped>
.vacio { color: var(--ink3); font-size: 12.5px; }
</style>
