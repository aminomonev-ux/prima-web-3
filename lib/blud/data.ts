// lib/blud/data.ts — Data access layer BLUD (DPA + Pergeseran), MySQL
// Tahap 11 fixes:
// - B-BUG-3 (CRITICAL): saveDpa/savePergeseran DELETE+INSERT pakai withTransaction.
// - B-PERF-1 (CRITICAL): ganti for-loop INSERT (700 round-trip) → bulkInsert single VALUES.
// - B-CQ-1 (MED): toDateStr off-by-one — Date dari mysql2 (pool TZ +07:00) saat
//   server UTC → .toISOString().slice() shift -1 hari. Fix: add +07:00 offset.
// Tahun Anggaran (CONCEPT-blud-tahun-anggaran, Opsi B): identitas versi jadi
//   (tahun_anggaran, versi_tanggal). tahun WAJIB masuk dedupe DELETE + lock key,
//   kalau tidak 2 tahun disimpan tanggal sama saling menimpa (§1).

import { sql, withTransaction, bulkInsert } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'
import {
  assertBludVersion, bumpBludVersion, dropBludVersion, getBludVersion, bludVersiKey,
  acquireBludLock, BLUD_PAGU_ENTITY, bludPaguKey,
} from './lock'
// Tipe saja — `pagu.ts` mengimpor `toDateStr` dari berkas ini, jadi impor nilai
// akan membuat lingkaran modul. Bentuk hasilnya sengaja sama dengan pagar §4.3
// supaya panel bentrok di layar Pengaturan bisa memakai komponen yang sama.
import type { BentrokPagu } from './pagu'
import { ensureAnggaranKey } from './anggaran-key'
import { JAKARTA_OFFSET_MS } from './tanggal'
import type {
  DpaBaris, DpaBarisInput,
  PergeseranBaris, PergeseranBarisInput,
  DpaHistoryItem, PergeseranHistoryItem,
} from '@/types'

// Audit BLUD v1.2 (B-NEW-3): safety threshold supaya drop >50% trigger konfirmasi.
const SAFE_DROP_THRESHOLD = 0.5

export class BludReplaceSafetyError extends Error {
  constructor(public table: string, public existing: number, public incoming: number, public dropPct: number) {
    super(
      `Safety guard: hanya ${incoming} baris baru vs ${existing} existing di ${table} ` +
      `(drop ${dropPct.toFixed(1)}%). Pakai force=true kalau memang sengaja.`,
    )
    this.name = 'BludReplaceSafetyError'
  }
}

/**
 * Pagar jangkar (CONCEPT-blud-realisasi §2.3). Baris yang SAMA — terbukti dari
 * `row_id` yang sudah pernah berjangkar — tidak boleh datang tanpa jangkarnya.
 * Kalau dibiarkan, `ensureAnggaranKey` mencetak kunci baru dan seluruh realisasi
 * yang menempel di baris itu jadi yatim tanpa satu pun pesan galat.
 *
 * Ini pernah terjadi sungguhan: klien DPA & Pergeseran menyusun ulang baris
 * dengan daftar kolom tetap dan `anggaran_key` tidak masuk daftar. Zod
 * `.passthrough()` tidak menolong — yang membuang kliennya, bukan servernya.
 */
export class BludJangkarHilangError extends Error {
  constructor(public table: string, public yatim: number, public berjangkar: number) {
    super(
      `Simpan dibatalkan: ${yatim} dari ${berjangkar} baris berjangkar dikirim tanpa anggaran_key. ` +
      `Baris itu sudah punya realisasi yang menempel — menyimpannya sekarang akan memutus tautannya. ` +
      `Muat ulang halaman lalu ulangi; kalau tetap muncul, ada jalur simpan yang membuang anggaran_key.`,
    )
    this.name = 'BludJangkarHilangError'
  }
}

/**
 * T1 — versi yang dihapus masih menyangga realisasi. Jalur SIMPAN dijaga tiga
 * lapis (`periksaJangkar`, `pagarSimpanVersi`, ambang penurunan baris);
 * jalur HAPUS dulu tidak punya satu pun, padahal akibatnya identik dan justru
 * lebih senyap: `getPaguEfektif` selalu mengambil versi TERBARU, jadi menghapus
 * versi teratas memundurkan pagu SETAHUN penuh sementara alokasinya tetap tinggal.
 */
export class BludVersiTerpakaiError extends Error {
  constructor(public bentrok: BentrokPagu[], public penerus: string | null) {
    const t = bentrok[0]
    const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
    super(
      `Versi ini masih menyangga ${bentrok.length} baris anggaran yang sudah dipakai transaksi — `
      + `${t.kode_rekening} ${t.hilang ? 'hilang' : `turun ke ${rp(t.pagu_baru)}`} padahal sudah terserap ${rp(t.terserap)}. `
      + (penerus
        ? `Sesudah dihapus, pagu setahun mundur ke versi ${penerus}.`
        : 'Sesudah dihapus, tahun ini tidak punya pagu sama sekali dan seluruh realisasinya jadi yatim.'),
    )
    this.name = 'BludVersiTerpakaiError'
  }
}

/**
 * §4.3 pada jalur SIMPAN — kembaran `BludVersiTerpakaiError` yang menjaga jalur hapus.
 *
 * Berbeda dari pagar jangkar, yang ini SENGAJA bisa ditembus `turunkan_paksa`:
 * menurunkan pagu di bawah serapan kadang memang keputusan sadar (rekening dipindah,
 * realisasinya menyusul dikoreksi). Yang dibutuhkan konfirmasi + jejak audit, bukan
 * larangan mutlak.
 */
