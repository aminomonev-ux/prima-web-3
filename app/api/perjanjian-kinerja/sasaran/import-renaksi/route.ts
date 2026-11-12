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
import { susunSasaranRenaksi, type RaSasaranSrc } from '@/lib/pk/selaras-renaksi';
import { bolehEditMenu, tolakEdit, pkMati } from '../../_guard';

export const dynamic = 'force-dynamic';

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
  ` as RaSasaranSrc[];

  if (raRows.length === 0) {
    return NextResponse.json({
      ok: true, tahun: tahunStr, rows: [],
      message: `Tidak ada data Renaksi & Kinerja untuk tahun ${tahunStr}.`,
    });
  }

  // Penyusunnya dipakai bersama pembanding "Rencana Aksi berubah" (lib/pk/selaras-renaksi.ts).
  const out = susunSasaranRenaksi(raRows);

  await writeAuditLog({
    req,
    eventType: 'PK_IMPORT_RENAKSI_FETCH',
    userId: session.userId,
    username: session.username,
    detail: `Fetch import Renaksi PK Sasaran tahun ${tahunStr}: ${out.length} baris dihasilkan dari ${raRows.length} indikator`,
  });

  return NextResponse.json({ ok: true, tahun: tahunStr, rows: out });
}
