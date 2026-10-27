// ═══ PRIMA — Buku Besar Aset (BBA) — Data Layer ════════════════════
// CRUD tabel `buku_besar_aset`. Optimistic lock per-row via kolom `version` (L48 CAS).
// canonical_id stabil lintas-tahun, di-derive dari AUTO_INCREMENT id (anti-race, bukan MAX+1).
// Kolom turunan (sisa/pct) TIDAK disimpan (Checkpoint D) — dihitung di mapper.
import type mysql from 'mysql2/promise';
import { sql, queryMany, queryOne, withTransaction, bulkInsert, escapeLike, sqlInt, type Penanya } from '@/lib/data/db';
import { toDateStr, tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { fmtTanggal, batasCek, ringkasDimiliki, ringkasDimilikiPerBarang, type Dimiliki } from '@/lib/bba/kondisi';
import { KUNCI_PENGATURAN, bacaPengaturan, type PengaturanBba } from '@/lib/bba/pengaturan';
import type { Golongan, Kondisi } from '@/lib/bba/kib';
import { isSafeFileUrl } from '@/lib/shared/url';
import {
  kelengkapanRef, kelengkapanBukti, referensiSah, rapikanReferensi, referensiSama, slotDariUsulan, tautanAman, MAKS_BUKTI,
  type KelengkapanRef, type KelengkapanBukti, type ReferensiIsian, type JenisBukti,
} from '@/lib/bba/referensi';
import {
  isValidStatusTransition, statusSebelumTerima, referensiBeku, alasanTakBisaHapus, STATUS_BELUM_TEREALISASI, LABEL_STATUS,
} from '@/lib/bba/status';
import {
  rapikanNamaBarang, kunciNamaBarang, barangBernamaSama, ringkasPerBarang, ringkasKosong, riwayatPerTahun,
  type BahanBarang, type BahanRefBarang, type RingkasBarang, type BarisRiwayat,
} from '@/lib/bba/barang';
import type {
  BbaStatus, BbaCreateInput, BbaUpdateInput, BbaRealisasiInput, BbaQuery, ReferensiInput, BuktiCreateInput,
  BarangCreateInput, BarangUpdateInput, BarangTautkanInput, LokasiUpdateInput,
} from './buku-besar-aset-schemas';

export class BbaVersionConflictError extends Error {
  constructor() { super('Data sudah diubah pengguna lain. Memuat versi terbaru.'); this.name = 'BbaVersionConflictError'; }
}
export class BbaTransitionError extends Error {
  constructor(from: string, to: string) { super(`Transisi status ${from} → ${to} tidak diizinkan.`); this.name = 'BbaTransitionError'; }
}
export class BbaNotFoundError extends Error {
  constructor() { super('Data aset tidak ditemukan.'); this.name = 'BbaNotFoundError'; }
}
export class BbaUsulanLockedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'BbaUsulanLockedError'; }
}
export class BbaRealisasiRangeError extends Error {
  constructor(volReal: number, vol: number) { super(`Unit realisasi (${volReal}) melebihi volume rencana (${vol}).`); this.name = 'BbaRealisasiRangeError'; }
}
export class BbaStatusMismatchError extends Error {
  constructor(msg: string) { super(msg); this.name = 'BbaStatusMismatchError'; }
}
export class BbaBerkasTidakDikenalError extends Error {
  constructor() { super('Berkas tidak dikenal sebagai unggahan Buku Besar Aset. Unggah ulang berkasnya dari modal item.'); this.name = 'BbaBerkasTidakDikenalError'; }
}
export class BbaBuktiPenuhError extends Error {
  constructor() { super(`Bukti dukung paling banyak ${MAKS_BUKTI} per item.`); this.name = 'BbaBuktiPenuhError'; }
}
export class BbaBarangTidakDikenalError extends Error {
  constructor() { super('Barang tidak ditemukan — mungkin baru saja digabung atau dihapus. Pilih ulang barangnya.'); this.name = 'BbaBarangTidakDikenalError'; }
}
export class BbaBarangKembarError extends Error {
  constructor(nama: string) { super(`Barang "${nama}" sudah ada di Master Barang.`); this.name = 'BbaBarangKembarError'; }
}
export class BbaBarangDipakaiError extends Error {
  constructor(item: number, pendataan = 0, aset = 0) {
    const dipakai = [item > 0 ? `${item} item` : '', pendataan > 0 ? `${pendataan} pendataan eksisting lama` : '', aset > 0 ? `${aset} aset di Buku Aset` : ''].filter(Boolean).join(' dan ');
    super(`Barang ini dipakai ${dipakai}. Gabungkan ke barang lain dulu (tombol Gabungkan), baru barangnya hilang dari daftar.`);
    this.name = 'BbaBarangDipakaiError';
  }
}
export class BbaGabungBentrokError extends Error {
  constructor(daftar: string[]) {
    // Pendataan eksisting dipensiunkan di Tahap C (tak ada lagi layar untuk menghapusnya); bentrok hanya
    // mungkin pada data lama di tabel bba_eksisting.
    super(`Kedua barang punya pendataan eksisting lama (sebelum Buku Aset) di ${daftar.join('; ')} pada tanggal yang sama. Data lama itu tidak tampil lagi di PRIMA — minta admin basis data membereskan tabel bba_eksisting, lalu gabungkan.`);
    this.name = 'BbaGabungBentrokError';
  }
}
export class BbaLokasiTidakDikenalError extends Error {
  constructor() { super('Ruangan tidak ditemukan — mungkin baru saja dihapus. Pilih ulang ruangannya.'); this.name = 'BbaLokasiTidakDikenalError'; }
}
export class BbaLokasiKembarError extends Error {
  constructor(nama: string) { super(`Ruangan "${nama}" sudah ada.`); this.name = 'BbaLokasiKembarError'; }
}
export class BbaGedungTidakDikenalError extends Error {
  constructor() { super('Gedung harus aset KIB C yang masih aktif di Buku Aset. Pilih ulang gedungnya.'); this.name = 'BbaGedungTidakDikenalError'; }
}
export class BbaLokasiDipakaiError extends Error {
  constructor(n: number, aset = 0) {
    const dipakai = [n > 0 ? `${n} pendataan eksisting lama` : '', aset > 0 ? `${aset} aset di Buku Aset` : ''].filter(Boolean).join(' dan ');
    super(`Ruangan ini punya ${dipakai}, jadi tidak bisa dihapus. Pindahkan asetnya dulu, atau ganti namanya kalau yang salah hanya namanya.`);
    this.name = 'BbaLokasiDipakaiError';
  }
}
export class BbaRiwayatTerkunciError extends Error {
  constructor(alasan: string) { super(alasan); this.name = 'BbaRiwayatTerkunciError'; }
}
export class BbaReferensiBekuError extends Error {
  constructor(status: BbaStatus) {
    super(`Referensi harga item berstatus ${LABEL_STATUS[status]} tidak bisa diubah — itu catatan harga saat membeli. Muat ulang item untuk membuang perubahan referensinya.`);
    this.name = 'BbaReferensiBekuError';
  }
}

// A3: status & angka realisasi tidak boleh saling bertentangan
function assertStatusConsistent(status: BbaStatus, vol: number, volReal: number, nilaiReal: number): void {
  if (status === 'REALISASI_PENUH' && volReal !== vol)
    throw new BbaStatusMismatchError(`Status REALISASI PENUH mengharuskan unit realisasi (${volReal}) sama dengan volume rencana (${vol}).`);
  if (status === 'TIDAK_TEREALISASI' && (volReal !== 0 || nilaiReal !== 0))
    throw new BbaStatusMismatchError('Status TIDAK TEREALISASI mengharuskan unit & nilai realisasi 0.');
}

export interface BbaRow {
  id: number;
  canonical_id: string;
  tahun_anggaran: number;
  origin: 'MANUAL' | 'USULAN';
  usulan_item_id: number | null;
  usulan_no: string | null;
  usulan_keputusan: 'DISETUJUI' | 'DITOLAK' | null;
  ditolak_oleh: 'ADMIN' | 'KASUBAG' | 'KABAG' | null;
  sub_bidang: string | null;
  kode_rekening: string | null;
  uraian: string;
  kategori_aset: string | null;
  barang_id: number | null;
  barang_nama: string | null;
  sumber_anggaran: 'BLUD' | 'APBD' | 'DAK' | 'LAINNYA';
  vol: number;
  satuan: string | null;
  harga: number;
  nilai_rencana: number;
  status: BbaStatus;
  tgl_proses: string | null;
  nilai_realisasi: number;
  vol_realisasi: number;
  tgl_realisasi: string | null;
  penanggung_jawab: string | null;
  keterangan: string | null;
  version: number;
  // Derived (runtime, tidak di DB):
  sisa: number;
  pct_realisasi: number;
  // Provenance (LEFT JOIN usulan_items — null bila MANUAL / item usulan terhapus):
  pengusul: string | null;
  catatan_penolakan: string | null;
  // url_merk1–3 usulan yang aman (http/https) — isi awal referensi selama belum ada yang tersimpan (§4.1).
  tautan_usulan: string[];
  lampiran_usulan: string | null;
  // Ringkasan referensi & bukti — diisi `isiRingkasan`; `mapRow` saja = belum dihitung (nol).
  ref: KelengkapanRef;
  bukti: KelengkapanBukti | null;
  jumlah_bukti: number;
}

