// lib/bba/drive-balik.ts — membaca laporan BBA yang disunting di Google Drive dan menggabungkannya dengan PRIMA
// (docs/konsep/bba/CONCEPT-bba-drive-balik.md §4–§6A). MURNI: dipakai pratinjau DAN terapkan (satu aturan), dan uji.
// Tidak menulis apa pun. Yang menulis lib/data/bba-drive-balik.ts lewat jalur simpan tiap menu.
import { LABEL_ANGGARAN, LABEL_JENIS, JENIS_RENCANA, type Anggaran, type JenisRencana } from './rencana';
import { kunciNamaBarang, rapikanNamaBarang } from './barang';
import { angka } from './penawaran-impor';
import {
  KOLOM_LAPORAN, LEMBAR_BALIK, AWALAN_JANGKAR, JUDUL_JANGKAR, selRencana, selPengadaan, selPenerimaan, selPenawaran,
  type LembarBalik, type BahanBukuRencana,
} from './laporan-excel';
import { cariBarisKepala, adalahBarisHiasan } from '@/lib/shared/impor-tabel';

// ─── Kolom: peran, jenis nilai, sinonim ──────────────────────────────────────

/** ubah = boleh dibawa balik pada baris lama; baru = diisi untuk baris baru; hitung = dihitung PRIMA; menu = milik lembar lain. */
export type Peran = 'ubah' | 'baru' | 'ubahbaru' | 'hitung' | 'menu' | 'acuan';
export type JenisNilai = 'teks' | 'angka' | 'tanggal' | 'jenis' | 'keputusan' | 'sumber' | 'barang';
type Spek = { peran: Peran; nilai: JenisNilai; sinonim: string[] };

const S = (peran: Peran, nilai: JenisNilai, ...sinonim: string[]): Spek => ({ peran, nilai, sinonim });
export const SPEK: Record<LembarBalik, Record<string, Spek>> = {
  rencana: {
    no: S('hitung', 'angka', 'nomor', 'no urut'), kode: S('acuan', 'teks', 'kode bba', 'id', 'kode rencana'),
    uraian: S('ubahbaru', 'teks', 'nama item', 'item', 'nama barang', 'keterangan barang', 'deskripsi'),
    barang: S('ubahbaru', 'barang', 'jenis barang', 'master barang', 'nama barang master'),
    jenis: S('ubahbaru', 'jenis', 'jenis rencana', 'jenis kebutuhan', 'tipe rencana'),
    sumber: S('ubahbaru', 'sumber', 'sumber dana', 'sumber anggaran', 'dana'),
    vol: S('ubahbaru', 'angka', 'volume', 'jumlah', 'qty', 'kuantitas', 'jml'),
    satuan: S('ubahbaru', 'teks', 'sat', 'unit satuan'),
    harga: S('ubahbaru', 'angka', 'harga', 'harga satuan rp', 'hrg sat', 'harga unit', 'harga per unit', 'hps'),
    nilai: S('hitung', 'angka', 'total', 'nilai', 'jumlah harga', 'total harga'),
    keputusan: S('ubahbaru', 'keputusan', 'keputusan anggaran', 'anggaran', 'status anggaran', 'didanai'),
    tahap: S('hitung', 'teks', 'status', 'tahapan', 'posisi'), ref: S('hitung', 'angka', 'referensi', 'jumlah referensi'),
    alasan: S('ubahbaru', 'teks', 'alasan kebutuhan', 'justifikasi', 'catatan', 'keterangan'),
  },
  pengadaan: {
    no: S('hitung', 'angka', 'nomor'), kode: S('acuan', 'teks', 'kode bba'), uraian: S('menu', 'teks', 'nama item'),
    vol: S('menu', 'angka', 'volume', 'jumlah'), satuan: S('menu', 'teks', 'sat'), nilai_didanai: S('hitung', 'angka', 'pagu', 'nilai'),
    tgl_pesan: S('ubah', 'tanggal', 'tanggal pesan', 'tgl kontrak', 'tanggal kontrak', 'tgl spk', 'tanggal spk', 'dipesan'),
    vol_diterima: S('hitung', 'angka', 'diterima'), nilai_diterima: S('hitung', 'angka', 'realisasi'), tahap: S('hitung', 'teks', 'status'),
  },
  penerimaan: {
    no: S('hitung', 'angka', 'nomor'), kode: S('acuan', 'teks', 'kode bba', 'kode rencana'), uraian: S('menu', 'teks', 'nama item', 'barang'),
    tgl: S('baru', 'tanggal', 'tgl', 'tanggal terima', 'tgl terima', 'tanggal diterima'),
    vol: S('baru', 'angka', 'vol', 'volume', 'jumlah diterima', 'qty'), harga: S('baru', 'angka', 'harga', 'harga satuan', 'harga beli'),
    nilai: S('hitung', 'angka', 'total'), merk: S('baru', 'teks', 'merk', 'merek', 'tipe', 'yang dibeli'),
    penyedia: S('baru', 'teks', 'rekanan', 'toko', 'vendor', 'supplier'), register: S('hitung', 'angka', 'ditempatkan'),
    catatan: S('baru', 'teks', 'keterangan', 'ket'),
  },
  penawaran: {
    no: S('hitung', 'angka', 'nomor'), rekanan: S('ubahbaru', 'teks', 'penyedia', 'vendor', 'toko', 'supplier', 'perusahaan'),
    nomor: S('ubahbaru', 'teks', 'nomor surat', 'no surat penawaran'), tgl_surat: S('ubahbaru', 'tanggal', 'tanggal surat', 'tanggal'),
    berlaku: S('ubahbaru', 'tanggal', 'berlaku sampai', 'masa berlaku', 'berlaku hingga'), status: S('hitung', 'teks'),
    barang: S('ubahbaru', 'barang', 'master barang'), nama: S('ubahbaru', 'teks', 'nama barang', 'uraian', 'item', 'nama item'),
    merk: S('ubahbaru', 'teks', 'merk', 'merek', 'tipe'), spesifikasi: S('ubahbaru', 'teks', 'spek', 'spesifikasi teknis', 'keterangan'),
    satuan: S('ubahbaru', 'teks', 'sat'), harga: S('ubahbaru', 'angka', 'harga', 'harga satuan rp', 'harga penawaran'),
  },
};
export const bolehUbah = (p: Peran) => p === 'ubah' || p === 'ubahbaru';
export const bolehBaru = (p: Peran) => p === 'baru' || p === 'ubahbaru';
export const JUDUL: Record<LembarBalik, Record<string, string>> = Object.fromEntries(
  LEMBAR_BALIK.map(l => [l, Object.fromEntries(KOLOM_LAPORAN[l].map(c => [c.kunci, c.judul]))])) as Record<LembarBalik, Record<string, string>>;

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const rapat = (t: string) => norm(t).replace(/ /g, '');

