// lib/bba/laporan-excel.ts — "BBA {tahun} — Rencana s.d. Pengadaan.xlsx" (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B).
// SATU penyusun untuk tombol Unduh Excel DAN salinan otomatis ke Drive — isinya tidak bisa berbeda (L78). Lembar urut alur:
// Ringkasan · Rencana · Pengadaan · Penerimaan · Penawaran, semuanya templat seragam (`tulisTabelExcel`). Server saja (node:crypto).
import type ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { tulisTabelExcel, type BarisDok, type KolomDok } from '@/lib/shared/tabel-dokumen';
import { periodeTahun } from '@/lib/shared/gaya-dokumen';
import { LABEL_JENIS, LABEL_ANGGARAN, type Anggaran, type JenisRencana } from './rencana';
import { tahapRencana, ringkasAlur, LABEL_TAHAP, type BahanTahap } from './tahap';
import { masihBerlaku, type ItemPenawaran } from './penawaran';

export type RencanaLaporan = BahanTahap & {
  id: number; canonical_id: string; uraian: string; barang_nama: string | null; sumber_anggaran: string; vol: number; satuan: string | null;
  harga: number; nilai_rencana: number; anggaran: Anggaran; anggaran_nilai: number | null; jenis_rencana: JenisRencana | null;
  tgl_proses: string | null; vol_realisasi: number; nilai_realisasi: number; usulan_no: string | null; alasan: string | null;
};
export type PenerimaanLaporan = { rencana_id: number; tgl: string; vol: number; harga_satuan: number; nilai: number; merk_tipe: string | null; penyedia: string | null; catatan: string | null; pindahan: boolean; ditempatkan: number };
export type BahanBukuRencana = { tahun: number; rencana: RencanaLaporan[]; penerimaan: PenerimaanLaporan[]; penawaran: ItemPenawaran[]; hariIni: string };

export const LEMBAR_BUKU = ['Ringkasan', 'Rencana', 'Pengadaan', 'Penerimaan', 'Penawaran'] as const;
export type LembarBuku = typeof LEMBAR_BUKU[number];
export const namaBerkasBukuRencana = (tahun: number) => `BBA ${tahun} — Rencana s.d. Pengadaan.xlsx`;
export const NAMA_BERKAS_KIB_DRIVE = 'BBA — Buku Aset (KIB).xlsx';

const MODUL = 'BUKU BESAR ASET';
const k = (judul: string, jenis: KolomDok['jenis'], lebar: number): KolomDok => ({ judul, jenis, lebar });

/**
 * Sidik isi — dasar "perlu dikirim ke Drive?" (§5B.3). Dihitung dari BAHAN, bukan dari berkas (exceljs menulis cap waktu),
 * jadi bahan yang sama selalu bersidik sama, dan penghapusan baris pun mengubahnya (beda dengan MAX(updated_at)).
 */
export function sidikBahan(b: Omit<BahanBukuRencana, 'hariIni'>): string {
  return createHash('sha256').update(JSON.stringify([b.tahun, b.rencana, b.penerimaan, b.penawaran])).digest('hex');
}

