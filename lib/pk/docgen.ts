// lib/pk/docgen.ts
// Word document generator untuk Perjanjian Kinerja (PK).
// Pattern: docxtemplater (template-based) + dynamic import L18 PERF-C3.
//
// 2 template di lib/pk/templates/:
//   - pk-rsjd-amino-murni.docx       (jenis_pk='MURNI')
//   - pk-rsjd-amino-perubahan.docx   (jenis_pk='PERUBAHAN')
//
// Setup template: lihat lib/pk/templates/README.md untuk syntax placeholder.
// Dua tabel halaman 2 dibuat `tabel-word.ts` (PURE).

import { promises as fs } from 'fs';
import path from 'path';
import { sql } from '@/lib/data/db';
import {
  buildAnggaranTableXml, buildLampiranTableXml, tanpaKarakterKendali,
  type BarisAnggaranPk, type BarisLampiranPk,
} from './tabel-word';

export type PkDokumenForGenerate = {
  id: number;
  tahun: string;
  tanggal_dokumen: string;
  jenis_pk: 'MURNI' | 'PERUBAHAN';
  unit_pertama: string;  nama_pertama: string;  jabatan_pertama: string;  pangkat_pertama: string | null;  nip_pertama: string | null;
  unit_kedua: string;    nama_kedua: string;    jabatan_kedua: string;    pangkat_kedua: string | null;    nip_kedua: string | null;
  lampiran: BarisLampiranPk[];
  anggaran: BarisAnggaranPk[];
};

/**
 * Load dokumen header + lampiran + anggaran untuk generate.
 */
async function loadPkDokumenForGenerate(dokumenId: number): Promise<PkDokumenForGenerate | null> {
  const headers = await sql`
    SELECT id, tahun, DATE_FORMAT(tanggal_dokumen, '%Y-%m-%d') AS tanggal_dokumen, jenis_pk,
           unit_pertama, nama_pertama, jabatan_pertama, pangkat_pertama, nip_pertama,
           unit_kedua,   nama_kedua,   jabatan_kedua,   pangkat_kedua,   nip_kedua
    FROM pk_dokumen
    WHERE id = ${dokumenId}
    LIMIT 1
  ` as PkDokumenForGenerate[];
  if (!headers.length) return null;

  const [lampiranRaw, anggaranRaw] = await Promise.all([
    sql`SELECT uraian, indikator, target, satuan, level, program, kegiatan, subkegiatan
        FROM pk_dokumen_lampiran WHERE dokumen_id = ${dokumenId} ORDER BY urutan, id`,
    sql`SELECT uraian, keterangan_sumber, nominal, level, program, kegiatan, subkegiatan
        FROM pk_dokumen_anggaran WHERE dokumen_id = ${dokumenId} ORDER BY urutan, id`,
  ]);

  return {
    ...headers[0],
    lampiran: lampiranRaw as unknown as BarisLampiranPk[],
    anggaran: anggaranRaw as unknown as BarisAnggaranPk[],
  };
}

/**
 * Title Case: "KEPALA BIDANG PELAYANAN MEDIS" → "Kepala Bidang Pelayanan Medis"
 * "PLT. WADIR PELAYANAN" → "Plt. Wadir Pelayanan" (titik tetap aman).
 */
function toTitleCase(s: string): string {
  return s.toLowerCase().split(/\s+/).map(w =>
    w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)
  ).join(' ');
}

/** RS suffix yang di-append di setiap jabatan (Unit Kerja header + tanda tangan). */
const RS_SUFFIX = 'RSJD Dr. Amino Gondohutomo';

/** Format jabatan untuk Word: title-case + suffix RS. Kosong tetap kosong. */
export function fmtJabatan(j: string | null | undefined): string {
  const v = tanpaKarakterKendali(j).trim();
  if (!v) return '';
  return `${toTitleCase(v)} ${RS_SUFFIX}`;
}

/**
 * Format jabatan khusus area TTD: UPPERCASE penuh + TANPA suffix RS.
 * Exception: prefix "Plt." / "Plh." tetap title-case (bukan PLT./PLH.) sesuai konvensi PNS.
 */
export function fmtJabatanTtd(j: string | null | undefined): string {
  const v = tanpaKarakterKendali(j).trim();
  if (!v) return '';
  return v.toUpperCase().replace(/^(PLT|PLH)\.\s*/i, (_, p) => `${p[0]}${p.slice(1).toLowerCase()}. `);
}

