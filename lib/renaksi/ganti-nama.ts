// lib/renaksi/ganti-nama.ts — aturan ganti nama entitas Renaksi.
//
// PURE: tidak menyentuh DB. Hierarki `rencana_aksi` TIDAK disambung foreign key,
// melainkan TEKS NAMA (lihat lib/renaksi/import-data.ts): `sasaran.tujuan`,
// `program.sasaran`, `kegiatan.program`, `sub-kegiatan.{program,kegiatan}`.
// Karena itu memperbaiki ejaan sebuah nama — mis. membuang bintang penanda di
// ujungnya — menuntut teks yang sama ikut disalin ke baris turunannya.

import type { RaLevel } from '@/lib/data/rencana-aksi-schemas';

export interface BarisHierarki {
  level: RaLevel;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  sasaran: string | null;
  tujuan: string | null;
}

export interface GantiNama {
  level: RaLevel;
  dari: string;
  ke: string;
  /** Nama INDUK langsung yang lama — mempersempit lingkup ke entitas yang benar. */
  induk: string | null;
  /** Program lama; hanya dipakai sub-kegiatan (nama kegiatan saja tidak unik). */
  indukProgram: string | null;
}

const KOLOM_NAMA: Record<RaLevel, 'program' | 'kegiatan' | 'sub_kegiatan'> = {
  tujuan: 'program',
  sasaran: 'program',
  program: 'program',
  kegiatan: 'kegiatan',
  'sub-kegiatan': 'sub_kegiatan',
};

/** Nama entitas yang dipikul baris ini — tujuan/sasaran/program menumpang kolom `program`. */
export function namaEntitas(
  level: RaLevel,
  baris: { program: string; kegiatan?: string | null; sub_kegiatan?: string | null },
): string {
  const kolom = KOLOM_NAMA[level];
  const nilai = kolom === 'program' ? baris.program
    : kolom === 'kegiatan' ? baris.kegiatan
    : baris.sub_kegiatan;
  return (nilai ?? '').trim();
}

const bersih = (v: string | null | undefined): string => (v ?? '').trim();

/**
 * `null` = tidak ada yang perlu dijalarkan: nama entitasnya tidak berubah.
 *
 * Satu entitas bisa punya banyak baris indikator (UNIQUE-nya di
 * (tahun, level, indikator), bukan di nama), jadi lingkupnya bukan baris yang
 * diedit saja — semua baris senama dengan induk yang sama ikut diganti. Kalau
 * hanya baris itu yang berubah, entitas yang sama tampil dua kali di daftar: satu
 * dengan nama baru (yang punya turunan) dan sisanya dengan nama lama.
 */
export function rencanaGantiNama(
  lama: BarisHierarki,
  baru: { program: string; kegiatan: string | null | undefined; sub_kegiatan: string | null | undefined },
): GantiNama | null {
  const dari = namaEntitas(lama.level, lama);
  const ke = namaEntitas(lama.level, baru);
  if (!dari || !ke || dari === ke) return null;

  const induk = lama.level === 'sasaran' ? lama.tujuan
    : lama.level === 'program' ? lama.sasaran
    : lama.level === 'kegiatan' ? lama.program
    : lama.level === 'sub-kegiatan' ? lama.kegiatan
    : null;

  return {
    level: lama.level,
    dari,
    ke,
    induk: bersih(induk) || null,
    indukProgram: lama.level === 'sub-kegiatan' ? (bersih(lama.program) || null) : null,
  };
}
