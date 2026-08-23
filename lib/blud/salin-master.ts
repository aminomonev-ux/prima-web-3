// lib/blud/salin-master.ts — baris DPA → kandidat data induk (Kode Besar & Master Akun).
//
// Kebalikan `dpa-skeleton-builder.ts`: kalau berkas itu MENYUSUN DPA dari Kode Besar,
// berkas ini membaca DPA yang sudah jadi lalu menyimpulkan mana yang seharusnya jadi
// data induk. Kasus yang ditangani: orang mengimpor DPA lebih dulu sebelum mengisi
// data induk — tabel DPA penuh, tapi combobox rekening tidak punya satu pun pilihan.
//
// MODUL DAUN — tidak mengimpor apa pun, sama seperti `peran.ts`. Ia ikut ke bundel
// klien lewat modal Salin DAN dipanggil apa adanya oleh harness `node` yang
// mengompilasinya dengan tsc telanjang (tanpa `paths`). Satu impor beralias `@/…`
// mematahkan yang kedua; satu impor yang menyentuh DB/Redis mematahkan yang pertama.

/** Kode Besar = kerangka 5.1 / 5.1.02 · Master Akun = kode rekening yang dipakai combobox. */
export type TujuanSalin = 'KODE_BESAR' | 'MASTER_AKUN'
export type LevelKodeBesar = 'L1' | 'L2' | 'L2.1'

/** Bentuk minimum yang dibutuhkan pemindai — dipenuhi `DpaBarisInput` maupun `DpaBaris`. */
export interface BarisPindai {
  kode_rekening: string
  uraian: string
  /** Sengaja `string`, bukan `TipeBaris` — lihat catatan modul daun di kepala berkas. */
  tipe_baris: string
  row_id: string
  parent_id: string | null
  vol: number | null
  satuan: string | null
  harga: number | null
}

export interface IndukAda {
  kode: string
  uraian: string
}

export interface KandidatSalin {
  kode: string
  uraian: string
  tujuan: TujuanSalin
  /** Terisi hanya kalau `tujuan` KODE_BESAR. */
  level: LevelKodeBesar | null
  /** Terisi hanya kalau `tujuan` KODE_BESAR dan levelnya bukan L1. */
  parentKode: string | null
  status: 'BARU' | 'BEDA_URAIAN'
  /** Uraian yang sekarang tersimpan — hanya kalau status BEDA_URAIAN. */
  uraianLama: string | null
  /** Semua sinyal sepakat. Yang tidak yakin TIDAK dicentang otomatis. */
  yakin: boolean
  catatan: string[]
  /** Berapa baris DPA memakai kode ini. */
  pakai: number
}

export interface BarisDitahan {
  kode: string
  uraian: string
  alasan: string
}

export interface HasilPindai {
  kandidat: KandidatSalin[]
  ditahan: BarisDitahan[]
  /** Panjang kode (pemisah dibuang) yang jadi garis rekening; null kalau tidak terbaca. */
  garisRekening: number | null
  contohGaris: { kode: string; uraian: string } | null
  /** Kode Besar tersimpan yang tidak dipakai berkas ini — calon sisa konvensi lama. */
  kodeBesarTakTerpakai: string[]
  /** Sudah ada di tabel tujuan dengan isi sama persis — tidak ditawarkan. */
  sudahAda: number
}

/**
 * Tangga yang dipakai `buildDpaRowsFromKodeBesar` ke arah maju, dibaca terbalik.
 * Tingkat di bawah CHILD (LEADER dan seterusnya) bukan wilayah Kode Besar.
 */
const TANGGA_KODE_BESAR: Record<string, LevelKodeBesar> = {
  GRANDMASTER: 'L1',
  MASTER: 'L2',
  CHILD: 'L2.1',
}

/** Buang pemisah supaya `5.1.02` dan `5102` dibandingkan setara. */
export function normalKode(kode: string): string {
  return kode.replace(/[^0-9A-Za-z]/g, '')
}

