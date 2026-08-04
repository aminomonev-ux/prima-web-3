'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Monitor, Shield, Activity, Users, Server,
  Radio, Search, Mail, LogOut,
  Power, ChevronDown, ShieldCheck, MessageSquareWarning, ListChecks,
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
import './admin.css';

interface Props { userId: number; username: string; role: Role; sessionId: string; themePreference: 'dark' | 'light'; }

type Tab = 'sessions'|'app-control'|'attack-monitor'|'user-mgmt'|'menu-access'|'security-status'|'broadcast'|'audit-trail'|'email-notif'|'promotion'|'rima-feedback';



export default function AdminClient({ userId, username, role, sessionId, themePreference }: Props) {
  void userId;
  const router    = useRouter();
  const isSA      = role === 'SUPER_ADMIN';
  const [tab, setTab]           = useState<Tab>('sessions');
  const [loggingOut, setOut]    = useState(false);
  const [dropOpen, setDrop]     = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference);
  void currentTheme; // theme dipakai ThemeToggle setter saja, tidak untuk render.
  const dropRef = useRef<HTMLDivElement>(null);

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

  async function handleLogout() {
    setOut(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  const initial   = username.charAt(0).toUpperCase();
  const roleLabel = ROLE_LABELS[role] ?? role;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id:'sessions',       label:'ACTIVE SESSIONS',  icon:<Monitor size={13}/> },
    { id:'app-control',    label:'APP CONTROL',       icon:<Power size={13}/> },
    { id:'attack-monitor', label:'ATTACK MONITOR',    icon:<Activity size={13}/> },
    { id:'user-mgmt',      label:'USER MANAGEMENT',   icon:<Users size={13}/> },
    { id:'menu-access',    label:'AKSES MENU',        icon:<ListChecks size={13}/> },
    { id:'security-status',label:'SECURITY STATUS',   icon:<Shield size={13}/> },
    { id:'broadcast',      label:'BROADCAST',         icon:<Radio size={13}/> },
    { id:'audit-trail',    label:'AUDIT TRAIL',        icon:<Search size={13}/> },
    { id:'email-notif',    label:'EMAIL NOTIF',        icon:<Mail size={13}/> },
    { id:'promotion',      label:'PROMOTION REQ',     icon:<ShieldCheck size={13}/> },
    { id:'rima-feedback',  label:'RIMA FEEDBACK',     icon:<MessageSquareWarning size={13}/> },
  ];

  return (
    <div className="ap-body">
      <header className="ap-header">
        <div className="ap-brand">
          <div className="ap-brand-icon"><Shield size={19}/></div>
          <div>
            <div className="ap-brand-title">PRIMA CONTROL CENTER</div>
            <div className="ap-brand-sub">Program Realisasi Informasi Monitoring Anggaran &nbsp;|&nbsp; RSJD DR. AMINO GONDOHUTOMO — ADMIN PANEL v2.0</div>
          </div>
        </div>
        <AdminClock/>
        {/* Theme toggle */}
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
              <div style={{height:1,background:'rgba(0,212,255,.1)',margin:'4px 0'}}/>
              <button className="ap-ddi danger" onClick={handleLogout} disabled={loggingOut}>
                <LogOut size={13}/> {loggingOut?'Keluar...':'Keluar'}
              </button>
            </div>
          )}
        </div>
      </header>

      <nav className="ap-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`ap-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
            {t.icon}{t.label}
          </button>
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
        {tab === 'promotion'       && !isSA && <div style={{padding:24,color:'#85B7EB'}}>Hanya SUPER_ADMIN.</div>}
        {tab === 'rima-feedback'   && <RimaFeedbackPanel/>}
      </main>
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

