'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Monitor, Shield, Activity, Users, Server,
  Radio, Search, FileText, Mail, LogOut,
  RefreshCw, AlertTriangle, ChevronLeft, ChevronRight,
  Trash2, Power, ChevronDown, X, Send,
  ShieldCheck, Unlock, Undo2, MessageSquareWarning,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';
import { fetchJson } from '@/lib/shared/api';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Tip from '@/components/ui/Tip';
import type { Role } from '@/types';
import { PromotionRequestsPanel } from '@/app/(dashboard)/admin/_panels/PromotionRequestsPanel';
import { RimaFeedbackPanel } from '@/app/(dashboard)/admin/_panels/RimaFeedbackPanel';

interface Props { userId: number; username: string; role: Role; sessionId: string; themePreference: 'dark' | 'light'; }

type Tab = 'sessions'|'app-control'|'attack-monitor'|'user-mgmt'|'security-status'|'broadcast'|'audit-trail'|'email-notif'|'promotion'|'rima-feedback';

interface SessionRow { id:number; session_id:string; user_id:number; username:string; role:string; ip_address:string|null; user_agent:string|null; created_at:string; last_active:string; idle_seconds:number; }
interface UserRow {
  id:number; username:string; nama_lengkap:string|null; email:string; role:string; status:string;
  app_access:string[]|null; created_at:string;
  promotion_locked_until?: string|null;
  probationary_until?: string|null;
  probationary_from_role?: string|null;
}
interface AppStatus { [key:string]: string }
interface ChartSlot { label:string; login:number; failed:number; blocked:number; }
interface AuditRow { id:number; username:string|null; event_type:string; ip_address:string|null; detail:string|null; created_at:string; }
interface BroadcastRow { id:number; recipient:string; pesan:string; created_at:string; }
interface LogRow { id:number; username:string|null; event_type:string; ip_address:string|null; detail:string|null; created_at:string; }


const APP_STATUS_LABELS: Record<string,string> = {
  app_status_dashboard:         'Dashboard',
  app_status_usulan_aset:       'Usulan Kebutuhan',
  app_status_blud:              'BLUD',
  app_status_perjanjian_kinerja:'Perjanjian Kinerja',
  app_status_rencana_aksi:      'Renaksi & Kinerja',
  app_status_new_econtrolling:  'E-Anggaran',
  app_status_buku_besar_aset:  'Buku Besar Aset',
  app_status_sentinel_bot:      'RIMA — Seluruh Bot',
  app_status_rima_query:        'RIMA — Tanya Data (Q&A)',
};

const ALL_ROLES = Object.keys(ROLE_LABELS);

const APP_ACCESS_LIST = [
  { id:'dashboard',          name:'Dashboard' },
  { id:'usulan_aset',        name:'Usulan Kebutuhan' },
  { id:'blud',               name:'BLUD' },
  { id:'perjanjian_kinerja', name:'Perjanjian Kinerja' },
  { id:'rencana_aksi',       name:'Renaksi & Kinerja' },
  { id:'new_econtrolling',   name:'E-Anggaran' },
  { id:'buku_besar_aset',    name:'Buku Besar Aset' },
  { id:'lkjip',              name:'LKJIP' },
];

