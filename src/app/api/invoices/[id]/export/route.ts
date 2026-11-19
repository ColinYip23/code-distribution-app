import { z } from 'zod';
import { requireMember } from '@/lib/auth/require-member';
import { ensureInvoiceArtifact } from '@/features/invoices/artifacts';
import { downloadFailure, spreadsheetResponse } from '@/lib/download';
export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = z.object({ id: z.uuid() }).parse(await params); const member = await requireMember(); const artifact = await ensureInvoiceArtifact(member, id); return spreadsheetResponse(artifact.bytes, `${artifact.number}.xlsx`); }
  catch (error) { return downloadFailure(error); }
}
