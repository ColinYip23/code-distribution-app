import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { normalizeSupabaseUrl } from './config';
export function isConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export async function createSupabaseServer() {
  if (!isConfigured()) throw new Error('SETUP_REQUIRED');
  const jar = await cookies();
  return createServerClient(normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Server Components cannot set cookies; proxy refreshes them. */ } },
    },
  });
}
