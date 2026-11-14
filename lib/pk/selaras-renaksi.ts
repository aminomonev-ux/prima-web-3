// lib/pk/selaras-renaksi.ts — Master Program & Master Sasaran PK dibandingkan dengan Rencana Aksi.
//
// PURE & aman-klien. Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap D). Kedua master PK
// disimpan replace-all dari layar, jadi pembanding dihitung dari ISI LAYAR dan "Perbarui"
// berhenti di form (L78): yang menulis tetap tombol Simpan. Dokumen PK tidak disentuh.

import {
  bandingRenaksi, lengkapiIndukPilihan, type CatatanGanti, type EntriBanding, type HasilBanding,
} from '@/lib/kinerja/banding-renaksi';
import { kunciNamaRenaksi, type AsalMaster, type BarisRenaksi } from '@/lib/kinerja/asal-renaksi';
import { angkaTarget, satuanTarget } from '@/lib/shared/target-renaksi';
import { rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { anakMilikIndikator } from '@/lib/renaksi/rantai';

/** Kunci centang dialog — dipakai penyusun dialog DAN penerap, supaya tidak berbeda bunyi. */
export const kunciPilih = {
  ganti: (id: number) => `g${id}`,
  baru: (kunci: string) => `b${kunci}`,
  hilang: (id: number) => `h${id}`,
  tanda: (id: number) => `t${id}`,
  berubah: (idx: number) => `u${idx}`,
  pasangan: (idx: number) => `p${idx}`,
};

// ─── Master Program ──────────────────────────────────────────────────────────

export type LevelPk = 'program' | 'kegiatan' | 'subkegiatan';
export interface BarisProgramPk {
  program: string;
  kegiatan: string | null;
  subkegiatan: string | null;
  level: LevelPk;
  asal?: AsalMaster;
}

const levelBaris = (r: BarisProgramPk): LevelPk =>
  r.subkegiatan?.trim() ? 'subkegiatan' : r.kegiatan?.trim() ? 'kegiatan' : 'program';

/** Baris layar → entri pembanding. `id` = nomor baris + 1 (layar tidak memegang id DB). */
export function entriProgramPk(rows: readonly BarisProgramPk[]): EntriBanding[] {
  return rows.map((r, i) => {
    const lv = levelBaris(r);
    return {
      id: i + 1, tipe: lv,
      nama: lv === 'program' ? r.program : lv === 'kegiatan' ? (r.kegiatan ?? '') : (r.subkegiatan ?? ''),
      program_ref: lv === 'program' ? null : r.program,
      kegiatan_ref: lv === 'subkegiatan' ? r.kegiatan : null,
      subkegiatan_ref: null, asal: r.asal ?? 'MANUAL',
    };
  });
}

export function bandingProgramPk(
  rows: readonly BarisProgramPk[], renaksi: readonly BarisRenaksi[], catatan: readonly CatatanGanti[],
): HasilBanding {
  return bandingRenaksi(entriProgramPk(rows), renaksi, catatan);
}

/**
 * Pilihan dialog diterapkan ke ISI LAYAR. Ganti nama program membawa semua baris di bawahnya,
 * kegiatan membawa sub-nya (cermin Edit Master E-Anggaran); baru ditambah di akhir dengan
 * ejaan induk yang SUDAH ada di layar (beda huruf besar tidak melahirkan program kedua).
 * Baris yang berubah adalah objek baru — pemanggil menandainya belum tersimpan lewat identitas.
 */
export function terapkanSelarasProgram<T extends BarisProgramPk>(
  rows: readonly T[], h: HasilBanding, pilih: ReadonlySet<string>, buatBaris: (b: BarisProgramPk) => T,
): T[] {
  const out = [...rows];
  const ubah = (i: number, isi: Partial<BarisProgramPk>) => { out[i] = { ...out[i], ...isi }; };
  const urut = { program: 0, kegiatan: 1, subkegiatan: 2, sumber_anggaran: 3 } as const;
  const gantiP = new Map<string, string>();
  // Kegiatan yang diganti nama / dipindah: lokasi akhirnya (program, nama) — sub-nya mengikuti.
  const gantiK = new Map<string, [string, string]>();
  for (const g of [...h.gantiNama].filter(x => pilih.has(kunciPilih.ganti(x.id))).sort((a, b) => urut[a.tipe] - urut[b.tipe])) {
    if (g.tipe === 'program') {
      out.forEach((r, i) => { if (r.program === g.nama) ubah(i, { program: g.ke }); });
      gantiP.set(g.nama, g.ke);
    } else if (g.tipe === 'kegiatan') {
      const p = gantiP.get(g.program_ref ?? '') ?? g.program_ref;
      // Tahap H: pindah induk membawa semua baris kegiatan itu (termasuk sub-nya) ke program tujuan.
      const pBaru = g.program_ke ?? p ?? '';
      out.forEach((r, i) => { if (r.program === p && r.kegiatan === g.nama) ubah(i, { kegiatan: g.ke, program: pBaru }); });
      gantiK.set(`${p}\u0001${g.nama}`, [pBaru, g.ke]);
    } else {
      const pAsal = gantiP.get(g.program_ref ?? '') ?? g.program_ref ?? '';
      const [p, kg] = gantiK.get(`${pAsal}\u0001${g.kegiatan_ref}`) ?? [pAsal, g.kegiatan_ref ?? ''];
      out.forEach((r, i) => {
        if (r.program === p && r.kegiatan === kg && r.subkegiatan === g.nama) {
          ubah(i, { subkegiatan: g.ke, program: g.program_ke ?? p, kegiatan: g.kegiatan_ke ?? kg });
        }
      });
    }
  }
  for (const e of h.hilang) if (pilih.has(kunciPilih.hilang(e.id))) ubah(e.id - 1, { asal: 'MANUAL' });
  for (const e of h.belumBertanda) if (pilih.has(kunciPilih.tanda(e.id))) ubah(e.id - 1, { asal: 'RENAKSI' });

  const pilihBaru = lengkapiIndukPilihan(h.baru.filter(b => pilih.has(kunciPilih.baru(b.kunci))).map(b => b.kunci), h.baru);
  const ejaan = new Map<string, string>();
  for (const r of out) {
    ejaan.set(kunciNamaRenaksi(r.program), r.program);
    if (r.kegiatan) ejaan.set(`${kunciNamaRenaksi(r.program)}|${kunciNamaRenaksi(r.kegiatan)}`, r.kegiatan);
  }
  const pakaiEjaan = (k: string, v: string) => ejaan.get(k) ?? v;
  // Master Program PK tidak memuat sumber dana (PK punya daftar sumbernya sendiri).
  for (const b of [...h.baru].filter(x => pilihBaru.has(x.kunci)).sort((a, c) => urut[a.tipe] - urut[c.tipe])) {
    if (b.tipe === 'sumber_anggaran') continue;
    const p = b.tipe === 'program' ? b.nama : pakaiEjaan(kunciNamaRenaksi(b.program_ref), b.program_ref ?? '');
    const kg = b.tipe === 'kegiatan' ? b.nama
      : b.tipe === 'subkegiatan' ? pakaiEjaan(`${kunciNamaRenaksi(p)}|${kunciNamaRenaksi(b.kegiatan_ref)}`, b.kegiatan_ref ?? '') : null;
    out.push(buatBaris({ program: p, kegiatan: kg, subkegiatan: b.tipe === 'subkegiatan' ? b.nama : null, level: b.tipe, asal: 'RENAKSI' }));
    ejaan.set(kunciNamaRenaksi(p), ejaan.get(kunciNamaRenaksi(p)) ?? p);
    if (kg) ejaan.set(`${kunciNamaRenaksi(p)}|${kunciNamaRenaksi(kg)}`, ejaan.get(`${kunciNamaRenaksi(p)}|${kunciNamaRenaksi(kg)}`) ?? kg);
  }
  return out;
}

// ─── Master Sasaran ──────────────────────────────────────────────────────────

export interface BarisSasaranPk {
  program: string;
  indikator_program: string | null;
  target_program: string | null;
  satuan_program?: string | null;
  kegiatan: string | null;
  indikator_kegiatan: string | null;
  target_kegiatan: string | null;
  satuan_kegiatan?: string | null;
  subkegiatan: string | null;
  indikator_subkegiatan: string | null;
  target_subkegiatan: string | null;
  satuan_subkegiatan?: string | null;
  asal?: AsalMaster;
}

/** Baris `rencana_aksi` yang dibaca Import Renaksi Master Sasaran. */
export interface RaSasaranSrc {
  level: string;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
  satuan: string;
  /** DECIMAL — mysql2 memulangkannya sebagai string. */
  target_tahunan: string | number;
  /** Tautan indikator induk (docs/CONCEPT-renaksi-pilih-indikator.md). Tanpa keduanya = belum tertaut. */
  id?: number;
  induk_indikator_id?: number | null;
}

const KOSONG_KEGIATAN = { kegiatan: null, indikator_kegiatan: null, target_kegiatan: null, satuan_kegiatan: null };
const KOSONG_SUB = { subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null, satuan_subkegiatan: null };

function bagianProgram(r: RaSasaranSrc) {
  return {
    program: rapikanNamaEntitas(r.outcome_program ?? r.program),
    indikator_program: rapikanIndikator(r.indikator),
    target_program: angkaTarget(String(r.target_tahunan)),
    satuan_program: satuanTarget(r.satuan) || null,
  };
}
function bagianKegiatan(r: RaSasaranSrc) {
  const nama = r.outcome_kegiatan ?? r.kegiatan;
  return {
    kegiatan: nama == null ? null : rapikanNamaEntitas(nama),
    indikator_kegiatan: rapikanIndikator(r.indikator),
    target_kegiatan: angkaTarget(String(r.target_tahunan)),
    satuan_kegiatan: satuanTarget(r.satuan) || null,
  };
}
function bagianSub(r: RaSasaranSrc) {
  const nama = r.outcome_sub_kegiatan ?? r.sub_kegiatan;
  return {
    subkegiatan: nama == null ? null : rapikanNamaEntitas(nama),
    indikator_subkegiatan: rapikanIndikator(r.indikator),
    target_subkegiatan: angkaTarget(String(r.target_tahunan)),
    satuan_subkegiatan: satuanTarget(r.satuan) || null,
  };
}

/**
 * Baris Master Sasaran dari Renaksi — SATU penyusun untuk tombol Import Renaksi DAN pembanding.
 * Satu baris per daun terdalam: program → kegiatan (program sama) → sub (program + kegiatan sama).
 *
 * Tiap baris = satu PASANGAN indikator. Kegiatan/sub yang sudah tertaut ke indikator induknya
 * hanya dipasangkan dengan indikator itu; yang belum tertaut dipasangkan dengan SEMUA indikator
 * induknya (cara lama — tanpa tautan, pasangan yang benar memang tidak diketahui). Cara lama
 * itulah yang membuat 42 indikator Renaksi 2026 jadi 117 baris (program 4 indikator × 6
 * indikator kegiatan = 24 pasangan, dst.).
 */
export function susunSasaranRenaksi(raRows: readonly RaSasaranSrc[]): BarisSasaranPk[] {
  const programs = raRows.filter(r => r.level === 'program');
  const kegiatans = raRows.filter(r => r.level === 'kegiatan');
  const subKegs = raRows.filter(r => r.level === 'sub-kegiatan');
  const idSaudara = (rows: readonly RaSasaranSrc[], sama: (r: RaSasaranSrc) => boolean) =>
    new Set(rows.filter(sama).map(r => Number(r.id)).filter(Number.isFinite));
  const milik = (anak: RaSasaranSrc, induk: RaSasaranSrc, saudara: ReadonlySet<number>) =>
    induk.id == null || anakMilikIndikator(anak.induk_indikator_id, induk.id, saudara);
  const out: BarisSasaranPk[] = [];
  for (const prog of programs) {
    const saudaraP = idSaudara(programs, p => p.program === prog.program);
    const childKegs = kegiatans.filter(k => k.program === prog.program && milik(k, prog, saudaraP));
    if (childKegs.length === 0) { out.push({ ...bagianProgram(prog), ...KOSONG_KEGIATAN, ...KOSONG_SUB }); continue; }
    for (const keg of childKegs) {
      const saudaraK = idSaudara(kegiatans, k => k.program === keg.program && k.kegiatan === keg.kegiatan);
      const childSubs = subKegs.filter(s => s.program === prog.program && s.kegiatan === keg.kegiatan && milik(s, keg, saudaraK));
      if (childSubs.length === 0) { out.push({ ...bagianProgram(prog), ...bagianKegiatan(keg), ...KOSONG_SUB }); continue; }
      for (const sub of childSubs) out.push({ ...bagianProgram(prog), ...bagianKegiatan(keg), ...bagianSub(sub) });
    }
  }
  return out;
}

const kunciInd = (s: string | null | undefined) => rapikanIndikator(s ?? '').toLowerCase();

/**
 * Baris Master Sasaran yang tingkat terdalamnya (nama + indikator) ada di Renaksi. Cermin SQL:
 * isi awal docs/migrations/migration-pk-asal.sql (diuji berdampingan).
 */
export function sasaranAdaDiRenaksi(r: BarisSasaranPk, raRows: readonly RaSasaranSrc[]): boolean {
  const [level, nama, ind]: [string, string | null, string | null] = r.subkegiatan?.trim()
    ? ['sub-kegiatan', r.subkegiatan, r.indikator_subkegiatan]
    : r.kegiatan?.trim() ? ['kegiatan', r.kegiatan, r.indikator_kegiatan]
    : ['program', r.program, r.indikator_program];
  return raRows.some(x => {
    if (x.level !== level) return false;
    const n = level === 'program' ? (x.outcome_program ?? x.program)
      : level === 'kegiatan' ? (x.outcome_kegiatan ?? x.kegiatan) : (x.outcome_sub_kegiatan ?? x.sub_kegiatan);
    return kunciNamaRenaksi(n) === kunciNamaRenaksi(nama) && kunciInd(x.indikator) === kunciInd(ind);
  });
}

export const KOLOM_SASARAN = [
  ['program', 'Sasaran program'], ['indikator_program', 'Indikator program'], ['target_program', 'Target program'], ['satuan_program', 'Satuan program'],
  ['kegiatan', 'Sasaran kegiatan'], ['indikator_kegiatan', 'Indikator kegiatan'], ['target_kegiatan', 'Target kegiatan'], ['satuan_kegiatan', 'Satuan kegiatan'],
  ['subkegiatan', 'Sasaran sub kegiatan'], ['indikator_subkegiatan', 'Indikator sub kegiatan'], ['target_subkegiatan', 'Target sub kegiatan'], ['satuan_subkegiatan', 'Satuan sub kegiatan'],
] as const satisfies readonly (readonly [keyof BarisSasaranPk, string])[];

const normKolom = (k: keyof BarisSasaranPk, v: unknown): string => {
  const s = String(v ?? '');
  if (k.startsWith('indikator_')) return kunciInd(s);
  // "Persen" yang diketik = "%" hasil Import (aturan satuanTarget). Target sudah ditulis
  // gaya Indonesia ("1.250") — tidak diurai ulang, cukup dirapikan spasinya.
  if (k.startsWith('satuan_')) return satuanTarget(s).toLowerCase();
  if (k.startsWith('target_')) return s.trim();
  return kunciNamaRenaksi(s);
};
const kolomBeda = (a: BarisSasaranPk, b: BarisSasaranPk) =>
  KOLOM_SASARAN.filter(([k]) => normKolom(k, a[k]) !== normKolom(k, b[k])).map(([, label]) => label);
const sidik = (r: BarisSasaranPk) => KOLOM_SASARAN.map(([k]) => normKolom(k, r[k])).join('\u0001');
const kunciNamaSasaran = (r: BarisSasaranPk) => [r.program, r.kegiatan, r.subkegiatan].map(kunciNamaRenaksi).join('|');
const indTerdalam = (r: BarisSasaranPk) => kunciInd(r.subkegiatan?.trim() ? r.indikator_subkegiatan : r.kegiatan?.trim() ? r.indikator_kegiatan : r.indikator_program);

export interface ItemSasaranBerubah { idx: number; ke: BarisSasaranPk; kolom: string[] }
export interface HasilSasaran {
  /** Baris ber-asal Renaksi yang isinya kini berbeda dari Renaksi. */
  berubah: ItemSasaranBerubah[];
  baru: { kunci: string; baris: BarisSasaranPk }[];
  hilang: number[];
  /** Ber-asal Renaksi, pasangan indikatornya tidak dibentuk lagi (tautan indikator induk). */
  pasanganLepas: number[];
  /** Baris manual yang ada di Renaksi; `kolom` kosong = isinya sama persis. */
  belumBertanda: ItemSasaranBerubah[];
}

export const jumlahPerubahanSasaran = (h: HasilSasaran) =>
  h.berubah.length + h.baru.length + h.hilang.length + h.pasanganLepas.length;

/**
 * Pasangan dicari bertahap: isi sama persis → nama + indikator terdalam sama → nama sama dan
 * masing-masing tinggal satu. Baris yang tidak berpasangan: milik Renaksi = "baru", ber-asal
 * Renaksi di layar = "tidak ada lagi". `aktif(i)` = baris yang tidak ditandai hapus.
 */
export function bandingSasaranPk(
  rows: readonly BarisSasaranPk[], renaksi: readonly BarisSasaranPk[], aktif: (i: number) => boolean = () => true,
): HasilSasaran {
  const sisaRa = renaksi.map((b, i) => ({ b, i }));
  const ambil = (cocok: (b: BarisSasaranPk) => boolean) => {
    const j = sisaRa.findIndex(x => cocok(x.b));
    return j < 0 ? null : sisaRa.splice(j, 1)[0].b;
  };
  const idxAktif = rows.map((_, i) => i).filter(aktif);
  const tunggu: number[] = [];
  for (const i of idxAktif) if (!ambil(b => sidik(b) === sidik(rows[i]))) tunggu.push(i);

  const berubah: ItemSasaranBerubah[] = [];
  const belumBertanda: ItemSasaranBerubah[] = idxAktif
    .filter(i => rows[i].asal !== 'RENAKSI' && !tunggu.includes(i))
    .map(i => ({ idx: i, ke: rows[i], kolom: [] }));
  const lepas: number[] = [];
  for (const tahap of [1, 2] as const) {
    for (const i of [...tunggu]) {
      const r = rows[i];
      const kandidat = (b: BarisSasaranPk) => kunciNamaSasaran(b) === kunciNamaSasaran(r)
        && (tahap === 1 ? indTerdalam(b) === indTerdalam(r)
          : sisaRa.filter(x => kunciNamaSasaran(x.b) === kunciNamaSasaran(r)).length === 1
            && tunggu.filter(t => kunciNamaSasaran(rows[t]) === kunciNamaSasaran(r)).length === 1);
      const b = ambil(kandidat);
      if (!b) continue;
      tunggu.splice(tunggu.indexOf(i), 1);
      (r.asal === 'RENAKSI' ? berubah : belumBertanda).push({ idx: i, ke: b, kolom: kolomBeda(r, b) });
    }
  }
  // Ber-asal Renaksi, tak berpasangan, tapi nama + indikator terdalamnya MASIH ada di Renaksi:
  // pasangan indikator yang sudah tidak dibentuk lagi (Renaksi kini menautkan anak ke indikator
  // induk lain). Itu kelebihan baris, bukan entitas yang hilang — dipisah supaya bisa dihapus.
  const pasanganLepas: number[] = [];
  const masihAda = new Set(renaksi.map(b => `${kunciNamaSasaran(b)}\u0001${indTerdalam(b)}`));
  for (const i of tunggu) {
    if (rows[i].asal !== 'RENAKSI') continue;
    (masihAda.has(`${kunciNamaSasaran(rows[i])}\u0001${indTerdalam(rows[i])}`) ? pasanganLepas : lepas).push(i);
  }
  return {
    berubah, belumBertanda: belumBertanda.sort((a, b) => a.idx - b.idx),
    hilang: lepas, pasanganLepas,
    baru: sisaRa.map(x => ({ kunci: `r${x.i}`, baris: x.b })),
  };
}

/**
 * `hapus` = cara layar menandai baris untuk dihapus (berhenti di form — yang menghapus tetap
 * Simpan). Tanpa `hapus`, pasangan lepas yang dicentang hanya dilepas tandanya (jadi manual).
 */
export function terapkanSelarasSasaran<T extends BarisSasaranPk>(
  rows: readonly T[], h: HasilSasaran, pilih: ReadonlySet<string>, buatBaris: (b: BarisSasaranPk) => T,
  hapus?: (r: T) => T,
): T[] {
  const out = [...rows];
  for (const i of h.pasanganLepas) {
    if (pilih.has(kunciPilih.pasangan(i))) out[i] = hapus ? hapus(out[i]) : { ...out[i], asal: 'MANUAL' };
  }
  for (const x of h.berubah) if (pilih.has(kunciPilih.berubah(x.idx))) out[x.idx] = { ...out[x.idx], ...x.ke, asal: 'RENAKSI' };
  for (const x of h.belumBertanda) if (pilih.has(kunciPilih.tanda(x.idx))) out[x.idx] = { ...out[x.idx], ...x.ke, asal: 'RENAKSI' };
  for (const i of h.hilang) if (pilih.has(kunciPilih.hilang(i))) out[i] = { ...out[i], asal: 'MANUAL' };
  for (const b of h.baru) if (pilih.has(kunciPilih.baru(b.kunci))) out.push(buatBaris({ ...b.baris, asal: 'RENAKSI' }));
  return out;
}

export function kalimatSpandukPk(bagian: { berganti?: number; pindah?: number; berubah?: number; baru: number; hilang: number; pasangan?: number }, tahun: string | number): string | null {
  const isi = [
    bagian.berganti ? `${bagian.berganti} berganti nama` : '',
    bagian.pindah ? `${bagian.pindah} pindah induk` : '',
    bagian.berubah ? `${bagian.berubah} isinya berubah` : '',
    bagian.baru ? `${bagian.baru} baru` : '',
    bagian.hilang ? `${bagian.hilang} tidak ada lagi` : '',
    bagian.pasangan ? `${bagian.pasangan} pasangan indikator tidak tertaut lagi` : '',
  ].filter(Boolean);
  return isi.length ? `Rencana Aksi ${tahun} berbeda dari isi layar ini: ${isi.join(', ')}.` : null;
}
