// ═══ Geometri halaman & indent paragraf LKJIP — SATU sumber angka ═══════════════
// Dipakai pihak-pihak yang wajib sepakat (konsep `docs/CONCEPT-lkjip-penggaris-narasi.md`):
//   · `docgen.ts`            → `<w:pgSz>`/`<w:pgMar>` dan `<w:ind>` tiap paragraf di Word
//   · `PenggarisNarasi.tsx`  → garis cm & posisi penanda
//   · `TiptapNarasi.tsx`     → atribut `data-ind-*` paragraf
//   · `sanitizeNarasiHtml`   → angka mana yang boleh tersimpan
//   · `impor-word.ts`        → `<w:ind>` berkas sumber → `data-ind-*`
// Kalau angkanya ditulis di dua tempat, penanda bisa meleset dari hasil cetak tanpa ada yang sadar.
//
// Murni: tanpa React, tanpa DOM — bisa diuji tanpa peramban.

import { LEBAR_TULIS_DXA, LEBAR_KERTAS_PX } from './tabel';

/** Kertas A4 Word (`w:pgSz`, dxa = 1/1440 inci). */
export const KERTAS = { lebar: 11907, tinggi: 16839 } as const;
/** Margin Word: atas/kanan/bawah 2,5 cm, kiri 3,0 cm. */
export const MARGIN = { atas: 1418, kanan: 1418, bawah: 1418, kiri: 1701, header: 708, footer: 708 } as const;

export const PGSZ = `<w:pgSz w:w="${KERTAS.lebar}" w:h="${KERTAS.tinggi}"/>`;
export const PGSZ_MELINTANG = `<w:pgSz w:w="${KERTAS.tinggi}" w:h="${KERTAS.lebar}" w:orient="landscape"/>`;
export const PGMAR = `<w:pgMar w:top="${MARGIN.atas}" w:right="${MARGIN.kanan}" w:bottom="${MARGIN.bawah}" w:left="${MARGIN.kiri}" w:header="${MARGIN.header}" w:footer="${MARGIN.footer}" w:gutter="0"/>`;

export const TWIPS_PER_CM = 567;
/** Lebar bidang tulis di Word: 8.788 dxa = 15,499 cm (BUKAN 15,5 bulat). */
export const LEBAR_DXA = LEBAR_TULIS_DXA;
export const CM_TULIS = LEBAR_DXA / TWIPS_PER_CM;
/** Lebar bidang tulis di layar, px editor (1 px = 15 dxa = 1/96 inci). */
export const PX_TULIS = LEBAR_KERTAS_PX;
/** Batas Zod `firstLineIndentCm` (setelan dokumen, `lib/lkjip/schemas.ts`). */
export const BATAS_INDENT_CM = 3;

/**
 * cm → twips untuk setelan dokumen. 1,27 cm = 720 twips = tepat 0,5 inci —
 * itu sebabnya 1,27 jadi bawaan, bukan 1 cm.
 */
export function indentTwips(cm: unknown): number {
  const n = Number(cm);
  return Number.isFinite(n) && n > 0 ? Math.round(n * TWIPS_PER_CM) : 0;
}

/** 12 pt → 16 px (12 × 4/3), supaya huruf editor sama besar dengan Word di 96 dpi. */
export function pxHuruf(fontSizePt: unknown): number {
  const n = Number(fontSizePt);
  return Number.isFinite(n) && n > 0 ? Math.round((n * 4) / 3 * 100) / 100 : 16;
}

/** dxa → teks cm gaya Indonesia: 720 → "1,27". */
export function cmTeks(dxa: number): string {
  return String(Math.round((dxa / TWIPS_PER_CM) * 100) / 100).replace('.', ',');
}

// ─── Indent per paragraf ──────────────────────────────────────────────────────
// Bahasanya bahasa Word: tiga angka per paragraf, semuanya dxa (1/1440 inci) supaya `<w:ind>` berkas
// sumber kembali utuh sesudah impor-ekspor. `pertama` bertanda: positif = baris pertama menjorok,
// negatif = gantung. Baris pertama mulai di `kiri + pertama`, baris berikutnya di `kiri`.

export type JenisInden = 'paragraf' | 'judul' | 'butir';
export interface Inden { kiri: number; kanan: number; pertama: number }
/** Yang tersimpan di paragraf. Kunci yang tidak ada = ikut bawaan (setelan dokumen / tingkat daftar). */
export type IndenTersimpan = Partial<Inden>;
export type Penanda = 'pertama' | 'gantung' | 'kiri' | 'kanan';

/** Lebar teks paling sempit yang masih masuk akal: 1 cm. */
export const TEKS_MIN_DXA = TWIPS_PER_CM;
/** Tingkat daftar bawaan (`buildNumbering` di docgen): teks 1,27 cm per tingkat, nomor gantung 0,63 cm. */
export const BUTIR_KIRI_DXA = 720;
export const BUTIR_GANTUNG_DXA = 360;
/** Langkah penggaris: 0,05 cm. */
export const LANGKAH_CM = 0.05;
export const LANGKAH_DXA = Math.round(LANGKAH_CM * TWIPS_PER_CM);
/** Langkah besar (Shift+panah, tombol tambah/kurangi indent): 0,5 inci seperti Word. */
export const LANGKAH_BESAR_DXA = 720;

