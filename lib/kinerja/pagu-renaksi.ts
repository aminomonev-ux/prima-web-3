// lib/kinerja/pagu-renaksi.ts — pagu RKO E-Anggaran dibandingkan dengan pagu sub kegiatan Rencana Aksi.
// MURNI, aman-klien. Konsep: docs/konsep/renaksi/CONCEPT-renaksi-pagu-rko.md §5 (aturan) & Tahap B/C.
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

/** Baris versi MURNI tiap tab — pasangan pagu murni Renaksi. Tab tanpa versi murni tidak menyumbang. */
export function versiMurniPerTab<T extends BarisRkoPagu>(rows: readonly T[]): T[] {
  return versiTerbaruPerTab(rows.filter(r => r.versi_tipe === 'MURNI'));
}

/** Tab yang versi terbarunya sudah PERUBAHAN. */
export function tabBerversiPerubahan(rows: readonly BarisRkoPagu[]): string[] {
  return [...new Set(versiTerbaruPerTab(rows).filter(r => r.versi_tipe === 'PERUBAHAN').map(r => r.tab))].sort();
}

const kunciRekening =(tab: string, ussk: string | null, uraian: string) => `${tab}\u0001${(ussk ?? '').trim()}\u0001${uraian.trim()}`;

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

// ─── Murni dengan murni, perubahan dengan perubahan ──────────────────────────
// docs/konsep/renaksi/CONCEPT-renaksi-rko-murni-perubahan.md. Renaksi mulai perubahan sekali setahun, RKO per tab;
// keduanya tidak harus bersamaan. Karena itu ada DUA pembanding, dan tiap simpanan dinilai dengan
// pembanding pasangannya (`pelanggaranSimpanan`).

export type Pembanding = 'murni' | 'perubahan';

export interface BahanBandingPagu {
  renaksiMurni: PaguSubRenaksi[];
  /** Perubahan ?? Murni — sama dengan `renaksiMurni` selama Renaksi belum memasuki anggaran perubahan. */
  renaksiBerlaku: PaguSubRenaksi[];
  renaksiPerubahan: boolean;
  /** Agregat RKO versi murni tiap tab. */
  rkoMurni: AgregatRko[];
  /** Agregat RKO versi terbaru tiap tab (tab yang belum perubahan = angka murninya). */
  rkoTerbaru: AgregatRko[];
  tabPerubahan: string[];
}

export interface HasilBandingDua {
  murni: HasilBandingPagu;
  perubahan: HasilBandingPagu;
  /** Pembanding perubahan dari tab yang SUDAH perubahan saja — yang menahan simpanan pagu perubahan Renaksi. */
  perubahanKetat: HasilBandingPagu;
  renaksiPerubahan: boolean;
  tabPerubahan: string[];
}

export function bandingDua(b: BahanBandingPagu): HasilBandingDua {
  const sudah = new Set(b.tabPerubahan);
  return {
    murni: bandingPaguRenaksi(b.renaksiMurni, b.rkoMurni),
    perubahan: bandingPaguRenaksi(b.renaksiBerlaku, b.rkoTerbaru),
    perubahanKetat: bandingPaguRenaksi(b.renaksiBerlaku, b.rkoTerbaru.filter(a => sudah.has(a.tab))),
    renaksiPerubahan: b.renaksiPerubahan,
    tabPerubahan: [...b.tabPerubahan],
  };
}

/** Belum ada yang memasuki anggaran perubahan: kedua pembanding sama persis. */
export const seragam = (h: Pick<HasilBandingDua, 'renaksiPerubahan' | 'tabPerubahan'>): boolean =>
  !h.renaksiPerubahan && h.tabPerubahan.length === 0;

/** Nama pembanding untuk kalimat di layar, 409, dan audit. */
export function labelPembanding(p: Pembanding, h: Pick<HasilBandingDua, 'renaksiPerubahan' | 'tabPerubahan'>): string {
  if (seragam(h)) return 'pagu Rencana Aksi';
  if (p === 'murni') return 'pagu murni Rencana Aksi';
  return h.renaksiPerubahan ? 'pagu perubahan Rencana Aksi' : 'pagu murni Rencana Aksi, untuk RKO perubahan';
}

/** RKO sudah perubahan sementara Renaksi belum — batasnya tetap pagu murni (keputusan §6 no. 1). */
export const kalimatBelumPerubahan = (tahun: number | string): string =>
  `Rencana Aksi ${tahun} belum memasuki anggaran perubahan, jadi RKO perubahan masih dibatasi pagu murni. `
  + 'Kalau pagunya memang naik, mulai anggaran perubahan di Rencana Aksi dan isi pagu barunya lebih dulu.';

