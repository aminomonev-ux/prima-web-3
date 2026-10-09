// lib/blud/impor-balik.ts — impor-balik Excel unduhan PRIMA ke versi yang sedang
// terbuka (konsep DPA Perubahan §11.3): "unduh, sunting di Excel, masukkan lagi".
//
// Fungsi murni, aman untuk klien: dipanggil route impor (server yang memegang isi
// versi & angka kuncinya) dan diuji sungguhan — pola `salin-versi.ts`.

import { hapusAtauNolkan } from './perubahan'
import { recalcDpaJumlah } from './recalc'
import { formatTanggalId } from './tanggal'
import type { DpaBarisInput } from '@/types'

// ─── Penanda unduhan ─────────────────────────────────────────────────────────
// Ditulis eksporter di kolom Jangkar (tersembunyi) di atas header. Tidak di kop yang
// terlihat: dokumen cetak tidak perlu memuat angka mesin, sedangkan kolom tersembunyi
// bertahan disunting Excel — sama seperti isi Jangkar yang memang ikut dibaca balik.

export interface PenandaUnduhan {
  tahun: number
  versi: string
  /** Angka kunci versi saat diunduh = "simpanan ke-n" (`blud_locks`). */
  simpananKe: number
}

const POLA_PENANDA_UNDUHAN = /PRIMA\s+DPA\s+(\d{4})\s*·\s*versi\s+(\d{4}-\d{2}-\d{2})\s*·\s*simpanan\s+ke-(\d+)/i

export function teksPenandaUnduhan(p: PenandaUnduhan): string {
  return `PRIMA DPA ${p.tahun} · versi ${p.versi} · simpanan ke-${p.simpananKe}`
}

export function bacaTeksPenandaUnduhan(teks: string): PenandaUnduhan | null {
  const m = POLA_PENANDA_UNDUHAN.exec(teks)
  return m ? { tahun: Number(m[1]), versi: m[2], simpananKe: Number(m[3]) } : null
}

// ─── Penjaga (§11.3 butir 1–4) ───────────────────────────────────────────────

export interface BerkasImporBalik {
  adaKolomJangkar: boolean
  perubahanKe: number | null
  unduhan: PenandaUnduhan | null
  baris: ReadonlyArray<{ barisExcel: number; uraian: string; jangkar: string | null }>
}

export interface VersiTerbuka {
  tahun: number
  versi: string
  simpananKini: number
  /** `keBabak(penanda, versi)` — null = murni. */
  babak: number | null
  jangkar: ReadonlySet<string>
}

export type PutusanImporBalik =
  | { tolak: string }
  | { tolak: null; peringatan: string[] }

const kunci = (k: string | null | undefined): string => (k ?? '').trim().toLowerCase()

/**
 * Yang DITOLAK: berkas yang tidak bisa dipastikan berasal dari versi ini — tanpa kolom
 * Jangkar (formulir luar), tahun/versi lain menurut penandanya, jenis murni/Perubahan
 * yang tidak cocok, atau jangkar yang tidak dikenal versi ini. Yang DIPERINGATKAN:
 * berkas yang mungkin basi — suntingan yang tersimpan sesudah ia diunduh akan tertimpa.
 */
