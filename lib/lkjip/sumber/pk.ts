// lib/lkjip/sumber/pk.ts — sumber "PK · Perjanjian Kinerja" (konsep §19.2).
//
// Satu tabel = SATU dokumen PK FINAL milik satu Pihak Pertama — modul PK tidak disentuh, dan
// penarikan memakai GET yang sama dengan layar PK (aturan aksesnya ikut: non-admin hanya
// melihat PK buatannya sendiri). Dokumennya DIPILIH ULANG tiap Perbarui dari tahun + Pihak
// Pertama + versi, bukan id yang mati: PK Perubahan yang terbit belakangan ikut terbawa.

import type { BarisSumber, HasilTarik, JenisKolomSumber, KolomSumber } from '../tautan';
import { GagalTarik, pesanDitolak, angkaDalam, type AmbilJson } from './umum';

export type TampilanPk = 'kinerja' | 'anggaran';
export interface SetelanPk {
  tahun:    number;
  /** `unit_pertama` dokumen PK; '' = belum dipilih. */
  pihak:    string;
  versi:    'berlaku' | 'murni';
  tampilan: TampilanPk;
}

const MODUL = 'Perjanjian Kinerja';
const kol = (kunci: string, label: string, jenis: JenisKolomSumber): KolomSumber => ({ kunci, label, jenis });
const KOLOM_KINERJA: KolomSumber[] = [
  kol('no', 'No', 'angka'), kol('tingkat', 'Tingkat', 'teks'), kol('unit', 'Unit Kerja', 'teks'),
  kol('program', 'Program', 'teks'), kol('kegiatan', 'Kegiatan', 'teks'), kol('subkegiatan', 'Sub Kegiatan', 'teks'),
  kol('uraian', 'Sasaran / Uraian', 'teks'), kol('indikator', 'Indikator', 'teks'), kol('target', 'Target', 'teks'),
];
const KOLOM_ANGGARAN: KolomSumber[] = [
  kol('no', 'No', 'angka'), kol('tingkat', 'Tingkat', 'teks'), kol('unit', 'Unit Kerja', 'teks'),
  kol('program', 'Program', 'teks'), kol('kegiatan', 'Kegiatan', 'teks'), kol('subkegiatan', 'Sub Kegiatan', 'teks'),
  kol('uraian', 'Uraian', 'teks'), kol('sumber', 'Sumber Dana', 'teks'), kol('nominal', 'Anggaran (Rp)', 'rp'),
];

export function kolomPk(s?: Partial<SetelanPk>): KolomSumber[] {
  return s?.tampilan === 'anggaran' ? KOLOM_ANGGARAN : KOLOM_KINERJA;
}
export function kolomBawaanPk(s?: Partial<SetelanPk>): string[] {
  return s?.tampilan === 'anggaran' ? ['no', 'uraian', 'sumber', 'nominal'] : ['no', 'uraian', 'indikator', 'target'];
}

export function setelanPk(raw: unknown, tahunDokumen: number): SetelanPk {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    tahun:    angkaDalam(o.tahun, 2000, 2100, tahunDokumen),
    pihak:    typeof o.pihak === 'string' ? o.pihak.slice(0, 255) : '',
    versi:    o.versi === 'murni' ? 'murni' : 'berlaku',
    tampilan: o.tampilan === 'anggaran' ? 'anggaran' : 'kinerja',
  };
}

interface DokumenPk { id: number; tanggal_dokumen: string; jenis_pk: 'MURNI' | 'PERUBAHAN'; unit_pertama: string; nama_pertama: string; status: string }
interface BarisPkMentah {
  unit_kerja: string; level: string; program: string | null; kegiatan: string | null; subkegiatan: string | null;
  uraian: string; indikator?: string | null; target?: string | null; keterangan_sumber?: string; nominal?: number | string | null;
}

const LABEL_TINGKAT: Record<string, string> = { program: 'Program', kegiatan: 'Kegiatan', subkegiatan: 'Sub Kegiatan' };
const URUT_TINGKAT: Record<string, number> = { program: 0, kegiatan: 1, subkegiatan: 2 };

/** Daftar dibatasi 100 per halaman oleh route-nya; lebih dari 5 halaman PK setahun tidak realistis. */
async function daftar(ambil: AmbilJson, tahun: number, status: 'FINAL' | 'DRAFT'): Promise<DokumenPk[]> {
  const semua: DokumenPk[] = [];
  for (let page = 1; page <= 5; page++) {
    const d = await ambil(`/api/perjanjian-kinerja/dokumen?tahun=${tahun}&status=${status}&limit=100&page=${page}`);
    if (!d.ok) throw new GagalTarik(pesanDitolak(MODUL, d.status, d.message ?? ''));
    const isi = d as { data?: DokumenPk[]; pagination?: { totalPages?: number } };
    semua.push(...(isi.data ?? []));
    if (page >= (isi.pagination?.totalPages ?? 1)) break;
  }
  return semua;
}

/** Dokumen yang dipakai: versi Berlaku = Perubahan terbaru bila ada, kalau tidak Murni terbaru. */
export function pilihDokumenPk(dok: DokumenPk[], pihak: string, versi: SetelanPk['versi']): DokumenPk | null {
  const milik = dok.filter(d => d.unit_pertama === pihak)
    .sort((a, b) => b.tanggal_dokumen.localeCompare(a.tanggal_dokumen) || b.id - a.id);
  if (versi === 'berlaku') return milik.find(d => d.jenis_pk === 'PERUBAHAN') ?? milik.find(d => d.jenis_pk === 'MURNI') ?? null;
  return milik.find(d => d.jenis_pk === 'MURNI') ?? null;
}

