// app/api/kinerja/ssk/perubahan/route.ts
// Refactor Versi E-Anggaran — Checkpoint B Task #16.
// Buat versi PERUBAHAN baru dari versi aktif (auto-copy + lock previous).
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// POST body: { tahun, sumber, from_versi_tipe, from_versi_seq }
// Response: { ok: true, new_versi_seq: number, copied: number }
//   copied 0 = RKO sumber itu kosong seluruhnya; tidak ada yang disalin/dikunci.
//
// Logikanya di `buatVersiPerubahan` (lib/data/kinerja.ts) supaya bisa diuji di MySQL;
// route ini tinggal pagar akses + menerjemahkan galat.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, TahunSchema, SumberSchema, VersiTipeSchema, VersiSeqSchema } from '@/lib/data/kinerja-schemas';
import { buatVersiPerubahan, KinerjaVersiSumberKosongError, KinerjaVersiBentrokError } from '@/lib/data/kinerja';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

const BodySchema = z.object({
  tahun:           TahunSchema,
  sumber:          SumberSchema,
  from_versi_tipe: VersiTipeSchema,
  from_versi_seq:  VersiSeqSchema,
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  // SDL-M14: versi creation = low cadence, 10/menit.
  const limited = await kinerjaRateLimit(session.userId, 'versi-create', 10); if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { tahun, sumber, from_versi_tipe, from_versi_seq } = parsed.data;

  let hasil: Awaited<ReturnType<typeof buatVersiPerubahan>>;
  try {
    hasil = await buatVersiPerubahan(tahun, sumber, from_versi_tipe, from_versi_seq, session.userId);
  } catch (e) {
    if (e instanceof KinerjaVersiSumberKosongError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 404 });
    }
    // Dua "Buat Perubahan" berbarengan — yang kalah pantas dijawab 409 dengan
    // sebabnya, bukan 500 "Gagal membuat versi baru" yang tidak memberi tahu apa pun.
    if (e instanceof KinerjaVersiBentrokError) {
      return NextResponse.json({ ok: false, code: 'VERSI_BENTROK', message: e.message }, { status: 409 });
    }
    throw e;
  }
  const { newVersiSeq, copied, difoto } = hasil;

  await writeAuditLog({
    req,
    eventType: 'KINERJA_VERSI_CREATED',
    userId:    session.userId,
    username:  session.username,
    detail:    copied > 0
      ? `Buat PERUBAHAN-${newVersiSeq} ${sumber} ${tahun} dari ${from_versi_tipe}-${from_versi_seq}: ${copied} baris dicopy, versi source dikunci`
        + (difoto === null ? ' (foto realisasinya sudah ada sebelumnya).' : `, realisasinya difoto ${difoto} baris (semua bulan tertutup).`)
      : `Buat PERUBAHAN-${newVersiSeq} ${sumber} ${tahun} tanpa salinan: RKO murni kosong (tidak dianggarkan di murni).`,
  });

  return NextResponse.json({
    ok: true,
    new_versi_tipe: 'PERUBAHAN',
    new_versi_seq:  newVersiSeq,
    copied,
  });
}
