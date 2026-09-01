// app/(dashboard)/blud/page.tsx — landing dashboard BLUD (KPI + history)
import { sql, queryOne, queryMany } from '@/lib/data/db'
import { toDateStr } from '@/lib/blud/data'
import { muatDataPagu, ringkasSerapan } from '@/lib/blud/serapan-ringkas'
import { riwayatPergeseran, realisasiTerbaru } from '@/lib/blud/beranda-panel'
import { ringkasTutupKas } from '@/lib/blud/tutup-kas'
import { waktuSekarangWIB } from '@/lib/blud/tanggal'
import { modulSedangMati } from '@/lib/security/guard'
import DashboardClient from './dashboard-client'
import { izinLayar } from './_izin'

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
  // Beranda tidak pernah bisa ditutup (MENU_SELALU_TERBUKA), jadi ini tidak akan
  // melempar siapa pun — yang dibutuhkan cuma petanya, untuk kartu KPI di bawah.
  const { peta, role } = await izinLayar('beranda')

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

  // Panel kiri dulu "5 versi DPA + total pagunya", panel kanan "5 versi
  // Pergeseran + Δ Net". Keduanya diganti isinya: yang satu jadi rekening yang
  // baru dicatat realisasinya, yang satu jadi rekening yang benar-benar digeser.
  // Dua perulangan yang masing-masing memanggil database 5 kali ikut hilang.
  const pgHistory = await riwayatPergeseran(tahun)

  // Sisi realisasi dijaga DUA pagar yang berbeda, dan dua-duanya wajib:
  //
  //   izin  — orang yang tidak boleh membuka Realisasi juga tidak boleh membaca
  //           angkanya di sini. Pagar di API tidak menolong: Beranda memang
  //           berhak memanggil (L69).
  //   sakelar — `beranda` sengaja TIDAK ada di MENU_REALISASI (Beranda tak pernah
  //           bisa ditutup), jadi mematikan sub-modul Realisasi tidak menyentuh
  //           halaman ini dengan sendirinya. Tanpa pemeriksaan di sini, sakelarnya
  //           menutup empat layar tapi angkanya tetap terpampang di Beranda — L72:
  //           sakelar yang cuma mengabukan kartu bukan sakelar.
  //
  // Gate CI `check:killswitch` hanya memindai `app/api/*`; halaman ini bertanya ke
  // database langsung tanpa route file, jadi penjagaannya ada di uji regresi.
  const realisasiMati = await modulSedangMati(['app_status_blud_realisasi'], { role })
  const bolehRealisasi = peta['realisasi'] !== 'TIDAK' && !realisasiMati
  const bolehTutupKas  = peta['tutup-kas'] !== 'TIDAK' && !realisasiMati

  // Kartu serapan dan panel "Realisasi Terbaru" berdiri di atas bahan yang sama
  // persis (pagu per rekening + SUM alokasi). Dimuat SEKALI: memanggilnya
  // sendiri-sendiri berarti tiga kueri berat diulang, dan dua jawaban yang bisa
  // berasal dari keadaan berbeda kalau ada yang menyimpan di sela keduanya.
  const dataPagu = bolehRealisasi ? await muatDataPagu(tahun) : null
  const [serapan, panelRealisasi, tutupKas] = await Promise.all([
    dataPagu ? ringkasSerapan(tahun, dataPagu) : Promise.resolve(null),
    dataPagu ? realisasiTerbaru(tahun, dataPagu) : Promise.resolve(null),
    bolehTutupKas ? ringkasTutupKas(tahun) : Promise.resolve(null),
  ])

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
      pgHistory={pgHistory}
      panelRealisasi={panelRealisasi}
      dimuatPada={waktuSekarangWIB()}
      bolehDpa={peta.dpa !== 'TIDAK'}
      bolehPergeseran={peta.pergeseran !== 'TIDAK'}
      serapan={serapan}
      tutupKas={tutupKas}
      realisasiMati={realisasiMati}
    />
  )
}
