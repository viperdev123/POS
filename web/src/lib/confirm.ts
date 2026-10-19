// Promise-based confirm dialog: `if (!(await ask({ title: '...' }))) return`. Rendered once by <ConfirmHost/> in App.vue.
import { reactive } from 'vue'

type Opts = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
export const dialog = reactive<{ open: boolean; opts: Opts; resolve: (v: boolean) => void }>({ open: false, opts: { title: '' }, resolve: () => {} })

export function ask(opts: Opts): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.opts = opts
    dialog.resolve = (v) => { dialog.open = false; resolve(v) }
    dialog.open = true
  })
}
