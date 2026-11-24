import{describe,expect,it}from'vitest';
import{parseCodeCsv}from'@/features/inventory/import';
const csv='No,CONNECTme NOW PAC,PAC,Validity,Created Date,Expiry,Remark\r\n1,CONNECTme NOW Unlimited 3GB PAC,TEST-001,14D,3/11/2025,31/5/2026,Sample batch\r\n2,CONNECTme NOW Unlimited 3GB PAC,000TEST-002,14D,3/11/2025,2/1/2027,Sample batch';
describe('CME supplier CSV',()=>{
 it('detects PAC and preserves source expiry and validity without treating dates as US format',()=>{
  const result=parseCodeCsv(csv);
  expect(result.codeColumn).toBe('PAC');
  expect(result.entries).toEqual([
   {code:'TEST-001',expires_on:'2026-05-31',source:{product:'CONNECTme NOW Unlimited 3GB PAC',validity:'14D',created_on:'2025-11-03',remark:'Sample batch'}},
   {code:'000TEST-002',expires_on:'2027-01-02',source:{product:'CONNECTme NOW Unlimited 3GB PAC',validity:'14D',created_on:'2025-11-03',remark:'Sample batch'}},
  ]);
 });
 it('rejects a mismatched data allowance instead of importing 3GB PACs as 20GB',()=>{
  expect(()=>parseCodeCsv(csv,'Auto','Offshore 20GB')).toThrow('3GB');
 });
 it('keeps explicitly labelled Onshore and Offshore products separate at the same allowance',()=>{
  const offshore=csv.replaceAll('CONNECTme NOW Unlimited 3GB PAC','CONNECTme NOW Offshore 20GB PAC');
  expect(()=>parseCodeCsv(offshore,'Auto','Onshore 20GB')).toThrow('Offshore');
  expect(parseCodeCsv(offshore,'Auto','Offshore 20GB').entries).toHaveLength(2);
 });
 it('reports invalid source dates instead of silently making the code non-expiring',()=>{
  const result=parseCodeCsv(csv.replace('31/5/2026','31/2/2026'));
  expect(result.entries.map(e=>e.code)).toEqual(['000TEST-002']);expect(result.errors[0].row).toBe(2);
 });
 it('still supports simple code-only CSV and an explicit column',()=>{
  expect(parseCodeCsv('voucher\n00123','voucher').entries[0]).toEqual({code:'00123',expires_on:null,source:{}});
 });
});
