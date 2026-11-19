import ExcelJS from 'exceljs';
import { MAX_IMPORT_ROWS } from './import';
export async function readCodeWorkbook(bytes: Uint8Array, column: number): Promise<{ codes: string[]; errors: { row: number; reason: string }[] }> {
  if (!Number.isInteger(column) || column < 1 || column > 100) throw new Error('Choose a column between 1 and 100.');
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets.');
  if (sheet.rowCount > MAX_IMPORT_ROWS + 1) throw new Error(`Import at most ${MAX_IMPORT_ROWS} rows.`);
  const codes: string[] = [], errors: { row: number; reason: string }[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const value = row.getCell(column).value;
    if (value === null) return;
    if (typeof value === 'string') codes.push(value);
    else if (typeof value === 'object' && 'richText' in value) codes.push(value.richText.map(item => item.text).join(''));
    else errors.push({ row: index, reason: 'Code must be stored as text, without formulas or numeric conversion.' });
  });
  return { codes, errors };
}
