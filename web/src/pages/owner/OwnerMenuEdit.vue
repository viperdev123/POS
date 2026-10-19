<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { ask } from '../../lib/confirm'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Plus, Upload } from 'lucide-vue-next'
import { supabase } from '../../lib/supabase'
import { imageUrl, uploadMenuImage, type Category } from '../../lib/owner'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string | undefined
const categories = ref<Category[]>([])
const f = ref({ name: '', category_id: '', image_path: null as string | null, has_sizes: false, price: null as number | null, is_active: true, sizes: [] as { name: string; price: number | null }[] })
const msg = ref('')
const busy = ref(false)
const dragging = ref(false)
const loading = ref(!!id)
const uploading = ref(false)

onMounted(async () => {
  const [c, m] = await Promise.all([
    supabase.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
    id ? supabase.from('menu_items').select('*, menu_sizes(name, price, sort_order)').eq('id', id).single() : Promise.resolve(null),
  ])
  categories.value = (c.data ?? []) as Category[]
  const d: any = m?.data
  if (d) f.value = { name: d.name, category_id: d.category_id ?? '', image_path: d.image_path, has_sizes: d.has_sizes, price: d.price == null ? null : Number(d.price), is_active: d.is_active, sizes: [...d.menu_sizes].sort((a: any, b: any) => a.sort_order - b.sort_order).map((s: any) => ({ name: s.name, price: Number(s.price) })) }
  else if (!id && categories.value.length === 1) f.value.category_id = categories.value[0].id
  loading.value = false
})

const preview = computed(() => (f.value.has_sizes ? f.value.sizes.filter((s) => s.name && s.price != null).map((s) => `${s.name} ฿${s.price}`).join(' / ') : f.value.price != null ? `฿${f.value.price}` : ''))

async function upload(file?: File) {
  dragging.value = false
  if (!file) return
  uploading.value = true
  try { f.value.image_path = await uploadMenuImage(file); msg.value = '' } catch (e) { msg.value = (e as Error).message }
  uploading.value = false
}

async function save() {
  const v = f.value
  if (!v.name.trim() || !v.category_id) { msg.value = 'กรุณากรอกชื่อเมนูและเลือกหมวดหมู่'; return }
  if (v.has_sizes ? !v.sizes.length || v.sizes.some((s) => !s.name.trim() || s.price == null || s.price < 0) : v.price == null || v.price < 0) { msg.value = v.has_sizes ? 'กรอกชื่อขนาดและราคาให้ครบ' : 'กรุณาใส่ราคา'; return }
  busy.value = true
  const row = { name: v.name.trim(), category_id: v.category_id, image_path: v.image_path, has_sizes: v.has_sizes, price: v.has_sizes ? null : v.price, is_active: v.is_active }
  let itemId = id
  if (id) {
    const { error } = await supabase.from('menu_items').update(row).eq('id', id)
    if (error) { msg.value = error.message; busy.value = false; return }
    await supabase.from('menu_sizes').delete().eq('menu_item_id', id)
  } else {
    const { data, error } = await supabase.from('menu_items').insert(row).select('id').single()
    if (error || !data) { msg.value = error?.message ?? 'บันทึกไม่สำเร็จ'; busy.value = false; return }
    itemId = data.id
  }
  if (v.has_sizes) await supabase.from('menu_sizes').insert(v.sizes.map((s, n) => ({ menu_item_id: itemId, name: s.name.trim(), price: s.price, sort_order: n })))
  router.push('/owner/menu')
}

async function remove() {
  if (!id) return
  if (!(await ask({ title: `ลบเมนู "${f.value.name}"?`, message: 'บิลเก่าไม่กระทบ (เก็บชื่อและราคา ณ ตอนขายไว้แล้ว) แต่เมนูนี้จะหายจากหน้าขายและโปรที่ใช้เมนูนี้', confirmLabel: 'ลบเมนู', danger: true }))) return
  await supabase.from('menu_items').delete().eq('id', id)
  router.push('/owner/menu')
}
</script>

