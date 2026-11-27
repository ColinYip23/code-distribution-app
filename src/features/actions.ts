'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/lib/auth/require-member';
import { previewCodes, parseCodeCsv, type ImportEntry } from './inventory/import';
import { localToday } from '@/lib/format';
import { readCodeWorkbook } from './inventory/workbook';
import { templateMappingSchema } from './invoices/render';
import { calculateInvoice } from './invoices/calculate';
import { currencies, type ActionResult } from '@/shared/contracts';

const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Use a positive amount with at most two decimal places.');
const id = z.uuid(); const text = z.string().max(5000);
const line = z.object({ product_id: id, quantity: z.coerce.number().int().min(1).max(5000), unit_price: money });
const optionalId = z.preprocess(value => value === '' ? undefined : value, id.optional());
const importMetadata=z.object({product_id:id,supplier:text,reference:text,notes:text,expires_on:z.union([z.iso.date(),z.literal('')]),unit_cost:z.union([money,z.literal('')])});
const schemas = {
  save_product: z.object({ id: optionalId, sku: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(150), description: text, provider: text, default_price: money, low_stock_threshold: z.coerce.number().int().min(0), active: z.boolean() }),
  save_client: z.object({ id: optionalId, name: z.string().trim().min(1).max(150), legal_name: text, contact_person: text, email: z.union([z.email(), z.literal('')]), phone: text, address: text, country: text, tin: text, registration_number: text, tax_identifier: text, currency: z.enum(currencies), payment_terms: z.coerce.number().int().min(0).max(365), notes: text, archived: z.boolean() }),
  save_business: z.object({ name: z.string().trim().min(1).max(150), legal_name: text, address: text, tin: text, registration_number: text, email: z.union([z.email(), z.literal('')]), phone: text, payment_instructions: text, currency: z.enum(currencies) }),
  save_order: z.object({ id: optionalId, client_id: id, currency: z.enum(currencies), notes: text, lines: z.array(line).min(1).max(100) }),
  save_invoice: z.object({ id: optionalId, client_id: id, currency: z.enum(currencies), number: z.string().max(100), order_reference:z.string().max(200).default(''), purpose_description:z.string().max(250), issue_date: z.iso.date(), due_date: z.iso.date(), billing_name: text, billing_address: text, billing_tin: text, notes: text, adjustment: z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/), order_ids: z.array(id).max(100), lines: z.array(z.object({ product_id: z.union([id, z.literal('')]).optional(), description: z.string().min(1).max(500), quantity: z.coerce.number().int().min(1).max(5000), unit_price: money, discount: money, tax_rate: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/) })).min(1).max(100) }),
  issue_invoice: z.object({ id, request_key: id, mismatch_reason: text }),
  cancel_order_and_release: z.object({ id, reason: z.string().trim().min(3).max(1000), release_confirmed: z.union([z.literal('yes'),z.literal('')]).transform(v=>v==='yes') }),
  transition_order: z.object({ id, status: z.enum(['sent', 'cancelled']), reason: text }),
  void_invoice: z.object({ id, reason: z.string().min(3).max(1000) }),
  record_payment: z.object({ invoice_id: id, amount: money, paid_on: z.iso.date(), reference: text, request_key: id }),
  reverse_payment: z.object({ id, reason: z.string().min(3).max(1000) }),
  void_code: z.object({ id, reason: z.string().min(3).max(1000) }),
  verify_template: z.object({ id }),
};

