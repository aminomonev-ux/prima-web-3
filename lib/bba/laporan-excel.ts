// lib/bba/laporan-excel.ts — "BBA {tahun} — Rencana s.d. Pengadaan.xlsx" (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B).
// SATU penyusun untuk tombol Unduh Excel DAN salinan otomatis ke Drive — isinya tidak bisa berbeda (L78). Lembar urut alur:
// Ringkasan · Rencana · Pengadaan · Penerimaan · Penawaran, semuanya templat seragam (`tulisTabelExcel`). Server saja (node:crypto).
// Daftar kolom per lembar (`KOLOM_LAPORAN`) juga dibaca balik oleh lib/bba/drive-balik.ts — tambah kolom di SINI saja.
import type ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { tulisTabelExcel, type BarisDok, type KolomDok, type LetakTabelExcel } from '@/lib/shared/tabel-dokumen';
import { periodeTahun } from '@/lib/shared/gaya-dokumen';
import { LABEL_JENIS, LABEL_ANGGARAN, type Anggaran, type JenisRencana } from './rencana';
import { tahapRencana, ringkasAlur, LABEL_TAHAP, type BahanTahap } from './tahap';
import { masihBerlaku, type ItemPenawaran } from './penawaran';

export type RencanaLaporan = BahanTahap & {
  id: number; canonical_id: string; uraian: string; barang_nama: string | null; sumber_anggaran: string; vol: number; satuan: string | null;
  harga: number; nilai_rencana: number; anggaran: Anggaran; anggaran_nilai: number | null; jenis_rencana: JenisRencana | null;
  tgl_proses: string | null; vol_realisasi: number; nilai_realisasi: number; usulan_no: string | null; alasan: string | null;
  kategori?: string | null; jenis_kategori?: string | null; kode_rekening?: string | null; kelompok_kib?: string | null;
};
export type PenerimaanLaporan = {
  id: number; rencana_id: number; tgl: string; vol: number; harga_satuan: number; nilai: number; merk_tipe: string | null; penyedia: string | null;
  catatan: string | null; pindahan: boolean; ditempatkan: number;
};
export type BahanBukuRencana = { tahun: number; rencana: RencanaLaporan[]; penerimaan: PenerimaanLaporan[]; penawaran: ItemPenawaran[]; hariIni: string };

export const LEMBAR_BUKU = ['Ringkasan', 'Rencana', 'Pengadaan', 'Penerimaan', 'Penawaran'] as const;
export type LembarBuku = typeof LEMBAR_BUKU[number];
export const namaBerkasBukuRencana = (tahun: number) => `BBA ${tahun} — Rencana s.d. Pengadaan.xlsx`;
export const NAMA_BERKAS_KIB_DRIVE = 'BBA — Buku Aset (KIB).xlsx';

/** Lembar yang bisa dibawa balik dari Drive (CONCEPT-bba-drive-balik §6). Ringkasan = hitungan semua. */
export type LembarBalik = 'rencana' | 'pengadaan' | 'penerimaan' | 'penawaran';
export const LEMBAR_BALIK: readonly LembarBalik[] = ['rencana', 'pengadaan', 'penerimaan', 'penawaran'];
export const NAMA_LEMBAR: Record<LembarBalik, LembarBuku> = { rencana: 'Rencana', pengadaan: 'Pengadaan', penerimaan: 'Penerimaan', penawaran: 'Penawaran' };

export type KolomLaporan = KolomDok & { kunci: string };
const k = (kunci: string, judul: string, jenis: KolomDok['jenis'], lebar: number): KolomLaporan => ({ kunci, judul, jenis, lebar });

