// lib/lkjip/sumber/templat.ts — bentuk tabel LKJIP yang paling sering dipakai, satu klik.
// Templat hanya MENGISI modal (sumber, setelan, kolom); pratinjau & Masukkan tetap di tangan
// orangnya, jadi templat tidak punya jalur tulis sendiri (L78).

import type { KolomTaut } from '../tautan';
import type { IdSumber } from './index';

export interface KolomTemplat { judul: string; align: 'left' | 'center' | 'right'; taut: KolomTaut }
export interface TemplatTabel {
  id:         string;
  label:      string;
  keterangan: string;
  sumber:     IdSumber;
  setelan:    Record<string, unknown>;
  kolom:      KolomTemplat[];
}

const sumber = (kunci: string, lain: Partial<KolomTaut> = {}): KolomTaut => ({ isi: { jenis: 'sumber', kunci }, ...lain });

export const DAFTAR_TEMPLAT: TemplatTabel[] = [
  {
    id: 'pengukuran-kinerja',
    label: 'Pengukuran Kinerja',
    keterangan: 'Sasaran strategis · indikator · target · realisasi · capaian (Renaksi, indikator sasaran)',
    sumber: 'renaksi-cetak',
    setelan: { mode: 'flat', levels: { tujuan: false, sasaran: true, program: false, kegiatan: false, 'sub-kegiatan': false } },
    kolom: [
      { judul: 'No', align: 'center', taut: { isi: { jenis: 'nomor' } } },
      { judul: 'Sasaran Strategis', align: 'left', taut: sumber('sasaran', { gabungSama: true }) },
      { judul: 'Indikator Kinerja', align: 'left', taut: sumber('indikator') },
      { judul: 'Satuan', align: 'center', taut: sumber('satuan') },
      { judul: 'Target', align: 'right', taut: sumber('tahunan') },
      { judul: 'Realisasi', align: 'right', taut: sumber('akhir') },
      { judul: 'Capaian (%)', align: 'right', taut: sumber('capaian') },
    ],
  },
  {
    id: 'anggaran-program',
    label: 'Realisasi Anggaran per Program',
    keterangan: 'Pagu · realisasi · persen · sisa per program, s/d Desember (E-Anggaran Rekap)',
    sumber: 'kinerja-rekap',
    setelan: { sdBulan: 12, versi: 'berlaku', kedalaman: 'program' },
    // Tanpa kolom No: Rekap menaruh TOTAL di baris pertama, jadi nomor urut akan memberinya "1".
    kolom: [
      { judul: 'Program', align: 'left', taut: sumber('label') },
      { judul: 'Anggaran (Rp)', align: 'right', taut: sumber('pagu') },
      { judul: 'Realisasi (Rp)', align: 'right', taut: sumber('realKeu') },
      { judul: 'Realisasi (%)', align: 'right', taut: sumber('pctKeu') },
      // Format angka (bukan 'rp'): kolom rupiah lain tampil tanpa "Rp" karena judulnya sudah "(Rp)".
      { judul: 'Sisa Anggaran (Rp)', align: 'right', taut: { isi: { jenis: 'rumus', ekspresi: '=B-C' }, format: 'angka', desimal: 0 } },
    ],
  },
  {
    id: 'anggaran-sumber-dana',
    label: 'Realisasi Anggaran per Sumber Dana',
    keterangan: 'Pagu · realisasi · serapan · sisa per sumber dana + jumlah (E-Anggaran Laporan)',
    sumber: 'kinerja-laporan',
    setelan: { tampilan: 'sumber' },
    kolom: [
      { judul: 'No', align: 'center', taut: sumber('no') },
      { judul: 'Sumber Dana', align: 'left', taut: sumber('label') },
      { judul: 'Pagu (Rp)', align: 'right', taut: sumber('pagu') },
      { judul: 'Realisasi (Rp)', align: 'right', taut: sumber('realKeu') },
      { judul: 'Serapan (%)', align: 'right', taut: sumber('pctKeu') },
      { judul: 'Sisa Anggaran (Rp)', align: 'right', taut: sumber('sisa') },
    ],
  },
  {
    id: 'anggaran-blud-kelompok',
    label: 'Realisasi Anggaran BLUD per Kelompok Belanja',
    keterangan: 'Pagu · realisasi · serapan · sisa sampai tingkat kelompok belanja, s/d Desember (BLUD Realisasi)',
    sumber: 'blud-realisasi',
    setelan: { tampilan: 'rekening', sdBulan: 12, kedalaman: 3, sembunyikanNol: true },
    kolom: [
      { judul: 'Uraian', align: 'left', taut: sumber('uraian', { bertingkat: true }) },
      { judul: 'Pagu (Rp)', align: 'right', taut: sumber('pagu') },
      { judul: 'Realisasi (Rp)', align: 'right', taut: sumber('realisasi') },
      { judul: 'Serapan (%)', align: 'right', taut: sumber('persen') },
      { judul: 'Sisa (Rp)', align: 'right', taut: sumber('sisa') },
    ],
  },
  {
    id: 'perjanjian-kinerja',
    label: 'Perjanjian Kinerja',
    keterangan: 'Sasaran · indikator · target dari satu PK FINAL (pilih Pihak Pertama sesudah menarik)',
    sumber: 'pk',
    setelan: { versi: 'berlaku', tampilan: 'kinerja' },
    kolom: [
      { judul: 'No', align: 'center', taut: { isi: { jenis: 'nomor' } } },
      { judul: 'Sasaran', align: 'left', taut: sumber('uraian', { gabungSama: true }) },
      { judul: 'Indikator Kinerja', align: 'left', taut: sumber('indikator') },
      { judul: 'Target', align: 'center', taut: sumber('target') },
    ],
  },
];
