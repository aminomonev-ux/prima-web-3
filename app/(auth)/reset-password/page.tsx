import { redirect } from 'next/navigation';

// INTRANET EDITION (D8 · docs/INTRANET-DELTA.md): halaman dinonaktifkan.
// Verifikasi email & reset password via link ditiadakan — akun dikelola Super Admin.
export default function Page() {
  redirect('/login');
}