'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, LogOut, Settings, User,
  BarChart3, ClipboardList, FileText, BookText,
  Handshake, Building2, ShieldCheck, ArrowRight, Lock,
  ArrowUpCircle, Clock, LayoutDashboard,
} from 'lucide-react';
import { APP_NAME, APP_INSTANSI, ROLE_LABELS, ADMIN_ROLES } from '@/lib/constants';
import type { Role } from '@/types';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { PromotionRequestModal } from '@/components/promotion/PromotionRequestModal';
import { PromotionStatusModal } from '@/components/promotion/PromotionStatusModal';
import { ProbationBanner } from '@/components/promotion/ProbationBanner';

interface Props { userId: number; role: Role; username: string; themePreference: 'dark' | 'light'; }

const APP_CARDS = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    desc: 'Ringkasan lintas modul',
    icon: LayoutDashboard,
    accent: '#378ADD',
    accentBg: 'rgba(55,138,221,0.12)',
    badge: 'LIVE',
    href: '/dashboard',
    roles: null,
  },
  {
    id: 'rencana_aksi',
    name: 'Renaksi & Kinerja',
    desc: 'Monitoring Renaksi & Kinerja',
    icon: ClipboardList,
    accent: '#378ADD',
    accentBg: 'rgba(55,138,221,0.12)',
    badge: 'LIVE',
    href: '/rencana-aksi',
    roles: null,
  },
  {
    id: 'buku_besar_aset',
    name: 'Buku Besar Aset',
    desc: 'Register belanja modal lintas-tahun',
    icon: FileText,
    accent: '#EF9F27',
    accentBg: 'rgba(239,159,39,0.12)',
    badge: 'LIVE',
    href: '/buku-besar-aset',
    roles: null,
  },
  {
    id: 'blud',
    name: 'BLUD',
    desc: 'DPA & Pergeseran Anggaran BLUD',
    icon: Building2,
    accent: '#1D9E75',
    accentBg: 'rgba(29,158,117,0.12)',
    badge: 'LIVE',
    href: '/blud',
    roles: null,
  },
  {
    id: 'perjanjian_kinerja',
    name: 'Perjanjian Kinerja',
    desc: 'Perjanjian Kinerja Pegawai',
    icon: Handshake,
    accent: '#7C5CFC',
    accentBg: 'rgba(124,92,252,0.12)',
    badge: 'LIVE',
    href: '/perjanjian-kinerja',
    roles: null,
  },
  {
    id: 'lkjip',
    name: 'E-LKJIP',
    desc: 'Laporan Kinerja Instansi Pemerintah',
    icon: BookText,
    accent: '#378ADD',
    accentBg: 'rgba(55,138,221,0.12)',
    badge: 'LIVE',
    href: '/lkjip',
    roles: null,
  },
  {
    id: 'new_econtrolling',
    name: 'E-Anggaran',
    desc: 'E-Controlling Anggaran',
    icon: BarChart3,
    accent: '#1D9E75',
    accentBg: 'rgba(29,158,117,0.12)',
    badge: 'LIVE',
    href: '/kinerja',
    roles: null,
  },
  {
    id: 'usulan_aset',
    name: 'Usulan Kebutuhan',
    desc: 'Pengajuan & Persetujuan Belanja',
    icon: FileText,
    accent: '#EF9F27',
    accentBg: 'rgba(239,159,39,0.12)',
    badge: 'LIVE',
    href: '/usulan-kebutuhan',
    roles: null,
  },
  {
    id: 'admin',
    name: 'Admin Panel',
    desc: 'Manajemen Pengguna & Sistem',
    icon: ShieldCheck,
    accent: '#E24B4A',
    accentBg: 'rgba(226,75,74,0.12)',
    badge: 'ADMIN',
    href: '/admin',
    roles: ['SUPER_ADMIN'] as Role[],
  },
];

