import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';

const APP_KEYS = [
  'app_status_dashboard',
  'app_status_usulan_aset',
  'app_status_blud',
  'app_status_perjanjian_kinerja',
  'app_status_rencana_aksi',
  'app_status_new_econtrolling',
  'app_status_buku_besar_aset',
  'app_status_iki',
  'app_status_sentinel_bot',   // RIMA F4g — kill switch global (SUPER_ADMIN). 'maintenance' = bot mati (chat+avatar).
  'app_status_rima_query',     // RIMA G30 — kill switch BACA-DATA saja. 'maintenance' = Q&A data mati, chat/tur tetap hidup.
];

export async function GET() {
  // R1/L61: GET sengaja boleh dibaca SEMUA user terautentikasi — payload hanya
  // flag operasional online/maintenance (non-sensitif) yang memang dibutuhkan
  // RIMA (kill-switch G6 + kesadaran maintenance modul G18) dan semua user untuk
  // menghormati mode pemeliharaan. Mutasi (POST) tetap khusus SUPER_ADMIN.
  // Output dibatasi whitelist APP_KEYS — tidak ada data lain yang bocor.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  try {
    const rows = await sql`SELECT \`key\`, value FROM app_config WHERE \`key\` IN (${APP_KEYS})`;
    const map: Record<string, string> = {};
    for (const r of rows as { key: string; value: string }[]) map[r.key] = r.value;
    for (const k of APP_KEYS) if (!map[k]) map[k] = 'online';
    return NextResponse.json({ ok: true, data: map });
  } catch (error) {
    console.error('[AppStatus GET Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  try {
    const { key, value } = await req.json() as { key: string; value: string };
    if (!APP_KEYS.includes(key)) return NextResponse.json({ ok: false, message: 'Key tidak valid.' }, { status: 400 });
    if (value !== 'online' && value !== 'maintenance') return NextResponse.json({ ok: false, message: 'Value tidak valid.' }, { status: 400 });
    await sql`INSERT INTO app_config (\`key\`, value) VALUES (${key}, ${value}) ON DUPLICATE KEY UPDATE value = ${value}`;
    await writeAuditLog({ req, eventType: 'CONFIG_UPDATE', userId: session.userId, username: session.username, detail: `Set ${key} = ${value}` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[AppStatus POST Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}