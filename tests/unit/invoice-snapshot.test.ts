import{expect,it}from'vitest';
import{renderValues,type RenderSnapshot}from'@/features/invoices/snapshot';
it('maps custom order references and invoice terms from the frozen issued document',()=>{
 const snapshot={number:'CUSTOM-01',billing_name:'Client',billing_address:'Address',billing_tin:'00123',order_reference:'CLIENT-PO',issue_date:'2026-11-24',due_date:'2026-12-01',subtotal:'10',discount:'0',tax:'0',adjustment:'0',total:'10',notes:'',currency:'MYR',business:{name:'Business',legal_name:'',address:'',tin:'',payment_instructions:''},client:{},lines:[{description:'Onshore 3GB',quantity:1,unit_price:'10',discount:'0',tax_rate:'0'}]} as RenderSnapshot;
 const result=renderValues(snapshot);expect(result.paymentTerms).toBe('7 days');expect(result.orderReference).toBe('CLIENT-PO');expect(result.clientTin).toBe('00123');
 expect(renderValues({...snapshot,due_date:snapshot.issue_date}).paymentTerms).toBe('CASH');
});