/**
 * Skor kecocokan judul berkas ↔ kolom PRIMA: 3 = persis/sinonim, 2 = satu memuat yang lain dengan panjang sebanding
 * ("Harga Satuan (Rp)"), 1 = separuh kata sama, 0 = tidak. "Sebanding" wajib: tanpa itu "Catatan rapat 3 Des" buatan
 * pengguna terbaca sebagai Alasan (sinonim "catatan") dan catatan rapatnya diusulkan menimpa alasan rencana.
 */
export function skorJudul(judul: string, lembar: LembarBalik, kunci: string): number {
  const j = rapat(judul);
  if (!j) return 0;
  const kandidat = [JUDUL[lembar][kunci], ...SPEK[lembar][kunci].sinonim];
  if (kandidat.some(c => rapat(c) === j)) return 3;
  if (kandidat.some(c => {
    const x = rapat(c);
    return x.length >= 4 && j.length >= 4 && (j.includes(x) || x.includes(j)) && Math.min(x.length, j.length) / Math.max(x.length, j.length) >= 0.6;
  })) return 2;
  const kata = new Set(norm(judul).split(' ').filter(w => w.length >= 3));
  const terbaik = Math.max(0, ...kandidat.map(c => {
    const kc = norm(c).split(' ').filter(w => w.length >= 3);
    return kc.length ? kc.filter(w => kata.has(w)).length / Math.max(kc.length, kata.size) : 0;
  }));
  return terbaik >= 0.5 ? 1 : 0;
}

const POLA_JANGKAR = /^[RDTW]:\d+$/;

export type PetaLembar = Record<string, number | null>;
export interface HasilPeta {
  peta: PetaLembar;
  jangkar: number | null;
  /** Kolom berkas yang tidak dikenali — ditampilkan & dijelaskan, tidak dibaca. */
  asing: Array<{ indeks: number; judul: string; contoh: string[] }>;
  /** Kolom yang cocok dengan lebih dari satu kolom PRIMA sama kuatnya — ditanyakan, tidak dipilih. */
  ragu: Array<{ indeks: number; judul: string; calon: string[] }>;
  /** Kolom PRIMA yang tidak ditemukan di berkas. */
  hilang: string[];
  judulBerkas: string[];
  /** Judul kolom PRIMA per kunci — layar menampilkannya, bukan kuncinya. */
  judulPrima: Record<string, string>;
}

