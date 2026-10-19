<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ask } from '../../lib/confirm'
import { computed, ref } from 'vue'
import { CircleAlert, CircleCheck, Info } from 'lucide-vue-next'
import Modal from '../../components/Modal.vue'
import { applyCode, applyPromo, checkCode, clearDiscount, cs, listPromos } from '../../lib/cashier'
import { baht, orderTitle, pad3 } from '../../lib/format'
import { describePromo } from '../../lib/promo'

const props = defineProps<{ order: any }>()
const emit = defineEmits<{ close: [] }>()
const hasCode = computed(() => !!props.order.discount_code_id)
const hasPromo = computed(() => !!props.order.promotion_id)
const tab = ref<'code' | 'promo'>(hasPromo.value ? 'promo' : 'code')

const code = ref('')
const preview = ref<any>(null)
const checking = ref(false)
const applying = ref(false)
const promos = ref<any[] | null>(null)
const pick = ref('')
const nameOf = (id: string) => cs.data.menu.find((m: any) => m.id === id)?.name ?? '(เมนูถูกลบ)'

async function check() {
  checking.value = true
  preview.value = null
  const r = await checkCode(code.value.trim())
  preview.value = r?.preview ?? null
  checking.value = false
}
async function useCode() {
  applying.value = true
  if (await applyCode(code.value.trim())) emit('close')
  applying.value = false
}
async function showPromos() {
  tab.value = 'promo'
  if (!promos.value) promos.value = (await listPromos())?.promos ?? [] // fetched only when the tab is opened
}
if (tab.value === 'promo') showPromos()
async function usePromo() {
  applying.value = true
  if (await applyPromo(pick.value)) emit('close')
  applying.value = false
}
async function remove() {
  if (!(await ask({ title: 'เอาส่วนลดออก?', message: `ยอดบิลจะกลับเป็น ${baht(props.order.subtotal)} (ก่อนปัดเศษ)`, confirmLabel: 'เอาออก', danger: true }))) return
  await clearDiscount(); preview.value = null; pick.value = '' }
const picked = computed(() => promos.value?.find((p) => p.id === pick.value))
</script>

