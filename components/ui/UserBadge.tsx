'use client';
// UserBadge — shared avatar+nama+role pill dengan dropdown (Ganti Password / Keluar).
// Mengangkat pola kinerja-user-badge jadi komponen reusable. Token ikut DESIGN-SYSTEM.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ShieldCheck, LogOut } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';

interface Props {
  username: string;
  role: string;
  isLight: boolean;
}

export default function UserBadge({ username, role, isLight }: Props) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await fetchJson('/api/auth/logout', { method: 'POST' }); } catch { /* tetap redirect */ }
    window.location.href = '/login';
  }

  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(p => !p)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px 5px 5px', borderRadius: 40, border: `1.5px solid ${isLight ? 'rgba(139,92,246,0.25)' : 'rgba(239,159,39,.2)'}`, background: isLight ? 'rgba(139,92,246,0.05)' : 'rgba(239,159,39,.05)', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#633806,#EF9F27)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#020F1C', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: isLight ? '#0F0F12' : '#E6F1FB' }}>{username}</div>
          <div style={{ fontSize: 10, color: isLight ? '#6B7280' : '#85B7EB' }}>{role}</div>
        </div>
        <ChevronDown size={13} color={isLight ? '#6B7280' : '#85B7EB'} style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 190, background: isLight ? 'rgba(255,255,255,0.98)' : 'rgba(4,44,83,.98)', backdropFilter: 'blur(20px)', borderRadius: 12, border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : '#0C447C'}`, boxShadow: isLight ? '0 16px 48px rgba(0,0,0,.15)' : '0 16px 48px rgba(0,0,0,.5)', overflow: 'hidden', zIndex: 300 }}>
          <button onClick={() => { setOpen(false); window.location.href = '/profil'; }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 13, fontWeight: 500, color: isLight ? '#374151' : '#B5D4F4', cursor: 'pointer', border: 'none', background: 'none', width: '100%', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,.04)' : 'rgba(255,255,255,.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <ShieldCheck size={14} /> Ganti Password
          </button>
          <div style={{ height: 1, background: isLight ? 'rgba(0,0,0,0.08)' : '#0C447C' }} />
          <button onClick={handleLogout} disabled={loggingOut}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', fontSize: 13, fontWeight: 500, color: isLight ? '#DC2626' : '#FCA5A5', cursor: 'pointer', border: 'none', background: 'none', width: '100%', textAlign: 'left', opacity: loggingOut ? .6 : 1 }}
            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(226,75,74,.08)' : 'rgba(226,75,74,.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <LogOut size={14} /> {loggingOut ? 'Keluar...' : 'Keluar'}
          </button>
        </div>
      )}
    </div>
  );
}
