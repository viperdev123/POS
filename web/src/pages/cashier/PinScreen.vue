<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { onMounted, onUnmounted, ref } from 'vue'
import { Delete, UtensilsCrossed, CircleAlert } from 'lucide-vue-next'
import { login } from '../../lib/cashier'
import { pos } from '../../lib/api'

const pin = ref('')
const err = ref('')
const busy = ref(false)
const shop = localStorage.getItem('pos_shop') ?? 'ร้านของฉัน'

const press = (d: string) => { if (pin.value.length < 6) { pin.value += d; err.value = '' } }
async function submit() {
  if (pin.value.length < 6 || busy.value) return
  busy.value = true
  const e = await login(pin.value)
  busy.value = false
  if (e) { err.value = e === 'PIN ไม่ถูกต้อง' ? 'PIN ไม่ถูกต้อง กรุณาลองอีกครั้ง' : e; pin.value = '' }
}
const onKey = (e: KeyboardEvent) => {
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') pin.value = pin.value.slice(0, -1)
  else if (e.key === 'Enter') submit()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  pos('ping', {}, { 'x-session': 'warm' }).catch(() => {}) // wake the function + prime the CORS preflight cache while the PIN is typed
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="auth full">
    <aside style="background: #213d33; color: #fff; display: flex; flex-direction: column; justify-content: space-between">
      <div class="row"><div style="width: 40px; height: 40px; border-radius: 10px; background: #ffffff1f; display: grid; place-items: center"><UtensilsCrossed :size="20" /></div><strong>{{ shop }}</strong></div>
      <div>
        <UtensilsCrossed :size="44" color="#e0a98e" />
        <h1 style="font-size: 44px; line-height: 1.3; margin: 32px 0 20px">เริ่มวันดี ๆ<br />ที่ร้านของเรา</h1>
        <p style="color: #c5d4cd; font-size: 20px; line-height: 1.6">พร้อมรับทุกออเดอร์<br />พร้อมดูแลทุกโต๊ะ</p>
      </div>
      <small style="color: #a9bdb4">{{ shop }} · ระบบขายหน้าร้าน</small>
    </aside>

    <main style="display: grid; place-items: center; padding: 24px">
      <div style="width: 100%; max-width: 380px; text-align: center">
        <h1 style="font-size: 30px">เข้าสู่ระบบแคชเชียร์</h1>
        <p class="muted" style="margin: 12px 0 20px">ใส่รหัส PIN 6 หลักเพื่อเริ่มใช้งาน</p>
        <div class="row" style="justify-content: center; gap: 18px; height: 28px; margin-bottom: 16px">
          <span v-for="n in 6" :key="n" style="width: 18px; height: 18px; border-radius: 50%"
            :style="{ background: n <= pin.length ? (err ? 'var(--danger)' : 'var(--primary)') : '#d6dad8' }" />
        </div>
        <div v-if="err" class="notice danger" style="margin-bottom: 16px; text-align: left"><CircleAlert :size="20" />{{ err }}</div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px">
          <button v-for="n in ['1','2','3','4','5','6','7','8','9']" :key="n" class="secondary" style="min-height: 68px; font-size: 26px; font-weight: 500" @click="press(n)">{{ n }}</button>
          <button class="secondary" style="min-height: 68px" @click="pin = ''; err = ''">ล้าง</button>
          <button class="secondary" style="min-height: 68px; font-size: 26px; font-weight: 500" @click="press('0')">0</button>
          <button class="secondary" style="min-height: 68px" aria-label="ลบ" @click="pin = pin.slice(0, -1)"><Delete :size="26" /></button>
        </div>
        <button class="big" style="width: 100%; margin-top: 16px" :disabled="pin.length < 6 || busy" @click="submit"><Loader2 v-if="busy" class="spin" :size="22" />{{ busy ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ' }}</button>
        <p class="muted small" style="margin-top: 20px">ลืมรหัส? ติดต่อเจ้าของร้านเพื่อเปลี่ยน PIN</p>
      </div>
    </main>
  </div>
</template>
