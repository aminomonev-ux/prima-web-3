// lib/kinerja/banding-realisasi.ts — membandingkan dua isi realisasi (lama vs baru).
//
// Simpan Realisasi mengirim SETAHUN dan server menghapus-lalu-menulis-ulang, jadi tanpa
// pembanding tidak ada yang tahu bulan mana yang sebenarnya berubah. Satu pembanding
// untuk server (ringkasan audit, jejak per baris, pagar bulan tertutup) DAN layar
// (belum tersimpan, gabung bentrok) — dua salinan aturan "baris mana pasangan baris mana"
// cepat atau lambat berbeda pendapat.
//
// MURNI dan tanpa impor: dipakai `lib/data/kinerja.ts` (server) dan layar `'use client'`.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md

export interface BarisBanding {
  bulan:             number
  ssk_canonical_id?: string | null
  keterangan?:       string | null
  uraian_ssk?:       string | null
  program?:          string | null
  kegiatan?:         string | null
  subkegiatan?:      string | null
  ssk_versi_tipe?:   string | null
  ssk_versi_seq?:    number | string | null
  real_fisik?:       number | string | null
  real_keuangan?:    number | string | null
}

export type KolomAngka = 'real_fisik' | 'real_keuangan'
export const KOLOM_ANGKA: readonly KolomAngka[] = ['real_fisik', 'real_keuangan']

/** Kolom tersimpan selain angka — ikut menentukan "berubah", tidak ikut dicocokkan bentrok. */
const KOLOM_LABEL = ['keterangan', 'uraian_ssk', 'program', 'kegiatan', 'subkegiatan', 'ssk_versi_tipe'] as const

export const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** Kolom DECIMAL(18,2) → sen bulat. mysql2 memulangkan DECIMAL sebagai string. */
export function sen(v: unknown): number {
  return Math.round((Number(v) || 0) * 100)
}

/**
 * Identitas baris: bulan + rekening. Rekening dikenali lewat `ssk_canonical_id`; baris
 * lama tanpa canonical memakai keterangan+uraian_ssk — cadangan yang SAMA dengan yang
 * dipakai Init untuk memutuskan baris mana yang sudah ada.
 */
export function kunciRealisasi(r: BarisBanding): string {
  const cid = String(r.ssk_canonical_id ?? '').trim()
  return cid
    ? `${Number(r.bulan)}|c:${cid}`
    : `${Number(r.bulan)}|n:${String(r.keterangan ?? '')}\u0000${String(r.uraian_ssk ?? '')}`
}

/**
 * kunci#n → indeks. Baris kembar (kunci sama) dipasangkan menurut urutan
 * kemunculannya — server memulangkan `ORDER BY bulan, id` dan layar tidak mengubah
 * urutan baris yang sudah ada, jadi kemunculan ke-n di kedua sisi adalah baris yang sama.
 */
function petakan(rows: readonly BarisBanding[]): Map<string, number> {
  const hitung = new Map<string, number>()
  const peta = new Map<string, number>()
  rows.forEach((r, i) => {
    const k = kunciRealisasi(r)
    const n = hitung.get(k) ?? 0
    hitung.set(k, n + 1)
    peta.set(`${k}#${n}`, i)
  })
  return peta
}

function angkaSama(a: BarisBanding, b: BarisBanding): boolean {
  return KOLOM_ANGKA.every(k => sen(a[k]) === sen(b[k]))
}

function labelSama(a: BarisBanding, b: BarisBanding): boolean {
  return KOLOM_LABEL.every(k => String(a[k] ?? '') === String(b[k] ?? ''))
    && Number(a.ssk_versi_seq ?? 0) === Number(b.ssk_versi_seq ?? 0)
}

function adaAngka(r: BarisBanding): boolean {
  return KOLOM_ANGKA.some(k => sen(r[k]) !== 0)
}

export function labelBaris(r: BarisBanding): string {
  return String(r.keterangan || r.uraian_ssk || r.ssk_canonical_id || '(tanpa nama)')
}

