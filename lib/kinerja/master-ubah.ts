// lib/kinerja/master-ubah.ts — rencana ganti nama / pindah induk / gabung entri Master,
// Rapikan Bintang, dan Lengkapi Master, beserta jalarannya ke salinan nama di Rekening,
// RKO, dan Realisasi. PURE (tanpa DB, aman-klien) — penulisnya lib/data/kinerja-master-ubah.ts.
//
// Identitas entri = JALUR-nya: [program, kegiatan, sub kegiatan, uraian SSK] sampai
// tingkatnya sendiri, karena hierarki disambung teks nama dan Rekening/RKO/Realisasi
// menyimpan SALINAN teks itu. Mengubah satu entri = jalur lama → jalur baru, untuk
// entri itu, keturunannya, dan setiap baris data yang jalurnya diawali jalur lama.
// Konsep: docs/CONCEPT-kinerja-master-menjalar.md

import type { MasterTipe } from '@/lib/data/kinerja';
import { buangBintang, cocokInduk } from './master-nama';

export interface EntriMaster {
  id: number;
  tipe: MasterTipe;
  nama: string;
  program_ref: string | null;
  kegiatan_ref: string | null;
  subkegiatan_ref: string | null;
}
export type NilaiEntri = Omit<EntriMaster, 'id' | 'tipe'>;
export type Jalur = (string | null)[];

export interface BarisNama {
  id: number;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
  uraian_ssk: string | null;
}
export type NilaiBaris = Omit<BarisNama, 'id'>;

const TINGKAT: MasterTipe[] = ['program', 'kegiatan', 'subkegiatan', 'uraian_ssk'];
const KOLOM = ['program', 'kegiatan', 'subkegiatan', 'uraian_ssk'] as const;
const LABEL: Record<MasterTipe, string> = {
  program: 'Program', kegiatan: 'Kegiatan', subkegiatan: 'Sub Kegiatan',
  uraian_ssk: 'Uraian SSK', sumber_anggaran: 'Sumber Anggaran',
};

const isi = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** Kedalaman tipe di hierarki; `sumber_anggaran` berdiri sendiri (tanpa induk, tanpa anak). */
const kedalaman = (tipe: MasterTipe) => Math.max(TINGKAT.indexOf(tipe), 0);

export function jalurEntri(e: NilaiEntri & { tipe: MasterTipe }): Jalur {
  const d = kedalaman(e.tipe);
  return [isi(e.program_ref), isi(e.kegiatan_ref), isi(e.subkegiatan_ref)].slice(0, d).concat(isi(e.nama));
}

function nilaiDariJalur(tipe: MasterTipe, j: Jalur): NilaiEntri {
  const d = kedalaman(tipe);
  return {
    nama: j[d] ?? '',
    program_ref: d > 0 ? j[0] : null,
    kegiatan_ref: d > 1 ? j[1] : null,
    subkegiatan_ref: d > 2 ? j[2] : null,
  };
}

const samaJalur = (a: Jalur, b: Jalur) => a.length === b.length && a.every((v, i) => v === b[i]);
const kunciEntri = (tipe: MasterTipe, j: Jalur) => [tipe, ...j.map(v => v ?? '\u0000')].join('\u0001');

/**
 * Kolom induk yang kosong (data lama) dianggap milik entri ini hanya kalau namanya
 * UNIK di tipenya — kalau ada saudara senama di induk lain, baris tanpa induk tidak
 * bisa dipastikan milik siapa, dan memindahkannya merusak cabang saudara itu.
 */
const cocokTingkat = (nilai: string | null, patokan: string | null, unik: boolean) =>
  patokan === null ? (unik || nilai === null) : (nilai === patokan || (nilai === null && unik));

