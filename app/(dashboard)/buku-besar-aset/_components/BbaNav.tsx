'use client';
// Navigasi lima bagian BBA (docs/konsep/bba/CONCEPT-bba-buku-aset.md §14) — bilah tab di atas halaman +
// isi FloatingDock dari daftar yang SAMA, supaya keduanya tidak pernah menawarkan pintu berbeda.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BookOpen, ClipboardList, ShoppingCart, Layers, Printer, Eye, Tags } from 'lucide-react';
import { MENU_BBA, LABEL_MENU_BBA, MENU_BACA_SAJA_BBA, type MenuBba, type Izin } from '@/lib/bba/peran';
import PitaAlur, { type PindahPita } from './PitaAlur';
import { SpandukDrive } from './TinjauDrive';
import type { WarnaBba } from './BbaShell';

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
 * pemegang EDIT Rencana ATAU Pengadaan.
 */
export const HALAMAN_PENAWARAN = '/buku-besar-aset/penawaran';
export type HalamanBba = MenuBba | 'penawaran';
export const bolehUbahPenawaran = (peta: PetaIzinLayar) => peta.rencana === 'EDIT' || peta.pengadaan === 'EDIT';
/** Urutan bilah tab = urutan kerja (rencana → pengadaan → buku aset), lalu alat pendukung. Bukan urutan izin `MENU_BBA`. */
const URUTAN_NAV: readonly HalamanBba[] = ['rencana', 'pengadaan', 'aset', 'penawaran', 'master', 'cetak'];
function urutanNav(peta: PetaIzinLayar): HalamanBba[] {
  const terbuka = new Set<HalamanBba>([...bagianTerbuka(peta), 'penawaran']);
  return URUTAN_NAV.filter(h => terbuka.has(h));
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

type PropsNav = { aktif: HalamanBba; peta: PetaIzinLayar; c: WarnaBba;
  /** Tahun pita alur — tanpa ini tahun berjalan. */
  tahun?: number; segarkan?: number; pindah?: PindahPita };

const IKON_TAB: Record<HalamanBba, ReactNode> = {
  rencana: <ClipboardList size={15} />, pengadaan: <ShoppingCart size={15} />, aset: <BookOpen size={15} />,
  penawaran: <Tags size={15} />, master: <Layers size={15} />, cetak: <Printer size={15} />,
};

export default function BbaNav({ aktif, peta, c, tahun, segarkan, pindah }: PropsNav) {
  return (<>
    {/* Tab bergaris bawah: yang aktif = teks + garis amber yang menimpa garis dasar (marginBottom -1). Membungkus
        di layar sempit, bukan digulir — wadah bergulir memotong tooltip pseudo `data-tooltip`. */}
    <nav aria-label="Bagian Buku Besar Aset" style={{ display: 'flex', columnGap: 22, rowGap: 2, flexWrap: 'wrap', borderBottom: `1px solid ${c.border}`, marginBottom: 16 }}>
      {urutanNav(peta).map(m => {
        const kini = m === aktif;
        // Cetak memang tanpa jalur tulis bagi siapa pun — ikon "hanya melihat" di situ menyesatkan.
        const hanyaLihat = m === 'penawaran' ? !bolehUbahPenawaran(peta) : peta[m] === 'LIHAT' && !MENU_BACA_SAJA_BBA.includes(m);
        return (
          <Link key={m} href={hrefHalaman(m)} aria-current={kini ? 'page' : undefined}
            data-tooltip={hanyaLihat ? 'Izin Anda di bagian ini: hanya melihat' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 2px 10px', marginBottom: -1, fontSize: 13, fontWeight: kini ? 700 : 500,
              textDecoration: 'none', whiteSpace: 'nowrap', color: kini ? '#EF9F27' : c.sub, borderBottom: `2px solid ${kini ? '#EF9F27' : 'transparent'}` }}>
            {IKON_TAB[m]}
            {labelHalaman(m)}
            {hanyaLihat && <Eye size={12} style={{ opacity: .7 }} />}
          </Link>
        );
      })}
    </nav>
    {/* Perubahan laporan di Drive yang menunggu ditinjau (CONCEPT-bba-drive-balik §2) — di semua halaman BBA. */}
    <SpandukDrive c={c} />
    <PitaAlur tahun={tahun ?? new Date().getFullYear()} peta={peta} c={c} segarkan={segarkan} pindah={pindah} />
  </>);
}
