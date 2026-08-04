// app/api/perjanjian-kinerja/pejabat/route.ts
// Master Pejabat — referensi nama/jabatan/pangkat/NIP per unit kerja per tahun.
// GET single (unit+tahun) atau list semua. POST batch (replace per tahun).

import { NextRequest, NextResponse } from 'next/server';
import { sql, withTransaction, bulkInsert } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  pkRateLimit,
  PkQuerySchema,
  PejabatBodySchema,
} from '@/lib/data/pk-schemas';
import { lantaiEditMenghalangi } from '@/lib/pk/peran';
import { bolehEditMenu, bolehLihatSalahSatu, forbidden, tolakEdit, tolakLantai } from '../_guard';
import { getPejabatByUnit } from '@/lib/data/pk';

export const dynamic = 'force-dynamic';

type PejabatRow = {
  id: number;
  unit_kerja: string;
  nama: string;
  jabatan: string;
  pangkat: string | null;
  nip: string | null;
  tahun: string;
  is_active: boolean;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // Nama & jabatan pejabat ikut mengisi Form PK (pihak pertama/kedua), bukan cuma layar
  // Master Pejabat. Mengikat baca ini ke menu `pejabat` saja akan merusak Form PK untuk
  // penyusun — yang justru pekerjaan utamanya.
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['form', 'pejabat']))) return forbidden();

  const limited = await pkRateLimit(session.userId, 'pejabat-list', 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = PkQuerySchema.safeParse({ tahun: searchParams.get('tahun') ?? undefined });
  if (!q.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  }
  const tahun = q.data.tahun ?? new Date().getFullYear().toString();
  const unit = searchParams.get('unit')?.trim();

  // Single lookup (auto-fill form): ?unit=...&tahun=...
  if (unit) {
    const pejabat = await getPejabatByUnit(unit, tahun);
    return NextResponse.json({ ok: true, pejabat });
  }

  // List semua aktif tahun ini (untuk admin view + bulk PII access → audit log)
  const rows = await sql`
    SELECT id, unit_kerja, nama, jabatan, pangkat, nip, tahun, is_active
    FROM pk_pejabat
    WHERE tahun = ${tahun} AND is_active = TRUE
    ORDER BY unit_kerja
  ` as PejabatRow[];

  await writeAuditLog({
    req,
    eventType: 'PK_VIEW_LIST',
    userId:    session.userId,
    username:  session.username,
    detail:    `View list pejabat tahun ${tahun} (${rows.length} baris)`,
  });

  return NextResponse.json({ ok: true, tahun, rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // Pejabat = sensitif (PII). Lantai perannya DAN, bukan pengganti izin menu: matriks
  // Admin Panel tidak bisa membukanya untuk peran lain, dan izin EDIT dari matriks
  // tetap wajib untuk yang perannya lolos. Dua pesan berbeda karena jalan keluarnya
  // berbeda — yang satu tidak akan pernah bisa diminta, yang satu bisa.
  if (lantaiEditMenghalangi(session.role, 'pejabat')) return tolakLantai('pejabat');
  if (!(await bolehEditMenu(session.userId, session.role, 'pejabat'))) return tolakEdit('pejabat');

  const limited = await pkRateLimit(session.userId, 'save-pejabat', 30);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = PejabatBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { tahun, rows } = parsed.data;

  // Replace pattern per tahun. UNIQUE KEY (unit_kerja, tahun, is_active) cegah duplicate.
  // Pakai soft-delete: set is_active=FALSE untuk row lama, INSERT baru is_active=TRUE.
  // Alternative: hard DELETE (preferred kalau tidak ada FK consumer).
  // Pk_pejabat tidak ada FK consumer → hard DELETE OK.
  await withTransaction(async ({ tx, conn }) => {
    await tx`DELETE FROM pk_pejabat WHERE tahun = ${tahun}`;
    if (rows.length === 0) return;
    const values = rows.map(r => [
      r.unit_kerja,
      r.nama,
      r.jabatan,
      r.pangkat ?? null,
      r.nip ?? null,
      tahun,
      true,
    ]);
    await bulkInsert(
      'pk_pejabat',
      ['unit_kerja','nama','jabatan','pangkat','nip','tahun','is_active'],
      values,
      conn,
    );
  });

  await writeAuditLog({
    req,
    eventType: 'PK_SAVE_PEJABAT',
    userId:    session.userId,
    username:  session.username,
    detail:    `Simpan Master Pejabat tahun ${tahun}: ${rows.length} baris`,
  });

  return NextResponse.json({ ok: true, tahun, saved: rows.length });
}
