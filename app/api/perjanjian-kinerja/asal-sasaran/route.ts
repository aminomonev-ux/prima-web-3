// GET /api/perjanjian-kinerja/asal-sasaran?tahun= — bahan keterangan "milik siapa" di panel
// LAMPIRAN Form PK (docs/CONCEPT-pk-lampiran-asal-sasaran.md). HANYA membaca; pencocokannya di
// lib/pk/asal-sasaran.ts (dihitung di layar). Tidak diaudit per buka (bacaan pendamping form).
// Pagar = menu Form PK. Data dokumen lain hanya unit/jenis/status — daftar dokumen PK
// (`GET dokumen`) sudah terbuka untuk menu Form, jadi tidak ada yang baru terbuka di sini.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { pkRateLimit, TahunSchema } from '@/lib/data/pk-schemas';
import type { BarisLampiranLain, BarisRenaksiAsal } from '@/lib/pk/asal-sasaran';
import { bolehBukaMenu, forbidden, pkMati } from '../_guard';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ tahun: TahunSchema });

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;

  const q = QuerySchema.safeParse({ tahun: req.nextUrl.searchParams.get('tahun') });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid' }, { status: 400 });
  if (!(await bolehBukaMenu(session.userId, session.role, 'form'))) return forbidden();

  const limited = await pkRateLimit(session.userId, 'asal-sasaran', 60);
  if (limited) return limited;

  const tahun = q.data.tahun;
  const renaksi = await sql`
    SELECT id, level, kode, program, kegiatan, sub_kegiatan,
           outcome_program, outcome_kegiatan, outcome_sub_kegiatan, indikator, induk_indikator_id
    FROM rencana_aksi
    WHERE tahun = ${Number(tahun)} AND level IN ('program','kegiatan','sub-kegiatan')
  ` as BarisRenaksiAsal[];
  const lampiran = await sql`
    SELECT l.dokumen_id, d.unit_pertama AS unit, d.jenis_pk AS jenis, d.status, l.uraian, l.indikator
    FROM pk_dokumen_lampiran l
    JOIN pk_dokumen d ON d.id = l.dokumen_id
    WHERE d.tahun = ${tahun}
  ` as BarisLampiranLain[];

  return NextResponse.json({
    ok: true, tahun,
    renaksi: renaksi.map(r => ({ ...r, id: Number(r.id), induk_indikator_id: r.induk_indikator_id == null ? null : Number(r.induk_indikator_id) })),
    lampiran: lampiran.map(l => ({ ...l, dokumen_id: Number(l.dokumen_id) })),
  });
}