export class BludPaguDibawahRealisasiError extends Error {
  constructor(public bentrok: BentrokPagu[]) {
    const t = bentrok[0]
    const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`
    super(
      `${bentrok.length} baris anggaran turun di bawah realisasi yang sudah terjadi — `
      + `${t.kode_rekening} ${t.hilang ? 'hilang dari versi ini' : `jadi ${rp(t.pagu_baru)}`} `
      + `padahal sudah terserap ${rp(t.terserap)} (kurang ${rp(t.minus)}). `
      + 'Perbaiki angkanya, atau simpan ulang dengan konfirmasi kalau penurunan ini memang disengaja.',
    )
    this.name = 'BludPaguDibawahRealisasiError'
  }
}

/** T1 — DPA yang masih jadi acuan sebuah Pergeseran (soft-FK `dpa_versi_tanggal`). */
export class BludVersiDirujukError extends Error {
  constructor(public versi: string, public perujuk: string[]) {
    super(
      `Versi DPA ${versi} masih jadi acuan ${perujuk.length} versi Pergeseran `
      + `(${perujuk.join(', ')}). Hapus pergeserannya dulu.`,
    )
    this.name = 'BludVersiDirujukError'
  }
}

interface BarisPaguVersi { kode_rekening: string; uraian: string; pagu: number }

async function barisBerjangkar(
  tx: TxSql, table: 'dpa_blud' | 'pergeseran_dpa', tahun: number, versi: string,
): Promise<Map<string, BarisPaguVersi>> {
  const rows = table === 'dpa_blud'
    ? await tx`
        SELECT anggaran_key, kode_rekening, uraian, jumlah AS pagu FROM dpa_blud
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
          AND anggaran_key IS NOT NULL AND anggaran_key <> ''
      `
    : await tx`
        SELECT anggaran_key, kode_rekening, uraian, pergeseran AS pagu FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}
          AND anggaran_key IS NOT NULL AND anggaran_key <> ''
      `
  const map = new Map<string, BarisPaguVersi>()
  for (const r of rows as Record<string, unknown>[]) {
    map.set(String(r.anggaran_key), {
      kode_rekening: String(r.kode_rekening ?? ''),
      uraian: String(r.uraian ?? ''),
      pagu: Number(r.pagu ?? 0),
    })
  }
  return map
}

async function versiSebelum(
  tx: TxSql, table: 'dpa_blud' | 'pergeseran_dpa', tahun: number, versi: string,
): Promise<string | null> {
  const rows = table === 'dpa_blud'
    ? await tx`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal < ${versi}`
    : await tx`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal < ${versi}`
  const v = (rows as { v?: unknown }[])[0]?.v
  return v ? toDateStr(v) : null
}

/**
 * Pagu tahun itu SESUDAH versi ini hilang. `null` = versi ini bukan sumber pagu
 * yang sedang berlaku, jadi menghapusnya tidak menggeser pagu sama sekali
 * (mis. versi DPA lama di tahun yang sudah punya Pergeseran).
 *
 * Aturan penerusnya persis `getPaguSumber`: Pergeseran terbaru menang atas DPA,
 * dan yang dipakai selalu `MAX(versi_tanggal)`.
 */
async function paguPenerus(
  tx: TxSql, table: 'dpa_blud' | 'pergeseran_dpa', tahun: number, versi: string,
): Promise<{ rows: Map<string, BarisPaguVersi>; versi: string | null } | null> {
  const pgs = await tx`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}` as { v?: unknown }[]
  const maxPergeseran = pgs[0]?.v ? toDateStr(pgs[0].v) : null

  if (table === 'dpa_blud') {
    if (maxPergeseran) return null // pagu diambil dari Pergeseran, DPA tidak menyentuhnya
    const dpa = await tx`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun}` as { v?: unknown }[]
    if (!dpa[0]?.v || toDateStr(dpa[0].v) !== versi) return null
    const penerus = await versiSebelum(tx, 'dpa_blud', tahun, versi)
    return {
      rows: penerus ? await barisBerjangkar(tx, 'dpa_blud', tahun, penerus) : new Map(),
      versi: penerus,
    }
  }

  if (maxPergeseran !== versi) return null
  const penerus = await versiSebelum(tx, 'pergeseran_dpa', tahun, versi)
  if (penerus) {
    return { rows: await barisBerjangkar(tx, 'pergeseran_dpa', tahun, penerus), versi: penerus }
  }
  // Pergeseran terakhir hilang → pagu jatuh kembali ke DPA terbaru.
  const dpa = await tx`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun}` as { v?: unknown }[]
  const dpaVersi = dpa[0]?.v ? toDateStr(dpa[0].v) : null
  return {
    rows: dpaVersi ? await barisBerjangkar(tx, 'dpa_blud', tahun, dpaVersi) : new Map(),
    versi: dpaVersi,
  }
}

/**
 * T1 — dijalankan DI DALAM transaksi hapus, sebelum DELETE.
 *
 * Kunci pagu diambil untuk setiap `anggaran_key` yang punya alokasi, urut MENAIK
 * — entity & urutan yang sama dengan `kunciDanPeriksaPagu`, jadi jaminan
 * bebas-deadlock §5.3 tetap utuh dan transaksi realisasi yang sedang berjalan
 * tidak bisa menyelinap di antara pemeriksaan ini dan DELETE-nya.
 *
 * Sisa risiko yang diterima sadar: rekening yang BELUM pernah punya alokasi tidak
 * ikut dikunci, jadi transaksi pertama untuk rekening itu masih bisa berbarengan
 * dengan penghapusan versi. Mengunci seluruh baris DPA (ratusan) untuk menutup
 * celah itu membuat operasi hapus jadi ratusan round-trip — harganya tidak sepadan.
 */
async function pagarHapusVersi(
  tx: TxSql, table: 'dpa_blud' | 'pergeseran_dpa', tahun: number, versi: string,
): Promise<void> {
  const penerus = await paguPenerus(tx, table, tahun, versi)
  if (!penerus) return

  const kunciRows = await tx`
    SELECT DISTINCT anggaran_key FROM blud_realisasi_alokasi
    WHERE tahun_anggaran = ${tahun} AND anggaran_key IS NOT NULL AND anggaran_key <> ''
  ` as { anggaran_key?: unknown }[]
  const kunci = kunciRows.map(r => String(r.anggaran_key ?? '')).filter(Boolean).sort((a, b) => a.localeCompare(b))
  if (!kunci.length) return

  for (const k of kunci) await acquireBludLock(tx, BLUD_PAGU_ENTITY, bludPaguKey(tahun, k))

  const lama = await barisBerjangkar(tx, table, tahun, versi)
  const bentrok: BentrokPagu[] = []
  for (const k of kunci) {
    // FOR UPDATE, bukan SELECT biasa: pada REPEATABLE READ snapshot dibaca dari
    // pernyataan pertama transaksi ini — yaitu sebelum kuncinya didapat (L55).
    const rows = await tx`
      SELECT COALESCE(SUM(nilai), 0) AS n FROM blud_realisasi_alokasi
      WHERE tahun_anggaran = ${tahun} AND anggaran_key = ${k} FOR UPDATE
    ` as { n?: unknown }[]
    const terserap = Number(rows[0]?.n ?? 0)
    if (terserap <= 0) continue

    const b = penerus.rows.get(k)
    const paguBaru = b?.pagu ?? 0
    if (paguBaru >= terserap) continue
    const l = lama.get(k)
    bentrok.push({
      anggaran_key:  k,
      kode_rekening: b?.kode_rekening || l?.kode_rekening || '(tidak diketahui)',
      uraian:        b?.uraian || l?.uraian || '',
      pagu_baru:     paguBaru,
      terserap,
      minus:         terserap - paguBaru,
      hilang:        !b,
    })
  }
  if (bentrok.length) {
    bentrok.sort((a, b) => b.minus - a.minus)
    throw new BludVersiTerpakaiError(bentrok, penerus.versi)
  }
}

/**
 * Apakah versi yang sedang DITULIS akan menentukan pagu efektif tahun itu?
 * Cerminan `paguPenerus` untuk arah sebaliknya.
 *
 * Menyimpan versi DPA lama di tahun yang sudah punya Pergeseran — atau yang sudah
 * punya DPA bertanggal lebih baru — tidak menggeser pagu satu rupiah pun. Pagar
 * §4.3 tidak berlaku di situ, dan menyalakannya hanya menghasilkan penolakan yang
 * tidak bisa dijelaskan ke pengguna.
 */
async function versiJadiSumberPagu(
  tx: TxSql, table: 'dpa_blud' | 'pergeseran_dpa', tahun: number, versi: string,
): Promise<boolean> {
  const pgs = await tx`SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}` as { v?: unknown }[]
  const maxPergeseran = pgs[0]?.v ? toDateStr(pgs[0].v) : null

  if (table === 'pergeseran_dpa') return !maxPergeseran || versi >= maxPergeseran

  // B2 — selama tahun itu belum punya Pergeseran, DPA-lah pagu yang berlaku
  // (`getPaguSumber`). Begitu ada Pergeseran, mengubah DPA tidak menyentuh pagu.
  if (maxPergeseran) return false
  const dpa = await tx`SELECT MAX(versi_tanggal) AS v FROM dpa_blud WHERE tahun_anggaran = ${tahun}` as { v?: unknown }[]
  const maxDpa = dpa[0]?.v ? toDateStr(dpa[0].v) : null
  return !maxDpa || versi >= maxDpa
}

/**
 * §4.3 pada jalur SIMPAN — dijalankan DI DALAM transaksi, sebelum DELETE+INSERT.
 *
 * B3 — dulu pemeriksaan ini hidup di route (`cekPaguDibawahRealisasi`), di luar
 * transaksi dan tanpa kunci apa pun: TOCTOU murni. Antara pemeriksaan dan
 * `savePergeseran` yang membuka transaksinya sendiri, sebuah transaksi Buku Kas
 * bisa commit dan menaikkan serapan — pergeserannya tetap masuk, dan pagu berakhir
 * di bawah realisasi tanpa satu pun peringatan.
 *
 * B2 — jalur `saveDpa` tidak punya pemeriksaan ini SAMA SEKALI, padahal selama
 * tahun itu belum punya Pergeseran, DPA-lah pagu yang berlaku.
 *
 * Kunci diambil untuk setiap `anggaran_key` yang punya alokasi, urut MENAIK —
 * entity & urutan yang sama dengan `kunciDanPeriksaPagu` dan `pagarHapusVersi`,
 * jadi jaminan bebas-deadlock §5.3 tetap utuh.
 *
 * Mengembalikan daftar bentrok yang BENAR-BENAR teramati di bawah kunci. Pemanggil
 * memakainya untuk audit — jangan mencatat hasil pemeriksaan di luar transaksi,
 * karena itu justru angka yang bisa sudah basi.
 */
async function pagarSimpanVersi(
  tx: TxSql,
  table: 'dpa_blud' | 'pergeseran_dpa',
  tahun: number,
  versi: string,
  baru: Map<string, BarisPaguVersi>,
  turunkanPaksa: boolean,
): Promise<BentrokPagu[]> {
  if (!(await versiJadiSumberPagu(tx, table, tahun, versi))) return []

  const kunciRows = await tx`
    SELECT DISTINCT anggaran_key FROM blud_realisasi_alokasi
    WHERE tahun_anggaran = ${tahun} AND anggaran_key IS NOT NULL AND anggaran_key <> ''
  ` as { anggaran_key?: unknown }[]
  const kunci = kunciRows.map(r => String(r.anggaran_key ?? '')).filter(Boolean).sort((a, b) => a.localeCompare(b))
  if (!kunci.length) return []

  for (const k of kunci) await acquireBludLock(tx, BLUD_PAGU_ENTITY, bludPaguKey(tahun, k))

  const lama = await barisBerjangkar(tx, table, tahun, versi)
  const bentrok: BentrokPagu[] = []
  for (const k of kunci) {
    // FOR UPDATE, bukan SELECT biasa — alasan yang sama dengan `pagarHapusVersi`
    // dan `kunciDanPeriksaPagu`: snapshot REPEATABLE READ dibaca dari pernyataan
    // pertama transaksi, yaitu sebelum kuncinya didapat (L55).
    const rows = await tx`
      SELECT COALESCE(SUM(nilai), 0) AS n FROM blud_realisasi_alokasi
      WHERE tahun_anggaran = ${tahun} AND anggaran_key = ${k} FOR UPDATE
    ` as { n?: unknown }[]
    const terserap = Number(rows[0]?.n ?? 0)
    if (terserap <= 0) continue

    const b = baru.get(k)
    const paguBaru = b?.pagu ?? 0
    if (paguBaru >= terserap) continue
    const l = lama.get(k)
    bentrok.push({
      anggaran_key:  k,
      kode_rekening: b?.kode_rekening || l?.kode_rekening || '(tidak diketahui)',
      uraian:        b?.uraian || l?.uraian || '',
      pagu_baru:     paguBaru,
      terserap,
      minus:         terserap - paguBaru,
      hilang:        !b,
    })
  }
  if (!bentrok.length) return []
  bentrok.sort((a, b) => b.minus - a.minus)
  if (!turunkanPaksa) throw new BludPaguDibawahRealisasiError(bentrok)
  return bentrok
}

/**
 * Hasil simpan DPA/Pergeseran. `jangkar` = peta `row_id → anggaran_key` versi
 * yang baru saja ditulis, WAJIB dikembalikan ke klien.
 *
 * Kunci dicetak server untuk baris yang baru lahir. Kalau petanya tidak pulang,
 * state di layar tetap tanpa jangkar — dan simpan KEDUA (tanpa muat ulang)
 * terlihat persis seperti klien yang membuang jangkar, lalu ditolak
 * `periksaJangkar` padahal tidak ada yang salah. Itu betul-betul terjadi saat
 * pagar ini pertama kali dicoba.
 */
export interface SimpanHasil {
  existing: number
  replaced: number
  newVersion: number
  jangkar: Record<string, string>
  /**
   * §4.3 — bentrok pagu yang BENAR-BENAR teramati di bawah kunci, dan tetap
   * disimpan karena pemanggil mengirim `turunkanPaksa`. Kosong kalau tidak ada.
   * Dipakai route untuk menulis audit dengan angka yang sungguh terjadi, bukan
   * hasil pemeriksaan di luar transaksi yang bisa sudah basi.
   */
  bentrokPagu: BentrokPagu[]
}

/**
 * Dijalankan DI DALAM transaksi simpan, sebelum DELETE. Pembandingnya versi
 * TERBARU tahun itu — bukan versi yang sedang ditimpa — supaya versi baru yang
 * lahir tanpa jangkar pun ketahuan.
 */
async function periksaJangkar(
  tx: TxSql,
  table: 'dpa_blud' | 'pergeseran_dpa',
  tahun: number,
  rows: { row_id: string; anggaran_key?: string | null }[],
): Promise<void> {
  const lama = table === 'dpa_blud'
    ? await tx`
        SELECT row_id FROM dpa_blud
        WHERE tahun_anggaran = ${tahun} AND anggaran_key IS NOT NULL AND anggaran_key <> ''
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM dpa_blud WHERE tahun_anggaran = ${tahun})
      `
    : await tx`
        SELECT row_id FROM pergeseran_dpa
        WHERE tahun_anggaran = ${tahun} AND anggaran_key IS NOT NULL AND anggaran_key <> ''
          AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun})
      `
  const berjangkar = new Set(
    (lama as { row_id?: unknown }[]).map(r => String(r.row_id ?? '')).filter(Boolean),
  )
  if (!berjangkar.size) return
  // Baris yang benar-benar baru punya row_id baru pula, jadi tidak pernah cocok
  // di sini — impor besar atau susun ulang dari nol tidak akan ikut tertahan.
  const yatim = rows.filter(
    r => berjangkar.has(r.row_id) && !String(r.anggaran_key ?? '').trim(),
  ).length
  if (yatim > 0) throw new BludJangkarHilangError(table, yatim, berjangkar.size)
}

// Pool config `timezone: '+07:00'` → mysql2 interpret DATE column sebagai
// midnight di +07:00. Di server UTC (Vercel), `Date.toISOString()` shift
// back ke UTC → bisa kembalikan tanggal sebelumnya. Tambah 7h offset supaya
// ISO string mewakili midnight UTC dari DATE asli.
export function toDateStr(v: unknown): string {
  if (!v) return ''
  if (v instanceof Date) {
    return new Date(v.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
  }
  return String(v).slice(0, 10)
}

function normDpa(r: Record<string, unknown>): DpaBaris {
  return {
    id: Number(r.id), versi_tanggal: toDateStr(r.versi_tanggal),
    kode_rekening: String(r.kode_rekening ?? ''),
    uraian: String(r.uraian ?? ''), vol: r.vol != null ? Number(r.vol) : null,
    satuan: r.satuan != null ? String(r.satuan) : null,
    harga: r.harga != null ? Number(r.harga) : null,
    jumlah: Number(r.jumlah ?? 0),
    penanggung_jawab: r.penanggung_jawab != null ? String(r.penanggung_jawab) : null,
    keterangan: r.keterangan != null ? String(r.keterangan) : null,
    tipe_baris: String(r.tipe_baris) as DpaBaris['tipe_baris'],
    row_id: String(r.row_id ?? ''),
    anggaran_key: r.anggaran_key != null ? String(r.anggaran_key) : null,
    parent_id: r.parent_id != null ? String(r.parent_id) : null,
    urutan: Number(r.urutan ?? 0),
    origin: (r.origin === 'USULAN' ? 'USULAN' : 'MANUAL'),
    usulan_item_id: r.usulan_item_id != null ? Number(r.usulan_item_id) : null,
    usulan_no: r.usulan_no != null ? String(r.usulan_no) : null,
  }
}

function normPergeseran(r: Record<string, unknown>): PergeseranBaris {
  return {
    id: Number(r.id), versi_tanggal: toDateStr(r.versi_tanggal),
    dpa_versi_tanggal: toDateStr(r.dpa_versi_tanggal),
    kode_rekening: String(r.kode_rekening ?? ''), uraian: String(r.uraian ?? ''),
    vol: r.vol != null ? Number(r.vol) : null, satuan: r.satuan != null ? String(r.satuan) : null,
    harga: r.harga != null ? Number(r.harga) : null, jumlah: Number(r.jumlah ?? 0),
    vol_p: r.vol_p != null ? Number(r.vol_p) : null,
    harga_p: r.harga_p != null ? Number(r.harga_p) : null,
    pergeseran: Number(r.pergeseran ?? 0), bertambah_berkurang: Number(r.bertambah_berkurang ?? 0),
    penanggung_jawab: r.penanggung_jawab != null ? String(r.penanggung_jawab) : null,
    keterangan: r.keterangan != null ? String(r.keterangan) : null,
    tipe_baris: String(r.tipe_baris) as PergeseranBaris['tipe_baris'],
    row_id: String(r.row_id ?? ''),
    anggaran_key: r.anggaran_key != null ? String(r.anggaran_key) : null,
    parent_id: r.parent_id != null ? String(r.parent_id) : null,
    urutan: Number(r.urutan ?? 0),
  }
}

// ─── TAHUN ANGGARAN ──────────────────────────────────────────────────────────

/** Daftar tahun anggaran yang punya data (DPA ∪ Pergeseran), terbaru dulu. */
export async function getTahunList(): Promise<number[]> {
  const rows = await sql`
    SELECT tahun_anggaran FROM dpa_blud
    UNION
    SELECT tahun_anggaran FROM pergeseran_dpa
    ORDER BY tahun_anggaran DESC
  ` as Record<string, unknown>[]
  return rows.map(r => Number(r.tahun_anggaran)).filter(n => n > 0)
}

/** Versi DPA terbaru lintas-tahun beserta tahunnya — dipakai pembaca overview
 *  (dashboard cross-modul) yang tidak punya konteks tahun terpilih. */
export async function getDpaLatest(): Promise<{ tahun: number; versi: string } | null> {
  const rows = await sql`
    SELECT tahun_anggaran, versi_tanggal FROM dpa_blud
    ORDER BY versi_tanggal DESC, tahun_anggaran DESC LIMIT 1
  ` as Record<string, unknown>[]
  if (!rows.length) return null
  return { tahun: Number(rows[0].tahun_anggaran), versi: toDateStr(rows[0].versi_tanggal) }
}

// ─── DPA ─────────────────────────────────────────────────────────────────────

export async function getDpaHistory(tahun: number): Promise<DpaHistoryItem[]> {
  const rows = await sql`SELECT versi_tanggal, COUNT(*) AS jumlah_baris FROM dpa_blud WHERE tahun_anggaran = ${tahun} GROUP BY versi_tanggal ORDER BY versi_tanggal DESC`
  return (rows as Record<string,unknown>[]).map(r => ({ versi_tanggal: toDateStr(r.versi_tanggal), jumlah_baris: Number(r.jumlah_baris) }))
}

export async function getDpaLatestDate(tahun: number): Promise<string | null> {
  const rows = await sql`SELECT MAX(versi_tanggal) AS latest FROM dpa_blud WHERE tahun_anggaran = ${tahun}`
  const v = (rows as Record<string,unknown>[])[0]?.latest
  return v ? toDateStr(v) : null
}

export async function getDpaByDate(tahun: number, versiTanggal: string): Promise<DpaBaris[]> {
  const rows = await sql`SELECT * FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal} ORDER BY urutan ASC`
  return (rows as Record<string,unknown>[]).map(normDpa)
}

/** L51: get current version utk client baseline (kirim balik saat save). */
export async function getDpaVersion(tahun: number, versiTanggal: string): Promise<number> {
  return getBludVersion('dpa_blud', bludVersiKey(tahun, versiTanggal))
}

const DPA_COLUMNS = [
  'tahun_anggaran', 'versi_tanggal', 'kode_rekening', 'uraian', 'vol', 'satuan', 'harga', 'jumlah',
  'penanggung_jawab', 'keterangan', 'tipe_baris', 'row_id', 'anggaran_key', 'parent_id', 'urutan',
  'origin', 'usulan_item_id', 'usulan_no',
]

export async function saveDpa(
  tahun: number,
  versiTanggal: string,
  rows: DpaBarisInput[],
  userId: number,
  expectedVersion: number,
  force = false,
  turunkanPaksa = false,
): Promise<SimpanHasil> {
  const incoming = rows.length
  const lockKey = bludVersiKey(tahun, versiTanggal)

  if (!incoming) {
    // Edge case: user kirim kosong + force=true → hapus saja versi itu
    const cntRows = await sql`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    const existing = Number(cntRows[0]?.cnt ?? 0)
    if (force && existing > 0) {
      let bentrokKosong: BentrokPagu[] = []
      await withTransaction(async ({ tx }) => {
        await assertBludVersion(tx, 'dpa_blud', lockKey, expectedVersion)
        // Mengosongkan versi = pagunya jadi nol untuk semua baris. Kalau versi ini
        // yang sedang menyangga pagu, itu penurunan paling ekstrem yang mungkin.
        bentrokKosong = await pagarSimpanVersi(tx, 'dpa_blud', tahun, versiTanggal, new Map(), turunkanPaksa)
        await tx`DELETE FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
        await bumpBludVersion(tx, 'dpa_blud', lockKey, userId)
      })
      return { existing, replaced: 0, newVersion: expectedVersion + 1, jangkar: {}, bentrokPagu: bentrokKosong }
    }
    return { existing, replaced: 0, newVersion: expectedVersion, jangkar: {}, bentrokPagu: [] }
  }

  const jangkar: Record<string, string> = {}
  const baruPagu = new Map<string, BarisPaguVersi>()
  const values = rows.map(r => {
    const key = ensureAnggaranKey(r.anggaran_key)
    jangkar[r.row_id] = key
    baruPagu.set(key, {
      kode_rekening: r.kode_rekening, uraian: r.uraian, pagu: Number(r.jumlah ?? 0),
    })
    return [
      tahun, versiTanggal, r.kode_rekening, r.uraian, r.vol ?? null, r.satuan ?? null,
      r.harga ?? null, r.jumlah, r.penanggung_jawab ?? null, r.keterangan ?? null,
      r.tipe_baris, r.row_id, key, r.parent_id ?? null, r.urutan,
      r.origin ?? 'MANUAL', r.usulan_item_id ?? null, r.usulan_no ?? null,
    ]
  })
  let existing = 0
  let bentrokPagu: BentrokPagu[] = []
  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'dpa_blud', lockKey, expectedVersion)
    // B-NEW-3 threshold dihitung DI DALAM tx (audit DPA 2026-06-11 B-3) — angka
    // segar setelah row lock, throw → rollback otomatis
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new BludReplaceSafetyError('dpa_blud', existing, incoming, ((existing - incoming) / existing) * 100)
    }
    // Sengaja TIDAK bisa ditembus `force`: kehilangan jangkar tidak pernah
    // disengaja, dan akibatnya (realisasi yatim) tidak terlihat di layar mana pun.
    await periksaJangkar(tx, 'dpa_blud', tahun, rows)
    // B2 — §4.3 di jalur DPA. Sebelum ini jalur simpan DPA tidak punya pagar pagu
    // sama sekali; selama tahun itu belum punya Pergeseran, DPA-lah pagu yang berlaku.
    bentrokPagu = await pagarSimpanVersi(tx, 'dpa_blud', tahun, versiTanggal, baruPagu, turunkanPaksa)
    await tx`DELETE FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
    await bulkInsert('dpa_blud', DPA_COLUMNS, values, conn)
    await bumpBludVersion(tx, 'dpa_blud', lockKey, userId)
  })
  return { existing, replaced: incoming, newVersion: expectedVersion + 1, jangkar, bentrokPagu }
}

