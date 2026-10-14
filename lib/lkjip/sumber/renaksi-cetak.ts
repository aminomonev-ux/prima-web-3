// lib/lkjip/sumber/renaksi-cetak.ts — sumber "Renaksi · Cetak" (tabel menu Cetak Rencana Aksi).
//
// Baris & kolom memakai `buildCetakRows` + `cetakHeader` yang sama dengan layar, PDF, dan Excel
// Cetak Renaksi. Sakelar Target / Realisasi / Keduanya di menu Cetak berubah wujud jadi
// pengelompokan pilihan "Isi dari…" — semua kolom ditawarkan, orangnya yang memilih.

import type { RaLevel, RaRow } from '@/app/(dashboard)/rencana-aksi/_lib/types';
import {
  ALL_LEVELS, DEFAULT_CETAK_FILTER, buildCetakRows, cetakHeader, cetakRollupBase, type CetakFilter,
} from '@/app/(dashboard)/rencana-aksi/_lib/cetak-filter';
import type { HasilTarik, JenisKolomSumber, KolomSumber } from '../tautan';
import { GagalTarik, pesanDitolak, angkaDalam, type AmbilJson } from './umum';

export interface SetelanRenaksiCetak {
  tahun:    number;
  mode:     'hirarki' | 'flat';
  levels:   Record<RaLevel, boolean>;
  fTujuan:  string;
  fSasaran: string;
  fProgram: string;
}

export const LABEL_LEVEL: Record<RaLevel, string> = {
  tujuan: 'Tujuan', sasaran: 'Sasaran', program: 'Program', kegiatan: 'Kegiatan', 'sub-kegiatan': 'Sub Kegiatan',
};

/** Judul kolom yang lebih jelas di luar tabel Cetak (di sana "T"/"R" bernaung di bawah "TW1"). */
const LABEL: Record<string, string> = {
  rpjmd: 'Target RPJMD', tahunan: 'Target Tahunan', akhir: 'Realisasi Akhir Tahun', capaian: 'Capaian (%)',
  tw1t: 'Target TW I', tw2t: 'Target TW II', tw3t: 'Target TW III', tw4t: 'Target TW IV',
  tw1r: 'Realisasi TW I', tw2r: 'Realisasi TW II', tw3r: 'Realisasi TW III', tw4r: 'Realisasi TW IV',
};
const GRUP_TARGET = new Set(['rpjmd', 'tahunan', 'tw1t', 'tw2t', 'tw3t', 'tw4t']);
const GRUP_REALISASI = new Set(['tw1r', 'tw2r', 'tw3r', 'tw4r', 'akhir', 'capaian']);
const ANGKA = new Set(['no', ...GRUP_TARGET, 'tw1r', 'tw2r', 'tw3r', 'tw4r', 'akhir']);
const KEDALAMAN: Record<RaLevel, number> = { tujuan: 0, sasaran: 1, program: 2, kegiatan: 3, 'sub-kegiatan': 4 };

/** Semua kolom ditawarkan — sakelar Cetak dibuka penuh. */
const FILTER_KOLOM: Pick<CetakFilter, 'colMode' | 'showTw' | 'showOutcome' | 'showAnggaran'> =
  { colMode: 'both', showTw: true, showOutcome: true, showAnggaran: true };

export const KOLOM_BAWAAN_RENAKSI = ['indikator', 'tahunan', 'akhir', 'capaian'];

export function setelanRenaksiCetak(raw: unknown, tahunDokumen: number): SetelanRenaksiCetak {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lv = (o.levels && typeof o.levels === 'object' ? o.levels : {}) as Record<string, unknown>;
  const levels = Object.fromEntries(ALL_LEVELS.map(l => [l, typeof lv[l] === 'boolean' ? lv[l] : DEFAULT_CETAK_FILTER.levels[l]])) as Record<RaLevel, boolean>;
  const teks = (v: unknown) => (typeof v === 'string' ? v.slice(0, 255) : '');
  return {
    tahun:    angkaDalam(o.tahun, 2000, 2100, tahunDokumen),
    mode:     o.mode === 'flat' ? 'flat' : 'hirarki',
    levels,
    fTujuan:  teks(o.fTujuan),
    fSasaran: teks(o.fSasaran),
    fProgram: teks(o.fProgram),
  };
}

