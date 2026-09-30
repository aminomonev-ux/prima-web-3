
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ADMIN_ROLES } from '@/lib/constants';
import { aturanConfig, bolehTulisConfig, configTerbuka } from '@/lib/data/admin-schemas';


export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    // V5-CFG-02: tabel app_config sudah didefinisikan di schema/migration — DDL
    // tidak dijalankan di hot read-path.
    const rows = await sql`SELECT \`key\`, value FROM app_config`;
    const cfg: Record<string, string> = {};
    // SDL-M13: non-admin hanya menerima kunci terbuka (`configTerbuka`) — sejak 30 Sep termasuk
    // pagu BLUD, yang boleh dilihat semua pengguna (keputusan pemilik aplikasi).
    // Penulisnya dijaga per kunci di POST (`aturanConfig`). GET dipanggil semua user untuk
    // hitung mundur batas pengajuan (batas_*) dan batang pagu.
    const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
    for (const r of rows as { key: string; value: string }[]) {
      if (isAdmin || configTerbuka(r.key)) {
        cfg[r.key] = r.value;
      }
    }

    return NextResponse.json({ ok: true, data: cfg });
  } catch (error) {
    console.error('[Config GET Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

const updateSchema = z.object({
  key:   z.string().min(1),
  value: z.string(),
});


export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });

    if (!bolehTulisConfig(session.role)) return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });

    const body   = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });

    const { key, value } = parsed.data;

    // I3: daftar kunci + bentuk nilai + siapa yang boleh — satu tempat (`aturanConfig`).
    const aturan = aturanConfig(key);
    if (!aturan) return NextResponse.json({ ok: false, message: 'Key tidak valid.' }, { status: 400 });
    if (!aturan.peran.includes(session.role)) {
      return NextResponse.json({ ok: false, message: 'Anda tidak berwenang mengubah pengaturan ini.' }, { status: 403 });
    }
    const nilaiSah = aturan.nilai.safeParse(value);
    if (!nilaiSah.success) return NextResponse.json({ ok: false, message: nilaiSah.error.issues[0]?.message ?? 'Nilai tidak valid.' }, { status: 400 });

    await sql`
      INSERT INTO app_config (\`key\`, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON DUPLICATE KEY UPDATE value = ${value}, updated_at = NOW()
    `;

    await writeAuditLog({ req, eventType: 'CONFIG_UPDATE', userId: session.userId, username: session.username, detail: `Set ${key} = ${value}` });
    return NextResponse.json({ ok: true, message: 'Konfigurasi berhasil disimpan.' });
  } catch (error) {
    console.error('[Config POST Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
