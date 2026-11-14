// lib/kinerja/pagu-renaksi.ts — pagu RKO E-Anggaran dibandingkan dengan pagu sub kegiatan Rencana Aksi.
// MURNI, aman-klien. Konsep: docs/CONCEPT-renaksi-pagu-rko.md §5 (aturan) & Tahap B/C.
//
// Satu aturan untuk endpoint baca (Tahap B: pita di RKO & "Terpakai di RKO" di Data Entry) DAN pagar
// server Simpan RKO (Tahap C). Dua salinan = layar mengizinkan yang ditolak server (L78).
//
//   Untuk tiap sub kegiatan × sumber dana:
//     Σ pagu RKO (versi terbaru tiap tab sumber, tanpa baris dinol-kan, rekeningnya bersumber dana X)
//       ≤ Σ pagu berlaku Renaksi sumber X (semua indikator sub kegiatan itu)
//   plus pembanding TOTAL. Per sumber hanya bila seluruh pagu Renaksi sub itu sudah bersumber
//   ("tanpa sumber" bisa sumber apa saja — membandingkannya per sumber akan menuduh yang tidak salah).

import { kunciNamaRenaksi } from './asal-renaksi';
import { pickVersiAktif } from './versi';
import { jumlahPerSumber, kunciSumber, labelSumber, rapikanSumber, type Pagu, type PaguSubRenaksi } from '@/lib/renaksi/pagu';

export interface BarisRkoPagu {
  /** Tab sumber E-Anggaran (GAJI, BLUD, …) — bukan sumber dana. */
  tab: string;
  versi_tipe?: unknown;
  versi_seq?: unknown;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
  uraian_ssk: string | null;
  uraian: string;
  pagu: number | string;
  is_nullified?: unknown;
}

export interface RekeningSumberDana { tab: string; uraian_ssk: string | null; uraian: string; sumber_anggaran: string | null }

export interface AgregatRko { tab: string; program: string; kegiatan: string; subkegiatan: string; sumber: string; pagu: number }

export const kunciSub = (program: string | null, kegiatan: string | null, sub: string | null): string =>
  [program, kegiatan, sub].map(kunciNamaRenaksi).join('|');

/** Baris versi terbaru tiap tab. Calon versi dari SEMUA baris (A9: versi yang habis dinol-kan tetap calon). */
export function versiTerbaruPerTab<T extends BarisRkoPagu>(rows: readonly T[]): T[] {
  const perTab = new Map<string, T[]>();
  for (const r of rows) perTab.set(r.tab, [...(perTab.get(r.tab) ?? []), r]);
  const keluar: T[] = [];
  for (const rs of perTab.values()) {
    const v = pickVersiAktif(rs);
    if (!v) continue;
    keluar.push(...rs.filter(r => r.versi_tipe === v.versi_tipe && Number(r.versi_seq ?? 0) === Number(v.versi_seq ?? 0)));
  }
  return keluar;
}

const kunciRekening = (tab: string, ussk: string | null, uraian: string) => `${tab}\u0001${(ussk ?? '').trim()}\u0001${uraian.trim()}`;

/**
 * Pagu RKO per (tab, sub kegiatan, sumber dana). Sumber dana dari REKENING-nya lewat kunci Inject
 * (`uraian_ssk + uraian` per tab, kunci yang sama dengan Inject & penjalar Rekening). Tidak ada
 * rekening, atau rekening berkunci sama dengan sumber dana berbeda → '' (sumber belum diisi).
 */
export function agregatRko(rows: readonly BarisRkoPagu[], rekening: readonly RekeningSumberDana[]): AgregatRko[] {
  const sumberRek = new Map<string, string | null>();
  for (const r of rekening) {
    const k = kunciRekening(r.tab, r.uraian_ssk, r.uraian);
    const s = rapikanSumber(r.sumber_anggaran);
    const ada = sumberRek.get(k);
    if (ada === undefined) sumberRek.set(k, s);
    else if (kunciSumber(ada) !== kunciSumber(s)) sumberRek.set(k, '');
  }
  const peta = new Map<string, AgregatRko>();
  for (const r of rows) {
    if (r.is_nullified === true || r.is_nullified === 1 || r.is_nullified === '1') continue;
    const sumber = sumberRek.get(kunciRekening(r.tab, r.uraian_ssk, r.uraian)) ?? '';
    const k = `${r.tab}\u0001${kunciSub(r.program, r.kegiatan, r.subkegiatan)}\u0001${kunciSumber(sumber)}`;
    const ada = peta.get(k);
    if (ada) ada.pagu += Number(r.pagu) || 0;
    else peta.set(k, { tab: r.tab, program: r.program ?? '', kegiatan: r.kegiatan ?? '', subkegiatan: r.subkegiatan ?? '', sumber, pagu: Number(r.pagu) || 0 });
  }
  return [...peta.values()];
}

