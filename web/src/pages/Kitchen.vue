<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CircleAlert, CircleCheck, Inbox, Info, Link2Off, UtensilsCrossed, Volume2, VolumeX } from 'lucide-vue-next'
import { pos } from '../lib/api'
import { supabase } from '../lib/supabase'
import { orderTitle, thTime } from '../lib/format'

const kitchenToken = String(useRoute().query.t ?? '')
const shop = ref('ครัว')
const orders = ref<any[]>([])
const tab = ref<'todo' | 'done'>('todo')
const invalid = ref(false)
const loaded = ref(false)
const err = ref('')
const connected = ref(false)
const lastOk = ref<Date | null>(null)
const soundOn = ref(false)
const now = ref(new Date())
const updates = ref<{ id: string; title: string; text: string; at: Date }[]>([])
let audio: AudioContext | null = null
let channel: ReturnType<typeof supabase.channel> | null = null
let tick: number
let seen = false // first load must not raise "updated" banners

const todo = computed(() => orders.value.filter((o) => o.kitchen_status !== 'done'))
const done = computed(() => orders.value.filter((o) => o.kitchen_status === 'done').sort((a, b) => +new Date(b.kitchen_done_at ?? 0) - +new Date(a.kitchen_done_at ?? 0)))
const shown = computed(() => (tab.value === 'todo' ? todo.value : done.value))
const LABEL: Record<string, string> = { pending: 'รอทำ', cooking: 'กำลังทำ', done: 'เสร็จ' }
const PILL: Record<string, string> = { pending: 'warn', cooking: 'danger', done: 'done' }

// "ordered at" = first time anything was sent for this bill; later batches get an "เพิ่ม" badge
const firstSent = (o: any) => Math.min(...o.order_items.map((i: any) => +new Date(i.sent_to_kitchen_at)))
const orderedAt = (o: any) => new Date(firstSent(o))
const isAdded = (o: any, i: any) => +new Date(i.sent_to_kitchen_at) - firstSent(o) > 2000
const waitMin = (o: any) => Math.max(0, Math.round((+now.value - firstSent(o)) / 60000))

// what changed since the previous fetch, per bill (computed locally, so the banner costs no extra request)
function diff(prev: any[], next: any[]) {
  const before = new Map(prev.map((o) => [o.id, new Map(o.order_items.map((i: any) => [i.id, i]))]))
  for (const o of next) {
    const old = before.get(o.id) as Map<string, any> | undefined
    if (!old) continue
    const parts: string[] = []
    for (const i of o.order_items) {
      const was = old.get(i.id)
      if (!was) parts.push(`เพิ่ม ${i.name} ×${i.qty}`)
      else if (i.removed_at && !was.removed_at) parts.push(`ลบ ${i.name} ×${i.qty}`)
    }
    if (parts.length) updates.value = [{ id: o.id, title: orderTitle(o), text: parts.join(' · '), at: new Date() }, ...updates.value.filter((u) => u.id !== o.id)].slice(0, 2)
  }
}

async function load() {
  try {
    const r = await pos('kitchen_orders', { kitchen_token: kitchenToken })
    if (seen) diff(orders.value, r.orders)
    seen = true
    orders.value = r.orders
    shop.value = r.shop ?? shop.value
    lastOk.value = new Date()
    loaded.value = true
    err.value = ''
    invalid.value = false
  } catch (e) {
    const m = (e as Error).message
    loaded.value = true
    if (m.includes('ลิงก์')) invalid.value = true
    else err.value = m
  }
}

async function setStatus(o: any, to: string) {
  if (!connected.value) return
  const was = o.kitchen_status
  o.kitchen_status = to // optimistic
  try {
    await pos('set_kitchen_status', { kitchen_token: kitchenToken, order_id: o.id, status: to })
    o.kitchen_done_at = to === 'done' ? new Date().toISOString() : null
  } catch (e) {
    o.kitchen_status = was
    err.value = (e as Error).message
  }
}

// soft 3-note chime (sine + fade, low volume): rising = new order, falling = removed item
function beep(kind: string = 'new') {
  if (!soundOn.value || !audio) return
  const notes = kind === 'removed' ? [659, 523, 392] : [523, 659, 784]
  const t0 = audio.currentTime
  notes.forEach((f, i) => {
    const osc = audio!.createOscillator()
    const gain = audio!.createGain()
    const t = t0 + i * 0.16
    osc.frequency.value = f
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.12, t + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
    osc.connect(gain).connect(audio!.destination)
    osc.start(t)
    osc.stop(t + 0.5)
  })
}
function toggleSound() {
  audio ??= new AudioContext() // browsers only allow this from a click
  soundOn.value = !soundOn.value
  beep()
}

