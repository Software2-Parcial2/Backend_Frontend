<script setup lang="ts">
import { reactive } from 'vue'
// Datos de ejemplo del diseno (ms7-alertas).
const alertas = [
  { tono: 'err', nivel: 'Alta', t: 'Aumento de cancelaciones en Cardiología', d: '34 cancelaciones en octubre, 42 % más que en septiembre.', m: 'Hoy 08:00 · Agente de cancelaciones', a: 'Ver detalle', href: '#/alertas/detalle' },
  { tono: 'warn', nivel: 'Media', t: 'Inasistencias previstas altas para mañana', d: '6 citas con riesgo alto de inasistencia el miércoles 4 de noviembre.', m: 'Ayer 18:00 · Agente de inasistencias', a: 'Ver citas' },
  { tono: 'warn', nivel: 'Media', t: 'Ocupación baja las tardes de viernes', d: 'Menos del 30 % de los turnos ocupados en tres semanas seguidas.', m: 'Lun 2 nov · Agente de demanda', a: 'Ver patrones' },
  { tono: '', nivel: 'Revisada', t: 'Ingresos de la semana sin variación', d: '', m: 'Vie 30 oct · Agente de ingresos', a: '' },
]
const agentes = reactive([
  { n: 'Cancelaciones por especialidad', f: 'Cada hora · tarea programada', on: true },
  { n: 'Inasistencias previstas', f: 'Diario a las 18:00', on: true },
  { n: 'Demanda por horario', f: 'Semanal, lunes', on: true },
  { n: 'Caída de ingresos', f: 'Semanal, viernes', on: false },
])
const telegram = reactive({ on: true })
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-al">
    <div class="ph"><div><h1 id="t-al" class="h1">Alertas y monitoreo</h1><p class="sub">El agente revisa los indicadores y avisa cuando algo se sale de lo normal</p></div><span class="sp"></span><span class="chip warn">Datos de ejemplo</span></div>
    <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start">
      <div class="card flush" style="flex: 999 1 520px; min-width: 0">
        <div class="ch"><div class="ct">Alertas recientes</div><span class="sp"></span><div class="seg"><button type="button" class="on">Nuevas</button><button type="button">Revisadas</button></div></div>
        <div style="padding: 0 18px 8px">
          <div v-for="a in alertas" :key="a.t" class="li" style="align-items: flex-start">
            <span class="chip" :class="a.tono">{{ a.nivel }}</span>
            <div style="flex: 1"><div class="b">{{ a.t }}</div><div v-if="a.d" class="ink2">{{ a.d }}</div><div class="sm muted">{{ a.m }}</div></div>
            <a v-if="a.a" class="btn s" :href="a.href ?? (a.a === 'Ver citas' ? '#/ml' : '#/ml')">{{ a.a }}</a>
          </div>
        </div>
      </div>
      <div class="card col" style="flex: 1 1 320px; max-width: 400px; gap: 14px">
        <div class="ct">Agentes de monitoreo</div>
        <div v-for="g in agentes" :key="g.n" class="li" style="padding: 6px 0">
          <div><div class="b">{{ g.n }}</div><div class="sm muted">{{ g.f }}</div></div><span class="sp"></span>
          <button type="button" class="sw" :class="{ on: g.on }" role="switch" :aria-checked="g.on" :aria-label="g.n" @click="g.on = !g.on"></button>
        </div>
        <hr class="hr" />
        <div class="fx"><div><div class="b">Aviso al personal por Telegram</div><div class="sm muted">Solo alertas internas, sin datos de pacientes</div></div><span class="sp"></span>
          <button type="button" class="sw" :class="{ on: telegram.on }" role="switch" :aria-checked="telegram.on" aria-label="Aviso al personal por Telegram" @click="telegram.on = !telegram.on"></button></div>
      </div>
    </div>
  </section>
</template>
