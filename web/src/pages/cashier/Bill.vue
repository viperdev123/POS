<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { ArrowLeft, ChefHat, Search, Trash2, Wallet } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import {
  backToHome, busy, changeQty, cs, liveLines, order, removeItem, sendKitchen, unsentCount, lines,
} from '../../lib/cashier'
import { baht, orderTitle, pad3, thTime } from '../../lib/format'
import SizeModal from './SizeModal.vue'
import NoteModal from './NoteModal.vue'
import DiscountModal from './DiscountModal.vue'
import PayModal from './PayModal.vue'
import VoidModal from './VoidModal.vue'
import DeleteSentModal from './DeleteSentModal.vue'

const cat = ref('')
const q = ref('')
const picking = ref<any>(null)
const noting = ref<any>(null)
const deleting = ref<any>(null)
const discountOpen = ref(false)
const payOpen = ref(false)
const voidOpen = ref(false)

const imageUrl = (p: string) => supabase.storage.from('menu-images').getPublicUrl(p).data.publicUrl
const menu = computed<any[]>(() =>
  (cs.data.menu as any[]).filter((m) => (!cat.value || m.category_id === cat.value) && (!q.value.trim() || m.name.includes(q.value.trim()))),
)
const priceText = (m: any) => (m.has_sizes ? m.menu_sizes.slice().sort((a: any, b: any) => a.sort_order - b.sort_order).map((s: any) => Number(s.price)).join(' / ') : Number(m.price))
const pieces = computed(() => liveLines.value.reduce((t, i) => t + i.qty, 0))

function tap(m: any) {
  if (!m.is_active) return
  if (m.has_sizes) picking.value = m
  else picking.value = { ...m, single: true } // no sizes: still opens the sheet so a note / quantity can be set
}
async function onTrash(i: any) {
  if (i.sent_to_kitchen_at) deleting.value = i
  else removeItem(i)
}
</script>

