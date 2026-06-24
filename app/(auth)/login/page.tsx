'use client';

// INTRANET EDITION (D3/D8 · docs/INTRANET-DELTA.md): login-only.
// Turnstile dilepas (D2 verifyTurnstile no-op), registrasi publik dimatikan
// (D5-D8) → view signup/forgot/resend dibuang. Pembuatan akun & reset password
// = admin-driven via Admin Panel (D9/D10). Lapisan keamanan login lain (lockout
// 5x/15mnt, rate-limit, anti-enumeration) tetap aktif di server.

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { APP_NAME, APP_INSTANSI_SHORT } from '@/lib/constants';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const expiredReason = searchParams.get('reason') === 'expired';

  const [lgU, setLgU] = useState(''); const [lgP, setLgP] = useState('');
  const [lgSh, setLgSh] = useState(false); const [lgLd, setLgLd] = useState(false);
  const [lgErr, setLgErr] = useState('');

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setLgErr('');
    if (!lgU.trim()) { setLgErr('Username wajib diisi'); return; }
    if (lgP.length < 6) { setLgErr('Password minimal 6 karakter'); return; }
    setLgLd(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: lgU.trim(), password: lgP }) });
      const d = await res.json();
      if (!d.ok) { setLgErr(d.message || 'Login gagal'); return; }
      router.push('/menu'); router.refresh();
    } catch { setLgErr('Gagal terhubung ke server.'); } finally { setLgLd(false); }
  }

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

        .lp-root { min-height: 100vh; display: flex; background: #020F1C; position: relative; overflow: hidden; }

        .lp-brand {
          flex: 0 0 48%; min-height: 100vh;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 60px 52px; position: relative; overflow: hidden;
          background: linear-gradient(160deg,#031428 0%,#042C53 60%,#0C447C 100%);
          border-right: 1px solid #0C447C;
        }
        .lp-brand::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, transparent, #EF9F27, transparent); }
        .lp-brand-grid {
          position: absolute; inset: 0; pointer-events: none;
          background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .lp-brand-content { position: relative; z-index: 1; text-align: center; max-width: 380px; }

        .lp-crest { position: relative; width: 120px; height: 120px; margin: 0 auto 32px; }
        .lp-crest-outer { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(239,159,39,0.3); background: rgba(239,159,39,0.04); }
        .lp-crest-mid { position: absolute; inset: 14px; border-radius: 50%; border: 1px solid rgba(239,159,39,0.2); background: rgba(239,159,39,0.05); display: flex; align-items: center; justify-content: center; }
        .lp-crest-inner {
          width: 68px; height: 68px; border-radius: 20px;
          background: linear-gradient(135deg,rgba(239,159,39,0.15),rgba(239,159,39,0.05));
          backdrop-filter: blur(8px); border: 1.5px solid rgba(239,159,39,0.35);
          display: flex; align-items: center; justify-content: center; box-shadow: 0 0 32px rgba(239,159,39,0.12);
        }

        .lp-hospital-label { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; color: #85B7EB; text-transform: uppercase; margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px; }
        .lp-wordmark {
          font-size: 62px; font-weight: 900; line-height: 1; letter-spacing: -3px; margin-bottom: 10px;
          background: linear-gradient(135deg,#EF9F27,#FAC775,#EF9F27); background-size: 200%;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 4s linear infinite;
        }
        .lp-tagline { font-size: 12.5px; color: #B5D4F4; line-height: 1.65; letter-spacing: .3px; max-width: 300px; margin: 0 auto; }
        .lp-divider { width: 56px; height: 1.5px; margin: 28px auto; background: linear-gradient(90deg,transparent,#EF9F27,transparent); border-radius: 99px; }
        .lp-quote { font-size: 13px; color: #85B7EB; line-height: 1.75; font-style: italic; }

        .lp-stats { display: flex; gap: 10px; margin-top: 32px; flex-wrap: wrap; justify-content: center; }
        .lp-stat-chip { background: rgba(239,159,39,0.08); border: 1px solid rgba(239,159,39,0.2); border-radius: 8px; padding: 8px 14px; text-align: center; }
        .lp-stat-chip .val { font-size: 16px; font-weight: 800; color: #EF9F27; font-family: 'JetBrains Mono','Courier New',monospace; }
        .lp-stat-chip .lbl { font-size: 9.5px; color: #85B7EB; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }

        .lp-right { flex: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 24px; background: #020F1C; }

        .lp-card { width: 100%; max-width: 430px; background: #042C53; border-radius: 14px; border: 1px solid #0C447C; box-shadow: 0 24px 64px rgba(0,0,0,.5), 0 0 0 1px rgba(239,159,39,.06); overflow: hidden; }
        .lp-card-stripe { height: 4px; background: linear-gradient(90deg,#633806,#EF9F27,#FAC775,#EF9F27,#633806); background-size: 200% 100%; animation: shimmer 3.5s linear infinite; }
        .lp-card-body { padding: 24px 32px 20px; }
        .lp-card-footer { text-align: center; padding: 8px 32px 12px; border-top: 1px solid #0C447C; font-size: 11px; color: #85B7EB; background: rgba(4,44,83,.5); letter-spacing: .5px; }

        .lp-icon-badge {
          width: 52px; height: 52px; border-radius: 14px;
          background: linear-gradient(135deg,#633806,rgba(239,159,39,.3)); border: 1.5px solid rgba(239,159,39,.4);
          display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;
          box-shadow: 0 4px 20px rgba(239,159,39,.2); animation: gold-pulse 3s ease-in-out infinite;
        }

        .lp-label { display: block; font-size: 11px; font-weight: 700; color: #B5D4F4; margin-bottom: 7px; text-transform: uppercase; letter-spacing: .7px; }
        .lp-input {
          width: 100%; padding: 11px 14px; border: 1.5px solid #0C447C; border-radius: 6px; font-size: 14px; color: #E6F1FB;
          background: rgba(12,68,124,.3); outline: none; font-family: inherit; transition: border-color .2s, box-shadow .2s, background .2s; caret-color: #EF9F27;
        }
        .lp-input::placeholder { color: #85B7EB; opacity: .65; }
        .lp-input:focus { border-color: #EF9F27; background: rgba(12,68,124,.5); box-shadow: 0 0 0 3px rgba(239,159,39,.15); }
        .lp-group { margin-bottom: 12px; }
        .lp-input-wrap { position: relative; }
        .lp-input-wrap .lp-input { padding-right: 44px; }
        .lp-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #85B7EB; display: flex; padding: 4px; transition: color .2s; }
        .lp-eye:hover { color: #EF9F27; }

        .lp-btn-primary {
          width: 100%; padding: 13px; background: #EF9F27; color: #020F1C; border: none; border-radius: 6px;
          font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          letter-spacing: .3px; transition: background .2s, transform .1s; font-family: inherit; margin-bottom: 12px;
        }
        .lp-btn-primary:hover:not(:disabled) { background: #FAC775; transform: translateY(-1px); }
        .lp-btn-primary:disabled { opacity: .55; cursor: not-allowed; transform: none; }

        .lp-msg-err { padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 8px; background: #791F1F; color: #FCA5A5; border: 1px solid rgba(226,75,74,.4); }

        .lp-info-box { padding: 10px 14px; background: rgba(12,68,124,.4); border: 1px solid #185FA5; border-radius: 10px; font-size: 12.5px; color: #B5D4F4; margin-top: 18px; line-height: 1.6; display: flex; gap: 8px; }

        @media (max-width: 768px) { .lp-brand { display: none; } }
      `}</style>

      <div className="lp-root">

        {/* ── LEFT BRAND PANEL ── */}
        <div className="lp-brand">
          <div className="lp-brand-grid" />
          <div style={{ position:'absolute', width:380, height:380, borderRadius:'50%', top:'-8%', left:'-18%', background:'#EF9F27', opacity:0.06, filter:'blur(90px)', animation:'orb-float 14s ease-in-out infinite alternate' }} />
          <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', bottom:'4%', right:'-12%', background:'#185FA5', opacity:0.25, filter:'blur(80px)', animation:'orb-float-2 16s ease-in-out infinite alternate' }} />
          <div style={{ position:'absolute', width:240, height:240, borderRadius:'50%', bottom:'28%', left:'8%', background:'#EF9F27', opacity:0.04, filter:'blur(60px)', animation:'orb-float-3 11s ease-in-out infinite alternate' }} />

          <div className="lp-brand-content">
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
              {[0,60,120,180,240,300].map((deg, i) => {
                const rad  = deg * Math.PI / 180;
                const top  = Math.round((60 - 60 * Math.cos(rad) - 3.5) * 1000) / 1000;
                const left = Math.round((60 + 60 * Math.sin(rad) - 3.5) * 1000) / 1000;
                return <div key={i} suppressHydrationWarning style={{ position:'absolute', width:7, height:7, borderRadius:'50%', background:'rgba(239,159,39,0.65)', top, left }} />;
              })}
            </div>

            <div className="lp-hospital-label fade-up-1">
              <span style={{ width:28, height:1, background:'rgba(133,183,235,0.35)', display:'inline-block' }} />
              RSJD Dr. Amino Gondohutomo
              <span style={{ width:28, height:1, background:'rgba(133,183,235,0.35)', display:'inline-block' }} />
            </div>

            <div className="fade-up-2">
              <div className="lp-wordmark">PRIMA</div>
              <div className="lp-tagline">Program Realisasi &amp; Informasi Monitoring Anggaran</div>
            </div>

            <div className="lp-divider fade-up-3" />

            <div className="lp-quote fade-up-3">
              &ldquo;Sistem pengelolaan &amp; monitoring anggaran<br />internal Rumah Sakit terintegrasi.&rdquo;
            </div>

            <div className="lp-stats fade-up-4">
              <div className="lp-stat-chip"><div className="val">26+</div><div className="lbl">Roles</div></div>
              <div className="lp-stat-chip"><div className="val">1.0</div><div className="lbl">Versi</div></div>
            </div>
          </div>
        </div>

        {/* ── RIGHT FORM (login-only) ── */}
        <div className="lp-right">
          <div className="lp-card fade-up">
            <div className="lp-card-stripe" />
            <div className="lp-card-body">
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
                  display:'flex', alignItems:'center', gap:10, fontSize:12.5, fontWeight:600, color:'#FFE08A',
                  background:'rgba(186,117,23,.20)', border:'1px solid #FFC857', borderRadius:8, padding:'10px 14px', marginBottom:14, boxShadow:'0 0 16px rgba(255,200,87,.12)',
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
                <button type="submit" className="lp-btn-primary" disabled={lgLd} style={{ marginTop: 4 }}>
                  {lgLd ? <><Loader2 size={16} className="animate-spin" /> Memverifikasi...</> : 'Masuk'}
                </button>
              </form>

              <div className="lp-info-box">
                <span>🔒</span><span>Akun dikelola oleh Super Admin. Untuk pendaftaran akun baru atau reset password, hubungi Super Admin.</span>
              </div>
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
