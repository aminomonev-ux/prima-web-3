// lib/blud/import-rapikan.ts — merapikan hierarki hasil baca impor DPA, dan
// menunjuk baris mana yang MELAHIRKAN selisih.
//
// ── Kenapa ada ────────────────────────────────────────────────────────────────
//
// Panel impor dulu menandai setiap baris yang angkanya tidak cocok — 54 baris
// pada formulir Juli 2026. Sebagian besarnya tidak bersalah: selisih MENULAR ke
// atas, jadi satu baris yang meleset 15 juta membuat induk, kakek, dan akarnya
// ikut "meleset 15 juta". Orang harus mencarinya sendiri satu per satu.
//
// Dan lebih buruk: berkas Juli itu ternyata TIDAK salah. Rumusnya berbunyi
//
//     b.158  =SUM(P159:P161)+P163   374.000.000
//     b.159  =M159*O159              15.000.000   ← perkalian: ini baris TERBAWAH
//     b.160  =M160*O160              10.000.000
//     b.161  =M161*O161               7.000.000
//     b.163  =SUM(P164:P173)         342.000.000
//
// 15 + 10 + 7 + 342 = 374, cocok persis. Yang keliru adalah pembacaan kita:
// b.160 & b.161 ditempelkan sebagai ANAK b.159 (lewat penambatan posisi, karena
// keduanya tidak berkode), padahal rumus b.158 menyebut ketiganya sebagai anak
// b.158. Begitu b.159 punya anak, aturan "induk = Σ anak" MEMBUANG vol × harga
// miliknya sendiri — dan 15 juta itulah yang hilang.
//
// ── Aturan yang dipakai ───────────────────────────────────────────────────────
//
// 1. Baris yang rumusnya perkalian TIDAK BOLEH punya anak. Anak yang terlanjur
//    menempel dinaikkan ke induknya.
// 2. Baris terbawah yang membawa angka tapi vol/harga-nya kosong diberi
//    vol = 1, harga = angka itu. Tidak mengarang apa pun — memakai satu-satunya
//    angka yang ada di baris tersebut.
//
// ── Yang membuatnya aman: perbaikan HARUS membuktikan dirinya ────────────────
//
// Rumus di berkas nyata bisa hilang, rusak (#REF!), atau menunjuk baris yang
// salah. Karena itu aturan 1 tidak pernah diterapkan hanya karena rumusnya
// bilang begitu. Tiap pemindahan DICOBA dulu, lalu dihitung: apakah residu di
// baris itu dan induknya jadi lebih kecil? Kalau tidak, pemindahannya
// DIBATALKAN. Rumus cuma usulan; yang memutuskan tetap aritmetika.
//
// Konsekuensinya, kalau `jumlahFile` di salah satu pihak kosong (rumus tidak
// menyimpan hasil), pemindahan tidak bisa dinilai — jadi tidak dilakukan, dan
// baris itu dilaporkan apa adanya.
//
// ── Residu: selisih yang LAHIR di sini, bukan yang diwarisi ──────────────────
//
//   induk   : angka tertulis  −  Σ angka tertulis anak-anaknya
//   terbawah: angka tertulis  −  vol × harga di baris yang sama
//
// Nol berarti baris ini tidak bersalah. Jumlah seluruh residu = selisih di akar,
// jadi laporannya lengkap: tidak ada penyebab yang tersembunyi.
//
// Dan satu hal yang total akar TIDAK bisa lakukan: residu melihat kesalahan yang
// SALING MENGHAPUS. Pada `DPA BLUD 2026 F.xlsx` selisih akarnya nol, tapi di
// dalamnya ada ±80 juta yang menutupi satu sama lain — "cocok persis" di akar
// bukan berarti susunannya benar.

/** Bentuk minimum yang dibutuhkan; sengaja struktural supaya bisa diuji lepas. */
export interface SimpulImpor {
  barisExcel: number
  /** Angka yang tertulis di berkas; null kalau rumusnya tak menyimpan hasil. */
  jumlahFile: number | null
  vol: number | null
  harga: number | null
  /** Rumus kolom Jumlah baris ini berbentuk perkalian (vol × harga). */
  rumusPerkalian: boolean
}

export interface PerbaikanImpor {
  barisExcel: number
  jenis: 'PINDAH_ANAK' | 'ISI_VOL_HARGA' | 'SAMBUNG_RANTAI'
  keterangan: string
}

