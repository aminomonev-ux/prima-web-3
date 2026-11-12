// GET /api/perjanjian-kinerja/banding-renaksi?tahun=&menu=program|sasaran — bahan pembanding
// "Rencana Aksi berubah" Master Program / Master Sasaran (docs/CONCEPT-renaksi-terhubung.md §6).
// Hanya membaca Renaksi; pembandingnya dihitung di layar terhadap ISI LAYAR (master PK disimpan
// replace-all dari layar, jadi suntingan yang belum disimpan ikut dibandingkan).
// Pagar = hak MENGUBAH menu itu, sama dengan tombol Import Renaksi yang membaca data yang sama.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { pkRateLimit, TahunSchema } from '@/lib/data/pk-schemas';
import { listGantiNama } from '@/lib/data/rencana-aksi';
import { susunSasaranRenaksi, type RaSasaranSrc } from '@/lib/pk/selaras-renaksi';
import { bolehEditMenu, tolakEdit, pkMati } from '../_guard';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ tahun: TahunSchema, menu: z.enum(['program', 'sasaran']) });

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;

  const q = QuerySchema.safeParse({ tahun: req.nextUrl.searchParams.get('tahun'), menu: req.nextUrl.searchParams.get('menu') });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid' }, { status: 400 });
  const { tahun, menu } = q.data;
  if (!(await bolehEditMenu(session.userId, session.role, menu))) return tolakEdit(menu);

  const limited = await pkRateLimit(session.userId, 'banding-renaksi', 60);
  if (limited) return limited;

  const raRows = await sql`
    SELECT id, level, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator, satuan, target_tahunan, induk_indikator_id
    FROM rencana_aksi
    WHERE tahun = ${Number(tahun)} AND level IN ('program','kegiatan','sub-kegiatan')
  ` as RaSasaranSrc[];

  if (menu === 'program') {
    const renaksi = raRows.map(r => ({ level: r.level, program: r.program, kegiatan: r.kegiatan, sub_kegiatan: r.sub_kegiatan }));
    return NextResponse.json({ ok: true, tahun, renaksi, catatan: await listGantiNama(Number(tahun)) });
  }
  return NextResponse.json({ ok: true, tahun, sasaran: susunSasaranRenaksi(raRows) });
}
