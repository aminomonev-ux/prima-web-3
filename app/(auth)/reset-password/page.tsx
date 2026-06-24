'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { APP_NAME, APP_INSTANSI_SHORT } from '@/lib/constants';

function strength(p: string) {
  const r = { len: p.length >= 8, upper: /[A-Z]/.test(p), lower: /[a-z]/.test(p), num: /[0-9]/.test(p), sym: /[^A-Za-z0-9]/.test(p) };
  const s = Object.values(r).filter(Boolean).length;
  const lbl = ['', 'Sangat Lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat Kuat'];
  const col = ['#e5e7eb', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];
  return { r, s, lbl: lbl[s] ?? '', col: col[s] ?? '#e5e7eb', pct: s * 20 };
}

function ResetPasswordInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';

  const [pw, setPw]   = useState('');
  const [pwc, setPwc] = useState('');
  const [shP, setShP] = useState(false);
  const [shC, setShC] = useState(false);
  const [ld,  setLd]  = useState(false);
  const [err, setErr] = useState('');
  const [ok,  setOk]  = useState(false);

  const str = strength(pw);

  // Validasi awal: kalau token tidak ada di URL, tampilkan error
  const tokenMissing = !token.trim();

  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (tokenMissing) { setErr('Token tidak ditemukan di URL.'); return; }
    if (str.s < 3)    { setErr('Password terlalu lemah (min. Cukup).'); return; }
    if (pw !== pwc)   { setErr('Konfirmasi password tidak cocok.'); return; }

    setLd(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      const d = await res.json();
      if (!d.ok) { setErr(d.message || 'Gagal reset password.'); return; }
      setOk(true);
      // Redirect ke login setelah 3 detik
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setErr('Gagal terhubung ke server.');
    } finally {
      setLd(false);
    }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100vh; font-family: var(--font-jakarta), 'Plus Jakarta Sans', sans-serif; }
        @keyframes fade-up { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shimmer { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
        .fade-up { animation: fade-up .5s ease both; }
        .rp-root { min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg,#14532d 0%,#15803d 40%,#16a34a 100%); padding: 24px; }
        .rp-card { width: 100%; max-width: 440px; background: #fff; border-radius: 22px;
          box-shadow: 0 32px 80px rgba(0,0,0,.3); overflow: hidden; }
        .rp-stripe { height: 5px; background: linear-gradient(90deg,#0d7a3a,#15803d,#0a9e6a,#0d7a3a);
          background-size: 200% 100%; animation: shimmer 3s linear infinite; }
        .rp-body { padding: 32px 36px 28px; }
        .rp-footer { text-align: center; padding: 10px 36px 14px; border-top: 1px solid #f3f4f6;
          font-size: 11px; color: #9ca3af; background: #fafafa; }
        .rp-label { display: block; font-size: 11px; font-weight: 700; color: #374151;
          margin-bottom: 6px; text-transform: uppercase; letter-spacing: .5px; }
        .rp-input { width: 100%; padding: 11px 14px; border: 1.5px solid #e5e7eb;
          border-radius: 10px; font-size: 14px; color: #1f2937; background: #fff; outline: none;
          font-family: inherit; transition: border-color .2s, box-shadow .2s; }
        .rp-input:focus { border-color: #0d7a3a; box-shadow: 0 0 0 3px rgba(13,122,58,.12); }
        .rp-group { margin-bottom: 16px; }
        .rp-input-wrap { position: relative; }
        .rp-input-wrap .rp-input { padding-right: 44px; }
        .rp-eye { position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9ca3af; display: flex;
          padding: 4px; transition: color .2s; }
        .rp-eye:hover { color: #0d7a3a; }
        .rp-btn-primary { width: 100%; padding: 13px; background: linear-gradient(135deg,#0d7a3a,#15803d);
          color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: inherit; transition: opacity .2s; margin-bottom: 12px; }
        .rp-btn-primary:hover:not(:disabled) { opacity: .88; }
        .rp-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .rp-btn-secondary { width: 100%; padding: 12px; background: #fff; color: #0d7a3a;
          border: 1.5px solid #0d7a3a; border-radius: 10px; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit; transition: background .2s; }
        .rp-btn-secondary:hover { background: #f0fdf4; }
        .rp-msg-err { padding: 10px 14px; border-radius: 10px; font-size: 13px; font-weight: 500;
          margin-bottom: 16px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;
          display: flex; gap: 8px; align-items: flex-start; }
        .rp-strength-bar-wrap { height: 5px; background: #e5e7eb; border-radius: 99px;
          margin-top: 8px; overflow: hidden; }
        .rp-strength-bar { height: 100%; border-radius: 99px; transition: width .3s, background .3s; }
        .rp-req-list { list-style: none; padding: 0; margin: 8px 0 0;
          display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
        .rp-req-list li { font-size: 11px; color: #9ca3af; display: flex; align-items: center; gap: 4px; }
        .rp-req-list li.ok { color: #10b981; }
        .rp-req-list li::before { content: "○"; font-size: 10px; }
        .rp-req-list li.ok::before { content: "●"; }
      `}</style>

      <div className="rp-root">
        <div className="rp-card fade-up">
          <div className="rp-stripe" />
          <div className="rp-body">
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>🔐</div>
              <div style={{ fontSize:22, fontWeight:800, color:'#0f172a', letterSpacing:'-0.5px' }}>Reset Password</div>
              <div style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>Buat password baru untuk akun Anda</div>
            </div>

            {/* TOKEN MISSING */}
            {tokenMissing && (
              <>
                <div className="rp-msg-err">
                  <span>⚠</span>
                  <span>Link reset tidak valid — token tidak ditemukan di URL. Silakan minta link baru.</span>
                </div>
                <button className="rp-btn-secondary" onClick={() => router.push('/login')}>← Kembali ke Login</button>
              </>
            )}

            {/* SUCCESS */}
            {!tokenMissing && ok && (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ width:64, height:64, background:'#f0fdf4', borderRadius:'50%', display:'flex',
                  alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:28 }}>✅</div>
                <p style={{ fontWeight:700, color:'#1f2937', marginBottom:8 }}>Password Berhasil Direset!</p>
                <p style={{ fontSize:13, color:'#6b7280', marginBottom:20, lineHeight:1.6 }}>
                  Semua session aktif Anda telah di-logout. Silakan login dengan password baru.
                  <br/><span style={{fontSize:11, color:'#9ca3af'}}>Redirect ke login dalam 3 detik...</span>
                </p>
                <button className="rp-btn-secondary" onClick={() => router.push('/login')}>Login Sekarang →</button>
              </div>
            )}

            {/* FORM */}
            {!tokenMissing && !ok && (
              <form onSubmit={doReset} noValidate>
                {err && <div className="rp-msg-err"><span>⚠</span><span>{err}</span></div>}

                <div className="rp-group">
                  <label className="rp-label">Password Baru</label>
                  <div className="rp-input-wrap">
                    <input
                      className="rp-input"
                      type={shP ? 'text' : 'password'}
                      placeholder="Min. 8 karakter"
                      value={pw}
                      onChange={e => { setPw(e.target.value); setErr(''); }}
                      disabled={ld}
                      autoComplete="new-password"
                    />
                    <button type="button" className="rp-eye" onClick={() => setShP(!shP)}>
                      {shP ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                  {pw && (
                    <>
                      <div className="rp-strength-bar-wrap">
                        <div className="rp-strength-bar" style={{ width:`${str.pct}%`, background:str.col }} />
                      </div>
                      <div style={{ fontSize:11, color:str.col, marginTop:4 }}>{str.lbl}</div>
                      <ul className="rp-req-list">
                        {([['len','Min. 8 karakter'],['upper','Huruf besar'],['lower','Huruf kecil'],['num','Angka (0-9)'],['sym','Karakter spesial']] as [keyof typeof str.r, string][]).map(([k,l]) => (
                          <li key={k} className={str.r[k] ? 'ok' : ''}>{l}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                <div className="rp-group">
                  <label className="rp-label">Konfirmasi Password</label>
                  <div className="rp-input-wrap">
                    <input
                      className="rp-input"
                      type={shC ? 'text' : 'password'}
                      placeholder="Ulangi password baru"
                      value={pwc}
                      onChange={e => { setPwc(e.target.value); setErr(''); }}
                      disabled={ld}
                      autoComplete="new-password"
                    />
                    <button type="button" className="rp-eye" onClick={() => setShC(!shC)}>
                      {shC ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                  {pwc && (
                    <div style={{ fontSize:11, color: pw===pwc ? '#10b981' : '#ef4444', marginTop:4 }}>
                      {pw===pwc ? '✓ Password cocok' : '✗ Tidak cocok'}
                    </div>
                  )}
                </div>

                <div style={{ padding:'10px 14px', background:'#eff6ff', border:'1px solid #bfdbfe',
                  borderRadius:8, fontSize:12, color:'#1d4ed8', marginBottom:14, display:'flex', gap:8 }}>
                  <span>🔒</span>
                  <span>Setelah reset, semua session aktif akan di-logout — Anda harus login ulang.</span>
                </div>

                <button type="submit" className="rp-btn-primary" disabled={ld}>
                  {ld ? <><Loader2 size={16} className="animate-spin"/>Memproses...</> : '🔐 Reset Password'}
                </button>
                <button type="button" className="rp-btn-secondary" onClick={() => router.push('/login')}>
                  ← Kembali ke Login
                </button>
              </form>
            )}
          </div>
          <div className="rp-footer">
            🔒 {APP_INSTANSI_SHORT} © {new Date().getFullYear()} · {APP_NAME} v2.0
          </div>
        </div>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
        background:'linear-gradient(135deg,#14532d 0%,#15803d 40%,#16a34a 100%)', color:'#fff' }}>
        <Loader2 size={32} className="animate-spin"/>
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  );
}
