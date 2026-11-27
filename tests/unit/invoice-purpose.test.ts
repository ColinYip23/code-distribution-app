import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { renderInvoiceWorkbook } from '@/features/invoices/render';
import { renderValues } from '@/features/invoices/snapshot';

describe('invoice purpose', () => {
  it('writes a custom purpose in the workbook independently of line descriptions', async () => {
    const book = new ExcelJS.Workbook(); book.addWorksheet('inv').getCell('C19').value = 'Old purchase wording';
    const output = await renderInvoiceWorkbook(await book.xlsx.writeBuffer() as never, {worksheet:'inv',fields:{purposeDescription:'C19'},firstItemRow:23,maxItems:1,columns:{description:3,quantity:5,unitPrice:7,amount:8}}, {number:'INV-1',clientTin:'',total:'10',purposeDescription:'Being Maintenance Services as below:',lines:[{description:'Repair',quantity:1,unitPrice:'10',discount:'0',taxRate:'0'}]});
    const result = new ExcelJS.Workbook(); await result.xlsx.load(output as never);
    expect(result.getWorksheet('inv')!.getCell('C19').value).toBe('Being Maintenance Services as below:');
    expect(result.getWorksheet('inv')!.getCell('C23').value).toBe('Repair');
  });
  it('includes the saved purpose in the invoice render values', () => {
    const snapshot = {number:'1',billing_name:'Client',billing_address:'',billing_tin:'',purpose_description:'Deployment',issue_date:'2026-01-01',due_date:'2026-01-01',subtotal:'1',discount:'0',tax:'0',adjustment:'0',total:'1',notes:'',currency:'MYR',business:{name:'A',legal_name:'',address:'',tin:'',payment_instructions:''},client:{},lines:[]};
    expect(renderValues(snapshot).purposeDescription).toBe('Deployment');
  });
});
