'use client'
// app/(dashboard)/blud/blud-shell.tsx
// Shell layout BLUD: TOP RIBBON nav (icon-on-top tile + section grouping) + sticky brand strip.
// Replace vertical sidebar lama — content full-width karena cuma 3 menu.

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard, FileText, Shuffle, LogOut, ShieldCheck, ChevronDown, Menu as MenuIcon,
  MoreHorizontal, BookText, Printer, Settings, Home, ListTree, Users, Landmark,
} from 'lucide-react'
import { ROLE_LABELS } from '@/lib/constants'
import ThemeToggle from '@/components/ui/ThemeToggle'
import type { Role } from '@/types'

// Tile = icon-on-top + label-bottom. `group` jadi section label di bawah grup.
type Tile = { href: string; label: string; icon: React.ElementType; color: string; group: string }
const TILES: Tile[] = [
  { href: '/blud',             label: 'Beranda',        icon: LayoutDashboard, color: '#3B82F6', group: 'NAVIGASI' },
  { href: '/blud/master-akun', label: 'Master Akun',    icon: BookText,        color: '#10B981', group: 'DATA INDUK' },
  { href: '/blud/kode-besar',  label: 'Kode Besar',     icon: ListTree,        color: '#14B8A6', group: 'DATA INDUK' },
  { href: '/blud/penanggung-jawab', label: 'Penanggung Jawab', icon: Users,    color: '#F59E0B', group: 'DATA INDUK' },
  { href: '/blud/dpa',         label: 'DPA BLUD',       icon: FileText,        color: '#8B5CF6', group: 'ANGGARAN' },
  { href: '/blud/pergeseran',  label: 'Pergeseran DPA', icon: Shuffle,         color: '#EC4899', group: 'ANGGARAN' },
  { href: '/blud/cetak',       label: 'Cetak',          icon: Printer,         color: '#0891b2', group: 'OUTPUT' },
  { href: '/blud/pengaturan',  label: 'Pengaturan',     icon: Settings,        color: '#64748B', group: 'SISTEM' },
]

// Overflow handling — kalau total tile > MAX_INLINE, tampilkan (MAX_INLINE - 1) tile + "Lainnya" dropdown.
// Saat ini 3 tile → semua inline. Disiapkan untuk future growth.
const MAX_INLINE_TILES = 8

interface Props {
  username: string
  role:     Role
  themePreference: 'dark' | 'light'
  children: React.ReactNode
}

