// ═══ PRIMA — LKJIP — Aturan struktur BAB (pure, no IO) ═════════════
// Audit B12 (2026-09-29), keputusan pemilik aplikasi:
//   · 4 BAB wajib (`locked = 1`) tidak bisa Naik/Turun/dijadikan sub-bab; judulnya boleh diubah.
//   · Bab tambahan bebas di antara sesamanya, tapi selalu SESUDAH BAB wajib terakhir —
//     nomor BAB I–IV tidak boleh bergeser (Tambah bab / Jadikan bab ikut aturan ini).
//   · Bagian di tingkat mana pun tidak bisa dihapus selama masih punya sub-bagian.
// Dipakai lapisan data (pagar sungguhan) DAN editor (tombol mati + alasannya), supaya
// keduanya tidak bisa berbeda pendapat (L82: tombol mati bukan jalur aman).

export const JUDUL_BAB_WAJIB = ['PENDAHULUAN', 'PERENCANAAN KINERJA', 'AKUNTABILITAS KINERJA', 'PENUTUP'] as const;

export const judulBabWajib = (judul: string): boolean =>
  (JUDUL_BAB_WAJIB as readonly string[]).includes(judul.trim().toUpperCase());

export interface BagianRingkas { id: number; parent_id: number | null; urutan: number; locked: number }

export type Putusan = { boleh: true } | { boleh: false; alasan: string };

export const ALASAN_BAB = {
  wajibDipindah: 'BAB wajib tidak bisa dipindah atau dijadikan sub-bab. Judulnya tetap boleh diubah.',
  babDiDepanWajib: 'Bab tambahan hanya boleh diletakkan sesudah BAB wajib terakhir, supaya nomor BAB wajib tidak bergeser.',
  masihPunyaSub: (n: number) => `Masih ada ${n} sub-bagian di bawahnya. Hapus atau pindahkan sub-bagian itu dulu.`,
} as const;

function urutanBab(bagian: BagianRingkas[]): BagianRingkas[] {
  return bagian.filter(b => b.parent_id == null).sort((a, b) => (a.urutan - b.urutan) || (a.id - b.id));
}

/**
 * Banyaknya bab TAMBAHAN yang berdiri sebelum BAB wajib terakhir. Pindah di tingkat bab
 * hanya boleh kalau angka ini tidak NAIK — bukan "harus nol": dokumen lama yang sudah
 * punya bab tambahan di depan tetap bisa dirapikan selangkah demi selangkah.
 */
export function babTambahanDiDepan(urutan: { locked: number }[]): number {
  let terakhirWajib = -1;
  urutan.forEach((b, i) => { if (b.locked) terakhirWajib = i; });
  return urutan.slice(0, terakhirWajib + 1).filter(b => !b.locked).length;
}

/**
 * Putusan satu pindah — argumennya persis `SectionMove` (`new_parent_id`, `new_index`
 * 0-based di antara saudara baru), dan penyisipannya meniru `moveSection`.
 */
export function putusanPindah(bagian: BagianRingkas[], id: number, parentBaru: number | null, indexBaru: number): Putusan {
  const node = bagian.find(b => b.id === id);
  if (!node) return { boleh: true };
  if (node.locked) return { boleh: false, alasan: ALASAN_BAB.wajibDipindah };
  if (parentBaru != null) return { boleh: true };
  const sebelum = urutanBab(bagian);
  const tanpaNode = sebelum.filter(b => b.id !== id);
  const idx = Math.min(Math.max(0, indexBaru), tanpaNode.length);
  const sesudah = [...tanpaNode.slice(0, idx), node, ...tanpaNode.slice(idx)];
  return babTambahanDiDepan(sesudah) > babTambahanDiDepan(sebelum)
    ? { boleh: false, alasan: ALASAN_BAB.babDiDepanWajib }
    : { boleh: true };
}

export function putusanHapus(bagian: BagianRingkas[], id: number): Putusan {
  const n = bagian.filter(b => b.parent_id === id).length;
  return n > 0 ? { boleh: false, alasan: ALASAN_BAB.masihPunyaSub(n) } : { boleh: true };
}
