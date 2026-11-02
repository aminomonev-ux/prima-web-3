// lib/kinerja/gabung-rko.ts — otak Import RKO (tab SSK) E-Anggaran.
//
// PURE: tidak menyentuh berkas, DB, maupun React. Dipakai modal impor, tab SSK,
// dan uji regresi — jadi yang diuji benar-benar logika yang dipakai tombolnya.
//
// Berkas RKO hanya membawa `Uraian`, sedangkan satu baris RKO di aplikasi dikenali
// dari `Uraian SSK` + `Uraian` dan membawa hierarki program/kegiatan/sub kegiatan.
// Yang kurang itu diambil dari tabel Rekening sumber yang sama — bahan yang persis
// dipakai tombol "Inject Rekening". Baris yang tidak punya pasangan di Rekening
// DITAHAN: memasukkannya tanpa Uraian SSK memutus kaitannya ke Rekening & Realisasi,
// dan menebak pasangannya (mis. satu baris RKO yang menggabung sepuluh rekening
// gaji) berarti mengarang aturan pembagian yang tidak ada di berkas mana pun.

import { MONTHS_KEYS } from '@/app/(dashboard)/kinerja/_utils';
import type { SskRow, SskMonths, MonthKey, RekeningRow } from '@/app/(dashboard)/kinerja/_types';

/** Satu baris apa adanya dari berkas: nama, pagu, 12 nilai bulanan, dan kode bila ada. */
export interface BarisRko {
  uraian: string;
  pagu:   number;
  months: SskMonths;
  /** Kode rekening dari berkas — hanya keterangan; RKO di aplikasi tidak menyimpan kode. */
  kode?:  string;
}

/**
 * Letak kolom yang dipakai pembaca berkas — ditebak dari istilah judul, atau dipaksa
 * pemakai lewat panel pemetaan di modal. Indeks 0-based; `bulan` urut Jan…Des.
 */
export interface PetaRko {
  sheet:  string;
  header: number;
  /** Judul dua baris (mis. "Target Bulanan" di atas Jan…Des). */
  dua:    boolean;
  uraian: number;
  kode:   number | null;
  pagu:   number | null;
  bulan:  (number | null)[];
}

export type StatusRko = 'baru' | 'sama' | 'berubah' | 'kembar' | 'ditahan';

/**
 * Bagaimana baris berkas menemukan baris RKO-nya: nama persis sama, dipilih pemakai,
 * atau SEMUA kata nama berkas ada di tepat satu nama RKO ("saran" — ditandai di layar).
 */
export type CaraCocok = 'persis' | 'pilihan' | 'kata';

export interface BarisImporRko {
  /** Baris siap pakai — null untuk 'ditahan' dan 'kembar'. */
  hasil:      SskRow | null;
  asal:       BarisRko;
  status:     StatusRko;
  /** Posisi baris RKO lama yang cocok — hanya untuk 'sama' dan 'berubah'. */
  idxLama:    number | null;
  lamaPagu:   number | null;
  lamaTotal:  number | null;
  ikut:       boolean;
  cara:       CaraCocok | null;
}

/** Indeks baris berkas → indeks baris RKO pilihan pemakai; `null` = jangan dipasangkan. */
export type PasanganRko = Record<number, number | null>;

export interface RingkasRko {
  baru: number; sama: number; berubah: number; kembar: number; ditahan: number;
}

const rapikan = (v: string | null | undefined): string => (v ?? '').replace(/\s+/g, ' ').trim();
export const kunciUraian = (v: string | null | undefined): string => rapikan(v).toLowerCase();

/**
 * Persentase bulanan, total, dan persentase total — SELALU dihitung, tidak pernah
 * dibaca dari berkas. Ketiganya turunan dari pagu + nilai bulanan, dan aplikasi
 * sudah menghitungnya sendiri tiap kali sel diketik; mengimpornya berarti punya
 * dua sumber kebenaran untuk angka yang sama. Rumusnya sama persis dengan yang
 * dipakai `updateSskPagu`/`updateSskMonth` di SskTab — keduanya memanggil ini.
 */
export function hitungTurunanRko(pagu: number, months: SskMonths): Pick<SskRow, 'months_pct' | 'total' | 'total_pct'> {
  const months_pct = MONTHS_KEYS.reduce((acc, m) => {
    acc[m] = pagu > 0 ? Math.round(((months[m] || 0) / pagu) * 10000) / 100 : 0;
    return acc;
  }, {} as SskMonths);
  const total = MONTHS_KEYS.reduce((s, m) => s + (months[m] || 0), 0);
  return { months_pct, total, total_pct: pagu > 0 ? Math.round((total / pagu) * 10000) / 100 : 0 };
}

const bulanSama = (a: SskMonths, b: SskMonths): boolean =>
  MONTHS_KEYS.every((m: MonthKey) => (a[m] || 0) === (b[m] || 0));

