// Default is read-only. Pass --apply to insert missing products; existing prices/settings are preserved.
import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
if (!['/', '/rest/v1', '/rest/v1/'].includes(url.pathname) || url.username || url.password) throw new Error('Use the project URL or REST endpoint.');
const client = createClient(url.origin, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const memberships = await client.from('business_members').select('business_id').eq('active', true).eq('role', 'owner');
if (memberships.error) throw new Error('Unable to inspect workspace membership.');
const ids = [...new Set(memberships.data.map(row => row.business_id))];
if (ids.length !== 1) throw new Error('This helper requires exactly one owner workspace.');
const catalog = JSON.parse(fs.readFileSync('src/features/catalog/cme-products.json', 'utf8'));
const current = await client.from('products').select('sku').eq('business_id', ids[0]);
if (current.error) throw new Error('Unable to inspect existing products.');
const missing = catalog.filter(product => !current.data.some(row => row.sku === product.sku));
console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'preview', missingProducts: missing.map(row => ({ name: row.name, sku: row.sku })), note: 'Selling prices were not supplied. Initial defaults are zero; set your prices before fulfilment.' }, null, 2));
if (process.argv.includes('--apply') && missing.length) {
  const result = await client.from('products').upsert(missing.map(row => ({ ...row, business_id: ids[0] })), { onConflict: 'business_id,sku', ignoreDuplicates: true }).select('sku');
  if (result.error) throw new Error('Could not save the product catalog.');
  console.log(`Inserted ${result.data.length} missing products. No stock, clients, orders, invoices, or existing prices changed.`);
}
