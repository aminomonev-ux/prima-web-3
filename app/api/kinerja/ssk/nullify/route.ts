// app/api/kinerja/ssk/nullify/route.ts
// Refactor Versi E-Anggaran — Checkpoint B Task #17.
// Nol-kan baris SSK (alternatif hapus utk baris yg sudah dipakai di Realisasi).
// Set is_nullified=TRUE, pagu=0, months={}, months_pct={}, total=0, total_pct=0.
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// PATCH body: { tahun, sumber, versi_tipe, versi_seq, canonical_id, nullify: boolean }
// `nullify=true` → nol-kan. `nullify=false` → un-nullify (kembalikan flag tapi nilai 0 tetap).

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { sql } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, TahunSchema, SumberSchema, VersiTipeSchema, VersiSeqSchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

const BodySchema = z.object({
  tahun:        TahunSchema,
  sumber:       SumberSchema,
  versi_tipe:   VersiTipeSchema,
  versi_seq:    VersiSeqSchema,
  canonical_id: z.string().min(1).max(20),
  nullify:      z.boolean(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'nullify-ssk', 30); if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { tahun, sumber, versi_tipe, versi_seq, canonical_id, nullify } = parsed.data;

  // Cek versi tidak locked (locked versi = read-only)
  const lockedRows = await sql`
    SELECT locked_at, is_nullified
    FROM kinerja_ssk
    WHERE tahun = ${tahun} AND sumber = ${sumber}
      AND versi_tipe = ${versi_tipe} AND versi_seq = ${versi_seq}
      AND canonical_id = ${canonical_id}
    LIMIT 1
  ` as { locked_at: unknown; is_nullified: unknown }[];

  if (lockedRows.length === 0) {
    return NextResponse.json({ ok: false, message: 'Baris tidak ditemukan.' }, { status: 404 });
  }
  if (lockedRows[0].locked_at !== null && lockedRows[0].locked_at !== undefined) {
    return NextResponse.json({ ok: false, message: 'Versi ini sudah dikunci, tidak bisa diubah.' }, { status: 409 });
  }

  // T11: `AND locked_at IS NULL` ikut masuk ke UPDATE, bukan cuma diperiksa lewat
  // SELECT di atas. SELECT-lalu-UPDATE menyisakan sela — di antara keduanya versi
  // ini bisa dikunci orang lain, dan perubahan tetap mendarat di versi terkunci.
  // Pola ini menyalin ssk/perubahan/route.ts yang sudah melipat syaratnya ke dalam.
  // SELECT di atas tetap dipertahankan karena ia yang membedakan 404 (baris tidak
  // ada) dari 409 (baris ada tapi terkunci) — dua pesan yang berbeda artinya.
  const res = nullify
    ? await sql`
      UPDATE kinerja_ssk
      SET is_nullified = TRUE,
          pagu        = 0,
          months      = JSON_OBJECT(),
          months_pct  = JSON_OBJECT(),
          total       = 0,
          total_pct   = 0,
          updated_by  = ${session.userId}
      WHERE tahun = ${tahun} AND sumber = ${sumber}
        AND versi_tipe = ${versi_tipe} AND versi_seq = ${versi_seq}
        AND canonical_id = ${canonical_id}
        AND locked_at IS NULL
    ` as unknown as Array<{ affectedRows: number }>
    // Un-nullify: cukup flag balik. User harus isi pagu/months lagi manual.
    : await sql`
      UPDATE kinerja_ssk
      SET is_nullified = FALSE,
          updated_by   = ${session.userId}
      WHERE tahun = ${tahun} AND sumber = ${sumber}
        AND versi_tipe = ${versi_tipe} AND versi_seq = ${versi_seq}
        AND canonical_id = ${canonical_id}
        AND locked_at IS NULL
    ` as unknown as Array<{ affectedRows: number }>;

  // L53: wrapper sql mengembalikan hasil non-SELECT sebagai Array<{affectedRows}>,
  // BUKAN object — akses lewat [0]. 0 baris di sini berarti versinya baru saja
  // dikunci di sela tadi, bukan baris hilang (SELECT di atas sudah menemukannya).
  if (Number(res[0]?.affectedRows ?? 0) === 0) {
    return NextResponse.json(
      { ok: false, message: 'Versi ini baru saja dikunci pengguna lain — perubahan tidak disimpan.' },
      { status: 409 },
    );
  }

  await writeAuditLog({
    req,
    eventType: 'KINERJA_SSK_NULLIFIED',
    userId:    session.userId,
    username:  session.username,
    detail:    `${nullify ? 'Nol-kan' : 'Un-nol-kan'} SSK ${sumber} ${tahun} ${versi_tipe}-${versi_seq} canonical=${canonical_id}`,
  });

  return NextResponse.json({ ok: true, nullified: nullify });
}
