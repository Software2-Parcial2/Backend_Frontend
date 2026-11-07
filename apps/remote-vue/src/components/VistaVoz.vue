<script setup lang="ts">
// Pantalla de dictado (ms7-voz). La usa PanelAgente mientras escucha y la ruta #/asistente/voz como vista de ejemplo.
defineProps<{ texto?: string; demo?: boolean }>()
defineEmits<{ cancelar: []; terminar: [] }>()
const pasos = [
  { n: '1 · Dictado', d: 'En curso', hecho: true },
  { n: '2 · Especificación del reporte', d: 'El agente la traduce a una estructura con métrica, dimensión y período' },
  { n: '3 · Validación', d: 'Se comprueba contra una lista cerrada, sin SQL libre' },
  { n: '4 · Datos y gráficos', d: 'Con un resumen sustentado en lo recuperado' },
  { n: '5 · Exportar', d: 'Excel, CSV o PDF' },
]
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-voz">
    <div class="ph"><div><h1 id="t-voz" class="h1">Dictado por voz</h1><p class="sub">Hable con naturalidad; el reporte se arma cuando termine</p></div><span class="sp"></span><span class="chip warn">Requiere conexión</span></div>
    <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: stretch">
      <div class="card col" style="flex: 999 1 460px; min-width: 0; gap: 22px; align-items: center; justify-content: center; padding: 40px 24px; text-align: center">
        <div class="mic" aria-hidden="true"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg></div>
        <div class="b" style="font-size: 18px" role="status">Escuchando…</div>
        <p style="font-size: 20px; line-height: 1.5; max-width: 520px" aria-live="polite">{{ texto || (demo ? '¿Cuáles fueron las especialidades con más cancelaciones el mes pasado y cómo se comportaron los ingresos?' : 'Diga su pregunta…') }}</p>
        <div class="fx"><button type="button" class="btn" @click="$emit('cancelar')">Cancelar</button><button type="button" class="btn pri" style="height: 46px" @click="$emit('terminar')">Terminar y generar reporte</button></div>
        <div class="sm muted" style="max-width: 460px">Se transcribe con el reconocimiento de voz del navegador. Si no está disponible o falla, se graba el audio y el servidor lo transcribe.</div>
      </div>
      <div class="card col" style="flex: 1 1 300px; max-width: 360px; gap: 4px">
        <div class="ct" style="margin-bottom: 8px">Cómo se arma el reporte</div>
        <div class="tl">
          <div v-for="p in pasos" :key="p.n" class="tli"><span class="dot" :class="{ mute: !p.hecho }"></span><div><div class="b">{{ p.n }}</div><div class="sm muted">{{ p.d }}</div></div></div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mic { width: 88px; height: 88px; border-radius: 50%; background: var(--pri); color: #fff; display: grid; place-items: center; box-shadow: 0 0 0 12px var(--pri-t), 0 0 0 26px #EFF7F8; }
</style>
