<script setup lang="ts">
import { ask } from '../../lib/confirm'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase'

const route = useRoute()
const router = useRouter()
const open = ref<boolean | null>(null)
const shop = ref('')
const NAV = [
  { to: '/owner/menu', label: 'เมนูอาหาร', also: ['/owner/categories'] },
  { to: '/owner/promos', label: 'โปรโมชัน', also: [] },
  { to: '/owner/codes', label: 'โค้ดส่วนลด', also: [] },
  { to: '/owner/settings', label: 'ตั้งค่า', also: [] },
]
const active = (n: (typeof NAV)[number]) => [n.to, ...n.also].some((p) => route.path.startsWith(p))
const crumb = computed(() => (route.meta.crumb as string) ?? NAV.find(active)?.label ?? '')

// two small reads, once per login session of the owner area
onMounted(async () => {
  const [shift, settings] = await Promise.all([
    supabase.from('shifts').select('id').is('closed_at', null).maybeSingle(),
    supabase.from('settings').select('shop_name').eq('id', 1).single(),
  ])
  open.value = !!shift.data
  shop.value = settings.data?.shop_name ?? ''
})
async function logout() {
  if (!(await ask({ title: 'ออกจากระบบ?', confirmLabel: 'ออกจากระบบ' }))) return
  await supabase.auth.signOut()
  router.push('/owner/login')
}
</script>

<template>
  <div class="owner-shell">
    <aside class="owner-side">
      <strong style="font-size: 22px; padding: 0 8px 28px">{{ shop || 'ร้านของฉัน' }}</strong>
      <nav class="stack" style="gap: 6px">
        <router-link v-for="n in NAV" :key="n.to" :to="n.to" style="padding: 14px 16px; border-radius: 12px; color: #fff; text-decoration: none; font-weight: 500"
          :style="active(n) ? { background: '#ffffff26' } : { color: '#c5d4cd' }">{{ n.label }}</router-link>
      </nav>
      <div class="grow" />
      <p style="color: #a9bdb4; padding: 0 8px 12px">พื้นที่เจ้าของร้าน</p>
      <button style="background: #fff; color: #213d33" @click="logout">ออกจากระบบ</button>
    </aside>

    <div>
      <header class="row spread wrap owner-top">
        <span class="muted small">พื้นที่จัดการร้าน / {{ crumb }}</span>
        <span v-if="open !== null" class="row small" style="gap: 8px; color: var(--green); font-weight: 500">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: currentColor" :style="open ? {} : { color: '#9aa5a1' }" />{{ open ? 'เปิดร้านแล้ว' : 'ยังไม่เปิดร้าน' }} · เจ้าของร้าน
        </span>
      </header>
      <main class="owner-main"><router-view /></main>
    </div>
  </div>
</template>
