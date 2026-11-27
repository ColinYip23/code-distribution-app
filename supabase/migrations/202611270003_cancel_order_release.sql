create or replace function public.cancel_order_and_release(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); r public.orders; inv public.invoices; released jsonb; reason text:=btrim(coalesce(p_input->>'reason','')); begin
 if length(reason)<3 or length(reason)>1000 then raise exception 'VALIDATION_ERROR: cancellation reason required'; end if;
 select * into r from public.orders where id=(p_input->>'id')::uuid and business_id=b for update;
 if not found then raise exception 'FORBIDDEN'; end if;
 if r.status='cancelled' then return to_jsonb(r); end if;
 if r.status not in ('draft','allocated','sent') then raise exception 'INVALID_STATE'; end if;
 if r.status in ('allocated','sent') and coalesce((p_input->>'release_confirmed')::boolean,false) is not true then raise exception 'VALIDATION_ERROR: confirm codes can be reused'; end if;
 -- Match the allocator's product lock order to serialize stock operations.
 perform 1 from public.products where business_id=b and id in(select product_id from public.order_items where order_id=r.id) order by id for update;
 for inv in select i.* from public.invoices i join public.invoice_orders io on io.invoice_id=i.id where io.order_id=r.id and io.active and i.business_id=b order by i.id for update of i loop
  if exists(select 1 from public.invoice_orders where invoice_id=inv.id and active and order_id<>r.id) then raise exception 'SHARED_INVOICE: invoice includes other orders'; end if;
  if exists(select 1 from public.payments where invoice_id=inv.id and reversed_at is null) then raise exception 'INVOICE_HAS_PAYMENTS: resolve payments first'; end if;
  perform public.void_invoice(jsonb_build_object('id',inv.id,'reason',reason));
 end loop;
 select coalesce(jsonb_agg(c.id order by c.id),'[]'::jsonb) into released from public.codes c where c.business_id=b and c.order_item_id in(select id from public.order_items where order_id=r.id);
 update public.codes set status='available',order_item_id=null where business_id=b and order_item_id in(select id from public.order_items where order_id=r.id);
 update public.orders set status='cancelled' where id=r.id returning * into r;
 perform public.audit(b,'order.cancelled_codes_released',r.id,jsonb_build_object('reason',reason,'code_ids',released));
 return to_jsonb(r);
end $$;
revoke execute on function public.cancel_order_and_release(jsonb) from public,anon,authenticated;
grant execute on function public.cancel_order_and_release(jsonb) to authenticated;