export interface BandingPaguSub {
  kunci: string;
  program: string; kegiatan: string; sub_kegiatan: string;
  /** null = sub kegiatan ada di Renaksi tapi pagunya belum diisi (tanpa batas). */
  renaksi: Pagu | null;
  rko: Pagu;
  perTab: { tab: string; nilai: number }[];
  /** Per sumber hanya dinilai bila seluruh pagu Renaksi sub ini sudah bersumber. */
  cekPerSumber: boolean;
  lebih: { sumber: string; nilai: number }[];
  lebihTotal: number;
  /** Renaksi − RKO (null bila Renaksi tanpa pagu). */
  sisa: number | null;
}

export interface HasilBandingPagu {
  sub: BandingPaguSub[];
  /** Sub kegiatan RKO yang tidak ada di Renaksi tahun itu — tidak diperiksa, hanya disebut. */
  diLuarRenaksi: { program: string; kegiatan: string; sub_kegiatan: string; rko: Pagu }[];
}

const nilaiSumber = (p: Pagu | null, s: string) => p?.perSumber.find(x => kunciSumber(x.sumber) === kunciSumber(s))?.nilai ?? 0;

export function bandingPaguRenaksi(renaksi: readonly PaguSubRenaksi[], rko: readonly AgregatRko[]): HasilBandingPagu {
  const rkoPer = new Map<string, AgregatRko[]>();
  for (const a of rko) {
    const k = kunciSub(a.program, a.kegiatan, a.subkegiatan);
    rkoPer.set(k, [...(rkoPer.get(k) ?? []), a]);
  }
  const sub: BandingPaguSub[] = [];
  const dikenal = new Set<string>();
  for (const r of renaksi) {
    const kunci = kunciSub(r.program, r.kegiatan, r.sub_kegiatan);
    if (dikenal.has(kunci)) continue;
    dikenal.add(kunci);
    const as = rkoPer.get(kunci) ?? [];
    const rkoPagu = jumlahPerSumber(as.map(a => ({ sumber: a.sumber, nilai: a.pagu })));
    const perTabPeta = new Map<string, number>();
    for (const a of as) perTabPeta.set(a.tab, (perTabPeta.get(a.tab) ?? 0) + a.pagu);
    const cekPerSumber = !!r.pagu && nilaiSumber(r.pagu, '') === 0;
    const lebih: { sumber: string; nilai: number }[] = [];
    if (cekPerSumber) {
      const semua = new Map<string, string>();
      for (const s of [...(r.pagu?.perSumber ?? []), ...rkoPagu.perSumber]) if (s.sumber) semua.set(kunciSumber(s.sumber), s.sumber);
      for (const s of semua.values()) {
        const n = nilaiSumber(rkoPagu, s) - nilaiSumber(r.pagu, s);
        if (n > 0) lebih.push({ sumber: s, nilai: n });
      }
    }
    sub.push({
      kunci, program: r.program, kegiatan: r.kegiatan, sub_kegiatan: r.sub_kegiatan,
      renaksi: r.pagu, rko: rkoPagu,
      perTab: [...perTabPeta].map(([tab, nilai]) => ({ tab, nilai })),
      cekPerSumber, lebih,
      lebihTotal: r.pagu ? Math.max(0, rkoPagu.total - r.pagu.total) : 0,
      sisa: r.pagu ? r.pagu.total - rkoPagu.total : null,
    });
  }
  const diLuarRenaksi = [...rkoPer].filter(([k]) => !dikenal.has(k)).map(([, as]) => ({
    program: as[0].program, kegiatan: as[0].kegiatan, sub_kegiatan: as[0].subkegiatan,
    rko: jumlahPerSumber(as.map(a => ({ sumber: a.sumber, nilai: a.pagu }))),
  }));
  return { sub, diLuarRenaksi };
}

export const melampaui = (b: BandingPaguSub): boolean => b.lebihTotal > 0 || b.lebih.length > 0;

/** "APBD lebih Rp 2.000.000 · total lebih Rp 1.000.000" — satu kalimat untuk pita, dialog, dan 409. */
export function kalimatLebih(b: BandingPaguSub): string {
  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const bagian = b.lebih.map(l => `${labelSumber(l.sumber)} lebih ${rp(l.nilai)}`);
  if (b.lebihTotal > 0) bagian.push(`total lebih ${rp(b.lebihTotal)}`);
  return bagian.join(' · ');
}
