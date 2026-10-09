// lib/blud/perubahan.ts — aturan LAYAR DPA Perubahan (konsep §5, §7, §10, §12).
//
// Fungsi murni, aman untuk klien: dipisah dari `dpa-client.tsx` supaya bisa diuji
// sungguhan, bukan dicocokkan ke teks sumbernya (pola `hitungPratinjau`,
// `salin-versi.ts`). Sisi server ada di `perubahan-data.ts` & `data.ts`.

import { penandaUntukVersi, type PenandaPerubahan } from './sumber-pagu'
import { formatTanggalId } from './tanggal'
import type { DpaBarisInput } from '@/types'

/** Babak Perubahan sebuah versi DPA (1, 2, …); `null` = murni. */
export function keBabak(penanda: readonly PenandaPerubahan[], versi: string): number | null {
  const p = penandaUntukVersi([...penanda], versi)
  return p ? penanda.indexOf(p) + 1 : null
}

/**
 * Lencana di daftar & pil versi (pola `catatanVersi` layar Pergeseran). Tahun yang
 * belum punya Perubahan tidak diberi lencana sama sekali — "MURNI" di setiap baris
 * cuma menambah bising tanpa membedakan apa pun.
 */
export function catatanBabak(penanda: readonly PenandaPerubahan[], versi: string): string | undefined {
  if (!penanda.length) return undefined
  const ke = keBabak(penanda, versi)
  return ke ? `PERUBAHAN KE-${ke}` : 'MURNI'
}

/**
 * Jenis sumber pagu untuk label "Pagu dari …" — SATU rumus untuk layar Realisasi,
 * Buku Kas, dan Beranda (konsep §8). Tanpa Perubahan bunyinya persis seperti dulu.
 */
export function jenisSumberPagu(s: { sumber: string; perubahan_ke?: number | null }): string {
  const ke = s.perubahan_ke ?? null
  if (s.sumber === 'PERGESERAN') return ke ? `Pergeseran (DPA Perubahan ke-${ke})` : 'Pergeseran'
  return ke ? `DPA Perubahan ke-${ke}` : 'DPA'
}

/**
 * "DASAR PERUBAHAN KE-n" untuk versi yang jadi sumber kolom Sebelum — versi itu dikunci
 * server (§6: tidak bisa disimpan ulang maupun dihapus), jadi layar penghapusan wajib
 * menyebutnya SEBELUM orang mencoba.
 */
export function catatanDasar(
  penanda: readonly PenandaPerubahan[], sumber: 'DPA' | 'PERGESERAN', versi: string,
): string | undefined {
  const i = penanda.findIndex(p => p.sumber_dasar === sumber && p.versi_dasar === versi)
  return i < 0 ? undefined : `DASAR PERUBAHAN KE-${i + 1}`
}

/**
 * Nomor babak yang ikut lenyap kalau versi DPA `versi` dihapus. Cermin
 * `bersihkanPenandaYatim` di server: penanda dibuang bila tak ada lagi versi DPA ≥
 * `versi_mulai`-nya. Menghapus versi Perubahan TERAKHIR membuang babaknya — pagu
 * tahun itu kembali ke sumber sebelum Perubahan (R5); itu yang diperingatkan dialog.
 */
export function babakIkutDihapus(
  penanda: readonly PenandaPerubahan[], versiDpa: readonly string[], versi: string,
): number[] {
  const sisa = versiDpa.filter(v => v !== versi)
  return penanda.flatMap((p, i) => (sisa.some(v => v >= p.versi_mulai) ? [] : [i + 1]))
}

// ─── Pergeseran sesudah Perubahan (konsep §9) ───────────────────────────────
// Babak pergeseran diturunkan dari ACUAN-nya (`dpa_versi_tanggal`), bukan dari tanggal
// simpannya: pergeseran bertanggal hari Perubahan yang disimpan SEBELUM Perubahan tetap
// mengacu DPA murni — babak lama.

/** Pergeseran beracuan sebelum Perubahan TERAKHIR: tidak lagi menentukan pagu. */
export function babakLama(penanda: readonly PenandaPerubahan[], acuan: string): boolean {
  const akhir = penanda[penanda.length - 1]
  return !!akhir && !!acuan && acuan < akhir.versi_mulai
}

/**
 * Kalimat spanduk layar Pergeseran untuk isi babak lama; '' = bukan babak lama. Peran
 * yang hanya bisa melihat tidak disuruh menekan tombol yang tidak ada di layarnya.
 */
