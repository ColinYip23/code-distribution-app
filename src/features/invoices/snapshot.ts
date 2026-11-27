import type{RenderInvoice}from'./render';
export type RenderSnapshot={number:string;billing_name:string;billing_address:string;billing_tin:string;order_reference?:string;purpose_description?:string;issue_date:string;due_date:string;subtotal:string;discount:string;tax:string;adjustment:string;total:string;notes:string;currency:string;business:{name:string;legal_name:string;address:string;tin:string;registration_number?:string;email?:string;phone?:string;payment_instructions:string};client:{registration_number?:string;email?:string;phone?:string;tax_identifier?:string;country?:string;contact_person?:string};lines:{description:string;quantity:number;unit_price:string;discount:string;tax_rate:string}[]};
export function renderValues(snapshot:RenderSnapshot):RenderInvoice{
 const days=Math.max(0,Math.round((Date.parse(snapshot.due_date)-Date.parse(snapshot.issue_date))/86400000));
 return{
  purposeDescription:snapshot.purpose_description??'',number:snapshot.number,issueDate:snapshot.issue_date,dueDate:snapshot.due_date,paymentTerms:days===0?'CASH':`${days} days`,orderReference:snapshot.order_reference??'',
  clientName:snapshot.billing_name,clientAddress:snapshot.billing_address,clientTin:snapshot.billing_tin,
  clientRegistrationNumber:snapshot.client.registration_number??'',clientEmail:snapshot.client.email??'',clientPhone:snapshot.client.phone??'',clientTaxIdentifier:snapshot.client.tax_identifier??'',clientCountry:snapshot.client.country??'',clientContactPerson:snapshot.client.contact_person??'',
  businessName:snapshot.business.legal_name||snapshot.business.name,businessAddress:snapshot.business.address,businessTin:snapshot.business.tin,businessRegistrationNumber:snapshot.business.registration_number??'',businessEmail:snapshot.business.email??'',businessPhone:snapshot.business.phone??'',paymentInstructions:snapshot.business.payment_instructions,
  subtotal:String(snapshot.subtotal),discount:String(snapshot.discount),tax:String(snapshot.tax),adjustment:String(snapshot.adjustment),total:String(snapshot.total),notes:snapshot.notes,currency:snapshot.currency,
  lines:snapshot.lines.map(l=>({description:l.description,quantity:l.quantity,unitPrice:String(l.unit_price),discount:String(l.discount),taxRate:String(l.tax_rate)})),
 };
}