/**
 * Peta kolom berkas → kolom PRIMA (§4): persis/sinonim > memuat > separuh kata. Kolom yang diperebutkan dengan skor sama
 * dan kolom yang cocok ke dua kunci sama kuatnya = ragu. `koreksi` (pilihan pengguna) menang; indeksnya divalidasi.
 */
export function petakanKolom(lembar: LembarBalik, judul: string[], contoh: (i: number) => string[], koreksi?: PetaLembar | null): HasilPeta {
  const kunci = Object.keys(SPEK[lembar]);
  const jangkar = judul.findIndex((t, i) => rapat(t) === rapat(JUDUL_JANGKAR) || contoh(i).some(v => POLA_JANGKAR.test(v)));
  const usul = new Map<number, { k: string; s: number }>();
  const ragu: HasilPeta['ragu'] = [];
  judul.forEach((t, i) => {
    if (i === jangkar || !t.trim()) return;
    const skor = kunci.map(k => ({ k, s: skorJudul(t, lembar, k) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    if (!skor.length) return;
    const atas = skor.filter(x => x.s === skor[0].s);
    if (atas.length > 1) { ragu.push({ indeks: i, judul: t, calon: atas.map(x => x.k) }); return; }
    usul.set(i, skor[0]);
  });
  const peta: PetaLembar = Object.fromEntries(kunci.map(k => [k, null]));
  for (const k of kunci) {
    const pemilik = [...usul].filter(([, u]) => u.k === k);
    if (!pemilik.length) continue;
    const terbaik = Math.max(...pemilik.map(([, u]) => u.s));
    const juara = pemilik.filter(([, u]) => u.s === terbaik);
    if (juara.length === 1) peta[k] = juara[0][0];
    else juara.forEach(([i]) => ragu.push({ indeks: i, judul: judul[i], calon: [k] }));
  }
  if (koreksi) {
    for (const [k, i] of Object.entries(koreksi)) {
      if (!(k in peta)) continue;
      if (i === null) { peta[k] = null; continue; }
      if (!Number.isInteger(i) || i < 0 || i >= judul.length || i === jangkar) continue;
      for (const k2 of kunci) if (peta[k2] === i) peta[k2] = null;
      peta[k] = i;
    }
  }
  const dipakai = new Set(Object.values(peta).filter((x): x is number => x !== null));
  const raguSisa = ragu.filter(r => !dipakai.has(r.indeks));
  const asing = judul.flatMap((t, i) => (t.trim() && i !== jangkar && !dipakai.has(i) && !raguSisa.some(r => r.indeks === i)
    ? [{ indeks: i, judul: t, contoh: contoh(i).filter(Boolean).slice(0, 3) }] : []));
  return { peta, jangkar: jangkar < 0 ? null : jangkar, asing, ragu: raguSisa, hilang: kunci.filter(k => peta[k] === null && SPEK[lembar][k].peran !== 'hitung'), judulBerkas: judul, judulPrima: JUDUL[lembar] };
}

// ─── Nilai sel → bentuk baku ─────────────────────────────────────────────────

export type NilaiBaku = string | number | null;
export type Bacaan = { nilai: NilaiBaku; galat?: string };

const teksSel = (v: unknown): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10); // tanggal-utc-ok: sel Excel — exceljs memberi tengah malam UTC, bukan kolom DATE
  return String(v).replace(/\s+/g, ' ').trim();
};

const BULAN: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, peb: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, jul: 7, juli: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, nov: 11, nop: 11, november: 11, des: 12, desember: 12, dec: 12,
};
const tanggalSah = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** "2026-03-01", "01/03/2026", "1-3-2026", "1 Mar 2026", "1 Maret 2026", tanggal Excel (Date / nomor seri). */
export function bacaTanggal(v: unknown): Bacaan {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return { nilai: v.toISOString().slice(0, 10) }; // tanggal-utc-ok: sel Excel — exceljs memberi tengah malam UTC
  if (typeof v === 'number' && v > 20000 && v < 80000) return { nilai: new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10) }; // tanggal-utc-ok: nomor seri tanggal Excel dihitung di UTC
  const t = teksSel(v);
  if (!t) return { nilai: null };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m && tanggalSah(+m[1], +m[2], +m[3])) return { nilai: iso(+m[1], +m[2], +m[3]) };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m && tanggalSah(+m[3], +m[2], +m[1])) return { nilai: iso(+m[3], +m[2], +m[1]) };
  m = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})$/i.exec(t);
  if (m && BULAN[m[2].toLowerCase()] && tanggalSah(+m[3], BULAN[m[2].toLowerCase()], +m[1])) return { nilai: iso(+m[3], BULAN[m[2].toLowerCase()], +m[1]) };
  return { nilai: null, galat: `"${t}" bukan tanggal yang dikenali (tulis 2026-03-01 atau 01/03/2026)` };
}

