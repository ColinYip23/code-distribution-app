import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { requireMember } from '@/lib/auth/require-member';
import { renderInvoiceWorkbook, templateMappingSchema } from './render';
import { normalizeSupabaseUrl } from '@/lib/supabase/config';
type Member = Awaited<ReturnType<typeof requireMember>>;
import {renderValues,type RenderSnapshot}from './snapshot';
export{renderValues}from './snapshot';
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
  const admin = createClient(normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!), secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const templateResult = await supabase.from('invoice_templates').select('*').eq('id', revision.template_id).eq('business_id', businessId).single();
  if (templateResult.error || !templateResult.data) throw new Error('TEMPLATE_UNAVAILABLE');
  const template = templateResult.data;
  const file = await supabase.storage.from('documents').download(template.storage_path);
  if (file.error) throw new Error('TEMPLATE_UNAVAILABLE');
  const snapshot = revision.snapshot as RenderSnapshot;
  const mapping = templateMappingSchema.parse(template.mapping);
  // Only newly issued revisions contain this field; preserve historical workbooks.
  if (snapshot.purpose_description !== undefined && mapping.preservePackage && mapping.worksheet === 'inv' && mapping.firstItemRow === 23 && mapping.fields.total === 'H45' && !mapping.fields.purposeDescription) mapping.fields.purposeDescription = 'C19';
  const bytes = await renderInvoiceWorkbook(new Uint8Array(await file.data.arrayBuffer()), mapping, renderValues(snapshot));
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
