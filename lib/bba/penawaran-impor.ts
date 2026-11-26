// lib/bba/penawaran-impor.ts — templat & pembaca Excel item penawaran (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A.3).
// Satu berkas = item SATU surat; kepala surat diisi di modal. Pembaca menerima berkas polos MAUPUN berkop (templat
// seragam dari tombol unduh) lewat `cariBarisKepala`/`barisDataImpor`. Tidak menulis DB — barangnya dicocokkan pemanggil.
import type ExcelJS from 'exceljs';
import { polosSelExcel } from '@/lib/shared/excel-sel';
import { barisDataImpor, cariBarisKepala } from '@/lib/shared/impor-tabel';
import { tulisTabelExcel } from '@/lib/shared/tabel-dokumen';

/** L67 — batas lembar & baris (tameng berkas raksasa). */
export const MAKS_LEMBAR_PENAWARAN = 20;
export const MAKS_BARIS_PENAWARAN = 300;

export const KOLOM_TEMPLAT = ['No', 'Nama Barang', 'Merk / Tipe', 'Spesifikasi', 'Satuan', 'Harga Satuan'] as const;

const norm = (t: string) => t.toLowerCase().replace(/[^a-z]/g, '');
const KENALI: Record<'nama' | 'merk' | 'spek' | 'satuan' | 'harga', (t: string) => boolean> = {
  nama: t => ['namabarang', 'barang', 'uraian', 'namaitem', 'item'].includes(norm(t)),
  merk: t => ['merktipe', 'merk', 'tipe', 'merek', 'merektipe'].includes(norm(t)),
  spek: t => ['spesifikasi', 'spek', 'keterangan'].includes(norm(t)),
  satuan: t => ['satuan', 'sat'].includes(norm(t)),
  harga: t => ['hargasatuan', 'harga', 'hargasatuanrp', 'hargarp'].includes(norm(t)),
};
const kepalaPenawaran = (b: string[]) => b.some(KENALI.nama) && b.some(KENALI.harga);

export type BarisImporPenawaran = { baris: number; nama_barang: string; merk_tipe: string | null; spesifikasi: string | null; satuan: string | null; harga_satuan: number };
export type HasilBacaPenawaran = { item: BarisImporPenawaran[]; masalah: string[]; dilewati: string[] };

/** "Rp 1.250.000" / "1250000" / 1250000 → 1250000. Teks bukan angka = NaN. */
function angka(v: unknown): number {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').replace(/rp/gi, '').replace(/\s/g, '');
  if (!t) return NaN;
  const bersih = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/[.,](?=\d{3}(\D|$))/g, '');
  return Number(bersih);
}

export function bacaPenawaranGrid(grid: readonly (readonly unknown[])[]): HasilBacaPenawaran {
  const hasil: HasilBacaPenawaran = { item: [], masalah: [], dilewati: [] };
  const k = cariBarisKepala(grid, kepalaPenawaran);
  if (k < 0) { hasil.masalah.push('Kolom "Nama Barang" dan "Harga Satuan" tidak ditemukan di 25 baris teratas. Pakai templat dari tombol "Unduh templat".'); return hasil; }
  const kepala = (grid[k] ?? []).map(v => String(v ?? '').trim());
  const ix = Object.fromEntries(Object.entries(KENALI).map(([nama, f]) => [nama, kepala.findIndex(f)])) as Record<keyof typeof KENALI, number>;
  const ambil = (b: readonly unknown[], i: number) => (i < 0 ? null : String(b[i] ?? '').trim() || null);
  const data = barisDataImpor(grid, kepalaPenawaran);
  data.forEach((b, n) => {
    const nomor = k + 2 + n;
    const nama = ambil(b, ix.nama);
    if (!nama) return;
    const harga = angka(b[ix.harga]);
    if (!Number.isFinite(harga) || harga <= 0) { hasil.dilewati.push(`Baris ${nomor} "${nama.slice(0, 40)}": harga satuan kosong/bukan angka.`); return; }
    hasil.item.push({ baris: nomor, nama_barang: nama.slice(0, 255), merk_tipe: ambil(b, ix.merk)?.slice(0, 160) ?? null, spesifikasi: ambil(b, ix.spek)?.slice(0, 500) ?? null, satuan: ambil(b, ix.satuan)?.slice(0, 40) ?? null, harga_satuan: Math.round(harga * 100) / 100 });
  });
  if (hasil.item.length > MAKS_BARIS_PENAWARAN) { hasil.masalah.push(`Berkas berisi ${hasil.item.length} item — paling banyak ${MAKS_BARIS_PENAWARAN} per surat.`); hasil.item = []; }
  if (!hasil.item.length && !hasil.masalah.length) hasil.masalah.push('Tidak ada baris item yang terbaca.');
  return hasil;
}

/** Lembar pertama yang punya kepala penawaran. */
export function bacaPenawaranWorkbook(wb: ExcelJS.Workbook): HasilBacaPenawaran {
  if (wb.worksheets.length > MAKS_LEMBAR_PENAWARAN) return { item: [], dilewati: [], masalah: [`Berkas berisi ${wb.worksheets.length} lembar — paling banyak ${MAKS_LEMBAR_PENAWARAN}.`] };
  let pertama: HasilBacaPenawaran | null = null;
  for (const ws of wb.worksheets) {
    const grid: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      if (r > MAKS_BARIS_PENAWARAN + 40) return;
      const b: unknown[] = [];
      for (let c = 1; c <= Math.min(row.cellCount, 30); c++) b.push(polosSelExcel(row.getCell(c)) ?? '');
      grid[r - 1] = b;
    });
    const h = bacaPenawaranGrid(Array.from(grid, b => b ?? []));
    if (h.item.length) return h;
    pertama ??= h;
  }
  return pertama ?? { item: [], dilewati: [], masalah: ['Berkas tidak berisi lembar.'] };
}

/** Templat seragam (kop + kepala baris 7) — diunduh kosong, diisi, lalu diimpor balik. */
export function tulisTemplatPenawaran(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('Penawaran');
  tulisTabelExcel(ws, {
    kop: { judul: 'DAFTAR ITEM SURAT PENAWARAN', modul: 'BUKU BESAR ASET', keterangan: 'Satu berkas = satu surat. Kepala surat (rekanan, nomor, tanggal, masa berlaku) diisi di PRIMA saat impor.' },
    kolom: [
      { judul: KOLOM_TEMPLAT[0], jenis: 'nomor', lebar: 5 }, { judul: KOLOM_TEMPLAT[1], jenis: 'uraian', lebar: 36 }, { judul: KOLOM_TEMPLAT[2], lebar: 22 },
      { judul: KOLOM_TEMPLAT[3], lebar: 40 }, { judul: KOLOM_TEMPLAT[4], lebar: 10 }, { judul: KOLOM_TEMPLAT[5], jenis: 'rupiah', lebar: 16 },
    ],
    baris: [{ sel: [1, 'Laptop', 'Merk A 14"', 'Core i5, RAM 16 GB, SSD 512 GB', 'unit', 12500000] }],
    tanpaNomorKolom: true,
  });
}
