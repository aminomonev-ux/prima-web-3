// app/(dashboard)/lkjip/layout.tsx — penjaga setingkat modul untuk seluruh rute E-LKJIP.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P5 (Tahap 9).
//
// Di LAYOUT karena `/lkjip/[id]` halaman penuh tersendiri — dan editor itulah yang paling
// sering dibuka dari tautan langsung, bukan dari daftar dokumennya.
import { jagaLayarModul } from '@/lib/security/penjaga-layar';

export const dynamic = 'force-dynamic';

export default async function LkjipLayout({ children }: { children: React.ReactNode }) {
  await jagaLayarModul('lkjip');
  return <>{children}</>;
}