<template>
  <Modal title="ส่วนลดท้ายบิล" :subtitle="`${orderTitle(order)} · บิล #${pad3(order.order_no)}`" @close="emit('close')">
    <div class="notice warn"><Info :size="20" />ใช้ได้อย่างเดียวต่อบิล</div>
    <div class="seg" style="margin: 16px 0">
      <button :class="{ on: tab === 'code' }" :disabled="hasPromo" @click="tab = 'code'">โค้ด<template v-if="hasPromo"> · ปิดใช้งาน</template></button>
      <button :class="{ on: tab === 'promo' }" :disabled="hasCode" @click="showPromos">โปรอัตโนมัติ<template v-if="hasCode"> · ปิดใช้งาน</template></button>
    </div>

    <div v-if="order.discount_label" class="notice success" style="margin-bottom: 16px">
      <CircleCheck :size="20" /><div class="grow"><b>ใช้อยู่: {{ order.discount_label }}</b>ลด {{ baht(order.discount) }}</div>
      <button class="secondary" style="min-height: 40px" @click="remove">เอาออก</button>
    </div>

    <template v-if="tab === 'code'">
      <div class="row" style="align-items: stretch">
        <label class="field grow"><span>โค้ดส่วนลด</span><input v-model="code" :disabled="hasCode" placeholder="กรอกโค้ด" @keydown.enter="check" /></label>
        <button class="secondary" :disabled="hasCode || !code.trim() || checking" @click="check"><Loader2 v-if="checking" class="spin" :size="20" />{{ checking ? 'กำลังตรวจสอบ...' : 'ตรวจสอบ' }}</button>
      </div>
      <div v-if="preview" class="notice success" style="margin-top: 16px"><CircleCheck :size="22" /><div><b>ใช้โค้ดได้ · ลด {{ baht(preview.discount) }}</b>ตรงตามเงื่อนไขของโค้ด {{ preview.code }}</div></div>
      <div v-else-if="cs.err && code" class="notice danger" style="margin-top: 16px"><CircleAlert :size="22" /><div><b>ใช้โค้ดไม่ได้</b>{{ cs.err }}</div></div>
      <p class="muted small" style="margin: 14px 0">เมื่อใช้โค้ดนี้ จะใช้โปรอัตโนมัติร่วมกันไม่ได้ หากต้องการเปลี่ยน ให้ลบโค้ดก่อน</p>
      <hr style="border: 0; border-top: 1px solid var(--border)" />
      <div class="stack" style="margin: 14px 0; gap: 8px">
        <div class="row spread muted"><span>ยอดรายการ</span><span>{{ baht(order.subtotal) }}</span></div>
        <div v-if="preview" class="row spread muted"><span>ส่วนลด {{ preview.code }}</span><span>−{{ baht(preview.discount) }}</span></div>
        <div class="row spread"><strong class="muted" style="font-size: 20px">ยอดสุทธิ{{ preview || hasCode ? '' : ' (ไม่เปลี่ยนแปลง)' }}</strong><strong style="font-size: 34px">{{ baht(preview ? preview.net : order.net) }}</strong></div>
      </div>
      <button class="big" style="width: 100%" :disabled="!preview || hasCode || applying" @click="useCode"><Loader2 v-if="applying" class="spin" :size="22" />{{ applying ? 'กำลังใช้โค้ด...' : 'ใช้โค้ด' + (preview ? ' ' + preview.code : 'ส่วนลด') }}</button>
    </template>

    <template v-else>
      <p class="muted small" style="margin-bottom: 10px">โปรที่เข้าเงื่อนไข · เลือกได้ 1 รายการ</p>
      <p v-if="promos === null" class="loading-text"><Loader2 class="spin" :size="20" />กำลังโหลดโปรโมชัน...</p>
      <p v-else-if="!promos.length" class="muted">ไม่มีโปรโมชันที่เข้าเงื่อนไขกับบิลนี้</p>
      <div class="stack">
        <button v-for="p in promos" :key="p.id" class="secondary" style="flex-direction: column; align-items: stretch; text-align: left; font-weight: 400; padding: 16px; gap: 6px"
          :disabled="hasPromo" :style="pick === p.id ? { borderColor: 'var(--primary)', background: 'var(--primary-soft)' } : {}" @click="pick = p.id">
          <div class="row spread"><strong style="font-size: 18px">{{ pick === p.id ? '● ' : '○ ' }}{{ p.name }}</strong><span v-if="pick === p.id" class="pill primary">เลือกแล้ว</span></div>
          <span class="muted small">{{ describePromo(p.type, p.config, nameOf) }}</span>
          <strong style="color: var(--primary)">ประหยัด {{ baht(p.discount) }}</strong>
        </button>
      </div>
      <p v-if="hasCode" class="muted small" style="margin-top: 12px">ปิดการใช้โปรขณะใช้โค้ดส่วนลด ลบโค้ดเพื่อกลับไปใช้โปรได้</p>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0" />
      <div class="stack" style="gap: 8px; margin-bottom: 14px">
        <div class="row spread muted"><span>ยอดรายการ</span><span>{{ baht(order.subtotal) }}</span></div>
        <div v-if="picked" class="row spread muted"><span>ส่วนลดโปรอัตโนมัติ</span><span>−{{ baht(picked.discount) }}</span></div>
        <div class="row spread"><strong class="muted" style="font-size: 20px">ยอดสุทธิ</strong>
          <strong style="font-size: 34px">{{ baht(picked ? Math.ceil(Math.max(0, order.subtotal - picked.discount)) : order.net) }}</strong></div>
      </div>
      <div v-if="cs.err" class="err" style="margin-bottom: 8px">{{ cs.err }}</div>
      <button class="big" style="width: 100%" :disabled="!pick || hasPromo || applying" @click="usePromo"><Loader2 v-if="applying" class="spin" :size="22" />{{ applying ? 'กำลังใช้โปร...' : 'ใช้โปรโมชันนี้' }}</button>
    </template>
  </Modal>
</template>
