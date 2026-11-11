// lib/shared/nama-resmi.ts — nama sasaran/program & indikator tanpa penanda matriks Renaksi.
//
// PURE, tanpa impor: dipakai server (route tarik PK, docgen Word) DAN layar (tombol Rapikan Nama).
//
// Matriks Renaksi resmi menandai tingkat dengan bintang di ujung nama (`*` tujuan … `*****`
// sub kegiatan) dan mengurutkan indikator dengan awalan `(1)`, `(2)`. Keduanya turunan dari
// tingkat & urutan, bukan bagian nama — dokumen Perjanjian Kinerja resmi tidak memuatnya.

/** Deret bintang (boleh berselang spasi) di UJUNG KANAN saja; bintang di tengah nama tidak disentuh. */
export function buangBintangUjung(s: string): string {
  return s.replace(/[\s*]+$/u, '').trim();
}

/** Nama yang isinya hanya bintang dikembalikan apa adanya: nama kosong ditolak Zod tanpa penjelasan. */
export function rapikanNamaEntitas(s: string): string {
  return buangBintangUjung(s) || s.trim();
}

/**
 * Indikator: bintang di ujung + awalan `(1)`–`(99)` dibuang. `(n)` di tengah atau di ujung
 * teks ("Kelas (3)") tidak disentuh. Pola awalannya berulang supaya hasilnya idempoten.
 */
export function rapikanIndikator(s: string): string {
  const tanpaBintang = buangBintangUjung(s);
  return tanpaBintang.replace(/^(?:\s*\(\d{1,2}\)\s+)+/u, '') || tanpaBintang || s.trim();
}

export const rapikanNamaAtauNull = (s: string | null | undefined): string | null =>
  s == null ? null : rapikanNamaEntitas(s);

export const rapikanIndikatorAtauNull = (s: string | null | undefined): string | null =>
  s == null ? null : rapikanIndikator(s);

// ─── Penanda dihitung, bukan disimpan ────────────────────────────────────────
// Renaksi menyimpan nama apa adanya (hasil impor membawa bintang & nomor, ketikan tangan tidak).
// Setiap tampilan membuang yang tersimpan lalu, bila memang menampilkan penanda, menempelkan
// yang DIHITUNG dari tingkat dan urutan — jadi baris impor dan baris ketikan tampil sama.

export type LevelRenaksi = 'tujuan' | 'sasaran' | 'program' | 'kegiatan' | 'sub-kegiatan';

const JUMLAH_BINTANG: Record<LevelRenaksi, number> = { tujuan: 1, sasaran: 2, program: 3, kegiatan: 4, 'sub-kegiatan': 5 };

export function bintangLevel(level: LevelRenaksi): string {
  return '*'.repeat(JUMLAH_BINTANG[level] ?? 0);
}

/** Nomor urut yang tersimpan di depan indikator ("(2) Jumlah …" → 2). */
export function nomorTersimpan(indikator: string): number | null {
  const m = /^\s*\((\d{1,2})\)\s+/u.exec(indikator);
  return m ? Number(m[1]) : null;
}

export interface BarisBernomor {
  id: number;
  level: LevelRenaksi;
  program: string;
  kegiatan?: string | null;
  sub_kegiatan?: string | null;
  indikator: string;
}

/**
 * Nomor urut indikator di dalam entitasnya. Nomor yang tersimpan DIPERTAHANKAN (hasil impor
 * tetap bernomor seperti berkasnya); indikator tanpa nomor mendapat nomor kosong berikutnya
 * menurut abjad. Entitas berindikator tunggal tanpa nomor tersimpan tidak dinomori.
 */
export function nomorIndikator(rows: readonly BarisBernomor[]): Map<number, number | null> {
  const kelompok = new Map<string, BarisBernomor[]>();
  for (const r of rows) {
    const kunci = [r.level, r.program, r.kegiatan ?? '', r.sub_kegiatan ?? ''].map(s => rapikanNamaEntitas(s).toLowerCase()).join('||');
    const k = kelompok.get(kunci);
    if (k) k.push(r); else kelompok.set(kunci, [r]);
  }
  const hasil = new Map<number, number | null>();
  for (const k of kelompok.values()) {
    const terpakai = new Set<number>();
    for (const r of k) {
      const n = nomorTersimpan(r.indikator);
      hasil.set(r.id, n);
      if (n !== null) terpakai.add(n);
    }
    if (k.length < 2) continue;
    let berikut = 1;
    const tanpaNomor = k.filter(r => hasil.get(r.id) === null)
      .sort((a, b) => rapikanIndikator(a.indikator).localeCompare(rapikanIndikator(b.indikator), 'id') || a.id - b.id);
    for (const r of tanpaNomor) {
      while (terpakai.has(berikut)) berikut += 1;
      terpakai.add(berikut);
      hasil.set(r.id, berikut);
    }
  }
  return hasil;
}

/** Nama entitas untuk ditampilkan: bersih, atau bersih + bintang tingkatnya. */
export function tampilNama(nama: string, level: LevelRenaksi, penanda: boolean): string {
  const bersih = rapikanNamaEntitas(nama);
  if (!penanda || !bersih || bersih === nama.trim() && /^[\s*]+$/u.test(bersih)) return bersih;
  return `${bersih} ${bintangLevel(level)}`;
}

/** Indikator untuk ditampilkan: bersih, atau "(n) " + bersih + bintang tingkatnya. */
export function tampilIndikator(indikator: string, level: LevelRenaksi, nomor: number | null | undefined, penanda: boolean): string {
  const bersih = rapikanIndikator(indikator);
  if (!penanda || !bersih) return bersih;
  return `${nomor ? `(${nomor}) ` : ''}${bersih} ${bintangLevel(level)}`;
}