function keturunan(rows: readonly EntriMaster[], diri: EntriMaster, unik: boolean): EntriMaster[] {
  const d = TINGKAT.indexOf(diri.tipe);
  if (d < 0) return [];
  const P = jalurEntri(diri);
  return rows.filter(r => {
    const dr = TINGKAT.indexOf(r.tipe);
    if (dr <= d) return false;
    const R = jalurEntri(r);
    if (R[d] !== P[d]) return false;
    for (let i = 0; i < d; i++) if (!cocokTingkat(R[i], P[i], unik)) return false;
    return true;
  });
}

/** Tingkat 0..d diganti jalur baru; induk baru yang kosong tidak menghapus isi lama. */
function geserJalur(R: Jalur, d: number, B: Jalur): Jalur {
  const n = [...R];
  for (let i = 0; i <= d; i++) if (B[i] !== null) n[i] = B[i];
  return n;
}

/**
 * Sesudah nilai baru dipasang, entri yang jadi KEMBAR (tipe + jalur sama persis) dibuang
 * — itulah "gabung". Yang dipertahankan entri yang tidak ikut diubah (yang sudah ada di
 * tujuan); kembar lama yang tidak tersentuh perubahan ini dibiarkan, bukan urusannya.
 */
function pasangDanBuangKembar(rows: readonly EntriMaster[], baru: Map<number, NilaiEntri>) {
  const akhir = rows.map(r => (baru.has(r.id) ? { ...r, ...baru.get(r.id)! } : r));
  const grup = new Map<string, EntriMaster[]>();
  for (const r of akhir) {
    const k = kunciEntri(r.tipe, jalurEntri(r));
    grup.set(k, [...(grup.get(k) ?? []), r]);
  }
  const hapus = new Set<number>();
  const lebur: Lebur[] = [];
  for (const anggota of grup.values()) {
    const diubah = anggota.filter(r => baru.has(r.id));
    if (anggota.length < 2 || diubah.length === 0) continue;
    const tetap = anggota.some(r => !baru.has(r.id)) ? null : Math.min(...diubah.map(r => r.id));
    // Penerima = entri yang dipertahankan; kalau ada beberapa yang tak tersentuh (kembar lama), yang ber-id terkecil.
    const ke = tetap ?? Math.min(...anggota.filter(r => !baru.has(r.id)).map(r => r.id));
    for (const r of diubah) if (r.id !== tetap) { hapus.add(r.id); lebur.push({ dari: r.id, ke }); }
  }
  const asal = new Map(rows.map(r => [r.id, r]));
  const tulis = akhir.filter(r => {
    if (!baru.has(r.id) || hapus.has(r.id)) return false;
    const a = asal.get(r.id)!;
    return a.nama !== r.nama || a.program_ref !== r.program_ref
      || a.kegiatan_ref !== r.kegiatan_ref || a.subkegiatan_ref !== r.subkegiatan_ref;
  });
  return { tulis, hapus: [...hapus].sort((a, b) => a - b), lebur, akhir };
}

/** Entri `dari` dibuang karena jadi kembar `ke` — dipakai mewariskan tanda asal (Tahap G). */
export interface Lebur { dari: number; ke: number }

export interface RencanaUbahMaster {
  diri: EntriMaster;
  baru: NilaiEntri;
  berubah: boolean;
  /** Entri yang SUDAH ada di jalur tujuan — diri digabung ke sana (dihapus). */
  gabungKe: EntriMaster | null;
  tulis: EntriMaster[];
  hapus: number[];
  lebur: Lebur[];
  /** Seluruh entri sesudah perubahan (sebelum yang kembar dibuang). */
  akhir: EntriMaster[];
  anak: number;
  jalurLama: Jalur;
  jalurBaru: Jalur;
  unik: boolean;
}

export type MasukanUbahMaster = {
  nama: string;
  program_ref?: string | null;
  kegiatan_ref?: string | null;
  subkegiatan_ref?: string | null;
};

const KOLOM_REF = ['program_ref', 'kegiatan_ref', 'subkegiatan_ref'] as const;

