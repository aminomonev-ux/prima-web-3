// lib/bba/penawaran.ts — Penawaran Rekanan BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A, kolom Matriks:
// CONCEPT-bba-penawaran-matriks.md). MURNI: dipakai tampilan Bandingkan, pemilih "Ambil dari penawaran" di modal rencana,
// form & impor Matriks, unduhan, dan uji — satu aturan untuk "berlaku", "termurah", "surat berharga", nama rekanan, dll.
import { tebakSumber, type ReferensiIsian } from './referensi';

export const STATUS_PAJAK = ['TERMASUK', 'BELUM', 'BEBAS', 'TIDAK_DISEBUT'] as const;
export type StatusPajak = typeof STATUS_PAJAK[number];
export const LABEL_PAJAK: Record<StatusPajak, string> = { TERMASUK: 'Termasuk PPN', BELUM: 'Belum termasuk PPN', BEBAS: 'Bebas PPN', TIDAK_DISEBUT: 'Tidak disebut' };

export const STATUS_TINDAK_LANJUT = ['MENUNGGU_PRESENTASI', 'MENUNGGU_DEMO', 'PERLU_TELAAH', 'LANJUT', 'ARSIP', 'DITOLAK'] as const;
export type StatusTindakLanjut = typeof STATUS_TINDAK_LANJUT[number];
export const LABEL_TINDAK_LANJUT: Record<StatusTindakLanjut, string> = {
  MENUNGGU_PRESENTASI: 'Menunggu jadwal presentasi', MENUNGGU_DEMO: 'Menunggu jadwal demo', PERLU_TELAAH: 'Perlu telaah teknis & anggaran',
  LANJUT: 'Disetujui / lanjut proses', ARSIP: 'Arsip / referensi vendor', DITOLAK: 'Ditolak / tidak sesuai',
};

/** Pilihan jenis surat lembar Matriks (validasi data kolom D). Ketik sendiri tetap boleh. */
export const JENIS_SURAT = [
  'Penawaran Harga (SPH)', 'Penawaran Harga & Presentasi', 'Permohonan Presentasi', 'Permohonan Demo & Brosur', 'Company Profile & Penawaran Jasa', 'Lainnya',
] as const;
const JENIS_BERHARGA = new Set<string>(['Penawaran Harga (SPH)', 'Penawaran Harga & Presentasi']);

/** Surat berharga wajib punya item berharga. Kosong = surat lama (sebelum kolom ini ada) — dulu semuanya wajib berharga. */
export const jenisBerharga = (jenis: string | null | undefined) => !jenis?.trim() || JENIS_BERHARGA.has(jenis.trim());

/** §3.1 — satu aturan untuk tombol Simpan dan Zod. `null` = boleh. */
export function syaratSurat(jenis: string | null | undefined, item: ReadonlyArray<{ harga_satuan?: number | null }>): string | null {
  if (!jenisBerharga(jenis)) return null;
  if (item.length === 0) return 'Surat penawaran harga minimal berisi satu barang.';
  if (!item.some(i => (i.harga_satuan ?? 0) > 0)) return 'Surat penawaran harga minimal berisi satu barang yang berharga. Kalau suratnya belum mencantumkan harga, ganti jenis suratnya (mis. Permohonan Presentasi).';
  return null;
}

const huruf = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
/**
 * Teks pajak di berkas → status. `undefined` = tidak dikenali (pembaca menyebutnya), `null` = kosong/"-".
 * "Belum/tidak termasuk/exclude" dicek SEBELUM "termasuk" — kalimatnya memuat kata yang sama.
 */
