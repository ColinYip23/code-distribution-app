-- Additive update for the existing CodeDesk schema. No inventory/order data is removed.
alter table public.codes add column if not exists source_details jsonb not null default '{}';
alter table public.invoices add column if not exists order_reference text not null default '';

create or replace function public.import_codes(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 b uuid:=public.require_business(); batch public.inventory_batches; v text;
 n int:=0; total int; metadata jsonb:='{}'; item jsonb; expiry text; details jsonb;
begin
 if jsonb_typeof(p_input->'codes') is distinct from 'array' then raise exception 'VALIDATION_ERROR: code array required'; end if;
 if jsonb_array_length(p_input->'codes') not between 1 and 5000 or p_input->>'request_key' is null then raise exception 'VALIDATION_ERROR: 1 to 5000 codes and request key required'; end if;
 if p_input ? 'entries' then
  if jsonb_typeof(p_input->'entries') is distinct from 'array' then raise exception 'VALIDATION_ERROR: invalid code metadata'; end if;
  if jsonb_array_length(p_input->'entries')>5000 then raise exception 'VALIDATION_ERROR: too many metadata rows'; end if;
  if exists(select 1 from jsonb_array_elements(p_input->'entries') e group by btrim(e->>'code',E' \t\r\n') having count(*)>1) then raise exception 'VALIDATION_ERROR: duplicate code metadata'; end if;
  select coalesce(jsonb_object_agg(btrim(e->>'code',E' \t\r\n'),e),'{}') into metadata from jsonb_array_elements(p_input->'entries') e;
 end if;
 if not exists(select 1 from public.products where id=(p_input->>'product_id')::uuid and business_id=b and active) then raise exception 'VALIDATION_ERROR: active product required'; end if;
 perform 1 from public.products where id=(p_input->>'product_id')::uuid and business_id=b for update;
 select * into batch from public.inventory_batches where business_id=b and request_key=(p_input->>'request_key')::uuid;
 if found then return jsonb_build_object('batch_id',batch.id,'inserted',batch.inserted,'skipped',batch.skipped,'replayed',true); end if;
 insert into public.inventory_batches(business_id,product_id,supplier,reference,notes,request_key)
 values(b,(p_input->>'product_id')::uuid,coalesce(p_input->>'supplier',''),coalesce(p_input->>'reference',''),coalesce(p_input->>'notes',''),(p_input->>'request_key')::uuid) returning * into batch;
 total:=jsonb_array_length(p_input->'codes');
 for v in select jsonb_array_elements_text(p_input->'codes') loop
  v:=btrim(v,E' \t\r\n');
  if v is null or length(v) not between 1 and 512 or v~E'[\r\n]' then raise exception 'VALIDATION_ERROR: invalid code'; end if;
  item:=metadata->v;
  expiry:=coalesce(nullif(item->>'expires_on',''),nullif(p_input->>'expires_on',''));
  if expiry is not null and expiry!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'VALIDATION_ERROR: invalid expiry date'; end if;
  details:=coalesce(item->'source','{}');
  if jsonb_typeof(details) is distinct from 'object' or length(details::text)>6000 then raise exception 'VALIDATION_ERROR: invalid source details'; end if;
  insert into public.codes(business_id,product_id,batch_id,code_value,expires_on,unit_cost,source_details)
  values(b,batch.product_id,batch.id,v,expiry::date,nullif(p_input->>'unit_cost','')::numeric,details)
  on conflict(business_id,code_value) do nothing;
  if found then n:=n+1; end if;
 end loop;
 update public.inventory_batches set inserted=n,skipped=total-n where id=batch.id;
 perform public.audit(b,'inventory.imported',batch.id,jsonb_build_object('inserted',n,'skipped',total-n));
 return jsonb_build_object('batch_id',batch.id,'inserted',n,'skipped',total-n);
end $$;

create or replace function public.import_capabilities(p_input jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin perform public.require_business(); return jsonb_build_object('source_metadata_version',2,'template_currency_guard',true); end $$;
revoke execute on function public.import_capabilities(jsonb) from public,anon,authenticated;
grant execute on function public.import_capabilities(jsonb) to authenticated;

-- The invoice draft RPC is replaced below, retaining its existing authorization and locking.

create or replace function public.save_invoice(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.invoices; c public.clients; o public.orders; l jsonb; pos int:=0; oid uuid;
sub numeric; disc numeric; tx numeric; adj numeric:=coalesce((p_input->>'adjustment')::numeric,0); v_mismatch boolean:=false; begin
 select * into c from public.clients where id=(p_input->>'client_id')::uuid and business_id=b and not archived; if not found then raise exception 'VALIDATION_ERROR: client required'; end if;
 if jsonb_typeof(p_input->'lines') is distinct from 'array' then raise exception 'VALIDATION_ERROR: invoice lines required'; end if;
 if jsonb_array_length(p_input->'lines') not between 1 and 100 then raise exception 'VALIDATION_ERROR: invoice lines required'; end if;
 if coalesce(p_input->>'adjustment','0')!~'^-?[0-9]+(\.[0-9]{1,2})?$' then raise exception 'VALIDATION_ERROR: adjustment'; end if;
 if p_input->>'id' is not null then
  select * into r from public.invoices where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if;
  if r.status<>'draft' then raise exception 'INVALID_STATE'; end if;
  delete from public.invoice_items where invoice_id=r.id; delete from public.invoice_orders where invoice_id=r.id;
 else insert into public.invoices(business_id,client_id,currency) values(b,c.id,coalesce(p_input->>'currency',c.currency)) returning * into r; end if;
 update public.invoices set client_id=c.id,currency=coalesce(p_input->>'currency',c.currency),number=nullif(btrim(p_input->>'number'),''),issue_date=coalesce(nullif(p_input->>'issue_date','')::date,current_date),due_date=coalesce(nullif(p_input->>'due_date','')::date,current_date+c.payment_terms),billing_name=coalesce(nullif(btrim(p_input->>'billing_name'),''),nullif(c.legal_name,''),c.name),billing_address=coalesce(p_input->>'billing_address',c.address),billing_tin=coalesce(p_input->>'billing_tin',c.tin),notes=coalesce(p_input->>'notes',''),adjustment=adj where id=r.id returning * into r;
 for l in select jsonb_array_elements(p_input->'lines') loop
  if length(btrim(coalesce(l->>'description','')))=0 or coalesce(l->>'quantity','')!~'^[0-9]+$' or coalesce(l->>'unit_price','')!~'^[0-9]+(\.[0-9]{1,2})?$' or coalesce(l->>'discount','0')!~'^[0-9]+(\.[0-9]{1,2})?$' or coalesce(l->>'tax_rate','0')!~'^[0-9]+(\.[0-9]{1,4})?$' then raise exception 'VALIDATION_ERROR: invalid invoice line'; end if;
  insert into public.invoice_items(business_id,invoice_id,product_id,description,quantity,unit_price,discount,tax_rate,position) values(b,r.id,nullif(l->>'product_id','')::uuid,l->>'description',(l->>'quantity')::int,(l->>'unit_price')::numeric,coalesce((l->>'discount')::numeric,0),coalesce((l->>'tax_rate')::numeric,0),pos); pos:=pos+1;
 end loop;
 for oid in select distinct value::uuid from jsonb_array_elements_text(coalesce(p_input->'order_ids','[]')) order by 1 loop
  select * into o from public.orders where id=oid and business_id=b for update;
  if not found or o.client_id<>c.id or o.currency<>r.currency or o.status not in ('allocated','sent') then raise exception 'VALIDATION_ERROR: linked order must match client/currency and be allocated'; end if;
  insert into public.invoice_orders(business_id,invoice_id,order_id) values(b,r.id,o.id);
 end loop;
 select coalesce(sum(round(quantity*unit_price,2)),0),coalesce(sum(discount),0),coalesce(sum(round((round(quantity*unit_price,2)-discount)*tax_rate/100,2)),0) into sub,disc,tx from public.invoice_items where invoice_id=r.id;
 if exists(select 1 from public.invoice_orders where invoice_id=r.id) then
  v_mismatch:=(select coalesce(jsonb_agg(jsonb_build_array(product_id,qty,amount) order by product_id),'[]') from(select i.product_id,sum(i.quantity) qty,sum(round(i.quantity*i.unit_price,2)) amount from public.order_items i join public.invoice_orders io on io.order_id=i.order_id where io.invoice_id=r.id group by i.product_id)x)
   is distinct from (select coalesce(jsonb_agg(jsonb_build_array(product_id,qty,amount) order by product_id),'[]') from(select product_id,sum(quantity) qty,sum(round(quantity*unit_price,2)) amount from public.invoice_items where invoice_id=r.id group by product_id)x);
  v_mismatch:=v_mismatch or disc<>0 or tx<>0 or adj<>0;
 end if;
 update public.invoices set subtotal=sub,discount=disc,tax=tx,total=sub-disc+tx+adj,mismatch=v_mismatch where id=r.id returning * into r;
 if length(coalesce(p_input->>'order_reference',''))>200 then raise exception 'VALIDATION_ERROR: order reference too long'; end if;
 update public.invoices set order_reference=coalesce(p_input->>'order_reference','') where id=r.id returning * into r;
 perform public.audit(b,'invoice.saved',r.id); return to_jsonb(r)||jsonb_build_object('total',r.total::text);
end $$;

create or replace function public.issue_invoice(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.invoices; t public.invoice_templates; rev public.invoice_revisions; snap jsonb; num text; seq bigint; yr int:=extract(year from current_date); begin
 select * into r from public.invoices where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if;
 if r.status='issued' then select * into rev from public.invoice_revisions where invoice_id=r.id; return to_jsonb(rev); end if;
 if r.status<>'draft' then raise exception 'INVALID_STATE'; end if;
 if r.mismatch and length(btrim(coalesce(p_input->>'mismatch_reason','')))<3 then raise exception 'MISMATCH: acknowledge differences from ordered quantities and amounts'; end if;
 select * into t from public.invoice_templates where business_id=b and active and verified order by created_at desc,id desc limit 1;
 if not found then raise exception 'TEMPLATE_REQUIRED: upload and verify the invoice workbook'; end if;
 if (select count(*) from public.invoice_items where invoice_id=r.id)>coalesce((t.mapping->>'maxItems')::int,0) then raise exception 'TEMPLATE_CAPACITY: invoice has more lines than the template supports'; end if;
 if nullif(t.mapping->>'currency','') is not null and t.mapping->>'currency'<>r.currency then raise exception 'TEMPLATE_CURRENCY: invoice must use the template currency'; end if;
 if p_input->>'request_key' is null then raise exception 'VALIDATION_ERROR: request key required'; end if;
 -- Serialize suggested numbering per business; custom numbers are still protected by a unique index.
 perform 1 from public.businesses where id=b for update;
 if r.number is not null then num:=r.number;
 else
  select case when invoice_sequence_year=yr then next_invoice_number else 1 end into seq from public.businesses where id=b;
  loop
   num:='INV-'||yr::text||'-'||lpad(seq::text,greatest(4,length(seq::text)),'0'); seq:=seq+1;
   exit when not exists(select 1 from public.invoices where business_id=b and number=num and issued_at is not null);
  end loop;
  update public.businesses set next_invoice_number=seq,invoice_sequence_year=yr where id=b;
 end if;
 update public.invoices set number=num,status='issued',issued_at=now(),issue_key=(p_input->>'request_key')::uuid,mismatch_reason=coalesce(p_input->>'mismatch_reason','') where id=r.id returning * into r;
 select to_jsonb(r)||jsonb_build_object('business',(select to_jsonb(x) from public.businesses x where x.id=b),'client',(select to_jsonb(x) from public.clients x where x.id=r.client_id),'lines',(select jsonb_agg(to_jsonb(x) order by position) from public.invoice_items x where invoice_id=r.id),'order_ids',(select coalesce(jsonb_agg(order_id),'[]') from public.invoice_orders where invoice_id=r.id),'template_id',t.id) into snap;
 insert into public.invoice_revisions(business_id,invoice_id,template_id,snapshot) values(b,r.id,t.id,snap) returning * into rev;
 perform public.audit(b,'invoice.issued',r.id); return to_jsonb(rev);
end $$;

-- Expiry follows the same Kuala Lumpur calendar as the app, independent of a session TimeZone.
create or replace view public.stock_summary with (security_barrier=true) as
select p.id as product_id,p.business_id,p.sku,p.name,p.active,p.default_price,p.low_stock_threshold,
 count(c.id) filter(where c.status='available' and (c.expires_on is null or c.expires_on>=((now() at time zone 'Asia/Kuala_Lumpur')::date)))::int as available,
 count(c.id) filter(where c.status='allocated')::int as allocated,
 count(c.id) filter(where c.status='void')::int as void,
 count(c.id) filter(where c.status='available' and c.expires_on<((now() at time zone 'Asia/Kuala_Lumpur')::date))::int as expired
from public.products p left join public.codes c on c.product_id=p.id and c.business_id=p.business_id
where p.business_id=public.current_business() group by p.id;

create or replace function public.allocate_order(p_order_id uuid,p_request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.orders; l public.order_items; ids uuid[]; begin
 if p_request_key is null then raise exception 'VALIDATION_ERROR: request key required'; end if;
 select * into r from public.orders where id=p_order_id and business_id=b for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 if r.status in ('allocated','sent') then return to_jsonb(r); end if;
 if r.status<>'draft' then raise exception 'INVALID_STATE'; end if;
 if not exists(select 1 from public.order_items where order_id=r.id) then raise exception 'VALIDATION_ERROR: empty order'; end if;
 perform 1 from public.products where business_id=b and id in(select product_id from public.order_items where order_id=r.id) order by id for update;
 for l in select * from public.order_items where order_id=r.id order by product_id loop
  if not exists(select 1 from public.products where id=l.product_id and business_id=b and active) then raise exception 'VALIDATION_ERROR: product inactive'; end if;
  select array_agg(id) into ids from(select id from public.codes where business_id=b and product_id=l.product_id and status='available' and (expires_on is null or expires_on>=((now() at time zone 'Asia/Kuala_Lumpur')::date)) order by created_at,id limit l.quantity for update) picked;
  if coalesce(array_length(ids,1),0)<>l.quantity then raise exception 'INSUFFICIENT_STOCK: %',l.description; end if;
  update public.codes set status='allocated',order_item_id=l.id where id=any(ids) and business_id=b;
 end loop;
 update public.orders set status='allocated',allocation_key=p_request_key,allocated_at=now(),client_snapshot=(select to_jsonb(c) from public.clients c where c.id=r.client_id and c.business_id=b) where id=r.id returning * into r;
 perform public.audit(b,'order.allocated',r.id); return to_jsonb(r);
end $$;
