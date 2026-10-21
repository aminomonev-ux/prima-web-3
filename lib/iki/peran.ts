// lib/iki/peran.ts
// IKI varian CUSTOM — peran kolom (docs/CONCEPT-iki-custom.md §11). Modul MURNI, aman-klien: dipakai
// editor (panel peran, Ambil dari Renaksi/Atasan, peringatan target), server (kaskade dari atasan CUSTOM), dan uji.
// Tabel bebas tidak menyatakan kolom mana berisi RHK/target; peran yang menyatakannya.

import {
  sanitizeRows, sisipBarisSel, hapusBarisSel, sisipBarisBaru, mergeCells, asalSel, teksSelWord, nomorUlang, aturPeranKolom,
  type TabelCell, type BentukTabel, type GayaTabel,
} from '@/lib/lkjip/tabel';
import { validateRhkTargets, type TargetWarning } from './validate';

export const DAFTAR_PERAN = [
  { kunci: 'rhk_intervensi', label: 'RHK yang diintervensi', ringkas: 'RHK atasan', kelompok: 'isi' },
  { kunci: 'rhk', label: 'Rencana Hasil Kerja', ringkas: 'RHK', kelompok: 'isi' },
  { kunci: 'indikator', label: 'Indikator', ringkas: 'Indikator', kelompok: 'isi' },
  { kunci: 'cara_hitung', label: 'Cara hitung', ringkas: 'Cara hitung', kelompok: 'isi' },
  { kunci: 'target_tahunan', label: 'Target tahunan', ringkas: 'Target', kelompok: 'isi' },
  { kunci: 'tw1', label: 'TW I', ringkas: 'TW I', kelompok: 'mendatar' },
  { kunci: 'tw2', label: 'TW II', ringkas: 'TW II', kelompok: 'mendatar' },
  { kunci: 'tw3', label: 'TW III', ringkas: 'TW III', kelompok: 'mendatar' },
  { kunci: 'tw4', label: 'TW IV', ringkas: 'TW IV', kelompok: 'mendatar' },
  { kunci: 'triwulan', label: 'Kolom TW (I–IV)', ringkas: 'TW', kelompok: 'menurun' },
  { kunci: 'target_tw', label: 'Target TW', ringkas: 'Target TW', kelompok: 'menurun' },
] as const;

export type PeranKolom = typeof DAFTAR_PERAN[number]['kunci'];
export type PetaPeran = Partial<Record<PeranKolom, number>>;
export const KUNCI_PERAN = DAFTAR_PERAN.map(p => p.kunci) as [PeranKolom, ...PeranKolom[]];
export const KELOMPOK_PERAN: Record<string, string> = { isi: 'Isi', mendatar: 'TW mendatar (4 kolom)', menurun: 'TW menurun (4 baris per indikator)' };

const MENDATAR: readonly PeranKolom[] = ['tw1', 'tw2', 'tw3', 'tw4'];
const MENURUN: readonly PeranKolom[] = ['triwulan', 'target_tw'];
/** TW mendatar dan menurun saling meniadakan (keputusan #5) — menandai yang satu melepas yang lain. */
export const lepasPeran = (k: PeranKolom): readonly PeranKolom[] => (MENDATAR.includes(k) ? MENURUN : MENURUN.includes(k) ? MENDATAR : []);

/** Daftar untuk panel Peran kolom di editor tabel bersama (komponen itu tidak mengenal IKI). */
export const PILIHAN_PERAN = DAFTAR_PERAN.map(p => ({ ...p, lepas: lepasPeran(p.kunci) }));

/** Isi tersimpan → peta yang sah: kunci dikenal, kolom di dalam tabel, satu peran satu kolom, mendatar ⇄ menurun. */
export function bacaPeran(raw: unknown, ncol: number): PetaPeran {
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  let peta: Record<string, number> = {};
  for (const k of KUNCI_PERAN) {
    const c = o[k];
    if (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < ncol) peta = aturPeranKolom(peta, k, c, lepasPeran(k));
  }
  return peta as PetaPeran;
}

