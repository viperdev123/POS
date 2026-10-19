<script setup lang="ts">
import { Banknote, QrCode, Receipt, Printer, Store } from 'lucide-vue-next'
import { cs } from '../../lib/cashier'
import { printArea } from '../../lib/print'
import { baht, thDateLong, thTime } from '../../lib/format'

const s = cs.summary
const tables = cs.data.settings.table_count
const print = () => printArea('report')
</script>

<template>
  <div v-if="s" class="print-area pad" style="max-width: 1280px; margin: 0 auto">
    <div class="row spread wrap" style="align-items: flex-start">
      <div>
        <span class="pill">ปิดร้านเรียบร้อย</span>
        <h1 style="font-size: clamp(28px, 5vw, 40px); margin: 12px 0 8px">ขอบคุณสำหรับวันนี้</h1>
        <p class="muted">{{ thDateLong(s.opened_at) }} · เปิด {{ thTime(s.opened_at) }} น. — ปิด {{ thTime(s.closed_at) }} น.</p>
      </div>
      <button class="secondary" @click="print"><Printer :size="20" />พิมพ์สรุปยอด</button>
    </div>

    <div style="background: #223d33; color: #fff; border-radius: 18px; padding: 32px; margin: 24px 0 16px">
      <p style="color: #c5d4cd">ยอดรับชำระสุทธิวันนี้</p>
      <div class="num" style="font-size: clamp(38px, 8vw, 64px); font-weight: 700; margin: 8px 0">{{ baht(s.total) }}</div>
      <small style="color: #c5d4cd">รวม VAT 7% แล้ว · ไม่รวมยอดบิลที่ยกเลิก</small>
    </div>

    <div class="grid-stats">
      <div class="card"><div class="row spread muted"><span>เงินสด</span><Banknote :size="22" color="#b65335" /></div><div class="num" style="font-size: 36px; font-weight: 700; margin: 8px 0">{{ baht(s.cash) }}</div><span class="muted small">{{ s.cash_bills }} บิล</span></div>
      <div class="card"><div class="row spread muted"><span>QR</span><QrCode :size="22" color="#b65335" /></div><div class="num" style="font-size: 36px; font-weight: 700; margin: 8px 0">{{ baht(s.qr) }}</div><span class="muted small">{{ s.qr_bills }} บิล</span></div>
      <div class="card"><div class="row spread muted"><span>บิลที่ชำระแล้ว</span><Receipt :size="22" color="#b65335" /></div><div style="font-size: 36px; font-weight: 700; margin: 8px 0">{{ s.bills }} บิล</div><span class="muted small">โต๊ะและกลับบ้าน</span></div>
    </div>

    <div class="card row spread wrap" style="margin-top: 16px; padding: 18px 24px">
      <div class="row"><span class="pill danger">ยกเลิกบิล</span><span>{{ s.void_count }} บิล · รวมมูลค่า {{ baht(s.void_total) }}</span></div>
      <span class="muted small">แยกจากยอดรับชำระ</span>
    </div>

    <div class="row spread wrap" style="margin-top: 24px">
      <span class="muted small">ปิดบิลครบแล้ว · โต๊ะว่าง {{ tables }} โต๊ะ · ไม่มีกลับบ้านค้าง</span>
      <button class="big" @click="cs.view = 'home'"><Store :size="22" />กลับหน้าร้าน</button>
    </div>
  </div>
</template>