const SELECT_COLS = sql`
  b.id, b.canonical_id, b.tahun_anggaran, b.origin, b.usulan_item_id, b.usulan_no,
  b.usulan_keputusan, b.ditolak_oleh, b.sub_bidang, b.kode_rekening, b.uraian, b.kategori_aset,
  b.barang_id, g.nama AS barang_nama,
  b.sumber_anggaran, b.vol, b.satuan, b.harga, b.nilai_rencana, b.status,
  DATE_FORMAT(b.tgl_proses, '%Y-%m-%d') AS tgl_proses,
  b.nilai_realisasi, b.vol_realisasi, DATE_FORMAT(b.tgl_realisasi, '%Y-%m-%d') AS tgl_realisasi,
  b.penanggung_jawab, b.keterangan, b.version,
  ui.pengusul AS pengusul,
  CASE b.ditolak_oleh
    WHEN 'ADMIN'   THEN ui.admin_catatan
    WHEN 'KASUBAG' THEN ui.kasubag_catatan
    WHEN 'KABAG'   THEN ui.kabag_catatan
    ELSE NULL
  END AS catatan_penolakan,
  ui.url_merk1, ui.url_merk2, ui.url_merk3, ui.file_url AS lampiran_usulan
`;

const FROM_JOIN = sql`FROM buku_besar_aset b LEFT JOIN usulan_items ui ON ui.id = b.usulan_item_id LEFT JOIN bba_barang g ON g.id = b.barang_id`;

export function mapRow(r: Record<string, unknown>): BbaRow {
  const nilai_rencana   = Number(r.nilai_rencana ?? 0);
  const nilai_realisasi = Number(r.nilai_realisasi ?? 0);
  return {
    id: Number(r.id), canonical_id: String(r.canonical_id ?? ''),
    tahun_anggaran: Number(r.tahun_anggaran),
    origin: (r.origin ?? 'MANUAL') as BbaRow['origin'],
    usulan_item_id: r.usulan_item_id == null ? null : Number(r.usulan_item_id),
    usulan_no: r.usulan_no as string | null,
    usulan_keputusan: r.usulan_keputusan as BbaRow['usulan_keputusan'],
    ditolak_oleh: r.ditolak_oleh as BbaRow['ditolak_oleh'],
    sub_bidang: r.sub_bidang as string | null,
    kode_rekening: r.kode_rekening as string | null, uraian: String(r.uraian ?? ''),
    kategori_aset: r.kategori_aset as string | null,
    barang_id: r.barang_id == null ? null : Number(r.barang_id), barang_nama: r.barang_nama as string | null,
    sumber_anggaran: (r.sumber_anggaran ?? 'BLUD') as BbaRow['sumber_anggaran'],
    vol: Number(r.vol ?? 0), satuan: r.satuan as string | null, harga: Number(r.harga ?? 0),
    nilai_rencana, status: r.status as BbaStatus, nilai_realisasi,
    tgl_proses: r.tgl_proses ? toDateStr(r.tgl_proses) : null,
    vol_realisasi: Number(r.vol_realisasi ?? 0),
    // B2: `toDateStr`, bukan `String()` — objek Date yang di-String() berbunyi
    // "Fri Jul 31 2026 00:00:00 GMT+0700 …", ditolak regex Zod saat realisasi disimpan ulang.
    tgl_realisasi: r.tgl_realisasi ? toDateStr(r.tgl_realisasi) : null,
    penanggung_jawab: r.penanggung_jawab as string | null, keterangan: r.keterangan as string | null,
    version: Number(r.version ?? 0),
    // A3: over-realisasi tampil sisa minus apa adanya (konsisten dgn pct >100%), tidak disembunyikan jadi 0
    sisa: nilai_rencana - nilai_realisasi,
    pct_realisasi: nilai_rencana > 0 ? Math.round((nilai_realisasi / nilai_rencana) * 10000) / 100 : 0,
    pengusul: r.pengusul as string | null,
    catatan_penolakan: r.catatan_penolakan as string | null,
    ...ringkasan(r.status as string, tautanAman([r.url_merk1, r.url_merk2, r.url_merk3] as (string | null)[]), [], []),
    lampiran_usulan: isSafeFileUrl(r.lampiran_usulan as string | null) ? String(r.lampiran_usulan).trim() : null,
  };
}

type BahanRef = Pick<ReferensiIsian, 'harga' | 'url' | 'file_id'>;

function ringkasan(status: string, tautan: string[], refs: BahanRef[], jenisBukti: string[]) {
  return {
    tautan_usulan: tautan,
    ref: kelengkapanRef(refs.filter(referensiSah).length, refs.length, tautan.length),
    bukti: kelengkapanBukti(jenisBukti, status),
    jumlah_bukti: jenisBukti.length,
  };
}

/**
 * Kolom Ref & Bukti dihitung di TS lewat `lib/bba/referensi.ts`, bukan `COUNT(CASE …)` di
 * SQL: aturan "referensi sah" cukup satu, dan modal memakai fungsi yang sama.
 */
async function isiRingkasan(rows: BbaRow[]): Promise<BbaRow[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map(r => r.id);
  const [refRows, buktiRows] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`SELECT aset_id, harga, url, file_id FROM bba_referensi_harga WHERE aset_id IN (${ids})`),
    queryMany<Record<string, unknown>>(sql`SELECT aset_id, jenis FROM bba_lampiran WHERE aset_id IN (${ids})`),
  ]);
  const refPer = new Map<number, BahanRef[]>();
  for (const r of refRows) {
    const k = Number(r.aset_id);
    refPer.set(k, [...(refPer.get(k) ?? []), { harga: r.harga == null ? null : Number(r.harga), url: r.url as string | null, file_id: r.file_id as string | null }]);
  }
  const buktiPer = new Map<number, string[]>();
  for (const b of buktiRows) {
    const k = Number(b.aset_id);
    buktiPer.set(k, [...(buktiPer.get(k) ?? []), String(b.jenis)]);
  }
  return rows.map(r => ({ ...r, ...ringkasan(r.status, r.tautan_usulan, refPer.get(r.id) ?? [], buktiPer.get(r.id) ?? []) }));
}

export interface BbaListResult { rows: BbaRow[]; total: number; page: number; limit: number }

function buildWhere(f: BbaQuery) {
  let where = sql`WHERE 1=1`;
  if (f.tahun)     where = sql`${where} AND b.tahun_anggaran = ${f.tahun}`;
  if (f.status)    where = sql`${where} AND b.status = ${f.status}`;
  if (f.sumber)    where = sql`${where} AND b.sumber_anggaran = ${f.sumber}`;
  if (f.kategori)  where = sql`${where} AND b.kategori_aset = ${f.kategori}`;
  if (f.pj)        where = sql`${where} AND b.penanggung_jawab = ${f.pj}`;
  if (f.origin)    where = sql`${where} AND b.origin = ${f.origin}`;
  if (f.keputusan) where = sql`${where} AND b.usulan_keputusan = ${f.keputusan}`;
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    where = sql`${where} AND (b.uraian LIKE ${term} OR b.kode_rekening LIKE ${term} OR b.canonical_id LIKE ${term} OR b.usulan_no LIKE ${term})`;
  }
  return where;
}

export interface BbaKpi { rencana: number; realisasi: number; pct: number; backlog: number; volRencana: number; volReal: number }