const KUNCI_INDEN = ['kiri', 'kanan', 'pertama'] as const;
const polaAtribut = (k: string) => new RegExp(`(?<![-a-zA-Z])data-ind-${k}\\s*=\\s*["']?(-?\\d{1,5})(?=["'\\s/>]|$)`);
const POLA_INDEN = { kiri: polaAtribut('kiri'), kanan: polaAtribut('kanan'), pertama: polaAtribut('pertama') };

const jepit = (n: number, bawah: number, atas: number) => Math.min(atas, Math.max(bawah, n));

/** Baca `data-ind-*` dari teks tag HTML. Nilai di luar bidang tulis dijepit, selain angka diabaikan. */
export function bacaInden(tag: string): IndenTersimpan {
  const hasil: IndenTersimpan = {};
  for (const k of KUNCI_INDEN) {
    const m = POLA_INDEN[k].exec(tag);
    if (!m) continue;
    const n = Number(m[1]);
    hasil[k] = k === 'pertama' ? jepit(n, -LEBAR_DXA, LEBAR_DXA) : jepit(n, 0, LEBAR_DXA);
  }
  return hasil;
}

/** Bentuk atribut HTML dari nilai yang tersimpan — dibentuk dari angka, bukan echo atribut masukan. */
export function atributInden(i: IndenTersimpan): string {
  return KUNCI_INDEN.filter(k => i[k] !== undefined).map(k => ` data-ind-${k}="${Math.round(i[k]!)}"`).join('');
}

/**
 * Jaga bentuk yang mustahil: teks minimal 1 cm, baris pertama tidak keluar margin kiri (`kiri + pertama ≥ 0`)
 * dan tidak melewati batas kanan. Butir daftar hanya boleh gantung: nomornya memang di kiri teks.
 */
export function jepitInden(i: Inden, jenis: JenisInden): Inden {
  const kanan = jepit(Math.round(i.kanan), 0, LEBAR_DXA - TEKS_MIN_DXA);
  const kiri = jepit(Math.round(i.kiri), 0, LEBAR_DXA - kanan - TEKS_MIN_DXA);
  const atas = jenis === 'butir' ? 0 : LEBAR_DXA - kanan - TEKS_MIN_DXA - kiri;
  return { kiri, kanan, pertama: jepit(Math.round(i.pertama), -kiri, atas) };
}

/** Yang berlaku kalau paragraf ini tidak punya isian sendiri. */
export function indenBawaan(jenis: JenisInden, bawaanDxa = 0, kedalaman = 1): Inden {
  if (jenis === 'butir') return { kiri: BUTIR_KIRI_DXA * Math.max(1, kedalaman), kanan: 0, pertama: -BUTIR_GANTUNG_DXA };
  return { kiri: 0, kanan: 0, pertama: jenis === 'paragraf' ? bawaanDxa : 0 };
}

export function indenBerlaku(simpan: IndenTersimpan | null | undefined, jenis: JenisInden, bawaanDxa = 0, kedalaman = 1): Inden {
  return jepitInden({ ...indenBawaan(jenis, bawaanDxa, kedalaman), ...(simpan ?? {}) }, jenis);
}

/** Hanya simpan yang berbeda dari bawaan — paragraf yang kembali ke bawaan ikut setelan dokumen lagi. */
export function keTersimpan(i: Inden, jenis: JenisInden, bawaanDxa = 0, kedalaman = 1): IndenTersimpan {
  const b = indenBawaan(jenis, bawaanDxa, kedalaman);
  const j = jepitInden(i, jenis);
  const hasil: IndenTersimpan = {};
  for (const k of KUNCI_INDEN) if (j[k] !== b[k]) hasil[k] = j[k];
  return hasil;
}

/** `<w:ind>` sebuah paragraf; '' bila tidak ada yang perlu ditulis. Butir tanpa isian ikut tingkat daftarnya. */
export function xmlInden(simpan: IndenTersimpan | null | undefined, jenis: JenisInden, bawaanDxa = 0, kedalaman = 1): string {
  const adaIsian = !!simpan && KUNCI_INDEN.some(k => simpan[k] !== undefined);
  if (jenis === 'butir' && !adaIsian) return '';
  const i = indenBerlaku(simpan, jenis, bawaanDxa, kedalaman);
  const a: string[] = [];
  if (jenis === 'butir' || i.kiri !== 0) a.push(`w:left="${i.kiri}"`);
  if (i.kanan !== 0) a.push(`w:right="${i.kanan}"`);
  // Butir: `hanging` selalu ditulis, kalau tidak gantung bawaan tingkat daftarnya tetap berlaku.
  if (i.pertama < 0 || jenis === 'butir') a.push(`w:hanging="${-i.pertama}"`);
  else if (i.pertama > 0) a.push(`w:firstLine="${i.pertama}"`);
  return a.length ? `<w:ind ${a.join(' ')}/>` : '';
}

