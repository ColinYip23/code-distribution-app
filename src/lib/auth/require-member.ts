import 'server-only';
import { createSupabaseServer } from '@/lib/supabase/server';
export async function requireMember() {
  const supabase = await createSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('UNAUTHENTICATED');
  const membership = await supabase.from('business_members').select('business_id,role').eq('user_id', user.id).eq('active', true).single();
  if (membership.error || !membership.data) throw new Error('FORBIDDEN');
  return { supabase, userId: user.id, userEmail: user.email ?? '', businessId: membership.data.business_id as string, role: membership.data.role as 'owner' | 'staff' };
}
