-- Run through Supabase migrations. Every mutation is a constrained, membership-checked RPC.
create table public.businesses (
 id uuid primary key default gen_random_uuid(), name text not null, legal_name text not null default '',
 address text not null default '', tin text not null default '', registration_number text not null default '',
 email text not null default '', phone text not null default '', payment_instructions text not null default '',
 currency text not null default 'MYR' check(currency in ('MYR','USD','SGD','EUR','GBP','AUD','HKD')),
 next_invoice_number bigint not null default 1, invoice_sequence_year integer not null default extract(year from current_date),
 created_at timestamptz not null default now()
);
create table public.business_members (
 business_id uuid not null references public.businesses(id), user_id uuid not null unique references auth.users(id),
 role text not null check(role in ('owner','staff')), active boolean not null default true,
 primary key(business_id,user_id)
);
create table public.products (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 sku text not null, name text not null, description text not null default '', provider text not null default '',
 default_price numeric(14,2) not null default 0 check(default_price>=0 and default_price<>'NaN'::numeric),
 low_stock_threshold integer not null default 10 check(low_stock_threshold>=0), active boolean not null default true,
 created_at timestamptz not null default now(), unique(business_id,sku), unique(business_id,id)
);
create table public.clients (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 name text not null, legal_name text not null default '', contact_person text not null default '',
 email text not null default '', phone text not null default '', address text not null default '', country text not null default '',
 tin text not null default '', registration_number text not null default '', tax_identifier text not null default '',
 currency text not null default 'MYR' check(currency in ('MYR','USD','SGD','EUR','GBP','AUD','HKD')),
 payment_terms integer not null default 30 check(payment_terms between 0 and 365),
 notes text not null default '', archived boolean not null default false, created_at timestamptz not null default now(), unique(business_id,id)
);
create table public.inventory_batches (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 product_id uuid not null, supplier text not null default '', reference text not null default '',
 notes text not null default '', request_key uuid not null, inserted integer not null default 0, skipped integer not null default 0,
 created_at timestamptz not null default now(), unique(business_id,request_key), unique(business_id,id),
 foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 order_no bigint generated always as identity, client_id uuid not null,
 status text not null default 'draft' check(status in ('draft','allocated','sent','cancelled')),
 currency text not null check(currency in ('MYR','USD','SGD','EUR','GBP','AUD','HKD')),
 notes text not null default '', client_snapshot jsonb, allocated_at timestamptz, sent_at timestamptz,
 allocation_key uuid, created_at timestamptz not null default now(), unique(business_id,id), unique(business_id,allocation_key),
 foreign key(business_id,client_id) references public.clients(business_id,id)
);
create table public.import_previews (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),
 payload jsonb not null,result jsonb,expires_at timestamptz not null default now()+interval '1 hour'
);
create table public.order_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), order_id uuid not null,
 product_id uuid not null, description text not null, sku_snapshot text not null, quantity integer not null check(quantity between 1 and 5000),
 unit_price numeric(14,2) not null check(unit_price>=0), position integer not null,
 unique(business_id,id), unique(order_id,product_id),
 foreign key(business_id,order_id) references public.orders(business_id,id),
 foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.codes (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 product_id uuid not null, batch_id uuid not null, code_value text not null check(length(code_value) between 1 and 512),
 status text not null default 'available' check(status in ('available','allocated','void')),
 expires_on date, unit_cost numeric(14,2) check(unit_cost>=0 and unit_cost<>'NaN'::numeric), order_item_id uuid,
 created_at timestamptz not null default now(), unique(business_id,code_value),
 check((status='allocated') = (order_item_id is not null)),
 foreign key(business_id,product_id) references public.products(business_id,id),
 foreign key(business_id,batch_id) references public.inventory_batches(business_id,id),
 foreign key(business_id,order_item_id) references public.order_items(business_id,id)
);
create index codes_allocation on public.codes(business_id,product_id,status,created_at,id);
create index orders_client on public.orders(business_id,client_id,created_at desc);
create table public.invoice_templates (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 name text not null, storage_path text not null, mapping jsonb not null,
 verified boolean not null default false, active boolean not null default true, created_at timestamptz not null default now(), unique(business_id,id)
);
create table public.invoices (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), client_id uuid not null,
 number text, status text not null default 'draft' check(status in ('draft','issued','void')),
 currency text not null check(currency in ('MYR','USD','SGD','EUR','GBP','AUD','HKD')),
 issue_date date not null default current_date, due_date date not null default current_date+30,
 billing_name text not null default '', billing_address text not null default '', billing_tin text not null default '',
 notes text not null default '', adjustment numeric(14,2) not null default 0,
 subtotal numeric(14,2) not null default 0, discount numeric(14,2) not null default 0, tax numeric(14,2) not null default 0,
 total numeric(14,2) not null default 0 check(total>=0 and total<>'NaN'::numeric), mismatch boolean not null default false,
 mismatch_reason text not null default '', issue_key uuid, issued_at timestamptz, created_at timestamptz not null default now(),
 unique(business_id,id), unique(business_id,issue_key), check(due_date>=issue_date),
 foreign key(business_id,client_id) references public.clients(business_id,id)
);
create unique index invoice_number_unique on public.invoices(business_id,number) where issued_at is not null;
create table public.invoice_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), invoice_id uuid not null,
 product_id uuid, description text not null, quantity integer not null check(quantity between 1 and 5000),
 unit_price numeric(14,2) not null check(unit_price>=0), discount numeric(14,2) not null default 0 check(discount>=0),
 tax_rate numeric(7,4) not null default 0 check(tax_rate between 0 and 100), position integer not null,
 check(discount<=round(quantity*unit_price,2)),
 foreign key(business_id,invoice_id) references public.invoices(business_id,id),
 foreign key(business_id,product_id) references public.products(business_id,id)
);
create table public.invoice_orders (
 business_id uuid not null, invoice_id uuid not null, order_id uuid not null, active boolean not null default true,
 primary key(invoice_id,order_id), foreign key(business_id,invoice_id) references public.invoices(business_id,id),
 foreign key(business_id,order_id) references public.orders(business_id,id)
);
create unique index one_active_invoice_per_order on public.invoice_orders(order_id) where active;
create table public.invoice_revisions (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), invoice_id uuid not null unique,
 template_id uuid not null, snapshot jsonb not null,
 artifact_status text not null default 'pending' check(artifact_status in ('pending','ready','failed')),
 artifact_path text, created_at timestamptz not null default now(),
 foreign key(business_id,invoice_id) references public.invoices(business_id,id),
 foreign key(business_id,template_id) references public.invoice_templates(business_id,id)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), invoice_id uuid not null,
 amount numeric(14,2) not null check(amount>0 and amount<>'NaN'::numeric), paid_on date not null default current_date,
 reference text not null default '', request_key uuid not null, reversed_at timestamptz, reversal_reason text,
 created_at timestamptz not null default now(), unique(business_id,request_key),
 foreign key(business_id,invoice_id) references public.invoices(business_id,id)
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id), actor_id uuid not null,
 action text not null, entity_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);

