import Link from 'next/link';
export default function NotFound(){return <main className="error-page"><h1>This record isn’t available.</h1><p>It may not exist or may belong to another workspace.</p><Link href="/" className="button primary">Back to overview</Link></main>;}
