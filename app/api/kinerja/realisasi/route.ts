import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getRealisasiRows, getRealisasiHydrated, saveRealisasiBatch, getKinerjaVersion, KinerjaVersionConflictError } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import type { RealRow } from '@/lib/data/kinerja';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, RealisasiBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan PUT.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  // C-WORK-1/2 (Tahap 12): validate tahun + sumber via Zod
  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({
    tahun:      searchParams.get('tahun')      ?? undefined,
    sumber:     searchParams.get('sumber')     ?? undefined,
    versi_tipe: searchParams.get('versi_tipe') ?? undefined,
    versi_seq:  searchParams.get('versi_seq')  ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun  = q.data.tahun ?? new Date().getFullYear().toString();
  const sumber = q.data.sumber ?? 'GAJI';

  // Refactor Versi (Checkpoint A #12): kalau client kirim versi_tipe → pakai hydrated path
  // (compute pagu/target/akum/deviasi server-side dari SSK versi aktif). Backwards-compat:
  // tanpa versi_tipe, default MURNI seq=0 — sama persis dgn data lama.
  if (q.data.versi_tipe !== undefined || q.data.versi_seq !== undefined) {
    const versiTipe = q.data.versi_tipe ?? 'MURNI';
    const versiSeq  = q.data.versi_seq  ?? 0;
    const rows = await getRealisasiHydrated(tahun, sumber, versiTipe, versiSeq);
    const version = await getKinerjaVersion('kinerja_realisasi', `${tahun}:${sumber}`);
    return NextResponse.json({ ok: true, rows, versi: { tipe: versiTipe, seq: versiSeq }, version });
  }

  // Path lama (belum versi-aware) — tetap fungsional sampai UI migrasi.
  const rows = await getRealisasiRows(tahun, sumber);
  return NextResponse.json({ ok: true, rows });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-realisasi', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body
  const raw = await req.json().catch(() => null);
  const parsed = RealisasiBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, sumber, rows, expected_version } = parsed.data;

  // Cast ke type yang ditunggu saveRealisasiBatch — Zod schema passthrough sudah handle extra fields
  try {
    await saveRealisasiBatch(tahun, sumber, rows as Omit<RealRow, 'id' | 'tahun' | 'sumber'>[], session.userId, expected_version);
  } catch (err) {
    // V3-6: optimistic-lock conflict → 409 dengan code agar client bisa auto-reload.
    if (err instanceof KinerjaVersionConflictError) {
      return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message, actual: err.actual }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : 'Gagal menyimpan';
    return NextResponse.json({ ok: false, message: msg }, { status: 409 });
  }

  const version = await getKinerjaVersion('kinerja_realisasi', `${tahun}:${sumber}`);
  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_REALISASI',
    userId:    session.userId,
    username:  session.username,
    detail:    `Simpan realisasi ${sumber} tahun ${tahun}: ${rows.length} baris`,
  });

  return NextResponse.json({ ok: true, saved: rows.length, version });
}
