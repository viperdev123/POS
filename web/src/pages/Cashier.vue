<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import AppHeader from '../components/AppHeader.vue'
import { cs, load, refreshIfStale, shift } from '../lib/cashier'
import PinScreen from './cashier/PinScreen.vue'
import StoreClosed from './cashier/StoreClosed.vue'
import Home from './cashier/Home.vue'
import Bill from './cashier/Bill.vue'
import Receipt from './cashier/Receipt.vue'
import Summary from './cashier/Summary.vue'

const PAGE = { home: 'หน้าหลัก', bill: 'รับออเดอร์', receipt: 'ชำระเงินสำเร็จ', summary: 'สรุปยอดปิดร้าน' }
const status = computed(() => (cs.view === 'summary' ? 'ปิดร้านแล้ว' : shift.value ? 'เปิดร้านแล้ว' : 'ยังไม่เปิดร้าน'))
// back on the tab after a long idle: pick up owner edits / kitchen progress once, no polling
const onVisible = () => document.visibilityState === 'visible' && refreshIfStale(5 * 60_000)
onMounted(() => {
  if (cs.token) load()
  document.addEventListener('visibilitychange', onVisible)
})
onUnmounted(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
  <PinScreen v-if="!cs.token" />
  <template v-else-if="cs.data">
    <AppHeader :shop="cs.data.settings.shop_name" :page="PAGE[cs.view]" :status="status" :status-on="!!shift && cs.view !== 'summary'" />
    <div v-if="cs.err && cs.view === 'home'" class="notice danger" style="margin: 16px 24px 0">{{ cs.err }}</div>
    <Summary v-if="cs.view === 'summary'" />
    <StoreClosed v-else-if="!shift" />
    <Home v-else-if="cs.view === 'home'" />
    <Bill v-else-if="cs.view === 'bill'" />
    <Receipt v-else-if="cs.view === 'receipt'" />
  </template>
  <p v-else class="muted" style="padding: 40px; text-align: center">กำลังโหลด...</p>
</template>
