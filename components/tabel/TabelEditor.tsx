'use client';
// Editor tabel ala Excel — docs/CONCEPT-lkjip-tabel-excel.md (Tahap A, B, C). Dipakai blok TABEL LKJIP
// dan dokumen IKI CUSTOM (docs/CONCEPT-iki-custom.md §3); CSS-nya di ./tabel-css.ts.
// Memblok (seret, Shift, huruf kolom, nomor baris), papan ketik ala Excel, Delete mengosongkan,
// sisip/hapus baris & kolom sebanyak yang dipilih (gabungan & rumus ikut), lebar kolom di tiap garis.
// Tahap B: potong, tempel nilai, isi-seret, miring/garis bawah/warna huruf, kuas format, Alt+Enter,
// Σ AutoSum, bilah status, menu klik-kanan, kepala tetap terlihat. Tahap C: tempel dari Excel/Word
// lengkap dengan gabungan, urutkan blok, cari & ganti.
// Kepala tabel selalu berupa sel (E1); nama kolom diisi dari judul di kepala (E2).
// Fitur khas LKJIP (judul, sumber, cetak Word, tautan modul) hanya menyala lewat prop `lkjip`.
// Tabel tertaut (CONCEPT-lkjip-tabel-tertaut.md): badan terkunci kecuali kolom isian tangan (E8).
// Aturannya di lib/lkjip/tabel.ts (murni, diuji); berkas ini hanya keadaan layar.

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { toast } from 'sonner';
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Italic, Underline, Combine, Split, Copy, ClipboardPaste, Scissors,
  Undo2, Redo2, Save, Link2, Unlink, RefreshCw, SlidersHorizontal, RotateCcw, Columns3, Paintbrush, Sigma, Search, X,
  ChevronUp, ChevronDown, ArrowDownAZ, ArrowDownZA, ClipboardType, Eraser,
} from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteIcon from '@/components/ui/DeleteIcon';
import { confirmDialog, pilihDialog } from '@/components/ui/ConfirmDialog';
import {
  normalizeRows, sanitizeRows, mergeCells, unmergeAt, pasteRange, rangeToTSV, parseTSV, displayValue, colLabel,
  selGalat, daftarSelGalat, nilaiKetikan, pastikanKepalaSel, namaKolomDariKepala, sisipBaris, hapusBaris, sisipKolom, hapusKolom,
  kosongkanBlok, tanpaFormat, teksDiBaris, ubahJumlahKepala, paskanKeKertas, pxKeCm,
  bacaAtur, gayaSel, selBergaya, nomorUlang, ratakanLebar, blokKeHtml, selSalinan, perluPetunjukLebar, asalSel, sisipBarisBaru, lebarKertasPx, posisiBarisBaru,
  ambilBlok, extractRange, isiSeret, ringkasBlok, autoJumlah, tempelFormat, nilaiSaja, tempelNilai, htmlKeSel, urutkanBlok, cariSel, gantiDiSel, gantiSemua, formatUmum,
  BATAS_KOLOM_TABEL, BATAS_BARIS_TABEL, BATAS_BARIS_KEPALA, LEBAR_KOLOM_BAWAAN, GARIS_JUMLAH,
  type TabelCell, type TabelAlign, type TabelNumFmt, type BentukTabel, type AturTabel, type GayaTabel, type PosisiTabel, type TabelBorder, type Kotak,
} from '@/lib/lkjip/tabel';
import { kalimatPerbarui, pasangBadan, pesanLewatBatas, jumlahBarisKepala, lepasTautan, tulisWaktuTarik, ambilIsianTangan, nilaiPerbarui, kalimatIsianYatim, type Tautan, type PayloadTabel } from '@/lib/lkjip/tautan';
import { fetchJson } from '@/lib/shared/api';
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { usePilihanSel } from './usePilihanSel';
import { RowMenu, type RowMenuItem } from './RowMenu';

/** Fitur khas blok TABEL LKJIP. Modalnya dioper pemakai (dimuat saat dibuka) — komponen bersama tidak menjangkau berkas layar LKJIP. */
export type FiturLkjip = {
  tahunDokumen: number;
  TautanModal: ComponentType<{ payload: PayloadTabel; tahunDokumen: number; onTerapkan: (p: PayloadTabel) => void; onTutup: () => void }>;
};

type TabelP = { judul: string; kolom: string[]; align: TabelAlign[]; colWidths?: number[]; headerRows?: number; rows: TabelCell[][]; tautan?: Tautan };
type Snap = { kolom: string[]; align: TabelAlign[]; colWidths: number[]; headerRows: number; rows: TabelCell[][]; atur: AturTabel };
type Sunting = { r: number; c: number; awal: string; ganti: boolean };

const PESAN_BADAN = 'Badan tabel tertaut mengikuti sumbernya — ubah lewat Atur Bentuk, atau Lepas Tautan untuk menyunting bebas.';
const PESAN_KOLOM_TAUT = 'Kolom tabel tertaut diatur lewat Atur Bentuk.';
const PESAN_NOMOR = 'Kolom No. diisi otomatis 1, 2, 3… — matikan lewat pilihan "No. otomatis" di bawah tabel untuk mengetiknya sendiri.';
const ARAH: Record<string, { dr: number; dc: number }> = {
  ArrowUp: { dr: -1, dc: 0 }, ArrowDown: { dr: 1, dc: 0 }, ArrowLeft: { dr: 0, dc: -1 }, ArrowRight: { dr: 0, dc: 1 },
};
const potong = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Papan klip internal BERSAMA semua tabel di halaman: Ctrl+C di satu tabel lalu Ctrl+V di tabel lain
 *  tetap membawa rumus, format, dan gabungan. Dicocokkan dengan TSV papan klip sistem supaya salinan
 *  dari aplikasi lain sesudahnya tidak tertukar dengan yang lama. */
let papanInternal: { tsv: string; sel: TabelCell[][]; nilai: string[][] } | null = null;
const simpanPapanInternal = (p: NonNullable<typeof papanInternal>) => { papanInternal = p; };
const WARNA_HURUF: [string, string][] = [['C00000', 'Merah'], ['0070C0', 'Biru'], ['00B050', 'Hijau'], ['ED7D31', 'Oranye'], ['7F7F7F', 'Abu']];
const angkaStatus = (n: number) => formatUmum(Math.abs(n) >= 1 ? Math.round(n * 100) / 100 : n);
const cm = (px: number) => pxKeCm(px).toFixed(1).replace('.', ',');
/** Garis sel di layar: 0 = tanpa garis, tebal (≥ GARIS_JUMLAH) = 2px; selain itu garis biasa dari CSS. */
const garisCss = (bd?: TabelBorder): React.CSSProperties => {
  if (!bd) return {};
  const out: React.CSSProperties = {};
  const sisi = [['t', 'Top'], ['r', 'Right'], ['b', 'Bottom'], ['l', 'Left']] as const;
  for (const [k, nama] of sisi) {
    const w = bd[k];
    if (w === undefined) continue;
    if (w <= 0) out[`border${nama}Style`] = 'hidden';
    else if (w >= GARIS_JUMLAH) { out[`border${nama}Style`] = 'solid'; out[`border${nama}Width`] = 2; }
  }
  return out;
};