export function periksaImporBalik(b: BerkasImporBalik, v: VersiTerbuka): PutusanImporBalik {
  const tgl = formatTanggalId(v.versi)
  if (!b.adaKolomJangkar) {
    return {
      tolak: `Versi ${tgl} sedang terbuka. Ke versi yang sudah tersimpan hanya bisa dimasukkan Excel unduhan PRIMA `
        + 'dari versi itu, dan berkas ini tidak punya kolom Jangkar — bentuknya formulir dari luar. '
        + 'Formulir dari luar diimpor ke periode yang belum punya versi.',
    }
  }
  const u = b.unduhan
  if (u && u.tahun !== v.tahun) {
    return { tolak: `Berkas ini unduhan DPA ${u.tahun}, sedangkan yang terbuka DPA ${v.tahun}.` }
  }
  if (u && u.versi !== v.versi) {
    return {
      tolak: `Berkas ini diunduh dari versi ${formatTanggalId(u.versi)}, sedangkan yang terbuka versi ${tgl}. `
        + `Buka versi ${formatTanggalId(u.versi)} dulu, atau unduh versi ${tgl} dari menu Cetak lalu sunting berkas itu.`,
    }
  }
  const jenisBerkas = b.perubahanKe ?? null
  const jenisVersi = v.babak ?? null
  if (jenisBerkas !== jenisVersi) {
    return {
      tolak: (jenisBerkas ? `Berkas ini DPA Perubahan ke-${jenisBerkas}` : 'Berkas ini DPA murni')
        + `, sedangkan versi ${tgl} yang terbuka ${jenisVersi ? `DPA Perubahan ke-${jenisVersi}` : 'DPA murni'}. `
        + `Unduh versi ${tgl} dari menu Cetak → DPA BLUD, sunting, lalu impor berkas itu.`,
    }
  }
  const dikenal = new Set([...v.jangkar].map(kunci))
  const asing = b.baris.filter(x => x.jangkar && !dikenal.has(kunci(x.jangkar)))
  if (asing.length) {
    const contoh = asing.slice(0, 5).map(x => `b.${x.barisExcel} "${x.uraian}"`).join(', ')
    return {
      tolak: `${asing.length} baris di berkas membawa penanda baris (kolom Jangkar) yang tidak ada di versi ${tgl}: `
        + `${contoh}${asing.length > 5 ? ', …' : ''}. Barisnya disalin dari tahun atau versi lain, atau kolom Jangkar-nya `
        + 'tersunting. Kosongkan Jangkar baris itu supaya ia dimasukkan sebagai baris baru, atau unduh ulang versi ini.',
    }
  }

  const peringatan: string[] = []
  if (!u) {
    peringatan.push(
      `Berkas ini tidak mencatat dari simpanan ke berapa ia diunduh (unduhan PRIMA versi lama), jadi tidak bisa dipastikan `
      + `masih yang terbaru. Kalau versi ${tgl} disimpan lagi sesudah berkas ini diunduh, suntingan itu akan tertimpa.`,
    )
  } else if (u.simpananKe < v.simpananKini) {
    peringatan.push(
      `Berkas ini diunduh dari simpanan ke-${u.simpananKe} versi ${tgl}. Yang tersimpan sekarang simpanan ke-${v.simpananKini} — `
      + `suntingan sesudah simpanan ke-${u.simpananKe} yang tidak ada di berkas akan tertimpa.`,
    )
  } else if (u.simpananKe > v.simpananKini) {
    peringatan.push(
      `Berkas ini mencatat simpanan ke-${u.simpananKe}, padahal versi ${tgl} baru sampai simpanan ke-${v.simpananKini} — `
      + 'versinya mungkin pernah dihapus lalu disimpan ulang. Pastikan isinya memang yang mau dipakai.',
    )
  }
  return { tolak: null, peringatan }
}

// ─── Menggabungkan (§11.3 butir 5) ───────────────────────────────────────────

export interface BarisBanding { kode: string; uraian: string; jumlah: number }

export interface BandingImporBalik {
  totalLama: number
  totalBaru: number
  /** Daun yang pasangannya ketemu dan jumlahnya bergeser. */
  berubah: Array<{ kode: string; uraian: string; lama: number; baru: number }>
  /** Baris berpasangan yang berubah selain jumlahnya (uraian, kode, PJ, susunan, vol/harga). */
  lainBerubah: number
  baru: BarisBanding[]
  /** Tidak ada di berkas, tapi sudah ada sebelum Perubahan — tetap tercatat jadi Rp 0 (§10). */
  dinolkan: BarisBanding[]
  dihapus: BarisBanding[]
}

const sama = (a: unknown, b: unknown): boolean =>
  (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-9)
const teks = (x: string | null | undefined): string => (x ?? '').trim()

function totalAkar(rows: readonly DpaBarisInput[]): number {
  const ids = new Set(rows.map(r => r.row_id))
  return rows.filter(r => !r.parent_id || !ids.has(r.parent_id)).reduce((s, r) => s + Number(r.jumlah ?? 0), 0)
}

function punyaAnak(rows: readonly DpaBarisInput[]): Set<string> {
  return new Set(rows.flatMap(r => (r.parent_id ? [r.parent_id] : [])))
}

/** Indeks SESUDAH seluruh keturunan `id` di `rows` — tempat menyisip tanpa memotong subpohonnya. */
function ujungSubpohon(rows: readonly DpaBarisInput[], id: string): number {
  const i = rows.findIndex(r => r.row_id === id)
  if (i < 0) return rows.length
  const dalam = new Set([id])
  let j = i + 1
  while (j < rows.length && rows[j].parent_id && dalam.has(rows[j].parent_id!)) {
    dalam.add(rows[j].row_id)
    j++
  }
  return j
}

/**
 * Isi berkas, dipasang di atas versi yang terbuka.
 *
 * Baris dipasangkan lewat JANGKAR, dan yang berpasangan memakai `row_id` versi itu —
 * identitasnya tetap, jadi baris versi yang tidak ada di berkas otomatis menunjuk
 * induk yang benar. Yang tidak terbawa Excel (`origin`/`usulan_*`, kolom Sebelum
 * untuk layar) diambil dari pasangannya; tanpa itu impor-balik diam-diam memutus
 * tautan ke Usulan.
 *
 * Baris versi yang tidak ada di berkas mengikuti aturan hapus §10 (`hapusAtauNolkan`):
 * yang sudah ada sebelum Perubahan DINOLKAN — server menolak simpanan yang membuangnya
 * (R4) — sisanya dihapus.
 */
