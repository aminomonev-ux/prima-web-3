// lib/renaksi/pemakai.ts — kalimat "nama ini dipakai modul …" sesudah ganti nama / pindah induk
// di Renaksi. PURE & aman-klien. Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap F, H).
// Hanya keterangan: modul lain TIDAK ditulis dari Renaksi — masing-masing memperbarui lewat
// spanduknya sendiri.

import type { GantiNama } from './ganti-nama';

export interface PemakaiNama {
  modul: 'E-Anggaran' | 'PK' | 'IKI';
  /** Tempat di modul itu, mis. "Master" / "Master Program" / "kartu RHK di 2 dokumen DRAFT". */
  tempat: string;
  jumlah: number;
}

export type JenisPerubahan = 'nama' | 'induk' | 'nama-induk';

export function jenisPerubahan(g: Pick<GantiNama, 'dari' | 'ke' | 'indukBaru' | 'indukProgramBaru'>): JenisPerubahan {
  const pindah = !!(g.indukBaru || g.indukProgramBaru);
  if (!pindah) return 'nama';
  return g.dari === g.ke ? 'induk' : 'nama-induk';
}

const SUBJEK: Record<JenisPerubahan, string> = {
  nama: 'Nama lama',
  induk: 'Induk lama',
  'nama-induk': 'Nama & induk lama',
};

export function kalimatPemakai(dipakai: readonly PemakaiNama[], jenis: JenisPerubahan = 'nama'): string | null {
  const ada = dipakai.filter(d => d.jumlah > 0);
  if (!ada.length) return null;
  const rinci = ada.map(d => `${d.modul} (${d.tempat}: ${d.jumlah})`).join(', ');
  return `${SUBJEK[jenis]} masih dipakai di ${rinci}. Perbarui dari layar masing-masing — spanduk "Rencana Aksi berubah" muncul di sana.`;
}