// A1: KPI dihitung SQL atas SELURUH data ter-filter — bukan dari page yang
// ter-cap 200 baris. Baris usulan DITOLAK = catatan sejarah, dikecualikan
// (mirror aturan KPI client). NULL keputusan (MANUAL) tetap ikut.
export async function getAsetKpi(f: BbaQuery): Promise<BbaKpi> {
  const where = buildWhere(f);
  const r = await queryOne<Record<string, unknown>>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN b.usulan_keputusan = 'DITOLAK' THEN 0 ELSE b.nilai_rencana END), 0)   AS rencana,
      COALESCE(SUM(CASE WHEN b.usulan_keputusan = 'DITOLAK' THEN 0 ELSE b.nilai_realisasi END), 0) AS realisasi,
      COALESCE(SUM(CASE WHEN b.usulan_keputusan = 'DITOLAK' THEN 0 ELSE b.vol END), 0)             AS vol_rencana,
      COALESCE(SUM(CASE WHEN b.usulan_keputusan = 'DITOLAK' THEN 0 ELSE b.vol_realisasi END), 0)   AS vol_real,
      COALESCE(SUM(CASE WHEN (b.usulan_keputusan IS NULL OR b.usulan_keputusan <> 'DITOLAK')
                         AND b.status IN (${[...STATUS_BELUM_TEREALISASI]}) THEN 1 ELSE 0 END), 0) AS backlog
    FROM buku_besar_aset b ${where}
  `);
  const rencana   = Number(r?.rencana ?? 0);
  const realisasi = Number(r?.realisasi ?? 0);
  return {
    rencana, realisasi,
    pct: rencana > 0 ? Math.round((realisasi / rencana) * 1000) / 10 : 0,
    backlog: Number(r?.backlog ?? 0),
    volRencana: Number(r?.vol_rencana ?? 0),
    volReal: Number(r?.vol_real ?? 0),
  };
}

export async function listAset(f: BbaQuery): Promise<BbaListResult> {
  const where = buildWhere(f);
  const offset = (f.page - 1) * f.limit;
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT ${SELECT_COLS} ${FROM_JOIN} ${where}
    ORDER BY b.tahun_anggaran DESC, b.canonical_id ASC
    LIMIT ${sqlInt(f.limit)} OFFSET ${sqlInt(offset)}
  `);
  const totalRow = await queryOne<{ total: number }>(sql`SELECT COUNT(*) AS total FROM buku_besar_aset b ${where}`);
  return { rows: await isiRingkasan(rows.map(mapRow)), total: Number(totalRow?.total ?? 0), page: f.page, limit: f.limit };
}

export async function getAsetById(id: number): Promise<BbaRow | null> {
  const r = await queryOne<Record<string, unknown>>(sql`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE b.id = ${id} LIMIT 1`);
  return r ? mapRow(r) : null;
}

// ─── Referensi harga & bukti dukung (CONCEPT-bba-perencanaan §4) ────────────
export interface BbaBukti {
  id: number; aset_id: number; jenis: JenisBukti; nama: string;
  url: string | null; file_id: string | null; keterangan: string | null;
  created_at: string; oleh: string | null;
}
export interface BbaDetail { item: BbaRow; referensi: ReferensiIsian[]; bukti: BbaBukti[] }

async function listReferensi(asetId: number): Promise<ReferensiIsian[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT sumber, nama_penyedia, url, harga, DATE_FORMAT(tgl_cek, '%Y-%m-%d') AS tgl_cek, file_id
    FROM bba_referensi_harga WHERE aset_id = ${asetId} ORDER BY urutan ASC, id ASC
  `);
  return rows.map(r => ({
    sumber: r.sumber as ReferensiIsian['sumber'],
    nama_penyedia: r.nama_penyedia as string | null,
    url: r.url as string | null,
    harga: r.harga == null ? null : Number(r.harga),
    tgl_cek: r.tgl_cek as string | null,
    file_id: r.file_id as string | null,
  }));
}

export async function listBukti(asetId: number): Promise<BbaBukti[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT l.id, l.aset_id, l.jenis, l.nama, l.url, l.file_id, l.keterangan,
           DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i') AS created_at, u.username AS oleh
    FROM bba_lampiran l LEFT JOIN users u ON u.id = l.created_by
    WHERE l.aset_id = ${asetId} ORDER BY l.created_at DESC, l.id DESC
  `);
  return rows.map(r => ({
    id: Number(r.id), aset_id: Number(r.aset_id), jenis: r.jenis as JenisBukti, nama: String(r.nama ?? ''),
    url: r.url as string | null, file_id: r.file_id as string | null, keterangan: r.keterangan as string | null,
    created_at: (r.created_at as string | null) ?? '', oleh: r.oleh as string | null, // sudah teks: DATE_FORMAT di SQL
  }));
}

export async function getAsetDetail(id: number): Promise<BbaDetail | null> {
  const row = await getAsetById(id);
  if (!row) return null;
  const [[item], referensi, bukti] = await Promise.all([isiRingkasan([row]), listReferensi(id), listBukti(id)]);
  return { item, referensi, bukti };
}

/** L68: `file_id` yang ditempel harus unggahan BBA sendiri — berkas modul lain tidak bisa "dipinjam" lewat sini. */
export async function pastikanBerkasBba(q: Penanya, fileIds: (string | null | undefined)[]): Promise<void> {
  const unik = [...new Set(fileIds.filter((f): f is string => !!f))];
  if (unik.length === 0) return;
  const rows = await q`SELECT file_id FROM uploaded_files WHERE file_id IN (${unik}) AND context = 'buku_besar_aset'`;
  if (rows.length !== unik.length) throw new BbaBerkasTidakDikenalError();
}

const KOLOM_REFERENSI = ['aset_id', 'urutan', 'sumber', 'nama_penyedia', 'url', 'harga', 'tgl_cek', 'file_id'] as const;

const isianReferensi = (input: ReferensiInput[]): ReferensiIsian[] => rapikanReferensi(input.map(r => ({
  sumber: r.sumber, nama_penyedia: r.nama_penyedia ?? null, url: r.url ?? null,
  harga: r.harga ?? null, tgl_cek: r.tgl_cek ?? null, file_id: r.file_id ?? null,
})));

/** Hapus-lalu-tulis-ulang, di transaksi pemanggil (sesudah CAS item). Larik kosong = mengosongkan dengan sengaja. */
async function gantiReferensi(q: Penanya, conn: mysql.PoolConnection, asetId: number, input: ReferensiInput[]): Promise<void> {
  await tulisReferensi(q, conn, asetId, isianReferensi(input));
}

async function tulisReferensi(q: Penanya, conn: mysql.PoolConnection, asetId: number, daftar: ReferensiIsian[]): Promise<void> {
  await pastikanBerkasBba(q, daftar.map(r => r.file_id));
  await q`DELETE FROM bba_referensi_harga WHERE aset_id = ${asetId}`;
  await bulkInsert('bba_referensi_harga', KOLOM_REFERENSI, daftar.map((r, i) => [
    asetId, i + 1, r.sumber, r.nama_penyedia, r.url, r.harga, r.tgl_cek, r.file_id,
  ]), conn);
}

export async function tambahBukti(input: BuktiCreateInput, userId: number): Promise<{ canonical_id: string; bukti: BbaBukti[] }> {
  const canonical_id = await withTransaction(async ({ tx }) => {
    // Kunci baris item: batas MAKS_BUKTI dihitung di bawah kunci, dua tab yang menambah
    // berbarengan tidak sama-sama lolos di hitungan 29. Versi item TIDAK dinaikkan (§4.2).
    const aset = await tx`SELECT canonical_id FROM buku_besar_aset WHERE id = ${input.aset_id} FOR UPDATE` as Array<{ canonical_id: string }>;
    if (aset.length === 0) throw new BbaNotFoundError();
    const hitung = await tx`SELECT COUNT(*) AS n FROM bba_lampiran WHERE aset_id = ${input.aset_id}` as Array<{ n: number }>;
    if (Number(hitung[0]?.n ?? 0) >= MAKS_BUKTI) throw new BbaBuktiPenuhError();
    await pastikanBerkasBba(tx, [input.file_id]);
    await tx`
      INSERT INTO bba_lampiran (aset_id, jenis, nama, url, file_id, keterangan, created_by)
      VALUES (${input.aset_id}, ${input.jenis}, ${input.nama}, ${input.url || null}, ${input.file_id || null}, ${input.keterangan || null}, ${userId})
    `;
    return aset[0].canonical_id;
  });
  return { canonical_id, bukti: await listBukti(input.aset_id) };
}

/** Melepas catatan bukti saja — berkas di Drive TIDAK dihapus (bukti audit tidak boleh lenyap, §4.2). */
export async function hapusBukti(id: number): Promise<{ aset_id: number; canonical_id: string; nama: string; bukti: BbaBukti[] } | null> {
  const lama = await queryOne<Record<string, unknown>>(sql`
    SELECT l.aset_id, l.nama, b.canonical_id FROM bba_lampiran l JOIN buku_besar_aset b ON b.id = l.aset_id WHERE l.id = ${id} LIMIT 1
  `);
  if (!lama) return null;
  const res = await sql`DELETE FROM bba_lampiran WHERE id = ${id}` as unknown as Array<{ affectedRows?: number }>;
  if ((res[0]?.affectedRows ?? 0) === 0) return null;
  const aset_id = Number(lama.aset_id);
  return { aset_id, canonical_id: String(lama.canonical_id ?? ''), nama: String(lama.nama ?? ''), bukti: await listBukti(aset_id) };
}

// ─── Tautan barang (§5.1) ───────────────────────────────────────────────────

