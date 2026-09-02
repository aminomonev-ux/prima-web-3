// lib/data/kinerja-import-master.ts — pembaca berkas Excel Master E-Anggaran.
// Server-only (exceljs). PURE terhadap I/O: terima Buffer, balikkan entri +
// peringatan; TIDAK menulis DB (pola kinerja-import-rekening.ts).
//
// Bentuk yang dibidik = hasil Unduh Excel tab Master: satu sheet per tipe, judul
// sheet-nya yang menyatakan tipe (isinya sendiri tidak membedakan Program dari
// Kegiatan). Sheet yang judulnya tidak dikenali dilewati dan dilaporkan — bukan
// ditebak, sebab menebak tipe berarti menaruh nama di daftar yang salah.

import ExcelJS from 'exceljs';
import { sanitizeImportText } from './kinerja-import';
import type { EntriMaster } from '@/lib/kinerja/gabung-rekening';
import type { MasterTipe } from '@/app/(dashboard)/kinerja/_types';

export interface ParseMasterResult {
  rows:     EntriMaster[];
  warnings: string[];
  source:   string;
}

const MAX_SHEETS    = 60;
const MAX_GRID_ROWS = 6000;
const MAX_ROWS      = 5000;
const MAXLEN_NAMA   = 500;   // MasterCreateBodySchema: nama max 500
const MAXLEN_REF    = 255;

/** Judul sheet → tipe. Cermin MASTER_SHEET di _exports.ts. */
const SHEET_TIPE: { cocok: RegExp; tipe: MasterTipe }[] = [
  { cocok: /\bsub\s*keg/i,       tipe: 'subkegiatan' },
  { cocok: /\bssk\b|\buraian\b/i, tipe: 'uraian_ssk' },
  { cocok: /\bsumber\b/i,        tipe: 'sumber_anggaran' },
  { cocok: /\bprogram\b/i,       tipe: 'program' },
  { cocok: /\bkegiatan\b/i,      tipe: 'kegiatan' },
];

export function tipeDariSheet(nama: string): MasterTipe | null {
  return SHEET_TIPE.find(x => x.cocok.test(nama))?.tipe ?? null;
}

function unwrap(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return unwrap(o.result);
    if ('text' in o) return o.text;
    if ('richText' in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map(t => t.text).join('');
  }
  return v;
}

function cellStr(v: unknown, maxLen: number): string {
  const u = unwrap(v);
  if (u == null) return '';
  if (u instanceof Date) return u.toISOString().slice(0, 10);
  return sanitizeImportText(String(u)).slice(0, maxLen);
}

/** Induk hanya diisi untuk tipe yang memang memilikinya — cermin `createMasterRow`. */
function induk(tipe: MasterTipe, p: string, k: string, s: string) {
  return {
    program_ref:     ['kegiatan', 'subkegiatan', 'uraian_ssk'].includes(tipe) ? (p || null) : null,
    kegiatan_ref:    ['subkegiatan', 'uraian_ssk'].includes(tipe)             ? (k || null) : null,
    subkegiatan_ref: tipe === 'uraian_ssk'                                    ? (s || null) : null,
  };
}

export async function parseMasterImport(buf: Buffer): Promise<ParseMasterResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if ((wb.worksheets?.length ?? 0) > MAX_SHEETS) {
    throw new Error(`Berkas punya terlalu banyak sheet (maks ${MAX_SHEETS}).`);
  }

  const rows: EntriMaster[] = [];
  const warnings: string[] = [];
  const dibaca: string[] = [];

  for (const ws of wb.worksheets) {
    const tipe = tipeDariSheet(ws.name);
    if (!tipe) { warnings.push(`Sheet "${sanitizeImportText(ws.name)}" dilewati — judulnya tidak menyebut tipe master.`); continue; }
    dibaca.push(`${sanitizeImportText(ws.name)} → ${tipe}`);

    const maxR = Math.min(ws.rowCount || 0, MAX_GRID_ROWS);
    for (let r = 2; r <= maxR; r++) {   // baris 1 = header
      if (rows.length >= MAX_ROWS) { warnings.push(`Berkas berisi lebih dari ${MAX_ROWS} entri — sisanya dilewati.`); break; }
      const row = ws.getRow(r);
      const nama = cellStr(row.getCell(2).value, MAXLEN_NAMA);
      if (!nama) continue;
      if (nama.toLowerCase() === 'nama') continue;   // echo header
      rows.push({
        tipe, nama,
        ...induk(tipe,
          cellStr(row.getCell(3).value, MAXLEN_REF),
          cellStr(row.getCell(4).value, MAXLEN_REF),
          cellStr(row.getCell(5).value, MAXLEN_REF)),
      });
    }
  }

  if (rows.length === 0) {
    throw new Error('Tidak ada entri master terdeteksi. Berkas harus berisi sheet bernama Program / Kegiatan / Sub Kegiatan / Uraian SSK / Sumber Anggaran, dengan nama di kolom B.');
  }
  return { rows, warnings, source: dibaca.join(', ') };
}
