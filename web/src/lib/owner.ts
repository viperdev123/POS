import { supabase } from './supabase'

export const imageUrl = (p: string) => supabase.storage.from('menu-images').getPublicUrl(p).data.publicUrl

export type Size = { id?: string; name: string; price: number; sort_order?: number }
export type MenuItem = {
  id: string; category_id: string | null; name: string; image_path: string | null; price: number | null
  has_sizes: boolean; is_active: boolean; menu_sizes: Size[]
}
export type Category = { id: string; name: string; sort_order: number }

// 2 parallel queries (items with their sizes + categories) shared by every owner page that needs the menu
export async function loadMenu() {
  const [i, c] = await Promise.all([
    supabase.from('menu_items').select('id, category_id, name, image_path, price, has_sizes, is_active, sort_order, menu_sizes(id, name, price, sort_order)').order('sort_order').order('name'),
    supabase.from('categories').select('id, name, sort_order').order('sort_order').order('name'),
  ])
  const items = ((i.data ?? []) as any[]).map((m) => ({ ...m, menu_sizes: [...m.menu_sizes].sort((a, b) => a.sort_order - b.sort_order) })) as MenuItem[]
  return { items, categories: (c.data ?? []) as Category[] }
}

export const priceLine = (m: MenuItem) => (m.has_sizes ? m.menu_sizes.map((s) => `${s.name} ฿${Number(s.price)}`).join(' / ') : `฿${Number(m.price)}`)

// validated upload into the public menu-images bucket; returns the storage path or throws a Thai message
export async function uploadMenuImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('อัปโหลดได้เฉพาะไฟล์รูปภาพ')
  if (file.size > 5 * 1024 * 1024) throw new Error('รูปต้องมีขนาดไม่เกิน 5 เมกะไบต์')
  const path = `${crypto.randomUUID()}.${file.name.split('.').pop()}`
  const { error } = await supabase.storage.from('menu-images').upload(path, file)
  if (error) throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + error.message)
  return path
}