export default function MenuClient({ userId: _userId, role, username, themePreference }: Props) {
  void _userId;
  const router = useRouter();
  const dropRef             = useRef<HTMLDivElement>(null);
  const [dropOpen,    setDropOpen]    = useState(false);
  const [loggingOut,  setLoggingOut]  = useState(false);
  const [appStatus,   setAppStatus]   = useState<Record<string, string>>({});
  const [userAccess,  setUserAccess]  = useState<string[] | null>(null);
  // Promotion ladder state
  const [eligibleTargets, setEligibleTargets] = useState<readonly string[]>([]);
  const [activeReq, setActiveReq] = useState<{
    id: number; toRole: string; status: 'PENDING' | 'COOLDOWN';
    createdAt: string; cooldownUntil: string | null;
  } | null>(null);
  const [showPromoModal,  setShowPromoModal]  = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  // Track current theme untuk inline style computation
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = currentTheme === 'light';

  // Apply theme from DB on mount (authoritative source beats cookie)
  useEffect(() => {
    if (themePreference === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    document.cookie = `prima_theme=${themePreference};path=/;max-age=31536000;SameSite=Lax`;
  }, [themePreference]);

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/app-status').then(r => r.json()),
      fetch('/api/user/access').then(r => r.json()),
    ]).then(([st, ac]) => {
      if (st.ok) setAppStatus(st.data);
      if (ac.ok) setUserAccess(ac.app_access);
    }).catch(() => {});
  }, []);

  const loadPromotion = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/promotion/eligible-targets');
      const json = await res.json() as {
        ok: boolean;
        data?: {
          eligibleTargets: string[];
          activeRequest: {
            id: number; toRole: string; status: 'PENDING' | 'COOLDOWN';
            createdAt: string; cooldownUntil: string | null;
          } | null;
        };
      };
      if (json.ok && json.data) {
        setEligibleTargets(json.data.eligibleTargets);
        setActiveReq(json.data.activeRequest);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadPromotion(); }, [loadPromotion]);

  // Tutup dropdown klik luar
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials   = username.slice(0, 2).toUpperCase();
  const roleLabel  = ROLE_LABELS[role] ?? role;
  const isAdmin    = (ADMIN_ROLES as readonly string[]).includes(role);
  const visibleCards = APP_CARDS.filter(c => !c.roles || c.roles.includes(role));

  function isLocked(card: typeof APP_CARDS[0]): boolean {
    if (card.id === 'admin') return false;
    return userAccess !== null && !userAccess.includes(card.id);
  }

  function handleCardClick(card: typeof APP_CARDS[0]) {
    if (isLocked(card)) return;
    const statusKey = `app_status_${card.id}`;
    if (appStatus[statusKey] === 'maintenance' && role !== 'SUPER_ADMIN') {
      router.push(`/maintenance?app=${encodeURIComponent(card.name)}`);
    } else {
      router.push(card.href);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch { setLoggingOut(false); }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        @keyframes shimmer     { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
        @keyframes orb-float   { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(28px,18px) scale(1.05); } }
        @keyframes orb-float-2 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(-22px,24px) scale(1.04); } }
        @keyframes orb-float-3 { 0%,100% { transform:translate(0,0) scale(1); } 50% { transform:translate(16px,-20px) scale(1.06); } }
        @keyframes fade-up     { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse-dot   { 0%,100% { opacity:1; } 50% { opacity:.35; } }
        @keyframes live-glow   { 0% { box-shadow:0 0 0 0 rgba(2,15,28,.5); } 70%,100% { box-shadow:0 0 0 5px rgba(2,15,28,0); } }
        @keyframes gold-pulse  { 0%,100% { box-shadow:0 0 0 0 rgba(239,159,39,.35); } 50% { box-shadow:0 0 0 6px rgba(239,159,39,0); } }

        .fade-up   { animation: fade-up .45s ease both; }
        .fade-up-1 { animation: fade-up .45s .05s ease both; }
        .fade-up-2 { animation: fade-up .45s .10s ease both; }

        /* ── Canvas ── */
        .menu-body {
          min-height: 100vh;
          background: #020F1C;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          font-family: var(--font-jakarta), 'Inter', ui-sans-serif, system-ui, sans-serif;
          color: #E6F1FB;
          position: relative; overflow-x: hidden;
        }

        /* ── Orbs ── */
        .orb {
          position: fixed; border-radius: 50%;
          filter: blur(90px); opacity: 1;
          pointer-events: none; z-index: 0;
        }
        .orb-1 { width: 520px; height: 520px; background: rgba(239,159,39,0.07); top: -140px; left: -100px; animation: orb-float 14s ease-in-out infinite alternate; }
        .orb-2 { width: 400px; height: 400px; background: rgba(24,95,165,0.22); bottom: -80px; right: -80px; animation: orb-float-2 16s ease-in-out infinite alternate; }
        .orb-3 { width: 300px; height: 300px; background: rgba(239,159,39,0.04); top: 45%; left: 50%; transform: translate(-50%,-50%); animation: orb-float-3 11s ease-in-out infinite alternate; }

        /* ── HEADER ── */
        .m-header {
          position: fixed; top: 0; left: 0; right: 0; height: 60px;
          background: rgba(4,44,83,0.92);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid #0C447C;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 28px; z-index: 100;
        }
        .m-header::after {
          content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(239,159,39,0.4), transparent);
          pointer-events: none;
        }

        /* ── Brand ── */
        .m-brand { display: flex; align-items: center; gap: 10px; cursor: default; }
        .m-brand-icon {
          width: 32px; height: 32px; border-radius: 9px;
          background: linear-gradient(135deg,#633806,rgba(239,159,39,0.35));
          border: 1.5px solid rgba(239,159,39,0.4);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 10px rgba(239,159,39,0.2);
        }
        .m-wordmark {
          font-size: 16px; font-weight: 900; letter-spacing: -.3px;
          background: linear-gradient(135deg,#EF9F27,#FAC775);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .m-subtitle { font-size: 9.5px; font-weight: 500; color: #85B7EB; margin-top: 1px; letter-spacing: .2px; }

        /* ── User badge ── */
        .user-trigger {
          display: flex; align-items: center; gap: 9px; cursor: pointer;
          padding: 4px 12px 4px 4px; border-radius: 40px;
          border: 1.5px solid rgba(239,159,39,0.2);
          background: rgba(239,159,39,0.05);
          transition: all .2s; user-select: none;
        }
        .user-trigger:hover {
          border-color: rgba(239,159,39,0.45);
          background: rgba(239,159,39,0.09);
        }
        .user-avatar {
          width: 30px; height: 30px; border-radius: 50%;
          background: linear-gradient(135deg,#633806,#EF9F27);
          color: #020F1C; font-weight: 900; font-size: 11px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
          box-shadow: 0 0 0 2px rgba(239,159,39,0.3);
        }
        .user-name { font-size: 13px; font-weight: 700; color: #E6F1FB; line-height: 1.2; }
        .user-role { font-size: 10px; color: #85B7EB; font-weight: 500; }

        /* ── Dropdown ── */
        .dropdown {
          position: absolute; top: calc(100% + 8px); right: 0;
          width: 220px;
          background: rgba(4,44,83,0.98);
          backdrop-filter: blur(20px);
          border-radius: 12px;
          border: 1px solid #0C447C;
          box-shadow: 0 16px 48px rgba(0,0,0,.5), 0 0 0 1px rgba(239,159,39,.06);
          overflow: hidden; z-index: 200;
        }
        .drop-header { padding: 12px 14px; border-bottom: 1px solid #0C447C; }
        .drop-item {
          display: flex; align-items: center; gap: 9px;
          padding: 9px 14px; font-size: 13px; font-weight: 500;
          color: #B5D4F4; cursor: pointer; transition: background .15s, color .15s;
          border: none; background: none; width: 100%; text-align: left;
          font-family: inherit;
        }
        .drop-item:hover { background: rgba(255,255,255,0.05); color: #E6F1FB; }
        .drop-item.danger { color: #FCA5A5; }
        .drop-item.danger:hover { background: rgba(226,75,74,0.1); color: #FCA5A5; }
        .drop-divider { height: 1px; background: #0C447C; }

        /* ── Content ── */
        .m-content {
          padding-top: 80px; padding-bottom: 48px;
          max-width: 1060px; margin: 0 auto;
          padding-left: 24px; padding-right: 24px;
          position: relative; z-index: 1;
        }

        /* ── Welcome banner ── */
        .m-welcome { margin-bottom: 32px; }
        .m-welcome-tag {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 10.5px; font-weight: 700; letter-spacing: 1.4px;
          text-transform: uppercase; color: #EF9F27;
          border: 1px solid rgba(239,159,39,0.3);
          background: rgba(239,159,39,0.07);
          padding: 4px 12px; border-radius: 99px; margin-bottom: 12px;
        }
        .m-welcome h2 {
          font-size: 26px; font-weight: 900; color: #E6F1FB;
          letter-spacing: -.5px; margin-bottom: 6px;
        }
        .m-welcome h2 span {
          background: linear-gradient(135deg,#EF9F27,#FAC775);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .m-welcome p { font-size: 13.5px; color: #85B7EB; line-height: 1.5; }

        /* ── Section header ── */
        .m-section-title {
          font-size: 11px; font-weight: 700; color: #85B7EB;
          text-transform: uppercase; letter-spacing: 1.2px;
          margin-bottom: 14px; display: flex; align-items: center; gap: 8px;
        }
        .m-section-title::after {
          content: ''; flex: 1; height: 1px; background: #0C447C;
        }

        /* ── App grid ── */
        .app-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px;
        }
        @media (max-width: 900px) { .app-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 560px) { .app-grid { grid-template-columns: 1fr; } }

        /* ── Brutalist app card (theme-aware, warna per-modul via --cardc) ── */
        .app-card {
          --cardc: #185FA5;
          background: #042C53;
          border: 3px solid var(--cardc);
          cursor: pointer; position: relative; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 5px 5px 0 rgba(0,0,0,.45);
          transition: transform .15s, box-shadow .15s;
        }
        .app-card:hover  { transform: translate(-2px,-2px); box-shadow: 8px 8px 0 rgba(0,0,0,.5); }
        .app-card:active { transform: translate(0,0);       box-shadow: 3px 3px 0 rgba(0,0,0,.45); }
        .app-card.locked { opacity: .45; filter: grayscale(.7); cursor: not-allowed; }
        .app-card.maintenance { opacity: .72; filter: grayscale(.25); }

        /* header band */
        .card-band {
          position: relative; height: 92px; overflow: hidden;
          background: color-mix(in srgb, var(--cardc) 22%, #042C53);
          display: flex; align-items: flex-end;
        }
        .card-band::before {
          content: ''; position: absolute; inset: 0;
          background: repeating-linear-gradient(45deg, transparent 0 8px, rgba(255,255,255,.05) 8px 10px);
        }
        .card-watermark {
          position: absolute; right: -4px; bottom: -18px; z-index: 0;
          font-size: 82px; font-weight: 900; line-height: .8;
          color: color-mix(in srgb, var(--cardc) 38%, transparent); letter-spacing: -4px; pointer-events: none;
        }
        .card-iconbox {
          width: 54px; height: 54px; margin-left: 16px; position: relative; z-index: 1;
          background: #020F1C; border: 3px solid #020F1C; border-bottom: none; border-left: none;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .card-statusbadge {
          position: absolute; top: 12px; right: 12px; z-index: 2;
          font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
          color: #020F1C; padding: 3px 8px;
          border: 2px solid #020F1C; box-shadow: 2px 2px 0 #020F1C;
          display: inline-flex; align-items: center; gap: 5px;
        }
        .dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }
        .card-statusbadge .dot { animation: live-glow 1.5s ease-out infinite; }

        /* body */
        .card-body { padding: 14px 16px 14px; flex: 1; display: flex; flex-direction: column; }
        .card-handle { font-size: 9px; font-weight: 700; letter-spacing: .14em; color: #85B7EB; text-transform: uppercase; margin-bottom: 4px; }
        .card-name { font-size: 21px; font-weight: 900; line-height: .98; color: #E6F1FB; letter-spacing: -.4px; margin-bottom: 9px; }
        .card-desc { font-size: 11.5px; color: #B5D4F4; line-height: 1.5; border-left: 4px solid var(--cardc); padding-left: 9px; }

        /* CTA */
        .card-cta {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 12px; border-top: 3px solid var(--cardc);
          background: var(--cardc); color: #fff;
          font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase;
          transition: filter .15s;
        }
        .app-card:hover .card-cta { filter: brightness(1.14); }

        /* ── Brand card (brutalist twitter-style, theme-aware) ── */
        .m-stats { margin-bottom: 24px; }
        .brand-card {
          width: 440px; max-width: 100%;
          border: 3px solid #185FA5; box-shadow: 5px 5px 0 rgba(239,159,39,.30);
          overflow: hidden; transition: transform .2s, box-shadow .2s;
        }
        .brand-card:hover { transform: translate(-2px,-2px); box-shadow: 7px 7px 0 rgba(239,159,39,.40); }
        .bc-header { background: linear-gradient(135deg,#FAC775,#EF9F27); color: #020F1C; padding: 9px 16px; }
        .bc-top { display: flex; align-items: center; justify-content: space-between; }
        .bc-brand { display: flex; align-items: center; gap: 8px; }
        .bc-status { display: inline-flex; align-items: center; gap: 5px; background: rgba(2,15,28,.16); padding: 3px 9px; border-radius: 14px; font-size: 10px; font-weight: 700; letter-spacing: .3px; }
        .bc-status .dot { width: 5px; height: 5px; border-radius: 50%; background: #0a7a52; animation: live-glow 1.5s ease-out infinite; }
        .bc-name { font-size: 17px; font-weight: 900; letter-spacing: -.4px; line-height: 1; }
        .bc-stats { display: flex; background: #042C53; }
        .bc-stat { flex: 1; text-align: center; padding: 6px 6px; }
        .bc-stat:not(:last-child) { border-right: 2px solid #0C447C; }
        .bc-num { font-size: 14px; font-weight: 900; color: #E6F1FB; line-height: 1; margin-bottom: 2px; font-family: 'JetBrains Mono','Courier New',monospace; }
        .bc-lbl { font-size: 8.5px; font-weight: 600; color: #85B7EB; text-transform: uppercase; letter-spacing: .5px; }

        /* ── Footer ── */
        .m-footer { text-align: center; padding: 24px 0 8px; font-size: 11px; color: #85B7EB; opacity: .6; }

        /* ══════════════════════════════════════════════════════════════════
           LIGHT THEME OVERRIDES — data-theme="light" pada <html>
           Token dari docs/design/DESIGN-SYSTEM.md §12 (ungu-pink gradient)
           Ditulis di sini agar source-order setelah dark defaults.
           ══════════════════════════════════════════════════════════════════ */

        [data-theme="light"] .menu-body {
          background-color: #FAFAFB;
          background-image:
            linear-gradient(rgba(15,15,18,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(15,15,18,0.025) 1px, transparent 1px);
          color: #0F0F12;
        }
        [data-theme="light"] .orb-1 { background: radial-gradient(ellipse, rgba(139,92,246,0.08), transparent 70%); }
        [data-theme="light"] .orb-2 { background: radial-gradient(ellipse, rgba(236,72,153,0.08), transparent 70%); }
        [data-theme="light"] .orb-3 { background: radial-gradient(ellipse, rgba(139,92,246,0.04), transparent 70%); }

        [data-theme="light"] .m-header {
          background: rgba(250,250,250,0.93);
          border-bottom-color: #E5E5EA;
          box-shadow: 0 2px 12px rgba(15,15,18,0.07);
        }
        [data-theme="light"] .m-header::after {
          background: linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent);
        }
        [data-theme="light"] .m-subtitle { color: #8A8A95; }

        [data-theme="light"] .m-brand-icon {
          background: linear-gradient(135deg,#8B5CF6,#EC4899);
          border: 1.5px solid rgba(139,92,246,0.4);
          box-shadow: 0 2px 10px rgba(139,92,246,0.25);
        }
        [data-theme="light"] .m-wordmark {
          background: linear-gradient(135deg,#8B5CF6,#EC4899);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        [data-theme="light"] .user-trigger {
          border-color: rgba(139,92,246,0.22);
          background: rgba(139,92,246,0.04);
        }
        [data-theme="light"] .user-trigger:hover {
          border-color: rgba(139,92,246,0.42);
          background: rgba(139,92,246,0.08);
        }
        [data-theme="light"] .user-avatar {
          background: linear-gradient(135deg,#8B5CF6,#EC4899);
          color: #FFFFFF;
          box-shadow: 0 0 0 2px rgba(139,92,246,0.3);
        }
        [data-theme="light"] .user-name  { color: #0F0F12; }
        [data-theme="light"] .user-role  { color: #8A8A95; }

        [data-theme="light"] .dropdown {
          background: rgba(250,250,250,0.98);
          border-color: #E5E5EA;
          box-shadow: 0 16px 48px rgba(15,15,18,.12), 0 0 0 1px rgba(139,92,246,.05);
        }
        [data-theme="light"] .drop-header       { border-bottom-color: #E5E5EA; }
        [data-theme="light"] .drop-item         { color: #3A3A42; }
        [data-theme="light"] .drop-item:hover   { background: rgba(139,92,246,0.05); color: #0F0F12; }
        [data-theme="light"] .drop-item.danger  { color: #E53E3E; }
        [data-theme="light"] .drop-item.danger:hover { background: rgba(229,62,62,0.06); color: #C53030; }
        [data-theme="light"] .drop-divider      { background: #E5E5EA; }

        [data-theme="light"] .m-welcome-tag {
          color: #7C3AED;
          border-color: rgba(139,92,246,0.22);
          background: rgba(139,92,246,0.07);
        }
        [data-theme="light"] .m-welcome h2      { color: #0F0F12; }
        [data-theme="light"] .m-welcome h2 span {
          background: linear-gradient(135deg,#8B5CF6,#EC4899);
          -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        [data-theme="light"] .m-welcome p       { color: #8A8A95; }

        [data-theme="light"] .m-section-title   { color: #8A8A95; }
        [data-theme="light"] .m-section-title::after { background: #E5E5EA; }

        [data-theme="light"] .app-card {
          background: #FFFFFF;
          box-shadow: 5px 5px 0 rgba(15,15,18,.18);
        }
        [data-theme="light"] .app-card:hover  { box-shadow: 8px 8px 0 rgba(15,15,18,.22); }
        [data-theme="light"] .app-card:active { box-shadow: 3px 3px 0 rgba(15,15,18,.18); }
        [data-theme="light"] .card-name   { color: #0F0F12; }
        [data-theme="light"] .card-handle { color: #9CA3AF; }
        [data-theme="light"] .card-desc   { color: #4B5563; }
        /* Light: band lebih lembut (tint accent), border + CTA tetap solid accent */
        [data-theme="light"] .card-band { background: color-mix(in srgb, var(--cardc) 16%, #fff); }
        [data-theme="light"] .card-band::before { background: repeating-linear-gradient(45deg, transparent 0 8px, rgba(0,0,0,.05) 8px 10px); }
        [data-theme="light"] .card-watermark { color: color-mix(in srgb, var(--cardc) 26%, transparent); }

        [data-theme="light"] .brand-card { border-color: #0F0F12; box-shadow: 5px 5px 0 #0F0F12; }
        [data-theme="light"] .brand-card:hover { box-shadow: 7px 7px 0 #0F0F12; }
        [data-theme="light"] .bc-stats { background: #FFFFFF; }
        [data-theme="light"] .bc-stat:not(:last-child) { border-right-color: #E5E5EA; }
        [data-theme="light"] .bc-num { color: #14171A; }
        [data-theme="light"] .bc-lbl { color: #657786; }
        [data-theme="light"] .m-footer      { color: #8A8A95; }
      `}</style>

      <div className="menu-body">
        {/* ── Orbs ── */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />

        {/* ── HEADER ── */}
        <header className="m-header">
          {/* Brand */}
          <div className="m-brand">
            <div className="m-brand-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <div>
              <div className="m-wordmark">{APP_NAME}</div>
              <div className="m-subtitle">Program Realisasi &amp; Informasi Monitoring Anggaran</div>
            </div>
          </div>

          {/* Theme Toggle — center */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            <ThemeToggle initialTheme={themePreference} onThemeChange={setCurrentTheme} />
          </div>

          {/* User badge */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              className="user-trigger"
              data-rima="menu.user-badge"
              onClick={() => setDropOpen(v => !v)}
              style={{ border: 'none' }}
            >
              <div className="user-avatar">{initials}</div>
              <div style={{ textAlign: 'left' }}>
                <div className="user-name">{username}</div>
                <div className="user-role">{roleLabel}</div>
              </div>
              <ChevronDown
                size={13} color={isLight ? '#8A8A95' : '#85B7EB'}
                style={{ transition: 'transform .2s', transform: dropOpen ? 'rotate(180deg)' : 'none', flexShrink: 0, marginLeft: 2 }}
              />
            </button>

            {dropOpen && (
              <div className="dropdown fade-up">
                <div className="drop-header">
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: isLight ? '#0F0F12' : '#E6F1FB' }}>{username}</div>
                  <div style={{ fontSize: 11, color: isLight ? '#8A8A95' : '#85B7EB', marginTop: 2 }}>{roleLabel}</div>
                </div>
                <button className="drop-item" onClick={() => { setDropOpen(false); router.push('/profil'); }}>
                  <User size={14} /> Profil Saya
                </button>
                {isAdmin && (
                  <button className="drop-item" onClick={() => { setDropOpen(false); router.push('/admin'); }}>
                    <Settings size={14} /> Admin Panel
                  </button>
                )}
                {/* Promotion ladder: conditional render based on role + active req */}
                {activeReq ? (
                  <button className="drop-item" onClick={() => { setDropOpen(false); setShowStatusModal(true); }}>
                    <Clock size={14} /> Lihat status permohonan
                  </button>
                ) : eligibleTargets.length > 0 ? (
                  <button className="drop-item" onClick={() => { setDropOpen(false); setShowPromoModal(true); }}>
                    <ArrowUpCircle size={14} /> Permohonan Upgrade Role
                  </button>
                ) : null}
                <div className="drop-divider" />
                <button className="drop-item danger" onClick={handleLogout} disabled={loggingOut}>
                  <LogOut size={14} /> {loggingOut ? 'Keluar...' : 'Keluar'}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ── CONTENT ── */}
        <main className="m-content">

          {/* Probation banner (auto-fetch dari /api/auth/me) */}
          <div style={{ marginBottom: 16 }}>
            <ProbationBanner />
          </div>

          {/* Welcome */}
          <div className="m-welcome fade-up">
            <div className="m-welcome-tag">
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: isLight ? '#8B5CF6' : '#EF9F27', display: 'inline-block' }} />
              {APP_INSTANSI}
            </div>
            <h2>Selamat datang, <span>{username}</span> 👋</h2>
            <p>{roleLabel} · Pilih modul yang ingin Anda akses</p>
          </div>

          {/* Brand card */}
          <div className="m-stats fade-up-1">
            <div className="brand-card" data-rima="menu.brand-status">
              <div className="bc-header">
                <div className="bc-top">
                  <div className="bc-brand">
                    <ShieldCheck size={18} color="#020F1C" strokeWidth={2.2} />
                    <span className="bc-name">{APP_NAME}</span>
                  </div>
                  <div className="bc-status"><span className="dot" />Online</div>
                </div>
              </div>
              <div className="bc-stats">
                <div className="bc-stat">
                  <div className="bc-num">{visibleCards.length}</div>
                  <div className="bc-lbl">Modul Aktif</div>
                </div>
                <div className="bc-stat">
                  <div className="bc-num">1.0</div>
                  <div className="bc-lbl">Versi</div>
                </div>
              </div>
            </div>
          </div>

          {/* Section title */}
          <div className="m-section-title fade-up-2">Menu Aplikasi</div>

          {/* App grid */}
          <div className="app-grid fade-up-2" data-rima="menu.daftar-app">
            {visibleCards.map(card => {
              const Icon      = card.icon;
              const locked    = isLocked(card);
              const statusKey = `app_status_${card.id}`;
              const isMaint   = !locked && card.id !== 'admin' && appStatus[statusKey] === 'maintenance' && role !== 'SUPER_ADMIN';
              const isMaintSA = !locked && card.id !== 'admin' && appStatus[statusKey] === 'maintenance' && role === 'SUPER_ADMIN';

              const badgeLabel = locked ? 'TERKUNCI' : (isMaint || isMaintSA) ? 'MAINTENANCE' : card.badge;
              // Warna badge status (brutalist: teks gelap + border hitam): hijau=LIVE, merah=admin, amber=maint, abu=locked
              const stColor = locked ? '#9CA3AF' : (isMaint || isMaintSA) ? '#EF9F27' : card.id === 'admin' ? '#E24B4A' : '#2BD46A';
              const initials = card.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();

              return (
                <div
                  key={card.id}
                  className={`app-card${locked ? ' locked' : isMaint ? ' maintenance' : isMaintSA ? ' maintenance-sa' : ''}`}
                  style={{ '--cardc': card.accent } as React.CSSProperties}
                  onClick={() => handleCardClick(card)}
                  role="button"
                  tabIndex={locked ? -1 : 0}
                  data-tooltip={isMaintSA ? 'Modul sedang maintenance. Anda bisa akses sebagai SUPER_ADMIN.' : ''}
                  onKeyDown={e => e.key === 'Enter' && handleCardClick(card)}
                >
                  <div className="card-band">
                    <div className="card-watermark">{initials}</div>
                    <div className="card-statusbadge" style={{ background: stColor }}>
                      <span className="dot" style={{ background: '#020F1C' }} />{badgeLabel}
                    </div>
                    <div className="card-iconbox"><Icon size={26} color={card.accent} strokeWidth={2} /></div>
                  </div>

                  <div className="card-body">
                    <div className="card-handle">@{card.id}</div>
                    <div className="card-name">{card.name}</div>
                    <div className="card-desc">{card.desc}</div>
                    {isMaintSA && (
                      <div style={{ fontSize: 10, color: '#EF9F27', fontWeight: 700, marginTop: 10 }}>
                        👑 Bypass aktif · hanya terlihat oleh Anda
                      </div>
                    )}
                  </div>

                  <div className="card-cta">
                    {locked ? <Lock size={15} /> : <ArrowRight size={16} />}
                    {locked ? 'Terkunci' : 'Buka'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="m-footer">
            🔒 {APP_INSTANSI} &copy; {new Date().getFullYear()} &nbsp;·&nbsp; {APP_NAME} v1.0
          </div>
        </main>
      </div>

      {/* Promotion modals */}
      {showPromoModal && (
        <PromotionRequestModal
          currentRole={role}
          eligibleTargets={eligibleTargets}
          onClose={() => setShowPromoModal(false)}
          onSuccess={() => {
            setShowPromoModal(false);
            void loadPromotion();
          }}
        />
      )}
      {showStatusModal && activeReq && (
        <PromotionStatusModal
          activeRequest={activeReq}
          onClose={() => setShowStatusModal(false)}
          onCancelled={() => {
            setShowStatusModal(false);
            void loadPromotion();
          }}
        />
      )}
    </>
  );
}