export function kolomRenaksi(): KolomSumber[] {
  return cetakHeader({ ...DEFAULT_CETAK_FILTER, ...FILTER_KOLOM }).flat.map(c => ({
    kunci: c.key,
    label: LABEL[c.key] ?? c.header,
    jenis: (c.money ? 'rp' : c.persen ? 'persen' : ANGKA.has(c.key) ? 'angka' : 'teks') as JenisKolomSumber,
    grup: c.money ? 'Anggaran' : GRUP_TARGET.has(c.key) ? 'Target (Data Entry)' : GRUP_REALISASI.has(c.key) ? 'Realisasi' : 'Identitas',
  }));
}

export interface PilihanFokus { tujuan: string[]; sasaran: string[]; program: string[] }

export async function tarikRenaksiCetak(s: SetelanRenaksiCetak, ambil: AmbilJson): Promise<HasilTarik & { fokus: PilihanFokus }> {
  const jawaban = await Promise.all(ALL_LEVELS.map(l => ambil(`/api/rencana-aksi?tahun=${s.tahun}&level=${l}`)));
  const gagal = jawaban.find(d => !d.ok);
  if (gagal && !gagal.ok) throw new GagalTarik(pesanDitolak('Rencana Aksi', gagal.status, gagal.message));
  const semua = jawaban.flatMap(d => ((d as { data?: RaRow[] }).data ?? []));

  const filter: CetakFilter = {
    ...DEFAULT_CETAK_FILTER, ...FILTER_KOLOM,
    mode: s.mode, levels: s.levels, fTujuan: s.fTujuan, fSasaran: s.fSasaran, fProgram: s.fProgram,
  };
  const hier = buildCetakRows(semua, filter);
  const rollup = cetakRollupBase(semua, filter);
  const kolomSpek = cetakHeader(filter).flat;

  const yatim = hier.filter(h => h.isOrphan).length;
  const capaianKosong = hier.filter(h => h.source.jenis === 'Progres Negatif'
    && kolomSpek.find(c => c.key === 'capaian')?.value(h, rollup) == null).length;
  const catatan = [
    yatim > 0 ? `${yatim} baris tidak terhubung ke induknya (nama induknya diubah) — tidak ikut rollup anggaran. Perbaiki di Data Entry Renaksi.` : null,
    capaianKosong > 0 ? `${capaianKosong} indikator Progres Negatif belum diisi realisasinya — Capaian-nya ditulis "—".` : null,
  ].filter((c): c is string => c !== null);

  const dipilih = ALL_LEVELS.filter(l => s.levels[l]);
  const levelTampil = `${s.mode === 'flat' ? 'daftar' : 'pohon'} ${dipilih.length === ALL_LEVELS.length
    ? 'semua level' : dipilih.map(l => LABEL_LEVEL[l]).join(', ')}`;
  const fokus = s.fProgram || s.fSasaran || s.fTujuan;
  const nama = (lvl: RaLevel) => [...new Set(semua.filter(r => r.level === lvl).map(r => r.program))].sort((a, b) => a.localeCompare(b));
  return {
    kolom: kolomRenaksi(),
    baris: hier.map(h => ({
      kunci: `ra:${h.source.id}`,
      label: h.source.indikator,
      indent: s.mode === 'hirarki' ? KEDALAMAN[h.source.level] : 0,
      sel: Object.fromEntries(kolomSpek.map(c => [c.key, c.value(h, rollup)])),
    })),
    catatan,
    ringkas: `Renaksi · Cetak ${s.tahun} · ${levelTampil}${fokus ? ` · fokus "${fokus}"` : ''}`,
    fokus: { tujuan: nama('tujuan'), sasaran: nama('sasaran'), program: nama('program') },
  };
}
