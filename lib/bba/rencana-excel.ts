// lib/bba/rencana-excel.ts — Excel daftar rencana per tahun (docs/CONCEPT-bba-buku-aset.md §9):
// per jenis rencana (pola RKBMD pengadaan & pemeliharaan) dengan data buku aset tiap barang di
// sampingnya. Bahan kerja internal, bukan format provinsi — tanpa kop & tanda tangan.
import type ExcelJS from 'exceljs';
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

const KOLOM: [judul: string, lebar: number][] = [
  ['No', 5], ['Kode', 12], ['Uraian', 40], ['Barang', 22], ['Unit / PJ', 18], ['Vol', 7], ['Satuan', 9], ['Harga Satuan', 15],
  ['Nilai Rencana', 17], ['Anggaran', 13], ['Nilai Didanai', 17], ['Dimiliki', 9], ['Baik', 7], ['Rusak Ringan', 9], ['Rusak Berat', 9],
  ['Aset Sasaran', 30], ['Alasan', 40], ['Status', 16],
];
const KOLOM_UANG = new Set([8, 9, 11]);

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
  const ws = wb.addWorksheet(`Rencana ${tahun}`, { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  KOLOM.forEach(([, w], i) => { ws.getColumn(i + 1).width = w; });
  ws.getCell('A1').value = `DAFTAR RENCANA BARANG MILIK DAERAH TAHUN ${tahun}`;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'Per jenis rencana, dengan data Buku Aset tiap barang (register aktif yang ditautkan ke barang itu).';
  ws.getCell('A2').font = { italic: true, size: 9 };
  const kepala = ws.getRow(4);
  KOLOM.forEach(([j], i) => { const c = kepala.getCell(i + 1); c.value = j; c.font = { bold: true }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; });
  kepala.height = 30;

  let r = 5;
  let totalRencana = 0, totalDidanai = 0;
  for (const [jenis, xs] of kelompokRencana(rows)) {
    const judul = ws.getRow(r++);
    judul.getCell(1).value = jenis ? LABEL_JENIS[jenis].toUpperCase() : 'BELUM DIGOLONGKAN';
    judul.font = { bold: true };
    let subRencana = 0, subDidanai = 0;
    xs.forEach((x, i) => {
      const d = x.barang_id ? dimiliki.get(x.barang_id) : undefined;
      const didanai = x.anggaran === 'DIDANAI' ? (x.anggaran_nilai ?? x.nilai_rencana) : 0;
      subRencana += x.nilai_rencana; subDidanai += didanai;
      const baris = ws.getRow(r++);
      baris.values = [
        i + 1, x.canonical_id, x.uraian, x.barang_nama ?? '', x.sub_bidang || x.penanggung_jawab || '', x.vol, x.satuan ?? '', x.harga,
        x.nilai_rencana, LABEL_ANGGARAN[x.anggaran], didanai || '', d?.jumlah ?? '', d?.kondisi.baik ?? '', d?.kondisi.rusak_ringan ?? '', d?.kondisi.rusak_berat ?? '',
        (sasaran.get(x.id) ?? []).join('; '), x.alasan ?? '', LABEL_STATUS[x.status],
      ];
      baris.alignment = { vertical: 'top', wrapText: true };
      KOLOM_UANG.forEach(c => { baris.getCell(c).numFmt = FMT_UANG; });
    });
    const sub = ws.getRow(r++);
    sub.getCell(3).value = `Jumlah ${jenis ? LABEL_JENIS[jenis] : 'belum digolongkan'}`;
    sub.getCell(9).value = subRencana; sub.getCell(11).value = subDidanai;
    sub.font = { bold: true };
    KOLOM_UANG.forEach(c => { sub.getCell(c).numFmt = FMT_UANG; });
    totalRencana += subRencana; totalDidanai += subDidanai;
    r++;
  }
  const tot = ws.getRow(r);
  tot.getCell(3).value = 'JUMLAH SELURUHNYA';
  tot.getCell(9).value = totalRencana; tot.getCell(11).value = totalDidanai;
  tot.font = { bold: true };
  KOLOM_UANG.forEach(c => { tot.getCell(c).numFmt = FMT_UANG; });
  return ws;
}
