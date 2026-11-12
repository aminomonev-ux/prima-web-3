// components/kinerja/simpan-master-baru.ts — SATU jalur membuat entri Master E-Anggaran baru dari layar.
//
// Tiga pintu membuat entri lewat POST /api/kinerja/master: tombol Simpan tab Master, Import Master
// (Excel), dan "lengkapi Master" di Import Rekening. Dulu hanya yang pertama menanyakan "pakai dari
// Rencana Aksi" (docs/CONCEPT-renaksi-terhubung.md §5.1) — dua impor menyimpan entri yang jalurnya
// ada di Renaksi sebagai MANUAL, dengan ejaan berkas (bintang penanda ikut). Satu fungsi, satu
// pertanyaan (L78): pintu keempat cukup memanggil ini.

import { fetchJson } from '@/lib/shared/api';
import { pilihDialog } from '@/components/ui/ConfirmDialog';
import { ketikanAdaDiRenaksi, kalimatKetikanRenaksi, type HasilBanding, type ItemBaru } from '@/lib/kinerja/banding-renaksi';
import type { MasterTipe } from '@/app/(dashboard)/kinerja/_types';

export interface EntriMasterBaru {
  tipe: MasterTipe;
  nama: string;
  program_ref: string | null;
  kegiatan_ref: string | null;
  subkegiatan_ref: string | null;
}

export interface HasilSimpanMaster {
  /** null = pengguna membatalkan dialog; tidak ada yang ditulis. */
  dibuat: number | null;
  dariRenaksi: number;
  gagal: { nama: string; pesan: string }[];
  /** Entri yang benar-benar tersimpan, dengan nama AKHIR-nya (ejaan Renaksi bila dipilih). */
  tersimpan: EntriMasterBaru[];
}

/**
 * Tanya dulu (bila ada yang cocok dengan Renaksi), lalu tulis BERURUTAN — `urut` Master dihitung
 * MAX(urut)+1, penulisan serentak melahirkan beberapa baris ber-urut sama. Pemeriksaan Renaksi
 * gagal dimuat = disimpan seperti biasa, tanpa pertanyaan.
 */
export async function simpanMasterBaru(tahun: string, entri: readonly EntriMasterBaru[]): Promise<HasilSimpanMaster> {
  let cocok = new Map<number, ItemBaru>();
  const banding = await fetchJson<unknown>(`/api/kinerja/master/banding-renaksi?tahun=${encodeURIComponent(tahun)}`);
  if (banding.ok) cocok = ketikanAdaDiRenaksi(entri, (banding as unknown as HasilBanding).baru);

  let pakai = false;
  if (cocok.size > 0) {
    const pilihan = await pilihDialog({
      title: 'Sudah ada di Rencana Aksi',
      message: kalimatKetikanRenaksi([...cocok].map(([i, b]) => ({ ketikan: entri[i].nama, renaksi: b })), tahun),
      confirmLabel: 'Pakai dari Rencana Aksi',
      variant: 'primary',
      altLabel: 'Tetap manual',
    });
    if (pilihan === null) return { dibuat: null, dariRenaksi: 0, gagal: [], tersimpan: [] };
    pakai = pilihan === 'utama';
  }

  let dibuat = 0;
  const gagal: HasilSimpanMaster['gagal'] = [];
  const tersimpan: EntriMasterBaru[] = [];
  for (const [i, e] of entri.entries()) {
    const ra = pakai ? cocok.get(i) : undefined;
    const isi: EntriMasterBaru = {
      tipe: e.tipe, nama: ra ? ra.nama : e.nama,
      // Ejaan induk ikut Renaksi juga: induk dari berkas bisa masih berbintang.
      program_ref: ra ? (ra.program_ref ?? e.program_ref) : e.program_ref,
      kegiatan_ref: ra ? (ra.kegiatan_ref ?? e.kegiatan_ref) : e.kegiatan_ref,
      subkegiatan_ref: e.subkegiatan_ref,
    };
    const d = await fetchJson<unknown>('/api/kinerja/master', {
      method: 'POST',
      body: JSON.stringify({ tahun, ...isi, sumber: null, ...(ra ? { asal: 'RENAKSI' } : {}) }),
    });
    if (d.ok) { dibuat++; tersimpan.push(isi); }
    else gagal.push({ nama: e.nama, pesan: d.message || 'galat' });
  }
  return { dibuat, dariRenaksi: pakai ? cocok.size : 0, gagal, tersimpan };
}
