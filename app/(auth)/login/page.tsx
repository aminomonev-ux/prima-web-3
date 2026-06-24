'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { APP_NAME, APP_INSTANSI_SHORT, } from '@/lib/constants';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

type View = 'login' | 'signup' | 'forgot' | 'resend';

function genCaptcha() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function strength(p: string) {
  const r = { len: p.length >= 8, upper: /[A-Z]/.test(p), lower: /[a-z]/.test(p), num: /[0-9]/.test(p), sym: /[^A-Za-z0-9]/.test(p) };
  const s = Object.values(r).filter(Boolean).length;
  const lbl = ['', 'Sangat Lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat Kuat'];
  const col = ['#85B7EB', '#E24B4A', '#f97316', '#FAC775', '#1D9E75', '#6EE7B7'];
  return { r, s, lbl: lbl[s] ?? '', col: col[s] ?? '#85B7EB', pct: s * 20 };
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expiredReason = searchParams.get('reason') === 'expired';
  const [view, setView] = useState<View>('login');

  const [lgU, setLgU] = useState(''); const [lgP, setLgP] = useState('');
  const [lgSh, setLgSh] = useState(false); const [lgLd, setLgLd] = useState(false);
  const [lgErr, setLgErr] = useState('');

  const [suU, setSuU] = useState(''); const [suE, setSuE] = useState('');
  const [suP, setSuP] = useState(''); const [suC, setSuC] = useState('');
  const [suR, setSuR] = useState('');
  const [suShP, setSuShP] = useState(false); const [suShC, setSuShC] = useState(false);
  const [suLd, setSuLd] = useState(false);
  const [suErr, setSuErr] = useState(''); const [suOk, setSuOk] = useState('');
  const [capCode, setCapCode] = useState(''); const [capIn, setCapIn] = useState('');
  const [capErr, setCapErr] = useState(false);
  const str = strength(suP);

  const [fgIn, setFgIn] = useState(''); const [fgLd, setFgLd] = useState(false);
  const [fgErr, setFgErr] = useState(''); const [fgSent, setFgSent] = useState(false);

  const [rsIn, setRsIn] = useState(''); const [rsLd, setRsLd] = useState(false);
  const [rsMsg, setRsMsg] = useState(''); const [rsOk, setRsOk] = useState(false);

  const tsTokenRef    = useRef('');
  const tsWidgetRef   = useRef('');
  const tsContainerRef = useRef<HTMLDivElement>(null);

  async function waitForTsToken(maxMs = 6000): Promise<string> {
    const t0 = Date.now();
    while (!tsTokenRef.current && Date.now() - t0 < maxMs) {
      await new Promise(r => setTimeout(r, 150));
    }
    return tsTokenRef.current;
  }

  function renderTurnstile() {
    if (!TURNSTILE_SITE_KEY || !tsContainerRef.current || !window.turnstile) return;
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

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    if (!document.getElementById('ts-script')) {
      const s = document.createElement('script');
      s.id    = 'ts-script';
      s.src   = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = renderTurnstile;
      document.head.appendChild(s);
    } else if (window.turnstile) {
      renderTurnstile();
    }
    // Cleanup widget saat unmount (StrictMode double-mount + HMR ghost widget warning).
    return () => {
      if (tsWidgetRef.current && window.turnstile) {
        try { window.turnstile.remove(tsWidgetRef.current); } catch {}
        tsWidgetRef.current = '';
      }
    };
  }, []);

  useEffect(() => {
    if (window.turnstile) renderTurnstile();
    return () => {
      if (tsWidgetRef.current && window.turnstile) {
        try { window.turnstile.remove(tsWidgetRef.current); } catch {}
        tsWidgetRef.current = '';
      }
    };
  }, [view]);
  function go(v: View) {
    setView(v); setLgErr(''); setSuErr(''); setSuOk('');
    setFgErr(''); setFgSent(false); setRsMsg(''); setRsOk(false);
    // Generate captcha baru saat masuk signup (pindah dari useEffect — cegah cascading render).
    if (v === 'signup') setCapCode(genCaptcha());
  }

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setLgErr('');
    if (!lgU.trim()) { setLgErr('Username wajib diisi'); return; }
    if (lgP.length < 6) { setLgErr('Password minimal 6 karakter'); return; }
    setLgLd(true);
    try {
      const turnstile_token = await waitForTsToken();
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: lgU.trim(), password: lgP, turnstile_token }) });
      const d = await res.json();
      if (!d.ok) {
        setLgErr(d.message || 'Login gagal');
        if (tsWidgetRef.current && window.turnstile) { window.turnstile.reset(tsWidgetRef.current); tsTokenRef.current = ''; }
        return;
      }
      router.push('/menu'); router.refresh();
    } catch { setLgErr('Gagal terhubung ke server.'); } finally { setLgLd(false); }
  }

  async function doSignup(e: React.FormEvent) {
    e.preventDefault(); setSuErr(''); setSuOk(''); setCapErr(false);
    if (!suU.trim() || suU.length < 3) { setSuErr('Username minimal 3 karakter'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(suE)) { setSuErr('Format email tidak valid'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (str.s < 3) { setSuErr('Password terlalu lemah (min. Cukup)'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (suP !== suC) { setSuErr('Konfirmasi password tidak cocok'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (!suR) { setSuErr('Pilih role / bagian terlebih dahulu'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (capIn.toUpperCase() !== capCode) { setCapErr(true); setCapCode(genCaptcha()); setCapIn(''); setSuErr('Kode captcha salah. Coba lagi.'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setSuLd(true);
    try {
      const turnstile_token = await waitForTsToken();
      const res = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: suU.trim(), email: suE.trim(), password: suP, role: suR, turnstile_token }) });
      const d = await res.json();
      if (!d.ok) {
        setSuErr(d.message || 'Pendaftaran gagal'); window.scrollTo({ top: 0, behavior: 'smooth' });
        if (tsWidgetRef.current && window.turnstile) { window.turnstile.reset(tsWidgetRef.current); tsTokenRef.current = ''; }
        return;
      }
      setSuOk('Pendaftaran berhasil! Cek email Anda untuk verifikasi akun.');
      setSuU(''); setSuE(''); setSuP(''); setSuC(''); setSuR('');
      setTimeout(() => go('login'), 3000);
    } catch { setSuErr('Gagal terhubung ke server.'); window.scrollTo({ top: 0, behavior: 'smooth' }); } finally { setSuLd(false); }
  }

  async function doForgot(e: React.FormEvent) {
    e.preventDefault(); if (!fgIn.trim()) { setFgErr('Masukkan username atau email'); return; }
    setFgLd(true); setFgErr('');
    try {
      const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernameOrEmail: fgIn.trim() }) });
      const d = await res.json();
      if (d.ok) setFgSent(true); else setFgErr(d.message || 'Gagal mengirim link reset');
    } catch { setFgErr('Gagal terhubung ke server.'); } finally { setFgLd(false); }
  }

  async function doResend(e: React.FormEvent) {
    e.preventDefault(); if (!rsIn.trim()) { setRsMsg('Masukkan username atau email'); return; }
    setRsLd(true); setRsMsg('');
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernameOrEmail: rsIn.trim() }) });
      const d = await res.json(); setRsOk(d.ok); setRsMsg(d.message || (d.ok ? 'Email terkirim!' : 'Gagal'));
    } catch { setRsMsg('Gagal terhubung ke server.'); } finally { setRsLd(false); }
  }

  const allRoles = [
    { group: '── Bidang (Verifikator) ──', roles: ['RENBANG','UMUM','KEUANGAN','PELAYANAN','PENUNJANG','KEPERAWATAN'] },
    { group: '── Sub Bidang Renbang ──', roles: ['PROGRAM','MDSI','DIKLAT'] },
    { group: '── Sub Bidang Umum ──', roles: ['RUMAH TANGGA','TUKMAS','KEPEGAWAIAN'] },
    { group: '── Sub Bidang Keuangan ──', roles: ['PERBENDAHARAAN','AKUNTANSI','PENGEMBANGAN PENDAPATAN'] },
    { group: '── Sub Bidang Pelayanan ──', roles: ['PELAYANAN MEDIS','KEPERAWATAN MEDIS'] },
    { group: '── Sub Bidang Penunjang ──', roles: ['PENUNJANG MEDIS','PENUNJANG NON MEDIS'] },
  ];

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100vh; font-family: var(--font-jakarta), 'Inter', ui-sans-serif, system-ui, sans-serif; }

        @keyframes orb-float   { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(28px,18px) scale(1.07); } }
        @keyframes orb-float-2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-22px,24px) scale(1.05); } }
        @keyframes orb-float-3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(18px,-20px) scale(1.08); } }
        @keyframes fade-up     { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer     { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
        @keyframes gold-pulse  { 0%,100% { box-shadow: 0 0 0 0 rgba(239,159,39,0.35); } 50% { box-shadow: 0 0 0 8px rgba(239,159,39,0); } }

        .fade-up   { animation: fade-up .5s ease both; }
        .fade-up-1 { animation: fade-up .5s .06s ease both; }
        .fade-up-2 { animation: fade-up .5s .12s ease both; }
        .fade-up-3 { animation: fade-up .5s .18s ease both; }
        .fade-up-4 { animation: fade-up .5s .24s ease both; }

        /* ── Root ── */
        .lp-root {
          min-height: 100vh; display: flex;
          background: #020F1C;
          position: relative; overflow: hidden;
        }

        /* ── Left brand panel ── */
        .lp-brand {
          flex: 0 0 48%; min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 60px 52px; position: relative; overflow: hidden;
          background: linear-gradient(160deg,#031428 0%,#042C53 60%,#0C447C 100%);
          border-right: 1px solid #0C447C;
        }
        .lp-brand::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, transparent, #EF9F27, transparent);
        }
        .lp-brand-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .lp-brand-content { position: relative; z-index: 1; text-align: center; max-width: 380px; }

        /* ── Crest ── */
        .lp-crest { position: relative; width: 120px; height: 120px; margin: 0 auto 32px; }
        .lp-crest-outer {
          position: absolute; inset: 0; border-radius: 50%;
          border: 1.5px solid rgba(239,159,39,0.3);
          background: rgba(239,159,39,0.04);
        }
        .lp-crest-mid {
          position: absolute; inset: 14px; border-radius: 50%;
          border: 1px solid rgba(239,159,39,0.2);
          background: rgba(239,159,39,0.05);
          display: flex; align-items: center; justify-content: center;
        }
        .lp-crest-inner {
          width: 68px; height: 68px; border-radius: 20px;
          background: linear-gradient(135deg,rgba(239,159,39,0.15),rgba(239,159,39,0.05));
          backdrop-filter: blur(8px);
          border: 1.5px solid rgba(239,159,39,0.35);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 32px rgba(239,159,39,0.12);
        }

        /* ── Brand text ── */
        .lp-hospital-label {
          font-size: 10px; font-weight: 700; letter-spacing: 2.5px;
          color: #85B7EB; text-transform: uppercase; margin-bottom: 14px;
          display: inline-flex; align-items: center; gap: 10px;
        }
        .lp-wordmark {
          font-size: 62px; font-weight: 900; line-height: 1; letter-spacing: -3px; margin-bottom: 10px;
          background: linear-gradient(135deg,#EF9F27,#FAC775,#EF9F27);
          background-size: 200%;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          animation: shimmer 4s linear infinite;
        }
        .lp-tagline { font-size: 12.5px; color: #B5D4F4; line-height: 1.65; letter-spacing: .3px; max-width: 300px; margin: 0 auto; }
        .lp-divider {
          width: 56px; height: 1.5px; margin: 28px auto;
          background: linear-gradient(90deg,transparent,#EF9F27,transparent); border-radius: 99px;
        }
        .lp-quote { font-size: 13px; color: #85B7EB; line-height: 1.75; font-style: italic; }

        /* ── Stat chips ── */
        .lp-stats { display: flex; gap: 10px; margin-top: 32px; flex-wrap: wrap; justify-content: center; }
        .lp-stat-chip {
          background: rgba(239,159,39,0.08); border: 1px solid rgba(239,159,39,0.2);
          border-radius: 8px; padding: 8px 14px; text-align: center;
        }
        .lp-stat-chip .val { font-size: 16px; font-weight: 800; color: #EF9F27; font-family: 'JetBrains Mono','Courier New',monospace; }
        .lp-stat-chip .lbl { font-size: 9.5px; color: #85B7EB; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }

        /* ── Right form ── */
        .lp-right {
          flex: 1; min-height: 100vh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 32px 24px; background: #020F1C;
        }

        /* ── Card ── */
        .lp-card {
          width: 100%; max-width: 430px;
          background: #042C53; border-radius: 14px;
          border: 1px solid #0C447C;
          box-shadow: 0 24px 64px rgba(0,0,0,.5), 0 0 0 1px rgba(239,159,39,.06);
          overflow: hidden;
        }
        .lp-card-stripe {
          height: 4px;
          background: linear-gradient(90deg,#633806,#EF9F27,#FAC775,#EF9F27,#633806);
          background-size: 200% 100%; animation: shimmer 3.5s linear infinite;
        }
        .lp-card-body { padding: 24px 32px 20px; }
        .lp-card-footer {
          text-align: center; padding: 8px 32px 12px;
          border-top: 1px solid #0C447C;
          font-size: 11px; color: #85B7EB;
          background: rgba(4,44,83,.5); letter-spacing: .5px;
        }

        /* ── Icon badge ── */
        .lp-icon-badge {
          width: 52px; height: 52px; border-radius: 14px;
          background: linear-gradient(135deg,#633806,rgba(239,159,39,.3));
          border: 1.5px solid rgba(239,159,39,.4);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 10px;
          box-shadow: 0 4px 20px rgba(239,159,39,.2);
          animation: gold-pulse 3s ease-in-out infinite;
        }

        /* ── Turnstile wrapper ── */
        .lp-turnstile {
          display: flex; justify-content: center;
          margin: 10px 0 12px;
        }

        /* ── Form elements ── */
        .lp-label {
          display: block; font-size: 11px; font-weight: 700; color: #B5D4F4;
          margin-bottom: 7px; text-transform: uppercase; letter-spacing: .7px;
        }
        .lp-input {
          width: 100%; padding: 11px 14px; border: 1.5px solid #0C447C;
          border-radius: 6px; font-size: 14px; color: #E6F1FB;
          background: rgba(12,68,124,.3); outline: none; font-family: inherit;
          transition: border-color .2s, box-shadow .2s, background .2s;
          caret-color: #EF9F27;
        }
        .lp-input::placeholder { color: #85B7EB; opacity: .65; }
        .lp-input:focus {
          border-color: #EF9F27; background: rgba(12,68,124,.5);
          box-shadow: 0 0 0 3px rgba(239,159,39,.15);
        }
        .lp-group { margin-bottom: 12px; }
        .lp-input-wrap { position: relative; }
        .lp-input-wrap .lp-input { padding-right: 44px; }
        .lp-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #85B7EB; display: flex; padding: 4px; transition: color .2s; }
        .lp-eye:hover { color: #EF9F27; }

        /* ── Buttons ── */
        .lp-btn-primary {
          width: 100%; padding: 13px; background: #EF9F27;
          color: #020F1C; border: none; border-radius: 6px;
          font-size: 14px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: .3px; transition: background .2s, transform .1s;
          font-family: inherit; margin-bottom: 12px;
        }
        .lp-btn-primary:hover:not(:disabled) { background: #FAC775; transform: translateY(-1px); }
        .lp-btn-primary:disabled { opacity: .55; cursor: not-allowed; transform: none; }

        .lp-btn-secondary {
          width: 100%; padding: 12px; background: transparent; color: #B5D4F4;
          border: 1.5px solid #185FA5; border-radius: 6px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: border-color .2s, color .2s, background .2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .lp-btn-secondary:hover { border-color: #EF9F27; color: #EF9F27; background: rgba(239,159,39,.06); }

        .lp-link { background: none; border: none; color: #EF9F27; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 0; font-family: inherit; transition: color .2s; }
        .lp-link:hover { color: #FAC775; text-decoration: underline; }

        /* ── Messages ── */
        .lp-msg-err { padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 8px; background: #791F1F; color: #FCA5A5; border: 1px solid rgba(226,75,74,.4); }
        .lp-msg-ok  { padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 8px; background: #085041; color: #6EE7B7; border: 1px solid rgba(29,158,117,.4); }

        /* ── Divider OR ── */
        .lp-divider-or { text-align: center; color: #85B7EB; font-size: 12px; margin: 16px 0; position: relative; }
        .lp-divider-or::before,.lp-divider-or::after { content:''; position: absolute; top: 50%; width: 42%; height: 1px; background: #0C447C; }
        .lp-divider-or::before { left: 0; } .lp-divider-or::after { right: 0; }

        /* ── Strength bar ── */
        .lp-strength-bar-wrap { height: 4px; background: #0C447C; border-radius: 99px; margin-top: 8px; overflow: hidden; }
        .lp-strength-bar { height: 100%; border-radius: 99px; transition: width .3s, background .3s; }
        .lp-req-list { list-style: none; padding: 0; margin: 8px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
        .lp-req-list li { font-size: 11px; color: #85B7EB; display: flex; align-items: center; gap: 4px; }
        .lp-req-list li.ok { color: #6EE7B7; }
        .lp-req-list li::before { content: "○"; font-size: 10px; }
        .lp-req-list li.ok::before { content: "●"; }

        /* ── Captcha ── */
        .lp-captcha-row { display: flex; align-items: center; gap: 10px; }
        .lp-captcha-display {
          flex-shrink: 0; font-size: 18px; font-weight: 900; letter-spacing: 6px;
          padding: 8px 14px; background: rgba(239,159,39,.1);
          border: 1.5px dashed rgba(239,159,39,.4);
          border-radius: 8px; color: #EF9F27; user-select: none;
          font-family: 'JetBrains Mono','Courier New',monospace;
          min-width: 120px; text-align: center;
        }
        .lp-captcha-refresh { background: none; border: 1.5px solid #185FA5; border-radius: 8px; padding: 8px 10px; cursor: pointer; color: #85B7EB; transition: all .2s; flex-shrink: 0; }
        .lp-captcha-refresh:hover { border-color: #EF9F27; color: #EF9F27; }

        /* ── Select ── */
        .lp-select {
          width: 100%; padding: 11px 14px; border: 1.5px solid #0C447C;
          border-radius: 6px; font-size: 14px; color: #E6F1FB;
          background: rgba(12,68,124,.3); outline: none; font-family: inherit; cursor: pointer;
          transition: border-color .2s;
        }
        .lp-select:focus { border-color: #EF9F27; box-shadow: 0 0 0 3px rgba(239,159,39,.15); }
        .lp-select option { background: #042C53; color: #E6F1FB; }
        .lp-select optgroup { background: #0C447C; color: #85B7EB; }

        /* ── Info box ── */
        .lp-info-box {
          padding: 10px 14px; background: rgba(12,68,124,.4);
          border: 1px solid #185FA5; border-radius: 10px;
          font-size: 12.5px; color: #B5D4F4;
          margin-bottom: 18px; line-height: 1.6; display: flex; gap: 8px;
        }

        @media (max-width: 768px) {
          .lp-brand { display: none; }
        }
      `}</style>

      <div className="lp-root">

        {/* ── LEFT BRAND PANEL ── */}
        <div className="lp-brand">
          <div className="lp-brand-grid" />

          {/* Orbs */}
          <div style={{ position:'absolute', width:380, height:380, borderRadius:'50%', top:'-8%', left:'-18%', background:'#EF9F27', opacity:0.06, filter:'blur(90px)', animation:'orb-float 14s ease-in-out infinite alternate' }} />
          <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', bottom:'4%', right:'-12%', background:'#185FA5', opacity:0.25, filter:'blur(80px)', animation:'orb-float-2 16s ease-in-out infinite alternate' }} />
          <div style={{ position:'absolute', width:240, height:240, borderRadius:'50%', bottom:'28%', left:'8%', background:'#EF9F27', opacity:0.04, filter:'blur(60px)', animation:'orb-float-3 11s ease-in-out infinite alternate' }} />

          <div className="lp-brand-content">
            {/* Crest */}
            <div className="lp-crest fade-up">
              <div className="lp-crest-outer" />
              <div className="lp-crest-mid">
                <div className="lp-crest-inner">
                  <svg viewBox="0 0 64 64" width="42" height="42">
                    <defs>
                      <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#EF9F27" />
                        <stop offset="100%" stopColor="#FAC775" />
                      </linearGradient>
                    </defs>
                    <path d="M32 56s18-9 18-22V10L32 4 14 10v24c0 13 18 22 18 22z" fill="none" stroke="url(#goldGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M24 32l6 6 11-12" fill="none" stroke="url(#goldGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              {/* Orbit dots */}
              {[0,60,120,180,240,300].map((deg, i) => {
                const rad  = deg * Math.PI / 180;
                const top  = Math.round((60 - 60 * Math.cos(rad) - 3.5) * 1000) / 1000;
                const left = Math.round((60 + 60 * Math.sin(rad) - 3.5) * 1000) / 1000;
                return <div key={i} suppressHydrationWarning style={{ position:'absolute', width:7, height:7, borderRadius:'50%', background:'rgba(239,159,39,0.65)', top, left }} />;
              })}
            </div>

            {/* Hospital label */}
            <div className="lp-hospital-label fade-up-1">
              <span style={{ width:28, height:1, background:'rgba(133,183,235,0.35)', display:'inline-block' }} />
              RSJD Dr. Amino Gondohutomo
              <span style={{ width:28, height:1, background:'rgba(133,183,235,0.35)', display:'inline-block' }} />
            </div>

            {/* Wordmark */}
            <div className="fade-up-2">
              <div className="lp-wordmark">PRIMA</div>
              <div className="lp-tagline">Program Realisasi &amp; Informasi Monitoring Anggaran</div>
            </div>

            <div className="lp-divider fade-up-3" />

            <div className="lp-quote fade-up-3">
              &ldquo;Sistem pengelolaan &amp; monitoring anggaran<br />internal Rumah Sakit terintegrasi.&rdquo;
            </div>

            {/* Stat chips */}
            <div className="lp-stats fade-up-4">
              <div className="lp-stat-chip">
                <div className="val">26+</div>
                <div className="lbl">Roles</div>
              </div>
              <div className="lp-stat-chip">
                <div className="val">1.0</div>
                <div className="lbl">Versi</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT FORM ── */}
        <div className="lp-right">
          <div className="lp-card fade-up">
            <div className="lp-card-stripe" />
            <div className="lp-card-body">

              {/* ══ LOGIN ══ */}
              {view === 'login' && (
                <>
                  <div style={{ textAlign:'center', marginBottom:20 }}>
                    <div className="lp-icon-badge">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
                      </svg>
                    </div>
                    <div style={{ fontSize:20, fontWeight:800, color:'#E6F1FB', letterSpacing:'-0.5px' }}>Selamat datang 👋</div>
                    <div style={{ fontSize:12.5, color:'#85B7EB', marginTop:3 }}>Masuk ke akun Anda</div>
                  </div>

                  {expiredReason && !lgErr && (
                    <div style={{
                      display:'flex', alignItems:'center', gap:10,
                      fontSize:12.5, fontWeight:600, color:'#FFE08A',
                      background:'rgba(186,117,23,.20)', border:'1px solid #FFC857',
                      borderRadius:8, padding:'10px 14px', marginBottom:14,
                      boxShadow:'0 0 16px rgba(255,200,87,.12)',
                    }}>
                      <span style={{fontSize:16, color:'#FFC857'}}>⚠</span>
                      <span>Sesi anda telah berakhir karena tidak ada aktivitas. Silakan login kembali.</span>
                    </div>
                  )}

                  {lgErr && <div className="lp-msg-err"><span>⚠</span><span>{lgErr}</span></div>}

                  <form onSubmit={doLogin} noValidate>
                    <div className="lp-group">
                      <label className="lp-label">Username</label>
                      <input className="lp-input" type="text" autoComplete="username" placeholder="Masukkan username" value={lgU} onChange={e => { setLgU(e.target.value); setLgErr(''); }} disabled={lgLd} />
                    </div>
                    <div className="lp-group">
                      <label className="lp-label">Password</label>
                      <div className="lp-input-wrap">
                        <input className="lp-input" type={lgSh ? 'text' : 'password'} autoComplete="current-password" placeholder="Masukkan password" value={lgP} onChange={e => { setLgP(e.target.value); setLgErr(''); }} disabled={lgLd} />
                        <button type="button" className="lp-eye" onClick={() => setLgSh(!lgSh)}>{lgSh ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', marginBottom:16, marginTop:-6 }}>
                      <button type="button" className="lp-link" onClick={() => go('forgot')}>Lupa password?</button>
                    </div>
                    <div ref={tsContainerRef} className="lp-turnstile" />
                    <button type="submit" className="lp-btn-primary" disabled={lgLd}>
                      {lgLd ? <><Loader2 size={16} className="animate-spin" /> Memverifikasi...</> : 'Masuk'}
                    </button>
                  </form>

                  <div className="lp-divider-or">atau</div>
                  <button className="lp-btn-secondary" onClick={() => go('signup')}>📝 Buat Akun Baru</button>
                  <p style={{ textAlign:'center', fontSize:12, color:'#85B7EB', marginTop:14 }}>
                    Belum dapat email verifikasi?{' '}
                    <button className="lp-link" onClick={() => go('resend')}>Kirim Ulang</button>
                  </p>
                </>
              )}

              {/* ══ SIGNUP ══ */}
              {view === 'signup' && (
                <>
                  <div style={{ textAlign:'center', marginBottom:20 }}>
                    <div style={{ fontSize:40, marginBottom:8 }}>📝</div>
                    <div style={{ fontSize:20, fontWeight:800, color:'#E6F1FB' }}>Buat Akun Baru</div>
                    <div style={{ fontSize:13, color:'#85B7EB', marginTop:4 }}>Isi form di bawah untuk mendaftar</div>
                  </div>

                  {suErr && <div className="lp-msg-err"><span>⚠</span><span>{suErr}</span></div>}
                  {suOk  && <div className="lp-msg-ok"><span>✓</span><span>{suOk}</span></div>}

                  <form onSubmit={doSignup} noValidate>
                    <div className="lp-group">
                      <label className="lp-label">Username</label>
                      <input className="lp-input" type="text" placeholder="Min. 3 karakter, huruf/angka/_" value={suU} onChange={e => { setSuU(e.target.value); setSuErr(''); }} disabled={suLd} />
                    </div>
                    <div className="lp-group">
                      <label className="lp-label">Email</label>
                      <input className="lp-input" type="email" placeholder="contoh@email.com" value={suE} onChange={e => { setSuE(e.target.value); setSuErr(''); }} disabled={suLd} />
                    </div>
                    <div className="lp-group">
                      <label className="lp-label">Password</label>
                      <div className="lp-input-wrap">
                        <input className="lp-input" type={suShP ? 'text' : 'password'} placeholder="Min. 8 karakter" value={suP} onChange={e => { setSuP(e.target.value); setSuErr(''); }} disabled={suLd} />
                        <button type="button" className="lp-eye" onClick={() => setSuShP(!suShP)}>{suShP ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                      </div>
                      {suP && (<>
                        <div className="lp-strength-bar-wrap"><div className="lp-strength-bar" style={{ width:`${str.pct}%`, background:str.col }} /></div>
                        <div style={{ fontSize:11, color:str.col, marginTop:4 }}>{str.lbl}</div>
                        <ul className="lp-req-list">
                          {([['len','Min. 8 karakter'],['upper','Huruf besar'],['lower','Huruf kecil'],['num','Angka (0-9)'],['sym','Karakter spesial']] as [keyof typeof str.r, string][]).map(([k,l]) => (
                            <li key={k} className={str.r[k] ? 'ok' : ''}>{l}</li>
                          ))}
                        </ul>
                      </>)}
                    </div>
                    <div className="lp-group">
                      <label className="lp-label">Konfirmasi Password</label>
                      <div className="lp-input-wrap">
                        <input className="lp-input" type={suShC ? 'text' : 'password'} placeholder="Ulangi password" value={suC} onChange={e => { setSuC(e.target.value); setSuErr(''); }} disabled={suLd} />
                        <button type="button" className="lp-eye" onClick={() => setSuShC(!suShC)}>{suShC ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                      </div>
                      {suC && <div style={{ fontSize:11, color: suP===suC ? '#6EE7B7' : '#FCA5A5', marginTop:4 }}>{suP===suC ? '✓ Password cocok' : '✗ Tidak cocok'}</div>}
                    </div>
                    <div className="lp-group">
                      <label className="lp-label">Role / Bagian</label>
                      <select className="lp-select" value={suR} onChange={e => { setSuR(e.target.value); setSuErr(''); }} disabled={suLd}>
                        <option value="">-- Pilih Role --</option>
                        {allRoles.map(g => (
                          <optgroup key={g.group} label={g.group}>
                            {g.roles.map(r => <option key={r} value={r}>{r.charAt(0)+r.slice(1).toLowerCase()}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div className="lp-group">
                      <label className="lp-label">Verifikasi Captcha</label>
                      <div className="lp-captcha-row">
                        <div className="lp-captcha-display">{capCode}</div>
                        <button type="button" className="lp-captcha-refresh" onClick={() => { setCapCode(genCaptcha()); setCapIn(''); setCapErr(false); }}><RefreshCw size={16}/></button>
                        <input className="lp-input" type="text" placeholder="Ketik kode" maxLength={6} value={capIn} onChange={e => { setCapIn(e.target.value.toUpperCase()); setCapErr(false); setSuErr(''); }} disabled={suLd}
                          style={{ flex:1, margin:0, borderColor: capErr ? '#E24B4A' : undefined }} />
                      </div>
                    </div>

                    <div className="lp-info-box">
                      <span>📧</span><span>Setelah mendaftar, cek email Anda untuk verifikasi akun.</span>
                    </div>

                    <button type="submit" className="lp-btn-primary" disabled={suLd}>
                      {suLd ? <><Loader2 size={16} className="animate-spin"/>Mendaftar...</> : '📝 Daftar Sekarang'}
                    </button>
                  </form>
                  <div className="lp-divider-or">sudah punya akun?</div>
                  <button className="lp-btn-secondary" onClick={() => go('login')}>← Kembali ke Login</button>
                </>
              )}

              {/* ══ FORGOT ══ */}
              {view === 'forgot' && (
                <>
                  <div style={{ textAlign:'center', marginBottom:24 }}>
                    <div style={{ fontSize:40, marginBottom:8 }}>🔑</div>
                    <div style={{ fontSize:20, fontWeight:800, color:'#E6F1FB' }}>Lupa Password?</div>
                    <div style={{ fontSize:13, color:'#85B7EB', marginTop:4 }}>Masukkan username atau email — kami kirim link reset</div>
                  </div>

                  {!fgSent ? (
                    <form onSubmit={doForgot} noValidate>
                      {fgErr && <div className="lp-msg-err"><span>⚠</span><span>{fgErr}</span></div>}
                      <div className="lp-group">
                        <label className="lp-label">Username atau Email</label>
                        <input className="lp-input" type="text" placeholder="Masukkan username atau email Anda" value={fgIn} onChange={e => { setFgIn(e.target.value); setFgErr(''); }} disabled={fgLd} />
                      </div>
                      <div className="lp-info-box">
                        📧 Jika akun ditemukan, link reset password akan dikirim ke email Anda.
                      </div>
                      <button type="submit" className="lp-btn-primary" disabled={fgLd}>
                        {fgLd ? <><Loader2 size={16} className="animate-spin"/>Mengirim...</> : '📤 Kirim Link Reset'}
                      </button>
                      <button type="button" className="lp-btn-secondary" onClick={() => go('login')}>← Kembali ke Login</button>
                    </form>
                  ) : (
                    <div style={{ textAlign:'center', padding:'20px 0' }}>
                      <div style={{ width:64, height:64, background:'#085041', border:'1.5px solid rgba(29,158,117,.4)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:28 }}>✅</div>
                      <p style={{ fontWeight:700, color:'#E6F1FB', marginBottom:8 }}>Link Terkirim!</p>
                      <p style={{ fontSize:13, color:'#85B7EB', marginBottom:20, lineHeight:1.6 }}>Jika akun ditemukan, link reset password telah dikirim ke email Anda. Periksa inbox atau spam.</p>
                      <button className="lp-btn-secondary" onClick={() => go('login')}>← Kembali ke Login</button>
                    </div>
                  )}
                </>
              )}

              {/* ══ RESEND ══ */}
              {view === 'resend' && (
                <>
                  <div style={{ textAlign:'center', marginBottom:24 }}>
                    <div style={{ fontSize:40, marginBottom:8 }}>📧</div>
                    <div style={{ fontSize:20, fontWeight:800, color:'#E6F1FB' }}>Kirim Ulang Verifikasi</div>
                    <div style={{ fontSize:13, color:'#85B7EB', marginTop:4 }}>Masukkan username atau email yang didaftarkan</div>
                  </div>

                  {rsMsg && <div className={rsOk ? 'lp-msg-ok' : 'lp-msg-err'}><span>{rsOk ? '✓' : '⚠'}</span><span>{rsMsg}</span></div>}

                  <form onSubmit={doResend} noValidate>
                    <div className="lp-group">
                      <label className="lp-label">Username atau Email</label>
                      <input className="lp-input" type="text" placeholder="Username atau email Anda" value={rsIn} onChange={e => { setRsIn(e.target.value); setRsMsg(''); }} disabled={rsLd} />
                    </div>
                    <button type="submit" className="lp-btn-primary" disabled={rsLd}>
                      {rsLd ? <><Loader2 size={16} className="animate-spin"/>Mengirim...</> : '📤 Kirim Ulang Email Verifikasi'}
                    </button>
                    <button type="button" className="lp-btn-secondary" onClick={() => go('login')}>← Kembali ke Login</button>
                  </form>
                </>
              )}

            </div>

            <div className="lp-card-footer">
              🔒 {APP_INSTANSI_SHORT} © {new Date().getFullYear()} · {APP_NAME} v1.0
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
