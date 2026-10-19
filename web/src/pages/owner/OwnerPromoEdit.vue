<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Info, Plus } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import { imageUrl, loadMenu, type MenuItem } from '../../lib/owner'
import { PROMO_TYPES, type PromoType } from '../../lib/promo'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string | undefined
const menu = ref<MenuItem[]>([])
const q = ref('')
const msg = ref('')
const busy = ref(false)
const loading = ref(!!id)
// Mon..Sun as shown in the design, mapped to JS getDay() numbers
const DAY_COLS = [['จ.', 1], ['อ.', 2], ['พ.', 3], ['พฤ.', 4], ['ศ.', 5], ['ส.', 6], ['อา.', 0]] as const

const f = ref({
  name: '', type: 'bogo' as PromoType, ids: [] as string[], kind: 'percent' as 'percent' | 'baht', value: null as number | null,
  start: '14:00', end: '17:00', days: [0, 1, 2, 3, 4, 5, 6] as number[], min_total: null as number | null,
  setItems: [{ menu_item_id: '', size_name: null as string | null }, { menu_item_id: '', size_name: null as string | null }], price: null as number | null, is_active: true,
})

onMounted(async () => {
  const [m, p] = await Promise.all([loadMenu(), id ? supabase.from('promotions').select('*').eq('id', id).single() : Promise.resolve(null)])
  menu.value = m.items
  const d: any = p?.data
  if (d) {
    const c = d.config ?? {}
    Object.assign(f.value, { name: d.name, type: d.type, is_active: d.is_active, ids: c.menu_item_ids ?? [], kind: c.kind ?? 'percent', value: c.value ?? null, start: c.start ?? '14:00', end: c.end ?? '17:00', days: c.weekdays?.length ? c.weekdays : [0, 1, 2, 3, 4, 5, 6], min_total: c.min_total ?? null, price: c.price ?? null })
    if (c.items) f.value.setItems = c.items.map((i: any) => ({ menu_item_id: i.menu_item_id, size_name: i.size_name }))
  }
  loading.value = false
})

const item = (mid: string) => menu.value.find((m) => m.id === mid)
const unit = (m?: MenuItem, size?: string | null) => (m ? Number(m.has_sizes ? (m.menu_sizes.find((s) => s.name === size) ?? m.menu_sizes[0])?.price : m.price) : 0)
const shown = computed(() => menu.value.filter((m) => !q.value.trim() || m.name.includes(q.value.trim())))
const picked = computed(() => f.value.ids.map(item).filter(Boolean) as MenuItem[])
const setList = computed(() => f.value.setItems.filter((s) => s.menu_item_id))
const setNormal = computed(() => setList.value.reduce((t, s) => t + unit(item(s.menu_item_id), s.size_name), 0))
const disc = computed(() => (f.value.kind === 'percent' ? `${f.value.value ?? 0}%` : `฿${f.value.value ?? 0}`))
const first = computed(() => unit(picked.value[0]))
const afterHH = computed(() => (f.value.kind === 'percent' ? first.value * (1 - (f.value.value ?? 0) / 100) : Math.max(0, first.value - (f.value.value ?? 0))))
const days = computed(() => (f.value.days.length === 7 ? 'ทุกวัน' : DAY_COLS.filter(([, n]) => f.value.days.includes(n)).map(([l]) => l).join(' ')))

const summary = computed(() => {
  const v = f.value
  const names = picked.value.map((m) => m.name).join(', ')
  if (v.type === 'bogo') return [`ซื้อ${names || 'เมนูที่ร่วมรายการ'} 1 แถม 1`, `เมนูร่วมรายการ ${picked.value.length} เมนู`, `มูลค่าปกติ ฿${first.value * 2} · ชำระ ฿${first.value}`]
  if (v.type === 'happy_hour') return [`ลด ${disc.value} เฉพาะ${names || '—'}`, `${days.value} เวลา ${v.start}–${v.end}`, `ราคาปกติ ฿${first.value} → เหลือ ฿${Math.round(afterHH.value * 100) / 100} ต่อชิ้น`]
  if (v.type === 'spend_x_get_y') return [`ยอดรายการครบ ฿${v.min_total ?? 0} ลด ${disc.value}`, 'ทุกเมนู · นั่งทานและกลับบ้าน', `ตัวอย่าง: ฿${(v.min_total ?? 0) + 50} → ชำระ ฿${(v.min_total ?? 0) + 50 - (v.kind === 'percent' ? ((v.min_total ?? 0) + 50) * ((v.value ?? 0) / 100) : v.value ?? 0)}`]
  return [...setList.value.map((s) => `${item(s.menu_item_id)?.name} · ${s.size_name ?? 'ปกติ'} ×1`), `ราคาปกติ ฿${setNormal.value} → ราคาเซ็ต ฿${v.price ?? 0}`, 'ขนาดในเซ็ตคงที่ ไม่สามารถสลับได้']
})

function toggleId(mid: string) {
  const i = f.value.ids.indexOf(mid)
  if (i >= 0) f.value.ids.splice(i, 1)
  else f.value.ids.push(mid)
}

