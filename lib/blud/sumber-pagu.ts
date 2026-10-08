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
  /**
   * Babak Perubahan yang berlaku (1, 2, …); `null` = tahun itu belum punya Perubahan.
   * Sengaja field tambahan, bukan nilai `sumber: 'PERUBAHAN'`: hampir semua pemakai
   * bercabang `sumber === 'PERGESERAN' ? pergeseran_dpa : dpa_blud`, dan `tabelSumber`
   * memulangkan null untuk nilai yang tidak dikenalnya — nilai baru di `sumber`
   * diam-diam mematikan pagar pagu.
   */
  perubahan_ke: number | null
}

/** Satu baris `blud_dpa_perubahan`. */
export interface PenandaPerubahan {
  versi_mulai: string
  sumber_dasar: 'PERGESERAN' | 'DPA'
  versi_dasar: string
}

/**
 * Versi yang sedang DITULIS. Pergeseran WAJIB membawa acuannya: tanpa itu tidak
 * bisa dijawab apakah ia babak lama (acuan < M, tidak pernah jadi pagu) atau babak
 * Perubahan. `mulaiPerubahan` = simpanan yang MEMBUAT Perubahan — penandanya belum
 * ada di tabel, jadi harus dibayangkan, kalau tidak pergeseran lama tetap menang
 * dan `pagarSimpanVersi` dilewati tepat pada simpanan Perubahan pertama (R2).
 */
export type VersiTulis =
  | { tabel: 'dpa_blud'; versi: string; mulaiPerubahan?: boolean }
  | { tabel: 'pergeseran_dpa'; versi: string; acuan: string }

/** Versi khayalan untuk pertanyaan "bagaimana kalau …". */
export interface AndaiVersi {
  /** Dianggap sudah tidak ada — pagar hapus: siapa penerusnya? */
  tanpa?: { tabel: TabelAnggaran; versi: string }
  /** Dianggap sudah ada — pagar simpan: apakah ia akan jadi sumber pagu? */
  dengan?: VersiTulis
}

export function tabelSumber(s: Pick<SumberPagu, 'sumber'>): TabelAnggaran | null {
  if (s.sumber === 'PERGESERAN') return 'pergeseran_dpa'
  if (s.sumber === 'DPA') return 'dpa_blud'
  return null
}

const keTanggal = (v: unknown): string | null => (v ? toDateStr(v) : null)

// `toDateStr` WAJIB, jangan `String(v).slice(0,10)`: mysql2 memulangkan kolom DATE
// sebagai objek Date, dan potongan `String(Date)` berbunyi "Sun Jul 26".
//
// `terkunci` = locking read (FOR SHARE) untuk jalur belanja di dalam transaksi: SELECT
// biasa di sana membaca snapshot yang lahir SEBELUM kunci pagu didapat (L55), jadi
// versi yang commit di sela-selanya tidak terlihat (R7). Tiap bentuk kueri ditulis
// utuh — nama tabel tidak bisa jadi parameter, dan modul daun ini tidak boleh
// mengimpor `sql` untuk menyusun fragmen.
async function bacaPenanda(q: Penanya, tahun: number, terkunci: boolean): Promise<PenandaPerubahan[]> {
  const rows = terkunci
    ? await q`SELECT versi_mulai, sumber_dasar, versi_dasar FROM blud_dpa_perubahan WHERE tahun_anggaran = ${tahun} ORDER BY versi_mulai FOR SHARE`
    : await q`SELECT versi_mulai, sumber_dasar, versi_dasar FROM blud_dpa_perubahan WHERE tahun_anggaran = ${tahun} ORDER BY versi_mulai`
  return (rows as Record<string, unknown>[]).map(r => ({
    versi_mulai: toDateStr(r.versi_mulai),
    sumber_dasar: r.sumber_dasar === 'DPA' ? 'DPA' : 'PERGESERAN',
    versi_dasar: toDateStr(r.versi_dasar),
  }))
}

async function dpaTerakhir(
  q: Penanya, tahun: number, andai: AndaiVersi, terkunci: boolean,
): Promise<string | null> {
  const tanpa = andai.tanpa?.tabel === 'dpa_blud' ? andai.tanpa.versi : null
  const rows = terkunci
    ? await q`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun} FOR SHARE`
    : tanpa
      ? await q`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal <> ${tanpa}`
      : await q`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun}`
  const ada = keTanggal((rows as { v?: unknown }[])[0]?.v)
  const khayal = andai.dengan?.tabel === 'dpa_blud' ? andai.dengan.versi : null
  if (!khayal) return ada
  return !ada || khayal >= ada ? khayal : ada
}

