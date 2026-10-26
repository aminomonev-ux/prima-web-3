// lib/bba/kib.ts — definisi kolom KIB A–F persis templat ekspor sistem aset provinsi.
// Konsep: docs/CONCEPT-bba-buku-aset.md §5.2, §15. MURNI (tanpa impor) — dipakai pembaca impor,
// kartu aset, Zod, DAN Excel. Kalau provinsi mengubah templatnya, yang disunting berkas ini saja.
//
// Sumber: lembar KIBA…KIBF berkas ekspor provinsi (Rekap Aset 2025). Teks kepala ditulis apa
// adanya, termasuk salah ketiknya ("Nilai Kotrak", "Ukuran/ CC") — pembaca mencocokkan teks itu.

export const GOLONGAN = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export type Golongan = typeof GOLONGAN[number]

export const NAMA_GOLONGAN: Record<Golongan, string> = {
  A: 'Tanah', B: 'Peralatan & Mesin', C: 'Gedung & Bangunan', D: 'Jalan, Irigasi & Jaringan',
  E: 'Aset Tetap Lainnya', F: 'Konstruksi Dalam Pengerjaan',
}

/** Judul baris 2 lembar provinsi. */
export const JUDUL_KIB: Record<Golongan, string> = {
  A: 'KARTU INVENTARIS BARANG (KIB) A. TANAH',
  B: 'KARTU INVENTARIS BARANG (KIB) B. PERALATAN DAN MESIN',
  C: 'KARTU INVENTARIS BARANG (KIB) C. GEDUNG DAN BANGUNAN',
  D: 'KARTU INVENTARIS BARANG (KIB) D. JALAN, IRIGASI DAN JARINGAN',
  E: 'KARTU INVENTARIS BARANG (KIB) E. ASET TETAP LAINNYA',
  F: 'KARTU INVENTARIS BARANG (KIB) F. KONTRUKSI DALAM PENGERJAAN',
}

/**
 * Kolom yang tinggal di kolom `bba_aset` sendiri (disaring/dijumlah), bukan di JSON `kib`.
 * `no` = nomor urut cetak, tidak disimpan.
 */
export const KOLOM_POKOK = ['no', 'nama_resmi', 'kode_barang', 'register', 'kondisi', 'asal_usul', 'harga', 'keterangan'] as const
export type KolomPokok = typeof KOLOM_POKOK[number]

export type TipeKolom = 'teks' | 'angka' | 'uang' | 'tanggal' | 'register'

export interface KolomKib {
  kunci: string
  /** Teks kepala baris 10, 11, 12 templat. Sel gabungan = teks yang sama berulang. */
  kepala: readonly [string, string, string]
  tipe: TipeKolom
  /** Lebar kolom templat; 0 = disembunyikan di templat (ditiru apa adanya). */
  lebar: number
  /** Label pendek di kartu aset. */
  label: string
}

type Def = [kunci: string, r10: string, r11: string, r12: string, tipe: TipeKolom, lebar: number, label: string]

const kol = (d: Def): KolomKib => ({ kunci: d[0], kepala: [d[1], d[2], d[3]], tipe: d[4], lebar: d[5], label: d[6] })
const sama = (k: string, t: string, tipe: TipeKolom, lebar: number, label = t): KolomKib => kol([k, t, t, t, tipe, lebar, label])

const NO = (lebar: number) => sama('no', 'No.', 'angka', lebar)
const NAMA = (lebar: number) => sama('nama_resmi', 'Jenis Barang/Nama Barang', 'teks', lebar, 'Nama resmi')