export default function BludShell({ username, role, themePreference, children }: Props) {
  const pathname  = usePathname()
  const router    = useRouter()
  const [dropOpen, setDropOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(themePreference)
  const isLight = currentTheme === 'light'
  const dropRef = useRef<HTMLDivElement>(null)
  // Ribbon collapse — minimize ke icon-only mode. Persist di localStorage.
  // Hydration-safe localStorage read: lazy initial = false (SSR), then sync di useEffect via async-post (cegah set-state-in-effect).
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false)
  useEffect(() => {
    Promise.resolve().then(() => {
      try { setRibbonCollapsed(localStorage.getItem('prima_blud_ribbon_collapsed') === '1') } catch {}
    })
  }, [])
  function toggleRibbon() {
    setRibbonCollapsed(v => {
      const next = !v
      try { localStorage.setItem('prima_blud_ribbon_collapsed', next ? '1' : '0') } catch {}
      return next
    })
  }

  const roleLabel = ROLE_LABELS[role] ?? role
  const initials  = username.slice(0, 2).toUpperCase()

  // Tutup dropdown user + overflow saat klik luar
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (dropRef.current && !dropRef.current.contains(target)) setDropOpen(false)
      if (overflowRef.current && !overflowRef.current.contains(target)) setOverflowOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  // Overflow split: kalau total > MAX_INLINE, tampilkan (MAX-1) tile + "Lainnya" trigger,
  // sisanya masuk overflow dropdown. Active overflow tile dipromosikan ke visible supaya
  // user tetap lihat active state tanpa buka dropdown.
  const overflowing = TILES.length > MAX_INLINE_TILES
  let visibleTiles: Tile[] = TILES
  let overflowTiles: Tile[] = []
  if (overflowing) {
    const activeIdx = TILES.findIndex(t => (t.href === '/blud' ? pathname === '/blud' : pathname === t.href || pathname.startsWith(t.href + '/')))
    const slotCount = MAX_INLINE_TILES - 1  // sisakan 1 slot untuk "Lainnya"
    visibleTiles = TILES.slice(0, slotCount)
    overflowTiles = TILES.slice(slotCount)
    // Promote active overflow → swap dengan tile visible paling akhir
    if (activeIdx >= slotCount) {
      const activeTile = TILES[activeIdx]
      const demoted = visibleTiles[slotCount - 1]
      visibleTiles = [...visibleTiles.slice(0, slotCount - 1), activeTile]
      overflowTiles = overflowTiles.map(t => t.href === activeTile.href ? demoted : t)
    }
  }

  // Group VISIBLE tiles by `group` field (preserving insertion order)
  const groups: Array<{ name: string; tiles: Tile[] }> = []
  for (const t of visibleTiles) {
    let bucket = groups.find(g => g.name === t.group)
    if (!bucket) { bucket = { name: t.group, tiles: [] }; groups.push(bucket) }
    bucket.tiles.push(t)
  }

  // Group OVERFLOW tiles untuk dropdown (preserve section label)
  const overflowGroups: Array<{ name: string; tiles: Tile[] }> = []
  for (const t of overflowTiles) {
    let bucket = overflowGroups.find(g => g.name === t.group)
    if (!bucket) { bucket = { name: t.group, tiles: [] }; overflowGroups.push(bucket) }
    bucket.tiles.push(t)
  }

  // Active check: exact match utk Dashboard (/blud), startsWith utk sub-route
  function isActive(href: string) {
    if (href === '/blud') return pathname === '/blud'
    return pathname === href || pathname.startsWith(href + '/')
  }

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
            className="blud-hamburger"
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
          }}><Landmark size={18} color={isLight ? '#FFFFFF' : '#020F1C'} strokeWidth={2.2} /></div>
          <div key={isLight ? 'brand-light' : 'brand-dark'}>
            <div style={{
              fontSize: 16, fontWeight: 800,
              background: isLight ? 'linear-gradient(135deg,#8B5CF6,#EC4899)' : 'linear-gradient(135deg,#EF9F27,#FAC775)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text',
              WebkitTextFillColor: 'transparent', color: 'transparent',
              letterSpacing: '.3px', lineHeight: 1.1,
            }}>PRIMA · BLUD</div>
            <div style={{ fontSize: 10.5, color: isLight ? '#6B7280' : '#85B7EB', fontWeight: 600, marginTop: 1 }}>
              RSJD Dr. Amino Gondohutomo
            </div>
          </div>
          {/* Toggle minimize ribbon (desktop only) */}
          <button
            onClick={toggleRibbon}
            aria-label={ribbonCollapsed ? 'Perluas menu' : 'Kecilkan menu'}
            data-tooltip={ribbonCollapsed ? 'Perluas menu' : 'Kecilkan menu'}
            data-tooltip-pos="below"
            className="blud-toggle-ribbon"
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

        {/* Kanan: Back + Theme + User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Tombol Menu — seragam dengan kinerja-menu-btn (Home icon + label "Menu") */}
          <button
            onClick={() => router.push('/menu')}
            className="blud-back-btn"
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
                  className="blud-dd-item"
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
                  className="blud-dd-item-danger"
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

      {/* ── RIBBON NAV (icon-on-top tiles + section grouping) ── */}
      <nav className={`blud-ribbon${mobileOpen ? ' open' : ''}${ribbonCollapsed ? ' collapsed' : ''}`} style={{
        position: 'sticky', top: 58, zIndex: 100,
        background: isLight ? 'rgba(250,250,250,0.92)' : 'rgba(4,44,83,.82)',
        backdropFilter: 'blur(16px)',
        borderBottom: isLight ? '1px solid rgba(139,92,246,0.12)' : '1px solid rgba(255,255,255,0.06)',
        padding: ribbonCollapsed ? '5px 20px 5px' : '10px 20px 6px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: ribbonCollapsed ? 10 : 18,
        // Collapsed: overflow visible supaya tooltip pseudo-element ::after (di bawah tile) tidak ke-clip.
        // Expanded: auto untuk horizontal scroll kalau banyak menu.
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
                    className={`blud-tile${active ? ' active' : ''}`}
                    data-label={t.label}
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

        {/* ── "LAINNYA" overflow tile + dropdown ── */}
        {overflowTiles.length > 0 && (
          <div ref={overflowRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setOverflowOpen(v => !v)}
                className={`blud-tile${overflowOpen ? ' active' : ''}`}
                data-label={`Lainnya (+${overflowTiles.length})`}
                data-light={isLight ? '1' : '0'}
                aria-label={ribbonCollapsed ? `Lainnya (+${overflowTiles.length})` : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: ribbonCollapsed ? 0 : 4,
                  padding: ribbonCollapsed ? '4px 6px' : '8px 12px 6px',
                  borderRadius: ribbonCollapsed ? 9 : 12,
                  minWidth: ribbonCollapsed ? 32 : 78, cursor: 'pointer', fontFamily: 'inherit',
                  border: overflowOpen
                    ? `1.5px solid #6366F1`
                    : `1.5px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`,
                  background: overflowOpen
                    ? (isLight ? 'linear-gradient(180deg, #6366F11f, #6366F108)' : 'linear-gradient(180deg, #6366F133, #6366F111)')
                    : (isLight ? '#FAFAFA' : 'rgba(255,255,255,0.03)'),
                  boxShadow: overflowOpen
                    ? (isLight ? '0 4px 12px #6366F130' : '0 4px 12px #6366F140')
                    : (isLight ? '0 1px 3px rgba(0,0,0,0.04)' : 'none'),
                  transition: 'all .15s',
                }}>
                <div style={{
                  width: ribbonCollapsed ? 26 : 36,
                  height: ribbonCollapsed ? 26 : 36,
                  borderRadius: ribbonCollapsed ? 7 : 10,
                  background: overflowOpen ? '#6366F1' : (isLight ? '#6366F115' : '#6366F122'),
                  color: overflowOpen ? '#FFFFFF' : '#6366F1',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  boxShadow: overflowOpen ? '0 3px 10px #6366F155' : 'none',
                  transition: 'all .15s',
                }}>
                  <MoreHorizontal size={ribbonCollapsed ? 14 : 18} strokeWidth={2.2} />
                </div>
                {!ribbonCollapsed && (
                  <div style={{
                    fontSize: 11.5, fontWeight: overflowOpen ? 800 : 600,
                    color: overflowOpen ? '#6366F1' : (isLight ? '#374151' : '#B5D4F4'),
                    letterSpacing: '.1px', whiteSpace: 'nowrap',
                  }}>Lainnya</div>
                )}
              </button>
            </div>
            {!ribbonCollapsed && (
              <div style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '1.4px',
                color: isLight ? '#9CA3AF' : '#85B7EB',
                opacity: .7, marginTop: 6, textTransform: 'uppercase',
              }}>+{overflowTiles.length} menu</div>
            )}

            {/* Dropdown panel */}
            {overflowOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0,
                minWidth: 240, maxWidth: 320,
                background: isLight ? '#FAFAFA' : 'rgba(4,44,83,.98)',
                backdropFilter: 'blur(20px)',
                border: isLight ? '1px solid rgba(139,92,246,0.18)' : '1px solid #0C447C',
                borderRadius: 12,
                boxShadow: isLight ? '0 16px 48px rgba(0,0,0,.15)' : '0 16px 48px rgba(0,0,0,.5)',
                padding: '8px 6px', zIndex: 200,
              }}>
                {overflowGroups.map((og, ogi) => (
                  <div key={og.name}>
                    {ogi > 0 && <div style={{ height: 1, background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)', margin: '6px 8px' }} />}
                    <div style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '1.2px',
                      color: isLight ? '#9CA3AF' : '#85B7EB',
                      padding: '6px 10px 4px', textTransform: 'uppercase', opacity: .8,
                    }}>{og.name}</div>
                    {og.tiles.map(t => {
                      const Icon = t.icon
                      const active = isActive(t.href)
                      return (
                        <Link key={t.href} href={t.href}
                          onClick={() => setOverflowOpen(false)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 9, margin: '2px 4px',
                            textDecoration: 'none', transition: 'background .15s',
                            background: active
                              ? (isLight ? `${t.color}18` : `${t.color}22`)
                              : 'transparent',
                            borderLeft: active ? `3px solid ${t.color}` : '3px solid transparent',
                          }}
                          className="blud-overflow-item">
                          <div style={{
                            width: 28, height: 28, borderRadius: 8,
                            background: active ? t.color : (isLight ? `${t.color}15` : `${t.color}22`),
                            color: active ? '#FFFFFF' : t.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Icon size={15} strokeWidth={2.2} />
                          </div>
                          <span style={{
                            fontSize: 12.5, fontWeight: active ? 700 : 600,
                            color: active ? t.color : (isLight ? '#374151' : '#B5D4F4'),
                          }}>{t.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
        .blud-tile:hover { transform: translateY(-1px); }
        .blud-overflow-item:hover { background: rgba(139,92,246,0.06) !important; }
        [data-theme="light"] .blud-overflow-item:hover { background: rgba(139,92,246,0.08) !important; }
        .blud-tile[data-light="1"]:not(.active):hover { border-color: rgba(139,92,246,0.3) !important; box-shadow: 0 4px 12px rgba(139,92,246,0.10) !important; }
        .blud-tile:not(.active):hover { border-color: rgba(255,255,255,0.15) !important; }
        /* Hover: dark = amber (BLUD brand), light = purple (BLUD light brand) */
        .blud-back-btn:hover { border-color: #EF9F27 !important; color: #EF9F27 !important; }
        [data-theme="light"] .blud-back-btn:hover { border-color: #8B5CF6 !important; color: #6D28D9 !important; background: rgba(139,92,246,0.06) !important; }
        .blud-dd-item:hover { background: rgba(139,92,246,0.06) !important; }
        .blud-dd-item-danger:hover { background: rgba(226,75,74,.08) !important; }
        /* Mobile: hide ribbon by default, hamburger toggles */
        @media (max-width: 768px) {
          .blud-hamburger { display: inline-flex !important; }
          .blud-ribbon { display: none !important; }
          .blud-ribbon.open { display: flex !important; flex-direction: column; align-items: stretch; }
          .blud-ribbon.open > div { padding-right: 0 !important; border-right: none !important; border-bottom: 1px solid rgba(0,0,0,0.06); padding-bottom: 8px; }
        }
        /* ── Tooltip ribbon collapsed (icon-only mode) — muncul saat hover tile ── */
        /* Posisi: di bawah tile (ribbon horizontal). Theme-aware:
           dark = gradient amber gold (sama E-Anggaran), light = gradient ungu-pink (sama Usulan light). */
        .blud-ribbon.collapsed .blud-tile{position:relative;}
        .blud-ribbon.collapsed .blud-tile::after{
          content:attr(data-label);
          position:absolute;
          top:calc(100% + 12px);
          left:50%;
          transform:translateX(-50%) translateY(-4px);
          background:linear-gradient(135deg,#EF9F27,#FAC775);
          color:#020F1C;
          font-size:11.5px;
          font-weight:800;
          letter-spacing:.2px;
          padding:6px 11px;
          border-radius:8px;
          white-space:nowrap;
          box-shadow:0 6px 20px rgba(239,159,39,.35),0 2px 6px rgba(0,0,0,.4);
          opacity:0;
          pointer-events:none;
          transition:opacity .18s ease,transform .18s ease;
          z-index:300;
        }
        .blud-ribbon.collapsed .blud-tile::before{
          content:'';
          position:absolute;
          top:calc(100% + 6px);
          left:50%;
          transform:translateX(-50%) translateY(-4px);
          width:0;height:0;
          border-left:6px solid transparent;
          border-right:6px solid transparent;
          border-bottom:7px solid #EF9F27;
          opacity:0;
          pointer-events:none;
          transition:opacity .18s ease,transform .18s ease;
          z-index:301;
        }
        .blud-ribbon.collapsed .blud-tile:hover::after,
        .blud-ribbon.collapsed .blud-tile:hover::before{
          opacity:1;
          transform:translateX(-50%) translateY(0);
        }
        /* Light theme override — ungu-pink */
        [data-theme="light"] .blud-ribbon.collapsed .blud-tile::after{
          background:linear-gradient(135deg,#8B5CF6,#EC4899);
          color:#FFFFFF;
          box-shadow:0 6px 20px rgba(139,92,246,.4),0 2px 6px rgba(0,0,0,.12);
        }
        [data-theme="light"] .blud-ribbon.collapsed .blud-tile::before{
          border-bottom-color:#8B5CF6;
        }
        /* Scrollbar light theme */
        [data-theme="light"] *::-webkit-scrollbar{width:10px;height:10px;background:#ECEEF3;}
        [data-theme="light"] *::-webkit-scrollbar-track{background:#ECEEF3;}
        [data-theme="light"] *::-webkit-scrollbar-thumb{background:#C7CCD4;border:2px solid #ECEEF3;border-radius:6px;}
        [data-theme="light"] *::-webkit-scrollbar-thumb:hover{background:#A0A6B0;}
        [data-theme="light"] *::-webkit-scrollbar-corner{background:#ECEEF3;}
        [data-theme="light"] *{scrollbar-color:#C7CCD4 #ECEEF3;scrollbar-width:thin;}
        /* Tabel umum light */
        [data-theme="light"] table thead{background:linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))!important;}
        [data-theme="light"] table thead th{color:#5B21B6!important;background:transparent!important;font-weight:700!important;border-color:rgba(139,92,246,0.22)!important;}
        [data-theme="light"] table tbody td{color:#374151!important;border-color:rgba(139,92,246,0.08)!important;}
        [data-theme="light"] table tbody tr:hover td{background:rgba(139,92,246,0.04)!important;}
        /* Input/select fallback light */
        [data-theme="light"] input:not([type=checkbox]):not([type=radio]):not([type=file]),
        [data-theme="light"] select,
        [data-theme="light"] textarea{background:#FFFFFF!important;border-color:rgba(139,92,246,0.25)!important;color:#0F0F12!important;}
        [data-theme="light"] input:focus,
        [data-theme="light"] select:focus,
        [data-theme="light"] textarea:focus{border-color:#8B5CF6!important;box-shadow:0 0 0 3px rgba(139,92,246,0.15)!important;outline:none!important;}
        /* Button base light overrides */
        [data-theme="light"] button.btn-primary{background:linear-gradient(135deg,#8B5CF6,#EC4899)!important;color:#fff!important;border:none!important;}
        [data-theme="light"] button.btn-secondary{color:#5B21B6!important;border-color:rgba(139,92,246,0.3)!important;background:rgba(139,92,246,0.04)!important;}
        [data-theme="light"] button.btn-secondary:hover{border-color:#8B5CF6!important;background:rgba(139,92,246,0.10)!important;}
        /* ── BLUD inline dark colors → light overrides (attribute substring match) ── */
        /* DPA & Pergeseran client masih pakai inline style hardcoded warna dark.
           Daripada touch 30+ inline style, override via attribute selector. */
        /* Browser normalisasi hex → rgb() di style attribute. Match BOTH forms. */
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
