// Cashier state + actions. Performance rules (see memory: perf-and-request-saving-first):
//  - every bill action returns the updated bill, which we patch in locally (no `state` refetch);
//  - line edits are optimistic (instant UI) and all server calls run through ONE queue so rapid taps cannot race;
//  - the menu is cached in localStorage by menu_rev; any bill response carrying a newer rev triggers one refetch.
import { computed, reactive } from 'vue'
import { pos } from './api'

const SESSION_KEY = 'pos_session'
const MENU_KEY = 'pos_menu'

export const cs = reactive({
  token: sessionStorage.getItem(SESSION_KEY) ?? '',
  data: null as any,
  err: '',
  view: 'home' as 'home' | 'bill' | 'receipt' | 'summary',
  orderId: '',
  receipt: null as any,
  summary: null as any,
  pending: 0, // requests queued or in flight (drives the top progress bar)
  busy: {} as Record<string, boolean>, // per-button loading flags, see tracked()
})

let lastLoad = 0
let queue: Promise<unknown> = Promise.resolve()
const round2 = (n: number) => Math.round(n * 100) / 100

// one request at a time, in tap order
function call<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T | undefined> {
  cs.pending++
  const job = queue.then(async () => {
    try {
      cs.err = ''
      return await pos<T>(action, body, { 'x-session': cs.token })
    } catch (e) {
      const m = (e as Error).message
      if (m.startsWith('session')) logout()
      cs.err = m
    } finally {
      cs.pending--
    }
  })
  queue = job.catch(() => {})
  return job
}

// per-button loading flag; a second tap while the first is still running is ignored
export const busy = (key: string) => !!cs.busy[key]
async function tracked<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (cs.busy[key]) return
  cs.busy[key] = true
  try { return await fn() } finally { cs.busy[key] = false }
}

export async function login(pin: string): Promise<string | undefined> {
  try {
    const r = await pos<{ token: string }>('cashier_login', { pin })
    cs.token = r.token
    sessionStorage.setItem(SESSION_KEY, r.token)
    await load()
  } catch (e) {
    return (e as Error).message
  }
}
export function logout() {
  cs.token = ''
  cs.data = null
  sessionStorage.removeItem(SESSION_KEY)
}

export async function load() {
  let cached: any = null
  try { cached = JSON.parse(localStorage.getItem(MENU_KEY) ?? 'null') } catch { /* corrupt cache: refetch */ }
  const s = await call('state', { menu_rev: cached?.rev })
  if (!s) return
  if (s.menu) {
    cached = { rev: s.menu_rev, menu: s.menu, categories: s.categories }
    try { localStorage.setItem(MENU_KEY, JSON.stringify(cached)) } catch { /* storage full/blocked: skip caching */ }
  }
  cs.data = { ...s, menu: cached.menu, categories: cached.categories }
  try { localStorage.setItem('pos_shop', s.settings.shop_name) } catch { /* only used to label the PIN screen */ }
  lastLoad = Date.now()
}
export const refreshIfStale = (ms: number) => { if (cs.token && Date.now() - lastLoad > ms) load() }

// ---- derived ----
export const shift = computed(() => cs.data?.shift)
export const openOrders = computed<any[]>(() => (cs.data?.open_orders ?? []).filter((o: any) => o.status === 'open'))
export const order = computed(() => (cs.data?.open_orders ?? []).find((o: any) => o.id === cs.orderId))
export const lines = computed<any[]>(() => order.value?.order_items ?? [])
export const liveLines = computed(() => lines.value.filter((i) => !i.removed_at))
export const unsentCount = computed(() => liveLines.value.filter((i) => !i.sent_to_kitchen_at).length)
export const tableOrder = (n: number) => openOrders.value.find((o) => o.channel === 'dine_in' && o.table_no === n)
// takeaways still on the cashier's list: unpaid, or paid but the kitchen has not finished
export const takeaways = computed(() =>
  (cs.data?.open_orders ?? []).filter(
    (o: any) => o.channel === 'takeaway' && (o.status === 'open' || (o.kitchen_status !== 'done' && o.order_items.some((i: any) => i.sent_to_kitchen_at))),
  ),
)

// ---- local patching ----
function put(o: any, rev?: number) {
  const list: any[] = cs.data.open_orders
  const n = list.findIndex((x) => x.id === o.id)
  if (n >= 0) list[n] = o
  else list.push(o)
  if (rev != null && rev !== cs.data.menu_rev) load() // owner changed the menu: refresh once
}
function drop(id: string) { cs.data.open_orders = cs.data.open_orders.filter((x: any) => x.id !== id) }
// instant totals while the server computes the real ones (discount kept as is)
function estimate(o: any) {
  o.subtotal = round2(o.order_items.filter((i: any) => !i.removed_at).reduce((t: number, i: any) => t + i.unit_price * i.qty, 0))
  const exact = Math.max(0, o.subtotal - Number(o.discount))
  o.net = Math.ceil(exact)
  o.rounding = round2(o.net - exact)
  o.vat = round2((o.net * 7) / 107)
}
const sync = async (id: string) => { if (cs.orderId === id) await load() } // after a failed optimistic edit

// ---- shift ----
export const openShift = () => tracked('openShift', async () => { if (await call('open_shift')) await load() })
export async function closeShift() {
  const r = await call('close_shift')
  if (!r) return false
  cs.summary = r.summary
  cs.view = 'summary'
  await load()
  return true
}

