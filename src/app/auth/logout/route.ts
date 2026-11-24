import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
  // Next.js normalizes loopback IPs to localhost; Host retains the browser's origin.
  requestUrl.host = request.headers.get('host') ?? requestUrl.host;
  if (request.headers.get('origin') !== requestUrl.origin) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  try { await (await createSupabaseServer()).auth.signOut(); } catch {}
  return NextResponse.redirect(new URL('/login', requestUrl), 303);
}