<template>
  <p v-if="loading" class="loading-text"><Loader2 class="spin" :size="22" />กำลังโหลดข้อมูลเมนู...</p>
  <div class="row spread" style="margin-bottom: 24px">
    <div><h1>{{ id ? 'แก้ไขเมนู · ' + f.name : 'เพิ่มเมนู' }}</h1><p class="muted" style="margin-top: 6px">กำหนดชื่อขนาดและราคาเต็มของแต่ละขนาด</p></div>
    <button class="secondary" @click="router.push('/owner/menu')">กลับไปเมนูอาหาร</button>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 380px; gap: 24px; align-items: start">
    <div class="card stack" style="gap: 20px">
      <h2>ข้อมูลเมนู</h2>
      <div class="row" style="align-items: stretch">
        <label class="field grow"><span>ชื่อเมนู *</span><input v-model="f.name" /></label>
        <label class="field" style="width: 280px"><span>หมวดหมู่ *</span><select v-model="f.category_id"><option value="" disabled>เลือกหมวดหมู่</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
      </div>
      <div class="row spread" style="border-bottom: 1px solid var(--border); padding-bottom: 16px">
        <div><strong>มีหลายขนาด</strong><div class="muted small">กำหนดราคาเต็มแยกตามขนาด</div></div>
        <input v-model="f.has_sizes" class="switch" type="checkbox" aria-label="มีหลายขนาด" @change="f.has_sizes && !f.sizes.length && f.sizes.push({ name: '', price: null })" />
      </div>
      <template v-if="f.has_sizes">
        <h2>ขนาดและราคา</h2>
        <div v-for="(s, n) in f.sizes" :key="n" class="row" style="align-items: stretch">
          <label class="field grow"><span>ชื่อขนาด *</span><input v-model="s.name" /></label>
          <label class="field" style="width: 260px"><span>ราคาเต็ม (บาท) *</span><input v-model.number="s.price" type="number" min="0" step="0.01" /></label>
          <button class="secondary" @click="f.sizes.splice(n, 1)">ลบ</button>
        </div>
        <button class="secondary" @click="f.sizes.push({ name: '', price: null })"><Plus :size="20" />เพิ่มขนาด</button>
        <p class="muted small">ราคาที่ระบุเป็นราคาเต็ม รวม VAT 7% แล้ว</p>
      </template>
      <label v-else class="field"><span>ราคา (บาท) * · รวม VAT 7% แล้ว</span><input v-model.number="f.price" type="number" min="0" step="0.01" /></label>
      <div class="row spread" style="border-top: 1px solid var(--border); padding-top: 16px">
        <div><strong>เปิดขายเมนูนี้</strong><div class="muted small">แสดงให้เลือกในหน้าแคชเชียร์</div></div>
        <label class="row small muted"><input v-model="f.is_active" class="switch" type="checkbox" />{{ f.is_active ? 'เปิดขาย' : 'ปิดชั่วคราว' }}</label>
      </div>
    </div>

    <div class="card stack">
      <h2>รูปเมนู</h2>
      <label style="display: block; cursor: pointer; border: 2px dashed transparent; border-radius: 14px" :style="dragging ? { borderColor: 'var(--primary)' } : {}"
        @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="upload($event.dataTransfer?.files[0])">
        <img v-if="f.image_path" :src="imageUrl(f.image_path)" alt="" style="width: 100%; aspect-ratio: 1.8; object-fit: cover; border-radius: 12px; display: block" />
        <div v-else style="aspect-ratio: 1.8; border-radius: 12px; background: #eceeed; display: grid; place-items: center" class="muted">ลากรูปมาวางที่นี่</div>
        <input type="file" accept="image/*" hidden @change="upload(($event.target as HTMLInputElement).files?.[0])" />
      </label>
      <label class="secondary" style="cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border: 1px solid var(--border); border-radius: 12px; font-weight: 600">
        <Upload :size="20" />อัปโหลด / เปลี่ยนรูป<input type="file" accept="image/*" hidden @change="upload(($event.target as HTMLInputElement).files?.[0])" />
      </label>
      <p v-if="uploading" class="loading-text" style="padding: 0"><Loader2 class="spin" :size="20" />กำลังอัปโหลดรูป...</p>
      <p class="muted small">รูปสี่เหลี่ยมจัตุรัส แนะนำ 800 × 800 พิกเซล ขนาดไม่เกิน 5 เมกะไบต์ · ลากรูปมาวางได้</p>
      <hr style="border: 0; border-top: 1px solid var(--border); width: 100%" />
      <span class="pill primary" style="align-self: flex-start">ตัวอย่างบนหน้าขาย</span>
      <strong style="font-size: 20px">{{ f.name || 'ชื่อเมนู' }}</strong>
      <strong style="color: var(--primary)">{{ preview }}</strong>
    </div>
  </div>

  <div v-if="msg" class="notice danger" style="margin-top: 16px">{{ msg }}</div>
  <div class="row spread" style="margin-top: 24px">
    <span class="muted small">ตรวจสอบข้อมูลก่อนบันทึก <button v-if="id" class="link small" style="color: var(--danger); margin-left: 16px" @click="remove">ลบเมนูนี้</button></span>
    <div class="row"><button class="secondary" @click="router.push('/owner/menu')">ยกเลิก</button><button :disabled="busy || loading || uploading" @click="save"><Loader2 v-if="busy" class="spin" :size="20" /><Check v-else :size="20" />{{ busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูล' }}</button></div>
  </div>
</template>