/**
 * Hapus seluruh versi DPA + cascade ke rekap_pk yang refer ke versi tsb.
 * Atomic via withTransaction. Returns jumlah baris yang ke-hapus per tabel.
 * Throw kalau versi tidak ditemukan supaya caller bisa return 404.
 */
export async function deleteDpaVersi(tahun: number, versiTanggal: string): Promise<{
  dpa_rows: number;
  rekap_pk_rows: number;
}> {
  const cntRows = await sql`SELECT COUNT(*) AS cnt FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
  const existing = Number(cntRows[0]?.cnt ?? 0)
  if (existing === 0) {
    throw new Error(`Versi DPA ${tahun}/${versiTanggal} tidak ditemukan`)
  }

  const lockKey = bludVersiKey(tahun, versiTanggal)
  let dpaCount = 0
  let rekapCount = 0
  await withTransaction(async ({ tx }) => {
    // T1: dua pagar sebelum apa pun terhapus — realisasi yang menggantung, dan
    // soft-FK `pergeseran_dpa.dpa_versi_tanggal` yang akan menunjuk ke ruang kosong.
    const perujuk = await tx`
      SELECT DISTINCT versi_tanggal FROM pergeseran_dpa
      WHERE tahun_anggaran = ${tahun} AND dpa_versi_tanggal = ${versiTanggal}
      ORDER BY versi_tanggal
    ` as { versi_tanggal?: unknown }[]
    if (perujuk.length) {
      throw new BludVersiDirujukError(versiTanggal, perujuk.map(r => toDateStr(r.versi_tanggal)))
    }
    await pagarHapusVersi(tx, 'dpa_blud', tahun, versiTanggal)

    // 1. Hapus rekap_pk dulu (FK ref ke versi_dpa — soft, table standalone)
    // L53: tx wrapper return Array<{affectedRows}>, BUKAN object. Cast object
    // langsung → diam-diam selalu 0 (audit log + response palsu "0 baris dihapus").
    const rekapRes = await tx`DELETE FROM rekap_pk WHERE tahun_anggaran = ${tahun} AND versi_dpa = ${versiTanggal}` as unknown as Array<{ affectedRows: number }>
    rekapCount = Number(rekapRes[0]?.affectedRows ?? 0)
    // 2. Hapus baris dpa_blud
    const dpaRes = await tx`DELETE FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as unknown as Array<{ affectedRows: number }>
    dpaCount = Number(dpaRes[0]?.affectedRows ?? 0)
    // 3. Drop lock row (cleanup, cegah orphan)
    await dropBludVersion(tx, 'dpa_blud', lockKey)
    await dropBludVersion(tx, 'rekap_pk', lockKey)
  })
  return { dpa_rows: dpaCount, rekap_pk_rows: rekapCount }
}

