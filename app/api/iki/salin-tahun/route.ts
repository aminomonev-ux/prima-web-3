// app/api/iki/salin-tahun/route.ts — POST "Salin semua dari {tahun lalu}" (docs/CONCEPT-iki-beranda.md §4)
import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { SalinTahunSchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import { salinTahun } from '@/lib/data/iki';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'salin-tahun', 3);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = SalinTahunSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { tahun_sumber, tahun_target } = parsed.data;
  try {
    const hasil = await salinTahun(tahun_sumber, tahun_target, g.session.userId);
    if (hasil.dibuat.length || hasil.dilewati.length) {
      await writeAuditLog({
        req, eventType: 'IKI_CREATE', userId: g.session.userId, username: g.session.username,
        detail: `Salin IKI ${tahun_sumber} → Murni ${tahun_target}: ${hasil.dibuat.length} dibuat`
          + (hasil.dibuat.length ? ` (id=${hasil.dibuat.map(d => d.id).join(',')})` : '')
          + (hasil.dilewati.length ? `, ${hasil.dilewati.length} dilewati` : ''),
      });
    }
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    console.error('[IKI Salin Tahun Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
