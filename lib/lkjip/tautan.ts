// lib/lkjip/tautan.ts — tabel LKJIP yang tertaut ke modul (E-Anggaran Rekap, Renaksi Cetak).
// Konsep: docs/CONCEPT-lkjip-tabel-tertaut.md
//
// "Salinan bertaut": blok menyimpan RESEP (`Tautan`) + hasil tarikan terakhir sebagai sel biasa,
// jadi Word (docgen) tidak perlu tahu apa pun soal tautan. Di sini badan tabel disusun dari baris
// sumber + resep, dan hasil Perbarui dibandingkan dulu sebelum ditulis. Kepala tabel (header
// bertingkat, gabung sel judul) milik pengguna — tidak pernah disentuh berkas ini.
//
// MURNI: aman klien & server, tanpa jaringan/DB.

import { nilaiRumus, colLabel, sanitizeRows, hapusKolom, angkaKetikanId, FUNCS, RUJUKAN_HILANG, BATAS_KOLOM_TABEL, BATAS_BARIS_TABEL, type TabelCell, type TabelNumFmt, type TabelAlign } from './tabel';
import { bulatkanDesimal, tulisDesimal } from '@/lib/shared/desimal';

export const BATAS_KOLOM = BATAS_KOLOM_TABEL;
export const BATAS_BARIS = BATAS_BARIS_TABEL;
/** Batas skema `barisTangan` — layar menolak sisipan ke-201, bukan server sesudah barisnya terlanjur tampil. */
export const BATAS_BARIS_TANGAN = 200;
/** Sel yang tidak bisa dihitung: Progres Negatif belum diisi, rumus gagal (bagi nol, kolom kosong). */
export const KOSONG = '—';
const INDENT = '    ';

export type JenisKolomSumber = 'teks' | 'angka' | 'rp' | 'persen';
export interface KolomSumber { kunci: string; label: string; jenis: JenisKolomSumber; grup?: string }
export interface BarisSumber {
  /** Identitas yang bertahan lintas Perbarui (baris tersembunyi & ringkasan perubahan bergantung padanya). */
  kunci:  string;
  label:  string;
  sel:    Record<string, string | number | null>;
  indent?: number;
  tebal?:  boolean;
}
export interface HasilTarik {
  kolom:   KolomSumber[];
  baris:   BarisSumber[];
  catatan: string[];
  ringkas: string;
  /** Pilihan setelan yang baru diketahui sesudah menarik (mis. Pihak Pertama PK). */
  pilihan?: Record<string, string[]>;
  /**
   * Kabar yang TIDAK mengubah angka tabel — mis. sumber sudah punya versi lebih baru dari yang
   * sengaja dipakai (Murni). Tidak ikut dibandingkan Perbarui; hanya ditampilkan sebagai lencana.
   */
  info?: string[];
}

export type IsiKolom =
  | { jenis: 'sumber'; kunci: string }
  | { jenis: 'nomor' }
  | { jenis: 'rumus'; ekspresi: string }
  /** Diketik orangnya, diingat per KUNCI baris — ikut barisnya saat Perbarui mengubah urutan. */
  | { jenis: 'tangan'; nilai: Record<string, string> };
export type FormatKolom = 'teks' | 'angka' | 'rp' | 'persen';
export interface KolomTaut {
  isi:         IsiKolom;
  format?:     FormatKolom;
  desimal?:    number;
  /** Gabung baris berurutan yang isinya sama — pengganti gabung sel manual di badan (konsep §6.3). */
  gabungSama?: boolean;
  /** Uraian menjorok sesuai tingkat baris sumber (Rekap E-Anggaran). */
  bertingkat?: boolean;
}

/**
 * Baris yang diketik sendiri di tabel tertaut (klik kanan → Sisip baris tangan). Ditambatkan SESUDAH
 * baris sumber `setelah` (null = paling atas badan) dan bertahan saat Perbarui; `sel` sejajar `kolom`
 * (kolom Nomor & rumus dihitung, isinya diabaikan). Kunci barisnya di `kunciBaris` = `tangan:<id>`.
 */
export interface BarisTangan { id: string; setelah: string | null; sel: string[] }
export const AWALAN_BARIS_TANGAN = 'tangan:';
export const kunciBarisTangan = (id: string) => AWALAN_BARIS_TANGAN + id;
export const adalahBarisTangan = (kunci: string | undefined): boolean => !!kunci && kunci.startsWith(AWALAN_BARIS_TANGAN);

export interface Tautan {
  sumber:      'kinerja-rekap' | 'renaksi-cetak' | 'kinerja-laporan' | 'blud-realisasi' | 'pk' | 'kinerja-detail';
  setelan:     Record<string, unknown>;
  /** Sejajar dengan `kolom` tabel — pemetaan menempel pada KOLOM, bukan posisi. */
  kolom:       KolomTaut[];
  /** Sejajar dengan baris badan (sesudah `headerRows`). */
  kunciBaris:  string[];
  sembunyi:    string[];
  tebalInduk:  boolean;
  ditarikPada: string;
  ringkas:     string;
  catatan:     string[];
  barisTangan?: BarisTangan[];
}

export function formatBawaan(jenis: JenisKolomSumber): FormatKolom {
  return jenis === 'persen' ? 'persen' : jenis === 'teks' ? 'teks' : 'angka';
}

/** Desimal yang memang dimiliki angkanya (maks. 2) — 7,5 tetap "7,5", bukan "7,50". */
function desimalOtomatis(n: number): number {
  const s = String(bulatkanDesimal(n, 2));
  const titik = s.indexOf('.');
  return titik < 0 ? 0 : s.length - titik - 1;
}

