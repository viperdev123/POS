<script setup lang="ts">
import { ref } from 'vue'
import { Info } from 'lucide-vue-next'
import Modal from '../../components/Modal.vue'
import { setNote } from '../../lib/cashier'

const props = defineProps<{ item: any }>()
const emit = defineEmits<{ close: [] }>()
const note = ref(props.item.note ?? '')
const QUICK = ['ไม่เผ็ด', 'ไม่ใส่ผัก', 'เผ็ดน้อย', 'ไม่ใส่ถั่ว']

function save() {
  setNote(props.item, note.value)
  emit('close')
}
</script>

<template>
  <Modal title="หมายเหตุถึงครัว" :subtitle="`${item.name} · ${item.qty} ${item.size_name ?? 'จาน'}`" @close="emit('close')">
    <label class="field" style="display: block"><span>รายละเอียดที่ต้องการ</span><textarea v-model="note" style="min-height: 72px" /></label>
    <p class="muted small" style="margin: 16px 0 8px">คำที่ใช้บ่อย</p>
    <div class="row wrap">
      <button v-for="w in QUICK" :key="w" class="secondary" style="min-width: 140px" :style="note === w ? { background: 'var(--primary)', color: '#fff' } : {}" @click="note = w">{{ w }}</button>
    </div>
    <div class="notice" style="margin: 16px 0"><Info :size="20" />หมายเหตุจะแสดงเด่นบนจอครัวพร้อมรายการอาหาร</div>
    <div class="row"><button class="secondary grow" @click="emit('close')">ยกเลิก</button><button class="grow" @click="save">บันทึกหมายเหตุ</button></div>
  </Modal>
</template>
