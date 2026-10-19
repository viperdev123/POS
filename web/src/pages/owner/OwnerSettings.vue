<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ask } from '../../lib/confirm'
import { onMounted, ref } from 'vue'
import { Check, Copy, Info, RefreshCw } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import { pos } from '../../lib/api'

const f = ref({ shop_name: '', shop_address: '', table_count: 10 })
const saved = ref({ shop_name: '', shop_address: '', table_count: 10 })
const token = ref<string | null>(null)
const msg = ref('')
const pin = ref('')
const pin2 = ref('')
const pinMsg = ref('')
const pinOk = ref(false)
const linkMsg = ref('')
const copied = ref(false)
const loading = ref(true)
const saving = ref(false)
const pinBusy = ref(false)
const linkBusy = ref(false)

onMounted(async () => {
  const { data } = await supabase.from('settings').select('shop_name, shop_address, table_count, kitchen_token').eq('id', 1).single()
  if (!data) return
  f.value = { shop_name: data.shop_name, shop_address: data.shop_address, table_count: data.table_count }
  saved.value = { ...f.value }
  token.value = data.kitchen_token
  loading.value = false
})

const link = () => (token.value ? `${location.origin}/kitchen?t=${token.value}` : '')

async function save() {
  msg.value = ''
  if (!f.value.shop_name.trim() || !(f.value.table_count >= 1)) { msg.value = 'กรอกชื่อร้านและจำนวนโต๊ะ'; return }
  saving.value = true
  const { error } = await supabase.from('settings').update({ shop_name: f.value.shop_name.trim(), shop_address: f.value.shop_address, table_count: f.value.table_count }).eq('id', 1)
  saving.value = false
  msg.value = error ? 'บันทึกไม่สำเร็จ: ' + error.message : 'บันทึกข้อมูลร้านแล้ว'
  if (!error) { saved.value = { ...f.value }; localStorage.setItem('pos_shop', f.value.shop_name.trim()) }
}

async function changePin() {
  pinOk.value = false
  if (pin.value !== pin2.value) { pinMsg.value = 'PIN ทั้งสองช่องไม่ตรงกัน'; return }
  if (!(await ask({ title: 'เปลี่ยน PIN แคชเชียร์?', message: 'แคชเชียร์ต้องใช้ PIN ใหม่ในการเข้าสู่ระบบครั้งถัดไป', confirmLabel: 'เปลี่ยน PIN' }))) return
  pinBusy.value = true
  try {
    await pos('set_cashier_pin', { pin: pin.value })
    pin.value = pin2.value = ''
    pinOk.value = true
    pinMsg.value = 'เปลี่ยน PIN แล้ว (แคชเชียร์ที่ล็อกอินอยู่ใช้ต่อได้จนกว่า session หมดอายุ)'
  } catch (e) {
    pinMsg.value = (e as Error).message
  }
  pinBusy.value = false
}

