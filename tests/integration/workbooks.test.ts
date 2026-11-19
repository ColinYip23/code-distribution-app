import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { renderOrderWorkbook, formatOrderCodes } from '@/features/orders/export';
import { readCodeWorkbook } from '@/features/inventory/workbook';
import { renderInvoiceWorkbook,templateMappingSchema } from '@/features/invoices/render';

describe('client code workbooks', () => {
  const codes = [{ product: '5GB', code: '001234567890123456' }, { product: '20GB', code: '=ABCD' }];
  it('exports exact text without formula objects or internal data', async () => {
    const bytes = await renderOrderWorkbook('ORD-001', codes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    expect(workbook.worksheets[0].getCell('B2').value).toBe('001234567890123456');
    expect(workbook.worksheets[0].getCell('B3').value).toBe('=ABCD');
    expect(formatOrderCodes(codes, 'codes')).toBe('001234567890123456\n=ABCD');
  });
  it('rejects numeric and formula code cells instead of guessing their original text', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Codes');
    sheet.addRow(['code']); sheet.addRow(['00123']); sheet.addRow([123]); sheet.addRow([{ formula: '1+1', result: 2 }]);
    const result = await readCodeWorkbook(await workbook.xlsx.writeBuffer() as never, 1);
    expect(result.codes).toEqual(['00123']);
    expect(result.errors).toHaveLength(2);
  });
  it('keeps identically named products distinct by SKU in client messages',()=>{
    expect(formatOrderCodes([{product:'5GB',productId:'a',sku:'PROVIDER-A',code:'A1'},{product:'5GB',productId:'b',sku:'PROVIDER-B',code:'B1'}],'message')).toBe('5GB (PROVIDER-A) — 1 code\nA1\n\n5GB (PROVIDER-B) — 1 code\nB1');
  });
});

describe('mapped invoice template rendering', () => {
  it('rejects unsupported mapping fields instead of silently leaving invoice details blank',()=>{
    expect(()=>templateMappingSchema.parse({worksheet:'Invoice',fields:{inventedField:'A1'},firstItemRow:5,maxItems:2,columns:{description:1,quantity:2,unitPrice:3,amount:4}})).toThrow();
  });
  it('populates mapped cells and preserves merged ranges and text identifiers', async () => {
    const template = new ExcelJS.Workbook();
    const sheet = template.addWorksheet('Invoice');
    sheet.mergeCells('A1:D1'); sheet.getCell('A1').value = 'INVOICE';
    const bytes = await renderInvoiceWorkbook(await template.xlsx.writeBuffer() as never, {
      worksheet: 'Invoice', fields: { number: 'B3', clientTin: 'B4', total: 'D12' },
      firstItemRow: 7, maxItems: 3, columns: { description: 1, quantity: 2, unitPrice: 3, amount: 4 },
    }, { number: 'INV-001', clientTin: '001234', total: '0.30', lines: [{ description: '5GB', quantity: 3, unitPrice: '0.10', discount: '0', taxRate: '0' }] });
    const actual = new ExcelJS.Workbook(); await actual.xlsx.load(bytes as never);
    const out = actual.getWorksheet('Invoice')!;
    expect(out.getCell('B4').value).toBe('001234');
    expect(out.getCell('D7').value).toBe(0.3);
    expect(out.getCell('D12').value).toBe(0.3);
    expect(out.getCell('D1').isMerged).toBe(true);
  });
});
