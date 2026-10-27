// lib/bba/lembar.ts — lembar ekspor provinsi selain KIB: hasil sensus (*Inv), rekap sensus (RKPInv),
// KIR, Buku Inventaris (BI), Rekapitulasi BMD. MURNI. Teks kepala & lebar dari lembar templat yang ikut
// di setiap berkas ekspor sistem aset provinsi (Rekap Aset 2025); KIB-nya sendiri di `kib.ts`.
import {
  KOLOM_KIB, JUDUL_KIB, TEKS_KONDISI_KIB, TEKS_KONDISI_BI, GOLONGAN,
  type Golongan, type KolomKib, type TipeKolom, type Kondisi as KodeKondisi,
} from './kib'
import type { AsetRingan } from './aset'

const kol = (kunci: string, kepala: [string, string, string], tipe: TipeKolom, lebar: number, label = kepala[2]): KolomKib => ({ kunci, kepala, tipe, lebar, label })
const sama = (kunci: string, t: string, tipe: TipeKolom, lebar: number) => kol(kunci, [t, t, t], tipe, lebar)
const urut = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const sisipSebelumKeterangan = (k: readonly KolomKib[], baru: KolomKib) => {
  const i = k.findIndex(x => x.kunci === 'keterangan')
  return [...k.slice(0, i), baru, ...k.slice(i)]
}
const ubah = (k: readonly KolomKib[], kunci: string, p: Partial<KolomKib>) => k.map(x => x.kunci === kunci ? { ...x, ...p } : x)

// ─── Hasil sensus per golongan (lembar KIBAInv … KIBFInv) ────────────────────

const KONDISI_SENSUS = (lebar: number) => sama('kondisi_sensus', 'Kondisi', 'teks', lebar)
const grup = (k: readonly KolomKib[], kunci: string[], judul: string) =>
  k.map(x => kunci.includes(x.kunci) ? { ...x, kepala: [judul, judul, x.kepala[2]] as [string, string, string] } : x)

export const KOLOM_SENSUS: Record<Golongan, readonly KolomKib[]> = {
  A: sisipSebelumKeterangan(ubah(ubah(KOLOM_KIB.A, 'letak', { lebar: 27 }), 'hak', { lebar: 13 }), KONDISI_SENSUS(14)),
  B: sisipSebelumKeterangan(KOLOM_KIB.B, KONDISI_SENSUS(13)),
  C: sisipSebelumKeterangan(
    ubah(ubah(KOLOM_KIB.C, 'luas_bangunan', { kepala: ['Luas Lantai (m2)', 'Luas Lantai (m2)', 'Luas Lantai (m2)'] }),
      'luas_tanah', { kepala: ['Luas (m2)', 'Luas (m2)', 'Luas (m2)'] }),
    KONDISI_SENSUS(13)),
  D: KOLOM_KIB.D,
  // KIBEInv mengelompokkan Kode Barang + Register di bawah "Nomor" (KIB E tidak) — ketahuan dari kalibrasi templat.
  E: sisipSebelumKeterangan(
    grup(grup(grup(grup(KOLOM_KIB.E, ['kode_barang', 'register'], 'Nomor'), ['judul_pencipta', 'spesifikasi'], 'Buku Perpustakaan'),
      ['asal_daerah', 'pencipta', 'bahan'], 'Barang Bercorak Kesenian/Kebudayaan'),
      ['jenis', 'ukuran'], 'Hewan Ternak dan Tumbuhan'),
    KONDISI_SENSUS(14)),
  F: KOLOM_KIB.F,
}

export const NOMOR_SENSUS: Record<Golongan, readonly string[]> = {
  A: urut(15), B: [...urut(8), '8', ...urut(17).slice(8)], C: urut(18), D: urut(17), E: urut(17), F: urut(15),
}

export const JUDUL_SENSUS: Record<Golongan, string> = Object.fromEntries(
  GOLONGAN.map(g => [g, JUDUL_KIB[g].replace('KARTU INVENTARIS BARANG', 'HASIL SENSUS BARANG')]),
) as Record<Golongan, string>

/** Letak label "TAHUN" di kop baris 8 lembar sensus (kolom ke-, 1 = A) — beda per lembar di templat. */
export const KOLOM_TAHUN_SENSUS: Record<Golongan, number> = { A: 10, B: 12, C: 12, D: 11, E: 11, F: 10 }

// ─── Kartu Inventaris Ruangan ────────────────────────────────────────────────

