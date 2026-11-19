import type{Workspace,Invoice}from'@/shared/contracts';
import{localToday,addDays}from'@/lib/format';
export type DraftLine={product_id:string;description:string;quantity:number;unit_price:string;discount:string;tax_rate:string};
export function blankInvoiceLine():DraftLine{return{product_id:'',description:'',quantity:1,unit_price:'0.00',discount:'0',tax_rate:'0'};}
export function initialInvoiceDraft(w:Workspace,invoice?:Invoice,fromOrder?:string,today=localToday()){
 const order=w.orders.find(o=>o.id===fromOrder&&['allocated','sent'].includes(o.status)&&!w.invoiceOrders.some(link=>link.order_id===o.id&&link.active));
 const clientId=invoice?.client_id??order?.client_id??'',client=w.clients.find(c=>c.id===clientId);
 const links=invoice?w.invoiceOrders.filter(l=>l.invoice_id===invoice.id&&l.active).map(l=>l.order_id):order?[order.id]:[];
 const lines:DraftLine[]=invoice?w.invoiceItems.filter(l=>l.invoice_id===invoice.id).sort((a,b)=>a.position-b.position).map(l=>({product_id:l.product_id??'',description:l.description,quantity:l.quantity,unit_price:String(l.unit_price),discount:String(l.discount),tax_rate:String(l.tax_rate)})):w.orderItems.filter(l=>links.includes(l.order_id)).map(l=>({product_id:l.product_id,description:l.description,quantity:l.quantity,unit_price:String(l.unit_price),discount:'0',tax_rate:'0'}));
 return{client:clientId,currency:invoice?.currency??order?.currency??w.business?.currency??'MYR',links,lines:lines.length?lines:[blankInvoiceLine()],billing:{name:invoice?.billing_name??(client?.legal_name||client?.name||''),address:invoice?.billing_address??client?.address??'',tin:invoice?.billing_tin??client?.tin??''},issue:invoice?.issue_date??today,due:invoice?.due_date??addDays(today,client?.payment_terms??30)};
}
