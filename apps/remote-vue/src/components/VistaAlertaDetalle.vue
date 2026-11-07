<script setup lang="ts">
// Datos de ejemplo del diseno (ms7-alerta-detalle).
const meses = [{ m: 'Julio', v: 18, w: 53 }, { m: 'Agosto', v: 21, w: 62 }, { m: 'Septiembre', v: 24, w: 71 }, { m: 'Octubre', v: 34, w: 100 }]
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-ad">
    <div class="ph">
      <div><h1 id="t-ad" class="h1">Aumento de cancelaciones en Cardiología</h1><p class="sub">Detectada hoy 08:00 · sobre cifras agregadas de octubre</p></div>
      <span class="chip err">Alta</span><span class="sp"></span>
      <a class="btn" href="#/alertas">Volver</a><a class="btn pri" href="#/alertas">Marcar como atendida</a>
    </div>
    <div class="g2" style="align-items: start">
      <div class="card col" style="gap: 10px">
        <div class="ct">Por qué se generó</div>
        <div class="ink2">Las cancelaciones de Cardiología (34) son 42 % más que en septiembre.</div>
        <div class="col" style="gap: 10px"><div v-for="r in meses" :key="r.m" class="hb"><span>{{ r.m }}</span><i :style="{ width: r.w + '%' }"></i><span class="b">{{ r.v }}</span></div></div>
        <div class="sm muted">Datos de ejemplo. Solo cifras agregadas, sin pacientes.</div>
      </div>
      <div class="col" style="gap: 16px">
        <div class="card col" style="gap: 8px"><div class="ct">Acciones sugeridas</div><div class="li" style="padding: 8px 0">Revisar la disponibilidad de horarios del servicio</div><div class="li" style="padding: 8px 0">Reforzar el recordatorio previo a la cita</div></div>
        <div class="banner"><div><b>Es una sugerencia</b><span>La alerta no modifica agendas ni cobros; la decisión es de Dirección.</span></div></div>
      </div>
    </div>
  </section>
</template>
