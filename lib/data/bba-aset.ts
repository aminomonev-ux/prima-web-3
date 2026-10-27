// ═══ PRIMA — BBA Buku Aset (Tahap B) — Data Layer ═══════════════════
// Konsep: docs/CONCEPT-bba-buku-aset.md §5, §7.1, §15, §16.
// Satu baris = satu register KIB. Impor: pratinjau (tanpa menulis) → simpan (satu transaksi,
// dikunci per modul supaya dua impor tidak berselang-seling — L69-a lewat `blud_locks`).
import type mysql from 'mysql2/promise';
import { sql, queryMany, queryOne, withTransaction, bulkInsert, escapeLike, type TxSql } from '@/lib/data/db';
import { acquireBludLock } from '@/lib/data/locks';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import {
  kelompokkan, rencanakanImpor, namaDariKeterangan, namaTampil,
  type AsetRingan, type KelompokAset, type RencanaImpor,
} from '@/lib/bba/aset';
import { alasanTolakCek, bolehBerRuang, fmtTanggal } from '@/lib/bba/kondisi';
import type { AsetBaca, HasilBacaKib, NilaiKib } from '@/lib/bba/kib-baca';
import { GOLONGAN, kodeTanah, TEKS_KONDISI_KIB, type Golongan, type Kondisi } from '@/lib/bba/kib';
import { KUNCI_PENGATURAN, type PengaturanBba } from '@/lib/bba/pengaturan';
import type { RuangKir, AsetKerja } from '@/lib/bba/lembar-excel';
import {
  tentukanBarang, pastikanBerkasBba, batasCekSekarang, bacaPengaturanBba, BbaLokasiTidakDikenalError,
} from '@/lib/data/buku-besar-aset';

export { batasCekSekarang, bacaPengaturanBba };
import type { CatatKondisiInput, PindahAsetInput, TautkanBarangAsetInput } from '@/lib/data/bba-aset-schemas';
import { LABEL_JENIS, type JenisRencana, type Anggaran } from '@/lib/bba/rencana';
import type { BbaStatus } from '@/lib/bba/status';

export class AsetVersiError extends Error {
  constructor(n = 1) {
    super(n > 1
      ? `${n} register baru saja diubah orang lain. Daftarnya dimuat ulang — periksa lalu simpan lagi.`
      : 'Aset ini baru saja diubah orang lain. Memuat versi terbarunya.');
    this.name = 'AsetVersiError';
  }
}
export class AsetTidakAdaError extends Error {
  constructor() { super('Aset tidak ditemukan.'); this.name = 'AsetTidakAdaError'; }
}
/** Pemeriksaan/pemindahan ditolak untuk sebagian register — seluruhnya batal, alasannya per register. */
export class AsetDitolakError extends Error {
  constructor(public alasan: string[]) {
    super(alasan.length === 1 ? alasan[0] : `${alasan.length} register tidak bisa diproses: ${alasan.slice(0, 3).join(' ')}${alasan.length > 3 ? ' …' : ''}`);
    this.name = 'AsetDitolakError';
  }
}

const KOLOM_RINGAN = sql`
  a.id, a.golongan, a.kode_barang, a.register, a.kunci_impor, a.kode_objek, a.tahun_perolehan,
  a.nama_resmi, a.nama, a.lokasi_id, a.harga, a.asal_usul, a.keterangan, a.kondisi, a.kondisi_sumber, a.status,
  a.version, a.barang_id, DATE_FORMAT(a.kondisi_tgl, '%Y-%m-%d') AS kondisi_tgl
`;

function bacaKib(v: unknown): Record<string, NilaiKib> {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v) as Record<string, NilaiKib>; } catch { return {}; } }
  return v as Record<string, NilaiKib>;
}

function petakanRingan(r: Record<string, unknown>): AsetRingan {
  return {
    id: Number(r.id), golongan: r.golongan as Golongan,
    kode_barang: (r.kode_barang as string | null) ?? null, register: (r.register as string | null) ?? null,
    kunci_impor: (r.kunci_impor as string | null) ?? null, kode_objek: (r.kode_objek as string | null) ?? null,
    tahun_perolehan: r.tahun_perolehan == null ? null : Number(r.tahun_perolehan),
    nama_resmi: String(r.nama_resmi ?? ''), nama: (r.nama as string | null) ?? null,
    lokasi_id: r.lokasi_id == null ? null : Number(r.lokasi_id), harga: Number(r.harga ?? 0),
    asal_usul: (r.asal_usul as string | null) ?? null, keterangan: (r.keterangan as string | null) ?? null,
    kondisi: (r.kondisi as Kondisi | null) ?? null, kondisi_sumber: (r.kondisi_sumber as 'IMPOR' | 'CEK' | null) ?? null,
    kib: bacaKib(r.kib), status: (r.status as 'AKTIF' | 'DIHAPUS') ?? 'AKTIF',
    kondisi_tgl: (r.kondisi_tgl as string | null) ?? null, // sudah teks: DATE_FORMAT di SQL
    version: Number(r.version ?? 0), barang_id: r.barang_id == null ? null : Number(r.barang_id),
  };
}

// ─── Daftar & ringkasan ──────────────────────────────────────────────────────

export type SaringanKondisi = 'B' | 'RR' | 'RB' | 'BELUM_DICEK' | 'PERLU_DICEK';
export interface SaringanAset {
  golongan?: Golongan;
  q?: string;
  tahun?: number;
  kondisi?: SaringanKondisi;
  status?: 'AKTIF' | 'DIHAPUS';
  /** 0 = peralatan (B/E) yang belum punya ruangan. */
  lokasi?: number;
  /** Gedung (aset golongan C): gedung itu sendiri + isi ruangan-ruangan di dalamnya. */
  gedung?: number;
  barang?: number;
}

