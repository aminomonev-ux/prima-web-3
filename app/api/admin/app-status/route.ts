import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { KUNCI_SAKELAR } from '@/lib/registry/apps';

// Fase B (Tahap 2): DITURUNKAN dari `lib/registry/apps.ts`, tidak lagi diketik.
//
// Daftar tangan di sini pernah melahirkan kegagalan senyap dua arah. T1b: kunci
// `app_status_lkjip` tidak pernah ditambahkan padahal kartunya menyusun nama kunci
// dari id-nya sendiri, jadi sakelar LKJIP tak pernah bisa dinyalakan — bukan bocor,
// mati total. T-5: sebaliknya, `app_status_blud_realisasi` ADA di sini tapi tidak di
// daftar label, jadi ia berlaku penuh tanpa punya tombol. Dua daftar yang menjawab
// pertanyaan yang sama tidak pernah bertahan sama.
const APP_KEYS = [...KUNCI_SAKELAR];

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