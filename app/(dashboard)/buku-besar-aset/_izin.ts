// app/(dashboard)/buku-besar-aset/_izin.ts — izin per halaman BBA untuk server component.
// Konsep: docs/CONCEPT-bba-buku-aset.md §3.1, §16
// `layout.tsx` + pemeriksaan `isAsetRole` di halaman sudah menjaga pintu modul; di sini sumbu
// kedua: bagian ini boleh dibuka / diubah? `bolehUbah` hanya menyembunyikan tombol — pagar
// yang menentukan tetap di route (`app/api/buku-besar-aset/_guard.ts`).
import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { petaIzinBba, type PetaIzinBba } from '@/lib/bba/izin-server';
import type { MenuBba } from '@/lib/bba/peran';

export type IzinLayarBba = { peta: PetaIzinBba; bolehUbah: boolean };

export async function izinLayarBba(menu: MenuBba): Promise<IzinLayarBba> {
  const h = await headers();
  const uid = h.get('x-user-id');
  const role = h.get('x-user-role');
  if (!uid || !role) redirect('/login');
  const peta = await petaIzinBba(Number(uid), role);
  // Ke Rencana (selalu terbuka), bukan /menu — orangnya berhak masuk modul, cuma tidak ke bagian ini.
  if (peta[menu] === 'TIDAK') redirect('/buku-besar-aset');
  return { peta, bolehUbah: peta[menu] === 'EDIT' };
}
