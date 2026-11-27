create or replace function public.inventory_page(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b uuid:=public.require_business(); result jsonb; begin
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
  select c.id,c.product_id,p.name as product,c.batch_id,c.status,c.expires_on,c.created_at,
   '•••• '||right(c.code_value,4) as masked_code,
   o.id as order_id,o.order_no,coalesce(nullif(o.client_snapshot->>'name',''),cl.name) as client_name
  from public.codes c join public.products p on p.id=c.product_id and p.business_id=b
  left join public.order_items oi on oi.id=c.order_item_id and oi.business_id=b
  left join public.orders o on o.id=oi.order_id and o.business_id=b
  left join public.clients cl on cl.id=o.client_id and cl.business_id=b
  where c.business_id=b and (nullif(p_input->>'product_id','') is null or c.product_id=(p_input->>'product_id')::uuid)
   and (nullif(p_input->>'status','') is null or c.status=p_input->>'status')
   and (nullif(p_input->>'code','') is null or c.code_value=p_input->>'code')
  order by c.created_at desc,c.id limit 100 offset greatest(0,least(coalesce((p_input->>'offset')::int,0),1000000))
 )x;
 return jsonb_build_object('rows',result,'allocation_lookup_version',1);
end $$;
