import { notFound } from 'next/navigation';
import { getWorkspace } from '@/lib/workspace';
import { OrderDetail } from '@/features/orders/screens';
export default async function OrderPage({params}:{params:Promise<{id:string}>}){const{id}=await params;const w=await getWorkspace('orders');const order=w.orders.find(o=>o.id===id);if(!order)notFound();return <OrderDetail workspace={w} order={order}/>;}