export interface RingkasBulan {
  bulan:           number
  berubah:         number
  baru:            number
  hilang:          number
  /** Σ real_keuangan baru − Σ lama di bulan itu, rupiah. */
  selisihKeuangan: number
}

export interface HasilBanding {
  perBulan:      RingkasBulan[]
  adaPerubahan:  boolean
  /** indeks baris BARU → indeks baris LAMA yang isinya sama persis (jejaknya dipertahankan). */
  pasanganSama:  Map<number, number>
}

export function bandingRealisasi(lama: readonly BarisBanding[], baru: readonly BarisBanding[]): HasilBanding {
  const pLama = petakan(lama)
  const pBaru = petakan(baru)
  const bulan = new Map<number, RingkasBulan>()
  const ambil = (b: number) => {
    let x = bulan.get(b)
    if (!x) { x = { bulan: b, berubah: 0, baru: 0, hilang: 0, selisihKeuangan: 0 }; bulan.set(b, x) }
    return x
  }
  const pasanganSama = new Map<number, number>()

  for (const [k, iBaru] of pBaru) {
    const b = baru[iBaru]
    const iLama = pLama.get(k)
    if (iLama === undefined) {
      const x = ambil(Number(b.bulan))
      x.baru++
      x.selisihKeuangan += sen(b.real_keuangan) / 100
      continue
    }
    const l = lama[iLama]
    if (angkaSama(l, b) && labelSama(l, b)) { pasanganSama.set(iBaru, iLama); continue }
    const x = ambil(Number(b.bulan))
    x.berubah++
    x.selisihKeuangan += (sen(b.real_keuangan) - sen(l.real_keuangan)) / 100
  }
  for (const [k, iLama] of pLama) {
    if (pBaru.has(k)) continue
    const l = lama[iLama]
    const x = ambil(Number(l.bulan))
    x.hilang++
    x.selisihKeuangan -= sen(l.real_keuangan) / 100
  }

  const perBulan = [...bulan.values()]
    .filter(x => x.berubah + x.baru + x.hilang > 0)
    .sort((a, b) => a.bulan - b.bulan)
  // Pembulatan sen sudah dilakukan per baris; pembagian ulang ke rupiah bisa
  // menyisakan ekor biner (0.1 + 0.2), jadi dirapikan sekali di akhir.
  for (const x of perBulan) x.selisihKeuangan = Math.round(x.selisihKeuangan * 100) / 100
  return { perBulan, adaPerubahan: perBulan.length > 0, pasanganSama }
}

function rupiah(n: number): string {
  return `Rp ${Math.abs(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })}`
}

/** "September: 14 baris berubah (+Rp 1.250.000.000) · Oktober: 2 baris baru" — audit & toast. */
export function kalimatRingkasan(perBulan: readonly RingkasBulan[], maks = 4): string {
  if (perBulan.length === 0) return 'tidak ada yang berubah'
  const potong = perBulan.slice(0, maks).map(x => {
    const bagian: string[] = []
    if (x.berubah) bagian.push(`${x.berubah} baris berubah`)
    if (x.baru)    bagian.push(`${x.baru} baris baru`)
    if (x.hilang)  bagian.push(`${x.hilang} baris hilang`)
    const uang = x.selisihKeuangan === 0 ? '' : ` (${x.selisihKeuangan > 0 ? '+' : '−'}${rupiah(x.selisihKeuangan)})`
    return `${NAMA_BULAN[x.bulan - 1]}: ${bagian.join(', ')}${uang}`
  })
  const sisa = perBulan.length - maks
  return potong.join(' · ') + (sisa > 0 ? ` · dan ${sisa} bulan lain` : '')
}

/** "Agustus 1 baris · September 14 baris" — penanda belum tersimpan di layar. */
export function kalimatBelumTersimpan(perBulan: readonly RingkasBulan[]): string {
  return perBulan
    .map(x => `${NAMA_BULAN[x.bulan - 1]} ${x.berubah + x.baru + x.hilang} baris`)
    .join(' · ')
}

