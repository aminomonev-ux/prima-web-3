// lib/lkjip/kesegaran.ts — "Periksa Tabel Tertaut": semua tabel tertaut satu dokumen dibandingkan
// dengan sumbernya SEKARANG. Hanya membaca — memperbarui tetap lewat tombol Perbarui di tabelnya,
// supaya editor tabel yang sedang terbuka tidak menimpa hasilnya dengan isi lamanya.
// MURNI (penarikan disuntikkan pemanggil): aman klien & bisa diuji tanpa jaringan.

import { nilaiPerbarui, kalimatPerbarui, type HasilTarik, type PayloadTabel, type Tautan } from './tautan';

export interface TabelTertaut {
  blockId:   number;
  sectionId: number;
  /** "3.2 Realisasi Anggaran" — tempat tabel itu di dokumen. */
  letak:     string;
  judul:     string;
  payload:   PayloadTabel & { tautan: Tautan };
}

export type HasilPeriksa =
  | { blockId: number; status: 'sama' }
  | { blockId: number; status: 'berubah'; ringkas: string }
  | { blockId: number; status: 'gagal'; pesan: string };

interface BagianDok { id: number; nomor: string; judul: string; blocks: { id: number; tipe: string; payload: unknown }[] }

export function kumpulkanTabelTertaut(bagian: BagianDok[]): TabelTertaut[] {
  return bagian.flatMap(s => s.blocks.flatMap(b => {
    const p = b.payload as Partial<PayloadTabel> | null;
    if (b.tipe !== 'TABEL' || !p?.tautan || !Array.isArray(p.rows) || !Array.isArray(p.kolom)) return [];
    return [{
      blockId: b.id, sectionId: s.id, letak: `${s.nomor} ${s.judul}`.trim(),
      judul: (p.judul ?? '').trim() || 'Tabel tanpa judul',
      payload: { judul: p.judul ?? '', kolom: p.kolom, align: p.align ?? [], colWidths: p.colWidths, headerRows: p.headerRows, rows: p.rows, tautan: p.tautan },
    }];
  }));
}

/** Satu kalimat "apa yang berubah" — gabungan semua alasan yang membuat Perbarui akan menulis. */
export function kalimatKesegaran(p: ReturnType<typeof nilaiPerbarui>): string {
  const bagian: string[] = [];
  const isi = kalimatPerbarui(p.ringkas);
  if (!p.ringkas.sama) bagian.push(isi);
  if (p.badan.kolomHilang.length) bagian.push(`${p.badan.kolomHilang.length} kolom kehilangan kolom sumbernya`);
  if (p.yatim.length) bagian.push(`${p.yatim.length} isian tangan kehilangan barisnya`);
  if (!p.metaSama && !bagian.length) bagian.push('keterangan/catatan sumber berubah, angkanya sama');
  return bagian.join(' · ');
}

/**
 * Tabel yang resep sumbernya sama (sumber + setelan) ditarik SEKALI — dokumen dengan lima tabel
 * dari Rekap yang sama tidak perlu lima kali memuat delapan sumber E-Anggaran.
 */
export async function periksaKesegaran(
  daftar: TabelTertaut[],
  tarik: (sumber: Tautan['sumber'], setelan: Record<string, unknown>) => Promise<HasilTarik>,
): Promise<HasilPeriksa[]> {
  const tarikan = new Map<string, Promise<HasilTarik>>();
  const hasil: HasilPeriksa[] = [];
  for (const t of daftar) {
    const kunci = JSON.stringify([t.payload.tautan.sumber, t.payload.tautan.setelan]);
    if (!tarikan.has(kunci)) tarikan.set(kunci, tarik(t.payload.tautan.sumber, t.payload.tautan.setelan));
    try {
      const nilai = nilaiPerbarui(t.payload, await tarikan.get(kunci)!);
      hasil.push(nilai.sama ? { blockId: t.blockId, status: 'sama' } : { blockId: t.blockId, status: 'berubah', ringkas: kalimatKesegaran(nilai) });
    } catch (e) {
      hasil.push({ blockId: t.blockId, status: 'gagal', pesan: e instanceof Error && e.name === 'GagalTarik' ? e.message : 'Gagal menarik data. Coba lagi.' });
    }
  }
  return hasil;
}
