'use client';
import { Children, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X, Inbox, LoaderCircle } from 'lucide-react';
import { performAction } from '@/features/actions';
import type { ActionResult } from '@/shared/contracts';

export function ActionForm({ children, action, onSuccess, submit = 'Save changes', disabled = false, initial, handler = performAction }: { children: ReactNode; action?: string; onSuccess?: (result: ActionResult) => void; submit?: string; disabled?: boolean; initial?: Record<string, string>; handler?: (form: FormData) => Promise<ActionResult> }) {
  const [result, setResult] = useState<ActionResult | null>(null); const [pending, start] = useTransition(); const router = useRouter(); const requestKey = useRef<string | null>(null);
  return <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (data.has('request_key') && !data.get('request_key')) { requestKey.current ??= crypto.randomUUID(); data.set('request_key', requestKey.current); } start(async () => { try { const outcome = await handler(data); setResult(outcome); if (outcome.ok) { if(action==='record_payment')requestKey.current=null; router.refresh(); onSuccess?.(outcome); } } catch { setResult({ ok: false, message: 'The connection was interrupted. Refresh to check whether your changes were saved.' }); } }); }}>
    {action && <input type="hidden" name="_action" value={action} />}
    {Object.entries(initial ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <fieldset disabled={pending} className="action-fields">{children}</fieldset>
    {result && <div className={`notice ${result.ok ? 'success' : 'error'}`} role="status">{result.message}</div>}
    <div className="form-footer"><button className="button primary" disabled={disabled || pending} type="submit">{pending && <LoaderCircle size={16} className="spin" />}{pending ? 'Working…' : submit}</button></div>
  </form>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div><div className="modal-body">{children}</div></dialog>;
}
export function Badge({ status }: { status: string }) { return <span className={`badge status-${status}`}>{status.replaceAll('_', ' ')}</span>; }
export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Inbox size={25} strokeWidth={1.5} /></div><h3>{title}</h3><p>{text}</p>{children}</div>;
}
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>;
}
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) { const[page,setPage]=useState(0);const rows=Children.toArray(children),pages=Math.ceil(rows.length/25),current=Math.min(page,Math.max(0,pages-1));return <><div className="table-scroll"><table><thead><tr>{headers.map((label,index) => <th key={`${label}-${index}`}>{label}</th>)}</tr></thead><tbody>{rows.slice(current*25,current*25+25)}</tbody></table></div>{pages>1&&<div className="table-pagination"><span>{current*25+1}–{Math.min((current+1)*25,rows.length)} of {rows.length}</span><button className="button secondary small-button" disabled={current===0} onClick={()=>setPage(current-1)}>Previous</button><button className="button secondary small-button" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>Next</button></div>}</>; }
export function Money({ amount, currency = 'MYR' }: { amount: number | string; currency?: string }) { return <span className="numeric">{new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(Number(amount))}</span>; }
export { date } from '@/lib/format';