export interface RingkasAset {
  jumlah: number;
  nilai: number;
  kondisi: { B: number; RR: number; RB: number; kosong: number };
  belumDicek: number;
  lewat: number;
}

export interface DaftarAset {
  perGolongan: Record<Golongan, { jumlah: number; nilai: number }>;
  ringkas: RingkasAset;
  kelompok: (KelompokAset & { lokasi_nama: string | null })[];
  terpotong: boolean;
  /** Dipakai layar untuk status cek register (sama dengan yang dipakai ringkasan). */
  batas: string;
}

const MAKS_KELOMPOK = 1500;

function whereAset(f: SaringanAset, batas: string) {
  let w = sql`WHERE a.status = ${f.status ?? 'AKTIF'}`;
  if (f.golongan) w = sql`${w} AND a.golongan = ${f.golongan}`;
  if (f.tahun) w = sql`${w} AND a.tahun_perolehan = ${f.tahun}`;
  if (f.kondisi === 'BELUM_DICEK') w = sql`${w} AND a.golongan <> 'A' AND (a.kondisi_sumber IS NULL OR a.kondisi_sumber = 'IMPOR')`;
  // Cermin `perluDicek` (lib/bba/kondisi.ts): belum pernah dicek ATAU dicek sebelum batas.
  else if (f.kondisi === 'PERLU_DICEK') w = sql`${w} AND a.golongan <> 'A' AND (a.kondisi_sumber IS NULL OR a.kondisi_sumber = 'IMPOR' OR a.kondisi_tgl < ${batas})`;
  else if (f.kondisi) w = sql`${w} AND a.kondisi = ${f.kondisi}`;
  if (f.lokasi === 0) w = sql`${w} AND a.lokasi_id IS NULL AND a.golongan IN ('B','E')`;
  else if (f.lokasi) w = sql`${w} AND a.lokasi_id = ${f.lokasi}`;
  if (f.gedung) w = sql`${w} AND (a.id = ${f.gedung} OR a.lokasi_id IN (SELECT id FROM bba_lokasi WHERE gedung_aset_id = ${f.gedung}))`;
  if (f.barang) w = sql`${w} AND a.barang_id = ${f.barang}`;
  if (f.q?.trim()) {
    const p = `%${escapeLike(f.q.trim())}%`;
    w = sql`${w} AND (a.nama LIKE ${p} OR a.nama_resmi LIKE ${p} OR a.kode_barang LIKE ${p} OR a.register LIKE ${p} OR a.keterangan LIKE ${p})`;
  }
  return w;
}

export async function daftarAset(f: SaringanAset): Promise<DaftarAset> {
  const batas = await batasCekSekarang();
  const [rows, agg, lokasi] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_RINGAN} FROM bba_aset a ${whereAset(f, batas)} ORDER BY a.golongan, a.kode_barang, a.register, a.id`),
    queryMany<{ golongan: Golongan; n: number; nilai: number }>(sql`
      SELECT golongan, COUNT(*) AS n, COALESCE(SUM(harga), 0) AS nilai FROM bba_aset WHERE status = ${f.status ?? 'AKTIF'} GROUP BY golongan
    `),
    queryMany<{ id: number; nama: string }>(sql`SELECT id, nama FROM bba_lokasi`),
  ]);
  const aset = rows.map(petakanRingan);
  const namaLokasi = new Map(lokasi.map(l => [Number(l.id), String(l.nama)]));
  const perGolongan = Object.fromEntries(GOLONGAN.map(g => [g, { jumlah: 0, nilai: 0 }])) as DaftarAset['perGolongan'];
  for (const a of agg) perGolongan[a.golongan] = { jumlah: Number(a.n), nilai: Number(a.nilai) };
  const kelompok = kelompokkan(aset, batas);
  const ringkas: RingkasAset = { jumlah: aset.length, nilai: 0, kondisi: { B: 0, RR: 0, RB: 0, kosong: 0 }, belumDicek: 0, lewat: 0 };
  for (const k of kelompok) {
    ringkas.nilai += k.harga;
    ringkas.belumDicek += k.belumDicek;
    ringkas.lewat += k.lewat;
    for (const x of ['B', 'RR', 'RB', 'kosong'] as const) ringkas.kondisi[x] += k.kondisi[x];
  }
  return {
    perGolongan, ringkas, batas,
    kelompok: kelompok.slice(0, MAKS_KELOMPOK).map(k => ({ ...k, lokasi_nama: k.lokasi_id ? namaLokasi.get(k.lokasi_id) ?? null : null })),
    terpotong: kelompok.length > MAKS_KELOMPOK,
  };
}

/** Register-register sebuah kelompok (dibuka dari baris kelompok). */
export async function asetMenurutId(ids: number[]): Promise<AsetRingan[]> {
  if (ids.length === 0) return [];
  const rows = await queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_RINGAN}, a.kib FROM bba_aset a WHERE a.id IN (${ids}) ORDER BY a.kode_barang, a.register, a.id`);
  return rows.map(petakanRingan);
}

export type AsetOpname = AsetRingan & { lokasi_nama: string | null };

/**
 * Register yang dicek dalam satu opname: isi satu ruangan, atau satu gedung (gedungnya sendiri +
 * isi ruangan-ruangan di dalamnya). Tanah tidak ikut — tidak punya kondisi.
 */