export function rencanaUbahMaster(
  rows: readonly EntriMaster[], id: number, masukan: MasukanUbahMaster,
): RencanaUbahMaster | { tolak: string } {
  const diri = rows.find(r => r.id === id);
  if (!diri) return { tolak: 'Baris master tidak ditemukan.' };
  const nama = isi(masukan.nama);
  if (!nama) return { tolak: 'Nama wajib diisi.' };

  const d = kedalaman(diri.tipe);
  const P = jalurEntri(diri);
  // `undefined` = kolom itu tidak dikirim → induk lama dipertahankan.
  const B: Jalur = KOLOM_REF.slice(0, d)
    .map((k, i) => (masukan[k] === undefined ? P[i] : isi(masukan[k])))
    .concat(nama);

  for (let i = 0; i < d; i++) {
    if (P[i] !== null && B[i] === null) return { tolak: `${LABEL[TINGKAT[i]]} induk wajib dipilih.` };
  }

  const unik = !rows.some(e => e.id !== diri.id && e.tipe === diri.tipe && isi(e.nama) === P[d]);
  const dasar = {
    diri, baru: nilaiDariJalur(diri.tipe, B), jalurLama: P, jalurBaru: B, unik,
  };
  if (samaJalur(P, B)) return { ...dasar, berubah: false, gabungKe: null, tulis: [], hapus: [], lebur: [], akhir: [...rows], anak: 0 };

  // Induk baru harus ada di Master (L68). Diperiksa dari tingkat pertama yang berubah ke
  // bawah: pindah Program dengan Kegiatan yang sama berarti Kegiatan itu harus ada juga
  // di bawah Program baru.
  const awalBerubah = B.findIndex((v, i) => i < d && v !== P[i]);
  if (awalBerubah >= 0) {
    for (let i = awalBerubah; i < d; i++) {
      if (B[i] === null) continue;
      const ada = rows.some(e => e.tipe === TINGKAT[i] && isi(e.nama) === B[i] && cocokInduk(e, {
        program: i > 0 ? B[0] : null, kegiatan: i > 1 ? B[1] : null, subkegiatan: i > 2 ? B[2] : null,
      }));
      if (!ada) {
        return { tolak: `${LABEL[TINGKAT[i]]} "${B[i]}" tidak ada di Master`
          + (i > 0 && B[i - 1] ? ` di bawah ${LABEL[TINGKAT[i - 1]]} "${B[i - 1]}"` : '')
          + ' — pilih dari daftar.' };
      }
    }
  }

  const turun = keturunan(rows, diri, unik);
  const baru = new Map<number, NilaiEntri>([[diri.id, dasar.baru]]);
  for (const r of turun) baru.set(r.id, nilaiDariJalur(r.tipe, geserJalur(jalurEntri(r), d, B)));
  const { tulis, hapus, lebur, akhir } = pasangDanBuangKembar(rows, baru);
  const gabungKe = rows.find(e => e.id !== diri.id && e.tipe === diri.tipe && samaJalur(jalurEntri(e), B)) ?? null;

  return { ...dasar, berubah: true, gabungKe, tulis, hapus, lebur, akhir, anak: turun.length };
}

/**
 * Baris Rekening/RKO/Realisasi yang jalurnya diawali jalur lama → nilai barunya.
 * Kolom di bawah tingkat entri dibiarkan apa adanya; baris yang tidak berubah tidak ikut.
 */
export function jalarkanKeBaris<T extends BarisNama>(
  baris: readonly T[], r: Pick<RencanaUbahMaster, 'diri' | 'jalurLama' | 'jalurBaru' | 'unik'>,
): { baris: T; nilai: NilaiBaris }[] {
  const d = TINGKAT.indexOf(r.diri.tipe);
  if (d < 0) return [];
  return baris.flatMap(b => {
    const R = KOLOM.map(k => isi(b[k]));
    if (R[d] !== r.jalurLama[d]) return [];
    for (let i = 0; i < d; i++) if (!cocokTingkat(R[i], r.jalurLama[i], r.unik)) return [];
    const nilai: NilaiBaris = { program: b.program, kegiatan: b.kegiatan, subkegiatan: b.subkegiatan, uraian_ssk: b.uraian_ssk };
    for (let i = 0; i <= d; i++) if (r.jalurBaru[i] !== null) nilai[KOLOM[i]] = r.jalurBaru[i];
    return KOLOM.some(k => nilai[k] !== b[k]) ? [{ baris: b, nilai }] : [];
  });
}

