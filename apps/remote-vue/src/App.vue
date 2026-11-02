<script setup lang="ts">
import type { MfeContext } from '@sigec/mfe-contract'
import { computed } from 'vue'
import PanelAgente from './components/PanelAgente.vue'
import ResumenGestion from './components/ResumenGestion.vue'
import { crearCliente } from './lib/api'

// `state.ctx` lo entrega el shell; en modo standalone (puerto 5175) no hay contexto ni token.
const props = defineProps<{ state?: { ctx?: MfeContext } }>()
const ctx = computed(() => props.state?.ctx)
const token = () => props.state?.ctx?.token ?? ''
const cliente = crearCliente(token)
const rolesGestion = ['administrador', 'recepcion', 'caja']
const autorizado = computed(() => !!ctx.value && ctx.value.roles.some((r) => rolesGestion.includes(r)))
</script>

<template>
  <main class="remote-vue">
    <h1>Dashboard de gestión</h1>
    <p v-if="ctx">
      Usuario: <strong>{{ ctx.user.username ?? ctx.user.sub }}</strong>
      · Roles: <strong>{{ ctx.roles.join(', ') || '—' }}</strong>
    </p>
    <p v-else>Modo independiente: inicia sesión desde el shell para ver el dashboard.</p>

    <template v-if="autorizado">
      <ResumenGestion :cliente="cliente" :roles="ctx!.roles" />
      <PanelAgente :token="token" />
    </template>
    <p v-else-if="ctx" role="alert">Tu rol no tiene acceso al dashboard de gestión (se requiere administrador, recepción o caja).</p>
  </main>
</template>

<style scoped>
.remote-vue { font-family: system-ui, sans-serif; padding: 1rem; max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; }
</style>
