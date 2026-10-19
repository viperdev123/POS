import { reactive } from 'vue'
// true while a route (lazy chunk + guards) is loading; shown by <TopBar/>
export const ui = reactive({ navigating: false })