// ─── PERGESERAN ───────────────────────────────────────────────────────────────

export async function getPergeseranLatestDate(tahun: number): Promise<string | null> {
  const rows = await sql`SELECT MAX(versi_tanggal) AS latest FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun}`
  const v = (rows as Record<string,unknown>[])[0]?.latest
  return v ? toDateStr(v) : null
}

export async function getPergeseranHistory(tahun: number): Promise<PergeseranHistoryItem[]> {
  const rows = await sql`SELECT versi_tanggal, dpa_versi_tanggal, COUNT(*) AS jumlah_baris FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} GROUP BY versi_tanggal, dpa_versi_tanggal ORDER BY versi_tanggal DESC`
  return (rows as Record<string,unknown>[]).map(r => ({ versi_tanggal: toDateStr(r.versi_tanggal), dpa_versi_tanggal: toDateStr(r.dpa_versi_tanggal), jumlah_baris: Number(r.jumlah_baris) }))
}

export async function getPergeseranByDate(tahun: number, versiTanggal: string): Promise<PergeseranBaris[]> {
  const rows = await sql`SELECT * FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal} ORDER BY urutan ASC`
  return (rows as Record<string,unknown>[]).map(normPergeseran)
}

/** L51: get current version utk client baseline pergeseran. */
export async function getPergeseranVersion(tahun: number, versiTanggal: string): Promise<number> {
  return getBludVersion('pergeseran_dpa', bludVersiKey(tahun, versiTanggal))
}