export interface SumberSelisih {
  barisExcel: number
  /** > 0 berarti angka tertulis lebih besar dari yang didukung isinya. */
  residu: number
  jenis: 'INDUK' | 'TERBAWAH'
  jumlahAnak: number
}

/** Toleransi pembulatan rupiah — di bawah ini dianggap cocok. */
export const EPS_RAPIKAN = 0.5

function petaAnak(induk: readonly (number | null)[]): Map<number, number[]> {
  const m = new Map<number, number[]>()
  induk.forEach((p, i) => {
    if (p == null) return
    const d = m.get(p)
    if (d) d.push(i)
    else m.set(p, [i])
  })
  return m
}

/**
 * Residu satu simpul. `null` = tidak bisa dinilai — angka yang dibutuhkan tidak
 * tersimpan di berkas. Sengaja `null`, bukan 0: menganggapnya nol akan membuat
 * baris bermasalah tampak bersih, dan itu jenis kebohongan yang paling mahal.
 */
export function residuSimpul(
  simpul: readonly SimpulImpor[],
  induk: readonly (number | null)[],
  i: number,
  anak: Map<number, number[]> = petaAnak(induk),
): number | null {
  const s = simpul[i]
  if (s == null || s.jumlahFile == null) return null
  const kids = anak.get(i) ?? []
  if (kids.length === 0) return s.jumlahFile - (s.vol ?? 0) * (s.harga ?? 0)
  let total = 0
  for (const k of kids) {
    const v = simpul[k].jumlahFile
    if (v == null) return null
    total += v
  }
  return s.jumlahFile - total
}

const nilaiMutlak = (v: number | null) => (v == null ? Infinity : Math.abs(v))

/**
 * Aturan 1 — baris berumus perkalian tidak boleh punya anak.
 *
 * Diulang beberapa putaran karena satu pemindahan bisa membuka pemindahan
 * berikutnya (anak yang naik bisa mendarat di baris berumus perkalian juga).
 */
export function rapikanHierarki(
  simpul: readonly SimpulImpor[],
  indukAwal: readonly (number | null)[],
): { induk: (number | null)[]; perbaikan: PerbaikanImpor[] } {
  const induk = [...indukAwal]
  const perbaikan: PerbaikanImpor[] = []

  for (let putaran = 0; putaran < 6; putaran++) {
    const anak = petaAnak(induk)
    let berubah = false

    for (const [p, kids] of anak) {
      const s = simpul[p]
      if (!s?.rumusPerkalian || kids.length === 0) continue
      const kakek = induk[p]
      // Menaikkan anak ke `null` akan melahirkan akar kedua — pohon DPA hanya
      // boleh punya satu. Lebih baik dibiarkan dan dilaporkan.
      if (kakek == null) continue

      const sebelum = nilaiMutlak(residuSimpul(simpul, induk, p, anak))
        + nilaiMutlak(residuSimpul(simpul, induk, kakek, anak))
      if (!Number.isFinite(sebelum)) continue   // ada yang tidak bisa dinilai

      const coba = [...induk]
      for (const k of kids) coba[k] = kakek
      const anakCoba = petaAnak(coba)
      const sesudah = nilaiMutlak(residuSimpul(simpul, coba, p, anakCoba))
        + nilaiMutlak(residuSimpul(simpul, coba, kakek, anakCoba))

      // Harus benar-benar membaik. Rumus yang berbohong gagal di sini dan
      // pemindahannya batal — itu seluruh pengamannya.
      if (!(sesudah < sebelum - EPS_RAPIKAN)) continue

      for (const k of kids) induk[k] = kakek
      perbaikan.push({
        barisExcel: s.barisExcel,
        jenis: 'PINDAH_ANAK',
        keterangan: `Rumusnya perkalian (vol × harga), jadi baris ini yang terbawah — `
          + `${kids.length} baris di bawahnya dinaikkan ke b.${simpul[kakek].barisExcel}. `
          + `Angka baris ini sendiri jadi ikut terhitung.`,
      })
      berubah = true
      break   // peta anak sudah basi; susun ulang di putaran berikutnya
    }

    if (!berubah) break
  }

  return { induk, perbaikan }
}

