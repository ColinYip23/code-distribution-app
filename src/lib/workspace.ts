import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { requireMember } from './auth/require-member';
import { isConfigured } from './supabase/server';
import type { Workspace } from '@/shared/contracts';
import { loadAllPages } from './pagination';
import { workspaceTables, type WorkspaceSection } from './workspace-tables';

const memberForRender = cache(async () => {
  try { return await requireMember(); }
  catch (error) { if (error instanceof Error && error.message === 'UNAUTHENTICATED') redirect('/login'); throw error; }
});
export const getWorkspaceHeader = cache(async () => {
  if (!isConfigured()) return { configured: false, business: null, userEmail: '', role: 'owner' as const };
  const member = await memberForRender();
  const result = await member.supabase.from('businesses').select('*').eq('id', member.businessId).single();
  if (result.error) throw new Error('Could not load your workspace. Check the database migration and your connection.');
  return { configured: true, business: result.data, userEmail: member.userEmail, role: member.role };
});
export const getWorkspace = cache(async (section: WorkspaceSection = 'overview'): Promise<Workspace> => {
  const empty: Workspace = { configured: false, business: null, userEmail: '', role: 'owner', products: [], clients: [], stock: [], batches: [], orders: [], orderItems: [], invoices: [], invoiceItems: [], invoiceOrders: [], payments: [], templates: [], invoiceRevisions: [] };
  const header = await getWorkspaceHeader();
  if (!header.configured) return empty;
  const { supabase, businessId } = await memberForRender();
  const names = workspaceTables(section);
  const results = await Promise.all(names.map(table => loadAllPages(async (offset, size) => {
    let query = supabase.from(table).select('*').eq('business_id', businessId).order(table === 'stock_summary' ? 'product_id' : table === 'invoice_orders' ? 'order_id' : 'id');
    if (table === 'invoice_orders') query = query.order('invoice_id');
    const result = await query.range(offset, offset + size - 1);
    if (result.error) throw new Error('Could not load your workspace. Check the database migration and your connection.');
    return result.data ?? [];
  })));
  const values = Object.fromEntries(names.map((table, index) => [table, results[index]]));
  return { ...empty, ...header, products: values.products ?? [], clients: values.clients ?? [], stock: values.stock_summary ?? [], batches: values.inventory_batches ?? [], orders: values.orders ?? [], orderItems: values.order_items ?? [], invoices: values.invoices ?? [], invoiceItems: values.invoice_items ?? [], invoiceOrders: values.invoice_orders ?? [], payments: values.payments ?? [], templates: values.invoice_templates ?? [], invoiceRevisions: values.invoice_revisions ?? [] } as Workspace;
});
