// lib/renaksi/rantai.ts — aturan MURNI rantai pilihan Data Entry Renaksi.
// Konsep: docs/CONCEPT-renaksi-pilih-indikator.md (§4, §5, §12 Tahap 2).
//
// Tiga pertanyaan, semuanya dijawab dari baris yang sudah dimuat layar:
//   1. indikator induk mana yang boleh dipilih untuk sebuah entitas anak;
//   2. entitas anak mana yang masih pantas muncul untuk indikator induk terpilih;
//   3. indikator apa saja yang sudah dipakai sebuah entitas (opsi "indikator sendiri").
//
// Aturan yang paling mudah dilupakan dan paling mahal akibatnya: baris yang
// `induk_indikator_id`-nya masih NULL WAJIB ikut tampil. 52 baris Renaksi hari ini begitu
// (47 tahun 2026 + 5 tahun 2040); tanpa suku itu seluruh kegiatan lama lenyap dari pilihan
// begitu fitur dipasang, dan tidak ada yang bisa disunting tanpa memetakan setahun penuh.

import type { RaLevel } from '@/lib/data/rencana-aksi-schemas';
import { rapikanIndikator } from '@/lib/shared/nama-resmi';

export interface BarisRantai {
  id: number;
  level: RaLevel;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  tujuan: string | null;
  sasaran: string | null;
  indikator: string;
  /** NULL = tautan belum diisi (data lama & baris hasil impor). */
  induk_indikator_id: number | null;
}

/** Tingkat induk langsung tiap tingkat. `tujuan` = puncak, tidak punya induk. */
export const INDUK_LEVEL: Record<RaLevel, RaLevel | null> = {
  tujuan: null,
  sasaran: 'tujuan',
  program: 'sasaran',
  kegiatan: 'program',
  'sub-kegiatan': 'kegiatan',
};

/** Nama entitas yang dipikul baris ini — kolom penyambungnya sendiri, bukan hasil telusur. */
export function namaEntitas(r: BarisRantai): string {
  if (r.level === 'kegiatan') return (r.kegiatan ?? '').trim();
  if (r.level === 'sub-kegiatan') return (r.sub_kegiatan ?? '').trim();
  return (r.program ?? '').trim();
}

/** Nama induk langsung yang TERCATAT di kolom baris (null untuk `tujuan`). */
export function namaIndukLangsung(r: BarisRantai): string | null {
  if (r.level === 'sasaran') return r.tujuan;
  if (r.level === 'program') return r.sasaran;
  if (r.level === 'kegiatan') return r.program;
  if (r.level === 'sub-kegiatan') return r.kegiatan;
  return null;
}

/**
 * Konteks entitas induk. `program` hanya dipakai untuk induk bertingkat `kegiatan`, yang
 * namanya bisa berulang di program berbeda — di tingkat lain nama entitas sudah unik.
 */
export interface KonteksEntitas {
  nama: string;
  program?: string | null;
}

export interface PilihanInduk {
  id: number;
  indikator: string;
}

const urut = (a: string, b: string) => a.localeCompare(b, 'id');

const unik = (daftar: readonly string[]): string[] => {
  const peta = new Map<string, string>();
  for (const n of daftar) if (n && !peta.has(n)) peta.set(n, n);
  return [...peta.values()];
};

const cocokEntitas = (r: BarisRantai, k: KonteksEntitas): boolean => {
  if (namaEntitas(r) !== k.nama) return false;
  const program = (k.program ?? '').trim();
  return !program || (r.program ?? '').trim() === program;
};

/**
 * Indikator induk yang boleh dipilih untuk entitas anak. Daftar kosong = induknya belum
 * dipilih (atau memang belum punya indikator) — pemanggil mematikan pemilihnya.
 */
export function indikatorInduk(
  rows: readonly BarisRantai[], levelAnak: RaLevel, induk: KonteksEntitas,
): PilihanInduk[] {
  const levelInduk = INDUK_LEVEL[levelAnak];
  const nama = induk.nama.trim();
  if (!levelInduk || !nama) return [];
  return rows
    .filter(r => r.level === levelInduk && cocokEntitas(r, { ...induk, nama }))
    .map(r => ({ id: Number(r.id), indikator: r.indikator }))
    .sort((a, b) => urut(a.indikator, b.indikator));
}

/**
 * Nama entitas anak yang masih pantas muncul untuk indikator induk terpilih.
 * Baris lama yang tautannya NULL ikut tampil (§5) — itu syarat, bukan kelonggaran.
 */
