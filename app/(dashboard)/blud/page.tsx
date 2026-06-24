// app/(dashboard)/blud/page.tsx — landing dashboard BLUD (KPI + history)
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql, queryOne, queryMany } from '@/lib/data/db'
import DashboardClient from './dashboard-client'

export const dynamic = 'force-dynamic'

// Total anggaran = SUM(jumlah) di tipe GRANDMASTER (top-level rollup).
// Fallback: kalau GRANDMASTER tidak ada, pakai SUM dari rows parent_id NULL/empty.
async function getDpaTotal(versi: string | null): Promise<number> {
  if (!versi) return 0
  const r = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(jumlah), 0) AS total
        FROM dpa_blud
        WHERE versi_tanggal = ${versi} AND tipe_baris = 'GRANDMASTER'`
  )
  const grand = Number(r?.total ?? 0)
  if (grand > 0) return grand
  const fb = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(jumlah), 0) AS total
        FROM dpa_blud
        WHERE versi_tanggal = ${versi}
          AND (parent_id IS NULL OR parent_id = '')
          AND tipe_baris <> 'GRANDMASTER'`
  )
  return Number(fb?.total ?? 0)
}

async function getPergeseranDelta(versi: string | null): Promise<number> {
  if (!versi) return 0
  const r = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(bertambah_berkurang), 0) AS total
        FROM pergeseran_dpa
        WHERE versi_tanggal = ${versi} AND tipe_baris = 'GRANDMASTER'`
  )
  const grand = Number(r?.total ?? 0)
  if (grand !== 0) return grand
  const fb = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(bertambah_berkurang), 0) AS total
        FROM pergeseran_dpa
        WHERE versi_tanggal = ${versi}
          AND (parent_id IS NULL OR parent_id = '')
          AND tipe_baris <> 'GRANDMASTER'`
  )
  return Number(fb?.total ?? 0)
}

// Helper: format MySQL DATE (Date object atau string) → 'YYYY-MM-DD'
function toIsoDate(v: unknown): string {
  if (!v) return ''
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export default async function BludLandingPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')

  // Latest versi tanggal
  const dpaLatestRow = await queryOne<{ versi_tanggal: unknown }>(
    sql`SELECT versi_tanggal FROM dpa_blud ORDER BY versi_tanggal DESC LIMIT 1`
  )
  const dpaLatestVersi = dpaLatestRow ? toIsoDate(dpaLatestRow.versi_tanggal) || null : null

  const pgLatestRow = await queryOne<{ versi_tanggal: unknown }>(
    sql`SELECT versi_tanggal FROM pergeseran_dpa ORDER BY versi_tanggal DESC LIMIT 1`
  )
  const pgLatestVersi = pgLatestRow ? toIsoDate(pgLatestRow.versi_tanggal) || null : null

  // Row counts (latest version)
  const dpaCountRow = dpaLatestVersi
    ? await queryOne<{ c: string | number }>(
        sql`SELECT COUNT(*) AS c FROM dpa_blud WHERE versi_tanggal = ${dpaLatestVersi}`,
      )
    : null
  const pgCountRow = pgLatestVersi
    ? await queryOne<{ c: string | number }>(
        sql`SELECT COUNT(*) AS c FROM pergeseran_dpa WHERE versi_tanggal = ${pgLatestVersi}`,
      )
    : null

  const dpaLatestRows = Number(dpaCountRow?.c ?? 0)
  const pgLatestRows  = Number(pgCountRow?.c ?? 0)
  const dpaLatestTotal = await getDpaTotal(dpaLatestVersi)
  const pgLatestDelta  = await getPergeseranDelta(pgLatestVersi)

  // History — 5 versi terbaru tiap modul. Pakai 2-step (versi list → per-versi totals)
  // supaya tidak lock besar di JOIN. 5 versi × 2 query OK untuk landing page.
  const dpaVersis = await queryMany<{ versi_tanggal: unknown; jumlah_baris: string | number }>(
    sql`SELECT versi_tanggal, COUNT(*) AS jumlah_baris
        FROM dpa_blud
        GROUP BY versi_tanggal
        ORDER BY versi_tanggal DESC
        LIMIT 5`
  )
  const dpaHistory: Array<{ versi_tanggal: string; jumlah_baris: number; total_jumlah: number }> = []
  for (const v of dpaVersis) {
    const versi = toIsoDate(v.versi_tanggal)
    const total = await getDpaTotal(versi)
    dpaHistory.push({ versi_tanggal: versi, jumlah_baris: Number(v.jumlah_baris ?? 0), total_jumlah: total })
  }

  const pgVersis = await queryMany<{ versi_tanggal: unknown; jumlah_baris: string | number }>(
    sql`SELECT versi_tanggal, COUNT(*) AS jumlah_baris
        FROM pergeseran_dpa
        GROUP BY versi_tanggal
        ORDER BY versi_tanggal DESC
        LIMIT 5`
  )
  const pgHistory: Array<{ versi_tanggal: string; jumlah_baris: number; total_jumlah: number }> = []
  for (const v of pgVersis) {
    const versi = toIsoDate(v.versi_tanggal)
    const delta = await getPergeseranDelta(versi)
    pgHistory.push({ versi_tanggal: versi, jumlah_baris: Number(v.jumlah_baris ?? 0), total_jumlah: delta })
  }

  return (
    <DashboardClient
      dpaLatestVersi={dpaLatestVersi}
      dpaLatestRows={dpaLatestRows}
      dpaLatestTotal={dpaLatestTotal}
      pgLatestVersi={pgLatestVersi}
      pgLatestRows={pgLatestRows}
      pgLatestDelta={pgLatestDelta}
      dpaHistory={dpaHistory}
      pgHistory={pgHistory}
    />
  )
}