// ─── Gabung bentrok (409) ────────────────────────────────────────────────────

export interface SelBentrok {
  kunci:      string
  bulan:      number
  label:      string
  kolom:      KolomAngka
  milikSaya:  number
  tersimpan:  number
}

export interface TidakTerpasang {
  bulan:  number
  label:  string
  alasan: 'hilang' | 'tertutup' | 'diubah-orang-lain'
}

export interface HasilGabung<T extends BarisBanding> {
  rows:       T[]
  /** Baris yang menerima ketikan saya. */
  dipasang:   number
  bentrok:    SelBentrok[]
  tidakBisa:  TidakTerpasang[]
  /** Yang diubah orang lain sejak layar ini dimuat (terbaru vs dasar). */
  orangLain:  RingkasBulan[]
}

/**
 * Ketikan saya (layar vs dasar) dipasang di atas isi terbaru server.
 *
 * Yang dipasang hanya ANGKA yang memang saya ubah. Sel yang diubah kedua pihak dengan
 * angka berbeda tidak diputuskan di sini — ia didaftar (`bentrok`), isi terbarunya
 * yang tinggal, dan orangnya yang memilih lewat `terapkanPilihanBentrok`. Ketikan di
 * baris yang sudah lenyap atau di bulan yang sudah ditutup tidak bisa dipasang dan
 * disebut, bukan dibuang diam-diam.
 */