/** Kata-kata sebuah nama: huruf kecil, dipecah di tanda baca ("PPh/Tunjangan" = dua kata). */
export function kataUraian(v: string | null | undefined): Set<string> {
  return new Set(kunciUraian(v).split(/[^a-z0-9]+/).filter(Boolean));
}

const terkandung = (a: Set<string>, b: Set<string>): boolean => a.size > 0 && [...a].every(k => b.has(k));

/**
 * Bertingkat, dari yang paling pasti — setiap baris RKO hanya boleh dipakai SATU baris berkas:
 *   1. nama persis sama;
 *   2. pilihan pemakai (`pasangan`) — hanya ke baris yang belum dipakai tingkat 1;
 *   3. nama persis ada di tabel Rekening tapi belum di RKO → baris BARU (bukan ditebak ke baris lain);
 *   4. "kata": semua kata nama berkas ada di tepat SATU nama RKO yang belum dipakai. Diulang:
 *      begitu "Tunjangan Fungsional Umum" memakai barisnya, "Tunjangan Fungsional" tinggal
 *      punya satu calon. Dua baris berkas berebut satu calon = tidak ada yang dipasangkan.
 *      Kata pembeda (PNS/PPPK) tidak pernah dibuang — itulah yang membuat calonnya tunggal.
 * Yang tersisa ditahan; pemakai memilih pasangannya sendiri (`calonRko`). Semua pasangan
 * menunjuk baris RKO yang SUDAH ada, jadi canonical_id — dan realisasi yang terikat
 * padanya — tidak pernah putus. CONCEPT-kinerja-impor-rko-istilah.md §3.
 */
export function bandingkanRko(
  sskLama: SskRow[],
  rekening: RekeningRow[],
  berkas: BarisRko[],
  pasangan: PasanganRko = {},
): BarisImporRko[] {
  const petaSsk = new Map<string, number>();
  sskLama.forEach((r, i) => {
    const k = kunciUraian(r.uraian);
    if (!petaSsk.has(k)) petaSsk.set(k, i);
  });
  const petaRek = new Map<string, RekeningRow>();
  for (const r of rekening) {
    const k = kunciUraian(r.uraian);
    if (k && !petaRek.has(k)) petaRek.set(k, r);
  }

  const kembar = new Set<number>();
  const terlihat = new Set<string>();
  berkas.forEach((b, i) => {
    const k = kunciUraian(b.uraian);
    if (terlihat.has(k)) kembar.add(i); else terlihat.add(k);
  });

  const cocok = new Map<number, { idx: number; cara: CaraCocok }>();
  const dipakai = new Set<number>();
  berkas.forEach((b, i) => {
    if (kembar.has(i)) return;
    const idx = petaSsk.get(kunciUraian(b.uraian));
    if (idx !== undefined) { cocok.set(i, { idx, cara: 'persis' }); dipakai.add(idx); }
  });
  for (const [kunci, idx] of Object.entries(pasangan)) {
    const i = Number(kunci);
    if (idx === null || kembar.has(i) || cocok.has(i) || !berkas[i] || !sskLama[idx] || dipakai.has(idx)) continue;
    cocok.set(i, { idx, cara: 'pilihan' });
    dipakai.add(idx);
  }

  const kataLama = sskLama.map(r => kataUraian(r.uraian));
  let sisa = berkas.map((_, i) => i).filter(i =>
    !kembar.has(i) && !cocok.has(i) && pasangan[i] !== null && !petaRek.has(kunciUraian(berkas[i].uraian)));
  for (;;) {
    const tunggal = new Map<number, number[]>();   // calon → baris berkas yang hanya punya calon itu
    for (const i of sisa) {
      const kb = kataUraian(berkas[i].uraian);
      const calon = kataLama.flatMap((kl, idx) => (!dipakai.has(idx) && terkandung(kb, kl) ? [idx] : []));
      if (calon.length === 1) tunggal.set(calon[0], [...(tunggal.get(calon[0]) ?? []), i]);
    }
    let maju = false;
    for (const [idx, peminat] of tunggal) {
      if (peminat.length !== 1) continue;
      cocok.set(peminat[0], { idx, cara: 'kata' });
      dipakai.add(idx);
      maju = true;
    }
    if (!maju) break;
    sisa = sisa.filter(i => !cocok.has(i));
  }

  return berkas.map((b, i) => {
    const dasar = { asal: b, idxLama: null, lamaPagu: null, lamaTotal: null, cara: null };
    if (kembar.has(i)) return { ...dasar, hasil: null, status: 'kembar' as const, ikut: false };

    const c = cocok.get(i);
    if (c) {
      const lama = sskLama[c.idx];
      const hasil: SskRow = { ...lama, pagu: b.pagu, months: b.months, ...hitungTurunanRko(b.pagu, b.months) };
      const sama = lama.pagu === b.pagu && bulanSama(lama.months, b.months);
      return {
        asal: b, hasil, idxLama: c.idx, lamaPagu: lama.pagu, lamaTotal: lama.total, cara: c.cara,
        status: sama ? 'sama' as const : 'berubah' as const,
        ikut: !sama,
      };
    }

    const rek = pasangan[i] === null ? undefined : petaRek.get(kunciUraian(b.uraian));
    if (!rek) return { ...dasar, hasil: null, status: 'ditahan' as const, ikut: false };

    const hasil: SskRow = {
      uraian_ssk:  rek.uraian_ssk  || '',
      uraian:      rapikan(b.uraian),
      program:     rek.program     || '',
      kegiatan:    rek.kegiatan    || '',
      subkegiatan: rek.subkegiatan || '',
      pagu:        b.pagu,
      months:      b.months,
      ...hitungTurunanRko(b.pagu, b.months),
    };
    return { ...dasar, hasil, status: 'baru' as const, ikut: true };
  });
}