export type TataLetak = 'mendatar' | 'menurun';
export const tataLetak = (p: PetaPeran): TataLetak => (MENURUN.some(k => p[k] !== undefined) ? 'menurun' : 'mendatar');
const TINGGI_MENURUN = 4;
const ROMAWI = ['I', 'II', 'III', 'IV'];

// ── Menebak dari judul kolom ───────────────────────────────────────────────────

const normJudul = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const NOMOR_TW: Record<string, number> = { i: 0, ii: 1, iii: 2, iv: 3, '1': 0, '2': 1, '3': 2, '4': 3 };

/** Judul bertingkat tiap kolom ("Target Triwulan II") → peran. Hasilnya tebakan: orangnya tetap memeriksa. */
export function tebakPeran(judul: string[]): PetaPeran {
  const n = judul.map(normJudul);
  let peta: Record<string, number> = {};
  const pakai = (k: PeranKolom, c: number) => { peta = aturPeranKolom(peta, k, c, lepasPeran(k)); };
  const bebas = (c: number) => !Object.values(peta).includes(c);
  const cari = (k: PeranKolom, cocok: (j: string) => boolean) => {
    if (peta[k] !== undefined) return;
    const c = n.findIndex((j, i) => bebas(i) && cocok(j));
    if (c >= 0) pakai(k, c);
  };
  n.forEach((j, c) => {
    const m = j.match(/(?:^|\s)(?:tw|triwulan)\s*(iv|iii|ii|i|[1-4])$/);
    if (m && !/\baksi\b/.test(j)) pakai(MENDATAR[NOMOR_TW[m[1]]], c);
  });
  if (!MENDATAR.some(k => peta[k] !== undefined)) {
    // "Triwulan" / "TW" polos, atau kepala bertingkat "Target Triwulan" + "TW" = kolom label I–IV;
    // "Target TW" / "Target Triwulan" polos, atau "Target Triwulan" + "Target" = angkanya.
    cari('triwulan', j => /^(tw|triwulan)$/.test(j) || /(tw|triwulan) (tw|triwulan)$/.test(j) || (/\s(tw|triwulan)$/.test(j) && !/\btarget\b/.test(j)));
    cari('target_tw', j => /\btarget\b/.test(j) && /\b(tw|triwulan)\b/.test(j) && !/\baksi\b/.test(j));
  }
  cari('rhk_intervensi', j => /intervensi|rhk atasan|hasil kerja (pimpinan|atasan)/.test(j));
  cari('rhk', j => /rencana hasil kerja|\brhk\b/.test(j));
  cari('indikator', j => /\bindikator\b/.test(j));
  cari('cara_hitung', j => /cara (peng)?hitung|cara perhitungan|aspek b|\bjenis\b/.test(j));
  cari('target_tahunan', j => /\btarget\b/.test(j) && !/\b(tw|triwulan|aksi)\b/.test(j));
  return peta as PetaPeran;
}

// ── Membaca isi tabel per baris RHK (pemeriksaan target & kaskade) ─────────────

export type CaraHitung = 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';

/** Teks sel → cara hitung. Yang tidak dikenali = null: pemeriksaan TIDAK menebak. */
export function bacaCaraHitung(teks: string): CaraHitung | null {
  const t = normJudul(teks);
  if (!t) return null;
  if (/\bprogres+\b/.test(t) && /\bnegatif\b/.test(t)) return 'Progres Negatif';
  if (/\bprogres+\b/.test(t) && /\bpositif\b/.test(t)) return 'Progres Positif';
  if (/\b(akumulatif|kumulatif)\b/.test(t)) return 'Akumulatif';
  if (/\b(pengulangan|berulang)\b/.test(t)) return 'Pengulangan';
  return null;
}

/** "I" / "2" / "TW III" / "Triwulan IV" → 0..3. */
export function bacaNomorTw(teks: string): number | null {
  const m = normJudul(teks).match(/^(?:tw|triwulan)?\s*(iv|iii|ii|i|[1-4])$/);
  return m ? NOMOR_TW[m[1]] : null;
}

export type ItemTabel = {
  /** Nomor baris tabel di editor (1 = baris kepala pertama). */
  baris: number;
  rhk_intervensi: string;
  rhk: string;
  indikator: string;
  cara_hitung: string;
  target_tahunan: string;
  tw: (string | null)[];
};

