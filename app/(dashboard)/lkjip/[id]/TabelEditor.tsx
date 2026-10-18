'use client';
// Editor blok TABEL LKJIP ala Excel — docs/CONCEPT-lkjip-tabel-excel.md (Tahap A).
// Memblok (seret, Shift, huruf kolom, nomor baris), papan ketik ala Excel, Delete mengosongkan,
// sisip/hapus baris & kolom sebanyak yang dipilih (gabungan & rumus ikut), lebar kolom di tiap garis.
// Kepala tabel selalu berupa sel (E1); nama kolom diisi dari judul di kepala (E2).
// Tabel tertaut (CONCEPT-lkjip-tabel-tertaut.md): badan terkunci kecuali kolom isian tangan (E8).
// Aturannya di lib/lkjip/tabel.ts (murni, diuji); berkas ini hanya keadaan layar.

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Bold, Combine, Split, Copy, ClipboardPaste,
  Undo2, Redo2, Save, Link2, Unlink, RefreshCw, SlidersHorizontal,
} from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog, pilihDialog } from '@/components/ui/ConfirmDialog';
import type { BlockNode } from '@/lib/lkjip/numbering';
import {
  normalizeRows, sanitizeRows, mergeCells, unmergeAt, extractRange, pasteRange, rangeToTSV, parseTSV, displayValue, colLabel,
  selGalat, daftarSelGalat, nilaiKetikan, pastikanKepalaSel, namaKolomDariKepala, sisipBaris, hapusBaris, sisipKolom, hapusKolom,
  kosongkanBlok, tanpaFormat, teksDiBaris, ubahJumlahKepala, paskanKeKertas, pxKeCm,
  BATAS_KOLOM_TABEL, BATAS_BARIS_TABEL, BATAS_BARIS_KEPALA, LEBAR_KOLOM_BAWAAN, LEBAR_KERTAS_PX,
  type TabelCell, type TabelAlign, type TabelNumFmt, type BentukTabel,
} from '@/lib/lkjip/tabel';
import { kalimatPerbarui, pasangBadan, pesanLewatBatas, jumlahBarisKepala, lepasTautan, tulisWaktuTarik, ambilIsianTangan, nilaiPerbarui, kalimatIsianYatim, type Tautan, type PayloadTabel } from '@/lib/lkjip/tautan';
import { fetchJson } from '@/lib/shared/api';
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { usePilihanSel } from './usePilihanSel';

// Dimuat saat dibuka saja: penghubung sumber menyeret kode E-Anggaran & Renaksi.
const TautanModal = dynamic(() => import('./TautanModal'), { ssr: false });

type TabelP = { judul: string; kolom: string[]; align: TabelAlign[]; colWidths?: number[]; headerRows?: number; rows: TabelCell[][]; tautan?: Tautan };
type Snap = { kolom: string[]; align: TabelAlign[]; colWidths: number[]; headerRows: number; rows: TabelCell[][] };
type Sunting = { r: number; c: number; awal: string; ganti: boolean };

const PESAN_BADAN = 'Badan tabel tertaut mengikuti sumbernya — ubah lewat Atur Bentuk, atau Lepas Tautan untuk menyunting bebas.';
const PESAN_KOLOM_TAUT = 'Kolom tabel tertaut diatur lewat Atur Bentuk.';
const ARAH: Record<string, { dr: number; dc: number }> = {
  ArrowUp: { dr: -1, dc: 0 }, ArrowDown: { dr: 1, dc: 0 }, ArrowLeft: { dr: 0, dc: -1 }, ArrowRight: { dr: 0, dc: 1 },
};
const potong = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cm = (px: number) => pxKeCm(px).toFixed(1).replace('.', ',');

