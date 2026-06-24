// ═══ PRIMA — LKJIP — Zod sentral + role + rate-limit ══════════════
// Konsep: docs/session/lkjip/CONCEPT.md
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { MAX_DEPTH } from './numbering';
import { FONT_CHOICES } from './style-constants';

// K6: akses dasar SUPER_ADMIN + ADMIN. Role lain (mis. BIDANG_RENBANG) via
// users.app_access include 'lkjip' (diatur Admin Panel → User Management). Pola BBA/Rencana Aksi.
export const LKJIP_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export const LKJIP_APP_KEY = 'lkjip';

export function isLkjipRole(role: string, appAccess: string[] | null | undefined): boolean {
  if ((LKJIP_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes(LKJIP_APP_KEY);
}

/** Rate-limit per user+action (pola bbaRateLimit). Return 429 NextResponse atau null. */
export async function lkjipRateLimit(userId: number, action: string, maxPerMinute: number): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`lkjip-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, msg: `Terlalu cepat. Coba lagi dalam ${rl.resetIn} detik.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    );
  }
  return null;
}

const TahunSchema = z.coerce.number().int().min(2015, 'Tahun 2015-2100').max(2100, 'Tahun 2015-2100');

// ── Style config (Item 3: formatting Word, default dokumen) ──────
// FONT_CHOICES dipindah ke ./style-constants (client-safe, dipakai editor-client).
export const StyleConfigSchema = z.object({
  fontFamily:   z.enum(FONT_CHOICES).default('Arial'),
  fontSizePt:   z.coerce.number().min(9).max(16).default(12),
  lineSpacing:  z.coerce.number().refine(v => [1, 1.15, 1.5, 2].includes(v), 'Spasi 1/1.15/1.5/2').default(1.5),
  align:        z.enum(['both', 'left']).default('both'),
  spaceAfterPt: z.coerce.number().min(0).max(24).default(6),
  firstLineIndentCm: z.coerce.number().min(0).max(3).default(1.27),   // indent baris pertama paragraf isi (0 = tanpa)
  pageNumber:   z.boolean().default(true),   // footer + nomor halaman
  footerText:   z.string().max(120).default(''),
  romanFront:   z.boolean().default(true),    // cover bebas-nomor, daftar romawi (i,ii), isi arab (1,2)
  tableHeaderFill: z.string().regex(/^[0-9a-fA-F]{6}$/).default('EDEDED'),   // warna latar header tabel (hex tanpa #)
  // Kata Pengantar (front-matter, setelah cover sebelum Daftar Isi) + blok tanda tangan
  kataPengantarHtml: z.string().max(20000).default(''),
  ttdTempatTanggal:  z.string().max(120).default(''),
  ttdJabatan:        z.string().max(300).default(''),   // boleh multi-baris (\n)
  ttdNama:           z.string().max(120).default(''),
  ttdPangkat:        z.string().max(120).default(''),
  ttdNip:            z.string().max(60).default(''),
}).transform(c => ({ ...c, kataPengantarHtml: sanitizeNarasiHtml(c.kataPengantarHtml) }));
export type StyleConfig = z.infer<typeof StyleConfigSchema>;
export const DEFAULT_STYLE: StyleConfig = { fontFamily: 'Arial', fontSizePt: 12, lineSpacing: 1.5, align: 'both', spaceAfterPt: 6, firstLineIndentCm: 1.27, pageNumber: true, footerText: '', romanFront: true, tableHeaderFill: 'EDEDED', kataPengantarHtml: '', ttdTempatTanggal: '', ttdJabatan: '', ttdNama: '', ttdPangkat: '', ttdNip: '' };

