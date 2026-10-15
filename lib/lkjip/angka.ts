// lib/lkjip/angka.ts — angka sebaris di narasi LKJIP yang tertaut ke modul (konsep §19.1).
//
// Naskah menyimpan `<span data-angka="a3">Rp 33.214.000.000</span>`; resepnya (sumber, setelan,
// baris, kolom, format) di `payload.angka[a3]`. Teks di dalam span adalah satu-satunya sumber
// "angka sekarang" — resep tidak menyimpan salinannya, supaya keduanya tidak bisa berbeda.
// Word tidak tahu apa pun soal ini: isi span sudah teks akhirnya.
//
// MURNI: aman klien & server, tanpa jaringan/DB.

import { selDariNilai, formatBawaan, type FormatKolom, type HasilTarik, type JenisKolomSumber, type Tautan } from './tautan';
import { displayValue } from './tabel';

export const POLA_ID_ANGKA = /^[a-z0-9]{1,12}$/;
export const BATAS_ANGKA = 200;

export interface ResepAngka {
  sumber:      Tautan['sumber'];
  setelan:     Record<string, unknown>;
  kunciBaris:  string;
  kolom:       string;
  format:      FormatKolom;
  desimal?:    number;
  /** Untuk kalimat ringkasan — "Realisasi Keu (%) · RSJD Dr. Amino Gondohutomo". */
  labelBaris:  string;
  labelKolom:  string;
  ringkas:     string;
  ditarikPada: string;
}

/**
 * Format bawaan angka sebaris. Beda dengan tabel: kolom rupiah tabel tampil tanpa "Rp" karena
 * judul kolomnya sudah "(Rp)", sedangkan di kalimat tidak ada judul yang menjelaskannya.
 */
export function formatBawaanAngka(jenis: JenisKolomSumber): FormatKolom {
  return jenis === 'rp' ? 'rp' : formatBawaan(jenis);
}

/** Teks angka dari hasil tarikan; `null` = baris atau kolomnya sudah tidak ada di sumber. */
export function teksAngka(hasil: HasilTarik, resep: Pick<ResepAngka, 'kunciBaris' | 'kolom' | 'format' | 'desimal'>): string | null {
  const baris = hasil.baris.find(b => b.kunci === resep.kunciBaris);
  const kolom = hasil.kolom.find(k => k.kunci === resep.kolom);
  if (!baris || !kolom) return null;
  const sel = selDariNilai(baris.sel[kolom.kunci], kolom.jenis, resep.format, resep.desimal);
  return displayValue([[sel]], 0, 0).trim() || '—';
}

const ENTITAS: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const bukaEntitas = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITAS[e]);

/** id → teks angka di naskah (bentuk span-nya dijamin penyaring server). */
export function angkaDiHtml(html: string): Map<string, string> {
  const peta = new Map<string, string>();
  for (const m of html.matchAll(/<span data-angka="([a-z0-9]{1,12})"[^>]*>([^<]*)<\/span>/g)) {
    if (!peta.has(m[1])) peta.set(m[1], bukaEntitas(m[2]));
  }
  return peta;
}

/** Resep yang span-nya sudah dihapus dari naskah tidak dibawa (tidak menumpuk). */
export function resepTerpakai(html: string, angka: Record<string, ResepAngka>): Record<string, ResepAngka> {
  const ada = angkaDiHtml(html);
  return Object.fromEntries(Object.entries(angka).filter(([id]) => ada.has(id)));
}

export function idAngkaBaru(terpakai: Iterable<string>): string {
  const ada = new Set(terpakai);
  for (let n = ada.size + 1; ; n++) {
    const id = `a${n.toString(36)}`;
    if (!ada.has(id)) return id;
  }
}

export interface BandingAngka {
  id:     string;
  label:  string;
  lama:   string;
  /** `null` = baris/kolomnya tidak ditemukan lagi di sumber. */
  baru:   string | null;
  status: 'sama' | 'berubah' | 'hilang';
}

/** Kunci satu tarikan — angka dari resep sumber yang sama cukup ditarik sekali. */
export const kunciTarikan = (r: Pick<ResepAngka, 'sumber' | 'setelan'>) => JSON.stringify([r.sumber, r.setelan]);

/** Angka di naskah vs sumbernya sekarang. `hasilPer` dipetakan lewat `kunciTarikan`. */
export function bandingAngka(html: string, angka: Record<string, ResepAngka>, hasilPer: Map<string, HasilTarik>): BandingAngka[] {
  const diNaskah = angkaDiHtml(html);
  return [...diNaskah.entries()].flatMap(([id, lama]) => {
    const r = angka[id];
    if (!r) return [];
    const hasil = hasilPer.get(kunciTarikan(r));
    if (!hasil) return [];
    const baru = teksAngka(hasil, r);
    const label = `${r.labelKolom} · ${r.labelBaris}`;
    return [{ id, label, lama, baru, status: baru === null ? 'hilang' as const : baru === lama ? 'sama' as const : 'berubah' as const }];
  });
}

/** Kalimat ringkas untuk dialog Perbarui & panel Periksa. */
export function kalimatAngka(banding: BandingAngka[]): string {
  const berubah = banding.filter(b => b.status === 'berubah');
  const hilang = banding.filter(b => b.status === 'hilang');
  const bagian: string[] = [];
  if (berubah.length) {
    bagian.push(`${berubah.length} angka berubah (${berubah.slice(0, 3).map(b => `${b.label}: ${b.lama} → ${b.baru}`).join('; ')}${berubah.length > 3 ? '; …' : ''})`);
  }
  if (hilang.length) {
    bagian.push(`${hilang.length} angka tidak ditemukan lagi di sumbernya (${hilang.slice(0, 3).map(b => b.label).join('; ')}${hilang.length > 3 ? '; …' : ''}) — teksnya dibiarkan`);
  }
  return bagian.length ? bagian.join(' · ') : 'Tidak ada yang berubah.';
}