export function gabungBentrok<T extends BarisBanding>(
  dasar: readonly T[], layar: readonly T[], terbaru: readonly T[],
  tertutup: ReadonlySet<number> = new Set(),
): HasilGabung<T> {
  const pDasar = petakan(dasar)
  const pLayar = petakan(layar)
  const pTerbaru = petakan(terbaru)
  const rows: (T | null)[] = terbaru.map(r => ({ ...r }))
  const tambahan: T[] = []
  const bentrok: SelBentrok[] = []
  const tidakBisa: TidakTerpasang[] = []
  let dipasang = 0

  for (const [k, iL] of pLayar) {
    const l = layar[iL]
    const iD = pDasar.get(k)
    const iT = pTerbaru.get(k)
    const bln = Number(l.bulan)
    const kunci = k.replace(/#\d+$/, '')

    if (iD === undefined) {
      // Baris yang lahir di layar ini (Init / impor).
      if (iT === undefined) {
        if (tertutup.has(bln) && adaAngka(l)) { tidakBisa.push({ bulan: bln, label: labelBaris(l), alasan: 'tertutup' }); continue }
        tambahan.push({ ...l }); dipasang++
        continue
      }
      // Orang lain menambahkan baris yang sama lebih dulu.
      const t = terbaru[iT]
      for (const kol of KOLOM_ANGKA) {
        if (sen(l[kol]) !== sen(t[kol])) {
          bentrok.push({ kunci, bulan: bln, label: labelBaris(l), kolom: kol, milikSaya: sen(l[kol]) / 100, tersimpan: sen(t[kol]) / 100 })
        }
      }
      continue
    }

    const d = dasar[iD]
    const diubah = KOLOM_ANGKA.filter(kol => sen(l[kol]) !== sen(d[kol]))
    if (diubah.length === 0) continue
    if (iT === undefined) { tidakBisa.push({ bulan: bln, label: labelBaris(l), alasan: 'hilang' }); continue }
    if (tertutup.has(bln)) { tidakBisa.push({ bulan: bln, label: labelBaris(l), alasan: 'tertutup' }); continue }

    const t = terbaru[iT]
    const target = rows[iT] as T
    let kena = false
    for (const kol of diubah) {
      if (sen(t[kol]) === sen(d[kol])) {
        (target as BarisBanding)[kol] = l[kol] as number
        kena = true
      } else if (sen(t[kol]) !== sen(l[kol])) {
        bentrok.push({ kunci, bulan: bln, label: labelBaris(l), kolom: kol, milikSaya: sen(l[kol]) / 100, tersimpan: sen(t[kol]) / 100 })
      }
    }
    if (kena) dipasang++
  }

  // Baris yang ada di dasar tapi tidak lagi di layar (mis. foto riwayat yang lebih
  // pendek): ikut dibuang hanya kalau orang lain tidak mengubahnya.
  for (const [k, iD] of pDasar) {
    if (pLayar.has(k)) continue
    const iT = pTerbaru.get(k)
    if (iT === undefined) continue
    if (angkaSama(terbaru[iT], dasar[iD])) rows[iT] = null
    else tidakBisa.push({ bulan: Number(dasar[iD].bulan), label: labelBaris(dasar[iD]), alasan: 'diubah-orang-lain' })
  }

  return {
    rows: [...rows.filter((r): r is T => r !== null), ...tambahan],
    dipasang, bentrok, tidakBisa,
    orangLain: bandingRealisasi(dasar, terbaru).perBulan,
  }
}

/** Keputusan atas sel bentrok: 'saya' menulis angka ketikan saya, 'tersimpan' membiarkannya. */
export function terapkanPilihanBentrok<T extends BarisBanding>(
  rows: readonly T[], bentrok: readonly SelBentrok[], pilihan: 'saya' | 'tersimpan',
): T[] {
  if (pilihan === 'tersimpan' || bentrok.length === 0) return rows.slice()
  const perKunci = new Map<string, SelBentrok[]>()
  for (const b of bentrok) perKunci.set(b.kunci, [...(perKunci.get(b.kunci) ?? []), b])
  const sudah = new Set<string>()
  return rows.map(r => {
    const k = kunciRealisasi(r)
    // Hanya kemunculan PERTAMA kunci itu — bentrok dicatat per kunci tanpa nomor urut,
    // dan baris kembar di data nyata nol (dibuktikan Tahap 5 rekap).
    if (sudah.has(k)) return r
    const daftar = perKunci.get(k)
    if (!daftar) return r
    sudah.add(k)
    const salin: BarisBanding = { ...r }
    for (const b of daftar) salin[b.kolom] = b.milikSaya
    return salin as T
  })
}

// ─── Pagar bulan tertutup ────────────────────────────────────────────────────

export interface PelanggaranTertutup {
  bulan: number
  label: string
  kolom: KolomAngka
  lama:  number
  baru:  number
}

/**
 * Angka di bulan tertutup yang akan berubah kalau kiriman ini ditulis. Baris BARU
 * bernilai nol (hasil Init) bukan pelanggaran — tidak mengubah angka apa pun.
 */
export function pelanggaranBulanTertutup(
  lama: readonly BarisBanding[], baru: readonly BarisBanding[], tertutup: ReadonlySet<number>,
): PelanggaranTertutup[] {
  if (tertutup.size === 0) return []
  const pLama = petakan(lama)
  const pBaru = petakan(baru)
  const hasil: PelanggaranTertutup[] = []
  const catat = (r: BarisBanding, kol: KolomAngka, a: unknown, b: unknown) =>
    hasil.push({ bulan: Number(r.bulan), label: labelBaris(r), kolom: kol, lama: sen(a) / 100, baru: sen(b) / 100 })

  for (const [k, iB] of pBaru) {
    const b = baru[iB]
    if (!tertutup.has(Number(b.bulan))) continue
    const iL = pLama.get(k)
    const l = iL === undefined ? null : lama[iL]
    for (const kol of KOLOM_ANGKA) {
      if (sen(b[kol]) !== sen(l?.[kol])) catat(b, kol, l?.[kol], b[kol])
    }
  }
  for (const [k, iL] of pLama) {
    const l = lama[iL]
    if (!tertutup.has(Number(l.bulan)) || pBaru.has(k)) continue
    for (const kol of KOLOM_ANGKA) if (sen(l[kol]) !== 0) catat(l, kol, l[kol], 0)
  }
  return hasil.sort((a, b) => a.bulan - b.bulan)
}