export const KOLOM_KIB: Record<Golongan, readonly KolomKib[]> = {
  A: [
    NO(5), NAMA(27),
    kol(['kode_barang', 'Nomor', 'Nomor', 'Kode Barang', 'teks', 18, 'Kode barang']),
    kol(['register', 'Nomor', 'Nomor', 'Reg.', 'register', 7, 'Register']),
    sama('luas', 'Luas (M2)', 'angka', 0, 'Luas (m²)'),
    sama('tahun_pengadaan', 'Tahun Pengadaan', 'teks', 8),
    sama('letak', 'Letak/ alamat', 'teks', 29, 'Letak/alamat'),
    kol(['hak', 'Status Tanah', 'Hak', 'Hak', 'teks', 15, 'Hak']),
    kol(['sertifikat_tgl', 'Status Tanah', 'Sertifikat', 'Tanggal', 'tanggal', 10, 'Sertifikat — tanggal']),
    kol(['sertifikat_no', 'Status Tanah', 'Sertifikat', 'Nomor', 'teks', 15, 'Sertifikat — nomor']),
    sama('penggunaan', 'Penggunaan', 'teks', 15),
    sama('asal_usul', 'Asal Usul', 'teks', 12),
    sama('harga', 'Harga', 'uang', 13),
    sama('keterangan', 'Keterangan', 'teks', 17),
  ],
  B: [
    NO(5),
    sama('kode_barang', 'Kode Barang', 'teks', 25),
    NAMA(25),
    sama('register', 'Reg.', 'register', 7, 'Register'),
    sama('merk_type', 'Merk type', 'teks', 11, 'Merk/type'),
    sama('ukuran_cc', 'Ukuran/ CC', 'teks', 8, 'Ukuran/CC'),
    sama('bahan', 'Bahan', 'teks', 15),
    sama('warna', 'Warna', 'teks', 12),
    sama('tahun_pembelian', 'Tahun Pembelian', 'teks', 8),
    kol(['no_pabrik', 'Nomor', 'Nomor', 'Pabrik', 'teks', 17, 'Nomor pabrik']),
    kol(['no_rangka', 'Nomor', 'Nomor', 'Rangka', 'teks', 17, 'Nomor rangka']),
    kol(['no_mesin', 'Nomor', 'Nomor', 'Mesin', 'teks', 17, 'Nomor mesin']),
    kol(['no_polisi', 'Nomor', 'Nomor', 'Polisi', 'teks', 11, 'Nomor polisi']),
    kol(['no_bpkb', 'Nomor', 'Nomor', 'BPKB', 'teks', 17, 'Nomor BPKB']),
    sama('asal_usul', 'Asal Usul', 'teks', 13),
    sama('harga', 'Harga', 'uang', 18),
    sama('keterangan', 'Keterangan', 'teks', 18),
  ],
  C: [
    NO(5), NAMA(25),
    kol(['kode_barang', 'Nomor', 'Nomor', 'Kode Barang', 'teks', 19, 'Kode barang']),
    kol(['register', 'Nomor', 'Nomor', 'Register', 'register', 7, 'Register']),
    sama('kondisi', 'Kondisi Bangunan', 'teks', 11, 'Kondisi'),
    kol(['bertingkat', 'Konstruksi Bangunan', 'Konstruksi Bangunan', 'Bertingkat/Tidak', 'teks', 10, 'Bertingkat']),
    kol(['beton', 'Konstruksi Bangunan', 'Konstruksi Bangunan', 'Beton/  Tidak', 'teks', 9, 'Beton']),
    sama('luas_bangunan', 'Luas Bangunan (m2)', 'angka', 8, 'Luas bangunan (m²)'),
    sama('letak', 'Letak/Lokasi Alamat', 'teks', 15, 'Letak/alamat'),
    kol(['dok_tgl', 'Dokumen Gedung', 'Dokumen Gedung', 'Tanggal', 'tanggal', 10, 'Dokumen gedung — tanggal']),
    kol(['dok_no', 'Dokumen Gedung', 'Dokumen Gedung', 'Nomor', 'teks', 15, 'Dokumen gedung — nomor']),
    sama('luas_tanah', 'Luas Tanah Bangunan (m2)', 'angka', 9, 'Luas tanah bangunan (m²)'),
    sama('status_tanah', 'Status Tanah', 'teks', 12),
    sama('nomor_kode_tanah', 'Nomor Kode Tanah', 'teks', 21),
    sama('asal_usul', 'Asal Usul', 'teks', 12),
    sama('harga', 'Harga', 'uang', 18),
    sama('keterangan', 'Keterangan', 'teks', 18),
  ],
  D: [
    NO(4), NAMA(26),
    kol(['kode_barang', 'Nomor', 'Nomor', 'Kode Barang', 'teks', 20, 'Kode barang']),
    kol(['register', 'Nomor', 'Nomor', 'Register', 'register', 9, 'Register']),
    sama('konstruksi', 'Konstruksi', 'teks', 11),
    sama('panjang', 'Panjang (m2)', 'angka', 8, 'Panjang'),
    sama('lebar', 'Lebar (m2)', 'angka', 8, 'Lebar'),
    sama('luas', 'Luas (m2)', 'angka', 10, 'Luas (m²)'),
    sama('letak', 'Letak/Lokasi Alamat', 'teks', 21, 'Letak/alamat'),
    kol(['dok_tgl', 'Dokumen Gedung', 'Dokumen Gedung', 'Tanggal', 'tanggal', 10, 'Dokumen — tanggal']),
    kol(['dok_no', 'Dokumen Gedung', 'Dokumen Gedung', 'Nomor', 'teks', 17, 'Dokumen — nomor']),
    sama('status_tanah', 'Status Tanah', 'teks', 10),
    sama('nomor_kode_tanah', 'Nomor Kode Tanah', 'teks', 22),
    sama('asal_usul', 'Asal-usul', 'teks', 12, 'Asal usul'),
    sama('harga', 'Harga', 'uang', 17),
    sama('kondisi', 'Kondisi', 'teks', 11),
    sama('keterangan', 'Keterangan', 'teks', 15),
  ],
  E: [
    NO(5), NAMA(25),
    sama('kode_barang', 'Kode Barang', 'teks', 19),
    sama('register', 'Register', 'register', 8),
    sama('judul_pencipta', 'Judul/Pencipta', 'teks', 14),
    sama('spesifikasi', 'Spesifikasi', 'teks', 14),
    sama('asal_daerah', 'Asal Daerah', 'teks', 13),
    sama('pencipta', 'Pencipta', 'teks', 13),
    sama('bahan', 'Bahan', 'teks', 13),
    sama('jenis', 'Jenis', 'teks', 15),
    sama('ukuran', 'Ukuran', 'teks', 17),
    sama('jumlah', 'Jumlah', 'angka', 0),
    sama('tahun_cetak', 'Tahun Cetak/Pembelian', 'teks', 0, 'Tahun cetak/pembelian'),
    sama('asal_usul', 'Asal-usul', 'teks', 12, 'Asal usul'),
    sama('harga', 'Harga', 'uang', 17),
    sama('keterangan', 'Keterangan', 'teks', 15),
  ],
  F: [
    NO(5), NAMA(25),
    sama('kondisi', 'Kondisi Bangunan', 'teks', 11, 'Kondisi'),
    kol(['bertingkat', 'Konstruksi Bangunan', 'Konstruksi Bangunan', 'Bertingkat/Tidak', 'teks', 10, 'Bertingkat']),
    kol(['beton', 'Konstruksi Bangunan', 'Konstruksi Bangunan', 'Beton/  Tidak', 'teks', 9, 'Beton']),
    sama('luas_lantai', 'Luas Lantai (m2)', 'angka', 8, 'Luas lantai (m²)'),
    sama('letak', 'Letak/Lokasi Alamat', 'teks', 15, 'Letak/alamat'),
    kol(['dok_tgl', 'Dokumen Gedung', 'Dokumen Gedung', 'Tanggal', 'tanggal', 11, 'Dokumen gedung — tanggal']),
    kol(['dok_no', 'Dokumen Gedung', 'Dokumen Gedung', 'Nomor', 'teks', 15, 'Dokumen gedung — nomor']),
    sama('tgl_mulai', 'Tgl. Mulai Pekerjaan', 'tanggal', 10, 'Tanggal mulai pekerjaan'),
    sama('status_tanah', 'Status Tanah', 'teks', 13),
    sama('nomor_kode_tanah', 'Nomor Kode Tanah', 'teks', 20),
    sama('asal_usul', 'Asal Usul', 'teks', 13),
    sama('harga', 'Nilai Kotrak', 'uang', 18, 'Nilai kontrak'),
    sama('keterangan', 'Keterangan', 'teks', 18),
  ],
}

