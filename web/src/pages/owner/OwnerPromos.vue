<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { BadgePercent, Clock, Gift, Info, Plus, UtensilsCrossed } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import { loadMenu, type MenuItem } from '../../lib/owner'
import { describePromo, PROMO_TYPES, type PromoType } from '../../lib/promo'

const router = useRouter()
type Row = { id: string; name: string; type: PromoType; config: any; is_active: boolean }
const rows = ref<Row[]>([])
const menu = ref<MenuItem[]>([])
const err = ref('')
const loaded = ref(false)
const ICON = { happy_hour: Clock, bogo: Gift, spend_x_get_y: BadgePercent, set_menu: UtensilsCrossed }

onMounted(async () => {
  const [p, m] = await Promise.all([supabase.from('promotions').select('*').order('name'), loadMenu()])
  rows.value = (p.data ?? []) as Row[]
  menu.value = m.items
  loaded.value = true
})
const nameOf = (id: string) => menu.value.find((m) => m.id === id)?.name ?? '(เมนูถูกลบ)'
const activeCount = computed(() => rows.value.filter((r) => r.is_active).length)

async function toggle(r: Row) {
  const next = !r.is_active
  r.is_active = next
  const { error } = await supabase.from('promotions').update({ is_active: next }).eq('id', r.id)
  if (error) { r.is_active = !next; err.value = error.message }
}
</script>

<template>
  <div class="row spread" style="margin-bottom: 24px">
    <div><h1>โปรโมชัน</h1><p class="muted" style="margin-top: 6px">สร้างข้อเสนอที่เหมาะกับร้าน เปิดใช้งานได้ตามต้องการ</p></div>
    <button @click="router.push('/owner/promos/new')"><Plus :size="20" />สร้างโปรโมชัน</button>
  </div>
  <div class="notice warn" style="margin-bottom: 20px"><Info :size="20" />ส่วนลดจากโปรโมชันและโค้ด ใช้ได้อย่างเดียวต่อบิล แคชเชียร์เลือกโปรที่เข้าเงื่อนไขได้ 1 รายการ</div>
  <div v-if="err" class="notice danger" style="margin-bottom: 16px">{{ err }}</div>
  <div class="card">
    <div class="row spread" style="margin-bottom: 16px"><h2>โปรโมชันทั้งหมด</h2><span class="pill">เปิดใช้ {{ activeCount }} จาก {{ rows.length }}</span></div>
    <div v-for="r in rows" :key="r.id" class="row" style="background: #f3f4f4; border-radius: 16px; padding: 18px 20px; margin-bottom: 12px">
      <div style="width: 52px; height: 52px; border-radius: 14px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center"><component :is="ICON[r.type]" :size="24" /></div>
      <div class="grow"><div class="row"><strong style="font-size: 20px">{{ r.name }}</strong><small class="muted" style="font-weight: 500">{{ PROMO_TYPES[r.type] }}</small></div><div class="muted">{{ describePromo(r.type, r.config, nameOf) }}</div></div>
      <label class="row small muted"><input class="switch" type="checkbox" :checked="r.is_active" @change="toggle(r)" />{{ r.is_active ? 'เปิดใช้' : 'ปิดใช้' }}</label>
      <button class="secondary" @click="router.push(`/owner/promos/${r.id}`)">แก้ไข</button>
    </div>
    <p v-if="!loaded" class="loading-text"><Loader2 class="spin" :size="22" />กำลังโหลดโปรโมชัน...</p>
    <p v-else-if="!rows.length" class="muted">ยังไม่มีโปรโมชัน</p>
  </div>
</template>