// Sanitizer narasi (server-safe, no DOM) — whitelist tag, buang semua atribut.
// Defense-in-depth: Tiptap re-parse saat load + docgen parse ke OOXML (bukan innerHTML).
const NARASI_ALLOWED_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li']);
export function sanitizeNarasiHtml(html: string): string {
  if (!html) return '';
  let s = String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<\/?([a-zA-Z0-9]+)\b([^>]*)>/g, (m, tag, attrs) => {
    const t = String(tag).toLowerCase();
    if (!NARASI_ALLOWED_TAGS.has(t)) return '';
    if (t === 'br') return '<br>';
    if (m.startsWith('</')) return `</${t}>`;
    // Hanya izinkan text-align (4 nilai enum) pada <p>. Output dibentuk dari literal enum,
    // bukan echo atribut user → tak ada vektor XSS. Atribut lain tetap dibuang.
    if (t === 'p' || t === 'h1' || t === 'h2' || t === 'h3') {
      const al = /text-align\s*:\s*(left|center|right|justify)/i.exec(String(attrs || ''));
      if (al) return `<${t} style="text-align:${al[1].toLowerCase()}">`;
    }
    // <span>: hanya color (hex/rgb) + font-size (px, 6-72). Output dibentuk dari nilai
    // tervalidasi (hex/digit), bukan echo atribut user → tak ada vektor XSS.
    // <ol type="a">: izinkan HANYA penanda huruf (a, b, c). Output literal, bukan echo atribut.
    if (t === 'ol') {
      const isAlpha = /type\s*=\s*["']?a/i.test(String(attrs || '')) || /list-style-type\s*:\s*lower-alpha/i.test(String(attrs || ''));
      return isAlpha ? '<ol type="a">' : '<ol>';
    }
    if (t === 'span') {
      const out: string[] = [];
      const col = /(?<![-a-zA-Z])color\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))/i.exec(String(attrs || ''));
      if (col) out.push(`color:${col[1].toLowerCase().replace(/\s+/g, '')}`);
      const fsz = /font-size\s*:\s*(\d{1,3})px/i.exec(String(attrs || ''));
      if (fsz) out.push(`font-size:${Math.min(72, Math.max(6, parseInt(fsz[1], 10)))}px`);
      return out.length ? `<span style="${out.join(';')}">` : '<span>';
    }
    return `<${t}>`;
  });
  return s.slice(0, 50000);
}

// ── Dokumen ──────────────────────────────────────────────────────
export const DokumenQuerySchema = z.object({
  tahun:  TahunSchema.optional(),
  status: z.enum(['DRAFT', 'FINAL']).optional(),
  q:      z.string().max(120).optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
});

export const DokumenCreateSchema = z.object({
  tahun: TahunSchema,
  judul: z.string().trim().min(1).max(255).optional(),
  template: z.enum(['standar', 'kosong']).default('standar'), // standar = seed BAB I-V; kosong = susun sendiri
});

export const DokumenHeaderSchema = z.object({
  id:               z.number().int().positive(),
  expected_version: z.number().int().min(0),
  judul:            z.string().trim().min(1).max(255).optional(),
  style_config:     StyleConfigSchema.optional(),
});

export const DokumenFinalizeSchema = z.object({
  id:               z.coerce.number().int().positive(),
  expected_version: z.coerce.number().int().min(0),
});

export const DokumenDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

// ── Section ──────────────────────────────────────────────────────
export const SectionCreateSchema = z.object({
  dokumen_id: z.number().int().positive(),
  parent_id:  z.number().int().positive().nullable().default(null),
  judul:      z.string().trim().min(1, 'Judul wajib').max(255),
});

export const SectionRenameSchema = z.object({
  id:    z.number().int().positive(),
  judul: z.string().trim().min(1, 'Judul wajib').max(255),
});

// Pindah / indent / outdent / reorder dalam 1 operasi: tentukan parent baru + index posisi.
export const SectionMoveSchema = z.object({
  id:            z.number().int().positive(),
  new_parent_id: z.number().int().positive().nullable().default(null),
  new_index:     z.number().int().min(0), // posisi 0-based di antara saudara baru
});

export const SectionDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

// ── Block payloads ───────────────────────────────────────────────
const AlignSchema = z.enum(['left', 'center', 'right', 'justify']);
const VAlignSchema = z.enum(['top', 'middle', 'bottom']);
// Sel tabel: string (legacy) ATAU objek (merge/format). Selalu dinormalisasi ke objek.
const CellSchema = z.union([
  z.string().max(2000),
  z.object({
    v:  z.string().max(2000).default(''),
    cs: z.coerce.number().int().min(1).max(12).optional(),
    rs: z.coerce.number().int().min(1).max(500).optional(),
    h:  z.boolean().optional(),
    al: AlignSchema.optional(),
    va: VAlignSchema.optional(),
    b:  z.boolean().optional(),
    fs: z.coerce.number().int().min(6).max(72).optional(),
    bd: z.object({
      t: z.coerce.number().int().min(0).max(48).optional(),
      r: z.coerce.number().int().min(0).max(48).optional(),
      b: z.coerce.number().int().min(0).max(48).optional(),
      l: z.coerce.number().int().min(0).max(48).optional(),
    }).optional(),
    nf:  z.enum(['num', 'rp', 'pct']).optional(),
    dec: z.coerce.number().int().min(0).max(6).optional(),
    bg:  z.string().regex(/^[0-9a-fA-F]{6}$/).optional(),
  }),
]).transform(c => (typeof c === 'string' ? { v: c } : c));

