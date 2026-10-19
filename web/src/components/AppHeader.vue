<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { UtensilsCrossed } from 'lucide-vue-next'
import { thDateTime } from '../lib/format'

defineProps<{ shop: string; page: string; status?: string; statusOn?: boolean; showClock?: boolean }>()
const now = ref(new Date())
let timer: number
onMounted(() => (timer = window.setInterval(() => (now.value = new Date()), 30_000)))
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <header class="row spread app-header">
    <div class="row">
      <div style="width: 48px; height: 48px; border-radius: 14px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center">
        <UtensilsCrossed :size="24" />
      </div>
      <div>
        <strong style="font-size: 20px">{{ shop }}</strong>
        <div class="muted small tagline">อร่อยทุกมื้อ ดูแลง่ายทุกวัน</div>
      </div>
    </div>
    <div class="row wrap" style="gap: 8px 20px">
      <strong>{{ page }}</strong>
      <span v-if="status" class="pill" :class="statusOn ? '' : 'grey'" style="padding: 6px 14px">{{ status }}</span>
      <span class="muted">{{ thDateTime(now) }}</span>
      <slot />
    </div>
  </header>
</template>
