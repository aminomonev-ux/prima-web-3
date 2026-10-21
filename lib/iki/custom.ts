// lib/iki/custom.ts
// IKI varian CUSTOM — tabel bagian II dirancang sendiri (docs/CONCEPT-iki-custom.md). Modul MURNI,
// aman-klien: dipakai editor, server (bentuk awal & templat), dan pengekspor PDF/Excel.
// Model selnya model tabel LKJIP (`lib/lkjip/tabel.ts`) — satu mesin, dua pemakai (§3).

import {
  normalizeRows, sanitizeRows, pastikanKepalaSel, namaKolomDariKepala, nomorUlang, gayaSel, selBergaya,
  teksSelWord, DXA_PER_PX, GARIS_JUMLAH, LEBAR_KOLOM_BAWAAN, BATAS_BARIS_KEPALA,
  type TabelCell, type TabelAlign, type GayaTabel,
} from '@/lib/lkjip/tabel';
import { bacaPeran, tataLetak, type PetaPeran } from './peran';

/** Keputusan pemilik 2026-10-21 (§9 #4) — LKJIP tetap 12 karena halaman Word tegak. */
export const BATAS_KOLOM_IKI = 24;
export const BATAS_BARIS_IKI = 500;

export type KertasIki = 'A4' | 'F4';
export const DAFTAR_KERTAS: KertasIki[] = ['A4', 'F4'];
/** Ukuran kertas MENDATAR (mm). Excel: paperSize 9 = A4, 14 = Folio 8,5 × 13 in (= F4). */
export const KERTAS_IKI: Record<KertasIki, { nama: string; lebarMm: number; tinggiMm: number; excelPaperSize: number }> = {
  A4: { nama: 'A4 mendatar', lebarMm: 297, tinggiMm: 210, excelPaperSize: 9 },
  F4: { nama: 'F4 mendatar', lebarMm: 330, tinggiMm: 215, excelPaperSize: 14 },
};
/** Margin kiri-kanan PDF — sama dengan STANDAR/DIREKTUR (`export-pdf.ts`). */
export const MARGIN_PDF_MM = 8;
export const lebarTulisMm = (k: KertasIki): number => KERTAS_IKI[k].lebarMm - MARGIN_PDF_MM * 2;
/** Lebar bidang tulis dalam px editor (1 px = 15 dxa) — garis batas kertas di editor tabel. */
export const lebarTulisPx = (k: KertasIki): number => Math.floor(((lebarTulisMm(k) / 25.4) * 1440) / DXA_PER_PX);

/** Isi kolom `iki_dokumen.tabel_custom` dan `iki_templat.payload`. */
export type TabelCustom = {
  kolom: string[];
  align: TabelAlign[];
  colWidths: number[];
  headerRows: number;
  rows: TabelCell[][];
  kolomNomor: number | null;
  gaya: GayaTabel;
  kertas: KertasIki;
  /** Peran kolom (§11) — impor Renaksi/atasan & pemeriksaan target membaca kolom bertanda. */
  peran: PetaPeran;
};

const sel = (v: string, extra: Partial<TabelCell> = {}): TabelCell => ({ v, ...extra });

/** Bentuk awal dokumen CUSTOM tanpa templat — titik mulai, bukan aturan: semuanya bisa diubah. */
export function tabelCustomAwal(): TabelCustom {
  const kolom = ['No.', 'Rencana Hasil Kerja', 'Indikator Kinerja Individu', 'Target'];
  const kosong = () => kolom.map(() => sel(''));
  return {
    kolom,
    align: ['center', 'left', 'left', 'center'],
    colWidths: [50, 260, 260, 110],
    headerRows: 1,
    rows: [kolom.map(k => sel(k)), kosong(), kosong(), kosong()],
    kolomNomor: 0,
    gaya: {},
    kertas: 'A4',
    peran: { rhk: 1, indikator: 2, target_tahunan: 3 },
  };
}

export type BentukSeperti = 'STANDAR' | 'DIREKTUR';
const ROMAWI_TW = ['I', 'II', 'III', 'IV'];

/**
 * Bentuk awal CUSTOM yang SAMA dengan form STANDAR (11 kolom bernomor, 12 fisik) atau DIREKTUR (8 kolom, 10 fisik):
 * kepala 3 baris persis `buildIkiGrid` (lib/iki/layout.ts), satu blok pola 4 baris TW, lebar dari `pdfWidths`,
 * dan peran kolomnya sudah bertanda — jadi Ambil dari Renaksi/Atasan & pemeriksaan target langsung jalan
 * (CONCEPT-iki-custom §12). Kepala di sini WAJIB ikut bila kepala `buildIkiGrid` berubah (dijaga uji).
 */
