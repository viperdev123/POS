<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { cs } from '../lib/cashier'
import { ui } from '../lib/loading'

// thin progress bar while any request / navigation is in flight; delayed 150ms so instant actions never flicker
const active = computed(() => cs.pending > 0 || ui.navigating)
const show = ref(false)
let t: number
watch(active, (v) => {
  clearTimeout(t)
  if (v) t = window.setTimeout(() => (show.value = true), 150)
  else show.value = false
})
</script>

<template><div v-if="show" class="topbar" role="progressbar" aria-label="กำลังทำงาน" /></template>
