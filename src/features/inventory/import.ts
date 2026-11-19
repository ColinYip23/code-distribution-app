import Papa from 'papaparse';
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