export const KOLOM_LAPORAN: Record<LembarBalik, KolomLaporan[]> = {
  rencana: [k('no', 'No', 'nomor', 5), k('kode', 'Kode', 'kode', 12), k('uraian', 'Uraian', 'uraian', 36), k('barang', 'Barang', 'teks', 18),
    k('jenis', 'Jenis', 'teks', 16), k('sumber', 'Sumber', 'teks', 9), k('vol', 'Vol', 'desimal', 7), k('satuan', 'Satuan', 'teks', 8),
    k('harga', 'Harga Satuan', 'rupiah', 15), k('nilai', 'Nilai Rencana', 'rupiah', 17), k('keputusan', 'Keputusan', 'teks', 14),
    k('tahap', 'Tahap', 'teks', 18), k('ref', 'Ref', 'angka', 5), k('alasan', 'Alasan', 'teks', 36),
    k('kategori', 'Kategori', 'teks', 16), k('jenis_kategori', 'Jenis Kategori', 'teks', 26), k('kode_rekening', 'Kode Rekening', 'kode', 20), k('kelompok_kib', 'Kelompok KIB', 'teks', 24)],
  pengadaan: [k('no', 'No', 'nomor', 5), k('kode', 'Kode', 'kode', 12), k('uraian', 'Uraian', 'uraian', 36), k('vol', 'Vol', 'desimal', 7),
    k('satuan', 'Satuan', 'teks', 8), k('nilai_didanai', 'Nilai Didanai', 'rupiah', 17), k('tgl_pesan', 'Tgl Pesan', 'teks', 11),
    k('vol_diterima', 'Vol Diterima', 'desimal', 9), k('nilai_diterima', 'Nilai Diterima', 'rupiah', 17), k('tahap', 'Tahap', 'teks', 18),
    k('kategori', 'Kategori', 'teks', 16), k('jenis_kategori', 'Jenis Kategori', 'teks', 26), k('kode_rekening', 'Kode Rekening', 'kode', 20)],
  penerimaan: [k('no', 'No', 'nomor', 5), k('kode', 'Kode', 'kode', 12), k('uraian', 'Uraian', 'uraian', 30), k('tgl', 'Tanggal', 'teks', 11),
    k('vol', 'Jumlah', 'desimal', 8), k('harga', 'Harga Riil', 'rupiah', 15), k('nilai', 'Nilai', 'rupiah', 17), k('merk', 'Merk / Tipe', 'teks', 20),
    k('penyedia', 'Penyedia', 'teks', 20), k('register', 'Register', 'angka', 9), k('catatan', 'Catatan', 'teks', 24)],
  penawaran: [k('no', 'No', 'nomor', 5), k('rekanan', 'Rekanan', 'teks', 24), k('nomor', 'No. Surat', 'teks', 16), k('tgl_surat', 'Tgl Surat', 'teks', 11),
    k('berlaku', 'Berlaku s.d.', 'teks', 11), k('status', 'Status', 'teks', 12), k('barang', 'Barang', 'teks', 20), k('nama', 'Nama di Surat', 'uraian', 28),
    k('merk', 'Merk / Tipe', 'teks', 18), k('spesifikasi', 'Spesifikasi', 'teks', 28), k('satuan', 'Satuan', 'teks', 8), k('harga', 'Harga Satuan', 'rupiah', 15),
    k('kategori', 'Kategori', 'teks', 16), k('jenis_kategori', 'Jenis Kategori', 'teks', 26), k('kode_rekening', 'Kode Rekening', 'kode', 20)],
};

/**
 * Kolom Jangkar tersembunyi di ujung kanan tiap lembar yang bisa dibawa balik: identitas PRIMA baris itu (pola Jangkar DPA
 * BLUD). Awalan berbeda per lembar supaya baris yang disalin ke lembar lain tidak dikira catatan lembar itu.
 */
export const JUDUL_JANGKAR = 'Jangkar';
export const AWALAN_JANGKAR: Record<LembarBalik, string> = { rencana: 'R', pengadaan: 'D', penerimaan: 'T', penawaran: 'W' };
export const tulisJangkar = (l: LembarBalik, id: number) => `${AWALAN_JANGKAR[l]}:${id}`;

const MODUL = 'BUKU BESAR ASET';