export function spandukBabakLama(penanda: readonly PenandaPerubahan[], acuan: string, bisaUbah = true): string {
  if (!babakLama(penanda, acuan)) return ''
  const akhir = penanda[penanda.length - 1]
  return `DPA Perubahan ke-${penanda.length} berlaku sejak ${formatTanggalId(akhir.versi_mulai)}. `
    + `Pergeseran ini mengacu DPA ${formatTanggalId(acuan)} — sebelum Perubahan — dan tidak lagi menentukan pagu.`
    + (bisaUbah ? ' Tekan Buat Pergeseran untuk memulai dari DPA Perubahan.' : '')
}

/**
 * Kunci "Buat Pergeseran" saat isi layar babak lama (konsep §9: satu-satunya jalan keluar
 * tidak boleh terkunci justru saat dibutuhkan).
 *   null → aturan ini tidak berlaku, pakai kunci biasa (bukan babak lama, ATAU sasaran
 *          Simpan masih sebelum Perubahan — arsip akhir bulan lampau yang dibuka: membuka
 *          kunci di sana berarti menimpa arsip itu dengan tabel baru);
 *   ''   → boleh;
 *   teks → sasaran sudah berisi pergeseran babak lama (cermin `BludSasaranBabakLamaError`).
 */
export function bukaKunciBabakLama(
  penanda: readonly PenandaPerubahan[], acuanLayar: string, sasaran: string,
  history: readonly { versi_tanggal: string; dpa_versi_tanggal?: string }[],
): string | null {
  const akhir = penanda[penanda.length - 1]
  if (!babakLama(penanda, acuanLayar) || !akhir || sasaran < akhir.versi_mulai) return null
  const lama = history.find(h => h.versi_tanggal === sasaran && babakLama(penanda, h.dpa_versi_tanggal ?? ''))
  return lama
    ? `${formatTanggalId(sasaran)} sudah berisi pergeseran sebelum Perubahan — pergeseran DPA Perubahan `
      + `ke-${penanda.length} tidak boleh menimpanya. Buat besok, atau hapus dulu pergeseran lama itu di menu Pengaturan.`
    : ''
}

/**
 * Versi pergeseran yang pantas berlencana BERLAKU ("yang jadi acuan realisasi"). Tanpa
 * Perubahan: yang terbaru, persis perilaku lama. Dengan Perubahan: hanya yang memang
 * sumber pagu — pergeseran terbaru bisa babak lama, dan lencana BERLAKU di sana bohong.
 */
export function pergeseranBerlaku(
  penanda: readonly PenandaPerubahan[],
  sumber: { sumber: string; versi: string | null } | null,
  terbaru: string | undefined,
): string | null {
  if (!penanda.length) return terbaru ?? null
  return sumber?.sumber === 'PERGESERAN' ? sumber.versi : null
}

/** Baris yang sudah ada sebelum Perubahan — server mengisi Sebelum-nya lewat `anggaran_key`. */
export const berSebelum = (r: Pick<DpaBarisInput, 'jumlah_sebelum'>): boolean => r.jumlah_sebelum != null

/** Bertambah/(Berkurang): baris yang lahir di Perubahan dihitung dari nol. Tidak disimpan (§6). */
export function selisihSebelum(r: Pick<DpaBarisInput, 'jumlah' | 'jumlah_sebelum'>): number {
  return Number(r.jumlah ?? 0) - Number(r.jumlah_sebelum ?? 0)
}

/** "+15.000.000" · "(10.000.000)" · "0" — gaya dokumen anggaran, bukan tanda minus. */
export function formatSelisih(n: number, fmt: (x: number) => string): string {
  if (Math.abs(n) < 0.005) return '0'
  return n > 0 ? `+${fmt(n)}` : `(${fmt(-n)})`
}

/**
 * Total baris AKAR, Sebelum vs Sesudah — "Sebelum Rp 180 jt → Sesudah Rp 210 jt
 * (+30 jt)". Akar saja, bukan seluruh baris: induk sudah menjumlah anaknya, jadi
 * menjumlah semua menghitung tiap rupiah sedalam pohonnya (pelajaran `totalAkarDpa`).
 */