async function newLink() {
  if (token.value && !(await ask({ title: 'สร้างลิงก์ครัวใหม่?', message: 'ลิงก์เก่าจะใช้ไม่ได้ทันที ต้องเปิดลิงก์ใหม่บนอุปกรณ์ครัวทุกเครื่อง', confirmLabel: 'สร้างลิงก์ใหม่', danger: true }))) return
  linkBusy.value = true
  try {
    token.value = (await pos<{ token: string }>('rotate_kitchen_token')).token
    linkMsg.value = ''
  } catch (e) {
    linkMsg.value = (e as Error).message
  }
  linkBusy.value = false
}
async function copy() {
  await navigator.clipboard.writeText(link())
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <h1>ตั้งค่า</h1>
  <p v-if="loading" class="loading-text"><Loader2 class="spin" :size="22" />กำลังโหลดการตั้งค่า...</p>
  <p class="muted" style="margin: 6px 0 24px">ข้อมูลร้าน ความปลอดภัย และการเชื่อมต่อจอครัว</p>
  <div style="display: grid; grid-template-columns: 1fr 460px; gap: 24px; align-items: start">
    <div class="stack" style="gap: 24px">
      <div class="card stack" style="gap: 18px">
        <h2>ข้อมูลร้าน</h2>
        <div class="row" style="align-items: stretch">
          <label class="field grow"><span>ชื่อร้าน *</span><input v-model="f.shop_name" /></label>
          <label class="field" style="width: 220px"><span>จำนวนโต๊ะ *</span><input v-model.number="f.table_count" type="number" min="1" max="99" /><small class="muted">เลขโต๊ะ 1–{{ f.table_count || 0 }}</small></label>
        </div>
        <label class="field"><span>ที่อยู่ร้าน (แสดงบนใบเสร็จ)</span><textarea v-model="f.shop_address" style="min-height: 72px" /></label>
      </div>
      <div class="card stack" style="gap: 18px">
        <div class="row spread"><h2>เปลี่ยน PIN แคชเชียร์</h2><span class="pill grey">6 หลัก</span></div>
        <div class="row" style="align-items: stretch">
          <label class="field grow"><span>PIN ใหม่</span><input v-model="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" /></label>
          <label class="field grow"><span>ยืนยัน PIN ใหม่</span><input v-model="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="off" /></label>
        </div>
        <div><button class="secondary" :disabled="pin.length < 6 || pinBusy" @click="changePin"><Loader2 v-if="pinBusy" class="spin" :size="20" />{{ pinBusy ? 'กำลังเปลี่ยน...' : 'เปลี่ยน PIN' }}</button></div>
        <div v-if="pinMsg" class="notice" :class="pinOk ? 'success' : 'danger'">{{ pinMsg }}</div>
      </div>
    </div>

    <div class="card stack" style="gap: 16px">
      <h2>ลิงก์จอครัว</h2>
      <p class="muted">เปิดลิงก์บนแท็บเล็ตที่ครัวได้โดยไม่ต้องเข้าสู่ระบบ</p>
      <span class="pill" :class="token ? '' : 'warn'" style="align-self: flex-start">{{ token ? 'ลิงก์ปัจจุบันพร้อมใช้งาน' : 'ยังไม่มีลิงก์ครัว' }}</span>
      <label v-if="token" class="field"><span>ลิงก์สำหรับจอครัว</span><input :value="link()" readonly style="font-size: 14px" /></label>
      <button v-if="token" class="secondary" @click="copy"><Copy :size="20" />{{ copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์' }}</button>
      <hr style="border: 0; border-top: 1px solid var(--border); width: 100%" />
      <div class="notice warn"><Info :size="20" /><div><b>ลิงก์เก่าจะใช้ไม่ได้ทันที</b>เมื่อสร้างลิงก์ใหม่ ต้องเปิดลิงก์ใหม่บนอุปกรณ์ครัวทุกครั้ง</div></div>
      <button class="big" :disabled="linkBusy" @click="newLink"><Loader2 v-if="linkBusy" class="spin" :size="22" /><RefreshCw v-else :size="22" />{{ linkBusy ? 'กำลังสร้าง...' : 'สร้างลิงก์ครัวใหม่' }}</button>
      <p class="muted small">ควรสร้างใหม่เมื่อลิงก์เดิมถูกส่งต่อ หรือเปลี่ยนอุปกรณ์ที่ครัว</p>
      <div v-if="linkMsg" class="notice danger">{{ linkMsg }}</div>
    </div>
  </div>
  <div v-if="msg" class="notice" :class="msg.startsWith('บันทึกข้อมูล') ? 'success' : 'danger'" style="margin-top: 16px">{{ msg }}</div>
  <div class="row" style="justify-content: flex-end; margin-top: 24px">
    <button class="secondary" @click="f = { ...saved }">ยกเลิก</button><button :disabled="saving || loading" @click="save"><Loader2 v-if="saving" class="spin" :size="20" /><Check v-else :size="20" />{{ saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลร้าน' }}</button>
  </div>
</template>
