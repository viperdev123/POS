// End-to-end check against the deployed `pos` function.
// Run (shop must be CLOSED; it opens+closes a test shift and voids its bills):
//   node scripts/flow-test.mjs            (asks for PIN)
//   CODE=SAVE10 node scripts/flow-test.mjs (also tests that discount code)
import assert from 'node:assert/strict'
import readline from 'node:readline/promises'

const URL = 'https://dfvxtydazkqssggtcfmz.supabase.co/functions/v1/pos'
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const pin = await rl.question('PIN แคชเชียร์: ')
rl.close()

let session = ''
async function call(action, body = {}, expectError) {
  const res = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session': session }, body: JSON.stringify({ action, ...body }) })
  const data = await res.json()
  if (expectError) { assert.ok(data.error, `${action}: expected error`); console.log(`  ✓ ${action} refused: ${data.error}`); return data }
  assert.ok(!data.error, `${action}: ${data.error}`)
  return data
}

session = (await call('cashier_login', { pin })).token
console.log('✓ login')
let st = await call('state')
assert.equal(st.shift, null, 'ร้านเปิดอยู่ ไม่รันเทสต์กับรอบจริง ปิดร้านก่อน')
const item = st.menu[0]
assert.ok(item, 'ยังไม่มีเมนู เพิ่มเมนูก่อน')
const line = { menu_item_id: item.id, size_id: item.has_sizes ? item.menu_sizes[0].id : undefined }
const price = Number(item.has_sizes ? item.menu_sizes[0].price : item.price)

await call('create_order', { channel: 'takeaway' }, true) // shop closed
await call('open_shift')
console.log('✓ open_shift')

// takeaway: order → kitchen → pay
const t = (await call('create_order', { channel: 'takeaway' })).order
const lineId = (await call('add_item', { order_id: t.id, ...line, qty: 2, note: 'test' })).order.order_items[0].id
// +/- on an unsent line edits it in place
let q = await call('change_qty', { order_id: t.id, item_id: lineId, delta: -1 })
assert.equal(Number(q.order.subtotal), price)
q = await call('change_qty', { order_id: t.id, item_id: lineId, delta: 1 })
assert.equal(Number(q.order.subtotal), price * 2)
await call('set_note', { order_id: t.id, item_id: lineId, note: 'ไม่เผ็ด' })
await call('send_to_kitchen', { order_id: t.id })
console.log('✓ change_qty / set_note')
// sent line: − cancels it and re-adds qty-1 as already sent; + adds an unsent twin
q = await call('change_qty', { order_id: t.id, item_id: lineId, delta: -1 })
let liveLines = q.order.order_items.filter((i) => !i.removed_at)
assert.equal(liveLines.length, 1)
assert.equal(liveLines[0].qty, 1)
assert.ok(liveLines[0].sent_to_kitchen_at)
assert.ok(q.order.order_items.find((i) => i.id === lineId).removed_at)
q = await call('change_qty', { order_id: t.id, item_id: liveLines[0].id, delta: 1 })
assert.equal(Number(q.order.subtotal), price * 2)
await call('set_note', { order_id: t.id, item_id: liveLines[0].id, note: 'x' }, true) // sent line: note is read-only
await call('send_to_kitchen', { order_id: t.id })
console.log('✓ sent-line quantity changes')
let paid = (await call('pay', { order_id: t.id, method: 'cash' })).order
assert.equal(Number(paid.net), price * 2)
assert.equal(Number(paid.vat), Math.round(((price * 2 * 7) / 107) * 100) / 100) // 2 decimals; the payment total itself is a whole-baht amount
assert.ok(Number.isInteger(Number(paid.net)))
console.log(`✓ takeaway #${paid.order_no} net=${paid.net} vat=${paid.vat}`)
await call('add_item', { order_id: t.id, ...line }, true) // paid bill is locked

// empty bill can be discarded; one with items cannot
const e = (await call('create_order', { channel: 'dine_in', table_no: 2 })).order
await call('discard_empty', { order_id: e.id })
assert.ok(!(await call('state')).open_orders.some((o) => o.id === e.id))
console.log('✓ discard_empty')

// kitchen screen API (needs the link token: KITCHEN_TOKEN=... from owner settings)
if (process.env.KITCHEN_TOKEN) {
  const kt = { kitchen_token: process.env.KITCHEN_TOKEN }
  const ko = (await call('kitchen_orders', kt)).orders.find((o) => o.id === t.id)
  assert.ok(ko, 'ครัวต้องเห็นบิลที่ส่งครัวแล้ว')
  await call('set_kitchen_status', { ...kt, order_id: t.id, status: 'cooking' })
  await call('set_kitchen_status', { ...kt, order_id: t.id, status: 'done' })
  await call('kitchen_orders', { kitchen_token: 'wrong' }, true)
  console.log('✓ kitchen')
}

// dine-in: remove a sent item, then close_shift must refuse while bill open
const d = (await call('create_order', { channel: 'dine_in', table_no: 1 })).order
await call('create_order', { channel: 'dine_in', table_no: 1 }, true) // table taken
const added = (await call('add_item', { order_id: d.id, ...line })).order.order_items[0]
await call('send_to_kitchen', { order_id: d.id })
await call('remove_item', { order_id: d.id, item_id: added.id })
const k = (await call('state')).open_orders.find((o) => o.id === d.id)
assert.ok(k.order_items[0].removed_at, 'ส่งครัวแล้วต้องเป็น soft delete')
await call('close_shift', {}, true) // bill still open

if (process.env.CODE) {
  await call('add_item', { order_id: d.id, ...line, qty: 3 })
  const r = await call('apply_code', { order_id: d.id, code: process.env.CODE })
  console.log(`✓ code ${process.env.CODE}: discount=${r.order.discount} net=${r.order.net}`)
}

await call('void', { order_id: d.id }, true) // reason required
await call('void', { order_id: d.id, reason: 'test' })
await call('void', { order_id: t.id, reason: 'test' })
const summary = (await call('close_shift')).summary
assert.equal(summary.bills, 0)
assert.equal(summary.void_count, 2)
console.log('✓ close_shift', summary)
console.log('ALL OK')