function build() {
  const v = f.value
  if (!v.name.trim()) throw new Error('กรุณากรอกชื่อโปรโมชัน')
  if (v.type === 'bogo' && !v.ids.length) throw new Error('เลือกเมนูร่วมรายการอย่างน้อย 1 เมนู')
  if (v.type === 'happy_hour') {
    if (!v.ids.length) throw new Error('เลือกเมนูร่วมรายการอย่างน้อย 1 เมนู')
    if (!v.days.length) throw new Error('เลือกวันที่ใช้งานอย่างน้อย 1 วัน')
  }
  if (v.type !== 'bogo' && v.type !== 'set_menu' && !(v.value && v.value > 0)) throw new Error('กรุณาใส่ส่วนลด')
  if (v.type === 'spend_x_get_y' && !v.min_total) throw new Error('ใส่ยอดซื้อขั้นต่ำ')
  if (v.type === 'set_menu') {
    if (setList.value.length < 2) throw new Error('เซ็ตต้องมีอย่างน้อย 2 รายการ')
    if (setList.value.some((s) => item(s.menu_item_id)?.has_sizes && !s.size_name)) throw new Error('เลือกขนาดของทุกรายการในเซ็ต')
    if (!(v.price && v.price > 0)) throw new Error('ใส่ราคาเซ็ต')
  }
  const weekdays = v.days.length === 7 ? [] : v.days
  switch (v.type) {
    case 'bogo': return { menu_item_ids: v.ids }
    case 'happy_hour': return { menu_item_ids: v.ids, start: v.start, end: v.end, weekdays, kind: v.kind, value: v.value }
    case 'spend_x_get_y': return { min_total: v.min_total, kind: v.kind, value: v.value }
    case 'set_menu': return { items: setList.value.map((s) => ({ menu_item_id: s.menu_item_id, size_name: s.size_name, qty: 1 })), price: v.price }
  }
}

