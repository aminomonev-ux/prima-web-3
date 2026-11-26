// PERF-C2 Tahap 3: Excel + PDF exporters extracted dari usulan-client.tsx.
// PERF-C3 dipertahankan — exceljs + jspdf + jspdf-autotable dynamic-import di handler.
// Gaya resmi bersama PRIMA (lib/shared/tabel-dokumen.ts): lembar/halaman "Ringkasan" di depan,
// lalu satu lembar/halaman per SUB BIDANG. Daftar kerja — tanpa tanda tangan.

import { fetchJson } from '@/lib/shared/api';
import { loadExcelJs, downloadWorkbook } from '@/lib/shared/excel-export';
import { kakiDokPdf, type KopDok } from '@/lib/shared/gaya-dokumen';
import { tulisTabelExcel, gambarTabelPdf, type DokTabel, type BarisDok, type KolomDok } from '@/lib/shared/tabel-dokumen';
import type { UsulanHeader, UsulanItem } from './_types';
import { fmtTgl } from './_types';

export const MODUL_USULAN = 'USULAN KEBUTUHAN';

/** Helper: fetch all items per usulan ID dalam 1 round-trip. */
async function fetchExportItems(rows: UsulanHeader[]): Promise<Record<number, UsulanItem[]>> {
  const d = await fetchJson<Record<number, UsulanItem[]>>('/api/usulan/export', {
    method: 'POST',
    body: JSON.stringify({ ids: rows.map(r => r.id) }),
  });
  return d.ok ? (d.data ?? {}) : {};
}

// ─── Shared aggregation helpers ──────────────────────────────────────────────

type ItemAgg = { subtotal: number; va: number; vk: number; ds: number; count: number };

function aggItems(items: UsulanItem[]): ItemAgg {
  return {
    subtotal: items.reduce((s, it) => s + Number(it.total_est), 0),
    va:       items.reduce((s, it) => s + (Number(it.admin_nominal) || 0), 0),
    vk:       items.reduce((s, it) => s + (Number(it.kasubag_nominal) || 0), 0),
    ds:       items.reduce((s, it) => s + (it.status === 'DISETUJUI' ? (Number(it.nominal_disetujui) || 0) : 0), 0),
    count:    items.length,
  };
}

