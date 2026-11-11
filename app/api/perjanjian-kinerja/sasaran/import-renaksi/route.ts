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
import { pkRateLimit, TahunSchema } from '@/lib/data/pk-schemas';
import { angkaTarget, satuanTarget } from '@/lib/shared/target-renaksi';
import { rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { bolehEditMenu, tolakEdit, pkMati } from '../../_guard';

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
  // DECIMAL(14,2) sejak migration-043 — mysql2 memulangkannya sebagai STRING demi
  // menjaga presisi. Ditulis apa adanya di sini supaya tidak ada lagi yang mengira
  // nilainya sudah berupa angka; `angkaTarget` yang mengubahnya.
  target_tahunan: string;
};

type PkSasaranImportRow = {
  program: string;
  indikator_program: string | null;
  target_program: string | null;
  satuan_program: string | null;
  kegiatan: string | null;
  indikator_kegiatan: string | null;
  target_kegiatan: string | null;
  satuan_kegiatan: string | null;
  subkegiatan: string | null;
  indikator_subkegiatan: string | null;
  target_subkegiatan: string | null;
  satuan_subkegiatan: string | null;
};

// Format PK mencetak Satuan dan Target di dua kolom, tanpa bintang penanda tingkat dan tanpa
// nomor "(1)" indikator matriks Renaksi — jadi ketiganya dipisah/dibuang di pintu tarik ini.
const KOSONG_KEGIATAN = { kegiatan: null, indikator_kegiatan: null, target_kegiatan: null, satuan_kegiatan: null };
const KOSONG_SUB = { subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null, satuan_subkegiatan: null };

function bagianProgram(r: RaSrc) {
  return {
    program: rapikanNamaEntitas(r.outcome_program ?? r.program),
    indikator_program: rapikanIndikator(r.indikator),
    target_program: angkaTarget(r.target_tahunan),
    satuan_program: satuanTarget(r.satuan) || null,
  };
}
function bagianKegiatan(r: RaSrc) {
  const nama = r.outcome_kegiatan ?? r.kegiatan;
  return {
    kegiatan: nama == null ? null : rapikanNamaEntitas(nama),
    indikator_kegiatan: rapikanIndikator(r.indikator),
    target_kegiatan: angkaTarget(r.target_tahunan),
    satuan_kegiatan: satuanTarget(r.satuan) || null,
  };
}
function bagianSub(r: RaSrc) {
  const nama = r.outcome_sub_kegiatan ?? r.sub_kegiatan;
  return {
    subkegiatan: nama == null ? null : rapikanNamaEntitas(nama),
    indikator_subkegiatan: rapikanIndikator(r.indikator),
    target_subkegiatan: angkaTarget(r.target_tahunan),
    satuan_subkegiatan: satuanTarget(r.satuan) || null,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;
  // EDIT, bukan LIHAT: pratinjau ini cuma dicapai dari alur "isi Master Sasaran dari
  // Renaksi", dan ia membaca data modul lain. Pemegang LIHAT tidak punya keperluan
  // memanggilnya, dan hari ini pun tombolnya tidak ada di layarnya.
  if (!(await bolehEditMenu(session.userId, session.role, 'sasaran'))) return tolakEdit('sasaran');

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
      out.push({ ...bagianProgram(prog), ...KOSONG_KEGIATAN, ...KOSONG_SUB });
      continue;
    }
    for (const keg of childKegs) {
      const childSubs = subKegs.filter(s => s.program === prog.program && s.kegiatan === keg.kegiatan);
      if (childSubs.length === 0) {
        out.push({ ...bagianProgram(prog), ...bagianKegiatan(keg), ...KOSONG_SUB });
        continue;
      }
      for (const sub of childSubs) {
        out.push({ ...bagianProgram(prog), ...bagianKegiatan(keg), ...bagianSub(sub) });
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
