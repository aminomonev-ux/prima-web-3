// lib/sentinel/nav.ts — registry navigasi modul RIMA F5b. Rima TIDAK pernah
// berpindah halaman sendiri (G1): dia hanya merender link chip yang DIKLIK user.
// Sadar-akses (G18): hanya tawarkan modul yang user punya akses & sedang online —
// aturan dicerminkan dari menu-client (role filter + userAccess lock + maintenance,
// SUPER_ADMIN bypass). id & href WAJIB sinkron dengan APP_CARDS di menu-client.tsx.
import type { Role } from '@/types'

export interface NavModule {
  id: string
  label: string
  href: string
  aliases: string[]
  adminOnly?: boolean
}

export const NAV_MODULES: NavModule[] = [
  { id: 'blud',               label: 'BLUD',               href: '/blud',              aliases: ['blud', 'dpa', 'pergeseran', 'anggaran blud'] },
  { id: 'new_econtrolling',   label: 'E-Anggaran (Kinerja)', href: '/kinerja',         aliases: ['kinerja', 'e-anggaran', 'e anggaran', 'e-controlling', 'econtrolling', 'eanggaran'] },
  { id: 'usulan_aset',        label: 'Usulan Kebutuhan',   href: '/usulan-kebutuhan',  aliases: ['usulan kebutuhan', 'usulan', 'pengajuan'] },
  { id: 'perjanjian_kinerja', label: 'Perjanjian Kinerja', href: '/perjanjian-kinerja', aliases: ['perjanjian kinerja', 'pk'] },
  { id: 'rencana_aksi',       label: 'Renaksi & Kinerja',  href: '/rencana-aksi',      aliases: ['rencana aksi', 'renaksi', 'renaksi & kinerja'] },
  { id: 'buku_besar_aset',    label: 'Buku Besar Aset',    href: '/buku-besar-aset',   aliases: ['buku besar aset', 'bba', 'belanja modal'] },
  { id: 'lkjip',              label: 'E-LKJIP',            href: '/lkjip',             aliases: ['lkjip', 'e-lkjip', 'laporan kinerja'] },
  { id: 'admin',              label: 'Admin Panel',        href: '/admin',             aliases: ['admin panel', 'admin'], adminOnly: true },
]

export interface NavSnapshot {
  role:   Role | null
  /** null = belum termuat / akses penuh (mirror menu: userAccess null = unlocked). */
  access: string[] | null
  status: Record<string, string>
}

export type NavAccess = 'ok' | 'no-access' | 'maintenance' | 'admin-only'

export function navAccessOf(m: NavModule, snap: NavSnapshot): NavAccess {
  if (m.adminOnly) return snap.role === 'SUPER_ADMIN' ? 'ok' : 'admin-only'
  if (snap.access !== null && !snap.access.includes(m.id)) return 'no-access'
  if (snap.status[`app_status_${m.id}`] === 'maintenance' && snap.role !== 'SUPER_ADMIN') return 'maintenance'
  return 'ok'
}

export function listOpenable(snap: NavSnapshot): NavModule[] {
  return NAV_MODULES.filter(m => navAccessOf(m, snap) === 'ok')
}

const NAV_VERB = /^(?:tolong\s+|aku\s+|saya\s+|coba\s+)?(?:mau\s+|pengen\s+|pingin\s+|ingin\s+)?(buka(?:kan|in)?|masuk ke|masuk|pergi ke|menuju|pindah ke|pindah|akses|ke)\s+(.{1,40})$/i
// kata yang menandakan ini BUKAN niat navigasi (tapi cara pakai / tanya)
const NOT_NAV = /\b(baru|cara|gimana|bagaimana|gmn|form|isi|tambah|hapus|edit|apa itu|apaan)\b/i

/** "buka X" → modul tujuan; null = bukan permintaan navigasi. */
export function resolveNav(text: string): NavModule | { list: true } | null {
  const m = text.toLowerCase().trim().match(NAV_VERB)
  if (!m) return null
  const rest = m[2].trim()
  if (NOT_NAV.test(rest)) return null
  // permintaan daftar: "buka aplikasi / modul / menu" tanpa modul spesifik
  if (/^(aplikasi|modul|menu|apa)(\s|$)/.test(rest) && !NAV_MODULES.some(x => x.aliases.some(a => rest.includes(a)))) {
    return { list: true }
  }
  let best: NavModule | null = null, bestLen = 0
  for (const mod of NAV_MODULES) for (const a of mod.aliases) {
    const re = new RegExp(`(^|[^a-z])${a.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^a-z]|$)`, 'i')
    if (re.test(rest) && a.length > bestLen) { best = mod; bestLen = a.length }
  }
  return best
}