export function totalSebelumSesudah(rows: readonly Pick<DpaBarisInput, 'parent_id' | 'row_id' | 'jumlah' | 'jumlah_sebelum'>[]): {
  sebelum: number; sesudah: number; selisih: number
} {
  const ids = new Set(rows.map(r => r.row_id))
  const akar = rows.filter(r => !r.parent_id || !ids.has(r.parent_id))
  const sebelum = akar.reduce((s, r) => s + Number(r.jumlah_sebelum ?? 0), 0)
  const sesudah = akar.reduce((s, r) => s + Number(r.jumlah ?? 0), 0)
  return { sebelum, sesudah, selisih: sesudah - sebelum }
}

/**
 * R4 di layar: "hapus" pada baris yang sudah ada sebelum Perubahan berarti
 * MENOLKAN (vol & harga dikosongkan, baris tetap tercatat "Rp X → Rp 0"); yang lahir
 * di Perubahan tetap bisa dihapus biasa. Server menolak simpanan yang membuang baris
 * dasar, jadi layar yang menghapusnya hanya menunda penolakan sampai tombol Simpan.
 *
 * Induk dipertahankan kalau ada keturunannya yang dipertahankan — kalau tidak, baris
 * lama yang dinolkan kehilangan induknya. Yang dinolkan hanya DAUN; induk angkanya
 * dijumlah ulang dari anak oleh pemanggil (`recalcDpaJumlah`).
 */
export function hapusAtauNolkan<T extends Pick<DpaBarisInput, 'row_id' | 'parent_id' | 'vol' | 'harga' | 'jumlah' | 'jumlah_sebelum'>>(
  rows: readonly T[], target: ReadonlySet<string>,
): { rows: T[]; dinolkan: number; dihapus: number } {
  const anak = new Map<string, string[]>()
  for (const r of rows) if (r.parent_id) anak.set(r.parent_id, [...(anak.get(r.parent_id) ?? []), r.row_id])
  const byId = new Map(rows.map(r => [r.row_id, r]))
  const pertahankan = new Set<string>()
  const periksa = (id: string): boolean => {
    const r = byId.get(id)
    if (!r) return false
    let tetap = !target.has(id) || berSebelum(r)
    for (const c of anak.get(id) ?? []) if (periksa(c)) tetap = true
    if (tetap) pertahankan.add(id)
    return tetap
  }
  for (const r of rows) if (!r.parent_id || !byId.has(r.parent_id)) periksa(r.row_id)
  let dinolkan = 0
  const hasil: T[] = []
  for (const r of rows) {
    if (!pertahankan.has(r.row_id)) continue
    const daun = !(anak.get(r.row_id) ?? []).some(c => pertahankan.has(c))
    if (target.has(r.row_id) && daun) {
      dinolkan++
      hasil.push({ ...r, vol: null, harga: null, jumlah: 0 })
    } else {
      hasil.push(r)
    }
  }
  return { rows: hasil, dinolkan, dihapus: rows.length - hasil.length }
}

/**
 * Alasan tombol "Jadikan DPA Perubahan" mati ('' = boleh). Cermin pagar §5.1 di
 * `saveDpa`: sasaran harus SESUDAH semua versi DPA. Tanpa cermin ini orang mengisi
 * seluruh layar dulu, lalu baru ditolak saat Simpan.
 */
export function alasanKunciPerubahan(a: {
  sumber: 'PERGESERAN' | 'DPA' | 'KOSONG' | null
  dpaTerakhir: string | null
  sasaran: string
}): string {
  if (!a.sumber) return 'Sumber pagu tahun ini sedang dimuat.'
  if (a.sumber === 'KOSONG') return 'Tahun ini belum punya DPA — belum ada angka yang bisa dijadikan dasar Perubahan.'
  if (a.dpaTerakhir && a.dpaTerakhir >= a.sasaran) {
    return a.dpaTerakhir === a.sasaran
      ? `${formatTanggalId(a.sasaran)} sudah punya simpanan DPA. DPA Perubahan harus jadi versi baru — simpan besok, atau hapus dulu versi hari ini kalau salah simpan.`
      : `Sudah ada versi DPA ${formatTanggalId(a.dpaTerakhir)}. DPA Perubahan harus sesudahnya — pilih periode bulan berjalan.`
  }
  return ''
}

// ─── Impor (konsep §11.1–11.2) ──────────────────────────────────────────────
// Format Lengkap & dokumen dua blok sudah ditolak PARSER (tak satu baris pun bisa
// dibaca dengan benar). Yang tersisa di sini aturan yang bergantung pada TUJUAN.

