<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from '../../components/Modal.vue'
import { supabase } from '../../lib/supabase'
import { addItem } from '../../lib/cashier'
import { baht } from '../../lib/format'

const props = defineProps<{ item: any; titleSuffix: string }>()
const emit = defineEmits<{ close: [] }>()
const sizes = computed(() => (props.item.menu_sizes ?? []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order))
const size = ref<any>(null)
const qty = ref(1)
const note = ref('')
const err = ref('')
const unit = computed(() => Number(size.value?.price ?? props.item.price ?? 0))
const imageUrl = (p: string) => supabase.storage.from('menu-images').getPublicUrl(p).data.publicUrl

function add() {
  if (props.item.has_sizes && !size.value) { err.value = 'กรุณาเลือกขนาด'; return }
  addItem(props.item, { size: size.value, qty: qty.value, note: note.value }) // optimistic: the line appears at once
  emit('close')
}
</script>

<template>
  <Modal :title="item.name" :subtitle="(item.has_sizes ? 'เลือกขนาดก่อนเพิ่มรายการ · ' : 'เพิ่มรายการ · ') + titleSuffix" @close="emit('close')">
    <div v-if="item.has_sizes" class="row" style="align-items: center; margin-bottom: 14px">
      <img v-if="item.image_path" :src="imageUrl(item.image_path)" alt="" style="width: 72px; height: 72px; border-radius: 12px; object-fit: cover" />
      <div><strong style="font-size: 20px">เลือกขนาด</strong><div><span class="pill primary">จำเป็น · เลือก 1 ขนาด</span></div></div>
    </div>
    <div v-if="item.has_sizes" class="stack" style="margin-bottom: 14px">
      <button v-for="s in sizes" :key="s.id" class="secondary" style="justify-content: space-between; min-height: 60px; font-size: 18px"
        :style="size?.id === s.id ? { borderColor: 'var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary)' } : {}" @click="size = s; err = ''">
        <span>{{ size?.id === s.id ? '●' : '○' }} {{ s.name }}</span><span>฿{{ Number(s.price) }}</span>
      </button>
    </div>
    <label class="field" style="display: block; margin-bottom: 14px"><span>หมายเหตุถึงครัว</span><input v-model="note" placeholder="เช่น ไม่เผ็ด" /></label>
    <div class="row spread" style="margin-bottom: 16px">
      <strong>จำนวน</strong>
      <div class="row"><button class="secondary" style="width: 56px" @click="qty = Math.max(1, qty - 1)">−</button><b style="min-width: 32px; text-align: center; font-size: 22px">{{ qty }}</b><button class="secondary" style="width: 56px" @click="qty++">+</button></div>
    </div>
    <div v-if="err" class="err" style="margin-bottom: 8px">{{ err }}</div>
    <button class="big" style="width: 100%" @click="add">เพิ่มในบิล · {{ baht(unit * qty) }}</button>
  </Modal>
</template>
