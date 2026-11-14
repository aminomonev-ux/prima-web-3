// /api/admin/drive — panel "Drive & Backup" (SUPER_ADMIN saja).
// GET = status (hanya membaca DB, tidak memanggil Google). POST aksi=uji = tombol UJI;
// aksi=atur_induk = isi/kosongkan folder induk. Konsep: docs/CONCEPT-drive-terpusat.md §8, §10, §18.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { writeAuditLog } from '@/lib/security/auditlog';
import { aturFolderInduk, folderInduk, POLA_ID_DRIVE } from '@/lib/services/drive-tujuan';
import { bacaStatusDrive, ujiDrive } from '@/lib/services/drive-uji';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // googleapis

const BodySchema = z.discriminatedUnion('aksi', [
  z.object({ aksi: z.literal('uji') }),
  z.object({
    aksi: z.literal('atur_induk'),
    // Kosong = hapus isian panel (kembali ke GOOGLE_DRIVE_FOLDER_ID_ROOT di .env.local).
    folder_id: z.string().trim().max(128).refine((v) => v === '' || POLA_ID_DRIVE.test(v), 'ID folder tidak sah — salin bagian ujung URL …/folders/<ID>, bukan URL-nya.'),
  }),
]);

async function sesiSuperAdmin() {
  const session = await getSession();
  return session?.role === 'SUPER_ADMIN' ? session : null;
}

export async function GET() {
  const session = await sesiSuperAdmin();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  return NextResponse.json({ ok: true, ...(await bacaStatusDrive()) });
}

export async function POST(req: NextRequest) {
  const session = await sesiSuperAdmin();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  let raw: unknown;
  try { raw = await req.json(); } catch { raw = null; }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Isian tidak valid.' }, { status: 400 });
  }
  const b = parsed.data;

  if (b.aksi === 'uji') {
    // Satu uji = belasan panggilan Google + berkas probe di tiap folder; 1 per 30 detik cukup.
    const rl = await checkRateLimit(`drive-uji:${session.userId}`, 1, 30);
    if (!rl.allowed) return NextResponse.json({ ok: false, message: `Tunggu ${rl.resetIn} detik sebelum menguji lagi.` }, { status: 429 });
    const hasil = await ujiDrive();
    const ok = hasil.tujuan.filter((t) => t.ok).length;
    const kosong = hasil.tujuan.filter((t) => t.kode === 'kosong').length;
    const gagal = hasil.tujuan.filter((t) => !t.ok && t.kode !== 'kosong');
    await writeAuditLog({
      req, eventType: 'DRIVE_UJI', userId: session.userId, username: session.username,
      detail: `Uji Drive: ${ok} ok, ${gagal.length} gagal, ${kosong} belum diatur`
        + (gagal.length ? ` (${gagal.map((t) => `${t.tujuan}:${t.kode}`).join(', ')})` : '')
        + (hasil.galatAkun ? ` · akun: ${hasil.galatAkun.slice(0, 80)}` : ''),
    });
    return NextResponse.json({ ok: true, hasil });
  }

  const rl = await checkRateLimit(`drive-induk:${session.userId}`, 10, 600);
  if (!rl.allowed) return NextResponse.json({ ok: false, message: `Terlalu sering. Coba lagi dalam ${rl.resetIn} detik.` }, { status: 429 });
  const lama = await folderInduk();
  await aturFolderInduk(b.folder_id);
  const baru = await folderInduk();
  await writeAuditLog({
    req, eventType: 'DRIVE_FOLDER_UBAH', userId: session.userId, username: session.username,
    detail: `Folder induk Drive: ${lama.id || '(kosong)'} [${lama.asal ?? '-'}] → ${baru.id || '(kosong)'} [${baru.asal ?? '-'}]`,
  });
  return NextResponse.json({ ok: true, induk: baru });
}