/** L68: barang yang ditunjuk harus ada. FOR SHARE — `gabungBarang` (FOR UPDATE) menunggu, bukan menyalip. */
async function pastikanBarang(q: Penanya, ids: number[]): Promise<void> {
  const unik = [...new Set(ids)];
  if (unik.length === 0) return;
  const rows = await q`SELECT id FROM bba_barang WHERE id IN (${unik}) FOR SHARE`;
  if (rows.length !== unik.length) throw new BbaBarangTidakDikenalError();
}

/** Pakai barang yang bernama sama (kolasi ci) atau buat baru — dalam transaksi pemanggil. */
async function barangDariNama(q: Penanya, namaMentah: string, userId: number, bawaan: { kategori_aset?: string | null; satuan?: string | null } = {}): Promise<number> {
  const nama = rapikanNamaBarang(namaMentah);
  const res = await q`
    INSERT INTO bba_barang (nama, kategori_aset, satuan, created_by)
    VALUES (${nama}, ${bawaan.kategori_aset || null}, ${bawaan.satuan || null}, ${userId})
    ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
  ` as unknown as Array<{ insertId: number }>;
  return Number(res[0]?.insertId ?? 0);
}

/** `undefined` = jangan sentuh, `null` = lepas, angka = barang terpilih/baru. Dipakai juga kartu aset (bba-aset.ts). */
export async function tentukanBarang(q: Penanya, input: { barang_id?: number | null; barang_baru?: string | null; kategori_aset?: string | null; satuan?: string | null }, userId: number): Promise<number | null | undefined> {
  if (input.barang_baru) return barangDariNama(q, input.barang_baru, userId, input);
  if (input.barang_id) { await pastikanBarang(q, [input.barang_id]); return input.barang_id; }
  return input.barang_id === null ? null : undefined;
}

export async function createAset(input: BbaCreateInput, userId: number): Promise<{ id: number; canonical_id: string }> {
  return withTransaction(async ({ tx, conn }) => {
    const barangId = (await tentukanBarang(tx, input, userId)) ?? null;
    const res = await tx`
      INSERT INTO buku_besar_aset
        (canonical_id, tahun_anggaran, kode_rekening, uraian, kategori_aset, barang_id, sumber_anggaran,
         vol, satuan, harga, nilai_rencana, status, penanggung_jawab, keterangan, created_by, updated_by)
      VALUES
        ('', ${input.tahun_anggaran}, ${input.kode_rekening ?? null}, ${input.uraian}, ${input.kategori_aset ?? null}, ${barangId}, ${input.sumber_anggaran},
         ${input.vol}, ${input.satuan ?? null}, ${input.harga}, ${input.vol * input.harga}, 'DIRENCANAKAN', ${input.penanggung_jawab ?? null}, ${input.keterangan ?? null}, ${userId}, ${userId})
    ` as unknown as Array<{ insertId: number }>;
    const id = Number(res[0]?.insertId ?? 0);
    // canonical_id atomik dari AUTO_INCREMENT id (tanpa race MAX+1):
    const canonical_id = `BBA-${String(id).padStart(6, '0')}`;
    await tx`UPDATE buku_besar_aset SET canonical_id = ${canonical_id} WHERE id = ${id}`;
    if (input.referensi?.length) await gantiReferensi(tx, conn, id, input.referensi);
    return { id, canonical_id };
  });
}