const KENAL_JENIS: Array<[RegExp, JenisRencana]> = [
  [/ganti|pengganti/, 'PENGGANTIAN'], [/tambah/, 'PENAMBAHAN'], [/baru|pengadaan/, 'PENGADAAN_BARU'], [/pelihara|perbaik|servis|service/, 'PEMELIHARAAN'], [/rehab|renov/, 'REHAB'],
];
const KENAL_KEPUTUSAN: Array<[RegExp, Anggaran | 'DITOLAK']> = [
  [/^usulan ditolak$/, 'DITOLAK'], [/^(tidak|tdk|tak)( didanai| dibiayai)?$|^tidak$/, 'TIDAK_DIDANAI'], [/^(didanai|danai|dibiayai|ya|disetujui|setuju)$/, 'DIDANAI'],
  [/^(belum|belum ditandai|belum diputuskan|nanti|tunda|ditunda)$/, 'BELUM'],
];

export function bacaNilai(jenis: JenisNilai, v: unknown): Bacaan {
  if (jenis === 'tanggal') return bacaTanggal(v);
  const t = teksSel(v);
  switch (jenis) {
    case 'teks': return { nilai: t || null };
    case 'barang': return { nilai: !t || /^belum ditautkan$/i.test(t) ? null : rapikanNamaBarang(t) };
    case 'angka': {
      if (t === '' || t === '-' || t === '—') return { nilai: null };
      const n = angka(v);
      return Number.isFinite(n) ? { nilai: Math.round(n * 100) / 100 } : { nilai: null, galat: `"${t}" bukan angka` };
    }
    case 'jenis': {
      if (!t) return { nilai: null };
      const persis = JENIS_RENCANA.find(j => norm(LABEL_JENIS[j]) === norm(t) || j.toLowerCase() === t.toLowerCase());
      if (persis) return { nilai: persis };
      const cocok = KENAL_JENIS.filter(([p]) => p.test(norm(t)));
      return cocok.length === 1 ? { nilai: cocok[0][1] } : { nilai: null, galat: `jenis "${t}" tidak dikenali` };
    }
    case 'keputusan': {
      if (!t) return { nilai: 'BELUM' };
      const persis = (Object.keys(LABEL_ANGGARAN) as Anggaran[]).find(a => norm(LABEL_ANGGARAN[a]) === norm(t));
      if (persis) return { nilai: persis };
      const cocok = KENAL_KEPUTUSAN.find(([p]) => p.test(norm(t)));
      return cocok ? { nilai: cocok[1] } : { nilai: null, galat: `keputusan "${t}" tidak dikenali (Didanai / Tidak didanai / kosong)` };
    }
    case 'sumber': {
      if (!t) return { nilai: null };
      const s = ['BLUD', 'APBD', 'DAK', 'LAINNYA'].find(x => x === t.toUpperCase().replace(/[^A-Z]/g, ''));
      return s ? { nilai: s } : { nilai: null, galat: `sumber dana "${t}" tidak dikenali (BLUD / APBD / DAK / LAINNYA)` };
    }
  }
}

/** Sama atau tidak, dalam bentuk baku. Angka bertoleransi sen; teks dibandingkan sesudah dirapikan; barang tanpa beda huruf. */
export function samaNilai(jenis: JenisNilai, a: NilaiBaku | undefined, b: NilaiBaku | undefined): boolean {
  const x = a ?? null, y = b ?? null;
  if (x === null || y === null) return x === y;
  if (jenis === 'angka') return Math.abs(Number(x) - Number(y)) < 0.005;
  if (jenis === 'barang') return kunciNamaBarang(String(x)) === kunciNamaBarang(String(y));
  return String(x) === String(y);
}

