// app/(dashboard)/iki/layout.tsx — penjaga setingkat modul untuk seluruh rute IKI.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P5 (Tahap 9).
//
// Ada di LAYOUT dan bukan di `page.tsx` karena `/iki/[id]` halaman penuh tersendiri:
// penjaga di halaman daftar tidak menutup pintu editor. Alasan & urutannya (sesi →
// akses → sakelar) ditulis sekali di `jagaLayarModul`.
import { jagaLayarModul } from '@/lib/security/penjaga-layar';

export const dynamic = 'force-dynamic';

export default async function IkiLayout({ children }: { children: React.ReactNode }) {
  await jagaLayarModul('iki');
  return <>{children}</>;
}
