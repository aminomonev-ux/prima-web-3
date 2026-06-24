'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff, ArrowLeft, KeyRound, CheckCircle2 } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

function checkStrength(p: string) {
  const r = { len: p.length >= 8, upper: /[A-Z]/.test(p), lower: /[a-z]/.test(p), num: /[0-9]/.test(p), sym: /[^A-Za-z0-9]/.test(p) };
  const s = Object.values(r).filter(Boolean).length;
  return { r, s, lbl: ['','Sangat Lemah','Lemah','Cukup','Kuat','Sangat Kuat'][s]??'', col: ['#e5e7eb','#ef4444','#f97316','#eab308','#22c55e','#10b981'][s]??'#e5e7eb', pct: s*20 };
}

export default function ProfilPage() {
  const router = useRouter();
  const [pwLama,  setPwLama]  = useState('');
  const [pwBaru,  setPwBaru]  = useState('');
  const [pwKonf,  setPwKonf]  = useState('');
  const [shLama,  setShLama]  = useState(false);
  const [shBaru,  setShBaru]  = useState(false);
  const [shKonf,  setShKonf]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState('');
  const [success, setSuccess] = useState(false);
  const str = checkStrength(pwBaru);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    if (!pwLama) { setErr('Password lama wajib diisi'); return; }
    if (str.s < 3) { setErr('Password baru terlalu lemah (min. Cukup)'); return; }
    if (pwBaru !== pwKonf) { setErr('Konfirmasi password tidak cocok'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passwordLama: pwLama, passwordBaru: pwBaru, konfirmasi: pwKonf }) });
      const data = await res.json();
      if (!data.ok) { setErr(data.message || 'Gagal mengubah password'); return; }
      setSuccess(true); setPwLama(''); setPwBaru(''); setPwKonf('');
    } catch { setErr('Gagal terhubung ke server.'); }
    finally { setLoading(false); }
  }

  return (
    <>
      <style>{`
        .profil-body {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          padding: 16px; background: #e8f5ee;
          background-image: linear-gradient(rgba(13,122,58,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(13,122,58,0.018) 1px, transparent 1px);
          background-size: 48px 48px;
          font-family: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
        }
        .profil-card {
          width: 100%; max-width: 420px;
          background: rgba(255,255,255,0.97); backdrop-filter: blur(12px);
          border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.12);
        }
        .profil-panel { padding: 28px 32px 32px; }
        .form-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-input {
          width: 100%; padding: 11px 14px; border: 1.5px solid #e5e7eb;
          border-radius: 10px; font-size: 14px; color: #1f2937; background: #fff;
          outline: none; transition: border-color .2s, box-shadow .2s; font-family: inherit;
        }
        .form-input:focus { border-color: #0d7a3a; box-shadow: 0 0 0 3px rgba(13,122,58,0.12); }
        .form-group { margin-bottom: 16px; }
        .input-wrapper { position: relative; }
        .input-wrapper .form-input { padding-right: 44px; }
        .eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #9ca3af; display: flex; align-items: center; padding: 4px; transition: color .2s; }
        .eye-btn:hover { color: #0d7a3a; }
        .btn-primary {
          width: 100%; padding: 12px; background: linear-gradient(135deg,#0d7a3a,#0a9e6a);
          color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          gap: 8px; transition: opacity .2s, transform .1s; font-family: inherit;
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-back { background: none; border: none; cursor: pointer; color: #0d7a3a; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 5px; padding: 0 0 20px; font-family: inherit; }
        .btn-back:hover { text-decoration: underline; }
        .msg-err { padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 14px; display: flex; align-items: flex-start; gap: 8px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .strength-bar-wrap { height: 5px; background: #e5e7eb; border-radius: 99px; margin-top: 8px; overflow: hidden; }
        .strength-bar { height: 100%; border-radius: 99px; transition: width .3s, background .3s; }
        .strength-label { font-size: 11px; margin-top: 4px; }
        .req-list { list-style: none; padding: 0; margin: 8px 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
        .req-list li { font-size: 11px; color: #9ca3af; display: flex; align-items: center; gap: 4px; }
        .req-list li.ok { color: #10b981; }
        .req-list li::before { content: "○"; font-size: 10px; }
        .req-list li.ok::before { content: "●"; }
        .card-footer { text-align: center; padding: 10px 32px 14px; border-top: 1px solid #f3f4f6; font-size: 11px; color: #d1d5db; border-radius: 0 0 20px 20px; background: #fafafa; }
      `}</style>

      <div className="profil-body">
        <div className="profil-card">
          <div className="profil-panel">
            <button className="btn-back" onClick={() => router.push('/menu')}>
              <ArrowLeft size={14} /> Kembali ke Menu
            </button>

            {success ? (
              /* ── Sukses ── */
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 64, height: 64, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle2 size={32} color="#16a34a" />
                </div>
                <p style={{ fontWeight: 700, fontSize: 16, color: '#0a2e18', marginBottom: 8 }}>Password Berhasil Diperbarui!</p>
                <p style={{ fontSize: 13, color: '#4b7a5a', marginBottom: 20 }}>Gunakan password baru Anda saat login berikutnya.</p>
                <button className="btn-primary" onClick={() => { setSuccess(false); }}>
                  Ganti Password Lagi
                </button>
              </div>
            ) : (
              /* ── Form ── */
              <>
                <div style={{ textAlign: 'center', marginBottom: 22 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg,#0d7a3a,#0a9e6a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <KeyRound size={24} color="white" />
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#1f2937', margin: 0 }}>Ganti Password</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>Buat password baru yang kuat untuk akun Anda</p>
                </div>

                {err && <div className="msg-err"><span>⚠</span><span>{err}</span></div>}

                <form onSubmit={handleSubmit} noValidate>
                  {/* Password Lama */}
                  <div className="form-group">
                    <label className="form-label">Password Lama</label>
                    <div className="input-wrapper">
                      <input className="form-input" type={shLama ? 'text' : 'password'} placeholder="Masukkan password lama" autoComplete="current-password"
                        value={pwLama} onChange={e => { setPwLama(e.target.value); setErr(''); }} disabled={loading} />
                      <button type="button" className="eye-btn" tabIndex={-1} onClick={() => setShLama(!shLama)}>
                        {shLama ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Password Baru */}
                  <div className="form-group">
                    <label className="form-label">Password Baru</label>
                    <div className="input-wrapper">
                      <input className="form-input" type={shBaru ? 'text' : 'password'} placeholder="Buat password baru" autoComplete="new-password"
                        value={pwBaru} onChange={e => { setPwBaru(e.target.value); setErr(''); }} disabled={loading} />
                      <button type="button" className="eye-btn" tabIndex={-1} onClick={() => setShBaru(!shBaru)}>
                        {shBaru ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {pwBaru && (
                      <>
                        <div className="strength-bar-wrap"><div className="strength-bar" style={{ width: `${str.pct}%`, background: str.col }} /></div>
                        <div className="strength-label" style={{ color: str.col }}>{str.lbl}</div>
                        <ul className="req-list">
                          {([['len','Min. 8 karakter'],['upper','Huruf besar (A-Z)'],['lower','Huruf kecil (a-z)'],['num','Angka (0-9)'],['sym','Karakter spesial (!@#...)']] as [keyof typeof str.r, string][]).map(([k,l]) => (
                            <li key={k} className={str.r[k] ? 'ok' : ''}>{l}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  {/* Konfirmasi */}
                  <div className="form-group">
                    <label className="form-label">Konfirmasi Password Baru</label>
                    <div className="input-wrapper">
                      <input className="form-input" type={shKonf ? 'text' : 'password'} placeholder="Ulangi password baru" autoComplete="new-password"
                        value={pwKonf} onChange={e => { setPwKonf(e.target.value); setErr(''); }} disabled={loading} />
                      <button type="button" className="eye-btn" tabIndex={-1} onClick={() => setShKonf(!shKonf)}>
                        {shKonf ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {pwKonf && <div className="strength-label" style={{ color: pwBaru === pwKonf ? '#10b981' : '#ef4444' }}>
                      {pwBaru === pwKonf ? '✓ Password cocok' : '✗ Tidak cocok'}
                    </div>}
                  </div>

                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? <><Loader2 size={16} className="animate-spin" />Menyimpan...</> : <><KeyRound size={16} />Simpan Password Baru</>}
                  </button>
                </form>
              </>
            )}
          </div>
          <div className="card-footer">🔒 {APP_NAME} · Ganti Password</div>
        </div>
      </div>
    </>
  );
}