// ─── Potret: isi lembar dalam bentuk baku, per id ────────────────────────────

/** lembar → id → kunci → nilai baku. Dari bahan PRIMA (asal & sekarang) atau dari berkas Drive. */
export type Potret = Record<LembarBalik, Record<string, Record<string, NilaiBaku>>>;

const bakukan = (l: LembarBalik, sel: Record<string, string | number>) =>
  Object.fromEntries(Object.entries(SPEK[l]).map(([k, s]) => [k, bacaNilai(s.nilai, sel[k] ?? '').nilai]));

/** Bentuk baku dari bahan laporan — lewat penulis sel YANG SAMA dengan berkas, lalu pembaca yang sama dengan berkas. */
export function potretDariBahan(b: BahanBukuRencana): Potret {
  const per = new Map(b.rencana.map(r => [r.id, r]));
  return {
    rencana: Object.fromEntries(b.rencana.map((r, i) => [String(r.id), bakukan('rencana', selRencana(r, i + 1))])),
    pengadaan: Object.fromEntries(b.rencana.filter(r => r.anggaran === 'DIDANAI' && r.usulan_keputusan !== 'DITOLAK').map((r, i) => [String(r.id), bakukan('pengadaan', selPengadaan(r, i + 1))])),
    penerimaan: Object.fromEntries(b.penerimaan.map((p, i) => [String(p.id), bakukan('penerimaan', selPenerimaan(p, per.get(p.rencana_id), i + 1))])),
    penawaran: Object.fromEntries(b.penawaran.map((w, i) => [String(w.id), bakukan('penawaran', selPenawaran(w, b.hariIni, i + 1))])),
  };
}

// ─── Membaca lembar berkas ───────────────────────────────────────────────────

export type BarisBerkas = { baris: number; id: number | null; jangkarAsing: string | null; nilai: Record<string, NilaiBaku>; galat: Record<string, string> };
export type BacaanLembar = { ada: boolean; peta: HasilPeta | null; baris: BarisBerkas[] };
export type BacaanBerkas = Record<LembarBalik, BacaanLembar>;

const kosongSemua = (b: readonly unknown[]) => b.every(v => teksSel(v) === '');

/** Satu lembar (grid sel mentah, baris 0 = baris 1 Excel). `koreksi` = peta kolom pilihan pengguna untuk lembar ini. */
export function bacaLembar(lembar: LembarBalik, grid: readonly (readonly unknown[])[], koreksi?: PetaLembar | null): BacaanLembar {
  const cocokKepala = (b: string[]) => b.some(t => rapat(t) === rapat(JUDUL_JANGKAR))
    || Object.keys(SPEK[lembar]).filter(k => b.some(t => skorJudul(t, lembar, k) >= 3)).length >= 3;
  const ki = cariBarisKepala(grid, cocokKepala);
  if (ki < 0) return { ada: false, peta: null, baris: [] };
  const lebar = Math.max(...grid.slice(ki).map(b => b.length));
  const judul = Array.from({ length: lebar }, (_, i) => teksSel(grid[ki][i]));
  const data = grid.slice(ki + 1).map((b, i) => ({ b, nomor: ki + 2 + i }));
  const contoh = (i: number) => data.slice(0, 50).map(d => teksSel(d.b[i])).filter(Boolean);
  const peta = petakanKolom(lembar, judul, contoh, koreksi);
  const baris: BarisBerkas[] = [];
  for (const { b, nomor } of data) {
    if (kosongSemua(b) || adalahBarisHiasan(b)) continue;
    const jangkarTeks = peta.jangkar === null ? '' : teksSel(b[peta.jangkar]);
    // Baris JUMLAH laporan ("JUMLAH (tanpa usulan ditolak)") lolos dari pengenal hiasan bersama.
    if (!jangkarTeks && b.some(v => /^jumlah\b/i.test(teksSel(v)))) continue;
    const m = /^([RDTW]):(\d+)$/.exec(jangkarTeks);
    const milik = m && m[1] === AWALAN_JANGKAR[lembar];
    const nilai: Record<string, NilaiBaku> = {}, galat: Record<string, string> = {};
    for (const [k, s] of Object.entries(SPEK[lembar])) {
      const i = peta.peta[k];
      if (i === null) continue;
      const r = bacaNilai(s.nilai, b[i]);
      nilai[k] = r.nilai;
      if (r.galat) galat[k] = r.galat;
    }
    // Baris yang hanya berisi kolom hitungan (mis. nomor urut di baris kosong) bukan baris data.
    if (!m && Object.entries(nilai).every(([k, v]) => v === null || SPEK[lembar][k].peran === 'hitung')) continue;
    baris.push({ baris: nomor, id: milik ? Number(m![2]) : null, jangkarAsing: m && !milik ? jangkarTeks : jangkarTeks && !m ? jangkarTeks : null, nilai, galat });
  }
  return { ada: true, peta, baris };
}

