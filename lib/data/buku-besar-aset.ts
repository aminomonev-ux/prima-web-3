// ═══ PRIMA — Buku Besar Aset (BBA) — Data Layer ════════════════════
// CRUD tabel `buku_besar_aset`. Optimistic lock per-row via kolom `version` (L48 CAS).
// canonical_id stabil lintas-tahun, di-derive dari AUTO_INCREMENT id (anti-race, bukan MAX+1).
// Kolom turunan (sisa/pct) TIDAK disimpan (Checkpoint D) — dihitung di mapper.
import type mysql from 'mysql2/promise';
import { sql, queryMany, queryOne, withTransaction, bulkInsert, escapeLike, sqlInt, type Penanya } from '@/lib/data/db';
import { toDateStr } from '@/lib/shared/waktu-wib';
import { isSafeFileUrl } from '@/lib/shared/url';
import {
  kelengkapanRef, kelengkapanBukti, referensiSah, rapikanReferensi, tautanAman, MAKS_BUKTI,
  type KelengkapanRef, type KelengkapanBukti, type ReferensiIsian, type JenisBukti,
} from '@/lib/bba/referensi';
import { isValidStatusTransition, type BbaStatus, type BbaCreateInput, type BbaUpdateInput, type BbaRealisasiInput, type BbaQuery, type ReferensiInput, type BuktiCreateInput } from './buku-besar-aset-schemas';

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
  sumber_anggaran: 'BLUD' | 'APBD' | 'DAK' | 'LAINNYA';
  vol: number;
  satuan: string | null;
  harga: number;
  nilai_rencana: number;
  status: BbaStatus;
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
  b.sumber_anggaran, b.vol, b.satuan, b.harga, b.nilai_rencana, b.status,
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

const FROM_JOIN = sql`FROM buku_besar_aset b LEFT JOIN usulan_items ui ON ui.id = b.usulan_item_id`;

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
    kategori_aset: r.kategori_aset as string | null, sumber_anggaran: (r.sumber_anggaran ?? 'BLUD') as BbaRow['sumber_anggaran'],
    vol: Number(r.vol ?? 0), satuan: r.satuan as string | null, harga: Number(r.harga ?? 0),
    nilai_rencana, status: r.status as BbaStatus, nilai_realisasi,
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
                         AND b.status IN ('DIRENCANAKAN', 'TIDAK_TEREALISASI') THEN 1 ELSE 0 END), 0) AS backlog
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
async function pastikanBerkasBba(q: Penanya, fileIds: (string | null | undefined)[]): Promise<void> {
  const unik = [...new Set(fileIds.filter((f): f is string => !!f))];
  if (unik.length === 0) return;
  const rows = await q`SELECT file_id FROM uploaded_files WHERE file_id IN (${unik}) AND context = 'buku_besar_aset'`;
  if (rows.length !== unik.length) throw new BbaBerkasTidakDikenalError();
}

const KOLOM_REFERENSI = ['aset_id', 'urutan', 'sumber', 'nama_penyedia', 'url', 'harga', 'tgl_cek', 'file_id'] as const;