/**
 * Apakah `induk` layak jadi induk kode `anak`. Dipakai `dpa-skeleton-builder.ts`
 * untuk mencari L1 milik sebuah L2; tinggal di sini karena berkas inilah yang
 * tanpa impor, jadi aturannya bisa diuji harness tanpa menyeret data layer.
 *
 * Cocok-segmen adalah aturan aslinya dan dipertahankan apa adanya — itu yang
 * menyatukan seed `5.X` dengan `5.1`, dan awalan biasa tidak bisa melakukannya
 * (`51` tidak berawalan `5X`). Cocok-awalan ditambahkan untuk kode TANPA pemisah:
 * di situ `split('.')[0]` mengembalikan seluruh kode, jadi `5` tidak pernah cocok
 * dengan `51` dan setiap L2 diam-diam dilewati saat menyusun "Form Baru".
 */
export function kodeIndukCocok(induk: string, anak: string): boolean {
  if (!induk || !anak) return false
  if (induk.split('.')[0] === anak.split('.')[0]) return true
  const i = normalKode(induk)
  const a = normalKode(anak)
  return i.length > 0 && a.length > i.length && a.startsWith(i)
}

const MAKS_KEDALAMAN = 32
const MAKS_PANJANG_KODE = 64
const MAKS_PANJANG_URAIAN = 255

/**
 * Kode Besar cuma bisa menampung TIGA tingkat (L1 · L2 · L2.1) — itu batas
 * tabelnya, bukan selera. DPA sungguhan jauh lebih dalam: berkas 2026 milik RSJD
 * berantai sampai L7.1, dan tanpa langit-langit ini 131 dari 259 kode terbaca
 * sebagai kerangka lalu diratakan semua ke L2.1. Baris yang lebih dalam dari ini
 * tempatnya di Master Akun — daftar itu memang cuma pasangan kode+uraian untuk
 * combobox, dan baris penghimpun di DPA memakai combobox yang sama.
 */
const MAKS_TIER_KODE_BESAR = 3

/**
 * @param penimpaTujuan Tujuan yang dipilih sendiri oleh orangnya, dikunci per kode.
 *   Dioper masuk ke pemindaian alih-alih ditempel belakangan supaya `level`,
 *   `parentKode`, dan penyaringan yatim ikut dihitung ulang — memindahkan satu
 *   baris ke Kode Besar mengubah kedudukan baris di bawahnya juga.
 */