/** Kunci dari ISI baris — id lampiran berganti tiap PK disimpan (hapus-tulis-ulang). */
function kunciUnik(dipakai: Map<string, number>, dasar: string): string {
  const n = (dipakai.get(dasar) ?? 0) + 1;
  dipakai.set(dasar, n);
  return n === 1 ? dasar : `${dasar}#${n}`;
}

export async function tarikPk(s: SetelanPk, ambil: AmbilJson): Promise<HasilTarik> {
  const final = await daftar(ambil, s.tahun, 'FINAL');
  const pihak = [...new Set(final.map(d => d.unit_pertama))].sort((a, b) => a.localeCompare(b, 'id'));
  const kolom = kolomPk(s);
  const pilihan = { pihak };
  const kosong = (catatan: string): HasilTarik => ({ kolom, baris: [], catatan: [catatan], ringkas: `PK ${s.tahun}`, pilihan });

  if (!final.length) {
    return kosong(`Tidak ada PK FINAL tahun ${s.tahun} yang bisa Anda lihat. Akun non-admin hanya melihat PK buatannya sendiri.`);
  }
  if (!s.pihak) return kosong('Pilih Pihak Pertama dulu, lalu tarik ulang.');

  const dok = pilihDokumenPk(final, s.pihak, s.versi);
  if (!dok) {
    const draf = await daftar(ambil, s.tahun, 'DRAFT').catch(() => [] as DokumenPk[]);
    const adaDraf = draf.some(d => d.unit_pertama === s.pihak && (s.versi === 'berlaku' || d.jenis_pk === 'MURNI'));
    throw new GagalTarik(adaDraf
      ? `PK ${s.pihak} tahun ${s.tahun} masih draf — finalkan dulu di modul PK.`
      : `Belum ada PK ${s.versi === 'murni' ? 'Murni ' : ''}${s.pihak} tahun ${s.tahun} yang FINAL.`);
  }

  const d = await ambil(`/api/perjanjian-kinerja/dokumen/${dok.id}`);
  if (!d.ok) throw new GagalTarik(pesanDitolak(MODUL, d.status, d.message ?? ''));
  const mentah = ((d as { lampiran?: BarisPkMentah[]; anggaran?: BarisPkMentah[] })[s.tampilan === 'anggaran' ? 'anggaran' : 'lampiran'] ?? []);

  const dipakai = new Map<string, number>();
  const baris: BarisSumber[] = mentah.map((r, i) => {
    const jalur = [r.level, r.program ?? '', r.kegiatan ?? '', r.subkegiatan ?? '', r.uraian];
    const sel: BarisSumber['sel'] = {
      no: i + 1, tingkat: LABEL_TINGKAT[r.level] ?? r.level, unit: r.unit_kerja,
      program: r.program ?? '', kegiatan: r.kegiatan ?? '', subkegiatan: r.subkegiatan ?? '', uraian: r.uraian,
    };
    if (s.tampilan === 'anggaran') {
      sel.sumber = r.keterangan_sumber ?? '';
      sel.nominal = Number(r.nominal ?? 0);
      jalur.push(r.keterangan_sumber ?? '');
    } else {
      sel.indikator = r.indikator ?? '';
      sel.target = r.target ?? '';
      jalur.push(r.indikator ?? '');
    }
    return { kunci: kunciUnik(dipakai, `pk:${JSON.stringify(jalur)}`), label: r.uraian, indent: URUT_TINGKAT[r.level] ?? 0, sel };
  });

  const catatan: string[] = [];
  if (s.tampilan === 'anggaran' && mentah.length) {
    // Anggaran PK bisa memuat beberapa tingkat sekaligus: menjumlah semuanya menghitung dobel.
    // JUMLAH = tingkat teratas yang ada di dokumen saja.
    const puncak = Math.min(...mentah.map(r => URUT_TINGKAT[r.level] ?? 0));
    const jumlah = mentah.filter(r => (URUT_TINGKAT[r.level] ?? 0) === puncak).reduce((a, r) => a + Number(r.nominal ?? 0), 0);
    baris.push({ kunci: 'pk:JUMLAH', label: 'JUMLAH', tebal: true, sel: { no: null, uraian: 'JUMLAH', nominal: jumlah } });
    if (mentah.some(r => (URUT_TINGKAT[r.level] ?? 0) !== puncak)) {
      catatan.push(`JUMLAH hanya menjumlah tingkat ${LABEL_TINGKAT[Object.keys(URUT_TINGKAT)[puncak]].toLowerCase()} — tingkat di bawahnya sudah termuat di dalamnya.`);
    }
  }
  if (!mentah.length) catatan.push(`PK ${s.pihak} tidak memuat ${s.tampilan === 'anggaran' ? 'rincian anggaran' : 'sasaran/indikator'}.`);
  if (dok.jenis_pk === 'PERUBAHAN') catatan.push(`Memakai PK Perubahan tanggal ${dok.tanggal_dokumen}.`);

  return {
    kolom, baris, catatan, pilihan,
    ringkas: `PK · ${s.pihak} ${s.tahun} · ${dok.jenis_pk === 'PERUBAHAN' ? 'Perubahan' : 'Murni'} ${dok.tanggal_dokumen} · ${s.tampilan === 'anggaran' ? 'anggaran' : 'sasaran & indikator'}`,
  };
}