export const NarasiPayloadSchema = z.object({
  html: z.string().max(50000).default(''),
  continueList: z.boolean().optional().default(false), // lanjutkan penomoran list dari blok sebelumnya
}).transform(p => ({ html: sanitizeNarasiHtml(p.html), continueList: p.continueList === true }));

export const TabelPayloadSchema = z.object({
  judul: z.string().max(255).default(''),
  kolom: z.array(z.string().max(255)).min(1, 'Minimal 1 kolom').max(12),
  align: z.array(AlignSchema).max(12).default([]),
  colWidths: z.array(z.coerce.number().int().min(24).max(2000)).max(12).default([]),
  headerRows: z.coerce.number().int().min(0).max(4).default(0),
  rows:  z.array(z.array(CellSchema).max(12)).max(500).default([]),
});

export const GambarPayloadSchema = z.object({
  judul:   z.string().max(255).default(''),
  fileId:  z.string().max(200).default(''),
  caption: z.string().max(500).default(''),
});

// Grafik (pie/bar/line). Render recharts di editor → PNG (html2canvas-pro) → imageFileId.
// imageFileId = Drive fileId, di-embed ke Word lewat pipeline gambar (sama dgn GAMBAR).
const GrafikDatumSchema = z.object({
  label: z.string().max(120).default(''),
  value: z.coerce.number().finite().default(0),
});
export const GrafikPayloadSchema = z.object({
  judul:       z.string().max(255).default(''),
  chartType:   z.enum(['pie', 'bar', 'line']).default('bar'),
  source:      z.enum(['manual', 'tabel']).default('manual'),
  data:        z.array(GrafikDatumSchema).max(50).default([]),
  tabelBlockId: z.coerce.number().int().positive().nullable().default(null),
  labelCol:    z.coerce.number().int().min(0).max(11).default(0),
  valueCol:    z.coerce.number().int().min(0).max(11).default(1),
  imageFileId: z.string().max(200).default(''),
  caption:     z.string().max(500).default(''),
});

export const BLOCK_TIPES = ['NARASI', 'TABEL', 'GAMBAR', 'GRAFIK'] as const;
export type BlockTipe = typeof BLOCK_TIPES[number];

/** Validasi payload sesuai tipe. Throw ZodError kalau invalid. Return payload bersih. */
export function parseBlockPayload(tipe: BlockTipe, raw: unknown): unknown {
  switch (tipe) {
    case 'NARASI': return NarasiPayloadSchema.parse(raw);
    case 'TABEL':  return TabelPayloadSchema.parse(raw);
    case 'GAMBAR': return GambarPayloadSchema.parse(raw);
    case 'GRAFIK': return GrafikPayloadSchema.parse(raw);
  }
}

export const BlockCreateSchema = z.object({
  section_id: z.number().int().positive(),
  tipe:       z.enum(BLOCK_TIPES),
  payload:    z.unknown(),
});

export const BlockUpdateSchema = z.object({
  id:      z.number().int().positive(),
  payload: z.unknown(),
});

export const BlockReorderSchema = z.object({
  section_id: z.number().int().positive(),
  order:      z.array(z.number().int().positive()).max(100), // id blok terurut
});

export const BlockDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

// ── Versi / Riwayat ──────────────────────────────────────────────
export const VersiSaveSchema = z.object({ label: z.string().trim().max(255).optional() });
export const VersiRestoreSchema = z.object({
  versi_id:         z.coerce.number().int().positive(),
  expected_version: z.coerce.number().int().min(0),
});

export type DokumenQuery     = z.infer<typeof DokumenQuerySchema>;
export type DokumenCreate    = z.infer<typeof DokumenCreateSchema>;
export type SectionCreate    = z.infer<typeof SectionCreateSchema>;
export type SectionMove      = z.infer<typeof SectionMoveSchema>;

export { MAX_DEPTH };