/**
 * Sidik isi — dasar "perlu dikirim ke Drive?" (§5B.3). Dihitung dari BAHAN, bukan dari berkas (exceljs menulis cap waktu),
 * jadi bahan yang sama selalu bersidik sama, dan penghapusan baris pun mengubahnya (beda dengan MAX(updated_at)).
 * Tanggal hari ini TIDAK ikut (berkas tidak dikirim ulang tiap hari), tapi status berlaku/kedaluwarsa penawaran yang
 * dihitung darinya ikut — kalau tidak, salinan Drive tetap menulis "berlaku" sesudah suratnya lewat masa berlaku.
 */
export function sidikBahan(b: BahanBukuRencana): string {
  const berlaku = b.penawaran.map(i => masihBerlaku(i.berlaku_sampai, b.hariIni));
  return createHash('sha256').update(JSON.stringify([b.tahun, b.rencana, b.penerimaan, b.penawaran, berlaku])).digest('hex');
}

const labelKeputusan = (r: RencanaLaporan) => (r.usulan_keputusan === 'DITOLAK' ? 'Usulan ditolak' : LABEL_ANGGARAN[r.anggaran]);
const yangDibeli = (p: PenerimaanLaporan) => (p.pindahan ? 'realisasi lama' : p.merk_tipe ?? '');

/** Nilai sel tiap baris lembar, urut `KOLOM_LAPORAN` — dipakai penulis DAN potret (drive-balik), satu sumber. */
export function selRencana(r: RencanaLaporan, no: number): Record<string, string | number> {
  return { no, kode: r.canonical_id, uraian: r.uraian, barang: r.barang_nama ?? '', jenis: r.jenis_rencana ? LABEL_JENIS[r.jenis_rencana] : '',
    sumber: r.sumber_anggaran, vol: r.vol, satuan: r.satuan ?? '', harga: r.harga, nilai: r.nilai_rencana, keputusan: labelKeputusan(r),
    tahap: LABEL_TAHAP[tahapRencana(r)], ref: r.ref.n, alasan: r.alasan ?? '',
    kategori: r.kategori ?? '', jenis_kategori: r.jenis_kategori ?? '', kode_rekening: r.kode_rekening ?? '', kelompok_kib: r.kelompok_kib ?? '' };
}
export function selPengadaan(r: RencanaLaporan, no: number): Record<string, string | number> {
  return { no, kode: r.canonical_id, uraian: r.uraian, vol: r.vol, satuan: r.satuan ?? '', nilai_didanai: r.anggaran_nilai ?? r.nilai_rencana,
    tgl_pesan: r.tgl_proses ?? '', vol_diterima: r.vol_realisasi, nilai_diterima: r.nilai_realisasi, tahap: LABEL_TAHAP[tahapRencana(r)],
    kategori: r.kategori ?? '', jenis_kategori: r.jenis_kategori ?? '', kode_rekening: r.kode_rekening ?? '' };
}
export function selPenerimaan(p: PenerimaanLaporan, r: RencanaLaporan | undefined, no: number): Record<string, string | number> {
  return { no, kode: r?.canonical_id ?? '', uraian: r?.uraian ?? '', tgl: p.tgl, vol: p.vol, harga: p.harga_satuan, nilai: p.nilai,
    merk: yangDibeli(p), penyedia: p.pindahan ? '' : p.penyedia ?? '', register: p.ditempatkan, catatan: p.catatan ?? '' };
}
export function selPenawaran(i: ItemPenawaran, hariIni: string, no: number): Record<string, string | number> {
  return { no, rekanan: i.rekanan, nomor: i.nomor_surat ?? '', tgl_surat: i.tgl_surat, berlaku: i.berlaku_sampai ?? '',
    status: masihBerlaku(i.berlaku_sampai, hariIni) ? 'berlaku' : 'kedaluwarsa', barang: i.barang_nama ?? 'belum ditautkan', nama: i.nama_barang,
    merk: i.merk_tipe ?? '', spesifikasi: i.spesifikasi ?? '', satuan: i.satuan ?? '', harga: i.harga_satuan,
    kategori: i.kategori ?? '', jenis_kategori: i.jenis_kategori ?? '', kode_rekening: i.kode_rekening ?? '' };
}

