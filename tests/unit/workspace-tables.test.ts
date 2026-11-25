import { describe, expect, it } from 'vitest';
import { workspaceTables } from '@/lib/workspace-tables';
describe('workspace data by page', () => {
  it('loads only catalog and stock for products', () => {
    expect(workspaceTables('products')).toEqual(['products', 'stock_summary']);
  });
  it('loads data needed for inventory and invoice creation', () => {
    expect(workspaceTables('inventory')).toEqual(['products', 'stock_summary', 'inventory_batches']);
    expect(workspaceTables('invoices')).toEqual(expect.arrayContaining(['clients','orders','order_items','invoice_items','invoice_orders','invoices','payments','invoice_templates','invoice_revisions']));
  });
});
