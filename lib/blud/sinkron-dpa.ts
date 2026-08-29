// lib/blud/sinkron-dpa.ts — pembanding "Sinkronkan DPA".
//
// Tombol itu menjanjikan "angka pergeseran Anda tidak akan berubah", dan
// janjinya benar SELAMA kolom kiri masih angka DPA. Sesudah sebuah putaran
// ditutup, kolom kiri berisi hasil putaran itu — dan `injectDpaKePergeseran`
// mengenali "baris ini belum digeser" dari `vol_p === vol`, yang sesudah
// penutupan berlaku untuk SEMUA baris. Akibatnya seluruh tabel bisa ditarik
// balik ke DPA murni, kolom P ikut, dan pagu realisasi ikut mundur.
//
// Tapi memblokirnya juga salah: kalau DPA sudah direvisi mengikuti hasil
// penutupan, sinkron tidak mengubah apa pun dan memang aman. Bedanya bukan pada
// niat orangnya — bedanya pada apakah DPA-nya sudah cocok, dan itu BISA DIHITUNG.
//
// Jadi: hitung dulu, baru bertanya. Nol perubahan → jalan tanpa gangguan. Ada
// perubahan → sebutkan barisnya dan nominalnya. Kode konfirmasi tidak menjawab
// pertanyaan yang sebenarnya ("apa yang akan hilang?"), cuma membuktikan jari
// yang menekan sudah sengaja.
//
// Konsep: docs/CONCEPT-blud-tutup-pergeseran.md §9

import type { PergeseranBarisInput } from '@/types'

export interface BedaBaris {
  row_id:        string
  kode_rekening: string
  uraian:        string
  /** Kolom kiri — pagu sebelum geser. */
  jumlahLama:    number
  jumlahBaru:    number
  /** Kolom P — INI yang jadi pagu realisasi. */
  pergeseranLama: number
  pergeseranBaru: number
}

export interface BedaSinkron {
  baris:           BedaBaris[]
  /** Selisih total pagu akar. ≠ 0 berarti pagu tahun itu ikut bergeser. */
  deltaPagu:       number
  /** Baris yang ada di hasil sinkron tapi tidak di tabel sekarang. */
  barisBaru:       number
  /** Baris yang hilang dari tabel sesudah sinkron. */
  barisHilang:     number
}

/** Toleransi pembulatan DECIMAL(18,2) — bukan izin selisih. */
const NOL = 0.005

const n = (v: unknown): number => Number(v ?? 0)

/**
 * Apa yang akan berubah kalau hasil sinkron diterapkan.
 *
 * Dibandingkan lewat `row_id`, bukan urutan: `injectDpaKePergeseran` menyusun
 * ulang barisnya mengikuti urutan DPA, jadi membandingkan indeks akan melaporkan
 * seluruh tabel berubah padahal cuma pindah tempat.
 *
 * Yang dibandingkan hanya UANG — `jumlah` dan `pergeseran`. Uraian dan kode
 * rekening yang ikut disegarkan memang tujuan tombol ini; melaporkannya sebagai
 * "perubahan" akan menenggelamkan satu baris berbahaya di antara ratusan baris
 * penggantian nama, persis penyakit yang panel impor baru saja disembuhkan.
 */
export function bedaSinkron(
  sebelum: readonly PergeseranBarisInput[],
  sesudah: readonly PergeseranBarisInput[],
): BedaSinkron {
  const lama = new Map<string, PergeseranBarisInput>()
  for (const r of sebelum) lama.set(r.row_id, r)

  const baris: BedaBaris[] = []
  let barisBaru = 0
  const terpakai = new Set<string>()

  for (const b of sesudah) {
    const a = lama.get(b.row_id)
    if (!a) { barisBaru++; continue }
    terpakai.add(b.row_id)

    const dJumlah     = n(b.jumlah) - n(a.jumlah)
    const dPergeseran = n(b.pergeseran) - n(a.pergeseran)
    if (Math.abs(dJumlah) < NOL && Math.abs(dPergeseran) < NOL) continue

    baris.push({
      row_id:         b.row_id,
      kode_rekening:  b.kode_rekening,
      uraian:         b.uraian,
      jumlahLama:     n(a.jumlah),
      jumlahBaru:     n(b.jumlah),
      pergeseranLama: n(a.pergeseran),
      pergeseranBaru: n(b.pergeseran),
    })
  }

  const akar = (rows: readonly PergeseranBarisInput[]) =>
    rows.reduce((s, r) => (r.parent_id ? s : s + n(r.pergeseran)), 0)

  return {
    // Yang paling banyak berubah nominalnya duluan — di tabel 558 baris, urutan
    // apa adanya berarti temuan besar bisa mendarat di baris ke-400.
    baris: baris.sort((x, y) =>
      Math.abs(y.pergeseranBaru - y.pergeseranLama) - Math.abs(x.pergeseranBaru - x.pergeseranLama)),
    deltaPagu:   akar(sesudah) - akar(sebelum),
    barisBaru,
    barisHilang: sebelum.length - terpakai.size,
  }
}

/** Ada yang berubah nominalnya, atau ada baris yang hilang? */
export function sinkronMengubahAngka(b: BedaSinkron): boolean {
  return b.baris.length > 0 || b.barisHilang > 0 || Math.abs(b.deltaPagu) >= NOL
}