function fields(form: FormData) {
  const input: Record<string, unknown> = Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  for (const key of ['lines', 'order_ids', 'codes']) if (typeof input[key] === 'string') input[key] = JSON.parse(input[key] as string);
  if (form.has('active')) input.active = form.get('active') === 'true';
  if (form.has('archived')) input.archived = form.get('archived') === 'true';
  return input;
}
function failure(error: unknown): ActionResult {
  if (error instanceof z.ZodError) return { ok: false, message: error.issues[0]?.message ?? 'Check the form fields.' };
  const message = error instanceof Error ? error.message : '';
  if (message === 'CANCELLATION_UPDATE_REQUIRED') return {ok:false,message:'Apply the order cancellation database migration before cancelling.'};
  if (message === 'SETUP_REQUIRED') return { ok: false, message: 'Connect Supabase to save changes. See Settings for setup instructions.' };
  if (message === 'UNAUTHENTICATED' || message === 'FORBIDDEN') return { ok: false, message: 'Your session does not have access. Sign in with an authorized account.' };
  if(message==='INVOICE_SEQUENCE_UPDATE_REQUIRED')return{ok:false,message:'Apply the VSSB invoice numbering database migration before issuing invoices.'};
  if(message==='INVOICE_PURPOSE_UPDATE_REQUIRED')return{ok:false,message:'Apply the invoice purpose database migration before saving invoices.'};
  if(message==='DATABASE_UPDATE_REQUIRED')return{ok:false,message:'Apply the 24 November CME file-support migration in Supabase before importing supplier files with expiry dates or saving an order reference.'};
  // Never return database details (which can contain raw codes) to the browser or logs.
  const safe = ['INSUFFICIENT_STOCK', 'INVALID_STATE', 'MISMATCH', 'TEMPLATE_REQUIRED','TEMPLATE_CAPACITY','TEMPLATE_CURRENCY', 'VALIDATION_ERROR'];
  const marker = safe.find(value => message.startsWith(value));
  if (message.startsWith('SHARED_INVOICE')) return {ok:false,message:'This invoice covers other orders. Resolve the shared invoice before cancelling this order.'};
  if (message.startsWith('INVOICE_HAS_PAYMENTS')) return {ok:false,message:'The linked invoice has payments. Resolve the payments before cancelling this order.'};
  if (marker === 'INSUFFICIENT_STOCK') return { ok: false, message: 'There is not enough eligible stock for this order. No codes were allocated.' };
  if (marker === 'MISMATCH') return { ok: false, message: 'Explain the difference between this invoice and its linked orders before issuing.' };
  if (marker === 'TEMPLATE_REQUIRED') return { ok: false, message: 'Upload and verify an invoice template before issuing.' };
  if(marker==='TEMPLATE_CAPACITY')return{ok:false,message:'This invoice has more lines than your verified template supports. Edit the draft or configure a larger template.'};
  if(marker==='TEMPLATE_CURRENCY')return{ok:false,message:'This invoice currency does not match the selected template. The VSAT CME template is labelled RM and requires MYR.'};
  if (marker) return { ok: false, message: marker === 'INVALID_STATE' ? 'This action is unavailable for the current record state. Refresh and check linked invoices or payments.' : 'Check the supplied values, dates, and outstanding balance.' };
  if (message === 'DUPLICATE') return { ok: false, message: 'That number, SKU, request, or order link is already in use.' };
  return { ok: false, message: 'The operation could not be completed. Refresh and try again; previously saved allocations are preserved.' };
}
export async function performAction(form: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireMember();
    const action = z.string().parse(form.get('_action'));
    const input = fields(form);
    let data: Record<string, unknown>;
    if (action === 'allocate_order') {
      const parsed = z.object({ id, request_key: id }).parse(input);
      const result = await supabase.rpc('allocate_order', { p_order_id: parsed.id, p_request_key: parsed.request_key });
      if (result.error) throw new Error(result.error.code === '23505' ? 'DUPLICATE' : result.error.message);
      data = result.data;
    } else if (action === 'import_codes') {
      const parsed = z.object({preview_id:id}).parse(input);
      const result = await supabase.rpc('confirm_import', { p_input: parsed });
      if (result.error) throw new Error(result.error.message); data = result.data;
    } else {
      const schema = schemas[action as keyof typeof schemas];
      if (!schema) throw new Error('VALIDATION_ERROR');
      const parsed = schema.parse(input);
      if(action==='issue_invoice'){const sequence=await supabase.rpc('invoice_sequence_capabilities',{p_input:{}});if(sequence.error||!sequence.data?.vssb_sequence)throw new Error('INVOICE_SEQUENCE_UPDATE_REQUIRED');const capability=await supabase.rpc('import_capabilities',{p_input:{}});if(capability.error||!capability.data?.template_currency_guard)throw new Error('DATABASE_UPDATE_REQUIRED');}
      if (action === 'save_invoice') {
        const invoice = schemas.save_invoice.parse(input);
        const purposeColumn=await supabase.from('invoices').select('purpose_description').limit(0);if(purposeColumn.error)throw new Error('INVOICE_PURPOSE_UPDATE_REQUIRED');
        calculateInvoice(invoice.lines.map(row => ({ description: row.description, quantity: row.quantity, unitPrice: row.unit_price, discount: row.discount, taxRate: row.tax_rate })), invoice.adjustment);
        if(invoice.order_reference){const capability=await supabase.rpc('import_capabilities',{p_input:{}});if(capability.error||capability.data?.source_metadata_version!==2)throw new Error('DATABASE_UPDATE_REQUIRED');}
      }
      const result = await supabase.rpc(action, { p_input: parsed });
      if (result.error && action === 'cancel_order_and_release' && result.error.code === 'PGRST202') throw new Error('CANCELLATION_UPDATE_REQUIRED');
      if (result.error) throw new Error(result.error.code === '23505' ? 'DUPLICATE' : result.error.message);
      data = result.data;
    }
    revalidatePath('/', 'layout');
    return { ok: true, message: action === 'import_codes' ? `Imported ${data.inserted} codes. Skipped ${data.skipped} duplicates.` : 'Saved successfully.', id: data.id as string | undefined, data };
  } catch (error) { return failure(error); }
}