/** "Terbaca: Excel DPA Perubahan ke-1 · unduhan PRIMA · versi 8 Okt 2026 · simpanan ke-3 · 558 baris" */
export function kalimatTerbaca(a: {
  perubahanKe: number | null; versiKop: string | null; unduhanPrima: boolean; baris: number
  /** Penanda unduhan (§11.3) — versi untuk berkas murni yang kopnya tidak menyebutnya. */
  unduhan?: { versi: string; simpananKe: number } | null
}): string {
  return [
    a.perubahanKe ? `Excel DPA Perubahan ke-${a.perubahanKe}` : 'Excel DPA murni',
    a.unduhanPrima ? 'unduhan PRIMA' : 'formulir luar',
    a.versiKop ? `versi ${a.versiKop}` : a.unduhan ? `versi ${formatTanggalId(a.unduhan.versi)}` : null,
    a.unduhan ? `simpanan ke-${a.unduhan.simpananKe}` : null,
    `${a.baris} baris`,
  ].filter(Boolean).join(' · ')
}

export type PutusanImpor =
  | { jenis: 'boleh' }
  | { jenis: 'tolak'; pesan: string }
  | { jenis: 'peringatan'; pesan: string }

/**
 * Berkas × babak sasaran Simpan (§11.2). Dinilai terhadap SASARAN, bukan tahun: arsip
 * akhir bulan sebelum Perubahan tetap murni walau tahunnya sudah punya Perubahan.
 *   Ringkas → sasaran murni      : tolak — Perubahan lahir lewat Jadikan DPA Perubahan
 *                                  (yang membawa dasar & menerbitkan penanda), bukan Impor.
 *   murni   → sasaran Perubahan  : peringatan + selisih total, lalu boleh.
 *   Ringkas ke-n → babak ke-m    : peringatan (nomor babak berbeda).
 */
export function putusanImpor(a: {
  perubahanKe: number | null
  babakSasaran: number | null
  sasaranLabel: string
  totalBerkas: number
  pembanding: { versi: string; total: number } | null
  fmt: (n: number) => string
}): PutusanImpor {
  if (a.perubahanKe && !a.babakSasaran) {
    return {
      jenis: 'tolak',
      pesan: `Berkas ini DPA Perubahan ke-${a.perubahanKe}, sedangkan tujuan Simpan (${a.sasaranLabel}) masih DPA murni. `
        + 'DPA Perubahan dibuat lewat tombol Jadikan DPA Perubahan — bukan lewat Impor.',
    }
  }
  if (!a.perubahanKe && a.babakSasaran) {
    const banding = a.pembanding
      ? ` Total berkas ${a.fmt(a.totalBerkas)}, DPA Perubahan yang berlaku (versi ${formatTanggalId(a.pembanding.versi)}) `
        + `${a.fmt(a.pembanding.total)} — selisih ${formatSelisih(a.totalBerkas - a.pembanding.total, a.fmt)}.`
      : ''
    return {
      jenis: 'peringatan',
      pesan: `Berkas ini DPA murni, sedangkan tujuan Simpan (${a.sasaranLabel}) sudah DPA Perubahan ke-${a.babakSasaran}. `
        + `Mengimpornya mengganti angka Perubahan dengan angka murni.${banding}`,
    }
  }
  if (a.perubahanKe && a.babakSasaran && a.perubahanKe !== a.babakSasaran) {
    return {
      jenis: 'peringatan',
      pesan: `Berkas ini DPA Perubahan ke-${a.perubahanKe}, sedangkan tujuan Simpan (${a.sasaranLabel}) `
        + `sudah DPA Perubahan ke-${a.babakSasaran}. Pastikan ini memang angka yang mau dipakai.`,
    }
  }
  return { jenis: 'boleh' }
}

// ─── Sakelar "Tampilkan kolom Sebelum" ───────────────────────────────────────
// Kenyamanan per orang, jadi localStorage — dan dibungkus try/catch: jendela privat
// atau data situs yang diblokir membuat aksesornya melempar. Bawaannya NYALA (§7):
// kolom selisih membantu saat menyunting.

export const KUNCI_TAMPIL_SEBELUM = 'prima.blud.dpa.tampil-sebelum'

export function bacaTampilSebelum(): boolean {
  try {
    return window.localStorage.getItem(KUNCI_TAMPIL_SEBELUM) !== '0'
  } catch {
    return true
  }
}

export function simpanTampilSebelum(nyala: boolean): void {
  try {
    window.localStorage.setItem(KUNCI_TAMPIL_SEBELUM, nyala ? '1' : '0')
  } catch { /* gagal menyimpan pilihan bukan alasan menahan layar */ }
}
