// lib/blud/isi-sama.ts — apakah isi yang akan disimpan SAMA PERSIS dengan versi yang
// berlaku pada tanggal sasaran. Dipakai `saveDpa`/`savePergeseran`: kalau sama, tidak ada
// yang ditulis (tanpa versi baru, tanpa angka kunci naik, tanpa foto riwayat).
//
// Sebabnya kebiasaan wajar "klik Simpan sekali lagi biar yakin": membuka versi 6 Okt lalu
// Simpan tanpa mengubah apa pun dulu melahirkan versi kembar 12 Okt — dan versi bertanggal
// hari ini mengunci Jadikan DPA Perubahan sampai besok (konsep DPA Perubahan §5.1).
//
// MURNI, tanpa impor — bisa diuji perilakunya.
// Konsep: docs/CONCEPT-blud-simpan-identik.md

type Nilai = string | number | null | undefined

export interface BarisIsiDpa {
  row_id: Nilai; parent_id?: Nilai; tipe_baris?: Nilai; urutan?: Nilai
  kode_rekening?: Nilai; uraian?: Nilai; vol?: Nilai; satuan?: Nilai; harga?: Nilai; jumlah?: Nilai
  penanggung_jawab?: Nilai; keterangan?: Nilai; anggaran_key?: Nilai
  origin?: Nilai; usulan_item_id?: Nilai; usulan_no?: Nilai
}

export interface BarisIsiPergeseran extends Omit<BarisIsiDpa, 'origin' | 'usulan_item_id' | 'usulan_no'> {
  vol_p?: Nilai; harga_p?: Nilai; pergeseran?: Nilai; bertambah_berkurang?: Nilai
  bertambah?: Nilai; berkurang?: Nilai
}

export interface MutasiIsi { dari_row: Nilai; ke_row: Nilai; nilai: Nilai; keterangan?: Nilai }

/** NULL dan '' disamakan: pemetaan layar ↔ server tidak selalu memilih yang sama. */
const teks = (v: Nilai) => (v == null ? '' : String(v))

/**
 * Angka dibandingkan sampai 4 desimal (`vol` DECIMAL(18,4)); DECIMAL dari mysql2 datang
 * sebagai string. NULL TIDAK disamakan dengan 0 — vol kosong dan vol nol dua hal berbeda.
 */
const angka = (v: Nilai) => (v == null || v === '' ? '' : String(Math.round(Number(v) * 10000)))

/** Kolom yang DITULIS `saveDpa` selain milik server (`*_sebelum`) dan tahun/versi. */
function sidikDpa(r: BarisIsiDpa): string {
  return JSON.stringify([
    teks(r.row_id), teks(r.parent_id), teks(r.tipe_baris), angka(r.urutan),
    teks(r.kode_rekening), teks(r.uraian), angka(r.vol), teks(r.satuan), angka(r.harga), angka(r.jumlah),
    teks(r.penanggung_jawab), teks(r.keterangan), teks(r.anggaran_key),
    // Server menulis `origin ?? 'MANUAL'`.
    teks(r.origin) || 'MANUAL', teks(r.usulan_item_id), teks(r.usulan_no),
  ])
}

function sidikPergeseran(r: BarisIsiPergeseran): string {
  return JSON.stringify([
    teks(r.row_id), teks(r.parent_id), teks(r.tipe_baris), angka(r.urutan),
    teks(r.kode_rekening), teks(r.uraian), angka(r.vol), teks(r.satuan), angka(r.harga), angka(r.jumlah),
    angka(r.vol_p), angka(r.harga_p), angka(r.pergeseran), angka(r.bertambah_berkurang),
    angka(r.bertambah), angka(r.berkurang),
    teks(r.penanggung_jawab), teks(r.keterangan), teks(r.anggaran_key),
  ])
}

/** Urutan baris ikut dinilai lewat kolom `urutan`, jadi daftarnya boleh disusun ulang. */
function samaHimpunan(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((s, i) => s === y[i])
}

export function isiDpaSama(baru: readonly BarisIsiDpa[], tersimpan: readonly BarisIsiDpa[]): boolean {
  return samaHimpunan(baru.map(sidikDpa), tersimpan.map(sidikDpa))
}

/**
 * Pergeseran: baris, acuan DPA, dan — kalau pemanggil mengirimnya — catatan perpindahan.
 * `baru.mutasi` undefined = pemanggil tidak mengurus catatan (jalur lama); catatannya juga
 * tidak akan ditulis, jadi tidak ikut menentukan.
 */
export function isiPergeseranSama(
  baru: { rows: readonly BarisIsiPergeseran[]; acuan: string; mutasi?: readonly MutasiIsi[] },
  tersimpan: { rows: readonly BarisIsiPergeseran[]; acuan: string; mutasi: readonly MutasiIsi[] },
): boolean {
  if (baru.acuan !== tersimpan.acuan) return false
  if (!samaHimpunan(baru.rows.map(sidikPergeseran), tersimpan.rows.map(sidikPergeseran))) return false
  if (baru.mutasi === undefined) return true
  // Urutan catatan bermakna (kolom `urutan` = indeks) — dibandingkan berurutan.
  // Keterangan di-trim seperti `tulisMutasi` menulisnya.
  const m = (x: MutasiIsi) => JSON.stringify([teks(x.dari_row), teks(x.ke_row), angka(x.nilai), teks(x.keterangan).trim()])
  return baru.mutasi.length === tersimpan.mutasi.length
    && baru.mutasi.every((x, i) => m(x) === m(tersimpan.mutasi[i]))
}

/** Toast layar ketika Simpan dilewati. */
export function kalimatTidakBerubah(a: { versiBerlaku: string; sasaran: string; tanggal: (t: string) => string }): string {
  return a.versiBerlaku === a.sasaran
    ? `Tidak ada yang berubah dari versi ${a.tanggal(a.sasaran)} — tidak ada yang ditulis.`
    : `Isinya sama dengan versi ${a.tanggal(a.versiBerlaku)} yang berlaku pada ${a.tanggal(a.sasaran)} — `
      + `tidak ada yang ditulis, versi ${a.tanggal(a.versiBerlaku)} tetap berlaku.`
}

/**
 * Jebakan arsip: layar akan menyimpan ke arsip akhir bulan lampau yang SUDAH berisi,
 * padahal ada versi yang lebih baru. Biasanya orangnya membuka/memulihkan arsip itu untuk
 * MEMBAWA isinya ke bulan ini — tapi Simpan menimpa arsipnya (L79: sasaran ikut versi
 * yang dibuka). Jalur yang benar Salin Versi Lain (L80). `null` = tidak ada jebakan.
 */
export function jebakanArsip(periodeTulis: string, versiTersimpan: readonly string[]): { arsip: string; terbaru: string } | null {
  if (!periodeTulis || !versiTersimpan.includes(periodeTulis)) return null
  const terbaru = versiTersimpan.reduce((m, v) => (v > m ? v : m), '')
  return terbaru > periodeTulis ? { arsip: periodeTulis, terbaru } : null
}