function fmtTs(ts: string) {
  return new Date(ts).toLocaleString('id-ID', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function fmtIdle(sec: number) {
  if (sec < 60)   return `${Math.floor(sec)}d`;
  if (sec < 3600) return `${Math.floor(sec/60)}m`;
  return `${Math.floor(sec/3600)}j`;
}

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
    { id:'security-status',label:'SECURITY STATUS',   icon:<Shield size={13}/> },
    { id:'broadcast',      label:'BROADCAST',         icon:<Radio size={13}/> },
    { id:'audit-trail',    label:'AUDIT TRAIL',        icon:<Search size={13}/> },
    { id:'email-notif',    label:'EMAIL NOTIF',        icon:<Mail size={13}/> },
    { id:'promotion',      label:'PROMOTION REQ',     icon:<ShieldCheck size={13}/> },
    { id:'rima-feedback',  label:'RIMA FEEDBACK',     icon:<MessageSquareWarning size={13}/> },
  ];

  return (
    <>
      <style>{`
        /* N-1: @import Google Fonts dibuang — diblok CSP (style-src/font-src tanpa
           fonts.googleapis/gstatic) & langgar DESIGN-SYSTEM. Pakai font app yg sudah 'self'. */
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes scan{0%{transform:translateY(0)}100%{transform:translateY(100vh)}}
        @keyframes pls{0%,100%{box-shadow:0 0 10px rgba(0,212,255,.5),0 0 3px rgba(0,212,255,.3)}50%{box-shadow:0 0 22px rgba(0,212,255,.9),0 0 8px rgba(0,212,255,.6)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}
        .ap-body{min-height:100vh;background:#020b14;background-image:linear-gradient(rgba(0,212,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,.025) 1px,transparent 1px);background-size:40px 40px;color:#e0f7ff;font-family:var(--font-jakarta),sans-serif;position:relative;overflow-x:hidden;}
        .ap-body::before{content:'';position:fixed;top:-100vh;left:0;right:0;height:200vh;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 4px);pointer-events:none;z-index:0;animation:scan 12s linear infinite;}
        .ap-header{position:sticky;top:0;z-index:100;background:linear-gradient(135deg,rgba(0,212,255,.07),rgba(0,255,200,.04)),rgba(2,11,20,0.96);backdrop-filter:blur(14px);border-bottom:1px solid rgba(0,212,255,0.2);padding:0 24px;height:76px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 0 40px rgba(0,212,255,.08);}
        .ap-brand{display:flex;align-items:center;gap:14px;border:1px solid rgba(0,212,255,.55);border-radius:12px;padding:12px 20px 12px 12px;background:rgba(0,212,255,.06);box-shadow:0 0 20px rgba(0,212,255,.12),inset 0 0 20px rgba(0,212,255,.03);}
        .ap-brand-icon{width:42px;height:42px;border-radius:10px;border:1px solid rgba(0,212,255,.6);display:flex;align-items:center;justify-content:center;color:#00d4ff;background:rgba(0,212,255,.08);animation:pls 2.5s ease-in-out infinite;flex-shrink:0;}
        .ap-brand-title{font-size:17px;font-weight:800;color:#e0f7ff;letter-spacing:2.5px;font-family:var(--font-jakarta),sans-serif;text-shadow:0 0 20px rgba(0,212,255,.5);}
        .ap-brand-sub{font-size:9px;color:#5a8ea8;letter-spacing:1px;margin-top:4px;font-family:'JetBrains Mono',monospace;}
        .ap-clock{font-size:22px;font-weight:400;color:#00d4ff;letter-spacing:3px;font-family:'JetBrains Mono',monospace;text-shadow:0 0 12px rgba(0,212,255,.4);}
        .ap-user{display:flex;align-items:center;gap:10px;cursor:pointer;padding:5px 14px 5px 5px;border-radius:10px;border:1px solid rgba(0,212,255,.3);background:rgba(0,212,255,.05);transition:all .2s;user-select:none;}
        .ap-user:hover{border-color:rgba(0,212,255,.65);background:rgba(0,212,255,.1);box-shadow:0 0 14px rgba(0,212,255,.15);}
        .ap-avatar{width:34px;height:34px;border-radius:8px;background:linear-gradient(135deg,#00d4ff,#00ffc8);color:#020b14;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px rgba(0,212,255,.4);font-family:var(--font-jakarta),sans-serif;}
        .ap-uname{font-size:12px;font-weight:700;color:#e0f7ff;letter-spacing:.8px;}
        .ap-urole{font-size:9px;font-weight:700;background:linear-gradient(90deg,#00d4ff,#00ffc8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:.8px;}
        .ap-chevron{transition:transform .2s;color:#00d4ff;flex-shrink:0;}
        .ap-chevron.open{transform:rotate(180deg);}
        .ap-dropdown{position:absolute;top:calc(100%+10px);right:0;width:210px;background:#0a0e14;border:1px solid rgba(0,212,255,.2);border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.6);overflow:hidden;z-index:300;}
        .ap-ddi{display:flex;align-items:center;gap:9px;padding:11px 16px;font-size:12px;color:#a0cfe0;cursor:pointer;border:none;background:none;width:100%;text-align:left;font-family:var(--font-jakarta),sans-serif;transition:background .15s;letter-spacing:.3px;}
        .ap-ddi:hover{background:rgba(0,212,255,.08);color:#00d4ff;}
        .ap-ddi.danger{color:#ff4466;}
        .ap-ddi.danger:hover{background:rgba(255,68,102,.08);}
        .ap-tabs{display:flex;align-items:center;gap:0;padding:0 20px;background:rgba(2,11,20,.92);border-bottom:1px solid rgba(0,212,255,.1);overflow-x:auto;position:relative;z-index:10;}
        .ap-tab{display:flex;align-items:center;gap:6px;padding:13px 15px;font-size:10.5px;font-weight:700;letter-spacing:1.2px;color:#5a8ea8;cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;white-space:nowrap;transition:all .2s;font-family:var(--font-jakarta),sans-serif;}
        .ap-tab:hover{color:#a0cfe0;}
        .ap-tab.active{color:#00d4ff;border-bottom-color:#00d4ff;text-shadow:0 0 8px rgba(0,212,255,.4);}
        .ap-content{padding:24px;max-width:1400px;margin:0 auto;position:relative;z-index:1;}
        .ap-card{background:rgba(7,21,37,.92);border:1px solid rgba(0,212,255,.14);border-radius:10px;padding:20px;position:relative;overflow:hidden;}
        .ap-card::after{content:'';position:absolute;bottom:0;right:0;width:80px;height:80px;background:radial-gradient(circle at bottom right,rgba(0,212,255,.07),transparent 70%);pointer-events:none;}
        .ap-card-title{font-size:10px;font-weight:700;letter-spacing:2px;color:#5a8ea8;margin-bottom:14px;display:flex;align-items:center;gap:8px;text-transform:uppercase;}
        .ap-card-title::before{content:'';display:inline-block;width:3px;height:13px;background:linear-gradient(180deg,#00d4ff,#00ffc8);border-radius:2px;}
        .ap-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}
        .ap-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;}
        .ap-kpi{background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.1);border-radius:8px;padding:16px 18px;position:relative;overflow:hidden;}
        .ap-kpi::after{content:'';position:absolute;top:-20px;right:-20px;width:70px;height:70px;background:radial-gradient(circle,rgba(0,212,255,.08),transparent 70%);pointer-events:none;}
        .ap-kpi-label{font-size:9px;letter-spacing:1.8px;color:#5a8ea8;margin-bottom:8px;text-transform:uppercase;font-family:var(--font-jakarta),sans-serif;}
        .ap-kpi-value{font-size:30px;font-weight:400;font-family:'JetBrains Mono',monospace;}
        .ap-kpi-sub{font-size:10px;color:#5a8ea8;margin-top:4px;}
        .cyan{color:#00d4ff;}
        .green{color:#00ffc8;}
        .yellow{color:#ffcc00;}
        .red{color:#ff4466;}
        .ap-table-wrap{background:rgba(7,21,37,.92);border:1px solid rgba(0,212,255,.12);border-radius:10px;overflow:hidden;}
        .ap-table{width:100%;border-collapse:collapse;font-size:12px;}
        .ap-table thead tr{background:linear-gradient(90deg,rgba(0,212,255,.08),rgba(0,255,200,.04));}
        .ap-table th{padding:11px 14px;text-align:left;font-size:9.5px;font-weight:700;letter-spacing:1.5px;color:#5a8ea8;border-bottom:1px solid rgba(0,212,255,.12);font-family:var(--font-jakarta),sans-serif;}
        .ap-table td{padding:9px 14px;border-bottom:1px solid rgba(0,212,255,.05);color:#a0cfe0;vertical-align:middle;font-family:var(--font-jakarta),sans-serif;}
        .ap-table td.mono{font-family:'JetBrains Mono',monospace;}
        .ap-table tr:hover td{background:rgba(0,212,255,.04);}
        .ap-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.5px;cursor:pointer;border:1px solid;transition:all .2s;font-family:var(--font-jakarta),sans-serif;}
        .ap-btn-cyan{border-color:rgba(0,212,255,.4);color:#00d4ff;background:rgba(0,212,255,.08);}
        .ap-btn-cyan:hover{background:rgba(0,212,255,.15);border-color:#00d4ff;box-shadow:0 0 10px rgba(0,212,255,.2);}
        .ap-btn-red{border-color:rgba(255,68,102,.4);color:#ff4466;background:rgba(255,68,102,.08);}
        .ap-btn-red:hover{background:rgba(255,68,102,.15);border-color:#ff4466;box-shadow:0 0 10px rgba(255,68,102,.2);}
        .ap-btn-green{border-color:rgba(0,255,200,.4);color:#00ffc8;background:rgba(0,255,200,.08);}
        .ap-btn-green:hover{background:rgba(0,255,200,.15);border-color:#00ffc8;box-shadow:0 0 10px rgba(0,255,200,.2);}
        .ap-btn:disabled{opacity:.35;cursor:not-allowed;box-shadow:none;}
        .ap-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.5px;font-family:var(--font-jakarta),sans-serif;}
        .badge-green{background:rgba(0,255,200,.1);color:#00ffc8;border:1px solid rgba(0,255,200,.28);}
        .badge-yellow{background:rgba(255,204,0,.1);color:#ffcc00;border:1px solid rgba(255,204,0,.28);}
        .badge-red{background:rgba(255,68,102,.1);color:#ff4466;border:1px solid rgba(255,68,102,.28);}
        .badge-cyan{background:rgba(0,212,255,.1);color:#00d4ff;border:1px solid rgba(0,212,255,.28);}
        .badge-gray{background:rgba(90,142,168,.1);color:#5a8ea8;border:1px solid rgba(90,142,168,.28);}
        .dot-active{display:inline-block;width:6px;height:6px;border-radius:50%;background:#00ffc8;animation:blink 1.8s ease-in-out infinite;}
        .dot-idle{display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffcc00;}
        .ap-input{background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.2);border-radius:6px;padding:8px 12px;color:#e0f7ff;font-size:12px;font-family:'JetBrains Mono',monospace;outline:none;width:100%;}
        .ap-input:focus{border-color:rgba(0,212,255,.55);background:rgba(0,212,255,.08);}
        .ap-select{background:#071525;border:1px solid rgba(0,212,255,.2);border-radius:6px;padding:8px 12px;color:#a0cfe0;font-size:12px;font-family:var(--font-jakarta),sans-serif;outline:none;}
        .ap-select:focus{border-color:rgba(0,212,255,.55);}
        .ap-select option{background:#071525;color:#e0f7ff;}
        .ap-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
        .ap-section-title{font-size:12px;font-weight:800;letter-spacing:1.5px;color:#00d4ff;margin-bottom:14px;padding-bottom:9px;border-bottom:1px solid rgba(0,212,255,.12);text-transform:uppercase;font-family:var(--font-jakarta),sans-serif;}
        .ap-toggle{position:relative;width:44px;height:22px;cursor:pointer;}
        .ap-toggle input{opacity:0;width:0;height:0;position:absolute;}
        .ap-toggle-track{position:absolute;inset:0;border-radius:11px;background:rgba(255,68,102,.25);border:1px solid rgba(255,68,102,.4);transition:all .3s;}
        .ap-toggle input:checked + .ap-toggle-track{background:rgba(0,255,200,.18);border-color:rgba(0,255,200,.5);}
        .ap-toggle-thumb{position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#ff4466;transition:all .3s;}
        .ap-toggle input:checked ~ .ap-toggle-thumb{left:25px;background:#00ffc8;}
        .ap-toggle:has(input:disabled){cursor:not-allowed;opacity:.35;}
        .ap-toggle-row-disabled{opacity:.4;pointer-events:none;}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(5px);}
        .modal-box{background:#0a1220;border:1px solid rgba(0,212,255,.3);border-radius:12px;padding:28px;width:100%;max-width:420px;box-shadow:0 28px 60px rgba(0,0,0,.7);}
        .modal-box.danger{border-color:rgba(255,68,102,.4);box-shadow:0 28px 60px rgba(0,0,0,.7),0 0 30px rgba(255,68,102,.08);}
        .modal-title{font-size:13px;font-weight:800;color:#00d4ff;letter-spacing:1.5px;margin-bottom:16px;display:flex;align-items:center;gap:8px;font-family:var(--font-jakarta),sans-serif;}
        .msg-ok{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(0,255,200,.07);border:1px solid rgba(0,255,200,.2);border-radius:6px;font-size:12px;color:#00ffc8;margin-bottom:12px;}
        .msg-err{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,68,102,.07);border:1px solid rgba(255,68,102,.2);border-radius:6px;font-size:12px;color:#ff4466;margin-bottom:12px;}
        @media(max-width:1100px){.ap-grid5{grid-template-columns:repeat(3,1fr)!important;}.sec-grid{grid-template-columns:1fr!important;}.sec-span2{grid-column:span 1!important;}.email-grid{grid-template-columns:1fr!important;}}
        @media(max-width:900px){.ap-grid4{grid-template-columns:repeat(2,1fr);}.ap-grid3{grid-template-columns:1fr 1fr;}.ap-grid5{grid-template-columns:repeat(2,1fr)!important;}}
        @media(max-width:600px){.ap-grid4,.ap-grid3{grid-template-columns:1fr;}.ap-grid5{grid-template-columns:1fr!important;}}

        /* ═══════════════════════════════════════
           LIGHT THEME OVERRIDES — Admin Panel
        ═══════════════════════════════════════ */
        [data-theme="light"] .ap-body{background:#F0F4F8!important;background-image:linear-gradient(rgba(0,0,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.03) 1px,transparent 1px)!important;color:#0F172A!important;}
        [data-theme="light"] .ap-body::before{display:none;}
        [data-theme="light"] .ap-header{background:rgba(250,250,250,0.97)!important;border-bottom:1px solid rgba(0,0,0,0.1)!important;box-shadow:0 2px 12px rgba(0,0,0,0.06)!important;}
        [data-theme="light"] .ap-brand{border:1px solid rgba(139,92,246,0.3)!important;background:rgba(139,92,246,0.05)!important;box-shadow:none!important;}
        [data-theme="light"] .ap-brand-icon{border-color:rgba(139,92,246,0.4)!important;color:#7C3AED!important;background:rgba(139,92,246,0.08)!important;animation:none!important;}
        [data-theme="light"] .ap-brand-title{color:#0F172A!important;text-shadow:none!important;}
        [data-theme="light"] .ap-brand-sub{color:#6B7280!important;}
        [data-theme="light"] .ap-clock{color:#7C3AED!important;text-shadow:none!important;}
        [data-theme="light"] .ap-user{border-color:rgba(139,92,246,0.25)!important;background:rgba(139,92,246,0.05)!important;}
        [data-theme="light"] .ap-user:hover{border-color:rgba(139,92,246,0.5)!important;background:rgba(139,92,246,0.1)!important;box-shadow:none!important;}
        [data-theme="light"] .ap-avatar{background:linear-gradient(135deg,#7C3AED,#EC4899)!important;color:#fff!important;box-shadow:none!important;}
        [data-theme="light"] .ap-uname{color:#0F172A!important;}
        [data-theme="light"] .ap-urole{background:linear-gradient(90deg,#7C3AED,#EC4899)!important;-webkit-background-clip:text!important;-webkit-text-fill-color:transparent!important;}
        [data-theme="light"] .ap-dropdown{background:#FAFAFA!important;border:1px solid rgba(0,0,0,0.1)!important;box-shadow:0 16px 40px rgba(0,0,0,0.15)!important;}
        [data-theme="light"] .ap-ddi{color:#374151!important;}
        [data-theme="light"] .ap-ddi:hover{background:rgba(0,0,0,0.04)!important;color:#0F172A!important;}
        [data-theme="light"] .ap-ddi.danger{color:#DC2626!important;}
        [data-theme="light"] .ap-ddi.danger:hover{background:rgba(226,75,74,0.08)!important;}
        [data-theme="light"] .ap-tabs{background:rgba(250,250,250,0.95)!important;border-bottom:1px solid rgba(0,0,0,0.08)!important;}
        [data-theme="light"] .ap-tab{color:#6B7280!important;}
        [data-theme="light"] .ap-tab:hover{color:#374151!important;}
        [data-theme="light"] .ap-tab.active{color:#7C3AED!important;border-bottom-color:#7C3AED!important;text-shadow:none!important;}
        [data-theme="light"] .ap-card{background:#FAFAFA!important;border:1px solid rgba(0,0,0,0.08)!important;}
        [data-theme="light"] .ap-card::after{display:none;}
        [data-theme="light"] .ap-card-title{color:#6B7280!important;}
        [data-theme="light"] .ap-card-title::before{background:linear-gradient(180deg,#7C3AED,#EC4899)!important;}
        [data-theme="light"] .ap-kpi{background:#F5F7FA!important;border:1px solid rgba(0,0,0,0.08)!important;}
        [data-theme="light"] .ap-kpi::after{display:none;}
        [data-theme="light"] .ap-kpi-label{color:#6B7280!important;}
        [data-theme="light"] .ap-kpi-value{color:#0F172A!important;}
        [data-theme="light"] .ap-kpi-sub{color:#9CA3AF!important;}
        [data-theme="light"] .cyan{color:#7C3AED!important;}
        [data-theme="light"] .green{color:#059669!important;}
        [data-theme="light"] .yellow{color:#D97706!important;}
        [data-theme="light"] .red{color:#DC2626!important;}
        [data-theme="light"] .ap-table-wrap{background:#FAFAFA!important;border:1px solid rgba(0,0,0,0.08)!important;}
        [data-theme="light"] .ap-table thead tr{background:#F3F4F6!important;}
        [data-theme="light"] .ap-table th{color:#6B7280!important;border-bottom:1px solid rgba(0,0,0,0.1)!important;}
        [data-theme="light"] .ap-table td{color:#374151!important;border-bottom:1px solid rgba(0,0,0,0.06)!important;}
        [data-theme="light"] .ap-table tr:hover td{background:rgba(0,0,0,0.02)!important;}
        [data-theme="light"] .ap-btn-cyan{border-color:rgba(124,92,246,0.35)!important;color:#7C3AED!important;background:rgba(124,92,246,0.08)!important;}
        [data-theme="light"] .ap-btn-cyan:hover{background:rgba(124,92,246,0.15)!important;border-color:#7C3AED!important;box-shadow:none!important;}
        [data-theme="light"] .ap-btn-green{border-color:rgba(5,150,105,0.3)!important;color:#059669!important;background:rgba(5,150,105,0.08)!important;}
        [data-theme="light"] .ap-btn-red{border-color:rgba(220,38,38,0.3)!important;color:#DC2626!important;background:rgba(220,38,38,0.08)!important;}
        [data-theme="light"] .badge-green{background:rgba(5,150,105,0.1)!important;color:#059669!important;border-color:rgba(5,150,105,0.25)!important;}
        [data-theme="light"] .badge-cyan{background:rgba(124,92,246,0.1)!important;color:#7C3AED!important;border-color:rgba(124,92,246,0.25)!important;}
        [data-theme="light"] .badge-yellow{background:rgba(217,119,6,0.1)!important;color:#D97706!important;border-color:rgba(217,119,6,0.25)!important;}
        [data-theme="light"] .badge-red{background:rgba(220,38,38,0.1)!important;color:#DC2626!important;border-color:rgba(220,38,38,0.25)!important;}
        [data-theme="light"] .badge-gray{background:rgba(107,114,128,0.1)!important;color:#6B7280!important;border-color:rgba(107,114,128,0.25)!important;}
        [data-theme="light"] .ap-input{background:#FFFFFF!important;border-color:rgba(0,0,0,0.15)!important;color:#0F172A!important;}
        [data-theme="light"] .ap-input:focus{border-color:rgba(124,92,246,0.5)!important;background:#FFFFFF!important;}
        [data-theme="light"] .ap-select{background:#FFFFFF!important;border-color:rgba(0,0,0,0.15)!important;color:#374151!important;}
        [data-theme="light"] .ap-select option{background:#FFFFFF;color:#374151;}
        [data-theme="light"] .ap-section-title{color:#7C3AED!important;border-bottom:1px solid rgba(124,92,246,0.15)!important;}
        [data-theme="light"] .modal-bg{background:rgba(0,0,0,0.5)!important;}
        [data-theme="light"] .modal-box{background:#FAFAFA!important;border-color:rgba(0,0,0,0.12)!important;box-shadow:0 28px 60px rgba(0,0,0,0.2)!important;}
        [data-theme="light"] .modal-box.danger{border-color:rgba(220,38,38,0.3)!important;}
        [data-theme="light"] .modal-title{color:#7C3AED!important;}
        [data-theme="light"] .ap-chevron{color:#6B7280!important;}
      `}</style>

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
          {tab === 'security-status' && <TabSecurityStatus/>}
          {tab === 'broadcast'       && <TabBroadcast    isSA={isSA}/>}
          {tab === 'audit-trail'     && <TabAuditTrail/>}
          {tab === 'email-notif'     && <TabEmailNotif   isSA={isSA}/>}
          {tab === 'promotion'       && isSA && <PromotionRequestsPanel/>}
          {tab === 'promotion'       && !isSA && <div style={{padding:24,color:'#85B7EB'}}>Hanya SUPER_ADMIN.</div>}
          {tab === 'rima-feedback'   && <RimaFeedbackPanel/>}
        </main>
      </div>
    </>
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

function TabSessions({ selfSessionId, isSA }: { selfSessionId:string; isSA:boolean }) {
  const [rows,    setRows]    = useState<SessionRow[]>([]);
  const [stats,   setStats]   = useState<{users:Record<string,number>;sessions:Record<string,number>}|null>(null);
  const [loading, setLoad]    = useState(false);
  const [search,  setSearch]  = useState('');
  const [emModal, setEmModal] = useState(false);
  const [emPw,    setEmPw]    = useState('');
  const [emErr,   setEmErr]   = useState('');
  const [emLoading,setEmLoad] = useState(false);
  const [ok,      setOk]      = useState('');
  const [err,     setErr]     = useState('');

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const [sr, ss] = await Promise.all([
        fetchJson<SessionRow[]>('/api/admin/sessions'),
        fetchJson('/api/admin/system-status'),
      ]);
      if (sr.ok && sr.data) setRows(sr.data);
      if (ss.ok) {
        const s = ss as { users?: Record<string,number>; sessions?: Record<string,number> };
        if (s.users && s.sessions) setStats({ users: s.users, sessions: s.sessions });
      }
    } finally { setLoad(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const filtered = rows.filter(r=>!search||r.username.toLowerCase().includes(search.toLowerCase())||(r.ip_address??'').includes(search));

  async function forceLogout(sid: string) {
    setErr(''); setOk('');
    const j = await fetchJson(`/api/admin/sessions/${sid}`, { method:'DELETE' });
    if (j.ok) { setOk('Sesi berhasil dihapus.'); load(); } else setErr(j.message);
  }

  async function doEmergency() {
    setEmErr(''); setEmLoad(true);
    try {
      const j = await fetchJson('/api/admin/sessions', { method:'DELETE', body:JSON.stringify({password:emPw}) });
      if (j.ok) {
        const deleted = (j as { deleted?: number }).deleted ?? 0;
        setOk(`Emergency logout: ${deleted} sesi dihapus.`); setEmModal(false); setEmPw(''); load();
      }
      else setEmErr(j.message);
    } finally { setEmLoad(false); }
  }

  const s = stats?.sessions;
  return (
    <div>
      {ok  && <div className="msg-ok">{ok}</div>}
      {err && <div className="msg-err">{err}</div>}

      <div className="ap-grid4" style={{marginBottom:16}}>
        {[
          {label:'USER STATUS',  rows:[['Total User',stats?.users?.total??'-','cyan'],['Aktif',stats?.users?.aktif??'-','green'],['Blocked',stats?.users?.locked??'-','red'],['Menunggu',stats?.users?.menunggu??'-','yellow']]},
          {label:'SESSION STATUS',rows:[['Total Row',s?.total??'-','cyan'],['Aktif',s?.aktif??'-','green'],['Idle >30m',s?.idle??'-','yellow'],['Expired',s?.expired??'-','red']]},
        ].map((c,i)=>(
          <div key={i} className="ap-card">
            <div className="ap-card-title">{c.label}</div>
            {c.rows.map(([k,v,cl])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,0.06)',fontSize:12}}>
                <span style={{color:'#5a8ea8'}}>{k}</span>
                <span className={cl as string} style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="ap-card">
          <div className="ap-card-title">SYSTEM INFO</div>
          {[['Session Inactive',`60 menit`,'cyan'],['Keepalive Interval','25 menit','cyan'],['Password Min','8 char + A-Z+0-9','green']].map(([k,v,cl])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,0.06)',fontSize:12}}>
              <span style={{color:'#5a8ea8'}}>{k}</span>
              <span className={cl as string} style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</span>
            </div>
          ))}
        </div>
        <div className="ap-card" style={{display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
          <div className="ap-card-title">QUICK STATS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[['TOTAL',s?.total??0,'cyan'],['AKTIF',s?.aktif??0,'green'],['IDLE',s?.idle??0,'yellow'],['UNIK',s?.unik??0,'cyan']].map(([l,v,c])=>(
              <div key={l as string} style={{textAlign:'center',padding:8,background:'rgba(0,212,255,0.04)',borderRadius:6,border:'1px solid rgba(0,212,255,0.1)'}}>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}} className={c as string}>{v as number}</div>
                <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:1}}>{l as string}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div className="ap-section-title" style={{margin:0}}>DAFTAR SESI AKTIF</div>
        <div className="ap-row">
          <input className="ap-input" style={{width:220}} placeholder="Cari username atau IP..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <button className="ap-btn ap-btn-cyan" onClick={load} disabled={loading}><RefreshCw size={12}/> REFRESH</button>
          {isSA && <button className="ap-btn ap-btn-red" onClick={()=>{setEmModal(true);setEmErr('');}}><AlertTriangle size={12}/> EMERGENCY LOGOUT</button>}
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,color:'#5a8ea8',letterSpacing:2}}>LOADING...</div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr>
              <th>USERNAME</th><th>ROLE</th><th>IP ADDRESS</th>
              <th>LOGIN</th><th>LAST ACTIVE</th><th>IDLE</th><th>STATUS</th>
              <th>AKSI</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada sesi aktif</td></tr>
              ) : filtered.map(r => {
                const isSelf  = r.session_id === selfSessionId;
                const idleSec = r.idle_seconds;
                const isIdle  = idleSec > 1800;
                return (
                  <tr key={r.session_id}>
                    <td style={{fontWeight:700,color:isSelf?'#00ffc8':'#e0f7ff'}}>{r.username}{isSelf&&<span style={{fontSize:9,marginLeft:4,color:'#5a8ea8'}}>(ANDA)</span>}</td>
                    <td><span className="ap-badge badge-cyan">{r.role}</span></td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{r.ip_address??'-'}</td>
                    <td style={{fontSize:11,color:'#5a8ea8'}}>{fmtTs(r.created_at)}</td>
                    <td style={{fontSize:11,color:'#5a8ea8'}}>{fmtTs(r.last_active)}</td>
                    <td className={isIdle?'yellow':'green'} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{fmtIdle(idleSec)}</td>
                    <td><span className={`ap-badge ${isIdle?'badge-yellow':'badge-green'}`}><span className={isIdle?'dot-idle':'dot-active'}/>{isIdle?'IDLE':'AKTIF'}</span></td>
                    <td>
                      {!isSelf ? (
                        <button className="ap-btn ap-btn-red" style={{padding:'4px 10px',fontSize:10}} onClick={()=>forceLogout(r.session_id)}>
                          <Trash2 size={10}/> LOGOUT
                        </button>
                      ) : (
                        <span style={{fontSize:10,color:'#5a8ea8',fontStyle:'italic'}}>Sesi Anda</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {emModal && (
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget){setEmModal(false);setEmPw('');}}}>
          <div className="modal-box danger">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="modal-title" style={{color:'#ff4466'}}><AlertTriangle size={16}/> EMERGENCY LOGOUT</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>{setEmModal(false);setEmPw('');}}><X size={18}/></button>
            </div>
            <p style={{fontSize:12,color:'#a0cfe0',marginBottom:16,lineHeight:1.6}}>
              Aksi ini akan <span style={{color:'#ff4444',fontWeight:700}}>menghapus semua sesi aktif</span> kecuali sesi Anda. Konfirmasi dengan password Anda.
            </p>
            {emErr && <div className="msg-err">{emErr}</div>}
            <input className="ap-input" type="password" placeholder="Password Anda..." value={emPw} onChange={e=>setEmPw(e.target.value)} style={{marginBottom:14}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>{setEmModal(false);setEmPw('');}}>Batal</button>
              <button className="ap-btn ap-btn-red" onClick={doEmergency} disabled={emLoading||!emPw}>
                <AlertTriangle size={11}/>{emLoading?'Proses...':'KONFIRMASI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabAppControl({ isSA }: { isSA:boolean }) {
  const [status, setStatus] = useState<AppStatus>({});
  const [loading, setLoad]  = useState(false);
  const [ok, setOk]         = useState('');

  const load = useCallback(async()=>{
    const r = await fetchJson<AppStatus>('/api/admin/app-status');
    if (r.ok && r.data) setStatus(r.data);
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function toggle(key: string) {
    if (!isSA) return;
    const newVal = status[key] === 'online' ? 'maintenance' : 'online';
    setStatus(p=>({...p,[key]:newVal}));
    setLoad(true);
    const r = await fetchJson('/api/admin/app-status',{method:'POST',body:JSON.stringify({key,value:newVal})});
    setLoad(false);
    if (r.ok) setOk(`${APP_STATUS_LABELS[key]} → ${newVal.toUpperCase()}`); else load();
  }

  return (
    <div>
      {ok && <div className="msg-ok" style={{marginBottom:16}}>{ok}</div>}
      <div className="ap-section-title">STATUS APLIKASI</div>
      {!isSA && <div className="msg-err" style={{marginBottom:12}}>Hanya SUPER_ADMIN yang dapat mengubah status aplikasi.</div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
        {Object.entries(APP_STATUS_LABELS).map(([key,label])=>{
          const val = status[key] ?? 'online';
          const isOnline = val === 'online';
          return (
            <div key={key} className="ap-card" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#e0f7ff',marginBottom:4}}>{label}</div>
                <span className={`ap-badge ${isOnline?'badge-green':'badge-yellow'}`}>
                  {isOnline?'ONLINE':'MAINTENANCE'}
                </span>
              </div>
              {isSA && (
                <label className="ap-toggle" style={{cursor:loading?'wait':'pointer'}}>
                  <input type="checkbox" checked={isOnline} onChange={()=>toggle(key)}/>
                  <div className="ap-toggle-track"/>
                  <div className="ap-toggle-thumb"/>
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const AM_FILTERS = [
  { id:'',             label:'SEMUA',   dot:'#5a8ea8' },
  { id:'BLOCKED',      label:'BLOCKED', dot:'#ff4466' },
  { id:'FAILED',       label:'FAILED',  dot:'#ffcc00' },
  { id:'LOGIN',        label:'LOGIN',   dot:'#00ffc8' },
  { id:'LOGOUT',       label:'LOGOUT',  dot:'#5a8ea8' },
  { id:'WARN',         label:'WARN',    dot:'#f59e0b' },
];



function amDot(ev: string): string {
  if (ev === 'LOGIN_SUCCESS') return '#00ffc8';
  if (ev === 'LOGOUT')        return '#5a8ea8';
  if (ev.includes('BLOCKED') || ev.includes('LOCKED')) return '#ff4466';
  if (ev.includes('FAILED'))  return '#ffcc00';
  return '#00d4ff';
}

function amMatchFilter(ev: string, f: string): boolean {
  if (!f) return true;
  if (f === 'BLOCKED') return ev.includes('BLOCKED') || ev.includes('LOCKED');
  if (f === 'FAILED')  return ev.includes('FAILED');
  if (f === 'LOGIN')   return ev === 'LOGIN_SUCCESS';
  if (f === 'LOGOUT')  return ev === 'LOGOUT';
  if (f === 'WARN')    return !['LOGIN_SUCCESS','LOGIN_FAILED','LOGIN_BLOCKED','ACCOUNT_LOCKED','LOGOUT'].includes(ev);
  return true;
}

function TabAttackMonitor() {
  const [chart,   setChart]   = useState<ChartSlot[]>([]);
  const [totals,  setTotals]  = useState<Record<string,number>>({});
  const [logs,    setLogs]    = useState<LogRow[]>([]);
  const [loading, setLoad]    = useState(false);
  const [filter,  setFilter]  = useState('');

  const load = useCallback(async()=>{
    setLoad(true);
    try {
      const r = await fetchJson('/api/admin/attack-monitor');
      if (r.ok) {
        const a = r as { chart?: ChartSlot[]; totals?: Record<string,number>; logs?: LogRow[] };
        setChart(a.chart ?? []); setTotals(a.totals ?? {}); setLogs(a.logs ?? []);
      }
    } finally { setLoad(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const maxVal     = Math.max(...chart.flatMap(s=>[s.login,s.failed,s.blocked]), 1);
  const filtered   = logs.filter(l=>amMatchFilter(l.event_type, filter));

  const STATS = [
    { label:'BRUTE FORCE',   val:totals.total_locked??0,  color:'red',    sub:'Akun dikunci' },
    { label:'LOGIN GAGAL',   val:totals.total_failed??0,  color:'yellow', sub:'Password salah' },
    { label:'LOGIN SUKSES',  val:totals.total_login??0,   color:'green',  sub:'Berhasil masuk' },
    { label:'WARNING',       val:totals.total_warn??0,    color:'cyan',   sub:'Event lain' },
    { label:'TOTAL LOG',     val:totals.total_all??0,     color:'cyan',   sub:'24 jam terakhir' },
  ];

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className="ap-section-title" style={{margin:0}}>ATTACK MONITOR</div>
        <button className="ap-btn ap-btn-cyan" onClick={load} disabled={loading}><RefreshCw size={12}/> REFRESH</button>
      </div>

      <div className="ap-grid5" style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {STATS.map(({label,val,color,sub})=>(
          <div key={label} className="ap-kpi">
            <div className="ap-kpi-label">{label}</div>
            <div className={`ap-kpi-value ${color}`}>{val}</div>
            <div className="ap-kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="ap-card" style={{marginBottom:16}}>
        <div className="ap-card-title">AKTIVITAS LOGIN PER JAM — 12 JAM TERAKHIR</div>
        {loading ? (
          <div style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</div>
        ) : chart.length === 0 ? (
          <div style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Belum ada data</div>
        ) : (
          <>
            <div style={{display:'flex',gap:14,marginBottom:10}}>
              {[['#00ffc8','LOGIN SUCCESS'],['#ff4466','LOGIN FAILED'],['#ffcc00','BLOCKED']].map(([c,l])=>(
                <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'#5a8ea8'}}>
                  <div style={{width:10,height:10,background:c,borderRadius:2}}/>
                  {l}
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:3,alignItems:'flex-end',height:110,padding:'0 2px'}}>
              {chart.map((slot,i)=>(
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                  <div style={{display:'flex',gap:1,alignItems:'flex-end',width:'100%',height:90}}>
                    {[{v:slot.login,c:'#00ffc8'},{v:slot.failed,c:'#ff4466'},{v:slot.blocked,c:'#ffcc00'}].map((b,bi)=>(
                      <div key={bi} style={{flex:1,height:`${(b.v/maxVal)*86+2}px`,background:b.c,borderRadius:'2px 2px 0 0',minHeight:2,opacity:.85}}/>
                    ))}
                  </div>
                  <div style={{fontSize:8,color:'#5a8ea8',whiteSpace:'nowrap'}}>{slot.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        {AM_FILTERS.map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)}
            style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:5,
              border:`1px solid ${filter===f.id?f.dot:'rgba(90,142,168,.3)'}`,
              background:filter===f.id?`rgba(${f.dot==='#00ffc8'?'0,255,200':f.dot==='#ff4466'?'255,68,102':f.dot==='#ffcc00'?'255,204,0':f.dot==='#00d4ff'?'0,212,255':'90,142,168'},.1)`:'transparent',
              color:filter===f.id?f.dot:'#5a8ea8',cursor:'pointer',fontSize:10,fontWeight:700,
              letterSpacing:.8,fontFamily:"var(--font-jakarta),sans-serif",transition:'all .15s'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:f.dot,display:'inline-block',flexShrink:0}}/>
            {f.label}
          </button>
        ))}
        <span style={{fontSize:10,color:'#5a8ea8',alignSelf:'center',marginLeft:4}}>
          {filtered.length} entri
        </span>
      </div>

      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr>
            <th>WAKTU</th><th>USERNAME</th><th>STATUS</th><th>IP</th><th>DETAIL</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada log</td></tr>
            ) : filtered.map(row=>(
              <tr key={row.id}>
                <td className="mono" style={{fontSize:11,color:'#5a8ea8',whiteSpace:'nowrap'}}>{row.created_at}</td>
                <td style={{fontWeight:700,color:'#e0f7ff'}}>{row.username??'-'}</td>
                <td>
                  <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,
                    color:amDot(row.event_type),fontFamily:"var(--font-jakarta),sans-serif"}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:amDot(row.event_type),
                      display:'inline-block',flexShrink:0,
                      boxShadow:row.event_type==='LOGIN_SUCCESS'?`0 0 6px ${amDot(row.event_type)}`:'none'}}/>
                    {row.event_type}
                  </span>
                </td>
                <td className="mono" style={{fontSize:11,color:'#5a8ea8'}}>{row.ip_address??'-'}</td>
                <td style={{fontSize:11,color:'#a0cfe0',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.detail??'-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabUserMgmt({ isSA }: { isSA:boolean }) {
  const [users,        setUsers]   = useState<UserRow[]>([]);
  const [loading,      setLoad]    = useState(false);
  const [search,       setSearch]  = useState('');
  const [filterStatus, setFS]      = useState('');
  const [page,         setPage]    = useState(1);
  const [totalPages,   setTP]      = useState(1);
  const [ok,           setOk]      = useState('');
  const [err,          setErr]     = useState('');
  const [roleModal,    setRM]      = useState<UserRow|null>(null);
  const [newRole,      setNR]      = useState('');
  const [pwModal,      setPW]      = useState<UserRow|null>(null);
  const [newPw,        setNP]      = useState('');
  const [pwErr,        setPwErr]   = useState('');
  const [accessModal,  setAM]      = useState<UserRow|null>(null);
  const [selAccess,    setSel]     = useState<string[]>([]);
  const [accessAll,    setAccAll]  = useState(true);
  const [accLoading,   setAccLoad] = useState(false);
  const [delModal,     setDM]      = useState<UserRow|null>(null);
  const [delLoading,   setDelLoad] = useState(false);
  // Quota stats untuk counter di dropdown role (migration 037)
  const [quotaStats,   setQS]      = useState<Record<string,{count:number;quota:number;full:boolean}>>({});
  // Tick per 30 detik untuk auto-hide tombol UNLOCK/REVOKE saat lock/probation lewat (React 19 purity).
  const [now,          setNow]     = useState(() => Date.now());
  // INTRANET (D10): form Tambah User — registrasi publik mati, SA buat akun di sini.
  const [createOpen,   setCO]      = useState(false);
  const [cuU, setCuU] = useState(''); const [cuN, setCuN] = useState('');
  const [cuE, setCuE] = useState(''); const [cuP, setCuP] = useState('');
  const [cuR, setCuR] = useState(''); const [cuErr, setCuErr] = useState(''); const [cuLd, setCuLd] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/role-quota-stats');
        const j = await r.json() as { ok: boolean; data?: Array<{role:string;count:number;quota:number;full:boolean}> };
        if (j.ok && j.data) {
          const map: Record<string,{count:number;quota:number;full:boolean}> = {};
          for (const s of j.data) map[s.role] = { count: s.count, quota: s.quota, full: s.full };
          setQS(map);
        }
      } catch { /* silent */ }
    })();
  }, [roleModal?.id]); // refresh saat buka modal role berbeda

  const load = useCallback(async(pg=1)=>{
    setLoad(true);
    try {
      const p = new URLSearchParams({page:String(pg),limit:'20'});
      if (search) p.set('search',search);
      if (filterStatus) p.set('status',filterStatus);
      const r = await fetchJson<UserRow[]>(`/api/admin/users?${p}`);
      if (r.ok && r.data) {
        const pg2 = (r as { pagination?: { page: number; totalPages: number } }).pagination;
        setUsers(r.data);
        if (pg2) { setPage(pg2.page); setTP(pg2.totalPages); }
      }
    } finally { setLoad(false); }
  },[search,filterStatus]);

  useEffect(()=>{ load(1); },[load]);

  function openAccessModal(u: UserRow) {
    setAM(u);
    if (!u.app_access || u.app_access.length === 0) {
      setAccAll(true); setSel(APP_ACCESS_LIST.map(a=>a.id));
    } else {
      setAccAll(false); setSel(u.app_access);
    }
  }

  async function doAction(id:number, action:string, role?:string) {
    setOk(''); setErr('');
    const j = await fetchJson('/api/admin/users',{method:'PATCH',body:JSON.stringify({id,action,role})});
    if (j.ok) { setOk(j.message ?? ''); load(page); setRM(null); }
    else setErr(j.message);
  }

  async function doDelete() {
    if (!delModal) return;
    setDelLoad(true); setOk(''); setErr('');
    try {
      const j = await fetchJson(`/api/admin/users?id=${delModal.id}`, { method:'DELETE' });
      if (j.ok) { setOk(j.message ?? ''); setDM(null); load(page); }
      else setErr(j.message);
    } finally { setDelLoad(false); }
  }

  async function doCreate() {
    setCuErr('');
    if (cuU.trim().length < 3) { setCuErr('Username minimal 3 karakter'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuE.trim())) { setCuErr('Format email tidak valid'); return; }
    if (cuP.length < 8) { setCuErr('Password minimal 8 karakter'); return; }
    if (!cuR) { setCuErr('Pilih role'); return; }
    setCuLd(true);
    try {
      const j = await fetchJson('/api/admin/users',{method:'POST',body:JSON.stringify({username:cuU.trim(),email:cuE.trim(),password:cuP,role:cuR,nama_lengkap:cuN.trim()||undefined})});
      if (j.ok) { setOk(j.message ?? 'Akun dibuat.'); setCO(false); setCuU('');setCuN('');setCuE('');setCuP('');setCuR(''); load(1); }
      else setCuErr(j.message);
    } finally { setCuLd(false); }
  }

  async function doResetPw() {
    if (!pwModal||!newPw) return;
    setPwErr('');
    const j = await fetchJson('/api/admin/users',{method:'PATCH',body:JSON.stringify({id:pwModal.id,action:'reset-password',password:newPw})});
    if (j.ok) { setOk(j.message ?? ''); setPW(null); setNP(''); }
    else setPwErr(j.message);
  }

  async function doSaveAccess() {
    if (!accessModal) return;
    setAccLoad(true);
    // "Semua app" simpan list eksplisit — guard server (isBludRole/isKinerjaRole/dll)
    // menafsirkan null = TANPA grant (default deny), bukan "semua"
    const payload = accessAll ? APP_ACCESS_LIST.map(a => a.id) : selAccess;
    const j = await fetchJson('/api/admin/users',{method:'PATCH',
      body:JSON.stringify({id:accessModal.id, action:'set-app-access', app_access:payload})});
    setAccLoad(false);
    if (j.ok) { setOk(j.message ?? ''); setAM(null); load(page); }
    else setErr(j.message);
  }

  function toggleApp(id:string) {
    setSel(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  }

  function statusBadge(s:string) {
    if (s==='AKTIF')    return <span className="ap-badge badge-green">AKTIF</span>;
    if (s==='NONAKTIF') return <span className="ap-badge badge-red">NONAKTIF</span>;
    if (s==='MENUNGGU') return <span className="ap-badge badge-yellow">MENUNGGU</span>;
    return <span className="ap-badge badge-gray">{s}</span>;
  }

  function accessSummary(u: UserRow) {
    if (u.role === 'SUPER_ADMIN') return <span style={{fontSize:10,color:'#5a8ea8'}}>Semua</span>;
    if (!u.app_access || u.app_access.length === 0)
      return <span style={{fontSize:10,color:'#5a8ea8'}}>Default role</span>;
    return <span style={{fontSize:10,color:'#ffcc00'}}>{u.app_access.length} app</span>;
  }

  return (
    <div>
      {ok  && <div className="msg-ok" style={{marginBottom:12}}>{ok}</div>}
      {err && <div className="msg-err" style={{marginBottom:12}}>{err}</div>}

      <div className="ap-row" style={{marginBottom:14}}>
        <input className="ap-input" style={{width:220}} placeholder="Cari username / nama / email..." value={search} onChange={e=>setSearch(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')load(1);}}/>
        <select className="ap-select" value={filterStatus} onChange={e=>{setFS(e.target.value);load(1);}}>
          <option value="">Semua Status</option>
          <option value="AKTIF">AKTIF</option>
          <option value="NONAKTIF">NONAKTIF</option>
          <option value="MENUNGGU">MENUNGGU</option>
        </select>
        <button className="ap-btn ap-btn-cyan" onClick={()=>load(1)} disabled={loading}><RefreshCw size={12}/> CARI</button>
        {isSA && <button className="ap-btn ap-btn-green" onClick={()=>{setCO(true);setCuErr('');}} style={{marginLeft:'auto'}}>+ TAMBAH USER</button>}
      </div>

      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr>
            <th>USERNAME</th><th>NAMA</th><th>ROLE</th><th>STATUS</th><th>AKSES APP</th><th>AKSI</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada data</td></tr>
            ) : users.map(u=>(
              <tr key={u.id}>
                <td style={{fontWeight:700,color:'#e0f7ff'}}>{u.username}<br/><span style={{fontSize:10,color:'#5a8ea8',fontWeight:400}}>{u.nama_lengkap??''}</span></td>
                <td style={{fontSize:11,color:'#5a8ea8'}}>{u.email}</td>
                <td><span className="ap-badge badge-cyan">{u.role}</span></td>
                <td>{statusBadge(u.status)}</td>
                <td style={{textAlign:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    {accessSummary(u)}
                    {u.role !== 'SUPER_ADMIN' && (
                      <button className="ap-btn ap-btn-cyan" style={{padding:'2px 8px',fontSize:9}} onClick={()=>openAccessModal(u)}>
                        ATUR
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {u.status==='AKTIF'  && <button className="ap-btn ap-btn-red"   style={{padding:'3px 8px',fontSize:10}} onClick={()=>doAction(u.id,'nonaktif')}>NONAKTIF</button>}
                    {u.status!=='AKTIF'  && <button className="ap-btn ap-btn-green" style={{padding:'3px 8px',fontSize:10}} onClick={()=>doAction(u.id,'aktifkan')}>AKTIFKAN</button>}
                    {isSA && <button className="ap-btn ap-btn-cyan" style={{padding:'3px 8px',fontSize:10}} onClick={()=>{setRM(u);setNR(u.role);}}>ROLE</button>}
                    {isSA && <button className="ap-btn ap-btn-cyan" style={{padding:'3px 8px',fontSize:10}} onClick={()=>{setPW(u);setNP('');setPwErr('');}}>PW</button>}
                    {isSA && u.promotion_locked_until && new Date(u.promotion_locked_until).getTime() > now && (
                      <Tip label="Reset lock 24 jam promotion"><button
                        className="ap-btn ap-btn-cyan"
                        style={{padding:'3px 8px',fontSize:10}}
                        onClick={async()=>{
                          if(!(await confirmDialog({ title: 'Reset Lock Promotion', message: `Reset lock promotion ${u.username}?`, confirmLabel: 'Reset', variant: 'warning' }))) return;
                          const r=await fetch(`/api/admin/users/${u.id}/unlock-promotion`,{method:'POST'});
                          const j=await r.json(); toast(j.message ?? 'OK');
                          if(j.ok) location.reload();
                        }}
                      ><Unlock size={10} style={{display:'inline',marginRight:3}}/>UNLOCK</button></Tip>
                    )}
                    {isSA && u.probationary_until && new Date(u.probationary_until).getTime() > now && (
                      <Tip label={`Probation aktif (rollback ke ${u.probationary_from_role ?? '?'})`}><button
                        className="ap-btn ap-btn-red"
                        style={{padding:'3px 8px',fontSize:10}}
                        onClick={async()=>{
                          if(!(await confirmDialog({ title: 'Revoke Probation', message: `Revoke probation ${u.username}? Role akan kembali ke ${u.probationary_from_role}.`, confirmLabel: 'Revoke', variant: 'danger' }))) return;
                          const r=await fetch(`/api/admin/users/${u.id}/revoke-probation`,{method:'POST'});
                          const j=await r.json(); toast(j.message ?? 'OK');
                          if(j.ok) location.reload();
                        }}
                      ><Undo2 size={10} style={{display:'inline',marginRight:3}}/>REVOKE</button></Tip>
                    )}
                    {isSA && u.role !== 'SUPER_ADMIN' && <button className="ap-btn ap-btn-red" style={{padding:'3px 8px',fontSize:10}} onClick={()=>setDM(u)}>HAPUS</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:12}}>
          <button className="ap-btn ap-btn-cyan" disabled={page<=1} onClick={()=>load(page-1)}><ChevronLeft size={12}/></button>
          <span style={{fontSize:11,color:'#5a8ea8',alignSelf:'center'}}>Hal {page}/{totalPages}</span>
          <button className="ap-btn ap-btn-cyan" disabled={page>=totalPages} onClick={()=>load(page+1)}><ChevronRight size={12}/></button>
        </div>
      )}

      {/* Modal: Atur Akses Aplikasi */}
      {accessModal && (
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setAM(null);}}>
          <div className="modal-box" style={{maxWidth:480}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <div className="modal-title">AKSES APLIKASI</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setAM(null)}><X size={18}/></button>
            </div>
            <div style={{fontSize:11,color:'#5a8ea8',marginBottom:16}}>
              User: <span style={{color:'#00d4ff',fontWeight:700}}>{accessModal.username}</span>
            </div>

            <div style={{padding:'10px 14px',background:'rgba(0,212,255,.05)',border:'1px solid rgba(0,212,255,.15)',borderRadius:8,marginBottom:14}}>
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13,fontWeight:700,color:'#00ffc8'}}>
                <input type="checkbox" checked={accessAll} onChange={e=>{setAccAll(e.target.checked); if(e.target.checked) setSel(APP_ACCESS_LIST.map(a=>a.id));}}
                  style={{width:15,height:15,accentColor:'#00ffc8'}}/>
                Akses Semua Aplikasi (default)
              </label>
              <div style={{fontSize:10,color:'#5a8ea8',marginTop:4,marginLeft:25}}>Centang ini jika tidak ada pembatasan khusus</div>
            </div>

            {!accessAll && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:'#5a8ea8',letterSpacing:1,marginBottom:8}}>PILIH APLIKASI YANG DAPAT DIAKSES:</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {APP_ACCESS_LIST.map(app=>(
                    <label key={app.id} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',
                      padding:'8px 12px',borderRadius:6,
                      background:selAccess.includes(app.id)?'rgba(0,212,255,.08)':'rgba(0,212,255,.02)',
                      border:`1px solid ${selAccess.includes(app.id)?'rgba(0,212,255,.3)':'rgba(0,212,255,.1)'}`,
                      transition:'all .15s',fontSize:12,color:selAccess.includes(app.id)?'#e0f7ff':'#5a8ea8'}}>
                      <input type="checkbox" checked={selAccess.includes(app.id)} onChange={()=>toggleApp(app.id)}
                        style={{width:13,height:13,accentColor:'#00d4ff',flexShrink:0}}/>
                      {app.name}
                    </label>
                  ))}
                </div>
                {selAccess.length === 0 && (
                  <div style={{fontSize:10,color:'#ff4466',marginTop:8}}>⚠ Pilih minimal 1 aplikasi</div>
                )}
              </div>
            )}

            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setAM(null)}>Batal</button>
              <button className="ap-btn ap-btn-green" onClick={doSaveAccess}
                disabled={accLoading||(!accessAll&&selAccess.length===0)}>
                {accLoading?'Menyimpan...':'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ubah Role */}
      {/* Modal: Tambah User (INTRANET D10) */}
      {createOpen && (
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setCO(false);}}>
          <div className="modal-box">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="modal-title">TAMBAH USER</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setCO(false)}><X size={18}/></button>
            </div>
            {cuErr && <div className="msg-err" style={{marginBottom:10}}>{cuErr}</div>}
            <input className="ap-input" placeholder="Username (min 3 — huruf/angka/_-.)" value={cuU} onChange={e=>setCuU(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <input className="ap-input" placeholder="Nama lengkap (opsional)" value={cuN} onChange={e=>setCuN(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <input className="ap-input" type="email" placeholder="Email" value={cuE} onChange={e=>setCuE(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <input className="ap-input" type="password" placeholder="Password (min 8, A-Z, a-z, 0-9)" value={cuP} onChange={e=>setCuP(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <select className="ap-select" value={cuR} onChange={e=>setCuR(e.target.value)} style={{width:'100%',marginBottom:12}}>
              <option value="">-- Pilih Role --</option>
              {ALL_ROLES.filter(r=>r!=='SUPER_ADMIN').map(r=>{
                const q = quotaStats[r];
                const suffix = q && q.quota > 0 ? ` (${q.count}/${q.quota})` : '';
                const disabled = q?.full === true;
                return <option key={r} value={r} disabled={disabled}>{r}{suffix}{disabled?' — penuh':''}</option>;
              })}
            </select>
            <div style={{fontSize:10,color:'#5a8ea8',marginBottom:14}}>Akun dibuat langsung AKTIF (edisi intranet — tanpa verifikasi email).</div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setCO(false)} disabled={cuLd}>Batal</button>
              <button className="ap-btn ap-btn-green" onClick={doCreate} disabled={cuLd}>{cuLd?'Menyimpan...':'Buat Akun'}</button>
            </div>
          </div>
        </div>
      )}

      {roleModal && (
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setRM(null);}}>
          <div className="modal-box">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="modal-title">UBAH ROLE — {roleModal.username}</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setRM(null)}><X size={18}/></button>
            </div>
            <select className="ap-select" style={{width:'100%',marginBottom:14}} value={newRole} onChange={e=>setNR(e.target.value)}>
              {ALL_ROLES.filter(r=>r!=='SUPER_ADMIN').map(r=>{
                const q = quotaStats[r];
                const isCurrent = r === roleModal.role;
                const suffix = q && q.quota > 0 ? ` (${q.count}/${q.quota})` : '';
                const disabled = q?.full === true && !isCurrent; // tidak disable role saat ini
                return (
                  <option key={r} value={r} disabled={disabled}>
                    {r}{suffix}{disabled ? ' — penuh' : ''}
                  </option>
                );
              })}
            </select>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setRM(null)}>Batal</button>
              <button className="ap-btn ap-btn-green" onClick={()=>doAction(roleModal.id,'ubah-role',newRole)}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {pwModal && (
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget){setPW(null);setNP('');}}}>
          <div className="modal-box">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="modal-title">RESET PASSWORD — {pwModal.username}</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>{setPW(null);setNP('');}}><X size={18}/></button>
            </div>
            {pwErr && <div className="msg-err">{pwErr}</div>}
            <input className="ap-input" type="password" placeholder="Password baru (min 8, A-Z, a-z, 0-9)..." value={newPw} onChange={e=>setNP(e.target.value)} style={{marginBottom:14}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>{setPW(null);setNP('');}}>Batal</button>
              <button className="ap-btn ap-btn-red" onClick={doResetPw} disabled={!newPw}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Konfirmasi Hapus Akun */}
      {delModal && (
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setDM(null);}}>
          <div className="modal-box" style={{maxWidth:420}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="modal-title" style={{color:'#ff6b6b'}}>⚠️ HAPUS AKUN</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setDM(null)}><X size={18}/></button>
            </div>
            <p style={{fontSize:13,color:'#a0cfe0',marginBottom:8}}>
              Anda akan menghapus akun:
            </p>
            <div style={{background:'#0d1f2d',border:'1px solid #1e3a4a',borderRadius:6,padding:'10px 14px',marginBottom:16}}>
              <div style={{fontWeight:700,color:'#e0f7ff',fontSize:14}}>{delModal.username}</div>
              <div style={{fontSize:11,color:'#5a8ea8'}}>{delModal.email}</div>
              <div style={{fontSize:11,color:'#5a8ea8',marginTop:4}}>Role: <span style={{color:'#00ffc8'}}>{delModal.role}</span></div>
            </div>
            <p style={{fontSize:12,color:'#ff6b6b',marginBottom:16}}>
              Akun akan dihapus permanen. Semua sesi aktif user ini akan dihentikan. Slot kuota role akan dibebaskan.
            </p>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setDM(null)} disabled={delLoading}>Batal</button>
              <button className="ap-btn ap-btn-red" onClick={doDelete} disabled={delLoading}>
                {delLoading ? 'Menghapus...' : 'Ya, Hapus Akun'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const SEC_CHECKS = [
  { label:'Cloudflare Turnstile', ok:true,  val:'Widget (CF)' },
  { label:'Brute-force Lock',     ok:true,  val:'5x → 15 menit' },
  { label:'Rate Limit Login',     ok:true,  val:'10 req/60s' },
  { label:'Rate Limit Register',  ok:true,  val:'3 req/300s' },
  { label:'Password Policy',      ok:true,  val:'Min 8 + A-Z+0-9' },
  { label:'Bcrypt Hash',          ok:true,  val:'Cost 12' },
  { label:'JWT HS256',            ok:true,  val:'Cookie HTTP-Only' },
  { label:'Session Timeout',      ok:true,  val:'60 menit idle' },
  { label:'Session Tracking',     ok:true,  val:'DB + invalidate' },
  { label:'CSP Headers',          ok:true,  val:'CF + self only' },
  { label:'Audit Log',            ok:true,  val:'Semua event' },
  { label:'Rate Limit Reset PW',  ok:true,  val:'3 req/10 menit' },
  { label:'HTTPS / HSTS',         ok:true,  val:'max-age=63072000' },
];

function TabSecurityStatus() {
  const [stats,  setStats]  = useState<{users:Record<string,number>;sessions:Record<string,number>}|null>(null);
  const [appSt,  setAppSt]  = useState<AppStatus>({});
  const [loading,setLoad]   = useState(false);

  const load = useCallback(async()=>{
    setLoad(true);
    try {
      const [ss,as] = await Promise.all([
        fetchJson('/api/admin/system-status'),
        fetchJson<AppStatus>('/api/admin/app-status'),
      ]);
      if (ss.ok) {
        const s = ss as { users?: Record<string,number>; sessions?: Record<string,number> };
        if (s.users && s.sessions) setStats({ users: s.users, sessions: s.sessions });
      }
      if (as.ok && as.data) setAppSt(as.data);
    } finally { setLoad(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const onlineCount  = Object.values(appSt).filter(v=>v==='online').length;
  const totalApps    = Object.keys(APP_STATUS_LABELS).length;
  const passedChecks = SEC_CHECKS.filter(c=>c.ok).length;
  const secLevel     = passedChecks === SEC_CHECKS.length ? 'AMAN' : passedChecks >= SEC_CHECKS.length*0.8 ? 'WASPADA' : 'BAHAYA';
  const secColor     = secLevel==='AMAN' ? '#00ffc8' : secLevel==='WASPADA' ? '#ffcc00' : '#ff4466';

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className="ap-section-title" style={{margin:0}}>SECURITY STATUS OVERVIEW</div>
        <button className="ap-btn ap-btn-cyan" onClick={load} disabled={loading}><RefreshCw size={12}/> REFRESH</button>
      </div>

      {/* Security Level Banner */}
      <div style={{background:`rgba(${secColor==='#00ffc8'?'0,255,200':secColor==='#ffcc00'?'255,204,0':'255,68,102'},.06)`,
        border:`1px solid ${secColor}40`,borderRadius:10,padding:'16px 24px',marginBottom:16,
        display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{width:56,height:56,borderRadius:'50%',border:`3px solid ${secColor}`,
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            background:`${secColor}12`,boxShadow:`0 0 20px ${secColor}40`}}>
            <Shield size={22} color={secColor}/>
          </div>
          <div>
            <div style={{fontSize:11,color:'#5a8ea8',letterSpacing:2,marginBottom:2}}>SECURITY LEVEL</div>
            <div style={{fontSize:22,fontWeight:800,color:secColor,letterSpacing:3,fontFamily:"var(--font-jakarta),sans-serif"}}>{secLevel}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
          {[['CHECKS PASSED',`${passedChecks}/${SEC_CHECKS.length}`,'#00ffc8'],
            ['USER AKTIF',stats?.users?.aktif??'-','#00d4ff'],
            ['SESI AKTIF',stats?.sessions?.aktif??'-','#00d4ff'],
            ['APP ONLINE',`${onlineCount}/${totalApps}`,'#00ffc8'],
          ].map(([l,v,c])=>(
            <div key={l as string} style={{textAlign:'center'}}>
              <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:1.5,marginBottom:3}}>{l as string}</div>
              <div style={{fontSize:20,fontWeight:400,color:c as string,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        {/* Security Checklist */}
        <div className="ap-card" style={{gridColumn:'span 2'}}>
          <div className="ap-card-title">SECURITY CHECKLIST</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 16px'}}>
            {SEC_CHECKS.map(({label,ok,val})=>(
              <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'7px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{width:16,height:16,borderRadius:4,background:ok?'rgba(0,255,200,.15)':'rgba(255,68,102,.15)',
                    border:`1px solid ${ok?'rgba(0,255,200,.4)':'rgba(255,68,102,.4)'}`,
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,
                    color:ok?'#00ffc8':'#ff4466',flexShrink:0,fontWeight:700}}>
                    {ok?'✓':'✗'}
                  </span>
                  <span style={{fontSize:11,color:'#a0cfe0'}}>{label}</span>
                </div>
                <span style={{fontSize:10,color:'#5a8ea8',fontFamily:"'JetBrains Mono',monospace"}}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="ap-card">
            <div className="ap-card-title">STATUS APLIKASI</div>
            {Object.entries(APP_STATUS_LABELS).map(([key,label])=>(
              <div key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                <span style={{fontSize:11,color:'#a0cfe0'}}>{label}</span>
                <span className={`ap-badge ${appSt[key]==='online'||!appSt[key]?'badge-green':'badge-yellow'}`} style={{fontSize:9}}>
                  {(appSt[key]??'ONLINE').toUpperCase()}
                </span>
              </div>
            ))}
          </div>
          <div className="ap-card">
            <div className="ap-card-title">SESSION STATS</div>
            {[['Total',stats?.sessions?.total??'-','cyan'],['Aktif',stats?.sessions?.aktif??'-','green'],
              ['Idle >30m',stats?.sessions?.idle??'-','yellow'],['Terkunci',stats?.users?.locked??'-','red'],
              ['Menunggu',stats?.users?.menunggu??'-','yellow'],
            ].map(([k,v,c])=>(
              <div key={k as string} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,.05)',fontSize:11}}>
                <span style={{color:'#5a8ea8'}}>{k as string}</span>
                <span className={c as string} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v as string}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TabBroadcast(_props: { isSA:boolean }) {
  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [pesan,   setPesan]   = useState('');
  const [target,  setTarget]  = useState('');
  const [loading, setLoad]    = useState(false);
  const [ok,      setOk]      = useState('');
  const [err,     setErr]     = useState('');

  const loadHistory = useCallback(async()=>{
    const r = await fetchJson<BroadcastRow[]>('/api/admin/broadcast');
    if (r.ok && r.data) setHistory(r.data);
  },[]);

  useEffect(()=>{ loadHistory(); },[loadHistory]);

  async function kirim() {
    if (!pesan.trim()) return;
    setLoad(true); setOk(''); setErr('');
    try {
      const j = await fetchJson('/api/admin/broadcast',{method:'POST',body:JSON.stringify({pesan,targetRole:target||undefined})});
      if (j.ok) {
        const sent = (j as { sent?: number }).sent ?? 0;
        setOk(`Broadcast terkirim ke ${sent} user.`); setPesan(''); setTarget(''); loadHistory();
      }
      else setErr(j.message);
    } finally { setLoad(false); }
  }

  return (
    <div>
      <div className="ap-section-title">KIRIM BROADCAST</div>
      {ok  && <div className="msg-ok"  style={{marginBottom:12}}>{ok}</div>}
      {err && <div className="msg-err" style={{marginBottom:12}}>{err}</div>}
      <div className="ap-card" style={{marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 200px',gap:10,marginBottom:10}}>
          <textarea className="ap-input" rows={3} placeholder="Tulis pesan broadcast..." value={pesan} onChange={e=>setPesan(e.target.value)} style={{resize:'vertical'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <select className="ap-select" style={{width:'100%'}} value={target} onChange={e=>setTarget(e.target.value)}>
              <option value="">Semua Role</option>
              {ALL_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <button className="ap-btn ap-btn-green" onClick={kirim} disabled={loading||!pesan.trim()}>
              <Send size={12}/>{loading?'KIRIM...':'KIRIM'}
            </button>
          </div>
        </div>
        <div style={{fontSize:10,color:'#5a8ea8'}}>{pesan.length}/500 karakter</div>
      </div>

      <div className="ap-section-title">RIWAYAT BROADCAST</div>
      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr><th>WAKTU</th><th>PENERIMA</th><th>PESAN</th></tr></thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={3} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Belum ada broadcast</td></tr>
            ) : history.map(h=>(
              <tr key={h.id}>
                <td style={{fontSize:11,color:'#5a8ea8',whiteSpace:'nowrap'}}>{fmtTs(h.created_at)}</td>
                <td><span className="ap-badge badge-cyan">{h.recipient}</span></td>
                <td style={{fontSize:12,color:'#a0cfe0',maxWidth:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.pesan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabAuditTrail() {
  const [rows,   setRows]   = useState<AuditRow[]>([]);
  const [loading,setLoad]   = useState(false);
  const [event,  setEvent]  = useState('');
  const [user,   setUser]   = useState('');
  const [page,   setPage]   = useState(1);
  const [pages,  setPages]  = useState(1);
  const [total,  setTotal]  = useState(0);

  const load = useCallback(async(pg=1)=>{
    setLoad(true);
    try {
      const p = new URLSearchParams({page:String(pg),limit:'50'});
      if (event) p.set('event',event);
      if (user)  p.set('username',user);
      const r = await fetchJson<AuditRow[]>(`/api/admin/audit-log?${p}`);
      if (r.ok && r.data) {
        const pg2 = (r as { pagination?: { page: number; totalPages: number; total: number } }).pagination;
        setRows(r.data);
        if (pg2) { setPage(pg2.page); setPages(pg2.totalPages); setTotal(pg2.total); }
      }
    } finally { setLoad(false); }
  },[event,user]);

  useEffect(()=>{ load(1); },[load]);

  function eventBadge(ev:string) {
    if (ev==='LOGIN_SUCCESS') return <span className="ap-badge badge-green">{ev}</span>;
    if (ev==='LOGOUT')        return <span className="ap-badge badge-gray">{ev}</span>;
    if (ev.includes('FAILED')||ev.includes('BLOCKED')||ev.includes('LOCKED')) return <span className="ap-badge badge-red">{ev}</span>;
    return <span className="ap-badge badge-yellow">{ev}</span>;
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div className="ap-section-title" style={{margin:0}}>AUDIT TRAIL — {total} ENTRI</div>
        <div className="ap-row">
          <select className="ap-select" value={event} onChange={e=>{setEvent(e.target.value);load(1);}}>
            <option value="">Semua Event</option>
            {['LOGIN_SUCCESS','LOGIN_FAILED','LOGIN_BLOCKED','ACCOUNT_LOCKED','LOGOUT','SIGNUP','PASSWORD_RESET','SESSION_EXPIRED','BROADCAST','BRUTE_FORCE'].map(e=><option key={e} value={e}>{e}</option>)}
          </select>
          <input className="ap-input" style={{width:160}} placeholder="Filter username..." value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')load(1);}}/>
          <button className="ap-btn ap-btn-cyan" onClick={()=>load(1)} disabled={loading}><RefreshCw size={12}/></button>
        </div>
      </div>
      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr><th>WAKTU</th><th>EVENT</th><th>USERNAME</th><th>IP</th><th>DETAIL</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada data</td></tr>
            ) : rows.map(r=>(
              <tr key={r.id}>
                <td style={{fontSize:11,color:'#5a8ea8',whiteSpace:'nowrap'}}>{fmtTs(r.created_at)}</td>
                <td>{eventBadge(r.event_type)}</td>
                <td style={{fontWeight:700,color:'#e0f7ff'}}>{r.username??'-'}</td>
                <td style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#5a8ea8'}}>{r.ip_address??'-'}</td>
                <td style={{fontSize:11,color:'#a0cfe0'}}>{r.detail??'-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:12}}>
          <button className="ap-btn ap-btn-cyan" disabled={page<=1} onClick={()=>load(page-1)}><ChevronLeft size={12}/></button>
          <span style={{fontSize:11,color:'#5a8ea8',alignSelf:'center'}}>Hal {page}/{pages}</span>
          <button className="ap-btn ap-btn-cyan" disabled={page>=pages} onClick={()=>load(page+1)}><ChevronRight size={12}/></button>
        </div>
      )}
    </div>
  );
}

interface EmailQuota { sentToday:number; sentMonth:number; dailyLimit:number; monthlyLimit:number; provider:string; plan:string; }

function QuotaBar({used,limit,color}:{used:number;limit:number;color:string}) {
  const pct = Math.min((used/limit)*100, 100);
  const dangerColor = pct > 80 ? '#ff4466' : pct > 60 ? '#ffcc00' : color;
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#5a8ea8',marginBottom:4}}>
        <span style={{color:dangerColor,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{used} terkirim</span>
        <span>{limit - used} sisa dari {limit}</span>
      </div>
      <div style={{height:6,borderRadius:3,background:'rgba(0,212,255,.08)',overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,borderRadius:3,
          background:`linear-gradient(90deg,${color},${dangerColor})`,
          transition:'width .5s ease',boxShadow:`0 0 6px ${dangerColor}60`}}/>
      </div>
    </div>
  );
}

interface EmailLogRow {
  id: number; sent_at: string; recipient: string; subject: string;
  event_type: string; status: string; error_msg: string | null;
}

function TabEmailNotif({ isSA }: { isSA:boolean }) {
  const [settings, setSettings] = useState({
    enabled:false, onUsulanBaru:false, onDisetujui:false, onDitolak:false, onRevisi:false,
    onPromotionNew:false, onPromotionApproved:false, onPromotionRejected:false, onPromotionBootstrap:false,
    recipientAdmin:'',
  });
  const [quota,    setQuota]    = useState<EmailQuota|null>(null);
  const [logRows,  setLogRows]  = useState<EmailLogRow[]>([]);
  const [errTip,   setErrTip]   = useState<{top:number;left:number;text:string}|null>(null);
  const [loading,  setLoad]     = useState(false);
  const [ok,       setOk]       = useState('');
  const [err,      setErr]      = useState('');

  const loadAll = useCallback(async ()=>{
    const [cfg,q,lg] = await Promise.all([
      fetchJson('/api/config'),
      fetchJson('/api/admin/email-quota'),
      fetchJson('/api/admin/email-log?limit=20'),
    ]);
    if (cfg.ok) {
      const c = (cfg as { data?: Record<string,string> }).data;
      if (c) {
        setSettings({
          enabled:              c.email_notif_enabled==='true',
          onUsulanBaru:         c.email_notif_usulan_baru==='true',
          onDisetujui:          c.email_notif_disetujui==='true',
          onDitolak:            c.email_notif_ditolak==='true',
          onRevisi:             c.email_notif_revisi==='true',
          onPromotionNew:       c.email_notif_promotion_new_request==='true',
          onPromotionApproved:  c.email_notif_promotion_approved==='true',
          onPromotionRejected:  c.email_notif_promotion_rejected==='true',
          onPromotionBootstrap: c.email_notif_promotion_bootstrap==='true',
          recipientAdmin:       c.email_notif_recipient??'',
        });
      }
    }
    if (q.ok) setQuota(q as unknown as EmailQuota);
    if (lg.ok) setLogRows((lg as unknown as { rows: EmailLogRow[] }).rows ?? []);
  }, []);

  useEffect(()=>{ void loadAll(); },[loadAll]);

  useEffect(()=>{
    const t = setInterval(()=>{ void loadAll(); }, 30_000);
    return ()=>clearInterval(t);
  },[loadAll]);

  async function save() {
    if (!isSA) return;
    setLoad(true); setOk(''); setErr('');
    try {
      const entries = [
        ['email_notif_enabled',                 String(settings.enabled)],
        ['email_notif_usulan_baru',             String(settings.onUsulanBaru)],
        ['email_notif_disetujui',               String(settings.onDisetujui)],
        ['email_notif_ditolak',                 String(settings.onDitolak)],
        ['email_notif_revisi',                  String(settings.onRevisi)],
        ['email_notif_promotion_new_request',   String(settings.onPromotionNew)],
        ['email_notif_promotion_approved',      String(settings.onPromotionApproved)],
        ['email_notif_promotion_rejected',      String(settings.onPromotionRejected)],
        ['email_notif_promotion_bootstrap',     String(settings.onPromotionBootstrap)],
        ['email_notif_recipient',               settings.recipientAdmin],
      ];
      for (const [key,value] of entries) {
        const j = await fetchJson('/api/config',{method:'POST',body:JSON.stringify({key,value})});
        if (!j.ok) { setErr(j.message); return; }
      }
      setOk('Pengaturan email berhasil disimpan.');
    } finally { setLoad(false); }
  }

  const toggle = (k: keyof typeof settings, v: boolean) => setSettings(p=>({...p,[k]:v}));

  return (
    <div>
      <div className="ap-section-title">PENGATURAN EMAIL NOTIFIKASI</div>
      {!isSA && <div className="msg-err" style={{marginBottom:12}}>Hanya SUPER_ADMIN yang dapat mengubah pengaturan email.</div>}
      {ok  && <div className="msg-ok"  style={{marginBottom:12}}>{ok}</div>}
      {err && <div className="msg-err" style={{marginBottom:12}}>{err}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'start'}}>
        {/* Konfigurasi */}
        <div className="ap-card">
          <div className="ap-card-title">KONFIGURASI NOTIFIKASI</div>
          <div style={{marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(0,212,255,.1)'}}>
              <span style={{fontSize:13,color:'#e0f7ff',fontWeight:700}}>Email Notifikasi Aktif</span>
              <label className="ap-toggle">
                <input type="checkbox" checked={settings.enabled} onChange={e=>toggle('enabled',e.target.checked)} disabled={!isSA}/>
                <div className="ap-toggle-track"/><div className="ap-toggle-thumb"/>
              </label>
            </div>
            {!settings.enabled && isSA && (
              <div style={{fontSize:12,fontWeight:600,color:'#FFE08A',letterSpacing:.2,marginTop:12,marginBottom:8,padding:'10px 14px',background:'rgba(186,117,23,.35)',border:'1px solid #FFC857',borderRadius:6,display:'flex',alignItems:'center',gap:10,boxShadow:'0 0 16px rgba(255,200,87,.15)'}}>
                <span style={{fontSize:16,color:'#FFC857'}}>⚠</span>
                <span>Aktifkan master toggle <b style={{color:'#FFF6D6'}}>Email Notifikasi Aktif</b> di atas untuk mengatur per-event.</span>
              </div>
            )}
            <div style={{opacity:!isSA||!settings.enabled?.4:1,transition:'opacity .2s',pointerEvents:!isSA||!settings.enabled?'none':'auto'}}>
              <div style={{fontSize:10,color:'#5a8ea8',letterSpacing:.5,marginTop:14,marginBottom:4}}>USULAN</div>
              {[['onUsulanBaru','Usulan Baru Masuk'],['onDisetujui','Usulan Disetujui'],['onDitolak','Usulan Ditolak'],['onRevisi','Usulan Direvisi']].map(([k,l])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                  <span style={{fontSize:12,color:'#a0cfe0'}}>{l}</span>
                  <label className="ap-toggle">
                    <input type="checkbox" checked={settings[k as keyof typeof settings] as boolean}
                      onChange={e=>toggle(k as keyof typeof settings,e.target.checked)} disabled={!isSA||!settings.enabled}/>
                    <div className="ap-toggle-track"/><div className="ap-toggle-thumb"/>
                  </label>
                </div>
              ))}
              <div style={{fontSize:10,color:'#5a8ea8',letterSpacing:.5,marginTop:14,marginBottom:4}}>PROMOTION ROLE</div>
              {[
                ['onPromotionNew',       'Permohonan Upgrade Baru'],
                ['onPromotionApproved',  'Upgrade di-Approve'],
                ['onPromotionRejected',  'Upgrade di-Reject'],
                ['onPromotionBootstrap', 'Bootstrap SUPER_ADMIN (alert)'],
              ].map(([k,l])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                  <span style={{fontSize:12,color:'#a0cfe0'}}>{l}</span>
                  <label className="ap-toggle">
                    <input type="checkbox" checked={settings[k as keyof typeof settings] as boolean}
                      onChange={e=>toggle(k as keyof typeof settings,e.target.checked)} disabled={!isSA||!settings.enabled}/>
                    <div className="ap-toggle-track"/><div className="ap-toggle-thumb"/>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:'#5a8ea8',marginBottom:6,letterSpacing:.5}}>EMAIL PENERIMA ADMIN</div>
            <input className="ap-input" type="email" placeholder="admin@example.com" value={settings.recipientAdmin}
              onChange={e=>setSettings(p=>({...p,recipientAdmin:e.target.value}))} disabled={!isSA}/>
          </div>
          {isSA && (
            <button className="ap-btn ap-btn-green" onClick={save} disabled={loading}>
              <FileText size={12}/>{loading?'MENYIMPAN...':'SIMPAN PENGATURAN'}
            </button>
          )}
        </div>

        {/* Email Quota */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="ap-card">
            <div className="ap-card-title">EMAIL QUOTA</div>
            {quota ? (
              <>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,padding:'10px 14px',
                  background:'rgba(0,212,255,.04)',border:'1px solid rgba(0,212,255,.12)',borderRadius:8}}>
                  <Mail size={18} color="#00d4ff"/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'#e0f7ff'}}>{quota.provider}</div>
                    <div style={{fontSize:10,color:'#5a8ea8'}}>Plan: <span style={{color:'#00ffc8',fontWeight:700}}>{quota.plan}</span></div>
                  </div>
                  <div style={{marginLeft:'auto',textAlign:'right'}}>
                    <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:1}}>STATUS</div>
                    <span className="ap-badge badge-green" style={{fontSize:9}}>
                      <span className="dot-active"/>AKTIF
                    </span>
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:11,color:'#a0cfe0',fontWeight:600}}>Hari Ini</span>
                    <span style={{fontSize:10,color:'#5a8ea8'}}>Limit: {quota.dailyLimit}/hari</span>
                  </div>
                  <QuotaBar used={quota.sentToday} limit={quota.dailyLimit} color="#00d4ff"/>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:11,color:'#a0cfe0',fontWeight:600}}>Bulan Ini</span>
                    <span style={{fontSize:10,color:'#5a8ea8'}}>Limit: {quota.monthlyLimit}/bulan</span>
                  </div>
                  <QuotaBar used={quota.sentMonth} limit={quota.monthlyLimit} color="#00ffc8"/>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[
                    ['Terkirim Hari Ini', quota.sentToday, '#00d4ff'],
                    ['Sisa Hari Ini',     quota.dailyLimit-quota.sentToday, '#00ffc8'],
                    ['Terkirim Bulan Ini',quota.sentMonth, '#00d4ff'],
                    ['Sisa Bulan Ini',    quota.monthlyLimit-quota.sentMonth,'#00ffc8'],
                  ].map(([l,v,c])=>(
                    <div key={l as string} style={{textAlign:'center',padding:'8px 6px',
                      background:'rgba(0,212,255,.03)',border:'1px solid rgba(0,212,255,.08)',borderRadius:6}}>
                      <div style={{fontSize:20,fontWeight:400,color:c as string,fontFamily:"'JetBrains Mono',monospace"}}>{v as number}</div>
                      <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:.5,marginTop:2}}>{l as string}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{textAlign:'center',padding:24,color:'#5a8ea8',fontSize:12}}>Memuat data quota...</div>
            )}
          </div>

          <div className="ap-card">
            <div className="ap-card-title">INFO PROVIDER</div>
            {[
              ['Provider',     quota?.provider??'Gmail',   'cyan'],
              ['From Email',   process.env.NEXT_PUBLIC_GMAIL_USER??'admin@example.com', 'cyan'],
              ['Daily Limit',  `${quota?.dailyLimit??500} email`, 'green'],
              ['Monthly Limit',`${quota?.monthlyLimit??15000} email`,'green'],
              ['Status',       quota?'Terhubung':'Memuat...', quota?'green':'yellow'],
            ].map(([k,v,c])=>(
              <div key={k as string} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(0,212,255,.05)',fontSize:11}}>
                <span style={{color:'#5a8ea8'}}>{k as string}</span>
                <span className={c as string} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:10}}>{v as string}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ap-card" style={{marginTop:16}}>
        <div className="ap-card-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>RIWAYAT EMAIL TERKIRIM (20 TERAKHIR)</span>
          <span style={{fontSize:9,color:'#5a8ea8',letterSpacing:.5,fontWeight:400}}>AUTO-REFRESH 30s</span>
        </div>
        {logRows.length === 0 ? (
          <div style={{textAlign:'center',padding:24,color:'#5a8ea8',fontSize:12}}>Belum ada riwayat email.</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(0,212,255,.15)'}}>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>WAKTU</th>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>PENERIMA</th>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>EVENT</th>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>SUBJECT</th>
                  <th style={{textAlign:'center',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map(r=>{
                  const badgeColor =
                    r.status==='SENT'             ? '#1D9E75' :
                    r.status==='FAILED'           ? '#E24B4A' :
                    r.status==='SKIPPED_TOGGLE'   ? '#BA7517' :
                    '#5a8ea8';
                  const ts = r.sent_at ? new Date(r.sent_at).toLocaleString('id-ID',{hour12:false}) : '-';
                  const hasErr = !!r.error_msg;
                  return (
                    <tr key={r.id} style={{borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                      <td style={{padding:'7px 6px',color:'#a0cfe0',fontFamily:"'JetBrains Mono',monospace",fontSize:10,whiteSpace:'nowrap'}}>{ts}</td>
                      <td style={{padding:'7px 6px',color:'#e0f7ff',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.recipient}</td>
                      <td style={{padding:'7px 6px',color:'#a0cfe0',fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>{r.event_type}</td>
                      <td style={{padding:'7px 6px',color:'#a0cfe0',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.subject}</td>
                      <td style={{padding:'7px 6px',textAlign:'center'}}>
                        <span
                          onMouseEnter={hasErr ? (e)=>{
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setErrTip({ top: rect.top - 6, left: rect.left + rect.width/2, text: r.error_msg! });
                          } : undefined}
                          onMouseLeave={hasErr ? ()=>setErrTip(null) : undefined}
                          style={{display:'inline-block',padding:'2px 8px',borderRadius:4,background:`${badgeColor}22`,
                            color:badgeColor,fontSize:9,fontWeight:700,letterSpacing:.5,fontFamily:"'JetBrains Mono',monospace",
                            cursor:hasErr?'help':'default'}}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {errTip && typeof window !== 'undefined' && createPortal(
        <div className="blud-tip-portal" style={{
          position:'fixed', top:errTip.top, left:errTip.left,
          whiteSpace:'normal', maxWidth:360, textAlign:'left', lineHeight:1.4,
        }}>
          {errTip.text}
        </div>,
        document.body,
      )}
    </div>
  );
}