export async function asetOpname(f: { ruang: number } | { gedung: number }): Promise<AsetOpname[]> {
  const where = 'ruang' in f
    ? sql`a.lokasi_id = ${f.ruang}`
    : sql`(a.id = ${f.gedung} OR a.lokasi_id IN (SELECT id FROM bba_lokasi WHERE gedung_aset_id = ${f.gedung}))`;
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT ${KOLOM_RINGAN}, l.nama AS lokasi_nama FROM bba_aset a LEFT JOIN bba_lokasi l ON l.id = a.lokasi_id
    WHERE ${where} AND a.status = 'AKTIF' AND a.golongan <> 'A'
    ORDER BY l.nama, a.golongan, a.kode_barang, a.register, a.id LIMIT 2000
  `);
  return rows.map(r => ({ ...petakanRingan(r), lokasi_nama: (r.lokasi_nama as string | null) ?? null }));
}

/**
 * Calon aset sasaran rencana (Tahap D): register aktif barang itu, dan/atau hasil pencarian (gedung
 * untuk rehab tidak selalu ditautkan ke barang). Rusak berat lebih dulu — calon penggantian.
 */
export async function asetUntukSasaran(f: { barang?: number; q?: string }): Promise<AsetOpname[]> {
  if (!f.barang && !f.q?.trim()) return [];
  let w = sql`a.status = 'AKTIF'`;
  if (f.barang) w = sql`${w} AND a.barang_id = ${f.barang}`;
  if (f.q?.trim()) {
    const p = `%${escapeLike(f.q.trim())}%`;
    w = sql`${w} AND (a.nama LIKE ${p} OR a.nama_resmi LIKE ${p} OR a.kode_barang LIKE ${p} OR a.register LIKE ${p} OR a.keterangan LIKE ${p})`;
  }
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT ${KOLOM_RINGAN}, l.nama AS lokasi_nama FROM bba_aset a LEFT JOIN bba_lokasi l ON l.id = a.lokasi_id
    WHERE ${w} ORDER BY FIELD(a.kondisi, 'B', 'RR', 'RB') DESC, a.tahun_perolehan, a.kode_barang, a.register LIMIT 200
  `);
  return rows.map(r => ({ ...petakanRingan(r), lokasi_nama: (r.lokasi_nama as string | null) ?? null }));
}

export interface GedungPilihan { id: number; nama: string; kode_barang: string | null; register: string | null; ruangan: number }

