'use client';
// Navigasi lima bagian BBA (docs/CONCEPT-bba-buku-aset.md §14) — bilah tab di atas halaman +
// isi FloatingDock dari daftar yang SAMA, supaya keduanya tidak pernah menawarkan pintu berbeda.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, ClipboardList, ShoppingCart, Layers, Printer, LayoutGrid, Eye } from 'lucide-react';
import { MENU_BBA, LABEL_MENU_BBA, MENU_BACA_SAJA_BBA, type MenuBba, type Izin } from '@/lib/bba/peran';

export type PetaIzinLayar = Record<MenuBba, Izin>;

/** Halaman yang sudah ada. Bagian tanpa halaman tidak ditawarkan (izinnya tetap bisa diatur di Admin Panel). */
export const HALAMAN_BBA: Partial<Record<MenuBba, string>> = {
  aset:    '/buku-besar-aset/aset',
  rencana: '/buku-besar-aset',
  pengadaan: '/buku-besar-aset/pengadaan',
  master:  '/buku-besar-aset/master',
  cetak:   '/buku-besar-aset/cetak',
};

const IKON: Record<MenuBba, ReactNode> = {
  aset: <BookOpen size={17} />, rencana: <ClipboardList size={17} />, pengadaan: <ShoppingCart size={17} />,
  master: <Layers size={17} />, cetak: <Printer size={17} />,
};

export function bagianTerbuka(peta: PetaIzinLayar): MenuBba[] {
  return MENU_BBA.filter(m => HALAMAN_BBA[m] && peta[m] !== 'TIDAK');
}

/** Isi `nav` FloatingDock: bagian yang terbuka + kembali ke Menu. */
export function navDockBba(peta: PetaIzinLayar, aktif: MenuBba, pergi: (href: string) => void) {
  return [
    ...bagianTerbuka(peta).map(m => ({
      icon: IKON[m], label: LABEL_MENU_BBA[m], current: m === aktif,
      onClick: () => { if (m !== aktif) pergi(HALAMAN_BBA[m]!); },
    })),
    { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => pergi('/menu') },
  ];
}

type Warna = { text: string; sub: string; border: string };

export default function BbaNav({ aktif, peta, c }: { aktif: MenuBba; peta: PetaIzinLayar; c: Warna }) {
  return (
    <nav aria-label="Bagian Buku Besar Aset" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {bagianTerbuka(peta).map(m => {
        const kini = m === aktif;
        // Cetak memang tanpa jalur tulis bagi siapa pun — ikon "hanya melihat" di situ menyesatkan.
        const hanyaLihat = peta[m] === 'LIHAT' && !MENU_BACA_SAJA_BBA.includes(m);
        return (
          <Link key={m} href={HALAMAN_BBA[m]!} aria-current={kini ? 'page' : undefined}
            data-tooltip={hanyaLihat ? 'Izin Anda di bagian ini: hanya melihat' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 20, textDecoration: 'none',
              border: `1px solid ${kini ? '#EF9F27' : c.border}`, background: kini ? 'rgba(239,159,39,.15)' : 'transparent', color: kini ? '#EF9F27' : c.sub }}>
            {LABEL_MENU_BBA[m]}
            {hanyaLihat && <Eye size={12} style={{ opacity: .7 }} />}
          </Link>
        );
      })}
    </nav>
  );
}
