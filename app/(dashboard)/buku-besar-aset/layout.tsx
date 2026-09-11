// app/(dashboard)/buku-besar-aset/layout.tsx — penjaga setingkat modul untuk seluruh
// rute Buku Besar Aset. Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P5 (Tahap 9).
//
// Layout ini semula cuma memeriksa sesi — sakelarnya tidak pernah diperiksa di layar.
// Di LAYOUT dan bukan di `page.tsx` karena `/buku-besar-aset/master` halaman penuh
// tersendiri.
import { jagaLayarModul } from '@/lib/security/penjaga-layar';

export const dynamic = 'force-dynamic';

export default async function BukuBesarAsetLayout({ children }: { children: React.ReactNode }) {
  await jagaLayarModul('buku_besar_aset');
  return <>{children}</>;
}
