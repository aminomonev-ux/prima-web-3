'use client';
// components/ui/KunciTulis.tsx — tombol tulis mati saat modul dibekukan (Fase F Tahap 14b, K1=C).
//
// BERKAS DAUN: hanya React + TIPE `InfoBeku` (terhapus saat kompilasi). Impor nilai dari
// `lib/security/beku` akan menyeret mysql2 ke bundel peramban (preseden Tahap 5).
//
// Kenapa konteks, bukan izin: dulu BLUD & PK menyembunyikan tombol lewat `jepitBeku`
// (EDIT→LIHAT), jadi "modulnya sedang apa" menumpang di matriks "siapa Anda" — dan
// spanduk kedua berbunyi "Peran Anda boleh membaca", menyalahkan peran untuk sesuatu yang
// sebetulnya sakelar sementara (T12). Keadaan modul turun lewat konteks ini; izin
// kembali menjawab satu pertanyaan saja.
import { createContext, useContext, type ReactNode } from 'react';
import type { InfoBeku } from '@/lib/security/beku';

export type KunciTulis = { dikunci: boolean; sebab: string };

const TIDAK_DIKUNCI: KunciTulis = { dikunci: false, sebab: '' };
const Ctx = createContext<KunciTulis>(TIDAK_DIKUNCI);

export function sebabKunciTulis(info: Pick<InfoBeku, 'global' | 'bagian'>): string {
  const siapa = info.global ? 'Seluruh aplikasi' : info.bagian || 'Modul ini';
  // Pendek: tooltip ini menempel di tombol, sedangkan penjelasan lengkapnya sudah ada di
  // spanduk. Kalimat panjang pertama terukur 745px dan terpotong di tepi kanan layar.
  return `${siapa} sedang dalam mode hanya baca, jadi belum bisa menyimpan.`;
}

/**
 * SUPER_ADMIN (`tembus`) tidak dikunci: ia memang masih bisa menyimpan, dan tombol mati
 * untuknya berbohong ke arah sebaliknya. Spanduknya tetap tampil dengan kalimat sendiri.
 */
export function KunciTulisProvider({ beku, children }: { beku: InfoBeku | null; children: ReactNode }) {
  const nilai: KunciTulis = beku?.beku && !beku.tembus
    ? { dikunci: true, sebab: sebabKunciTulis(beku) }
    : TIDAK_DIKUNCI;
  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>;
}

export function useKunciTulis(): KunciTulis {
  return useContext(Ctx);
}