// ─── Memilih asal & menggabung tiga arah ─────────────────────────────────────

/** Potret kiriman yang paling cocok dengan berkas (§6A urutan 2): paling banyak sel sama; seri → yang terbaru (indeks terbesar). */
export function pilihAsal(berkas: BacaanBerkas, kandidat: readonly Potret[]): number {
  let terbaik = -1, skorTerbaik = -1;
  kandidat.forEach((p, i) => {
    let s = 0;
    for (const l of LEMBAR_BALIK) for (const b of berkas[l].baris) {
      const a = b.id === null ? undefined : p[l][String(b.id)];
      if (!a) continue;
      for (const [k, v] of Object.entries(b.nilai)) if (samaNilai(SPEK[l][k].nilai, v, a[k])) s++;
    }
    if (s >= skorTerbaik) { skorTerbaik = s; terbaik = i; }
  });
  return terbaik;
}

/** Keterangan PRIMA per catatan: label untuk layar & pagar yang bisa dinilai tanpa DB. */
export type MetaCatatan = { label: string; versi?: number; terkunciUsulan?: boolean; ditolakUsulan?: boolean };
export type MetaPrima = Record<LembarBalik, Record<string, MetaCatatan>>;

export type JenisSel = 'usul' | 'benturan' | 'tanpa-asal';
export type SelUsul = { kunci: string; judul: string; jenis: JenisSel; asal: NilaiBaku | undefined; drive: NilaiBaku; prima: NilaiBaku };
export type UsulUbah = { lembar: LembarBalik; id: number; label: string; versi: number | null; sel: SelUsul[] };
export type UsulBaru = { lembar: LembarBalik; baris: number; label: string; nilai: Record<string, NilaiBaku>; tolak: string | null; kembar: string | null };
export type JenisCatatan = 'dihapus-drive' | 'dihapus-prima' | 'jangkar-asing' | 'hitung' | 'menu-lain' | 'penerimaan-tetap' | 'galat' | 'terkunci-usulan';
export type CatatanTinjau = { lembar: LembarBalik; jenis: JenisCatatan; teks: string };

export interface Tinjauan {
  ubah: UsulUbah[];
  baru: UsulBaru[];
  catatan: CatatanTinjau[];
  /** Perubahan PRIMA yang terjadi sesudah salinan dibuka dan dipertahankan (bukan usulan). */
  dipertahankan: number;
}

const tampil = (v: NilaiBaku | undefined) => (v === null || v === undefined || v === '' ? '(kosong)' : String(v));
const UNTUK_BARU: Record<LembarBalik, string[]> = {
  rencana: ['uraian'], pengadaan: [], penerimaan: ['kode', 'tgl', 'vol', 'harga'], penawaran: ['rekanan', 'tgl_surat', 'nama', 'harga'],
};

function labelBaru(l: LembarBalik, n: Record<string, NilaiBaku>): string {
  switch (l) {
    case 'rencana': return `${n.uraian ?? '(tanpa uraian)'}`;
    case 'penerimaan': return `${n.kode ?? '?'} · ${n.tgl ?? '?'} · ${n.vol ?? '?'} unit`;
    case 'penawaran': return `${n.rekanan ?? '?'} · ${n.nama ?? '?'}`;
    default: return '';
  }
}

/** Kunci "mungkin kembar" baris baru vs semua catatan PRIMA (§6A tabel). */
function kunciKembar(l: LembarBalik, n: Record<string, NilaiBaku>): string[] {
  const t = (v: NilaiBaku | undefined) => (v === null || v === undefined ? '' : norm(String(v)));
  const a = (v: NilaiBaku | undefined) => (v === null || v === undefined ? '' : String(Math.round(Number(v) * 100)));
  switch (l) {
    case 'rencana': return [
      ...(n.barang ? [`b|${kunciNamaBarang(String(n.barang))}|${a(n.vol)}|${a(n.harga)}`] : []),
      `u|${t(n.uraian)}|${a(n.vol)}|${a(n.harga)}`,
    ];
    case 'penerimaan': return [`${t(n.kode)}|${n.tgl ?? ''}|${a(n.vol)}`];
    case 'penawaran': return [`${t(n.rekanan)}|${t(n.nomor)}|${n.tgl_surat ?? ''}|${t(n.nama)}|${a(n.harga)}`];
    default: return [];
  }
}

