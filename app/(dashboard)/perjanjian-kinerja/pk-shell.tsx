'use client'
// app/(dashboard)/perjanjian-kinerja/pk-shell.tsx
// Shell layout PK: TOP RIBBON nav (icon-on-top tile + section grouping) + brand strip.
// Mirror app/(dashboard)/blud/blud-shell.tsx — slimmed (no overflow since 7 tiles fit MAX_INLINE=8).
// Tambahan unik PK: dropdown tahun global di brand strip kanan (consume PkYearContext).

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, ClipboardList, LogOut, ShieldCheck, ChevronDown, Menu as MenuIcon,
  Target, ListTree, Users, Building2, Home, FilePlus, FileSignature,
} from 'lucide-react'
import { ROLE_LABELS } from '@/lib/constants'
import ThemeToggle from '@/components/ui/ThemeToggle'
import type { Role } from '@/types'
import { usePkYear } from './_context/PkYearContext'
import { tahunRange } from './_utils/pk-format'

type Tile = { href: string; label: string; icon: React.ElementType; color: string; group: string }
const TILES: Tile[] = [
  { href: '/perjanjian-kinerja',            label: 'Beranda',        icon: LayoutDashboard, color: '#3B82F6', group: 'NAVIGASI' },
  { href: '/perjanjian-kinerja/sasaran',    label: 'Master Sasaran', icon: Target,          color: '#10B981', group: 'PENCIPTAAN ARSIP' },
  { href: '/perjanjian-kinerja/program',    label: 'Master Program', icon: ListTree,        color: '#14B8A6', group: 'PENCIPTAAN ARSIP' },
  { href: '/perjanjian-kinerja/form',       label: 'Form PK',        icon: FilePlus,        color: '#EF9F27', group: 'DOKUMEN PK' },
  { href: '/perjanjian-kinerja/riwayat',    label: 'Riwayat',        icon: ClipboardList,   color: '#8B5CF6', group: 'DOKUMEN PK' },
  { href: '/perjanjian-kinerja/pejabat',    label: 'Master Pejabat', icon: Users,           color: '#F59E0B', group: 'SISTEM' },
  { href: '/perjanjian-kinerja/unit-kerja', label: 'Master Unit',    icon: Building2,       color: '#64748B', group: 'SISTEM' },
]

interface Props {
  username: string
  role:     Role
  themePreference: 'dark' | 'light'
  children: React.ReactNode
}

