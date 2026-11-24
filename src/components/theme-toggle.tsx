'use client';
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

function subscribe(callback: () => void) {
  window.addEventListener('codedesk-theme-change', callback);
  return () => window.removeEventListener('codedesk-theme-change', callback);
}
function currentTheme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function serverTheme() { return 'dark'; }
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('codedesk-theme', next); } catch {}
    window.dispatchEvent(new Event('codedesk-theme-change'));
  }
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={toggle}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>;
}
