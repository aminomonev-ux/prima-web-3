// lib/lkjip/kesegaran.ts — "Periksa Data Modul": semua tabel tertaut DAN angka sebaris satu dokumen
// dibandingkan dengan sumbernya SEKARANG. Hanya membaca — memperbarui tetap lewat tombol Perbarui di
// bloknya, supaya editor yang sedang terbuka tidak menimpa hasilnya dengan isi lamanya.
// MURNI (penarikan disuntikkan pemanggil): aman klien & bisa diuji tanpa jaringan.

import { nilaiPerbarui, kalimatPerbarui, kalimatBarisTanganPindah, type HasilTarik, type PayloadTabel, type Tautan } from './tautan';
import { angkaDiHtml, bandingAngka, kalimatAngka, kunciTarikan, type ResepAngka } from './angka';
import { normalizeRows, daftarSelGalat } from './tabel';
import { rujukanDiHtml } from './numbering';

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

/** `info` = kabar yang tidak mengubah angka (mis. versi lebih baru sudah ada) — lihat `HasilTarik.info`. */
export type HasilPeriksa =
  | { blockId: number; status: 'sama'; info?: string[] }
  | { blockId: number; status: 'berubah'; ringkas: string; info?: string[] }
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

/**
 * Narasi yang merujuk Tabel/Gambar/Grafik yang sudah tidak ada (§12.5) — di Word tertulis "Tabel ?",
 * jadi disebut sebelum Finalisasi. `ada` = id blok yang bernomor sekarang (`nomorObjek`).
 */
export interface NarasiRujukanPutus extends ItemPeriksa { jumlah: number }
export function kumpulkanRujukanPutus(bagian: BagianDok[], ada: Set<number>): NarasiRujukanPutus[] {
  return bagian.flatMap(s => s.blocks.flatMap(b => {
    const p = b.payload as { html?: string } | null;
    if (b.tipe !== 'NARASI' || !p?.html) return [];
    const putus = rujukanDiHtml(p.html).filter(id => !ada.has(id));
    if (!putus.length) return [];
    return [{ blockId: b.id, sectionId: s.id, letak: `${s.nomor} ${s.judul}`.trim(), judul: 'Narasi', ringkas: '', jumlah: putus.length }];
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
export function kalimatKesegaran(p: ReturnType<typeof nilaiPerbarui>, sumber?: Tautan['sumber']): string {
  const bagian: string[] = [];
  const isi = kalimatPerbarui(p.ringkas, sumber);
  if (!p.ringkas.sama) bagian.push(isi);
  if (p.badan.kolomHilang.length) bagian.push(`${p.badan.kolomHilang.length} kolom kehilangan kolom sumbernya`);
  if (p.yatim.length) bagian.push(`${p.yatim.length} isian tangan kehilangan barisnya`);
  if (p.badan.barisTanganPindah.length) bagian.push(kalimatBarisTanganPindah(p.badan.barisTanganPindah.length));
  if (!p.metaSama && !bagian.length) bagian.push('keterangan/catatan sumber berubah, angkanya sama');
  return bagian.join(' · ');
}

export async function periksaKesegaran(daftar: TabelTertaut[], tarik: Penarik): Promise<HasilPeriksa[]> {
  const bersama = penarikBersama(tarik);
  const hasil: HasilPeriksa[] = [];
  for (const t of daftar) {
    try {
      const tarikan = await bersama(t.payload.tautan.sumber, t.payload.tautan.setelan);
      const nilai = nilaiPerbarui(t.payload, tarikan);
      const info = tarikan.info?.length ? { info: tarikan.info } : {};
      hasil.push(nilai.sama ? { blockId: t.blockId, status: 'sama', ...info } : { blockId: t.blockId, status: 'berubah', ringkas: kalimatKesegaran(nilai, t.payload.tautan.sumber), ...info });
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
      const kabar = [...new Set([...hasilPer.values()].flatMap(h => h.info ?? []))];
      const info = kabar.length ? { info: kabar } : {};
      hasil.push(banding.every(b => b.status === 'sama')
        ? { blockId: n.blockId, status: 'sama', ...info }
        : { blockId: n.blockId, status: 'berubah', ringkas: kalimatAngka(banding), ...info });
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

// ── Pemeriksaan otomatis saat dokumen dibuka (konsep pengingat-data-modul) ────────────────────

/** Diulang saat tab kembali dibuka kalau pemeriksaan terakhir sudah selama ini. */
export const SELANG_PERIKSA_ULANG_MS = 15 * 60_000;

export const perluPeriksaUlang = (terakhir: number | null, sekarang: number) =>
  terakhir === null || sekarang - terakhir >= SELANG_PERIKSA_ULANG_MS;

/**
 * Jejak isi TERSIMPAN blok tertaut. Kabar hasil pemeriksaan hanya berlaku selama jejaknya sama —
 * sesudah Perbarui (atau suntingan apa pun) bloknya disimpan ulang dan lencananya gugur sendiri.
 */
export function sidikTertaut(t: TabelTertaut | NarasiTertaut): string {
  return 'payload' in t ? JSON.stringify(t.payload) : JSON.stringify([t.html, t.angka]);
}

export interface KabarBlok { jenis: 'berubah' | 'info'; label: string; rinci: string }

/**
 * Lencana di kepala blok. Status `gagal` sengaja diam: sebab tersering adalah orangnya tidak punya akses
 * modul sumber, dan galat yang muncul tiap membuka dokumen hanya melatih orang mengabaikannya.
 */
export function kabarBlok(h: HasilPeriksa | undefined, narasi: boolean): KabarBlok[] {
  if (!h || h.status === 'gagal') return [];
  const kabar: KabarBlok[] = [];
  if (h.status === 'berubah') {
    kabar.push({ jenis: 'berubah', label: narasi ? 'Angka modul berubah: tekan Perbarui angka' : 'Data modul berubah: tekan Perbarui', rinci: h.ringkas });
  }
  for (const i of h.info ?? []) kabar.push({ jenis: 'info', label: 'Ada versi lebih baru', rinci: i });
  return kabar;
}