export async function previewImport(form: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireMember();
    const metadata=importMetadata.parse(Object.fromEntries(['product_id','supplier','reference','notes','expires_on','unit_cost'].map(key=>[key,String(form.get(key)??'')])));
    const productResult=await supabase.from('products').select('name').eq('id',metadata.product_id).eq('active',true).single();if(productResult.error||!productResult.data)throw new Error('VALIDATION_ERROR');
    const file = form.get('file'), pasted = String(form.get('pasted') ?? ''); let codes: string[]; let errors: { row: number; reason: string }[] = []; let entries:ImportEntry[]=[];
    if (file instanceof File && file.size) {
      if (file.size > 4 * 1024 * 1024) return { ok: false, message: 'Upload a file smaller than 4 MB.' };
      if (file.name.toLowerCase().endsWith('.csv')) {const result=parseCodeCsv(await file.text(),String(form.get('column')??'Auto'),productResult.data.name);entries=result.entries;errors=result.errors;codes=entries.map(entry=>entry.code);}
      else if (file.name.toLowerCase().endsWith('.xlsx')) { const result = await readCodeWorkbook(new Uint8Array(await file.arrayBuffer()), Number(form.get('xlsx_column') ?? 1)); codes = result.codes; errors = result.errors; }
      else return { ok: false, message: 'Choose a CSV or XLSX file.' };
    } else codes = pasted.split(/\r?\n/);
    const preview = previewCodes(codes);
    const check = await supabase.rpc('preview_import', { p_input: { codes: preview.accepted } });
    if (check.error) throw new Error(check.error.message);
    const existing = check.data.existing as string[];
    const final = previewCodes(codes, existing);
    const sourceByCode=new Map<string,ImportEntry>();for(const entry of entries)if(!sourceByCode.has(entry.code))sourceByCode.set(entry.code,entry);
    const acceptedEntries=final.accepted.map(code=>sourceByCode.get(code)??{code,expires_on:null,source:{}});
    if(acceptedEntries.some(entry=>entry.expires_on||Object.keys(entry.source).length)){const capability=await supabase.rpc('import_capabilities',{p_input:{}});if(capability.error||capability.data?.source_metadata_version!==2)throw new Error('DATABASE_UPDATE_REQUIRED');}
    let previewId='';if(final.accepted.length){const stored=await supabase.rpc('create_import_preview',{p_input:{...metadata,codes:final.accepted,entries:acceptedEntries}});if(stored.error)throw new Error(stored.error.message);previewId=stored.data.preview_id;}
    const expiryDates=acceptedEntries.map(entry=>entry.expires_on||metadata.expires_on).filter(Boolean).sort();
    const expiredCount=expiryDates.filter(date=>date<localToday()).length;
    return { ok: true, message: `${final.accepted.length} codes ready to import.`, data: {preview_id:previewId,metadata, accepted: final.accepted, rejected: [...final.rejected, ...errors],expiredCount,sourceExpiry:expiryDates.length?{first:expiryDates[0],last:expiryDates.at(-1)}:null,validities:[...new Set(acceptedEntries.map(entry=>entry.source.validity).filter(Boolean))]} };
  } catch (error) {
    if (error instanceof Error && /column|CSV|rows|codes at once|worksheets|Workbook|GB codes/.test(error.message)) return { ok: false, message: error.message };
    return failure(error);
  }
}

export async function uploadTemplate(form: FormData): Promise<ActionResult> {
  try {
    const { supabase, businessId, role } = await requireMember();
    if (role !== 'owner') throw new Error('FORBIDDEN');
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.xlsx')) return { ok: false, message: 'Choose an XLSX template smaller than 4 MB.' };
    const mapping = templateMappingSchema.parse(JSON.parse(String(form.get('mapping'))));
    const path = `${businessId}/templates/${crypto.randomUUID()}.xlsx`;
    const upload = await supabase.storage.from('documents').upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
    if (upload.error) throw new Error('Upload failed');
    const result = await supabase.rpc('save_template', { p_input: { name: file.name, storage_path: path, mapping, verified: false } });
    if (result.error) throw new Error(result.error.message);
    revalidatePath('/', 'layout'); return { ok: true, message: 'Template version saved. Existing invoices keep their original template.' };
  } catch (error) { return failure(error); }
}
