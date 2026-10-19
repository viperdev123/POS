<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; width?: number }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="modal" @click.self="$emit('close')">
    <div class="sheet" :style="width ? { maxWidth: width + 'px' } : undefined">
      <div class="row spread" style="align-items: flex-start; margin-bottom: 16px">
        <div>
          <h2 style="font-size: 26px">{{ title }}</h2>
          <p v-if="subtitle" class="muted small" style="margin-top: 4px">{{ subtitle }}</p>
        </div>
        <button class="link" @click="$emit('close')">ปิด</button>
      </div>
      <slot />
    </div>
  </div>
</template>
