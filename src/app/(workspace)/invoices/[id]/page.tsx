import { notFound } from 'next/navigation';
import { getWorkspace } from '@/lib/workspace';
import { InvoiceDetail } from '@/features/invoices/screens';
export default async function InvoicePage({params}:{params:Promise<{id:string}>}){const{id}=await params;const w=await getWorkspace();const invoice=w.invoices.find(i=>i.id===id);if(!invoice)notFound();return <InvoiceDetail workspace={w} invoice={invoice}/>;}
