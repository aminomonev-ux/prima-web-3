// ═══ PRIMA — LKJIP — Perataan, bingkai, gambar berdampingan (pure, aman-klien) ═══
// Konsep docs/CONCEPT-lkjip-pratinjau-dan-word.md §4. Satu sumber untuk skema, editor, Word, dan Cari-Ganti.
import { bacaUkuran, type UkuranGambar } from './ukuran-gambar';

export const RATA_GAMBAR = ['kiri', 'tengah', 'kanan'] as const;
export type RataGambar = typeof RATA_GAMBAR[number];
/** Gambar pertama ada di kunci lama blok; `tambahan` paling banyak 2 lagi (D7: 3 gambar sebaris). */
export const BATAS_TAMBAHAN_GAMBAR = 2;
export const BATAS_SUB_GAMBAR = 200;
/** Garis bingkai 0,75 pt dalam EMU (1 pt = 12.700 EMU). */
export const TEBAL_BINGKAI_EMU = 9525;

export const JC_RATA: Record<RataGambar, 'left' | 'center' | 'right'> = { kiri: 'left', tengah: 'center', kanan: 'right' };

export interface AturGambar { rata: RataGambar; bingkai: boolean }
/** Payload apa pun → perataan & bingkai. Blok lama tanpa kunci ini = tengah, tanpa bingkai (perilaku lama). */
export function bacaAturGambar(payload: unknown): AturGambar {
  const p = (payload ?? {}) as Record<string, unknown>;
  return {
    rata: (RATA_GAMBAR as readonly unknown[]).includes(p.rata) ? p.rata as RataGambar : 'tengah',
    bingkai: p.bingkai === true,
  };
}

export interface GambarSebaris { fileId: string; ukuran: UkuranGambar; sub: string }
/**
 * Semua gambar blok GAMBAR, gambar pertama dulu. Yang belum punya berkas ikut terhitung: kolomnya tetap ada di Word
 * (berisi penanda), supaya lebar kolom tidak melompat saat berkasnya diunggah belakangan.
 */
export function daftarGambar(payload: unknown): GambarSebaris[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const pertama: GambarSebaris = { fileId: String(p.fileId ?? ''), ukuran: bacaUkuran(p), sub: String(p.sub ?? '') };
  const tambahan = Array.isArray(p.tambahan) ? p.tambahan.slice(0, BATAS_TAMBAHAN_GAMBAR) : [];
  return [pertama, ...tambahan.map(t => {
    const x = (t ?? {}) as Record<string, unknown>;
    return { fileId: String(x.fileId ?? ''), ukuran: bacaUkuran(x), sub: String(x.sub ?? '') };
  })];
}

/** Semua id berkas blok GAMBAR/GRAFIK — untuk mengambil gambarnya sekali saja. */
export function berkasBlok(tipe: string, payload: unknown): string[] {
  if (tipe === 'GRAFIK') {
    const f = (payload as { imageFileId?: unknown } | null)?.imageFileId;
    return typeof f === 'string' && f ? [f] : [];
  }
  return tipe === 'GAMBAR' ? daftarGambar(payload).map(g => g.fileId).filter(Boolean) : [];
}
