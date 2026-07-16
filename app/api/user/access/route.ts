
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { sql, queryOne } from '@/lib/data/db';
import { isBludRole } from '@/lib/blud/schemas';
import { isKinerjaRole } from '@/lib/data/kinerja-schemas';
import { isPkRole } from '@/lib/data/pk-schemas';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { isLkjipRole } from '@/lib/lkjip/schemas';
import { isRencanaAksiRole } from '@/lib/data/rencana-aksi-schemas';
import { isIkiRole } from '@/lib/data/iki-schemas';

// AC-1: per app card id → checker yang SAMA dengan guard halaman/API-nya,
// supaya kunci di menu tidak pernah beda arti dengan satpam di belakang.
const APP_CHECKS: Array<[string, (role: string, appAccess: string[] | null) => boolean]> = [
  ['blud',               isBludRole],
  ['new_econtrolling',   isKinerjaRole],
  ['perjanjian_kinerja', isPkRole],
  ['buku_besar_aset',    isAsetRole],
  ['lkjip',              isLkjipRole],
  ['rencana_aksi',       isRencanaAksiRole],
  ['iki',                isIkiRole],
];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  if (session.role === 'SUPER_ADMIN' || session.role === 'ADMIN') {
    return NextResponse.json({ ok: true, app_access: null });
  }

  // O1: queryOne — null check + typed return value, no manual cast.
  const row = await queryOne<{ app_access: string[] | null }>(
    sql`SELECT app_access FROM users WHERE id = ${session.userId} LIMIT 1`
  );
  const granted = Array.isArray(row?.app_access) ? row.app_access : [];

  // Akses efektif = grant manual ∪ default role. Usulan Kebutuhan terbuka untuk
  // semua role (akses internal dibatasi getPanels per role di modulnya sendiri).
  const effective = new Set<string>(['usulan_aset', ...granted]);
  for (const [appId, check] of APP_CHECKS) {
    if (check(session.role, granted)) effective.add(appId);
  }

  return NextResponse.json({ ok: true, app_access: [...effective] });
}
