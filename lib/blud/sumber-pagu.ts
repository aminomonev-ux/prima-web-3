// lib/blud/sumber-pagu.ts — SATU jawaban untuk "pagu tahun ini diambil dari versi mana".
//
// Aturannya dulu tertulis di enam tempat (pagu.ts ×3, data.ts ×2, realisasi-data.ts
// ×1). DPA Perubahan mengubah aturan ini (docs/CONCEPT-blud-dpa-perubahan.md §8);
// mengubah enam salinan satu per satu persis cara L69 lahir.
//
// Modul daun: hanya tipe `db` + `tanggal`, supaya `pagu.ts`, `data.ts`, dan
// `realisasi-data.ts` bisa mengimpornya tanpa lingkaran modul. Semua fungsi
// menerima `Penanya`, jadi bisa dipanggil lewat pool MAUPUN `tx` (L69-b).
import type { Penanya } from '@/lib/data/db'
import { toDateStr } from './tanggal'

export type TabelAnggaran = 'dpa_blud' | 'pergeseran_dpa'

export interface SumberPagu {
  sumber: 'PERGESERAN' | 'DPA' | 'KOSONG'
  versi: string | null
}

/** Versi khayalan untuk pertanyaan "bagaimana kalau …". */
export interface AndaiVersi {
  /** Dianggap sudah tidak ada — pagar hapus: siapa penerusnya? */
  tanpa?: { tabel: TabelAnggaran; versi: string }
  /** Dianggap sudah ada — pagar simpan: apakah ia akan jadi sumber pagu? */
  dengan?: { tabel: TabelAnggaran; versi: string }
}

export function tabelSumber(s: SumberPagu): TabelAnggaran | null {
  if (s.sumber === 'PERGESERAN') return 'pergeseran_dpa'
  if (s.sumber === 'DPA') return 'dpa_blud'
  return null
}

// `toDateStr` WAJIB, jangan `String(v).slice(0,10)`: mysql2 memulangkan kolom DATE
// sebagai objek Date, dan potongan `String(Date)` berbunyi "Sun Jul 26".
async function versiTerakhir(
  q: Penanya, tabel: TabelAnggaran, tahun: number, andai: AndaiVersi,
): Promise<string | null> {
  const tanpa = andai.tanpa?.tabel === tabel ? andai.tanpa.versi : null
  // Empat bentuk kueri, bukan `(? IS NULL OR …)`: nama tabel tidak bisa jadi
  // parameter, dan jalur tanpa pengecualian — yang dipanggil tiap 30 detik oleh
  // layar Realisasi — tetap kueri MAX polos yang dijawab langsung dari indeks.
  const rows = tabel === 'pergeseran_dpa'
    ? (tanpa
      ? await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal <> ${tanpa}`
      : await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}`)
    : (tanpa
      ? await q`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal <> ${tanpa}`
      : await q`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun}`)
  const v = (rows as { v?: unknown }[])[0]?.v
  const ada = v ? toDateStr(v) : null
  const khayal = andai.dengan?.tabel === tabel ? andai.dengan.versi : null
  if (!khayal) return ada
  return !ada || khayal >= ada ? khayal : ada
}

/**
 * Pagu tahun T diambil dari:
 *   Pergeseran versi TERBARU (kolom `pergeseran`)
 *   → kalau tahun T belum punya Pergeseran, DPA versi TERBARU (kolom `jumlah`).
 *
 * Kolom `pergeseran` = pagu SESUDAH digeser (bukan deltanya — itu
 * `bertambah_berkurang`). Lihat recalcPergeseranJumlah di recalc.ts.
 */
export async function sumberPaguTahun(
  q: Penanya, tahun: number, andai: AndaiVersi = {},
): Promise<SumberPagu> {
  const pergeseran = await versiTerakhir(q, 'pergeseran_dpa', tahun, andai)
  if (pergeseran) return { sumber: 'PERGESERAN', versi: pergeseran }
  const dpa = await versiTerakhir(q, 'dpa_blud', tahun, andai)
  if (dpa) return { sumber: 'DPA', versi: dpa }
  return { sumber: 'KOSONG', versi: null }
}

/**
 * Apakah versi yang sedang DITULIS akan menentukan pagu tahun itu?
 *
 * Menyimpan versi DPA lama di tahun yang sudah punya Pergeseran — atau yang sudah
 * punya DPA bertanggal lebih baru — tidak menggeser pagu satu rupiah pun. Pagar
 * §4.3 tidak berlaku di situ, dan menyalakannya hanya menghasilkan penolakan yang
 * tidak bisa dijelaskan ke pengguna.
 */
export async function versiJadiSumberPagu(
  q: Penanya, tabel: TabelAnggaran, tahun: number, versi: string,
): Promise<boolean> {
  const s = await sumberPaguTahun(q, tahun, { dengan: { tabel, versi } })
  return tabelSumber(s) === tabel && s.versi === versi
}

/**
 * Sumber pagu SESUDAH versi ini hilang. `null` = versi ini bukan sumber pagu yang
 * sedang berlaku, jadi menghapusnya tidak menggeser pagu sama sekali (mis. versi
 * DPA lama di tahun yang sudah punya Pergeseran). Jalan cepat itu SAH — yang dulu
 * salah cuma dibacanya tanpa kunci (L84).
 */
export async function sumberPaguPenerus(
  q: Penanya, tabel: TabelAnggaran, tahun: number, versi: string,
): Promise<SumberPagu | null> {
  const kini = await sumberPaguTahun(q, tahun)
  if (tabelSumber(kini) !== tabel || kini.versi !== versi) return null
  return sumberPaguTahun(q, tahun, { tanpa: { tabel, versi } })
}