export function pindaiBarisDpa(
  rows: BarisPindai[],
  ada: { masterAkun: IndukAda[]; kodeBesar: IndukAda[] },
  penimpaTujuan?: Record<string, TujuanSalin>,
): HasilPindai {
  const perId = new Map<string, BarisPindai>()
  for (const r of rows) perId.set(r.row_id, r)

  const anak = new Map<string, BarisPindai[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const daftar = anak.get(r.parent_id)
    if (daftar) daftar.push(r)
    else anak.set(r.parent_id, [r])
  }

  const berkode = rows.filter(r => (r.kode_rekening ?? '').trim() !== '')

  /**
   * Sinyal bentuk pohon. Diperiksa sampai ke cucu, bukan cuma anak langsung —
   * satu baris antara yang tidak berkode tidak boleh membuat penghimpun terbaca
   * sebagai rekening.
   */
  const memoKeturunan = new Map<string, boolean>()
  function adaKeturunanBerkode(r: BarisPindai): boolean {
    const jawab = memoKeturunan.get(r.row_id)
    if (jawab !== undefined) return jawab
    const tumpukan = [...(anak.get(r.row_id) ?? [])]
    const dilihat = new Set<string>()
    let hasil = false
    while (tumpukan.length) {
      const n = tumpukan.pop()!
      if (dilihat.has(n.row_id)) continue
      dilihat.add(n.row_id)
      if ((n.kode_rekening ?? '').trim() !== '') { hasil = true; break }
      tumpukan.push(...(anak.get(n.row_id) ?? []))
    }
    memoKeturunan.set(r.row_id, hasil)
    return hasil
  }

  /**
   * Garis rekening dibaca RELATIF dari berkasnya sendiri: panjang kode yang paling
   * sering muncul di antara baris yang tidak lagi punya keturunan berkode.
   *
   * Ambang mati ("≤3 ruas") sengaja tidak dipakai — ia buta pada kode tanpa titik
   * (`510199`), dan salah pada `5.1.02` yang kalau pemisahnya dibuang jadi 4 digit.
   */
  const garisRekening = (() => {
    const hitung = new Map<number, number>()
    for (const r of berkode) {
      if (adaKeturunanBerkode(r)) continue
      const p = normalKode(r.kode_rekening).length
      if (!p) continue
      hitung.set(p, (hitung.get(p) ?? 0) + 1)
    }
    let pilihan: number | null = null
    let terbanyak = 0
    for (const [p, n] of hitung) {
      if (n > terbanyak || (n === terbanyak && pilihan != null && p > pilihan)) {
        terbanyak = n
        pilihan = p
      }
    }
    return pilihan
  })()

  /** Leluhur BERKODE terdekat lebih dulu. Sumber tingkat sekaligus `parent_kode`. */
  const memoLeluhur = new Map<string, BarisPindai[]>()
  function leluhurBerkode(r: BarisPindai): BarisPindai[] {
    const jawab = memoLeluhur.get(r.row_id)
    if (jawab) return jawab
    const hasil: BarisPindai[] = []
    let p = r.parent_id
    let jaga = 0
    while (p && jaga++ < MAKS_KEDALAMAN) {
      const induk = perId.get(p)
      if (!induk) break
      if ((induk.kode_rekening ?? '').trim() !== '') hasil.push(induk)
      p = induk.parent_id
    }
    memoLeluhur.set(r.row_id, hasil)
    return hasil
  }

  const putusan = new Map<string, { tujuan: TujuanSalin; yakin: boolean; catatan: string[]; tier: number }>()
  for (const r of berkode) {
    const catatan: string[] = []
    const panjang = normalKode(r.kode_rekening).length
    const tier = leluhurBerkode(r).length

    const suaraTangga: TujuanSalin = TANGGA_KODE_BESAR[r.tipe_baris] ? 'KODE_BESAR' : 'MASTER_AKUN'
    const suaraPohon: TujuanSalin = adaKeturunanBerkode(r) ? 'KODE_BESAR' : 'MASTER_AKUN'
    const suaraPanjang: TujuanSalin | null = garisRekening == null
      ? null
      : (panjang >= garisRekening ? 'MASTER_AKUN' : 'KODE_BESAR')

    // Kode Besar tidak pernah membawa volume/satuan/harga. Ini memutus tujuan, tapi
    // TIDAK ikut membuat yakin: baris rincian yang kebetulan diberi kode juga lolos
    // veto ini, dan itu bukan rekening — biar orangnya yang memutuskan.
    const veto = r.vol != null || r.harga != null || (r.satuan ?? '').trim() !== ''

    const suara: TujuanSalin[] = [suaraTangga, suaraPohon]
    if (suaraPanjang) suara.push(suaraPanjang)

    let tujuan: TujuanSalin
    if (tier >= MAKS_TIER_KODE_BESAR) {
      // Langit-langit struktural, bukan pendapat — jadi tidak ada catatan "sinyal
      // tidak sepakat" di sini. Baris sedalam ini memang tidak punya tujuan lain,
      // dan menandainya ragu-ragu berarti 128 kotak centang harus dicentang tangan.
      tujuan = 'MASTER_AKUN'
      putusan.set(r.row_id, { tujuan, yakin: true, catatan, tier })
      continue
    }
    if (veto) {
      catatan.push('membawa vol/satuan/harga — tidak mungkin Kode Besar')
      tujuan = 'MASTER_AKUN'
    } else {
      // Imbang jatuh ke Master Akun: salah taruh di sana cuma menambah satu baris
      // combobox, sedangkan salah taruh di Kode Besar menyusup ke kerangka "Form Baru".
      const suaraKb = suara.filter(s => s === 'KODE_BESAR').length
      tujuan = suaraKb * 2 > suara.length ? 'KODE_BESAR' : 'MASTER_AKUN'
    }

    const pilihanOrang = penimpaTujuan?.[r.kode_rekening.trim()]
    if (pilihanOrang && pilihanOrang !== tujuan) {
      tujuan = pilihanOrang
      catatan.push('tujuan diubah manual')
      putusan.set(r.row_id, { tujuan, yakin: true, catatan, tier })
      continue
    }

    const beda: string[] = []
    if (suaraTangga !== tujuan) beda.push(`tingkat "${r.tipe_baris}"`)
    if (suaraPohon !== tujuan) {
      beda.push(adaKeturunanBerkode(r) ? 'masih punya anak berkode' : 'tidak punya anak berkode')
    }
    if (suaraPanjang && suaraPanjang !== tujuan) beda.push(`panjang kode ${panjang} vs garis ${garisRekening}`)
    if (beda.length) catatan.push('sinyal tidak sepakat — ' + beda.join(', '))

    putusan.set(r.row_id, { tujuan, yakin: beda.length === 0, catatan, tier })
  }

  const urutKode: string[] = []
  const grup = new Map<string, { baris: BarisPindai[]; uraian: Set<string> }>()
  for (const r of berkode) {
    const kode = r.kode_rekening.trim()
    let g = grup.get(kode)
    if (!g) {
      g = { baris: [], uraian: new Set() }
      grup.set(kode, g)
      urutKode.push(kode)
    }
    g.baris.push(r)
    const u = (r.uraian ?? '').trim()
    if (u) g.uraian.add(u)
  }

  const petaMa = new Map(ada.masterAkun.map(m => [m.kode.trim(), (m.uraian ?? '').trim()]))
  const petaKb = new Map(ada.kodeBesar.map(m => [m.kode.trim(), (m.uraian ?? '').trim()]))

  const kandidat: KandidatSalin[] = []
  const ditahan: BarisDitahan[] = []
  let sudahAda = 0

  for (const kode of urutKode) {
    const g = grup.get(kode)!
    const utama = g.baris[0]
    const p = putusan.get(utama.row_id)!
    const catatan = [...p.catatan]
    let yakin = p.yakin

    const uraian = (utama.uraian ?? '').trim()
    if (!uraian) {
      ditahan.push({ kode, uraian: '', alasan: 'baris tanpa uraian — data induk mewajibkannya' })
      continue
    }
    if (kode.length > MAKS_PANJANG_KODE) {
      ditahan.push({ kode, uraian, alasan: `kode ${kode.length} karakter, batasnya ${MAKS_PANJANG_KODE}` })
      continue
    }
    if (uraian.length > MAKS_PANJANG_URAIAN) {
      ditahan.push({ kode, uraian, alasan: `uraian ${uraian.length} karakter, batasnya ${MAKS_PANJANG_URAIAN}` })
      continue
    }

    if (g.uraian.size > 1) {
      catatan.push(`berkas memuat ${g.uraian.size} uraian untuk kode ini — dipakai yang pertama`)
      yakin = false
    }
    const tujuanLain = g.baris.some(b => putusan.get(b.row_id)!.tujuan !== p.tujuan)
    if (tujuanLain) {
      catatan.push('kode yang sama muncul di dua tingkat berbeda')
      yakin = false
    }

    let level: LevelKodeBesar | null = null
    let parentKode: string | null = null
    if (p.tujuan === 'KODE_BESAR') {
      // Tingkat diambil dari kedudukan di pohon, bukan dari `tipe_baris` — langit-langit
      // di atas menjamin tier-nya 0, 1, atau 2, jadi pemetaannya satu-satu.
      level = p.tier === 0 ? 'L1' : p.tier === 1 ? 'L2' : 'L2.1'
      parentKode = p.tier === 0 ? null : (leluhurBerkode(utama)[0]?.kode_rekening.trim() || null)
    }

    const peta = p.tujuan === 'KODE_BESAR' ? petaKb : petaMa
    const uraianLama = peta.get(kode)
    if (uraianLama !== undefined) {
      if (uraianLama === uraian) {
        sudahAda++
        continue
      }
      kandidat.push({
        kode, uraian, tujuan: p.tujuan, level, parentKode,
        status: 'BEDA_URAIAN', uraianLama, yakin, catatan, pakai: g.baris.length,
      })
      continue
    }

    kandidat.push({
      kode, uraian, tujuan: p.tujuan, level, parentKode,
      status: 'BARU', uraianLama: null, yakin, catatan, pakai: g.baris.length,
    })
  }

  // Induk yang ikut ditahan (uraiannya kosong, kodenya kelewat panjang) membuat
  // anaknya jadi baris hantu: tersimpan di tabel, tapi dilewati
  // `buildDpaRowsFromKodeBesar` sehingga tidak pernah muncul di "Form Baru".
  const saring = saringIndukKodeBesar(kandidat, ada.kodeBesar)
  for (const y of saring.yatim) {
    ditahan.push({ kode: y.kode, uraian: y.uraian, alasan: `induk "${y.parentKode}" tidak ikut tersalin` })
  }
  const kandidatSah = saring.kirim

  const contohGaris = (() => {
    if (garisRekening == null) return null
    for (const kode of urutKode) {
      const g = grup.get(kode)!
      if (putusan.get(g.baris[0].row_id)?.tujuan !== 'MASTER_AKUN') continue
      if (normalKode(kode).length !== garisRekening) continue
      const uraian = (g.baris[0].uraian ?? '').trim()
      if (uraian) return { kode, uraian }
    }
    return null
  })()

  const kodeDpa = new Set(urutKode)
  const kodeBesarTakTerpakai = ada.kodeBesar
    .map(k => k.kode.trim())
    .filter(k => k && !kodeDpa.has(k))

  return { kandidat: kandidatSah, ditahan, garisRekening, contohGaris, kodeBesarTakTerpakai, sudahAda }
}