const PERGESERAN_COLUMNS = [
  'tahun_anggaran', 'versi_tanggal', 'dpa_versi_tanggal', 'kode_rekening', 'uraian', 'vol', 'satuan',
  'harga', 'jumlah', 'vol_p', 'harga_p', 'pergeseran', 'bertambah_berkurang',
  'penanggung_jawab', 'keterangan',
  'tipe_baris', 'row_id', 'anggaran_key', 'parent_id', 'urutan',
]

export async function savePergeseran(
  tahun: number,
  versiTanggal: string,
  dpaVersiTanggal: string,
  rows: PergeseranBarisInput[],
  userId: number,
  expectedVersion: number,
  force = false,
  turunkanPaksa = false,
): Promise<SimpanHasil> {
  const incoming = rows.length
  const lockKey = bludVersiKey(tahun, versiTanggal)

  if (!incoming) {
    const cntRows = await sql`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    const existing = Number(cntRows[0]?.cnt ?? 0)
    if (force && existing > 0) {
      let bentrokKosong: BentrokPagu[] = []
      await withTransaction(async ({ tx }) => {
        await assertBludVersion(tx, 'pergeseran_dpa', lockKey, expectedVersion)
        bentrokKosong = await pagarSimpanVersi(tx, 'pergeseran_dpa', tahun, versiTanggal, new Map(), turunkanPaksa)
        await tx`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
        await bumpBludVersion(tx, 'pergeseran_dpa', lockKey, userId)
      })
      return { existing, replaced: 0, newVersion: expectedVersion + 1, jangkar: {}, bentrokPagu: bentrokKosong }
    }
    return { existing, replaced: 0, newVersion: expectedVersion, jangkar: {}, bentrokPagu: [] }
  }

  const jangkar: Record<string, string> = {}
  const baruPagu = new Map<string, BarisPaguVersi>()
  const values = rows.map(r => {
    const key = ensureAnggaranKey(r.anggaran_key)
    jangkar[r.row_id] = key
    baruPagu.set(key, {
      kode_rekening: r.kode_rekening, uraian: r.uraian, pagu: Number(r.pergeseran ?? 0),
    })
    return [
      tahun, versiTanggal, dpaVersiTanggal, r.kode_rekening, r.uraian, r.vol ?? null,
      r.satuan ?? null, r.harga ?? null, r.jumlah, r.vol_p ?? null, r.harga_p ?? null,
      r.pergeseran, r.bertambah_berkurang,
      // `?? null` (bukan `|| null`) mengikuti saveDpa persis: kolom ini cermin DPA,
      // '' vs NULL harus sama di kedua tabel supaya hasil inject tidak beda diam-diam.
      r.penanggung_jawab ?? null, r.keterangan ?? null,
      r.tipe_baris, r.row_id,
      key, r.parent_id ?? null,
      r.urutan,
    ]
  })
  let existing = 0
  let bentrokPagu: BentrokPagu[] = []
  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'pergeseran_dpa', lockKey, expectedVersion)
    // B-NEW-3 threshold di dalam tx (audit DPA 2026-06-11 B-3)
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new BludReplaceSafetyError('pergeseran_dpa', existing, incoming, ((existing - incoming) / existing) * 100)
    }
    await periksaJangkar(tx, 'pergeseran_dpa', tahun, rows)
    // B3 — §4.3 pindah ke DALAM transaksi, di bawah kunci pagu. Di route ia hanya
    // pemeriksaan tanpa kunci: serapan bisa naik di sela pemeriksaan dan simpan.
    bentrokPagu = await pagarSimpanVersi(tx, 'pergeseran_dpa', tahun, versiTanggal, baruPagu, turunkanPaksa)
    await tx`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}`
    await bulkInsert('pergeseran_dpa', PERGESERAN_COLUMNS, values, conn)
    await bumpBludVersion(tx, 'pergeseran_dpa', lockKey, userId)
  })
  return { existing, replaced: incoming, newVersion: expectedVersion + 1, jangkar, bentrokPagu }
}