type TabelBerperan = { rows: TabelCell[][]; headerRows: number; kolomNomor: number | null; gaya: GayaTabel; peran: PetaPeran };

/** Indeks baris data terakhir — baris JUMLAH (gaya jumlah) bukan baris data. */
const akhirData = (t: { rows: TabelCell[][]; headerRows: number; gaya: GayaTabel }) =>
  (t.gaya.jumlah && t.rows.length - 1 >= t.headerRows ? t.rows.length - 1 : t.rows.length) - 1;

/**
 * SATU pembaca untuk pemeriksaan target DAN kaskade (§11.4). Mendatar: tiap baris badan yang punya sel
 * peran sendiri. Menurun: blok menurut gabungan kolom jangkar (Target tahunan → Indikator → RHK → RHK
 * atasan); TW dibaca dari Kolom TW (I/II/1/"TW III") atau urutan barisnya di blok.
 */
export function itemDariTabel(t: TabelBerperan): ItemTabel[] {
  const p = t.peran;
  const rows = nomorUlang(t.rows, t.headerRows, t.kolomNomor, !!t.gaya.jumlah);
  const akhir = akhirData(t);
  const teks = (r: number, c: number | undefined) => {
    if (c === undefined || !rows[r]?.[c]) return '';
    const a = asalSel(rows, r, c);
    return teksSelWord(rows, a.r, a.c).trim();
  };
  const isi = (r: number): Omit<ItemTabel, 'tw'> => ({
    baris: r + 1, rhk_intervensi: teks(r, p.rhk_intervensi), rhk: teks(r, p.rhk), indikator: teks(r, p.indikator),
    cara_hitung: teks(r, p.cara_hitung), target_tahunan: teks(r, p.target_tahunan),
  });
  const kosong = (it: ItemTabel) => !it.rhk_intervensi && !it.rhk && !it.indikator && !it.target_tahunan && it.tw.every(v => !v);
  const hasil: ItemTabel[] = [];

  if (tataLetak(p) === 'mendatar') {
    const kolomPeran = KUNCI_PERAN.map(k => p[k]).filter((c): c is number => c !== undefined && c < (rows[0]?.length ?? 0));
    for (let r = t.headerRows; r <= akhir; r++) {
      // Baris yang semua sel perannya lanjutan gabungan dari atas = baris yang sama, bukan butir baru.
      if (!kolomPeran.some(c => asalSel(rows, r, c).r === r)) continue;
      const it: ItemTabel = { ...isi(r), tw: MENDATAR.map(k => (p[k] === undefined ? null : teks(r, p[k]))) };
      if (!kosong(it)) hasil.push(it);
    }
    return hasil;
  }

  const jangkar = p.target_tahunan ?? p.indikator ?? p.rhk ?? p.rhk_intervensi;
  const twDiBlok = (r1: number, r2: number) => {
    const tw: (string | null)[] = [null, null, null, null];
    for (let q = r1, i = 0; q <= r2; q++, i++) {
      const idx = p.triwulan !== undefined ? bacaNomorTw(teks(q, p.triwulan)) : i;
      if (idx !== null && idx < 4 && tw[idx] === null) tw[idx] = p.target_tw === undefined ? null : teks(q, p.target_tw);
    }
    return tw;
  };
  for (let r = t.headerRows; r <= akhir; r++) {
    let r2: number;
    if (jangkar !== undefined) {
      const cell = rows[r]?.[jangkar];
      if (!cell || cell.h) continue;
      r2 = Math.min(akhir, r + (cell.rs ?? 1) - 1);
    } else {
      if (p.triwulan === undefined || bacaNomorTw(teks(r, p.triwulan)) !== 0) continue;
      r2 = r;
      while (r2 + 1 <= akhir && r2 + 1 - r < TINGGI_MENURUN && bacaNomorTw(teks(r2 + 1, p.triwulan)) !== 0) r2++;
    }
    const it: ItemTabel = { ...isi(r), tw: twDiBlok(r, r2) };
    if (!kosong(it)) hasil.push(it);
  }
  return hasil;
}

