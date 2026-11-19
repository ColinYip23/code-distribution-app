import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireMember } from '@/lib/auth/require-member';
import { renderOrderWorkbook, type AssignedCode } from '@/features/orders/export';
import { downloadFailure, spreadsheetResponse } from '@/lib/download';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await params);
    const { supabase } = await requireMember();
    const { data, error } = await supabase.rpc('order_codes', { p_input: { id } });
    if (error) throw new Error(error.message.startsWith('FORBIDDEN') ? 'FORBIDDEN' : 'EXPORT_FAILED');
    const codes = data.codes as AssignedCode[];
    if (request.nextUrl.searchParams.get('format') === 'json') return NextResponse.json({ codes }, { headers: { 'Cache-Control': 'private, no-store' } });
    const reference = `ORD-${String(data.order.order_no).padStart(4, '0')}`;
    return spreadsheetResponse(await renderOrderWorkbook(reference, codes), `${reference}-codes.xlsx`);
  } catch (error) { return downloadFailure(error); }
}