/**
 * Bulatkan ke 0,05 cm — tapi kelipatan 0,25 inci (360 dxa) menang bila dekat, supaya 1,27 cm (720 dxa,
 * bawaan Word & dokumen) bisa dicapai persis; 720 sendiri tidak jatuh di kisi 0,05 cm.
 */
export function snapDxa(x: number): number {
  const kelipatan = Math.round(x / BUTIR_GANTUNG_DXA) * BUTIR_GANTUNG_DXA;
  if (Math.abs(x - kelipatan) <= LANGKAH_DXA / 2) return kelipatan;
  return Math.round(Math.round(x / TWIPS_PER_CM / LANGKAH_CM) * LANGKAH_CM * TWIPS_PER_CM);
}

/**
 * Akibat menyeret satu penanda ke posisi `x` (dxa dari tepi kiri bidang tulis) — perilaku penggaris Word:
 *   · `pertama` : hanya baris pertama yang pindah
 *   · `gantung` : baris berikutnya pindah, baris pertama TETAP di tempatnya
 *   · `kiri`    : baris pertama dan berikutnya pindah bersama
 *   · `kanan`   : batas kanan (x dihitung dari kiri, disimpan sebagai jarak dari kanan)
 */
export function geserPenanda(i: Inden, penanda: Penanda, x: number, jenis: JenisInden): Inden {
  const s = snapDxa(x);
  const awalPertama = i.kiri + i.pertama;
  const batasKanan = LEBAR_DXA - i.kanan - TEKS_MIN_DXA;
  switch (penanda) {
    case 'pertama': {
      const posisi = jepit(s, 0, jenis === 'butir' ? i.kiri : batasKanan);
      return jepitInden({ ...i, pertama: posisi - i.kiri }, jenis);
    }
    case 'gantung': {
      // Butir: teks tidak boleh melewati nomornya ke kiri.
      const kiri = jepit(s, jenis === 'butir' ? awalPertama : 0, batasKanan);
      return jepitInden({ ...i, kiri, pertama: awalPertama - kiri }, jenis);
    }
    case 'kiri': {
      const kiri = jepit(s, Math.max(0, -i.pertama), batasKanan - Math.max(0, i.pertama));
      return jepitInden({ ...i, kiri }, jenis);
    }
    case 'kanan': {
      // Yang dibulatkan jarak dari KANAN: itu angka yang dibaca orang ("kanan 1,27 cm"), bukan jarak dari kiri.
      const posisi = jepit(LEBAR_DXA - snapDxa(LEBAR_DXA - x), Math.max(i.kiri, awalPertama) + TEKS_MIN_DXA, LEBAR_DXA);
      return jepitInden({ ...i, kanan: LEBAR_DXA - posisi }, jenis);
    }
  }
}

/** Posisi penanda di penggaris, dxa dari tepi kiri bidang tulis. */
export function posisiPenanda(i: Inden, penanda: Penanda): number {
  if (penanda === 'pertama') return i.kiri + i.pertama;
  if (penanda === 'kanan') return LEBAR_DXA - i.kanan;
  return i.kiri;
}

/** Bidang yang berubah antara dua keadaan — dipakai untuk menerapkannya ke semua paragraf terpilih. */
export function bidangBerubah(lama: Inden, baru: Inden): Partial<Inden> {
  const hasil: Partial<Inden> = {};
  for (const k of KUNCI_INDEN) if (lama[k] !== baru[k]) hasil[k] = baru[k];
  return hasil;
}

/** "Kiri 0 · Kanan 0 · Baris pertama 1,27 cm" — teks yang sama dengan isian di panel. */
export function ringkasInden(i: Inden): string {
  const khusus = i.pertama === 0 ? 'Tanpa baris pertama' : i.pertama > 0 ? `Baris pertama ${cmTeks(i.pertama)} cm` : `Gantung ${cmTeks(-i.pertama)} cm`;
  return `Kiri ${cmTeks(i.kiri)} · Kanan ${cmTeks(i.kanan)} · ${khusus}`;
}

/** Panjang CSS → dxa, untuk teks tempelan dari Word (`margin-left:.5in; text-indent:-.25in`). Bukan panjang = null. */
export function dxaDariCss(nilai: string | null | undefined): number | null {
  const m = /^\s*(-?\d*\.?\d+)\s*(in|cm|mm|pt|px)?\s*$/i.exec(String(nilai ?? ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const satuan = (m[2] ?? (n === 0 ? 'pt' : '')).toLowerCase();
  const per: Record<string, number> = { in: 1440, cm: TWIPS_PER_CM, mm: TWIPS_PER_CM / 10, pt: 20, px: 15 };
  return per[satuan] === undefined ? null : Math.round(n * per[satuan]);
}
