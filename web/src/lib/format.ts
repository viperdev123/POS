// Thai locale gives Buddhist-era years (พ.ศ.) automatically, matching the designs.
export const baht = (n: number | string) =>
  '฿' + Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const bahtInt = (n: number | string) => '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 })
export const pad3 = (n: number) => String(n).padStart(3, '0')
export const thDate = (d: Date | string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
export const thDateLong = (d: Date | string) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
export const thDateWeekday = (d: Date | string) => new Date(d).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const thTime = (d: Date | string) => new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })
export const thDateTime = (d: Date | string) => `${thDate(d)} · ${thTime(d)}`

// "โต๊ะ 3" / "กลับบ้าน #014"
export const orderTitle = (o: { channel: string; table_no: number | null; takeaway_no: number | null }) =>
  o.channel === 'dine_in' ? `โต๊ะ ${o.table_no}` : `กลับบ้าน #${pad3(o.takeaway_no ?? 0)}`