/** Baris nomor kolom (baris 13) apa adanya — KIB B memang menulis "8" dua kali. */
export const NOMOR_KOLOM: Record<Golongan, readonly string[]> = {
  A: urut(14), B: [...urut(8), '8', ...urut(16).slice(8)], C: urut(17), D: urut(17), E: urut(16), F: urut(15),
}
function urut(n: number): string[] { return Array.from({ length: n }, (_, i) => String(i + 1)) }

/** Kolom berisi isi KIB (bukan pokok) — kunci yang boleh ada di JSON `kib` golongan ini. */
export function kunciKib(g: Golongan): string[] {
  return KOLOM_KIB[g].filter(k => !(KOLOM_POKOK as readonly string[]).includes(k.kunci)).map(k => k.kunci)
}

/** KIB F tidak punya kode barang & register — dicocokkan lewat isinya. */
export function punyaRegister(g: Golongan): boolean {
  return KOLOM_KIB[g].some(k => k.kunci === 'register')
}

/** Golongan yang KIB-nya memuat kolom kondisi (B & E tidak; A tanah tidak berkondisi). */
export function kibPunyaKondisi(g: Golongan): boolean {
  return KOLOM_KIB[g].some(k => k.kunci === 'kondisi')
}

// ─── Sel gabungan kepala ─────────────────────────────────────────────────────

