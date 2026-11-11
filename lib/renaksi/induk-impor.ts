// lib/renaksi/induk-impor.ts — menyelaraskan baris impor dengan nama yang SUDAH tersimpan.
//
// PURE: tidak menyentuh DB. Hierarki `rencana_aksi` disambung TEKS NAMA dan data tersimpan tidak
// ditulis ulang (penanda matriks dihitung saat ditampilkan — docs/CONCEPT-renaksi-bersihkan-nama.md §12).
// Jadi berkas yang bersih diimpor ke tahun yang datanya berbintang harus MENGIKUTI ejaan tersimpan:
// kalau tidak, induknya dianggap belum ada (§11.2), entitasnya terpecah dua, dan indikatornya kembar.

import { nomorTersimpan, rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import type { RaLevel } from '@/lib/data/rencana-aksi-schemas';
import type { CommitResult, CommitRow } from './import-data';

export interface BarisTersimpan {
  level: RaLevel;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
}

/** Induk yang wajib ada per level (null = tidak punya induk). */
const PARENT_OF: Record<RaLevel, { level: RaLevel; field: 'induk_tujuan' | 'induk_sasaran' | 'induk_program' | 'induk_kegiatan' } | null> = {
  'tujuan': null,
  'sasaran': { level: 'tujuan', field: 'induk_tujuan' },
  'program': { level: 'sasaran', field: 'induk_sasaran' },
  'kegiatan': { level: 'program', field: 'induk_program' },
  'sub-kegiatan': { level: 'kegiatan', field: 'induk_kegiatan' },
};

export const kunciPersis = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();
const kunciNama = (s: string): string => kunciPersis(rapikanNamaEntitas(s));
const kunciIndikator = (s: string): string => kunciPersis(rapikanIndikator(s));

function unik(daftar: readonly string[]): string[] {
  const peta = new Map<string, string>();
  for (const n of daftar) if (!peta.has(kunciPersis(n))) peta.set(kunciPersis(n), n);
  return [...peta.values()];
}

/** `nama: null` + `ganda` kosong = tidak ada; `ganda` berisi = lebih dari satu nama yang hanya berbeda penanda. */
export type HasilCocok = { nama: string; ganda?: undefined } | { nama: null; ganda: string[] };

/**
 * Nama yang dipakai untuk menyambung ke induk. Sama persis → apa adanya. Kalau tidak, yang hanya
 * berbeda penanda matriks: ejaan TERSIMPAN lebih dulu (data tidak ditulis ulang), kecuali level
 * itu sedang diganti seluruhnya oleh berkas.
 */
export function cocokkanInduk(
  nama: string, berkas: readonly string[], tersimpan: readonly string[], utamakanBerkas: boolean,
): HasilCocok {
  const k = kunciPersis(nama);
  if (berkas.some(n => kunciPersis(n) === k) || tersimpan.some(n => kunciPersis(n) === k)) return { nama };
  const kb = kunciNama(nama);
  for (const sumber of utamakanBerkas ? [berkas, tersimpan] : [tersimpan, berkas]) {
    const calon = unik(sumber.filter(n => kunciNama(n) === kb));
    if (calon.length === 1) return { nama: calon[0] };
    if (calon.length > 1) return { nama: null, ganda: calon };
  }
  return { nama: null, ganda: [] };
}

function namaPerLevel(tersimpan: readonly BarisTersimpan[]): Map<RaLevel, string[]> {
  const out = new Map<RaLevel, string[]>();
  const add = (lv: RaLevel, v: string | null) => { if (v) out.set(lv, [...(out.get(lv) ?? []), v]); };
  for (const r of tersimpan) {
    if (r.level === 'tujuan' || r.level === 'sasaran' || r.level === 'program') add(r.level, r.program);
    if (r.level === 'kegiatan') add('kegiatan', r.kegiatan);
    if (r.level === 'sub-kegiatan') { add('program', r.program); add('kegiatan', r.kegiatan); }
  }
  return out;
}

const namaSendiri = (r: BarisTersimpan): string =>
  (r.level === 'kegiatan' ? r.kegiatan : r.level === 'sub-kegiatan' ? r.sub_kegiatan : r.program) ?? '';

export interface HasilSelaras {
  layak: CommitRow[];
  ditahan: CommitResult['ditahan'];
  /** Baris yang nama, indikator, atau induknya diganti ejaan tersimpan. */
  disesuaikan: number;
}

/**
 * @param ganti mode 'ganti': level yang ada di berkas dihapus lalu ditulis ulang, jadi untuk level itu
 *              ejaan BERKAS yang berlaku dan nama/indikatornya tidak disesuaikan.
 */
export function selaraskanImpor(
  rows: readonly CommitRow[], tersimpan: readonly BarisTersimpan[], tahun: number, ganti: boolean,
): HasilSelaras {
  const levelBerkas = new Set(rows.map(r => r.level));
  const diganti = (lv: RaLevel) => ganti && levelBerkas.has(lv);
  const namaDb = namaPerLevel(tersimpan);

  // 1. Nama entitas sendiri → ejaan tersimpan, supaya entitas yang sama tidak terpecah dua.
  const bernama = rows.map(r => {
    if (diganti(r.level)) return r;
    const h = cocokkanInduk(r.nama, [], namaDb.get(r.level) ?? [], false);
    return h.nama !== null && h.nama !== r.nama ? { ...r, nama: h.nama } : r;
  });

  // 2. Indikator → ejaan tersimpan, supaya kunci unik (tahun, level, indikator) mengenai baris lamanya.
  //    Hanya bila calonnya tunggal, milik entitas yang sama, nomornya tidak bertentangan, dan tidak
  //    diperebutkan baris berkas lain — indikator kembar dibedakan justru oleh nomornya.
  const usul = bernama.map(r => {
    if (diganti(r.level)) return null;
    const selevel = tersimpan.filter(t => t.level === r.level);
    if (selevel.some(t => kunciPersis(t.indikator) === kunciPersis(r.indikator))) return null;
    const nomor = nomorTersimpan(r.indikator);
    const calon = unik(selevel
      .filter(t => kunciIndikator(t.indikator) === kunciIndikator(r.indikator)
        && kunciNama(namaSendiri(t)) === kunciNama(r.nama)
        && (nomor === null || nomorTersimpan(t.indikator) === nomor))
      .map(t => t.indikator));
    return calon.length === 1 ? calon[0] : null;
  });
  const peminat = new Map<string, number>();
  bernama.forEach((r, i) => {
    for (const k of new Set([`${r.level}|${kunciPersis(r.indikator)}`, ...(usul[i] ? [`${r.level}|${kunciPersis(usul[i]!)}`] : [])])) {
      peminat.set(k, (peminat.get(k) ?? 0) + 1);
    }
  });
  const selaras = bernama.map((r, i) => {
    const u = usul[i];
    return u && peminat.get(`${r.level}|${kunciPersis(u)}`) === 1 ? { ...r, indikator: u } : r;
  });

  // 3. Induk: wajib ada di berkas atau tersimpan; yang hanya berbeda penanda disambung ke ejaan yang berlaku.
  const namaBerkas = new Map<RaLevel, string[]>();
  for (const r of selaras) namaBerkas.set(r.level, [...(namaBerkas.get(r.level) ?? []), r.nama]);
  const cari = (lv: RaLevel, nama: string) =>
    cocokkanInduk(nama, namaBerkas.get(lv) ?? [], namaDb.get(lv) ?? [], diganti(lv));

  const layak: CommitRow[] = [];
  const ditahan: CommitResult['ditahan'] = [];
  let disesuaikan = 0;
  selaras.forEach((r, i) => {
    let b: CommitRow = r;
    const parent = PARENT_OF[r.level];
    if (parent) {
      const nama = r[parent.field];
      if (!nama || !nama.trim()) {
        ditahan.push({ indikator: r.indikator, level: r.level, alasan: `Induk ${parent.level} belum ditentukan.` });
        return;
      }
      const h = cari(parent.level, nama);
      if (h.nama === null) {
        ditahan.push({
          indikator: r.indikator, level: r.level,
          alasan: h.ganda.length
            ? `Ada ${h.ganda.length} ${parent.level} bernama "${rapikanNamaEntitas(nama).slice(0, 60)}" yang hanya berbeda penanda — samakan dulu namanya di Data Entry.`
            : `${parent.level} "${nama.slice(0, 60)}" belum ada di tahun ${tahun} — buat dulu atau pilih induk lain.`,
        });
        return;
      }
      if (h.nama !== nama) b = { ...b, [parent.field]: h.nama };
    }
    // Sub-kegiatan butuh rantai lengkap sampai Program
    if (r.level === 'sub-kegiatan') {
      if (!r.induk_program?.trim()) {
        ditahan.push({ indikator: r.indikator, level: r.level, alasan: 'Program induk belum ditentukan.' });
        return;
      }
      const h = cari('program', r.induk_program);
      if (h.nama !== null && h.nama !== r.induk_program) b = { ...b, induk_program: h.nama };
    }
    if (b !== rows[i]) disesuaikan++;
    layak.push(b);
  });

  return { layak, ditahan, disesuaikan };
}
