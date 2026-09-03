'use client';
// lib/kinerja/konfirmasi-simpan.ts — penerjemah 409 PENURUNAN_DRASTIS jadi
// pertanyaan, untuk KETIGA jalur simpan E-Anggaran (SSK, Realisasi, Rekening).
//
// Satu fungsi, bukan tiga salinan: kalimatnya menjelaskan konsekuensi yang sama
// persis di ketiga tempat, dan tiga salinan kalimat pasti berbeda bunyi begitu
// salah satunya disunting.
//
// Kenapa ditanyakan, bukan ditolak buntu: mengosongkan satu sumber dengan sengaja
// itu pekerjaan yang sah (salah pilih sumber lalu mau dibersihkan). Yang salah
// bukan "boleh kosong", tapi "kosong tanpa ada yang menyatakan sengaja".

import { confirmDialog } from '@/components/ui/ConfirmDialog';

export interface JawabanPagar {
  existing?: number;
  incoming?: number;
}

/** `true` = pemakai menyatakan sengaja; ulangi permintaan dengan `force: true`. */
export function konfirmasiPenurunan(apa: string, d: JawabanPagar): Promise<boolean> {
  const ada  = d.existing ?? 0;
  const baru = d.incoming ?? 0;
  return confirmDialog({
    title: `Baris ${apa} akan berkurang banyak`,
    message:
      `Tersimpan sekarang ${ada} baris, yang akan ditulis ${baru} baris. ` +
      'Simpan itu menghapus lalu menulis ulang seluruh isinya, dan tidak ada riwayat untuk memulihkannya. ' +
      'Kalau tabelnya tadi belum selesai termuat, batalkan lalu muat ulang halaman.',
    variant: 'danger',
    confirmLabel: 'Ya, simpan apa adanya',
  });
}