export function entitasAnak(
  rows: readonly BarisRantai[], levelAnak: RaLevel, indukIndikatorId: number | null,
  program?: string | null,
): string[] {
  if (indukIndikatorId == null || indukIndikatorId <= 0) return [];
  const prog = (program ?? '').trim();
  return unik(rows
    .filter(r => r.level === levelAnak
      && (!prog || (r.program ?? '').trim() === prog)
      && (r.induk_indikator_id == null || Number(r.induk_indikator_id) === indukIndikatorId))
    .map(namaEntitas))
    .sort(urut);
}

/**
 * Indikator yang sudah dipakai entitas ini pada tingkatnya — isi opsi "indikator sendiri".
 * Entitas baru menghasilkan daftar kosong; layar wajib tetap menyediakan "tulis baru".
 */
export function indikatorEntitas(
  rows: readonly BarisRantai[], level: RaLevel, entitas: KonteksEntitas,
): string[] {
  const nama = entitas.nama.trim();
  if (!nama) return [];
  return unik(rows
    .filter(r => r.level === level && cocokEntitas(r, { ...entitas, nama }))
    .map(r => r.indikator))
    .sort(urut);
}

/**
 * Entitas lain yang memakai teks indikator yang sama. Dipakai sebagai keterangan
 * "dipakai di …" supaya tabrakan terlihat SEBELUM disimpan, bukan sesudah.
 */
export function pemakaiIndikator(
  rows: readonly BarisRantai[], level: RaLevel, indikator: string,
): string[] {
  const teks = indikator.trim();
  if (!teks) return [];
  return unik(rows
    .filter(r => r.level === level && r.indikator.trim() === teks)
    .map(namaEntitas))
    .sort(urut);
}

/**
 * Nilai tersimpan yang tidak ada di daftar tetap ditawarkan sebagai pilihannya sendiri —
 * kalau tidak, membuka Edit lalu Simpan mengubah data tanpa ada yang mengetiknya.
 */
export function denganNilaiTersimpan(
  opsi: readonly string[], nilai: string | null | undefined,
): string[] {
  const n = (nilai ?? '').trim();
  if (!n) return [...opsi];
  const kunci = new Set(opsi.map(o => o.trim()));
  return kunci.has(n) ? [...opsi] : [n, ...opsi];
}

// Penanda matriks dibuang lewat aturan yang SAMA dengan seluruh modul (lib/shared/nama-resmi.ts).
const kunciLonggar = (s: string | null | undefined) =>
  rapikanIndikator(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Teks "Indikator Induk" dari berkas impor → id baris indikator induk. Dibatasi ENTITAS induk baris
 * itu (aturan yang sama dengan `assertIndukIndikator`: satu tingkat di atas, nama entitas = kolom
 * induk baris; kegiatan induk sub juga harus satu program). Penanda matriks (bintang, "(1)") dan
 * huruf besar tidak membedakan. Tidak ketemu / lebih dari satu = null (tidak ditebak).
 */
export function cocokkanIndukImpor(baris: BarisRantai, teksInduk: string, kandidat: readonly BarisRantai[]): number | null {
  const levelInduk = INDUK_LEVEL[baris.level];
  const nama = kunciLonggar(namaIndukLangsung(baris));
  const kunci = kunciLonggar(teksInduk);
  if (!levelInduk || !nama || !kunci) return null;
  const cocok = kandidat.filter(r => r.level === levelInduk
    && kunciLonggar(namaEntitas(r)) === nama
    && (levelInduk !== 'kegiatan' || kunciLonggar(r.program) === kunciLonggar(baris.program))
    && kunciLonggar(r.indikator) === kunci);
  return cocok.length === 1 ? Number(cocok[0].id) : null;
}

/**
 * Apakah baris anak (dicocokkan lewat NAMA induk) menjabarkan baris indikator induk `indukId`?
 * `idSaudara` = id semua baris indikator entitas induk yang sama (termasuk `indukId`).
 *
 * Tertaut ke salah satu saudara → hanya milik saudara itu. Belum tertaut (NULL), atau tautannya
 * menunjuk baris di luar entitas itu (usang), → milik SEMUA saudara: perilaku sebelum ada tautan
 * (§5) — data lama tidak boleh lenyap dari penyusun mana pun.
 * Satu aturan untuk Master Sasaran PK (`susunSasaranRenaksi`) DAN pohon Cetak Renaksi
 * (`buildHierarchyRows`) — dua aturan akan membuat cetak & master berbeda pendapat.
 */
export function anakMilikIndikator(
  indukAnak: number | null | undefined, indukId: number, idSaudara: ReadonlySet<number>,
): boolean {
  if (indukAnak == null) return true;
  const t = Number(indukAnak);
  return t === Number(indukId) || !idSaudara.has(t);
}
