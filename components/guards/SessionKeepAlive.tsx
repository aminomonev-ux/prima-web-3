'use client';
// SessionKeepAlive — activity-aware keepalive + idle warning + auto-redirect
//
// 1. Ping `/api/auth/keepalive` tiap 10 menit kalau user aktif.
// 2. Listen activity (mouse/keyboard/scroll/touch) — idle counter reset saat aktif.
// 3. 5 menit sebelum idle-timeout: modal warning "Sesi akan habis, mau lanjut?".
//    Saat warning showing, activity listener TIDAK reset idle (cegah accidental extend).
// 4. Idle ≥ 60 menit ATAU keepalive return 401 ATAU user klik Logout: redirect /login?reason=expired.
// 5. visibilitychange (tab kembali fokus): immediate ping cek — kalau 401 langsung redirect.

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import PrimaButton from '@/components/ui/PrimaButton';

const PING_INTERVAL_MS  = 10 * 60 * 1000;
const IDLE_TIMEOUT_MS   = 60 * 60 * 1000;
const WARNING_LEAD_MS   = 5  * 60 * 1000;
const TICK_INTERVAL_MS  = 1000;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export default function SessionKeepAlive() {
  const router            = useRouter();
  const lastActivityRef   = useRef<number>(0);
  const warningShownRef   = useRef<boolean>(false);
  const tickIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef           = useRef<boolean>(false);
  const redirectedRef     = useRef<boolean>(false);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_LEAD_MS / 1000);
  const [busy,        setBusy]        = useState(false);

  const redirectExpired = useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    router.replace('/login?reason=expired');
  }, [router]);

  const ping = useCallback(async () => {
    if (redirectedRef.current) return false;
    try {
      const r = await fetch('/api/auth/keepalive', { method: 'POST' });
      if (redirectedRef.current) return false;
      if (r.status === 401) {
        redirectExpired();
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }, [redirectExpired]);

  const handleLanjut = useCallback(async () => {
    if (busyRef.current || redirectedRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      lastActivityRef.current = Date.now();
      warningShownRef.current = false;
      setShowWarning(false);
      await ping();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [ping]);

  const handleLogout = useCallback(async () => {
    if (busyRef.current || redirectedRef.current) return;
    busyRef.current     = true;
    redirectedRef.current = true;
    setBusy(true);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    lastActivityRef.current = Date.now();

    const onActivity = () => {
      if (!warningShownRef.current) {
        lastActivityRef.current = Date.now();
      }
    };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisibility);

    tickIntervalRef.current = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= IDLE_TIMEOUT_MS) {
        redirectExpired();
        return;
      }
      if (idleMs >= IDLE_TIMEOUT_MS - WARNING_LEAD_MS) {
        if (!warningShownRef.current) {
          warningShownRef.current = true;
          setShowWarning(true);
        }
        setSecondsLeft(Math.max(0, Math.ceil((IDLE_TIMEOUT_MS - idleMs) / 1000)));
      } else if (warningShownRef.current) {
        warningShownRef.current = false;
        setShowWarning(false);
      }
    }, TICK_INTERVAL_MS);

    pingIntervalRef.current = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs < IDLE_TIMEOUT_MS) void ping();
    }, PING_INTERVAL_MS);

    void ping();

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [ping, redirectExpired]);

  if (!showWarning) return null;
  if (typeof window === 'undefined') return null;

  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const countdown = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ska-title"
      style={{
        position:'fixed', inset:0, zIndex:9999,
        background:'rgba(2,15,28,.78)', backdropFilter:'blur(6px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:24,
      }}
    >
      <div style={{
        background:'#042C53', border:'1px solid rgba(250,199,117,.35)', borderRadius:14,
        padding:'24px 26px', maxWidth:460, width:'100%',
        boxShadow:'0 28px 60px rgba(0,0,0,.6), 0 0 32px rgba(250,199,117,.10)',
        fontFamily:'Inter, sans-serif',
      }}>
        <div id="ska-title" style={{
          display:'flex', alignItems:'center', gap:10, marginBottom:14,
          fontSize:15, fontWeight:700, color:'#FAC775', letterSpacing:.3,
        }}>
          <span style={{fontSize:20}}>⚠</span>
          <span>Sesi Akan Berakhir</span>
        </div>

        <p style={{
          margin:'0 0 16px', fontSize:13, lineHeight:1.55, color:'#E6F1FB',
        }}>
          Sesi anda akan berakhir karena tidak ada aktivitas. Klik <b style={{color:'#FAC775'}}>Lanjut Sesi</b> untuk
          tetap melanjutkan, atau <b>Logout</b> sekarang.
        </p>

        <div style={{
          background:'rgba(250,199,117,.08)', border:'1px solid rgba(250,199,117,.25)',
          borderRadius:8, padding:'12px 16px', marginBottom:18, textAlign:'center',
        }}>
          <div style={{fontSize:10, color:'#A0CFE0', letterSpacing:1, marginBottom:4}}>SISA WAKTU</div>
          <div style={{
            fontSize:28, fontWeight:700, color:'#FAC775',
            fontFamily:"'JetBrains Mono', monospace", letterSpacing:1,
          }}>
            {countdown}
          </div>
        </div>

        <div style={{display:'flex', justifyContent:'flex-end', gap:10}}>
          <PrimaButton variant="ghost" onClick={handleLogout} disabled={busy}>
            {busy ? 'Memproses…' : 'Logout Sekarang'}
          </PrimaButton>
          <PrimaButton variant="primary" onClick={handleLanjut} disabled={busy}>
            {busy ? 'Memproses…' : 'Lanjut Sesi'}
          </PrimaButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
