<script setup lang="ts">
import { Info, Trash2 } from 'lucide-vue-next'
import Modal from '../../components/Modal.vue'
import { removeItem } from '../../lib/cashier'
import { baht, orderTitle, pad3 } from '../../lib/format'

const props = defineProps<{ item: any; order: any }>()
const emit = defineEmits<{ close: [] }>()
function confirm() {
  removeItem(props.item)
  emit('close')
}
</script>

<template>
  <Modal title="ลบรายการที่ส่งครัวแล้ว?" :subtitle="`${orderTitle(order)} · บิล #${pad3(order.order_no)}`" @close="emit('close')">
    <div style="background: #f3f4f4; border-radius: 12px; padding: 16px">
      <span class="pill">ส่งครัวแล้ว</span>
      <div class="row spread" style="margin-top: 12px"><span class="muted">{{ item.name }} · {{ item.size_name ?? 'ปกติ' }} × {{ item.qty }}</span><strong>{{ baht(item.unit_price * item.qty) }}</strong></div>
    </div>
    <div class="notice warn" style="margin: 16px 0">
      <Info :size="20" />
      <div><b>ครัวจะเห็นการอัปเดตอัตโนมัติ</b>รายการนี้จะแสดงเป็นข้อความขีดฆ่าสีแดงบนจอครัว เพื่อให้ครัวหยุดทำรายการ</div>
    </div>
    <div class="row"><button class="secondary grow" @click="emit('close')">เก็บรายการไว้</button><button class="danger grow" @click="confirm"><Trash2 :size="20" />ยืนยันลบรายการ</button></div>
  </Modal>
</template>
