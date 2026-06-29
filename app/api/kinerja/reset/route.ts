// app/api/kinerja/reset/route.ts
// Reset data SSK dan/atau Realisasi untuk (tahun, sumber). Destructive — SUPER_ADMIN only.
// Body: { tahun, sumber, scope: 'ssk' | 'realisasi' | 'both', confirm: 'RESET' }
//
// Pattern:
//   - getSession + WAJIB session.role === 'SUPER_ADMIN' (lebih ketat dari isKinerjaRole)
//   - Confirm phrase WAJIB === 'RESET' (defense double-confirmation)
//   - withTransaction supaya atomic
//   - writeAuditLog KINERJA_DATA_RESET dengan detail rows-affected

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { sql, withTransaction } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { kinerjaRateLimit, TahunSchema, SumberSchema, VersiTipeSchema, VersiSeqSchema } from '@/lib/data/kinerja-schemas';

const BodySchema = z.object({
  tahun:      TahunSchema,
  sumber:     SumberSchema,
  scope:      z.enum(['ssk', 'realisasi', 'both']),
  // Versi spesifik (opsional). Kalau tidak dikirim → hapus SEMUA versi.
  versi_tipe: VersiTipeSchema.optional(),
  versi_seq:  VersiSeqSchema.optional(),
  confirm:    z.literal('RESET', { message: 'Confirm phrase tidak valid' }),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

  // ROLE: SUPER_ADMIN only — destructive bulk delete
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Akses ditolak. Hanya SUPER_ADMIN yang boleh reset data.' }, { status: 403 });
  }
  // SDL-M14: low budget untuk destructive op (5/menit).
  const limited = await kinerjaRateLimit(session.userId, 'reset', 5); if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { tahun, sumber, scope, versi_tipe, versi_seq } = parsed.data;
  // Versi filter: kalau salah satu undefined → hapus semua versi.
  const versiSpecified = versi_tipe !== undefined && versi_seq !== undefined;
  const versiLabel     = versiSpecified
    ? (versi_tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${versi_seq}`)
    : 'SEMUA versi';

  let deletedSsk = 0;
  let deletedRealisasi = 0;

  await withTransaction(async ({ tx }) => {
    // Realisasi dihapus DULU supaya tidak ada FK orphan
    if (scope === 'realisasi' || scope === 'both') {
      // L53: sql/tx wrapper return non-SELECT hasil sebagai Array<{affectedRows}>,
      // BUKAN object — akses lewat [0]. Cast object langsung diam-diam selalu 0
      // → audit log + UI tampilkan "0 baris dihapus" padahal data benar terhapus.
      const rRes = versiSpecified
        ? await tx`
            DELETE FROM kinerja_realisasi
            WHERE tahun = ${tahun} AND sumber = ${sumber}
              AND ssk_versi_tipe = ${versi_tipe} AND ssk_versi_seq = ${versi_seq}
          ` as unknown as Array<{ affectedRows: number }>
        : await tx`
            DELETE FROM kinerja_realisasi WHERE tahun = ${tahun} AND sumber = ${sumber}
          ` as unknown as Array<{ affectedRows: number }>;
      deletedRealisasi = Number(rRes[0]?.affectedRows ?? 0);
    }
    if (scope === 'ssk' || scope === 'both') {
      const sRes = versiSpecified
        ? await tx`
            DELETE FROM kinerja_ssk
            WHERE tahun = ${tahun} AND sumber = ${sumber}
              AND versi_tipe = ${versi_tipe} AND versi_seq = ${versi_seq}
          ` as unknown as Array<{ affectedRows: number }>
        : await tx`
            DELETE FROM kinerja_ssk WHERE tahun = ${tahun} AND sumber = ${sumber}
          ` as unknown as Array<{ affectedRows: number }>;
      deletedSsk = Number(sRes[0]?.affectedRows ?? 0);

      // BUGFIX: setelah hapus versi PERUBAHAN, latest yang tersisa harus di-unlock
      // supaya bisa di-edit lagi. Cari (versi_tipe, versi_seq) tertinggi yang tersisa
      // lalu SET locked_at = NULL. Aman dijalankan unconditional — kalau tabel kosong,
      // UPDATE no-op (0 affected rows).
      const latestRows = await tx`
        SELECT versi_tipe, versi_seq
        FROM kinerja_ssk
        WHERE tahun = ${tahun} AND sumber = ${sumber}
        ORDER BY versi_seq DESC, versi_tipe DESC
        LIMIT 1
      ` as { versi_tipe?: unknown; versi_seq?: unknown }[];
      if (latestRows.length > 0) {
        const latestTipe = String(latestRows[0].versi_tipe ?? 'MURNI');
        const latestSeq  = Number(latestRows[0].versi_seq ?? 0);
        await tx`
          UPDATE kinerja_ssk
          SET locked_at = NULL
          WHERE tahun = ${tahun} AND sumber = ${sumber}
            AND versi_tipe = ${latestTipe} AND versi_seq = ${latestSeq}
            AND locked_at IS NOT NULL
        `;
      }
    }
  });

  await writeAuditLog({
    req,
    eventType: 'KINERJA_DATA_RESET',
    userId:    session.userId,
    username:  session.username,
    detail:    `Reset Kinerja ${sumber} ${tahun} versi=${versiLabel} scope=${scope}: hapus ${deletedSsk} SSK + ${deletedRealisasi} Realisasi`,
  });

  return NextResponse.json({
    ok: true,
    scope,
    versi: versiSpecified ? { tipe: versi_tipe, seq: versi_seq } : null,
    deleted: { ssk: deletedSsk, realisasi: deletedRealisasi },
  });
}

// Helper: cek dulu berapa data yang akan kehapus (preview untuk confirmation modal)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tahun  = TahunSchema.safeParse(searchParams.get('tahun') ?? undefined);
  const sumber = SumberSchema.safeParse(searchParams.get('sumber') ?? undefined);
  if (!tahun.success || !sumber.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid' }, { status: 400 });
  }

  const [sskCount, realisasiCount, versiList, realisasiPerVersi] = await Promise.all([
    sql`SELECT COUNT(*) AS cnt FROM kinerja_ssk WHERE tahun = ${tahun.data} AND sumber = ${sumber.data}` as unknown as Promise<{ cnt: unknown }[]>,
    sql`SELECT COUNT(*) AS cnt FROM kinerja_realisasi WHERE tahun = ${tahun.data} AND sumber = ${sumber.data}` as unknown as Promise<{ cnt: unknown }[]>,
    sql`
      SELECT versi_tipe, versi_seq, COUNT(*) AS jumlah
      FROM kinerja_ssk
      WHERE tahun = ${tahun.data} AND sumber = ${sumber.data}
      GROUP BY versi_tipe, versi_seq
      ORDER BY versi_seq, versi_tipe
    ` as unknown as Promise<Record<string, unknown>[]>,
    sql`
      SELECT ssk_versi_tipe AS versi_tipe, ssk_versi_seq AS versi_seq, COUNT(*) AS jumlah
      FROM kinerja_realisasi
      WHERE tahun = ${tahun.data} AND sumber = ${sumber.data}
      GROUP BY ssk_versi_tipe, ssk_versi_seq
      ORDER BY ssk_versi_seq, ssk_versi_tipe
    ` as unknown as Promise<Record<string, unknown>[]>,
  ]);

  return NextResponse.json({
    ok: true,
    preview: {
      ssk_total:       Number(sskCount[0]?.cnt ?? 0),
      realisasi_total: Number(realisasiCount[0]?.cnt ?? 0),
      versi: versiList.map(v => ({
        versi_tipe: String(v.versi_tipe),
        versi_seq:  Number(v.versi_seq),
        jumlah:     Number(v.jumlah),
      })),
      realisasi_per_versi: realisasiPerVersi.map(v => ({
        versi_tipe: String(v.versi_tipe ?? 'MURNI'),
        versi_seq:  Number(v.versi_seq ?? 0),
        jumlah:     Number(v.jumlah),
      })),
    },
  });
}
