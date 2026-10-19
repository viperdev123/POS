<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ask } from '../../lib/confirm'
import { computed, ref } from 'vue'
import { Armchair, Info, LogOut, Plus, Power } from 'lucide-vue-next'
import { busy, cs, logout, newTakeaway, openOrder, openOrders, openTable, shift, takeaways, tableOrder } from '../../lib/cashier'
import { bahtInt, orderTitle, thTime } from '../../lib/format'
import CloseShiftModal from './CloseShiftModal.vue'

const closing = ref(false)
async function signOut() {
  if (await ask({ title: 'ล็อกเอาท์?', message: 'บิลที่เปิดค้างอยู่ยังอยู่ครบ ใส่ PIN เพื่อกลับเข้ามาทำต่อ', confirmLabel: 'ล็อกเอาท์' })) logout()
}
const tables = computed(() => Array.from({ length: cs.data.settings.table_count }, (_, i) => i + 1))
const busyCount = computed(() => tables.value.filter((n) => tableOrder(n)).length)
const KITCHEN: Record<string, string> = { pending: 'รอทำ', cooking: 'กำลังทำ', done: 'เสร็จ' }
const kitchenPill = (o: any) => (o.status === 'open' && !o.order_items.some((i: any) => i.sent_to_kitchen_at) ? ['ยังไม่ส่งครัว', 'grey'] : [KITCHEN[o.kitchen_status], o.kitchen_status === 'cooking' ? 'danger' : 'warn'])
</script>

<template>
  <div class="split pad" style="--side: 360px; gap: 28px">
    <section>
      <div class="row spread wrap" style="margin-bottom: 20px">
        <div>
          <h1>ดูแลทุกโต๊ะในที่เดียว</h1>
          <p class="muted" style="margin-top: 6px">เลือกโต๊ะเพื่อเปิดบิล หรือเพิ่มรายการอาหาร</p>
        </div>
        <span class="pill">ว่าง {{ tables.length - busyCount }} · กำลังทาน {{ busyCount }}</span>
      </div>
      <div class="grid-tables">
        <button v-for="n in tables" :key="n" class="card" :aria-label="`โต๊ะ ${n}`"
          style="flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 10px; text-align: left; min-height: 130px; padding: 16px; color: var(--ink); font-weight: 400"
          :style="{ ...(tableOrder(n) ? { background: 'var(--primary-soft)', borderColor: '#e5b9aa' } : {}), opacity: busy('table-' + n) ? 0.65 : 1 }" @click="openTable(n)">
          <div class="row spread"><strong style="font-size: 26px">โต๊ะ {{ n }}</strong><Armchair :size="22" :color="tableOrder(n) ? '#b65335' : '#237752'" /></div>
          <span class="pill" :class="tableOrder(n) ? 'primary' : ''" style="align-self: flex-start" :style="tableOrder(n) ? { background: 'transparent', padding: 0 } : {}">{{ tableOrder(n) ? 'กำลังทาน' : 'ว่าง' }}</span>
          <span v-if="busy('table-' + n)" class="row" style="gap: 8px; color: var(--primary); font-weight: 600"><Loader2 class="spin" :size="18" />{{ tableOrder(n) ? 'กำลังเปิดบิล...' : 'กำลังสร้างบิล...' }}</span>
          <span v-else :style="tableOrder(n) ? { color: 'var(--primary)', fontWeight: 600, fontSize: '18px' } : { color: 'var(--muted)' }">{{ tableOrder(n) ? bahtInt(tableOrder(n).net) : 'พร้อมรับลูกค้า' }}</span>
        </button>
      </div>
      <div class="card row" style="margin-top: 16px; padding: 16px 20px; align-items: flex-start">
        <Info :size="20" color="#b65335" style="margin-top: 2px" />
        <div><strong>บิลโต๊ะและกลับบ้าน จัดการแยกกันชัดเจน</strong><div class="muted small">สถานะโต๊ะจะกลับเป็นว่างเมื่อชำระเงินหรือยกเลิกบิลแล้ว</div></div>
      </div>
    </section>

    <aside class="card" style="align-self: start">
      <h2 style="margin-bottom: 16px">กลับบ้าน</h2>
      <button class="big" style="width: 100%" :style="{ opacity: busy('takeaway') ? 0.7 : 1 }" @click="newTakeaway"><Loader2 v-if="busy('takeaway')" class="spin" :size="22" /><Plus v-else :size="22" />{{ busy('takeaway') ? 'กำลังสร้างบิล...' : 'สั่งกลับบ้านใหม่' }}</button>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0" />
      <p class="muted small" style="margin-bottom: 12px">ยังไม่เสร็จ · {{ takeaways.length }} ออเดอร์</p>
      <div class="stack">
        <button v-for="o in takeaways" :key="o.id" class="secondary" style="flex-direction: column; align-items: stretch; justify-content: flex-start; text-align: left; gap: 8px; padding: 16px; background: #f6f7f7; font-weight: 400"
          @click="openOrder(o)">
          <strong style="font-size: 20px">{{ orderTitle(o) }}</strong>
          <div class="row"><span class="pill" :class="kitchenPill(o)[1]">{{ kitchenPill(o)[0] }}</span><strong>{{ bahtInt(o.net) }}</strong></div>
          <span class="muted small">รับที่ร้าน · {{ thTime(o.created_at) }} น.</span>
        </button>
        <p v-if="!takeaways.length" class="muted small">ไม่มีออเดอร์กลับบ้านค้างอยู่</p>
      </div>
    </aside>
  </div>

  <footer class="row spread home-footer">
    <span class="muted small">เปิดร้านวันนี้ {{ thTime(shift.opened_at) }} น. · {{ cs.data.settings.shop_name }}</span>
    <div class="row">
      <button class="secondary" @click="signOut"><LogOut :size="20" />ล็อกเอาท์</button>
      <button class="secondary" @click="closing = true"><Power :size="20" />ปิดร้าน</button>
    </div>
  </footer>
  <div style="height: 96px" />
  <CloseShiftModal v-if="closing" :orders="openOrders" @close="closing = false" />
</template>