/** Pergeseran terbaru yang acuannya >= `acuanMin` (null = semua, aturan lama). */
async function pergeseranTerakhir(
  q: Penanya, tahun: number, acuanMin: string | null, andai: AndaiVersi, terkunci: boolean,
): Promise<string | null> {
  const khayal = andai.dengan?.tabel === 'pergeseran_dpa' ? andai.dengan : null
  // Versi yang sedang ditulis ikut DIKECUALIKAN dari isi tabel: ia akan ditimpa, dan
  // acuannya yang lama belum tentu sama dengan acuan yang akan ditulis.
  const kecuali = andai.tanpa?.tabel === 'pergeseran_dpa' ? andai.tanpa.versi : khayal?.versi ?? null
  // Empat bentuk kueri, bukan `(? IS NULL OR …)`: jalur tanpa Perubahan — yang dipanggil
  // tiap 30 detik oleh layar Realisasi — tetap kueri MAX polos yang dijawab dari indeks.
  const rows = terkunci
    ? (acuanMin
      ? await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND dpa_versi_tanggal >= ${acuanMin} FOR SHARE`
      : await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} FOR SHARE`)
    : acuanMin
      ? (kecuali
        ? await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND dpa_versi_tanggal >= ${acuanMin} AND versi_tanggal <> ${kecuali}`
        : await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND dpa_versi_tanggal >= ${acuanMin}`)
      : (kecuali
        ? await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal <> ${kecuali}`
        : await q`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}`)
  const ada = keTanggal((rows as { v?: unknown }[])[0]?.v)
  if (!khayal || (acuanMin && khayal.acuan < acuanMin)) return ada
  return !ada || khayal.versi >= ada ? khayal.versi : ada
}

/**
 * Pagu tahun T diambil dari (§8):
 *   M    = `versi_mulai` Perubahan TERAKHIR yang masih hidup (tidak ada → −∞)
 *   Pagu = Pergeseran TERBARU yang ACUAN-nya (`dpa_versi_tanggal`) >= M
 *          → belum ada: DPA versi TERBARU (pasti versi Perubahan, semuanya >= M).
 *
 * Tanpa penanda hasilnya identik dengan aturan lama ("Pergeseran terbaru menang atas
 * DPA terbaru"). Patokannya ACUAN, bukan tanggal pergeseran: pergeseran bertanggal
 * hari Perubahan yang dibuat sebelum Perubahan tetap mengacu DPA murni — babak lama.
 *
 * Penanda "hidup" = `versi_mulai` <= DPA terakhir. Satu rumus itu menjawab tiga hal
 * sekaligus: penanda yang dibayangkan untuk simpanan pembuat Perubahan, penanda yang
 * ikut lenyap saat versi Perubahan terakhir dihapus (R5 — pagu kembali ke pergeseran
 * lama), dan penanda yatim kalau pembersihannya pernah terlewat.
 *
 * Kolom `pergeseran` = pagu SESUDAH digeser (bukan deltanya — itu
 * `bertambah_berkurang`). Lihat recalcPergeseranJumlah di recalc.ts.
 */
export async function sumberPaguTahun(
  q: Penanya, tahun: number, andai: AndaiVersi = {}, opsi: { terkunci?: boolean } = {},
): Promise<SumberPagu> {
  const terkunci = opsi.terkunci === true
  if (terkunci && (andai.tanpa || andai.dengan)) {
    throw new Error('sumberPaguTahun: mode terkunci hanya untuk keadaan nyata, bukan andai-andai')
  }
  const penanda = await bacaPenanda(q, tahun, terkunci)
  const membuat = andai.dengan?.tabel === 'dpa_blud' && andai.dengan.mulaiPerubahan === true

  if (!penanda.length && !membuat) {
    const pergeseran = await pergeseranTerakhir(q, tahun, null, andai, terkunci)
    if (pergeseran) return { sumber: 'PERGESERAN', versi: pergeseran, perubahan_ke: null }
    const dpa = await dpaTerakhir(q, tahun, andai, terkunci)
    if (dpa) return { sumber: 'DPA', versi: dpa, perubahan_ke: null }
    return { sumber: 'KOSONG', versi: null, perubahan_ke: null }
  }

  const dpa = await dpaTerakhir(q, tahun, andai, terkunci)
  const hidup = penanda.map(p => p.versi_mulai).filter(m => dpa !== null && m <= dpa)
  if (membuat && andai.dengan) hidup.push(andai.dengan.versi)
  hidup.sort()
  const M = hidup.length ? hidup[hidup.length - 1] : null
  const ke = M ? hidup.length : null

  const pergeseran = await pergeseranTerakhir(q, tahun, M, andai, terkunci)
  if (pergeseran) return { sumber: 'PERGESERAN', versi: pergeseran, perubahan_ke: ke }
  if (dpa) return { sumber: 'DPA', versi: dpa, perubahan_ke: ke }
  return { sumber: 'KOSONG', versi: null, perubahan_ke: null }
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
  q: Penanya, tahun: number, tulis: VersiTulis,
): Promise<boolean> {
  const s = await sumberPaguTahun(q, tahun, { dengan: tulis })
  return tabelSumber(s) === tulis.tabel && s.versi === tulis.versi
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

/** Seluruh penanda Perubahan tahun itu, urut `versi_mulai`. Dari dalam transaksi WAJIB `tx`. */
export async function penandaPerubahan(q: Penanya, tahun: number): Promise<PenandaPerubahan[]> {
  return bacaPenanda(q, tahun, false)
}

/** Penanda yang menaungi sebuah versi DPA: yang terakhir dengan `versi_mulai` <= versi itu. */
export function penandaUntukVersi(daftar: PenandaPerubahan[], versi: string): PenandaPerubahan | null {
  let hasil: PenandaPerubahan | null = null
  for (const p of daftar) if (p.versi_mulai <= versi) hasil = p
  return hasil
}