/** Pilihan gedung (KIB C aktif) untuk Master Ruangan & opname per gedung. */
export async function listGedung(): Promise<GedungPilihan[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT a.id, a.nama, a.nama_resmi, a.kode_barang, a.register,
           (SELECT COUNT(*) FROM bba_lokasi l WHERE l.gedung_aset_id = a.id) AS ruangan
    FROM bba_aset a WHERE a.golongan = 'C' AND a.status = 'AKTIF'
    ORDER BY COALESCE(a.nama, a.nama_resmi), a.kode_barang, a.register LIMIT 1000
  `);
  return rows.map(r => ({
    id: Number(r.id), nama: namaTampil({ nama: r.nama as string | null, nama_resmi: String(r.nama_resmi ?? '') }),
    kode_barang: (r.kode_barang as string | null) ?? null, register: (r.register as string | null) ?? null, ruangan: Number(r.ruangan ?? 0),
  }));
}

// ─── Catat kondisi, pindah ruangan, tautkan barang (Tahap C, §7.2) ───────────

type BarisKunci = {
  id: number; golongan: Golongan; nama: string | null; nama_resmi: string; register: string | null; status: 'AKTIF' | 'DIHAPUS'; version: number;
  kondisi: Kondisi | null; kondisi_sumber: 'IMPOR' | 'CEK' | null; kondisi_tgl: string | null;
  lokasi_id: number | null; barang_id: number | null;
};

/**
 * Kunci semua register yang dikirim (`FOR UPDATE OF a` — baris barang/lokasi tidak ikut dikunci, urutan
 * kunci sama dengan `ubahAset`), lalu periksa versinya. Satu saja yang berubah → seluruhnya 409 (L77:
 * layar memuat ulang angka kunci segar, bukan menulis di atas yang dilihat orang lain).
 */
async function kunciAset(tx: TxSql, item: { id: number; expected_version: number }[]): Promise<Map<number, BarisKunci>> {
  const ids = item.map(x => x.id);
  const rows = await tx`
    SELECT a.id, a.golongan, a.nama, a.nama_resmi, a.register, a.status, a.version, a.kondisi, a.kondisi_sumber,
           DATE_FORMAT(a.kondisi_tgl, '%Y-%m-%d') AS kondisi_tgl, a.lokasi_id, a.barang_id
    FROM bba_aset a WHERE a.id IN (${ids}) FOR UPDATE OF a
  ` as Record<string, unknown>[];
  if (rows.length !== ids.length) throw new AsetTidakAdaError();
  const per = new Map(rows.map(r => [Number(r.id), {
    id: Number(r.id), golongan: r.golongan as Golongan, nama: (r.nama as string | null) ?? null, nama_resmi: String(r.nama_resmi ?? ''),
    register: (r.register as string | null) ?? null, status: r.status as 'AKTIF' | 'DIHAPUS', version: Number(r.version ?? 0), kondisi: (r.kondisi as Kondisi | null) ?? null,
    kondisi_sumber: (r.kondisi_sumber as 'IMPOR' | 'CEK' | null) ?? null, kondisi_tgl: (r.kondisi_tgl as string | null) ?? null,
    lokasi_id: r.lokasi_id == null ? null : Number(r.lokasi_id), barang_id: r.barang_id == null ? null : Number(r.barang_id),
  } satisfies BarisKunci]));
  const basi = item.filter(x => per.get(x.id)!.version !== x.expected_version).length;
  if (basi > 0) throw new AsetVersiError(basi);
  return per;
}

const namaRegister = (a: BarisKunci) => `${namaTampil(a)}${a.register ? ` reg. ${a.register}` : ''}`;
const teksKondisi = (k: Kondisi | null) => (k ? TEKS_KONDISI_KIB[k] : '—');

export interface HasilCatatKondisi { dicek: number; berubah: number; tgl: string }

/**
 * Satu pemeriksaan (opname ruangan/gedung, laporan rusak, atau kartu aset). Semua register yang dikirim
 * ditulis atau tidak sama sekali. Tanggal ≤ hari ini (WIB); pemeriksaan bertanggal lebih lama dari yang
 * sudah tercatat ditolak (`alasanTolakCek`) — ia akan menimpa hasil yang lebih baru.
 */
export async function catatKondisi(input: CatatKondisiInput, userId: number): Promise<HasilCatatKondisi> {
  const hariIni = tanggalHariIniWIB();
  if (input.tgl > hariIni) throw new AsetDitolakError([`Tanggal pemeriksaan ${fmtTanggal(input.tgl)} sesudah hari ini (${fmtTanggal(hariIni)}).`]);
  return withTransaction(async ({ tx, conn }) => {
    const per = await kunciAset(tx, input.item);
    const alasan = input.item.map(x => { const a = per.get(x.id)!; return alasanTolakCek({ ...a, nama: namaRegister(a) }, input.tgl); }).filter((s): s is string => !!s);
    if (alasan.length) throw new AsetDitolakError(alasan);
    await pastikanBerkasBba(tx, [input.file_id]);
    const perKondisi = new Map<Kondisi, number[]>();
    for (const x of input.item) perKondisi.set(x.kondisi, [...(perKondisi.get(x.kondisi) ?? []), x.id]);
    // Dikelompokkan per kondisi: paling banyak tiga UPDATE untuk seribu register (PERF-C1).
    for (const [kondisi, ids] of perKondisi) {
      await tx`
        UPDATE bba_aset SET kondisi = ${kondisi}, kondisi_sumber = 'CEK', kondisi_tgl = ${input.tgl}, kondisi_oleh = ${userId},
          version = version + 1, updated_by = ${userId}
        WHERE id IN (${ids})
      `;
    }
    await bulkInsert('bba_aset_riwayat', ['aset_id', 'jenis', 'sebelum', 'sesudah', 'catatan', 'file_id', 'oleh'], input.item.map(x => {
      const a = per.get(x.id)!;
      return [x.id, 'KONDISI',
        JSON.stringify({ kondisi: teksKondisi(a.kondisi), ...(a.kondisi_sumber === 'CEK' ? { dicek: a.kondisi_tgl } : { sumber: a.kondisi_sumber === 'IMPOR' ? 'impor KIB' : null }) }),
        JSON.stringify({ kondisi: teksKondisi(x.kondisi), dicek: input.tgl }), input.catatan || null, input.file_id || null, userId];
    }), conn);
    return { dicek: input.item.length, berubah: input.item.filter(x => per.get(x.id)!.kondisi !== x.kondisi).length, tgl: input.tgl };
  });
}

export interface HasilPindah { dipindah: number; tetap: number; ruangan: string | null }

/** Peralatan (B) & aset tetap lainnya (E) saja — gedung/tanah/jalan tidak berpindah ruangan. */
export async function pindahkanAset(input: PindahAsetInput, userId: number): Promise<HasilPindah> {
  return withTransaction(async ({ tx, conn }) => {
    const per = await kunciAset(tx, input.item);
    let ruangan: string | null = null;
    if (input.lokasi_id !== null) {
      // L68: lokasi soft-FK dicek ada (FK sungguhan tetap jaring terakhir). FOR SHARE: hapus ruangan menunggu.
      const l = await tx`SELECT nama FROM bba_lokasi WHERE id = ${input.lokasi_id} FOR SHARE` as Array<{ nama: string }>;
      if (l.length === 0) throw new BbaLokasiTidakDikenalError();
      ruangan = String(l[0].nama);
    }
    const alasan = input.item.map(x => per.get(x.id)!).flatMap(a =>
      a.status !== 'AKTIF' ? [`${namaRegister(a)} sudah dihapus dari buku aset.`]
        : !bolehBerRuang(a.golongan) ? [`${namaRegister(a)}: golongan ${a.golongan} tidak ditempatkan di ruangan (hanya peralatan & aset tetap lainnya).`] : []);
    if (alasan.length) throw new AsetDitolakError(alasan);
    const pindah = input.item.map(x => per.get(x.id)!).filter(a => a.lokasi_id !== input.lokasi_id);
    if (pindah.length === 0) return { dipindah: 0, tetap: input.item.length, ruangan };
    const lamaIds = [...new Set(pindah.map(a => a.lokasi_id).filter((x): x is number => x !== null))];
    const namaLama = new Map(lamaIds.length
      ? (await tx`SELECT id, nama FROM bba_lokasi WHERE id IN (${lamaIds})` as Array<{ id: number; nama: string }>).map(r => [Number(r.id), String(r.nama)])
      : []);
    await tx`UPDATE bba_aset SET lokasi_id = ${input.lokasi_id}, version = version + 1, updated_by = ${userId} WHERE id IN (${pindah.map(a => a.id)})`;
    await bulkInsert('bba_aset_riwayat', ['aset_id', 'jenis', 'sebelum', 'sesudah', 'catatan', 'oleh'], pindah.map(a => [
      a.id, 'PINDAH', JSON.stringify({ ruangan: a.lokasi_id ? namaLama.get(a.lokasi_id) ?? null : null }), JSON.stringify({ ruangan }), input.catatan || null, userId,
    ]), conn);
    return { dipindah: pindah.length, tetap: input.item.length - pindah.length, ruangan };
  });
}

export interface HasilTautkanAset { ditautkan: number; tetap: number; barang: string | null }

/** Banyak register sekaligus ke satu barang (atau dilepas: barang_id null). Kolom KIB tidak disentuh. */
export async function tautkanBarangAset(input: TautkanBarangAsetInput, userId: number): Promise<HasilTautkanAset> {
  return withTransaction(async ({ tx, conn }) => {
    const per = await kunciAset(tx, input.item);
    const barangId = await tentukanBarang(tx, { barang_id: input.barang_id, barang_baru: input.barang_baru }, userId);
    if (barangId === undefined) throw new AsetDitolakError(['Pilih barangnya dulu.']);
    const ubah = input.item.map(x => per.get(x.id)!).filter(a => a.barang_id !== barangId);
    const ids = [...new Set([...ubah.map(a => a.barang_id), barangId].filter((x): x is number => x !== null))];
    const nama = new Map(ids.length ? (await tx`SELECT id, nama FROM bba_barang WHERE id IN (${ids})` as Array<{ id: number; nama: string }>).map(r => [Number(r.id), String(r.nama)]) : []);
    const namaBaru = barangId === null ? null : nama.get(barangId) ?? null;
    if (ubah.length === 0) return { ditautkan: 0, tetap: input.item.length, barang: namaBaru };
    await tx`UPDATE bba_aset SET barang_id = ${barangId}, version = version + 1, updated_by = ${userId} WHERE id IN (${ubah.map(a => a.id)})`;
    await bulkInsert('bba_aset_riwayat', ['aset_id', 'jenis', 'sebelum', 'sesudah', 'oleh'], ubah.map(a => [
      a.id, 'UBAH', JSON.stringify({ barang: a.barang_id ? nama.get(a.barang_id) ?? null : null }), JSON.stringify({ barang: namaBaru }), userId,
    ]), conn);
    return { ditautkan: ubah.length, tetap: input.item.length - ubah.length, barang: namaBaru };
  });
}

// ─── Kartu aset ──────────────────────────────────────────────────────────────

export interface RiwayatAset {
  id: number; jenis: string; sebelum: Record<string, unknown> | null; sesudah: Record<string, unknown> | null;
  catatan: string | null; file_id: string | null; oleh: string | null; pada: string;
}
export interface AsetTerkait { id: number; golongan: Golongan; nama: string; register: string | null; tahun: number | null }
/** Rencana yang menjadikan aset ini sasaran (Tahap D) — diganti, diperbaiki, direhab. */
export interface RencanaTerkait { id: number; canonical_id: string; tahun: number; jenis: JenisRencana | null; status: BbaStatus; anggaran: Anggaran; uraian: string }
export interface DetailAset {
  aset: AsetRingan & { version: number; barang_id: number | null; barang_nama: string | null; lokasi_nama: string | null; kondisi_tgl: string | null; kondisi_oleh: string | null };
  riwayat: RiwayatAset[];
  /** Gedung/jalan/KDP → tanah tempatnya berdiri (Nomor Kode Tanah, §4 temuan 4). */
  tanah: AsetTerkait | null;
  /** Tanah → bangunan & jaringan yang menunjuk tanah ini. */
  diAtasnya: AsetTerkait[];
  rencana: RencanaTerkait[];
}

const terkait = (r: Record<string, unknown>): AsetTerkait => ({
  id: Number(r.id), golongan: r.golongan as Golongan, nama: namaTampil({ nama: r.nama as string | null, nama_resmi: String(r.nama_resmi ?? '') }),
  register: (r.register as string | null) ?? null, tahun: r.tahun_perolehan == null ? null : Number(r.tahun_perolehan),
});

export async function detailAset(id: number): Promise<DetailAset | null> {
  const r = await queryOne<Record<string, unknown>>(sql`
    SELECT ${KOLOM_RINGAN}, a.kib, g.nama AS barang_nama, l.nama AS lokasi_nama, u.username AS kondisi_oleh
    FROM bba_aset a
    LEFT JOIN bba_barang g ON g.id = a.barang_id
    LEFT JOIN bba_lokasi l ON l.id = a.lokasi_id
    LEFT JOIN users u ON u.id = a.kondisi_oleh
    WHERE a.id = ${id} LIMIT 1
  `);
  if (!r) return null;
  const ringan = petakanRingan(r);
  const aset = {
    ...ringan, version: ringan.version ?? 0, barang_id: ringan.barang_id ?? null, kondisi_tgl: ringan.kondisi_tgl ?? null,
    barang_nama: (r.barang_nama as string | null) ?? null, lokasi_nama: (r.lokasi_nama as string | null) ?? null,
    kondisi_oleh: (r.kondisi_oleh as string | null) ?? null,
  };
  const kodeTanahIni = aset.golongan === 'A' && aset.kode_barang && aset.register ? kodeTanah(aset.kode_barang, aset.register) : null;
  const rujukanTanah = typeof aset.kib.nomor_kode_tanah === 'string' ? aset.kib.nomor_kode_tanah.trim() : '';
  const [riw, tanah, diAtasnya, rencana] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`
      SELECT r.id, r.jenis, r.sebelum, r.sesudah, r.catatan, r.file_id, u.username AS oleh, DATE_FORMAT(r.dicatat_pada, '%Y-%m-%d %H:%i') AS dicatat
      FROM bba_aset_riwayat r LEFT JOIN users u ON u.id = r.oleh WHERE r.aset_id = ${id} ORDER BY r.dicatat_pada DESC, r.id DESC LIMIT 100
    `),
    rujukanTanah ? queryOne<Record<string, unknown>>(sql`
      SELECT id, golongan, nama, nama_resmi, register, tahun_perolehan FROM bba_aset
      WHERE golongan = 'A' AND CONCAT(kode_barang, '.', register) = ${rujukanTanah} LIMIT 1
    `) : Promise.resolve(null),
    kodeTanahIni ? queryMany<Record<string, unknown>>(sql`
      SELECT id, golongan, nama, nama_resmi, register, tahun_perolehan FROM bba_aset
      WHERE golongan IN ('C','D','F') AND status = 'AKTIF' AND JSON_UNQUOTE(JSON_EXTRACT(kib, '$.nomor_kode_tanah')) = ${kodeTanahIni}
      ORDER BY kode_barang, register LIMIT 200
    `) : Promise.resolve([]),
    queryMany<Record<string, unknown>>(sql`
      SELECT b.id, b.canonical_id, b.tahun_anggaran, b.jenis_rencana, b.status, b.anggaran, b.uraian
      FROM bba_rencana_aset ra JOIN buku_besar_aset b ON b.id = ra.rencana_id
      WHERE ra.aset_id = ${id} ORDER BY b.tahun_anggaran DESC, b.canonical_id LIMIT 50
    `),
  ]);
  return {
    aset,
    riwayat: riw.map(x => ({
      id: Number(x.id), jenis: String(x.jenis), sebelum: bacaKib(x.sebelum) as Record<string, unknown>, sesudah: bacaKib(x.sesudah) as Record<string, unknown>,
      catatan: (x.catatan as string | null) ?? null, file_id: (x.file_id as string | null) ?? null,
      oleh: (x.oleh as string | null) ?? null, pada: String(x.dicatat ?? ''), // sudah teks: DATE_FORMAT di SQL
    })),
    tanah: tanah ? terkait(tanah) : null,
    diAtasnya: diAtasnya.map(terkait),
    rencana: rencana.map(x => ({
      id: Number(x.id), canonical_id: String(x.canonical_id ?? ''), tahun: Number(x.tahun_anggaran), jenis: (x.jenis_rencana as JenisRencana | null) ?? null,
      status: x.status as BbaStatus, anggaran: x.anggaran as Anggaran, uraian: String(x.uraian ?? ''),
    })),
  };
}

export interface UbahAsetInput {
  id: number;
  expected_version: number;
  nama?: string | null;
  barang_id?: number | null;
  barang_baru?: string | null;
}

/** Tambahan PRIMA di kartu aset: nama sehari-hari & kaitan ke kamus barang. Kolom KIB milik impor. */
export async function ubahAset(input: UbahAsetInput, userId: number): Promise<void> {
  await withTransaction(async ({ tx }) => {
    // `FOR UPDATE OF a`: hanya baris aset yang dikunci — mengunci baris barang juga membalik urutan
    // kunci terhadap Gabungkan barang (barang dulu, baru aset) dan membuka peluang buntu.
    const ada = await tx`
      SELECT a.version, a.nama, a.barang_id, g.nama AS barang_nama
      FROM bba_aset a LEFT JOIN bba_barang g ON g.id = a.barang_id
      WHERE a.id = ${input.id} FOR UPDATE OF a
    ` as Array<{ version: number; nama: string | null; barang_id: number | null; barang_nama: string | null }>;
    if (ada.length === 0) throw new AsetTidakAdaError();
    if (Number(ada[0].version) !== input.expected_version) throw new AsetVersiError();
    const lama = ada[0];
    const sebelum: Record<string, unknown> = {}, sesudah: Record<string, unknown> = {};
    let set = sql`version = version + 1, updated_by = ${userId}`;
    if (input.nama !== undefined) {
      const nama = input.nama?.replace(/\s+/g, ' ').trim() || null;
      if (nama !== (lama.nama ?? null)) { set = sql`${set}, nama = ${nama}`; sebelum.nama = lama.nama; sesudah.nama = nama; }
    }
    const barangId = await tentukanBarang(tx, { barang_id: input.barang_id, barang_baru: input.barang_baru }, userId);
    if (barangId !== undefined && barangId !== (lama.barang_id == null ? null : Number(lama.barang_id))) {
      set = sql`${set}, barang_id = ${barangId}`;
      const nb = barangId === null ? null : await tx`SELECT nama FROM bba_barang WHERE id = ${barangId}` as Array<{ nama: string }>;
      sebelum.barang = lama.barang_nama; sesudah.barang = nb ? nb[0]?.nama ?? null : null;
    }
    if (Object.keys(sesudah).length === 0) return;
    await tx`UPDATE bba_aset SET ${set} WHERE id = ${input.id}`;
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, oleh)
      VALUES (${input.id}, 'UBAH', ${JSON.stringify(sebelum)}, ${JSON.stringify(sesudah)}, ${userId})
    `;
  });
}