/**
 * Calon pasangan untuk satu baris berkas: baris RKO yang belum dipakai baris berkas LAIN,
 * diurutkan dari kemiripan kata (Jaccard) tertinggi. Dipakai pilihan "Masuk ke" di modal.
 */
export function calonRko(sskLama: SskRow[], hasil: BarisImporRko[], iBerkas: number): { idx: number; uraian: string; skor: number }[] {
  const dipakaiLain = new Set(hasil.flatMap((h, j) => (j !== iBerkas && h.idxLama !== null ? [h.idxLama] : [])));
  const kb = kataUraian(hasil[iBerkas]?.asal.uraian);
  return sskLama
    .map((r, idx) => {
      const kl = kataUraian(r.uraian);
      const irisan = [...kb].filter(k => kl.has(k)).length;
      const gabung = new Set([...kb, ...kl]).size;
      return { idx, uraian: r.uraian, skor: gabung ? irisan / gabung : 0 };
    })
    .filter(c => !dipakaiLain.has(c.idx))
    .sort((a, b) => b.skor - a.skor || a.uraian.localeCompare(b.uraian));
}

/**
 * Berkas berlabel "ribuan" ternyata bisa berisi rupiah penuh — label tidak dipercaya;
 * yang dibandingkan ANGKANYA dengan pagu RKO yang dipasangkan. True bila mayoritas baris
 * yang terpasang kira-kira seperseribu pagu lamanya. Tidak pernah mengalikan sendiri.
 */
export function dugaSkalaRibuan(hasil: BarisImporRko[]): boolean {
  const rasio = hasil
    .filter(h => h.idxLama !== null && (h.lamaPagu ?? 0) > 0 && h.asal.pagu > 0)
    .map(h => h.asal.pagu / (h.lamaPagu as number));
  if (rasio.length === 0) return false;
  return rasio.filter(r => r >= 1 / 2000 && r <= 1 / 500).length / rasio.length >= 0.6;
}

export function kalikanBaris(rows: BarisRko[], faktor: number): BarisRko[] {
  return rows.map(r => ({
    ...r,
    pagu: r.pagu * faktor,
    months: MONTHS_KEYS.reduce((acc, m) => { acc[m] = (r.months[m] || 0) * faktor; return acc; }, {} as SskMonths),
  }));
}

export function ringkasRko(hasil: BarisImporRko[]): RingkasRko {
  const r: RingkasRko = { baru: 0, sama: 0, berubah: 0, kembar: 0, ditahan: 0 };
  for (const h of hasil) r[h.status]++;
  return r;
}

/** Mode Tambahkan: isi lama dipertahankan, hanya yang dicentang yang mengubahnya. */
export function terapkanTambahRko(lama: SskRow[], hasil: BarisImporRko[]): SskRow[] {
  const out = [...lama];
  for (const h of hasil) {
    if (!h.ikut || !h.hasil) continue;
    if (h.status === 'baru') out.push(h.hasil);
    else if (h.status === 'berubah' && h.idxLama !== null) out[h.idxLama] = h.hasil;
  }
  return out;
}

/**
 * Mode Timpa: isi tab = isi berkas. Centang per baris sengaja tidak berlaku
 * (cermin `terapkanTimpa` di gabung-rekening.ts). Baris 'ditahan' dan 'kembar'
 * tidak punya bentuk siap pakai, jadi ikut terbuang — dan itulah kenapa jumlah
 * baris yang akan HILANG wajib disebut sebelum tombolnya ditekan.
 */
export function terapkanTimpaRko(hasil: BarisImporRko[]): SskRow[] {
  return hasil.map(h => h.hasil).filter((r): r is SskRow => r !== null);
}

/**
 * Berapa baris tabel yang akan lenyap kalau mode Timpa dijalankan. Dihitung dari
 * baris lama yang TIDAK dipasangi baris berkas — bukan dari nama (pasangan bisa
 * lewat pilihan/kata, namanya beda) dan bukan sekadar selisih jumlah.
 */
export function hilangKalauTimpa(lama: SskRow[], hasil: BarisImporRko[]): number {
  const dipakai = new Set(hasil.flatMap(h => (h.hasil && h.idxLama !== null ? [h.idxLama] : [])));
  return lama.filter((_, i) => !dipakai.has(i)).length;
}