/**
 * Hapus seluruh versi Pergeseran. Standalone (tidak ada FK turunan).
 * Returns jumlah baris terhapus. Throw kalau versi tidak ada.
 */
export async function deletePergeseranVersi(tahun: number, versiTanggal: string): Promise<{
  pergeseran_rows: number;
}> {
  const cntRows = await sql`SELECT COUNT(*) AS cnt FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as { cnt: unknown }[]
  const existing = Number(cntRows[0]?.cnt ?? 0)
  if (existing === 0) {
    throw new Error(`Versi Pergeseran ${tahun}/${versiTanggal} tidak ditemukan`)
  }
  const lockKey = bludVersiKey(tahun, versiTanggal)
  let count = 0
  await withTransaction(async ({ tx }) => {
    // T1: menghapus Pergeseran TERBARU memundurkan pagu setahun penuh ke versi
    // sebelumnya (atau jatuh ke DPA) sementara alokasinya tetap tinggal.
    await pagarHapusVersi(tx, 'pergeseran_dpa', tahun, versiTanggal)
    // L53: tx wrapper return Array<{affectedRows}>, akses lewat [0].
    const res = await tx`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versiTanggal}` as unknown as Array<{ affectedRows: number }>
    count = Number(res[0]?.affectedRows ?? 0)
    await dropBludVersion(tx, 'pergeseran_dpa', lockKey)
  })
  return { pergeseran_rows: count }
}

export interface JangkarTerpakai {
  anggaran_key: string
  uraian: string
  jumlah_alokasi: number
  nilai: number
}

/**
 * Jangkar realisasi yang sedang dipakai tahun ini, untuk memperingatkan sebelum
 * IMPOR mengganti seluruh DPA.
 *
 * `periksaJangkar()` di jalur simpan TIDAK menangkap kasus ini — komentarnya
 * eksplisit bahwa baris serba-baru (yang persis dihasilkan impor) tidak ikut
 * tertahan. Pagar itu menjaga baris LAMA yang membuang jangkarnya, bukan baris
 * BARU yang menggantikan. Jadi peringatannya harus dihitung terpisah, di sini.
 */
export async function jangkarDipakaiRealisasi(tahun: number): Promise<JangkarTerpakai[]> {
  const rows = await sql`
    SELECT a.anggaran_key,
           ANY_VALUE(d.uraian)      AS uraian,
           COUNT(*)                 AS jumlah_alokasi,
           COALESCE(SUM(a.nilai), 0) AS nilai
    FROM blud_realisasi_alokasi a
    LEFT JOIN dpa_blud d
      ON d.anggaran_key = a.anggaran_key AND d.tahun_anggaran = a.tahun_anggaran
    WHERE a.tahun_anggaran = ${tahun}
    GROUP BY a.anggaran_key
    ORDER BY nilai DESC
  ` as Record<string, unknown>[]
  return rows.map(r => ({
    anggaran_key:   String(r.anggaran_key ?? ''),
    uraian:         String(r.uraian ?? '(baris tidak ditemukan)'),
    jumlah_alokasi: Number(r.jumlah_alokasi ?? 0),
    nilai:          Number(r.nilai ?? 0),
  }))
}
