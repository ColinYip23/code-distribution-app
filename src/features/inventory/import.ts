import Papa from 'papaparse';
export type ImportEntry = { code: string; expires_on: string | null; source: Record<string, string> };

function sourceDate(value: string): string | null {
  const raw = value.trim(); if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw), dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (!iso && !dmy) throw new Error('Expected a date in day/month/year or YYYY-MM-DD format.');
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(dmy![3]), Number(dmy![2]), Number(dmy![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Invalid source date.');
  return date.toISOString().slice(0, 10);
}

export function parseCodeCsv(text: string, column = 'Auto', productName?: string): { codeColumn: string; entries: ImportEntry[]; errors: { row: number; reason: string }[] } {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { delimiter: ',', header: true, skipEmptyLines: 'greedy', dynamicTyping: false, transformHeader: value => value.trim() });
  if (parsed.errors.length) throw new Error(`CSV could not be read: ${parsed.errors[0].message}`);
  if (parsed.data.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} rows.`);
  const fields = parsed.meta.fields ?? [], find = (name: string) => fields.find(field => field.toLowerCase() === name.toLowerCase());
  const codeColumn = !column.trim() || column.toLowerCase() === 'auto' ? find('PAC') ?? find('code') : find(column.trim());
  if (!codeColumn) throw new Error('Choose the code column; CME exports normally use PAC.');
  const expiry = find('Expiry'), created = find('Created Date'), validity = find('Validity'), description = find('CONNECTme NOW PAC'), remark = find('Remark');
  const selectedSize = productName?.match(/\b(\d+)\s*gb\b/i)?.[1];
  const selectedCategory=productName?.match(/\b(onshore|offshore)\b/i)?.[1].toLowerCase();
  const entries: ImportEntry[] = [], errors: { row: number; reason: string }[] = [];
  parsed.data.forEach((row, index) => {
    const sourceProduct = description ? row[description]?.trim() : '', sourceSize = sourceProduct?.match(/\b(\d+)\s*gb\b/i)?.[1];
    if (selectedSize && sourceSize && selectedSize !== sourceSize) throw new Error(`The file contains ${sourceSize}GB codes. Select the matching product instead of ${productName}.`);
    const sourceCategory=sourceProduct?.match(/\b(onshore|offshore)\b/i)?.[1].toLowerCase();
    if(selectedCategory&&sourceCategory&&selectedCategory!==sourceCategory)throw new Error(`The file explicitly contains ${sourceCategory==='offshore'?'Offshore':'Onshore'} ${sourceSize??''}GB codes. Select the matching product instead of ${productName}.`);
    try {
      const source: Record<string, string> = {};
      if (sourceProduct) source.product = sourceProduct;
      if (validity && row[validity]?.trim()) source.validity = row[validity].trim();
      if (created) { const date = sourceDate(row[created] ?? ''); if (date) source.created_on = date; }
      if (remark && row[remark]?.trim()) source.remark = row[remark].trim();
      entries.push({ code: (row[codeColumn] ?? '').trim(), expires_on: expiry ? sourceDate(row[expiry] ?? '') : null, source });
    } catch { errors.push({ row: index + 2, reason: 'Invalid source date. Use day/month/year or YYYY-MM-DD.' }); }
  });
  return { codeColumn, entries, errors };
}
export const MAX_IMPORT_ROWS = 5000;
export function previewCodes(codes: string[], existing: string[] = []) {
  if (codes.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} codes at once.`);
  const seen = new Set<string>(); const stored = new Set(existing);
  const accepted: string[] = []; const rejected: { row: number; reason: string }[] = [];
  codes.forEach((raw, index) => {
    const value = raw.trim();
    const reason = !value ? 'Empty code' : value.length > 512 || /[\r\n]/.test(value) ? 'Invalid code length or line break' : seen.has(value) ? 'Duplicate in upload' : stored.has(value) ? 'Already in inventory' : null;
    seen.add(value);
    if (reason) rejected.push({ row: index + 1, reason }); else accepted.push(value);
  });
  return { accepted, rejected };
}
export function parseCsv(text: string, column: string): string[] {
  const parsed = Papa.parse<Record<string, string>>(text, { delimiter: ',', header: true, skipEmptyLines: 'greedy', dynamicTyping: false, transformHeader: value => value.trim() });
  if (!parsed.meta.fields?.includes(column)) throw new Error(`The file has no "${column}" column.`);
  if (parsed.errors.length) throw new Error(`CSV could not be read: ${parsed.errors[0].message}`);
  if (parsed.data.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} rows.`);
  return parsed.data.map(row => row[column]);
}