/**
 * Gabung tiga arah (§6A) — asal (potret kiriman yang dibuka pengubah), berkas Drive, dan PRIMA sekarang.
 * `asal` null = tidak ada potret (mis. kiriman sebelum fitur ini): beda Drive vs PRIMA tampil "tanpa-asal", tidak dicentang.
 */
export function gabungTigaArah(berkas: BacaanBerkas, asal: Potret | null, prima: Potret, meta: MetaPrima): Tinjauan {
  const hasil: Tinjauan = { ubah: [], baru: [], catatan: [], dipertahankan: 0 };
  const catat = (lembar: LembarBalik, jenis: JenisCatatan, teks: string) => hasil.catatan.push({ lembar, jenis, teks });
  for (const l of LEMBAR_BALIK) {
    const lembar = berkas[l];
    if (!lembar.ada) continue;
    const terlihat = new Set<string>();
    const kembarDipakai = new Map<string, string>();
    for (const [id, nilai] of Object.entries(prima[l])) for (const k of kunciKembar(l, nilai)) kembarDipakai.set(k, meta[l][id]?.label ?? id);
    for (const b of lembar.baris) {
      for (const [k, g] of Object.entries(b.galat)) catat(l, 'galat', `Baris ${b.baris}, ${JUDUL[l][k]}: ${g} — sel ini tidak dibaca.`);
      if (b.jangkarAsing) { catat(l, 'jangkar-asing', `Baris ${b.baris}: penanda "${b.jangkarAsing}" bukan milik lembar ini (disalin dari lembar lain?) — dilewati.`); continue; }
      if (b.id === null) {
        if (l === 'pengadaan') { catat(l, 'menu-lain', `Baris ${b.baris}: baris baru di lembar Pengadaan diabaikan — rencana baru ditambahkan di lembar Rencana.`); continue; }
        const nilai = Object.fromEntries(Object.entries(b.nilai).filter(([k]) => bolehBaru(SPEK[l][k].peran) || SPEK[l][k].peran === 'acuan'));
        const kurang = UNTUK_BARU[l].filter(k => nilai[k] === null || nilai[k] === undefined || (SPEK[l][k].nilai === 'angka' && k !== 'harga' && Number(nilai[k]) <= 0));
        const kembarDengan = kunciKembar(l, nilai).map(k => kembarDipakai.get(k)).find(Boolean) ?? null;
        hasil.baru.push({ lembar: l, baris: b.baris, label: labelBaru(l, nilai), nilai,
          tolak: kurang.length ? `${kurang.map(k => JUDUL[l][k]).join(', ')} belum diisi` : null, kembar: kembarDengan });
        for (const k of kunciKembar(l, nilai)) if (!kembarDipakai.has(k)) kembarDipakai.set(k, `baris ${b.baris} berkas ini`);
        continue;
      }
      const id = String(b.id);
      terlihat.add(id);
      const p = prima[l][id], a = asal ? asal[l][id] : undefined, m = meta[l][id];
      if (!p) {
        catat(l, a ? 'dihapus-prima' : 'jangkar-asing', a
          ? `${m?.label ?? `Baris ${b.baris}`}: sudah dihapus/dipindah di PRIMA sesudah salinan ini dibuka — perubahan di baris ${b.baris} tidak bisa diterapkan.`
          : `Baris ${b.baris}: penanda ${AWALAN_JANGKAR[l]}:${id} tidak dikenal di PRIMA (tahun lain atau sudah dihapus) — dilewati.`);
        continue;
      }
      const sel: SelUsul[] = [];
      for (const [k, d] of Object.entries(b.nilai)) {
        if (k in b.galat) continue;
        const spek = SPEK[l][k];
        const asalK = a ? a[k] : undefined;
        const driveBerubah = a ? !samaNilai(spek.nilai, d, asalK) : !samaNilai(spek.nilai, d, p[k]);
        if (a && !samaNilai(spek.nilai, p[k], asalK) && samaNilai(spek.nilai, d, asalK)) hasil.dipertahankan++;
        if (!driveBerubah) continue;
        if (!bolehUbah(spek.peran)) {
          if (spek.peran === 'hitung') catat(l, 'hitung', `${m?.label ?? id}: ${JUDUL[l][k]} dihitung PRIMA — perubahan di berkas diabaikan.`);
          else if (spek.peran === 'menu') catat(l, 'menu-lain', `${m?.label ?? id}: ${JUDUL[l][k]} diubah di lembar ${l === 'pengadaan' || l === 'penerimaan' ? 'Rencana' : 'lain'}, bukan di sini — diabaikan.`);
          else if (spek.peran === 'baru') catat(l, 'penerimaan-tetap', `${m?.label ?? id}: penerimaan yang sudah tercatat tidak bisa diubah dari berkas (${JUDUL[l][k]} ${tampil(asalK ?? p[k])} → ${tampil(d)}). Di PRIMA: hapus penerimaan itu lalu catat ulang.`);
          continue;
        }
        if (l === 'rencana' && m?.ditolakUsulan) { catat(l, 'terkunci-usulan', `${m.label}: usulan ditolak — catatan sejarah, ${JUDUL[l][k]} tidak diubah.`); continue; }
        if (l === 'rencana' && m?.terkunciUsulan && (k === 'uraian' || k === 'vol' || k === 'harga')) {
          catat(l, 'terkunci-usulan', `${m.label}: ${JUDUL[l][k]} baris asal usulan terkunci (sumbernya Usulan Kebutuhan) — perubahan diabaikan.`);
          continue;
        }
        const primaBerubah = a ? !samaNilai(spek.nilai, p[k], asalK) : false;
        if (primaBerubah && samaNilai(spek.nilai, d, p[k])) continue;
        sel.push({ kunci: k, judul: JUDUL[l][k], asal: asalK, drive: d, prima: p[k] ?? null, jenis: !a ? 'tanpa-asal' : primaBerubah ? 'benturan' : 'usul' });
      }
      if (sel.length) hasil.ubah.push({ lembar: l, id: b.id, label: m?.label ?? id, versi: m?.versi ?? null, sel });
    }
    // Ada di asal & masih di PRIMA, tapi tidak ada di berkas = dihapus di Drive. Yang lahir di PRIMA sesudah kiriman (tidak ada
    // di asal) BUKAN dihapus — berkas pengubah memang belum pernah memuatnya (§6A aturan 1).
    if (asal) for (const id of Object.keys(asal[l])) {
      if (!terlihat.has(id) && prima[l][id]) catat(l, 'dihapus-drive', `${meta[l][id]?.label ?? id}: tidak ada lagi di berkas — di PRIMA tetap ada (menghapus dilakukan di PRIMA).`);
    }
  }
  return hasil;
}

