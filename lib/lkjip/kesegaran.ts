// lib/lkjip/kesegaran.ts — "Periksa Data Modul": semua tabel tertaut DAN angka sebaris satu dokumen
// dibandingkan dengan sumbernya SEKARANG. Hanya membaca — memperbarui tetap lewat tombol Perbarui di
// bloknya, supaya editor yang sedang terbuka tidak menimpa hasilnya dengan isi lamanya.
// MURNI (penarikan disuntikkan pemanggil): aman klien & bisa diuji tanpa jaringan.

import { nilaiPerbarui, kalimatPerbarui, type HasilTarik, type PayloadTabel, type Tautan } from './tautan';
import { angkaDiHtml, bandingAngka, kalimatAngka, kunciTarikan, type ResepAngka } from './angka';
import { normalizeRows, daftarSelGalat } from './tabel';

/** Yang ditampilkan panel Periksa — sama untuk tabel & narasi. */
export interface ItemPeriksa {
  blockId:   number;
  sectionId: number;
  /** "3.2 Realisasi Anggaran" — tempat blok itu di dokumen. */
  letak:     string;
  judul:     string;
  /** Ringkasan sumber dari tarikan terakhir. */
  ringkas:   string;
}
export interface TabelTertaut extends ItemPeriksa {
  payload:   PayloadTabel & { tautan: Tautan };
}
export interface NarasiTertaut extends ItemPeriksa {
  html:      string;
  angka:     Record<string, ResepAngka>;
}

export type HasilPeriksa =
  | { blockId: number; status: 'sama' }
  | { blockId: number; status: 'berubah'; ringkas: string }
  | { blockId: number; status: 'gagal'; pesan: string };

export type Penarik = (sumber: Tautan['sumber'], setelan: Record<string, unknown>) => Promise<HasilTarik>;

interface BagianDok { id: number; nomor: string; judul: string; blocks: { id: number; tipe: string; payload: unknown }[] }

/**
 * Resep yang sumbernya sama (sumber + setelan) ditarik SEKALI — dokumen dengan lima tabel dan
 * sepuluh angka dari Rekap yang sama tidak perlu lima belas kali memuat delapan sumber E-Anggaran.
 */
export function penarikBersama(tarik: Penarik): Penarik {
  const memo = new Map<string, Promise<HasilTarik>>();
  return (sumber, setelan) => {
    const kunci = kunciTarikan({ sumber, setelan });
    if (!memo.has(kunci)) memo.set(kunci, tarik(sumber, setelan));
    return memo.get(kunci)!;
  };
}

const pesanGagal = (e: unknown) => (e instanceof Error && e.name === 'GagalTarik' ? e.message : 'Gagal menarik data. Coba lagi.');

export function kumpulkanTabelTertaut(bagian: BagianDok[]): TabelTertaut[] {
  return bagian.flatMap(s => s.blocks.flatMap(b => {
    const p = b.payload as Partial<PayloadTabel> | null;
    if (b.tipe !== 'TABEL' || !p?.tautan || !Array.isArray(p.rows) || !Array.isArray(p.kolom)) return [];
    return [{
      blockId: b.id, sectionId: s.id, letak: `${s.nomor} ${s.judul}`.trim(),
      judul: (p.judul ?? '').trim() || 'Tabel tanpa judul',
      ringkas: p.tautan.ringkas ?? '',
      payload: { judul: p.judul ?? '', kolom: p.kolom, align: p.align ?? [], colWidths: p.colWidths, headerRows: p.headerRows, rows: p.rows, tautan: p.tautan },
    }];
  }));
}

