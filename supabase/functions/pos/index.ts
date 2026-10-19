// Single Edge Function: POST { action, ... }. Deploy with --no-verify-jwt (cashier/kitchen have no Supabase JWT;
// each action authenticates itself: owner = Supabase JWT, cashier = PIN session token, kitchen = link token).
// Performance rule: few sequential DB round-trips per action. Bill actions read ONE order_snapshot, compute in memory
// (totalsFor), then write in parallel and return the updated bill so the client never needs to refetch.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkSession, codeDiscount, HttpError, hashPin, newToken, promoDiscount, round2, sha256, signSession, totalsFor, verifyPin, type Code, type Promo } from './util.ts'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-session',
  'Access-Control-Max-Age': '7200', // browsers cache the preflight, so only the first call pays for it
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// supabase-js result → data or HttpError
function ok<T>(r: { data: T; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new HttpError(r.error.code === '23505' ? 409 : 500, r.error.message)
  return r.data
}
const need = <T>(v: T | null | undefined, msg: string): T => {
  if (v == null) throw new HttpError(404, msg)
  return v
}
const str = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !v) throw new HttpError(400, `ต้องระบุ ${name}`)
  return v
}
const num = (v: unknown) => (v == null ? null : Number(v))

// run after the response is sent (Supabase Edge Runtime); falls back to awaiting where unsupported
async function later(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
  else await p
}

async function openShift() {
  return ok(await db.from('shifts').select('*').is('closed_at', null).maybeSingle())
}
async function requireOpenShift() {
  return need(await openShift(), 'ยังไม่ได้เปิดร้าน')
}

// Ping the kitchen screen over Realtime broadcast. Public channel named by the kitchen token hash; the payload
// carries no order data (the screen refetches via kitchen_orders with its token). Call only AFTER the DB writes.
async function notifyKitchen(kind: 'new' | 'removed' | 'status', tokenHash: string | null) {
  if (!tokenHash) return
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! },
      body: JSON.stringify({ messages: [{ topic: `k-${tokenHash.slice(0, 16)}`, event: 'changed', payload: { kind }, private: false }] }),
    })
  } catch (e) {
    console.error('notifyKitchen', e)
  }
}

// ---- bill snapshot: 1 round-trip for order + items(+category) + applied code + applied promo + kitchen hash ----
type Snap = { order: any; items: any[]; code: any | null; promo: any | null; kt: string | null; rev: number }
async function snap(id: string, mustBeOpen = true): Promise<Snap> {
  const s = need(ok(await db.rpc('order_snapshot', { p_order: id })) as Snap | null, 'ไม่พบบิล')
  if (mustBeOpen && s.order.status !== 'open') throw new HttpError(409, 'บิลนี้ปิดแล้ว แก้ไขไม่ได้')
  return s
}
const live = (s: Snap) =>
  s.items.filter((i) => !i.removed_at).map((i) => ({
    menu_item_id: i.menu_item_id as string | null, category_id: i.category_id as string | null,
    size_name: i.size_name as string | null, unit_price: Number(i.unit_price), qty: i.qty as number,
  }))
const asCode = (c: any) => (c ? ({ ...c, value: Number(c.value), min_total: num(c.min_total) } as Code) : null)

// price the bill in memory: `patch` = columns to write, `view` = the bill as the client should see it
function price(s: Snap) {
  const patch = totalsFor(s.order, live(s), asCode(s.code), s.promo as Promo | null)
  return { patch: patch as Record<string, unknown>, view: { ...s.order, ...patch, order_items: s.items } }
}
const write = async (id: string, patch: Record<string, unknown>) => ok(await db.from('orders').update(patch).eq('id', id))

type Ctx = { body: Record<string, any>; req: Request; kitchenHash?: string; shopName?: string }
type Actions = Record<string, (c: Ctx) => Promise<unknown>>

