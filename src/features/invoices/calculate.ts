import Decimal from 'decimal.js';
export type InvoiceLine = { description: string; quantity: number; unitPrice: string; discount: string; taxRate: string };
export function calculateInvoice(lines: InvoiceLine[], adjustment = '0') {
  if (!lines.length || lines.length > 100) throw new Error('Provide 1 to 100 invoice lines.');
  let subtotal = new Decimal(0), discount = new Decimal(0), tax = new Decimal(0);
  for (const line of lines) {
    const price = new Decimal(line.unitPrice), reduction = new Decimal(line.discount), rate = new Decimal(line.taxRate);
    if (!line.description.trim() || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 5000 || !price.isFinite() || price.isNegative() || price.decimalPlaces() > 2 || !reduction.isFinite() || reduction.isNegative() || reduction.decimalPlaces() > 2 || !rate.isFinite() || rate.isNegative() || rate.gt(100)) throw new Error('Invalid invoice line.');
    const amount = price.mul(line.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    if (reduction.gt(amount)) throw new Error('Discount exceeds line amount.');
    subtotal = subtotal.add(amount); discount = discount.add(reduction);
    tax = tax.add(amount.sub(reduction).mul(rate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }
  const adj = new Decimal(adjustment);
  if (!adj.isFinite() || adj.decimalPlaces() > 2) throw new Error('Invalid adjustment.');
  const total = subtotal.sub(discount).add(tax).add(adj);
  if (total.isNegative()) throw new Error('Invoice total cannot be negative.');
  return { subtotal: subtotal.toFixed(2), discount: discount.toFixed(2), tax: tax.toFixed(2), adjustment: adj.toFixed(2), total: total.toFixed(2) };
}