/** Tulisan dikelompokkan per nilai baru — satu UPDATE … WHERE id IN (…) per kelompok. */
export function kelompokkanNilai<N>(daftar: readonly { id: number; nilai: N }[]): { nilai: N; ids: number[] }[] {
  const grup = new Map<string, { nilai: N; ids: number[] }>();
  for (const t of daftar) {
    const k = JSON.stringify(t.nilai);
    const g = grup.get(k);
    if (g) g.ids.push(t.id); else grup.set(k, { nilai: t.nilai, ids: [t.id] });
  }
  return [...grup.values()];
}

// ─── Rapikan Bintang ─────────────────────────────────────────────────────────

const bersih = (v: string | null): string | null => (v === null ? null : (buangBintang(v) || v));

export interface ContohRapikan { tipe: MasterTipe; lama: string; baru: string; gabung: boolean }

export interface RencanaRapikan {
  tulis: EntriMaster[];
  hapus: number[];
  lebur: Lebur[];
  akhir: EntriMaster[];
  /** Entri yang NAMANYA berubah (yang lain hanya ikut dirapikan kolom induknya). */
  contoh: ContohRapikan[];
  indukSaja: number;
}

/** Bintang dibuang per kolom — semua penunjuk ke "X ***" ikut jadi "X", jadi tak ada yang putus. */
export function rencanaRapikanBintang(rows: readonly EntriMaster[]): RencanaRapikan {
  const baru = new Map<number, NilaiEntri>();
  for (const r of rows) {
    const n: NilaiEntri = {
      nama: bersih(r.nama) ?? r.nama,
      program_ref: bersih(r.program_ref), kegiatan_ref: bersih(r.kegiatan_ref), subkegiatan_ref: bersih(r.subkegiatan_ref),
    };
    if (n.nama !== r.nama || n.program_ref !== r.program_ref || n.kegiatan_ref !== r.kegiatan_ref
      || n.subkegiatan_ref !== r.subkegiatan_ref) baru.set(r.id, n);
  }
  const { tulis, hapus, lebur, akhir } = pasangDanBuangKembar(rows, baru);
  const dihapus = new Set(hapus);
  const contoh = rows
    .filter(r => baru.has(r.id) && baru.get(r.id)!.nama !== r.nama)
    .sort((a, b) => kedalaman(a.tipe) - kedalaman(b.tipe) || a.id - b.id)
    .map(r => ({ tipe: r.tipe, lama: r.nama, baru: baru.get(r.id)!.nama, gabung: dihapus.has(r.id) }));
  return { tulis, hapus, lebur, akhir, contoh, indukSaja: baru.size - contoh.length };
}

export function rapikanBarisNama<T extends BarisNama>(baris: readonly T[]): { baris: T; nilai: NilaiBaris }[] {
  return baris.flatMap(b => {
    const nilai: NilaiBaris = {
      program: bersih(b.program), kegiatan: bersih(b.kegiatan),
      subkegiatan: bersih(b.subkegiatan), uraian_ssk: bersih(b.uraian_ssk),
    };
    return KOLOM.some(k => nilai[k] !== b[k]) ? [{ baris: b, nilai }] : [];
  });
}

/** Berapa kunci yang muncul lebih dari sekali per grup — dipakai untuk "rekening jadi kembar". */
export function hitungKembar(daftar: readonly { grup: string; kunci: string }[]): number {
  const lihat = new Map<string, number>();
  for (const x of daftar) {
    const k = `${x.grup}\u0001${x.kunci}`;
    lihat.set(k, (lihat.get(k) ?? 0) + 1);
  }
  return [...lihat.values()].filter(n => n > 1).length;
}

