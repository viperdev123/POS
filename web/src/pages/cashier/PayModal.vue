<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { Check, Info } from 'lucide-vue-next'
import Modal from '../../components/Modal.vue'
import { cs, pay } from '../../lib/cashier'
import { baht, orderTitle, pad3 } from '../../lib/format'

const props = defineProps<{ order: any }>()
const emit = defineEmits<{ close: [] }>()
const method = ref<'cash' | 'qr'>('cash')
const received = ref<number | null>(null)
const busy = ref(false)
const net = computed(() => Number(props.order.net))
const change = computed(() => (received.value ?? 0) - net.value)
const quick = [100, 200, 500, 1000]
const canPay = computed(() => !busy.value && (method.value === 'qr' || (received.value != null && change.value >= 0)))

async function confirm() {
  busy.value = true
  const ok = await pay(method.value, method.value === 'cash' ? received.value ?? undefined : undefined)
  busy.value = false
  if (ok) emit('close')
}
</script>

<template>
  <Modal title="ชำระเงิน" :subtitle="`${orderTitle(order)} · บิล #${pad3(order.order_no)}${order.discount_label ? ' · ' + order.discount_label + ' ลด ' + baht(order.discount) : ''}`" @close="emit('close')">
    <div class="seg" style="margin-bottom: 20px"><button :class="{ on: method === 'cash' }" @click="method = 'cash'">เงินสด</button><button :class="{ on: method === 'qr' }" @click="method = 'qr'">QR</button></div>
    <div class="row spread"><strong class="muted" style="font-size: 20px">ยอดที่ต้องชำระ</strong><strong style="font-size: 44px">{{ baht(net) }}</strong></div>
    <p class="muted small" style="margin: 4px 0 16px">รวม VAT 7% {{ baht(order.vat) }} แล้ว</p>

    <template v-if="method === 'cash'">
      <label class="field" style="display: block"><span>รับเงินสด (บาท)</span><input v-model.number="received" type="number" inputmode="decimal" min="0" /></label>
      <div class="row" style="margin: 14px 0">
        <button class="secondary grow" :class="{ on: received === net }" :style="received === net ? { background: 'var(--primary)', color: '#fff' } : {}" @click="received = net">พอดี</button>
        <button v-for="n in quick" :key="n" class="secondary grow" :style="received === n ? { background: 'var(--primary)', color: '#fff' } : {}" @click="received = n">{{ n.toLocaleString() }}</button>
      </div>
      <div class="notice success" style="justify-content: space-between; align-items: center; padding: 22px 20px">
        <strong style="font-size: 20px">เงินทอน</strong><strong style="font-size: 36px">{{ received != null && change >= 0 ? baht(change) : '—' }}</strong>
      </div>
      <p v-if="received != null && change < 0" class="err small" style="margin-top: 8px">รับเงินไม่พอ ขาดอีก {{ baht(-change) }}</p>
      <div class="notice" style="margin: 14px 0"><Info :size="20" />ตรวจสอบเงินที่ได้รับก่อนยืนยันชำระเงิน</div>
      <button class="big" style="width: 100%" :disabled="!canPay" @click="confirm"><Loader2 v-if="busy" class="spin" :size="22" /><Check v-else :size="22" />{{ busy ? 'กำลังบันทึก...' : 'ยืนยันรับเงินสด ' + (received != null ? baht(received) : '') }}</button>
    </template>

    <template v-else>
      <div style="background: #f3f4f4; border-radius: 16px; padding: 24px; text-align: center">
        <svg viewBox="0 0 100 100" width="200" height="200" style="background: #fff; border-radius: 12px; padding: 12px" aria-label="QR ตัวอย่าง">
          <g fill="none" stroke="#26332f" stroke-width="3"><rect x="8" y="8" width="22" height="22" rx="4" /><rect x="70" y="8" width="22" height="22" rx="4" /><rect x="8" y="70" width="22" height="22" rx="4" /><path d="M44 40v12h16M70 78h22M44 78v14M70 70c8 0 22 0 22 8" /></g>
        </svg>
        <p class="muted small" style="margin-top: 8px">ตัวอย่าง QR สำหรับรับชำระเงิน</p><strong>{{ cs.data.settings.shop_name }}</strong>
      </div>
      <div class="notice warn" style="margin: 14px 0"><Info :size="20" />ตรวจสอบยอดเข้าบัญชี {{ baht(net) }} ก่อนยืนยัน ไม่ใช่การตรวจสอบอัตโนมัติ</div>
      <button class="big" style="width: 100%" :disabled="busy" @click="confirm"><Loader2 v-if="busy" class="spin" :size="22" /><Check v-else :size="22" />{{ busy ? 'กำลังบันทึก...' : 'ยืนยันว่าได้รับเงินแล้ว' }}</button>
    </template>
    <div v-if="cs.err" class="err" style="margin-top: 10px">{{ cs.err }}</div>
  </Modal>
</template>