// ─── Impor KIB ───────────────────────────────────────────────────────────────

async function asetLamaUntuk(q: TxSql | null, golongan: Golongan[], kunci: boolean): Promise<AsetRingan[]> {
  if (golongan.length === 0) return [];
  const rows = q
    ? await q`SELECT ${KOLOM_RINGAN}, a.kib FROM bba_aset a WHERE a.golongan IN (${golongan}) ${kunci ? sql`FOR UPDATE` : sql``}` as Record<string, unknown>[]
    : await queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_RINGAN}, a.kib FROM bba_aset a WHERE a.golongan IN (${golongan})`);
  return rows.map(petakanRingan);
}

export interface RingkasImpor {
  perGolongan: { golongan: Golongan; baru: number; berubah: number; sama: number; tidakDiBerkas: number; dihapusDiPrima: number }[];
  contohBerubah: { nama: string; register: string | null; kolom: string[] }[];
  contohBaru: { nama: string; register: string | null; tahun: number | null; harga: number }[];
  contohTidakDiBerkas: { nama: string; register: string | null; tahun: number | null }[];
}

function ringkasRencana(r: RencanaImpor, golongan: Golongan[]): RingkasImpor {
  const hitung = <T,>(xs: T[], g: (x: T) => Golongan) => (k: Golongan) => xs.filter(x => g(x) === k).length;
  const baru = hitung(r.baru, x => x.golongan), berubah = hitung(r.berubah, x => x.baru.golongan);
  const tidak = hitung(r.tidakDiBerkas, x => x.golongan), dihapus = hitung(r.dihapusDiPrima, x => x.golongan);
  return {
    perGolongan: golongan.map(g => ({ golongan: g, baru: baru(g), berubah: berubah(g), sama: 0, tidakDiBerkas: tidak(g), dihapusDiPrima: dihapus(g) })),
    contohBerubah: r.berubah.slice(0, 50).map(x => ({ nama: namaTampil(x.lama), register: x.lama.register, kolom: x.kolom })),
    contohBaru: r.baru.slice(0, 20).map(x => ({ nama: namaDariKeterangan(x.keterangan) ?? x.nama_resmi, register: x.register, tahun: x.tahun_perolehan, harga: x.harga })),
    contohTidakDiBerkas: r.tidakDiBerkas.slice(0, 20).map(x => ({ nama: namaTampil(x), register: x.register, tahun: x.tahun_perolehan })),
  };
}

function isiSama(r: RingkasImpor, rencana: RencanaImpor, baca: readonly AsetBaca[]): RingkasImpor {
  const berubahKunci = new Set(rencana.berubah.map(x => x.baru.kunci));
  const baruKunci = new Set(rencana.baru.map(x => x.kunci));
  const dihapusKunci = new Set(rencana.dihapusDiPrima.map(x => x.kunci));
  for (const p of r.perGolongan) {
    p.sama = baca.filter(b => b.golongan === p.golongan && !berubahKunci.has(b.kunci) && !baruKunci.has(b.kunci) && !dihapusKunci.has(b.kunci)).length;
  }
  return r;
}

export async function pratinjauImpor(hasil: HasilBacaKib): Promise<RingkasImpor> {
  const golongan = [...new Set(hasil.aset.map(a => a.golongan))];
  const rencana = rencanakanImpor(await asetLamaUntuk(null, golongan, false), hasil.aset);
  return isiSama(ringkasRencana(rencana, golongan), rencana, hasil.aset);
}

const POTONG = 500;
const potong = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / POTONG) }, (_, i) => xs.slice(i * POTONG, (i + 1) * POTONG));

export interface HasilSimpanImpor { baru: number; berubah: number; sama: number; tidakDiBerkas: number; dihapusDiPrima: number }

export async function simpanImpor(hasil: HasilBacaKib, userId: number, namaBerkas: string): Promise<HasilSimpanImpor> {
  const golongan = [...new Set(hasil.aset.map(a => a.golongan))];
  return withTransaction(async ({ tx, conn }) => {
    // Dua impor berbarengan: yang kedua menunggu, lalu menghitung rencananya dari isi sesudah yang pertama.
    await acquireBludLock(tx, 'bba_aset_impor', 'semua');
    const rencana = rencanakanImpor(await asetLamaUntuk(tx, golongan, true), hasil.aset);
    const catatan = `Impor KIB — ${namaBerkas}`.slice(0, 500);

    for (const bagian of potong(rencana.baru)) {
      await bulkInsert('bba_aset', [
        'golongan', 'kode_barang', 'register', 'kunci_impor', 'kode_objek', 'tahun_perolehan', 'nama_resmi', 'nama',
        'kib', 'harga', 'asal_usul', 'keterangan', 'kondisi', 'kondisi_sumber', 'created_by', 'updated_by',
      ], bagian.map(a => [
        a.golongan, a.kode_barang, a.register, a.kunci, a.kode_objek, a.tahun_perolehan, a.nama_resmi, namaDariKeterangan(a.keterangan),
        JSON.stringify(a.kib), a.harga, a.asal_usul, a.keterangan, a.kondisi, a.kondisi ? 'IMPOR' : null, userId, userId,
      ]), conn);
      const ids = await tx`SELECT id, kunci_impor FROM bba_aset WHERE kunci_impor IN (${bagian.map(a => a.kunci)})` as Array<{ id: number; kunci_impor: string }>;
      const idPer = new Map(ids.map(x => [x.kunci_impor, Number(x.id)]));
      await bulkInsert('bba_aset_riwayat', ['aset_id', 'jenis', 'sebelum', 'sesudah', 'catatan', 'oleh'], bagian.map(a => [
        idPer.get(a.kunci), 'IMPOR', null, JSON.stringify({ kode_barang: a.kode_barang, register: a.register, harga: a.harga, kondisi: a.kondisi }), catatan, userId,
      ]), conn);
    }

    for (const bagian of potong(rencana.berubah)) {
      const baris = bagian.map(({ lama, ubah }) => {
        const akhir = { ...lama, ...ubah };
        return [lama.id, lama.golongan, akhir.nama_resmi, akhir.kode_objek, akhir.tahun_perolehan, akhir.harga, akhir.asal_usul, akhir.keterangan,
          JSON.stringify(akhir.kib), akhir.kondisi, lama.kondisi_sumber === 'CEK' ? 'CEK' : (akhir.kondisi ? 'IMPOR' : null), userId];
      });
      // Upsert per PK: satu pernyataan per 500 baris, bukan ribuan UPDATE (PERF-C1).
      await (conn as mysql.PoolConnection).query(`
        INSERT INTO bba_aset (id, golongan, nama_resmi, kode_objek, tahun_perolehan, harga, asal_usul, keterangan, kib, kondisi, kondisi_sumber, updated_by)
        VALUES ? AS baru
        ON DUPLICATE KEY UPDATE nama_resmi = baru.nama_resmi, kode_objek = baru.kode_objek, tahun_perolehan = baru.tahun_perolehan,
          harga = baru.harga, asal_usul = baru.asal_usul, keterangan = baru.keterangan, kib = baru.kib, kondisi = baru.kondisi,
          kondisi_sumber = baru.kondisi_sumber, updated_by = baru.updated_by, version = bba_aset.version + 1
      `, [baris]);
      await bulkInsert('bba_aset_riwayat', ['aset_id', 'jenis', 'sebelum', 'sesudah', 'catatan', 'oleh'], bagian.map(({ lama, ubah }) => {
        const sebelum: Record<string, unknown> = {}, sesudah: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(ubah)) {
          if (k === 'kib') {
            const kib = v as Record<string, NilaiKib>;
            for (const kk of new Set([...Object.keys(lama.kib), ...Object.keys(kib)])) {
              if ((lama.kib[kk] ?? null) !== (kib[kk] ?? null)) { sebelum[kk] = lama.kib[kk] ?? null; sesudah[kk] = kib[kk] ?? null; }
            }
          } else { sebelum[k] = (lama as unknown as Record<string, unknown>)[k] ?? null; sesudah[k] = v ?? null; }
        }
        return [lama.id, 'IMPOR', JSON.stringify(sebelum), JSON.stringify(sesudah), catatan, userId];
      }), conn);
    }
    const sama = hasil.aset.length - rencana.baru.length - rencana.berubah.length - rencana.dihapusDiPrima.length;
    return { baru: rencana.baru.length, berubah: rencana.berubah.length, sama, tidakDiBerkas: rencana.tidakDiBerkas.length, dihapusDiPrima: rencana.dihapusDiPrima.length };
  });
}

// ─── Excel & pengaturan ──────────────────────────────────────────────────────

export async function asetUntukKib(golongan: Golongan): Promise<AsetRingan[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_RINGAN}, a.kib FROM bba_aset a WHERE a.golongan = ${golongan} AND a.status = 'AKTIF'`);
  return rows.map(petakanRingan);
}

