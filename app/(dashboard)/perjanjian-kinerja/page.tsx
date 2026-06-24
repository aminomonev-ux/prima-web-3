// app/(dashboard)/perjanjian-kinerja/page.tsx — Beranda landing PK
import Link from 'next/link'
import { Target, ListTree, FilePlus, ClipboardList, Users, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

const CARDS = [
  { href: '/perjanjian-kinerja/sasaran',    title: 'Master Sasaran', desc: 'Indikator + target per program/kegiatan/sub-kegiatan', icon: Target,        color: '#10B981' },
  { href: '/perjanjian-kinerja/program',    title: 'Master Program', desc: 'Hierarki Program → Kegiatan → Sub-kegiatan',           icon: ListTree,      color: '#14B8A6' },
  { href: '/perjanjian-kinerja/form',       title: 'Form PK',        desc: 'Buat dokumen Perjanjian Kinerja baru',                 icon: FilePlus,      color: '#EF9F27' },
  { href: '/perjanjian-kinerja/riwayat',    title: 'Riwayat',        desc: 'Daftar dokumen PK + unduh Word',                       icon: ClipboardList, color: '#8B5CF6' },
  { href: '/perjanjian-kinerja/pejabat',    title: 'Master Pejabat', desc: 'Nama, jabatan, NIP per unit kerja',                    icon: Users,         color: '#F59E0B' },
  { href: '/perjanjian-kinerja/unit-kerja', title: 'Master Unit',    desc: 'Daftar unit + atasan default + mapping BLUD',          icon: Building2,     color: '#64748B' },
]

export default function PkBerandaPage() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{
          fontSize: 22, fontWeight: 800, color: '#E6F1FB',
          margin: 0, letterSpacing: '.2px',
        }}>Perjanjian Kinerja</h1>
        <p style={{ fontSize: 13, color: '#85B7EB', margin: '4px 0 0', lineHeight: 1.5 }}>
          Generator dokumen Perjanjian Kinerja pejabat RSJD Dr. Amino Gondohutomo. Mulai dengan input
          Master Sasaran + Master Program di awal tahun, lalu buat dokumen PK per pejabat.
        </p>
      </div>

      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}>
        {CARDS.map(c => {
          const Icon = c.icon
          return (
            <Link key={c.href} href={c.href} style={{
              display: 'block', padding: 16, borderRadius: 12, textDecoration: 'none',
              background: '#042C53',
              border: '1px solid #0C447C',
              transition: 'all .15s',
            }}
              className="pk-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${c.color}22`, color: c.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={20} strokeWidth={2.2} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#E6F1FB' }}>{c.title}</div>
              </div>
              <div style={{ fontSize: 12, color: '#85B7EB', lineHeight: 1.5 }}>{c.desc}</div>
            </Link>
          )
        })}
      </div>

      <style>{`
        .pk-card:hover { border-color: rgba(239,159,39,.4) !important; transform: translateY(-2px); }
      `}</style>
    </div>
  )
}