/** Nilai hasil hitung bawah-ke-atas: terbawah = vol × harga, induk = Σ anak. */
function hitungBottomUp(
  simpul: readonly SimpulImpor[],
  induk: readonly (number | null)[],
  vol: readonly (number | null)[],
  harga: readonly (number | null)[],
): number[] {
  const anak = petaAnak(induk)
  const nilai = new Array<number>(simpul.length).fill(0)
  const selesai = new Array<boolean>(simpul.length).fill(false)
  const hitung = (i: number, jaga = 0): number => {
    if (selesai[i]) return nilai[i]
    if (jaga > 40) return 0
    const kids = anak.get(i) ?? []
    nilai[i] = kids.length
      ? kids.reduce((s, k) => s + hitung(k, jaga + 1), 0)
      : (vol[i] ?? 0) * (harga[i] ?? 0)
    selesai[i] = true
    return nilai[i]
  }
  simpul.forEach((_, i) => hitung(i))
  return nilai
}

/**
 * Aturan 2 — baris terbawah yang membawa angka tapi tanpa vol × harga.
 *
 * `vol = 1, harga = angkanya` mempertahankan rupiahnya persis. Tidak ada yang
 * dikarang: itu satu-satunya angka yang ada di baris tersebut, dan tanpa ini
 * angkanya dihitung nol lalu lenyap dari total tanpa sepatah kata pun.
 *
 * ── Kenapa ini WAJIB diuji dulu, dan tidak boleh diterapkan begitu saja ──────
 *
 * Percobaan pada `DPA BLUD 2024.1.xlsx` membuktikannya: b.434 "BELANJA MODAL
 * PERALATAN DAN MESIN" Rp 1,12 miliar adalah baris INDUK di berkas, tapi di
 * pohon hasil baca ia jadi daun (anak-anaknya menempel di tempat lain). Mengisi
 * vol × harga di situ membuat uangnya terhitung DUA KALI, dan selisih berkas
 * melonjak dari 60 juta jadi −1,06 miliar. Persis kerusakan senyap yang fitur
 * ini ada untuk mencegahnya.
 *
 * Karena itu tiap pengisian diuji terhadap INDUKNYA: apakah angka hasil hitung
 * induk jadi lebih dekat ke angka yang tertulis di induk? Kalau tidak,
 * pengisiannya dibatalkan. Residu tidak bisa dipakai di sini — residu mengukur
 * "berkas cocok dengan dirinya sendiri", sedangkan aturan ini mengubah "apa yang
 * kita hitung"; dua sumbu yang berbeda.
 *
 * Baris berangka NOL sengaja dilewati — itu baris judul/struktur, bukan uang.
 */
export function normalkanDaunTanpaPerkalian(
  simpul: readonly SimpulImpor[],
  induk: readonly (number | null)[],
): { vol: (number | null)[]; harga: (number | null)[]; perbaikan: PerbaikanImpor[] } {
  const anak = petaAnak(induk)
  const vol = simpul.map(s => s.vol)
  const harga = simpul.map(s => s.harga)
  const perbaikan: PerbaikanImpor[] = []
  const nilai = hitungBottomUp(simpul, induk, vol, harga)

  simpul.forEach((s, i) => {
    if ((anak.get(i) ?? []).length > 0) return
    if (s.jumlahFile == null || s.jumlahFile === 0) return
    if ((s.vol ?? 0) * (s.harga ?? 0) !== 0) return

    const g = induk[i]
    if (g == null) return
    const targetInduk = simpul[g].jumlahFile
    if (targetInduk == null) return          // tidak bisa dinilai → jangan sentuh

    // Nilai induk saat ini = Σ anak-anaknya, termasuk pengisian yang sudah
    // diterima pada putaran sebelumnya (`nilai` diperbarui di bawah).
    const sekarang = (anak.get(g) ?? []).reduce((t, k) => t + nilai[k], 0)
    const sebelum = Math.abs(targetInduk - sekarang)
    const sesudah = Math.abs(targetInduk - (sekarang + s.jumlahFile))
    if (!(sesudah < sebelum - EPS_RAPIKAN)) return

    vol[i] = 1
    harga[i] = s.jumlahFile
    nilai[i] = s.jumlahFile
    perbaikan.push({
      barisExcel: s.barisExcel,
      jenis: 'ISI_VOL_HARGA',
      keterangan: `Angkanya ada di berkas tapi volume dan harganya kosong — diisi `
        + `1 × ${s.jumlahFile.toLocaleString('id-ID')} supaya nilainya tidak hilang. `
        + `Sesudah diisi, angka induknya jadi cocok.`,
    })
  })

  return { vol, harga, perbaikan }
}

