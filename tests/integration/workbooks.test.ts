import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
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
  it('rejects another currency under a fixed RM invoice template',async()=>{
    const book=new ExcelJS.Workbook();book.addWorksheet('inv');
    await expect(renderInvoiceWorkbook(await book.xlsx.writeBuffer() as never,{worksheet:'inv',currency:'MYR',preservePackage:true,fields:{total:'H45'},firstItemRow:23,maxItems:9,columns:{description:3,quantity:5,unitPrice:7,amount:8}},{number:'USD-01',clientTin:'',currency:'USD',total:'1',lines:[{description:'Code',quantity:1,unitPrice:'1',discount:'0',taxRate:'0'}]})).rejects.toThrow('MYR');
  });
  it('resolves namespace-prefixed worksheet relationship entries',async()=>{
    const book=new ExcelJS.Workbook();book.addWorksheet('inv');const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer());
    const path='xl/_rels/workbook.xml.rels';const rels=await zip.file(path)!.async('string');zip.file(path,rels.replace('<Relationships xmlns=','<p:Relationships xmlns:p=').replaceAll('<Relationship ','<p:Relationship ').replace('</Relationships>','</p:Relationships>'));
    const bytes=await renderInvoiceWorkbook(await zip.generateAsync({type:'uint8array'}),{worksheet:'inv',preservePackage:true,fields:{number:'H11'},firstItemRow:23,maxItems:9,columns:{description:3,quantity:5,unitPrice:7,amount:8}},{number:'PREFIX-01',clientTin:'',total:'1',lines:[{description:'Code',quantity:1,unitPrice:'1',discount:'0',taxRate:'0'}]});
    const actual=await JSZip.loadAsync(bytes);expect(await actual.file('xl/worksheets/sheet1.xml')!.async('string')).toContain('PREFIX-01');
  });
  it('formats Malaysian dates and long custom invoice references in the native template',async()=>{
    const book=new ExcelJS.Workbook();book.addWorksheet('inv');
    const bytes=await renderInvoiceWorkbook(await book.xlsx.writeBuffer() as never,{worksheet:'inv',preservePackage:true,dateFormat:'d/m/yyyy',shrinkFields:['number'],printScale:88,centerHorizontally:true,fields:{number:'H11',issueDate:'H12',total:'H45'},firstItemRow:23,maxItems:9,columns:{description:3,quantity:5,unitPrice:7,amount:8}},{number:'A-CUSTOM-INVOICE-NUMBER',issueDate:'2026-11-24',clientTin:'',total:'1',lines:[{description:'Code',quantity:1,unitPrice:'1',discount:'0',taxRate:'0'}]});
    const out=new ExcelJS.Workbook();await out.xlsx.load(bytes as never);const s=out.getWorksheet('inv')!;
    expect(s.getCell('H12').numFmt).toBe('d/m/yyyy');expect(s.getCell('H11').alignment.shrinkToFit).toBe(true);expect(s.pageSetup.scale).toBe(88);expect(s.pageSetup.horizontalCentered).toBe(true);
  });
  it('preserves native drawing XML and print configuration for the supplied invoice layout',async()=>{
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('inv');sheet.pageSetup.printArea='A1:H62';sheet.getCell('C8').value='PREVIOUS CLIENT';
    const input=await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
    const drawing='<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:sp><xdr:txBody>Brand header drawing</xdr:txBody></xdr:sp></xdr:wsDr>';
    input.file('xl/drawings/retained-shape.xml',drawing);
    const beforeStyles=await input.file('xl/styles.xml')!.async('string');
    const bytes=await renderInvoiceWorkbook(await input.generateAsync({type:'uint8array'}),{worksheet:'inv',fields:{clientName:'C8',number:'H11',total:'H45'},firstItemRow:23,maxItems:9,preservePackage:true,clearRanges:['C8'],columns:{description:3,quantity:5,unitPrice:7,amount:8}},{number:'NEW-001',clientName:'NEW CLIENT',clientTin:'00123',total:'10',lines:[{description:'Onshore 3GB',quantity:1,unitPrice:'10',discount:'0',taxRate:'0'}]});
    const output=await JSZip.loadAsync(bytes);
    expect(await output.file('xl/drawings/retained-shape.xml')?.async('string')).toBe(drawing);
    expect(await output.file('xl/styles.xml')?.async('string')).toBe(beforeStyles);
    const actual=new ExcelJS.Workbook();await actual.xlsx.load(bytes as never);expect(actual.getWorksheet('inv')!.pageSetup.printArea).toBe('A1:H62');expect(actual.getWorksheet('inv')!.getCell('C8').value).toBe('NEW CLIENT');
  });
  it('supports the actual invoice row spacing, item numbers, units, source clearing and typed dates',async()=>{
    const template=new ExcelJS.Workbook(),sheet=template.addWorksheet('inv');
    sheet.mergeCells('C23:D23');sheet.mergeCells('C25:D25');sheet.mergeCells('C27:D27');
    sheet.getCell('B27').value=3;sheet.getCell('C27').value='PREVIOUS CLIENT ITEM';sheet.getCell('H27').value=999;
    const output=await renderInvoiceWorkbook(await template.xlsx.writeBuffer() as never,{
      worksheet:'inv',fields:{number:'H11',issueDate:'H12',clientTin:'H15',clientEmail:'C12',total:'H45'},firstItemRow:23,rowStep:2,maxItems:3,
      columns:{itemNumber:2,description:3,quantity:5,unit:6,unitPrice:7,amount:8},unitLabel:'Pcs',clearRanges:['B23:H28'],mergeRanges:['C9:D11'],wrapFields:['clientAddress'],fieldFormats:{clientEmail:'E-mail: {value}'},
    },{number:'INV-NEW',issueDate:'2026-11-24',clientTin:'001234',clientEmail:'billing@example.com',total:'300',lines:[{description:'Onshore 3GB',quantity:2,unitPrice:'50',discount:'0',taxRate:'0'},{description:'Offshore 20GB',quantity:4,unitPrice:'50',discount:'0',taxRate:'0'}]});
    const actual=new ExcelJS.Workbook();await actual.xlsx.load(output as never);const out=actual.getWorksheet('inv')!;
    expect(out.getCell('B23').value).toBe(1);expect(out.getCell('B25').value).toBe(2);expect(out.getCell('F25').value).toBe('Pcs');expect(out.getCell('C25').value).toBe('Offshore 20GB');
    expect(out.getCell('C27').value).toBeNull();expect(out.getCell('H27').value).toBeNull();expect(out.getCell('H12').value).toBeInstanceOf(Date);expect(out.getCell('H15').value).toBe('001234');expect(out.getCell('C12').value).toBe('E-mail: billing@example.com');expect(out.getCell('D11').isMerged).toBe(true);
  });
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