/** Dialog "Buat Perubahan" RKO saat Renaksi belum memasuki anggaran perubahan. */
export const kalimatBelumPerubahanBuat = (tahun: number | string): string =>
  `Rencana Aksi ${tahun} belum memasuki anggaran perubahan. Sampai pagu perubahannya diisi di sana, `
  + 'pagu RKO perubahan tetap dibatasi pagu murni.';

/** Simpanan yang dipagari. Menentukan pembanding mana yang menahan (konsep §3). */
export type JenisSimpananPagu = 'rko-murni' | 'rko-perubahan' | 'rekening' | 'renaksi';

export type PelanggaranPagu = BandingPaguSub & { pembanding: Pembanding; label: string };

/**
 * Pelanggaran baru/memburuk yang MENAHAN simpanan ini:
 * - RKO versi murni → pembanding murni (pembanding perubahan hanya diberitahukan di layar);
 * - RKO versi perubahan → pembanding perubahan;
 * - Rekening → keduanya (sumber dana & rantai rekening berlaku untuk semua versi);
 * - Renaksi → pembanding murni, plus pembanding perubahan. Sesudah Renaksi memasuki anggaran
 *   perubahan, yang dipakai pembanding perubahan dari tab yang SUDAH perubahan saja: tab yang masih
 *   murni menyusul sesudah Renaksi, jadi menurunkan pagu perubahan di bawahnya tidak ditahan.
 */
export function pelanggaranSimpanan(
  sebelum: HasilBandingDua, sesudah: HasilBandingDua, jenis: JenisSimpananPagu,
): PelanggaranPagu[] {
  const beri = (p: Pembanding, bs: BandingPaguSub[]): PelanggaranPagu[] =>
    bs.map(b => ({ ...b, pembanding: p, label: labelPembanding(p, sesudah) }));
  if (seragam(sesudah)) return beri('perubahan', pelanggaranBaru(sebelum.perubahan, sesudah.perubahan));
  const murni = () => beri('murni', pelanggaranBaru(sebelum.murni, sesudah.murni));
  const perubahan = () => beri('perubahan', pelanggaranBaru(sebelum.perubahan, sesudah.perubahan));
  switch (jenis) {
    case 'rko-murni': return murni();
    case 'rko-perubahan': return perubahan();
    case 'rekening': return [...murni(), ...perubahan()];
    case 'renaksi':
      return [...murni(), ...(sesudah.renaksiPerubahan
        ? beri('perubahan', pelanggaranBaru(sebelum.perubahanKetat, sesudah.perubahanKetat))
        : perubahan())];
  }
}

// ─── "Terpakai di RKO" di Data Entry Renaksi ─────────────────────────────────

export interface TerpakaiRko {
  /** Belum ada yang memasuki anggaran perubahan — tampil satu baris seperti dulu. */
  seragam: boolean;
  murni: { rko: Pagu; lebih: string | null };
  berlaku: { rko: Pagu; lebih: string | null };
  /** Kelebihan dari tab yang SUDAH perubahan saja — inilah yang menahan Simpan pagu perubahan. */
  ketatLebih: string | null;
  /** Tab yang masih versi murni, dengan angkanya di sub kegiatan ini. */
  tabMasihMurni: { tab: string; nilai: number }[];
}

type SubNama = { program: string; kegiatan: string; sub_kegiatan: string };

function lebihSatu(sub: SubNama, pagu: Pagu | null, rko: Pagu): string | null {
  const b = bandingPaguRenaksi([{ ...sub, pagu }], rko.perSumber.map(s => ({
    tab: '-', program: sub.program, kegiatan: sub.kegiatan, subkegiatan: sub.sub_kegiatan, sumber: s.sumber, pagu: s.nilai,
  }))).sub[0];
  return b && melampaui(b) ? kalimatLebih(b) : null;
}

const PAGU_NOL: Pagu = { total: 0, perSumber: [] };

/**
 * Pagu di LAYAR (murni & berlaku, isian belum tersimpan ikut) dibandingkan dengan RKO sub kegiatan
 * ini dari server — aturan sama dengan pagar Simpan (`pelanggaranSimpanan`). null = RKO tidak memakai
 * sub kegiatan ini sama sekali.
 */