// ---- bills ----
export const openTable = (n: number) => tracked('table-' + n, () => openTableNow(n))
async function openTableNow(n: number) {
  let o = tableOrder(n)
  if (!o) {
    const r = await call('create_order', { channel: 'dine_in', table_no: n })
    if (!r) return
    o = { ...r.order, order_items: [] }
    put(o)
  }
  cs.orderId = o.id
  cs.view = 'bill'
}
export function openOrder(o: any) { cs.orderId = o.id; cs.view = 'bill' }
export const newTakeaway = () => tracked('takeaway', async () => {
  const r = await call('create_order', { channel: 'takeaway' })
  if (!r) return
  put({ ...r.order, order_items: [] })
  cs.orderId = r.order.id
  cs.view = 'bill'
})
export async function backToHome() {
  const o = order.value
  cs.view = 'home'
  if (o && !o.order_items.length && o.status === 'open') { // an empty bill would block closing the shop
    if (await call('discard_empty', { order_id: o.id })) drop(o.id)
  } else refreshIfStale(60_000)
}

export function addItem(m: any, opt: { size?: any; qty: number; note: string }) {
  const o = order.value
  if (!o) return
  const note = opt.note.trim() || null
  const size_name = opt.size?.name ?? null
  const twin = o.order_items.find((i: any) => !i.removed_at && !i.sent_to_kitchen_at && !i.pending && i.menu_item_id === m.id && i.size_name === size_name && (i.note ?? null) === note)
  if (twin && opt.qty === 1) return changeQty(twin, 1) // same unsent dish again: bump quantity instead of a new line
  const tmp = {
    id: 'tmp-' + crypto.randomUUID(), menu_item_id: m.id, name: m.name, size_name, unit_price: Number(opt.size?.price ?? m.price),
    qty: opt.qty, note, sent_to_kitchen_at: null, removed_at: null, created_at: new Date().toISOString(), pending: true,
  }
  o.order_items.push(tmp)
  estimate(o)
  const id = o.id
  call('add_item', { order_id: id, menu_item_id: m.id, size_id: opt.size?.id, qty: opt.qty, note }).then((r) => {
    if (r) put(r.order, r.menu_rev)
    else { const cur = cs.data?.open_orders.find((x: any) => x.id === id); if (cur) { cur.order_items = cur.order_items.filter((i: any) => i !== tmp && i.id !== tmp.id); estimate(cur) } }
  })
}

export function changeQty(item: any, delta: 1 | -1) {
  const o = order.value
  if (!o || item.pending) return
  const id = o.id
  if (!item.sent_to_kitchen_at) { // unsent: edit locally right away
    if (item.qty + delta < 1) o.order_items = o.order_items.filter((i: any) => i.id !== item.id)
    else item.qty += delta
    estimate(o)
  }
  call('change_qty', { order_id: id, item_id: item.id, delta }).then((r) => (r ? put(r.order, r.menu_rev) : sync(id)))
}

// sent lines are struck through for the kitchen; unsent ones just disappear
export function removeItem(item: any) {
  const o = order.value
  if (!o || item.pending) return
  const id = o.id
  if (item.sent_to_kitchen_at) item.removed_at = new Date().toISOString()
  else o.order_items = o.order_items.filter((i: any) => i.id !== item.id)
  estimate(o)
  call('remove_item', { order_id: id, item_id: item.id }).then((r) => (r ? put(r.order, r.menu_rev) : sync(id)))
}

export function setNote(item: any, note: string) {
  const o = order.value
  if (!o || item.pending || item.sent_to_kitchen_at) return
  const id = o.id
  item.note = note.trim() || null
  call('set_note', { order_id: id, item_id: item.id, note }).then((r) => (r ? put(r.order, r.menu_rev) : sync(id)))
}

export const sendKitchen = () => tracked('send', async () => {
  const r = await call('send_to_kitchen', { order_id: cs.orderId })
  if (r) put(r.order, r.menu_rev)
})

// ---- discounts ----
export const checkCode = (code: string) => call('apply_code', { order_id: cs.orderId, code, dry_run: true })
export async function applyCode(code: string) {
  const r = await call('apply_code', { order_id: cs.orderId, code })
  if (r) put(r.order, r.menu_rev)
  return !!r
}
export const listPromos = () => call('list_promos', { order_id: cs.orderId })
export async function applyPromo(id: string) {
  const r = await call('apply_promo', { order_id: cs.orderId, promotion_id: id })
  if (r) put(r.order, r.menu_rev)
  return !!r
}
export async function clearDiscount() {
  const r = await call('clear_discount', { order_id: cs.orderId })
  if (r) put(r.order, r.menu_rev)
}

// ---- finish ----
export async function pay(method: 'cash' | 'qr', received?: number) {
  const r = await call('pay', { order_id: cs.orderId, method })
  if (!r) return false
  put(r.order, r.menu_rev)
  cs.receipt = { order: r.order, received: received ?? null, change: received == null ? null : round2(received - Number(r.order.net)) }
  cs.view = 'receipt'
  return true
}
export async function voidBill(reason: string) {
  const id = cs.orderId
  if (!(await call('void', { order_id: id, reason }))) return false
  drop(id)
  cs.view = 'home'
  return true
}
