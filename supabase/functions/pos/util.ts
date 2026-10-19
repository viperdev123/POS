const enc = new TextEncoder()
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)))
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

// ---- PIN hashing (PBKDF2) ----
async function pbkdf2(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 }, key, 256))
}
export async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `${hex(salt)}:${await pbkdf2(pin, salt)}`
}
export async function verifyPin(pin: string, stored: string) {
  const [salt, h] = stored.split(':')
  return (await pbkdf2(pin, unhex(salt))) === h
}

// ---- kitchen link token ----
export const newToken = () => hex(crypto.getRandomValues(new Uint8Array(24)))
export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)))

// ---- cashier session token: "<expMs>.<hmac>" ----
const SESSION_MS = 12 * 3600_000
async function hmac(msg: string) {
  const secret = Deno.env.get('SESSION_SECRET')
  if (!secret) throw new HttpError(500, 'SESSION_SECRET not set')
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))
}
export async function signSession() {
  const exp = String(Date.now() + SESSION_MS)
  return `${exp}.${await hmac(exp)}`
}
export async function checkSession(token: string) {
  const [exp, sig] = token.split('.')
  if (!exp || !sig || Number(exp) < Date.now() || (await hmac(exp)) !== sig) throw new HttpError(401, 'session หมดอายุ กรุณาใส่ PIN ใหม่')
}

// ---- money ----
export const round2 = (n: number) => Math.round(n * 100) / 100
// prices include VAT 7%; VAT shown = net*7/107 to 2 decimals (net itself is already a whole-baht total, see totalsFor)
export const vatOf = (net: number) => round2((net * 7) / 107)
const baht = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export type Item = { menu_item_id: string | null; category_id?: string | null; size_name?: string | null; unit_price: number; qty: number }
export type Code = {
  kind: 'percent' | 'baht'; value: number; min_total: number | null
  starts_at: string | null; expires_at: string | null; max_uses: number | null; used_count: number
  channels: string[] | null; menu_item_ids: string[] | null; category_ids: string[] | null; is_active: boolean
}

// returns the discount amount, or throws HttpError(400, reason)
export function codeDiscount(code: Code, items: Item[], channel: string, now = new Date()): number {
  const bad = (m: string) => { throw new HttpError(400, m) }
  if (!code.is_active) bad('โค้ดนี้ปิดใช้งานแล้ว')
  if (code.starts_at && new Date(code.starts_at) > now) bad('โค้ดนี้ยังไม่เริ่มใช้งาน')
  if (code.expires_at && new Date(code.expires_at) < now) bad('โค้ดนี้หมดอายุแล้ว')
  if (code.max_uses != null && code.used_count >= code.max_uses) bad('โค้ดนี้ถูกใช้ครบจำนวนแล้ว')
  if (code.channels && !code.channels.includes(channel)) bad('โค้ดนี้ใช้กับช่องทางนี้ไม่ได้')
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0)
  if (code.min_total != null && subtotal < code.min_total)
    bad(`ยอดไม่ถึงขั้นต่ำ · ยอดครบ ฿${baht(code.min_total)} บิลนี้ ฿${baht(subtotal)} ยังขาด ฿${baht(code.min_total - subtotal)}`)
  const targeted = code.menu_item_ids || code.category_ids
  const base = targeted
    ? items
        .filter((i) => code.menu_item_ids?.includes(i.menu_item_id ?? '') || code.category_ids?.includes(i.category_id ?? ''))
        .reduce((s, i) => s + i.unit_price * i.qty, 0)
    : subtotal
  if (base <= 0) bad('ไม่มีเมนูที่ร่วมโค้ดนี้ในบิล')
  const d = code.kind === 'percent' ? (base * code.value) / 100 : code.value
  return round2(Math.min(d, base))
}