/**
 * Buang kandidat Kode Besar yang induknya tidak ada di daftar kirim maupun di tabel.
 *
 * Dipakai dua kali dan itu sengaja: sekali oleh `pindaiBarisDpa` (induk yang ditahan)
 * dan sekali oleh modal tepat sebelum menulis (induk yang centangnya dilepas orang).
 * Kalau hanya salah satunya yang memeriksa, jalur yang lain menulis baris hantu.
 */
export function saringIndukKodeBesar(
  terpilih: KandidatSalin[],
  adaKodeBesar: IndukAda[],
): { kirim: KandidatSalin[]; yatim: KandidatSalin[] } {
  const tetap = new Set<string>(adaKodeBesar.map(k => k.kode.trim()).filter(Boolean))
  let kirim = [...terpilih]
  const yatim: KandidatSalin[] = []

  // Diulang sampai tidak ada yang gugur lagi: membuang satu induk membuat anaknya
  // ikut yatim, dan satu putaran saja menyisakan cucu yang menunjuk baris terbuang.
  for (;;) {
    const punya = new Set(tetap)
    for (const k of kirim) if (k.tujuan === 'KODE_BESAR') punya.add(k.kode)
    const lolos = kirim.filter(k => !(k.tujuan === 'KODE_BESAR' && k.parentKode && !punya.has(k.parentKode)))
    if (lolos.length === kirim.length) break
    for (const k of kirim) if (!lolos.includes(k)) yatim.push(k)
    kirim = lolos
  }
  return { kirim, yatim }
}

/**
 * Gabungkan kandidat terpilih ke daftar induk yang sudah ada.
 *
 * BUKAN sekadar `concat`: baris yang uraiannya berubah diperbarui DI TEMPAT supaya
 * urutan lama tidak bergeser, dan yang baru ditempel di ekor. Dipisah dari modal
 * karena inilah bagian yang paling mahal kalau salah — endpoint induk itu
 * replace-all, jadi apa pun yang hilang dari daftar ini ikut terhapus dari tabel.
 */
export function gabungInduk<T extends IndukAda>(
  adaSekarang: T[],
  terpilih: KandidatSalin[],
  buatBaru: (k: KandidatSalin) => T,
): T[] {
  const perbarui = new Map<string, string>()
  const baru: KandidatSalin[] = []
  for (const k of terpilih) {
    if (k.status === 'BEDA_URAIAN') perbarui.set(k.kode, k.uraian)
    else baru.push(k)
  }
  const hasil: T[] = adaSekarang.map(r => {
    const uraianBaru = perbarui.get(r.kode.trim())
    return uraianBaru ? { ...r, uraian: uraianBaru } : r
  })
  for (const k of baru) hasil.push(buatBaru(k))
  return hasil
}