<template>
  <div v-if="order" style="display: grid; grid-template-columns: 1fr 520px; gap: 24px; padding: 24px 32px; align-items: start">
    <section>
      <div class="row" style="margin-bottom: 16px">
        <button class="secondary" @click="backToHome"><ArrowLeft :size="20" />กลับ</button>
        <h1 class="grow">เลือกเมนูอาหาร</h1>
        <span class="muted">{{ menu.length }} เมนู</span>
      </div>
      <div class="field row" style="gap: 8px; margin-bottom: 12px; padding: 0 16px"><Search :size="20" color="#6b7773" /><input v-model="q" placeholder="ค้นหาเมนูอาหาร..." style="min-height: 52px" /></div>
      <div class="seg" style="margin-bottom: 16px">
        <button :class="{ on: !cat }" @click="cat = ''">ทั้งหมด</button>
        <button v-for="c in cs.data.categories" :key="c.id" :class="{ on: cat === c.id }" @click="cat = c.id">{{ c.name }}</button>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px">
        <div v-for="m in menu" :key="m.id" class="card" role="button" style="padding: 12px; cursor: pointer" :style="m.is_active ? {} : { background: '#eceeed', opacity: 0.75, cursor: 'not-allowed' }" @click="tap(m)">
          <img v-if="m.image_path" :src="imageUrl(m.image_path)" alt="" loading="lazy" style="width: 100%; height: 150px; object-fit: cover; border-radius: 10px" />
          <div v-else style="height: 150px; border-radius: 10px; background: #e3e6e5" />
          <div style="padding: 10px 4px 2px"><strong>{{ m.name }}</strong>
            <div class="row" style="margin-top: 4px"><strong :style="{ color: m.is_active ? 'var(--primary)' : 'var(--muted)' }">฿{{ priceText(m) }}</strong><span v-if="!m.is_active" class="pill grey">หมดชั่วคราว</span></div>
          </div>
        </div>
      </div>
      <p class="muted small" style="margin-top: 16px">ราคาทุกรายการรวม VAT 7% แล้ว · แตะเมนูเพื่อเพิ่มในบิล</p>
    </section>

    <aside class="card" style="position: sticky; top: 16px; padding: 24px; display: flex; flex-direction: column; min-height: calc(100vh - 140px)">
      <div class="row spread" style="align-items: flex-start">
        <h1 style="font-size: 34px">{{ orderTitle(order) }}</h1>
        <button class="link" :disabled="order.status !== 'open'" @click="voidOpen = true">ยกเลิกบิล</button>
      </div>
      <p class="muted small" style="margin: 4px 0 12px">บิล #{{ pad3(order.order_no) }} · เปิด {{ thTime(order.created_at) }} น.</p>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 0" />

      <div class="grow" style="overflow: auto">
        <p v-if="!lines.length" class="muted" style="padding: 24px 0">แตะเมนูทางซ้ายเพื่อเพิ่มรายการ</p>
        <div v-for="i in lines" :key="i.id" class="row" style="padding: 14px 0; border-bottom: 1px solid var(--border); align-items: flex-start"
          :style="{ opacity: i.pending ? 0.6 : 1 }">
          <div class="grow">
            <strong :style="i.removed_at ? { textDecoration: 'line-through', color: 'var(--danger)' } : {}">{{ i.name }}</strong>
            <div class="muted small" :style="i.removed_at ? { textDecoration: 'line-through' } : {}">
              {{ i.size_name ?? 'ปกติ' }}<template v-if="i.note"> · {{ i.note }}</template>
              <button v-if="!i.removed_at && !i.sent_to_kitchen_at && !i.note" class="link small" style="margin-left: 6px; color: var(--primary)" @click="noting = i">+ หมายเหตุ</button>
              <button v-else-if="!i.removed_at && !i.sent_to_kitchen_at" class="link small" style="margin-left: 6px; color: var(--primary)" @click="noting = i">แก้</button>
            </div>
            <div class="small" :style="{ color: i.removed_at ? 'var(--danger)' : i.sent_to_kitchen_at ? 'var(--green)' : 'var(--warn)', fontWeight: 500 }">
              {{ i.removed_at ? 'ยกเลิกแล้ว' : i.sent_to_kitchen_at ? 'ส่งครัวแล้ว' : 'ยังไม่ส่งครัว' }}
            </div>
          </div>
          <template v-if="!i.removed_at">
            <div class="stepper"><button aria-label="ลด" :disabled="i.pending" @click="changeQty(i, -1)">−</button><b>{{ i.qty }}</b><button aria-label="เพิ่ม" :disabled="i.pending" @click="changeQty(i, 1)">+</button></div>
            <strong style="min-width: 64px; text-align: right">฿{{ i.unit_price * i.qty }}</strong>
            <button class="link" aria-label="ลบรายการ" style="color: var(--danger)" :disabled="i.pending" @click="onTrash(i)"><Trash2 :size="20" /></button>
          </template>
        </div>
      </div>

      <div style="padding-top: 16px">
        <div class="row spread muted"><span>ยอดรายการ ({{ pieces }} ชิ้น)</span><span class="num" style="color: var(--ink)">{{ baht(order.subtotal) }}</span></div>
        <div class="row spread" style="margin: 8px 0">
          <button class="link" style="color: var(--primary)" :disabled="!liveLines.length || order.status !== 'open'" @click="discountOpen = true">
            {{ order.discount_label ? 'ส่วนลด ' + order.discount_label : 'เพิ่มส่วนลด / โปรโมชัน' }}
          </button>
          <span v-if="Number(order.discount)" class="num" style="color: var(--danger)">−{{ baht(order.discount) }}</span>
          <button v-else class="link" style="color: var(--primary)" :disabled="!liveLines.length" @click="discountOpen = true">+ เลือก</button>
        </div>
        <div v-if="Number(order.rounding)" class="row spread muted small"><span>ปัดเศษ</span><span class="num">+{{ baht(order.rounding) }}</span></div>
        <div class="row spread" style="margin-top: 6px"><strong class="muted" style="font-size: 20px">ยอดสุทธิ</strong><strong class="num" style="font-size: 40px">{{ baht(order.net) }}</strong></div>
        <p class="muted small" style="margin: 4px 0 14px">รวม VAT 7% แล้ว {{ baht(order.vat) }}</p>
        <div class="row">
          <button class="secondary grow big" :disabled="!unsentCount || busy('send')" @click="sendKitchen"><Loader2 v-if="busy('send')" class="spin" :size="22" /><ChefHat v-else :size="22" />{{ busy('send') ? 'กำลังส่ง...' : 'ส่งครัว' }}<template v-if="unsentCount && !busy('send')"> ({{ unsentCount }})</template></button>
          <button class="grow big" :disabled="!liveLines.length" @click="payOpen = true"><Wallet :size="22" />ชำระเงิน</button>
        </div>
        <div v-if="cs.err" class="err small" style="margin-top: 10px">{{ cs.err }}</div>
      </div>
    </aside>
  </div>

  <SizeModal v-if="picking" :item="picking" :title-suffix="orderTitle(order)" @close="picking = null" />
  <NoteModal v-if="noting" :item="noting" @close="noting = null" />
  <DeleteSentModal v-if="deleting" :item="deleting" :order="order" @close="deleting = null" />
  <DiscountModal v-if="discountOpen" :order="order" @close="discountOpen = false" />
  <PayModal v-if="payOpen" :order="order" @close="payOpen = false" />
  <VoidModal v-if="voidOpen" :order="order" @close="voidOpen = false" />
</template>
