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
  /**
   * Tahap H — PINDAH INDUK: induk langsung BARU (kegiatan: program; sub: kegiatan). `null` =
   * induknya tetap. Hanya kegiatan & sub kegiatan: tingkat itulah yang induknya ikut disalin
   * modul lain (Master E-Anggaran & PK); sasaran/tujuan sebuah program tidak disalin siapa pun.
   */
  indukBaru: string | null;
  /** Program BARU sub kegiatan; `null` = programnya tetap. */
  indukProgramBaru: string | null;
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
 * `null` = tidak ada yang perlu dijalarkan: nama entitasnya tidak berubah dan (untuk
 * kegiatan / sub kegiatan) induknya tidak berpindah.
 *
 * Satu entitas bisa punya banyak baris indikator (UNIQUE-nya di
 * (tahun, level, indikator), bukan di nama), jadi lingkupnya bukan baris yang
 * diedit saja — semua baris senama dengan induk yang sama ikut diganti. Kalau
 * hanya baris itu yang berubah, entitas yang sama tampil dua kali di daftar: satu
 * dengan nama baru (yang punya turunan) dan sisanya dengan nama lama. Pindah induk
 * sama persis (Tahap H): dulu hanya baris yang diedit pindah, saudara & turunannya
 * tertinggal di induk lama — entitasnya terbelah.
 */
export function rencanaGantiNama(
  lama: BarisHierarki,
  baru: { program: string; kegiatan: string | null | undefined; sub_kegiatan: string | null | undefined },
): GantiNama | null {
  const dari = namaEntitas(lama.level, lama);
  const ke = namaEntitas(lama.level, baru);
  if (!dari || !ke) return null;

  const induk = lama.level === 'sasaran' ? lama.tujuan
    : lama.level === 'program' ? lama.sasaran
    : lama.level === 'kegiatan' ? lama.program
    : lama.level === 'sub-kegiatan' ? lama.kegiatan
    : null;

  // Induk kosong di baris baru (isian tak lengkap) bukan pindah — tidak ada tujuan untuk dijalarkan.
  const pindah = (lamaV: string | null | undefined, baruV: string | null | undefined) =>
    bersih(baruV) && bersih(baruV) !== bersih(lamaV) ? bersih(baruV) : null;
  const indukBaru = lama.level === 'kegiatan' ? pindah(lama.program, baru.program)
    : lama.level === 'sub-kegiatan' ? pindah(lama.kegiatan, baru.kegiatan)
    : null;
  const indukProgramBaru = lama.level === 'sub-kegiatan' ? pindah(lama.program, baru.program) : null;

  if (dari === ke && !indukBaru && !indukProgramBaru) return null;

  return {
    level: lama.level,
    dari,
    ke,
    induk: bersih(induk) || null,
    indukProgram: lama.level === 'sub-kegiatan' ? (bersih(lama.program) || null) : null,
    indukBaru,
    indukProgramBaru,
  };
}

/** Baris tersimpan / baris tulisan impor — identitasnya (level, indikator). */
export interface BarisBerindikator extends BarisHierarki { indikator: string }

const kunciIndikator = (level: string, indikator: string) =>
  `${level}|${indikator.toLowerCase().replace(/\s+/g, ' ').trim()}`;

/**
 * Ganti nama / pindah induk yang dilakukan lewat IMPOR Renaksi — dicatat seperti Data Entry
 * (`renaksi_ganti_nama`) supaya E-Anggaran & PK membacanya "pindah"/"berganti nama", bukan
 * "1 baru + 1 tidak ada lagi". Impor tidak punya "baris yang diedit": pasangan lama↔baru lewat
 * kunci unik (level, indikator). Satu entitas = banyak indikator, jadi yang dicatat per ENTITAS
 * lama, dan HANYA bila tegas:
 *   • semua baris entitas lama yang ada di berkas menuju lokasi baru yang SAMA;
 *   • mode tambah/perbarui (`penuh` = false): tidak ada baris entitas lama yang tertinggal di
 *     lokasi lama (tidak ada di berkas) — kalau ada, entitasnya terbelah dan "pindah" itu menebak.
 *     Mode ganti (`penuh`) menghapus baris yang tidak ada di berkas, jadi tidak ada yang tertinggal.
 * Impor TIDAK menjalarkan ke turunan (perilaku lama); yang ditambah hanya catatannya.
 */
export function rencanaGantiNamaImpor(
  tersimpan: readonly BarisBerindikator[], tulis: readonly BarisBerindikator[], penuh: boolean,
): GantiNama[] {
  const lamaPer = new Map(tersimpan.map(r => [kunciIndikator(r.level, r.indikator), r]));
  const diBerkas = new Set(tulis.map(r => kunciIndikator(r.level, r.indikator)));
  const kunciEntitas = (r: BarisHierarki) => {
    const induk = r.level === 'sasaran' ? r.tujuan : r.level === 'program' ? r.sasaran
      : r.level === 'kegiatan' ? r.program : r.level === 'sub-kegiatan' ? r.kegiatan : null;
    return [r.level, namaEntitas(r.level, r), bersih(induk), r.level === 'sub-kegiatan' ? bersih(r.program) : ''].join('\u0001');
  };
  const perEntitas = new Map<string, { g: GantiNama | null; sidik: Set<string> }>();
  for (const b of tulis) {
    const lama = lamaPer.get(kunciIndikator(b.level, b.indikator));
    if (!lama) continue;
    const g = rencanaGantiNama(lama, b);
    const k = kunciEntitas(lama);
    const e = perEntitas.get(k) ?? { g, sidik: new Set<string>() };
    e.sidik.add(g ? JSON.stringify(g) : '-');
    perEntitas.set(k, e);
  }
  const out: GantiNama[] = [];
  for (const [k, e] of perEntitas) {
    if (!e.g || e.sidik.size !== 1) continue;
    const tertinggal = !penuh && tersimpan.some(r =>
      kunciEntitas(r) === k && !diBerkas.has(kunciIndikator(r.level, r.indikator)));
    if (!tertinggal) out.push(e.g);
  }
  return out;
}

/** Tahap H: catatan ini memindah induk (bukan sekadar ganti nama)? */
export const pindahInduk = (g: Pick<GantiNama, 'indukBaru' | 'indukProgramBaru'>): boolean =>
  !!(g.indukBaru || g.indukProgramBaru);