export function bacaStatusPajak(teks: string | null | undefined): StatusPajak | null | undefined {
  const t = huruf(teks ?? '');
  if (!t) return null;
  const label = STATUS_PAJAK.find(s => huruf(LABEL_PAJAK[s]) === t || huruf(s) === t);
  if (label) return label;
  if (/tidakdisebut|tidakada|takdisebut/.test(t)) return 'TIDAK_DISEBUT';
  if (/belum|tidaktermasuk|exclude|excl|nonppn|tanpappn/.test(t)) return 'BELUM';
  if (/bebas/.test(t)) return 'BEBAS';
  if (/termasuk|include|incl|sudahppn/.test(t)) return 'TERMASUK';
  return undefined;
}
/** Teks status tindak lanjut (label atau kata kunci lembar Ringkasan) → status; `undefined` = tidak dikenali. */
export function bacaTindakLanjut(teks: string | null | undefined): StatusTindakLanjut | null | undefined {
  const t = huruf(teks ?? '');
  if (!t) return null;
  const label = STATUS_TINDAK_LANJUT.find(s => huruf(LABEL_TINDAK_LANJUT[s]) === t || huruf(s) === t);
  if (label) return label;
  if (/presentasi/.test(t)) return 'MENUNGGU_PRESENTASI';
  if (/demo/.test(t)) return 'MENUNGGU_DEMO';
  if (/telaah/.test(t)) return 'PERLU_TELAAH';
  if (/setuju|lanjut/.test(t)) return 'LANJUT';
  if (/arsip|referensi/.test(t)) return 'ARSIP';
  if (/tolak|tidaksesuai/.test(t)) return 'DITOLAK';
  return undefined;
}

