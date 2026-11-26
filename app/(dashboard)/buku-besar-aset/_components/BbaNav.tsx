'use client';
// Navigasi lima bagian BBA (docs/konsep/bba/CONCEPT-bba-buku-aset.md §14) — bilah tab di atas halaman +
// isi FloatingDock dari daftar yang SAMA, supaya keduanya tidak pernah menawarkan pintu berbeda.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, ClipboardList, ShoppingCart, Layers, Printer, Eye, Tags } from 'lucide-react';
import { MENU_BBA, LABEL_MENU_BBA, MENU_BACA_SAJA_BBA, type MenuBba, type Izin } from '@/lib/bba/peran';
import PitaAlur, { type PindahPita } from './PitaAlur';

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

/**
 * Penawaran Rekanan (CONCEPT-bba-revamp-alur §5A) bukan bagian izin tersendiri: dilihat semua pemegang BBA, diubah
 * pemegang EDIT Rencana ATAU Pengadaan. Di bilah tab ia duduk di antara Pengadaan dan Master.
 */
export const HALAMAN_PENAWARAN = '/buku-besar-aset/penawaran';
export type HalamanBba = MenuBba | 'penawaran';
export const bolehUbahPenawaran = (peta: PetaIzinLayar) => peta.rencana === 'EDIT' || peta.pengadaan === 'EDIT';
function urutanNav(peta: PetaIzinLayar): HalamanBba[] {
  const m = bagianTerbuka(peta);
  const i = m.indexOf('master');
  return i < 0 ? [...m, 'penawaran'] : [...m.slice(0, i), 'penawaran', ...m.slice(i)];
}
const hrefHalaman = (h: HalamanBba) => (h === 'penawaran' ? HALAMAN_PENAWARAN : HALAMAN_BBA[h]!);
const labelHalaman = (h: HalamanBba) => (h === 'penawaran' ? 'Penawaran' : LABEL_MENU_BBA[h]);

/** Isi `nav` FloatingDock: bagian yang terbuka. Kembali ke Menu ada di lencana profil (CONCEPT-bba-revamp-alur §3.5). */
export function navDockBba(peta: PetaIzinLayar, aktif: HalamanBba, pergi: (href: string) => void) {
  return urutanNav(peta).map(m => ({
    icon: m === 'penawaran' ? <Tags size={17} /> : IKON[m], label: labelHalaman(m), current: m === aktif,
    onClick: () => { if (m !== aktif) pergi(hrefHalaman(m)); },
  }));
}

type Warna = { text: string; sub: string; border: string };

type PropsNav = { aktif: HalamanBba; peta: PetaIzinLayar; c: Warna;
  /** Tahun pita alur — tanpa ini tahun berjalan. */
  tahun?: number; segarkan?: number; pindah?: PindahPita };

export default function BbaNav({ aktif, peta, c, tahun, segarkan, pindah }: PropsNav) {
  return (<>
    <nav aria-label="Bagian Buku Besar Aset" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
      {urutanNav(peta).map(m => {
        const kini = m === aktif;
        // Cetak memang tanpa jalur tulis bagi siapa pun — ikon "hanya melihat" di situ menyesatkan.
        const hanyaLihat = m === 'penawaran' ? !bolehUbahPenawaran(peta) : peta[m] === 'LIHAT' && !MENU_BACA_SAJA_BBA.includes(m);
        return (
          <Link key={m} href={hrefHalaman(m)} aria-current={kini ? 'page' : undefined}
            data-tooltip={hanyaLihat ? 'Izin Anda di bagian ini: hanya melihat' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 20, textDecoration: 'none',
              border: `1px solid ${kini ? '#EF9F27' : c.border}`, background: kini ? 'rgba(239,159,39,.15)' : 'transparent', color: kini ? '#EF9F27' : c.sub }}>
            {labelHalaman(m)}
            {hanyaLihat && <Eye size={12} style={{ opacity: .7 }} />}
          </Link>
        );
      })}
    </nav>
    <PitaAlur tahun={tahun ?? new Date().getFullYear()} peta={peta} c={c} segarkan={segarkan} pindah={pindah} />
  </>);
}
