// app/api/iki/import-renaksi/route.ts
// Tarik referensi dari aplikasi Rencana Aksi (tabel `rencana_aksi`) untuk prefill
// grup RHK di editor IKI. Pola sejajar PK import-renaksi (sumber sama).
// Mapping (docs/CONCEPT-iki.md §4.1):
//   RHK diintervensi ← level 'sasaran' · RHK ← outcome_* (fallback nama)
//   aspek_b ← jenis (enum identik) · Target Tahunan ← fmtTarget(target_tahunan, satuan)
//   Target TW I-IV ← q1..q4_target
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ImportRenaksiQuerySchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

type RaSrc = {
  id: number;
  level: 'tujuan' | 'sasaran' | 'program' | 'kegiatan' | 'sub-kegiatan';
  sasaran: string | null;
  tujuan: string | null;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
  jenis: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';
  satuan: string;
  target_tahunan: number;
  q1_target: number; q2_target: number; q3_target: number; q4_target: number;
};

export type IkiRenaksiImportRow = {
  renaksi_id: number;
  level: RaSrc['level'];
  /** Nama sasaran induk (kandidat RHK diintervensi) — '' untuk level sasaran/tujuan */
  sasaran_induk: string;
  /** Kandidat teks RHK (outcome, fallback nama) */
  rhk: string;
  /** Nama hierarki mentah untuk tampilan picker */
  nama: string;
  parent: string;
  indikator: string;
  jenis: RaSrc['jenis'];
  target_tahunan: string;
  target_tw: [string, string, string, string];
};

/** Format target: "Persen"/"%" → "100%", lainnya → "12 Dokumen". Sync fmtTarget PK. */
function fmtTarget(n: number, satuan: string): string {
  const sat = satuan.trim();
  if (/^persen$/i.test(sat) || sat === '%') return `${n}%`;
  return `${n} ${sat}`.trim();
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'import-renaksi', 10);
  if (limited) return limited;

  const tahunRaw = new URL(req.url).searchParams.get('tahun') ?? '';
  const parsed = ImportRenaksiQuerySchema.safeParse({ tahun: tahunRaw });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tahun tidak valid' }, { status: 400 });
  }
  const tahun = parsed.data.tahun;

  const raRows = await sql`
    SELECT id, level, sasaran, tujuan,
           outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator, jenis, satuan, target_tahunan,
           q1_target, q2_target, q3_target, q4_target
    FROM rencana_aksi
    WHERE tahun = ${tahun}
    ORDER BY level, program, kegiatan, sub_kegiatan
  ` as RaSrc[];

  const rows: IkiRenaksiImportRow[] = raRows.map((r) => {
    const outcome =
      r.level === 'program' ? r.outcome_program
      : r.level === 'kegiatan' ? r.outcome_kegiatan
      : r.level === 'sub-kegiatan' ? r.outcome_sub_kegiatan
      : null;
    const nama =
      r.level === 'kegiatan' ? (r.kegiatan ?? r.program)
      : r.level === 'sub-kegiatan' ? (r.sub_kegiatan ?? r.program)
      : r.program;
    const parent =
      r.level === 'program' ? (r.sasaran ?? '')
      : r.level === 'kegiatan' ? r.program
      : r.level === 'sub-kegiatan' ? (r.kegiatan ?? r.program)
      : r.level === 'sasaran' ? (r.tujuan ?? '')
      : '';
    return {
      renaksi_id: r.id,
      level: r.level,
      sasaran_induk: r.level === 'program' ? (r.sasaran ?? '') : '',
      rhk: outcome ?? nama,
      nama,
      parent,
      indikator: r.indikator,
      jenis: r.jenis,
      target_tahunan: fmtTarget(Number(r.target_tahunan), r.satuan),
      target_tw: [
        fmtTarget(Number(r.q1_target), r.satuan),
        fmtTarget(Number(r.q2_target), r.satuan),
        fmtTarget(Number(r.q3_target), r.satuan),
        fmtTarget(Number(r.q4_target), r.satuan),
      ],
    };
  });

  await writeAuditLog({
    req, eventType: 'IKI_IMPORT_RENAKSI', userId: g.session.userId, username: g.session.username,
    detail: `Fetch import Renaksi IKI tahun ${tahun}: ${rows.length} baris`,
  });
  return NextResponse.json({ ok: true, tahun, rows });
}
