alter table public.businesses add column if not exists next_vssb_invoice_number bigint not null default 4151 check (next_vssb_invoice_number >= 4151);

create or replace function public.invoice_sequence_capabilities(p_input jsonb) returns jsonb language sql stable security invoker set search_path='' as $$ select jsonb_build_object('vssb_sequence',true) $$;
revoke execute on function public.invoice_sequence_capabilities(jsonb) from public,anon,authenticated;
grant execute on function public.invoice_sequence_capabilities(jsonb) to authenticated;

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
 -- Lock the business counter for the entire issuance transaction.
 select next_vssb_invoice_number into seq from public.businesses where id=b for update;
 loop
  num:='VSSB-'||lpad(seq::text,greatest(5,length(seq::text)),'0');
  seq:=seq+1;
  exit when not exists(select 1 from public.invoices where business_id=b and number=num and issued_at is not null);
 end loop;
 update public.businesses set next_vssb_invoice_number=seq where id=b;
 update public.invoices set number=num,status='issued',issued_at=now(),issue_key=(p_input->>'request_key')::uuid,mismatch_reason=coalesce(p_input->>'mismatch_reason','') where id=r.id returning * into r;
 select to_jsonb(r)||jsonb_build_object('business',(select to_jsonb(x) from public.businesses x where x.id=b),'client',(select to_jsonb(x) from public.clients x where x.id=r.client_id),'lines',(select jsonb_agg(to_jsonb(x) order by position) from public.invoice_items x where invoice_id=r.id),'order_ids',(select coalesce(jsonb_agg(order_id),'[]') from public.invoice_orders where invoice_id=r.id),'template_id',t.id) into snap;
 insert into public.invoice_revisions(business_id,invoice_id,template_id,snapshot) values(b,r.id,t.id,snap) returning * into rev;
 perform public.audit(b,'invoice.issued',r.id); return to_jsonb(rev);
end $$;