export const KOLOM_KIR: readonly KolomKib[] = [
  sama('no', 'No.', 'angka', 5),
  sama('nama_resmi', 'Jenis Barang/Nama Barang', 'teks', 30),
  kol('kode_barang', ['Nomor', 'Nomor', 'Kode Barang'], 'teks', 21),
  kol('register', ['Nomor', 'Nomor', 'Register'], 'register', 6),
  sama('merk', 'Merk/Model', 'teks', 18),
  sama('no_seri', 'No. Seri Pabrik', 'teks', 18),
  sama('ukuran', 'Ukuran', 'teks', 18),
  sama('bahan', 'Bahan', 'teks', 18),
  sama('tahun', 'Tahun pembuatan', 'teks', 0),
  sama('jumlah', 'Jumlah', 'angka', 8),
  sama('harga', 'Harga', 'uang', 16),
  sama('keadaan', 'Keadaan (Baik/Rusak Ringan/Rusak Berat)', 'teks', 14),
  sama('keterangan', 'Keterangan', 'teks', 21),
]

// ─── Buku Inventaris BMD ─────────────────────────────────────────────────────

export const KOLOM_BI: readonly KolomKib[] = [
  kol('no', ['Nomor', 'No.', 'No.'], 'angka', 5),
  kol('kode_barang', ['Nomor', 'Kode Barang', 'Kode Barang'], 'teks', 25),
  kol('register', ['Nomor', 'Reg', 'Reg'], 'register', 7),
  kol('nama_resmi', ['SPESIFIKASI BARANG', 'Jenis Barang/Nama Barang', 'Jenis Barang/Nama Barang'], 'teks', 26),
  kol('merk', ['SPESIFIKASI BARANG', 'Merk/Type', 'Merk/Type'], 'teks', 21),
  kol('nomor', ['SPESIFIKASI BARANG', 'No.Sertifikat/No.Pabrik/No.Chasis/No.Mesin', 'No.Sertifikat/No.Pabrik/No.Chasis/No.Mesin'], 'teks', 21),
  sama('bahan', 'Bahan', 'teks', 15),
  sama('asal_usul', 'Asal/Cara Perolehan Barang', 'teks', 15),
  sama('tahun', 'Tahun Perolehan', 'teks', 0),
  sama('ukuran', 'Ukuran Barang/ Konstruksi (P,S,D)', 'teks', 16),
  sama('satuan', 'Satuan', 'teks', 10),
  sama('keadaan', 'Keadaan (B/KB/R)', 'teks', 11),
  kol('jumlah', ['Jumlah', 'Jumlah', 'Barang'], 'angka', 8),
  kol('harga', ['Jumlah', 'Jumlah', 'Harga'], 'uang', 14),
  sama('keterangan', 'Keterangan', 'teks', 16),
]

const SATUAN: Record<Golongan, string> = { A: 'Bidang', B: 'Unit', C: 'Unit', D: 'Unit', E: 'Buah', F: 'Unit' }
const teks = (v: unknown) => (v == null ? '' : String(v)).trim()
const gabung = (...v: unknown[]) => v.map(teks).filter(Boolean).join(' / ')

/** Kolom ringkas lintas golongan (KIR & Buku Inventaris) dari kolom KIB tiap golongan. */
export function spesifikasi(a: AsetRingan): { merk: string; nomor: string; bahan: string; ukuran: string } {
  const k = a.kib ?? {}
  switch (a.golongan) {
    case 'A': return { merk: '', nomor: teks(k.sertifikat_no), bahan: '', ukuran: k.luas != null ? `${k.luas} m2` : '' }
    case 'B': return { merk: teks(k.merk_type), nomor: gabung(k.no_pabrik, k.no_rangka, k.no_mesin), bahan: teks(k.bahan), ukuran: teks(k.ukuran_cc) }
    case 'C': return { merk: '', nomor: teks(k.dok_no), bahan: gabung(k.bertingkat, k.beton), ukuran: k.luas_bangunan != null ? `${k.luas_bangunan} m2` : '' }
    case 'D': return { merk: '', nomor: teks(k.dok_no), bahan: teks(k.konstruksi), ukuran: k.luas != null ? `${k.luas} m2` : gabung(k.panjang, k.lebar) }
    case 'E': return { merk: teks(k.judul_pencipta), nomor: '', bahan: teks(k.bahan), ukuran: teks(k.ukuran) }
    case 'F': return { merk: '', nomor: teks(k.dok_no), bahan: gabung(k.bertingkat, k.beton), ukuran: k.luas_lantai != null ? `${k.luas_lantai} m2` : '' }
  }
}

