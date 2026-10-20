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
  /** Kepala bertingkat (konsep tabel-excel Tahap B): judul kelompok di atas kolom `dari..sampai`. */
  kelompok?:  { judul: string; dari: number; sampai: number }[];
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
    id: 'capaian-triwulan',
    label: 'Capaian Kinerja per Triwulan',
    keterangan: 'Indikator sasaran · target · realisasi TW I–IV di bawah satu kepala "Realisasi" · capaian (Renaksi)',
    sumber: 'renaksi-cetak',
    setelan: { mode: 'flat', levels: { tujuan: false, sasaran: true, program: false, kegiatan: false, 'sub-kegiatan': false } },
    kolom: [
      { judul: 'No', align: 'center', taut: { isi: { jenis: 'nomor' } } },
      { judul: 'Indikator Kinerja', align: 'left', taut: sumber('indikator') },
      { judul: 'Satuan', align: 'center', taut: sumber('satuan') },
      { judul: 'Target', align: 'right', taut: sumber('tahunan') },
      { judul: 'TW I', align: 'right', taut: sumber('tw1r') },
      { judul: 'TW II', align: 'right', taut: sumber('tw2r') },
      { judul: 'TW III', align: 'right', taut: sumber('tw3r') },
      { judul: 'TW IV', align: 'right', taut: sumber('tw4r') },
      { judul: 'Capaian (%)', align: 'right', taut: sumber('capaian') },
    ],
    kelompok: [{ judul: 'Realisasi', dari: 4, sampai: 7 }],
  },
  {
    id: 'fisik-keuangan',
    label: 'Realisasi Fisik & Keuangan per Program',
    keterangan: 'Pagu · fisik (target, realisasi) · keuangan (Rp, %) per program, s/d Desember (E-Anggaran Rekap)',
    sumber: 'kinerja-rekap',
    setelan: { sdBulan: 12, versi: 'berlaku', kedalaman: 'program' },
    kolom: [
      { judul: 'Program', align: 'left', taut: sumber('label') },
      { judul: 'Pagu (Rp)', align: 'right', taut: sumber('pagu') },
      { judul: 'Target (%)', align: 'right', taut: sumber('targetPct') },
      { judul: 'Realisasi (%)', align: 'right', taut: sumber('pctFisik') },
      { judul: 'Realisasi (Rp)', align: 'right', taut: sumber('realKeu') },
      { judul: 'Serapan (%)', align: 'right', taut: sumber('pctKeu') },
    ],
    kelompok: [{ judul: 'Fisik', dari: 2, sampai: 3 }, { judul: 'Keuangan', dari: 4, sampai: 5 }],
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