/**
 * Satu nilai sumber → sel. Persen SUMBER disimpan ×100 (55,07) sedangkan sel `pct` LKJIP
 * beraturan Excel (0,5 → 50%), jadi dibagi 100 — tanpa itu tampil 5507%.
 */
export function selDariNilai(
  nilai: string | number | null | undefined, jenis: JenisKolomSumber, format: FormatKolom, desimal?: number,
): TabelCell {
  if (nilai == null || (typeof nilai === 'number' && !Number.isFinite(nilai))) {
    return { v: format === 'persen' || jenis === 'persen' ? KOSONG : '' };
  }
  if (typeof nilai === 'string') return { v: nilai };
  if (format === 'teks') return { v: tulisDesimal(nilai) };
  const n = format === 'persen' && jenis === 'persen' ? nilai / 100 : nilai;
  const nf: TabelNumFmt = format === 'rp' ? 'rp' : format === 'persen' ? 'pct' : 'num';
  const dec = desimal ?? (format === 'persen' ? 2 : jenis === 'rp' || format === 'rp' ? 0 : desimalOtomatis(nilai));
  return { v: String(n), nf, dec };
}

function indeksKolom(huruf: string): number {
  let c = 0;
  for (const ch of huruf.toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
  return c - 1;
}

const TOKEN_RUMUS = /[A-Za-z]+\d+|[A-Za-z]+|\d+\.?\d*|\.\d+|>=|<=|<>|!=|==|[-+*/^(),:%<>=]|\S/g;
const OPERATOR = /^(>=|<=|<>|!=|==|[-+*/^(),:%<>=])$/;
const ANGKA = /^\d+\.?\d*$|^\.\d+$/;

export type PeriksaRumus = { rujukan: number[]; terjemahan: string } | { galat: string };

/**
 * T4: rumus kolom (`=C-D`) mengikuti kolomnya saat kolom dipindah atau dihapus di modal.
 * `peta[lama]` = indeks baru, `null` = kolomnya dihapus → `#REF!` (Masukkan ditahan sampai ditulis ulang).
 * Dulu memindah kolom C membuat rumus diam-diam menunjuk kolom lain.
 */
export function petakanRumusKolom(ekspresi: string, peta: (number | null)[]): string {
  const toks = ekspresi.match(TOKEN_RUMUS) ?? [];
  let keluar = '', i = 0, pos = 0;
  for (const t of toks) {
    const di = ekspresi.indexOf(t, pos);
    keluar += ekspresi.slice(pos, di);
    pos = di + t.length;
    const huruf = /^[A-Za-z]+$/.test(t) && toks[i + 1] !== '(' && !FUNCS.has(t.toUpperCase());
    i++;
    if (!huruf) { keluar += t; continue; }
    const baru = peta[indeksKolom(t)];
    keluar += baru === undefined ? t : baru === null ? RUJUKAN_HILANG : colLabel(baru);
  }
  return keluar + ekspresi.slice(pos);
}

/**
 * Rumus kolom ditulis dengan HURUF kolom tanpa nomor baris (`=C-D`), berlaku untuk tiap baris.
 * `terjemahan` = rumus sel untuk tabel satu baris (`C1-D1`), dihitung evaluator tabel yang sama.
 */
export function periksaRumusKolom(ekspresi: string, ncol: number, kolomSendiri: number): PeriksaRumus {
  const teks = ekspresi.trim().replace(/^=/, '').trim();
  if (!teks) return { galat: 'Rumus masih kosong.' };
  if (teks.includes(RUJUKAN_HILANG)) return { galat: 'Rumus merujuk kolom yang sudah dihapus — tulis ulang rumusnya.' };
  const toks = teks.match(TOKEN_RUMUS) ?? [];
  const rujukan = new Set<number>();
  const keluar: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^[A-Za-z]+\d+$/.test(t)) {
      return { galat: `Tulis huruf kolomnya saja (mis. ${t.replace(/\d+$/, '').toUpperCase()}, bukan ${t.toUpperCase()}) — rumus berlaku untuk tiap baris.` };
    }
    if (/^[A-Za-z]+$/.test(t)) {
      const huruf = t.toUpperCase();
      if (toks[i + 1] === '(') {
        if (!FUNCS.has(huruf)) return { galat: `Fungsi ${huruf} tidak dikenal. Yang tersedia: ${[...FUNCS].join(', ')}.` };
        keluar.push(huruf);
        continue;
      }
      const c = indeksKolom(huruf);
      if (c < 0 || c >= ncol) return { galat: `Kolom ${huruf} tidak ada — tabel ini kolom A sampai ${colLabel(ncol - 1)}.` };
      if (c === kolomSendiri) return { galat: 'Rumus tidak boleh merujuk kolomnya sendiri.' };
      // Rentang C:E → semua kolom di antaranya ikut dirujuk.
      if (toks[i + 1] === ':' && /^[A-Za-z]+$/.test(toks[i + 2] ?? '')) {
        const akhir = indeksKolom(toks[i + 2]);
        if (akhir < 0 || akhir >= ncol) return { galat: `Kolom ${toks[i + 2].toUpperCase()} tidak ada — tabel ini kolom A sampai ${colLabel(ncol - 1)}.` };
        for (let k = Math.min(c, akhir); k <= Math.max(c, akhir); k++) {
          if (k === kolomSendiri) return { galat: 'Rumus tidak boleh merujuk kolomnya sendiri.' };
          rujukan.add(k);
        }
        keluar.push(`${huruf}1:${toks[i + 2].toUpperCase()}1`);
        i += 2;
        continue;
      }
      rujukan.add(c);
      keluar.push(`${huruf}1`);
      continue;
    }
    if (ANGKA.test(t) || OPERATOR.test(t)) { keluar.push(t); continue; }
    // `$` sengaja tidak diterima: rumus kolom berlaku per baris dan hurufnya diganti otomatis saat kolom
    // dipindah — rujukan absolut tidak punya arti di sini (beda dgn rumus sel, yang menerimanya).
    if (t === '$') return { galat: 'Tanda $ tidak dipakai di rumus kolom — tulis huruf kolomnya saja (mis. C-D, bukan $C-$D).' };
    return { galat: `Tanda "${t}" tidak dikenal di rumus.` };
  }
  return { rujukan: [...rujukan].sort((a, b) => a - b), terjemahan: keluar.join('') };
}

