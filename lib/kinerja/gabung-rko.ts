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

/** Satu baris apa adanya dari berkas: hanya nama, pagu, dan 12 nilai bulanan. */
export interface BarisRko {
  uraian: string;
  pagu:   number;
  months: SskMonths;
}

export type StatusRko = 'baru' | 'sama' | 'berubah' | 'kembar' | 'ditahan';

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
}

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

export function bandingkanRko(
  sskLama: SskRow[],
  rekening: RekeningRow[],
  berkas: BarisRko[],
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

  const terlihat = new Set<string>();
  return berkas.map(b => {
    const k = kunciUraian(b.uraian);
    const dasar = { asal: b, idxLama: null, lamaPagu: null, lamaTotal: null };

    if (terlihat.has(k)) return { ...dasar, hasil: null, status: 'kembar' as const, ikut: false };
    terlihat.add(k);

    const idx = petaSsk.get(k);
    if (idx !== undefined) {
      const lama = sskLama[idx];
      const hasil: SskRow = { ...lama, pagu: b.pagu, months: b.months, ...hitungTurunanRko(b.pagu, b.months) };
      const sama = lama.pagu === b.pagu && bulanSama(lama.months, b.months);
      return {
        asal: b, hasil, idxLama: idx, lamaPagu: lama.pagu, lamaTotal: lama.total,
        status: sama ? 'sama' as const : 'berubah' as const,
        ikut: !sama,
      };
    }

    const rek = petaRek.get(k);
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
 * yang TIDAK disebut berkas — bukan sekadar selisih jumlah, sebab berkas boleh
 * berisi baris baru sekaligus melewatkan baris lama.
 */
export function hilangKalauTimpa(lama: SskRow[], hasil: BarisImporRko[]): number {
  const disebut = new Set(hasil.filter(h => h.hasil).map(h => kunciUraian(h.asal.uraian)));
  return lama.filter(r => !disebut.has(kunciUraian(r.uraian))).length;
}