/** Tabel (tertaut atau bukan) yang punya sel rumus galat — di Word dicetak "—", jadi disebut sebelum Finalisasi (E7). */
export interface TabelGalat extends ItemPeriksa { sel: string[] }
export function kumpulkanSelGalat(bagian: BagianDok[]): TabelGalat[] {
  return bagian.flatMap(s => s.blocks.flatMap(b => {
    const p = b.payload as { judul?: string; rows?: unknown; tautan?: { ringkas?: string } } | null;
    if (b.tipe !== 'TABEL' || !p) return [];
    const sel = daftarSelGalat(normalizeRows(p.rows));
    if (!sel.length) return [];
    return [{
      blockId: b.id, sectionId: s.id, letak: `${s.nomor} ${s.judul}`.trim(),
      judul: (p.judul ?? '').trim() || 'Tabel tanpa judul', ringkas: p.tautan?.ringkas ?? '', sel,
    }];
  }));
}

/** Resep yang benar-benar dipakai naskah (span-nya masih ada). */
function resepDiNaskah(html: string, angka: Record<string, ResepAngka>): ResepAngka[] {
  return [...angkaDiHtml(html).keys()].flatMap(id => (angka[id] ? [angka[id]] : []));
}

export function kumpulkanNarasiTertaut(bagian: BagianDok[]): NarasiTertaut[] {
  return bagian.flatMap(s => s.blocks.flatMap(b => {
    const p = b.payload as { html?: unknown; angka?: unknown } | null;
    if (b.tipe !== 'NARASI' || typeof p?.html !== 'string' || !p.angka || typeof p.angka !== 'object') return [];
    const angka = p.angka as Record<string, ResepAngka>;
    const dipakai = resepDiNaskah(p.html, angka);
    if (!dipakai.length) return [];
    const sumber = [...new Set(dipakai.map(r => r.ringkas))];
    return [{
      blockId: b.id, sectionId: s.id, letak: `${s.nomor} ${s.judul}`.trim(),
      judul: `Narasi · ${dipakai.length} angka tertaut`,
      ringkas: sumber.length === 1 ? sumber[0] : `${sumber.length} sumber`,
      html: p.html, angka,
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

export async function periksaKesegaran(daftar: TabelTertaut[], tarik: Penarik): Promise<HasilPeriksa[]> {
  const bersama = penarikBersama(tarik);
  const hasil: HasilPeriksa[] = [];
  for (const t of daftar) {
    try {
      const nilai = nilaiPerbarui(t.payload, await bersama(t.payload.tautan.sumber, t.payload.tautan.setelan));
      hasil.push(nilai.sama ? { blockId: t.blockId, status: 'sama' } : { blockId: t.blockId, status: 'berubah', ringkas: kalimatKesegaran(nilai) });
    } catch (e) {
      hasil.push({ blockId: t.blockId, status: 'gagal', pesan: pesanGagal(e) });
    }
  }
  return hasil;
}

/** Angka sebaris tiap narasi vs sumbernya sekarang. Satu sumber gagal = narasinya dilaporkan gagal. */
export async function periksaAngka(daftar: NarasiTertaut[], tarik: Penarik): Promise<HasilPeriksa[]> {
  const bersama = penarikBersama(tarik);
  const hasil: HasilPeriksa[] = [];
  for (const n of daftar) {
    try {
      const hasilPer = new Map<string, HasilTarik>();
      for (const r of resepDiNaskah(n.html, n.angka)) {
        const k = kunciTarikan(r);
        if (!hasilPer.has(k)) hasilPer.set(k, await bersama(r.sumber, r.setelan));
      }
      const banding = bandingAngka(n.html, n.angka, hasilPer);
      hasil.push(banding.every(b => b.status === 'sama')
        ? { blockId: n.blockId, status: 'sama' }
        : { blockId: n.blockId, status: 'berubah', ringkas: kalimatAngka(banding) });
    } catch (e) {
      hasil.push({ blockId: n.blockId, status: 'gagal', pesan: pesanGagal(e) });
    }
  }
  return hasil;
}

/** Tabel & narasi dengan SATU penarik bersama — urutan hasil = urutan tabel lalu narasi. */
export async function periksaSemua(tabel: TabelTertaut[], narasi: NarasiTertaut[], tarik: Penarik): Promise<HasilPeriksa[]> {
  const bersama = penarikBersama(tarik);
  return [...await periksaKesegaran(tabel, bersama), ...await periksaAngka(narasi, bersama)];
}