/**
 * Format tanggal Indonesia: "23 Mei 2026".
 * Dibaca dari teks 'YYYY-MM-DD', bukan `new Date(iso)` — konstruktor Date
 * menafsirkannya sebagai UTC, dan hasilnya lalu bergantung zona waktu proses.
 */
export function fmtTanggalID(iso: string): string {
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso);
  return `${Number(m[3])} ${bulan[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

export function templatPk(jenis: PkDokumenForGenerate['jenis_pk']): string {
  return jenis === 'PERUBAHAN' ? 'pk-rsjd-amino-perubahan.docx' : 'pk-rsjd-amino-murni.docx';
}

/** Nama berkas: PK-{tahun}-{unit_pertama}-{jenis_pk}.docx */
export function namaBerkasPk(data: Pick<PkDokumenForGenerate, 'tahun' | 'unit_pertama' | 'jenis_pk'>): string {
  const safeUnit = data.unit_pertama
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return `PK-${data.tahun}-${safeUnit}-${data.jenis_pk}.docx`;
}

/**
 * Isi templat dengan data dokumen. Dipisah dari `generatePkDocument` supaya dokumen utuh
 * bisa disusun dan diperiksa tanpa basis data (scripts/test-pk-sesuai-pdf.mts).
 *
 * Pattern dynamic import (L18 PERF-C3) — docxtemplater + pizzip lazy-load.
 */
export async function rakitPkDocx(data: PkDokumenForGenerate, templat: Buffer): Promise<Buffer> {
  const PizZip = (await import('pizzip')).default;
  const Docxtemplater = (await import('docxtemplater')).default;

  const doc = new Docxtemplater(new PizZip(templat), {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });

  const teks = (s: string | null | undefined) => tanpaKarakterKendali(s).trim();

  doc.render({
    // Header
    tahun:                teks(data.tahun),
    tanggal_dokumen:      fmtTanggalID(data.tanggal_dokumen),
    jenis_pk:             data.jenis_pk,
    // Pihak Pertama (bawahan) — {jabatan_pertama} title-case+suffix utk halaman 1 & baris Unit Kerja,
    // {jabatan_pertama_ttd} UPPERCASE tanpa suffix khusus area TTD hal 1+2.
    nama_pertama:         teks(data.nama_pertama),
    jabatan_pertama:      fmtJabatan(data.jabatan_pertama),
    jabatan_pertama_ttd:  fmtJabatanTtd(data.jabatan_pertama),
    pangkat_pertama:      teks(data.pangkat_pertama),
    nip_pertama:          teks(data.nip_pertama),
    // Pihak Kedua (atasan)
    nama_kedua:           teks(data.nama_kedua),
    jabatan_kedua:        fmtJabatan(data.jabatan_kedua),
    jabatan_kedua_ttd:    fmtJabatanTtd(data.jabatan_kedua),
    pangkat_kedua:        teks(data.pangkat_kedua),
    nip_kedua:            teks(data.nip_kedua),
    // Raw XML untuk tabel lampiran + anggaran (placeholder {@xxx} di template)
    lampiran_xml:         buildLampiranTableXml(data.lampiran),
    anggaran_xml:         buildAnggaranTableXml(data.anggaran),
  });

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
}

/**
 * Generate Word document untuk dokumen PK.
 * Returns Buffer + suggested filename.
 *
 * @throws Error kalau template file tidak ada atau render gagal.
 */
export async function generatePkDocument(dokumenId: number): Promise<{ buffer: Buffer; filename: string }> {
  const data = await loadPkDokumenForGenerate(dokumenId);
  if (!data) throw new Error(`Dokumen PK id=${dokumenId} tidak ditemukan`);

  const templateFile = templatPk(data.jenis_pk);
  let content: Buffer;
  try {
    content = await fs.readFile(path.join(process.cwd(), 'lib/pk/templates', templateFile));
  } catch {
    throw new Error(
      `Template ${templateFile} tidak ditemukan. ` +
      `Setup template di lib/pk/templates/ — lihat lib/pk/templates/README.md untuk instruksi.`,
    );
  }

  return { buffer: await rakitPkDocx(data, content), filename: namaBerkasPk(data) };
}