export function gabungImporBalik(
  versi: readonly DpaBarisInput[], berkas: readonly DpaBarisInput[],
): { rows: DpaBarisInput[]; banding: BandingImporBalik } {
  const versiPerKunci = new Map(versi.filter(r => kunci(r.anggaran_key)).map(r => [kunci(r.anggaran_key), r]))
  const idAkhir = new Map<string, string>()
  for (const b of berkas) idAkhir.set(b.row_id, versiPerKunci.get(kunci(b.anggaran_key))?.row_id ?? b.row_id)

  const gabung: DpaBarisInput[] = berkas.map(b => {
    const v = versiPerKunci.get(kunci(b.anggaran_key))
    return {
      ...b,
      row_id: idAkhir.get(b.row_id)!,
      parent_id: b.parent_id ? idAkhir.get(b.parent_id) ?? null : null,
      anggaran_key: v ? v.anggaran_key : b.anggaran_key,
      origin: v?.origin ?? b.origin ?? 'MANUAL',
      usulan_item_id: v?.usulan_item_id ?? null,
      usulan_no: v?.usulan_no ?? null,
      vol_sebelum: v?.vol_sebelum ?? null,
      satuan_sebelum: v?.satuan_sebelum ?? null,
      harga_sebelum: v?.harga_sebelum ?? null,
      jumlah_sebelum: v?.jumlah_sebelum ?? null,
    }
  })

  // Baris versi yang hilang disisipkan dulu di tempat asalnya — sesudah subpohon kakak
  // terdekatnya, atau tepat di bawah induknya — supaya yang bertahan (dinolkan) tidak
  // memotong subpohon orang lain di tabel yang digambar menurut urutan baris.
  const diBerkas = new Set(gabung.map(r => r.row_id))
  const hilang = versi.filter(r => !diBerkas.has(r.row_id))
  for (const r of hilang) {
    const ada = new Set(gabung.map(x => x.row_id))
    const iVersi = versi.indexOf(r)
    const kakak = versi.slice(0, iVersi).reverse()
      .find(x => (x.parent_id ?? null) === (r.parent_id ?? null) && ada.has(x.row_id))
    const pos = kakak ? ujungSubpohon(gabung, kakak.row_id)
      : r.parent_id && ada.has(r.parent_id) ? gabung.findIndex(x => x.row_id === r.parent_id) + 1
      : 0
    gabung.splice(pos, 0, { ...r })
  }

  const target = new Set(hilang.map(r => r.row_id))
  const { rows: tersaring } = hapusAtauNolkan(gabung, target)
  const rows = recalcDpaJumlah(tersaring.map((r, i) => ({ ...r, urutan: i })))

  const versiPerId = new Map(versi.map(r => [r.row_id, r]))
  const indukAkhir = punyaAnak(rows)
  const indukVersi = punyaAnak(versi)
  const tetap = new Set(rows.map(r => r.row_id))
  const banding: BandingImporBalik = {
    totalLama: totalAkar(versi), totalBaru: totalAkar(rows),
    berubah: [], lainBerubah: 0, baru: [], dinolkan: [], dihapus: [],
  }
  for (const r of rows) {
    const v = versiPerId.get(r.row_id)
    const daun = !indukAkhir.has(r.row_id)
    if (!v) {
      if (daun) banding.baru.push({ kode: r.kode_rekening, uraian: r.uraian, jumlah: Number(r.jumlah ?? 0) })
      continue
    }
    if (target.has(r.row_id)) {
      if (daun) banding.dinolkan.push({ kode: v.kode_rekening, uraian: v.uraian, jumlah: Number(v.jumlah ?? 0) })
      continue
    }
    const jumlahBergeser = !sama(r.jumlah, v.jumlah)
    if (daun && jumlahBergeser) {
      banding.berubah.push({ kode: r.kode_rekening, uraian: r.uraian, lama: Number(v.jumlah ?? 0), baru: Number(r.jumlah ?? 0) })
    } else if (
      teks(r.kode_rekening) !== teks(v.kode_rekening) || teks(r.uraian) !== teks(v.uraian)
      || teks(r.satuan) !== teks(v.satuan) || teks(r.penanggung_jawab) !== teks(v.penanggung_jawab)
      || teks(r.keterangan) !== teks(v.keterangan) || r.tipe_baris !== v.tipe_baris
      || (r.parent_id ?? null) !== (v.parent_id ?? null) || !sama(r.vol, v.vol) || !sama(r.harga, v.harga)
    ) {
      banding.lainBerubah++
    }
  }
  for (const v of hilang) {
    if (!tetap.has(v.row_id) && !indukVersi.has(v.row_id)) {
      banding.dihapus.push({ kode: v.kode_rekening, uraian: v.uraian, jumlah: Number(v.jumlah ?? 0) })
    }
  }
  return { rows, banding }
}
