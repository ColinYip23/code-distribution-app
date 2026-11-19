import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { requireMember } from '@/lib/auth/require-member';
import { renderInvoiceWorkbook, templateMappingSchema, type RenderInvoice } from './render';
type Member = Awaited<ReturnType<typeof requireMember>>;
type Snapshot = { number: string; billing_name: string; billing_address: string; billing_tin: string; issue_date: string; due_date: string; subtotal: string; discount: string; tax: string; adjustment: string; total: string; notes: string; currency: string; business: { name: string; legal_name: string; address: string; tin: string; registration_number:string;email:string;phone:string; payment_instructions: string };client:{registration_number:string;email:string;phone:string;tax_identifier:string;country:string;contact_person:string}; lines: { description: string; quantity: number; unit_price: string; discount: string; tax_rate: string }[] };
export function renderValues(snapshot: Snapshot): RenderInvoice {
  return { number: snapshot.number, clientName: snapshot.billing_name, clientAddress: snapshot.billing_address, clientTin: snapshot.billing_tin,clientRegistrationNumber:snapshot.client.registration_number,clientEmail:snapshot.client.email,clientPhone:snapshot.client.phone,clientTaxIdentifier:snapshot.client.tax_identifier,clientCountry:snapshot.client.country,clientContactPerson:snapshot.client.contact_person, issueDate: snapshot.issue_date, dueDate: snapshot.due_date, subtotal: String(snapshot.subtotal), discount: String(snapshot.discount), tax: String(snapshot.tax), adjustment: String(snapshot.adjustment), total: String(snapshot.total), notes: snapshot.notes, currency: snapshot.currency, businessName: snapshot.business.legal_name || snapshot.business.name, businessAddress: snapshot.business.address, businessTin: snapshot.business.tin,businessRegistrationNumber:snapshot.business.registration_number,businessEmail:snapshot.business.email,businessPhone:snapshot.business.phone, paymentInstructions: snapshot.business.payment_instructions, lines: snapshot.lines.map(l => ({ description: l.description, quantity: l.quantity, unitPrice: String(l.unit_price), discount: String(l.discount), taxRate: String(l.tax_rate) })) };
}
export async function ensureInvoiceArtifact(member: Member, invoiceId: string) {
  const { supabase, businessId } = member;
  const revisionResult = await supabase.from('invoice_revisions').select('*').eq('invoice_id', invoiceId).eq('business_id', businessId).single();
  if (revisionResult.error || !revisionResult.data) throw new Error('FORBIDDEN');
  const revision = revisionResult.data;
  if (revision.artifact_status === 'ready') {
    const saved = await supabase.storage.from('documents').download(revision.artifact_path);
    if (saved.error) throw new Error('ARTIFACT_UNAVAILABLE');
    return { bytes: new Uint8Array(await saved.data.arrayBuffer()), number: String(revision.snapshot.number) };
  }
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error('ARCHIVE_SETUP_REQUIRED');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const templateResult = await supabase.from('invoice_templates').select('*').eq('id', revision.template_id).eq('business_id', businessId).single();
  if (templateResult.error || !templateResult.data) throw new Error('TEMPLATE_UNAVAILABLE');
  const template = templateResult.data;
  const file = await supabase.storage.from('documents').download(template.storage_path);
  if (file.error) throw new Error('TEMPLATE_UNAVAILABLE');
  const bytes = await renderInvoiceWorkbook(new Uint8Array(await file.data.arrayBuffer()), templateMappingSchema.parse(template.mapping), renderValues(revision.snapshot as Snapshot));
  const path = `${businessId}/invoices/${revision.id}.xlsx`;
  const upload = await admin.storage.from('documents').upload(path, bytes, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
  if (upload.error) {
    // A concurrent retry may already have uploaded this immutable revision. Read its winning object.
    const existing = await supabase.storage.from('documents').download(path);
    if (existing.error) throw new Error('ARTIFACT_PENDING');
    const complete = await supabase.rpc('complete_artifact', { p_input: { id: revision.id, path } });
    if (complete.error) throw new Error('ARTIFACT_PENDING');
    return { bytes: new Uint8Array(await existing.data.arrayBuffer()), number: String(revision.snapshot.number) };
  }
  const complete = await supabase.rpc('complete_artifact', { p_input: { id: revision.id, path } });
  if (complete.error) throw new Error('ARTIFACT_PENDING');
  return { bytes, number: String(revision.snapshot.number) };
}