// ---- auto promotions ----
export type Promo = {
  type: 'bogo' | 'happy_hour' | 'spend_x_get_y' | 'set_menu'
  config: Record<string, any>
  is_active: boolean
}
const pct = (kind: string, value: number, base: number) => round2(Math.min(kind === 'percent' ? (base * value) / 100 : value, base))
const sumOf = (xs: Item[]) => xs.reduce((s, i) => s + i.unit_price * i.qty, 0)
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }

// Discount this promo gives on the bill, 0 if it does not apply now. Times are Asia/Bangkok (UTC+7).
export function promoDiscount(p: Promo, items: Item[], now = new Date()): number {
  if (!p.is_active) return 0
  const c = p.config ?? {}
  const pick = (ids?: string[] | null) => (ids?.length ? items.filter((i) => ids.includes(i.menu_item_id ?? '')) : items)
  switch (p.type) {
    case 'bogo': { // buy 1 get 1: same item + size + price, every 2nd one free
      const groups = new Map<string, { qty: number; price: number }>()
      for (const i of pick(c.menu_item_ids)) {
        const k = `${i.menu_item_id}|${i.size_name ?? ''}|${i.unit_price}`
        const g = groups.get(k) ?? { qty: 0, price: i.unit_price }
        g.qty += i.qty
        groups.set(k, g)
      }
      return round2([...groups.values()].reduce((s, g) => s + Math.floor(g.qty / 2) * g.price, 0))
    }
    case 'happy_hour': {
      const t = new Date(now.getTime() + 7 * 3600_000)
      const hm = t.getUTCHours() * 60 + t.getUTCMinutes()
      const [s, e] = [mins(c.start), mins(c.end)]
      if (c.weekdays?.length && !c.weekdays.includes(t.getUTCDay())) return 0
      if (!(s <= e ? hm >= s && hm < e : hm >= s || hm < e)) return 0 // end < start = past midnight
      return pct(c.kind, c.value, sumOf(pick(c.menu_item_ids)))
    }
    case 'spend_x_get_y': {
      const total = sumOf(items)
      return total >= c.min_total ? pct(c.kind, c.value, total) : 0
    }
    case 'set_menu': { // c.items = [{menu_item_id, size_name|null, qty}], c.price = fixed set price
      let sets = Infinity, listPerSet = 0
      for (const r of c.items as { menu_item_id: string; size_name: string | null; qty: number }[]) {
        const m = items.filter((i) => i.menu_item_id === r.menu_item_id && (i.size_name ?? null) === (r.size_name ?? null))
        sets = Math.min(sets, Math.floor(m.reduce((s, i) => s + i.qty, 0) / r.qty))
        if (m[0]) listPerSet += m[0].unit_price * r.qty
      }
      return sets >= 1 && sets !== Infinity && listPerSet > c.price ? round2(sets * (listPerSet - c.price)) : 0
    }
  }
  return 0
}

// ---- bill totals (pure; index.ts feeds it one order_snapshot) ----
// Returns the columns to write on the order. A code/promo that no longer qualifies is dropped (fields set to null).
export function totalsFor(
  o: { channel: string; discount_code_id: string | null; promotion_id: string | null },
  items: Item[],
  code: Code | null,
  promo: Promo | null,
  now = new Date(),
) {
  const subtotal = round2(sumOf(items))
  let discount = 0
  let drop: Record<string, null> = {}
  if (o.discount_code_id) {
    try {
      discount = code ? codeDiscount(code, items, o.channel, now) : 0
    } catch { /* no longer qualifies */ }
    if (!discount) drop = { discount_code_id: null, discount_label: null }
  } else if (o.promotion_id) {
    discount = promo ? promoDiscount(promo, items, now) : 0
    if (!discount) drop = { promotion_id: null, discount_label: null }
  }
  // the amount to pay is rounded UP to whole baht; `rounding` keeps the receipt lines adding up exactly
  const exact = round2(subtotal - discount)
  const net = Math.ceil(exact)
  return { subtotal, discount, rounding: round2(net - exact), net, vat: vatOf(net), ...drop }
}