async function save() {
  try {
    const config = build()
    busy.value = true
    const row = { name: f.value.name.trim(), type: f.value.type, config, is_active: f.value.is_active }
    const { error } = id ? await supabase.from('promotions').update(row).eq('id', id) : await supabase.from('promotions').insert(row)
    if (error) throw new Error(error.message)
    router.push('/owner/promos')
  } catch (e) {
    msg.value = (e as Error).message
    busy.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="loading-text"><Loader2 class="spin" :size="22" />กำลังโหลดข้อมูลโปรโมชัน...</p>
  <div class="row spread" style="margin-bottom: 24px">
    <div><h1>{{ id ? 'แก้ไขโปรโมชัน' : 'สร้างโปรโมชัน' }}</h1><p class="muted" style="margin-top: 6px">เลือกประเภทและกำหนดเงื่อนไขก่อนเปิดใช้</p></div>
    <button class="secondary" @click="router.push('/owner/promos')">กลับไปโปรโมชัน</button>
  </div>
  <div class="seg" style="margin-bottom: 24px">
    <button v-for="(label, t) in PROMO_TYPES" :key="t" :class="{ on: f.type === t }" :disabled="!!id && f.type !== t" style="min-height: 56px" @click="f.type = t">{{ label }}</button>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 380px; gap: 24px; align-items: start">
    <div class="card stack" style="gap: 20px">
      <h2>ข้อมูล{{ PROMO_TYPES[f.type] }}</h2>
      <label class="field"><span>ชื่อโปรโมชัน *</span><input v-model="f.name" /></label>

      <template v-if="f.type === 'happy_hour' || f.type === 'spend_x_get_y'">
        <div class="row" style="align-items: stretch">
          <div class="stack" style="gap: 6px"><strong class="small">{{ f.type === 'happy_hour' ? 'รูปแบบส่วนลด' : 'รูปแบบส่วนลด' }}</strong>
            <div class="seg"><button :class="{ on: f.kind === 'percent' }" @click="f.kind = 'percent'">เปอร์เซ็นต์ (%)</button><button :class="{ on: f.kind === 'baht' }" @click="f.kind = 'baht'">จำนวนเงิน (บาท)</button></div></div>
          <label class="field grow"><span>ส่วนลด *</span><input v-model.number="f.value" type="number" min="0" step="0.01" /></label>
        </div>
      </template>
      <label v-if="f.type === 'spend_x_get_y'" class="field"><span>ยอดซื้อขั้นต่ำ (บาท) *</span><input v-model.number="f.min_total" type="number" min="1" /></label>
      <div v-if="f.type === 'spend_x_get_y'" class="notice"><Info :size="20" /><div><b>คำนวณจากยอดรายการก่อนส่วนลด</b>เมื่อบิลมียอดครบ ฿{{ f.min_total ?? 0 }} แคชเชียร์จึงจะเลือกใช้โปรนี้ได้</div></div>

      <template v-if="f.type === 'happy_hour'">
        <div class="row" style="align-items: stretch"><label class="field grow"><span>เวลาเริ่ม *</span><input v-model="f.start" type="time" /></label><label class="field grow"><span>เวลาสิ้นสุด *</span><input v-model="f.end" type="time" /></label></div>
        <div><strong class="small">วันที่ใช้งาน *</strong>
          <div class="row wrap" style="margin-top: 8px; gap: 18px"><label v-for="[l, n] in DAY_COLS" :key="n" class="row" style="gap: 8px"><input v-model="f.days" type="checkbox" :value="n" style="width: 22px; min-height: 22px" />{{ l }}</label></div></div>
      </template>

      <template v-if="f.type === 'bogo' || f.type === 'happy_hour'">
        <label class="field"><span>{{ f.type === 'bogo' ? 'ค้นหาเมนูร่วมรายการ' : 'เมนูร่วมรายการ *' }}</span><input v-model="q" placeholder="ค้นหาชื่อเมนู..." /></label>
        <div v-for="m in shown" :key="m.id" class="row" style="background: #f3f4f4; border-radius: 14px; padding: 12px 16px; cursor: pointer" @click="toggleId(m.id)">
          <img v-if="m.image_path" :src="imageUrl(m.image_path)" alt="" style="width: 72px; height: 56px; border-radius: 10px; object-fit: cover" />
          <div class="grow"><strong>{{ m.name }}</strong><div class="muted small">{{ m.has_sizes ? m.menu_sizes.map((s) => `${s.name} ฿${Number(s.price)}`).join(' / ') : 'ปกติ · ฿' + Number(m.price) }}</div></div>
          <label class="row" style="gap: 8px" @click.stop><input type="checkbox" :checked="f.ids.includes(m.id)" style="width: 22px; min-height: 22px" @change="toggleId(m.id)" />ร่วมรายการ</label>
        </div>
        <div v-if="f.type === 'bogo'" class="notice"><Info :size="20" />ของแถมเป็นเมนูและขนาดเดียวกันกับที่ซื้อ ทุก 2 ชิ้นคิดราคา 1 ชิ้น</div>
        <span class="muted small">เลือกแล้ว {{ f.ids.length }} เมนู · ใช้ได้ทั้งนั่งทานและกลับบ้าน</span>
      </template>

      <template v-if="f.type === 'set_menu'">
        <div v-for="(s, n) in f.setItems" :key="n" class="row" style="align-items: stretch">
          <label class="field grow"><span>เมนู *</span>
            <select v-model="s.menu_item_id" @change="s.size_name = null"><option value="" disabled>เลือกเมนู</option><option v-for="m in menu" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
          <label class="field" style="width: 260px"><span>ขนาดคงที่ *</span>
            <select v-model="s.size_name" :disabled="!item(s.menu_item_id)?.has_sizes"><option :value="null">{{ item(s.menu_item_id)?.has_sizes ? 'เลือกขนาด' : 'ปกติ · ฿' + unit(item(s.menu_item_id)) }}</option>
              <option v-for="z in item(s.menu_item_id)?.menu_sizes ?? []" :key="z.name" :value="z.name">{{ z.name }} · ฿{{ Number(z.price) }}</option></select></label>
          <button class="secondary" @click="f.setItems.splice(n, 1)">ลบ</button>
        </div>
        <div class="row"><button class="secondary" @click="f.setItems.push({ menu_item_id: '', size_name: null })"><Plus :size="20" />เพิ่มเมนูในเซ็ต</button><span class="muted small">{{ setList.length }} รายการ · ราคาปกติ ฿{{ setNormal }}</span></div>
        <label class="field"><span>ราคาเซ็ต (บาท) *</span><input v-model.number="f.price" type="number" min="0" step="0.01" /></label>
      </template>
    </div>

    <div class="card stack">
      <span class="pill primary" style="align-self: flex-start">สรุปเงื่อนไข</span>
      <h2 style="font-size: 26px">{{ PROMO_TYPES[f.type] }}</h2>
      <p class="muted">ชื่อโปร: {{ f.name || '—' }}</p>
      <p v-for="(l, n) in summary" :key="n" class="muted">{{ l }}</p>
      <hr style="border: 0; border-top: 1px solid var(--border); width: 100%" />
      <label class="row spread"><span class="muted">เปิดใช้หลังบันทึก</span><input v-model="f.is_active" class="switch" type="checkbox" /></label>
      <div class="notice warn"><Info :size="20" />ใช้ได้อย่างเดียวต่อบิล ไม่สามารถใช้ร่วมกับโค้ดส่วนลด</div>
    </div>
  </div>

  <div v-if="msg" class="notice danger" style="margin-top: 16px">{{ msg }}</div>
  <div class="row spread" style="margin-top: 24px">
    <span class="muted small">ตรวจสอบข้อมูลก่อนบันทึก</span>
    <div class="row"><button class="secondary" @click="router.push('/owner/promos')">ยกเลิก</button><button :disabled="busy || loading" @click="save"><Loader2 v-if="busy" class="spin" :size="20" /><Check v-else :size="20" />{{ busy ? 'กำลังบันทึก...' : 'บันทึกโปรโมชัน' }}</button></div>
  </div>
</template>
