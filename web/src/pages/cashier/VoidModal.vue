<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { CircleAlert } from 'lucide-vue-next'
import Modal from '../../components/Modal.vue'
import { cs, voidBill } from '../../lib/cashier'
import { baht, orderTitle, pad3 } from '../../lib/format'

const props = defineProps<{ order: any }>()
const emit = defineEmits<{ close: [] }>()
const reason = ref('')
const busy = ref(false)

async function confirm() {
  busy.value = true
  if (await voidBill(reason.value.trim())) emit('close')
  busy.value = false
}
</script>

<template>
  <Modal title="ยกเลิกทั้งบิล" :subtitle="`${orderTitle(order)} · บิล #${pad3(order.order_no)}`" @close="emit('close')">
    <div class="notice danger"><CircleAlert :size="20" />การยกเลิกนี้ไม่สามารถย้อนกลับได้ รายการทั้งหมดจะถูกแจ้งยกเลิกไปยังครัว</div>
    <div class="row spread" style="margin: 20px 0"><strong class="muted" style="font-size: 20px">ยอดบิลที่จะยกเลิก</strong><strong style="font-size: 36px">{{ baht(order.net) }}</strong></div>
    <label class="field" style="display: block"><span>เหตุผลในการยกเลิก *</span><textarea v-model="reason" placeholder="เช่น ลูกค้าเปลี่ยนใจ ไม่รับอาหาร" style="min-height: 64px" /><small class="muted">จำเป็นต้องระบุเหตุผลก่อนยืนยัน</small></label>
    <div v-if="cs.err" class="err" style="margin-top: 8px">{{ cs.err }}</div>
    <div class="row" style="margin-top: 16px"><button class="secondary grow" @click="emit('close')">กลับไปที่บิล</button><button class="danger grow" :disabled="!reason.trim() || busy" @click="confirm"><Loader2 v-if="busy" class="spin" :size="20" />{{ busy ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกบิล' }}</button></div>
  </Modal>
</template>
