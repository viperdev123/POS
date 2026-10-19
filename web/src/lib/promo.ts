// One-line description of a promotion, shared by the owner list and the cashier discount sheet.
export const PROMO_TYPES = { bogo: 'ซื้อ 1 แถม 1', happy_hour: 'ช่วงเวลาพิเศษ', spend_x_get_y: 'ซื้อครบลดทันที', set_menu: 'เซ็ตเมนู' } as const
export type PromoType = keyof typeof PROMO_TYPES
export const DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

const disc = (c: any) => (c.kind === 'percent' ? `${c.value}%` : `${c.value} บาท`)

export function describePromo(type: PromoType, c: any, nameOf: (id: string) => string): string {
  const items = c.menu_item_ids?.length ? c.menu_item_ids.map(nameOf).join(', ') : 'ทุกเมนู'
  switch (type) {
    case 'bogo': return `ซื้อ ${items} 1 แถม 1`
    case 'happy_hour': {
      const days = c.weekdays?.length && c.weekdays.length < 7 ? c.weekdays.map((d: number) => DAYS[d]).join(' ') : 'ทุกวัน'
      return `${c.menu_item_ids?.length ? items : 'ทุกเมนู'}ลด ${disc(c)} · ${c.start}–${c.end} · ${days}`
    }
    case 'spend_x_get_y': return `ซื้อครบ ฿${c.min_total} ลด ${c.kind === 'percent' ? c.value + '%' : '฿' + c.value} · ทุกเมนู`
    case 'set_menu': return `${c.items.map((i: any) => `${nameOf(i.menu_item_id)}${i.size_name ? ' ' + i.size_name : ''}${i.qty > 1 ? ' ×' + i.qty : ''}`).join(' + ')} · ราคาเซ็ต ฿${c.price}`
  }
}