export function terpakaiRkoSub(a: {
  sub: SubNama;
  layarMurni: Pagu | null;
  layarBerlaku: Pagu | null;
  rkoMurni?: BandingPaguSub;
  rkoBerlaku?: BandingPaguSub;
  rkoKetat?: BandingPaguSub;
  renaksiPerubahan: boolean;
  tabPerubahan: readonly string[];
}): TerpakaiRko | null {
  const murni = a.rkoMurni?.rko ?? PAGU_NOL;
  const berlaku = a.rkoBerlaku?.rko ?? PAGU_NOL;
  if (murni.total === 0 && berlaku.total === 0) return null;
  const sudah = new Set(a.tabPerubahan);
  return {
    seragam: seragam({ renaksiPerubahan: a.renaksiPerubahan, tabPerubahan: [...a.tabPerubahan] }),
    murni: { rko: murni, lebih: lebihSatu(a.sub, a.layarMurni, murni) },
    berlaku: { rko: berlaku, lebih: lebihSatu(a.sub, a.layarBerlaku, berlaku) },
    ketatLebih: a.rkoKetat ? lebihSatu(a.sub, a.layarBerlaku, a.rkoKetat.rko) : null,
    tabMasihMurni: (a.rkoBerlaku?.perTab ?? []).filter(t => !sudah.has(t.tab) && t.nilai !== 0),
  };
}

/** "GAJI, BLUD, dan OBAT" */
export function gabungNama(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  if (xs.length === 2) return `${xs[0]} dan ${xs[1]}`;
  return `${xs.slice(0, -1).join(', ')}, dan ${xs[xs.length - 1]}`;
}

/** Catatan penjelas di 409/dialog: ada pelanggaran perubahan padahal Renaksi belum perubahan. */
export const catatanPelanggaran = (p: readonly PelanggaranPagu[], h: HasilBandingDua, tahun: number | string): string | null =>
  !seragam(h) && !h.renaksiPerubahan && p.some(x => x.pembanding === 'perubahan') ? kalimatBelumPerubahan(tahun) : null;

// ─── Pagar Simpan (Tahap C/D) ────────────────────────────────────────────────

/** Alasan meneruskan simpanan yang melampaui (keputusan pemilik §2 no. 2 & 4) — tercatat di audit. */
export const ALASAN_PAGU_MIN = 10;
export const PANJANG_ALASAN_PAGU = 300;
export const alasanPaguSah = (s: string | null | undefined): boolean => (s ?? '').trim().length >= ALASAN_PAGU_MIN;

/**
 * Sub kegiatan yang MENJADI melampaui, atau kelebihannya BERTAMBAH, karena simpanan ini. Yang sudah
 * melampaui sebelumnya dan tidak memburuk tidak menahan apa pun — kalau tidak, satu sub yang lewat
 * (mis. pagu Renaksi telat diperbarui) mengunci semua simpanan tab itu walau barisnya tidak disentuh.
 */
export function pelanggaranBaru(sebelum: HasilBandingPagu, sesudah: HasilBandingPagu): BandingPaguSub[] {
  const lama = new Map(sebelum.sub.map(b => [b.kunci, b]));
  return sesudah.sub.filter(b => {
    if (!melampaui(b)) return false;
    const s = lama.get(b.kunci);
    if (!s || !melampaui(s)) return true;
    if (b.lebihTotal > s.lebihTotal) return true;
    return b.lebih.some(l => l.nilai > (s.lebih.find(x => kunciSumber(x.sumber) === kunciSumber(l.sumber))?.nilai ?? 0));
  });
}

export interface PelanggaranRingkas { program: string; kegiatan: string; sub_kegiatan: string; kalimat: string }

/** "melebihi pagu murni Rencana Aksi: APBD lebih Rp 2.000.000" — label pembanding + kelebihannya. */
export const kalimatPelanggaran = (b: BandingPaguSub & { label?: string }): string =>
  `melebihi ${b.label ?? 'pagu Rencana Aksi'}: ${kalimatLebih(b)}`;

/** Bentuk yang dikirim ke layar (tanpa rincian rekening). */
export const ringkasPelanggaran = (p: readonly (BandingPaguSub & { label?: string })[]): PelanggaranRingkas[] =>
  p.map(b => ({ program: b.program, kegiatan: b.kegiatan, sub_kegiatan: b.sub_kegiatan, kalimat: kalimatPelanggaran(b) }));

/** "APBD lebih Rp 2.000.000 · total lebih Rp 1.000.000" — satu kalimat untuk pita, dialog, dan 409. */
export function kalimatLebih(b: BandingPaguSub): string {
  const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const bagian = b.lebih.map(l => `${labelSumber(l.sumber)} lebih ${rp(l.nilai)}`);
  if (b.lebihTotal > 0) bagian.push(`total lebih ${rp(b.lebihTotal)}`);
  return bagian.join(' · ');
}