const urut = (l: LembarBalik, sel: Record<string, string | number>) => KOLOM_LAPORAN[l].map(c => sel[c.kunci] ?? '');

/** Kolom Jangkar di kanan tabel (tersembunyi) — kepala di baris kepala, isi sejajar baris data. */
function pasangJangkar(ws: ExcelJS.Worksheet, l: LembarBalik, letak: LetakTabelExcel, ids: number[]): void {
  const c = KOLOM_LAPORAN[l].length + 1;
  ws.getRow(letak.kepalaAwal).getCell(c).value = JUDUL_JANGKAR;
  ids.forEach((id, i) => { ws.getRow(letak.dataAwal + i).getCell(c).value = tulisJangkar(l, id); });
  ws.getColumn(c).hidden = true;
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
    kolom: [k('u', 'Uraian', 'uraian', 44), k('j', 'Jumlah', 'angka', 12), k('n', 'Nilai (Rp)', 'rupiah', 20)],
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

  const barisRencana: BarisDok[] = b.rencana.map((r, i) => ({ sel: urut('rencana', selRencana(r, i + 1)) }));
  barisRencana.push({ total: true, sel: urut('rencana', { uraian: 'JUMLAH (tanpa usulan ditolak)', nilai: jumlah(r => r.nilai_rencana) }) });
  const wsR = wb.addWorksheet('Rencana');
  pasangJangkar(wsR, 'rencana', tulisTabelExcel(wsR, { kop: { judul: 'DAFTAR RENCANA', periode: periodeTahun(b.tahun), modul: MODUL }, kolom: KOLOM_LAPORAN.rencana, baris: barisRencana, mendatar: true }),
    b.rencana.map(r => r.id));

  const barisPengadaan: BarisDok[] = didanai.map((r, i) => ({ sel: urut('pengadaan', selPengadaan(r, i + 1)) }));
  barisPengadaan.push({ total: true, sel: urut('pengadaan', { uraian: 'JUMLAH', nilai_didanai: jumlah(r => r.anggaran_nilai ?? r.nilai_rencana, didanai), nilai_diterima: jumlah(r => r.nilai_realisasi, didanai) }) });
  const wsP = wb.addWorksheet('Pengadaan');
  pasangJangkar(wsP, 'pengadaan', tulisTabelExcel(wsP, { kop: { judul: 'PENGADAAN — RENCANA YANG DIDANAI', periode: periodeTahun(b.tahun), modul: MODUL }, kolom: KOLOM_LAPORAN.pengadaan, baris: barisPengadaan, mendatar: true }),
    didanai.map(r => r.id));

  const barisTerima: BarisDok[] = b.penerimaan.map((p, i) => ({ sel: urut('penerimaan', selPenerimaan(p, per.get(p.rencana_id), i + 1)) }));
  barisTerima.push({ total: true, sel: urut('penerimaan', { uraian: 'JUMLAH', nilai: b.penerimaan.reduce((t, p) => t + p.nilai, 0) }) });
  const wsT = wb.addWorksheet('Penerimaan');
  pasangJangkar(wsT, 'penerimaan', tulisTabelExcel(wsT, { kop: { judul: 'PENERIMAAN BARANG', periode: periodeTahun(b.tahun), modul: MODUL }, kolom: KOLOM_LAPORAN.penerimaan, baris: barisTerima, mendatar: true }),
    b.penerimaan.map(p => p.id));

  const wsW = wb.addWorksheet('Penawaran');
  pasangJangkar(wsW, 'penawaran', tulisTabelExcel(wsW, {
    kop: { judul: 'PENAWARAN REKANAN', modul: MODUL, keterangan: 'Semua surat penawaran yang tercatat (tidak terikat tahun anggaran).' },
    kolom: KOLOM_LAPORAN.penawaran, baris: b.penawaran.map((i, n) => ({ sel: urut('penawaran', selPenawaran(i, b.hariIni, n + 1)) })), mendatar: true,
  }), b.penawaran.map(i => i.id));

  const ix = LEMBAR_BUKU.indexOf(aktif);
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: ix < 0 ? 0 : ix, visibility: 'visible' }];
}