function assertCas(res: unknown): void {
  const affected = (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0;
  if (affected !== 1) throw new BbaVersionConflictError();
}

// Baris asal-usulan: sumber kebenaran = usulan_items → field inti terkunci (CONCEPT-import-usulan §7c).
function assertUsulanEditable(cur: BbaRow, input: BbaUpdateInput): void {
  if (cur.origin !== 'USULAN') return;
  if (input.uraian !== undefined && input.uraian !== cur.uraian)
    throw new BbaUsulanLockedError('Uraian baris asal usulan terkunci (sumber: Usulan Kebutuhan).');
  if (input.vol !== undefined && input.vol !== cur.vol)
    throw new BbaUsulanLockedError('Volume baris asal usulan terkunci (sumber: Usulan Kebutuhan).');
  if (input.harga !== undefined && input.harga !== cur.harga)
    throw new BbaUsulanLockedError('Harga baris asal usulan terkunci (sumber: Usulan Kebutuhan).');
}

/** Data item + referensi + tautan barang. Status tidak lewat sini — satu pintu `setRealisasi` (§5.2). */
export async function updateAset(input: BbaUpdateInput, userId: number): Promise<void> {
  const cur = await getAsetById(input.id);
  if (!cur) throw new BbaNotFoundError();
  assertUsulanEditable(cur, input);
  // §10 butir 7. Status & referensi tersimpan dibaca di luar kunci, tapi keduanya hanya berubah
  // lewat jalur yang menaikkan `version` — bacaan basi berakhir 409 di CAS di bawah.
  if (input.referensi !== undefined && referensiBeku(cur.status)
      && !referensiSama(isianReferensi(input.referensi), await listReferensi(input.id))) {
    throw new BbaReferensiBekuError(cur.status);
  }
  // A2: vol rencana tidak boleh turun di bawah realisasi tersimpan ("5/2 unit")
  const volBaru = input.vol ?? cur.vol;
  if (volBaru < cur.vol_realisasi) throw new BbaRealisasiRangeError(cur.vol_realisasi, volBaru);
  // A3: status tersimpan harus tetap konsisten dgn vol baru (REALISASI_PENUH ⇒ unit realisasi = vol)
  assertStatusConsistent(cur.status, volBaru, cur.vol_realisasi, cur.nilai_realisasi);
  // nilai_rencana USULAN = nominal putusan (bisa ≠ vol×harga) → jangan dihitung ulang.
  const nilaiRencana = cur.origin === 'USULAN' ? cur.nilai_rencana : volBaru * (input.harga ?? cur.harga);
  // A5: undefined = pertahankan, null = kosongkan — jangan dilipat ke COALESCE. version CAS (L48).
  let set = sql`nilai_rencana = ${nilaiRencana}, version = version + 1, updated_by = ${userId}`;
  if (input.kode_rekening !== undefined)    set = sql`${set}, kode_rekening = ${input.kode_rekening}`;
  if (input.uraian !== undefined)           set = sql`${set}, uraian = ${input.uraian}`;
  if (input.kategori_aset !== undefined)    set = sql`${set}, kategori_aset = ${input.kategori_aset}`;
  if (input.sumber_anggaran !== undefined)  set = sql`${set}, sumber_anggaran = ${input.sumber_anggaran}`;
  if (input.vol !== undefined)              set = sql`${set}, vol = ${input.vol}`;
  if (input.satuan !== undefined)           set = sql`${set}, satuan = ${input.satuan}`;
  if (input.harga !== undefined)            set = sql`${set}, harga = ${input.harga}`;
  if (input.penanggung_jawab !== undefined) set = sql`${set}, penanggung_jawab = ${input.penanggung_jawab}`;
  if (input.keterangan !== undefined)       set = sql`${set}, keterangan = ${input.keterangan}`;
  // Referensi & tautan barang ikut Simpan item yang SAMA (satu tombol, satu transaksi, satu CAS — §4.1/§5.1/L78).
  // CAS gagal → barang baru yang barusan dibuat ikut batal (rollback).
  await withTransaction(async ({ tx, conn }) => {
    // Versi diperiksa DULU di bawah kunci: modal basi (mis. barangnya baru digabung orang lain)
    // harus dapat 409 lalu memuat ulang, bukan "barang tidak ditemukan" — dan tanpa sempat membuat barang.
    const kini = await tx`SELECT version FROM buku_besar_aset WHERE id = ${input.id} FOR UPDATE` as Array<{ version: number }>;
    if (Number(kini[0]?.version) !== input.expected_version) throw new BbaVersionConflictError();
    const barangId = await tentukanBarang(tx, { ...input, kategori_aset: input.kategori_aset ?? cur.kategori_aset, satuan: input.satuan ?? cur.satuan }, userId);
    const setAkhir = barangId === undefined ? set : sql`${set}, barang_id = ${barangId}`;
    const res = await tx`
      UPDATE buku_besar_aset SET ${setAkhir}
      WHERE id = ${input.id} AND version = ${input.expected_version}
    `;
    assertCas(res);
    if (input.referensi !== undefined) await gantiReferensi(tx, conn, input.id, input.referensi);
  });
}

export async function setRealisasi(input: BbaRealisasiInput, userId: number, bolehKoreksiMundur = false): Promise<{ koreksiMundur: boolean }> {
  const cur = await getAsetById(input.id);
  if (!cur) throw new BbaNotFoundError();
  if (cur.origin === 'USULAN' && cur.usulan_keputusan === 'DITOLAK')
    throw new BbaUsulanLockedError('Baris usulan DITOLAK: realisasi terkunci (catatan sejarah).');
  if (input.vol_realisasi > cur.vol)
    throw new BbaRealisasiRangeError(input.vol_realisasi, cur.vol);
  if (!isValidStatusTransition(cur.status, input.status, bolehKoreksiMundur)) throw new BbaTransitionError(cur.status, input.status);
  // §5.2: barang belum diterima (Direncanakan/Dalam Proses) ⇒ realisasi 0
  if (statusSebelumTerima(input.status) && (input.vol_realisasi !== 0 || input.nilai_realisasi !== 0))
    throw new BbaStatusMismatchError(`Status ${LABEL_STATUS[input.status]} mengharuskan unit & nilai realisasi 0 — barangnya belum diterima.`);
  // A3: REALISASI_PENUH ⇒ vol_realisasi = vol; TIDAK_TEREALISASI ⇒ realisasi 0
  assertStatusConsistent(input.status, cur.vol, input.vol_realisasi, input.nilai_realisasi);
  // tgl_proses = tanggal pesan/kontrak: diisi saat DIPROSES, dikosongkan bila pesanan batal (kembali
  // Direncanakan), dibiarkan apa adanya saat barang diterima — jejak "dipesan kapan" tidak hilang.
  const tglProses = input.status === 'DIPROSES' ? (input.tgl_proses ?? cur.tgl_proses ?? null)
    : input.status === 'DIRENCANAKAN' ? null : cur.tgl_proses;
  const tglRealisasi = statusSebelumTerima(input.status) ? null : (input.tgl_realisasi ?? null);
  await withTransaction(async ({ tx, conn }) => {
    const res = await tx`
      UPDATE buku_besar_aset SET
        nilai_realisasi = ${input.nilai_realisasi},
        vol_realisasi   = ${input.vol_realisasi},
        tgl_realisasi   = ${tglRealisasi},
        tgl_proses      = ${tglProses},
        status          = ${input.status},
        version         = version + 1,
        updated_by      = ${userId}
      WHERE id = ${input.id} AND version = ${input.expected_version}
    `;
    assertCas(res);
    // Tautan usulan selama ini hanya dibaca lewat JOIN (isi awal slot referensi). Begitu
    // referensinya beku, tautan itu ditulis jadi referensi tersimpan — kalau tidak, ia ikut
    // berubah/hilang bersama usulannya, padahal itulah yang dibandingkan saat membeli (§15).
    if (referensiBeku(input.status) && !referensiBeku(cur.status) && cur.tautan_usulan.length > 0) {
      const ada = await tx`SELECT COUNT(*) AS n FROM bba_referensi_harga WHERE aset_id = ${input.id}` as Array<{ n: number }>;
      if (Number(ada[0]?.n ?? 0) === 0) await tulisReferensi(tx, conn, input.id, slotDariUsulan(cur.tautan_usulan));
    }
  });
  // A4: jejak koreksi mundur dari terminal (caller tulis ke audit log)
  return { koreksiMundur: cur.status === 'REALISASI_PENUH' && input.status !== 'REALISASI_PENUH' };
}

/** §10 butir 7: hanya rencana yang belum diproses & tanpa bukti. Ditolak = BbaRiwayatTerkunciError. */
export async function deleteAset(id: number): Promise<boolean> {
  return withTransaction(async ({ tx }) => {
    // Kunci baris yang sama dengan `tambahBukti` (FOR UPDATE) dan CAS `setRealisasi` — bukti
    // atau status proses yang masuk di sela pemeriksaan & DELETE menunggu, tidak menyalip.
    const r = await tx`SELECT status FROM buku_besar_aset WHERE id = ${id} FOR UPDATE` as Array<{ status: BbaStatus }>;
    if (r.length === 0) return false;
    const bukti = await tx`SELECT COUNT(*) AS n FROM bba_lampiran WHERE aset_id = ${id}` as Array<{ n: number }>;
    const alasan = alasanTakBisaHapus(r[0].status, Number(bukti[0]?.n ?? 0));
    if (alasan) throw new BbaRiwayatTerkunciError(alasan);
    const res = await tx`DELETE FROM buku_besar_aset WHERE id = ${id}` as unknown as Array<{ affectedRows?: number }>;
    return (res[0]?.affectedRows ?? 0) > 0;
  });
}

// ─── Import Belanja Modal dari Usulan Kebutuhan ─────────────────────────────
// Konsep: docs/session/buku-besar-aset/CONCEPT-import-usulan.md.
// Rantai nilai = COALESCE(kasubag → admin → asli): telaah SELALU mengisi admin_qty/harga
// (DITOLAK_ADMIN = nilai asli), kasubag hanya mengisi saat DIREVISI_KASUBAG —
// jadi rantai otomatis berhenti di titik putusan terakhir.
export interface BbaImportCandidate {
  usulan_item_id: number;
  usulan_no: string;
  sub_bidang: string;
  pengusul: string;
  nama_barang: string;
  uraian: string;
  vol: number;
  satuan: string;
  harga: number;
  nilai_rencana: number;
  keputusan: 'DISETUJUI' | 'DITOLAK';
  ditolak_oleh: 'ADMIN' | 'KASUBAG' | 'KABAG' | null;
}

function candidateQuery(tahun: number) {
  return sql`
    SELECT ui.id AS usulan_item_id, ui.no_usulan, ui.sub_bidang, ui.pengusul,
           ui.nama_barang, ui.spesifikasi, ui.satuan, ui.status,
           ui.kasubag_putusan, ui.kabag_putusan, ui.kabag_by,
           COALESCE(ui.kasubag_qty,   ui.admin_qty,   ui.qty)       AS vol_final,
           COALESCE(ui.kasubag_harga, ui.admin_harga, ui.harga_est) AS harga_final,
           ui.nominal_disetujui
    FROM usulan_items ui
    JOIN usulan_headers uh ON uh.id = ui.usulan_id
    WHERE ui.jenis_belanja LIKE 'Belanja Modal%'
      AND ui.status IN ('DISETUJUI','DITOLAK','DITOLAK_ADMIN')
      AND uh.tahun_anggaran = ${String(tahun)}
      AND NOT EXISTS (SELECT 1 FROM buku_besar_aset b WHERE b.usulan_item_id = ui.id)
    ORDER BY ui.no_usulan ASC, ui.no_item ASC
  `;
}

function mapCandidate(r: Record<string, unknown>): BbaImportCandidate {
  const status    = String(r.status ?? '');
  const keputusan = status === 'DISETUJUI' ? 'DISETUJUI' as const : 'DITOLAK' as const;
  const ditolak_oleh = status === 'DITOLAK_ADMIN' ? 'ADMIN' as const
    : status !== 'DITOLAK' ? null
    : r.kabag_putusan === 'DITOLAK' ? 'KABAG' as const
    : 'KASUBAG' as const;
  const vol   = Number(r.vol_final ?? 0);
  const harga = Number(r.harga_final ?? 0);
  // Ditolak: nominal_disetujui = 0 → pakai nilai DIUSULKAN di titik tolak (vol×harga), bukan 0.
  const nilai_rencana = keputusan === 'DISETUJUI'
    ? Number(r.nominal_disetujui ?? 0) || vol * harga
    : vol * harga;
  const spesifikasi = r.spesifikasi ? String(r.spesifikasi).trim() : '';
  return {
    usulan_item_id: Number(r.usulan_item_id),
    usulan_no: String(r.no_usulan ?? ''),
    sub_bidang: String(r.sub_bidang ?? ''),
    pengusul: String(r.pengusul ?? ''),
    nama_barang: String(r.nama_barang ?? ''),
    uraian: spesifikasi ? `${String(r.nama_barang ?? '')} — ${spesifikasi}` : String(r.nama_barang ?? ''),
    vol, satuan: String(r.satuan ?? 'unit'), harga, nilai_rencana, keputusan, ditolak_oleh,
  };
}

export async function listImportCandidates(tahun: number): Promise<BbaImportCandidate[]> {
  const rows = await queryMany<Record<string, unknown>>(candidateQuery(tahun));
  return rows.map(mapCandidate);
}

export async function commitImportUsulan(tahun: number, userId: number): Promise<{ inserted: number; tertaut: number }> {
  return withTransaction(async ({ tx, conn }) => {
    // Re-query di dalam transaksi (anti TOCTOU); UNIQUE uq_bba_usulan_item = jaring terakhir.
    const rows = await tx`${candidateQuery(tahun)}` as unknown as Record<string, unknown>[];
    const cands = (rows as Record<string, unknown>[]).map(mapCandidate);
    if (cands.length === 0) return { inserted: 0, tertaut: 0 };
    // §5.1: nama_barang yang (sesudah dirapikan) sama dengan nama barang di Master tertaut
    // otomatis; sisanya NULL — ditautkan lewat spanduk "belum ditautkan". Tidak membuat barang baru.
    const daftarBarang = (await tx`SELECT id, nama FROM bba_barang FOR SHARE` as Array<{ id: number; nama: string }>).map(b => ({ id: Number(b.id), nama: String(b.nama) }));
    const barangPer = cands.map(c => barangBernamaSama(c.nama_barang, daftarBarang)?.id ?? null);
    const { affectedRows } = await bulkInsert('buku_besar_aset', [
      'canonical_id', 'tahun_anggaran', 'origin', 'usulan_item_id', 'usulan_no',
      'usulan_keputusan', 'ditolak_oleh', 'sub_bidang', 'uraian', 'barang_id', 'sumber_anggaran',
      'vol', 'satuan', 'harga', 'nilai_rencana', 'status', 'penanggung_jawab',
      'created_by', 'updated_by',
    ], cands.map((c, i) => [
      // uq_im_canonical_tahun: '' ganda di tahun sama = duplicate → placeholder unik per baris.
      `TMP-${c.usulan_item_id}`, tahun, 'USULAN', c.usulan_item_id, c.usulan_no,
      c.keputusan, c.ditolak_oleh, c.sub_bidang, c.uraian, barangPer[i], 'BLUD',
      c.vol, c.satuan, c.harga, c.nilai_rencana,
      c.keputusan === 'DISETUJUI' ? 'DIRENCANAKAN' : 'TIDAK_TEREALISASI', c.sub_bidang,
      userId, userId,
    ]), conn);
    // canonical_id atomik dari AUTO_INCREMENT id, pola createAset (anti-race MAX+1).
    await tx`UPDATE buku_besar_aset SET canonical_id = CONCAT('BBA-', LPAD(id, 6, '0')) WHERE origin = 'USULAN' AND canonical_id LIKE 'TMP-%'`;
    return { inserted: affectedRows, tertaut: barangPer.filter(b => b !== null).length };
  });
}

// ─── Master Kategori Aset ───────────────────────────────────────────────────
export interface KategoriAset { id: number; nama: string; urutan: number }

export async function listKategori(): Promise<KategoriAset[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`SELECT id, nama, urutan FROM bba_kategori_aset ORDER BY urutan ASC, nama ASC LIMIT 500`);
  return rows.map(r => ({ id: Number(r.id), nama: String(r.nama ?? ''), urutan: Number(r.urutan ?? 0) }));
}