// ─── Lengkapi Master ─────────────────────────────────────────────────────────

export type RantaiNama = Omit<BarisNama, 'id'>;
export type EntriBaru = NilaiEntri & { tipe: MasterTipe };

/**
 * Entri Master yang belum ada untuk nama yang DIPAKAI di Rekening & RKO. Impor Rekening
 * dan Impor RKO menulis nama dari berkas tanpa membuat entri Master, jadi pilihan Uraian
 * SSK di form Rekening kosong untuk baris-baris itu. "Sudah ada" = akan tampil di pilihan
 * berantai (`cocokInduk`); berhenti di tingkat pertama yang kosong.
 */
export function rencanaLengkapiMaster(
  master: readonly EntriMaster[], rantai: readonly RantaiNama[],
): { baru: EntriBaru[]; berbintang: number } {
  const daftar: (NilaiEntri & { tipe: MasterTipe })[] = [...master];
  const baru: EntriBaru[] = [];
  for (const r of rantai) {
    const j = KOLOM.map(k => isi(r[k]));
    for (let i = 0; i < 4; i++) {
      const v = j[i];
      if (!v) break;
      const induk = { program: i > 0 ? j[0] : null, kegiatan: i > 1 ? j[1] : null, subkegiatan: i > 2 ? j[2] : null };
      if (daftar.some(e => e.tipe === TINGKAT[i] && isi(e.nama) === v && cocokInduk(e, induk))) continue;
      const e: EntriBaru = {
        tipe: TINGKAT[i], nama: v,
        program_ref: induk.program, kegiatan_ref: induk.kegiatan, subkegiatan_ref: induk.subkegiatan,
      };
      daftar.push(e);
      baru.push(e);
    }
  }
  baru.sort((a, b) => kedalaman(a.tipe) - kedalaman(b.tipe));
  return { baru, berbintang: baru.filter(e => buangBintang(e.nama) !== e.nama).length };
}

// ─── Kalimat untuk dialog ────────────────────────────────────────────────────

export interface DampakVersiRko { sumber: string; versi_tipe: string; versi_seq: number; baris: number }
export interface DampakData { rekening: number; rko: DampakVersiRko[]; realisasi: number }

const labelVersi = (v: DampakVersiRko) => `${v.sumber} ${v.versi_tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${v.versi_seq}`}`;

/** Rincian per versi RKO dipadatkan bila lebih dari ini — dialog tidak bisa digulir. */
const BATAS_RINCI_RKO = 4;

/** Baris "ikut berganti nama" untuk dialog pratinjau. */
export function kalimatJalaran(d: DampakData): string {
  const bagian: string[] = [];
  if (d.rekening > 0) bagian.push(`• Rekening: ${d.rekening} baris`);
  if (d.rko.length > BATAS_RINCI_RKO) {
    const sumber = [...new Set(d.rko.map(v => v.sumber))].join(', ');
    bagian.push(`• RKO: ${d.rko.reduce((n, v) => n + v.baris, 0)} baris di ${d.rko.length} versi (${sumber})`);
  } else {
    for (const v of d.rko) bagian.push(`• RKO ${labelVersi(v)}: ${v.baris} baris`);
  }
  if (d.realisasi > 0) bagian.push(`• Realisasi: ${d.realisasi} baris`);
  return bagian.join('\n');
}

export const adaJalaran = (d: DampakData) => d.rekening > 0 || d.realisasi > 0 || d.rko.length > 0;
export const jumlahJalaran = (d: DampakData) => d.rekening + d.realisasi + d.rko.reduce((n, v) => n + v.baris, 0);

export function labelTipeMaster(tipe: MasterTipe): string {
  return LABEL[tipe];
}