const adaTw = (p: PetaPeran) => MENDATAR.some(k => p[k] !== undefined) || p.target_tw !== undefined;
/** Kolom TW ditandai tapi Cara hitung tidak — pemeriksaan tidak bisa jalan, dan layar menyebutnya. */
export const perluCaraHitung = (p: PetaPeran): boolean => adaTw(p) && p.target_tahunan !== undefined && p.cara_hitung === undefined;

/** Peringatan target TW vs tahunan — aturan `validateRhkTargets` yang SAMA dengan STANDAR, lunak. */
export function validasiTabelCustom(t: TabelBerperan): TargetWarning[] {
  const baris = itemDariTabel(t).flatMap(it => {
    const cara = bacaCaraHitung(it.cara_hitung);
    if (!cara) return [];
    return [{
      no_urut: it.baris, rhk: it.indikator || it.rhk || `baris ${it.baris}`, aspek_b: cara, target_tahunan: it.target_tahunan,
      triwulan: it.tw.map((v, i) => ({ triwulan: i + 1, target_tw: v ?? '' })),
    }];
  });
  return validateRhkTargets(baris).map(w => ({ ...w, message: `Baris ${w.no_urut} — ${w.message}` }));
}

export type RhkAtasanTabel = { no_urut: number; rhk: string; indikator: string; target_tahunan: string; aspek_b: CaraHitung };

/**
 * Kaskade dari atasan CUSTOM (§11.3): satu baris per RHK — RHK berurutan yang sama (sel tergabung) dihitung
 * sekali. Tanpa kolom RHK bertanda = kosong; pemanggil yang menyebut sebabnya.
 */
export function rhkAtasanDariTabel(t: TabelBerperan): RhkAtasanTabel[] {
  if (t.peran.rhk === undefined) return [];
  const hasil: RhkAtasanTabel[] = [];
  let lalu = '';
  for (const it of itemDariTabel(t)) {
    const kunci = normJudul(it.rhk);
    if (!kunci || kunci === lalu) continue;
    lalu = kunci;
    hasil.push({ no_urut: hasil.length + 1, rhk: it.rhk, indikator: it.indikator, target_tahunan: it.target_tahunan, aspek_b: bacaCaraHitung(it.cara_hitung) ?? 'Akumulatif' });
  }
  return hasil;
}

// ── Impor ke tabel (§11.2) ─────────────────────────────────────────────────────

export type ItemImpor = {
  rhk_intervensi?: string | null;
  rhk?: string | null;
  indikator?: string | null;
  cara_hitung?: string | null;
  target_tahunan?: string | null;
  tw?: (string | null)[];
};

export type BentukBerperan = BentukTabel & { gaya: GayaTabel; kolomNomor: number | null; peran: PetaPeran };
export type HasilImpor =
  | { ok: true; bentuk: BentukTabel; baris: number; tanpaKolom: string[] }
  | { ok: false; pesan: string };

const normTeks = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const formatSaja = (c: TabelCell): TabelCell => {
  const f: TabelCell = { ...c, v: '' };
  delete f.cs; delete f.rs; delete f.h;
  return f;
};

/**
 * Pola blok = blok badan pertama (baris pertama + rentang gabungan tegaknya): format & gabungan disalin, teks
 * tidak. Blok setinggi `tinggi` dipakai apa adanya; selain itu kolom yang di pola menutup seluruh blok digabung
 * `tinggi` baris. Tanpa pola (badan kosong) menurun menggabung semua kolom kecuali Kolom TW & Target TW.
 */