const normJenis = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
/** Isi Matriks yang tidak persis daftar ("Presentasi produk") dicocokkan lewat kata kunci; yang tak tertebak disimpan apa adanya. */
export function cocokJenisSurat(teks: string | null | undefined): string | null {
  const t = (teks ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const persis = JENIS_SURAT.find(j => normJenis(j) === normJenis(t));
  if (persis) return persis;
  const n = normJenis(t);
  const harga = /harga|sph/.test(n), presentasi = /presentasi/.test(n), demo = /demo|brosur/.test(n), profil = /profil|profile|jasa/.test(n);
  if (harga) return presentasi ? 'Penawaran Harga & Presentasi' : 'Penawaran Harga (SPH)';
  if (demo) return 'Permohonan Demo & Brosur';
  if (presentasi) return 'Permohonan Presentasi';
  if (profil) return 'Company Profile & Penawaran Jasa';
  return t.slice(0, 80);
}

/** "PT  Medal Darma Buana\n" → "PT. Medal Darma Buana". Badan usaha di depan diberi titik; isi lain apa adanya. */
export function rapikanNamaRekanan(nama: string): string {
  const t = nama.replace(/\s+/g, ' ').trim();
  return t.replace(/^(pt|cv|ud|pd|fa)\.?\s+/i, (_, bu: string) => `${bu.toUpperCase()}. `).slice(0, 160);
}
/** Pembanding nama rekanan tanpa beda huruf, titik, dan spasi — "PT Medal" = "pt. medal". */
export const kunciRekanan = (nama: string) => rapikanNamaRekanan(nama).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Merk + Tipe dalam satu teks — dipakai referensi rencana, Bandingkan, dan lembar lama (`merk_tipe` dulu memuat keduanya). */
export function gabungMerkTipe(merk: string | null | undefined, tipe: string | null | undefined): string | null {
  const m = (merk ?? '').trim(), t = (tipe ?? '').trim();
  if (!m) return t || null;
  if (!t) return m;
  return t.toLowerCase().startsWith(m.toLowerCase()) ? t : `${m} ${t}`;
}

const ANGKA_KATA: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, 'empat belas': 14, 'tiga puluh': 30, 'enam puluh': 60, 'sembilan puluh': 90 };
export type Durasi = { n: number; satuan: 'hari' | 'minggu' | 'bulan' | 'tahun' };
/** "1 Bulan", "14 (empat belas) hari", "tiga puluh hari", "2 minggu" → durasi. Teks lain (mis. tanggal) = null. */
export function durasiDariTeks(teks: string | null | undefined): Durasi | null {
  const t = (teks ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(\d{1,3}|[a-z ]+?)\s*(hari|minggu|pekan|bulan|tahun)(\s+kalender|\s+kerja)?$/.exec(t);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : ANGKA_KATA[m[1].trim()];
  if (!n || n <= 0) return null;
  return { n, satuan: m[2] === 'pekan' ? 'minggu' : m[2] as Durasi['satuan'] };
}

/** Tanggal surat + durasi → "berlaku s.d.". Bulan/tahun dijepit ke akhir bulan (31 Jan + 1 bulan = 28/29 Feb). */
export function tambahDurasi(tgl: string, d: Durasi): string {
  const [y, m, h] = tgl.split('-').map(Number);
  if (d.satuan === 'hari' || d.satuan === 'minggu') {
    const t = new Date(Date.UTC(y, m - 1, h + d.n * (d.satuan === 'minggu' ? 7 : 1)));
    return t.toISOString().slice(0, 10); // tanggal-utc-ok: aritmetika kalender murni di UTC, bukan jam sekarang
  }
  const bulan = (m - 1) + d.n * (d.satuan === 'tahun' ? 12 : 1);
  const ty = y + Math.floor(bulan / 12), tm = ((bulan % 12) + 12) % 12;
  const akhir = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(h, akhir)).padStart(2, '0')}`;
}
export const teksDurasi = (d: Durasi) => `${d.n} ${d.satuan}`;

export type ItemPenawaran = {
  id: number; penawaran_id: number; rekanan: string; nomor_surat: string | null; tgl_surat: string; berlaku_sampai: string | null;
  file_id: string | null; barang_id: number | null; barang_nama: string | null; nama_barang: string;
  /** `merk_tipe` = Tipe sejak kolom Merk dipisah (data lama: merk + tipe tergabung di sini). */
  merk: string | null; merk_tipe: string | null; spesifikasi: string | null; satuan: string | null;
  /** NULL = surat belum mencantumkan harga — tidak ikut Bandingkan & referensi. */
  harga_satuan: number | null; status_pajak: StatusPajak | null; tautan: string | null; garansi: string | null;
  jenis_surat?: string | null; pic_kontak?: string | null; masa_berlaku_teks?: string | null;
  status_tindak_lanjut?: StatusTindakLanjut | null; syarat?: string | null;
  kategori?: string | null; jenis_kategori?: string | null; kode_rekening?: string | null;
};
export type ItemBerharga = ItemPenawaran & { harga_satuan: number };
export const berharga = (i: ItemPenawaran): i is ItemBerharga => (i.harga_satuan ?? 0) > 0;

/** Tanpa tanggal berlaku = berlaku (surat tidak menulis batas); tanggal berlaku hari ini masih berlaku. */
export const masihBerlaku = (berlaku_sampai: string | null, hariIni: string) => !berlaku_sampai || berlaku_sampai >= hariIni;

/** Satuan dibandingkan apa adanya tanpa beda huruf besar/spasi; kosong = "unit" (bawaan form rencana). */
export const kunciSatuan = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase() || 'unit';

const lebihBaru = (a: ItemPenawaran, b: ItemPenawaran) => a.tgl_surat > b.tgl_surat || (a.tgl_surat === b.tgl_surat && a.id > b.id);

export type SelBanding = { item: ItemBerharga; berlaku: boolean; termurah: boolean };
export type BarisBanding = {
  barang_id: number; barang_nama: string; satuan: string;
  /** rekanan → penawaran terbaru yang MASIH berlaku; kalau tidak ada yang berlaku, yang terbaru (kedaluwarsa, abu-abu). */
  sel: Record<string, SelBanding>;
  rata: number | null; jumlah: number;
};

/**
 * Baris = barang × satuan (satuan beda tidak dicampur: "Laptop (paket)" ≠ "Laptop (unit)"), kolom = rekanan (ejaan dirapikan,
 * jadi dua ejaan satu rekanan tidak jadi dua kolom). Kedaluwarsa tetap terlihat tapi tidak ikut rata-rata dan tidak bisa jadi
 * termurah. Item tanpa barang dikumpulkan di `belumDitautkan`; item tanpa harga tidak dibandingkan sama sekali.
 */
export function bandingkanPenawaran(items: readonly ItemPenawaran[], hariIni: string): { baris: BarisBanding[]; rekanan: string[]; belumDitautkan: ItemBerharga[] } {
  const kelompok = new Map<string, ItemBerharga[]>();
  const belumDitautkan: ItemBerharga[] = [];
  const namaRekanan = new Map<string, string>();
  for (const it of items) {
    if (!berharga(it)) continue;
    if (!namaRekanan.has(kunciRekanan(it.rekanan))) namaRekanan.set(kunciRekanan(it.rekanan), rapikanNamaRekanan(it.rekanan));
    if (it.barang_id === null) { belumDitautkan.push(it); continue; }
    const k = `${it.barang_id}|${kunciSatuan(it.satuan)}`;
    kelompok.set(k, [...(kelompok.get(k) ?? []), it]);
  }
  const rek = (i: ItemPenawaran) => namaRekanan.get(kunciRekanan(i.rekanan))!;
  const baris: BarisBanding[] = [];
  for (const xs of kelompok.values()) {
    const per = new Map<string, ItemBerharga[]>();
    for (const x of xs) per.set(rek(x), [...(per.get(rek(x)) ?? []), x]);
    const sel: Record<string, SelBanding> = {};
    for (const [rekanan, ys] of per) {
      const berlaku = ys.filter(y => masihBerlaku(y.berlaku_sampai, hariIni));
      const pilih = (berlaku.length ? berlaku : ys).reduce((a, b) => (lebihBaru(b, a) ? b : a));
      sel[rekanan] = { item: pilih, berlaku: berlaku.length > 0, termurah: false };
    }
    const hidup = Object.values(sel).filter(s => s.berlaku);
    if (hidup.length) {
      const min = Math.min(...hidup.map(s => s.item.harga_satuan));
      for (const s of hidup) s.termurah = s.item.harga_satuan === min;
    }
    const contoh = xs[0];
    baris.push({
      barang_id: contoh.barang_id!, barang_nama: contoh.barang_nama ?? contoh.nama_barang, satuan: kunciSatuan(contoh.satuan), sel,
      rata: hidup.length ? Math.round(hidup.reduce((t, s) => t + s.item.harga_satuan, 0) / hidup.length) : null, jumlah: xs.length,
    });
  }
  baris.sort((a, b) => a.barang_nama.localeCompare(b.barang_nama, 'id') || a.satuan.localeCompare(b.satuan, 'id'));
  const rekanan = [...new Set(baris.flatMap(b => Object.keys(b.sel)))].sort((a, b) => a.localeCompare(b, 'id'));
  return { baris, rekanan, belumDitautkan };
}

/** Daftar "Ambil dari penawaran" untuk satu barang: yang berlaku dulu, termurah di atas; kedaluwarsa di bawah; tanpa harga tidak. */
export function urutUntukRencana(items: readonly ItemPenawaran[], hariIni: string): Array<ItemBerharga & { berlaku: boolean }> {
  return items.filter(berharga).map(i => ({ ...i, berlaku: masihBerlaku(i.berlaku_sampai, hariIni) }))
    .sort((a, b) => Number(b.berlaku) - Number(a.berlaku) || a.harga_satuan - b.harga_satuan || (b.tgl_surat > a.tgl_surat ? 1 : -1));
}

/**
 * Penawaran yang dipakai rencana DISALIN jadi referensi harga (referensi beku sejak dipesan — tautan hidup akan mengubah
 * catatan sejarah begitu penawaran disunting). Link e-Katalog ikut sebagai url, jadi referensinya sah walau surat tanpa
 * berkas (aturan `referensiSah`: harga + berkas/tautan); sumbernya ditebak dari domain.
 */
export function referensiDariPenawaran(i: ItemBerharga): ReferensiIsian {
  const url = i.tautan?.trim() || null;
  return {
    sumber: tebakSumber(url) ?? 'LAINNYA', nama_penyedia: rapikanNamaRekanan(i.rekanan), merk_tipe: gabungMerkTipe(i.merk, i.merk_tipe), url, harga: i.harga_satuan,
    tgl_cek: i.tgl_surat, file_id: i.file_id, penawaran_item_id: i.id,
  };
}

export type SaranRekanan = { nama: string; pic_kontak: string | null };
/** Satu saran per rekanan (dirapikan), PIC & kontak dari surat TERAKHIR yang mengisinya. Masukan diurut terbaru dulu. */
export function saranRekananDari(surat: ReadonlyArray<{ rekanan: string; pic_kontak: string | null }>): SaranRekanan[] {
  const per = new Map<string, SaranRekanan>();
  for (const s of surat) {
    const k = kunciRekanan(s.rekanan);
    if (!k) continue;
    const ada = per.get(k);
    if (!ada) per.set(k, { nama: rapikanNamaRekanan(s.rekanan), pic_kontak: s.pic_kontak?.trim() || null });
    else if (!ada.pic_kontak && s.pic_kontak?.trim()) ada.pic_kontak = s.pic_kontak.trim();
  }
  return [...per.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}