/** Group headers by sub_bidang, insertion order preserved. */
function groupBySubBidang(rows: UsulanHeader[]): Map<string, UsulanHeader[]> {
  const m = new Map<string, UsulanHeader[]>();
  for (const r of rows) {
    const k = r.sub_bidang || '(Tanpa Sub Bidang)';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

/** Rekap per sub-bidang untuk sheet/halaman Ringkasan. */
function subTotals(subRows: UsulanHeader[], itemsMap: Record<number, UsulanItem[]>) {
  const usulan = subRows.length;
  let items = 0, est = 0, va = 0, vk = 0, ds = 0;
  for (const r of subRows) {
    const a = aggItems(itemsMap[r.id] ?? []);
    est += a.subtotal || Number(r.total_nilai) || 0;
    va += a.va; vk += a.vk; ds += a.ds; items += a.count;
  }
  return { usulan, items, est, va, vk, ds };
}

/** Excel sheet name: max 31 char, tanpa \ / ? * [ ] :, anti-duplikat. */
function safeSheetName(name: string, used: Set<string>): string {
  let s = (name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet').slice(0, 31);
  const base = s;
  let i = 1;
  while (used.has(s.toLowerCase())) {
    const suf = ` (${++i})`;
    s = base.slice(0, 31 - suf.length) + suf;
  }
  used.add(s.toLowerCase());
  return s;
}

// ─── Dokumen (satu susunan untuk Excel DAN PDF) ─────────────────────────────

const tanggalCetak = () => new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

function kopUsulan(judul: string, subjudul: string | null): KopDok {
  return { judul, subjudul, keterangan: `Dicetak ${tanggalCetak()}`, modul: MODUL_USULAN };
}

const KOLOM_RINGKASAN: KolomDok[] = [
  { judul: 'Sub Bidang', jenis: 'uraian', lebar: 30 },
  { judul: 'Jml Usulan', jenis: 'angka', lebar: 11 },
  { judul: 'Jml Item', jenis: 'angka', lebar: 10 },
  { judul: 'Total Estimasi (Rp)', jenis: 'rupiah', lebar: 20 },
  { judul: 'Verif Admin (Rp)', jenis: 'rupiah', lebar: 20 },
  { judul: 'Verif Kasubag (Rp)', jenis: 'rupiah', lebar: 20 },
  { judul: 'Disetujui (Rp)', jenis: 'rupiah', lebar: 20 },
];

const KOLOM_ITEM: KolomDok[] = [
  { judul: 'No', jenis: 'nomor', lebar: 6 },
  { judul: 'Nama Barang', jenis: 'uraian', lebar: 32 },
  { judul: 'Spesifikasi', lebar: 28 },
  { judul: 'Qty', jenis: 'desimal', lebar: 7 },
  { judul: 'Satuan', lebar: 9 },
  { judul: 'Harga Estimasi (Rp)', jenis: 'rupiah', lebar: 16 },
  { judul: 'Total Estimasi (Rp)', jenis: 'rupiah', lebar: 17 },
  { judul: 'Prioritas', lebar: 10 },
  { judul: 'Status', lebar: 14 },
  { judul: 'Verif Admin (Rp)', jenis: 'rupiah', lebar: 16 },
  { judul: 'Verif Kasubag (Rp)', jenis: 'rupiah', lebar: 16 },
  { judul: 'Disetujui (Rp)', jenis: 'rupiah', lebar: 16 },
];

/** Ringkasan per sub-bidang + baris JUMLAH. */
export function dokRingkasanUsulan(judul: string, groups: Map<string, UsulanHeader[]>, itemsMap: Record<number, UsulanItem[]>): DokTabel {
  const tot = [0, 0, 0, 0, 0, 0];
  const baris: BarisDok[] = [...groups.entries()].map(([sub, subRows]) => {
    const t = subTotals(subRows, itemsMap);
    [t.usulan, t.items, t.est, t.va, t.vk, t.ds].forEach((v, i) => { tot[i] += v; });
    return { sel: [sub, t.usulan, t.items, t.est, t.va, t.vk, t.ds] };
  });
  if (!baris.length) baris.push({ sel: ['(tidak ada data)'] });
  baris.push({ sel: ['JUMLAH', ...tot], total: true });
  return { kop: kopUsulan(judul.toUpperCase(), 'RINGKASAN PER SUB BIDANG'), kolom: KOLOM_RINGKASAN, baris, mendatar: true };
}

/** Satu sub-bidang: kepala tiap usulan (induk), barisnya, subtotal per usulan, JUMLAH sub-bidang. */
export function dokSubBidangUsulan(judul: string, sub: string, rows: UsulanHeader[], itemsMap: Record<number, UsulanItem[]>): DokTabel {
  const baris: BarisDok[] = [];
  let gT = 0, gVA = 0, gVK = 0, gDS = 0;
  rows.forEach((r, g) => {
    const items: UsulanItem[] = itemsMap[r.id] ?? [];
    const a = aggItems(items);
    const subtotal = a.subtotal || Number(r.total_nilai) || 0;
    gT += subtotal; gVA += a.va; gVK += a.vk; gDS += a.ds;
    // B8: `fmtTgl` seperti layar — `tanggal` tiba sebagai ISO UTC (tengah malam WIB =
    // 17:00 UTC kemarin), jadi 10 karakter pertamanya menyebut tanggal kemarin.
    baris.push({ tingkat: 'induk1', sel: [
      g + 1, `${r.no_usulan} — ${r.pengusul}`,
      `${fmtTgl(r.tanggal)} · ${r.jenis_belanja || '-'} · Status: ${r.status_ringkas}`,
    ] });
    if (items.length) {
      items.forEach((it, i) => baris.push({ kedalaman: 1, sel: [
        i + 1, it.nama_barang, it.spesifikasi || '-', Number(it.qty), it.satuan,
        Number(it.harga_est), Number(it.total_est), it.prioritas, it.status,
        Number(it.admin_nominal) || 0, Number(it.kasubag_nominal) || 0,
        it.status === 'DISETUJUI' ? Number(it.nominal_disetujui) || 0 : 0,
      ] }));
    } else {
      baris.push({ kedalaman: 1, sel: ['-', '(data item tidak tersedia)'] });
    }
    baris.push({ tingkat: 'induk2', sel: [null, `Subtotal ${r.no_usulan}`, null, null, null, null, subtotal, null, null, a.va, a.vk, a.ds] });
  });
  baris.push({ total: true, sel: [null, 'JUMLAH', null, null, null, null, gT, null, null, gVA, gVK, gDS] });
  return { kop: kopUsulan(judul.toUpperCase(), `SUB BIDANG ${sub.toUpperCase()}`), kolom: KOLOM_ITEM, baris, mendatar: true };
}

// ═══ EXCEL ════════════════════════════════════════════════════════════════════

/** Dipisah dari tombolnya supaya isi berkas bisa diuji di Node. */
export async function buatWorkbookUsulan(rows: UsulanHeader[], itemsMap: Record<number, UsulanItem[]>, judul = 'Usulan Kebutuhan') {
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const groups = groupBySubBidang(rows);
  tulisTabelExcel(wb.addWorksheet('Ringkasan'), dokRingkasanUsulan(judul, groups, itemsMap));
  const used = new Set<string>(['ringkasan']);
  for (const [sub, subRows] of groups) {
    tulisTabelExcel(wb.addWorksheet(safeSheetName(sub, used)), dokSubBidangUsulan(judul, sub, subRows, itemsMap));
  }
  return wb;
}

/** Export usulan ke Excel: sheet "Ringkasan" + 1 sheet per sub-bidang. */
export async function exportExcel(rows: UsulanHeader[], filename: string) {
  const wb = await buatWorkbookUsulan(rows, await fetchExportItems(rows));
  await downloadWorkbook(wb, filename + '.xlsx');
}

// ═══ PDF ══════════════════════════════════════════════════════════════════════

/** Dipisah dari tombolnya supaya isi berkas bisa diuji di Node. */
export async function buatPdfUsulan(title: string, rows: UsulanHeader[], itemsMap: Record<number, UsulanItem[]>) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const groups = groupBySubBidang(rows);
  gambarTabelPdf(doc, autoTable, dokRingkasanUsulan(title, groups, itemsMap));
  for (const [sub, subRows] of groups) {
    gambarTabelPdf(doc, autoTable, dokSubBidangUsulan(title, sub, subRows, itemsMap), { halamanBaru: true });
  }
  kakiDokPdf(doc, MODUL_USULAN);
  return doc;
}

/** Export usulan ke PDF — Ringkasan di depan, lalu satu bagian per sub-bidang. */
export async function exportPrint(title: string, rows: UsulanHeader[]) {
  const doc = await buatPdfUsulan(title, rows, await fetchExportItems(rows));
  doc.save(title.toLowerCase().replace(/\s+/g, '-') + '.pdf');
}
