// app/api/perjanjian-kinerja/pejabat/export/route.ts
// GET berkas Master Pejabat (.xlsx / .docx) dari data TERSIMPAN — pasangan
// POST /pejabat/import: yang turun dari sini wajib terbaca balik di sana.
//
// Digenerate di server, bukan di browser seperti ekspor IKI: isinya nama + NIP +
// pangkat orang, jadi jejaknya harus pasti (PK_EXPORT_PEJABAT ditulis di jalur yang
// sama dengan responsnya, bukan fetch fire-and-forget yang boleh gagal diam-diam),
// dan yang terunduh adalah isi database — bukan suntingan layar yang belum disimpan.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { pkRateLimit, PkQuerySchema } from '@/lib/data/pk-schemas';
import { bolehBukaMenu, forbidden } from '../../_guard';
import {
  buatBerkasPejabat, namaBerkasPejabat, MIME_EXPORT,
  type ExportFormat, type ExportPejabatRow,
} from '@/lib/pk/export-pejabat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FormatSchema = z.enum(['xlsx', 'docx']);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // LIHAT, bukan EDIT — mengunduh tidak mengubah angka resmi mana pun. Tapi diikat ke
  // menu `pejabat` saja, BUKAN `bolehLihatSalahSatu(['form','pejabat'])` seperti GET
  // list: kelonggaran di sana ada demi auto-fill satu unit di Form PK, sedangkan
  // tombolnya cuma hidup di layar Master Pejabat dan yang keluar berkas berisi
  // seluruh daftar PII yang meninggalkan aplikasi.
  if (!(await bolehBukaMenu(session.userId, session.role, 'pejabat'))) return forbidden();

  const limited = await pkRateLimit(session.userId, 'export-pejabat', 20);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = PkQuerySchema.safeParse({ tahun: searchParams.get('tahun') ?? undefined });
  if (!q.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  }
  const f = FormatSchema.safeParse(searchParams.get('format') ?? 'xlsx');
  if (!f.success) {
    return NextResponse.json({ ok: false, message: 'Format harus xlsx atau docx.' }, { status: 400 });
  }
  const tahun: string = q.data.tahun ?? new Date().getFullYear().toString();
  const format: ExportFormat = f.data;

  const rows = await sql`
    SELECT unit_kerja, nama, jabatan, pangkat, nip
    FROM pk_pejabat
    WHERE tahun = ${tahun} AND is_active = TRUE
    ORDER BY unit_kerja
  ` as ExportPejabatRow[];

  if (rows.length === 0) {
    return NextResponse.json({
      ok: false,
      message: `Belum ada pejabat tersimpan untuk tahun ${tahun} — tidak ada yang bisa diunduh.`,
    }, { status: 404 });
  }

  const buf = await buatBerkasPejabat(rows, tahun, format);
  const filename = namaBerkasPejabat(tahun, format);

  await writeAuditLog({
    req,
    eventType: 'PK_EXPORT_PEJABAT',
    userId:    session.userId,
    username:  session.username,
    detail:    `Unduh Master Pejabat tahun ${tahun} format ${format.toUpperCase()} (${rows.length} baris)`,
  });

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type':           MIME_EXPORT[format],
      'Content-Disposition':    `attachment; filename="${filename}"`,
      'Content-Length':         String(buf.length),
      'Cache-Control':          'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
