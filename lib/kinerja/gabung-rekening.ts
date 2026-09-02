// lib/kinerja/gabung-rekening.ts — otak "pintar" Import Rekening E-Anggaran.
//
// PURE: tidak menyentuh berkas, DB, maupun React. Dipakai modal impor di klien
// DAN uji regresi, jadi yang diuji benar-benar logika yang dipakai tombolnya.
//
// Dua hal yang dijawab di sini:
//   1. tiap baris berkas itu BARU, SAMA, BERUBAH, atau KEMBAR (dobel di berkas)
//   2. nama Program/Kegiatan/Sub/Uraian SSK/Sumber mana yang belum ada di Master
//
// Kolom Sumber Anggaran SENGAJA di luar identitas baris. Ia sifat yang bisa
// berubah (APBD -> BLUD); kalau ikut jadi penentu, satu rekening yang pindah
// sumber terbaca sebagai baris baru dan tabelnya berisi dua baris untuk satu
// rekening yang sama. Justru perpindahan itulah yang mau ditandai 'berubah'.

import type { MasterTipe } from '@/app/(dashboard)/kinerja/_types';

export interface BarisRekening {
  program:         string | null;
  kegiatan:        string | null;
  subkegiatan:     string | null;
  uraian_ssk:      string | null;
  uraian:          string;
  sumber_anggaran: string | null;
}

export type StatusImpor = 'baru' | 'sama' | 'berubah' | 'kembar';

export interface BarisImpor {
  baris:      BarisRekening;
  status:     StatusImpor;
  /** Posisi baris tabel yang cocok — hanya untuk 'sama' dan 'berubah'. */
  idxLama:    number | null;
  /** Nilai lama kolom Sumber, supaya pratinjau bisa menampilkan lama -> baru. */
  lamaSumber: string | null;
  ikut:       boolean;
}

export interface RingkasImpor {
  baru: number; sama: number; berubah: number; kembar: number;
}

/** Pemisah ruas kunci — karakter kendali, mustahil ada di nama program/rekening. */
const PISAH = '\u001F';

const rapikan = (v: string | null | undefined): string =>
  (v ?? '').replace(/\s+/g, ' ').trim();

const kunciBagian = (v: string | null | undefined): string => rapikan(v).toLowerCase();

/**
 * Identitas satu baris rekening: lima kolom, dirapikan spasinya dan tanpa
 * membedakan huruf besar/kecil. Dipisah PISAH (satu karakter kendali yang
 * mustahil muncul di teks anggaran) supaya "A|B" dan "A" + "|B"
 * tidak pernah menghasilkan kunci yang sama.
 */
export function kunciRekening(b: BarisRekening): string {
  return [b.program, b.kegiatan, b.subkegiatan, b.uraian_ssk, b.uraian]
    .map(kunciBagian).join(PISAH);
}

export function bandingkanRekening(lama: BarisRekening[], berkas: BarisRekening[]): BarisImpor[] {
  const petaLama = new Map<string, number>();
  lama.forEach((r, i) => {
    const k = kunciRekening(r);
    if (!petaLama.has(k)) petaLama.set(k, i);   // kembar di tabel lama: yang pertama jadi acuan
  });

  const sudahDiBerkas = new Set<string>();
  return berkas.map(b => {
    const k = kunciRekening(b);
    if (sudahDiBerkas.has(k)) {
      return { baris: b, status: 'kembar' as const, idxLama: null, lamaSumber: null, ikut: false };
    }
    sudahDiBerkas.add(k);

    const idx = petaLama.get(k);
    if (idx === undefined) {
      return { baris: b, status: 'baru' as const, idxLama: null, lamaSumber: null, ikut: true };
    }
    const lamaSumber = lama[idx].sumber_anggaran ?? null;
    const sama = kunciBagian(lamaSumber) === kunciBagian(b.sumber_anggaran);
    return sama
      ? { baris: b, status: 'sama' as const,    idxLama: idx, lamaSumber, ikut: false }
      : { baris: b, status: 'berubah' as const, idxLama: idx, lamaSumber, ikut: true  };
  });
}

export function ringkasImpor(hasil: BarisImpor[]): RingkasImpor {
  const r: RingkasImpor = { baru: 0, sama: 0, berubah: 0, kembar: 0 };
  for (const h of hasil) r[h.status]++;
  return r;
}

/** Mode Tambahkan: isi lama dipertahankan, hanya yang dicentang yang mengubahnya. */
export function terapkanTambah(lama: BarisRekening[], hasil: BarisImpor[]): BarisRekening[] {
  const out = [...lama];
  for (const h of hasil) {
    if (!h.ikut) continue;
    if (h.status === 'baru') out.push(h.baris);
    else if (h.status === 'berubah' && h.idxLama !== null) out[h.idxLama] = h.baris;
  }
  return out;
}

/**
 * Mode Timpa: isi tab = isi berkas. Centang per baris sengaja TIDAK berlaku di
 * sini — "timpa tapi baris ini jangan" itu dua perintah yang saling menyangkal,
 * dan hasilnya tabel yang tidak sama dengan berkas maupun dengan isi lamanya.
 * Yang tetap dibuang cuma baris kembar, sebab menyimpannya dua kali tidak pernah
 * jadi maksud siapa pun.
 */