/** Seluruh buku aktif + nama-nama tambahan PRIMA (sensus, BI, Rekap, format kerja). */
export async function asetAktifLengkap(): Promise<AsetKerja[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT ${KOLOM_RINGAN}, a.kib, l.nama AS lokasi_nama, COALESCE(gd.nama, gd.nama_resmi) AS gedung_nama, g.nama AS barang_nama, u.username AS kondisi_oleh_nama,
           (SELECT GROUP_CONCAT(CONCAT(b.tahun_anggaran, '|', COALESCE(b.jenis_rencana, ''), '|', b.canonical_id) ORDER BY b.tahun_anggaran DESC SEPARATOR ';')
              FROM bba_rencana_aset ra JOIN buku_besar_aset b ON b.id = ra.rencana_id WHERE ra.aset_id = a.id) AS rencana_terkait
    FROM bba_aset a
    LEFT JOIN bba_lokasi l ON l.id = a.lokasi_id
    LEFT JOIN bba_aset gd ON gd.id = l.gedung_aset_id
    LEFT JOIN bba_barang g ON g.id = a.barang_id
    LEFT JOIN users u ON u.id = a.kondisi_oleh
    WHERE a.status = 'AKTIF'
  `);
  return rows.map(r => ({
    ...petakanRingan(r), lokasi_nama: (r.lokasi_nama as string | null) ?? null, gedung_nama: (r.gedung_nama as string | null) ?? null,
    barang_nama: (r.barang_nama as string | null) ?? null, kondisi_oleh_nama: (r.kondisi_oleh_nama as string | null) ?? null,
    rencana_terkait: r.rencana_terkait ? String(r.rencana_terkait).split(';').map(s => {
      const [tahun, jenis, kode] = s.split('|');
      return `${tahun} ${jenis ? LABEL_JENIS[jenis as JenisRencana] : 'rencana'} ${kode}`;
    }).join('; ') : null,
  }));
}

export type RuangDenganIsi = RuangKir & { id: number; aset: AsetRingan[] };

/** KIR: satu ruangan, atau (tanpa id) semua ruangan yang berisi aset aktif — urut nama ruangan. */
export async function ruangUntukKir(lokasiId?: number): Promise<RuangDenganIsi[]> {
  const [ruang, aset] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`
      SELECT l.id, l.nama, l.luas, l.pj_nama, l.pj_nip, COALESCE(g.nama, g.nama_resmi) AS gedung_nama, g.kode_barang AS gedung_kode, g.register AS gedung_register, g.id AS gedung_id
      FROM bba_lokasi l LEFT JOIN bba_aset g ON g.id = l.gedung_aset_id
      ${lokasiId ? sql`WHERE l.id = ${lokasiId}` : sql``} ORDER BY l.urutan, l.nama
    `),
    queryMany<Record<string, unknown>>(sql`
      SELECT ${KOLOM_RINGAN}, a.kib FROM bba_aset a
      WHERE a.status = 'AKTIF' AND a.lokasi_id ${lokasiId ? sql`= ${lokasiId}` : sql`IS NOT NULL`}
    `),
  ]);
  const per = new Map<number, AsetRingan[]>();
  for (const a of aset.map(petakanRingan)) per.set(a.lokasi_id!, [...(per.get(a.lokasi_id!) ?? []), a]);
  return ruang
    .map(r => ({
      id: Number(r.id), nama: String(r.nama ?? ''), luas: r.luas == null ? null : Number(r.luas),
      pj_nama: (r.pj_nama as string | null) ?? null, pj_nip: (r.pj_nip as string | null) ?? null,
      gedung: r.gedung_id == null ? null : { nama: String(r.gedung_nama ?? ''), kode_barang: (r.gedung_kode as string | null) ?? null, register: (r.gedung_register as string | null) ?? null },
      aset: per.get(Number(r.id)) ?? [],
    }))
    .filter(r => lokasiId || r.aset.length > 0);
}

export async function simpanPengaturanBba(p: PengaturanBba): Promise<void> {
  await sql`
    INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_PENGATURAN}, ${JSON.stringify(p)})
    ON DUPLICATE KEY UPDATE value = VALUES(value)
  `;
}