export function tabelSeperti(varian: BentukSeperti): TabelCustom {
  const dir = varian === 'DIREKTUR';
  const ncol = dir ? 10 : 12;
  const h = (): TabelCell => ({ v: '' });
  const kepala: TabelCell[][] = dir
    ? [
      [sel('No.', { rs: 2 }), sel('Rencana Hasil Kerja', { rs: 2 }), sel('Indikator Kinerja Individu', { cs: 2, rs: 2 }), h(),
        sel('Target\nTahunan', { rs: 2 }), sel('Formulasi', { rs: 2 }), sel('Target Triwulan', { cs: 2, rs: 2 }), h(), sel('Rencana Aksi Triwulan', { cs: 2 }), h()],
      [h(), h(), h(), h(), h(), h(), h(), h(), sel('Uraian'), sel('Target')],
      [sel('1'), sel('2'), sel('3', { cs: 2 }), h(), sel('4'), sel('5'), sel('6', { cs: 2 }), h(), sel('7'), sel('8')],
    ]
    : [
      [sel('No.', { rs: 2 }), sel('Rencana Hasil Kerja\nyang diintervensi', { rs: 2 }), sel('Rencana Hasil Kerja', { rs: 2 }),
        sel('Indikator Kinerja Individu', { cs: 2, rs: 2 }), h(), sel('Target\nTahunan', { rs: 2 }), sel('Formulasi & Ekspetasi\nPimpinan', { rs: 2 }),
        sel('Target Triwulan', { cs: 3, rs: 2 }), h(), h(), sel('Rencana Aksi Triwulan', { cs: 2 }), h()],
      [h(), h(), h(), h(), h(), h(), h(), h(), h(), h(), sel('Uraian'), sel('Target')],
      [sel('1'), sel('2'), sel('3'), sel('4'), sel('5'), sel('6'), sel('7'), sel('8'), sel('9', { cs: 2 }), h(), sel('10'), sel('11')],
    ];
  // Kolom pertama TW (romawi): sesudahnya per baris TW, sebelumnya per RHK (digabung 4 baris).
  const awalTw = dir ? 6 : 8;
  const blok = ROMAWI_TW.map((romawi, i) => Array.from({ length: ncol }, (_, c): TabelCell =>
    (c < awalTw ? (i === 0 ? { v: '', rs: 4 } : { v: '' }) : { v: c === awalTw ? romawi : '' })));
  const mm = dir ? [10, 40, 26, 40, 18, 48, 10, 16, 55, 18] : [8, 30, 30, 22, 30, 16, 38, 16, 9, 14, 52, 16];
  const pxPerMm = lebarTulisPx('A4') / mm.reduce((a, b) => a + b, 0);
  const align: TabelAlign[] = dir
    ? ['center', 'left', 'left', 'left', 'center', 'left', 'center', 'center', 'left', 'center']
    : ['center', 'left', 'left', 'left', 'left', 'center', 'left', 'center', 'center', 'center', 'left', 'center'];
  const peran = dir
    ? { rhk: 1, aspek: 2, indikator: 3, target_tahunan: 4, triwulan: 6, target_tw: 7, aksi_tw: 8, target_aksi: 9 }
    : { rhk_intervensi: 1, rhk: 2, aspek: 3, indikator: 4, target_tahunan: 5, cara_hitung: 7, triwulan: 8, target_tw: 9, aksi_tw: 10, target_aksi: 11 };
  return bacaTabelCustom({
    kolom: Array.from({ length: ncol }, (_, c) => `Kolom ${c + 1}`), align, colWidths: mm.map(w => Math.round(w * pxPerMm)),
    headerRows: 3, rows: [...kepala, ...blok], kolomNomor: 0, gaya: {}, kertas: 'A4', peran,
  });
}

const ALIGN: TabelAlign[] = ['left', 'center', 'right', 'justify'];

/**
 * Isi tersimpan (JSON dari DB, templat, atau payload editor) → bentuk yang selalu utuh: baris
 * sepanjang kolom, gabungan dirapikan, kepala berupa sel (E1 LKJIP), kertas & kolom No. sah.
 */
