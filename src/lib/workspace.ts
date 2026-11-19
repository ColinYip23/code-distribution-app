import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { requireMember } from './auth/require-member';
import { isConfigured } from './supabase/server';
import type { Workspace } from '@/shared/contracts';
import {loadAllPages} from './pagination';
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const empty: Workspace = { configured: false, business: null, userEmail: '', role: 'owner', products: [], clients: [], stock: [], batches: [], orders: [], orderItems: [], invoices: [], invoiceItems: [], invoiceOrders: [], payments: [], templates: [] };
  if (!isConfigured()) return empty;
  let member: Awaited<ReturnType<typeof requireMember>>;
  try { member = await requireMember(); } catch (error) { if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login'); throw error; }
  const { supabase, businessId } = member;
  const tables = ['businesses', 'products', 'clients', 'stock_summary', 'inventory_batches', 'orders', 'order_items', 'invoices', 'invoice_items', 'invoice_orders', 'payments', 'invoice_templates','invoice_revisions'] as const;
  const results = await Promise.all(tables.map(table => loadAllPages(async(offset,size)=>{
    let query=supabase.from(table).select('*').eq(table === 'businesses' ? 'id' : 'business_id', businessId).order(table==='stock_summary'?'product_id':table==='invoice_orders'?'order_id':'id');
    if(table==='invoice_orders')query=query.order('invoice_id');
    const result=await query.range(offset,offset+size-1);
    if(result.error)throw new Error('Could not load your workspace. Check the database migration and your connection.');
    return result.data??[];
  })));
  const [business, products, clients, stock, batches, orders, orderItems, invoices, invoiceItems, invoiceOrders, payments, templates,invoiceRevisions] = results;
  return { configured: true, business: business[0] ?? null, userEmail: member.userEmail, role: member.role, products, clients, stock, batches, orders, orderItems, invoices, invoiceItems, invoiceOrders, payments, templates,invoiceRevisions } as Workspace;
});
