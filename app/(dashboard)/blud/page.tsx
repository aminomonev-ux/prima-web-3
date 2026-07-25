// app/(dashboard)/blud/page.tsx — landing dashboard BLUD (KPI + history)
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { sql, queryOne, queryMany } from '@/lib/data/db'
import { toDateStr } from '@/lib/blud/data'
import DashboardClient from './dashboard-client'

export const dynamic = 'force-dynamic'

// Total anggaran = SUM(jumlah) di tipe GRANDMASTER (top-level rollup).
// Fallback: kalau GRANDMASTER tidak ada, pakai SUM dari rows parent_id NULL/empty.
async function getDpaTotal(tahun: number, versi: string | null): Promise<number> {
  if (!versi) return 0
  const r = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(jumlah), 0) AS total
        FROM dpa_blud
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi} AND tipe_baris = 'GRANDMASTER'`
  )
  const grand = Number(r?.total ?? 0)
  if (grand > 0) return grand
  const fb = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(jumlah), 0) AS total
        FROM dpa_blud
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
          AND (parent_id IS NULL OR parent_id = '')
          AND tipe_baris <> 'GRANDMASTER'`
  )
  return Number(fb?.total ?? 0)
}

async function getPergeseranDelta(tahun: number, versi: string | null): Promise<number> {
  if (!versi) return 0
  const r = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(bertambah_berkurang), 0) AS total
        FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi} AND tipe_baris = 'GRANDMASTER'`
  )
  const grand = Number(r?.total ?? 0)
  if (grand !== 0) return grand
  const fb = await queryOne<{ total: string | number | null }>(
    sql`SELECT COALESCE(SUM(bertambah_berkurang), 0) AS total
        FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
          AND (parent_id IS NULL OR parent_id = '')
          AND tipe_baris <> 'GRANDMASTER'`
  )
  return Number(fb?.total ?? 0)
}

// B2: reuse toDateStr dari data.ts (offset +07:00, fix B-CQ-1) — getter lokal
// server menghasilkan tanggal mundur 1 hari saat server ber-TZ UTC
const toIsoDate = toDateStr

export default async function BludLandingPage({ searchParams }: { searchParams: Promise<{ tahun?: string }> }) {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')

  // Daftar tahun (union) + resolve tahun terpilih (§9 #1: berjalan → LATEST data)
  const tahunRows = await queryMany<{ tahun_anggaran: string | number }>(
    sql`SELECT tahun_anggaran FROM dpa_blud
        UNION SELECT tahun_anggaran FROM pergeseran_dpa
        ORDER BY tahun_anggaran DESC`
  )
  const tahunList = tahunRows.map(r => Number(r.tahun_anggaran)).filter(n => n > 0)
  const currentYear = new Date().getFullYear()
  const sp = await searchParams
  const reqTahun = Number(sp?.tahun)
  const tahun = (Number.isInteger(reqTahun) && tahunList.includes(reqTahun))
    ? reqTahun
    : (tahunList.includes(currentYear) ? currentYear : (tahunList[0] ?? currentYear))

  // Latest versi tanggal dalam tahun
  const dpaLatestRow = await queryOne<{ versi_tanggal: unknown }>(
    sql`SELECT versi_tanggal FROM dpa_blud WHERE tahun_anggaran = ${tahun} ORDER BY versi_tanggal DESC LIMIT 1`
  )
  const dpaLatestVersi = dpaLatestRow ? toIsoDate(dpaLatestRow.versi_tanggal) || null : null

  const pgLatestRow = await queryOne<{ versi_tanggal: unknown }>(
    sql`SELECT versi_tanggal FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} ORDER BY versi_tanggal DESC LIMIT 1`
  )
  const pgLatestVersi = pgLatestRow ? toIsoDate(pgLatestRow.versi_tanggal) || null : null

  // Row counts (latest version)
  const dpaCountRow = dpaLatestVersi
    ? await queryOne<{ c: string | number }>(
        sql`SELECT COUNT(*) AS c FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${dpaLatestVersi}`,
      )
    : null
  const pgCountRow = pgLatestVersi
    ? await queryOne<{ c: string | number }>(
        sql`SELECT COUNT(*) AS c FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${pgLatestVersi}`,
      )
    : null

  const dpaLatestRows = Number(dpaCountRow?.c ?? 0)
  const pgLatestRows  = Number(pgCountRow?.c ?? 0)
  const dpaLatestTotal = await getDpaTotal(tahun, dpaLatestVersi)
  const pgLatestDelta  = await getPergeseranDelta(tahun, pgLatestVersi)

  // History — 5 versi terbaru tiap modul DALAM TAHUN. 2-step (versi list → totals).
  const dpaVersis = await queryMany<{ versi_tanggal: unknown; jumlah_baris: string | number }>(
    sql`SELECT versi_tanggal, COUNT(*) AS jumlah_baris
        FROM dpa_blud
        WHERE tahun_anggaran = ${tahun}
        GROUP BY versi_tanggal
        ORDER BY versi_tanggal DESC
        LIMIT 5`
  )
  const dpaHistory: Array<{ versi_tanggal: string; jumlah_baris: number; total_jumlah: number }> = []
  for (const v of dpaVersis) {
    const versi = toIsoDate(v.versi_tanggal)
    const total = await getDpaTotal(tahun, versi)
    dpaHistory.push({ versi_tanggal: versi, jumlah_baris: Number(v.jumlah_baris ?? 0), total_jumlah: total })
  }

  const pgVersis = await queryMany<{ versi_tanggal: unknown; jumlah_baris: string | number }>(
    sql`SELECT versi_tanggal, COUNT(*) AS jumlah_baris
        FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun}
        GROUP BY versi_tanggal
        ORDER BY versi_tanggal DESC
        LIMIT 5`
  )
  const pgHistory: Array<{ versi_tanggal: string; jumlah_baris: number; total_jumlah: number }> = []
  for (const v of pgVersis) {
    const versi = toIsoDate(v.versi_tanggal)
    const delta = await getPergeseranDelta(tahun, versi)
    pgHistory.push({ versi_tanggal: versi, jumlah_baris: Number(v.jumlah_baris ?? 0), total_jumlah: delta })
  }

  return (
    <DashboardClient
      tahun={tahun}
      tahunList={tahunList}
      currentYear={currentYear}
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
