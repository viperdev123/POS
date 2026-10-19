<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ask } from '../../lib/confirm'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, CircleCheck, Info, Shuffle } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import { loadMenu, type Category, type MenuItem } from '../../lib/owner'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string | undefined
const menu = ref<MenuItem[]>([])
const cats = ref<Category[]>([])
const msg = ref('')
const busy = ref(false)
const loading = ref(!!id)
const f = ref({
  code: '', kind: 'baht' as 'percent' | 'baht', value: null as number | null, min_total: null as number | null, expires: '', max_uses: null as number | null,
  dine_in: true, takeaway: true, scope: 'whole' as 'whole' | 'items' | 'categories', menuIds: [] as string[], catIds: [] as string[], is_active: true,
})

onMounted(async () => {
  const [m, c] = await Promise.all([loadMenu(), id ? supabase.from('discount_codes').select('*').eq('id', id).single() : Promise.resolve(null)])
  menu.value = m.items
  cats.value = m.categories
  const d: any = c?.data
  if (d) Object.assign(f.value, {
    code: d.code, kind: d.kind, value: Number(d.value), min_total: d.min_total == null ? null : Number(d.min_total), max_uses: d.max_uses, is_active: d.is_active,
    expires: d.expires_at ? new Date(d.expires_at).toISOString().slice(0, 10) : '',
    dine_in: !d.channels || d.channels.includes('dine_in'), takeaway: !d.channels || d.channels.includes('takeaway'),
    scope: d.menu_item_ids?.length ? 'items' : d.category_ids?.length ? 'categories' : 'whole', menuIds: d.menu_item_ids ?? [], catIds: d.category_ids ?? [],
  })
  loading.value = false
})

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
  f.value.code = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => chars[x % chars.length]).join('')
}
const toggle = (list: string[], v: string) => (list.includes(v) ? list.splice(list.indexOf(v), 1) : list.push(v))

const sentence = computed(() => {
  const v = f.value
  const off = v.kind === 'percent' ? `${v.value ?? 0}%` : `${v.value ?? 0} บาท`
  const names = v.scope === 'items' ? v.menuIds.map((i) => menu.value.find((m) => m.id === i)?.name).filter(Boolean).join(', ') : v.scope === 'categories' ? v.catIds.map((i) => cats.value.find((c) => c.id === i)?.name).filter(Boolean).join(', ') : ''
  const where = v.scope === 'whole' ? 'ทั้งบิล' : (v.scope === 'items' ? 'เมนู' : 'หมวด') + (names || '—') + ' เมื่อพบในบิล'
  return `ลด ${off} ${where} ${v.min_total ? 'เมื่อยอดครบ ' + v.min_total + ' บาท' : 'ไม่มียอดขั้นต่ำ'}`
})

async function save() {
  const v = f.value
  if (!v.code.trim() || !(v.value && v.value > 0)) { msg.value = 'กรอกโค้ดและมูลค่าส่วนลด'; return }
  if (v.kind === 'percent' && v.value > 100) { msg.value = 'เปอร์เซ็นต์ต้องไม่เกิน 100'; return }
  if (!v.dine_in && !v.takeaway) { msg.value = 'เลือกอย่างน้อย 1 ช่องทาง'; return }
  if (v.scope === 'items' && !v.menuIds.length) { msg.value = 'เลือกเมนูที่ใช้โค้ดได้'; return }
  if (v.scope === 'categories' && !v.catIds.length) { msg.value = 'เลือกหมวดหมู่ที่ใช้โค้ดได้'; return }
  busy.value = true
  const row = {
    code: v.code.trim(), kind: v.kind, value: v.value, min_total: v.min_total || null, max_uses: v.max_uses || null, is_active: v.is_active,
    expires_at: v.expires ? new Date(v.expires + 'T23:59:59').toISOString() : null, // valid through the whole expiry day
    channels: v.dine_in && v.takeaway ? null : [v.dine_in ? 'dine_in' : 'takeaway'],
    menu_item_ids: v.scope === 'items' ? v.menuIds : null, category_ids: v.scope === 'categories' ? v.catIds : null,
  }
  const { error } = id ? await supabase.from('discount_codes').update(row).eq('id', id) : await supabase.from('discount_codes').insert(row)
  if (error) { msg.value = error.code === '23505' ? 'มีโค้ดนี้อยู่แล้ว' : error.message; busy.value = false; return }
  router.push('/owner/codes')
}
async function remove() {
  if (!id) return
  if (!(await ask({ title: 'ลบโค้ดนี้?', message: 'โค้ดที่เคยถูกใช้ในบิลแล้วจะลบไม่ได้ (ให้ปิดใช้งานแทน)', confirmLabel: 'ลบโค้ด', danger: true }))) return
  const { error } = await supabase.from('discount_codes').delete().eq('id', id)
  if (error) msg.value = 'ลบไม่ได้ (โค้ดถูกใช้ในบิลแล้ว) ให้ปิดใช้งานแทน'
  else router.push('/owner/codes')
}
</script>

