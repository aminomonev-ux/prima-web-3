import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { BbaImportUsulanSchema, BBA_IMPORT_ALLOWED_ROLES, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { listImportCandidates, commitImportUsulan, type BbaImportCandidate } from '@/lib/data/buku-besar-aset';
import { guard } from '../_guard';

// Tarik Belanja Modal final (DISETUJUI/DITOLAK/DITOLAK_ADMIN) dari Usulan Kebutuhan ke BBA.
// L61: guard sendiri + role tambahan — aksi lintas modul khusus ADMIN/SUPER_ADMIN (CONCEPT §8).
async function guardImport() {
  const g = await guard();
  if (!g.ok) return g;
  if (!(BBA_IMPORT_ALLOWED_ROLES as readonly string[]).includes(g.session.role)) {
    return { ok: false as const, res: NextResponse.json({ ok: false, message: 'Akses ditolak: tarik dari Usulan khusus Admin.' }, { status: 403 }) };
  }
  return g;
}

function groupPreview(cands: BbaImportCandidate[]) {
  const disetujui = cands.filter(c => c.keputusan === 'DISETUJUI');
  const ditolak   = cands.filter(c => c.keputusan === 'DITOLAK');
  const total = (xs: BbaImportCandidate[]) => xs.reduce((s, c) => s + c.nilai_rencana, 0);
  return {
    disetujui: { count: disetujui.length, total: total(disetujui), items: disetujui },
    ditolak:   { count: ditolak.length,   total: total(ditolak),   items: ditolak },
  };
}

export async function GET(req: NextRequest) {
  const g = await guardImport();
  if (!g.ok) return g.res;
  const { searchParams } = new URL(req.url);
  const parsed = BbaImportUsulanSchema.safeParse({ mode: 'preview', tahun: searchParams.get('tahun') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const cands = await listImportCandidates(parsed.data.tahun);
  return NextResponse.json({ ok: true, tahun: parsed.data.tahun, ...groupPreview(cands) });
}

export async function POST(req: NextRequest) {
  const g = await guardImport();
  if (!g.ok) return g.res;
  const raw = await req.json().catch(() => null);
  const parsed = BbaImportUsulanSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { mode, tahun } = parsed.data;

  if (mode === 'preview') {
    const cands = await listImportCandidates(tahun);
    return NextResponse.json({ ok: true, tahun, ...groupPreview(cands) });
  }

  const limited = await bbaRateLimit(g.session.userId, 'import', 10); if (limited) return limited;
  let inserted = 0;
  try {
    ({ inserted } = await commitImportUsulan(tahun, g.session.userId));
  } catch (err) {
    // UNIQUE uq_bba_usulan_item: import paralel menabrak → konflik, bukan 500.
    if ((err as { code?: string })?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ ok: false, message: 'Sebagian item sudah ditarik pengguna lain. Muat ulang lalu coba lagi.' }, { status: 409 });
    }
    throw err;
  }
  await writeAuditLog({ req, eventType: 'BBA_IMPORT_USULAN', userId: g.session.userId, username: g.session.username, detail: `BBA tarik dari Usulan tahun=${tahun} inserted=${inserted}` });
  return NextResponse.json({ ok: true, tahun, inserted });
}
