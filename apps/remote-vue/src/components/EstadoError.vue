<script setup lang="ts">
import { computed } from 'vue'
import type { ApiError } from '../lib/api'
import { textoDeError } from '../lib/usar'

const props = defineProps<{ error: ApiError; reintentable?: boolean }>()
defineEmits<{ reintentar: [] }>()
const m = computed(() => textoDeError(props.error))
</script>

<template>
  <div class="banner err" role="alert">
    <div>
      <b>{{ m.titulo }}</b><span>{{ m.texto }}</span>
      <span v-if="error.correlationId" class="sm mono" data-testid="correlation-id">Código de soporte: {{ error.correlationId }}</span>
    </div>
    <button v-if="reintentable !== false" type="button" class="btn s" @click="$emit('reintentar')">Reintentar</button>
  </div>
</template>