export async function createKategori(nama: string): Promise<{ id: number }> {
  const mx = await queryOne<{ m: number }>(sql`SELECT COALESCE(MAX(urutan), 0) AS m FROM bba_kategori_aset`);
  const urutan = Number(mx?.m ?? 0) + 1;
  const res = await sql`INSERT INTO bba_kategori_aset (nama, urutan) VALUES (${nama}, ${urutan})` as unknown as Array<{ insertId: number }>;
  return { id: Number(res[0]?.insertId ?? 0) };
}

export async function deleteKategori(id: number): Promise<boolean> {
  const res = await sql`DELETE FROM bba_kategori_aset WHERE id = ${id}` as unknown as Array<{ affectedRows?: number }>;
  return (res[0]?.affectedRows ?? 0) > 0;
}

// ─── Master Barang (CONCEPT-bba-perencanaan §5) ─────────────────────────────
export interface BbaBarang { id: number; nama: string; kategori_aset: string | null; satuan: string | null; jumlah_item: number; jumlah_pendataan: number; jumlah_aset: number }

const kodeGalat = (e: unknown) => (e as { code?: string }).code;

export async function listBarang(): Promise<BbaBarang[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT g.id, g.nama, g.kategori_aset, g.satuan,
           (SELECT COUNT(*) FROM buku_besar_aset b WHERE b.barang_id = g.id) AS jumlah_item,
           (SELECT COUNT(*) FROM bba_eksisting e WHERE e.barang_id = g.id) AS jumlah_pendataan,
           (SELECT COUNT(*) FROM bba_aset a WHERE a.barang_id = g.id) AS jumlah_aset
    FROM bba_barang g ORDER BY g.nama ASC LIMIT 2000
  `);
  return rows.map(r => ({
    id: Number(r.id), nama: String(r.nama ?? ''), kategori_aset: r.kategori_aset as string | null,
    satuan: r.satuan as string | null, jumlah_item: Number(r.jumlah_item ?? 0), jumlah_pendataan: Number(r.jumlah_pendataan ?? 0),
    jumlah_aset: Number(r.jumlah_aset ?? 0),
  }));
}

export async function createBarang(input: BarangCreateInput, userId: number): Promise<{ id: number; nama: string }> {
  const nama = rapikanNamaBarang(input.nama);
  try {
    const res = await sql`
      INSERT INTO bba_barang (nama, kategori_aset, satuan, created_by)
      VALUES (${nama}, ${input.kategori_aset || null}, ${input.satuan || null}, ${userId})
    ` as unknown as Array<{ insertId: number }>;
    return { id: Number(res[0]?.insertId ?? 0), nama };
  } catch (e) {
    if (kodeGalat(e) === 'ER_DUP_ENTRY') throw new BbaBarangKembarError(nama);
    throw e;
  }
}

export async function updateBarang(input: BarangUpdateInput): Promise<boolean> {
  let set = sql`id = id`;
  if (input.nama !== undefined)          set = sql`${set}, nama = ${rapikanNamaBarang(input.nama)}`;
  if (input.kategori_aset !== undefined) set = sql`${set}, kategori_aset = ${input.kategori_aset || null}`;
  if (input.satuan !== undefined)        set = sql`${set}, satuan = ${input.satuan || null}`;
  try {
    const res = await sql`UPDATE bba_barang SET ${set} WHERE id = ${input.id}` as unknown as Array<{ affectedRows?: number }>;
    return (res[0]?.affectedRows ?? 0) > 0;
  } catch (e) {
    if (kodeGalat(e) === 'ER_DUP_ENTRY') throw new BbaBarangKembarError(rapikanNamaBarang(input.nama));
    throw e;
  }
}

/** Barang yang masih dipakai item/pendataan ditolak dengan jumlahnya (FK RESTRICT = jaring terakhir). */
export async function hapusBarang(id: number): Promise<{ nama: string } | null> {
  return withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT nama FROM bba_barang WHERE id = ${id} FOR UPDATE` as Array<{ nama: string }>;
    if (ada.length === 0) return null;
    const dipakai = await tx`
      SELECT (SELECT COUNT(*) FROM buku_besar_aset WHERE barang_id = ${id}) AS item,
             (SELECT COUNT(*) FROM bba_eksisting WHERE barang_id = ${id}) AS pendataan,
             (SELECT COUNT(*) FROM bba_aset WHERE barang_id = ${id}) AS aset
    ` as Array<{ item: number; pendataan: number; aset: number }>;
    const item = Number(dipakai[0]?.item ?? 0), pendataan = Number(dipakai[0]?.pendataan ?? 0), aset = Number(dipakai[0]?.aset ?? 0);
    if (item > 0 || pendataan > 0 || aset > 0) throw new BbaBarangDipakaiError(item, pendataan, aset);
    await tx`DELETE FROM bba_barang WHERE id = ${id}`;
    return { nama: String(ada[0].nama) };
  });
}

/**
 * Gabungkan A ke B: semua item A pindah ke B lalu A dihapus, satu transaksi. Versi item ikut
 * naik — modal yang sedang membuka item itu memegang barang A, simpanannya harus 409, bukan
 * menulis balik barang yang sudah tidak ada.
 */
