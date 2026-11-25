'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, Users, ShoppingBag, FileText, Settings, Layers3, ArrowUpRight, Menu, X, LogOut } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';
const navigation = [
  { href: '/', label: 'Overview', icon: LayoutDashboard }, { href: '/inventory', label: 'Inventory', icon: Package },
  { href: '/products', label: 'Products', icon: Layers3 }, { href: '/clients', label: 'Clients', icon: Users },
  { href: '/orders', label: 'Orders', icon: ShoppingBag }, { href: '/invoices', label: 'Invoices', icon: FileText },
];
export function Shell({ children, configured, name, email }: { children: ReactNode; configured: boolean; name: string; email: string }) {
  const path = usePathname(); const [open, setOpen] = useState(false); const active = navigation.find(item => item.href === '/' ? path === '/' : path.startsWith(item.href));
  return <div className="app-shell">
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <Link href="/" className="brand"><span className="brand-mark"><Layers3 size={23} /></span>CodeDesk<span className="brand-dot">.</span></Link>
      <div className="workspace-card"><span className="avatar">{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><small>Business workspace</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{navigation.map(({ href, label, icon: Icon }) => <Link onClick={() => setOpen(false)} key={href} href={href} className={`nav-link ${(href === '/' ? path === '/' : path.startsWith(href)) ? 'active' : ''}`}><Icon size={19} strokeWidth={1.7} />{label}</Link>)}</nav>
      <div className="sidebar-bottom"><Link onClick={() => setOpen(false)} className={`nav-link ${path === '/settings' ? 'active' : ''}`} href="/settings"><Settings size={19} />Settings</Link><div className="sidebar-foot">CodeDesk <span>v0.1</span></div></div>
    </aside>
    <div className="main-area"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button><span>Workspace</span><span className="divider">/</span><strong>{active?.label ?? (path.startsWith('/settings') ? 'Settings' : 'Workspace')}</strong></div><div className="topbar-right"><ThemeToggle /><span className={`connection ${configured ? 'connected' : ''}`}><i />{configured ? 'Supabase connected' : 'Setup pending'}</span>{configured ? <form action="/auth/logout" method="post"><button className="icon-button" aria-label="Sign out"><LogOut size={18} /></button></form> : <Link className="top-link" href="/settings">Connect workspace <ArrowUpRight size={15} /></Link>}<span className="avatar small" title={email || 'Owner'}>{(email || 'Owner').slice(0, 1).toUpperCase()}</span></div></header>
    {!configured && <div className="setup-banner"><span><strong>Let’s connect your workspace.</strong> Your app is ready for Supabase setup; inventory is empty until connected.</span><Link href="/settings">View setup</Link></div>}
    <main>{children}</main><footer className="app-footer"><span>CodeDesk · Inventory & distribution</span><span>Your codes. Your clients. All in order.</span></footer></div>
  </div>;
}
