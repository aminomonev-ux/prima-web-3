// lib/bba/penawaran-matriks.ts — pembaca berkas "Matriks Inventarisasi Penawaran" (docs/konsep/bba/CONCEPT-bba-penawaran-matriks.md
// §6). MURNI, tidak menulis DB: satu baris = satu surat × satu barang; baris dikelompokkan per (rekanan + nomor + tanggal) jadi
// BANYAK surat per berkas. Kolom dikenali dari TEKS kepala (urutan bebas), kepala bertingkat & baris TOTAL dilewati.
import { cariBarisKepala, adalahBarisHiasan } from '@/lib/shared/impor-tabel';
import { angka } from './penawaran-impor';
import { bacaTanggal } from './drive-balik';
import {
  rapikanNamaRekanan, kunciRekanan, cocokJenisSurat, syaratSurat, durasiDariTeks, tambahDurasi, bacaStatusPajak, bacaTindakLanjut,
  type StatusPajak, type StatusTindakLanjut,
} from './penawaran';

export const MAKS_BARIS_MATRIKS = 2000;

type Kolom = 'tgl' | 'nomor' | 'jenis' | 'rekanan' | 'pic' | 'induk' | 'kategori' | 'barangmaster' | 'berlaku' | 'nama' | 'merk' | 'tipe' | 'tipespek' | 'spek' | 'satuan' | 'harga' | 'pajak' | 'tautan' | 'garansi' | 'masa' | 'syarat' | 'status';
const huruf = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
/** Urutan penting: yang lebih khusus dulu ("Tipe / Spesifikasi" sebelum "Tipe"; "Status Pajak" sebelum "Status"). */
const KENALI: Array<[Kolom, RegExp]> = [
  ['tgl', /^(tglsurat|tanggalsurat|tanggal|tgl)$/], ['nomor', /^(nosuratrekanan|nosurat|nomorsurat|nomorsuratrekanan)$/],
  ['jenis', /^(jenissurat|jenispengajuan)$/], ['rekanan', /^(namarekananvendor|namarekanan|rekanan|vendor|namavendor|rekananvendor)$/],
  ['pic', /^(pickontak|pic|kontak|contactperson)$/], ['induk', /^(kategori|kategoriinduk)$/], ['kategori', /^(kategoribelanjajasa|kategoribelanja|jeniskategori)$/],
  ['barangmaster', /^(barangmaster|masterbarang)$/], ['berlaku', /^(berlakusd|berlakusampai|berlakuhingga)$/],
  ['nama', /^(namabarang|barang|namabarangjasa|uraian)$/], ['tipespek', /^tipespesifikasi$/], ['merk', /^(merk|merek|brand)$/],
  ['tipe', /^(tipe|type)$/], ['spek', /^(spesifikasi|spek)$/], ['satuan', /^(satuan|sat)$/],
  ['harga', /^(hargapenawaranrp|hargapenawaran|hargasatuan|hargasatuanrp|harga|hargarp)$/], ['pajak', /^(statuspajak|pajak|ppn)$/],
  ['tautan', /^(linkekatalogref|linkekatalog|link|tautan|ekatalog)$/], ['garansi', /^garansi$/], ['masa', /^(masaberlakusph|masaberlaku)$/],
  ['syarat', /^(syaratpengecualian|syaratdanpengecualian|syarat)$/], ['status', /^(statustindaklanjut|tindaklanjut)$/],
];
const kenali = (t: string): Kolom | null => { const h = huruf(t); return KENALI.find(([, p]) => p.test(h))?.[0] ?? null; };
const kepalaMatriks = (b: string[]) => {
  const k = new Set(b.map(kenali));
  return k.has('rekanan') && k.has('tgl') && k.has('nama');
};

const teks = (v: unknown) => (v == null ? '' : v instanceof Date ? '' : String(v)).replace(/\s+/g, ' ').trim();
/** "-", "—", "belum ada harga" = kosong (Petunjuk Pengisian Matriks). */
const isi = (v: unknown) => { const t = teks(v); return !t || /^[-—–]+$/.test(t) || /^belum ada/i.test(t) ? '' : t; };

