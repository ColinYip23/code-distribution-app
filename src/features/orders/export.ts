import ExcelJS from 'exceljs';
import type { AssignedCode } from './format';
export { formatOrderCodes, type AssignedCode } from './format';
export async function renderOrderWorkbook(reference: string, codes: AssignedCode[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'CodeDesk'; workbook.subject = reference;
  const sheet = workbook.addWorksheet('Codes');
  sheet.columns = [{ header: 'Product', key: 'product', width: 24 }, { header: 'Code', key: 'code', width: 48 },{header:'SKU',key:'sku',width:24}];
  codes.forEach(row => { const created = sheet.addRow({ product: row.product, code: row.code,sku:row.sku??'' }); created.getCell(2).numFmt = '@'; });
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3E36' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
