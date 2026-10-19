<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { dialog } from '../lib/confirm'

const onKey = (e: KeyboardEvent) => dialog.open && e.key === 'Escape' && dialog.resolve(false)
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="dialog.open" class="modal" style="z-index: 40" @click.self="dialog.resolve(false)">
    <div class="sheet" role="alertdialog" aria-modal="true" style="max-width: 440px">
      <h2 style="font-size: 24px">{{ dialog.opts.title }}</h2>
      <p v-if="dialog.opts.message" class="muted" style="margin: 10px 0 0; line-height: 1.6">{{ dialog.opts.message }}</p>
      <div class="row" style="margin-top: 24px">
        <button class="secondary grow" autofocus @click="dialog.resolve(false)">{{ dialog.opts.cancelLabel ?? 'ยกเลิก' }}</button>
        <button class="grow" :class="{ danger: dialog.opts.danger }" @click="dialog.resolve(true)">{{ dialog.opts.confirmLabel ?? 'ยืนยัน' }}</button>
      </div>
    </div>
  </div>
</template>
