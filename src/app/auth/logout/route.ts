import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
export async function POST(request:NextRequest){const origin=request.headers.get('origin');if(origin!==request.nextUrl.origin)return new NextResponse('Forbidden',{status:403});try{await(await createSupabaseServer()).auth.signOut();}catch{}return NextResponse.redirect(new URL('/login',request.url),303);}
