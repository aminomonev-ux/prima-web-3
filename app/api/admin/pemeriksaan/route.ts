// app/api/admin/pemeriksaan/route.ts — P10 Pemeriksaan Mandiri (baca-saja).
//
// GET saja. Tidak ada jalur tulis, dan itu bagian dari rancangannya: layar ini
// MELAPORKAN, tidak membereskan (§12 P10). Endpoint tulis di sini akan berarti sebuah
// tombol yang mencabut wewenang berdasarkan tebakan sebuah kueri.
//
// SUPER_ADMIN saja — sama dengan lantai Admin Panel sesudah T-16. Isinya nama akun
// yang menganggur dan sakelar yang tidak menutup apa pun: peta lubang, bukan ringkasan.
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { jalankanPemeriksaan } from '@/lib/admin/pemeriksaan';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  try {
    const temuan = await jalankanPemeriksaan();
    return NextResponse.json({ ok: true, data: temuan, diperiksaPada: new Date().toISOString() });
  } catch (error) {
    console.error('[Pemeriksaan GET Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
