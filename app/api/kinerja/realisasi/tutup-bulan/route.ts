// app/api/kinerja/realisasi/tutup-bulan/route.ts — Tutup / Buka satu bulan realisasi.
//
// Hak = hak menyimpan realisasi (keputusan pemilik aplikasi: menutup DAN membuka boleh
// siapa saja yang boleh menyimpan, "biar mudah"); jejaknya di audit. Gembok yang sama
// dengan Simpan Realisasi, jadi menutup tidak bisa terselip di tengah sebuah Simpan.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md §5

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, TutupBulanBodySchema } from '@/lib/data/kinerja-schemas';
import { tutupBulanRealisasi, bukaBulanRealisasi, KinerjaAturanTutupError } from '@/lib/kinerja/tutup-bulan-data';
import { NAMA_BULAN } from '@/lib/kinerja/banding-realisasi';
import { kinerjaMati } from '../../_guard';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'tutup-bulan', 20); if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = TutupBulanBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, sumber, bulan, aksi } = parsed.data;

  let tertutup;
  try {
    tertutup = aksi === 'TUTUP'
      ? await tutupBulanRealisasi(tahun, sumber, bulan, session.userId)
      : await bukaBulanRealisasi(tahun, sumber, bulan);
  } catch (err) {
    if (err instanceof KinerjaAturanTutupError) {
      return NextResponse.json({ ok: false, code: 'ATURAN_TUTUP', message: err.message }, { status: 409 });
    }
    // PRIMARY KEY yang menolak tutup ganda — gemboknya sudah membuat ini nyaris mustahil.
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ ok: false, code: 'ATURAN_TUTUP', message: `${NAMA_BULAN[bulan - 1]} baru saja ditutup pengguna lain.` }, { status: 409 });
    }
    throw err;
  }

  await writeAuditLog({
    req,
    eventType: aksi === 'TUTUP' ? 'KINERJA_TUTUP_BULAN' : 'KINERJA_BUKA_BULAN',
    userId:    session.userId,
    username:  session.username,
    detail:    `${aksi === 'TUTUP' ? 'Tutup' : 'Buka'} realisasi ${sumber} ${NAMA_BULAN[bulan - 1]} ${tahun}`,
  });

  return NextResponse.json({ ok: true, tertutup });
}