onMounted(async () => {
  tick = window.setInterval(() => {
    now.value = new Date()
    updates.value = updates.value.filter((u) => +now.value - +u.at < 120_000)
  }, 30_000)
  await load()
  if (invalid.value) return
  // channel name = hash of the secret link token; the broadcast only says "something changed", data comes via kitchen_orders
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(kitchenToken)))].map((b) => b.toString(16).padStart(2, '0')).join('')
  channel = supabase
    .channel(`k-${hash.slice(0, 16)}`)
    .on('broadcast', { event: 'changed' }, async ({ payload }) => {
      await load()
      if (payload.kind === 'new' || payload.kind === 'removed') beep(payload.kind)
    })
    .subscribe((status) => {
      connected.value = status === 'SUBSCRIBED'
      if (status === 'SUBSCRIBED') load() // catch anything missed while disconnected
    })
})
onUnmounted(() => {
  clearInterval(tick)
  if (channel) supabase.removeChannel(channel)
})
</script>

<template>
  <div v-if="invalid" class="full" style="display: grid; place-items: center; padding: 16px">
    <div class="card" style="text-align: center; max-width: 420px; padding: 40px">
      <Link2Off :size="40" color="#c34343" />
      <h2 style="margin: 16px 0 8px">ลิงก์ไม่ถูกต้อง/หมดอายุ</h2>
      <p class="muted">ติดต่อเจ้าของร้านเพื่อขอลิงก์ครัวใหม่</p>
      <button class="secondary" style="margin-top: 20px" @click="load">ลองอีกครั้ง</button>
    </div>
  </div>

  <template v-else>
    <header class="row spread app-header">
      <div class="row">
        <div style="width: 48px; height: 48px; border-radius: 14px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center"><UtensilsCrossed :size="24" /></div>
        <div><strong style="font-size: 20px">{{ shop }}</strong><div class="muted small tagline">อร่อยทุกมื้อ ดูแลง่ายทุกวัน</div></div>
      </div>
      <div class="row wrap" style="gap: 8px 20px">
        <span class="row" style="gap: 8px; font-weight: 500" :style="{ color: connected ? 'var(--green)' : 'var(--danger)' }">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: currentColor" />{{ connected ? 'เชื่อมต่อสด' : 'ขาดการเชื่อมต่อ' }}
        </span>
        <button class="secondary" @click="toggleSound"><component :is="soundOn ? Volume2 : VolumeX" :size="22" />{{ soundOn ? 'เสียงเปิด' : 'เสียงปิด' }}</button>
        <strong style="font-size: 28px">{{ thTime(now) }} น.</strong>
      </div>
    </header>

    <main class="pad">
      <div class="row spread wrap" style="margin-bottom: 16px">
        <h1>{{ tab === 'todo' ? 'ออเดอร์ในครัว' : 'ออเดอร์ที่ทำเสร็จแล้ว' }}</h1>
        <div class="seg" style="width: 440px; max-width: 100%">
          <button :class="{ on: tab === 'todo' }" @click="tab = 'todo'">กำลังดำเนินการ · {{ todo.length }}</button>
          <button :class="{ on: tab === 'done' }" @click="tab = 'done'">เสร็จแล้ว · {{ done.length }}</button>
        </div>
      </div>

      <div v-if="!connected" class="notice danger" style="margin-bottom: 16px; padding: 18px 20px">
        <CircleAlert :size="22" /><div><b>การเชื่อมต่อขาดหาย กำลังเชื่อมต่อใหม่...</b>ข้อมูลล่าสุด {{ lastOk ? thTime(lastOk) + ' น.' : '—' }} รายการใหม่อาจยังไม่แสดง และยังเปลี่ยนสถานะไม่ได้</div>
      </div>
      <div v-for="u in updates" :key="u.id" class="notice warn" style="margin-bottom: 16px; padding: 18px 20px">
        <Info :size="22" /><div><b>{{ u.title }} มีการอัปเดต</b>{{ u.text }} · อัปเดตเมื่อ {{ thTime(u.at) }} น.</div>
      </div>
      <div v-if="tab === 'done'" class="notice success" style="margin-bottom: 16px"><CircleCheck :size="20" />แสดงออเดอร์ที่ทำเสร็จของรอบเปิดร้านนี้ · เรียงจากล่าสุด</div>
      <div v-if="err" class="notice danger" style="margin-bottom: 16px">{{ err }}</div>

      <div class="grid-kitchen">
        <div v-for="o in shown" :key="o.id" class="card" style="display: flex; flex-direction: column; min-height: 360px; padding: 20px"
          :style="o.kitchen_status === 'cooking' ? { borderColor: 'var(--primary)', borderWidth: '2px' } : {}">
          <div class="row spread"><strong style="font-size: 32px">{{ orderTitle(o) }}</strong><span class="pill" :class="PILL[o.kitchen_status]">{{ LABEL[o.kitchen_status] }}</span></div>
          <p class="muted" style="margin: 4px 0 14px">สั่ง {{ thTime(orderedAt(o)) }} น.<template v-if="o.kitchen_status === 'done' && o.kitchen_done_at"> · {{ thTime(o.kitchen_done_at) }} น.</template><template v-else> · รอ {{ waitMin(o) }} นาที</template></p>
          <hr style="border: 0; border-top: 1px solid var(--border); margin: 0 0 12px; width: 100%" />
          <div class="grow">
            <div v-for="i in o.order_items" :key="i.id" style="margin-bottom: 14px">
              <div class="row spread" style="align-items: flex-start">
                <div :style="i.removed_at ? { color: 'var(--danger)' } : {}">
                  <span :style="i.removed_at ? { textDecoration: 'line-through' } : {}" style="font-size: 24px; font-weight: 600"><span :style="i.removed_at ? {} : { color: 'var(--primary)' }">{{ i.qty }}×</span> {{ i.name }}</span>
                  <div class="muted">{{ i.size_name ?? 'ปกติ' }}<template v-if="i.removed_at"> · <strong style="color: var(--danger)">ยกเลิกแล้ว</strong></template></div>
                </div>
                <span v-if="isAdded(o, i) && !i.removed_at" class="pill primary">เพิ่ม</span>
              </div>
              <div v-if="i.note && !i.removed_at" style="font-size: 20px; font-weight: 700; color: var(--warn)">{{ i.note }}</div>
            </div>
          </div>
          <button v-if="o.kitchen_status === 'pending'" class="big" style="width: 100%" :disabled="!connected" @click="setStatus(o, 'cooking')">{{ connected ? 'เริ่มทำทั้งออเดอร์' : 'รอการเชื่อมต่อ' }}</button>
          <button v-else-if="o.kitchen_status === 'cooking'" class="big success" style="width: 100%" :disabled="!connected" @click="setStatus(o, 'done')">{{ connected ? 'ทำเสร็จแล้ว' : 'รอการเชื่อมต่อ' }}</button>
          <div v-else class="row" style="gap: 8px">
            <div class="big grow" style="background: var(--done); color: #fff; border-radius: 12px; display: grid; place-items: center; min-height: 56px; font-weight: 600">✓ เสร็จแล้ว</div>
            <button class="secondary" :disabled="!connected" @click="setStatus(o, 'cooking')">ย้อนกลับ</button>
          </div>
        </div>

        <p v-if="!loaded" class="loading-text" style="grid-column: 1 / -1"><Loader2 class="spin" :size="22" />กำลังโหลดออเดอร์...</p>
        <div v-if="loaded && !shown.length" class="card" style="grid-column: 1 / -1; text-align: center; padding: 48px">
          <Inbox :size="40" color="#6b7773" />
          <h2 style="margin: 12px 0 6px">{{ tab === 'todo' ? 'ยังไม่มีออเดอร์' : 'ยังไม่มีออเดอร์ที่เสร็จ' }}</h2>
          <p class="muted">{{ tab === 'todo' ? 'ออเดอร์ใหม่จะแสดงที่นี่เมื่อส่งเข้าครัว' : 'ออเดอร์ที่ทำเสร็จจะมาแสดงที่นี่' }}</p>
        </div>
      </div>
      <p class="muted small" style="margin-top: 20px">สถานะทั้งออเดอร์: รอทำ → กำลังทำ → เสร็จ · รายการที่ถูกลบยังคงแสดงเพื่อป้องกันการทำซ้ำ</p>
    </main>
  </template>
</template>