export function barisKir(a: AsetRingan): Record<string, string | number> {
  const s = spesifikasi(a)
  return {
    nama_resmi: a.nama_resmi, kode_barang: a.kode_barang ?? '', register: a.register ?? '', merk: s.merk,
    no_seri: teks(a.kib?.no_pabrik), ukuran: s.ukuran, bahan: s.bahan, tahun: a.tahun_perolehan ?? '', jumlah: 1,
    harga: a.harga, keadaan: a.kondisi ? TEKS_KONDISI_KIB[a.kondisi] : '', keterangan: a.nama?.trim() || a.keterangan || '',
  }
}

export function barisBi(a: AsetRingan): Record<string, string | number> {
  const s = spesifikasi(a)
  return {
    kode_barang: a.kode_barang ?? '', register: a.register ?? '', nama_resmi: a.nama_resmi, merk: s.merk, nomor: s.nomor,
    bahan: s.bahan, asal_usul: a.asal_usul ?? '', tahun: a.tahun_perolehan ?? '', ukuran: s.ukuran, satuan: SATUAN[a.golongan],
    keadaan: a.kondisi ? TEKS_KONDISI_BI[a.kondisi] : '', jumlah: a.golongan === 'E' && typeof a.kib?.jumlah === 'number' ? a.kib.jumlah : 1,
    harga: a.harga, keterangan: a.keterangan ?? '',
  }
}

// ─── Rekapitulasi BMD (lembar Rekap) & rekap sensus (RKPInv) ─────────────────

export const AKUN_BMD: readonly [string, string][] = [
  ['1.3.1', 'TANAH'], ['1.3.2', 'PERALATAN DAN MESIN'], ['1.3.3', 'GEDUNG DAN BANGUNAN'],
  ['1.3.4', 'JALAN, JARINGAN DAN IRIGASI'], ['1.3.5', 'ASET TETAP LAINNYA'], ['1.3.6', 'KONSTRUKSI DALAM PENGERJAAN'],
]

export const OBJEK_BMD: readonly [string, string][] = [
  ['1.3.1.01', 'TANAH'],
  ['1.3.2.01', 'ALAT BESAR'], ['1.3.2.02', 'ALAT ANGKUTAN'], ['1.3.2.03', 'ALAT BENGKEL DAN ALAT UKUR'], ['1.3.2.04', 'ALAT PERTANIAN'],
  ['1.3.2.05', 'ALAT KANTOR DAN RUMAH TANGGA'], ['1.3.2.06', 'ALAT STUDIO KOMUNIKASI DAN PEMANCAR'], ['1.3.2.07', 'ALAT KEDOKTERAN DAN ALAT KESEHATAN'],
  ['1.3.2.08', 'ALAT LABORATORIUM'], ['1.3.2.09', 'ALAT PERSENJATAAN'], ['1.3.2.10', 'ALAT KOMPUTER'], ['1.3.2.11', 'ALAT EKSPLORASI'],
  ['1.3.2.12', 'ALAT PENGEBORAN'], ['1.3.2.13', 'ALAT PRODUKSI, PENGELOLAAN DAN PEMURNIAN'], ['1.3.2.14', 'ALAT BANTU EKSPLORASI'],
  ['1.3.2.15', 'ALAT KESELAMATAN KERJA'], ['1.3.2.16', 'ALAT PERAGA'], ['1.3.2.17', 'PERALATAN PROSES/PRODUKSI'], ['1.3.2.18', 'RAMBU RAMBU'],
  ['1.3.2.19', 'PERALATAN OLAH RAGA'],
  ['1.3.3.01', 'BANGUNAN GEDUNG'], ['1.3.3.02', 'MONUMEN'], ['1.3.3.03', 'BANGUNAN MENARA'], ['1.3.3.04', 'TUGU TITIK KONTROL/PASTI'],
  ['1.3.4.01', 'JALAN DAN JEMBATAN'], ['1.3.4.02', 'BANGUNAN AIR'], ['1.3.4.03', 'INSTALASI'], ['1.3.4.04', 'JARINGAN'],
  ['1.3.5.01', 'BAHAN PERPUSTAKAAN'], ['1.3.5.02', 'BARANG BERCORAK KESENIAAN/KEBUDAYAAN/OLAH RAGA'], ['1.3.5.03', 'HEWAN'],
  ['1.3.5.04', 'BIOTA PERAIRAN'], ['1.3.5.05', 'TANAMAN'], ['1.3.5.06', 'BARANG KOLEKSI NON BUDAYA'], ['1.3.5.07', 'ASET TETAP DALAM RENOVASI'],
  ['1.3.6.01', 'KONSTRUKSI DALAM PENGERJAAN'],
]