/**
 * Sel berformat menyimpan angka MESIN (tarikan modul, sel rumus, ketikan di sel berformat); sel polos
 * berisi ketikan orang — isian tangan "1.250.000" dulu dibaca `Number()` → NaN → rumusnya "—".
 */
function angkaSel(sel: TabelCell | undefined): number | null {
  const v = (sel?.v ?? '').trim();
  if (v === '' || v === KOSONG) return null;
  if (!sel?.nf) return angkaKetikanId(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Kolom rumus satu baris. Dihitung saat ditarik dan disimpan sebagai ANGKA (Word tidak pernah
 * menerima rumus). Rujukan kosong atau gagal hitung → "—", bukan 0 dan bukan "#ERR": `#ERR` dari
 * `displayValue` akan tercetak di dokumen resmi, 0 menyamarkan data yang belum ada.
 */
function hitungRumusBaris(baris: TabelCell[], kolom: KolomTaut[]): void {
  const ncol = kolom.length;
  const periksa = kolom.map((k, c) => (k.isi.jenis === 'rumus' ? periksaRumusKolom(k.isi.ekspresi, ncol, c) : null));
  const selesai = new Set<number>();
  kolom.forEach((k, c) => { if (k.isi.jenis !== 'rumus') selesai.add(c); });
  let maju = true;
  while (maju) {
    maju = false;
    periksa.forEach((p, c) => {
      if (!p || selesai.has(c)) return;
      if ('galat' in p) { baris[c] = { v: KOSONG }; selesai.add(c); maju = true; return; }
      if (!p.rujukan.every(r => selesai.has(r))) return;
      selesai.add(c); maju = true;
      if (p.rujukan.some(r => angkaSel(baris[r]) === null)) { baris[c] = { v: KOSONG }; return; }
      // Sel bantu berformat angka → dibaca sebagai angka MESIN ("0.125" bukan "125" gaya ribuan).
      const satuBaris: TabelCell[][] = [baris.map((s, i) => (i === c ? { v: `=${p.terjemahan}` } : { v: String(angkaSel(s) ?? ''), nf: 'num' as const }))];
      const hasil = nilaiRumus(satuBaris, 0, c);
      const k = kolom[c];
      baris[c] = Number.isFinite(hasil)
        ? selDariNilai(hasil, 'angka', k.format ?? 'angka', k.desimal)
        : { v: KOSONG };
    });
  }
  // Yang tersisa saling merujuk (siklus) — tak punya jawaban.
  periksa.forEach((p, c) => { if (p && !selesai.has(c)) baris[c] = { v: KOSONG }; });
}

/**
 * Gabung otomatis gaya pivot: hanya baris BERURUTAN yang isinya sama & tidak kosong, dan hanya di
 * dalam gabungan kolom ber-gabung di KIRINYA — dua kegiatan bernama sama di bawah dua program
 * berbeda tidak tergabung. Dihitung ulang tiap Perbarui, jadi tidak bisa salah tempat seperti
 * gabungan manual "baris 1 s/d 3".
 */
function gabungOtomatis(rows: TabelCell[][], kolom: KolomTaut[]): void {
  let segmen: [number, number][] = rows.length ? [[0, rows.length]] : [];
  kolom.forEach((k, c) => {
    // Isian tangan tidak digabung: sel yang tertutup gabungan akan kehilangan ketikannya.
    if (!k.gabungSama || k.isi.jenis === 'tangan') return;
    const baru: [number, number][] = [];
    for (const [awal, akhir] of segmen) {
      let i = awal;
      while (i < akhir) {
        const v = rows[i][c].v;
        let j = i + 1;
        if (v !== '' && v !== KOSONG) while (j < akhir && rows[j][c].v === v) j++;
        if (j - i > 1) {
          rows[i][c] = { ...rows[i][c], rs: j - i };
          for (let r = i + 1; r < j; r++) rows[r][c] = { v: '', h: true };
        }
        baru.push([i, j]);
        i = j;
      }
    }
    segmen = baru;
  });
}

export interface HasilBadan {
  rows:        TabelCell[][];
  kunciBaris:  string[];
  /** Indeks kolom LKJIP yang menunjuk kolom sumber yang tidak ada lagi (mis. setelan Renaksi berubah). */
  kolomHilang: number[];
  galatRumus:  { kolom: number; pesan: string }[];
  /** Baris tangan yang baris tambatannya sudah tidak ada di sumber — ditaruh di akhir badan. */
  barisTanganPindah: string[];
}

type BarisBadan = { jenis: 'sumber'; b: BarisSumber } | { jenis: 'tangan'; t: BarisTangan };

/**
 * Urutan badan: baris tangan berjangkar `null` paling atas, lalu tiap baris sumber diikuti baris
 * tangan yang ditambatkan padanya — termasuk baris sumber yang DISEMBUNYIKAN, jadi menyembunyikan
 * baris tidak memindahkan ketikan orang. Jangkar yang hilang dari sumber → akhir badan.
 */
function urutanBadan(hasil: HasilTarik, sembunyi: Set<string>, tangan: readonly BarisTangan[]): { urut: BarisBadan[]; pindah: string[] } {
  const perJangkar = new Map<string | null, BarisTangan[]>();
  for (const t of tangan) perJangkar.set(t.setelah, [...(perJangkar.get(t.setelah) ?? []), t]);
  const ikut = (k: string | null) => (perJangkar.get(k) ?? []).map(t => ({ jenis: 'tangan' as const, t }));
  const urut: BarisBadan[] = [...ikut(null)];
  for (const b of hasil.baris) {
    if (!sembunyi.has(b.kunci)) urut.push({ jenis: 'sumber', b });
    urut.push(...ikut(b.kunci));
  }
  const ada = new Set(hasil.baris.map(b => b.kunci));
  const yatim = tangan.filter(t => t.setelah !== null && !ada.has(t.setelah));
  urut.push(...yatim.map(t => ({ jenis: 'tangan' as const, t })));
  return { urut, pindah: yatim.map(t => t.id) };
}

/**
 * Sel baris tangan di kolom sumber memakai format angka kolomnya (dari sel sumber pertama yang
 * berformat) — tanpa itu ketikan 250000000 tampil mentah di samping 1.800.000.000. Dipakai bangun
 * ulang DAN aksi lokal: `selSama` membandingkan nf/dec, beda format = lencana "berubah" palsu.
 */
function pasangFormatTangan(rows: TabelCell[][], kunciBaris: readonly string[], kolom: readonly KolomTaut[]): void {
  kolom.forEach((k, c) => {
    if (k.isi.jenis !== 'sumber') return;
    const contoh = rows.find((r, i) => !adalahBarisTangan(kunciBaris[i]) && r[c]?.nf && !r[c].h)?.[c];
    if (!contoh) return;
    rows.forEach((r, i) => {
      if (!adalahBarisTangan(kunciBaris[i])) return;
      r[c] = { ...r[c], nf: contoh.nf };
      if (contoh.dec === undefined) delete r[c].dec; else r[c].dec = contoh.dec;
    });
  });
}

export function bangunBadan(hasil: HasilTarik, resep: Pick<Tautan, 'kolom' | 'sembunyi' | 'tebalInduk' | 'barisTangan'>): HasilBadan {
  const ncol = resep.kolom.length;
  const sumber = new Map(hasil.kolom.map(k => [k.kunci, k]));
  const sembunyi = new Set(resep.sembunyi);
  const { urut: tampil, pindah } = urutanBadan(hasil, sembunyi, resep.barisTangan ?? []);
  const kolomHilang: number[] = [];
  const galatRumus: HasilBadan['galatRumus'] = [];
  resep.kolom.forEach((k, i) => {
    if (k.isi.jenis === 'sumber' && !sumber.has(k.isi.kunci)) kolomHilang.push(i);
    if (k.isi.jenis === 'rumus') {
      const p = periksaRumusKolom(k.isi.ekspresi, ncol, i);
      if ('galat' in p) galatRumus.push({ kolom: i, pesan: p.galat });
    }
  });
  const kunciBaris = tampil.map(x => (x.jenis === 'tangan' ? kunciBarisTangan(x.t.id) : x.b.kunci));
  const rows = tampil.map((x, urut) => {
    if (x.jenis === 'tangan') {
      return resep.kolom.map((k, c): TabelCell => (
        k.isi.jenis === 'nomor' ? { v: String(urut + 1) } : k.isi.jenis === 'rumus' ? { v: '' } : { v: x.t.sel[c] ?? '' }));
    }
    const b = x.b;
    const baris: TabelCell[] = resep.kolom.map(k => {
      if (k.isi.jenis === 'nomor') return { v: String(urut + 1) };
      if (k.isi.jenis === 'rumus') return { v: '' };
      if (k.isi.jenis === 'tangan') return { v: k.isi.nilai[b.kunci] ?? '' };
      const ks = sumber.get(k.isi.kunci);
      if (!ks) return { v: '' };
      const sel = selDariNilai(b.sel[ks.kunci], ks.jenis, k.format ?? formatBawaan(ks.jenis), k.desimal);
      if (k.bertingkat && b.indent && !sel.nf && sel.v) sel.v = INDENT.repeat(b.indent) + sel.v;
      return sel;
    });
    hitungRumusBaris(baris, resep.kolom);
    if (resep.tebalInduk && b.tebal) baris.forEach(s => { s.b = true; });
    return baris;
  });
  pasangFormatTangan(rows, kunciBaris, resep.kolom);
  rows.forEach((r, i) => { if (adalahBarisTangan(kunciBaris[i])) hitungRumusBaris(r, resep.kolom); });
  gabungOtomatis(rows, resep.kolom);
  return { rows, kolomHilang, galatRumus, barisTanganPindah: pindah, kunciBaris };
}

export interface PayloadTabel {
  judul: string;
  kolom: string[];
  align: string[];
  colWidths?: number[];
  headerRows?: number;
  rows: TabelCell[][];
  tautan?: Tautan;
}

/**
 * Label kolom sumber bisa bergantung setelan ("Realisasi s/d Desember" BLUD). Judul yang masih
 * sama persis dengan label LAMA ikut label baru — tanpa ini tabel s/d April terbit berjudul
 * "s/d Desember". Judul yang sudah diketik orangnya dibiarkan. Tak ada yang berubah → larik sama.
 */
export function judulIkutSetelan<K extends { judul: string; taut: KolomTaut | null }>(
  kolom: K[], lama: readonly KolomSumber[], baru: readonly KolomSumber[],
): K[] {
  const labelLama = new Map(lama.map(k => [k.kunci, k.label]));
  const labelBaru = new Map(baru.map(k => [k.kunci, k.label]));
  let berubah = false;
  const hasil = kolom.map(k => {
    if (k.taut?.isi.jenis !== 'sumber') return k;
    const l = labelLama.get(k.taut.isi.kunci);
    const b = labelBaru.get(k.taut.isi.kunci);
    if (!l || !b || l === b || k.judul.trim() !== l) return k;
    berubah = true;
    return { ...k, judul: b };
  });
  return berubah ? hasil : kolom;
}

export function jumlahBarisKepala(p: Pick<PayloadTabel, 'headerRows' | 'rows'>): number {
  return Math.max(0, Math.min(p.headerRows ?? 0, p.rows.length));
}

/** Kepala tabel milik pengguna + badan hasil tarikan. `null` = melewati batas baris blok tabel. */
export function pasangBadan(payload: PayloadTabel, badan: HasilBadan): TabelCell[][] | null {
  const hr = jumlahBarisKepala(payload);
  if (hr + badan.rows.length > BATAS_BARIS) return null;
  return sanitizeRows([...payload.rows.slice(0, hr), ...badan.rows], payload.kolom.length);
}

export function pesanLewatBatas(jumlahBadan: number, jumlahKepala: number): string {
  return `Tabel jadi ${jumlahBadan + jumlahKepala} baris, batas satu tabel ${BATAS_BARIS}. `
    + 'Pilih kedalaman yang lebih dangkal atau sembunyikan sebagian baris.';
}

export interface RingkasPerbarui {
  angkaBerubah: number;
  barisBaru:    string[];
  barisHilang:  string[];
  /** Baris yang sama hadir tapi urutannya bergeser (mis. nama program diurutkan ulang di sumber). */
  urutanBerubah: boolean;
  /** Kunci & urutan sama, tak satu sel pun berbeda — Perbarui tidak perlu menulis apa pun. */
  sama:         boolean;
}

const labelBaris = (row: TabelCell[]): string =>
  row.map(s => s.v.trim()).find(v => v !== '' && v !== KOSONG && !Number.isFinite(Number(v))) ?? '(tanpa uraian)';
const selSama = (a: TabelCell | undefined, b: TabelCell | undefined) =>
  (a?.v ?? '') === (b?.v ?? '') && (a?.nf ?? null) === (b?.nf ?? null) && (a?.dec ?? null) === (b?.dec ?? null)
  && (a?.rs ?? 1) === (b?.rs ?? 1) && !!a?.h === !!b?.h && !!a?.b === !!b?.b;

/**
 * Badan lama vs baru, dicocokkan per KUNCI baris (bukan nomor urut). Kolom Nomor urut tidak
 * dihitung: ia bergeser sendiri begitu ada baris hilang, dan "3 sel berubah" untuk satu baris
 * yang hilang menyesatkan pembacanya.
 */
export function bandingPerbarui(
  lama: { rows: TabelCell[][]; kunciBaris: string[] },
  baru: { rows: TabelCell[][]; kunciBaris: string[] },
  kolom: KolomTaut[] = [],
): RingkasPerbarui {
  const nomor = new Set(kolom.flatMap((k, i) => (k.isi.jenis === 'nomor' ? [i] : [])));
  const posLama = new Map(lama.kunciBaris.map((k, i) => [k, i]));
  const posBaru = new Map(baru.kunciBaris.map((k, i) => [k, i]));
  let angkaBerubah = 0;
  const barisBaru: string[] = [];
  baru.kunciBaris.forEach((k, i) => {
    const j = posLama.get(k);
    if (j === undefined) { barisBaru.push(labelBaris(baru.rows[i])); return; }
    const a = lama.rows[j] ?? [], b = baru.rows[i] ?? [];
    for (let c = 0; c < Math.max(a.length, b.length); c++) if (!nomor.has(c) && !selSama(a[c], b[c])) angkaBerubah++;
  });
  const barisHilang = lama.kunciBaris.filter(k => !posBaru.has(k)).map(k => labelBaris(lama.rows[posLama.get(k)!] ?? []));
  const urutanSama = lama.kunciBaris.length === baru.kunciBaris.length && lama.kunciBaris.every((k, i) => baru.kunciBaris[i] === k);
  const bertahan = baru.kunciBaris.filter(k => posLama.has(k));
  const urutanBerubah = bertahan.some((k, i) => i > 0 && posLama.get(k)! < posLama.get(bertahan[i - 1])!);
  return { angkaBerubah, barisBaru, barisHilang, urutanBerubah, sama: urutanSama && angkaBerubah === 0 };
}

/**
 * Sebab urutan Renaksi Cetak bergeser tanpa angka berubah: tautan indikator induk menaruh kegiatan
 * di bawah indikator program yang dijabarkannya (konsep tautan-lanjutan §8).
 */
export const KALIMAT_URUTAN_RENAKSI =
  'Urutan baris mengikuti Rencana Aksi (kegiatan kini di bawah indikator program yang dijabarkannya). Angka tidak berubah.';

/** Hanya urutan yang bergeser: tak ada sel berubah, baris baru, maupun baris hilang. */
export function hanyaUrutan(r: RingkasPerbarui): boolean {
  return r.urutanBerubah && !r.angkaBerubah && !r.barisBaru.length && !r.barisHilang.length;
}

/** Kalimat ringkasan Perbarui — satu fungsi untuk dialog, pengingat, & uji. */
export function kalimatPerbarui(r: RingkasPerbarui, sumber?: Tautan['sumber']): string {
  if (sumber === 'renaksi-cetak' && hanyaUrutan(r)) return KALIMAT_URUTAN_RENAKSI;
  const bagian: string[] = [];
  if (r.angkaBerubah) bagian.push(`${r.angkaBerubah} sel berubah`);
  if (r.barisBaru.length) bagian.push(`${r.barisBaru.length} baris baru (${r.barisBaru.slice(0, 3).join('; ')}${r.barisBaru.length > 3 ? '; …' : ''})`);
  if (r.barisHilang.length) bagian.push(`${r.barisHilang.length} baris hilang (${r.barisHilang.slice(0, 3).join('; ')}${r.barisHilang.length > 3 ? '; …' : ''})`);
  if (r.urutanBerubah) bagian.push('urutan baris berubah');
  return bagian.length ? bagian.join(' · ') : 'Tidak ada yang berubah.';
}

/**
 * Resep dengan isian tangan yang SEKARANG ada di badan tabel (`badan` = baris sesudah kepala,
 * sejajar `kunciBaris`). Baris yang disembunyikan tidak ada di badan, jadi isiannya dibiarkan
 * apa adanya di peta — menampilkannya lagi memunculkan ketikannya lagi.
 */
/** Isi sel seperti yang terlihat: sel yang tertutup gabung-sama (`h`, isinya kosong) = isi sel puncaknya. */
function nilaiTampak(badan: TabelCell[][], r: number, c: number): string {
  for (let i = r; i >= 0; i--) {
    const s = badan[i]?.[c];
    if (!s) return '';
    if (!s.h) return i === r || (s.rs ?? 1) > r - i ? s.v : '';
  }
  return '';
}

/**
 * Kolom rumus di baris tangan dihitung dari ketikannya saat itu juga, dengan fungsi yang sama dgn
 * bangun ulang — menunggu Perbarui membuat Periksa otomatis melapor "berubah" palsu.
 */
export function hitungRumusTangan(rows: TabelCell[][], headerRows: number, t: Pick<Tautan, 'kolom' | 'kunciBaris'>): TabelCell[][] {
  if (!t.kolom.some(k => k.isi.jenis === 'rumus') || !t.kunciBaris.some(adalahBarisTangan)) return rows;
  return rows.map((r, i) => {
    if (i < headerRows || !adalahBarisTangan(t.kunciBaris[i - headerRows])) return r;
    const baris = r.map(s => ({ ...s }));
    hitungRumusBaris(baris, t.kolom);
    return baris;
  });
}

export function ambilIsianTangan(t: Tautan, badan: TabelCell[][]): Tautan {
  const adaTangan = t.kolom.some(k => k.isi.jenis === 'tangan');
  if (!adaTangan && !t.barisTangan?.length) return t;
  // Baris tangan menyimpan ketikannya di `barisTangan[].sel` — termasuk sel di kolom isian tangan.
  const posTangan = new Map(t.kunciBaris.map((k, i) => [k, i]));
  const barisTangan = t.barisTangan?.map(bt => {
    const i = posTangan.get(kunciBarisTangan(bt.id));
    if (i === undefined) return bt;
    return { ...bt, sel: t.kolom.map((k, c) => (k.isi.jenis === 'nomor' || k.isi.jenis === 'rumus' ? '' : nilaiTampak(badan, i, c))) };
  });
  return {
    ...t,
    ...(barisTangan ? { barisTangan } : {}),
    kolom: !adaTangan ? t.kolom : t.kolom.map((k, c) => {
      if (k.isi.jenis !== 'tangan') return k;
      const nilai = { ...k.isi.nilai };
      t.kunciBaris.forEach((kunci, i) => {
        if (adalahBarisTangan(kunci)) return;
        const v = badan[i]?.[c]?.v ?? '';
        if (v.trim()) nilai[kunci] = v; else delete nilai[kunci];
      });
      return { ...k, isi: { jenis: 'tangan' as const, nilai } };
    }),
  };
}

export const jumlahIsianTangan = (k: KolomTaut | null | undefined): number =>
  k?.isi.jenis === 'tangan' ? Object.keys(k.isi.nilai).length : 0;

export interface IsianYatim { kolom: number; kunci: string; nilai: string }

/** Isian tangan yang barisnya sudah tidak ada di sumber (bukan sekadar disembunyikan). */
export function isianYatim(t: Pick<Tautan, 'kolom'>, kunciSumber: Set<string>): IsianYatim[] {
  return t.kolom.flatMap((k, c) => (k.isi.jenis !== 'tangan' ? []
    : Object.entries(k.isi.nilai).filter(([kunci]) => !kunciSumber.has(kunci)).map(([kunci, nilai]) => ({ kolom: c, kunci, nilai }))));
}

function buangIsianYatim(t: Tautan, kunciSumber: Set<string>): Tautan {
  return {
    ...t,
    kolom: t.kolom.map(k => (k.isi.jenis !== 'tangan' ? k : {
      ...k, isi: { jenis: 'tangan' as const, nilai: Object.fromEntries(Object.entries(k.isi.nilai).filter(([kunci]) => kunciSumber.has(kunci))) },
    })),
  };
}

const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Kalimat dialog Perbarui untuk isian tangan yang akan dibuang — ketikan orang tidak boleh hilang diam-diam. */
export function kalimatIsianYatim(yatim: IsianYatim[], lama: { rows: TabelCell[][]; kunciBaris: string[] }): string {
  if (!yatim.length) return '';
  const pos = new Map(lama.kunciBaris.map((k, i) => [k, i]));
  const contoh = yatim.slice(0, 3).map(y => {
    const i = pos.get(y.kunci);
    return `${i === undefined ? '(baris tersembunyi)' : labelBaris(lama.rows[i] ?? [])}: "${potong(y.nilai, 60)}"`;
  });
  return `${yatim.length} isian tangan kehilangan barisnya dan akan dibuang — salin dulu kalau masih perlu: `
    + `${contoh.join('; ')}${yatim.length > 3 ? '; …' : ''}`;
}

export interface PenilaianPerbarui {
  badan:     HasilBadan;
  ringkas:   RingkasPerbarui;
  /** Keterangan & catatan sumber sama dengan tarikan terakhir. */
  metaSama:  boolean;
  yatim:     IsianYatim[];
  /** Tidak ada apa pun yang perlu ditulis. */
  sama:      boolean;
  /** Resep sesudah Perbarui (tanpa `ditarikPada` baru — jamnya milik pemanggil). */
  tautanBaru: Tautan;
}

/**
 * Satu penilaian untuk tombol Perbarui di tabel DAN Periksa Kesegaran se-dokumen — dua salinan
 * aturan "apa yang dianggap berubah" pasti berbeda pendapat suatu hari (L78).
 */
export function nilaiPerbarui(payload: PayloadTabel & { tautan: Tautan }, hasil: HasilTarik): PenilaianPerbarui {
  const hr = jumlahBarisKepala(payload);
  const badanLama = payload.rows.slice(hr);
  const t = ambilIsianTangan(payload.tautan, badanLama);
  const badan = bangunBadan(hasil, t);
  const ringkas = bandingPerbarui({ rows: badanLama, kunciBaris: t.kunciBaris }, badan, t.kolom);
  const metaSama = hasil.ringkas === t.ringkas && JSON.stringify(hasil.catatan) === JSON.stringify(t.catatan);
  const kunciSumber = new Set(hasil.baris.map(b => b.kunci));
  const yatim = isianYatim(t, kunciSumber);
  // Baris tangan yang jangkarnya hilang ditambatkan ulang ke baris sumber terakhir — posisinya
  // (akhir badan) tetap sama, dan Perbarui berikutnya tidak menyebutnya lagi.
  const pindah = new Set(badan.barisTanganPindah);
  const jangkarAkhir = hasil.baris.at(-1)?.kunci ?? null;
  const barisTangan = t.barisTangan?.map(bt => (pindah.has(bt.id) ? { ...bt, setelah: jangkarAkhir } : bt));
  return {
    badan, ringkas, metaSama, yatim,
    sama: ringkas.sama && metaSama && !badan.kolomHilang.length && !yatim.length && !pindah.size,
    tautanBaru: {
      ...buangIsianYatim(t, kunciSumber), ...(barisTangan ? { barisTangan } : {}),
      kunciBaris: badan.kunciBaris, ringkas: hasil.ringkas, catatan: hasil.catatan,
    },
  };
}

/**
 * Sidik data grafik yang mengambil dari blok tabel. Gambar grafik (PNG di Word) dibuat saat
 * Simpan; sidik yang disimpan bersamanya membuat editor bisa menandai grafik yang gambarnya
 * sudah tidak sesuai tabelnya — mis. sesudah tabel tertaut diperbarui.
 */
export function sidikGrafik(data: { label: string; value: number }[]): string {
  let h = 5381;
  for (const ch of JSON.stringify(data.map(d => [d.label, d.value]))) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(16);
}

const BULAN_SINGKAT =['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** '2026-10-14 10:12' (WIB, seperti tersimpan) → '14 Okt 2026 10.12' — tanpa geser zona waktu. */
export function tulisWaktuTarik(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  return m ? `${Number(m[3])} ${BULAN_SINGKAT[Number(m[2]) - 1]} ${m[1]} ${m[4]}.${m[5]}` : s;
}

export function lepasTautan<T extends { tautan?: unknown }>(payload: T): Omit<T, 'tautan'> {
  const salin = { ...payload };
  delete salin.tautan;
  return salin;
}

// ── Klik kanan di tabel tertaut: ubah bentuk TANPA menarik ulang (konsep tabel-dari-modul §4) ──
// Perbarui tetap tombolnya sendiri — operasi di sini hanya memindah/membuang baris & kolom yang
// sudah ada, lalu merapikan nomor urut dan gabung-sama persis seperti `bangunBadan` menyusunnya.

export type PayloadTertaut = PayloadTabel & { tautan: Tautan };

export const kalimatBarisTanganPindah = (n: number) =>
  `${n} baris tangan kehilangan baris tambatannya dan dipindah ke akhir tabel`;

/** Kebalikan `gabungOtomatis`: sel tertutup diisi lagi isi puncaknya supaya baris bisa disisip/dibuang. */
function bukaGabungOtomatis(rows: TabelCell[][], kolom: KolomTaut[]): void {
  kolom.forEach((k, c) => {
    if (!k.gabungSama || k.isi.jenis === 'tangan') return;
    let puncak = '', sisa = 0;
    for (const r of rows) {
      const s = r[c];
      if (s.h && sisa > 0) { r[c] = { v: puncak }; sisa--; continue; }
      if ((s.rs ?? 1) > 1) { puncak = s.v; sisa = (s.rs ?? 1) - 1; r[c] = { ...s }; delete r[c].rs; continue; }
      sisa = 0;
    }
  });
}

function rapikanBadan(rows: TabelCell[][], kolom: KolomTaut[]): void {
  rows.forEach((r, i) => kolom.forEach((k, c) => { if (k.isi.jenis === 'nomor') r[c] = { ...r[c], v: String(i + 1) }; }));
  gabungOtomatis(rows, kolom);
}

function ubahBadan(p: PayloadTertaut, ubah: (badan: TabelCell[][], kunci: string[]) => void): { rows: TabelCell[][]; kunciBaris: string[] } {
  const hr = jumlahBarisKepala(p);
  const badan = p.rows.slice(hr).map(r => r.map(s => ({ ...s })));
  const kunci = [...p.tautan.kunciBaris];
  bukaGabungOtomatis(badan, p.tautan.kolom);
  ubah(badan, kunci);
  pasangFormatTangan(badan, kunci, p.tautan.kolom);
  rapikanBadan(badan, p.tautan.kolom);
  return { rows: [...p.rows.slice(0, hr), ...badan], kunciBaris: kunci };
}

export function alasanTakBisaSisipTangan(p: { rows: readonly unknown[]; tautan: Pick<Tautan, 'barisTangan'> }): string | null {
  if (p.rows.length >= BATAS_BARIS) return `Satu tabel paling banyak ${BATAS_BARIS} baris.`;
  if ((p.tautan.barisTangan?.length ?? 0) >= BATAS_BARIS_TANGAN) return `Satu tabel tertaut paling banyak ${BATAS_BARIS_TANGAN} baris tangan.`;
  return null;
}

/**
 * Sisip baris tangan tepat di bawah baris badan ke-`iBadan` (-1 = paling atas). Di bawah baris
 * sumber → ditambatkan padanya, mendahului baris tangan lain yang sudah tertambat di situ; di bawah
 * baris tangan → ikut jangkarnya, tepat sesudahnya. `null` = melewati batas (`alasanTakBisaSisipTangan`).
 */
export function sisipBarisTangan(p: PayloadTertaut, iBadan: number, id: string): PayloadTertaut | null {
  if (alasanTakBisaSisipTangan(p)) return null;
  const t = ambilIsianTangan(p.tautan, p.rows.slice(jumlahBarisKepala(p)));
  const daftar = [...(t.barisTangan ?? [])];
  const kunci = iBadan >= 0 ? t.kunciBaris[iBadan] : undefined;
  const asal = adalahBarisTangan(kunci) ? daftar.findIndex(b => kunciBarisTangan(b.id) === kunci) : -1;
  const setelah = asal >= 0 ? daftar[asal].setelah : (kunci ?? null);
  const pertama = daftar.findIndex(b => b.setelah === setelah);
  const di = asal >= 0 ? asal + 1 : pertama >= 0 ? pertama : daftar.length;
  daftar.splice(di, 0, { id, setelah, sel: t.kolom.map(() => '') });
  const { rows, kunciBaris } = ubahBadan({ ...p, tautan: t }, (badan, k) => {
    const baru: TabelCell[] = t.kolom.map(() => ({ v: '' }));
    hitungRumusBaris(baru, t.kolom);
    badan.splice(iBadan + 1, 0, baru);
    k.splice(iBadan + 1, 0, kunciBarisTangan(id));
  });
  return { ...p, rows, tautan: { ...t, barisTangan: daftar, kunciBaris } };
}

/** Baris sumber → disembunyikan (bisa ditampilkan lagi lewat Atur Bentuk); baris tangan → dibuang. */
export function buangBarisTertaut(p: PayloadTertaut, iBadan: number): PayloadTertaut {
  const t = ambilIsianTangan(p.tautan, p.rows.slice(jumlahBarisKepala(p)));
  const kunci = t.kunciBaris[iBadan];
  if (kunci === undefined) return p;
  const tangan = adalahBarisTangan(kunci);
  const { rows, kunciBaris } = ubahBadan({ ...p, tautan: t }, (badan, k) => { badan.splice(iBadan, 1); k.splice(iBadan, 1); });
  return {
    ...p, rows,
    tautan: tangan
      ? { ...t, kunciBaris, barisTangan: (t.barisTangan ?? []).filter(b => kunciBarisTangan(b.id) !== kunci) }
      : { ...t, kunciBaris, sembunyi: [...new Set([...t.sembunyi, kunci])] },
  };
}

/**
 * Kolom tabel tertaut dihapus langsung. Ditolak (pesan) kalau tinggal satu kolom atau kolom itu
 * dirujuk rumus kolom lain — rumusnya akan jadi #REF! tanpa ada yang menulisnya ulang.
 */
export function hapusKolomTertaut(p: PayloadTertaut, c: number): PayloadTertaut | string {
  const t = p.tautan;
  if (t.kolom.length <= 1) return 'Tabel harus punya minimal 1 kolom.';
  const perujuk = t.kolom.findIndex((k, i) => i !== c && k.isi.jenis === 'rumus'
    && petakanRumusKolom(k.isi.ekspresi, t.kolom.map((_, j) => (j === c ? null : j))) !== k.isi.ekspresi);
  if (perujuk >= 0) return `Kolom ${colLabel(c)} dipakai rumus kolom ${colLabel(perujuk)} — ubah rumusnya lewat Atur Bentuk dulu.`;
  const isi = ambilIsianTangan(t, p.rows.slice(jumlahBarisKepala(p)));
  const peta = isi.kolom.map((_, j) => (j < c ? j : j === c ? null : j - 1));
  const kolom = isi.kolom.filter((_, j) => j !== c).map(k => (k.isi.jenis === 'rumus'
    ? { ...k, isi: { jenis: 'rumus' as const, ekspresi: petakanRumusKolom(k.isi.ekspresi, peta) } } : k));
  const bentuk = hapusKolom({
    rows: p.rows, kolom: p.kolom, align: p.align as TabelAlign[], colWidths: p.colWidths ?? [], headerRows: jumlahBarisKepala(p),
  }, c, c);
  return {
    ...p, rows: bentuk.rows, kolom: bentuk.kolom, align: bentuk.align, colWidths: bentuk.colWidths,
    tautan: { ...isi, kolom, ...(isi.barisTangan ? { barisTangan: isi.barisTangan.map(b => ({ ...b, sel: b.sel.filter((_, j) => j !== c) })) } : {}) },
  };
}
