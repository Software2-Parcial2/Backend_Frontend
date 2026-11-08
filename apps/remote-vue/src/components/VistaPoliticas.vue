<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { RespuestaAgente } from '../lib/api'
import { usarAccion, usarLectura } from '../lib/usar'
import EstadoError from './EstadoError.vue'

const pregunta = ref('')
const estado = usarLectura((api, signal) => api.get<{ documentos: number; fragmentos: number }>('/api/inteligencia/rag/estado', { signal }))
const consultar = usarAccion((api) => api.post<RespuestaAgente>('/api/inteligencia/agente/consulta', { texto: pregunta.value.trim() }, { clave: false }))
const resultado = ref<RespuestaAgente | null>(null)
onMounted(() => estado.recargar())

async function enviar() {
  if (!pregunta.value.trim()) return
  resultado.value = (await consultar.ejecutar()) ?? null
}
const usoPoliticas = () => resultado.value?.herramientasUsadas.some((h) => h.nombre === 'consultar_politicas') ?? false
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-po">
    <div class="ph"><div><h1 id="t-po" class="h1">Consulta de políticas internas</h1><p class="sub">Pregunte sobre el tarifario, el reglamento de cancelaciones y las políticas de la clínica</p></div></div>
    <form class="card fx wrap" style="gap: 10px" @submit.prevent="enviar">
      <label class="search" style="flex: 1 1 400px"><input v-model="pregunta" type="text" placeholder="¿Cuál es el plazo para cancelar una cita sin cargo?" aria-label="Pregunta sobre políticas" maxlength="300" /></label>
      <button type="submit" class="btn pri" data-testid="consultar" :disabled="consultar.enCurso.value || !pregunta.trim()">{{ consultar.enCurso.value ? 'Consultando…' : 'Consultar' }}</button>
    </form>
    <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start">
      <div class="col" style="flex: 999 1 520px; min-width: 0; gap: 16px">
        <EstadoError v-if="consultar.error.value" :error="consultar.error.value" :reintentable="false" />
        <div v-if="resultado" class="card col" style="gap: 10px">
          <div class="ct">Respuesta</div>
          <p style="font-size: 15px; line-height: 1.6; white-space: pre-line" data-testid="respuesta">{{ resultado.respuesta }}</p>
          <div class="sm muted">Generada por {{ resultado.proveedor }} ({{ resultado.modelo }}). <span v-if="!usoPoliticas()">No se consultaron las políticas para esta pregunta.</span></div>
        </div>
        <div v-if="resultado" class="card col" style="gap: 10px">
          <div class="ct">Cómo se obtuvo</div>
          <div v-for="(h, i) in resultado.herramientasUsadas" :key="i" class="li" style="padding: 6px 0"><span class="mono">{{ h.nombre }}</span><span class="sp"></span><span class="chip" :class="h.ok ? 'ok' : 'err'">{{ h.ok ? 'Correcto' : 'Falló' }}</span><span class="sm muted">{{ h.ms }} ms</span></div>
          <div class="sm muted">La respuesta cita la política y la sección de donde sale.</div>
        </div>
        <p v-if="!resultado && !consultar.error.value" class="muted">Escriba una pregunta para consultar las políticas indexadas.</p>
      </div>
      <div class="card col" style="flex: 1 1 300px; max-width: 380px; gap: 12px">
        <div class="ct">Documentos indexados</div>
        <EstadoError v-if="estado.error.value" :error="estado.error.value" @reintentar="estado.recargar()" />
        <div v-else-if="estado.datos.value" class="li" style="padding: 8px 0" data-testid="indexados"><div><div class="b">{{ estado.datos.value.documentos }} documentos</div><div class="sm muted">{{ estado.datos.value.fragmentos }} fragmentos en pgvector</div></div><span class="sp"></span><span class="chip ok">Indexado</span></div>
        <div class="banner"><div><b>Sin historias clínicas</b><span>Por privacidad y riesgo de respuestas incorrectas, esta búsqueda no incluye información clínica.</span></div></div>
      </div>
    </div>
  </section>
</template>
