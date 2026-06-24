'use client';

// Modal "Permohonan Upgrade Role" — dipakai dari menu user badge dropdown.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §9B.

import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, ShieldCheck } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { ROLE_LABELS } from '@/lib/constants';

// NB: Window.turnstile global type declared di app/(auth)/login/page.tsx — reuse.

interface Props {
  currentRole: string;
  eligibleTargets: readonly string[];
  onClose: () => void;
  onSuccess: () => void;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export function PromotionRequestModal({ currentRole, eligibleTargets, onClose, onSuccess }: Props) {
  const [toRole, setToRole]       = useState(eligibleTargets[0] ?? '');
  const [password, setPassword]   = useState('');
  const [secret, setSecret]       = useState('');
  const [reason, setReason]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg]   = useState('');

  const tsContainerRef = useRef<HTMLDivElement>(null);
  const tsWidgetRef    = useRef<string>('');
  const tsTokenRef     = useRef<string>('');

  // Turnstile render + cleanup (pattern sama dengan login/page.tsx).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    function renderWidget() {
      if (!tsContainerRef.current || !window.turnstile) return;
      if (tsWidgetRef.current) {
        try { window.turnstile.remove(tsWidgetRef.current); } catch {}
      }
      tsTokenRef.current = '';
      tsWidgetRef.current = window.turnstile.render(tsContainerRef.current, {
        sitekey:            TURNSTILE_SITE_KEY,
        appearance:         'always',
        size:               'compact',
        callback:           (token: string) => { tsTokenRef.current = token; },
        'expired-callback': () => { tsTokenRef.current = ''; },
        'error-callback':   () => { tsTokenRef.current = ''; },
      });
    }
    if (!document.getElementById('ts-script')) {
      const s = document.createElement('script');
      s.id = 'ts-script';
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = renderWidget;
      document.head.appendChild(s);
    } else if (window.turnstile) {
      renderWidget();
    }
    return () => {
      if (tsWidgetRef.current && window.turnstile) {
        try { window.turnstile.remove(tsWidgetRef.current); } catch {}
        tsWidgetRef.current = '';
      }
    };
  }, []);

  async function waitForTsToken(maxMs = 4000): Promise<string> {
    const t0 = Date.now();
    while (!tsTokenRef.current && Date.now() - t0 < maxMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return tsTokenRef.current;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (reason.trim().length < 30) {
      setErrorMsg('Alasan minimal 30 karakter.');
      return;
    }
    if (!toRole) {
      setErrorMsg('Pilih target role.');
      return;
    }
    setSubmitting(true);
    try {
      const turnstileToken = await waitForTsToken();
      if (!turnstileToken) {
        setErrorMsg('Captcha belum siap. Tunggu beberapa detik lalu coba lagi.');
        setSubmitting(false);
        return;
      }
      const res = await fetch('/api/auth/promotion/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ toRole, password, secret, reason: reason.trim(), turnstileToken }),
      });
      let json: { ok: boolean; message?: string; data?: { reqId: number; bootstrap: boolean } };
      try { json = await res.json(); } catch { json = { ok: false, message: `HTTP ${res.status}` }; }
      if (!res.ok || !json.ok) {
        setErrorMsg(json.message ?? 'Gagal submit permohonan.');
        if (tsWidgetRef.current && window.turnstile) {
          window.turnstile.reset(tsWidgetRef.current);
          tsTokenRef.current = '';
        }
        return;
      }
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="promo-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="promo-modal-box">
        <div className="promo-modal-header">
          <ShieldCheck size={22} color="#7C5CFC" />
          <h2 className="promo-modal-title">Permohonan Upgrade Role</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="promo-modal-close">
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#85B7EB', marginTop: 0, marginBottom: 16 }}>
          Role saat ini: <b style={{ color: '#E6F1FB' }}>{ROLE_LABELS[currentRole] ?? currentRole}</b>.
          Permohonan akan di-review oleh Super Admin (max 48 jam).
        </p>

        <form onSubmit={handleSubmit} className="promo-modal-form">
          <div>
            <label className="promo-label">Target role</label>
            <div style={{ position: 'relative' }}>
              <select
                className="promo-select"
                value={toRole}
                onChange={(e) => setToRole(e.target.value)}
                disabled={submitting || eligibleTargets.length === 1}
              >
                {eligibleTargets.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                ))}
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', right: 10, top: 12, color: '#85B7EB', pointerEvents: 'none' }} />
            </div>
          </div>

          <div>
            <label className="promo-label">Password kamu (re-auth)</label>
            <input
              className="promo-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label className="promo-label">Secret code (dari Super Admin)</label>
            <input
              className="promo-input"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
              required
              disabled={submitting}
              placeholder="Contoh: Prima-XXXX-2026"
            />
            <div className="promo-hint">
              Hubungi Super Admin untuk dapat secret code. 3x salah → akun terkunci 24 jam.
            </div>
          </div>

          <div>
            <label className="promo-label">Alasan upgrade (min 30 karakter)</label>
            <textarea
              className="promo-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              required
              disabled={submitting}
              placeholder="Jelaskan kebutuhan akses role baru…"
            />
            <div className={`promo-hint${reason.trim().length < 30 ? ' warn' : ''}`}>
              {reason.trim().length} / 1000 karakter
            </div>
          </div>

          {TURNSTILE_SITE_KEY && <div ref={tsContainerRef} style={{ minHeight: 65 }} />}

          {errorMsg && <div className="promo-error">{errorMsg}</div>}

          <div className="promo-actions">
            <PrimaButton type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Batal
            </PrimaButton>
            <PrimaButton type="submit" variant="purple" disabled={submitting}>
              {submitting ? 'Mengirim…' : 'Submit Permohonan'}
            </PrimaButton>
          </div>
        </form>
      </div>
    </div>
  );
}
