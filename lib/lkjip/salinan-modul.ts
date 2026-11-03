// lib/lkjip/salinan-modul.ts — "Salin ke LKJIP": tabel layar modul (Cetak E-Anggaran, Cetak Renaksi,
// Laporan per Sumber Dana) disalin ke papan klip BERSAMA resepnya, lalu ditempel di LKJIP sebagai
// tabel tertaut — seperti tabel Google Sheets yang ditempel ke Google Docs dengan "tautkan".
// Konsep: docs/CONCEPT-lkjip-tabel-dari-modul.md
//
// Papan klip membawa tabel HTML biasa (Word/Excel tetap bisa menempelnya) + atribut
// `data-prima-salinan` berisi resep (sumber, setelan, kolom). Resep itu masukan dari LUAR: dibaca
// dengan hati-hati di sini, dan angkanya TIDAK pernah dipakai — LKJIP menarik ulang dari modulnya
// dengan akses orang yang menempel. MURNI: aman klien & server.

import type { IdSumber } from './sumber';
import type { KolomSumber, KolomTaut } from './tautan';
import type { KolomTemplat, TemplatTabel } from './sumber/templat';
import { BATAS_KOLOM_TABEL } from './tabel';

export const ATRIBUT_SALINAN = 'data-prima-salinan';
const SUMBER_SAH: readonly IdSumber[] = ['kinerja-rekap', 'kinerja-laporan', 'kinerja-detail', 'renaksi-cetak', 'blud-realisasi', 'pk'];
const BATAS_KOLOM_SALINAN = 40;

export interface KelompokSalinan { judul: string; dari: number; sampai: number }
export interface SalinanModul {
  v:        1;
  sumber:   IdSumber;
  setelan:  Record<string, unknown>;
  /** Kunci kolom sumber, urut seperti tabel di layar modul. */
  kolom:    string[];
  /** Judul kolom seperti di layar modul (boleh beda dari label katalog, mis. "T"/"R" di bawah "TW I"). */
  judulKolom?: string[];
  kelompok?: KelompokSalinan[];
  judul:    string;
}

function keBase64(teks: string): string {
  const bita = new TextEncoder().encode(teks);
  let biner = '';
  for (const b of bita) biner += String.fromCharCode(b);
  return btoa(biner);
}
function dariBase64(b64: string): string {
  const biner = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(biner, ch => ch.charCodeAt(0)));
}

/** HTML papan klip: tabel layar dibungkus elemen bertanda resep. */
export function htmlSalinan(s: SalinanModul, tabelHtml: string): string {
  return `<div ${ATRIBUT_SALINAN}="${keBase64(JSON.stringify(s))}">${tabelHtml}</div>`;
}

const teksPendek = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

/** Resep dari HTML papan klip — `null` kalau bukan salinan PRIMA atau isinya tidak masuk akal. */
export function bacaSalinan(html: string): SalinanModul | null {
  const m = new RegExp(`${ATRIBUT_SALINAN}="([A-Za-z0-9+/=]{1,12000})"`).exec(html);
  if (!m) return null;
  let o: Record<string, unknown>;
  try {
    const v = JSON.parse(dariBase64(m[1])) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    o = v as Record<string, unknown>;
  } catch { return null; }
  if (o.v !== 1 || !SUMBER_SAH.includes(o.sumber as IdSumber)) return null;
  if (!o.setelan || typeof o.setelan !== 'object' || Array.isArray(o.setelan) || JSON.stringify(o.setelan).length > 4000) return null;
  if (!Array.isArray(o.kolom) || o.kolom.length === 0 || o.kolom.length > BATAS_KOLOM_SALINAN
    || !o.kolom.every(k => typeof k === 'string' && k.length > 0 && k.length <= 64)) return null;
  const kolom = o.kolom as string[];
  const judulKolom = Array.isArray(o.judulKolom) && o.judulKolom.length === kolom.length
    ? o.judulKolom.map(j => teksPendek(j, 255)) : undefined;
  const kelompok = Array.isArray(o.kelompok)
    ? (o.kelompok as Record<string, unknown>[]).flatMap(k => {
        const dari = Number(k?.dari), sampai = Number(k?.sampai);
        return Number.isInteger(dari) && Number.isInteger(sampai) && dari >= 0 && sampai >= dari && sampai < kolom.length
          ? [{ judul: teksPendek(k.judul, 255), dari, sampai }] : [];
      }).slice(0, 20)
    : undefined;
  return {
    v: 1, sumber: o.sumber as IdSumber, setelan: o.setelan as Record<string, unknown>, kolom,
    ...(judulKolom ? { judulKolom } : {}), ...(kelompok?.length ? { kelompok } : {}),
    judul: teksPendek(o.judul, 255),
  };
}

const rataKanan = (jenis: KolomSumber['jenis'] | undefined) => (jenis && jenis !== 'teks' ? 'right' : 'left');

/**
 * Kolom yang dipakai (`aktif`, sejajar `s.kolom`) → kepala bertingkat ikut dipetakan: kelompok yang
 * kehilangan semua kolomnya hilang, sisanya merapat. Batas tabel LKJIP 12 kolom (`BATAS_KOLOM_TABEL`).
 */
export function templatDariSalinan(s: SalinanModul, katalog: readonly KolomSumber[], aktif: readonly boolean[]): TemplatTabel {
  const perKunci = new Map(katalog.map(k => [k.kunci, k]));
  const pakai = s.kolom.flatMap((kunci, i) => (aktif[i] ? [i] : []));
  const kolom: KolomTemplat[] = pakai.map(i => {
    const k = perKunci.get(s.kolom[i]);
    const taut: KolomTaut = { isi: { jenis: 'sumber', kunci: s.kolom[i] } };
    return { judul: s.judulKolom?.[i] || k?.label || s.kolom[i], align: rataKanan(k?.jenis), taut };
  });
  const kelompok = (s.kelompok ?? []).flatMap(g => {
    const posisi = pakai.flatMap((i, j) => (i >= g.dari && i <= g.sampai ? [j] : []));
    return posisi.length ? [{ judul: g.judul, dari: posisi[0], sampai: posisi[posisi.length - 1] }] : [];
  });
  return {
    id: 'salinan', label: s.judul || 'Tabel dari modul', keterangan: '',
    sumber: s.sumber, setelan: s.setelan, kolom, ...(kelompok.length ? { kelompok } : {}),
  };
}

/** Centang awal: semua kolom, atau 12 pertama kalau tabel modulnya lebih lebar dari tabel LKJIP. */
export const centangAwalSalinan = (s: SalinanModul): boolean[] => s.kolom.map((_, i) => i < BATAS_KOLOM_TABEL);

export const LEWAT_BATAS_KOLOM = (n: number) =>
  `Tabel modul ini ${n} kolom, tabel LKJIP paling banyak ${BATAS_KOLOM_TABEL}. Centang kolom yang dipakai.`;