const publicActions: Actions = {
  // warm-up: wakes the function (cold start) and primes the browser's CORS preflight cache; touches no data
  async ping() {
    return { ok: true }
  },

  async cashier_login({ body }) {
    const pin = str(body.pin, 'pin')
    const s = need(ok(await db.from('settings').select('cashier_pin_hash, pin_fail_count, pin_locked_until').eq('id', 1).maybeSingle()), 'ไม่พบการตั้งค่า')
    if (!s.cashier_pin_hash) throw new HttpError(409, 'ยังไม่ได้ตั้ง PIN (เจ้าของต้องตั้งก่อน)')
    if (s.pin_locked_until && new Date(s.pin_locked_until) > new Date()) throw new HttpError(429, 'ใส่ PIN ผิดหลายครั้ง กรุณารอสักครู่')
    if (!(await verifyPin(pin, s.cashier_pin_hash))) {
      const fails = s.pin_fail_count + 1
      ok(await db.from('settings').update(
        fails >= 5 ? { pin_fail_count: 0, pin_locked_until: new Date(Date.now() + 5 * 60_000).toISOString() } : { pin_fail_count: fails },
      ).eq('id', 1))
      throw new HttpError(401, 'PIN ไม่ถูกต้อง')
    }
    if (s.pin_fail_count || s.pin_locked_until) ok(await db.from('settings').update({ pin_fail_count: 0, pin_locked_until: null }).eq('id', 1))
    return { token: await signSession() }
  },
}

const ownerActions: Actions = {
  async set_cashier_pin({ body }) {
    const pin = str(body.pin, 'pin')
    if (!/^\d{6}$/.test(pin)) throw new HttpError(400, 'PIN ต้องเป็นตัวเลข 6 หลัก')
    ok(await db.from('settings').update({ cashier_pin_hash: await hashPin(pin), pin_fail_count: 0, pin_locked_until: null }).eq('id', 1))
    return { ok: true }
  },
  async rotate_kitchen_token() {
    const token = newToken()
    ok(await db.from('settings').update({ kitchen_token_hash: await sha256(token), kitchen_token: token }).eq('id', 1))
    return { token } // kitchen URL = /kitchen?t=<token>; also stored (owner-readable) so settings can show the current link
  },
}

