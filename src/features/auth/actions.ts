'use server';
import { z } from 'zod';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/shared/contracts';
export async function signIn(form:FormData):Promise<ActionResult>{
 const input=z.object({email:z.email(),password:z.string().min(1).max(1024)}).safeParse(Object.fromEntries(form));
 if(!input.success)return{ok:false,message:'Enter your email address and password.'};
 try{const supabase=await createSupabaseServer();const{data,error}=await supabase.auth.signInWithPassword(input.data);if(error||!data.user)return{ok:false,message:'Unable to sign in. Check your email and password.'};const membership=await supabase.from('business_members').select('business_id').eq('user_id',data.user.id).eq('active',true).maybeSingle();if(membership.error||!membership.data){await supabase.auth.signOut();return{ok:false,message:'This account has not been granted workspace access. Contact the workspace owner.'};}return{ok:true,message:'Signed in.'};}catch{return{ok:false,message:'Supabase is not connected. Complete the local setup first.'};}
}