export async function gabungBarang(dari: number, ke: number, userId: number): Promise<{ dipindah: number; pendataan: number; nama_dari: string; nama_ke: string }> {
  return withTransaction(async ({ tx }) => {
    const rows = await tx`SELECT id, nama FROM bba_barang WHERE id IN (${[dari, ke]}) FOR UPDATE` as Array<{ id: number; nama: string }>;
    const nama = new Map(rows.map(r => [Number(r.id), String(r.nama)]));
    if (!nama.has(dari) || !nama.has(ke)) throw new BbaBarangTidakDikenalError();
    // §6.3: pendataan ikut pindah apa adanya. Lokasi + tanggal yang sama di kedua barang tidak bisa
    // berdampingan (uq_be_cek) — dan menjumlahkannya diam-diam bisa menghitung barang fisik yang sama dua kali.
    const bentrok = await tx`
      SELECT l.nama, DATE_FORMAT(a.tgl_cek, '%Y-%m-%d') AS tgl FROM bba_eksisting a
      JOIN bba_eksisting b ON b.barang_id = ${ke} AND b.lokasi_id = a.lokasi_id AND b.tgl_cek = a.tgl_cek
      JOIN bba_lokasi l ON l.id = a.lokasi_id
      WHERE a.barang_id = ${dari} ORDER BY l.nama, a.tgl_cek
    ` as Array<{ nama: string; tgl: string }>;
    if (bentrok.length > 0) throw new BbaGabungBentrokError(bentrok.map(b => `${b.nama} (${fmtTanggal(b.tgl)})`));
    const res = await tx`UPDATE buku_besar_aset SET barang_id = ${ke}, version = version + 1, updated_by = ${userId} WHERE barang_id = ${dari}` as unknown as Array<{ affectedRows?: number }>;
    // Buku Aset ikut pindah (L69 — barang dirujuk dari tiga tabel), dengan jejak di riwayat tiap aset.
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, catatan, oleh)
      SELECT id, 'UBAH', JSON_OBJECT('barang', ${nama.get(dari)!}), JSON_OBJECT('barang', ${nama.get(ke)!}), 'Gabungkan barang', ${userId}
      FROM bba_aset WHERE barang_id = ${dari}
    `;
    await tx`UPDATE bba_aset SET barang_id = ${ke}, version = version + 1, updated_by = ${userId} WHERE barang_id = ${dari}`;
    // Asal yang sudah tercatat (gabungan sebelumnya) dipertahankan: menandai berlebih lebih aman daripada lolos.
    const resE = await tx`
      UPDATE bba_eksisting SET barang_id = ${ke}, digabung_dari = COALESCE(digabung_dari, ${nama.get(dari)!}), digabung_pada = NOW()
      WHERE barang_id = ${dari}
    ` as unknown as Array<{ affectedRows?: number }>;
    await tx`DELETE FROM bba_barang WHERE id = ${dari}`;
    return { dipindah: Number(res[0]?.affectedRows ?? 0), pendataan: Number(resE[0]?.affectedRows ?? 0), nama_dari: nama.get(dari)!, nama_ke: nama.get(ke)! };
  });
}

/**
 * Tautkan sekaligus (spanduk "belum ditautkan"). Hanya item yang MASIH tanpa barang yang diisi —
 * yang sudah ditautkan orang lain di sela-selanya dilewati & dihitung, tidak ditimpa.
 */
export async function tautkanBarang(input: BarangTautkanInput, userId: number): Promise<{ ditautkan: number; dilewati: number; barang_baru: number }> {
  return withTransaction(async ({ tx }) => {
    await pastikanBarang(tx, input.pasangan.flatMap(p => p.barang_id ? [p.barang_id] : []));
    const asetIds = input.pasangan.map(p => p.aset_id);
    const info = await tx`SELECT id, kategori_aset, satuan FROM buku_besar_aset WHERE id IN (${asetIds})` as Array<{ id: number; kategori_aset: string | null; satuan: string | null }>;
    const infoPer = new Map(info.map(r => [Number(r.id), r]));
    const baru = new Map<string, number>();
    const perBarang = new Map<number, number[]>();
    for (const p of input.pasangan) {
      let id = p.barang_id ?? 0;
      if (!id) {
        const k = kunciNamaBarang(p.barang_baru);
        id = baru.get(k) ?? await barangDariNama(tx, p.barang_baru!, userId, infoPer.get(p.aset_id) ?? {});
        baru.set(k, id);
      }
      perBarang.set(id, [...(perBarang.get(id) ?? []), p.aset_id]);
    }
    let ditautkan = 0;
    for (const [barangId, ids] of perBarang) {
      const res = await tx`
        UPDATE buku_besar_aset SET barang_id = ${barangId}, version = version + 1, updated_by = ${userId}
        WHERE id IN (${ids}) AND barang_id IS NULL
      ` as unknown as Array<{ affectedRows?: number }>;
      ditautkan += Number(res[0]?.affectedRows ?? 0);
    }
    return { ditautkan, dilewati: input.pasangan.length - ditautkan, barang_baru: baru.size };
  });
}

function bahanDari(r: Record<string, unknown>): BahanBarang {
  return {
    barang_id: r.barang_id == null ? null : Number(r.barang_id),
    tahun_anggaran: Number(r.tahun_anggaran), status: r.status as BbaStatus,
    usulan_keputusan: r.usulan_keputusan as BahanBarang['usulan_keputusan'],
    vol: Number(r.vol ?? 0), vol_realisasi: Number(r.vol_realisasi ?? 0),
    nilai_rencana: Number(r.nilai_rencana ?? 0), nilai_realisasi: Number(r.nilai_realisasi ?? 0),
    tgl_realisasi: (r.tgl_realisasi as string | null) ?? null, // sudah teks: DATE_FORMAT di SQL
  };
}
const KOLOM_BAHAN = sql`barang_id, tahun_anggaran, status, usulan_keputusan, vol, vol_realisasi, nilai_rencana, nilai_realisasi, DATE_FORMAT(tgl_realisasi, '%Y-%m-%d') AS tgl_realisasi`;

// ─── Barang yang dimiliki: dari Buku Aset per register (Tahap C, §8) ────────
// Menggantikan pendataan eksisting Tahap 3 (bba_eksisting, dipensiunkan): jumlah & kondisi kini
// DIHITUNG dari register yang ditautkan ke barang, bukan diketik ulang per lokasi.

export async function bacaPengaturanBba(): Promise<PengaturanBba> {
  const r = await queryOne<{ value: string }>(sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_PENGATURAN} LIMIT 1`);
  return bacaPengaturan(r?.value);
}

/** Batas "masih terkini" dari jarak opname di pengaturan (§13 keputusan 2). */
export async function batasCekSekarang(): Promise<string> {
  return batasCek(tanggalHariIniWIB(), (await bacaPengaturanBba()).opname_bulan);
}

type BahanDimiliki = {
  barang_id: number | null; lokasi_id: number | null; lokasi_nama: string | null; golongan: Golongan;
  kondisi: Kondisi | null; kondisi_sumber: 'IMPOR' | 'CEK' | null; kondisi_tgl: string | null;
};

async function ambilDimiliki(barangId?: number): Promise<BahanDimiliki[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT a.barang_id, a.lokasi_id, l.nama AS lokasi_nama, a.golongan, a.kondisi, a.kondisi_sumber, DATE_FORMAT(a.kondisi_tgl, '%Y-%m-%d') AS kondisi_tgl
    FROM bba_aset a LEFT JOIN bba_lokasi l ON l.id = a.lokasi_id
    WHERE a.status = 'AKTIF' AND ${barangId ? sql`a.barang_id = ${barangId}` : sql`a.barang_id IS NOT NULL`}
  `);
  return rows.map(r => ({
    barang_id: r.barang_id == null ? null : Number(r.barang_id), lokasi_id: r.lokasi_id == null ? null : Number(r.lokasi_id),
    lokasi_nama: (r.lokasi_nama as string | null) ?? null, golongan: r.golongan as Golongan, kondisi: (r.kondisi as Kondisi | null) ?? null,
    kondisi_sumber: (r.kondisi_sumber as 'IMPOR' | 'CEK' | null) ?? null, kondisi_tgl: (r.kondisi_tgl as string | null) ?? null, // sudah teks: DATE_FORMAT di SQL
  }));
}

export type BarisPerBarang = RingkasBarang & {
  id: number; nama: string; kategori_aset: string | null; satuan: string | null;
  /** null = belum ada register Buku Aset yang ditautkan ke barang ini. */
  dimiliki: Dimiliki | null;
};
export interface BelumDitautkan { id: number; canonical_id: string; uraian: string; kategori_aset: string | null; satuan: string | null; nilai_rencana: number }
export interface PerBarangTahun {
  tahun: number;
  rows: BarisPerBarang[];
  belum: { item: number; direncanakan: number; rencana: number; daftar: BelumDitautkan[] };
}

/** Tampilan Per Barang tahun T (§5.3, §8). Kueri hanya mengambil bahan; hitungannya `ringkasPerBarang` + `ringkasDimiliki`. */
export async function perBarangTahun(tahun: number): Promise<PerBarangTahun> {
  const [bahanRows, barang, belumRows, dimiliki, batas] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_BAHAN} FROM buku_besar_aset WHERE tahun_anggaran <= ${tahun} AND (barang_id IS NOT NULL OR tahun_anggaran = ${tahun})`),
    listBarang(),
    queryMany<Record<string, unknown>>(sql`
      SELECT id, canonical_id, uraian, kategori_aset, satuan, nilai_rencana FROM buku_besar_aset
      WHERE tahun_anggaran = ${tahun} AND barang_id IS NULL AND (usulan_keputusan IS NULL OR usulan_keputusan <> 'DITOLAK')
      ORDER BY canonical_id ASC LIMIT 500
    `),
    ambilDimiliki(),
    batasCekSekarang(),
  ]);
  const { perBarang, belum } = ringkasPerBarang(bahanRows.map(bahanDari), tahun);
  const milikPer = ringkasDimilikiPerBarang(dimiliki, batas);
  // Barang yang hanya punya register di Buku Aset (dibeli sebelum PRIMA) ikut tampil.
  const rows = barang.filter(b => perBarang.has(b.id) || milikPer.has(b.id))
    .map(b => ({ id: b.id, nama: b.nama, kategori_aset: b.kategori_aset, satuan: b.satuan, ...(perBarang.get(b.id) ?? ringkasKosong()), dimiliki: milikPer.get(b.id) ?? null }))
    .sort((a, b) => b.rencana_tahun - a.rencana_tahun || a.nama.localeCompare(b.nama, 'id'));
  const daftar = belumRows.map(r => ({
    id: Number(r.id), canonical_id: String(r.canonical_id ?? ''), uraian: String(r.uraian ?? ''),
    kategori_aset: r.kategori_aset as string | null, satuan: r.satuan as string | null, nilai_rencana: Number(r.nilai_rencana ?? 0),
  }));
  return { tahun, rows, belum: { ...belum, daftar } };
}

