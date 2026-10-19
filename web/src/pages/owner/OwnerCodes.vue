<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Info, Plus } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import { loadMenu, type Category, type MenuItem } from '../../lib/owner'
import { thDate } from '../../lib/format'

const router = useRouter()
type Row = {
  id: string; code: string; kind: 'percent' | 'baht'; value: number; min_total: number | null; expires_at: string | null
  max_uses: number | null; used_count: number; channels: string[] | null; menu_item_ids: string[] | null; category_ids: string[] | null; is_active: boolean
}
const rows = ref<Row[]>([])
const menu = ref<MenuItem[]>([])
const cats = ref<Category[]>([])
const q = ref('')
const status = ref('')
const loaded = ref(false)

onMounted(async () => {
  const [c, m] = await Promise.all([supabase.from('discount_codes').select('*').order('code'), loadMenu()])
  rows.value = (c.data ?? []) as Row[]
  menu.value = m.items
  cats.value = m.categories
  loaded.value = true
})

const stateOf = (r: Row) =>
  !r.is_active ? 'off' : r.expires_at && new Date(r.expires_at) < new Date() ? 'expired' : r.max_uses != null && r.used_count >= r.max_uses ? 'full' : 'on'
const STATE = { on: ['ใช้งาน', ''], off: ['ปิดใช้', 'grey'], expired: ['หมดอายุ', 'danger'], full: ['ครบจำนวน', 'warn'] } as const
const shown = computed(() => rows.value.filter((r) => (!q.value.trim() || r.code.toLowerCase().includes(q.value.trim().toLowerCase())) && (!status.value || stateOf(r) === status.value)))
const activeCount = computed(() => rows.value.filter((r) => stateOf(r) === 'on').length)
const used = computed(() => rows.value.reduce((t, r) => t + r.used_count, 0))

const scope = (r: Row) =>
  r.menu_item_ids?.length ? 'เฉพาะ' + r.menu_item_ids.map((id) => menu.value.find((m) => m.id === id)?.name ?? '(เมนูถูกลบ)').join(', ')
  : r.category_ids?.length ? 'หมวด' + r.category_ids.map((id) => cats.value.find((c) => c.id === id)?.name ?? '(หมวดถูกลบ)').join(', ') : 'ทุกเมนู'
const detail = (r: Row) => `${r.min_total ? 'ยอดขั้นต่ำ ฿' + Number(r.min_total) : 'ไม่มียอดขั้นต่ำ'} · ${!r.channels ? 'นั่งทาน / กลับบ้าน' : r.channels[0] === 'dine_in' ? 'นั่งทานเท่านั้น' : 'กลับบ้านเท่านั้น'}`
</script>

<template>
  <div class="row spread" style="margin-bottom: 24px">
    <div><h1>โค้ดส่วนลด</h1><p class="muted" style="margin-top: 6px">กำหนดสิทธิ์ เงื่อนไข และจำนวนครั้งที่ใช้ได้</p></div>
    <button @click="router.push('/owner/codes/new')"><Plus :size="20" />สร้างโค้ดส่วนลด</button>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px">
    <div class="card"><span class="muted small">โค้ดทั้งหมด</span><div style="font-size: 32px; font-weight: 700; margin-top: 6px">{{ rows.length }} โค้ด</div></div>
    <div class="card"><span class="muted small">กำลังใช้งาน</span><div style="font-size: 32px; font-weight: 700; margin-top: 6px">{{ activeCount }} โค้ด</div></div>
    <div class="card"><span class="muted small">ใช้สิทธิ์แล้ว</span><div style="font-size: 32px; font-weight: 700; margin-top: 6px">{{ used }} ครั้ง</div></div>
  </div>
  <div class="card">
    <div class="row" style="align-items: stretch; margin-bottom: 20px">
      <label class="field grow"><span>ค้นหาโค้ด</span><input v-model="q" placeholder="พิมพ์โค้ดส่วนลด..." /></label>
      <label class="field" style="width: 280px"><span>สถานะ</span><select v-model="status"><option value="">ทุกสถานะ</option><option value="on">ใช้งาน</option><option value="off">ปิดใช้</option><option value="expired">หมดอายุ</option><option value="full">ครบจำนวน</option></select></label>
    </div>
    <div class="row small muted" style="background: #f3f4f4; border-radius: 12px; padding: 14px 16px; font-weight: 500">
      <span style="flex: 2">โค้ด</span><span style="flex: 4">ชนิด / เงื่อนไข</span><span style="flex: 2">ใช้แล้ว / จำกัด</span><span style="flex: 2">หมดอายุ</span><span style="flex: 1.5">สถานะ</span><span style="width: 90px">จัดการ</span>
    </div>
    <div v-for="r in shown" :key="r.id" class="row" style="padding: 18px 16px; border-bottom: 1px solid var(--border)">
      <strong style="flex: 2; font-size: 22px; color: var(--primary)">{{ r.code }}</strong>
      <div style="flex: 4"><strong>ลด {{ r.kind === 'percent' ? Number(r.value) + '%' : '฿' + Number(r.value) }} · {{ scope(r) }}</strong><div class="muted small">{{ detail(r) }}</div></div>
      <span style="flex: 2">{{ r.used_count }} / {{ r.max_uses ?? '∞' }}</span>
      <span style="flex: 2">{{ r.expires_at ? thDate(r.expires_at) : 'ไม่มี' }}</span>
      <span style="flex: 1.5"><span class="pill" :class="STATE[stateOf(r)][1]">{{ STATE[stateOf(r)][0] }}</span></span>
      <button class="secondary" style="width: 90px" @click="router.push(`/owner/codes/${r.id}`)">แก้ไข</button>
    </div>
    <p v-if="!loaded" class="loading-text" style="padding: 24px 16px"><Loader2 class="spin" :size="22" />กำลังโหลดโค้ด...</p>
    <p v-else-if="!shown.length" class="muted" style="padding: 24px 16px">ไม่พบโค้ด</p>
    <p class="muted small" style="margin-top: 16px">แสดง {{ shown.length }} จาก {{ rows.length }} โค้ด</p>
  </div>
  <div class="notice warn" style="margin-top: 20px"><Info :size="20" />โค้ดส่วนลดและโปรโมชัน ใช้ได้อย่างเดียวต่อบิล ระบบตรวจสอบเงื่อนไขก่อนให้แคชเชียร์เลือกใช้</div>
</template>