export function bacaTabelCustom(raw: unknown): TabelCustom {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kolom0 = Array.isArray(o.kolom) && o.kolom.length
    ? o.kolom.slice(0, BATAS_KOLOM_IKI).map(k => String(k ?? ''))
    : ['Kolom 1'];
  const ncol = kolom0.length;
  const hr0 = typeof o.headerRows === 'number' && Number.isInteger(o.headerRows) ? Math.max(0, Math.min(BATAS_BARIS_KEPALA, o.headerRows)) : 0;
  const k = pastikanKepalaSel({ kolom: kolom0, rows: sanitizeRows(normalizeRows(o.rows).slice(0, BATAS_BARIS_IKI), ncol), headerRows: hr0 });
  const rows = k.rows;
  const headerRows = Math.min(k.headerRows ?? 0, rows.length);
  const align = kolom0.map((_, i) => {
    const a = Array.isArray(o.align) ? o.align[i] : undefined;
    return ALIGN.includes(a as TabelAlign) ? (a as TabelAlign) : 'left';
  });
  const colWidths = kolom0.map((_, i) => {
    const w = Array.isArray(o.colWidths) ? Number(o.colWidths[i]) : NaN;
    return Number.isFinite(w) && w >= 24 ? Math.min(2000, Math.round(w)) : LEBAR_KOLOM_BAWAAN;
  });
  const g = (o.gaya && typeof o.gaya === 'object' ? o.gaya : {}) as Record<string, unknown>;
  const gaya: GayaTabel = {};
  if (g.selang === true) gaya.selang = true;
  if (g.jumlah === true) gaya.jumlah = true;
  if (g.mendatar === true) gaya.mendatar = true;
  const kn = o.kolomNomor;
  return {
    kolom: namaKolomDariKepala(rows, headerRows, kolom0),
    align,
    colWidths,
    headerRows,
    rows,
    kolomNomor: typeof kn === 'number' && Number.isInteger(kn) && kn >= 0 && kn < ncol ? kn : null,
    gaya,
    kertas: o.kertas === 'F4' ? 'F4' : 'A4',
    peran: bacaPeran(o.peran, ncol),
  };
}

export function jumlahBarisBadan(t: TabelCustom): number {
  return Math.max(0, t.rows.length - t.headerRows);
}

/** Badan tabel berisi ketikan? Kolom No. otomatis & label I–IV di Kolom TW tidak dihitung — nomor/label saja belum isi. */
export function adaIsiBadan(t: TabelCustom): boolean {
  return t.rows.slice(t.headerRows).some(row => row.some((c, i) => i !== t.kolomNomor && i !== t.peran.triwulan && !c.h && c.v.trim() !== ''));
}

/**
 * Templat menyimpan BENTUK (konsep §4): kepala utuh, lebar, rata, gaya, kertas, peran kolom. Badan dibawa
 * hanya bila diminta; kalau tidak, tersisa satu baris kosong yang mewarisi format baris badan pertama — pola
 * barisnya, bukan isinya. Gabungan badan ikut dibuang: ia menunjuk baris yang tidak ikut. Kecuali tabel
 * TW menurun (4 baris per indikator — §11.2): blok butir pertama dibawa beserta gabungannya, tanpa teks,
 * supaya impor berikutnya punya pola bloknya.
 */
export function bentukTemplat(t: TabelCustom, bawaIsi: boolean): TabelCustom {
  if (bawaIsi) return t;
  const ncol = t.kolom.length;
  const contoh = t.rows[t.headerRows];
  if (contoh && tataLetak(t.peran) === 'menurun') {
    // Satu butir = 4 baris; gabungan yang lebih tinggi (kelompok RHK atasan) terpotong di batas blok oleh sanitizeRows.
    // Label I–IV di Kolom TW ikut — itu bentuk, bukan isi.
    const blok = t.rows.slice(t.headerRows, t.headerRows + 4).map(row => row.map((c, ci) => ({ ...c, v: ci === t.peran.triwulan ? c.v : '' })));
    return { ...t, rows: sanitizeRows([...t.rows.slice(0, t.headerRows), ...blok], ncol) };
  }
  const pola: TabelCell[] = Array.from({ length: ncol }, (_, c) => {
    const asal = contoh?.[c];
    if (!asal || asal.h) return { v: '' };
    const formatSaja: TabelCell = { ...asal, v: '' };
    delete formatSaja.cs; delete formatSaja.rs; delete formatSaja.h;
    return formatSaja;
  });
  const kepala = sanitizeRows(t.rows.slice(0, t.headerRows), ncol);
  return { ...t, rows: [...kepala, pola] };
}

