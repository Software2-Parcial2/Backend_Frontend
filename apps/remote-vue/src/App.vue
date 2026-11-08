<script setup lang="ts">
import type { MfeContext } from '@sigec/mfe-contract'
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import PanelAgente from './components/PanelAgente.vue'
import ResumenGestion from './components/ResumenGestion.vue'
import VistaAlertaDetalle from './components/VistaAlertaDetalle.vue'
import VistaAlertas from './components/VistaAlertas.vue'
import VistaMl from './components/VistaMl.vue'
import VistaPoliticas from './components/VistaPoliticas.vue'
import VistaReportePdf from './components/VistaReportePdf.vue'
import VistaVoz from './components/VistaVoz.vue'
import { crearApi, crearCliente } from './lib/api'
import { API_KEY } from './lib/usar'

// `state.ctx` lo entrega el shell; en modo standalone (puerto 5175) no hay contexto ni token.
const props = defineProps<{ state?: { ctx?: MfeContext } }>()
const ctx = computed(() => props.state?.ctx)
const token = () => props.state?.ctx?.token ?? ''
const cliente = crearCliente(token)
const api = crearApi(() => props.state?.ctx)
provide(API_KEY, api)
const rolesGestion = ['administrador', 'recepcion', 'caja']
const autorizado = computed(() => !!ctx.value && ctx.value.roles.some((r) => rolesGestion.includes(r)))

// Rutas por hash (/gestion#/ml): el shell es dueno de la URL; el remoto solo lee el fragmento.
const VISTAS = ['dashboard', 'ml', 'asistente', 'alertas', 'politicas'] as const
type Vista = (typeof VISTAS)[number]
const TITULOS: Record<Vista, string> = { dashboard: 'Dashboard', ml: 'Machine Learning', asistente: 'Asistente de reportes', alertas: 'Alertas', politicas: 'Políticas' }
const leer = (): { vista: Vista; sub: string; arg: string } => {
  const [v, sub = '', arg = ''] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { vista: VISTAS.includes(v as Vista) ? (v as Vista) : 'dashboard', sub, arg }
}
const actual = ref(leer())
const vista = computed(() => actual.value.vista)
const sub = computed(() => actual.value.sub)
const arg = computed(() => actual.value.arg)
// Conteo real de alertas abiertas para la pestana (se refresca al cambiar de vista).
const abiertas = ref(0)
async function contarAbiertas() {
  try { abiertas.value = (await api.pagina<unknown>('/api/inteligencia/alertas', { query: { estado: 'ABIERTA' }, limite: 100 })).items.length } catch { abiertas.value = 0 }
}
watch([ctx, vista], () => { if (autorizado.value) void contarAbiertas() }, { immediate: true })
const volverAsistente = () => { window.location.hash = '#/asistente' }
const alCambiar = () => { actual.value = leer() }
onMounted(() => { window.addEventListener('hashchange', alCambiar); window.addEventListener('popstate', alCambiar) })
onBeforeUnmount(() => { window.removeEventListener('hashchange', alCambiar); window.removeEventListener('popstate', alCambiar) })
</script>

<template>
  <div class="sigec" data-testid="remote-vue">
    <div class="page">
      <p v-if="ctx" class="sm muted">
        Usuario: <strong>{{ ctx.user.username ?? ctx.user.sub }}</strong> · Roles: <strong>{{ ctx.roles.join(', ') || '—' }}</strong>
      </p>
      <div v-else class="banner">
        <div><b>Modo independiente</b><span>Inicia sesión desde el shell para ver el dashboard.</span></div>
      </div>

      <template v-if="autorizado">
        <nav class="tabs" aria-label="Gestión empresarial">
          <a v-for="v in VISTAS" :key="v" class="tab" :class="{ on: vista === v }" :href="v === 'dashboard' ? '#/' : `#/${v}`" :aria-current="vista === v ? 'page' : undefined">{{ TITULOS[v] }}<span v-if="v === 'alertas' && abiertas > 0" class="chip err" style="margin-left: 6px" data-testid="chip-alertas">{{ abiertas }}</span></a>
        </nav>
        <ResumenGestion v-if="vista === 'dashboard'" :cliente="cliente" :roles="ctx!.roles" />
        <VistaMl v-else-if="vista === 'ml'" :cliente="cliente" />
        <VistaVoz v-else-if="vista === 'asistente' && sub === 'voz'" demo @cancelar="volverAsistente" @terminar="volverAsistente" />
        <VistaReportePdf v-else-if="vista === 'asistente' && sub === 'pdf'" />
        <PanelAgente v-else-if="vista === 'asistente'" :token="token" />
        <VistaAlertaDetalle v-else-if="vista === 'alertas' && sub === 'detalle'" :id="arg" :roles="ctx!.roles" />
        <VistaAlertas v-else-if="vista === 'alertas'" :roles="ctx!.roles" />
        <VistaPoliticas v-else />
      </template>
      <div v-else-if="ctx" class="banner err" role="alert">
        <div><b>Sin permiso</b><span>Tu rol no tiene acceso al dashboard de gestión (se requiere administrador, recepción o caja).</span></div>
      </div>
    </div>
  </div>
</template>

<style>
@import '@sigec/design-tokens/sigec.css';
</style>