const cashierActions: Actions = {
  // Client sends the menu_rev it has cached; the menu/categories are only included when that revision is stale.
  async state({ body }) {
    const [shift, settings, orders] = await Promise.all([
      openShift(),
      db.from('settings').select('shop_name, shop_address, table_count, menu_rev').eq('id', 1).single(),
      db.from('orders').select('*, order_items(*)').or('status.eq.open,and(status.eq.paid,kitchen_status.neq.done)').order('created_at'),
    ])
    const { menu_rev, ...shop } = ok(settings)
    const out: Record<string, unknown> = { shift, settings: shop, open_orders: ok(orders), menu_rev }
    if (body.menu_rev !== menu_rev) {
      const [items, cats] = await Promise.all([
        db.from('menu_items').select('id, category_id, name, image_path, price, has_sizes, is_active, menu_sizes(id, name, price, sort_order)').order('sort_order').order('name'),
        db.from('categories').select('id, name').order('sort_order').order('name'),
      ])
      out.menu = ok(items)
      out.categories = ok(cats)
    }
    return out
  },

  async open_shift() {
    const r = await db.from('shifts').insert({}).select().single()
    if (r.error?.code === '23505') throw new HttpError(409, 'เปิดร้านอยู่แล้ว') // unique index: one open shift
    return { shift: ok(r) }
  },

  async close_shift() {
    const shift = await requireOpenShift()
    const orders = ok(await db.from('orders').select('status, net, vat, pay_method').eq('shift_id', shift.id))
    const open = orders.filter((o) => o.status === 'open').length
    if (open) throw new HttpError(409, `ยังมีบิลค้าง ${open} บิล ต้องเคลียร์ก่อนปิดร้าน`)
    const paid = orders.filter((o) => o.status === 'paid')
    const sum = (rows: typeof paid) => round2(rows.reduce((s, o) => s + Number(o.net), 0))
    const voided = orders.filter((o) => o.status === 'void')
    const closedAt = new Date().toISOString()
    ok(await db.from('shifts').update({ closed_at: closedAt }).eq('id', shift.id))
    return {
      summary: {
        opened_at: shift.opened_at,
        closed_at: closedAt,
        bills: paid.length,
        total: sum(paid),
        cash: sum(paid.filter((o) => o.pay_method === 'cash')),
        cash_bills: paid.filter((o) => o.pay_method === 'cash').length,
        qr: sum(paid.filter((o) => o.pay_method === 'qr')),
        qr_bills: paid.filter((o) => o.pay_method === 'qr').length,
        vat: paid.reduce((s, o) => s + Number(o.vat), 0),
        void_count: voided.length,
        void_total: sum(voided),
      },
    }
  },

  // one RPC: shift check, table check, order number, insert (see create_order in the perf migration)
  async create_order({ body }) {
    const channel = body.channel
    if (channel !== 'dine_in' && channel !== 'takeaway') throw new HttpError(400, 'channel ไม่ถูกต้อง')
    const table_no = channel === 'dine_in' ? Number(body.table_no) : null
    const r = await db.rpc('create_order', { p_channel: channel, p_table: table_no })
    if (r.error?.code === '23505') throw new HttpError(409, `โต๊ะ ${table_no} มีบิลเปิดอยู่แล้ว`)
    if (r.error?.code === 'P0001') throw new HttpError(409, r.error.message)
    return { order: ok(r) }
  },

  async add_item({ body }) {
    const qty = Number(body.qty ?? 1)
    if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, 'จำนวนไม่ถูกต้อง')
    const [s, menuRes] = await Promise.all([
      snap(str(body.order_id, 'order_id')),
      db.from('menu_items').select('*, menu_sizes(*)').eq('id', str(body.menu_item_id, 'menu_item_id')).maybeSingle(),
    ])
    const m = need(ok(menuRes), 'ไม่พบเมนู')
    if (!m.is_active) throw new HttpError(409, 'เมนูนี้ปิดขายอยู่')
    let unit_price = m.price, size_name: string | null = null
    if (m.has_sizes) {
      const sz = m.menu_sizes.find((x: any) => x.id === body.size_id)
      if (!sz) throw new HttpError(400, 'ต้องเลือกขนาด')
      unit_price = sz.price
      size_name = sz.name
    }
    const row = {
      id: crypto.randomUUID(), order_id: s.order.id, menu_item_id: m.id, name: m.name, size_name, unit_price, qty,
      note: body.note?.toString().trim() || null, created_at: new Date().toISOString(),
    }
    s.items.push({ ...row, removed_at: null, sent_to_kitchen_at: null, category_id: m.category_id })
    const { patch, view } = price(s)
    // shortcut: insert + totals are separate writes (no transaction); totals are recomputed on every later action and at pay
    await Promise.all([db.from('order_items').insert(row).then(ok), write(s.order.id, patch)])
    return { order: view, menu_rev: s.rev }
  },

  async remove_item({ body }) {
    const s = await snap(str(body.order_id, 'order_id'))
    const it = need(s.items.find((i) => i.id === body.item_id && !i.removed_at), 'ไม่พบรายการ')
    const sent = !!it.sent_to_kitchen_at
    if (sent) it.removed_at = new Date().toISOString() // kitchen sees strikethrough
    else s.items = s.items.filter((i) => i !== it)
    const { patch, view } = price(s)
    await Promise.all([
      (sent ? db.from('order_items').update({ removed_at: it.removed_at }).eq('id', it.id) : db.from('order_items').delete().eq('id', it.id)).then(ok),
      write(s.order.id, patch),
    ])
    if (sent) await later(notifyKitchen('removed', s.kt))
    return { order: view, menu_rev: s.rev }
  },

  // +/- on a bill line. Unsent line: edit qty in place. Sent line: "+" adds to an unsent twin line (kitchen sees "เพิ่ม" after
  // sending); "−" cancels the old line (kitchen sees it struck through) and re-adds the reduced quantity as already sent.
  async change_qty({ body }) {
    const delta = Number(body.delta)
    if (delta !== 1 && delta !== -1) throw new HttpError(400, 'delta ไม่ถูกต้อง')
    const s = await snap(str(body.order_id, 'order_id'))
    const it = need(s.items.find((i) => i.id === body.item_id && !i.removed_at), 'ไม่พบรายการ')
    const now = new Date().toISOString()
    const run = (q: PromiseLike<any>) => Promise.resolve(q).then(ok)
    const writes: Promise<unknown>[] = []
    const addLine = (qty: number, sentAt: string | null) => {
      const row = {
        id: crypto.randomUUID(), order_id: s.order.id, menu_item_id: it.menu_item_id, name: it.name, size_name: it.size_name,
        unit_price: it.unit_price, qty, note: it.note, sent_to_kitchen_at: sentAt, created_at: now,
      }
      s.items.push({ ...row, removed_at: null, category_id: it.category_id })
      writes.push(run(db.from('order_items').insert(row)))
    }
    let notify = false
    if (!it.sent_to_kitchen_at) {
      if (it.qty + delta < 1) {
        s.items = s.items.filter((i) => i !== it)
        writes.push(run(db.from('order_items').delete().eq('id', it.id)))
      } else {
        it.qty += delta
        writes.push(run(db.from('order_items').update({ qty: it.qty }).eq('id', it.id)))
      }
    } else if (delta === 1) {
      const twin = s.items.find((i) => !i.removed_at && !i.sent_to_kitchen_at && i.menu_item_id === it.menu_item_id && i.size_name === it.size_name && (i.note ?? null) === (it.note ?? null))
      if (twin) {
        twin.qty += 1
        writes.push(run(db.from('order_items').update({ qty: twin.qty }).eq('id', twin.id)))
      } else addLine(1, null)
    } else {
      it.removed_at = now
      writes.push(run(db.from('order_items').update({ removed_at: now }).eq('id', it.id)))
      if (it.qty > 1) addLine(it.qty - 1, now)
      notify = true
    }
    const { patch, view } = price(s)
    await Promise.all([...writes, write(s.order.id, patch)])
    if (notify) await later(notifyKitchen('removed', s.kt))
    return { order: view, menu_rev: s.rev }
  },

  // edit the note of a line that has not been sent yet (sent lines are read-only: the kitchen already saw them)
  async set_note({ body }) {
    const s = await snap(str(body.order_id, 'order_id'))
    const it = need(s.items.find((i) => i.id === body.item_id && !i.removed_at), 'ไม่พบรายการ')
    if (it.sent_to_kitchen_at) throw new HttpError(409, 'รายการนี้ส่งครัวแล้ว แก้หมายเหตุไม่ได้')
    it.note = body.note?.toString().trim() || null
    ok(await db.from('order_items').update({ note: it.note }).eq('id', it.id))
    return { order: price(s).view, menu_rev: s.rev }
  },

  async send_to_kitchen({ body }) {
    const s = await snap(str(body.order_id, 'order_id'))
    const unsent = s.items.filter((i) => !i.sent_to_kitchen_at && !i.removed_at)
    if (!unsent.length) throw new HttpError(409, 'ไม่มีรายการใหม่ที่ต้องส่งครัว')
    const now = new Date().toISOString()
    unsent.forEach((i) => (i.sent_to_kitchen_at = now))
    s.order.kitchen_status = 'pending' // new items re-queue a finished order
    await Promise.all([
      db.from('order_items').update({ sent_to_kitchen_at: now }).in('id', unsent.map((i) => i.id)).then(ok),
      write(s.order.id, { kitchen_status: 'pending', kitchen_done_at: null }),
    ])
    await later(notifyKitchen('new', s.kt))
    return { sent: unsent.length, order: { ...s.order, order_items: s.items }, menu_rev: s.rev }
  },

  async apply_code({ body }) {
    const [s, codeRes] = await Promise.all([
      snap(str(body.order_id, 'order_id')),
      db.from('discount_codes').select('*').eq('code', str(body.code, 'code').trim()).maybeSingle(),
    ])
    if (s.order.promotion_id) throw new HttpError(409, 'บิลนี้ใช้โปรโมชันอยู่ ใช้โค้ดร่วมกันไม่ได้')
    const code = need(ok(codeRes), 'ไม่พบโค้ดนี้')
    const discount = codeDiscount(asCode(code)!, live(s), s.order.channel) // throws the specific reason (min total, expired, ...)
    if (body.dry_run) { // "ตรวจสอบ": show the effect without touching the bill
      const subtotal = round2(live(s).reduce((t, i) => t + i.unit_price * i.qty, 0))
      return { preview: { code: code.code, kind: code.kind, value: Number(code.value), discount, subtotal, net: Math.ceil(round2(subtotal - discount)) } }
    }
    Object.assign(s.order, { discount_code_id: code.id, discount_label: code.code })
    s.code = code
    const { patch, view } = price(s)
    const fields = { ...patch, discount_code_id: code.id, discount_label: code.code }
    await write(s.order.id, fields)
    return { order: { ...view, ...fields }, menu_rev: s.rev }
  },

  // promos that would apply to this bill right now, with the discount each would give
  async list_promos({ body }) {
    const [s, promos] = await Promise.all([
      snap(str(body.order_id, 'order_id')),
      db.from('promotions').select('*').eq('is_active', true).order('name'),
    ])
    const items = live(s)
    return {
      promos: ok(promos)
        .map((p) => ({ id: p.id, name: p.name, type: p.type, config: p.config, discount: promoDiscount(p as Promo, items) }))
        .filter((p) => p.discount > 0),
    }
  },

  async apply_promo({ body }) {
    const [s, promoRes] = await Promise.all([
      snap(str(body.order_id, 'order_id')),
      db.from('promotions').select('*').eq('id', str(body.promotion_id, 'promotion_id')).maybeSingle(),
    ])
    if (s.order.discount_code_id) throw new HttpError(409, 'บิลนี้ใช้โค้ดอยู่ เอาโค้ดออกก่อนจึงจะใช้โปรได้')
    const p = need(ok(promoRes), 'ไม่พบโปรโมชัน')
    if (!promoDiscount(p as Promo, live(s))) throw new HttpError(400, 'บิลนี้ยังไม่เข้าเงื่อนไขของโปรนี้')
    Object.assign(s.order, { promotion_id: p.id, discount_label: p.name })
    s.promo = p
    const { patch, view } = price(s)
    const fields = { ...patch, promotion_id: p.id, discount_label: p.name }
    await write(s.order.id, fields)
    return { order: { ...view, ...fields }, menu_rev: s.rev }
  },

  async clear_discount({ body }) {
    const s = await snap(str(body.order_id, 'order_id'))
    Object.assign(s.order, { discount_code_id: null, promotion_id: null, discount_label: null })
    s.code = s.promo = null
    const { patch, view } = price(s)
    const fields = { ...patch, discount_code_id: null, promotion_id: null, discount_label: null }
    await write(s.order.id, fields)
    return { order: { ...view, ...fields }, menu_rev: s.rev }
  },

  async pay({ body }) {
    if (body.method !== 'cash' && body.method !== 'qr') throw new HttpError(400, 'วิธีจ่ายไม่ถูกต้อง')
    const [s] = await Promise.all([snap(str(body.order_id, 'order_id')), requireOpenShift()])
    if (!live(s).length) throw new HttpError(409, 'บิลว่าง ชำระเงินไม่ได้')
    const { patch, view } = price(s) // re-priced now, so an expired happy hour / code is dropped before charging
    const useCode = !!view.discount_code_id && s.code
    if (useCode && s.code.max_uses != null && s.code.used_count >= s.code.max_uses) throw new HttpError(409, 'โค้ดถูกใช้ครบแล้ว กรุณาเอาโค้ดออก')
    const paid = { status: 'paid', pay_method: body.method, paid_at: new Date().toISOString() }
    await Promise.all([
      write(s.order.id, { ...patch, ...paid }),
      useCode ? db.from('discount_codes').update({ used_count: s.code.used_count + 1 }).eq('id', s.code.id).then(ok) : null,
    ])
    return { order: { ...view, ...paid }, menu_rev: s.rev }
  },

  // drop a bill that never got any item (otherwise it blocks close_shift); refused if it has items
  async discard_empty({ body }) {
    const s = await snap(str(body.order_id, 'order_id'))
    if (s.items.length) throw new HttpError(409, 'บิลนี้มีรายการแล้ว')
    ok(await db.from('orders').delete().eq('id', s.order.id))
    return { ok: true }
  },

  async void({ body }) {
    const s = await snap(str(body.order_id, 'order_id'), false)
    if (s.order.status === 'void') throw new HttpError(409, 'บิลนี้ถูกยกเลิกแล้ว')
    const reason = str(body.reason, 'เหตุผล').trim()
    await Promise.all([
      write(s.order.id, { status: 'void', void_reason: reason, voided_at: new Date().toISOString() }),
      s.order.status === 'paid' && s.code
        ? db.from('discount_codes').update({ used_count: Math.max(0, s.code.used_count - 1) }).eq('id', s.code.id).then(ok)
        : null,
    ])
    await later(notifyKitchen('removed', s.kt))
    return { ok: true }
  },
}

