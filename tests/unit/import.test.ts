import { describe, expect, it } from 'vitest';
import { previewCodes, parseCsv } from '@/features/inventory/import';

describe('code import', () => {
  it('preserves exact identifiers while rejecting repeated and existing codes', () => {
    const result = previewCodes([' 001234567890123456 ', '=ABCD', 'abc-X', 'abc-X', 'EXISTS', ''], ['EXISTS']);
    expect(result.accepted).toEqual(['001234567890123456', '=ABCD', 'abc-X']);
    expect(result.rejected.map(row => row.reason)).toEqual(['Duplicate in upload', 'Already in inventory', 'Empty code']);
  });
  it('handles quoted CSV and preserves leading zero codes', () => {
    expect(parseCsv('code,note\r\n00123,"hello, client"\r\n=ABCD,test', 'code')).toEqual(['00123', '=ABCD']);
  });
  it('rejects missing CSV column instead of importing unrelated data', () => {
    expect(() => parseCsv('voucher\n00123', 'code')).toThrow('column');
  });
  it('imports ordinary single-column CSV files',()=>{expect(parseCsv('code\n00123\n00456','code')).toEqual(['00123','00456']);});
});
