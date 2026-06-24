import { NextResponse } from 'next/server';

// INTRANET EDITION (D5-D7 · docs/INTRANET-DELTA.md): endpoint DINONAKTIFKAN.
// Registrasi publik & alur email (verifikasi/reset password) ditiadakan pada
// edisi intranet. Pembuatan akun & reset password = admin-driven via Admin Panel.
export async function POST() {
  return NextResponse.json(
    { ok: false, message: 'Fitur ini dinonaktifkan pada edisi intranet. Hubungi Super Admin untuk pembuatan akun atau reset password.' },
    { status: 410 },
  );
}