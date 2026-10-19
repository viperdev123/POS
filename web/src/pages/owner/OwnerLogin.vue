<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, BadgePercent, ShieldCheck, UtensilsCrossed } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'

const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const shop = localStorage.getItem('pos_shop') ?? 'ร้านของฉัน'

async function login() {
  busy.value = true
  error.value = ''
  const { error: e } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  busy.value = false
  if (e) error.value = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
  else router.push('/owner/menu')
}
</script>

<template>
  <div class="auth full" style="--aside: 44%">
    <aside style="background: #213d33; color: #fff; display: flex; flex-direction: column; justify-content: space-between">
      <div class="row"><div style="width: 40px; height: 40px; border-radius: 10px; background: #ffffff1f; display: grid; place-items: center"><UtensilsCrossed :size="20" /></div><strong>{{ shop }}</strong></div>
      <div>
        <h1 style="font-size: 44px; line-height: 1.35">หลังร้านที่ลงตัว<br />เพื่อหน้าร้านที่ราบรื่น</h1>
        <p style="color: #c5d4cd; font-size: 20px; line-height: 1.6; margin: 24px 0 32px">จัดการเมนู โปรโมชัน และการตั้งค่าร้าน<br />ได้ครบในพื้นที่เดียว</p>
        <div class="stack" style="gap: 18px; color: #e8efeb">
          <div class="row"><UtensilsCrossed :size="22" color="#e0a98e" />ปรับเมนูและราคาได้ทันที</div>
          <div class="row"><BadgePercent :size="22" color="#e0a98e" />สร้างโปรให้ตรงกับช่วงเวลาขาย</div>
          <div class="row"><ShieldCheck :size="22" color="#e0a98e" />ตั้งค่าร้านอย่างมั่นใจ</div>
        </div>
      </div>
      <small style="color: #a9bdb4">ร้านเดียว ดูแลได้ครบ · {{ shop }}</small>
    </aside>
    <main style="display: grid; place-items: center; padding: 24px">
      <form style="width: 100%; max-width: 440px" @submit.prevent="login">
        <h1 style="font-size: 30px">เข้าสู่ระบบเจ้าของร้าน</h1>
        <p class="muted" style="margin: 10px 0 28px">จัดการข้อมูลร้านด้วยบัญชีเจ้าของร้าน</p>
        <div class="stack" style="gap: 18px">
          <label class="field"><span>ชื่อผู้ใช้ (อีเมล)</span><input v-model="email" type="email" autocomplete="username" required /></label>
          <label class="field"><span>รหัสผ่าน</span><input v-model="password" type="password" autocomplete="current-password" required /></label>
          <div v-if="error" class="notice danger">{{ error }}</div>
          <button class="big" :disabled="busy"><Loader2 v-if="busy" class="spin" :size="22" /><ArrowRight v-else :size="22" />{{ busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}</button>
        </div>
        <p class="muted small" style="text-align: center; margin-top: 24px; line-height: 1.7">สำหรับเจ้าของร้านเท่านั้น<br />แคชเชียร์เข้าสู่ระบบด้วย PIN ที่หน้าร้าน</p>
      </form>
    </main>
  </div>
</template>
