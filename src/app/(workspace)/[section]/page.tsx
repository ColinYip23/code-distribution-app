import { notFound } from 'next/navigation';
import { getWorkspace } from '@/lib/workspace';
import { requireMember } from '@/lib/auth/require-member';
import { ProductsScreen, ClientsScreen } from '@/features/catalog/screens';
import { InventoryScreen } from '@/features/inventory/screen';
import { OrdersScreen } from '@/features/orders/screens';
import { InvoicesScreen } from '@/features/invoices/screens';
import { SettingsScreen } from '@/features/settings/screen';
export default async function Section({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const{section}=await params;const query=await searchParams;
 if(!['products','clients','inventory','orders','invoices','settings'].includes(section)) notFound();
 const w=await getWorkspace(section as 'products'|'clients'|'inventory'|'orders'|'invoices'|'settings');
 if(section==='products')return <ProductsScreen workspace={w}/>;
 if(section==='clients')return <ClientsScreen workspace={w}/>;
 if(section==='orders')return <OrdersScreen workspace={w} openNew={query.new==='1'}/>;
 if(section==='invoices')return <InvoicesScreen workspace={w} openNew={query.new==='1'} fromOrder={query.order}/>;
 if(section==='settings')return <SettingsScreen workspace={w}/>;
 if(section==='inventory'){
  const offset=Math.max(0,Math.floor(Number(query.offset)||0)/100|0)*100;const productFilter=query.product??'',statusFilter=query.status??'';let rows=[];if(w.configured){const{supabase}=await requireMember();const result=await supabase.rpc('inventory_page',{p_input:{offset,product_id:productFilter,status:statusFilter}});if(result.error)throw new Error('Could not load inventory.');rows=result.data.rows;}
  return <InventoryScreen workspace={w} openImport={query.import==='1'} inventory={rows} offset={offset} productFilter={productFilter} statusFilter={statusFilter}/>;
 }
 notFound();
}
