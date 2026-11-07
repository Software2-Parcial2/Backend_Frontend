<script setup lang="ts">
// Vista previa del PDF exportado (ms7-reporte-pdf). El PDF real lo genera MS7 (boton «PDF» del asistente).
const imprimir = () => window.print()
const filas = [['Cardiología', 100, 34], ['Medicina general', 91, 31], ['Pediatría', 65, 22], ['Neumología', 47, 16], ['Traumatología', 32, 11]] as const
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-pdf">
    <div class="ph"><div><h1 id="t-pdf" class="h1">Reporte exportado</h1><p class="sub">Así se ve el archivo PDF descargado</p></div><span class="sp"></span><a class="btn" href="#/asistente">Volver al asistente</a><button type="button" class="btn pri" @click="imprimir">Imprimir / guardar PDF</button></div>
    <div class="card col" style="gap: 16px; max-width: 800px; padding: 36px; background: #fff">
      <div class="fx"><div><div class="b" style="font-size: 18px">Clínica Médica Santa Cruz</div><div class="sm muted">Reporte de gestión · generado por el asistente</div></div><span class="sp"></span><div class="sm muted" style="text-align: right">3 nov 2026<br />Dirección médica</div></div>
      <div><h2 style="font-size: 20px; font-weight: 650">Cancelaciones e ingresos por especialidad</h2><div class="sm muted">Período: octubre 2026</div></div>
      <div class="col" style="gap: 10px"><div v-for="f in filas" :key="f[0]" class="hb"><span>{{ f[0] }}</span><i :style="{ width: f[1] + '%' }"></i><span class="b">{{ f[2] }}</span></div></div>
      <div><div class="b">Resumen</div><div class="ink2" style="margin-top: 4px">Cardiología y Medicina general concentraron más de la mitad de las cancelaciones de octubre.</div></div>
      <div class="sm muted" style="border-top: 1px solid var(--bd); padding-top: 10px">Datos de ejemplo. Solo cifras agregadas, sin datos de pacientes. Especificación validada contra métricas y dimensiones permitidas.</div>
    </div>
  </section>
</template>
