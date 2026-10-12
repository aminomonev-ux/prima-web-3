// lib/kinerja/bentrok-ssk.ts — gabung bentrok 409 layar RKO (SSK).
//
// Pasangan `gabungBentrok` Realisasi (banding-realisasi.ts) untuk RKO: simpanan orang lain
// di versi yang sama dulu membuat layar langsung dimuat ulang dan ketikan terbuang. Kini
// ketikan (layar vs dasar) dipasang di atas isi terbaru; sel yang diubah dua orang dengan
// angka berbeda ditanyakan. Tidak menyimpan apa pun (L78).
//
// Beda dgn Realisasi, dan karena itu berkas sendiri:
// - identitas baris = `canonical_id` (RKO satu baris per rekening, tanpa bulan); baris
//   yang lahir di layar (Inject/Impor) belum punya canonical → dicocokkan lewat
//   uraian_ssk+uraian, kunci yang sama dgn penyaring `injectRekening`;
// - yang digabung 14 nilai per baris: pagu, 12 target bulan, dan bendera nol-kan;
// - nol-kan menyentuh pagu + 12 bulan + bendera sekaligus, jadi baris yang benderanya
//   disentuh salah satu pihak diputuskan UTUH. Kalau digabung per sel, "pakai angka
//   tersimpan" untuk Februari bisa melahirkan baris dinol-kan yang masih bertarget.
//
// Label (program/kegiatan/uraian) tidak digabung: layar RKO tidak bisa menyuntingnya,
// asalnya Master Rekening lewat Inject/Impor. MURNI, tanpa impor.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md §6

export interface BarisSskBentrok {
  canonical_id?: string | null
  uraian_ssk?:   string | null
  uraian?:       string | null
  pagu?:         number | string | null
  months?:       Record<string, unknown> | null
  is_nullified?: boolean | null
}

export const KUNCI_BULAN_SSK = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const
export type BulanSsk = typeof KUNCI_BULAN_SSK[number]
export type KolomSsk = 'pagu' | BulanSsk | 'is_nullified'
export const KOLOM_SSK: readonly KolomSsk[] = ['pagu', ...KUNCI_BULAN_SSK, 'is_nullified']

const sen = (v: unknown) => Math.round((Number(v) || 0) * 100)

/** Nilai pembanding satu kolom: rupiah dalam sen, bendera 0/1. */
function nilai(r: BarisSskBentrok, kol: KolomSsk): number {
  if (kol === 'pagu') return sen(r.pagu)
  if (kol === 'is_nullified') return r.is_nullified ? 1 : 0
  return sen(r.months?.[kol])
}

/** Nilai mentah untuk ditulis balik / disebut di dialog (rupiah, atau 0/1 untuk bendera). */
function mentah(r: BarisSskBentrok, kol: KolomSsk): number {
  return kol === 'is_nullified' ? nilai(r, kol) : nilai(r, kol) / 100
}

function pasang(target: BarisSskBentrok, kol: KolomSsk, v: number): void {
  if (kol === 'pagu') target.pagu = v
  else if (kol === 'is_nullified') target.is_nullified = v === 1
  else target.months = { ...(target.months ?? {}), [kol]: v }
}

const kunciNama = (r: BarisSskBentrok) => `${String(r.uraian_ssk ?? '')}\u0000${String(r.uraian ?? '')}`

export function kunciSsk(r: BarisSskBentrok): string {
  const cid = String(r.canonical_id ?? '').trim()
  return cid ? `c:${cid}` : `n:${kunciNama(r)}`
}

/** kunci#n → indeks; kembar dipasangkan menurut urutan kemunculan (server: ORDER BY urut, id). */
function petakan(rows: readonly BarisSskBentrok[]): Map<string, number> {
  const hitung = new Map<string, number>()
  const peta = new Map<string, number>()
  rows.forEach((r, i) => {
    const k = kunciSsk(r)
    const n = hitung.get(k) ?? 0
    hitung.set(k, n + 1)
    peta.set(`${k}#${n}`, i)
  })
  return peta
}

const beda = (a: BarisSskBentrok, b: BarisSskBentrok) => KOLOM_SSK.filter(k => nilai(a, k) !== nilai(b, k))

export function labelSsk(r: BarisSskBentrok): string {
  return String(r.uraian || r.uraian_ssk || r.canonical_id || '(tanpa nama)')
}

function salin<T extends BarisSskBentrok>(r: T): T {
  return { ...r, months: { ...(r.months ?? {}) } }
}

export interface SelBentrokSsk {
  /** Kunci baris di isi TERBARU — pilihan "saya" ditulis ke baris itu. */
  kunci:     string
  label:     string
  kolom:     KolomSsk
  milikSaya: number
  tersimpan: number
}

export interface TidakTerpasangSsk {
  label:  string
  alasan: 'hilang' | 'diubah-orang-lain'
}

export interface HasilGabungSsk<T extends BarisSskBentrok> {
  rows:      T[]
  /** Baris yang menerima ketikan saya (termasuk baris baru). */
  dipasang:  number
  bentrok:   SelBentrokSsk[]
  tidakBisa: TidakTerpasangSsk[]
}

/**
 * Ketikan saya (layar vs dasar) dipasang di atas isi terbaru server. Turunan
 * (`months_pct`, `total`, `total_pct`) TIDAK dihitung di sini — pemanggil wajib
 * melewatkan hasilnya ke `hitungTurunanRko`, satu-satunya rumus turunan RKO.
 */
