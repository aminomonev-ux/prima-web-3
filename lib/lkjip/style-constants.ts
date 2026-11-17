// ═══ PRIMA — LKJIP — konstanta style client-safe ════════════════════
// Dipisah dari schemas.ts: schemas.ts meng-import ratelimit (→ new Redis() di
// top-level modul). Bila Client Component (editor-client.tsx) import FONT_CHOICES
// dari schemas.ts, rantai ratelimit→Redis ikut ter-bundle ke browser → warning
// "[Upstash Redis] token missing". File ini bersih dari dependency server.

// Satu daftar untuk huruf dokumen DAN huruf per kata (konsep pratinjau-dan-word §3). Hanya huruf yang ikut Windows
// atau Office: huruf unduhan diganti diam-diam oleh Word di komputer pembaca lain.
export const FONT_CHOICES = [
  'Arial', 'Calibri', 'Times New Roman', 'Bookman Old Style', 'Cambria',
  'Tahoma', 'Verdana', 'Segoe UI', 'Georgia', 'Garamond', 'Century Gothic', 'Book Antiqua',
] as const;
export type NamaHuruf = typeof FONT_CHOICES[number];
export const HURUF_DOKUMEN_BAWAAN: NamaHuruf = 'Arial';

const PETA_HURUF = new Map<string, NamaHuruf>(FONT_CHOICES.map(f => [f.toLowerCase(), f]));

/** Nama huruf → ejaan di daftar, atau `null`. Tanda kutip & spasi ganda dibuang; huruf besar/kecil tidak dibedakan. */
export function hurufSah(nama: unknown): NamaHuruf | null {
  const n = String(nama ?? '').replace(/&quot;|&#0*39;|&apos;|["']/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
  return PETA_HURUF.get(n) ?? null;
}

/**
 * `font-family` di teks gaya/tag → nama di daftar. Hanya keluarga PERTAMA yang dinilai: itu yang dipakai Word dan
 * peramban; cadangan `serif` di belakangnya tidak berarti apa-apa di Word.
 */
export function hurufDariGaya(gaya: string): NamaHuruf | null {
  // Entitas diurai dulu: `;` milik `&quot;` bukan akhir deklarasi.
  const m = /(?<![-a-zA-Z])font-family\s*:\s*([^;>]*)/i.exec(gaya.replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'"));
  if (!m) return null;
  return hurufSah(m[1].split(',')[0]);
}

/**
 * Tempelan: `font-family` dipertahankan hanya bila namanya di daftar DAN bukan huruf dokumen (dibentuk ulang dari
 * daftar); sisanya dibuang supaya teksnya ikut huruf dokumen. Tanpa ini tiap tempelan dari Word membawa
 * huruf di tiap run, termasuk huruf yang sama dengan dokumen.
 */
export function saringHurufTempel(html: string, hurufDokumen: string): string {
  const dok = hurufSah(hurufDokumen);
  return html.replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (_, awal: string, ganda?: string, tunggal?: string) => {
    const kutip = ganda !== undefined ? '"' : "'";
    const nilai = (ganda ?? tunggal ?? '').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'");
    const baru = nilai.replace(/(?<![-a-zA-Z])font-family\s*:\s*([^;]*);?/gi, (_m, v: string) => {
      const h = hurufSah(v.split(',')[0]);
      return h && h !== dok ? `font-family:${h};` : '';
    });
    const aman = kutip === '"' ? baru.replace(/"/g, '&quot;') : baru.replace(/'/g, '&#39;');
    return `${awal}${kutip}${aman}${kutip}`;
  });
}

// Header & footer (konsep pratinjau-dan-word §2) — pilihan dipakai skema DAN ⚙ Pengaturan.
export const RATA_HEADER = ['kiri', 'tengah', 'kanan'] as const;
export const POSISI_NOMOR = ['otomatis', 'tengah', 'kanan'] as const;
