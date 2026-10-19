import { supabase } from './supabase'

// Calls the `pos` Edge Function. Sends the owner JWT automatically when logged in;
// cashier/kitchen pass their own credentials via `headers` / body.
export async function pos<T = any>(action: string, body: Record<string, unknown> = {}, headers: Record<string, string> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('pos', { body: { action, ...body }, headers })
  if (error) {
    const res = (error as any).context
    const msg = res?.json ? (await res.json().catch(() => null))?.error : null
    throw new Error(msg ?? error.message)
  }
  return data as T
}
