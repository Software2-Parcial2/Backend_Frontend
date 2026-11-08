<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usarAccion, usarLectura } from '../lib/usar'
import EstadoError from './EstadoError.vue'

const props = defineProps<{ roles: string[] }>()

interface Alerta { id: string; agenteId: string; nivel: 'ALTO' | 'MEDIO' | 'BAJO'; estado: 'ABIERTA' | 'ATENDIDA'; titulo: string; detalle: string; creadaEn: string; atendidaEn: string | null }
interface Agente { id: string; nombre: string; descripcion: string; activo: boolean; intervaloMin: number; umbral: number; ultimaEjecucion: string | null; ultimoEstado: string | null; ultimoError: string | null; ultimasAlertas: number }

const filtro = ref<'ABIERTA' | 'ATENDIDA'>('ABIERTA')
const esAdmin = computed(() => props.roles.includes('administrador'))
const alertas = usarLectura((api, signal) => api.pagina<Alerta>('/api/inteligencia/alertas', { query: { estado: filtro.value }, limite: 25, signal }))
const agentes = usarLectura((api, signal) => api.get<{ items: Agente[] }>('/api/inteligencia/agentes', { signal }).then((r) => r.items))
const cambiar = usarAccion((api, a: Agente, activo: boolean) => api.put(`/api/inteligencia/agentes/${a.id}`, { activo, intervaloMin: a.intervaloMin, umbral: a.umbral }))
const ejecutar = usarAccion((api, a: Agente) => api.post(`/api/inteligencia/agentes/${a.id}/ejecutar`))
const ejecutando = ref<string | null>(null)

onMounted(() => { alertas.recargar(); agentes.recargar() })
watch(filtro, () => alertas.recargar())

const nivel = (n: Alerta['nivel']) => (n === 'ALTO' ? { t: 'Alta', tono: 'err' } : n === 'MEDIO' ? { t: 'Media', tono: 'warn' } : { t: 'Baja', tono: '' })
const cuando = (iso: string) => new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const frecuencia = (min: number) => (min % 1440 === 0 ? `Cada ${min / 1440} día(s)` : min % 60 === 0 ? `Cada ${min / 60} hora(s)` : `Cada ${min} min`)
async function alternar(a: Agente) { if ((await cambiar.ejecutar(a, !a.activo)) !== undefined) agentes.recargar() }
async function correr(a: Agente) { ejecutando.value = a.id; await ejecutar.ejecutar(a); ejecutando.value = null; agentes.recargar(); alertas.recargar() }
</script>

<template>
  <section class="col" style="gap: 20px" aria-labelledby="t-al">
    <div class="ph"><div><h1 id="t-al" class="h1">Alertas y monitoreo</h1><p class="sub">El agente revisa los indicadores y avisa cuando algo se sale de lo normal</p></div></div>
    <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start">
      <div class="card flush" style="flex: 999 1 520px; min-width: 0">
        <div class="ch"><div class="ct">Alertas</div><span class="sp"></span>
          <div class="seg"><button type="button" :class="{ on: filtro === 'ABIERTA' }" data-testid="f-nuevas" @click="filtro = 'ABIERTA'">Nuevas</button><button type="button" :class="{ on: filtro === 'ATENDIDA' }" data-testid="f-revisadas" @click="filtro = 'ATENDIDA'">Revisadas</button></div></div>
        <div style="padding: 0 18px 8px">
          <EstadoError v-if="alertas.error.value" :error="alertas.error.value" @reintentar="alertas.recargar()" />
          <p v-else-if="alertas.cargando.value" class="muted" role="status">Cargando alertas…</p>
          <p v-else-if="!alertas.datos.value?.items.length" class="muted" data-testid="sin-alertas">No hay alertas {{ filtro === 'ABIERTA' ? 'nuevas' : 'revisadas' }}.</p>
          <template v-else>
            <div v-for="a in alertas.datos.value.items" :key="a.id" class="li" style="align-items: flex-start" data-testid="alerta">
              <span class="chip" :class="nivel(a.nivel).tono">{{ nivel(a.nivel).t }}</span>
              <div style="flex: 1"><div class="b">{{ a.titulo }}</div><div v-if="a.detalle" class="ink2">{{ a.detalle }}</div><div class="sm muted">{{ cuando(a.creadaEn) }} · Agente {{ a.agenteId }}</div></div>
              <a class="btn s" :href="`#/alertas/detalle/${a.id}`">Ver detalle</a>
            </div>
          </template>
        </div>
      </div>
      <div class="card col" style="flex: 1 1 320px; max-width: 400px; gap: 14px">
        <div class="ct">Agentes de monitoreo</div>
        <EstadoError v-if="agentes.error.value" :error="agentes.error.value" @reintentar="agentes.recargar()" />
        <p v-else-if="agentes.cargando.value && !agentes.datos.value" class="muted" role="status">Cargando agentes…</p>
        <div v-for="g in agentes.datos.value ?? []" :key="g.id" class="li" style="padding: 6px 0; align-items: flex-start" data-testid="agente">
          <div style="flex: 1"><div class="b">{{ g.nombre }}</div><div class="sm muted">{{ frecuencia(g.intervaloMin) }} · umbral {{ g.umbral }}</div>
            <div v-if="g.ultimoEstado === 'ERROR'" class="sm" style="color: var(--err)">Última ejecución con error: {{ g.ultimoError }}</div>
            <div v-else-if="g.ultimaEjecucion" class="sm muted">Última ejecución {{ cuando(g.ultimaEjecucion) }}</div></div>
          <div class="col" style="gap: 6px; align-items: flex-end">
            <button type="button" class="sw" :class="{ on: g.activo }" role="switch" :aria-checked="g.activo" :aria-label="g.nombre" :disabled="!esAdmin || cambiar.enCurso.value" @click="alternar(g)"></button>
            <button v-if="esAdmin" type="button" class="btn s" :disabled="ejecutando === g.id" :data-agente="g.id" @click="correr(g)">{{ ejecutando === g.id ? 'Ejecutando…' : 'Ejecutar ahora' }}</button>
          </div>
        </div>
        <EstadoError v-if="cambiar.error.value" :error="cambiar.error.value" :reintentable="false" />
        <EstadoError v-if="ejecutar.error.value" :error="ejecutar.error.value" :reintentable="false" />
        <hr class="hr" />
        <div class="sm muted">El aviso al personal usa los canales que cada persona tiene vinculados. <a href="/clinica#/historial/preferencias">Mis preferencias de aviso</a></div>
        <div v-if="!esAdmin" class="sm muted">Solo el administrador puede activar, configurar o ejecutar agentes.</div>
      </div>
    </div>
  </section>
</template>
