import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: { default: 'CodeDesk — Code distribution', template: '%s | CodeDesk' }, description: 'Manage purchased code inventory, client distribution, and invoices.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
