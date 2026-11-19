import{describe,expect,it}from'vitest';
import{initialInvoiceDraft,blankInvoiceLine}from'@/features/invoices/draft';
import type{Workspace}from'@/shared/contracts';
const w:Workspace={configured:true,business:null,userEmail:'',role:'owner',products:[],clients:[{id:'client-a',name:'Client A',legal_name:'',payment_terms:7,address:'Address A',tin:'00123',currency:'MYR'} as Workspace['clients'][number]],stock:[],batches:[],orders:[{id:'order-a',client_id:'client-a',currency:'MYR',status:'allocated'} as Workspace['orders'][number]],orderItems:[{order_id:'order-a',product_id:'product-a',description:'5GB',quantity:10,unit_price:2} as Workspace['orderItems'][number]],invoices:[],invoiceItems:[],invoiceOrders:[],payments:[],templates:[]};
describe('invoice draft defaults',()=>{
 it('uses the client display name and their terms when creating from an order',()=>{
  const state=initialInvoiceDraft(w,undefined,'order-a','2026-11-19');expect(state.billing.name).toBe('Client A');expect(state.due).toBe('2026-11-26');expect(state.links).toEqual(['order-a']);expect(state.lines[0].quantity).toBe(10);
 });
 it('does not silently initialize an order already linked to another invoice',()=>{
  const state=initialInvoiceDraft({...w,invoiceOrders:[{invoice_id:'existing-invoice',order_id:'order-a',active:true}]},undefined,'order-a','2026-11-19');expect(state.links).toEqual([]);expect(state.lines).toEqual([blankInvoiceLine()]);
 });
});