/** Lembar Rekap: kepala dua baris tergabung tegak; nilai ditulis rupiah penuh walau kepalanya "DLM RIBUAN" (seperti ekspor provinsi). */
export const KOLOM_REKAP: readonly KolomKib[] = [
  sama('no', 'No.', 'angka', 5), sama('akun', 'KODE AKUN', 'register', 8), sama('objek', 'KODE OBJEK', 'register', 9),
  sama('uraian', 'KETERANGAN', 'teks', 46), sama('jumlah', 'JUMLAH', 'angka', 8),
  sama('harga', 'JUMLAH HARGA DLM RIBUAN (Rp.)', 'uang', 20), sama('total', 'JUMLAH TOTAL ', 'angka', 10),
  sama('total_harga', 'TOTAL HARGA DLM RIBUAN (Rp.)', 'uang', 17), sama('keterangan', 'KETERANGAN', 'teks', 22),
]

/** Lembar RKPInv. "TIDAK ADA" selalu 0: PRIMA belum mencatat aset yang tidak ditemukan. */
export const KOLOM_RKP: readonly KolomKib[] = [
  sama('no', 'No.', 'angka', 7), sama('objek', 'Objek', 'register', 12), sama('uraian', 'Keterangan', 'teks', 35),
  kol('jumlah', ['AUDITED', 'AUDITED', 'Jml'], 'angka', 12), kol('harga', ['AUDITED', 'AUDITED', 'Harga'], 'uang', 16),
  ...([['B', 'BAIK'], ['RR', 'RUSAK RINGAN'], ['RB', 'RUSAK BERAT'], ['TA', 'TIDAK ADA']] as const).flatMap(([k, t]) => [
    kol(k, ['HASIL SENSUS', t, 'Jml'], 'angka', 8), kol(`${k}_pct`, ['HASIL SENSUS', t, '%'], 'uang', 8),
  ]),
]

const AKUN_GOLONGAN: Record<Golongan, string> ={ A: '1.3.1', B: '1.3.2', C: '1.3.3', D: '1.3.4', E: '1.3.5', F: '1.3.6' }

/** "1.3.3.01.01.02.001" → "1.3.3.01". KIB F tak ber-kode → KDP. Tanpa kode objek → null (tidak terekap per objek). */
export function kodeObjekBmd(a: Pick<AsetRingan, 'golongan' | 'kode_objek'>): string | null {
  if (a.golongan === 'F') return '1.3.6.01'
  const m = /^(\d+\.\d+\.\d+\.\d+)/.exec(a.kode_objek ?? '')
  return m ? m[1] : null
}

export interface BarisRekap { jumlah: number; harga: number; B: number; RR: number; RB: number }
const kosong = (): BarisRekap => ({ jumlah: 0, harga: 0, B: 0, RR: 0, RB: 0 })

/**
 * Buku resmi provinsi: hanya aset AKTIF yang teregister (punya kode barang), plus KIB F. Aset yang
 * baru diterima & belum teregister memang belum ada di buku provinsi.
 */
export const masukBukuResmi = (a: Pick<AsetRingan, 'status' | 'golongan' | 'kode_barang'>) =>
  a.status === 'AKTIF' && (a.golongan === 'F' || !!a.kode_barang)

/** `kondisiDari`: rekap sensus memakai kondisi hasil pemeriksaan tahun itu saja (`kondisiSensus`). */
export function rekapBmd(
  rows: readonly AsetRingan[], kondisiDari: (a: AsetRingan) => KodeKondisi | null = a => a.kondisi,
): { objek: Map<string, BarisRekap>; akun: Map<string, BarisRekap> } {
  const objek = new Map<string, BarisRekap>(), akun = new Map<string, BarisRekap>()
  for (const a of rows) {
    if (!masukBukuResmi(a)) continue
    const k = kondisiDari(a)
    const tambah = (peta: Map<string, BarisRekap>, kunci: string) => {
      const x = peta.get(kunci) ?? kosong()
      x.jumlah++; x.harga += a.harga
      if (k) x[k]++
      peta.set(kunci, x)
    }
    tambah(akun, AKUN_GOLONGAN[a.golongan])
    const o = kodeObjekBmd(a)
    if (o) tambah(objek, o)
  }
  return { objek, akun }
}
