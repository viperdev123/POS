<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ask } from '../../lib/confirm'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, GripVertical, Info, Plus } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'

const router = useRouter()
type Cat = { id: string; name: string; sort_order: number; count: number }
const cats = ref<Cat[]>([])
const name = ref('')
const editing = ref('')
const editName = ref('')
const err = ref('')
const loaded = ref(false)
let dragFrom = -1

async function load() {
  const { data } = await supabase.from('categories').select('id, name, sort_order, menu_items(count)').order('sort_order').order('name')
  cats.value = (data ?? []).map((c: any) => ({ id: c.id, name: c.name, sort_order: c.sort_order, count: c.menu_items?.[0]?.count ?? 0 }))
  loaded.value = true
}
onMounted(load)

async function add() {
  if (!name.value.trim()) return
  const { error } = await supabase.from('categories').insert({ name: name.value.trim(), sort_order: cats.value.length })
  if (error) err.value = error.message
  name.value = ''
  await load()
}
async function rename(c: Cat) {
  if (editName.value.trim() && editName.value !== c.name) await supabase.from('categories').update({ name: editName.value.trim() }).eq('id', c.id)
  editing.value = ''
  await load()
}
async function remove(c: Cat) {
  if (c.count) { err.value = 'ก่อนลบหมวดหมู่ที่มีเมนู ให้ย้ายเมนูไปยังหมวดหมู่อื่นก่อน'; return }
  if (!(await ask({ title: `ลบหมวด "${c.name}"?`, message: 'ลบแล้วย้อนกลับไม่ได้', confirmLabel: 'ลบหมวดหมู่', danger: true }))) return
  await supabase.from('categories').delete().eq('id', c.id)
  err.value = ''
  await load()
}
// drag to reorder: one upsert saves the whole order
async function drop(to: number) {
  if (dragFrom < 0 || dragFrom === to) return
  const [moved] = cats.value.splice(dragFrom, 1)
  cats.value.splice(to, 0, moved)
  dragFrom = -1
  cats.value.forEach((c, n) => (c.sort_order = n))
  await supabase.from('categories').upsert(cats.value.map((c) => ({ id: c.id, name: c.name, sort_order: c.sort_order })))
}
</script>

<template>
  <div class="row spread wrap" style="margin-bottom: 24px">
    <div><h1>จัดการหมวดหมู่</h1><p class="muted" style="margin-top: 6px">จัดกลุ่มเมนูให้แคชเชียร์ค้นหาและรับออเดอร์ได้เร็วขึ้น</p></div>
    <button class="secondary" @click="router.push('/owner/menu')"><ArrowLeft :size="20" />กลับไปเมนูอาหาร</button>
  </div>
  <div class="split" style="--side: 380px">
    <div class="card">
      <div class="row spread" style="margin-bottom: 16px"><h2>หมวดหมู่ของร้าน</h2><span class="pill grey">{{ cats.length }} หมวดหมู่</span></div>
      <div v-for="(c, n) in cats" :key="c.id" class="row" draggable="true" style="background: #f3f4f4; border-radius: 14px; padding: 14px 16px; margin-bottom: 10px"
        @dragstart="dragFrom = n" @dragover.prevent @drop.prevent="drop(n)">
        <GripVertical :size="20" color="#9aa5a1" style="cursor: grab" />
        <template v-if="editing === c.id"><input v-model="editName" style="flex: 1" @keydown.enter="rename(c)" /><button @click="rename(c)">บันทึก</button></template>
        <template v-else>
          <span class="grow" style="font-weight: 500">{{ c.name }}</span><span class="muted small">{{ c.count }} เมนู</span>
          <button class="secondary" @click="editing = c.id; editName = c.name">แก้ไข</button>
          <button class="secondary" @click="remove(c)">ลบ</button>
        </template>
      </div>
      <p v-if="!loaded" class="loading-text"><Loader2 class="spin" :size="22" />กำลังโหลดหมวดหมู่...</p>
      <p class="muted small">ลากเพื่อจัดลำดับที่แสดงในแท็บเมนู</p>
    </div>
    <div class="card stack">
      <h2>เพิ่มหมวดหมู่</h2>
      <label class="field"><span>ชื่อหมวดหมู่ *</span><input v-model="name" placeholder="พิมพ์ชื่อหมวดหมู่ใหม่" @keydown.enter="add" /></label>
      <button class="big" @click="add"><Plus :size="22" />เพิ่มหมวดหมู่</button>
      <div class="notice warn"><Info :size="20" />ก่อนลบหมวดหมู่ที่มีเมนู ให้ย้ายเมนูไปยังหมวดหมู่อื่นก่อน</div>
      <div v-if="err" class="notice danger">{{ err }}</div>
    </div>
  </div>
</template>
