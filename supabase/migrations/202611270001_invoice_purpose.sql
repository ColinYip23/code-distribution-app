alter table public.invoices add column if not exists purpose_description text not null default 'Being Purchase of VSAT ConnectMe Now Service Prepaid as below:';

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
 if length(coalesce(p_input->>'purpose_description',''))>250 then raise exception 'VALIDATION_ERROR: purpose description too long'; end if;
 update public.invoices set order_reference=coalesce(p_input->>'order_reference',''), purpose_description=coalesce(p_input->>'purpose_description','') where id=r.id returning * into r;
 perform public.audit(b,'invoice.saved',r.id); return to_jsonb(r)||jsonb_build_object('total',r.total::text);
end $$;