create function public.current_business() returns uuid language sql stable security definer set search_path='' as $$
 select business_id from public.business_members where user_id=auth.uid() and active limit 1
$$;
create function public.require_business() returns uuid language plpgsql stable security definer set search_path='' as $$
declare b uuid:=public.current_business(); begin if b is null then raise exception 'FORBIDDEN'; end if; return b; end $$;
create function public.audit(p_business uuid,p_action text,p_entity uuid,p_metadata jsonb default '{}') returns void
language sql security definer set search_path='' as $$
 insert into public.audit_events(business_id,actor_id,action,entity_id,metadata) values(p_business,auth.uid(),p_action,p_entity,p_metadata)
$$;

do $$ declare t text; begin
 foreach t in array array['businesses','business_members','products','clients','inventory_batches','import_previews','orders','order_items','codes','invoice_templates','invoices','invoice_items','invoice_orders','invoice_revisions','payments','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
  if t='businesses' then execute 'create policy business_read on public.businesses for select to authenticated using(id=public.current_business())';
  elsif t='business_members' then execute 'create policy member_read on public.business_members for select to authenticated using(user_id=auth.uid())';
  else execute format('create policy member_read on public.%I for select to authenticated using(business_id=public.current_business())',t); end if;
  execute format('revoke all on public.%I from anon,authenticated',t);
  if t not in ('codes','import_previews') then execute format('grant select on public.%I to authenticated',t); end if;
 end loop;
end $$;

create view public.stock_summary with (security_barrier=true) as
select p.id as product_id,p.business_id,p.sku,p.name,p.active,p.default_price,p.low_stock_threshold,
 count(c.id) filter(where c.status='available' and (c.expires_on is null or c.expires_on>=current_date))::int as available,
 count(c.id) filter(where c.status='allocated')::int as allocated,
 count(c.id) filter(where c.status='void')::int as void,
 count(c.id) filter(where c.status='available' and c.expires_on<current_date)::int as expired
from public.products p left join public.codes c on c.product_id=p.id and c.business_id=p.business_id
where p.business_id=public.current_business() group by p.id;
grant select on public.stock_summary to authenticated;

create function public.save_product(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.products; begin
 if length(btrim(coalesce(p_input->>'sku',''))) not between 1 and 50 or length(btrim(coalesce(p_input->>'name',''))) not between 1 and 150 then raise exception 'VALIDATION_ERROR: product name and SKU required'; end if;
 if p_input->>'id' is not null then select * into r from public.products where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if; end if;
 insert into public.products(id,business_id,sku,name,description,provider,default_price,low_stock_threshold,active)
 values(coalesce(r.id,gen_random_uuid()),b,btrim(p_input->>'sku'),btrim(p_input->>'name'),coalesce(p_input->>'description',''),coalesce(p_input->>'provider',''),coalesce((p_input->>'default_price')::numeric,0),coalesce((p_input->>'low_stock_threshold')::int,10),coalesce((p_input->>'active')::boolean,true))
 on conflict(id) do update set sku=excluded.sku,name=excluded.name,description=excluded.description,provider=excluded.provider,default_price=excluded.default_price,low_stock_threshold=excluded.low_stock_threshold,active=excluded.active returning * into r;
 perform public.audit(b,'product.saved',r.id); return to_jsonb(r);
end $$;
create function public.save_client(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.clients; begin
 if length(btrim(coalesce(p_input->>'name',''))) not between 1 and 150 then raise exception 'VALIDATION_ERROR: client name required'; end if;
 if p_input->>'id' is not null then select * into r from public.clients where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if; end if;
 insert into public.clients(id,business_id,name,legal_name,contact_person,email,phone,address,country,tin,registration_number,tax_identifier,currency,payment_terms,notes,archived)
 values(coalesce(r.id,gen_random_uuid()),b,btrim(p_input->>'name'),coalesce(p_input->>'legal_name',''),coalesce(p_input->>'contact_person',''),coalesce(p_input->>'email',''),coalesce(p_input->>'phone',''),coalesce(p_input->>'address',''),coalesce(p_input->>'country',''),coalesce(p_input->>'tin',''),coalesce(p_input->>'registration_number',''),coalesce(p_input->>'tax_identifier',''),coalesce(p_input->>'currency','MYR'),coalesce((p_input->>'payment_terms')::int,30),coalesce(p_input->>'notes',''),coalesce((p_input->>'archived')::boolean,false))
 on conflict(id) do update set name=excluded.name,legal_name=excluded.legal_name,contact_person=excluded.contact_person,email=excluded.email,phone=excluded.phone,address=excluded.address,country=excluded.country,tin=excluded.tin,registration_number=excluded.registration_number,tax_identifier=excluded.tax_identifier,currency=excluded.currency,payment_terms=excluded.payment_terms,notes=excluded.notes,archived=excluded.archived returning * into r;
 perform public.audit(b,'client.saved',r.id); return to_jsonb(r);
end $$;
create function public.save_business(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.businesses; begin
 if not exists(select 1 from public.business_members where business_id=b and user_id=auth.uid() and role='owner') then raise exception 'FORBIDDEN'; end if;
 if length(btrim(coalesce(p_input->>'name',''))) not between 1 and 150 then raise exception 'VALIDATION_ERROR: business name required'; end if;
 update public.businesses set name=p_input->>'name',legal_name=coalesce(p_input->>'legal_name',''),address=coalesce(p_input->>'address',''),tin=coalesce(p_input->>'tin',''),registration_number=coalesce(p_input->>'registration_number',''),email=coalesce(p_input->>'email',''),phone=coalesce(p_input->>'phone',''),payment_instructions=coalesce(p_input->>'payment_instructions',''),currency=coalesce(p_input->>'currency','MYR') where id=b returning * into r;
 perform public.audit(b,'business.saved',b); return to_jsonb(r);
end $$;

create function public.import_codes(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); batch public.inventory_batches; v text; n int:=0; total int; begin
 if jsonb_typeof(p_input->'codes') is distinct from 'array' then raise exception 'VALIDATION_ERROR: code array required'; end if;
 if jsonb_array_length(p_input->'codes') not between 1 and 5000 or p_input->>'request_key' is null then raise exception 'VALIDATION_ERROR: 1 to 5000 codes and request key required'; end if;
 if not exists(select 1 from public.products where id=(p_input->>'product_id')::uuid and business_id=b and active) then raise exception 'VALIDATION_ERROR: active product required'; end if;
 -- Product lock also serializes import retries and competing stock operations.
 perform 1 from public.products where id=(p_input->>'product_id')::uuid and business_id=b for update;
 select * into batch from public.inventory_batches where business_id=b and request_key=(p_input->>'request_key')::uuid;
 if found then return jsonb_build_object('batch_id',batch.id,'inserted',batch.inserted,'skipped',batch.skipped,'replayed',true); end if;
 insert into public.inventory_batches(business_id,product_id,supplier,reference,notes,request_key) values(b,(p_input->>'product_id')::uuid,coalesce(p_input->>'supplier',''),coalesce(p_input->>'reference',''),coalesce(p_input->>'notes',''),(p_input->>'request_key')::uuid) returning * into batch;
 total:=jsonb_array_length(p_input->'codes');
 for v in select jsonb_array_elements_text(p_input->'codes') loop
  v:=btrim(v,E' \t\r\n'); if v is null or length(v) not between 1 and 512 or v~E'[\r\n]' then raise exception 'VALIDATION_ERROR: invalid code'; end if;
  insert into public.codes(business_id,product_id,batch_id,code_value,expires_on,unit_cost) values(b,batch.product_id,batch.id,v,nullif(p_input->>'expires_on','')::date,nullif(p_input->>'unit_cost','')::numeric) on conflict(business_id,code_value) do nothing;
  if found then n:=n+1; end if;
 end loop;
 update public.inventory_batches set inserted=n,skipped=total-n where id=batch.id;
 perform public.audit(b,'inventory.imported',batch.id,jsonb_build_object('inserted',n,'skipped',total-n));
 return jsonb_build_object('batch_id',batch.id,'inserted',n,'skipped',total-n);
end $$;

create function public.save_order(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.orders; l jsonb; p public.products; pos int:=0; begin
 if jsonb_typeof(p_input->'lines') is distinct from 'array' then raise exception 'VALIDATION_ERROR: order lines required'; end if;
 if jsonb_array_length(p_input->'lines') not between 1 and 100 then raise exception 'VALIDATION_ERROR: order lines required'; end if;
 if not exists(select 1 from public.clients where id=(p_input->>'client_id')::uuid and business_id=b and not archived) then raise exception 'VALIDATION_ERROR: active client required'; end if;
 if p_input->>'id' is not null then
  select * into r from public.orders where id=(p_input->>'id')::uuid and business_id=b for update;
  if not found then raise exception 'FORBIDDEN'; end if; if r.status<>'draft' then raise exception 'INVALID_STATE'; end if;
  delete from public.order_items where order_id=r.id;
  update public.orders set client_id=(p_input->>'client_id')::uuid,currency=p_input->>'currency',notes=coalesce(p_input->>'notes','') where id=r.id returning * into r;
 else insert into public.orders(business_id,client_id,currency,notes) values(b,(p_input->>'client_id')::uuid,p_input->>'currency',coalesce(p_input->>'notes','')) returning * into r; end if;
 for l in select jsonb_array_elements(p_input->'lines') loop
  select * into p from public.products where id=(l->>'product_id')::uuid and business_id=b and active; if not found then raise exception 'VALIDATION_ERROR: active product required'; end if;
  if (l->>'quantity')!~'^[0-9]+$' or (l->>'unit_price')!~'^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'VALIDATION_ERROR: invalid quantity or price'; end if;
  insert into public.order_items(business_id,order_id,product_id,description,sku_snapshot,quantity,unit_price,position) values(b,r.id,p.id,p.name,p.sku,(l->>'quantity')::int,(l->>'unit_price')::numeric,pos); pos:=pos+1;
 end loop;
 perform public.audit(b,'order.saved',r.id); return to_jsonb(r);
end $$;
create function public.allocate_order(p_order_id uuid,p_request_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select array_agg(id) into ids from(select id from public.codes where business_id=b and product_id=l.product_id and status='available' and (expires_on is null or expires_on>=current_date) order by created_at,id limit l.quantity for update) picked;
  if coalesce(array_length(ids,1),0)<>l.quantity then raise exception 'INSUFFICIENT_STOCK: %',l.description; end if;
  update public.codes set status='allocated',order_item_id=l.id where id=any(ids) and business_id=b;
 end loop;
 update public.orders set status='allocated',allocation_key=p_request_key,allocated_at=now(),client_snapshot=(select to_jsonb(c) from public.clients c where c.id=r.client_id and c.business_id=b) where id=r.id returning * into r;
 perform public.audit(b,'order.allocated',r.id); return to_jsonb(r);
end $$;
create function public.order_codes(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.orders; codes jsonb; begin
 select * into r from public.orders where id=(p_input->>'id')::uuid and business_id=b; if not found then raise exception 'FORBIDDEN'; end if;
 if r.allocated_at is null then raise exception 'INVALID_STATE: order has no code allocation'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('product',i.description,'productId',i.product_id,'sku',i.sku_snapshot,'code',c.code_value) order by i.position,c.created_at,c.id),'[]') into codes from public.codes c join public.order_items i on i.id=c.order_item_id where i.order_id=r.id and c.business_id=b;
 perform public.audit(b,'order.codes_requested',r.id); return jsonb_build_object('order',to_jsonb(r),'codes',codes);
end $$;
create function public.transition_order(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.orders; s text:=p_input->>'status'; begin
 select * into r from public.orders where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if;
 if s='sent' and r.status='allocated' then update public.orders set status=s,sent_at=now() where id=r.id returning * into r;
 elsif s='cancelled' and r.status in ('draft','allocated','sent') then
  if exists(select 1 from public.invoice_orders where order_id=r.id and active) then raise exception 'INVALID_STATE: void linked invoice first'; end if;
  if length(btrim(coalesce(p_input->>'reason','')))<1 then raise exception 'VALIDATION_ERROR: cancellation reason required'; end if;
  update public.orders set status=s where id=r.id returning * into r;
 else raise exception 'INVALID_STATE'; end if;
 perform public.audit(b,'order.'||s,r.id,jsonb_build_object('reason',coalesce(p_input->>'reason',''))); return to_jsonb(r);
end $$;

create function public.save_invoice(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 perform public.audit(b,'invoice.saved',r.id); return to_jsonb(r)||jsonb_build_object('total',r.total::text);
end $$;

create function public.issue_invoice(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.invoices; t public.invoice_templates; rev public.invoice_revisions; snap jsonb; num text; seq bigint; yr int:=extract(year from current_date); begin
 select * into r from public.invoices where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if;
 if r.status='issued' then select * into rev from public.invoice_revisions where invoice_id=r.id; return to_jsonb(rev); end if;
 if r.status<>'draft' then raise exception 'INVALID_STATE'; end if;
 if r.mismatch and length(btrim(coalesce(p_input->>'mismatch_reason','')))<3 then raise exception 'MISMATCH: acknowledge differences from ordered quantities and amounts'; end if;
 select * into t from public.invoice_templates where business_id=b and active and verified order by created_at desc,id desc limit 1;
 if not found then raise exception 'TEMPLATE_REQUIRED: upload and verify the invoice workbook'; end if;
 if (select count(*) from public.invoice_items where invoice_id=r.id)>coalesce((t.mapping->>'maxItems')::int,0) then raise exception 'TEMPLATE_CAPACITY: invoice has more lines than the template supports'; end if;
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
create function public.void_invoice(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.invoices; begin
 select * into r from public.invoices where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if;
 if r.status='void' then raise exception 'INVALID_STATE'; end if;
 if length(btrim(coalesce(p_input->>'reason','')))<3 then raise exception 'VALIDATION_ERROR: reason required'; end if;
 if exists(select 1 from public.payments where invoice_id=r.id and reversed_at is null) then raise exception 'INVALID_STATE: reverse mistaken payments or use a future credit/refund workflow'; end if;
 update public.invoices set status='void' where id=r.id returning * into r; update public.invoice_orders set active=false where invoice_id=r.id;
 perform public.audit(b,'invoice.void',r.id,jsonb_build_object('reason',p_input->>'reason')); return to_jsonb(r);
end $$;
create function public.record_payment(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.invoices; p public.payments; paid numeric; begin
 select * into r from public.invoices where id=(p_input->>'invoice_id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if;
 select * into p from public.payments where business_id=b and request_key=(p_input->>'request_key')::uuid; if found then return to_jsonb(p); end if;
 if r.status<>'issued' then raise exception 'INVALID_STATE'; end if;
 select coalesce(sum(amount),0) into paid from public.payments where invoice_id=r.id and reversed_at is null;
 if coalesce(p_input->>'amount','')!~'^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'VALIDATION_ERROR: payment amount'; end if;
 if (p_input->>'amount')::numeric>r.total-paid then raise exception 'VALIDATION_ERROR: amount exceeds outstanding balance'; end if;
 insert into public.payments(business_id,invoice_id,amount,paid_on,reference,request_key) values(b,r.id,(p_input->>'amount')::numeric,coalesce(nullif(p_input->>'paid_on','')::date,current_date),coalesce(p_input->>'reference',''),(p_input->>'request_key')::uuid) returning * into p;
 perform public.audit(b,'payment.recorded',p.id); return to_jsonb(p);
end $$;
create function public.reverse_payment(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); p public.payments; begin
 if length(btrim(coalesce(p_input->>'reason','')))<3 then raise exception 'VALIDATION_ERROR: reversal reason required'; end if;
 select * into p from public.payments where id=(p_input->>'id')::uuid and business_id=b; if not found then raise exception 'FORBIDDEN'; end if;
 perform 1 from public.invoices where id=p.invoice_id for update;
 update public.payments set reversed_at=now(),reversal_reason=p_input->>'reason' where id=p.id and reversed_at is null returning * into p; if not found then raise exception 'INVALID_STATE'; end if;
 perform public.audit(b,'payment.reversed',p.id,jsonb_build_object('reason',p_input->>'reason')); return to_jsonb(p);
end $$;

create function public.void_code(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); v uuid; begin
 if length(btrim(coalesce(p_input->>'reason','')))<3 then raise exception 'VALIDATION_ERROR: reason required'; end if;
 -- Same lock order as allocation: product, then code.
 perform 1 from public.products where business_id=b and id=(select product_id from public.codes where id=(p_input->>'id')::uuid and business_id=b) for update;
 update public.codes set status='void' where id=(p_input->>'id')::uuid and business_id=b and status='available' returning id into v;
 if not found then raise exception 'INVALID_STATE'; end if;
 perform public.audit(b,'code.void',v,jsonb_build_object('reason',p_input->>'reason')); return jsonb_build_object('id',v);
end $$;
create function public.inventory_page(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); result jsonb; begin
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from(select c.id,c.product_id,p.name as product,c.batch_id,c.status,c.expires_on,c.created_at,'•••• '||right(c.code_value,4) as masked_code from public.codes c join public.products p on p.id=c.product_id where c.business_id=b and (nullif(p_input->>'product_id','') is null or c.product_id=(p_input->>'product_id')::uuid) and (nullif(p_input->>'status','') is null or c.status=p_input->>'status') order by c.created_at desc,c.id limit 100 offset greatest(0,least(coalesce((p_input->>'offset')::int,0),1000000)))x;
 return jsonb_build_object('rows',result);
end $$;
create function public.save_template(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); t public.invoice_templates; begin
 if not exists(select 1 from public.business_members where business_id=b and user_id=auth.uid() and role='owner') then raise exception 'FORBIDDEN'; end if;
 if left(p_input->>'storage_path',length(b::text)+1)<>b::text||'/' or jsonb_typeof(p_input->'mapping')<>'object' then raise exception 'VALIDATION_ERROR: invalid template'; end if;
 insert into public.invoice_templates(business_id,name,storage_path,mapping,verified) values(b,p_input->>'name',p_input->>'storage_path',p_input->'mapping',coalesce((p_input->>'verified')::boolean,false)) returning * into t;
 perform public.audit(b,'template.saved',t.id); return to_jsonb(t);
end $$;
create function public.complete_artifact(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.invoice_revisions; expected text; begin
 select * into r from public.invoice_revisions where id=(p_input->>'id')::uuid and business_id=b for update; if not found then raise exception 'FORBIDDEN'; end if;
 expected:=b::text||'/invoices/'||r.id::text||'.xlsx';
 if p_input->>'path' is distinct from expected then raise exception 'VALIDATION_ERROR: invalid artifact path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='documents' and name=expected) then raise exception 'INVALID_STATE: artifact upload not complete'; end if;
 if r.artifact_status='ready' then return to_jsonb(r); end if;
 update public.invoice_revisions set artifact_status='ready',artifact_path=expected where id=r.id returning * into r; return to_jsonb(r);
end $$;

create function public.preview_import(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); result jsonb; begin
 if jsonb_typeof(p_input->'codes') is distinct from 'array' then raise exception 'VALIDATION_ERROR'; end if;
 if jsonb_array_length(p_input->'codes')>5000 then raise exception 'VALIDATION_ERROR'; end if;
 select coalesce(jsonb_agg(code_value order by code_value),'[]') into result from public.codes where business_id=b and code_value in(select jsonb_array_elements_text(p_input->'codes'));
 return jsonb_build_object('existing',result);
end $$;
create function public.create_import_preview(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); preview public.import_previews; begin
 if jsonb_typeof(p_input->'codes') is distinct from 'array' then raise exception 'VALIDATION_ERROR'; end if;
 if jsonb_array_length(p_input->'codes') not between 1 and 5000 then raise exception 'VALIDATION_ERROR'; end if;
 if not exists(select 1 from public.products where id=(p_input->>'product_id')::uuid and business_id=b and active) then raise exception 'VALIDATION_ERROR'; end if;
 delete from public.import_previews where business_id=b and expires_at<now()-interval '1 day';
 insert into public.import_previews(business_id,payload) values(b,p_input-'request_key') returning * into preview;
 return jsonb_build_object('preview_id',preview.id,'expires_at',preview.expires_at);
end $$;
create function public.confirm_import(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); preview public.import_previews; output jsonb; begin
 select * into preview from public.import_previews where id=(p_input->>'preview_id')::uuid and business_id=b for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 if preview.result is not null then return preview.result; end if;
 if preview.expires_at<now() then raise exception 'INVALID_STATE: import preview expired'; end if;
 output:=public.import_codes(preview.payload||jsonb_build_object('request_key',preview.id));
 update public.import_previews set result=output,payload='{}' where id=preview.id;
 return output;
end $$;
create function public.verify_template(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); t public.invoice_templates; begin
 if not exists(select 1 from public.business_members where business_id=b and user_id=auth.uid() and role='owner') then raise exception 'FORBIDDEN'; end if;
 update public.invoice_templates set verified=true where id=(p_input->>'id')::uuid and business_id=b returning * into t;
 if not found then raise exception 'FORBIDDEN'; end if;
 perform public.audit(b,'template.verified',t.id); return to_jsonb(t);
end $$;
-- Revoke only this app's functions; do not alter unrelated extension/function privileges.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array['current_business','require_business','audit','save_product','save_client','save_business','import_codes','save_order','allocate_order','order_codes','transition_order','save_invoice','issue_invoice','void_invoice','record_payment','reverse_payment','void_code','inventory_page','save_template','complete_artifact','preview_import','verify_template','create_import_preview','confirm_import']) loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.current_business() to authenticated;
grant execute on function public.require_business() to authenticated;
grant execute on function public.save_product(jsonb),public.save_client(jsonb),public.save_business(jsonb),public.import_codes(jsonb),public.save_order(jsonb),public.allocate_order(uuid,uuid),public.order_codes(jsonb),public.transition_order(jsonb),public.save_invoice(jsonb),public.issue_invoice(jsonb),public.void_invoice(jsonb),public.record_payment(jsonb),public.reverse_payment(jsonb),public.void_code(jsonb),public.inventory_page(jsonb),public.save_template(jsonb),public.complete_artifact(jsonb),public.preview_import(jsonb),public.verify_template(jsonb),public.create_import_preview(jsonb),public.confirm_import(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('documents','documents',false,8388608,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do nothing;
create policy documents_read on storage.objects for select to authenticated using(bucket_id='documents' and split_part(name,'/',1)=public.current_business()::text);
create policy documents_insert on storage.objects for insert to authenticated with check(bucket_id='documents' and split_part(name,'/',1)=public.current_business()::text and split_part(name,'/',2)='templates' and exists(select 1 from public.business_members where user_id=auth.uid() and active and role='owner'));
-- No UPDATE/DELETE policy: templates and issued workbooks are append-only.
