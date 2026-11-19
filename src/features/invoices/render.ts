import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { z } from 'zod';
import type { InvoiceLine } from './calculate';
const cell = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}$/);
export const templateFields=['number','issueDate','dueDate','clientName','clientAddress','clientTin','clientRegistrationNumber','clientEmail','clientPhone','clientTaxIdentifier','clientCountry','clientContactPerson','businessName','businessAddress','businessTin','businessRegistrationNumber','businessEmail','businessPhone','currency','subtotal','discount','tax','adjustment','total','notes','paymentInstructions'] as const;
export const templateMappingSchema = z.object({
  worksheet: z.string().min(1).max(31), fields: z.partialRecord(z.enum(templateFields), cell),
  firstItemRow: z.number().int().min(1).max(10000), maxItems: z.number().int().min(1).max(100),
  columns: z.object({ description: z.number().int().min(1).max(100), quantity: z.number().int().min(1).max(100), unitPrice: z.number().int().min(1).max(100), amount: z.number().int().min(1).max(100) }),
});
export type TemplateMapping = z.infer<typeof templateMappingSchema>;
export type RenderInvoice = { number: string; clientTin: string; total: string; lines: InvoiceLine[]; [key: string]: string | InvoiceLine[] };
export async function renderInvoiceWorkbook(bytes: Uint8Array, mapping: TemplateMapping, invoice: RenderInvoice): Promise<Uint8Array> {
  mapping = templateMappingSchema.parse(mapping);
  if (invoice.lines.length > mapping.maxItems) throw new Error(`This template supports at most ${mapping.maxItems} line items.`);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as never);
  const sheet = workbook.getWorksheet(mapping.worksheet);
  if (!sheet) throw new Error('Mapped worksheet does not exist.');
  for (const [field, address] of Object.entries(mapping.fields)) {
    const value = invoice[field]; if (typeof value !== 'string'||!address) continue;
    const numeric = ['total', 'subtotal', 'discount', 'tax', 'adjustment'].includes(field);
    sheet.getCell(address).value = numeric ? new Decimal(value).toNumber() : value;
    sheet.getCell(address).numFmt = numeric ? '#,##0.00' : '@';
  }
  for (let index = 0; index < mapping.maxItems; index++) {
    const row = mapping.firstItemRow + index, item = invoice.lines[index], cols = mapping.columns;
    for (const column of Object.values(cols)) sheet.getCell(row, column).value = null;
    if (!item) continue;
    sheet.getCell(row, cols.description).value = item.description;
    sheet.getCell(row, cols.quantity).value = item.quantity;
    sheet.getCell(row, cols.unitPrice).value = new Decimal(item.unitPrice).toNumber();
    const amount = new Decimal(item.unitPrice).mul(item.quantity).sub(item.discount);
    sheet.getCell(row, cols.amount).value = amount.add(amount.mul(item.taxRate).div(100).toDecimalPlaces(2)).toNumber();
    sheet.getCell(row, cols.unitPrice).numFmt = '#,##0.00'; sheet.getCell(row, cols.amount).numFmt = '#,##0.00';
  }
  workbook.calcProperties.fullCalcOnLoad = true;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