/**
 * Baris yang MELAHIRKAN selisih, terbesar dulu. Yang cuma mewarisi tidak ikut —
 * itulah bedanya dengan daftar lama yang panjangnya 54 baris.
 */
export function sumberSelisih(
  simpul: readonly SimpulImpor[],
  induk: readonly (number | null)[],
): SumberSelisih[] {
  const anak = petaAnak(induk)
  const hasil: SumberSelisih[] = []
  simpul.forEach((s, i) => {
    const r = residuSimpul(simpul, induk, i, anak)
    if (r == null || Math.abs(r) < EPS_RAPIKAN) return
    const kids = (anak.get(i) ?? []).length
    hasil.push({
      barisExcel: s.barisExcel,
      residu: r,
      jenis: kids > 0 ? 'INDUK' : 'TERBAWAH',
      jumlahAnak: kids,
    })
  })
  return hasil.sort((a, b) => Math.abs(b.residu) - Math.abs(a.residu))
}

// ─── Aturan 3–5: salah rumus yang lazim di formulir tangan ───────────────────
// Konsep: docs/konsep/blud/CONCEPT-blud-impor-formulir-baru.md §3. Sama seperti
// aturan 1: rumus cuma usulan, aritmetika yang memutuskan.

/** Segmen kode yang bisa dibandingkan: "5.2.06" dan "5.2.6" sama. */
export function segmenKodeNormal(kode: string): string[] {
  return kode.split('.').map(s => s.trim()).filter(Boolean)
    .map(s => (/^\d+$/.test(s) ? String(Number(s)) : s.toLowerCase()))
}

/** `a` awalan sejati `b` (lebih pendek, semua segmennya sama). */
export function awalanKode(a: readonly string[], b: readonly string[]): boolean {
  return a.length > 0 && a.length < b.length && a.every((s, i) => s === b[i])
}

/**
 * Induk cadangan dari AWALAN kode untuk berkas berkode satu kolom — di bentuk itu
 * "posisi kolom" tidak membawa informasi apa pun (semua baris berkode sedalam 1).
 * Dipilih baris di atasnya yang kodenya awalan TERPANJANG; seri → yang terdekat.
 * Baris tanpa kode memulangkan null (penambatan posisi yang menanganinya).
 */
export function indukDariAwalanKode(kode: readonly string[]): (number | null)[] {
  const seg = kode.map(segmenKodeNormal)
  return seg.map((s, i) => {
    if (!s.length) return null
    let pilih: number | null = null
    for (let j = i - 1; j >= 0; j--) {
      if (!awalanKode(seg[j], s)) continue
      if (pilih == null || seg[j].length > seg[pilih].length) pilih = j
    }
    return pilih
  })
}

/**
 * Aturan 3 (K1) — rumus induk melompati anak dan menunjuk cucunya.
 *
 *     b.398  BELANJA MODAL               =F399+F517+F525   ← menunjuk 525
 *     b.524  Belanja Modal Aset Lainnya  =SUM(F525:F525)
 *
 * b.525 diklaim dua baris; yang terdekat (b.524) menang, lalu b.524 sendiri tidak
 * disebut rumus mana pun dan jadi akar palsu (L1). Di sini puncak rantai b.525
 * (= b.524) dipasang di bawah pengklaim yang jauh (b.398) — HANYA kalau sesudahnya
 * angka tertulis b.398 sama persis dengan jumlah anak barunya. Lompatan beberapa
 * tingkat ikut tertangani karena yang dipasang selalu PUNCAK rantainya.
 *
 * `pengklaim` = indeks anak → indeks baris yang rumusnya menyebutnya.
 * Memulangkan induk-rumus baru + `sambung` (puncak → induk barunya).
 */