const kitchenActions: Actions = {
  // every non-void bill of the current open shift that has items sent to the kitchen (client splits by kitchen_status)
  async kitchen_orders({ shopName }) {
    const orders = ok(await db.from('orders')
      .select('id, order_no, takeaway_no, channel, table_no, kitchen_status, kitchen_done_at, created_at, order_items(id, name, size_name, qty, note, sent_to_kitchen_at, removed_at), shifts!inner(closed_at)')
      .is('shifts.closed_at', null).neq('status', 'void').order('created_at'))
    const shaped = orders.map(({ shifts: _s, ...o }: any) => ({ ...o, order_items: o.order_items.filter((i: any) => i.sent_to_kitchen_at) }))
    return { orders: shaped.filter((o: any) => o.order_items.length), shop: shopName }
  },
  async set_kitchen_status({ body, kitchenHash }) {
    if (!['pending', 'cooking', 'done'].includes(body.status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง')
    ok(await db.from('orders').update({ kitchen_status: body.status, kitchen_done_at: body.status === 'done' ? new Date().toISOString() : null }).eq('id', str(body.order_id, 'order_id')))
    await later(notifyKitchen('status', kitchenHash ?? null))
    return { ok: true }
  },
}

async function requireOwner(req: Request) {
  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '')
  if (!jwt) throw new HttpError(401, 'ต้องล็อกอินเจ้าของร้าน')
  const { data, error } = await db.auth.getUser(jwt)
  if (error || !data.user) throw new HttpError(401, 'ต้องล็อกอินเจ้าของร้าน')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const action = str(body.action, 'action')
    const ctx: Ctx = { body, req }
    if (action in publicActions) return json(await publicActions[action](ctx))
    if (action in ownerActions) {
      await requireOwner(req)
      return json(await ownerActions[action](ctx))
    }
    if (action in cashierActions) {
      await checkSession(req.headers.get('x-session') ?? '')
      return json(await cashierActions[action](ctx))
    }
    if (action in kitchenActions) {
      const { kitchen_token_hash, shop_name } = ok(await db.from('settings').select('kitchen_token_hash, shop_name').eq('id', 1).single())
      if (!kitchen_token_hash || (await sha256(str(body.kitchen_token, 'kitchen_token'))) !== kitchen_token_hash) throw new HttpError(401, 'ลิงก์ไม่ถูกต้องหรือหมดอายุ')
      ctx.kitchenHash = kitchen_token_hash
      ctx.shopName = shop_name
      return json(await kitchenActions[action](ctx))
    }
    throw new HttpError(400, 'ไม่รู้จัก action')
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'เกิดข้อผิดพลาดภายในระบบ' }, 500)
  }
})