function polaBlok(t: BentukBerperan, akhir: number, tinggi: number): TabelCell[][] {
  const ncol = t.kolom.length;
  const r0 = t.headerRows;
  if (r0 > akhir) {
    const perTw = new Set([t.peran.triwulan, t.peran.target_tw]);
    const baris = Array.from({ length: tinggi }, (_, i) => Array.from({ length: ncol }, (_, c): TabelCell =>
      (i === 0 && tinggi > 1 && !perTw.has(c) ? { v: '', rs: tinggi } : { v: '' })));
    return sanitizeRows(baris, ncol);
  }
  const awal = t.rows[r0];
  const k = Math.min(akhir - r0 + 1, Math.max(1, ...awal.filter(c => !c.h).map(c => c.rs ?? 1)));
  if (k === tinggi) {
    return sanitizeRows(t.rows.slice(r0, r0 + k).map(row => row.map(c => ({ ...c, v: '' }))), ncol);
  }
  const baris = Array.from({ length: tinggi }, (_, i) => awal.map((c): TabelCell => {
    const f = formatSaja(c);
    if (i === 0 && !c.h) {
      if ((c.cs ?? 1) > 1) f.cs = c.cs;
      if (tinggi > 1 && k > 1 && (c.rs ?? 1) >= k) f.rs = tinggi;
    }
    return f;
  }));
  // Gabungan mendatar baris pertama berlaku juga di baris-baris lain blok (kecuali yang tertutup gabungan tegak).
  for (let i = 1; i < tinggi; i++) {
    awal.forEach((c, ci) => { if (!c.h && (c.cs ?? 1) > 1 && !((c.rs ?? 1) >= k && k > 1)) baris[i][ci].cs = c.cs; });
  }
  return sanitizeRows(baris, ncol);
}

/** Baris ujung badan yang masih kosong (dipakai dulu), tanpa memotong gabungan dari atas. */
function awalUjungKosong(t: BentukBerperan, akhir: number): number {
  const ncol = t.kolom.length;
  const kosongBaris = (r: number) => t.rows[r].every((c, ci) => c.h || ci === t.kolomNomor || c.v.trim() === '');
  let s = akhir + 1;
  while (s - 1 >= t.headerRows && kosongBaris(s - 1)) s--;
  for (let ulang = true; ulang;) {
    ulang = false;
    for (let r = s; r <= akhir; r++) {
      for (let c = 0; c < ncol; c++) {
        const a = asalSel(t.rows, r, c);
        if (a.r < s) { s = a.r + a.rs; ulang = true; }
        if (a.r + a.rs - 1 > akhir) return akhir + 1;
      }
    }
  }
  return Math.min(s, akhir + 1);
}

/** Gabung tegak sel kolom `c` baris r1..r2 — hanya bila tak satu pun selnya ikut gabungan mendatar/di luar rentang. */
function gabungTegak(rows: TabelCell[][], r1: number, r2: number, c: number, ncol: number): TabelCell[][] {
  for (let r = r1; r <= r2; r++) {
    const a = asalSel(rows, r, c);
    if (a.c !== c || a.cs !== 1 || a.r < r1 || a.r + a.rs - 1 > r2) return rows;
  }
  const hasil = mergeCells(rows, r1, c, r2, c, ncol);
  for (let r = r1 + 1; r <= r2; r++) hasil[r][c] = { ...hasil[r][c], v: '' };
  return hasil;
}

/**
 * Butir Renaksi/atasan → baris tabel. Mengubah ISI saja (berhenti di form, L78): pemanggil memasangnya lewat
 * editor tabel, yang menyimpan tetap tombol Simpan halaman.
 */
