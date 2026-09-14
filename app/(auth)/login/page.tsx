// app/(auth)/login/page.tsx — server component: baca pemberitahuan pemeliharaan, lalu formulir.
// Fase F Tahap 17 (T9, K2). Formulirnya komponen klien dan tidak bisa membaca app_config,
// jadi datanya diselesaikan di sini dan dioper sebagai prop — nol endpoint publik baru.
import LoginForm from './login-form';
import { pemberitahuanPemeliharaan } from '@/lib/security/pemeliharaan';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const pemeliharaan = await pemberitahuanPemeliharaan();
  return <LoginForm pemeliharaan={pemeliharaan} />;
}