export default function TabelEditor({
  payload, readOnly, warnaKepala = '', batasKolom = BATAS_KOLOM_TABEL, kertas, onSave, onUbah, lkjip,
}: {
  payload: unknown;
  readOnly: boolean;
  warnaKepala?: string;
  /** LKJIP 12 (halaman Word tegak), IKI CUSTOM 24 — docs/CONCEPT-iki-custom.md §9.1. */
  batasKolom?: number;
  /** Lebar bidang tulis (px editor) + namanya. Tanpa ini: kertas Word LKJIP, tegak/melintang menurut pengaturan Cetak. */
  kertas?: { px: number; nama: string };
  /** Tombol "Simpan Tabel" (satu blok LKJIP = satu simpanan). */
  onSave?: (p: unknown) => void;
  /** Tiap perubahan dilaporkan — untuk halaman yang menyimpan tabel bersama isian lain lewat SATU tombol (IKI). */
  onUbah?: (p: unknown) => void;
  lkjip?: FiturLkjip;
}) {
  // E1: tabel lama ber-headerRows 0 dijadikan 1 baris kepala berisi nama kolom saat dibuka — keluaran
  // Word-nya sama; baru tersimpan begitu orangnya menekan Simpan Tabel.
  const [awal] = useState(() => {
    const p0 = (payload ?? {}) as Partial<TabelP>;
    const kolom0 = p0.kolom?.length ? p0.kolom : ['Kolom 1'];
    const k = pastikanKepalaSel({ kolom: kolom0, rows: sanitizeRows(normalizeRows(p0.rows), kolom0.length), headerRows: p0.headerRows ?? 0 });
    return { p0, kolom0, rows: k.rows, headerRows: k.headerRows ?? 0 };
  });
  // Tabel tertaut (docs/CONCEPT-lkjip-tabel-tertaut.md): badan diisi dari modul, kepala milik pengguna.
  const [tautan, setTautan] = useState<Tautan | undefined>(awal.p0.tautan);
  const [modalTaut, setModalTaut] = useState(false);
  const [menarik, setMenarik] = useState(false);
  const terkait = !!tautan;
  const [judul, setJudul] = useState(awal.p0.judul ?? '');
  const [kolom, setKolom] = useState<string[]>(awal.kolom0);
  const [align, setAlign] = useState<TabelAlign[]>(() => awal.kolom0.map((_, i) => (awal.p0.align?.[i] as TabelAlign | undefined) ?? 'left'));
  const [rows, setRows] = useState<TabelCell[][]>(awal.rows);
  const [colWidths, setColWidths] = useState<number[]>(() => awal.kolom0.map((_, i) => awal.p0.colWidths?.[i] ?? LEBAR_KOLOM_BAWAAN));
  const [headerRows, setHeaderRows] = useState<number>(awal.headerRows);
  // Pengaturan cetak (Tahap W): kertas melintang, posisi, gaya, Sumber, jaga utuh, kolom No.
  const [atur, setAtur] = useState<AturTabel>(() => bacaAtur(awal.p0));
  const ncol = kolom.length;
  const pil = usePilihanSel(rows, ncol);
  const { sel } = pil;
  const rect = pil.kotak;
  const [sunting, setSunting] = useState<Sunting | null>(null);
  const suntingRef = useRef<Sunting | null>(null);
  const [barFocused, setBarFocused] = useState(false);           // sedang mengetik di formula bar
  const barAwal = useRef('');
  const petunjukLebarRef = useRef(false);
  const [adaSalinan, setAdaSalinan] = useState(false);
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const tangkapRef = useRef<HTMLTextAreaElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const resizeRef = useRef<{ ci: number; x: number; w: number } | null>(null);
  const [lebarTip, setLebarTip] = useState<{ ci: number; px: number } | null>(null);
  // Tahap B/C
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [kuas, setKuas] = useState<TabelCell[][] | null>(null);
  const kuasSiap = useRef(false);
  const [isi, setIsi] = useState<{ dari: Kotak; ke: Kotak } | null>(null);
  /** Ctrl+Shift+V: peramban memicu `paste` sesudahnya — tanda ini yang membedakannya dari Ctrl+V. */
  const tempelNilaiPada = useRef(0);
  const [cari, setCari] = useState<{ ganti: boolean; kata: string; dengan: string; ke: number } | null>(null);
  const cariRef = useRef<HTMLInputElement | null>(null);
  const [atasKepala, setAtasKepala] = useState<number[]>([]);
  const sidikTerlaporRef = useRef<string | null>(null);

  const snap = (): Snap => ({ kolom, align, colWidths, headerRows, rows, atur });
  const sameSnap = (a: Snap, b: Snap) => JSON.stringify(a) === JSON.stringify(b);
  const pushHist = () => { const s = snap(); setPast(p => (p.length && sameSnap(p[p.length - 1], s)) ? p : [...p, s].slice(-60)); setFuture([]); };
  const restoreSnap = (s: Snap) => { setKolom(s.kolom); setAlign(s.align); setColWidths(s.colWidths); setHeaderRows(s.headerRows); setRows(s.rows); setAtur(s.atur); pakaiSunting(null); setBarFocused(false); };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setFuture(f => [snap(), ...f].slice(0, 60)); setPast(p => p.slice(0, -1)); restoreSnap(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setPast(p => [...p, snap()].slice(-60)); setFuture(f => f.slice(1)); restoreSnap(nxt); };
  // Kolom No. ikut bergeser saat kolom disisip/dihapus — lewat bentuk tabel yang sama dgn align/colWidths.
  const bentuk = (): BentukTabel => ({ rows, kolom, align, colWidths, headerRows, kolomNomor: atur.kolomNomor });
  const pasangBentuk = (b: BentukTabel) => {
    setRows(b.rows); setKolom(b.kolom); setAlign(b.align); setColWidths(b.colWidths); setHeaderRows(b.headerRows);
    if (b.kolomNomor !== atur.kolomNomor) setAtur(a => ({ ...a, kolomNomor: b.kolomNomor ?? null }));
  };
  const ubahAtur = (ubah: Partial<AturTabel>) => { pushHist(); setAtur(a => ({ ...a, ...ubah })); };
  const ubahGaya = (ubah: Partial<GayaTabel>) => ubahAtur({ gaya: { ...atur.gaya, ...ubah } });
  const pakaiSunting = (s: Sunting | null) => { suntingRef.current = s; setSunting(s); };
  // Papan ketik ditangkap textarea tersembunyi berisi TSV blok terpilih: Ctrl+C bawaan peramban
  // langsung menyalinnya (tanpa izin clipboard — aplikasi ini di intranet http), dan Ctrl+V sampai di onPaste.
  const fokusGrid = () => { const t = tangkapRef.current; if (t) { t.focus({ preventScroll: true }); t.select(); } };

  // Selama tertaut, badan diisi ulang tiap Perbarui: sunting, format, atau gabung di sana akan
  // tertimpa — jadi dikunci. Kepala tabel tetap bebas.
  const diBadan = (r: number) => terkait && r >= headerRows;
  const rectBadan = terkait && !!rect && rect.r2 >= headerRows;
  // Kolom isian tangan (Tahap 2) tetap bisa diketik di badan — isinya diingat per kunci baris.
  const kolomTangan = new Set(tautan?.kolom.flatMap((k, i) => (k.isi.jenis === 'tangan' ? [i] : [])) ?? []);
  const terkunci = (r: number, c: number) => diBadan(r) && !kolomTangan.has(c);
  // Kolom No. otomatis (§12.3): nomornya diturunkan dari bentuk tabel tiap kali digambar, jadi selalu
  // urut sesudah sisip/hapus/tempel; yang disimpan dan dicetak hasil turunan yang sama.
  const kolomNo = terkait || atur.kolomNomor === null || atur.kolomNomor >= ncol ? null : atur.kolomNomor;
  const rowsTampil = useMemo(() => nomorUlang(rows, headerRows, kolomNo, !!atur.gaya.jumlah), [rows, headerRows, kolomNo, atur.gaya.jumlah]);
  const diNomor = (r: number, c: number) => kolomNo !== null && c === kolomNo && r >= headerRows;
  /** Sel yang digambar: gaya tabel di bawah format sel sendiri — editor & Word memakai fungsi yang sama. */
  const efektif = (r: number, c: number) => selBergaya(rowsTampil[r][c], gayaSel(atur.gaya, rowsTampil.length, headerRows, r));
  const ubahSel = (r: number, c: number, v: string) => {
    // Rumus sel menunjuk nomor baris, dan nomor baris bergeser tiap Perbarui.
    if (diBadan(r) && kolomTangan.has(c) && v.trimStart().startsWith('=')) {
      toast.info('Kolom isian tangan tidak menerima rumus — pakai isi "Rumus" lewat Atur Bentuk.', { id: 'tangan-rumus' });
      return false;
    }
    setCell(r, c, v);
    return true;
  };
  const setCell = (ri: number, ci: number, v: string) =>
    setRows(r => r.map((row, i) => i === ri ? row.map((c, j) => j === ci ? { ...c, v } : c) : row));
  /** Ketikan di sel berformat angka disimpan sebagai angka mesin — dibaca dari keadaan TERKINI. */
  const rapikanKetikan = (ri: number, ci: number) =>
    setRows(r => r.map((row, i) => i === ri ? row.map((c, j) => (j === ci ? { ...c, v: nilaiKetikan(c, c.v) } : c)) : row));

  // ── Menyunting (F2 / dobel-klik / langsung mengetik) ──────────────────────────
  const mulaiSunting = (r: number, c: number, ketikan?: string) => {
    if (readOnly || !rows[r]?.[c] || rows[r][c].h) return;
    if (terkunci(r, c)) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    if (diNomor(r, c)) { toast.info(PESAN_NOMOR, { id: 'kolom-nomor' }); return; }
    pushHist();
    if (ketikan !== undefined && !ubahSel(r, c, ketikan)) return;
    pakaiSunting({ r, c, awal: rows[r][c].v, ganti: ketikan !== undefined });
  };
  const selesaiSunting = (arah?: { dr: number; dc: number }) => {
    const s = suntingRef.current;
    if (!s) return;
    rapikanKetikan(s.r, s.c);
    pakaiSunting(null);
    if (arah) pil.gerak(arah.dr, arah.dc);
    fokusGrid();
  };
  // T7: Esc membatalkan — dulu sel cuma ditinggalkan dan ketikannya tetap.
  const batalSunting = () => {
    const s = suntingRef.current;
    if (!s) return;
    pakaiSunting(null);
    setCell(s.r, s.c, s.awal);
    setPast(p => p.slice(0, -1));
    fokusGrid();
  };

  const insertRef = (r: number, c: number) => {
    const s = suntingRef.current;
    const er = s ? s.r : sel?.ar, ec = s ? s.c : sel?.ac;
    if (er === undefined || ec === undefined) return;
    const ref = colLabel(c) + (r + 1);
    const el = editInputRef.current;
    const cur = rows[er]?.[ec]?.v ?? '';
    const from = el?.selectionStart ?? cur.length;
    const to = el?.selectionEnd ?? from;
    setCell(er, ec, cur.slice(0, from) + ref + cur.slice(to));
    requestAnimationFrame(() => {
      const node = editInputRef.current;
      if (node) { node.focus(); const p = from + ref.length; node.setSelectionRange(p, p); }
    });
  };
  /** Alt+Enter = baris baru DI DALAM sel (§5.8) → `<w:br/>` di Word. */
  const sisipGantiBaris = (el: HTMLTextAreaElement, r: number, c: number) => {
    const a = el.selectionStart, b = el.selectionEnd;
    if (!ubahSel(r, c, `${el.value.slice(0, a)}\n${el.value.slice(b)}`)) return;
    requestAnimationFrame(() => { const n = editInputRef.current; if (n) n.setSelectionRange(a + 1, a + 1); });
  };
  const onSelDown = (r: number, c: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Mode rumus: sedang mengetik '=' (di sel / formula bar) → klik sel lain menyisipkan rujukannya (cara Excel).
    const s = suntingRef.current;
    const er = s ? s.r : barFocused ? sel?.ar : undefined;
    const ec = s ? s.c : barFocused ? sel?.ac : undefined;
    if (!readOnly && er !== undefined && ec !== undefined) {
      if (er === r && ec === c && s) return;
      if ((rows[er]?.[ec]?.v ?? '').trim().startsWith('=')) { e.preventDefault(); insertRef(r, c); return; }
    }
    e.preventDefault();
    if (s) selesaiSunting();
    if (kuas) kuasSiap.current = true;
    pil.pilihSel(r, c, e.shiftKey);
    fokusGrid();
  };

  // ── Blok: format, gabung, kosongkan ───────────────────────────────────────────
  const editCells = (fn: (cell: TabelCell) => void) => {
    if (!rect || rectBadan) return;
    pushHist();
    setRows(prev => prev.map((row, r) => row.map((cell, c) =>
      (r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2 && !cell.h)
        ? (() => { const n = { ...cell }; fn(n); return n; })()
        : cell)));
  };
  /** Kolom dipilih penuh → perataan KOLOM (kepala tetap rata tengah); selain itu per sel. */
  const rata = (al: TabelAlign) => {
    if (!rect || rectBadan) return;
    if (!pil.penuhKolom) { editCells(c => { c.al = al; }); return; }
    pushHist();
    setAlign(a => a.map((x, i) => (i >= rect.c1 && i <= rect.c2 ? al : x)));
    setRows(prev => prev.map((row, r) => (r < headerRows ? row : row.map((cell, c) => {
      if (c < rect.c1 || c > rect.c2 || !cell.al) return cell;
      const n = { ...cell }; delete n.al; return n;
    }))));
  };
  const canMerge = !!rect && !rectBadan && (rect.r1 !== rect.r2 || rect.c1 !== rect.c2);
  const origin = rect ? rows[rect.r1]?.[rect.c1] : undefined;
  const canUnmerge = !!origin && !rectBadan && ((origin.cs ?? 1) > 1 || (origin.rs ?? 1) > 1);
  const doMerge = () => { if (!rect) return; pushHist(); setRows(mergeCells(rows, rect.r1, rect.c1, rect.r2, rect.c2, ncol)); pil.setSel({ ar: rect.r1, ac: rect.c1, fr: rect.r1, fc: rect.c1 }); };
  const doUnmerge = () => { if (!rect) return; pushHist(); setRows(unmergeAt(rows, rect.r1, rect.c1, ncol)); };
  const applyBorder = (opt: string) => editCells(c => {
    const bd = { ...(c.bd ?? {}) };
    if (opt === 'all') { bd.t = 4; bd.r = 4; bd.b = 4; bd.l = 4; }
    else if (opt === 'thick') { bd.t = 12; bd.r = 12; bd.b = 12; bd.l = 12; }
    else if (opt === 'none') { bd.t = 0; bd.r = 0; bd.b = 0; bd.l = 0; }
    else if (opt === 't' || opt === 'r' || opt === 'b' || opt === 'l') bd[opt] = 4;
    c.bd = bd;
  });
  /** Delete/Backspace: isi seluruh blok dikosongkan, formatnya tetap (cara Excel). */
  const kosongkan = () => {
    if (!rect || readOnly) return;
    const boleh = (r: number, c: number) => !terkunci(r, c) && !diNomor(r, c);
    let ada = false, ditahan = false;
    for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) {
      const cell = rows[r]?.[c];
      if (!cell || cell.h || cell.v === '') continue;
      if (boleh(r, c)) ada = true; else ditahan = true;
    }
    // Kolom No. tidak pernah aktif di tabel tertaut, jadi yang menahan cukup dibedakan dari `terkait`.
    if (!ada) { if (ditahan) toast.info(terkait ? PESAN_BADAN : PESAN_NOMOR, { id: 'badan-terkunci' }); return; }
    pushHist();
    setRows(kosongkanBlok(rows, rect, boleh));
  };
  const hapusFormatBlok = () => {
    if (!rect || rectBadan) return;
    pushHist();
    setRows(prev => prev.map((row, r) => row.map((cell, c) =>
      (r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2 ? tanpaFormat(cell) : cell))));
  };
  /** Tebal/miring/garis bawah ala Excel: patokannya sel AKTIF — menyala → seluruh blok dimatikan, sebaliknya dinyalakan. */
  const ubahGayaHuruf = (k: 'b' | 'i' | 'u') => {
    if (rectBadan) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    const nyala = !(sel && rows[sel.ar]?.[sel.ac]?.[k]);
    editCells(c => { if (nyala) c[k] = true; else delete c[k]; });
  };

  // ── Kuas format (§5.8): salin format blok, lalu blok berikutnya yang dipilih menerimanya ─────
  const mulaiKuas = () => {
    if (kuas) { setKuas(null); return; }
    if (!rect) return;
    setKuas(extractRange(rows, rect.r1, rect.c1, rect.r2, rect.c2));
    toast.info('Kuas format: pilih sel atau blok tujuan. Esc membatalkan.', { id: 'kuas' });
  };
  const pakaiKuas = () => {
    const pola = kuas;
    setKuas(null);
    if (!pola || !rect) return;
    if (rectBadan) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    pushHist();
    setRows(r => tempelFormat(r, rect, pola, rr => !diBadan(rr)));
  };

  // ── Σ AutoSum & urutkan ────────────────────────────────────────────────────────
  const bolehIsi = (r: number, c: number) => !terkunci(r, c) && !diNomor(r, c);
  const jumlahOtomatis = () => {
    if (!rect || readOnly) return;
    const h = autoJumlah(rows, rect, headerRows, bolehIsi);
    if (!h.sel.length) { toast.info('Tidak ada deret angka tepat di atas atau di kiri sel terpilih — atau sel tujuannya sudah berisi.'); return; }
    pushHist();
    setRows(h.rows);
    if (h.sel.length === 1) pil.keSel(h.sel[0].r, h.sel[0].c);
  };
  function urutkan(turun: boolean) {
    if (!rect || readOnly) return;
    if (terkait) { toast.info('Urutan baris tabel tertaut mengikuti sumbernya — atur lewat Atur Bentuk.'); return; }
    // Satu sel / kolom penuh = seluruh badan diurut menurut kolom itu (Excel meluaskan ke datanya).
    const satu = (rect.r1 === rect.r2 && rect.c1 === rect.c2) || pil.penuhKolom;
    const blok: Kotak = satu ? { r1: headerRows, c1: 0, r2: rows.length - 1, c2: ncol - 1 } : rect;
    const kol = Math.min(Math.max(sel?.ac ?? blok.c1, blok.c1), blok.c2);
    const h = urutkanBlok(rows, blok, kol, turun, headerRows, !!atur.gaya.jumlah);
    if ('galat' in h) { toast.info(h.galat); return; }
    pushHist();
    setRows(h.rows);
    toast.success(`Diurutkan menurut kolom ${colLabel(kol)} (${turun ? 'Z → A' : 'A → Z'}).`, { id: 'urut' });
  }

  // ── Sisip / hapus baris & kolom sebanyak yang dipilih (§5.4) ──────────────────
  function sisip(arah: 'atas' | 'bawah' | 'kiri' | 'kanan') {
    if (!rect || readOnly) return;
    if (arah === 'atas' || arah === 'bawah') {
      const n = rect.r2 - rect.r1 + 1;
      const di = arah === 'atas' ? rect.r1 : rect.r2 + 1;
      // Blok seluruhnya di kepala → baris baru ikut kepala.
      const keKepala = rect.r2 < headerRows;
      if (terkait && !keKepala) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
      if (keKepala && headerRows + n > BATAS_BARIS_KEPALA) { toast.info(`Kepala tabel paling banyak ${BATAS_BARIS_KEPALA} baris.`); return; }
      if (rows.length + n > BATAS_BARIS_TABEL) { toast.info(`Satu tabel paling banyak ${BATAS_BARIS_TABEL} baris.`); return; }
      pushHist();
      pasangBentuk(sisipBaris(bentuk(), di, n, keKepala));
      pil.setSel({ ar: di, ac: rect.c1, fr: di + n - 1, fc: rect.c2 });
      return;
    }
    if (terkait) { toast.info(PESAN_KOLOM_TAUT); return; }
    const n = rect.c2 - rect.c1 + 1;
    if (ncol + n > batasKolom) { toast.info(`Tabel paling banyak ${batasKolom} kolom — tinggal ${batasKolom - ncol} lagi.`); return; }
    const di = arah === 'kiri' ? rect.c1 : rect.c2 + 1;
    pushHist();
    pasangBentuk(sisipKolom(bentuk(), di, n));
    pil.setSel({ ar: rect.r1, ac: di, fr: rect.r2, fc: di + n - 1 });
  }
  // Tab di sel terakhir menambah baris baru (cara Word, §12.4) — tidak di badan tabel tertaut.
  // "Terakhir" = baris data paling bawah: dengan gaya JUMLAH, baris barunya masuk di atas JUMLAH.
  const barisBaruDi = () => posisiBarisBaru(rows.length, headerRows, !!atur.gaya.jumlah);
  const diSelTerakhir = (r: number, c: number) => {
    const br = barisBaruDi() - 1;
    if (br < 0) return false;
    const akhir = asalSel(rows, br, ncol - 1), kini = asalSel(rows, r, c);
    return akhir.r === kini.r && akhir.c === kini.c;
  };
  const barisBaruDiAkhir = () => {
    if (terkait || rows.length >= BATAS_BARIS_TABEL) return false;
    const di = barisBaruDi();
    pushHist();
    // Bentuk fungsional: ketikan yang baru dirapikan `selesaiSunting` di render yang sama tidak tertimpa.
    setRows(r => sisipBarisBaru(r, headerRows, ncol, !!atur.gaya.jumlah).rows);
    // Kursor ke sel pertama yang bisa diketik — kolom No. otomatis menolak ketikan.
    const ac = kolomNo === 0 && ncol > 1 ? 1 : 0;
    pil.setSel({ ar: di, ac, fr: di, fc: ac });
    return true;
  };
  function hapusBarisPilihan() {
    if (!rect || readOnly) return;
    const { r1, r2 } = rect;
    if (terkait && r2 >= headerRows) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    const kepalaTerhapus = Math.max(0, Math.min(r2, headerRows - 1) - r1 + 1);
    if (headerRows > 0 && headerRows - kepalaTerhapus < 1) { toast.info('Tabel harus punya minimal 1 baris kepala — kosongkan isinya saja (Delete), atau sisakan satu baris kepala.'); return; }
    pushHist();
    pasangBentuk(hapusBaris(bentuk(), r1, r2));
    pil.keSel(Math.min(r1, rows.length - (r2 - r1 + 1) - 1), rect.c1);
  }
  function hapusKolomPilihan() {
    if (!rect || readOnly) return;
    if (terkait) { toast.info(PESAN_KOLOM_TAUT); return; }
    const { c1, c2 } = rect;
    if (c2 - c1 + 1 >= ncol) { toast.info('Tabel harus punya minimal 1 kolom.'); return; }
    pushHist();
    pasangBentuk(hapusKolom(bentuk(), c1, c2));
    pil.keSel(rect.r1, Math.min(c1, ncol - (c2 - c1 + 1) - 1));
  }
  /** Ctrl+− / Ctrl+Shift+= — kolom/baris dipilih penuh langsung jalan; selain itu ditanya (cara Excel). */
  async function hapusDariPintasan() {
    if (!rect) return;
    if (pil.penuhKolom && !pil.penuhBaris) { hapusKolomPilihan(); return; }
    if (pil.penuhBaris && !pil.penuhKolom) { hapusBarisPilihan(); return; }
    const p = await pilihDialog({ title: 'Hapus apa?', message: `Blok ${colLabel(rect.c1)}${rect.r1 + 1}:${colLabel(rect.c2)}${rect.r2 + 1}.`, confirmLabel: 'Hapus baris', altLabel: 'Hapus kolom', variant: 'danger', altVariant: 'danger' });
    if (p === 'utama') hapusBarisPilihan(); else if (p === 'lain') hapusKolomPilihan();
  }
  async function sisipDariPintasan() {
    if (!rect) return;
    if (pil.penuhKolom && !pil.penuhBaris) { sisip('kiri'); return; }
    if (pil.penuhBaris && !pil.penuhKolom) { sisip('atas'); return; }
    const p = await pilihDialog({ title: 'Sisip apa?', message: 'Sebanyak baris/kolom yang dipilih.', confirmLabel: 'Baris di atas', altLabel: 'Kolom di kiri', variant: 'primary', altVariant: 'primary' });
    if (p === 'utama') sisip('atas'); else if (p === 'lain') sisip('kiri');
  }

  // E3: jumlah baris kepala diubah dengan MENYISIP/membuang baris di atas badan — tidak lagi
  // "meminjam" baris data. Satu aturan untuk tabel biasa & tertaut (kunci baris badan tetap sejajar).
  const gantiBarisKepala = async (n: number) => {
    const hr = jumlahBarisKepala({ headerRows, rows });
    if (n === hr) return;
    if (n < hr) {
      const hilang = teksDiBaris(rows, n, hr - 1);
      if (hilang.length && !(await confirmDialog({
        title: `Kepala jadi ${n} baris?`,
        message: `Baris kepala ${n + 1}${hr - 1 > n ? `–${hr}` : ''} dibuang beserta isinya: ${hilang.slice(0, 4).map(t => `"${potong(t)}"`).join(', ')}${hilang.length > 4 ? ', …' : ''}.`,
        confirmLabel: 'Buang', variant: 'warning',
      }))) return;
    } else if (rows.length + n - hr > BATAS_BARIS_TABEL) { toast.info(`Satu tabel paling banyak ${BATAS_BARIS_TABEL} baris.`); return; }
    pushHist();
    pasangBentuk(ubahJumlahKepala(bentuk(), n));
  };

  // ── Salin & tempel ─────────────────────────────────────────────────────────────
  const tsvPilihan = useMemo(() => (rect ? rangeToTSV(extractRange(rowsTampil, rect.r1, rect.c1, rect.r2, rect.c2)) : ''), [rowsTampil, rect]);
  /** Isi papan internal — gabungan ikut (`ambilBlok`), nilai saja disiapkan untuk Ctrl+Shift+V. */
  const isiPapanInternal = () => {
    if (!rect) return;
    const nilai: string[][] = [];
    for (let r = rect.r1; r <= rect.r2; r++) {
      const b: string[] = [];
      for (let c = rect.c1; c <= rect.c2; c++) b.push(nilaiSaja(rowsTampil, r, c));
      nilai.push(b);
    }
    simpanPapanInternal({ tsv: tsvPilihan, sel: ambilBlok(rowsTampil, rect), nilai });
    setAdaSalinan(true);
  };
  /** Ctrl+C mengisi papan klip dengan TSV (tempel antarsel) DAN tabel HTML ber-gabungan untuk Word/Excel (§12.4). */
  const salinKePapan = (e: React.ClipboardEvent) => {
    if (!rect) return;
    isiPapanInternal();
    const teks = (r: number, c: number) => displayValue(rowsTampil, r, c);
    const html = blokKeHtml(rowsTampil, rect, teks, (r, c) => selSalinan(efektif(r, c), r < headerRows, align[c], warnaKepala));
    e.clipboardData.setData('text/plain', tsvPilihan);
    e.clipboardData.setData('text/html', html);
    e.preventDefault();
    // Excel tidak ikut melebarkan kolom (diukur) — sekali per editor, hanya bila ada angka yang tak muat.
    if (!petunjukLebarRef.current && perluPetunjukLebar(rowsTampil, rect, teks)) {
      petunjukLebarRef.current = true;
      toast.info('Tersalin. Kalau di Excel muncul "####", klik dua kali garis batas kolomnya — Excel tidak ikut melebarkan kolom.', { duration: 7000 });
    }
  };
  useEffect(() => {
    const t = tangkapRef.current;
    if (t && document.activeElement === t) t.select();
  }, [tsvPilihan]);
  const doCopy = (diam = false) => {
    if (!rect) return;
    isiPapanInternal();
    fokusGrid();
    // execCommand memicu `onCopy` textarea (salinKePapan) — TSV + HTML sekaligus.
    // Cadangan writeText ditolak bila halaman tak fokus / izin papan klip diblokir — ditangkap, bukan dibiarkan jadi unhandledRejection.
    try { if (!document.execCommand('copy')) navigator.clipboard?.writeText(tsvPilihan).catch(() => { /* papan internal tetap terisi */ }); } catch { /* best-effort */ }
    if (!diam) toast.success('Sel disalin');
  };
  /** Ctrl+X (§5.6): salin lalu langsung kosongkan — Ctrl+Z mengembalikannya (lebih sederhana dari Excel yang menunggu ditempel). */
  const potongKePapan = (e: React.ClipboardEvent) => {
    if (!rect) return;
    salinKePapan(e);
    if (!readOnly) kosongkan();
  };
  const doCut = () => { doCopy(true); if (!readOnly) kosongkan(); };

  /** Tempel nilai saja (Ctrl+Shift+V): format sel TUJUAN tetap. Di badan tertaut hanya kolom isian tangan, tanpa rumus. */
  function tempelNilaiDari(nilai: string[][]) {
    if (!rect || readOnly || !nilai.length) return;
    const lebar = Math.max(...nilai.map(r => r.length));
    if (rect.c1 + lebar > ncol) toast.info(`${rect.c1 + lebar - ncol} kolom terakhir tempelan tidak muat — tabel ini ${ncol} kolom.`);
    const muatBaris = Math.max(0, BATAS_BARIS_TABEL - rect.r1);
    if (nilai.length > muatBaris) toast.info(`${nilai.length - muatBaris} baris terakhir tempelan tidak muat — satu tabel paling banyak ${BATAS_BARIS_TABEL} baris.`);
    if (terkait && rect.r1 + nilai.length > rows.length) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    let ditahan = 0;
    const boleh = (r: number, c: number, teks: string) => {
      const ok = bolehIsi(r, c) && !(diBadan(r) && teks.trimStart().startsWith('='));
      if (!ok) ditahan++;
      return ok;
    };
    pushHist();
    const hasil = tempelNilai(rows, rect.r1, rect.c1, nilai.slice(0, muatBaris).map(r => r.slice(0, ncol - rect.c1)), ncol, boleh);
    setRows(hasil);
    if (ditahan) toast.info(terkait ? `${ditahan} sel dilewati — ${PESAN_BADAN}` : `${ditahan} sel kolom No. dilewati — nomornya diisi otomatis.`, { id: 'badan-terkunci' });
  }
  async function tempel(grid: TabelCell[][]) {
    if (!rect || readOnly || !grid.length) return;
    // Badan tertaut: hanya nilai ke kolom isian tangan (§6) — format & gabungan di sana tertimpa tiap Perbarui.
    if (rectBadan) {
      const kolomTempel = Array.from({ length: Math.max(...grid.map(r => r.length)) }, (_, j) => rect.c1 + j);
      if (kolomTempel.every(c => kolomTangan.has(c))) { tempelNilaiDari(grid.map(r => r.map(c => c.v))); return; }
      toast.info(PESAN_BADAN, { id: 'badan-terkunci' });
      return;
    }
    let b = bentuk();
    const lebar = Math.max(...grid.map(r => r.length));
    const kurang = rect.c1 + lebar - ncol;
    // T6: tempelan yang lebih lebar dari tabel dulu dibuang kolom kelebihannya diam-diam.
    if (kurang > 0) {
      const muat = terkait ? 0 : Math.min(kurang, batasKolom - ncol);
      if (muat <= 0) {
        toast.info(`${kurang} kolom terakhir tempelan tidak muat — tabel ini ${ncol} kolom${terkait ? ' (kolom tabel tertaut diatur lewat Atur Bentuk)' : `, batasnya ${batasKolom}`}.`);
      } else {
        const p = await pilihDialog({
          title: 'Tempelan lebih lebar dari tabel',
          message: `Tempelan ${lebar} kolom mulai di kolom ${colLabel(rect.c1)}, tabel ini cuma sampai kolom ${colLabel(ncol - 1)}.`
            + (kurang > muat ? ` Batas tabel ${batasKolom} kolom, jadi ${kurang - muat} kolom terakhir tetap tidak muat.` : ''),
          confirmLabel: `Tambah ${muat} kolom & tempel`, altLabel: 'Tempel tanpa menambah', variant: 'primary', altVariant: 'warning',
        });
        if (p === null) return;
        if (p === 'utama') b = sisipKolom(b, ncol, muat);
      }
    }
    const muatBaris = Math.max(0, BATAS_BARIS_TABEL - rect.r1);
    if (grid.length > muatBaris) toast.info(`${grid.length - muatBaris} baris terakhir tempelan tidak muat — satu tabel paling banyak ${BATAS_BARIS_TABEL} baris.`);
    if (terkait && rect.r1 + grid.length > headerRows) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    pushHist();
    pasangBentuk({ ...b, rows: pasteRange(b.rows, rect.r1, rect.c1, grid.slice(0, muatBaris), b.kolom.length) });
  }
  const onPaste = (e: React.ClipboardEvent) => {
    if (readOnly || suntingRef.current) return;
    const text = e.clipboardData.getData('text/plain');
    const html = e.clipboardData.getData('text/html');
    e.preventDefault();
    // Waktu kejadian keydown & paste satu sumber jam (timeStamp peristiwa) — tanpa Date.now() di komponen.
    const nilaiSaja = tempelNilaiPada.current > 0 && e.timeStamp - tempelNilaiPada.current < 1500;
    tempelNilaiPada.current = 0;
    if (!text && !html) return;
    // Tempelan internal yang sama persis → pakai versi kaya-format (rumus, format, gabungan).
    const internal = papanInternal && papanInternal.tsv === text.replace(/\r?\n$/, '') ? papanInternal : null;
    if (internal) { if (nilaiSaja) tempelNilaiDari(internal.nilai); else void tempel(internal.sel); return; }
    // Tahap C: dari Excel/Word/Google Sheets lengkap dengan gabungan & tebal; tanpa tabel HTML → TSV.
    // Tempel nilai juga membaca HTML-nya: TSV Word memecah sel berparagraf jadi beberapa baris, dan
    // angka Excel bersetelan Inggris hanya bisa dikenali dari pernyataan pemisah di HTML-nya.
    const dariHtml = html ? htmlKeSel(html, batasKolom) : null;
    if (nilaiSaja) { tempelNilaiDari(dariHtml ? dariHtml.map(r => r.map(c => (c.h ? '' : c.v))) : parseTSV(text).map(r => r.map(c => c.v))); return; }
    void tempel(dariHtml || parseTSV(text));
  };
  /** Tombol & menu Tempel hanya bisa memakai papan internal — peramban tidak memberi isi papan klip sistem tanpa Ctrl+V. */
  const tempelInternal = (nilai: boolean) => {
    if (!papanInternal) return;
    if (nilai) tempelNilaiDari(papanInternal.nilai); else void tempel(papanInternal.sel);
  };

  // ── Papan ketik di kisi (§5.2) ─────────────────────────────────────────────────
  const onGridKey = (e: React.KeyboardEvent) => {
    if (suntingRef.current || e.nativeEvent.isComposing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const kl = k.toLowerCase();
    if (ctrl && (kl === 'c' || kl === 'x')) return;   // peramban memicu onCopy / onCut
    if (ctrl && kl === 'a') { e.preventDefault(); pil.pilihSemua(); return; }
    if (ctrl && (kl === 'f' || kl === 'h')) { e.preventDefault(); bukaCari(kl === 'h' && !readOnly); return; }
    if (k === 'Escape' && (kuas || isi)) { e.preventDefault(); setKuas(null); setIsi(null); return; }
    if (readOnly) {
      if (ARAH[k]) { e.preventDefault(); pil.gerak(ARAH[k].dr, ARAH[k].dc, { perluas: e.shiftKey, lompat: ctrl }); }
      return;
    }
    if (ctrl && kl === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrl && (kl === 'y' || (kl === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    // Ctrl+Shift+V: peramban tetap memicu onPaste (sebagai teks polos) — tandanya dibaca di sana.
    if (ctrl && kl === 'v') { if (e.shiftKey) tempelNilaiPada.current = e.timeStamp; return; }
    if (ctrl && !e.shiftKey && (kl === 'b' || kl === 'i' || kl === 'u')) { e.preventDefault(); ubahGayaHuruf(kl); return; }
    if (e.altKey && (k === '=' || k === '+')) { e.preventDefault(); jumlahOtomatis(); return; }
    if (ctrl && (k === '-' || k === '_')) { e.preventDefault(); void hapusDariPintasan(); return; }
    if (ctrl && e.shiftKey && (k === '+' || k === '=')) { e.preventDefault(); void sisipDariPintasan(); return; }
    if (!sel) { if (ARAH[k]) { e.preventDefault(); pil.keSel(0, 0); } return; }
    if (ARAH[k]) { e.preventDefault(); pil.gerak(ARAH[k].dr, ARAH[k].dc, { perluas: e.shiftKey, lompat: ctrl }); return; }
    if (k === 'Tab') {
      e.preventDefault();
      if (!e.shiftKey && diSelTerakhir(sel.ar, sel.ac) && barisBaruDiAkhir()) return;
      pil.gerak(0, e.shiftKey ? -1 : 1);
      return;
    }
    if (k === 'Enter') { e.preventDefault(); pil.gerak(e.shiftKey ? -1 : 1, 0); return; }
    if (k === 'Home') { e.preventDefault(); pil.keSel(ctrl ? 0 : sel.ar, 0); return; }
    if (k === 'End') { e.preventDefault(); pil.keSel(ctrl ? rows.length - 1 : sel.ar, ncol - 1); return; }
    if (k === 'F2') { e.preventDefault(); mulaiSunting(sel.ar, sel.ac); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); kosongkan(); return; }
    if (!ctrl && !e.altKey && k.length === 1) { e.preventDefault(); mulaiSunting(sel.ar, sel.ac, k); }
  };
  // Sel aktif yang digerakkan papan ketik selalu terlihat.
  const fr = sel?.fr, fc = sel?.fc;
  useEffect(() => {
    if (fr === undefined || document.activeElement !== tangkapRef.current) return;
    gridRef.current?.querySelector(`[data-rc="${fr}:${fc}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [fr, fc]);

  // ── Kuas & isi-seret selesai saat tombol tetikus dilepas (di mana pun) ───────
  // Effect event: pendengar `mouseup` dipasang sekali, tapi memakai keadaan render TERAKHIR.
  const lepasTetikus = useEffectEvent(() => {
    if (isi) {
      const { dari, ke } = isi;
      setIsi(null);
      if (ke.r2 === dari.r2 && ke.c2 === dari.c2) return;
      const h = isiSeret(rows, dari, ke, bolehIsi);
      if ('galat' in h) { toast.info(h.galat); return; }
      pushHist();
      setRows(h.rows);
      pil.setSel({ ar: dari.r1, ac: dari.c1, fr: ke.r2, fc: ke.c2 });
      return;
    }
    // Hanya sesudah memilih TUJUAN: mouseup klik tombol Kuas sendiri juga sampai ke sini.
    if (kuas && kuasSiap.current) { kuasSiap.current = false; pakaiKuas(); }
  });
  useEffect(() => {
    const lepas = () => { requestAnimationFrame(() => lepasTetikus()); };
    window.addEventListener('mouseup', lepas);
    return () => window.removeEventListener('mouseup', lepas);
  }, []);
  const mulaiIsi = (e: React.MouseEvent) => {
    if (!rect || readOnly || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setIsi({ dari: rect, ke: rect });
  };
  /** Isi-seret mengikuti arah terjauh dari pojok blok: ke bawah atau ke kanan (konsep §5.7). */
  const seretIsi = (r: number, c: number) => setIsi(s => {
    if (!s) return s;
    const k = s.dari, dr = r - k.r2, dc = c - k.c2;
    const ke = dr > 0 && dr >= dc ? { ...k, r2: r } : dc > 0 ? { ...k, c2: c } : k;
    return ke.r2 === s.ke.r2 && ke.c2 === s.ke.c2 ? s : { ...s, ke };
  });
  const diIsi = (r: number, c: number) => !!isi && r >= isi.ke.r1 && r <= isi.ke.r2 && c >= isi.ke.c1 && c <= isi.ke.c2
    && !(r >= isi.dari.r1 && r <= isi.dari.r2 && c >= isi.dari.c1 && c <= isi.dari.c2);
  const pojok = rect && !readOnly && !sunting ? asalSel(rows, rect.r2, rect.c2) : null;

  // ── Cari & ganti (Tahap C) ─────────────────────────────────────────────────────
  const kataCari = cari?.kata ?? '';
  const temuan = useMemo(() => (kataCari ? cariSel(rowsTampil, kataCari) : []), [rowsTampil, kataCari]);
  function bukaCari(ganti: boolean) {
    setCari(c => ({ ganti, kata: c?.kata ?? '', dengan: c?.dengan ?? '', ke: 0 }));
    requestAnimationFrame(() => { cariRef.current?.focus(); cariRef.current?.select(); });
  }
  const tutupCari = () => { setCari(null); fokusGrid(); };
  const keTemuan = (i: number) => {
    if (!temuan.length) return;
    const j = ((i % temuan.length) + temuan.length) % temuan.length;
    setCari(c => (c ? { ...c, ke: j } : c));
    pil.keSel(temuan[j].r, temuan[j].c);
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-rc="${temuan[j].r}:${temuan[j].c}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  };
  const gantiSekarang = () => {
    if (!cari?.kata || !temuan.length) return;
    const t = temuan[Math.min(cari.ke, temuan.length - 1)];
    if (!bolehIsi(t.r, t.c)) { toast.info(terkait ? PESAN_BADAN : PESAN_NOMOR, { id: 'badan-terkunci' }); keTemuan(cari.ke + 1); return; }
    const cell = rows[t.r][t.c];
    const g = gantiDiSel(cell.v, cari.kata, cari.dengan);
    if (!g.n) { toast.info('Cocok di tampilan sel saja (angka berformat) — sunting selnya langsung.'); keTemuan(cari.ke + 1); return; }
    pushHist();
    setCell(t.r, t.c, nilaiKetikan(cell, g.v));
  };
  const gantiSemuanya = () => {
    if (!cari?.kata) return;
    const h = gantiSemua(rows, cari.kata, cari.dengan, bolehIsi);
    if (!h.n) { toast.info(h.ditahan ? `${h.ditahan} sel cocok tapi tidak bisa diganti (terkunci, kolom No., atau hanya cocok di tampilan angka).` : 'Tidak ditemukan.'); return; }
    pushHist();
    setRows(h.rows);
    toast.success(`${h.n} diganti di ${h.sel} sel${h.ditahan ? ` · ${h.ditahan} sel dilewati (terkunci, kolom No., atau hanya cocok di tampilan angka)` : ''}.`);
  };

  // ── Kepala & huruf kolom tetap terlihat saat tabel panjang digulir (§5.11) ─────
  // Tiap baris kepala `position: sticky` dengan jarak atas = tinggi huruf kolom + baris kepala di atasnya.
  useLayoutEffect(() => {
    const tabel = gridRef.current?.querySelector('table.lk-tabel');
    if (!tabel) return;
    const huruf = (tabel.querySelector('thead tr') as HTMLElement | null)?.offsetHeight ?? 0;
    const tinggi = Array.from(tabel.querySelectorAll('tbody tr.lk-hrow')).map(tr => (tr as HTMLElement).offsetHeight);
    const atas = tinggi.map((_, i) => huruf + tinggi.slice(0, i).reduce((a, b) => a + b, 0));
    setAtasKepala(p => (p.length === atas.length && p.every((x, i) => x === atas[i]) ? p : atas));
  }, [rowsTampil, colWidths, headerRows, sunting, atur]);

  // ── Menu klik-kanan (§5.10): aksi yang tak berlaku tampil mati beserta alasannya ─
  const bukaMenu = (e: React.MouseEvent, pilih: () => void, kena: boolean) => {
    e.preventDefault();
    if (suntingRef.current) selesaiSunting();
    if (!kena) pilih();
    fokusGrid();
    setMenu({ x: e.clientX, y: e.clientY });
  };
  const ringkas = useMemo(() => (rect ? ringkasBlok(rowsTampil, rect) : null), [rowsTampil, rect]);

  // ── Lebar kolom: pegangan di tiap garis, dobel-klik = paskan isi (§5.5) ───────
  const onResizeDown = (ci: number, e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault(); e.stopPropagation();
    pushHist();
    resizeRef.current = { ci, x: e.clientX, w: colWidths[ci] ?? LEBAR_KOLOM_BAWAAN };
    setLebarTip({ ci, px: colWidths[ci] ?? LEBAR_KOLOM_BAWAAN });
    const move = (ev: MouseEvent) => {
      const rz = resizeRef.current; if (!rz) return;
      const next = Math.max(40, Math.min(800, rz.w + (ev.clientX - rz.x)));
      setColWidths(cw => cw.map((x, i) => i === rz.ci ? next : x));
      setLebarTip({ ci: rz.ci, px: next });
    };
    const up = () => { resizeRef.current = null; setLebarTip(null); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  /** Lebar sel terpanjang di Word (huruf ± 11 pt) — perkiraan, cukup untuk "paskan ke isi". */
  const paskanIsi = (ci: number) => {
    if (readOnly) return;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    let maks = 0;
    rows.forEach((row, r) => {
      const cell = row[ci];
      if (!cell || cell.h || (cell.cs ?? 1) > 1) return;
      ctx.font = `${cell.b || r < headerRows ? 'bold ' : ''}${cell.fs ? Math.round((cell.fs * 4) / 3) : 15}px Arial`;
      maks = Math.max(maks, ctx.measureText(displayValue(rows, r, ci)).width);
    });
    pushHist();
    const w = Math.max(40, Math.min(800, Math.ceil(maks + 18)));
    setColWidths(cw => cw.map((x, i) => (i === ci ? w : x)));
  };
  const lebarTotal = colWidths.reduce((a, b) => a + b, 0);
  // Batas kertas: pemakai yang menyebut kertasnya sendiri (IKI: A4/F4 mendatar), selain itu kertas Word
  // LKJIP mengikuti orientasi tabel — 15,5 cm tegak, 24,2 cm melintang (§12.2).
  const kertasPx = kertas?.px ?? lebarKertasPx(atur.melintang);
  const lebihKertas = lebarTotal > kertasPx;
  /** "Ratakan lebar kolom" (Distribute Columns): kolom yang dipilih sama lebar, jumlahnya tetap. */
  const ratakanKolom = () => {
    if (!rect || rect.c2 <= rect.c1) return;
    pushHist();
    setColWidths(ratakanLebar(colWidths, rect.c1, rect.c2));
  };

  // ── Simpan, Perbarui, Lepas ───────────────────────────────────────────────────
  // Isian tangan dibaca dari badan SAAT INI — peta di resep ikut ketikan terakhir, bukan simpanan terakhir.
  // Pengaturan cetak ikut tiap payload — juga lewat modal Atur Bentuk & Perbarui, yang menyalin payload ini.
  // Baris yang disimpan = yang tampil (kolom No. sudah terisi), jadi grafik & Word membaca angka yang sama.
  const payloadSekarang = (): PayloadTabel & AturTabel => ({
    judul, kolom: namaKolomDariKepala(rows, headerRows, kolom), align, colWidths, headerRows, rows: rowsTampil,
    ...atur, sumber: atur.sumber.trim(), kolomNomor: kolomNo,
    ...(tautan ? { tautan: ambilIsianTangan(tautan, rows.slice(jumlahBarisKepala({ headerRows, rows }))) } : {}),
  });
  /** Hubungkan / Perbarui / Lepas langsung disimpan: ketiganya keputusan yang sudah ditanyakan. */
  const pasangDanSimpan = (masuk: PayloadTabel) => {
    // Tabel tertaut punya Nomor urut sendiri — kolom No. otomatis dilepas begitu dihubungkan.
    const p = masuk.tautan ? { ...masuk, kolomNomor: null } : masuk;
    // Judul ikut: templat mengisi judul yang masih kosong — tanpa ini Simpan Tabel berikutnya mengosongkannya lagi.
    setJudul(p.judul); setKolom(p.kolom); setAlign(p.align as TabelAlign[]);
    setColWidths(p.kolom.map((_, i) => p.colWidths?.[i] ?? LEBAR_KOLOM_BAWAAN));
    setHeaderRows(p.headerRows ?? 0); setRows(p.rows); setTautan(p.tautan); setAtur(bacaAtur(p));
    // Riwayat urungkan dikosongkan: memulihkan baris tanpa ikut memulihkan resepnya membuat
    // keduanya tidak sejajar lagi (server menolaknya, tapi layar sudah terlanjur salah).
    setPast([]); setFuture([]); pil.setSel(null); pakaiSunting(null);
    onSave?.(p);
  };
  async function perbarui() {
    if (!tautan || !lkjip) return;
    setMenarik(true);
    try {
      const { DAFTAR_SUMBER } = await import('@/lib/lkjip/sumber');
      const sumber = DAFTAR_SUMBER[tautan.sumber];
      const hasil = await sumber.tarik(tautan.setelan, url => fetchJson<unknown>(url), lkjip.tahunDokumen);
      const sekarang = payloadSekarang() as PayloadTabel & { tautan: Tautan };
      const nilai = nilaiPerbarui(sekarang, hasil);
      const hr = jumlahBarisKepala({ headerRows, rows });
      if (nilai.sama) {
        toast.success(`Sudah sama dengan ${sumber.modul} saat ini — tidak ada yang perlu diperbarui.`);
        return;
      }
      const { badan, ringkas } = nilai;
      const rowsBaru = pasangBadan(sekarang, badan);
      if (!rowsBaru) { toast.error(pesanLewatBatas(badan.rows.length, hr)); return; }
      const yatim = kalimatIsianYatim(nilai.yatim, { rows: rows.slice(hr), kunciBaris: tautan.kunciBaris });
      const peringatan = (badan.kolomHilang.length
        ? `\n\nKolom ${badan.kolomHilang.map(colLabel).join(', ')} menunjuk kolom sumber yang tidak ada lagi dan akan kosong — atur lewat Atur Bentuk.`
        : '') + (yatim ? `\n\n${yatim}` : '');
      const ok = await confirmDialog({
        title: `Perbarui dari ${sumber.modul}?`,
        message: `${kalimatPerbarui(ringkas)}\n\nSumber: ${hasil.ringkas}${peringatan}\n\nKepala tabel, pilihan kolom, dan baris yang disembunyikan tetap seperti sekarang.`,
        confirmLabel: 'Terapkan',
        variant: 'warning',
      });
      if (!ok) return;
      pasangDanSimpan({ ...sekarang, rows: rowsBaru, tautan: { ...nilai.tautanBaru, ditarikPada: waktuSekarangWIB().slice(0, 16) } });
    } catch (e) {
      toast.error(e instanceof Error && e.name === 'GagalTarik' ? e.message : 'Gagal menarik data. Coba lagi.');
    } finally { setMenarik(false); }
  }
  async function lepas() {
    if (!tautan) return;
    const ok = await confirmDialog({
      title: 'Lepas tautan?',
      message: 'Tabel jadi tabel biasa: isinya tetap, semua sel bisa disunting dan digabung, tapi tombol Perbarui hilang — angkanya tidak bisa lagi diambil ulang dari modul.\n\nKalau berubah pikiran, pulihkan lewat Riwayat versi dokumen.',
      confirmLabel: 'Lepas tautan',
      variant: 'warning',
    });
    if (ok) pasangDanSimpan(lepasTautan(payloadSekarang()));
  }

  const galat = useMemo(() => daftarSelGalat(rowsTampil), [rowsTampil]);
  // `onUbah`: tiap perubahan dilaporkan ke pemakai yang menyimpan lewat tombolnya sendiri (IKI, konsep
  // iki-custom §9.4). Isi saat dibuka jadi patokan, tidak dilaporkan — termasuk hasil E1 (kepala jadi sel),
  // kalau tidak, membuka dokumen saja sudah menyalakan "belum tersimpan".
  const laporUbah = useEffectEvent(() => {
    if (!onUbah) return;
    const p = payloadSekarang();
    const sidik = JSON.stringify(p);
    if (sidikTerlaporRef.current === null) { sidikTerlaporRef.current = sidik; return; }
    if (sidik === sidikTerlaporRef.current) return;
    sidikTerlaporRef.current = sidik;
    onUbah(p);
  });
  useEffect(() => { laporUbah(); }, [judul, kolom, align, colWidths, headerRows, rowsTampil, atur, tautan]);
  /** Memilih kolom No.: isi badan kolom itu diganti nomor urut — ditanya dulu kalau ada teks lain. */
  const pilihKolomNomor = async (v: string) => {
    if (v === '') { ubahAtur({ kolomNomor: null }); return; }
    const c = Number(v);
    const lain = nomorUlang(rows, headerRows, c, !!atur.gaya.jumlah)
      .flatMap((row, r) => (r >= headerRows && row[c] !== rows[r][c] && rows[r][c].v.trim() ? [rows[r][c].v.trim()] : []));
    if (lain.length && !(await confirmDialog({
      title: `Kolom ${colLabel(c)} jadi nomor urut?`,
      message: `Isi badan kolom ${colLabel(c)} diganti 1, 2, 3… — ${lain.length} sel berisi teks lain, mis. ${lain.slice(0, 3).map(t => `"${potong(t)}"`).join(', ')}.`,
      confirmLabel: 'Ganti jadi nomor', variant: 'warning',
    }))) return;
    ubahAtur({ kolomNomor: c });
  };
  const vAlignCss = (va?: TabelCell['va']) => va === 'middle' ? 'middle' : va === 'bottom' ? 'bottom' : 'top';
  const diPilih = (r: number, c: number) => !!rect && r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;
  const kunciBlok = !rect || rectBadan;
  const pilihanSel = <T extends string>(v: string, fn: (v: T) => void) => { if (v) fn(v as T); };

  /** Aksi menu klik-kanan: tutup menu, jalankan, kembalikan fokus ke kisi (papan ketik tetap jalan). */
  const pilihMenu = (kunci: string) => {
    setMenu(null);
    switch (kunci) {
      case 'potong': doCut(); break;
      case 'salin': doCopy(); break;
      case 'tempel': tempelInternal(false); break;
      case 'tempel-nilai': tempelInternal(true); break;
      case 'sisip-atas': sisip('atas'); break;
      case 'sisip-bawah': sisip('bawah'); break;
      case 'sisip-kiri': sisip('kiri'); break;
      case 'sisip-kanan': sisip('kanan'); break;
      case 'urut-az': urutkan(false); break;
      case 'urut-za': urutkan(true); break;
      case 'gabung': doMerge(); break;
      case 'pisah': doUnmerge(); break;
      case 'format': hapusFormatBlok(); break;
      case 'kosongkan': kosongkan(); break;
      case 'hapus-baris': hapusBarisPilihan(); break;
      case 'hapus-kolom': hapusKolomPilihan(); break;
    }
    fokusGrid();
  };
  const tutupMenu = () => { setMenu(null); fokusGrid(); };

  return (
    <div className="lk-tabel-ed">
      {lkjip && <input className="lk-tabel-judul" value={judul} readOnly={readOnly} placeholder="Judul tabel (tanpa nomor — nomor otomatis)" onChange={e => setJudul(e.target.value)} />}

      {!readOnly && (
        // Tombol tidak mengambil fokus dari kisi — papan ketik tetap jalan sesudah menekan tombol.
        <div className="lk-tabel-tools" onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
          <button aria-label="Urungkan" data-tooltip="Urungkan (Ctrl+Z)" data-tooltip-pos="below" disabled={!past.length} onClick={undo}><Undo2 size={14} /></button>
          <button aria-label="Ulangi" data-tooltip="Ulangi (Ctrl+Y)" data-tooltip-pos="below" disabled={!future.length} onClick={redo}><Redo2 size={14} /></button>
          <span className="lk-tt-sep" />
          <span className="lk-tt-tip" data-tooltip="Sisip sebanyak baris/kolom yang dipilih (Ctrl+Shift+=)" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Sisip baris atau kolom" disabled={!rect} value=""
            onChange={e => { pilihanSel<'atas' | 'bawah' | 'kiri' | 'kanan'>(e.target.value, sisip); e.currentTarget.value = ''; }}>
            <option value="">Sisip ▾</option>
            <option value="atas">Baris di atas</option><option value="bawah">Baris di bawah</option>
            <option value="kiri">Kolom di kiri</option><option value="kanan">Kolom di kanan</option>
          </select></span>
          <span className="lk-tt-tip" data-tooltip="Hapus baris/kolom yang dipilih (Ctrl+−) · Delete mengosongkan isi" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Hapus baris, kolom, isi, atau format" disabled={!rect} value=""
            onChange={e => {
              const v = e.target.value; e.currentTarget.value = '';
              if (v === 'baris') hapusBarisPilihan(); else if (v === 'kolom') hapusKolomPilihan();
              else if (v === 'isi') kosongkan(); else if (v === 'format') hapusFormatBlok();
              fokusGrid();
            }}>
            <option value="">Hapus ▾</option>
            <option value="baris">Hapus baris</option><option value="kolom">Hapus kolom</option>
            <option value="isi">Kosongkan isi (Delete)</option><option value="format" disabled={kunciBlok}>Hapus format</option>
          </select></span>
          <span className="lk-tt-sep" />
          <button aria-label="Gabung sel" data-tooltip="Gabung sel" data-tooltip-pos="below" disabled={!canMerge} onClick={doMerge}><Combine size={14} /></button>
          <button aria-label="Pisah sel" data-tooltip="Pisah sel" data-tooltip-pos="below" disabled={!canUnmerge} onClick={doUnmerge}><Split size={14} /></button>
          <span className="lk-tt-sep" />
          <button aria-label="Rata kiri" data-tooltip="Rata kiri" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('left')}><AlignLeft size={14} /></button>
          <button aria-label="Rata tengah" data-tooltip="Rata tengah" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('center')}><AlignCenter size={14} /></button>
          <button aria-label="Rata kanan" data-tooltip="Rata kanan" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('right')}><AlignRight size={14} /></button>
          <button aria-label="Rata kiri-kanan" data-tooltip="Rata kiri-kanan" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('justify')}><AlignJustify size={14} /></button>
          <span className="lk-tt-sep" />
          <button aria-label="Rata vertikal atas" data-tooltip="Vertikal atas" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => editCells(c => { c.va = 'top'; })}>⤒</button>
          <button aria-label="Rata vertikal tengah" data-tooltip="Vertikal tengah" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => editCells(c => { c.va = 'middle'; })}>⇕</button>
          <button aria-label="Rata vertikal bawah" data-tooltip="Vertikal bawah" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => editCells(c => { c.va = 'bottom'; })}>⤓</button>
          <span className="lk-tt-sep" />
          <button aria-label="Tebal" data-tooltip="Tebal (Ctrl+B)" data-tooltip-pos="below" disabled={kunciBlok} className={origin?.b ? 'on' : undefined} onClick={() => ubahGayaHuruf('b')}><Bold size={14} /></button>
          <button aria-label="Miring" data-tooltip="Miring (Ctrl+I)" data-tooltip-pos="below" disabled={kunciBlok} className={origin?.i ? 'on' : undefined} onClick={() => ubahGayaHuruf('i')}><Italic size={14} /></button>
          <button aria-label="Garis bawah" data-tooltip="Garis bawah (Ctrl+U)" data-tooltip-pos="below" disabled={kunciBlok} className={origin?.u ? 'on' : undefined} onClick={() => ubahGayaHuruf('u')}><Underline size={14} /></button>
          <span className="lk-tt-tip" data-tooltip="Warna huruf" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Warna huruf" disabled={kunciBlok} value=""
            onChange={e => { const v = e.target.value; if (!v) return; if (v === 'none') editCells(c => { delete c.fc; }); else editCells(c => { c.fc = v; }); e.currentTarget.value = ''; }}>
            <option value="">A</option>
            <option value="none">Otomatis</option>
            {WARNA_HURUF.map(([hex, nama]) => <option key={hex} value={hex}>{nama}</option>)}
          </select></span>
          <button aria-label="Kuas format" data-tooltip={kuas ? 'Kuas aktif — pilih blok tujuan (Esc membatalkan)' : 'Kuas format: salin format blok ini ke blok lain'} data-tooltip-pos="below"
            disabled={!rect && !kuas} className={kuas ? 'on' : undefined} onClick={mulaiKuas}><Paintbrush size={14} /></button>
          <button aria-label="Teks tegak" data-tooltip="Teks tegak (dibaca dari bawah ke atas) — untuk kepala kolom sempit" data-tooltip-pos="below" disabled={kunciBlok}
            onClick={() => { const tegak = !origin?.rot; editCells(c => { if (tegak) c.rot = true; else delete c.rot; }); }}><RotateCcw size={14} /></button>
          <button aria-label="Ratakan lebar kolom" data-tooltip="Ratakan lebar kolom yang dipilih" data-tooltip-pos="below" disabled={!rect || rect.c2 <= rect.c1}
            onClick={ratakanKolom}><Columns3 size={14} /></button>
          <span className="lk-tt-sep" />
          <span className="lk-tt-tip" data-tooltip="Jumlah baris kepala tabel — baris disisip/dibuang tepat di atas badan" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Jumlah baris kepala tabel" value={String(headerRows)}
            onChange={e => void gantiBarisKepala(Number(e.target.value))}>
            {headerRows === 0 && <option value="0" disabled>Kepala: nama kolom</option>}
            {Array.from({ length: BATAS_BARIS_KEPALA }, (_, i) => i + 1).map(n => <option key={n} value={n}>Kepala: {n} baris</option>)}
          </select></span>
          <span className="lk-tt-tip" data-tooltip="Ukuran font" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Ukuran font" disabled={kunciBlok} value=""
            onChange={e => { const v = e.target.value; if (!v) return; if (v === 'reset') editCells(c => { delete c.fs; }); else editCells(c => { c.fs = +v; }); e.currentTarget.value = ''; }}>
            <option value="">Aa</option>
            {[9, 10, 11, 12, 14, 16, 18, 20, 24, 28].map(s => <option key={s} value={s}>{s}</option>)}
            <option value="reset">Reset</option>
          </select></span>
          <span className="lk-tt-tip" data-tooltip="Garis sel" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Garis sel" disabled={kunciBlok} value=""
            onChange={e => { const v = e.target.value; if (v) applyBorder(v); e.currentTarget.value = ''; }}>
            <option value="">Garis</option>
            <option value="all">Semua</option>
            <option value="thick">Tebal</option>
            <option value="none">Tidak ada</option>
            <option value="t">+ Atas</option><option value="b">+ Bawah</option>
            <option value="l">+ Kiri</option><option value="r">+ Kanan</option>
          </select></span>
          <span className="lk-tt-tip" data-tooltip="Format angka" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Format angka" disabled={kunciBlok} value=""
            onChange={e => { const v = e.target.value; if (!v) return; if (v === 'plain') editCells(c => { delete c.nf; delete c.dec; }); else editCells(c => { c.nf = v as TabelNumFmt; }); e.currentTarget.value = ''; }}>
            <option value="">123</option>
            <option value="num">Angka</option><option value="rp">Rupiah</option><option value="pct">Persen</option><option value="plain">Teks</option>
          </select></span>
          <span className="lk-tt-tip" data-tooltip="Desimal" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Desimal" disabled={kunciBlok} value=""
            onChange={e => { const v = e.target.value; if (v === '') return; editCells(c => { c.dec = +v; }); e.currentTarget.value = ''; }}>
            <option value="">0,0</option>
            {[0, 1, 2, 3].map(d => <option key={d} value={d}>{d} des</option>)}
          </select></span>
          <span className="lk-tt-tip" data-tooltip="Warna latar sel" data-tooltip-pos="below"><select className="lk-tt-sel" aria-label="Warna latar sel" disabled={kunciBlok} value=""
            onChange={e => { const v = e.target.value; if (!v) return; if (v === 'none') editCells(c => { delete c.bg; }); else editCells(c => { c.bg = v; }); e.currentTarget.value = ''; }}>
            <option value="">Latar</option>
            <option value="none">Tanpa</option>
            <option value="D9D9D9">Abu</option>
            <option value="FFF2CC">Kuning</option>
            <option value="E2EFDA">Hijau</option>
            <option value="DDEBF7">Biru</option>
            <option value="FCE4E4">Merah</option>
          </select></span>
          <span className="lk-tt-sep" />
          <button aria-label="Potong" data-tooltip="Potong (Ctrl+X)" data-tooltip-pos="below" disabled={!rect} onClick={doCut}><Scissors size={14} /></button>
          <button aria-label="Salin" data-tooltip="Salin (Ctrl+C)" data-tooltip-pos="below" disabled={!rect} onClick={() => doCopy()}><Copy size={14} /></button>
          <button aria-label="Tempel" data-tooltip="Tempel (Ctrl+V) · nilai saja: Ctrl+Shift+V" data-tooltip-pos="below" disabled={!rect || (!adaSalinan && !papanInternal)} onClick={() => tempelInternal(false)}><ClipboardPaste size={14} /></button>
          <span className="lk-tt-sep" />
          <button aria-label="Jumlah otomatis" data-tooltip="Σ Jumlah otomatis (Alt+=) — deret angka di atas atau di kiri sel" data-tooltip-pos="below" disabled={!rect} onClick={jumlahOtomatis}><Sigma size={14} /></button>
          <button aria-label="Urutkan A ke Z" data-tooltip="Urutkan A → Z menurut kolom sel aktif" data-tooltip-pos="below" disabled={!rect || terkait} onClick={() => urutkan(false)}><ArrowDownAZ size={14} /></button>
          <button aria-label="Urutkan Z ke A" data-tooltip="Urutkan Z → A menurut kolom sel aktif" data-tooltip-pos="below" disabled={!rect || terkait} onClick={() => urutkan(true)}><ArrowDownZA size={14} /></button>
          <button aria-label="Cari dan ganti" data-tooltip="Cari & ganti (Ctrl+F / Ctrl+H)" data-tooltip-pos="below" className={cari ? 'on' : undefined} onClick={() => (cari ? tutupCari() : bukaCari(false))}><Search size={14} /></button>
        </div>
      )}

      {!readOnly && (
        <div className="lk-fbar">
          <span className="lk-fbar-ref">{sel ? colLabel(sel.ac) + (sel.ar + 1) : '—'}</span>
          <span className="lk-fbar-fx">fx</span>
          {/* textarea, bukan input: <input> membuang baris baru (Alt+Enter) dari nilainya. */}
          <textarea className="lk-fbar-in" disabled={!sel || terkunci(sel.ar, sel.ac) || diNomor(sel.ar, sel.ac)}
            rows={Math.min(4, Math.max(1, (sel ? (rows[sel.ar]?.[sel.ac]?.v ?? '') : '').split('\n').length))}
            value={sel ? (rows[sel.ar]?.[sel.ac]?.v ?? '') : ''}
            placeholder="Pilih sel — ketik teks atau = untuk rumus (mis. =A1+B1)"
            onFocus={e => { if (sel) { pushHist(); barAwal.current = rows[sel.ar]?.[sel.ac]?.v ?? ''; setBarFocused(true); editInputRef.current = e.currentTarget; } }}
            onBlur={() => { setBarFocused(false); if (sel) rapikanKetikan(sel.ar, sel.ac); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.altKey) { e.preventDefault(); if (sel) sisipGantiBaris(e.currentTarget, sel.ar, sel.ac); }
              else if (e.key === 'Enter') { e.preventDefault(); fokusGrid(); }
              else if (e.key === 'Escape') { e.preventDefault(); if (sel) { setCell(sel.ar, sel.ac, barAwal.current); setPast(p => p.slice(0, -1)); } fokusGrid(); }
            }}
            onChange={e => { if (sel) ubahSel(sel.ar, sel.ac, e.target.value); }} />
        </div>
      )}

      {cari && (
        <div className="lk-cari" role="search">
          <Search size={13} className="lk-cari-ic" />
          <input ref={cariRef} className="lk-cari-in" value={cari.kata} placeholder="Cari di tabel…" aria-label="Cari di tabel"
            onChange={e => setCari(c => (c ? { ...c, kata: e.target.value, ke: 0 } : c))}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); keTemuan(cari.ke + (e.shiftKey ? -1 : 1) * (temuan.length && sel && temuan[cari.ke]?.r === sel.ar && temuan[cari.ke]?.c === sel.ac ? 1 : 0)); }
              else if (e.key === 'Escape') { e.preventDefault(); tutupCari(); }
            }} />
          <span className="lk-cari-n">{cari.kata ? (temuan.length ? `${Math.min(cari.ke, temuan.length - 1) + 1} dari ${temuan.length}` : 'tidak ada') : ''}</span>
          <button aria-label="Temuan sebelumnya" disabled={!temuan.length} onClick={() => keTemuan(cari.ke - 1)}><ChevronUp size={14} /></button>
          <button aria-label="Temuan berikutnya" disabled={!temuan.length} onClick={() => keTemuan(cari.ke + 1)}><ChevronDown size={14} /></button>
          {!readOnly && (cari.ganti ? (
            <>
              <input className="lk-cari-in" value={cari.dengan} placeholder="Ganti dengan…" aria-label="Ganti dengan"
                onChange={e => setCari(c => (c ? { ...c, dengan: e.target.value } : c))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); gantiSekarang(); } else if (e.key === 'Escape') { e.preventDefault(); tutupCari(); } }} />
              <button className="lk-cari-teks" disabled={!temuan.length} onClick={gantiSekarang}>Ganti</button>
              <button className="lk-cari-teks" disabled={!temuan.length} onClick={gantiSemuanya}>Ganti semua</button>
            </>
          ) : <button className="lk-cari-teks" onClick={() => setCari(c => (c ? { ...c, ganti: true } : c))}>Ganti…</button>)}
          <button aria-label="Tutup pencarian" onClick={tutupCari}><X size={14} /></button>
        </div>
      )}

      <div className={`lk-tabel-scroll${kuas ? ' lk-kuas' : ''}`} ref={gridRef}>
        <textarea ref={tangkapRef} className="lk-tangkap" aria-label="Sel tabel terpilih" value={tsvPilihan} readOnly={readOnly}
          // Ketikan biasa ditangani onKeyDown; teks yang masuk TANPA keydown (IME, papan ketik ponsel,
          // alat bantu) tiba di sini — dipakai untuk mulai menyunting, isinya tetap TSV blok terpilih.
          onChange={e => {
            const masuk = e.nativeEvent as InputEvent;
            if (!readOnly && sel && masuk.inputType === 'insertText' && masuk.data) mulaiSunting(sel.ar, sel.ac, masuk.data);
          }}
          onKeyDown={onGridKey} onPaste={onPaste} onCopy={salinKePapan} onCut={potongKePapan} />
        <div className="lk-tabel-kanvas">
          {/* Lebar = jumlah lebar kolom (+ kolom nomor baris 38 px). Dulu 'auto': tabel yang lebih lebar dari wadahnya
              DIPERAS (LKJIP 5 × 140 px tampil 107–122 px, IKI 20 kolom 17 px — terukur 2026-10-21), jadi lebar yang
              diatur & dicetak tidak sama dengan yang terlihat, dan garis batas kertas meleset dari kolomnya. */}
          <table className="lk-tabel" style={{ tableLayout: 'fixed', width: 38 + lebarTotal }}>
            <colgroup>
              <col style={{ width: 38 }} />
              {kolom.map((_, ci) => <col key={ci} style={{ width: colWidths[ci] ?? LEBAR_KOLOM_BAWAAN }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="lk-rownum lk-sudut" onMouseDown={e => { e.preventDefault(); pil.pilihSemua(); fokusGrid(); }} aria-label="Pilih semua sel" />
                {kolom.map((_, ci) => (
                  <th key={ci} className={`lk-colhead${rect && ci >= rect.c1 && ci <= rect.c2 ? ' aktif' : ''}`}
                    onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); if (kuas) kuasSiap.current = true; pil.pilihKolom(ci, e.shiftKey); fokusGrid(); }}
                    onContextMenu={e => bukaMenu(e, () => pil.setSel({ ar: 0, ac: ci, fr: rows.length - 1, fc: ci }), !!rect && pil.penuhKolom && ci >= rect.c1 && ci <= rect.c2)}
                    onMouseEnter={() => pil.seretKolom(ci)}>
                    {colLabel(ci)}
                    {lebarTip?.ci === ci && <span className="lk-lebar-tip">{cm(lebarTip.px)} cm</span>}
                    {!readOnly && <span className="lk-colresize" onMouseDown={e => onResizeDown(ci, e)} onDoubleClick={e => { e.stopPropagation(); paskanIsi(ci); }} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsTampil.map((row, ri) => (
                <tr key={ri} className={ri < headerRows ? 'lk-hrow' : undefined}
                  style={ri < headerRows && atasKepala[ri] !== undefined ? ({ '--lk-atas': `${atasKepala[ri]}px` } as React.CSSProperties) : undefined}>
                  <td className={`lk-rownum${rect && ri >= rect.r1 && ri <= rect.r2 ? ' aktif' : ''}`}
                    onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); if (kuas) kuasSiap.current = true; pil.pilihBaris(ri, e.shiftKey); fokusGrid(); }}
                    onContextMenu={e => bukaMenu(e, () => pil.setSel({ ar: ri, ac: 0, fr: ri, fc: ncol - 1 }), !!rect && pil.penuhBaris && ri >= rect.r1 && ri <= rect.r2)}
                    onMouseEnter={() => pil.seretBaris(ri)}>{ri + 1}</td>
                  {row.map((cell, ci) => {
                    if (cell.h) return null;
                    const ef = efektif(ri, ci);
                    const sedang = sunting?.r === ri && sunting?.c === ci;
                    const tampil = sedang || (barFocused && sel?.ar === ri && sel?.ac === ci) ? cell.v : displayValue(rowsTampil, ri, ci);
                    const gaya: React.CSSProperties = {
                      textAlign: (ef.al ?? (ri < headerRows ? 'center' : align[ci]) ?? 'left'), fontWeight: ef.b ? 700 : undefined, fontSize: ef.fs ? `${ef.fs}px` : undefined,
                      fontStyle: ef.i ? 'italic' : undefined, textDecoration: ef.u ? 'underline' : undefined,
                      color: ef.fc ? `#${ef.fc}` : ef.bg ? '#0F0F12' : undefined,
                    };
                    return (
                      <td key={ci} data-rc={`${ri}:${ci}`} colSpan={cell.cs ?? 1} rowSpan={cell.rs ?? 1}
                        className={[
                          diPilih(ri, ci) ? 'lk-cell-sel' : '', sel?.ar === ri && sel?.ac === ci ? 'lk-cell-aktif' : '',
                          diBadan(ri) && kolomTangan.has(ci) ? 'lk-cell-tangan' : '', !sedang && selGalat(tampil) ? 'lk-cell-galat' : '',
                          diNomor(ri, ci) ? 'lk-cell-nomor' : '', diIsi(ri, ci) ? 'lk-cell-isi' : '', pojok?.r === ri && pojok?.c === ci ? 'lk-pojok' : '',
                        ].filter(Boolean).join(' ') || undefined}
                        style={{ verticalAlign: vAlignCss(ef.va), background: ef.bg ? `#${ef.bg}` : undefined, ...garisCss(ef.bd) }}
                        onMouseDown={e => onSelDown(ri, ci, e)}
                        onContextMenu={e => bukaMenu(e, () => pil.keSel(ri, ci), diPilih(ri, ci))}
                        onMouseEnter={() => (isi ? seretIsi(ri, ci) : pil.seretSel(ri, ci))}
                        onDoubleClick={() => mulaiSunting(ri, ci)}>
                        {sedang ? (
                          <textarea autoFocus value={cell.v} style={gaya} className="lk-sel-edit" rows={Math.max(1, cell.v.split('\n').length)}
                            ref={n => { if (n) editInputRef.current = n; }}
                            onFocus={e => { const n = e.currentTarget; const p = n.value.length; n.setSelectionRange(p, p); }}
                            onKeyDown={e => {
                              e.stopPropagation();
                              if (e.key === 'Enter' && e.altKey) { e.preventDefault(); sisipGantiBaris(e.currentTarget, ri, ci); }
                              else if (e.key === 'Enter') { e.preventDefault(); selesaiSunting({ dr: e.shiftKey ? -1 : 1, dc: 0 }); }
                              else if (e.key === 'Tab') {
                                e.preventDefault();
                                if (!e.shiftKey && diSelTerakhir(ri, ci)) { selesaiSunting(); barisBaruDiAkhir(); }
                                else selesaiSunting({ dr: 0, dc: e.shiftKey ? -1 : 1 });
                              }
                              else if (e.key === 'Escape') { e.preventDefault(); batalSunting(); }
                              // Mulai dengan mengetik (bukan F2) → panah menyelesaikan & pindah, seperti Excel.
                              else if (sunting?.ganti && ARAH[e.key] && !e.shiftKey) { e.preventDefault(); selesaiSunting(ARAH[e.key]); }
                            }}
                            onBlur={() => selesaiSunting()}
                            onChange={e => ubahSel(ri, ci, e.target.value)} />
                        ) : (
                          <div className={`lk-sel-isi${ef.rot ? ' tegak' : ''}`} style={gaya}>{tampil}</div>
                        )}
                        {pojok?.r === ri && pojok?.c === ci && (
                          <span className="lk-isi-pegangan" aria-hidden onMouseDown={mulaiIsi} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Batas bidang tulis (15,5 cm tegak / 24,2 cm melintang) — kolom di kanannya keluar kertas di Word. */}
          <div className={`lk-batas-kertas${lebihKertas ? ' lewat' : ''}`} style={{ left: 38 + kertasPx }} aria-hidden />
        </div>
      </div>

      {/* Bilah status (§5.9): mencocokkan angka tanpa menulis rumus. */}
      {ringkas && ringkas.banyak >= 2 && (
        <div className="lk-tabel-status" aria-live="polite">
          {ringkas.banyakAngka > 0 && <span>Jumlah <b>{angkaStatus(ringkas.jumlah)}</b></span>}
          {ringkas.rataRata !== null && <span>Rata-rata <b>{angkaStatus(ringkas.rataRata)}</b></span>}
          <span>Banyak <b>{ringkas.banyak}</b></span>
        </div>
      )}

      {lkjip && (!readOnly || atur.sumber.trim()) && (
        <input className="lk-tabel-sumber" value={atur.sumber} readOnly={readOnly} maxLength={300} aria-label="Sumber tabel"
          placeholder="Sumber (opsional) — mis. Bagian Keuangan, 2026 · dicetak miring di bawah tabel"
          onFocus={() => { if (!readOnly) pushHist(); }}
          onChange={e => setAtur(a => ({ ...a, sumber: e.target.value }))} />
      )}

      {!readOnly && (
        <div className="lk-tabel-atur">
          <span className="lk-tabel-atur-judul">Cetak</span>
          {lkjip && (<>
            <span className="lk-tt-tip" data-tooltip="Melintang: tabel ini dapat halaman melintang sendiri (± 24,2 cm), nomor halaman tetap bersambung" data-tooltip-pos="below">
              <select className="lk-tt-sel" aria-label="Arah kertas" value={atur.melintang ? '1' : ''} onChange={e => ubahAtur({ melintang: e.target.value === '1' })}>
                <option value="">Kertas tegak</option><option value="1">Kertas melintang</option>
              </select></span>
            <span className="lk-tt-tip" data-tooltip="Letak tabel di halaman. Selebar kertas: kolom direntangkan sebanding sampai ke kedua margin" data-tooltip-pos="below">
              <select className="lk-tt-sel" aria-label="Posisi tabel" value={atur.posisi} onChange={e => ubahAtur({ posisi: e.target.value as PosisiTabel })}>
                <option value="tengah">Di tengah</option><option value="kiri">Rata kiri</option><option value="penuh">Selebar kertas</option>
              </select></span>
          </>)}
          <span className="lk-tt-tip" data-tooltip={terkait ? 'Tabel tertaut punya Nomor urut sendiri — atur lewat Atur Bentuk' : 'Kolom yang diisi 1, 2, 3… sendiri; baris judul kelompok (sel gabungan) dilewati'} data-tooltip-pos="below">
            <select className="lk-tt-sel" aria-label="Kolom nomor otomatis" disabled={terkait} value={kolomNo === null ? '' : String(kolomNo)} onChange={e => void pilihKolomNomor(e.target.value)}>
              <option value="">No. otomatis: —</option>
              {kolom.map((_, c) => <option key={c} value={c}>No. otomatis: kolom {colLabel(c)}</option>)}
            </select></span>
          <label className="lk-tabel-atur-cek" data-tooltip="Latar abu muda selang-seling di badan tabel" data-tooltip-pos="below">
            <input type="checkbox" checked={!!atur.gaya.selang} onChange={e => ubahGaya({ selang: e.target.checked })} /> Berselang
          </label>
          <label className="lk-tabel-atur-cek" data-tooltip="Baris terakhir dicetak tebal dengan garis atas tebal — untuk baris JUMLAH" data-tooltip-pos="below">
            <input type="checkbox" checked={!!atur.gaya.jumlah} onChange={e => ubahGaya({ jumlah: e.target.checked })} /> Baris jumlah
          </label>
          <label className="lk-tabel-atur-cek" data-tooltip="Tanpa garis tegak — gaya laporan modern" data-tooltip-pos="below">
            <input type="checkbox" checked={!!atur.gaya.mendatar} onChange={e => ubahGaya({ mendatar: e.target.checked })} /> Garis mendatar
          </label>
          {lkjip && (
            <label className="lk-tabel-atur-cek" data-tooltip="Tabel tidak dipotong ke halaman berikut selama muat satu halaman" data-tooltip-pos="below">
              <input type="checkbox" checked={atur.utuh} onChange={e => ubahAtur({ utuh: e.target.checked })} /> Jaga utuh
            </label>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="lk-tabel-petunjuk">
          Seret untuk memblok · klik huruf kolom / nomor baris untuk satu kolom/baris penuh · klik kanan untuk semua aksi ·
          Delete mengosongkan · seret kotak kecil di pojok blok untuk mengisi ke bawah/kanan (1, 2 → 3 · Jan → Feb · TW I → II) ·
          Alt+Enter baris baru di dalam sel · Alt+= jumlah otomatis · Ctrl+Shift+V tempel nilai saja · Ctrl+F cari ·
          tempelan dari Excel/Word membawa gabungan & tebalnya · seret garis di antara huruf kolom untuk lebarnya (dobel-klik = paskan isi) ·
          Tab di sel terakhir menambah baris
        </div>
      )}
      {lebihKertas && (
        <div className="lk-tabel-lebar">
          {kertas
            ? <span>Lebar tabel {cm(lebarTotal)} cm — lebih lebar dari kertas {kertas.nama} ({cm(kertasPx)} cm). Saat diunduh tabel disusutkan otomatis, jadi kolomnya lebih sempit dari yang terlihat di sini.</span>
            : <span>Lebar tabel {cm(lebarTotal)} cm — lebih lebar dari kertas {atur.melintang ? 'melintang' : 'tegak'} ({cm(kertasPx)} cm). Di Word tabel disusutkan otomatis, jadi kolomnya lebih sempit dari yang terlihat di sini{atur.melintang ? '' : ' — atau cetak tabel ini di kertas melintang (pilihan Cetak di bawah tabel)'}.</span>}
          {!readOnly && <button onClick={() => { pushHist(); setColWidths(paskanKeKertas(colWidths, kertasPx)); }}>Paskan ke lebar kertas</button>}
        </div>
      )}
      {galat.length > 0 && (
        <div className="lk-tabel-galat">
          {galat.length} sel rumus galat ({galat.slice(0, 6).join(', ')}{galat.length > 6 ? ', …' : ''}) — {lkjip ? 'di Word' : 'saat diunduh'} dicetak &quot;—&quot;. Periksa rumusnya.
        </div>
      )}

      {tautan && (
        // Keterangan sumber hanya di editor — tidak ikut ke Word (keputusan pemilik, konsep K3).
        <div className="lk-taut-bar">
          <div className="lk-taut-bar-info">
            <Link2 size={13} style={{ flexShrink: 0 }} />
            <span>Tertaut: <b>{tautan.ringkas}</b> · ditarik {tulisWaktuTarik(tautan.ditarikPada)}</span>
          </div>
          {tautan.catatan.length > 0 && (
            <ul className="lk-taut-bar-catatan">{tautan.catatan.map((c, i) => <li key={i}>{c}</li>)}</ul>
          )}
          {!readOnly && (
            <div className="lk-taut-bar-aksi">
              <button onClick={() => void perbarui()} disabled={menarik}><RefreshCw size={13} /> {menarik ? 'Menarik…' : 'Perbarui'}</button>
              <button onClick={() => setModalTaut(true)} disabled={menarik}><SlidersHorizontal size={13} /> Atur Bentuk</button>
              <button onClick={() => void lepas()} disabled={menarik}><Unlink size={13} /> Lepas Tautan</button>
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="lk-tabel-ctl">
          <button onClick={() => { if (rows.length >= BATAS_BARIS_TABEL) { toast.info(`Satu tabel paling banyak ${BATAS_BARIS_TABEL} baris.`); return; } pushHist(); setRows(sisipBarisBaru(rows, headerRows, ncol, !!atur.gaya.jumlah).rows); }} disabled={terkait} data-tooltip={terkait ? 'Baris tabel tertaut mengikuti sumbernya — atur lewat Atur Bentuk' : undefined} data-tooltip-pos="below">+ Baris</button>
          <button onClick={() => { pushHist(); pasangBentuk(sisipKolom(bentuk(), ncol, 1)); }} disabled={ncol >= batasKolom || terkait} data-tooltip={terkait ? PESAN_KOLOM_TAUT : undefined} data-tooltip-pos="below">+ Kolom</button>
          {!terkait && lkjip && (
            <button onClick={() => setModalTaut(true)} data-tooltip="Isi tabel dari menu Cetak E-Anggaran atau Renaksi — angkanya bisa diperbarui nanti" data-tooltip-pos="below">
              <Link2 size={12} style={{ display: 'inline', verticalAlign: '-0.125em' }} /> Hubungkan ke Modul
            </button>
          )}
          {onSave && <PrimaButton menulis variant="primary" size="sm" iconLeft={<Save size={14} />} onClick={() => onSave(payloadSekarang())}>Simpan Tabel</PrimaButton>}
        </div>
      )}

      {menu && rect && (() => {
        const alasanBadan = PESAN_BADAN;
        const badanTaut = terkait && rect.r2 >= headerRows;
        const lewatBatasKolom = ncol + (rect.c2 - rect.c1 + 1) > batasKolom;
        const items: RowMenuItem[] = [
          { icon: <Scissors size={14} />, label: 'Potong', pintasan: 'Ctrl+X', kunci: 'potong', disabled: readOnly, alasan: 'Dokumen terkunci' },
          { icon: <Copy size={14} />, label: 'Salin', pintasan: 'Ctrl+C', kunci: 'salin' },
          { icon: <ClipboardPaste size={14} />, label: 'Tempel', pintasan: 'Ctrl+V', kunci: 'tempel', disabled: readOnly || !papanInternal, alasan: readOnly ? 'Dokumen terkunci' : 'Belum ada yang disalin dari tabel — dari aplikasi lain pakai Ctrl+V' },
          { icon: <ClipboardType size={14} />, label: 'Tempel nilai saja', pintasan: 'Ctrl+Shift+V', kunci: 'tempel-nilai', disabled: readOnly || !papanInternal, alasan: readOnly ? 'Dokumen terkunci' : 'Belum ada yang disalin dari tabel — dari aplikasi lain pakai Ctrl+Shift+V' },
          { icon: <span className="lk-menu-teks">↑</span>, label: `Sisip ${rect.r2 - rect.r1 + 1} baris di atas`, kunci: 'sisip-atas', disabled: readOnly || badanTaut, alasan: readOnly ? 'Dokumen terkunci' : alasanBadan, pisah: true },
          { icon: <span className="lk-menu-teks">↓</span>, label: `Sisip ${rect.r2 - rect.r1 + 1} baris di bawah`, kunci: 'sisip-bawah', disabled: readOnly || badanTaut, alasan: readOnly ? 'Dokumen terkunci' : alasanBadan },
          { icon: <span className="lk-menu-teks">←</span>, label: `Sisip ${rect.c2 - rect.c1 + 1} kolom di kiri`, kunci: 'sisip-kiri', disabled: readOnly || terkait || lewatBatasKolom, alasan: readOnly ? 'Dokumen terkunci' : terkait ? PESAN_KOLOM_TAUT : `Tabel paling banyak ${batasKolom} kolom` },
          { icon: <span className="lk-menu-teks">→</span>, label: `Sisip ${rect.c2 - rect.c1 + 1} kolom di kanan`, kunci: 'sisip-kanan', disabled: readOnly || terkait || lewatBatasKolom, alasan: readOnly ? 'Dokumen terkunci' : terkait ? PESAN_KOLOM_TAUT : `Tabel paling banyak ${batasKolom} kolom` },
          { icon: <ArrowDownAZ size={14} />, label: 'Urutkan A → Z', kunci: 'urut-az', disabled: readOnly || terkait, alasan: readOnly ? 'Dokumen terkunci' : 'Urutan baris tabel tertaut mengikuti sumbernya', pisah: true },
          { icon: <ArrowDownZA size={14} />, label: 'Urutkan Z → A', kunci: 'urut-za', disabled: readOnly || terkait, alasan: readOnly ? 'Dokumen terkunci' : 'Urutan baris tabel tertaut mengikuti sumbernya' },
          { icon: <Combine size={14} />, label: 'Gabung sel', kunci: 'gabung', disabled: readOnly || !canMerge, alasan: rectBadan ? alasanBadan : 'Pilih lebih dari satu sel', pisah: true },
          { icon: <Split size={14} />, label: 'Pisah sel', kunci: 'pisah', disabled: readOnly || !canUnmerge, alasan: rectBadan ? alasanBadan : 'Sel ini tidak digabung' },
          { icon: <Eraser size={14} />, label: 'Hapus format', kunci: 'format', disabled: readOnly || rectBadan, alasan: readOnly ? 'Dokumen terkunci' : alasanBadan },
          { icon: <span className="lk-menu-teks">⌫</span>, label: 'Kosongkan isi', pintasan: 'Delete', kunci: 'kosongkan', disabled: readOnly, alasan: 'Dokumen terkunci' },
          { icon: <DeleteIcon size={14} />, label: `Hapus ${rect.r2 - rect.r1 + 1} baris`, pintasan: 'Ctrl+−', kunci: 'hapus-baris', danger: true, disabled: readOnly || (terkait && rect.r2 >= headerRows), alasan: readOnly ? 'Dokumen terkunci' : alasanBadan },
          { icon: <DeleteIcon size={14} />, label: `Hapus ${rect.c2 - rect.c1 + 1} kolom`, kunci: 'hapus-kolom', danger: true, disabled: readOnly || terkait || rect.c2 - rect.c1 + 1 >= ncol, alasan: readOnly ? 'Dokumen terkunci' : terkait ? PESAN_KOLOM_TAUT : 'Tabel harus punya minimal 1 kolom' },
        ];
        return <RowMenu x={menu.x} y={menu.y} items={items} onPilih={pilihMenu} onClose={tutupMenu} lebar={248} />;
      })()}

      {modalTaut && lkjip && (
        <lkjip.TautanModal
          payload={payloadSekarang()}
          tahunDokumen={lkjip.tahunDokumen}
          onTutup={() => setModalTaut(false)}
          onTerapkan={async p => {
            if (!tautan && rows.slice(jumlahBarisKepala({ headerRows, rows })).some(r => r.some(c => c.v.trim()))) {
              const ok = await confirmDialog({
                title: 'Ganti isi tabel?',
                message: 'Badan tabel ini sudah berisi ketikan. Menghubungkannya ke modul MENGGANTI isi badan dengan data sumber; kepala tabel tetap.',
                confirmLabel: 'Ganti isinya', variant: 'warning',
              });
              if (!ok) return;
            }
            setModalTaut(false);
            pasangDanSimpan(p);
          }}
        />
      )}
    </div>
  );
}