export default function TabelEditor({ block, readOnly, tahunDokumen, onSave }: { block: BlockNode; readOnly: boolean; tahunDokumen: number; onSave: (p: unknown) => void }) {
  // E1: tabel lama ber-headerRows 0 dijadikan 1 baris kepala berisi nama kolom saat dibuka — keluaran
  // Word-nya sama; baru tersimpan begitu orangnya menekan Simpan Tabel.
  const [awal] = useState(() => {
    const p0 = block.payload as Partial<TabelP>;
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
  const ncol = kolom.length;
  const pil = usePilihanSel(rows, ncol);
  const { sel } = pil;
  const rect = pil.kotak;
  const [sunting, setSunting] = useState<Sunting | null>(null);
  const suntingRef = useRef<Sunting | null>(null);
  const [barFocused, setBarFocused] = useState(false);           // sedang mengetik di formula bar
  const barAwal = useRef('');
  const clipRef = useRef<TabelCell[][] | null>(null);
  const [adaSalinan, setAdaSalinan] = useState(false);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const tangkapRef = useRef<HTMLTextAreaElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const resizeRef = useRef<{ ci: number; x: number; w: number } | null>(null);
  const [lebarTip, setLebarTip] = useState<{ ci: number; px: number } | null>(null);

  const snap = (): Snap => ({ kolom, align, colWidths, headerRows, rows });
  const sameSnap = (a: Snap, b: Snap) => JSON.stringify(a) === JSON.stringify(b);
  const pushHist = () => { const s = snap(); setPast(p => (p.length && sameSnap(p[p.length - 1], s)) ? p : [...p, s].slice(-60)); setFuture([]); };
  const restoreSnap = (s: Snap) => { setKolom(s.kolom); setAlign(s.align); setColWidths(s.colWidths); setHeaderRows(s.headerRows); setRows(s.rows); pakaiSunting(null); setBarFocused(false); };
  const undo = () => { if (!past.length) return; const prev = past[past.length - 1]; setFuture(f => [snap(), ...f].slice(0, 60)); setPast(p => p.slice(0, -1)); restoreSnap(prev); };
  const redo = () => { if (!future.length) return; const nxt = future[0]; setPast(p => [...p, snap()].slice(-60)); setFuture(f => f.slice(1)); restoreSnap(nxt); };
  const bentuk = (): BentukTabel => ({ rows, kolom, align, colWidths, headerRows });
  const pasangBentuk = (b: BentukTabel) => { setRows(b.rows); setKolom(b.kolom); setAlign(b.align); setColWidths(b.colWidths); setHeaderRows(b.headerRows); };
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
    const boleh = (r: number, c: number) => !terkunci(r, c);
    let ada = false, ditahan = false;
    for (let r = rect.r1; r <= rect.r2; r++) for (let c = rect.c1; c <= rect.c2; c++) {
      const cell = rows[r]?.[c];
      if (!cell || cell.h || cell.v === '') continue;
      if (boleh(r, c)) ada = true; else ditahan = true;
    }
    if (!ada) { if (ditahan) toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    pushHist();
    setRows(kosongkanBlok(rows, rect, boleh));
  };
  const hapusFormatBlok = () => {
    if (!rect || rectBadan) return;
    pushHist();
    setRows(prev => prev.map((row, r) => row.map((cell, c) =>
      (r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2 ? tanpaFormat(cell) : cell))));
  };

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
    if (ncol + n > BATAS_KOLOM_TABEL) { toast.info(`Tabel paling banyak ${BATAS_KOLOM_TABEL} kolom — tinggal ${BATAS_KOLOM_TABEL - ncol} lagi.`); return; }
    const di = arah === 'kiri' ? rect.c1 : rect.c2 + 1;
    pushHist();
    pasangBentuk(sisipKolom(bentuk(), di, n));
    pil.setSel({ ar: rect.r1, ac: di, fr: rect.r2, fc: di + n - 1 });
  }
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
  const tsvPilihan = useMemo(() => (rect ? rangeToTSV(extractRange(rows, rect.r1, rect.c1, rect.r2, rect.c2)) : ''), [rows, rect]);
  useEffect(() => {
    const t = tangkapRef.current;
    if (t && document.activeElement === t) t.select();
  }, [tsvPilihan]);
  const doCopy = () => {
    if (!rect) return;
    clipRef.current = extractRange(rows, rect.r1, rect.c1, rect.r2, rect.c2);
    setAdaSalinan(true);
    fokusGrid();
    try { if (!document.execCommand('copy')) void navigator.clipboard?.writeText(rangeToTSV(clipRef.current)); } catch { /* best-effort */ }
    toast.success('Sel disalin');
  };
  async function tempel(grid: TabelCell[][]) {
    if (!rect || readOnly || !grid.length) return;
    if (rectBadan) { toast.info(PESAN_BADAN, { id: 'badan-terkunci' }); return; }
    let b = bentuk();
    const lebar = Math.max(...grid.map(r => r.length));
    const kurang = rect.c1 + lebar - ncol;
    // T6: tempelan yang lebih lebar dari tabel dulu dibuang kolom kelebihannya diam-diam.
    if (kurang > 0) {
      const muat = terkait ? 0 : Math.min(kurang, BATAS_KOLOM_TABEL - ncol);
      if (muat <= 0) {
        toast.info(`${kurang} kolom terakhir tempelan tidak muat — tabel ini ${ncol} kolom${terkait ? ' (kolom tabel tertaut diatur lewat Atur Bentuk)' : `, batasnya ${BATAS_KOLOM_TABEL}`}.`);
      } else {
        const p = await pilihDialog({
          title: 'Tempelan lebih lebar dari tabel',
          message: `Tempelan ${lebar} kolom mulai di kolom ${colLabel(rect.c1)}, tabel ini cuma sampai kolom ${colLabel(ncol - 1)}.`
            + (kurang > muat ? ` Batas tabel ${BATAS_KOLOM_TABEL} kolom, jadi ${kurang - muat} kolom terakhir tetap tidak muat.` : ''),
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
    e.preventDefault();
    if (!text) return;
    // Tempelan internal yang sama persis → pakai versi kaya-format.
    void tempel(clipRef.current && rangeToTSV(clipRef.current) === text.replace(/\r?\n$/, '') ? clipRef.current : parseTSV(text));
  };

  // ── Papan ketik di kisi (§5.2) ─────────────────────────────────────────────────
  const onGridKey = (e: React.KeyboardEvent) => {
    if (suntingRef.current || e.nativeEvent.isComposing) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const kl = k.toLowerCase();
    if (ctrl && kl === 'c') { if (rect) { clipRef.current = extractRange(rows, rect.r1, rect.c1, rect.r2, rect.c2); setAdaSalinan(true); } return; }
    if (ctrl && kl === 'a') { e.preventDefault(); pil.pilihSemua(); return; }
    if (readOnly) {
      if (ARAH[k]) { e.preventDefault(); pil.gerak(ARAH[k].dr, ARAH[k].dc, { perluas: e.shiftKey, lompat: ctrl }); }
      return;
    }
    if (ctrl && kl === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (ctrl && (kl === 'y' || (kl === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (ctrl && kl === 'v') return;   // biarkan peramban memicu onPaste
    if (ctrl && (k === '-' || k === '_')) { e.preventDefault(); void hapusDariPintasan(); return; }
    if (ctrl && e.shiftKey && (k === '+' || k === '=')) { e.preventDefault(); void sisipDariPintasan(); return; }
    if (!sel) { if (ARAH[k]) { e.preventDefault(); pil.keSel(0, 0); } return; }
    if (ARAH[k]) { e.preventDefault(); pil.gerak(ARAH[k].dr, ARAH[k].dc, { perluas: e.shiftKey, lompat: ctrl }); return; }
    if (k === 'Tab') { e.preventDefault(); pil.gerak(0, e.shiftKey ? -1 : 1); return; }
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
  const lebihKertas = lebarTotal > LEBAR_KERTAS_PX;

  // ── Simpan, Perbarui, Lepas ───────────────────────────────────────────────────
  // Isian tangan dibaca dari badan SAAT INI — peta di resep ikut ketikan terakhir, bukan simpanan terakhir.
  const payloadSekarang = (): PayloadTabel => ({
    judul, kolom: namaKolomDariKepala(rows, headerRows, kolom), align, colWidths, headerRows, rows,
    ...(tautan ? { tautan: ambilIsianTangan(tautan, rows.slice(jumlahBarisKepala({ headerRows, rows }))) } : {}),
  });
  /** Hubungkan / Perbarui / Lepas langsung disimpan: ketiganya keputusan yang sudah ditanyakan. */
  const pasangDanSimpan = (p: PayloadTabel) => {
    // Judul ikut: templat mengisi judul yang masih kosong — tanpa ini Simpan Tabel berikutnya mengosongkannya lagi.
    setJudul(p.judul); setKolom(p.kolom); setAlign(p.align as TabelAlign[]);
    setColWidths(p.kolom.map((_, i) => p.colWidths?.[i] ?? LEBAR_KOLOM_BAWAAN));
    setHeaderRows(p.headerRows ?? 0); setRows(p.rows); setTautan(p.tautan);
    // Riwayat urungkan dikosongkan: memulihkan baris tanpa ikut memulihkan resepnya membuat
    // keduanya tidak sejajar lagi (server menolaknya, tapi layar sudah terlanjur salah).
    setPast([]); setFuture([]); pil.setSel(null); pakaiSunting(null);
    onSave(p);
  };
  async function perbarui() {
    if (!tautan) return;
    setMenarik(true);
    try {
      const { DAFTAR_SUMBER } = await import('@/lib/lkjip/sumber');
      const sumber = DAFTAR_SUMBER[tautan.sumber];
      const hasil = await sumber.tarik(tautan.setelan, url => fetchJson<unknown>(url), tahunDokumen);
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

  const galat = useMemo(() => daftarSelGalat(rows), [rows]);
  const vAlignCss = (va?: TabelCell['va']) => va === 'middle' ? 'middle' : va === 'bottom' ? 'bottom' : 'top';
  const diPilih = (r: number, c: number) => !!rect && r >= rect.r1 && r <= rect.r2 && c >= rect.c1 && c <= rect.c2;
  const kunciBlok = !rect || rectBadan;
  const pilihanSel = <T extends string>(v: string, fn: (v: T) => void) => { if (v) fn(v as T); };

  return (
    <div className="lk-tabel-ed">
      <input className="lk-tabel-judul" value={judul} readOnly={readOnly} placeholder="Judul tabel (tanpa nomor — nomor otomatis)" onChange={e => setJudul(e.target.value)} />

      {!readOnly && (
        // Tombol tidak mengambil fokus dari kisi — papan ketik tetap jalan sesudah menekan tombol.
        <div className="lk-tabel-tools" onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
          <button data-tooltip="Urungkan (Ctrl+Z)" data-tooltip-pos="below" disabled={!past.length} onClick={undo}><Undo2 size={14} /></button>
          <button data-tooltip="Ulangi (Ctrl+Y)" data-tooltip-pos="below" disabled={!future.length} onClick={redo}><Redo2 size={14} /></button>
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
          <button data-tooltip="Gabung sel" data-tooltip-pos="below" disabled={!canMerge} onClick={doMerge}><Combine size={14} /></button>
          <button data-tooltip="Pisah sel" data-tooltip-pos="below" disabled={!canUnmerge} onClick={doUnmerge}><Split size={14} /></button>
          <span className="lk-tt-sep" />
          <button data-tooltip="Rata kiri" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('left')}><AlignLeft size={14} /></button>
          <button data-tooltip="Rata tengah" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('center')}><AlignCenter size={14} /></button>
          <button data-tooltip="Rata kanan" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('right')}><AlignRight size={14} /></button>
          <button data-tooltip="Rata kiri-kanan" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => rata('justify')}><AlignJustify size={14} /></button>
          <span className="lk-tt-sep" />
          <button data-tooltip="Vertikal atas" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => editCells(c => { c.va = 'top'; })}>⤒</button>
          <button data-tooltip="Vertikal tengah" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => editCells(c => { c.va = 'middle'; })}>⇕</button>
          <button data-tooltip="Vertikal bawah" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => editCells(c => { c.va = 'bottom'; })}>⤓</button>
          <span className="lk-tt-sep" />
          <button data-tooltip="Tebal" data-tooltip-pos="below" disabled={kunciBlok} onClick={() => editCells(c => { c.b = !c.b; })}><Bold size={14} /></button>
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
          <button data-tooltip="Salin (Ctrl+C)" data-tooltip-pos="below" disabled={!rect} onClick={doCopy}><Copy size={14} /></button>
          <button data-tooltip="Tempel (Ctrl+V)" data-tooltip-pos="below" disabled={kunciBlok || !adaSalinan} onClick={() => { if (clipRef.current) void tempel(clipRef.current); }}><ClipboardPaste size={14} /></button>
        </div>
      )}

      {!readOnly && (
        <div className="lk-fbar">
          <span className="lk-fbar-ref">{sel ? colLabel(sel.ac) + (sel.ar + 1) : '—'}</span>
          <span className="lk-fbar-fx">fx</span>
          <input className="lk-fbar-in" disabled={!sel || terkunci(sel.ar, sel.ac)}
            value={sel ? (rows[sel.ar]?.[sel.ac]?.v ?? '') : ''}
            placeholder="Pilih sel — ketik teks atau = untuk rumus (mis. =A1+B1)"
            onFocus={e => { if (sel) { pushHist(); barAwal.current = rows[sel.ar]?.[sel.ac]?.v ?? ''; setBarFocused(true); editInputRef.current = e.currentTarget; } }}
            onBlur={() => { setBarFocused(false); if (sel) rapikanKetikan(sel.ar, sel.ac); }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); fokusGrid(); }
              else if (e.key === 'Escape') { e.preventDefault(); if (sel) { setCell(sel.ar, sel.ac, barAwal.current); setPast(p => p.slice(0, -1)); } fokusGrid(); }
            }}
            onChange={e => { if (sel) ubahSel(sel.ar, sel.ac, e.target.value); }} />
        </div>
      )}

      <div className="lk-tabel-scroll" ref={gridRef}>
        <textarea ref={tangkapRef} className="lk-tangkap" aria-label="Sel tabel terpilih" value={tsvPilihan} readOnly={readOnly}
          // Ketikan biasa ditangani onKeyDown; teks yang masuk TANPA keydown (IME, papan ketik ponsel,
          // alat bantu) tiba di sini — dipakai untuk mulai menyunting, isinya tetap TSV blok terpilih.
          onChange={e => {
            const masuk = e.nativeEvent as InputEvent;
            if (!readOnly && sel && masuk.inputType === 'insertText' && masuk.data) mulaiSunting(sel.ar, sel.ac, masuk.data);
          }}
          onKeyDown={onGridKey} onPaste={onPaste} onCopy={() => { if (rect) clipRef.current = extractRange(rows, rect.r1, rect.c1, rect.r2, rect.c2); }} />
        <div className="lk-tabel-kanvas">
          <table className="lk-tabel" style={{ tableLayout: 'fixed', width: 'auto' }}>
            <colgroup>
              <col style={{ width: 38 }} />
              {kolom.map((_, ci) => <col key={ci} style={{ width: colWidths[ci] ?? LEBAR_KOLOM_BAWAAN }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="lk-rownum lk-sudut" onMouseDown={e => { e.preventDefault(); pil.pilihSemua(); fokusGrid(); }} aria-label="Pilih semua sel" />
                {kolom.map((_, ci) => (
                  <th key={ci} className={`lk-colhead${rect && ci >= rect.c1 && ci <= rect.c2 ? ' aktif' : ''}`}
                    onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); pil.pilihKolom(ci, e.shiftKey); fokusGrid(); }}
                    onMouseEnter={() => pil.seretKolom(ci)}>
                    {colLabel(ci)}
                    {lebarTip?.ci === ci && <span className="lk-lebar-tip">{cm(lebarTip.px)} cm</span>}
                    {!readOnly && <span className="lk-colresize" onMouseDown={e => onResizeDown(ci, e)} onDoubleClick={e => { e.stopPropagation(); paskanIsi(ci); }} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri < headerRows ? 'lk-hrow' : undefined}>
                  <td className={`lk-rownum${rect && ri >= rect.r1 && ri <= rect.r2 ? ' aktif' : ''}`}
                    onMouseDown={e => { if (e.button !== 0) return; e.preventDefault(); pil.pilihBaris(ri, e.shiftKey); fokusGrid(); }}
                    onMouseEnter={() => pil.seretBaris(ri)}>{ri + 1}</td>
                  {row.map((cell, ci) => {
                    if (cell.h) return null;
                    const sedang = sunting?.r === ri && sunting?.c === ci;
                    const tampil = sedang || (barFocused && sel?.ar === ri && sel?.ac === ci) ? cell.v : displayValue(rows, ri, ci);
                    const gaya: React.CSSProperties = { textAlign: (cell.al ?? (ri < headerRows ? 'center' : align[ci]) ?? 'left'), fontWeight: cell.b ? 700 : undefined, fontSize: cell.fs ? `${cell.fs}px` : undefined, color: cell.bg ? '#0F0F12' : undefined };
                    return (
                      <td key={ci} data-rc={`${ri}:${ci}`} colSpan={cell.cs ?? 1} rowSpan={cell.rs ?? 1}
                        className={[
                          diPilih(ri, ci) ? 'lk-cell-sel' : '', sel?.ar === ri && sel?.ac === ci ? 'lk-cell-aktif' : '',
                          diBadan(ri) && kolomTangan.has(ci) ? 'lk-cell-tangan' : '', !sedang && selGalat(tampil) ? 'lk-cell-galat' : '',
                        ].filter(Boolean).join(' ') || undefined}
                        style={{ verticalAlign: vAlignCss(cell.va), background: cell.bg ? `#${cell.bg}` : undefined }}
                        onMouseDown={e => onSelDown(ri, ci, e)}
                        onMouseEnter={() => pil.seretSel(ri, ci)}
                        onDoubleClick={() => mulaiSunting(ri, ci)}>
                        {sedang ? (
                          <input autoFocus value={cell.v} style={gaya}
                            ref={n => { if (n) editInputRef.current = n; }}
                            onFocus={e => { const n = e.currentTarget; const p = n.value.length; n.setSelectionRange(p, p); }}
                            onKeyDown={e => {
                              e.stopPropagation();
                              if (e.key === 'Enter') { e.preventDefault(); selesaiSunting({ dr: e.shiftKey ? -1 : 1, dc: 0 }); }
                              else if (e.key === 'Tab') { e.preventDefault(); selesaiSunting({ dr: 0, dc: e.shiftKey ? -1 : 1 }); }
                              else if (e.key === 'Escape') { e.preventDefault(); batalSunting(); }
                              // Mulai dengan mengetik (bukan F2) → panah menyelesaikan & pindah, seperti Excel.
                              else if (sunting?.ganti && ARAH[e.key] && !e.shiftKey) { e.preventDefault(); selesaiSunting(ARAH[e.key]); }
                            }}
                            onBlur={() => selesaiSunting()}
                            onChange={e => ubahSel(ri, ci, e.target.value)} />
                        ) : (
                          <div className="lk-sel-isi" style={gaya}>{tampil}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Batas bidang tulis A4 (15,5 cm) — kolom di kanannya keluar kertas di Word. */}
          <div className={`lk-batas-kertas${lebihKertas ? ' lewat' : ''}`} style={{ left: 38 + LEBAR_KERTAS_PX }} aria-hidden />
        </div>
      </div>

      {!readOnly && (
        <div className="lk-tabel-petunjuk">
          Seret untuk memblok · klik huruf kolom / nomor baris untuk satu kolom/baris penuh · Delete mengosongkan ·
          Sisip/Hapus ▾ sebanyak yang dipilih · seret garis di antara huruf kolom untuk lebarnya (dobel-klik = paskan isi)
        </div>
      )}
      {lebihKertas && (
        <div className="lk-tabel-lebar">
          <span>Lebar tabel {cm(lebarTotal)} cm — lebih lebar dari kertas ({cm(LEBAR_KERTAS_PX)} cm). Di Word tabel disusutkan otomatis, jadi kolomnya lebih sempit dari yang terlihat di sini.</span>
          {!readOnly && <button onClick={() => { pushHist(); setColWidths(paskanKeKertas(colWidths)); }}>Paskan ke lebar kertas</button>}
        </div>
      )}
      {galat.length > 0 && (
        <div className="lk-tabel-galat">
          {galat.length} sel rumus galat ({galat.slice(0, 6).join(', ')}{galat.length > 6 ? ', …' : ''}) — di Word dicetak &quot;—&quot;. Periksa rumusnya.
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
          <button onClick={() => { if (rows.length >= BATAS_BARIS_TABEL) { toast.info(`Satu tabel paling banyak ${BATAS_BARIS_TABEL} baris.`); return; } pushHist(); pasangBentuk(sisipBaris(bentuk(), rows.length, 1)); }} disabled={terkait} data-tooltip={terkait ? 'Baris tabel tertaut mengikuti sumbernya — atur lewat Atur Bentuk' : undefined} data-tooltip-pos="below">+ Baris</button>
          <button onClick={() => { pushHist(); pasangBentuk(sisipKolom(bentuk(), ncol, 1)); }} disabled={ncol >= BATAS_KOLOM_TABEL || terkait} data-tooltip={terkait ? PESAN_KOLOM_TAUT : undefined} data-tooltip-pos="below">+ Kolom</button>
          {!terkait && (
            <button onClick={() => setModalTaut(true)} data-tooltip="Isi tabel dari menu Cetak E-Anggaran atau Renaksi — angkanya bisa diperbarui nanti" data-tooltip-pos="below">
              <Link2 size={12} style={{ display: 'inline', verticalAlign: '-0.125em' }} /> Hubungkan ke Modul
            </button>
          )}
          <PrimaButton menulis variant="primary" size="sm" iconLeft={<Save size={14} />} onClick={() => onSave(payloadSekarang())}>Simpan Tabel</PrimaButton>
        </div>
      )}

      {modalTaut && (
        <TautanModal
          payload={payloadSekarang()}
          tahunDokumen={tahunDokumen}
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