export type ItemMatriks = {
  baris: number; nama_barang: string; barang_master: string | null; merk: string | null; merk_tipe: string | null; spesifikasi: string | null; satuan: string | null;
  harga_satuan: number | null; status_pajak: StatusPajak | null; tautan: string | null; garansi: string | null;
};
export type SuratMatriks = {
  kunci: string; baris: number[];
  kepala: {
    rekanan: string; pic_kontak: string | null; nomor_surat: string | null; tgl_surat: string; jenis_surat: string | null;
    berlaku_sampai: string | null; masa_berlaku_teks: string | null; kategori: string | null; jenis_kategori: string | null; catatan: string | null;
    status_tindak_lanjut: StatusTindakLanjut | null;
  };
  item: ItemMatriks[];
  /** Tidak bisa disimpan (mis. surat penawaran harga tanpa satu pun harga). */
  masalah: string | null;
  catatan: string[];
};
export type HasilBacaMatriks = { surat: SuratMatriks[]; masalah: string[]; dilewati: string[] };

export const kunciSuratMatriks = (rekanan: string, nomor: string | null, tgl: string) =>
  `${kunciRekanan(rekanan)}|${(nomor ?? '').toLowerCase().replace(/\s+/g, '')}|${tgl}`;

/** `null` = bukan berkas Matriks (kepala tidak ditemukan) — pemanggil jatuh ke templat lama satu surat. */
export function bacaMatriksGrid(grid: readonly (readonly unknown[])[]): HasilBacaMatriks | null {
  const k = cariBarisKepala(grid, kepalaMatriks);
  if (k < 0) return null;
  const kepala = (grid[k] ?? []).map(v => teks(v));
  const ix: Partial<Record<Kolom, number>> = {};
  kepala.forEach((t, i) => { const c = kenali(t); if (c && ix[c] === undefined) ix[c] = i; });
  const ambil = (b: readonly unknown[], c: Kolom) => (ix[c] === undefined ? '' : isi(b[ix[c]!]));
  const hasil: HasilBacaMatriks = { surat: [], masalah: [], dilewati: [] };
  const per = new Map<string, SuratMatriks>();
  const data = grid.slice(k + 1);
  if (data.length > MAKS_BARIS_MATRIKS) { hasil.masalah.push(`Berkas berisi lebih dari ${MAKS_BARIS_MATRIKS} baris.`); return hasil; }
  data.forEach((b, n) => {
    const nomor = k + 2 + n;
    if (!b || adalahBarisHiasan(b)) return;
    const rekananMentah = ambil(b, 'rekanan'), nama = ambil(b, 'nama');
    const tgl = ix.tgl === undefined ? null : bacaTanggal(b[ix.tgl]).nilai;
    // Baris TOTAL = berlabel total/jumlah TANPA rekanan sungguhan atau tanpa tanggal surat. Baris surat sungguhan tetap barang
    // walau namanya "Total Station" atau syaratnya "Jumlah minimal pemesanan …".
    const total = /^(total|jumlah)\b/i;
    if (b.some(v => total.test(teks(v))) && (!rekananMentah || total.test(rekananMentah) || typeof tgl !== 'string')) return;
    if (!rekananMentah && !nama) return; // baris kosong bernomor (templat 25 baris)
    if (!rekananMentah) { hasil.dilewati.push(`Baris ${nomor} "${nama.slice(0, 40)}": nama rekanan kosong.`); return; }
    if (typeof tgl !== 'string') { hasil.dilewati.push(`Baris ${nomor} ${rekananMentah.slice(0, 40)}: tanggal surat kosong atau tidak terbaca.`); return; }
    const rekanan = rapikanNamaRekanan(rekananMentah);
    const nomorSurat = ambil(b, 'nomor').slice(0, 120) || null;
    const kunci = kunciSuratMatriks(rekanan, nomorSurat, tgl);
    let s = per.get(kunci);
    if (!s) {
      const masa = ambil(b, 'masa');
      const d = durasiDariTeks(masa);
      const tglBerlaku = ix.berlaku === undefined ? null : bacaTanggal(b[ix.berlaku]).nilai;
      const tl = bacaTindakLanjut(ambil(b, 'status'));
      s = {
        kunci, baris: [], item: [], masalah: null, catatan: [],
        kepala: {
          rekanan, pic_kontak: ambil(b, 'pic').slice(0, 255) || null, nomor_surat: nomorSurat, tgl_surat: tgl,
          jenis_surat: cocokJenisSurat(ambil(b, 'jenis')), berlaku_sampai: typeof tglBerlaku === 'string' ? tglBerlaku : d ? tambahDurasi(tgl, d) : null, masa_berlaku_teks: masa.slice(0, 60) || null,
          kategori: ambil(b, 'induk').slice(0, 100) || null, jenis_kategori: ambil(b, 'kategori').slice(0, 255) || null, catatan: ambil(b, 'syarat').slice(0, 1000) || null,
          status_tindak_lanjut: tl ?? null,
        },
      };
      if (masa && !d && typeof tglBerlaku !== 'string') s.catatan.push(`masa berlaku "${masa}" tidak terbaca sebagai durasi — tanggal berlaku dikosongkan, teksnya tetap dicatat`);
      if (tl === undefined) s.catatan.push(`status tindak lanjut "${ambil(b, 'status')}" tidak dikenali`);
      per.set(kunci, s);
    }
    s.baris.push(nomor);
    if (!nama) return;
    const hargaTeks = ix.harga === undefined ? '' : isi(b[ix.harga]);
    const harga = hargaTeks ? angka(b[ix.harga!]) : NaN;
    if (hargaTeks && !(Number.isFinite(harga) && harga > 0)) s.catatan.push(`baris ${nomor}: harga "${hargaTeks}" bukan angka — dicatat tanpa harga`);
    const pajakTeks = ambil(b, 'pajak');
    const pajak = bacaStatusPajak(pajakTeks);
    if (pajak === undefined) s.catatan.push(`baris ${nomor}: status pajak "${pajakTeks}" tidak dikenali`);
    // "Tipe / Spesifikasi" satu kolom: pendek tanpa koma = tipe, selebihnya spesifikasi.
    const gabung = ambil(b, 'tipespek');
    const tipe = ambil(b, 'tipe') || (gabung && gabung.length <= 60 && !gabung.includes(',') ? gabung : '');
    const spek = ambil(b, 'spek') || (gabung && !tipe ? gabung : '');
    const tautan = ambil(b, 'tautan');
    s.item.push({
      baris: nomor, nama_barang: nama.slice(0, 255), barang_master: (/^belum ditautkan$/i.test(ambil(b, 'barangmaster')) ? '' : ambil(b, 'barangmaster')) || null, merk: ambil(b, 'merk').slice(0, 80) || null, merk_tipe: tipe.slice(0, 160) || null,
      spesifikasi: spek.slice(0, 500) || null, satuan: ambil(b, 'satuan').slice(0, 40) || null,
      harga_satuan: Number.isFinite(harga) && harga > 0 ? Math.round(harga * 100) / 100 : null, status_pajak: pajak ?? null,
      tautan: /^https?:\/\//i.test(tautan) ? tautan.slice(0, 500) : null, garansi: ambil(b, 'garansi').slice(0, 120) || null,
    });
    if (tautan && !/^https?:\/\//i.test(tautan)) s.catatan.push(`baris ${nomor}: "${tautan.slice(0, 40)}" bukan alamat web — link tidak dicatat`);
  });
  for (const s of per.values()) {
    s.masalah = syaratSurat(s.kepala.jenis_surat, s.item);
    hasil.surat.push(s);
  }
  if (!hasil.surat.length) hasil.masalah.push('Tidak ada baris surat yang terbaca di bawah kepala Matriks.');
  return hasil;
}
