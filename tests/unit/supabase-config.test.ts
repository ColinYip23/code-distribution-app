import {expect,it} from 'vitest';
import {normalizeSupabaseUrl} from '@/lib/supabase/config';
it('accepts the REST endpoint supplied in environment configuration as the project root',()=>{
 expect(normalizeSupabaseUrl('https://example.supabase.co/rest/v1/')).toBe('https://example.supabase.co');
 expect(normalizeSupabaseUrl('https://example.supabase.co')).toBe('https://example.supabase.co');
});
it('does not silently accept arbitrary API paths or credentials in the URL',()=>{
 expect(()=>normalizeSupabaseUrl('https://example.supabase.co/other')).toThrow();
 expect(()=>normalizeSupabaseUrl('https://someone:secret@example.supabase.co')).toThrow();
});
