// ═══ PRIMA — LKJIP — Isi yang jadi lebih lebar dari bidang tulis sesudah ganti kertas/margin (pure, aman-klien) ═══
// Konsep docs/konsep/lkjip/CONCEPT-lkjip-kertas-margin-arsip-pdf.md A.3: data TIDAK ditulis ulang — Word mengecilkannya
// saat dirakit. Fungsi ini hanya menghitung apa yang akan dikecilkan, supaya layar bisa menyebutnya.
import { flattenTree, type SectionNode } from './numbering';
import { bacaAtur, DXA_PER_PX } from './tabel';
import { daftarGambar } from './atur-gambar';
import { bacaUkuran } from './ukuran-gambar';
import type { Geometri } from './halaman';

const EMU_PER_DXA = 635;

export interface DampakKertas { gambar: number; tabel: number }

/** Gambar berukuran pasti yang lebih lebar dari bidang tulis, dan tabel yang lebih lebar dari kertas (tegak/melintang). */
export function dampakKertas(tree: SectionNode[], geo: Geometri): DampakKertas {
  const hasil: DampakKertas = { gambar: 0, tabel: 0 };
  const lebarGambar = geo.lebarTulis * EMU_PER_DXA;
  for (const node of flattenTree(tree)) {
    for (const b of node.blocks) {
      if (b.tipe === 'GAMBAR') {
        hasil.gambar += daftarGambar(b.payload).length > 1 ? 0 : daftarGambar(b.payload).filter(g => (g.ukuran.lebarEmu ?? 0) > lebarGambar).length;
      } else if (b.tipe === 'GRAFIK') {
        if ((bacaUkuran(b.payload).lebarEmu ?? 0) > lebarGambar) hasil.gambar++;
      } else if (b.tipe === 'TABEL') {
        const p = (b.payload ?? {}) as { colWidths?: unknown };
        const lebar = Array.isArray(p.colWidths) ? p.colWidths.reduce((a: number, w) => a + (Number(w) || 0), 0) * DXA_PER_PX : 0;
        if (lebar > (bacaAtur(b.payload).melintang ? geo.lebarTulisMelintang : geo.lebarTulis)) hasil.tabel++;
      }
    }
  }
  return hasil;
}

/** Kalimat untuk toast; '' bila tidak ada yang terdampak. */
export function kalimatDampak(d: DampakKertas): string {
  const bagian = [d.gambar && `${d.gambar} gambar`, d.tabel && `${d.tabel} tabel`].filter(Boolean);
  return bagian.length ? `${bagian.join(' dan ')} lebih lebar dari bidang tulis — di Word dikecilkan supaya muat; ukuran tersimpannya tidak diubah.` : '';
}
