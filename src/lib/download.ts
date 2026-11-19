import { NextResponse } from 'next/server';
export function spreadsheetResponse(bytes: Uint8Array, filename: string) {
  return new NextResponse(bytes as BodyInit, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0,120)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function downloadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'UNAUTHENTICATED') return new NextResponse('Sign in to download this document.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (message === 'FORBIDDEN') return new NextResponse('You do not have access to this document.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (message === 'ARCHIVE_SETUP_REQUIRED') return new NextResponse('Invoice archiving is not configured. Your invoice is saved; finish the server storage setup and retry this download.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse('The download could not be completed. Your saved allocation or invoice is unchanged. Return to the app and retry.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
