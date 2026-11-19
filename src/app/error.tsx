'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="error-page"><h1>We couldn’t load your workspace.</h1><p>Check your Supabase connection, database migration, and invited account access.</p><button className="button primary" onClick={reset}>Try again</button><Link href="/login" className="button secondary">Sign in</Link></main>;}
