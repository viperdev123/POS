<script setup lang="ts">
import ConfirmHost from './components/ConfirmHost.vue'
import TopBar from './components/TopBar.vue'
</script>

<template>
  <router-view />
  <TopBar />
  <ConfirmHost />
</template>
