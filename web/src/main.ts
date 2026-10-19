import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import { supabase } from './lib/supabase'
import { ui } from './lib/loading'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/owner/menu' },
    { path: '/cashier', component: () => import('./pages/Cashier.vue') },
    { path: '/kitchen', component: () => import('./pages/Kitchen.vue') },
    { path: '/owner/login', component: () => import('./pages/owner/OwnerLogin.vue') },
    {
      path: '/owner',
      component: () => import('./pages/owner/OwnerLayout.vue'),
      meta: { owner: true },
      children: [
        { path: 'menu', component: () => import('./pages/owner/OwnerMenu.vue') },
        { path: 'menu/new', component: () => import('./pages/owner/OwnerMenuEdit.vue'), meta: { crumb: 'เมนูอาหาร / เพิ่มเมนู' } },
        { path: 'menu/:id', component: () => import('./pages/owner/OwnerMenuEdit.vue'), meta: { crumb: 'เมนูอาหาร / แก้ไขเมนู' } },
        { path: 'categories', component: () => import('./pages/owner/OwnerCategories.vue'), meta: { crumb: 'เมนูอาหาร / หมวดหมู่' } },
        { path: 'promos', component: () => import('./pages/owner/OwnerPromos.vue') },
        { path: 'promos/new', component: () => import('./pages/owner/OwnerPromoEdit.vue'), meta: { crumb: 'โปรโมชัน / สร้างโปรโมชัน' } },
        { path: 'promos/:id', component: () => import('./pages/owner/OwnerPromoEdit.vue'), meta: { crumb: 'โปรโมชัน / แก้ไข' } },
        { path: 'codes', component: () => import('./pages/owner/OwnerCodes.vue') },
        { path: 'codes/new', component: () => import('./pages/owner/OwnerCodeEdit.vue'), meta: { crumb: 'โค้ดส่วนลด / สร้างโค้ด' } },
        { path: 'codes/:id', component: () => import('./pages/owner/OwnerCodeEdit.vue'), meta: { crumb: 'โค้ดส่วนลด / แก้ไข' } },
        { path: 'settings', component: () => import('./pages/owner/OwnerSettings.vue') },
      ],
    },
  ],
})

router.beforeEach(() => { ui.navigating = true })
router.afterEach(() => { ui.navigating = false })
router.onError(() => { ui.navigating = false })
router.beforeEach(async (to) => {
  if (!to.meta.owner) return true
  const { data } = await supabase.auth.getSession() // reads the local session, no network round-trip
  return data.session ? true : '/owner/login'
})

createApp(App).use(router).mount('#app')
