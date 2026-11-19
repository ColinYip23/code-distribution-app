import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const owner = '10000000-0000-4000-8000-000000000001';
const outsider = '10000000-0000-4000-8000-000000000002';
const business = '20000000-0000-4000-8000-000000000001';
let db: PGlite;
async function rpc(name: string, input: Record<string, unknown> = {}) {
  const response = await db.query<{ result: Record<string, unknown> }>(`select public.${name}($1::jsonb) as result`, [JSON.stringify(input)]);
  return response.rows[0].result;
}
async function allocate(id: string, key = crypto.randomUUID()) {
  return (await db.query<{ result: Record<string, unknown> }>('select public.allocate_order($1::uuid,$2::uuid) as result', [id, key])).rows[0].result;
}
async function setupStock() {
  const p5 = await rpc('save_product', { sku: '5GB', name: '5GB', default_price: '2.00', low_stock_threshold: 10 });
  const p20 = await rpc('save_product', { sku: '20GB', name: '20GB', default_price: '6.00', low_stock_threshold: 5 });
  const client = await rpc('save_client', { name: 'Client A', legal_name: 'Client A Ltd', tin: '001234', currency: 'MYR', payment_terms: 30 });
  await rpc('import_codes', { request_key: crypto.randomUUID(), product_id: p5.id, codes: Array.from({ length: 100 }, (_, i) => `5-${String(i).padStart(5, '0')}`) });
  await rpc('import_codes', { request_key: crypto.randomUUID(), product_id: p20.id, codes: Array.from({ length: 50 }, (_, i) => `20-${i}`) });
  return { p5, p20, client };
}
async function createOrder(clientId: unknown, productId: unknown, quantity = 10) {
  return rpc('save_order', { client_id: clientId, currency: 'MYR', lines: [{ product_id: productId, quantity, unit_price: '2.00' }] });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    insert into auth.users values ('${owner}'),('${outsider}');`);
  await db.exec(readFileSync('supabase/migrations/202611190001_workspace.sql', 'utf8'));
  await db.exec(`insert into public.businesses(id,name) values ('${business}','Test business');
    insert into public.business_members(business_id,user_id,role) values ('${business}','${owner}','owner');`);
});
beforeEach(async () => {
  await db.exec('begin');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [owner]);
  await db.exec('set local role authenticated');
});
afterEach(async () => { await db.exec('rollback'); });
afterAll(async () => { await db?.close(); });

describe('database workflows', () => {
  it('imports unique stock and skips duplicates across product types and retries', async () => {
    const { p5, p20 } = await setupStock();
    const key = crypto.randomUUID();
    const first = await rpc('import_codes', { request_key: key, product_id: p5.id, codes: ['00123', '=ABCD', '00123'] });
    expect(first.inserted).toBe(2);
    expect((await rpc('import_codes', { request_key: key, product_id: p5.id, codes: ['00123', '=ABCD'] })).batch_id).toBe(first.batch_id);
    expect((await rpc('import_codes', { request_key: crypto.randomUUID(), product_id: p20.id, codes: ['00123'] })).inserted).toBe(0);
  });
  it('allocates 10/3 from 100/50 and retries without taking more codes', async () => {
    const { p5, p20, client } = await setupStock();
    const order = await rpc('save_order', { client_id: client.id, currency: 'MYR', lines: [{ product_id: p5.id, quantity: 10, unit_price: '2' }, { product_id: p20.id, quantity: 3, unit_price: '6' }] });
    const key = crypto.randomUUID();
    await allocate(order.id as string, key); await allocate(order.id as string, key); await allocate(order.id as string);
    const result = await rpc('order_codes', { id: order.id });
    expect(result.codes).toHaveLength(13);
    const stock = await db.query<{ available: number }>('select available from public.stock_summary order by sku');
    expect(stock.rows.map(row => row.available).sort((a,b) => a-b)).toEqual([47, 90]);
  });
  it('rolls back every product line if one line is short', async () => {
    const { p5, p20, client } = await setupStock();
    const order = await rpc('save_order', { client_id: client.id, currency: 'MYR', lines: [{ product_id: p5.id, quantity: 10, unit_price: '2' }, { product_id: p20.id, quantity: 51, unit_price: '6' }] });
    await db.exec('savepoint shortage');
    await expect(allocate(order.id as string)).rejects.toThrow('INSUFFICIENT_STOCK');
    await db.exec('rollback to savepoint shortage');
    expect((await db.query<{ allocated: number }>('select sum(allocated)::int as allocated from public.stock_summary')).rows[0].allocated).toBe(0);
  });
  it('does not reissue codes after cancellation', async () => {
    const { p5, client } = await setupStock(); const order = await createOrder(client.id, p5.id);
    await allocate(order.id as string); await rpc('transition_order', { id: order.id, status: 'cancelled', reason: 'Client cancelled' });
    expect((await db.query<{ allocated: number }>('select allocated from public.stock_summary where product_id=$1', [p5.id])).rows[0].allocated).toBe(10);
  });
  it('excludes expired and void codes from allocation', async () => {
    const { p5, client } = await setupStock();
    await rpc('import_codes', { request_key: crypto.randomUUID(), product_id: p5.id, codes: ['EXPIRED'], expires_on: '2000-01-01' });
    await db.exec('reset role');
    await db.query("update public.codes set status='void' where code_value='5-00000'");
    await db.exec('set local role authenticated');
    const order = await createOrder(client.id, p5.id, 99); await allocate(order.id as string);
    const codes = (await rpc('order_codes', { id: order.id })).codes as { code: string }[];
    expect(codes.some(row => row.code === 'EXPIRED' || row.code === '5-00000')).toBe(false);
  });
  it('denies nonmembers direct data and privileged RPC access', async () => {
    await setupStock();
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [outsider]);
    expect((await db.query('select * from public.clients')).rows).toHaveLength(0);
    await expect(rpc('save_product', { sku: 'BAD', name: 'Bad' })).rejects.toThrow('FORBIDDEN');
  });
  it('denies direct code reads and order status mutations even to members', async () => {
    await setupStock(); await db.exec('savepoint denied');
    await expect(db.query('select code_value from public.codes')).rejects.toThrow('permission denied');
    await db.exec('rollback to savepoint denied');
    await expect(db.query("update public.orders set status='allocated'")).rejects.toThrow('permission denied');
  });
  it('edits invoice billing independently and calculates exact totals', async () => {
    const { p5, client } = await setupStock(); const order = await createOrder(client.id, p5.id); await allocate(order.id as string);
    const invoice = await rpc('save_invoice', { client_id: client.id, currency: 'MYR', number: 'CUSTOM-001', order_ids: [order.id], adjustment: '-0.14', lines: [{ product_id: p5.id, description: '5GB', quantity: 2, unit_price: '10', discount: '1', tax_rate: '6' }] });
    expect(invoice.total).toBe('20.00'); expect(invoice.mismatch).toBe(true);
    expect((await rpc('order_codes', { id: order.id })).codes).toHaveLength(10);
    await expect(rpc('issue_invoice', { id: invoice.id, request_key: crypto.randomUUID(), mismatch_reason: '' })).rejects.toThrow('MISMATCH');
  });
  it('requires a verified template before invoice issue', async () => {
    const { client } = await setupStock();
    const invoice = await rpc('save_invoice', { client_id: client.id, currency: 'MYR', lines: [{ description: 'Manual', quantity: 1, unit_price: '10', discount: '0', tax_rate: '0' }] });
    await expect(rpc('issue_invoice', { id: invoice.id, request_key: crypto.randomUUID() })).rejects.toThrow('TEMPLATE_REQUIRED');
  });
  it('previews existing codes without exposing unrelated inventory values', async () => {
    await setupStock();
    const preview=await rpc('preview_import',{codes:['5-00000','NEW']});
    expect(preview.existing).toEqual(['5-00000']);
  });
  it('issues immutable invoice snapshots and tracks payments without changing inventory',async()=>{
    const{client}=await setupStock();
    const template=await rpc('save_template',{name:'Test.xlsx',storage_path:`${business}/templates/test.xlsx`,mapping:{worksheet:'Invoice',fields:{number:'A1'},firstItemRow:5,maxItems:10,columns:{description:1,quantity:2,unitPrice:3,amount:4}}});
    await rpc('verify_template',{id:template.id});
    const invoice=await rpc('save_invoice',{client_id:client.id,currency:'MYR',number:'INV-TEST',lines:[{description:'Codes',quantity:2,unit_price:'10',discount:'0',tax_rate:'0'}]});
    const issued=await rpc('issue_invoice',{id:invoice.id,request_key:crypto.randomUUID()});
    expect((issued.snapshot as Record<string,unknown>).billing_tin).toBe('001234');
    const repeated=await rpc('issue_invoice',{id:invoice.id,request_key:crypto.randomUUID()});expect(repeated.id).toBe(issued.id);
    await rpc('save_client',{...client,tin:'UPDATED'});
    const stored=await db.query<{snapshot:{billing_tin:string}}>('select snapshot from public.invoice_revisions where id=$1',[issued.id]);expect(stored.rows[0].snapshot.billing_tin).toBe('001234');
    const key=crypto.randomUUID();await rpc('record_payment',{invoice_id:invoice.id,amount:'5',request_key:key});await rpc('record_payment',{invoice_id:invoice.id,amount:'5',request_key:key});
    expect((await db.query<{paid:string}>('select sum(amount)::text as paid from public.payments where invoice_id=$1',[invoice.id])).rows[0].paid).toBe('5.00');
    await db.exec('savepoint paid_void');await expect(rpc('void_invoice',{id:invoice.id,reason:'Correction'})).rejects.toThrow('INVALID_STATE');await db.exec('rollback to savepoint paid_void');
    const payment=(await db.query<{id:string}>('select id from public.payments where invoice_id=$1',[invoice.id])).rows[0];await rpc('reverse_payment',{id:payment.id,reason:'Incorrect bookkeeping entry'});
    await rpc('void_invoice',{id:invoice.id,reason:'Correction'});
    expect((await db.query<{allocated:number}>('select sum(allocated)::int as allocated from public.stock_summary')).rows[0].allocated).toBe(0);
  });
  it('rejects missing order lines at the database boundary',async()=>{
    const{client}=await setupStock();await expect(rpc('save_order',{client_id:client.id,currency:'MYR'})).rejects.toThrow('VALIDATION_ERROR');
  });
  it('keeps an oversized invoice as an editable draft instead of issuing an unrenderable revision',async()=>{
    const{client}=await setupStock();
    const t=await rpc('save_template',{name:'Tiny.xlsx',storage_path:`${business}/templates/tiny.xlsx`,mapping:{worksheet:'Invoice',maxItems:1}});await rpc('verify_template',{id:t.id});
    const line={description:'Code',quantity:1,unit_price:'1',discount:'0',tax_rate:'0'};
    const invoice=await rpc('save_invoice',{client_id:client.id,currency:'MYR',lines:[line,line]});
    await db.exec('savepoint capacity');await expect(rpc('issue_invoice',{id:invoice.id,request_key:crypto.randomUUID()})).rejects.toThrow('TEMPLATE_CAPACITY');await db.exec('rollback to savepoint capacity');
    expect((await db.query<{status:string}>('select status from public.invoices where id=$1',[invoice.id])).rows[0].status).toBe('draft');
  });
  it('allows voiding an unissued draft whose proposed number is already issued',async()=>{
    const{client}=await setupStock();const t=await rpc('save_template',{name:'Test.xlsx',storage_path:`${business}/templates/test.xlsx`,mapping:{maxItems:5}});await rpc('verify_template',{id:t.id});
    const input={client_id:client.id,currency:'MYR',number:'DUP-001',lines:[{description:'Codes',quantity:1,unit_price:'1',discount:'0',tax_rate:'0'}]};
    const first=await rpc('save_invoice',input);await rpc('issue_invoice',{id:first.id,request_key:crypto.randomUUID()});
    const draft=await rpc('save_invoice',input);expect((await rpc('void_invoice',{id:draft.id,reason:'Duplicate draft'})).status).toBe('void');
  });
  it('confirms the originally reviewed product and metadata even if a request is changed',async()=>{
    const{p5,p20}=await setupStock();
    const preview=await rpc('create_import_preview',{product_id:p5.id,supplier:'Original supplier',codes:['REVIEWED-CODE']});
    const first=await rpc('confirm_import',{preview_id:preview.preview_id,product_id:p20.id,supplier:'Changed supplier',codes:['DIFFERENT']});
    const repeated=await rpc('confirm_import',{preview_id:preview.preview_id});expect(repeated.batch_id).toBe(first.batch_id);
    const batch=(await db.query<{product_id:string;supplier:string;inserted:number}>('select product_id,supplier,inserted from public.inventory_batches where id=$1',[first.batch_id])).rows[0];
    expect(batch).toEqual({product_id:p5.id,supplier:'Original supplier',inserted:1});
  });
});
