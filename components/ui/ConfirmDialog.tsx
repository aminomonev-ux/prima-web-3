'use client';
// confirmDialog — pengganti native window.confirm dgn dialog design-system.
// Imperative + promise-based: if (!(await confirmDialog({ message }))) return;
// Mount portal sendiri (createRoot) → tak perlu hook / render manual di komponen.
// Tema dideteksi dari <html data-theme>. Esc / klik luar / Batal = false.

import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import PrimaButton from './PrimaButton';

type Variant = 'danger' | 'primary' | 'warning' | 'success' | 'purple';

export interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
}

function ConfirmUI({ opts, onDone }: { opts: ConfirmOpts; onDone: (v: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone(false);
      if (e.key === 'Enter') onDone(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDone]);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const c = {
    card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB',
    sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C',
  };

  return (
    <div onClick={() => onDone(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true"
        style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, padding: 22, width: 'min(420px,94vw)', boxShadow: isLight ? '0 24px 60px rgba(0,0,0,.18)' : '0 24px 60px rgba(0,0,0,.6)' }}>
        {opts.title && <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>{opts.title}</h2>}
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.sub, whiteSpace: 'pre-line', marginBottom: 18 }}>{opts.message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <PrimaButton variant="ghost" onClick={() => onDone(false)}>{opts.cancelLabel ?? 'Batal'}</PrimaButton>
          <PrimaButton variant={opts.variant ?? 'danger'} onClick={() => onDone(true)}>{opts.confirmLabel ?? 'Hapus'}</PrimaButton>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (val: boolean) => {
      root.unmount();
      host.remove();
      resolve(val);
    };
    root.render(<ConfirmUI opts={opts} onDone={done} />);
  });
}