export function tulisBukuRencana(wb: ExcelJS.Workbook, b: BahanBukuRencana, aktif: LembarBuku = 'Ringkasan'): void {
  const aktifRencana = b.rencana.filter(r => r.usulan_keputusan !== 'DITOLAK');
  const per = new Map(b.rencana.map(r => [r.id, r]));
  const alur = ringkasAlur(b.rencana);
  const jumlah = (f: (r: RencanaLaporan) => number, xs = aktifRencana) => xs.reduce((t, r) => t + f(r), 0);
  const didanai = aktifRencana.filter(r => r.anggaran === 'DIDANAI');

  // Ringkasan — angka pita alur + nilai per keputusan.
  tulisTabelExcel(wb.addWorksheet('Ringkasan'), {
    kop: { judul: 'RINGKASAN RENCANA S.D. PENGADAAN', periode: periodeTahun(b.tahun), modul: MODUL, keterangan: 'Rencanakan → putuskan → pesan → terima → catat.' },
    kolom: [k('Uraian', 'uraian', 44), k('Jumlah', 'angka', 12), k('Nilai (Rp)', 'rupiah', 20)],
    baris: [
      { sel: ['Rencana (tanpa usulan ditolak)', aktifRencana.length, jumlah(r => r.nilai_rencana)] },
      { sel: ['Perlu dilengkapi', alur.perluDilengkapi, ''] },
      { sel: ['Menunggu keputusan anggaran', alur.menungguKeputusan, ''] },
      { sel: ['Didanai', didanai.length, jumlah(r => r.anggaran_nilai ?? r.nilai_rencana, didanai)] },
      { sel: ['Tidak didanai', aktifRencana.filter(r => r.anggaran === 'TIDAK_DIDANAI').length, jumlah(r => r.nilai_rencana, aktifRencana.filter(r => r.anggaran === 'TIDAK_DIDANAI'))] },
      { sel: ['Siap dipesan', alur.siapDipesan, ''] },
      { sel: ['Menunggu barang (dipesan / diterima sebagian)', alur.menungguBarang, ''] },
      { sel: ['Sudah diterima', aktifRencana.filter(r => r.vol_realisasi > 0).length, jumlah(r => r.nilai_realisasi)] },
      { sel: ['Unit diterima belum dicatat di Buku Aset', alur.belumDicatat, ''] },
    ],
    tanpaNomorKolom: true,
  });

  const barisRencana: BarisDok[] = b.rencana.map((r, i) => ({ sel: [
    i + 1, r.canonical_id, r.uraian, r.barang_nama ?? '', r.jenis_rencana ? LABEL_JENIS[r.jenis_rencana] : '', r.sumber_anggaran, r.vol, r.satuan ?? '',
    r.harga, r.nilai_rencana, r.usulan_keputusan === 'DITOLAK' ? 'Usulan ditolak' : LABEL_ANGGARAN[r.anggaran], LABEL_TAHAP[tahapRencana(r)], r.ref.n, r.alasan ?? '',
  ] }));
  barisRencana.push({ total: true, sel: ['', '', 'JUMLAH (tanpa usulan ditolak)', '', '', '', '', '', '', jumlah(r => r.nilai_rencana), '', '', '', ''] });
  tulisTabelExcel(wb.addWorksheet('Rencana'), {
    kop: { judul: 'DAFTAR RENCANA', periode: periodeTahun(b.tahun), modul: MODUL },
    kolom: [k('No', 'nomor', 5), k('Kode', 'kode', 12), k('Uraian', 'uraian', 36), k('Barang', 'teks', 18), k('Jenis', 'teks', 16), k('Sumber', 'teks', 9),
      k('Vol', 'desimal', 7), k('Satuan', 'teks', 8), k('Harga Satuan', 'rupiah', 15), k('Nilai Rencana', 'rupiah', 17), k('Keputusan', 'teks', 14),
      k('Tahap', 'teks', 18), k('Ref', 'angka', 5), k('Alasan', 'teks', 36)],
    baris: barisRencana, mendatar: true,
  });

  const barisPengadaan: BarisDok[] = didanai.map((r, i) => ({ sel: [
    i + 1, r.canonical_id, r.uraian, r.vol, r.satuan ?? '', r.anggaran_nilai ?? r.nilai_rencana, r.tgl_proses ?? '', r.vol_realisasi, r.nilai_realisasi, LABEL_TAHAP[tahapRencana(r)],
  ] }));
  barisPengadaan.push({ total: true, sel: ['', '', 'JUMLAH', '', '', jumlah(r => r.anggaran_nilai ?? r.nilai_rencana, didanai), '', '', jumlah(r => r.nilai_realisasi, didanai), ''] });
  tulisTabelExcel(wb.addWorksheet('Pengadaan'), {
    kop: { judul: 'PENGADAAN — RENCANA YANG DIDANAI', periode: periodeTahun(b.tahun), modul: MODUL },
    kolom: [k('No', 'nomor', 5), k('Kode', 'kode', 12), k('Uraian', 'uraian', 36), k('Vol', 'desimal', 7), k('Satuan', 'teks', 8), k('Nilai Didanai', 'rupiah', 17),
      k('Tgl Pesan', 'teks', 11), k('Vol Diterima', 'desimal', 9), k('Nilai Diterima', 'rupiah', 17), k('Tahap', 'teks', 18)],
    baris: barisPengadaan, mendatar: true,
  });

  const barisTerima: BarisDok[] = b.penerimaan.map((p, i) => {
    const r = per.get(p.rencana_id);
    return { sel: [i + 1, r?.canonical_id ?? '', r?.uraian ?? '', p.tgl, p.vol, p.harga_satuan, p.nilai, p.pindahan ? 'realisasi lama' : [p.merk_tipe, p.penyedia].filter(Boolean).join(' · '), p.ditempatkan, p.catatan ?? ''] };
  });
  barisTerima.push({ total: true, sel: ['', '', 'JUMLAH', '', '', '', b.penerimaan.reduce((t, p) => t + p.nilai, 0), '', '', ''] });
  tulisTabelExcel(wb.addWorksheet('Penerimaan'), {
    kop: { judul: 'PENERIMAAN BARANG', periode: periodeTahun(b.tahun), modul: MODUL },
    kolom: [k('No', 'nomor', 5), k('Kode', 'kode', 12), k('Uraian', 'uraian', 32), k('Tanggal', 'teks', 11), k('Jumlah', 'desimal', 8), k('Harga Riil', 'rupiah', 15),
      k('Nilai', 'rupiah', 17), k('Yang Dibeli', 'teks', 30), k('Register', 'angka', 9), k('Catatan', 'teks', 24)],
    baris: barisTerima, mendatar: true,
  });

  tulisTabelExcel(wb.addWorksheet('Penawaran'), {
    kop: { judul: 'PENAWARAN REKANAN', modul: MODUL, keterangan: 'Semua surat penawaran yang tercatat (tidak terikat tahun anggaran).' },
    kolom: [k('No', 'nomor', 5), k('Rekanan', 'teks', 24), k('No. Surat', 'teks', 16), k('Tgl Surat', 'teks', 11), k('Berlaku s.d.', 'teks', 11), k('Status', 'teks', 12),
      k('Barang', 'teks', 20), k('Nama di Surat', 'uraian', 28), k('Merk / Tipe', 'teks', 18), k('Satuan', 'teks', 8), k('Harga Satuan', 'rupiah', 15)],
    baris: b.penawaran.map((i, n) => ({ sel: [n + 1, i.rekanan, i.nomor_surat ?? '', i.tgl_surat, i.berlaku_sampai ?? '', masihBerlaku(i.berlaku_sampai, b.hariIni) ? 'berlaku' : 'kedaluwarsa',
      i.barang_nama ?? 'belum ditautkan', i.nama_barang, i.merk_tipe ?? '', i.satuan ?? '', i.harga_satuan] })),
    mendatar: true,
  });

  const ix = LEMBAR_BUKU.indexOf(aktif);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: ix < 0 ? 0 : ix, visibility: 'visible' }];
}