export interface DimilikiPerRuang { lokasi_id: number | null; lokasi: string | null; ringkas: Dimiliki }
export interface DetailBarang {
  barang: Omit<BbaBarang, 'jumlah_item' | 'jumlah_pendataan' | 'jumlah_aset'>; ringkas: RingkasBarang; riwayat: BarisRiwayat[];
  /** Register Buku Aset yang ditautkan ke barang ini; per ruangan (tanpa ruangan = lokasi_id null). */
  dimiliki: Dimiliki; dimiliki_per_ruang: DimilikiPerRuang[];
}

/** Kartu barang: angka tahun T + riwayat per tahun + rata-rata referensi per tahun + yang dimiliki. */
export async function detailBarang(id: number, tahun: number): Promise<DetailBarang | null> {
  const barang = await queryOne<Record<string, unknown>>(sql`SELECT id, nama, kategori_aset, satuan FROM bba_barang WHERE id = ${id} LIMIT 1`);
  if (!barang) return null;
  const [bahanRows, refRows, dimiliki, batas] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_BAHAN} FROM buku_besar_aset WHERE barang_id = ${id}`),
    queryMany<Record<string, unknown>>(sql`
      SELECT r.harga, r.url, r.file_id, b.tahun_anggaran FROM bba_referensi_harga r
      JOIN buku_besar_aset b ON b.id = r.aset_id
      WHERE b.barang_id = ${id} AND (b.usulan_keputusan IS NULL OR b.usulan_keputusan <> 'DITOLAK')
    `),
    ambilDimiliki(id),
    batasCekSekarang(),
  ]);
  const bahan = bahanRows.map(bahanDari);
  const refs: BahanRefBarang[] = refRows.map(r => ({
    harga: r.harga == null ? null : Number(r.harga), url: r.url as string | null, file_id: r.file_id as string | null, tahun_anggaran: Number(r.tahun_anggaran),
  }));
  const ringkas = ringkasPerBarang(bahan, tahun).perBarang.get(id) ?? ringkasKosong();
  const perRuang = new Map<number | null, BahanDimiliki[]>();
  for (const a of dimiliki) perRuang.set(a.lokasi_id, [...(perRuang.get(a.lokasi_id) ?? []), a]);
  return {
    barang: { id: Number(barang.id), nama: String(barang.nama ?? ''), kategori_aset: barang.kategori_aset as string | null, satuan: barang.satuan as string | null },
    ringkas, riwayat: riwayatPerTahun(bahan, refs),
    dimiliki: ringkasDimiliki(dimiliki, batas),
    dimiliki_per_ruang: [...perRuang].map(([lokasi_id, xs]) => ({ lokasi_id, lokasi: xs[0].lokasi_nama, ringkas: ringkasDimiliki(xs, batas) }))
      .sort((a, b) => (a.lokasi === null ? 1 : b.lokasi === null ? -1 : a.lokasi.localeCompare(b.lokasi, 'id'))),
  };
}

// ─── Master Ruangan (§15) ───────────────────────────────────────────────────
export interface BbaLokasi {
  id: number; nama: string; urutan: number;
  gedung_aset_id: number | null; gedung_nama: string | null; luas: number | null; pj_nama: string | null; pj_nip: string | null;
  jumlah_aset: number;
  /** Pendataan eksisting lama (Tahap 3, dipensiunkan) — hanya untuk menjelaskan kenapa ruangan tak bisa dihapus. */
  jumlah_pendataan: number;
}

export async function listLokasi(): Promise<BbaLokasi[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT l.id, l.nama, l.urutan, l.gedung_aset_id, COALESCE(g.nama, g.nama_resmi) AS gedung_nama, l.luas, l.pj_nama, l.pj_nip,
           (SELECT COUNT(*) FROM bba_aset a WHERE a.lokasi_id = l.id AND a.status = 'AKTIF') AS jumlah_aset,
           (SELECT COUNT(*) FROM bba_eksisting e WHERE e.lokasi_id = l.id) AS jumlah_pendataan
    FROM bba_lokasi l LEFT JOIN bba_aset g ON g.id = l.gedung_aset_id
    ORDER BY l.urutan ASC, l.nama ASC LIMIT 1000
  `);
  return rows.map(r => ({
    id: Number(r.id), nama: String(r.nama ?? ''), urutan: Number(r.urutan ?? 0),
    gedung_aset_id: r.gedung_aset_id == null ? null : Number(r.gedung_aset_id), gedung_nama: (r.gedung_nama as string | null) ?? null,
    luas: r.luas == null ? null : Number(r.luas), pj_nama: (r.pj_nama as string | null) ?? null, pj_nip: (r.pj_nip as string | null) ?? null,
    jumlah_aset: Number(r.jumlah_aset ?? 0), jumlah_pendataan: Number(r.jumlah_pendataan ?? 0),
  }));
}

export async function createLokasi(namaMentah: string): Promise<{ id: number; nama: string }> {
  const nama = rapikanNamaBarang(namaMentah);
  try {
    return await withTransaction(async ({ tx }) => {
      const mx = await tx`SELECT COALESCE(MAX(urutan), 0) AS m FROM bba_lokasi FOR UPDATE` as Array<{ m: number }>;
      const res = await tx`INSERT INTO bba_lokasi (nama, urutan) VALUES (${nama}, ${Number(mx[0]?.m ?? 0) + 1})` as unknown as Array<{ insertId: number }>;
      return { id: Number(res[0]?.insertId ?? 0), nama };
    });
  } catch (e) {
    if (kodeGalat(e) === 'ER_DUP_ENTRY') throw new BbaLokasiKembarError(nama);
    throw e;
  }
}

/** Kolom yang tidak dikirim tidak disentuh. Gedung = soft-FK: diperiksa KIB C aktif di transaksi yang sama (L68). */
export async function updateLokasi(input: LokasiUpdateInput): Promise<boolean> {
  const nama = input.nama === undefined ? undefined : rapikanNamaBarang(input.nama);
  try {
    return await withTransaction(async ({ tx }) => {
      if (input.gedung_aset_id) {
        const g = await tx`SELECT golongan, status FROM bba_aset WHERE id = ${input.gedung_aset_id} FOR SHARE` as Array<{ golongan: string; status: string }>;
        if (g.length === 0 || g[0].golongan !== 'C' || g[0].status !== 'AKTIF') throw new BbaGedungTidakDikenalError();
      }
      let set = sql`id = id`;
      if (nama !== undefined) set = sql`${set}, nama = ${nama}`;
      if (input.gedung_aset_id !== undefined) set = sql`${set}, gedung_aset_id = ${input.gedung_aset_id}`;
      if (input.luas !== undefined) set = sql`${set}, luas = ${input.luas}`;
      if (input.pj_nama !== undefined) set = sql`${set}, pj_nama = ${input.pj_nama || null}`;
      if (input.pj_nip !== undefined) set = sql`${set}, pj_nip = ${input.pj_nip || null}`;
      const res = await tx`UPDATE bba_lokasi SET ${set} WHERE id = ${input.id}` as unknown as Array<{ affectedRows?: number }>;
      return (res[0]?.affectedRows ?? 0) > 0;
    });
  } catch (e) {
    if (kodeGalat(e) === 'ER_DUP_ENTRY') throw new BbaLokasiKembarError(nama ?? '');
    throw e;
  }
}

export async function hapusLokasi(id: number): Promise<{ nama: string } | null> {
  return withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT nama FROM bba_lokasi WHERE id = ${id} FOR UPDATE` as Array<{ nama: string }>;
    if (ada.length === 0) return null;
    const n = await tx`
      SELECT (SELECT COUNT(*) FROM bba_eksisting WHERE lokasi_id = ${id}) AS n, (SELECT COUNT(*) FROM bba_aset WHERE lokasi_id = ${id}) AS aset
    ` as Array<{ n: number; aset: number }>;
    if (Number(n[0]?.n ?? 0) > 0 || Number(n[0]?.aset ?? 0) > 0) throw new BbaLokasiDipakaiError(Number(n[0].n), Number(n[0].aset));
    await tx`DELETE FROM bba_lokasi WHERE id = ${id}`;
    return { nama: String(ada[0].nama) };
  });
}
