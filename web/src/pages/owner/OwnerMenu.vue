<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { FolderOpen, Plus } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import { imageUrl, loadMenu, priceLine, type Category, type MenuItem } from '../../lib/owner'

const router = useRouter()
const items = ref<MenuItem[]>([])
const categories = ref<Category[]>([])
const q = ref('')
const cat = ref('')
const err = ref('')
const loaded = ref(false)

onMounted(async () => {
  ;({ items: items.value, categories: categories.value } = await loadMenu())
  loaded.value = true
})

const catName = (id: string | null) => categories.value.find((c) => c.id === id)?.name ?? 'ไม่มีหมวด'
const shown = computed(() => items.value.filter((m) => (!cat.value || m.category_id === cat.value) && (!q.value.trim() || m.name.includes(q.value.trim()))))
const openCount = computed(() => items.value.filter((m) => m.is_active).length)

async function toggle(m: MenuItem) {
  const next = !m.is_active
  m.is_active = next // optimistic
  const { error } = await supabase.from('menu_items').update({ is_active: next }).eq('id', m.id)
  if (error) { m.is_active = !next; err.value = error.message }
}
</script>

<template>
  <div class="row spread wrap" style="margin-bottom: 24px">
    <div><h1>เมนูอาหาร</h1><p class="muted" style="margin-top: 6px">ดูแลเมนู ราคา และสถานะการขายของร้าน</p></div>
    <button @click="router.push('/owner/menu/new')"><Plus :size="20" />เพิ่มเมนู</button>
  </div>

  <div class="grid-stats" style="margin-bottom: 20px">
    <div class="card"><span class="muted small">เมนูทั้งหมด</span><div style="font-size: 32px; font-weight: 700; margin-top: 6px">{{ items.length }} เมนู</div></div>
    <div class="card"><span class="muted small">เปิดขาย</span><div style="font-size: 32px; font-weight: 700; margin-top: 6px">{{ openCount }} เมนู</div></div>
    <div class="card"><span class="muted small">ปิดชั่วคราว</span><div style="font-size: 32px; font-weight: 700; margin-top: 6px">{{ items.length - openCount }} เมนู</div></div>
  </div>

  <div class="card">
    <div class="toolbar">
      <label class="field grow"><span>ค้นหาเมนู</span><input v-model="q" placeholder="ค้นหาจากชื่อเมนู..." /></label>
      <label class="field fixed" style="--w: 280px"><span>หมวดหมู่</span><select v-model="cat"><option value="">ทุกหมวดหมู่</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
      <button class="secondary" @click="router.push('/owner/categories')"><FolderOpen :size="20" />จัดการหมวดหมู่</button>
    </div>
    <div v-if="err" class="notice danger" style="margin-bottom: 12px">{{ err }}</div>

    <div class="table-scroll"><div class="inner">
    <div class="row small muted" style="background: #f3f4f4; border-radius: 12px; padding: 14px 16px; font-weight: 500">
      <span style="flex: 3">เมนูอาหาร</span><span style="flex: 2">หมวดหมู่</span><span style="flex: 3">ขนาด / ราคา</span><span style="flex: 1">เปิดขาย</span><span style="width: 90px">จัดการ</span>
    </div>
    <div v-for="m in shown" :key="m.id" class="row" style="padding: 14px 16px; border-bottom: 1px solid var(--border)">
      <div class="row" style="flex: 3">
        <img v-if="m.image_path" :src="imageUrl(m.image_path)" alt="" loading="lazy" style="width: 64px; height: 56px; border-radius: 10px; object-fit: cover" />
        <div v-else style="width: 64px; height: 56px; border-radius: 10px; background: #e3e6e5" />
        <div><strong>{{ m.name }}</strong><div v-if="!m.is_active" class="muted small">หมดชั่วคราว</div></div>
      </div>
      <span class="muted" style="flex: 2">{{ catName(m.category_id) }}</span>
      <div style="flex: 3"><div>{{ priceLine(m) }}</div><div class="muted small">รวม VAT 7%</div></div>
      <div style="flex: 1"><input class="switch" type="checkbox" :checked="m.is_active" :aria-label="`เปิดขาย ${m.name}`" @change="toggle(m)" /></div>
      <button class="secondary" style="width: 90px" @click="router.push(`/owner/menu/${m.id}`)">แก้ไข</button>
    </div>
    </div></div>
    <p v-if="!loaded" class="loading-text" style="padding: 24px 16px"><Loader2 class="spin" :size="22" />กำลังโหลดเมนู...</p>
    <p v-else-if="!shown.length" class="muted" style="padding: 24px 16px">ไม่พบเมนู</p>
    <div class="row spread" style="margin-top: 16px"><span class="muted small">แสดง {{ shown.length }} จาก {{ items.length }} เมนู · {{ categories.length }} หมวดหมู่</span><span class="pill">อัปเดตไปยังแคชเชียร์อัตโนมัติ</span></div>
  </div>
</template>
