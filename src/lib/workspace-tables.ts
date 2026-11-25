export type WorkspaceSection = 'overview' | 'products' | 'clients' | 'inventory' | 'orders' | 'invoices' | 'settings';
const tables = {
  overview: ['clients','stock_summary','orders','order_items','invoices','invoice_orders','payments'],
  products: ['products','stock_summary'],
  clients: ['clients','orders','invoices'],
  inventory: ['products','stock_summary','inventory_batches'],
  orders: ['products','clients','stock_summary','orders','order_items','invoice_orders'],
  invoices: ['clients','orders','order_items','invoices','invoice_items','invoice_orders','payments','invoice_templates','invoice_revisions'],
  settings: ['invoice_templates'],
} as const satisfies Record<WorkspaceSection, readonly string[]>;
export function workspaceTables(section: WorkspaceSection): readonly string[] { return tables[section]; }