export function terapkanTimpa(hasil: BarisImpor[]): BarisRekening[] {
  return hasil.filter(h => h.status !== 'kembar').map(h => h.baris);
}

// ─── Master yang belum ada ──────────────────────────────────────────────────

export interface EntriMaster {
  tipe:            MasterTipe;
  nama:            string;
  program_ref:     string | null;
  kegiatan_ref:    string | null;
  subkegiatan_ref: string | null;
}

export interface MasterTersedia {
  program:         string[];
  kegiatan:        string[];
  subkegiatan:     string[];
  uraian_ssk:      string[];
  sumber_anggaran: string[];
}

/**
 * Nama yang dipakai baris berkas tapi belum terdaftar di Master.
 *
 * Kenapa perlu: kolom hierarki di tabel Rekening cuma TEKS — tidak ada pengikat
 * ke Master. Baris yang menyebut program yang tak terdaftar tetap tersimpan dan
 * tetap tampak benar di tabel; baru ketahuan saat barisnya dibuka untuk disunting
 * (dropdown kosong) atau saat tab SSK menyuntik dari Rekening dan tak menemukan
 * pasangannya. Berkasnya membawa hierarki lengkap per baris, jadi induk tiap
 * entri terisi tanpa menebak.
 *
 * Urutannya program -> kegiatan -> sub -> uraian SSK -> sumber, supaya `urut`
 * di Master lahir searah dengan hierarkinya.
 */
export function masterKurang(berkas: BarisRekening[], tersedia: MasterTersedia): EntriMaster[] {
  const punya = (daftar: string[], nama: string) =>
    daftar.some(d => kunciBagian(d) === kunciBagian(nama));

  const out: EntriMaster[] = [];
  const dipakai = new Set<string>();
  const tambah = (tipe: MasterTipe, nama: string, p: string | null, k: string | null, s: string | null) => {
    const nm = rapikan(nama);
    if (!nm) return;
    const tanda = `${tipe}${PISAH}${kunciBagian(nm)}`;
    if (dipakai.has(tanda)) return;
    dipakai.add(tanda);
    out.push({ tipe, nama: nm, program_ref: p, kegiatan_ref: k, subkegiatan_ref: s });
  };

  for (const b of berkas) if (b.program && !punya(tersedia.program, b.program)) {
    tambah('program', b.program, null, null, null);
  }
  for (const b of berkas) if (b.kegiatan && !punya(tersedia.kegiatan, b.kegiatan)) {
    tambah('kegiatan', b.kegiatan, rapikan(b.program) || null, null, null);
  }
  for (const b of berkas) if (b.subkegiatan && !punya(tersedia.subkegiatan, b.subkegiatan)) {
    tambah('subkegiatan', b.subkegiatan, rapikan(b.program) || null, rapikan(b.kegiatan) || null, null);
  }
  for (const b of berkas) if (b.uraian_ssk && !punya(tersedia.uraian_ssk, b.uraian_ssk)) {
    tambah('uraian_ssk', b.uraian_ssk, rapikan(b.program) || null, rapikan(b.kegiatan) || null, rapikan(b.subkegiatan) || null);
  }
  for (const b of berkas) if (b.sumber_anggaran && !punya(tersedia.sumber_anggaran, b.sumber_anggaran)) {
    tambah('sumber_anggaran', b.sumber_anggaran, null, null, null);
  }
  return out;
}

// ─── Impor Master (berkas Master → entri) ───────────────────────────────────

export interface EntriMasterImpor {
  entri:  EntriMaster;
  status: 'baru' | 'sama' | 'kembar';
  ikut:   boolean;
}

const DAFTAR_TIPE: Record<MasterTipe, keyof MasterTersedia> = {
  program: 'program', kegiatan: 'kegiatan', subkegiatan: 'subkegiatan',
  uraian_ssk: 'uraian_ssk', sumber_anggaran: 'sumber_anggaran',
};

/**
 * Cermin `bandingkanRekening` untuk berkas Master. Identitasnya cukup tipe + nama:
 * Master memang daftar nama, dan induknya (`*_ref`) keterangan, bukan pembeda —
 * memasukkannya ke identitas membuat program yang induknya diperbaiki terbaca
 * sebagai entri baru lalu tersimpan dua kali dengan nama yang persis sama.
 */
export function bandingkanMaster(berkas: EntriMaster[], tersedia: MasterTersedia): EntriMasterImpor[] {
  const terlihat = new Set<string>();
  return berkas.map(e => {
    const tanda = `${e.tipe}${PISAH}${kunciBagian(e.nama)}`;
    if (terlihat.has(tanda)) return { entri: e, status: 'kembar' as const, ikut: false };
    terlihat.add(tanda);
    const ada = tersedia[DAFTAR_TIPE[e.tipe]].some(d => kunciBagian(d) === kunciBagian(e.nama));
    return ada
      ? { entri: e, status: 'sama' as const, ikut: false }
      : { entri: e, status: 'baru' as const, ikut: true };
  });
}
