// app/api/perjanjian-kinerja/sasaran/import-renaksi/route.ts
// Tarik referensi sasaran dari aplikasi Rencana Aksi (tabel `rencana_aksi`) lalu
// flatten cascade jadi shape Master Sasaran PK (1 row per leaf sub-kegiatan,
// dengan parent program/kegiatan ter-isi). Hasil di-append ke state client —
// commit ke DB lewat POST /api/perjanjian-kinerja/sasaran existing.
//
// Konvensi naming: sejajar dengan "Import Renaksi" Master Program di
// /api/perjanjian-kinerja/program/import-renaksi (sama-sama sumber rencana_aksi).
//   - Endpoint ini "Import Renaksi" untuk Master Sasaran.
//   - Endpoint E-Anggaran "Init Renaksi" (Master Rekening) terpisah, tidak terdampak.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isPkRole, pkRateLimit, TahunSchema } from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export const dynamic = 'force-dynamic';

type RaSrc = {
  level: 'sasaran' | 'program' | 'kegiatan' | 'sub-kegiatan';
  sasaran: string | null;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
  satuan: string;
  target_tahunan: number;
};

type PkSasaranImportRow = {
  program: string;
  indikator_program: string | null;
  target_program: string | null;
  kegiatan: string | null;
  indikator_kegiatan: string | null;
  target_kegiatan: string | null;
  subkegiatan: string | null;
  indikator_subkegiatan: string | null;
  target_subkegiatan: string | null;
};

/** Format target: "Persen" → "100%", lainnya → "12 Dokumen". Sync dengan screenshot Master Sasaran. */
function fmtTarget(n: number, satuan: string): string {
  const sat = satuan.trim();
  if (/^persen$/i.test(sat) || sat === '%') return `${n}%`;
  return `${n} ${sat}`.trim();
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'import-renaksi', 10);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const tahunRaw = searchParams.get('tahun') ?? '';
  const tahunParse = TahunSchema.safeParse(tahunRaw);
  if (!tahunParse.success) {
    return NextResponse.json(
      { ok: false, message: 'Parameter tahun tidak valid (4 digit, 2020-2100)' },
      { status: 400 },
    );
  }
  const tahunStr = tahunParse.data;
  const tahunNum = Number(tahunStr);

  // Renaksi numeric tahun (SMALLINT) — query langsung.
  const raRows = await sql`
    SELECT level, sasaran,
           outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator, satuan, target_tahunan
    FROM rencana_aksi
    WHERE tahun = ${tahunNum}
      AND level IN ('program','kegiatan','sub-kegiatan')
  ` as RaSrc[];

  if (raRows.length === 0) {
    return NextResponse.json({
      ok: true, tahun: tahunStr, rows: [],
      message: `Tidak ada data Renaksi & Kinerja untuk tahun ${tahunStr}.`,
    });
  }

  const programs = raRows.filter(r => r.level === 'program');
  const kegiatans = raRows.filter(r => r.level === 'kegiatan');
  const subKegs = raRows.filter(r => r.level === 'sub-kegiatan');

  const out: PkSasaranImportRow[] = [];

  // Cascade flatten: program → kegiatan (match by program) → sub-kegiatan (match by program+kegiatan).
  // Emit 1 row per leaf terdalam. Kalau program tidak punya anak kegiatan, emit row program-only.
  for (const prog of programs) {
    const childKegs = kegiatans.filter(k => k.program === prog.program);
    if (childKegs.length === 0) {
      out.push({
        program: prog.outcome_program ?? prog.program,
        indikator_program: prog.indikator,
        target_program: fmtTarget(prog.target_tahunan, prog.satuan),
        kegiatan: null, indikator_kegiatan: null, target_kegiatan: null,
        subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null,
      });
      continue;
    }
    for (const keg of childKegs) {
      const childSubs = subKegs.filter(s => s.program === prog.program && s.kegiatan === keg.kegiatan);
      if (childSubs.length === 0) {
        out.push({
          program: prog.outcome_program ?? prog.program,
          indikator_program: prog.indikator,
          target_program: fmtTarget(prog.target_tahunan, prog.satuan),
          kegiatan: keg.outcome_kegiatan ?? keg.kegiatan,
          indikator_kegiatan: keg.indikator,
          target_kegiatan: fmtTarget(keg.target_tahunan, keg.satuan),
          subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null,
        });
        continue;
      }
      for (const sub of childSubs) {
        out.push({
          program: prog.outcome_program ?? prog.program,
          indikator_program: prog.indikator,
          target_program: fmtTarget(prog.target_tahunan, prog.satuan),
          kegiatan: keg.outcome_kegiatan ?? keg.kegiatan,
          indikator_kegiatan: keg.indikator,
          target_kegiatan: fmtTarget(keg.target_tahunan, keg.satuan),
          subkegiatan: sub.outcome_sub_kegiatan ?? sub.sub_kegiatan,
          indikator_subkegiatan: sub.indikator,
          target_subkegiatan: fmtTarget(sub.target_tahunan, sub.satuan),
        });
      }
    }
  }

  await writeAuditLog({
    req,
    eventType: 'PK_IMPORT_RENAKSI_FETCH',
    userId: session.userId,
    username: session.username,
    detail: `Fetch import Renaksi PK Sasaran tahun ${tahunStr}: ${out.length} baris dihasilkan dari ${raRows.length} indikator`,
  });

  return NextResponse.json({ ok: true, tahun: tahunStr, rows: out });
}
