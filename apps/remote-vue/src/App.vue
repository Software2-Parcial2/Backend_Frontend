<script setup lang="ts">
import type { MfeContext } from '@sigec/mfe-contract'
import { computed } from 'vue'

// `state.ctx` lo entrega el shell; en modo standalone (puerto 5175) no hay contexto.
const props = defineProps<{ state?: { ctx?: MfeContext } }>()
const ctx = computed(() => props.state?.ctx)
</script>

<template>
  <section class="remote-vue">
    <h1>Dashboard de gestión (Vue)</h1>
    <p v-if="ctx">
      Usuario: <strong>{{ ctx.user.username ?? ctx.user.sub }}</strong>
      · Roles: <strong>{{ ctx.roles.join(', ') || '—' }}</strong>
    </p>
    <p v-else>Modo independiente: sin sesión del shell.</p>
  </section>
</template>

<style scoped>
.remote-vue {
  font-family: system-ui, sans-serif;
  padding: 1rem;
}
</style>
