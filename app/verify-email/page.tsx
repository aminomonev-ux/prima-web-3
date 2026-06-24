'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Derived initial: kalau token kosong → langsung 'error' tanpa sync setState di effect.
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'confirm' | 'loading' | 'ok' | 'error'>(() => token ? 'confirm' : 'error');
  const [message, setMessage] = useState(() => token ? '' : 'Token tidak ditemukan.');

  // V5-AUTH-02: token dikonsumsi via POST saat user klik (bukan auto-GET) —
  // cegah email-prefetch/AV-scanner mengaktivasi token tanpa aksi sadar user.
  const doVerify = async () => {
    if (!token) return;
    setStatus('loading');
    try {
      const r = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      setStatus(d.ok ? 'ok' : 'error');
      setMessage(d.message || (d.ok ? 'Berhasil!' : 'Gagal.'));
    } catch {
      setStatus('error');
      setMessage('Gagal terhubung ke server.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(150deg,#052e16 0%,#0d7a3a 55%,#166534 100%)',
      fontFamily: 'sans-serif', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '40px 36px', maxWidth: 440, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.32)', textAlign: 'center',
      }}>
        {status === 'confirm' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
            <p style={{ fontWeight: 800, fontSize: 20, color: '#1f2937', marginBottom: 8 }}>Verifikasi Email</p>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>Klik tombol di bawah untuk mengaktifkan akun Anda.</p>
            <button
              onClick={doVerify}
              style={{
                padding: '12px 28px', background: 'linear-gradient(135deg,#0d7a3a,#15803d)',
                color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Verifikasi Email
            </button>
          </>
        )}
        {status === 'loading' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <p style={{ fontWeight: 700, fontSize: 18, color: '#1f2937' }}>Memverifikasi...</p>
            <p style={{ color: '#6b7280', fontSize: 14 }}>Mohon tunggu sebentar.</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <p style={{ fontWeight: 800, fontSize: 20, color: '#1f2937', marginBottom: 8 }}>Email Terverifikasi!</p>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>{message}</p>
            <button
              onClick={() => router.push('/login')}
              style={{
                padding: '12px 28px', background: 'linear-gradient(135deg,#0d7a3a,#15803d)',
                color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Ke Halaman Login
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
            <p style={{ fontWeight: 800, fontSize: 20, color: '#1f2937', marginBottom: 8 }}>Verifikasi Gagal</p>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>{message}</p>
            <button
              onClick={() => router.push('/login')}
              style={{
                padding: '12px 28px', background: '#fff', color: '#0d7a3a',
                border: '1.5px solid #0d7a3a', borderRadius: 10, fontWeight: 600,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              Kembali ke Login
            </button>
          </>
        )}
        <p style={{ marginTop: 24, fontSize: 11, color: '#9ca3af' }}>
          🔒 PRIMA — RSJD Dr. Amino Gondohutomo
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
