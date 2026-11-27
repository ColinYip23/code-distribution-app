import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';
import { z } from 'zod';
import type { InvoiceLine } from './calculate';
import { renderPreservedPackage } from './package-renderer';
const cell = z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}$/);
export const templateFields=['purposeDescription','number','issueDate','dueDate','paymentTerms','orderReference','clientName','clientAddress','clientTin','clientRegistrationNumber','clientEmail','clientPhone','clientTaxIdentifier','clientCountry','clientContactPerson','businessName','businessAddress','businessTin','businessRegistrationNumber','businessEmail','businessPhone','currency','subtotal','discount','tax','adjustment','total','notes','paymentInstructions'] as const;
export const templateMappingSchema = z.object({
  worksheet: z.string().min(1).max(31), fields: z.partialRecord(z.enum(templateFields), cell),
  currency:z.string().regex(/^[A-Z]{3}$/).optional(),
  firstItemRow: z.number().int().min(1).max(10000), maxItems: z.number().int().min(1).max(100),
  rowStep: z.number().int().min(1).max(10).default(1),
  preservePackage:z.boolean().default(false),
  dateFormat:z.string().max(40).optional(),
  shrinkFields:z.array(z.enum(templateFields)).max(30).default([]),
  printScale:z.number().int().min(10).max(400).optional(),
  centerHorizontally:z.boolean().optional(),
  clearRanges:z.array(z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}(:[A-Z]{1,3}[1-9][0-9]{0,5})?$/)).max(50).default([]),
  mergeRanges:z.array(z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,5}:[A-Z]{1,3}[1-9][0-9]{0,5}$/)).max(50).default([]),
  wrapFields:z.array(z.enum(templateFields)).max(30).default([]),
  fieldFormats:z.partialRecord(z.enum(templateFields),z.string().max(100).refine(value=>value.includes('{value}'))).default({}),
  unitLabel:z.string().max(20).default('Pcs'),
  columns: z.object({ description: z.number().int().min(1).max(100), quantity: z.number().int().min(1).max(100), unitPrice: z.number().int().min(1).max(100), amount: z.number().int().min(1).max(100), itemNumber:z.number().int().min(1).max(100).optional(),unit:z.number().int().min(1).max(100).optional() }),
});
export type TemplateMapping = z.input<typeof templateMappingSchema>;
export type RenderInvoice = { number: string; clientTin: string; total: string; lines: InvoiceLine[]; [key: string]: string | InvoiceLine[] };
export async function renderInvoiceWorkbook(bytes: Uint8Array, input: TemplateMapping, invoice: RenderInvoice): Promise<Uint8Array> {
  const mapping = templateMappingSchema.parse(input);
  if(mapping.currency&&invoice.currency!==mapping.currency)throw new Error(`This invoice template requires ${mapping.currency}.`);
  if (invoice.lines.length > mapping.maxItems) throw new Error(`This template supports at most ${mapping.maxItems} line items.`);
  if(mapping.preservePackage)return renderPreservedPackage(bytes,mapping,invoice);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as never);
  const sheet = workbook.getWorksheet(mapping.worksheet);
  if (!sheet) throw new Error('Mapped worksheet does not exist.');
  for(const address of mapping.clearRanges){
    const range=sheet.getCell(address.split(':')[0]);
    const end=sheet.getCell(address.split(':')[1]??address);
    if(Number(end.row)-Number(range.row)>1000||Number(end.col)-Number(range.col)>100)throw new Error('Template clear range is too large.');
    for(let row=Number(range.row);row<=Number(end.row);row++)for(let col=Number(range.col);col<=Number(end.col);col++)sheet.getCell(row,col).value=null;
  }
  for(const range of mapping.mergeRanges){if(!sheet.model.merges?.includes(range))sheet.mergeCells(range);}
  for (const [field, address] of Object.entries(mapping.fields)) {
    const value = invoice[field]; if (typeof value !== 'string'||!address) continue;
    const numeric = ['total', 'subtotal', 'discount', 'tax', 'adjustment'].includes(field);
    const target=sheet.getCell(address), isDate=field==='issueDate'||field==='dueDate';
    target.value = numeric ? new Decimal(value).toNumber() : isDate ? (value?new Date(`${value}T00:00:00Z`):null) : value ? (mapping.fieldFormats[field as keyof typeof mapping.fieldFormats]?.replaceAll('{value}',value)??value) : '';
    if(isDate){if(mapping.dateFormat||!target.numFmt||target.numFmt==='General')target.numFmt=mapping.dateFormat??'d/m/yyyy';}
    else if(numeric){if(!target.numFmt||target.numFmt==='General')target.numFmt='#,##0.00';}
    else target.numFmt='@';
    if(mapping.wrapFields.includes(field as typeof templateFields[number]))target.alignment={...target.alignment,wrapText:true,vertical:'top'};
    if(mapping.shrinkFields.includes(field as typeof templateFields[number]))target.alignment={...target.alignment,shrinkToFit:true,wrapText:false};
  }
  for (let index = 0; index < mapping.maxItems; index++) {
    const row = mapping.firstItemRow + index*mapping.rowStep, item = invoice.lines[index], cols = mapping.columns;
    for (const column of Object.values(cols)) if(typeof column==='number')sheet.getCell(row, column).value = null;
    if (!item) continue;
    sheet.getCell(row, cols.description).value = item.description;
    sheet.getCell(row, cols.quantity).value = item.quantity;
    if(cols.itemNumber)sheet.getCell(row,cols.itemNumber).value=index+1;
    if(cols.unit)sheet.getCell(row,cols.unit).value=mapping.unitLabel;
    sheet.getCell(row, cols.unitPrice).value = new Decimal(item.unitPrice).toNumber();
    const amount = new Decimal(item.unitPrice).mul(item.quantity).sub(item.discount);
    sheet.getCell(row, cols.amount).value = amount.add(amount.mul(item.taxRate).div(100).toDecimalPlaces(2)).toNumber();
    sheet.getCell(row, cols.unitPrice).numFmt = '#,##0.00'; sheet.getCell(row, cols.amount).numFmt = '#,##0.00';
  }
  workbook.calcProperties.fullCalcOnLoad = true;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