/** Hapus-lalu-tulis-ulang, di transaksi pemanggil (sesudah CAS item). Larik kosong = mengosongkan dengan sengaja. */
async function gantiReferensi(q: Penanya, conn: mysql.PoolConnection, asetId: number, input: ReferensiInput[]): Promise<void> {
  const daftar = rapikanReferensi(input.map(r => ({
    sumber: r.sumber, nama_penyedia: r.nama_penyedia ?? null, url: r.url ?? null,
    harga: r.harga ?? null, tgl_cek: r.tgl_cek ?? null, file_id: r.file_id ?? null,
  })));
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

export async function createAset(input: BbaCreateInput, userId: number): Promise<{ id: number; canonical_id: string }> {
  return withTransaction(async ({ tx, conn }) => {
    const res = await tx`
      INSERT INTO buku_besar_aset
        (canonical_id, tahun_anggaran, kode_rekening, uraian, kategori_aset, sumber_anggaran,
         vol, satuan, harga, nilai_rencana, status, penanggung_jawab, keterangan, created_by, updated_by)
      VALUES
        ('', ${input.tahun_anggaran}, ${input.kode_rekening ?? null}, ${input.uraian}, ${input.kategori_aset ?? null}, ${input.sumber_anggaran},
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
  if (cur.usulan_keputusan === 'DITOLAK' && input.status !== undefined && input.status !== cur.status)
    throw new BbaUsulanLockedError('Baris usulan DITOLAK: status realisasi terkunci.');
}

export async function updateAset(input: BbaUpdateInput, userId: number, bolehKoreksiMundur = false): Promise<{ koreksiMundur: boolean }> {
  const cur = await getAsetById(input.id);
  if (!cur) throw new BbaNotFoundError();
  assertUsulanEditable(cur, input);
  if (input.status && !isValidStatusTransition(cur.status, input.status, bolehKoreksiMundur)) throw new BbaTransitionError(cur.status, input.status);
  // A2: vol rencana tidak boleh turun di bawah realisasi tersimpan ("5/2 unit")
  const volBaru = input.vol ?? cur.vol;
  if (volBaru < cur.vol_realisasi) throw new BbaRealisasiRangeError(cur.vol_realisasi, volBaru);
  // A3: status akhir harus konsisten dgn angka realisasi tersimpan
  assertStatusConsistent(input.status ?? cur.status, volBaru, cur.vol_realisasi, cur.nilai_realisasi);
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
  if (input.status !== undefined)           set = sql`${set}, status = ${input.status}`;
  // Referensi ikut Simpan item yang SAMA (satu tombol, satu transaksi, satu CAS — §4.1/L78).
  await withTransaction(async ({ tx, conn }) => {
    const res = await tx`
      UPDATE buku_besar_aset SET ${set}
      WHERE id = ${input.id} AND version = ${input.expected_version}
    `;
    assertCas(res);
    if (input.referensi !== undefined) await gantiReferensi(tx, conn, input.id, input.referensi);
  });
  // A4: jejak koreksi mundur dari terminal (caller tulis ke audit log)
  return { koreksiMundur: cur.status === 'REALISASI_PENUH' && input.status !== undefined && input.status !== 'REALISASI_PENUH' };
}

export async function setRealisasi(input: BbaRealisasiInput, userId: number, bolehKoreksiMundur = false): Promise<{ koreksiMundur: boolean }> {
  const cur = await getAsetById(input.id);
  if (!cur) throw new BbaNotFoundError();
  if (cur.origin === 'USULAN' && cur.usulan_keputusan === 'DITOLAK')
    throw new BbaUsulanLockedError('Baris usulan DITOLAK: realisasi terkunci (catatan sejarah).');
  if (input.vol_realisasi > cur.vol)
    throw new BbaRealisasiRangeError(input.vol_realisasi, cur.vol);
  if (!isValidStatusTransition(cur.status, input.status, bolehKoreksiMundur)) throw new BbaTransitionError(cur.status, input.status);
  // A3: REALISASI_PENUH ⇒ vol_realisasi = vol; TIDAK_TEREALISASI ⇒ realisasi 0
  assertStatusConsistent(input.status, cur.vol, input.vol_realisasi, input.nilai_realisasi);
  const res = await sql`
    UPDATE buku_besar_aset SET
      nilai_realisasi = ${input.nilai_realisasi},
      vol_realisasi   = ${input.vol_realisasi},
      tgl_realisasi   = ${input.tgl_realisasi ?? null},
      status          = ${input.status},
      version         = version + 1,
      updated_by      = ${userId}
    WHERE id = ${input.id} AND version = ${input.expected_version}
  `;
  assertCas(res);
  // A4: jejak koreksi mundur dari terminal (caller tulis ke audit log)
  return { koreksiMundur: cur.status === 'REALISASI_PENUH' && input.status !== 'REALISASI_PENUH' };
}

export async function deleteAset(id: number): Promise<boolean> {
  const res = await sql`DELETE FROM buku_besar_aset WHERE id = ${id}` as unknown as Array<{ affectedRows?: number }>;
  return (res[0]?.affectedRows ?? 0) > 0;
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
    uraian: spesifikasi ? `${String(r.nama_barang ?? '')} — ${spesifikasi}` : String(r.nama_barang ?? ''),
    vol, satuan: String(r.satuan ?? 'unit'), harga, nilai_rencana, keputusan, ditolak_oleh,
  };
}

export async function listImportCandidates(tahun: number): Promise<BbaImportCandidate[]> {
  const rows = await queryMany<Record<string, unknown>>(candidateQuery(tahun));
  return rows.map(mapCandidate);
}

export async function commitImportUsulan(tahun: number, userId: number): Promise<{ inserted: number }> {
  return withTransaction(async ({ tx, conn }) => {
    // Re-query di dalam transaksi (anti TOCTOU); UNIQUE uq_bba_usulan_item = jaring terakhir.
    const rows = await tx`${candidateQuery(tahun)}` as unknown as Record<string, unknown>[];
    const cands = (rows as Record<string, unknown>[]).map(mapCandidate);
    if (cands.length === 0) return { inserted: 0 };
    const { affectedRows } = await bulkInsert('buku_besar_aset', [
      'canonical_id', 'tahun_anggaran', 'origin', 'usulan_item_id', 'usulan_no',
      'usulan_keputusan', 'ditolak_oleh', 'sub_bidang', 'uraian', 'sumber_anggaran',
      'vol', 'satuan', 'harga', 'nilai_rencana', 'status', 'penanggung_jawab',
      'created_by', 'updated_by',
    ], cands.map(c => [
      // uq_im_canonical_tahun: '' ganda di tahun sama = duplicate → placeholder unik per baris.
      `TMP-${c.usulan_item_id}`, tahun, 'USULAN', c.usulan_item_id, c.usulan_no,
      c.keputusan, c.ditolak_oleh, c.sub_bidang, c.uraian, 'BLUD',
      c.vol, c.satuan, c.harga, c.nilai_rencana,
      c.keputusan === 'DISETUJUI' ? 'DIRENCANAKAN' : 'TIDAK_TEREALISASI', c.sub_bidang,
      userId, userId,
    ]), conn);
    // canonical_id atomik dari AUTO_INCREMENT id, pola createAset (anti-race MAX+1).
    await tx`UPDATE buku_besar_aset SET canonical_id = CONCAT('BBA-', LPAD(id, 6, '0')) WHERE origin = 'USULAN' AND canonical_id LIKE 'TMP-%'`;
    return { inserted: affectedRows };
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