export function sambungRantaiTerlompati(
  simpul: readonly SimpulImpor[],
  pengklaim: ReadonlyMap<number, readonly number[]>,
  indukRumusAwal: readonly (number | null)[],
  uraian: readonly string[] = [],
): { indukRumus: (number | null)[]; sambung: Map<number, number>; perbaikan: PerbaikanImpor[] } {
  const indukRumus = [...indukRumusAwal]
  const sambung = new Map<number, number>()
  const perbaikan: PerbaikanImpor[] = []
  const puncak = (i: number): number => {
    let t = i
    let jaga = 0
    while (indukRumus[t] != null && jaga++ < 64) t = indukRumus[t] as number
    return t
  }
  const leluhur = (calon: number, dari: number): boolean => {
    let p = indukRumus[dari]
    let jaga = 0
    while (p != null && jaga++ < 64) {
      if (p === calon) return true
      p = indukRumus[p]
    }
    return false
  }
  const label = (i: number) => (uraian[i] ? ` "${uraian[i]}"` : '')

  const urut = [...pengklaim.keys()].sort((a, b) => a - b)
  for (const d of urut) {
    const daftar = pengklaim.get(d) ?? []
    if (daftar.length < 2) continue
    for (const p of [...daftar].sort((a, b) => a - b)) {
      if (p === indukRumus[d]) continue
      const t = puncak(d)
      if (t === p || leluhur(p, d)) continue            // sudah serantai
      if (pengklaim.has(t)) continue                     // puncaknya disebut rumus lain
      if (!(p < t) || leluhur(t, p)) continue            // jangan sampai melingkar
      const fileP = simpul[p]?.jumlahFile
      const fileT = simpul[t]?.jumlahFile
      if (fileP == null || fileT == null) continue       // tak bisa dibuktikan
      let jumlahAnak = 0
      let terbaca = true
      indukRumus.forEach((q, k) => {
        if (q !== p) return
        const v = simpul[k].jumlahFile
        if (v == null) terbaca = false
        else jumlahAnak += v
      })
      if (!terbaca) continue
      if (Math.abs(fileP - (jumlahAnak + fileT)) >= EPS_RAPIKAN) continue

      indukRumus[t] = p
      sambung.set(t, p)
      perbaikan.push({
        barisExcel: simpul[t].barisExcel,
        jenis: 'SAMBUNG_RANTAI',
        keterangan: `Dipindah ke bawah b.${simpul[p].barisExcel}${label(p)}. Rumus b.${simpul[p].barisExcel} `
          + `menyebut b.${simpul[d].barisExcel} (bagian dari baris ini), bukan baris ini — sesudah dipindah `
          + `angkanya cocok persis (Rp ${fileP.toLocaleString('id-ID')}).`,
      })
    }
  }
  return { indukRumus, sambung, perbaikan }
}

/**
 * Aturan 4 (K4) — baris yang tetap dijumlah DUA kali sesudah pohonnya final: dua
 * rumus menyebutnya, dan yang satu tidak terselesaikan aturan 3. Excel menghitung
 * uang yang sama dua kali; PRIMA menghitungnya sekali. Klaim yang lewat baris hasil
 * sambungan (aturan 3) bukan dobel — sambungan itulah pembetulannya.
 *
 * Hanya pengklaim yang memang TERHITUNG di total Excel yang dinilai: rantai rumusnya
 * (`indukRumus`) berujung di akar pohon. Pengklaim yatim di Excel (ditempel lewat
 * awalan kode/posisi) tidak menggandakan apa pun di Excel — tanpa saringan ini,
 * pembuktian aturan 3 yang gagal ikut dilaporkan sebagai "dijumlah dua kali".
 */
export function klaimGanda(
  pengklaim: ReadonlyMap<number, readonly number[]>,
  induk: readonly (number | null)[],
  indukRumus: readonly (number | null)[],
  sambung: ReadonlyMap<number, number>,
): Array<{ anak: number; pengklaim: number[] }> {
  const dihitungExcel = (c: number): boolean => {
    let t = c
    let jaga = 0
    while (indukRumus[t] != null && jaga++ < 64) t = indukRumus[t] as number
    return induk[t] == null
  }
  const hasil: Array<{ anak: number; pengklaim: number[] }> = []
  for (const [d, semua] of pengklaim) {
    const daftar = semua.filter(dihitungExcel)
    if (daftar.length < 2) continue
    const dobel = daftar.filter(p => {
      if (p === induk[d]) return false
      // Lewat sambungan aturan 3? Naik dari d sampai p; kalau anak langsung p di
      // jalur itu adalah baris sambungan milik p, klaimnya sudah dibetulkan.
      let anakJalur = d
      let q = induk[d]
      let jaga = 0
      while (q != null && q !== p && jaga++ < 64) { anakJalur = q; q = induk[q] }
      return !(q === p && sambung.get(anakJalur) === p)
    })
    if (dobel.length) hasil.push({ anak: d, pengklaim: [induk[d], ...dobel].filter((x): x is number => x != null) })
  }
  return hasil.sort((a, b) => a.anak - b.anak)
}