export interface Gabungan { r1: number; c1: number; r2: number; c2: number }

/**
 * Persegi gabungan kepala dari teks yang berulang — dengan aturan ini templat ketiga baris
 * kepala tiap golongan tersusun ulang persis (diperiksa uji terhadap daftar `gabung` lembar
 * provinsi). Indeks 0-based relatif terhadap kisi 3 × n.
 */
export function gabunganKepala(kisi: readonly (readonly string[])[]): Gabungan[] {
  const tinggi = kisi.length, lebar = kisi[0]?.length ?? 0
  const terpakai = kisi.map(r => r.map(() => false))
  const hasil: Gabungan[] = []
  for (let r = 0; r < tinggi; r++) {
    for (let c = 0; c < lebar; c++) {
      if (terpakai[r][c]) continue
      const t = kisi[r][c]
      let c2 = c
      while (c2 + 1 < lebar && !terpakai[r][c2 + 1] && kisi[r][c2 + 1] === t) c2++
      let r2 = r
      while (r2 + 1 < tinggi && Array.from({ length: c2 - c + 1 }, (_, i) => c + i).every(x => !terpakai[r2 + 1][x] && kisi[r2 + 1][x] === t)) r2++
      for (let y = r; y <= r2; y++) for (let x = c; x <= c2; x++) terpakai[y][x] = true
      if (r2 > r || c2 > c) hasil.push({ r1: r, c1: c, r2, c2 })
    }
  }
  return hasil
}

export function kisiKepala(g: Golongan): string[][] {
  return [0, 1, 2].map(i => KOLOM_KIB[g].map(k => k.kepala[i]))
}

// ─── Kode barang provinsi ────────────────────────────────────────────────────

/**
 * `11.01.33.74.010206.00000.00000.1984-1.3.3.01.01.02.001`
 *  = kode pemilik & lokasi · TAHUN PEROLEHAN · kode objek barang.
 * KIB C tidak punya kolom tahun, jadi tahun perolehan diambil dari sini (§4 temuan 2).
 */
export function uraiKodeBarang(kode: string | null | undefined): { tahun: number | null; kodeObjek: string | null } {
  const m = /\.(\d{4})-(\d+(?:\.\d+)*)\s*$/.exec((kode ?? '').trim())
  if (!m) return { tahun: null, kodeObjek: null }
  return { tahun: Number(m[1]), kodeObjek: m[2] }
}

/** Golongan menurut kode objek: 1.3.1 Tanah … 1.3.6 KDP. */
export function golonganDariKodeObjek(kodeObjek: string | null): Golongan | null {
  const m = /^1\.3\.([1-6])(?:\.|$)/.exec(kodeObjek ?? '')
  return m ? GOLONGAN[Number(m[1]) - 1] : null
}

/** "Nomor Kode Tanah" di KIB C/D/F = kode barang tanah + "." + registernya. */
export function kodeTanah(kodeBarang: string, register: string): string {
  return `${kodeBarang}.${register}`
}

// ─── Kondisi ─────────────────────────────────────────────────────────────────

export const KONDISI = ['B', 'RR', 'RB'] as const
export type Kondisi = typeof KONDISI[number]

export const LABEL_KONDISI: Record<Kondisi, string> = { B: 'Baik', RR: 'Rusak ringan', RB: 'Rusak berat' }
/** Cara KIB/KIR provinsi menuliskannya. */
export const TEKS_KONDISI_KIB: Record<Kondisi, string> = { B: 'BAIK', RR: 'RUSAK RINGAN', RB: 'RUSAK BERAT' }
/** Buku Inventaris memakai B / KB / R (§5.3). */
export const TEKS_KONDISI_BI: Record<Kondisi, string> = { B: 'B', RR: 'KB', RB: 'R' }

/** Teks kondisi dari Excel (BAIK, RUSAK RINGAN, KB, …) → kode, atau `null` bila tak dikenal/kosong. */
export function bacaKondisi(teks: unknown): Kondisi | null {
  const t = String(teks ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
  if (!t) return null
  if (t === 'B' || t === 'BAIK') return 'B'
  if (t === 'RR' || t === 'KB' || t === 'RUSAK RINGAN' || t === 'KURANG BAIK') return 'RR'
  if (t === 'RB' || t === 'R' || t === 'RUSAK BERAT' || t === 'RUSAK') return 'RB'
  return null
}
