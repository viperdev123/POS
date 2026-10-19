<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { CircleAlert, Info } from 'lucide-vue-next'
import Modal from '../../components/Modal.vue'
import { cs, closeShift } from '../../lib/cashier'
import { bahtInt, orderTitle } from '../../lib/format'

const props = defineProps<{ orders: any[] }>()
const emit = defineEmits<{ close: [] }>()
const busy = ref(false)
const tables = props.orders.filter((o) => o.channel === 'dine_in').length
const takeaways = props.orders.length - tables

async function confirm() {
  busy.value = true
  if (await closeShift()) emit('close')
  busy.value = false
}
</script>

<template>
  <Modal v-if="orders.length" title="ยังปิดร้านไม่ได้" subtitle="กรุณาเคลียร์บิลที่ค้างทั้งหมดก่อนปิดร้าน" @close="emit('close')">
    <div class="notice danger">
      <CircleAlert :size="22" />
      <div><b>มีบิลค้าง {{ orders.length }} บิล</b>{{ tables }} โต๊ะ และ {{ takeaways }} ออเดอร์กลับบ้าน ยังไม่ได้ชำระเงิน</div>
    </div>
    <div class="stack" style="margin: 16px 0; gap: 10px">
      <div v-for="o in orders" :key="o.id" class="row spread muted"><span>{{ orderTitle(o) }}</span><strong style="color: var(--ink)">{{ bahtInt(o.net) }}</strong></div>
    </div>
    <p class="muted small">ชำระเงินหรือยกเลิกบิลพร้อมเหตุผลให้ครบ แล้วจึงกลับมาปิดร้านอีกครั้ง</p>
    <div class="row" style="margin-top: 20px"><button class="secondary grow" @click="emit('close')">กลับไปเคลียร์บิล</button><button class="grow" disabled>ปิดร้าน</button></div>
  </Modal>

  <Modal v-else title="ปิดร้านวันนี้?" subtitle="ไม่มีบิลค้างแล้ว พร้อมปิดร้าน" @close="emit('close')">
    <div class="notice"><Info :size="20" />เมื่อปิดร้านแล้ว ระบบจะแสดงสรุปยอดของวันนี้ และเลขกลับบ้านจะเริ่มนับ 001 ใหม่ในรอบถัดไป</div>
    <div v-if="cs.err" class="err" style="margin-top: 12px">{{ cs.err }}</div>
    <div class="row" style="margin-top: 20px"><button class="secondary grow" @click="emit('close')">ยังไม่ปิด</button><button class="danger grow" :disabled="busy" @click="confirm"><Loader2 v-if="busy" class="spin" :size="20" />{{ busy ? 'กำลังปิดร้าน...' : 'ยืนยันปิดร้าน' }}</button></div>
  </Modal>
</template>
