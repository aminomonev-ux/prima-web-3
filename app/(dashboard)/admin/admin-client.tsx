'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Monitor, Shield, Activity, Users, Server,
  Radio, Search, Mail, LogOut,
  Power, ChevronDown, ShieldCheck, MessageSquareWarning, ListChecks, Menu, Stethoscope,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import ThemeToggle from '@/components/ui/ThemeToggle';
import type { Role } from '@/types';
import { PromotionRequestsPanel } from './_panels/PromotionRequestsPanel';
import { RimaFeedbackPanel } from './_panels/RimaFeedbackPanel';
import { MenuAccessRoleTab } from './_panels/MenuAccessPanel';
import { TabSessions } from './_panels/TabSessions';
import { TabAppControl } from './_panels/TabAppControl';
import { TabAttackMonitor } from './_panels/TabAttackMonitor';
import { TabUserMgmt } from './_panels/TabUserMgmt';
import { TabSecurityStatus } from './_panels/TabSecurityStatus';
import { TabBroadcast } from './_panels/TabBroadcast';
import { TabAuditTrail } from './_panels/TabAuditTrail';
import { TabEmailNotif } from './_panels/TabEmailNotif';
import { TabPemeriksaan } from './_panels/TabPemeriksaan';
import { fetchJson } from '@/lib/shared/api';
import type { Temuan } from '@/lib/admin/pemeriksaan';
import './admin.css';

interface Props { userId: number; username: string; role: Role; sessionId: string; themePreference: 'dark' | 'light'; }

type Tab = 'sessions'|'app-control'|'attack-monitor'|'user-mgmt'|'menu-access'|'security-status'|'broadcast'|'audit-trail'|'email-notif'|'promotion'|'rima-feedback'|'pemeriksaan';