/** Nama barang yang dipakai usulan tetapi belum ada di Master, + calon "maksudnya …?" bila ada yang mirip. */
export function barangBelumAda(t: Tinjauan, master: readonly string[]): Array<{ nama: string; mirip: string | null }> {
  const ada = new Map(master.map(n => [kunciNamaBarang(n), n]));
  const nama = new Map<string, string>();
  const tambah = (v: NilaiBaku | undefined) => { if (typeof v === 'string' && v && !ada.has(kunciNamaBarang(v))) nama.set(kunciNamaBarang(v), v); };
  for (const u of t.ubah) for (const s of u.sel) if (s.kunci === 'barang') tambah(s.drive);
  for (const b of t.baru) tambah(b.nilai.barang);
  return [...nama.values()].map(n => ({ nama: n, mirip: barangMirip(n, master) }));
}

function jarak(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Calon "maksudnya …?": beda ≤ 2 huruf, atau satu memuat yang lain. Lebih dari satu calon setara = tidak menebak. */
export function barangMirip(nama: string, master: readonly string[]): string | null {
  const k = kunciNamaBarang(nama);
  const calon = master.map(n => ({ n, d: jarak(k, kunciNamaBarang(n)), muat: k.length >= 4 && (kunciNamaBarang(n).includes(k) || k.includes(kunciNamaBarang(n))) }))
    .filter(x => x.d <= 2 || x.muat).sort((a, b) => a.d - b.d);
  if (!calon.length) return null;
  return calon.length > 1 && calon[1].d === calon[0].d ? null : calon[0].n;
}

export const LABEL_LEMBAR: Record<LembarBalik, string> = { rencana: 'Rencana', pengadaan: 'Pengadaan', penerimaan: 'Penerimaan', penawaran: 'Penawaran' };
export { tampil as tampilNilai };
