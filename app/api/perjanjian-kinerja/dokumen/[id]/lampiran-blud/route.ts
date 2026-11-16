// app/api/perjanjian-kinerja/dokumen/[id]/lampiran-blud/route.ts
// GET → pilihan sumber lampiran "Rincian anggaran BLUD per PJ" untuk satu PK: versi DPA &
// Pergeseran tahun dokumen, total unit di tiap versi, dan kecocokannya dengan nominal BLUD PK.
// Pagar = pagar unduh (download/route.ts). Konsep: docs/konsep/pk/CONCEPT-pk-lampiran-blud-pj.md.

import { NextRequest, NextResponse } from 'next/server';
import { sql, safeInt } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { pkRateLimit } from '@/lib/data/pk-schemas';
import { bolehLihatSalahSatu, forbidden, pkMati } from '../../../_guard';
import { ADMIN_ROLES } from '@/lib/constants';
import { pilihanLampiranBlud } from '@/lib/data/pk-lampiran-blud';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['form', 'riwayat']))) return forbidden();

  const limited = await pkRateLimit(session.userId, 'lampiran-blud', 20);
  if (limited) return limited;

  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID dokumen tidak valid' }, { status: 400 });

  const rows = await sql`
    SELECT tahun, unit_pertama, created_by FROM pk_dokumen WHERE id = ${id} LIMIT 1
  ` as Array<{ tahun: string; unit_pertama: string; created_by: number | null }>;
  if (!rows.length) return NextResponse.json({ ok: false, message: 'Dokumen tidak ditemukan' }, { status: 404 });
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  if (!isAdmin && rows[0].created_by !== session.userId) {
    return NextResponse.json({ ok: false, message: 'Bukan dokumen Anda' }, { status: 403 });
  }

  const hasil = await pilihanLampiranBlud({ id, tahun: Number(rows[0].tahun), unit_pertama: rows[0].unit_pertama });
  return NextResponse.json({ ok: true, hasil });
}
