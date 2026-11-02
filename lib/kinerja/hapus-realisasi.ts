// lib/kinerja/hapus-realisasi.ts — kapan item di tab Realisasi boleh dihapus, dan menghapusnya.
// PURE (aman-klien); diuji di scripts/test-kinerja-hapus-realisasi.mts.
//
// Tombol hapus Realisasi dulu mati permanen untuk SEMUA baris ("integritas histori"),
// termasuk rekening yang sudah dihapus dari RKO dan tidak pernah berealisasi — barisnya
// menumpuk sebagai yatim tanpa jalan keluar. Kini hidup hanya untuk item yang benar-benar
// tidak dipakai: acuan = RKO versi terbaru, item tidak ADA di RKO itu (dihapus — yang
// dinol-kan masih ada, dan nol-kan cara resmi menonaktifkan), dan realisasinya nol di
// semua bulan. Realisasi tidak berversi dan Simpan-nya hapus-tulis-ulang setahun, jadi
// menghapus item = membuang SEMUA bulannya; sebulan saja menyisakan 11 baris yatim.
// Menghapus baris bernilai nol tidak mengubah angka yang sudah dilaporkan, jadi bulan
// tertutup tidak menghalangi (`pelanggaranBulanTertutup` memang tidak menghitungnya).

import type { RealRow } from '@/app/(dashboard)/kinerja/_types';
import { fmtNumDisplay } from '@/lib/shared/utils';
import { NAMA_BULAN } from './banding-realisasi';

export interface KonteksHapusRealisasi {
  /** canonical_id SEMUA baris RKO acuan — termasuk yang dinol-kan. */
  cidRko: ReadonlySet<string>;
  /** Acuan = versi terbaru (belum dikunci). Versi arsip hanya-baca. */
  acuanTerbaru: boolean;
}

const berisi = (r: RealRow) => (r.real_fisik || 0) !== 0 || (r.real_keuangan || 0) !== 0;

/** `null` = boleh dihapus; selain itu kalimat untuk tooltip tombol yang mati. */
export function alasanTakBisaHapus(rows: readonly RealRow[], cid: string, k: KonteksHapusRealisasi): string | null {
  if (!k.acuanTerbaru) return 'Acuan RKO ini sudah diarsipkan — pindah ke versi terbaru untuk menghapus.';
  if (!cid) return 'Baris lama tanpa identitas RKO — tidak bisa dipastikan tidak terpakai.';
  // RKO kosong di layar bisa berarti belum dimuat: semua item akan tampak "tidak ada di RKO".
  if (k.cidRko.size === 0) return 'RKO acuan kosong atau belum dimuat — tidak bisa dipastikan tidak terpakai.';
  if (k.cidRko.has(cid)) return 'Masih ada di RKO — kalau tidak dipakai, nol-kan di RKO.';
  const terisi = rows.find(r => (r.ssk_canonical_id || '') === cid && berisi(r));
  if (terisi) {
    return `Punya realisasi di ${NAMA_BULAN[terisi.bulan - 1] ?? `bulan ${terisi.bulan}`}`
      + ` (keuangan ${fmtNumDisplay(terisi.real_keuangan || 0)}) — tidak bisa dihapus.`;
  }
  return null;
}

/** Item yang boleh dihapus, urut kemunculan — untuk tombol borongan di spanduk yatim. */
export function itemTakTerpakai(rows: readonly RealRow[], k: KonteksHapusRealisasi): string[] {
  const cids = [...new Set(rows.map(r => r.ssk_canonical_id || ''))];
  return cids.filter(cid => alasanTakBisaHapus(rows, cid, k) === null);
}

/** Semua bulan item-item itu dibuang dari layar; tersimpan lewat Simpan Semua. */
export function buangItemRealisasi(rows: readonly RealRow[], cids: ReadonlySet<string>): RealRow[] {
  return rows.filter(r => !cids.has(r.ssk_canonical_id || ''));
}