export function gabungBentrokSsk<T extends BarisSskBentrok>(
  dasar: readonly T[], layar: readonly T[], terbaru: readonly T[],
): HasilGabungSsk<T> {
  const pDasar = petakan(dasar)
  const pLayar = petakan(layar)
  const pTerbaru = petakan(terbaru)
  const rows: (T | null)[] = terbaru.map(salin)
  const tambahan: T[] = []
  const bentrok: SelBentrokSsk[] = []
  const tidakBisa: TidakTerpasangSsk[] = []
  let dipasang = 0

  // Baris yang DITAMBAHKAN orang lain (tidak ada di dasar). Dipakai mencocokkan baris
  // baru saya lewat nama: begitu tersimpan, baris orang itu sudah ber-canonical,
  // sedangkan baris saya belum — kuncinya tidak akan pernah sama.
  const tambahanOrangLain = [...pTerbaru].filter(([k]) => !pDasar.has(k)).map(([, i]) => i)
  const sudahDiklaim = new Set<number>()
  const kunciTerbaru = new Map<number, string>([...pTerbaru].map(([k, i]) => [i, k]))

  const daftarkan = (iT: number, l: T, kolom: readonly KolomSsk[]) => {
    const t = terbaru[iT]
    for (const kol of kolom) {
      if (nilai(l, kol) === nilai(t, kol)) continue
      bentrok.push({ kunci: kunciTerbaru.get(iT)!, label: labelSsk(l), kolom: kol, milikSaya: mentah(l, kol), tersimpan: mentah(t, kol) })
    }
  }

  for (const [k, iL] of pLayar) {
    const l = layar[iL]
    const iD = pDasar.get(k)

    if (iD === undefined) {
      // Lahir di layar ini (Inject/Impor).
      const iT = tambahanOrangLain.find(i => !sudahDiklaim.has(i) && kunciNama(terbaru[i]) === kunciNama(l))
      if (iT === undefined) { tambahan.push(salin(l)); dipasang++; continue }
      // Orang lain menambahkan rekening yang sama lebih dulu — satu baris, bukan dua.
      sudahDiklaim.add(iT)
      daftarkan(iT, l, KOLOM_SSK)
      continue
    }

    const d = dasar[iD]
    const diubah = beda(l, d)
    if (diubah.length === 0) continue
    const iT = pTerbaru.get(k)
    if (iT === undefined) { tidakBisa.push({ label: labelSsk(l), alasan: 'hilang' }); continue }

    const t = terbaru[iT]
    const diubahOrangLain = beda(t, d)
    if (diubahOrangLain.length === 0) {
      const target = rows[iT] as T
      for (const kol of diubah) pasang(target, kol, mentah(l, kol))
      dipasang++
      continue
    }
    if (diubah.includes('is_nullified') || diubahOrangLain.includes('is_nullified')) {
      daftarkan(iT, l, KOLOM_SSK)
      continue
    }
    const target = rows[iT] as T
    let kena = false
    for (const kol of diubah) {
      if (nilai(t, kol) === nilai(d, kol)) { pasang(target, kol, mentah(l, kol)); kena = true }
      else daftarkan(iT, l, [kol])
    }
    if (kena) dipasang++
  }

  // Baris yang saya hapus: ikut dibuang hanya kalau orang lain tidak mengubahnya.
  for (const [k, iD] of pDasar) {
    if (pLayar.has(k)) continue
    const iT = pTerbaru.get(k)
    if (iT === undefined) continue
    if (beda(terbaru[iT], dasar[iD]).length === 0) rows[iT] = null
    else tidakBisa.push({ label: labelSsk(dasar[iD]), alasan: 'diubah-orang-lain' })
  }

  return { rows: [...rows.filter((r): r is T => r !== null), ...tambahan], dipasang, bentrok, tidakBisa }
}

/**
 * Keputusan atas sel bentrok: 'saya' menulis ketikan saya, 'tersimpan' membiarkan isi
 * terbaru. Satu pilihan untuk semua sel — baris nol-kan yang didaftar utuh tetap utuh.
 */
export function terapkanPilihanBentrokSsk<T extends BarisSskBentrok>(
  rows: readonly T[], bentrok: readonly SelBentrokSsk[], pilihan: 'saya' | 'tersimpan',
): T[] {
  if (pilihan === 'tersimpan' || bentrok.length === 0) return rows.slice()
  const perKunci = new Map<string, SelBentrokSsk[]>()
  for (const b of bentrok) perKunci.set(b.kunci, [...(perKunci.get(b.kunci) ?? []), b])
  const hitung = new Map<string, number>()
  return rows.map(r => {
    const k = kunciSsk(r)
    const n = hitung.get(k) ?? 0
    hitung.set(k, n + 1)
    const daftar = perKunci.get(`${k}#${n}`)
    if (!daftar) return r
    const s = salin(r)
    for (const b of daftar) pasang(s, b.kolom, b.milikSaya)
    return s
  })
}

const NAMA_KOLOM: Record<KolomSsk, string> = {
  pagu: 'pagu', is_nullified: 'nol-kan',
  jan: 'target Jan', feb: 'target Feb', mar: 'target Mar', apr: 'target Apr', mei: 'target Mei', jun: 'target Jun',
  jul: 'target Jul', agu: 'target Agu', sep: 'target Sep', okt: 'target Okt', nov: 'target Nov', des: 'target Des',
}

/** "• Belanja ATK — target Feb: Anda 10.000.000 · tersimpan 12.000.000" — isi dialog. */
export function kalimatSelBentrokSsk(b: SelBentrokSsk, rupiah: (n: number) => string): string {
  const tulis = (v: number) => (b.kolom === 'is_nullified' ? (v ? 'ya' : 'tidak') : rupiah(v))
  return `• ${b.label} — ${NAMA_KOLOM[b.kolom]}: Anda ${tulis(b.milikSaya)} · tersimpan ${tulis(b.tersimpan)}`
}
