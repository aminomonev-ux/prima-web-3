// app/api/kinerja/ssk/check-deletable/route.ts
// Refactor Versi E-Anggaran — Checkpoint B Task #15.
// Cek apakah baris SSK punya referensi di Realisasi → boleh hapus permanen atau wajib pakai Nol-kan.
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// Query: ?tahun=2026&canonical_id=K-000123
// Response: { ok: true, deletable: boolean, count: number, reason: string }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { sql } from '@/lib/data/db';
import { isKinerjaRole, TahunSchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

const QuerySchema = z.object({
  tahun:        TahunSchema,
  canonical_id: z.string().min(1).max(20),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    tahun:        searchParams.get('tahun')        ?? undefined,
    canonical_id: searchParams.get('canonical_id') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Parameter tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { tahun, canonical_id } = parsed.data;

  // `nominal` ikut dipulangkan supaya dialog konfirmasi bisa menyebut UANGNYA,
  // bukan cuma jumlah barisnya: "12 baris" tidak seberat "Rp 5.443.354.000",
  // dan yang membedakan dialog berguna dari gesekan kosong adalah ia menyebut
  // apa yang hilang. Satu SUM di kueri yang sudah ada, nol perjalanan tambahan.
  const rows = await sql`
    SELECT COUNT(*) AS cnt,
           COALESCE(SUM(real_keuangan), 0) AS nominal
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND ssk_canonical_id = ${canonical_id}
  ` as { cnt: unknown; nominal: unknown }[];
  const count   = Number(rows[0]?.cnt ?? 0);
  const nominal = Number(rows[0]?.nominal ?? 0);

  if (count === 0) {
    return NextResponse.json({
      ok: true,
      deletable: true,
      count: 0,
      nominal: 0,
      reason: 'Belum ada referensi di Realisasi. Boleh hapus permanen.',
    });
  }

  return NextResponse.json({
    ok: true,
    deletable: false,
    count,
    nominal,
    reason: `Sudah ada ${count} baris realisasi yang merujuk ke item ini`
      + `${nominal > 0 ? ` (realisasi keuangan Rp ${nominal.toLocaleString('id-ID')})` : ''}`
      + `. Gunakan opsi Nol-kan.`,
  });
}
