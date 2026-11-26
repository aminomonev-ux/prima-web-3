// lib/bba/rencana-excel.ts — Excel daftar rencana per tahun (docs/konsep/bba/CONCEPT-bba-buku-aset.md §9):
// per jenis rencana (pola RKBMD pengadaan & pemeliharaan) dengan data buku aset tiap barang di
// sampingnya. Bahan kerja internal, bukan format provinsi — gaya resmi bersama PRIMA
// (lib/shared/tabel-dokumen.ts), tanpa tanda tangan.
import type ExcelJS from 'exceljs';
import { tulisTabelExcel, type BarisDok, type JenisKolom } from '@/lib/shared/tabel-dokumen';
import { periodeTahun } from '@/lib/shared/gaya-dokumen';
import { JENIS_RENCANA, LABEL_JENIS, LABEL_ANGGARAN, type JenisRencana, type Anggaran } from './rencana';
import { LABEL_STATUS, type BbaStatus } from './status';
import type { Dimiliki } from './kondisi';
import { FMT_UANG } from './kib-excel';

export interface BarisRencanaExcel {
  id: number; canonical_id: string; uraian: string; barang_id: number | null; barang_nama: string | null;
  sub_bidang: string | null; penanggung_jawab: string | null; vol: number; satuan: string | null; harga: number;
  nilai_rencana: number; anggaran: Anggaran; anggaran_nilai: number | null; jenis_rencana: JenisRencana | null;
  alasan: string | null; status: BbaStatus; usulan_keputusan: string | null;
}

const KOLOM: [judul: string, lebar: number, jenis: JenisKolom][] = [
  ['No', 5, 'nomor'], ['Kode', 12, 'kode'], ['Uraian', 40, 'uraian'], ['Barang', 22, 'teks'], ['Unit / PJ', 18, 'teks'], ['Vol', 7, 'desimal'],
  ['Satuan', 9, 'teks'], ['Harga Satuan', 15, 'rupiah'], ['Nilai Rencana', 17, 'rupiah'], ['Anggaran', 13, 'teks'], ['Nilai Didanai', 17, 'rupiah'],
  ['Dimiliki', 9, 'angka'], ['Baik', 7, 'angka'], ['Rusak Ringan', 9, 'angka'], ['Rusak Berat', 9, 'angka'],
  ['Aset Sasaran', 30, 'teks'], ['Alasan', 40, 'teks'], ['Status', 16, 'teks'],
];

/** Usulan DITOLAK tidak ikut — catatan sejarah, bukan rencana. Urutan kelompok = urutan jenis di konsep, "belum digolongkan" terakhir. */
export function kelompokRencana<T extends Pick<BarisRencanaExcel, 'jenis_rencana' | 'usulan_keputusan'>>(rows: readonly T[]): [JenisRencana | null, T[]][] {
  const aktif = rows.filter(r => r.usulan_keputusan !== 'DITOLAK');
  return ([...JENIS_RENCANA, null] as (JenisRencana | null)[])
    .map(j => [j, aktif.filter(r => r.jenis_rencana === j)] as [JenisRencana | null, T[]])
    .filter(([, xs]) => xs.length > 0);
}

export function tulisDaftarRencana(
  wb: ExcelJS.Workbook, tahun: number, rows: readonly BarisRencanaExcel[],
  dimiliki: ReadonlyMap<number, Dimiliki>, sasaran: ReadonlyMap<number, string[]>,
): ExcelJS.Worksheet {
  const kosong = () => Array<string>(KOLOM.length).fill('');
  const baris: BarisDok[] = [];
  let totalRencana = 0, totalDidanai = 0;
  for (const [jenis, xs] of kelompokRencana(rows)) {
    const judul = kosong();
    judul[2] = jenis ? LABEL_JENIS[jenis].toUpperCase() : 'BELUM DIGOLONGKAN';
    baris.push({ sel: judul, tingkat: 'induk1' });
    let subRencana = 0, subDidanai = 0;
    xs.forEach((x, i) => {
      const d = x.barang_id ? dimiliki.get(x.barang_id) : undefined;
      const didanai = x.anggaran === 'DIDANAI' ? (x.anggaran_nilai ?? x.nilai_rencana) : 0;
      subRencana += x.nilai_rencana; subDidanai += didanai;
      baris.push({ kedalaman: 1, sel: [
        i + 1, x.canonical_id, x.uraian, x.barang_nama ?? '', x.sub_bidang || x.penanggung_jawab || '', x.vol, x.satuan ?? '', x.harga,
        x.nilai_rencana, LABEL_ANGGARAN[x.anggaran], didanai || '', d?.jumlah ?? '', d?.kondisi.baik ?? '', d?.kondisi.rusak_ringan ?? '', d?.kondisi.rusak_berat ?? '',
        (sasaran.get(x.id) ?? []).join('; '), x.alasan ?? '', LABEL_STATUS[x.status],
      ] });
    });
    const sub: (string | number)[] = kosong();
    sub[2] = `Jumlah ${jenis ? LABEL_JENIS[jenis] : 'belum digolongkan'}`;
    sub[8] = subRencana; sub[10] = subDidanai;
    baris.push({ sel: sub, tingkat: 'induk2' });
    totalRencana += subRencana; totalDidanai += subDidanai;
  }
  const tot: (string | number)[] = kosong();
  tot[2] = 'JUMLAH SELURUHNYA';
  tot[8] = totalRencana; tot[10] = totalDidanai;
  baris.push({ sel: tot, total: true });

  const ws = wb.addWorksheet(`Rencana ${tahun}`);
  tulisTabelExcel(ws, {
    kop: {
      judul: 'DAFTAR RENCANA BARANG MILIK DAERAH', periode: periodeTahun(tahun), modul: 'BUKU BESAR ASET',
      keterangan: 'Per jenis rencana, dengan data Buku Aset tiap barang (register aktif yang ditautkan ke barang itu).',
    },
    kolom: KOLOM.map(([judul, lebar, jenis]) => ({ judul, lebar, jenis, ...(jenis === 'rupiah' ? { numFmt: FMT_UANG } : {}) })),
    baris,
    mendatar: true,
  });
  return ws;
}
