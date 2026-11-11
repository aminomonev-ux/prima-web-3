// lib/pk/rapikan-nama.ts — tombol "Rapikan Nama" di Master Sasaran & Master Program.
//
// PURE. Berhenti di FORM (L78): hasilnya mengganti isi layar, yang menulis tetap tombol Simpan.
// Data lama memuat penanda matriks Renaksi (bintang di ujung, "(1)" di depan indikator) dan
// satuan yang masih menempel di target; data baru sudah bersih sejak ditarik dari Renaksi.

import { rapikanIndikator, rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import { pisahTargetSatuan } from '@/lib/shared/target-renaksi';
import { buangProgramKembar, type BarisProgram } from './program-kembar';

type Teks = string | null | undefined;

export interface BarisSasaranMaster {
  program: string;
  indikator_program?: Teks; target_program?: Teks; satuan_program?: Teks;
  kegiatan?: Teks;
  indikator_kegiatan?: Teks; target_kegiatan?: Teks; satuan_kegiatan?: Teks;
  subkegiatan?: Teks;
  indikator_subkegiatan?: Teks; target_subkegiatan?: Teks; satuan_subkegiatan?: Teks;
}

const TINGKAT = ['program', 'kegiatan', 'subkegiatan'] as const;

function rapikanSatuBaris<T extends BarisSasaranMaster>(r: T): T {
  const baru = { ...r } as Record<string, unknown>;
  for (const t of TINGKAT) {
    const nama = r[t];
    if (nama) baru[t] = rapikanNamaEntitas(nama);
    const indikator = r[`indikator_${t}`];
    if (indikator) baru[`indikator_${t}`] = rapikanIndikator(indikator);
    if (!(r[`satuan_${t}`] ?? '').trim()) {
      const pisah = pisahTargetSatuan(r[`target_${t}`]);
      if (pisah) { baru[`target_${t}`] = pisah.target; baru[`satuan_${t}`] = pisah.satuan; }
    }
  }
  return baru as T;
}

const sama = (a: object, b: object) =>
  Object.keys(b).every(k => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);

/** Baris yang tidak berubah dipulangkan apa adanya (identitas objeknya tetap). */
export function rapikanBarisSasaran<T extends BarisSasaranMaster>(rows: readonly T[]): { rows: T[]; berubah: number } {
  let berubah = 0;
  const hasil = rows.map(r => {
    const baru = rapikanSatuBaris(r);
    if (sama(r, baru)) return r;
    berubah += 1;
    return baru;
  });
  return { rows: hasil, berubah };
}

/** Nama dibersihkan dulu, baru baris yang jadi kembar digabung ("PROGRAM X ***" = "PROGRAM X"). */
export function rapikanBarisProgram<T extends BarisProgram>(rows: readonly T[]): { rows: T[]; berubah: number; kembar: number } {
  let berubah = 0;
  const bersih = rows.map(r => {
    const baru = {
      ...r,
      program: rapikanNamaEntitas(r.program),
      kegiatan: r.kegiatan ? rapikanNamaEntitas(r.kegiatan) : r.kegiatan,
      subkegiatan: r.subkegiatan ? rapikanNamaEntitas(r.subkegiatan) : r.subkegiatan,
    };
    if (sama(r, baru)) return r;
    berubah += 1;
    return baru;
  });
  const { unik, kembar } = buangProgramKembar(bersih);
  return { rows: unik, berubah, kembar };
}