<template>
  <p v-if="loading" class="loading-text"><Loader2 class="spin" :size="22" />กำลังโหลดข้อมูลโค้ด...</p>
  <div class="row spread wrap" style="margin-bottom: 24px">
    <div><h1>{{ id ? 'แก้ไขโค้ดส่วนลด' : 'สร้างโค้ดส่วนลด' }}</h1><p class="muted" style="margin-top: 6px">ระบุส่วนลด ข้อจำกัด และรายการที่ใช้โค้ดได้</p></div>
    <button class="secondary" @click="router.push('/owner/codes')">กลับไปโค้ดส่วนลด</button>
  </div>
  <div class="split" style="--side: 420px">
    <div class="card stack" style="gap: 20px">
      <h2>ข้อมูลโค้ด</h2>
      <div class="row wrap" style="align-items: stretch"><label class="field grow"><span>โค้ดส่วนลด *</span><input v-model="f.code" /></label><button class="secondary" @click="randomCode"><Shuffle :size="20" />สุ่มโค้ด</button></div>
      <div class="row wrap" style="align-items: stretch">
        <div class="stack" style="gap: 6px"><strong class="small">ประเภทส่วนลด *</strong><div class="seg"><button :class="{ on: f.kind === 'baht' }" @click="f.kind = 'baht'">จำนวนเงิน (บาท)</button><button :class="{ on: f.kind === 'percent' }" @click="f.kind = 'percent'">เปอร์เซ็นต์ (%)</button></div></div>
        <label class="field grow"><span>มูลค่าส่วนลด *</span><input v-model.number="f.value" type="number" min="0" step="0.01" /></label>
      </div>
      <div class="row wrap" style="align-items: stretch">
        <label class="field grow"><span>ยอดขั้นต่ำ (บาท)</span><input v-model.number="f.min_total" type="number" min="0" placeholder="0" /></label>
        <label class="field grow"><span>วันหมดอายุ (เว้นว่าง = ไม่หมดอายุ)</span><input v-model="f.expires" type="date" /></label>
      </div>
      <label class="field"><span>จำกัดการใช้ทั้งหมด (ครั้ง) · เว้นว่าง = ไม่จำกัด</span><input v-model.number="f.max_uses" type="number" min="1" /></label>
      <div class="notice success"><CircleCheck :size="20" />{{ sentence }}</div>
    </div>

    <div class="card stack">
      <h2>เงื่อนไขการใช้</h2>
      <strong class="small">ช่องทางที่ใช้ได้ *</strong>
      <div class="row" style="gap: 24px"><label class="row" style="gap: 8px"><input v-model="f.dine_in" type="checkbox" style="width: 22px; min-height: 22px" />นั่งทาน</label><label class="row" style="gap: 8px"><input v-model="f.takeaway" type="checkbox" style="width: 22px; min-height: 22px" />กลับบ้าน</label></div>
      <hr style="border: 0; border-top: 1px solid var(--border); width: 100%" />
      <label class="field"><span>ใช้ส่วนลดกับ *</span><select v-model="f.scope"><option value="whole">ทั้งบิล</option><option value="items">เมนูที่กำหนด</option><option value="categories">หมวดหมู่ที่กำหนด</option></select></label>
      <template v-if="f.scope === 'items'">
        <strong class="small">เมนูเฉพาะ *</strong>
        <label v-for="m in menu" :key="m.id" class="row" style="gap: 10px"><input type="checkbox" :checked="f.menuIds.includes(m.id)" style="width: 22px; min-height: 22px" @change="toggle(f.menuIds, m.id)" />{{ m.name }} <small class="muted">· ทุกขนาด</small></label>
      </template>
      <template v-if="f.scope === 'categories'">
        <strong class="small">หมวดหมู่เฉพาะ *</strong>
        <label v-for="c in cats" :key="c.id" class="row" style="gap: 10px"><input type="checkbox" :checked="f.catIds.includes(c.id)" style="width: 22px; min-height: 22px" @change="toggle(f.catIds, c.id)" />{{ c.name }}</label>
      </template>
      <span v-if="f.code" class="pill primary" style="align-self: flex-start">{{ f.code }} · ลด {{ f.kind === 'percent' ? f.value + '%' : '฿' + f.value }}</span>
      <label class="row spread"><span class="muted">เปิดใช้งาน</span><input v-model="f.is_active" class="switch" type="checkbox" /></label>
      <div class="notice warn"><Info :size="20" />ใช้ได้อย่างเดียวต่อบิล ไม่สามารถใช้ร่วมกับโปรโมชัน</div>
    </div>
  </div>
  <div v-if="msg" class="notice danger" style="margin-top: 16px">{{ msg }}</div>
  <div class="row spread wrap" style="margin-top: 24px">
    <span class="muted small">ตรวจสอบข้อมูลก่อนบันทึก <button v-if="id" class="link small" style="color: var(--danger); margin-left: 16px" @click="remove">ลบโค้ดนี้</button></span>
    <div class="row"><button class="secondary" @click="router.push('/owner/codes')">ยกเลิก</button><button :disabled="busy || loading" @click="save"><Loader2 v-if="busy" class="spin" :size="20" /><Check v-else :size="20" />{{ busy ? 'กำลังบันทึก...' : id ? 'บันทึกโค้ดส่วนลด' : 'สร้างโค้ดส่วนลด' }}</button></div>
  </div>
</template>
