import { z } from 'zod';
import { requireMember } from '@/lib/auth/require-member';
import { renderInvoiceWorkbook, templateMappingSchema } from '@/features/invoices/render';
import { downloadFailure, spreadsheetResponse } from '@/lib/download';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await params); const { supabase, businessId } = await requireMember();
    const result = await supabase.from('invoice_templates').select('*').eq('id', id).eq('business_id', businessId).single();
    if (result.error || !result.data) throw new Error('FORBIDDEN');
    const file = await supabase.storage.from('documents').download(result.data.storage_path); if (file.error) throw new Error('TEMPLATE_UNAVAILABLE');
    const bytes = await renderInvoiceWorkbook(new Uint8Array(await file.data.arrayBuffer()), templateMappingSchema.parse(result.data.mapping), { number: 'SAMPLE-NOT-AN-INVOICE', clientName: 'Sample Client Company', clientAddress: 'Sample billing address\nFor layout verification only', clientTin: '00123456789', businessName: 'Sample Business', businessAddress: 'Sample business address', businessTin: '00987654321', issueDate: '2026-11-19', dueDate: '2026-12-19', subtotal: '20.00', discount: '1.00', tax: '1.14', adjustment: '-0.14', total: '20.00', notes: 'SAMPLE ONLY — verify formatting, identifiers, totals and print layout.', paymentInstructions: 'Sample payment instructions', lines: [{ description: 'Sample 5GB data codes', quantity: 2, unitPrice: '10.00', discount: '1.00', taxRate: '6' }] });
    return spreadsheetResponse(bytes, 'template-layout-sample.xlsx');
  } catch (error) { return downloadFailure(error); }
}
