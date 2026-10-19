// run: node --experimental-transform-types util.test.ts
import assert from 'node:assert/strict'
import { codeDiscount, vatOf, HttpError } from './util.ts'

// VAT = net*7/107, 2 decimals
assert.equal(vatOf(107), 7)
assert.equal(vatOf(100), 6.54)
assert.equal(vatOf(155), 10.14) // matches the Figma receipt
assert.equal(vatOf(0), 0)

const code = { kind: 'percent', value: 10, min_total: 500, starts_at: null, expires_at: null, max_uses: null, used_count: 0,
  channels: null, menu_item_ids: null, category_ids: null, is_active: true } as const
const items = [{ menu_item_id: 'a', unit_price: 300, qty: 2 }]
assert.equal(codeDiscount(code, items, 'dine_in'), 60)
assert.throws(() => codeDiscount(code, [{ menu_item_id: 'a', unit_price: 100, qty: 1 }], 'dine_in'), HttpError) // below min
// "ลดต้มยำ 15 บาท": targeted baht code capped at matched subtotal
const tom = { ...code, kind: 'baht', value: 15, min_total: null, menu_item_ids: ['t'] } as const
assert.equal(codeDiscount(tom, [{ menu_item_id: 't', unit_price: 60, qty: 1 }, { menu_item_id: 'a', unit_price: 50, qty: 1 }], 'takeaway'), 15)
assert.throws(() => codeDiscount(tom, items, 'takeaway'), HttpError) // no matching item
assert.throws(() => codeDiscount({ ...code, expires_at: '2000-01-01' }, items, 'dine_in'), HttpError)
assert.throws(() => codeDiscount({ ...code, channels: ['takeaway'] }, items, 'dine_in'), HttpError)
console.log('ok')

// ---- promotions ----
import { promoDiscount } from './util.ts'
const P = (type: any, config: any) => ({ type, config, is_active: true })
const line = (id: string, price: number, qty: number, size: string | null = null) => ({ menu_item_id: id, unit_price: price, qty, size_name: size })
// bogo: 3 of same → 1 free; different size not paired
assert.equal(promoDiscount(P('bogo', { menu_item_ids: ['a'] }), [line('a', 60, 3)]), 60)
assert.equal(promoDiscount(P('bogo', {}), [line('a', 60, 1, 'S'), line('a', 80, 1, 'L')]), 0)
// happy hour 14:00-17:00 Bangkok = 07:00-10:00 UTC; 2026-10-14 is Wednesday (3)
const hh = P('happy_hour', { start: '14:00', end: '17:00', weekdays: [3], kind: 'percent', value: 20, menu_item_ids: ['tea'] })
const mixed = [line('tea', 30, 2), line('a', 50, 1)]
assert.equal(promoDiscount(hh, mixed, new Date('2026-10-14T08:00:00Z')), 12)
assert.equal(promoDiscount(hh, mixed, new Date('2026-10-14T10:00:00Z')), 0) // 17:00 sharp = over
assert.equal(promoDiscount(hh, mixed, new Date('2026-10-15T08:00:00Z')), 0) // Thursday
// spend X get Y
const sp = P('spend_x_get_y', { min_total: 500, kind: 'baht', value: 50 })
assert.equal(promoDiscount(sp, [line('a', 250, 2)]), 50)
assert.equal(promoDiscount(sp, [line('a', 249, 2)]), 0)
// set menu: 2 sets of (tomyum L + tea) priced 100 vs list 110
const set = P('set_menu', { items: [{ menu_item_id: 't', size_name: 'L', qty: 1 }, { menu_item_id: 'tea', size_name: null, qty: 1 }], price: 100 })
assert.equal(promoDiscount(set, [line('t', 80, 2, 'L'), line('tea', 30, 2)]), 20)
assert.equal(promoDiscount(set, [line('t', 60, 2, 'S'), line('tea', 30, 2)]), 0)
assert.equal(promoDiscount({ ...set, is_active: false }, [line('t', 80, 2, 'L'), line('tea', 30, 2)]), 0)
console.log('promo ok')

// ---- totalsFor ----
import { totalsFor } from './util.ts'
const bill = { channel: 'dine_in', discount_code_id: null, promotion_id: null }
const its = [{ menu_item_id: 'a', unit_price: 100, qty: 2 }]
assert.deepEqual(totalsFor(bill, its, null, null), { subtotal: 200, discount: 0, rounding: 0, net: 200, vat: 13.08 })
// applied code that qualifies
const c10 = { ...code, min_total: null } as any
assert.deepEqual(totalsFor({ ...bill, discount_code_id: 'x' }, its, c10, null), { subtotal: 200, discount: 20, rounding: 0, net: 180, vat: 11.78 })
// applied code that stopped qualifying (min total) is dropped
const t = totalsFor({ ...bill, discount_code_id: 'x' }, its, { ...c10, min_total: 500 }, null)
assert.equal(t.discount, 0); assert.equal((t as any).discount_code_id, null)
// applied promo whose condition vanished (bill emptied) is dropped
const t2 = totalsFor({ ...bill, promotion_id: 'p' }, [], null, P('bogo', {}) as any)
assert.equal((t2 as any).promotion_id, null); assert.equal(t2.net, 0)
console.log('totals ok')

// payment total is rounded UP to whole baht, rounding line keeps the receipt adding up: 10% off 45 = 40.50 → pay 41
const r = totalsFor({ ...bill, discount_code_id: 'x' }, [{ menu_item_id: 'a', unit_price: 45, qty: 1 }], c10, null)
assert.deepEqual(r, { subtotal: 45, discount: 4.5, rounding: 0.5, net: 41, vat: 2.68 })
assert.equal(r.subtotal - r.discount + r.rounding, r.net)
console.log('rounding ok')
