'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Layers3, ShieldCheck } from 'lucide-react';
import { ActionForm, Field } from '@/components/ui';
import { signIn } from '@/features/auth/actions';
export default function Login(){const router=useRouter();return <main className="login-page"><section className="login-card"><div className="login-theme"><ThemeToggle /></div><Link href="/" className="brand"><span className="brand-mark"><Layers3 size={23}/></span>CodeDesk<span className="brand-dot">.</span></Link><div className="login-heading"><h1>Back to business.</h1><p>Sign in to manage your codes, clients, and invoices.</p></div><ActionForm handler={signIn} submit="Sign in" onSuccess={()=>{router.push('/');router.refresh();}}><Field label="Email address"><input name="email" type="email" required autoComplete="email" placeholder="you@business.com"/></Field><Field label="Password"><input name="password" type="password" required autoComplete="current-password"/></Field></ActionForm><p className="login-foot"><ShieldCheck size={16}/>Private workspace · Invited accounts only</p></section></main>;}