// ── Kisi cetak (PDF & Excel) — SATU penyusun, cermin peran `buildIkiGrid` ──────────

/** 0 = tanpa garis, 1 = garis biasa, 2 = garis tebal (baris JUMLAH / pilihan "Tebal"). */
export type GarisCetak = 0 | 1 | 2;
export type SelCetak = {
  teks: string;
  cs: number;
  rs: number;
  al: TabelAlign;
  va: 'top' | 'middle' | 'bottom';
  b: boolean;
  i: boolean;
  u: boolean;
  /** pt; undefined = ukuran bawaan pengekspor. */
  fs?: number;
  /** Hex 6 digit tanpa '#'. Kepala tanpa warna sendiri = abu IKI. */
  bg?: string;
  fc?: string;
  rot: boolean;
  garis: { t: GarisCetak; r: GarisCetak; b: GarisCetak; l: GarisCetak };
};
export type KisiCetak = {
  ncol: number;
  headerRows: number;
  /** null = tertutup gabungan sel lain. */
  baris: (SelCetak | null)[][];
  /** Lebar kolom editor (px) — pengekspor menyusutkan/merentangkannya sebanding ke lebar kertas. */
  lebarPx: number[];
  kertas: KertasIki;
};

/** Abu kepala tabel IKI — sama dengan STANDAR/DIREKTUR (`export-pdf.ts` GREY, `export-excel.ts` GREY_FILL). */
export const WARNA_KEPALA_IKI = 'D9D9D9';

const garis = (w: number | undefined): GarisCetak => (w === undefined ? 1 : w <= 0 ? 0 : w >= GARIS_JUMLAH ? 2 : 1);

/**
 * Yang dicetak = yang tampil di editor: rumus dihitung (galat jadi "—", aturan Word LKJIP), kolom No.
 * diisi, gaya tabel (berselang, baris JUMLAH, garis mendatar) diterapkan lewat fungsi yang SAMA dengan
 * editor (`gayaSel`/`selBergaya`). Kepala: tebal, rata tengah & tengah-tegak kecuali selnya menyatakan lain.
 */
export function susunKisiCetak(t: TabelCustom): KisiCetak {
  const ncol = t.kolom.length;
  const rows = nomorUlang(t.rows, t.headerRows, t.kolomNomor, !!t.gaya.jumlah);
  const baris = rows.map((row, r) => row.map((mentah, c): SelCetak | null => {
    if (mentah.h) return null;
    const kepala = r < t.headerRows;
    const cell = selBergaya(mentah, gayaSel(t.gaya, rows.length, t.headerRows, r));
    return {
      teks: teksSelWord(rows, r, c),
      cs: Math.max(1, Math.min(cell.cs ?? 1, ncol - c)),
      rs: Math.max(1, Math.min(cell.rs ?? 1, rows.length - r)),
      al: cell.al ?? (kepala ? 'center' : t.align[c] ?? 'left'),
      va: cell.va ?? (kepala ? 'middle' : 'top'),
      b: kepala || !!cell.b,
      i: !!cell.i,
      u: !!cell.u,
      fs: cell.fs,
      bg: cell.bg ?? (kepala ? WARNA_KEPALA_IKI : undefined),
      fc: cell.fc,
      rot: !!cell.rot,
      garis: { t: garis(cell.bd?.t), r: garis(cell.bd?.r), b: garis(cell.bd?.b), l: garis(cell.bd?.l) },
    };
  }));
  return { ncol, headerRows: t.headerRows, baris, lebarPx: t.colWidths.slice(0, ncol), kertas: t.kertas };
}

/** Lebar kolom (mm) di kertas: direntangkan/disusutkan sebanding sampai tepat selebar bidang tulis. */
export function lebarKolomMm(lebarPx: number[], kertas: KertasIki): number[] {
  const total = lebarPx.reduce((a, b) => a + b, 0);
  const tulis = lebarTulisMm(kertas);
  if (!lebarPx.length || total <= 0) return lebarPx.map(() => tulis / Math.max(1, lebarPx.length));
  return lebarPx.map(w => (w * tulis) / total);
}