export default function AdminClient({ userId, username, role, sessionId, themePreference }: Props) {
  void userId;
  const router    = useRouter();
  const isSA      = role === 'SUPER_ADMIN';
  const [tab, setTab]           = useState<Tab>('sessions');
  const [loggingOut, setOut]    = useState(false);
  const [dropOpen, setDrop]     = useState(false);
  // Hanya berarti di bawah 720px, tempat rel berubah jadi laci. Di lebar lain kelasnya
  // tidak dipakai CSS mana pun, jadi tidak perlu dijaga per ukuran layar.
  const [railOpen, setRail]     = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference);
  void currentTheme; // theme dipakai ThemeToggle setter saja, tidak untuk render.
  const dropRef = useRef<HTMLDivElement>(null);

  // P10 — datanya dipegang di sini, bukan di dalam tabnya, karena lencana angka di rel
  // harus menyala tanpa tabnya pernah dibuka. Itu seluruh alasan §16.3 memindahkan
  // tab mendatar jadi rel: sesuatu yang menunggu tidak boleh cuma diketahui oleh yang
  // kebetulan mengklik.
  const [temuan, setTemuan]     = useState<Temuan[]>([]);
  const [pmLoad, setPmLoad]     = useState(false);
  const [pmJam, setPmJam]       = useState('');
  const [pmErr, setPmErr]       = useState('');

  const muatPemeriksaan = useCallback(async () => {
    setPmLoad(true); setPmErr('');
    const j = await fetchJson('/api/admin/pemeriksaan') as { ok: boolean; data?: Temuan[]; message?: string };
    setPmLoad(false);
    if (j.ok && j.data) {
      setTemuan(j.data);
      // Jam distempel saat balasan tiba, bukan saat tombol ditekan — ia menyatakan
      // "angka ini dari jam berapa", bukan "saya menekan jam berapa".
      setPmJam(new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}));
    } else {
      setPmErr(j.message ?? 'Gagal memuat pemeriksaan.');
    }
  }, []);

  // Pemuatan awal. `muatPemeriksaan` menyalakan penanda sibuk sebelum `await` — dan itu
  // memang yang dibutuhkan tombol Periksa Ulang yang memanggil fungsi yang sama. Pola
  // muat-awal yang sama dipakai seluruh panel di folder ini.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isSA) void muatPemeriksaan(); }, [isSA, muatPemeriksaan]);

  const perluDilihat = temuan.filter(t => t.keparahan !== 'aman').length;

  // Apply theme dari DB ke <html> + sync cookie. Selaras menu-client.tsx —
  // cegah Admin Panel pakai cookie stale (mis. light) saat DB preference dark.
  useEffect(() => {
    if (themePreference === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.cookie = `prima_theme=${themePreference};path=/;max-age=31536000;SameSite=Lax`;
  }, [themePreference]);

  useEffect(() => {
    if (!dropOpen) return;
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [dropOpen]);

  // Escape menutup laci. Ia menutupi seluruh layar di lebar ponsel, jadi tanpa ini
  // satu-satunya jalan keluar adalah menemukan tirainya — preseden yang sama dengan
  // modal Riwayat Simpan BLUD, yang juga baru ketahuan waktu dicoba, bukan dibaca.
  useEffect(() => {
    if (!railOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setRail(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [railOpen]);

  async function handleLogout() {
    setOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  const initial   = username.charAt(0).toUpperCase();
  const roleLabel = ROLE_LABELS[role] ?? role;

  /**
   * R2 — sebelas tujuan yang sama, dikelompokkan empat. Yang berubah cuma WADAH-nya:
   * `id` tiap tujuan tidak disentuh, dan isi tabnya tidak dibuka sama sekali. Kalau
   * ada yang rusak sesudah commit ini, penyebabnya hanya bisa satu hal.
   *
   * Kelompoknya mengikuti maket (§16.3). Tiga tujuan yang di maket bernama Pusat
   * Akses / Tinjauan / Pemeriksaan belum ada di sini — layarnya memang belum lahir
   * (Tahap 4 & 5), dan menaruh nama untuk layar yang belum ada cuma menjanjikan
   * sesuatu yang tidak bisa dibuka.
   */
  const GRUP: { judul: string; items: { id: Tab; label: string; icon: React.ReactNode; lencana?: number }[] }[] = [
    { judul: 'Akun & Akses', items: [
      { id:'user-mgmt',      label:'Pengguna',    icon:<Users size={15}/> },
      { id:'menu-access',    label:'Akses Menu',  icon:<ListChecks size={15}/> },
      { id:'promotion',      label:'Permintaan',  icon:<ShieldCheck size={15}/> },
    ]},
    { judul: 'Aplikasi', items: [
      { id:'app-control',    label:'Sakelar',     icon:<Power size={15}/> },
    ]},
    { judul: 'Keamanan', items: [
      { id:'sessions',       label:'Sesi Aktif',  icon:<Monitor size={15}/> },
      { id:'attack-monitor', label:'Monitor',     icon:<Activity size={15}/> },
      { id:'security-status',label:'Status',      icon:<Shield size={15}/> },
      { id:'audit-trail',    label:'Jejak Audit', icon:<Search size={15}/> },
    ]},
    { judul: 'Sistem', items: [
      ...(isSA ? [{ id:'pemeriksaan' as Tab, label:'Pemeriksaan', icon:<Stethoscope size={15}/>, lencana: perluDilihat }] : []),
      { id:'broadcast',      label:'Broadcast',   icon:<Radio size={15}/> },
      { id:'email-notif',    label:'Email',       icon:<Mail size={15}/> },
      { id:'rima-feedback',  label:'RIMA',        icon:<MessageSquareWarning size={15}/> },
    ]},
  ];

  return (
    <div className="ap-body">
      <header className="ap-top">
        <button
          className="ap-menu-btn"
          type="button"
          aria-label={railOpen ? 'Tutup daftar bagian' : 'Buka daftar bagian'}
          aria-expanded={railOpen}
          onClick={()=>setRail(!railOpen)}
        >
          <Menu size={16}/>
        </button>
        <div className="ap-brand">
          <div className="ap-brand-icon"><Shield size={16}/></div>
          <div className="ap-brand-title">PRIMA · Pusat Kendali</div>
        </div>
        <AdminClock/>
        <div className="ap-top-kanan">
          <ThemeToggle initialTheme={themePreference} onThemeChange={setCurrentTheme} />
          <div style={{position:'relative'}} ref={dropRef}>
            <div className="ap-user" onClick={()=>setDrop(!dropOpen)}>
              <div className="ap-avatar">{initial}</div>
              <div style={{minWidth:0}}>
                <div className="ap-uname">{username}</div>
                <div className="ap-urole">{roleLabel.toUpperCase()}</div>
              </div>
              <ChevronDown size={13} className={`ap-chevron${dropOpen?' open':''}`}/>
            </div>
            {dropOpen && (
              <div className="ap-dropdown">
                <button className="ap-ddi" onClick={()=>{setDrop(false);router.push('/menu');}}>
                  <Server size={13}/> Menu Utama
                </button>
                <div style={{height:1,background:'var(--ap-line)',margin:'4px 0'}}/>
                <button className="ap-ddi danger" onClick={handleLogout} disabled={loggingOut}>
                  <LogOut size={13}/> {loggingOut?'Keluar...':'Keluar'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="ap-shell">
        {/* Tirai hanya lahir saat laci terbuka — di lebar layar lain `.ap-menu-btn`
            tersembunyi, jadi `railOpen` tidak pernah menyala. */}
        {railOpen && (
          <button className="ap-tirai-rail" type="button" aria-label="Tutup daftar bagian" onClick={()=>setRail(false)}/>
        )}
        <nav className={`ap-rail${railOpen?' buka':''}`} aria-label="Bagian Pusat Kendali">
          {GRUP.map(g => (
            <div key={g.judul}>
              <div className="ap-rg-t">{g.judul}</div>
              <div className="ap-rg">
                {g.items.map(t => (
                  <button
                    key={t.id}
                    className={`ap-ri${tab===t.id?' active':''}`}
                    type="button"
                    aria-current={tab===t.id ? 'page' : undefined}
                    onClick={()=>{setTab(t.id);setRail(false);}}
                  >
                    {t.icon}<span className="ap-lbl">{t.label}</span>
                    {t.lencana ? <span className="ap-ri-lencana">{t.lencana}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <main className="ap-content">
        {tab === 'sessions'        && <TabSessions     selfSessionId={sessionId} isSA={isSA}/>}
        {tab === 'app-control'     && <TabAppControl   isSA={isSA}/>}
        {tab === 'attack-monitor'  && <TabAttackMonitor/>}
        {tab === 'user-mgmt'       && <TabUserMgmt     isSA={isSA}/>}
        {tab === 'menu-access'     && <MenuAccessRoleTab isSA={isSA}/>}
        {tab === 'security-status' && <TabSecurityStatus/>}
        {tab === 'broadcast'       && <TabBroadcast/>}
        {tab === 'audit-trail'     && <TabAuditTrail/>}
        {tab === 'email-notif'     && <TabEmailNotif   isSA={isSA}/>}
        {tab === 'promotion'       && isSA && <PromotionRequestsPanel/>}
        {tab === 'promotion'       && !isSA && <div style={{padding:24,color:'var(--ap-dim)'}}>Hanya SUPER_ADMIN.</div>}
        {tab === 'rima-feedback'   && <RimaFeedbackPanel/>}
        {tab === 'pemeriksaan'     && isSA && (
          <TabPemeriksaan temuan={temuan} loading={pmLoad} jam={pmJam} err={pmErr} onMuat={()=>void muatPemeriksaan()}/>
        )}
        </main>
      </div>
    </div>
  );
}

function AdminClock() {
  const [t, setT] = useState('');
  useEffect(()=>{
    const tick = ()=>setT(new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}));
    tick(); const id=setInterval(tick,1000); return ()=>clearInterval(id);
  },[]);
  return <div className="ap-clock">{t}</div>;
}

