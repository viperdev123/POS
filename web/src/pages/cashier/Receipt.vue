<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, Check, Printer } from 'lucide-vue-next'
import { cs, refreshIfStale } from '../../lib/cashier'
import { printArea } from '../../lib/print'
import { baht, orderTitle, pad3, thTime } from '../../lib/format'

const r = computed(() => cs.receipt)
const o = computed(() => r.value.order)
const items = computed(() => o.value.order_items.filter((i: any) => !i.removed_at))
const exVat = computed(() => Number(o.value.net) - Number(o.value.vat))
const paidAt = computed(() => new Date(o.value.paid_at))
const date = computed(() => `${paidAt.value.toLocaleDateString('th-TH')} ${thTime(paidAt.value)}`)
const print = () => printArea('receipt')
function back() {
  cs.receipt = null
  cs.view = 'home'
  refreshIfStale(60_000)
}
</script>

<template>
  <div v-if="r" style="display: grid; grid-template-columns: 420px 1fr; gap: 80px; max-width: 1100px; margin: 0 auto; padding: 40px 32px; align-items: start">
    <div class="card print-area" style="padding: 32px">
      <div style="text-align: center"><h1 class="rcpt-title" style="font-size: 32px">{{ cs.data.settings.shop_name }}</h1><p class="muted small" style="margin: 8px 0">{{ cs.data.settings.shop_address }}</p><p class="muted small">ใบเสร็จรับเงิน</p></div>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 14px 0" />
      <div class="row spread small"><span>บิล #{{ pad3(o.order_no) }} · {{ orderTitle(o) }}</span><span>{{ date }}</span></div>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 14px 0" />
      <div class="stack" style="gap: 8px">
        <div v-for="i in items" :key="i.id" class="row spread muted small"><span>{{ i.name }}<template v-if="i.size_name"> · {{ i.size_name }}</template> × {{ i.qty }}</span><span class="num">{{ baht(i.unit_price * i.qty) }}</span></div>
      </div>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 14px 0" />
      <div class="stack small muted" style="gap: 6px">
        <div class="row spread"><span>ยอดรายการ</span><span class="num">{{ baht(o.subtotal) }}</span></div>
        <div v-if="Number(o.discount)" class="row spread"><span>ส่วนลด {{ o.discount_label }}</span><span class="num">−{{ baht(o.discount) }}</span></div>
        <div v-if="Number(o.rounding)" class="row spread"><span>ปัดเศษ</span><span class="num">+{{ baht(o.rounding) }}</span></div>
        <div class="row spread"><span>ยอดก่อน VAT</span><span class="num">{{ baht(exVat) }}</span></div>
        <div class="row spread"><span>VAT 7% (รวมในราคาแล้ว)</span><span class="num">{{ baht(o.vat) }}</span></div>
      </div>
      <div class="row spread" style="margin: 14px 0"><strong class="muted" style="font-size: 20px">ยอดชำระ</strong><strong class="num rcpt-total" style="font-size: 38px">{{ baht(o.net) }}</strong></div>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 14px 0" />
      <div class="stack small muted" style="gap: 6px">
        <div class="row spread"><span>วิธีชำระ · {{ o.pay_method === 'cash' ? 'เงินสด' : 'QR' }}</span><span class="num">{{ baht(r.received ?? o.net) }}</span></div>
        <div v-if="r.change != null" class="row spread"><span>เงินทอน</span><span class="num">{{ baht(r.change) }}</span></div>
      </div>
      <p class="muted small" style="text-align: center; margin-top: 18px">ขอบคุณที่อุดหนุน แล้วพบกันใหม่ค่ะ</p>
    </div>

    <div style="padding-top: 20px">
      <div style="width: 84px; height: 84px; border-radius: 50%; background: var(--green-soft); color: var(--green); display: grid; place-items: center"><Check :size="40" /></div>
      <h1 style="margin: 28px 0 16px; font-size: 34px">รับเงินเรียบร้อยแล้ว</h1>
      <p class="muted" style="line-height: 1.7">
        <template v-if="o.channel === 'dine_in'">โต๊ะ {{ o.table_no }} กลับเป็นโต๊ะว่างแล้ว<br />พร้อมรับลูกค้าท่านต่อไป</template>
        <template v-else>{{ orderTitle(o) }} ชำระเงินแล้ว<br />ครัวจะเตรียมอาหารตามออเดอร์ที่ส่งไว้</template>
      </p>
      <span class="pill" style="margin: 20px 0 24px; display: inline-block">{{ o.pay_method === 'cash' ? 'เงินสด' : 'QR' }} · {{ baht(o.net) }}</span>
      <button class="big" style="width: 100%" @click="print"><Printer :size="22" />พิมพ์ใบเสร็จ</button>
      <button class="secondary big" style="width: 100%; margin-top: 14px" @click="back"><ArrowLeft :size="20" />กลับหน้าหลัก</button>
    </div>
  </div>
</template>