export function isiDariImpor(t: BentukBerperan, items: ItemImpor[], batasBaris: number): HasilImpor {
  const ncol = t.kolom.length;
  const p = t.peran;
  const kol = (k: PeranKolom) => (p[k] !== undefined && p[k]! < ncol ? p[k]! : undefined);
  if (!items.length) return { ok: false, pesan: 'Belum ada baris dipilih.' };
  const menurun = tataLetak(p) === 'menurun';
  const tinggi = menurun ? TINGGI_MENURUN : 1;

  const adaData = (f: (it: ItemImpor) => string | null | undefined) => items.some(it => normTeks(f(it)) !== '');
  const tanpaKolom: string[] = [];
  let terisi = 0;
  const periksa = (k: PeranKolom, label: string, f: (it: ItemImpor) => string | null | undefined) => {
    if (!adaData(f)) return;
    if (kol(k) === undefined) tanpaKolom.push(label); else terisi++;
  };
  periksa('rhk_intervensi', 'RHK yang diintervensi', it => it.rhk_intervensi);
  periksa('rhk', 'Rencana Hasil Kerja', it => it.rhk);
  periksa('indikator', 'Indikator', it => it.indikator);
  periksa('cara_hitung', 'Cara hitung', it => it.cara_hitung);
  periksa('target_tahunan', 'Target tahunan', it => it.target_tahunan);
  if (menurun) periksa('target_tw', 'Target TW', it => (it.tw ?? []).join(''));
  else MENDATAR.forEach((k, i) => periksa(k, `Target TW ${ROMAWI[i]}`, it => it.tw?.[i]));
  if (!terisi) {
    return { ok: false, pesan: 'Belum ada kolom bertanda peran yang bisa diisi — tandai lewat panel "Peran kolom" di bawah tabel (atau Tebak dari judul).' };
  }

  const akhir = akhirData(t);
  const s = awalUjungKosong(t, akhir);
  const kosong = akhir - s + 1;
  const perlu = items.length * tinggi;
  if (t.rows.length - kosong + perlu > batasBaris) {
    return { ok: false, pesan: `Tabel paling banyak ${batasBaris} baris — pilih lebih sedikit (${items.length} butir × ${tinggi} baris).` };
  }

  const pola = polaBlok(t, akhir, tinggi);
  const blok = items.flatMap(it => {
    const b = pola.map(row => row.map(c => ({ ...c })));
    const tulis = (r: number, c: number | undefined, v: string | null | undefined) => {
      const teks = (v ?? '').trim();
      if (c === undefined || !teks || !b[r]?.[c] || b[r][c].h) return;
      b[r][c].v = teks;
    };
    tulis(0, kol('rhk_intervensi'), it.rhk_intervensi);
    tulis(0, kol('rhk'), it.rhk);
    tulis(0, kol('indikator'), it.indikator);
    tulis(0, kol('cara_hitung'), it.cara_hitung);
    tulis(0, kol('target_tahunan'), it.target_tahunan);
    if (menurun) {
      for (let i = 0; i < TINGGI_MENURUN; i++) {
        tulis(i, kol('triwulan'), ROMAWI[i]);
        tulis(i, kol('target_tw'), it.tw?.[i]);
      }
    } else MENDATAR.forEach((k, i) => tulis(0, kol(k), it.tw?.[i]));
    return b;
  });

  let rows = t.rows;
  let di = s;
  if (kosong === 0) {
    // Satu per satu lewat aturan "+ Baris": masuk di atas baris JUMLAH, rentang =SUM(…) di sana ikut memanjang.
    di = akhir + 1;
    for (let i = 0; i < perlu; i++) rows = sisipBarisBaru(rows, t.headerRows, ncol, !!t.gaya.jumlah).rows;
  } else if (perlu > kosong) {
    rows = sisipBarisSel(rows, s, perlu - kosong, ncol);
  } else if (perlu < kosong) {
    rows = hapusBarisSel(rows, s + perlu, akhir, ncol);
  }
  rows = rows.map((row, r) => (r >= di && r < di + perlu ? blok[r - di] : row));
  rows = sanitizeRows(rows, ncol);

  // Keputusan #6: RHK atasan sama berurutan → satu sel tergabung + satu nomor (seperti STANDAR).
  const cAtasan = kol('rhk_intervensi');
  if (cAtasan !== undefined) {
    for (let i = 0; i < items.length;) {
      const v = normTeks(items[i].rhk_intervensi);
      let j = i;
      while (v && j + 1 < items.length && normTeks(items[j + 1].rhk_intervensi) === v) j++;
      if (j > i) {
        const r1 = di + i * tinggi, r2 = di + (j + 1) * tinggi - 1;
        rows = gabungTegak(rows, r1, r2, cAtasan, ncol);
        if (t.kolomNomor !== null && t.kolomNomor < ncol && t.kolomNomor !== cAtasan) rows = gabungTegak(rows, r1, r2, t.kolomNomor, ncol);
      }
      i = j + 1;
    }
  }

  const bentuk: BentukTabel = { rows, kolom: t.kolom, align: t.align, colWidths: t.colWidths, headerRows: t.headerRows, kolomNomor: t.kolomNomor, peran: t.peran };
  return { ok: true, bentuk, baris: items.length, tanpaKolom };
}
