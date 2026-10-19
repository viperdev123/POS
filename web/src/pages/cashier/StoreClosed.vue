<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ask } from '../../lib/confirm'
import { Store, Sun, Info, LogOut } from 'lucide-vue-next'
import { busy, cs, logout, openShift } from '../../lib/cashier'
import { thDateWeekday } from '../../lib/format'
async function signOut() {
  if (await ask({ title: 'ล็อกเอาท์?', confirmLabel: 'ล็อกเอาท์' })) logout()
}
</script>

<template>
  <main style="display: grid; place-items: center; min-height: calc(100vh - 80px); text-align: center">
    <div style="max-width: 560px; width: 100%">
      <div style="width: 78px; height: 78px; border-radius: 22px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; margin: 0 auto 24px"><Store :size="38" /></div>
      <p class="muted" style="font-weight: 600">ยังไม่เปิดร้าน</p>
      <h1 style="margin: 16px 0 12px">พร้อมเริ่มขายวันนี้หรือยัง?</h1>
      <p class="muted">เปิดร้านก่อน จึงจะเริ่มบิลโต๊ะและออเดอร์กลับบ้านได้</p>
      <button class="big" style="width: 100%; margin: 28px 0 20px" @click="openShift"><Loader2 v-if="busy('openShift')" class="spin" :size="22" /><Sun v-else :size="22" />{{ busy('openShift') ? 'กำลังเปิดร้าน...' : 'เปิดร้าน' }}</button>
      <div class="notice" style="text-align: left"><Info :size="20" />ยังไม่สามารถเปิดบิลได้ในขณะที่ร้านปิด</div>
      <p class="muted small" style="margin-top: 20px">{{ thDateWeekday(new Date()) }} · {{ cs.data.settings.table_count }} โต๊ะ</p>
      <div v-if="cs.err" class="err" style="margin-top: 12px">{{ cs.err }}</div>
      <button class="secondary" style="margin-top: 20px" @click="signOut"><LogOut :size="20" />ล็อกเอาท์</button>
    </div>
  </main>
</template>
