<script setup lang="ts">
// Datos de ejemplo del diseno (ms7-politicas). El RAG real (pgvector) lo expone el asistente de reportes.
const docs = ['Tarifario', 'Reglamento de cancelaciones', 'Políticas internas']
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-po">
    <div class="ph"><div><h1 id="t-po" class="h1">Consulta de políticas internas</h1><p class="sub">Pregunte sobre el tarifario, el reglamento de cancelaciones y las políticas de la clínica</p></div></div>
    <div class="card fx wrap" style="gap: 10px">
      <label class="search" style="flex: 1 1 400px"><input type="text" value="¿Cuál es el plazo para cancelar una cita sin cargo?" aria-label="Pregunta sobre políticas" /></label>
      <button type="button" class="btn pri">Consultar</button>
    </div>
    <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start">
      <div class="col" style="flex: 999 1 520px; min-width: 0; gap: 16px">
        <div class="card col" style="gap: 10px">
          <div class="ct">Respuesta</div>
          <p style="font-size: 15px; line-height: 1.6">Según el reglamento de cancelaciones, una cita puede cancelarse sin cargo hasta [PLAZO EN HORAS] antes de su hora. Pasado ese plazo se aplica [REGLA DEL REGLAMENTO].</p>
          <div class="sm muted">Los valores entre corchetes se completan cuando se redacten los documentos del reglamento.</div>
        </div>
        <div class="card col" style="gap: 10px">
          <div class="ct">Fuentes citadas</div>
          <div class="card col" style="gap: 4px; padding: 14px; background: var(--bg)"><div class="b">Reglamento de cancelaciones · sección [N]</div><div class="ink2">[Fragmento del reglamento que respalda la respuesta]</div></div>
          <div class="card col" style="gap: 4px; padding: 14px; background: var(--bg)"><div class="b">Políticas internas · sección [N]</div><div class="ink2">[Fragmento relacionado]</div></div>
        </div>
      </div>
      <div class="card col" style="flex: 1 1 300px; max-width: 380px; gap: 12px">
        <div class="ct">Documentos indexados</div>
        <div v-for="d in docs" :key="d" class="li" style="padding: 8px 0"><div><div class="b">{{ d }}</div><div class="sm muted">Fragmentos en pgvector</div></div><span class="sp"></span><span class="chip ok">Indexado</span></div>
        <div class="banner"><div><b>Sin historias clínicas</b><span>Por privacidad y riesgo de respuestas incorrectas, esta búsqueda no incluye información clínica.</span></div></div>
      </div>
    </div>
  </section>
</template>