export default function PkShell({ username, role, themePreference, children }: Props) {
  const pathname  = usePathname()
  const router    = useRouter()
  const { tahun, setTahun } = usePkYear()
  const [dropOpen, setDropOpen] = useState(false)
  const [yearOpen, setYearOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference)
  const isLight = currentTheme === 'light'
  const dropRef = useRef<HTMLDivElement>(null)
  const yearRef = useRef<HTMLDivElement>(null)
  // Ribbon collapse — persist localStorage. Hydration-safe.
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false)
  useEffect(() => {
    Promise.resolve().then(() => {
      try { setRibbonCollapsed(localStorage.getItem('prima_pk_ribbon_collapsed') === '1') } catch {}
    })
  }, [])
  function toggleRibbon() {
    setRibbonCollapsed(v => {
      const next = !v
      try { localStorage.setItem('prima_pk_ribbon_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  const roleLabel = ROLE_LABELS[role] ?? role
  const initials  = username.slice(0, 2).toUpperCase()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (dropRef.current && !dropRef.current.contains(target)) setDropOpen(false)
      if (yearRef.current && !yearRef.current.contains(target)) setYearOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  // Group tiles by `group` (preserving insertion order)
  const groups: Array<{ name: string; tiles: Tile[] }> = []
  for (const t of TILES) {
    let bucket = groups.find(g => g.name === t.group)
    if (!bucket) { bucket = { name: t.group, tiles: [] }; groups.push(bucket) }
    bucket.tiles.push(t)
  }

  function isActive(href: string) {
    if (href === '/perjanjian-kinerja') return pathname === '/perjanjian-kinerja'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const years = tahunRange()

  return (
    <div style={{
      minHeight: '100vh',
      fontFamily: 'var(--font-jakarta, ui-sans-serif)',
      background: isLight ? '#F5F5F7' : '#020F1C',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── TOP BRAND STRIP ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 110,
        background: isLight ? 'rgba(250,250,250,0.96)' : 'rgba(4,44,83,.94)',
        backdropFilter: 'blur(16px)',
        borderBottom: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <button
            className="pk-hamburger"
            onClick={() => setMobileOpen(v => !v)}
            aria-label="Buka menu"
            style={{
              display: 'none', background: 'none', border: 'none', cursor: 'pointer',
              color: isLight ? '#6B7280' : '#85B7EB', padding: 4,
            }}>
            <MenuIcon size={20} />
          </button>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: isLight ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'linear-gradient(135deg,#633806,#EF9F27)',
            border: isLight ? '1.5px solid rgba(139,92,246,.4)' : '1.5px solid rgba(239,159,39,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
            boxShadow: isLight ? '0 4px 12px rgba(139,92,246,.25)' : '0 4px 12px rgba(239,159,39,.2)',
          }}><FileSignature size={18} color={isLight ? '#FFFFFF' : '#020F1C'} strokeWidth={2.2} /></div>
          <div key={isLight ? 'brand-light' : 'brand-dark'}>
            <div style={{
              fontSize: 16, fontWeight: 800,
              background: isLight ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'linear-gradient(135deg,#EF9F27,#FAC775)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text',
              WebkitTextFillColor: 'transparent', color: 'transparent',
              letterSpacing: '.3px', lineHeight: 1.1,
            }}>PRIMA · PK</div>
            <div style={{ fontSize: 10.5, color: isLight ? '#6B7280' : '#85B7EB', fontWeight: 600, marginTop: 1 }}>
              RSJD Dr. Amino Gondohutomo
            </div>
          </div>
          <button
            onClick={toggleRibbon}
            aria-label={ribbonCollapsed ? 'Perluas menu' : 'Kecilkan menu'}
            data-tooltip={ribbonCollapsed ? 'Perluas menu' : 'Kecilkan menu'}
            data-tooltip-pos="below"
            className="pk-toggle-ribbon"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, marginLeft: 6,
              border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : '#185FA5'}`,
              background: 'transparent', cursor: 'pointer', color: isLight ? '#6B7280' : '#85B7EB',
              transition: 'all .15s',
            }}>
            <ChevronDown size={15} style={{ transform: ribbonCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform .2s' }} />
          </button>
        </div>

        {/* Kanan: Tahun dropdown + Menu + Theme + User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* ── Dropdown Tahun Global (Q5 user) ── */}
          <div ref={yearRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setYearOpen(v => !v)}
              data-tooltip="Tahun aktif berlaku ke semua data PK"
              data-tooltip-pos="below"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 8,
                border: `1.5px solid ${isLight ? 'rgba(139,92,246,0.3)' : 'rgba(239,159,39,.35)'}`,
                background: isLight ? 'rgba(139,92,246,0.06)' : 'rgba(239,159,39,.08)',
                fontSize: 11.5, fontWeight: 700,
                color: isLight ? '#5B21B6' : '#FAC775',
                cursor: 'pointer', fontFamily: 'JetBrains Mono, ui-monospace, monospace', transition: 'all .15s',
              }}>
              TAHUN <span style={{ fontWeight: 800 }}>{tahun}</span>
              <ChevronDown size={12} style={{ transform: yearOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }} />
            </button>
            {yearOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                minWidth: 110,
                background: isLight ? '#FAFAFA' : 'rgba(4,44,83,.98)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${isLight ? 'rgba(139,92,246,0.2)' : '#0C447C'}`,
                borderRadius: 10,
                boxShadow: isLight ? '0 12px 36px rgba(0,0,0,.12)' : '0 12px 36px rgba(0,0,0,.5)',
                padding: '4px', zIndex: 300, maxHeight: 260, overflowY: 'auto',
              }}>
                {years.map(y => {
                  const active = y === tahun
                  return (
                    <button key={y}
                      onClick={() => { setTahun(y); setYearOpen(false) }}
                      style={{
                        display: 'block', width: '100%',
                        padding: '7px 12px', borderRadius: 6, border: 'none',
                        background: active
                          ? (isLight ? 'rgba(139,92,246,0.12)' : 'rgba(239,159,39,.18)')
                          : 'transparent',
                        color: active
                          ? (isLight ? '#5B21B6' : '#FAC775')
                          : (isLight ? '#374151' : '#B5D4F4'),
                        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                        fontSize: 12, fontWeight: active ? 800 : 600,
                        textAlign: 'left', cursor: 'pointer',
                      }}>
                      {y}{active ? '  •' : ''}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => router.push('/menu')}
            className="pk-back-btn"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 8,
              background: 'transparent', border: `1.5px solid ${isLight ? 'rgba(0,0,0,0.15)' : '#185FA5'}`,
              fontSize: 11, fontWeight: 700, color: isLight ? '#374151' : '#B5D4F4',
              cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit',
            }}>
            <Home size={13} />
            Menu
          </button>

          <ThemeToggle initialTheme={themePreference} onThemeChange={setCurrentTheme} />

          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 12px 4px 4px', borderRadius: 40,
                border: `1.5px solid ${isLight ? 'rgba(139,92,246,0.25)' : 'rgba(239,159,39,.2)'}`,
                background: isLight ? 'rgba(139,92,246,0.05)' : 'rgba(239,159,39,.05)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
              }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: isLight ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'linear-gradient(135deg,#633806,#EF9F27)',
                color: isLight ? '#FFFFFF' : '#020F1C', fontWeight: 800, fontSize: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{initials}</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: isLight ? '#0F0F12' : '#E6F1FB', lineHeight: 1.2 }}>{username}</div>
                <div style={{ fontSize: 10, color: isLight ? '#6B7280' : '#85B7EB', fontWeight: 500 }}>{roleLabel}</div>
              </div>
              <ChevronDown size={12} color={isLight ? '#6B7280' : '#85B7EB'} style={{ marginLeft: 2 }} />
            </button>

            {dropOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 200,
                background: isLight ? 'rgba(250,250,250,0.98)' : 'rgba(4,44,83,.98)',
                backdropFilter: 'blur(20px)', borderRadius: 12,
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : '#0C447C'}`,
                boxShadow: isLight ? '0 16px 48px rgba(0,0,0,.15)' : '0 16px 48px rgba(0,0,0,.5)',
                overflow: 'hidden', zIndex: 300,
              }}>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : '#0C447C'}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isLight ? '#0F0F12' : '#E6F1FB' }}>{username}</div>
                  <div style={{ fontSize: 10.5, color: isLight ? '#6B7280' : '#85B7EB', marginTop: 1, fontWeight: 500 }}>{roleLabel}</div>
                </div>
                <button
                  onClick={() => { setDropOpen(false); router.push('/profil') }}
                  className="pk-dd-item"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                    fontSize: 12.5, fontWeight: 500, color: isLight ? '#374151' : '#B5D4F4',
                    cursor: 'pointer', border: 'none', background: 'none',
                    width: '100%', textAlign: 'left', fontFamily: 'inherit', transition: 'background .15s',
                  }}>
                  <ShieldCheck size={13} /> Ganti Password
                </button>
                <div style={{ height: 1, background: isLight ? 'rgba(0,0,0,0.08)' : '#0C447C' }} />
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="pk-dd-item-danger"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
                    fontSize: 12.5, fontWeight: 500, color: isLight ? '#DC2626' : '#FCA5A5',
                    cursor: 'pointer', border: 'none', background: 'none',
                    width: '100%', textAlign: 'left', fontFamily: 'inherit', transition: 'background .15s',
                  }}>
                  <LogOut size={13} /> {loggingOut ? 'Keluar...' : 'Keluar'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIBBON NAV ── */}
      <nav className={`pk-ribbon${mobileOpen ? ' open' : ''}${ribbonCollapsed ? ' collapsed' : ''}`} style={{
        position: 'sticky', top: 58, zIndex: 100,
        background: isLight ? 'rgba(250,250,250,0.92)' : 'rgba(4,44,83,.82)',
        backdropFilter: 'blur(16px)',
        borderBottom: isLight ? '1px solid rgba(139,92,246,0.12)' : '1px solid rgba(255,255,255,0.06)',
        padding: ribbonCollapsed ? '5px 20px 5px' : '10px 20px 6px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: ribbonCollapsed ? 10 : 18,
        overflowX: ribbonCollapsed ? 'visible' : 'auto', overflowY: ribbonCollapsed ? 'visible' : undefined,
        transition: 'padding .18s, gap .18s',
      }}>
        {groups.map((grp, gi) => (
          <div key={grp.name} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingRight: gi < groups.length - 1 ? (ribbonCollapsed ? 10 : 18) : 0,
            borderRight: gi < groups.length - 1
              ? (isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)')
              : 'none',
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {grp.tiles.map(t => {
                const Icon = t.icon
                const active = isActive(t.href)
                return (
                  <Link key={t.href} href={t.href}
                    onClick={() => setMobileOpen(false)}
                    className={`pk-tile${active ? ' active' : ''}`}
                    data-label={t.label}
                    data-rima={
                      t.href === '/perjanjian-kinerja/sasaran' ? 'pk.nav-sasaran'
                      : t.href === '/perjanjian-kinerja/program' ? 'pk.nav-program'
                      : t.href === '/perjanjian-kinerja/form'    ? 'pk.nav-form'
                      : t.href === '/perjanjian-kinerja/pejabat' ? 'pk.nav-pejabat'
                      : t.href === '/perjanjian-kinerja/riwayat' ? 'pk.nav-riwayat'
                      : undefined
                    }
                    data-light={isLight ? '1' : '0'}
                    aria-label={ribbonCollapsed ? t.label : undefined}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: ribbonCollapsed ? 0 : 4,
                      padding: ribbonCollapsed ? '4px 6px' : '8px 12px 6px',
                      borderRadius: ribbonCollapsed ? 9 : 12,
                      minWidth: ribbonCollapsed ? 32 : 78, textDecoration: 'none',
                      border: active
                        ? `1.5px solid ${t.color}`
                        : `1.5px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
                      background: active
                        ? (isLight ? `linear-gradient(180deg, ${t.color}1f, ${t.color}08)` : `linear-gradient(180deg, ${t.color}33, ${t.color}11)`)
                        : (isLight ? '#FAFAFA' : 'rgba(255,255,255,0.03)'),
                      boxShadow: active
                        ? (isLight ? `0 4px 12px ${t.color}30` : `0 4px 12px ${t.color}40`)
                        : (isLight ? '0 1px 3px rgba(0,0,0,0.04)' : 'none'),
                      transition: 'all .15s',
                    }}>
                    <div style={{
                      width: ribbonCollapsed ? 26 : 36,
                      height: ribbonCollapsed ? 26 : 36,
                      borderRadius: ribbonCollapsed ? 7 : 10,
                      background: active ? t.color : (isLight ? `${t.color}15` : `${t.color}22`),
                      color: active ? '#FFFFFF' : t.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      boxShadow: active ? `0 3px 10px ${t.color}55` : 'none',
                      transition: 'all .15s',
                    }}>
                      <Icon size={ribbonCollapsed ? 14 : 18} strokeWidth={2.2} />
                    </div>
                    {!ribbonCollapsed && (
                      <div style={{
                        fontSize: 11.5, fontWeight: active ? 800 : 600,
                        color: active ? t.color : (isLight ? '#374151' : '#B5D4F4'),
                        letterSpacing: '.1px', whiteSpace: 'nowrap',
                      }}>{t.label}</div>
                    )}
                  </Link>
                )
              })}
            </div>
            {!ribbonCollapsed && (
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '1.4px',
                color: isLight ? '#9CA3AF' : '#85B7EB',
                opacity: .7, marginTop: 6, textTransform: 'uppercase',
              }}>{grp.name}</div>
            )}
          </div>
        ))}
      </nav>

      {/* ── KONTEN ── */}
      <main style={{
        flex: 1,
        backgroundColor: isLight ? '#F5F5F7' : '#020F1C',
        backgroundImage: isLight
          ? 'linear-gradient(rgba(0,0,0,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.04) 1px,transparent 1px)'
          : 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',
        backgroundSize: '48px 48px',
        padding: 20,
      } as React.CSSProperties}>
        {children}
      </main>

      <style>{`
        .pk-tile:hover { transform: translateY(-1px); }
        .pk-tile[data-light="1"]:not(.active):hover { border-color: rgba(139,92,246,0.3) !important; box-shadow: 0 4px 12px rgba(139,92,246,0.10) !important; }
        .pk-tile:not(.active):hover { border-color: rgba(255,255,255,0.15) !important; }
        .pk-back-btn:hover { border-color: #EF9F27 !important; color: #EF9F27 !important; }
        [data-theme="light"] .pk-back-btn:hover { border-color: #8B5CF6 !important; color: #6D28D9 !important; background: rgba(139,92,246,0.06) !important; }
        .pk-dd-item:hover { background: rgba(139,92,246,0.06) !important; }
        .pk-dd-item-danger:hover { background: rgba(226,75,74,.08) !important; }
        @media (max-width: 768px) {
          .pk-hamburger { display: inline-flex !important; }
          .pk-ribbon { display: none !important; }
          .pk-ribbon.open { display: flex !important; flex-direction: column; align-items: stretch; }
          .pk-ribbon.open > div { padding-right: 0 !important; border-right: none !important; border-bottom: 1px solid rgba(0,0,0,0.06); padding-bottom: 8px; }
        }
        /* Tooltip collapsed ribbon */
        .pk-ribbon.collapsed .pk-tile{position:relative;}
        .pk-ribbon.collapsed .pk-tile::after{
          content:attr(data-label);
          position:absolute;
          top:calc(100% + 12px); left:50%;
          transform:translateX(-50%) translateY(-4px);
          background:linear-gradient(135deg,#EF9F27,#FAC775);
          color:#020F1C;
          font-size:11.5px; font-weight:800; letter-spacing:.2px;
          padding:6px 11px; border-radius:8px; white-space:nowrap;
          box-shadow:0 6px 20px rgba(239,159,39,.35),0 2px 6px rgba(0,0,0,.4);
          opacity:0; pointer-events:none;
          transition:opacity .18s ease,transform .18s ease;
          z-index:300;
        }
        .pk-ribbon.collapsed .pk-tile::before{
          content:''; position:absolute;
          top:calc(100% + 6px); left:50%;
          transform:translateX(-50%) translateY(-4px);
          width:0;height:0;
          border-left:6px solid transparent; border-right:6px solid transparent;
          border-bottom:7px solid #EF9F27;
          opacity:0; pointer-events:none;
          transition:opacity .18s ease,transform .18s ease;
          z-index:301;
        }
        .pk-ribbon.collapsed .pk-tile:hover::after,
        .pk-ribbon.collapsed .pk-tile:hover::before{
          opacity:1; transform:translateX(-50%) translateY(0);
        }
        [data-theme="light"] .pk-ribbon.collapsed .pk-tile::after{
          background:linear-gradient(135deg,#8B5CF6,#EC4899);
          color:#FFFFFF;
          box-shadow:0 6px 20px rgba(139,92,246,.4),0 2px 6px rgba(0,0,0,.12);
        }
        [data-theme="light"] .pk-ribbon.collapsed .pk-tile::before{
          border-bottom-color:#8B5CF6;
        }
        /* Scrollbar light theme — match BLUD */
        [data-theme="light"] *::-webkit-scrollbar{width:10px;height:10px;background:#F5F5F7;}
        [data-theme="light"] *::-webkit-scrollbar-thumb{background:#C7CCD4;border:2px solid #F5F5F7;border-radius:6px;}
        [data-theme="light"] *::-webkit-scrollbar-thumb:hover{background:#A0A6B0;}
        [data-theme="light"] *::-webkit-scrollbar-corner{background:#F5F5F7;}
        [data-theme="light"] *{scrollbar-color:#C7CCD4 #F5F5F7;scrollbar-width:thin;}
        /* Tabel light */
        [data-theme="light"] table thead{background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))!important;}
        [data-theme="light"] table thead th{color:#5B21B6!important;background:transparent!important;font-weight:700!important;border-color:rgba(139,92,246,0.22)!important;}
        [data-theme="light"] table tbody td{color:#374151!important;border-color:rgba(139,92,246,0.08)!important;}
        [data-theme="light"] table tbody tr:hover td{background:rgba(139,92,246,0.04)!important;}
        /* Input/select light */
        [data-theme="light"] input:not([type=checkbox]):not([type=radio]):not([type=file]),
        [data-theme="light"] select,
        [data-theme="light"] textarea{background:#FFFFFF!important;border-color:rgba(139,92,246,0.25)!important;color:#0F0F12!important;}
        [data-theme="light"] input:focus,
        [data-theme="light"] select:focus,
        [data-theme="light"] textarea:focus{border-color:#8B5CF6!important;box-shadow:0 0 0 3px rgba(139,92,246,0.15)!important;outline:none!important;}
        /* ── PK inline dark hex → light overrides (mirror BLUD shell) ── */
        [data-theme="light"] [style*="042C53" i],
        [data-theme="light"] [style*="rgb(4, 44, 83)"]{background:#FAFAFA!important;}
        [data-theme="light"] [style*="rgba(12,68,124" i],
        [data-theme="light"] [style*="rgba(12, 68, 124" i]{background:rgba(139,92,246,0.04)!important;}
        [data-theme="light"] [style*="0C447C" i],
        [data-theme="light"] [style*="rgb(12, 68, 124)"]{border-color:rgba(139,92,246,0.18)!important;}
        [data-theme="light"] [style*="185FA5" i],
        [data-theme="light"] [style*="rgb(24, 95, 165)"]{border-color:rgba(139,92,246,0.25)!important;}
        [data-theme="light"] [style*="E6F1FB" i],
        [data-theme="light"] [style*="rgb(230, 241, 251)"]{color:#0F0F12!important;}
        [data-theme="light"] [style*="B5D4F4" i],
        [data-theme="light"] [style*="rgb(181, 212, 244)"]{color:#374151!important;}
        [data-theme="light"] [style*="85B7EB" i],
        [data-theme="light"] [style*="rgb(133, 183, 235)"]{color:#6B7280!important;}
        [data-theme="light"] [style*="FCA5A5" i],
        [data-theme="light"] [style*="rgb(252, 165, 165)"]{color:#DC2626!important;}
        [data-theme="light"] [style*="6EE7B7" i],
        [data-theme="light"] [style*="rgb(110, 231, 183)"]{color:#047857!important;}
        [data-theme="light"] [style*="FAC775" i],
        [data-theme="light"] [style*="rgb(250, 199, 117)"]{color:#B45309!important;}
        [data-theme="light"] [style*="EF9F27" i]:not(svg),
        [data-theme="light"] [style*="rgb(239, 159, 39)"]:not(svg){color:#7C3AED!important;}
      `}</style>

    </div>
  )
}
