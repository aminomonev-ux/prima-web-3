// ═══ PRIMA — BBA Pengadaan & penerimaan (Tahap E buku aset) — Data Layer ═══
// Konsep: docs/CONCEPT-bba-buku-aset.md §7.4–7.6, §15, §16.
// Realisasi rencana (vol/nilai/tgl_realisasi + status diterima) = turunan Σ bba_penerimaan dan HANYA ditulis
// di sini (satu jalur tulis). Barang yang diterima baru jadi aset sesudah ditempatkan Umum Aset; register
// diisi dari sistem provinsi (manual, atau cocok otomatis saat impor KIB — lib/bba/aset.ts).
import type mysql from 'mysql2/promise';
import { sql, queryMany, withTransaction, bulkInsert, sqlInt, type TxSql } from '@/lib/data/db';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { ringkasPenerimaan, alasanTolakPenerimaan, sisaDitempatkan, salinanYangDibeli } from '@/lib/bba/penerimaan';
import type { BbaStatus } from '@/lib/bba/status';
import { bolehBerRuang, punyaKondisi } from '@/lib/bba/kondisi';
import { uraiKodeBarang, golonganDariKodeObjek, TEKS_KONDISI_KIB, type Golongan, type Kondisi } from '@/lib/bba/kib';
import type { JenisRencana } from '@/lib/bba/rencana';
import {
  SELECT_COLS, FROM_JOIN, mapRow, listReferensi, bekukanTautanUsulan, pastikanBerkasBba,
  BbaNotFoundError, BbaVersionConflictError, BbaLokasiTidakDikenalError, type BbaRow,
} from '@/lib/data/buku-besar-aset';
import { AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { alasanTakBisaBatalTempatkan, alasanTakBisaUbahRegister } from '@/lib/bba/koreksi';
import type {
  PenerimaanInput, TempatkanInput, RegisterInput, HapusAsetInput, RehabInput, KosongkanRegisterInput, BatalTempatkanInput, BatalHapusInput,
} from '@/lib/data/bba-penerimaan-schemas';

export class PenerimaanDitolakError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PenerimaanDitolakError'; }
}

export interface BarisPenerimaan {
  id: number; rencana_id: number; tgl: string; vol: number; harga_satuan: number; nilai: number; referensi_urutan: number | null;
  merk_tipe: string | null; penyedia: string | null; url: string | null; catatan: string | null; pindahan: boolean;
  oleh: string | null; ditempatkan: number;
}

const KOLOM_PENERIMAAN = sql`
  p.id, p.rencana_id, DATE_FORMAT(p.tgl, '%Y-%m-%d') AS tgl, p.vol, p.harga_satuan, p.nilai, p.referensi_urutan, p.merk_tipe, p.penyedia,
  p.url, p.catatan, p.pindahan, u.username AS oleh, (SELECT COUNT(*) FROM bba_aset a WHERE a.penerimaan_id = p.id) AS ditempatkan
`;
const petakanPenerimaan = (r: Record<string, unknown>): BarisPenerimaan => ({
  id: Number(r.id), rencana_id: Number(r.rencana_id), tgl: (r.tgl as string | null) ?? '', // sudah teks: DATE_FORMAT di SQL
  vol: Number(r.vol ?? 0), harga_satuan: Number(r.harga_satuan ?? 0), nilai: Number(r.nilai ?? 0),
  referensi_urutan: r.referensi_urutan == null ? null : Number(r.referensi_urutan),
  merk_tipe: (r.merk_tipe as string | null) ?? null, penyedia: (r.penyedia as string | null) ?? null, url: (r.url as string | null) ?? null,
  catatan: (r.catatan as string | null) ?? null, pindahan: Number(r.pindahan) === 1, oleh: (r.oleh as string | null) ?? null,
  ditempatkan: Number(r.ditempatkan ?? 0),
});

// ─── Halaman Pengadaan (§14) ─────────────────────────────────────────────────

export interface PengadaanTahun { tahun: number; rows: BbaRow[]; penerimaan: Record<number, BarisPenerimaan[]> }

/** Hanya rencana DIDANAI tahun itu — rencana yang tidak didanai tidak membingungkan Pengadaan (§7.4). */
export async function pengadaanTahun(tahun: number): Promise<PengadaanTahun> {
  const rows = (await queryMany<Record<string, unknown>>(sql`
    SELECT ${SELECT_COLS} ${FROM_JOIN}
    WHERE b.tahun_anggaran = ${tahun} AND b.anggaran = 'DIDANAI' AND (b.usulan_keputusan IS NULL OR b.usulan_keputusan <> 'DITOLAK')
    ORDER BY FIELD(b.status, 'DIRENCANAKAN', 'DIPROSES', 'REALISASI_SEBAGIAN', 'REALISASI_PENUH', 'TIDAK_TEREALISASI'), b.canonical_id
  `)).map(mapRow);
  return { tahun, rows, penerimaan: await penerimaanUntuk(rows.map(r => r.id)) };
}

export async function penerimaanUntuk(rencanaIds: number[]): Promise<Record<number, BarisPenerimaan[]>> {
  const per: Record<number, BarisPenerimaan[]> = {};
  if (rencanaIds.length === 0) return per;
  const pen = await queryMany<Record<string, unknown>>(sql`
    SELECT ${KOLOM_PENERIMAAN} FROM bba_penerimaan p LEFT JOIN users u ON u.id = p.created_by
    WHERE p.rencana_id IN (${rencanaIds}) ORDER BY p.tgl, p.id
  `);
  for (const p of pen.map(petakanPenerimaan)) (per[p.rencana_id] ??= []).push(p);
  return per;
}

/** Tulis ulang realisasi rencana dari Σ penerimaan — dipanggil di transaksi yang memegang kunci rencana. */
async function tulisRealisasi(tx: TxSql, rencanaId: number, vol: number, userId: number): Promise<BbaStatus> {
  const xs = (await tx`SELECT DATE_FORMAT(tgl, '%Y-%m-%d') AS tgl, vol, nilai FROM bba_penerimaan WHERE rencana_id = ${rencanaId}` as Array<Record<string, unknown>>)
    .map(x => ({ tgl: x.tgl as string, vol: Number(x.vol), nilai: Number(x.nilai) })); // tgl: DATE_FORMAT di SQL
  // Semua penerimaan terhapus = kembali Dalam Proses (barangnya sudah dipesan). tgl_proses yang kosong
  // (langsung diterima tanpa ditandai dipesan) diisi tanggal penerimaan pertama.
  const r = ringkasPenerimaan(vol, xs);
  const pertama = xs.reduce<string | null>((m, x) => (!m || x.tgl < m ? x.tgl : m), null);
  await tx`
    UPDATE buku_besar_aset SET vol_realisasi = ${r.vol}, nilai_realisasi = ${r.nilai}, tgl_realisasi = ${r.tgl}, status = ${r.status},
      tgl_proses = COALESCE(tgl_proses, ${pertama}), version = version + 1, updated_by = ${userId}
    WHERE id = ${rencanaId}
  `;
  return r.status;
}

async function kunciRencana(tx: TxSql, id: number): Promise<BbaRow> {
  const ada = await tx`SELECT id FROM buku_besar_aset WHERE id = ${id} FOR UPDATE`;
  if (ada.length === 0) throw new BbaNotFoundError();
  return mapRow((await tx`SELECT ${SELECT_COLS} ${FROM_JOIN} WHERE b.id = ${id}` as Record<string, unknown>[])[0]);
}

/**
 * Catat penerimaan (bertahap). Kunci rencana + CAS versi (L77), pagar didanai & volume, "yang dibeli"
 * disalin dari referensi terpilih (isian sendiri menimpa per kolom), lalu realisasi ditulis ulang dari Σ.
 * Penggantian yang Diterima penuh: aset sasaran ditandai siap dihapus (§7.5 butir 4).
 */
export async function catatPenerimaan(input: PenerimaanInput, userId: number): Promise<{ canonical_id: string; status: BbaStatus; siapDihapus: number }> {
  return withTransaction(async ({ tx, conn }) => {
    const r = await kunciRencana(tx, input.rencana_id);
    if (r.version !== input.expected_version) throw new BbaVersionConflictError();
    const sudah = Number(((await tx`SELECT COALESCE(SUM(vol), 0) AS v FROM bba_penerimaan WHERE rencana_id = ${r.id}`) as Array<{ v: number }>)[0]?.v ?? 0);
    const alasan = alasanTolakPenerimaan(r, sudah, input.vol, input.tgl, tanggalHariIniWIB());
    if (alasan) throw new PenerimaanDitolakError(alasan);
    // Bekukan tautan usulan DULU — kalau belum pernah tersimpan, referensi ke-n yang dipilih di layar
    // baru ada sesudah langkah ini (§7.4 butir 5).
    await bekukanTautanUsulan(tx, conn, r);
    const ref = input.referensi_urutan ? (await listReferensi(r.id, tx))[input.referensi_urutan - 1] : null;
    if (input.referensi_urutan && !ref) throw new PenerimaanDitolakError(`Referensi ke-${input.referensi_urutan} tidak ada — muat ulang rencananya.`);
    const dibeli = salinanYangDibeli(ref ?? null, input);
    await tx`
      INSERT INTO bba_penerimaan (rencana_id, tgl, vol, harga_satuan, nilai, referensi_urutan, merk_tipe, penyedia, url, catatan, created_by)
      VALUES (${r.id}, ${input.tgl}, ${input.vol}, ${input.harga_satuan}, ${Math.round(input.vol * input.harga_satuan * 100) / 100},
              ${input.referensi_urutan ?? null}, ${dibeli.merk_tipe}, ${dibeli.penyedia}, ${dibeli.url}, ${input.catatan || null}, ${userId})
    `;
    const status = await tulisRealisasi(tx, r.id, r.vol, userId);
    // Baru saat Diterima penuh: penerimaan sebagian belum tahu unit lama MANA yang sudah ada penggantinya.
    const siapDihapus = r.jenis_rencana === 'PENGGANTIAN' && status === 'REALISASI_PENUH' ? await tandaiSiapDihapus(tx, conn, r, true, userId) : 0;
    return { canonical_id: r.canonical_id, status, siapDihapus };
  });
}

async function tandaiSiapDihapus(tx: TxSql, conn: mysql.PoolConnection, r: BbaRow, siap: boolean, userId: number): Promise<number> {
  const ids = (await tx`
    SELECT a.id FROM bba_rencana_aset ra JOIN bba_aset a ON a.id = ra.aset_id
    WHERE ra.rencana_id = ${r.id} AND a.status = 'AKTIF' AND a.siap_dihapus = ${siap ? 0 : 1} FOR UPDATE
  ` as Array<{ id: number }>).map(x => Number(x.id));
  if (ids.length === 0) return 0;
  await tx`UPDATE bba_aset SET siap_dihapus = ${siap ? 1 : 0}, version = version + 1, updated_by = ${userId} WHERE id IN (${ids})`;
  await bulkInsert('bba_aset_riwayat', ['aset_id', 'jenis', 'sebelum', 'sesudah', 'catatan', 'oleh'], ids.map(id => [
    id, 'UBAH', JSON.stringify({ siap_dihapus: !siap }), JSON.stringify({ siap_dihapus: siap }),
    siap ? `Diganti lewat ${r.canonical_id} (penggantian diterima)` : `Penerimaan ${r.canonical_id} dibatalkan`, userId,
  ]), conn);
  return ids.length;
}

/**
 * Koreksi salah catat. Ditolak bila sudah ada register yang lahir dari penerimaan itu. Rencana yang sudah
 * Diterima penuh hanya bisa dikoreksi mundur oleh Admin (A4, PERAN_PEMBATAL_FINAL) — sama seperti dulu.
 */
export async function hapusPenerimaan(id: number, userId: number, bolehKoreksiMundur: boolean): Promise<{ canonical_id: string; dariPenuh: boolean } | null> {
  return withTransaction(async ({ tx, conn }) => {
    const p = await tx`SELECT rencana_id, pindahan FROM bba_penerimaan WHERE id = ${id}` as Array<{ rencana_id: number; pindahan: number }>;
    if (p.length === 0) return null;
    const r = await kunciRencana(tx, Number(p[0].rencana_id));
    const aset = Number(((await tx`SELECT COUNT(*) AS n FROM bba_aset WHERE penerimaan_id = ${id}`) as Array<{ n: number }>)[0]?.n ?? 0);
    if (aset > 0) throw new PenerimaanDitolakError(`Penerimaan ini sudah ditempatkan jadi ${aset} register di Buku Aset — tidak bisa dihapus.`);
    // Nilai realisasi lama tidak selalu vol × harga, jadi tidak bisa dicatat ulang persis lewat form.
    if (Number(p[0].pindahan) === 1 && !bolehKoreksiMundur)
      throw new PenerimaanDitolakError('Ini realisasi lama yang dipindah otomatis saat pencatatan penerimaan dimulai — nilainya tidak bisa dicatat ulang persis, jadi penghapusannya hanya oleh Admin.');
    // Rehab tidak melahirkan register, jadi "sudah ditempatkan"-nya = kondisi gedung sudah diperbarui atas namanya.
    if (r.jenis_rencana === 'REHAB') {
      const rehab = await tx`
        SELECT COUNT(*) AS n FROM bba_aset_riwayat
        WHERE jenis = 'REHAB' AND JSON_UNQUOTE(JSON_EXTRACT(sesudah, '$.rencana')) = ${r.canonical_id}
          AND aset_id IN (SELECT aset_id FROM bba_rencana_aset WHERE rencana_id = ${r.id})
      ` as Array<{ n: number }>;
      if (Number(rehab[0]?.n ?? 0) > 0) throw new PenerimaanDitolakError(`Kondisi gedung sudah diperbarui dari rehab ${r.canonical_id} — penerimaannya tidak bisa dihapus lagi.`);
    }
    const dariPenuh = r.status === 'REALISASI_PENUH';
    if (dariPenuh && !bolehKoreksiMundur) throw new PenerimaanDitolakError(`${r.canonical_id} sudah Diterima penuh — koreksi mundur hanya oleh Admin.`);
    await tx`DELETE FROM bba_penerimaan WHERE id = ${id}`;
    const status = await tulisRealisasi(tx, r.id, r.vol, userId);
    if (r.jenis_rencana === 'PENGGANTIAN' && status !== 'REALISASI_PENUH') await tandaiSiapDihapus(tx, conn, r, false, userId);
    return { canonical_id: r.canonical_id, dariPenuh };
  });
}

// ─── Antrean Buku Aset: diterima, belum dicatat (§7.5, §15) ──────────────────

export interface AntreanTerima {
  penerimaan_id: number; rencana_id: number; canonical_id: string; tahun: number; uraian: string; jenis: JenisRencana | null;
  barang_id: number | null; barang_nama: string | null; tgl: string; vol: number; sisa: number; harga_satuan: number; merk_tipe: string | null;
}
export interface AntreanRehab {
  rencana_id: number; canonical_id: string; uraian: string; tgl: string; aset_id: number; aset_version: number;
  aset_golongan: Golongan; aset_nama: string; register: string | null;
}

const BATAS_ANTREAN = 500;

export async function antreanBukuAset(): Promise<{ terima: AntreanTerima[]; rehab: AntreanRehab[] }> {
  const [rows, rehab] = await Promise.all([
    // `pindahan` = realisasi lama yang dipindah migrasi: barangnya sudah di KIB provinsi.
    queryMany<Record<string, unknown>>(sql`
      SELECT p.id, p.rencana_id, b.canonical_id, b.tahun_anggaran, b.uraian, b.jenis_rencana, b.barang_id, g.nama AS barang_nama,
             DATE_FORMAT(p.tgl, '%Y-%m-%d') AS tgl, p.vol, p.harga_satuan, p.merk_tipe,
             (SELECT COUNT(*) FROM bba_aset a WHERE a.penerimaan_id = p.id) AS sudah
      FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id LEFT JOIN bba_barang g ON g.id = b.barang_id
      WHERE p.pindahan = 0 AND (b.jenis_rencana IS NULL OR b.jenis_rencana <> 'REHAB')
        AND (SELECT COUNT(*) FROM bba_aset a WHERE a.penerimaan_id = p.id) < FLOOR(p.vol + 0.005)
      ORDER BY p.tgl DESC, p.id DESC LIMIT ${sqlInt(BATAS_ANTREAN)}
    `),
    // Rehab tidak melahirkan aset baru: antreannya "perbarui kondisi gedung sasaran" sampai riwayat REHAB-nya tercatat.
    queryMany<Record<string, unknown>>(sql`
      SELECT b.id AS rencana_id, b.canonical_id, b.uraian, DATE_FORMAT(b.tgl_realisasi, '%Y-%m-%d') AS tgl, a.id AS aset_id, a.version AS aset_version,
             a.golongan AS aset_golongan, COALESCE(NULLIF(a.nama, ''), a.nama_resmi) AS aset_nama, a.register
      FROM buku_besar_aset b JOIN bba_rencana_aset ra ON ra.rencana_id = b.id JOIN bba_aset a ON a.id = ra.aset_id AND a.status = 'AKTIF'
      WHERE b.jenis_rencana = 'REHAB' AND b.status IN ('REALISASI_PENUH', 'REALISASI_SEBAGIAN')
        AND NOT EXISTS (SELECT 1 FROM bba_aset_riwayat r WHERE r.aset_id = a.id AND r.jenis = 'REHAB'
                        AND JSON_UNQUOTE(JSON_EXTRACT(r.sesudah, '$.rencana')) = b.canonical_id)
      ORDER BY b.tgl_realisasi DESC LIMIT ${sqlInt(BATAS_ANTREAN)}
    `),
  ]);
  return {
    terima: rows.map(r => {
      const jenis = (r.jenis_rencana as JenisRencana | null) ?? null;
      return {
        penerimaan_id: Number(r.id), rencana_id: Number(r.rencana_id), canonical_id: String(r.canonical_id ?? ''), tahun: Number(r.tahun_anggaran),
        uraian: String(r.uraian ?? ''), jenis, barang_id: r.barang_id == null ? null : Number(r.barang_id), barang_nama: (r.barang_nama as string | null) ?? null,
        tgl: (r.tgl as string | null) ?? '', vol: Number(r.vol), sisa: sisaDitempatkan({ vol: Number(r.vol) }, Number(r.sudah ?? 0), jenis),
        harga_satuan: Number(r.harga_satuan), merk_tipe: (r.merk_tipe as string | null) ?? null,
      };
    }),
    rehab: rehab.map(r => ({
      rencana_id: Number(r.rencana_id), canonical_id: String(r.canonical_id ?? ''), uraian: String(r.uraian ?? ''), tgl: (r.tgl as string | null) ?? '',
      aset_id: Number(r.aset_id), aset_version: Number(r.aset_version), aset_golongan: r.aset_golongan as Golongan,
      aset_nama: String(r.aset_nama ?? ''), register: (r.register as string | null) ?? null,
    })),
  };
}

/**
 * Tempatkan barang diterima jadi register "belum teregister" (§7.5 butir 2): satu baris per unit, ruangan &
 * kondisi dari RT, harga = harga riil, tahun perolehan = tahun diterima. Golongan B membawa merk/tipe yang
 * dibeli ke kolom Merk/Type KIB. Penerimaan dikunci dulu — dua RT berbarengan tidak melebihi jumlahnya.
 */
export async function tempatkan(input: TempatkanInput, userId: number): Promise<{ ditempatkan: number; canonical_id: string }> {
  return withTransaction(async ({ tx, conn }) => {
    const ps = await tx`
      SELECT p.id, DATE_FORMAT(p.tgl, '%Y-%m-%d') AS tgl, p.vol, p.harga_satuan, p.merk_tipe, p.pindahan, b.barang_id, b.jenis_rencana, b.uraian, b.canonical_id
      FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE p.id = ${input.penerimaan_id} FOR UPDATE
    ` as Array<Record<string, unknown>>;
    if (ps.length === 0) throw new BbaNotFoundError();
    const p = ps[0];
    const sudah = Number(((await tx`SELECT COUNT(*) AS n FROM bba_aset WHERE penerimaan_id = ${input.penerimaan_id}`) as Array<{ n: number }>)[0]?.n ?? 0);
    const sisa = Number(p.pindahan) === 1 ? 0 : sisaDitempatkan({ vol: Number(p.vol) }, sudah, (p.jenis_rencana as JenisRencana | null) ?? null);
    if (input.jumlah > sisa) throw new PenerimaanDitolakError(sisa === 0 ? 'Tidak ada unit penerimaan ini yang menunggu ditempatkan.' : `Tinggal ${sisa} unit yang belum ditempatkan.`);
    const lokasi = bolehBerRuang(input.golongan) ? input.lokasi_id ?? null : null;
    if (lokasi && (await tx`SELECT id FROM bba_lokasi WHERE id = ${lokasi} FOR SHARE`).length === 0) throw new BbaLokasiTidakDikenalError();
    const tgl = p.tgl as string; // DATE_FORMAT di SQL
    const kondisi: Kondisi | null = punyaKondisi(input.golongan) ? input.kondisi : null;
    const kib = input.golongan === 'B' && p.merk_tipe ? { merk_type: String(p.merk_tipe) } : {};
    const hariIni = tanggalHariIniWIB();
    const { insertId } = await bulkInsert('bba_aset', [
      'golongan', 'tahun_perolehan', 'nama_resmi', 'nama', 'barang_id', 'penerimaan_id', 'lokasi_id', 'kib', 'harga', 'asal_usul', 'keterangan',
      'kondisi', 'kondisi_sumber', 'kondisi_tgl', 'kondisi_oleh', 'created_by', 'updated_by',
    ], Array.from({ length: input.jumlah }, () => [
      input.golongan, Number(tgl.slice(0, 4)), input.nama_resmi, input.nama || null, p.barang_id ?? null, input.penerimaan_id, lokasi, JSON.stringify(kib),
      Number(p.harga_satuan), 'Pembelian', `${p.canonical_id} · ${String(p.uraian ?? '')}`.slice(0, 500),
      kondisi, kondisi ? 'CEK' : null, kondisi ? hariIni : null, kondisi ? userId : null, userId, userId,
    ]), conn);
    // Satu INSERT banyak baris = id berurutan mulai insertId (InnoDB, satu pernyataan "simple insert").
    const baru = Array.from({ length: input.jumlah }, (_, i) => insertId + i);
    await bulkInsert('bba_aset_riwayat', ['aset_id', 'jenis', 'sebelum', 'sesudah', 'catatan', 'oleh'], baru.map(id => [
      id, 'TERIMA', null, JSON.stringify({ rencana: p.canonical_id, diterima: tgl, kondisi: kondisi ? TEKS_KONDISI_KIB[kondisi] : null }), input.catatan || null, userId,
    ]), conn);
    return { ditempatkan: baru.length, canonical_id: String(p.canonical_id) };
  });
}

// ─── Register, penghapusan, rehab (kartu aset) ───────────────────────────────

/** Register angka disimpan 6 digit seperti sistem provinsi (pola impor KIB). */
export const rapikanRegister = (r: string) => (/^\d+$/.test(r.trim()) ? r.trim().padStart(6, '0') : r.trim());

/**
 * Isi — atau betulkan — kode barang & register dari sistem provinsi (§7.5 butir 3, §20.2). Kunci impor ikut,
 * jadi impor KIB berikutnya mencocokkannya. Hanya catatan yang lahir di PRIMA: kunci aset dari berkas
 * (termasuk KIB F tanpa kode: nama + letak + tanggal mulai) yang diganti membuat impor berikutnya melahirkan kembarannya.
 */
export async function isiRegister(input: RegisterInput, userId: number): Promise<{ kunci_impor: string; sebelum: string | null }> {
  return withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT golongan, kode_barang, register, kunci_impor, version, status, penerimaan_id FROM bba_aset WHERE id = ${input.id} FOR UPDATE` as Array<Record<string, unknown>>;
    if (ada.length === 0) throw new AsetTidakAdaError();
    const a = ada[0];
    if (Number(a.version) !== input.expected_version) throw new AsetVersiError();
    const tolak = alasanTakBisaUbahRegister({ status: a.status as 'AKTIF' | 'DIHAPUS', penerimaan_id: a.penerimaan_id == null ? null : Number(a.penerimaan_id) });
    if (tolak) throw new AsetDitolakError([tolak]);
    const kode = input.kode_barang.trim(), register = rapikanRegister(input.register);
    const { tahun, kodeObjek } = uraiKodeBarang(kode);
    const g = golonganDariKodeObjek(kodeObjek);
    if (g && g !== a.golongan) throw new AsetDitolakError([`Kode barang ini golongan ${g}, aset ini golongan ${a.golongan}.`]);
    const kunci = `${kode}|${register}`;
    const sebelum = (a.kunci_impor as string | null) ?? null;
    if (sebelum === kunci) return { kunci_impor: kunci, sebelum };
    // Kembar ditolak indeks UNIK `kunci_impor`, bukan SELECT dulu: SELECT tidak mengunci kunci yang belum ada,
    // jadi pengisian/impor berbarengan lolos pemeriksaan lalu bentrok di sini juga (L69-a).
    // Tahun tanpa ruas di kode = tahun diterima, bukan tahun dari register salah ketik yang sedang dibetulkan.
    try {
      await tx`
        UPDATE bba_aset SET kode_barang = ${kode}, register = ${register}, kunci_impor = ${kunci}, kode_objek = ${kodeObjek},
          tahun_perolehan = COALESCE(${tahun}, (SELECT YEAR(p.tgl) FROM bba_penerimaan p WHERE p.id = ${Number(a.penerimaan_id)}), tahun_perolehan),
          version = version + 1, updated_by = ${userId}
        WHERE id = ${input.id}
      `;
    } catch (err) {
      if ((err as { code?: string })?.code === 'ER_DUP_ENTRY')
        throw new AsetDitolakError([`Kode barang + register ${register} sudah dipakai register lain di Buku Aset.`]);
      throw err;
    }
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, oleh)
      VALUES (${input.id}, 'REGISTER', ${JSON.stringify({ kode_barang: a.kode_barang ?? null, register: a.register ?? null })},
              ${JSON.stringify({ kode_barang: kode, register })}, ${userId})
    `;
    return { kunci_impor: kunci, sebelum };
  });
}

/** Kembali belum teregister (§20.2): nomor yang benar belum dipegang, atau register itu milik unit lain. */
export async function kosongkanRegister(input: KosongkanRegisterInput, userId: number): Promise<{ sebelum: string | null }> {
  return withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT kode_barang, register, kunci_impor, version, status, penerimaan_id FROM bba_aset WHERE id = ${input.id} FOR UPDATE` as Array<Record<string, unknown>>;
    if (ada.length === 0) throw new AsetTidakAdaError();
    const a = ada[0];
    if (Number(a.version) !== input.expected_version) throw new AsetVersiError();
    const tolak = alasanTakBisaUbahRegister({ status: a.status as 'AKTIF' | 'DIHAPUS', penerimaan_id: a.penerimaan_id == null ? null : Number(a.penerimaan_id) });
    if (tolak) throw new AsetDitolakError([tolak]);
    const sebelum = (a.kunci_impor as string | null) ?? null;
    if (!a.kode_barang && !sebelum) return { sebelum };
    // Tahun kembali ke tahun diterima — pencocok impor memakai golongan + tahun + harga.
    await tx`
      UPDATE bba_aset SET kode_barang = NULL, register = NULL, kunci_impor = NULL, kode_objek = NULL,
        tahun_perolehan = COALESCE((SELECT YEAR(p.tgl) FROM bba_penerimaan p WHERE p.id = ${Number(a.penerimaan_id)}), tahun_perolehan),
        version = version + 1, updated_by = ${userId}
      WHERE id = ${input.id}
    `;
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, catatan, oleh)
      VALUES (${input.id}, 'REGISTER', ${JSON.stringify({ kode_barang: a.kode_barang ?? null, register: a.register ?? null })},
              ${JSON.stringify({ kode_barang: null, register: null })}, 'Dikosongkan — kembali belum teregister', ${userId})
    `;
    return { sebelum };
  });
}

export interface HasilBatalTempatkan { dibatalkan: number; rincian: string }

/**
 * Batalkan penempatan yang salah (§20.1): register belum teregister yang lahir dari Tempatkan dibuang beserta
 * riwayatnya, unitnya kembali ke antrean. DIBUANG, bukan diberi status ketiga: catatan itu tak pernah ada di
 * buku resmi, dan status ketiga harus diingat tiap kueri yang menghitung bba_aset (antrean, impor, Excel) — L69.
 * Jejaknya di audit log (`rincian`). Penerimaan dikunci dulu — urutan sama dengan Tempatkan.
 */
export async function batalTempatkan(input: BatalTempatkanInput): Promise<HasilBatalTempatkan> {
  return withTransaction(async ({ tx }) => {
    const ids = input.item.map(x => x.id);
    const penIds = (await tx`SELECT DISTINCT penerimaan_id FROM bba_aset WHERE id IN (${ids}) AND penerimaan_id IS NOT NULL` as Array<{ penerimaan_id: number }>)
      .map(x => Number(x.penerimaan_id));
    const pen = penIds.length
      ? await tx`SELECT p.id, b.canonical_id FROM bba_penerimaan p JOIN buku_besar_aset b ON b.id = p.rencana_id WHERE p.id IN (${penIds}) FOR UPDATE OF p` as Array<{ id: number; canonical_id: string }>
      : [];
    const kodeRencana = new Map(pen.map(p => [Number(p.id), String(p.canonical_id)]));
    const rows = await tx`
      SELECT id, golongan, nama, nama_resmi, register, kode_barang, kunci_impor, status, version, penerimaan_id
      FROM bba_aset WHERE id IN (${ids}) FOR UPDATE
    ` as Array<Record<string, unknown>>;
    if (rows.length !== ids.length) throw new AsetTidakAdaError();
    const versi = new Map(input.item.map(x => [x.id, x.expected_version]));
    const basi = rows.filter(r => Number(r.version) !== versi.get(Number(r.id))).length;
    if (basi > 0) throw new AsetVersiError(basi);
    // Rujukan dibaca SESUDAH kunci: tautan sasaran (gantiSasaran) & gedung ruangan (simpan lokasi) membaca aset `FOR SHARE`.
    const sasaran = await tx`SELECT ra.aset_id, b.canonical_id FROM bba_rencana_aset ra JOIN buku_besar_aset b ON b.id = ra.rencana_id WHERE ra.aset_id IN (${ids})` as Array<{ aset_id: number; canonical_id: string }>;
    const gedung = await tx`SELECT gedung_aset_id, nama FROM bba_lokasi WHERE gedung_aset_id IN (${ids})` as Array<{ gedung_aset_id: number; nama: string }>;
    const sasaranDari = (id: number) => sasaran.filter(x => Number(x.aset_id) === id).map(x => String(x.canonical_id));
    const gedungDari = (id: number) => gedung.filter(x => Number(x.gedung_aset_id) === id).map(x => String(x.nama));
    const aset = rows.map(r => ({
      id: Number(r.id), golongan: String(r.golongan), nama: (r.nama as string | null) ?? null, nama_resmi: String(r.nama_resmi ?? ''),
      register: (r.register as string | null) ?? null, kode_barang: (r.kode_barang as string | null) ?? null, kunci_impor: (r.kunci_impor as string | null) ?? null,
      status: r.status as 'AKTIF' | 'DIHAPUS', penerimaan_id: r.penerimaan_id == null ? null : Number(r.penerimaan_id),
    }));
    const alasan = aset.map(a => alasanTakBisaBatalTempatkan(a, { sasaran: sasaranDari(a.id), gedung: gedungDari(a.id) })).filter((s): s is string => !!s);
    if (alasan.length) throw new AsetDitolakError(alasan);
    await tx`DELETE FROM bba_aset WHERE id IN (${ids})`;
    const kelompok = new Map<string, number>();
    for (const a of aset) {
      const k = `${kodeRencana.get(a.penerimaan_id!) ?? `penerimaan ${a.penerimaan_id}`}: KIB ${a.golongan} ${a.nama_resmi}`;
      kelompok.set(k, (kelompok.get(k) ?? 0) + 1);
    }
    return { dibatalkan: aset.length, rincian: [...kelompok].map(([k, n]) => `${k} ×${n}`).join('; ') };
  });
}

/** Nomor/tanggal/berkas SK salah ketik (§20.3) — asetnya tetap dihapus. */
export async function betulkanSk(input: HapusAsetInput, userId: number): Promise<{ sebelum: string }> {
  if (input.sk_tgl > tanggalHariIniWIB()) throw new AsetDitolakError(['Tanggal SK tidak boleh sesudah hari ini.']);
  return withTransaction(async ({ tx }) => {
    const ada = await tx`
      SELECT version, status, hapus_sk_nomor, DATE_FORMAT(hapus_sk_tgl, '%Y-%m-%d') AS hapus_sk_tgl FROM bba_aset WHERE id = ${input.id} FOR UPDATE
    ` as Array<{ version: number; status: string; hapus_sk_nomor: string | null; hapus_sk_tgl: string | null }>;
    if (ada.length === 0) throw new AsetTidakAdaError();
    const a = ada[0];
    if (Number(a.version) !== input.expected_version) throw new AsetVersiError();
    if (a.status !== 'DIHAPUS') throw new AsetDitolakError(['Aset ini tidak sedang dihapus — tidak ada SK yang bisa dibetulkan.']);
    const sebelum = `SK ${a.hapus_sk_nomor ?? '—'} tgl ${a.hapus_sk_tgl ?? '—'}`;
    if (a.hapus_sk_nomor === input.sk_nomor && a.hapus_sk_tgl === input.sk_tgl && !input.file_id && !input.catatan) return { sebelum };
    await pastikanBerkasBba(tx, [input.file_id]);
    await tx`
      UPDATE bba_aset SET hapus_sk_nomor = ${input.sk_nomor}, hapus_sk_tgl = ${input.sk_tgl}, version = version + 1, updated_by = ${userId}
      WHERE id = ${input.id}
    `;
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, catatan, file_id, oleh)
      VALUES (${input.id}, 'UBAH', ${JSON.stringify({ sk: a.hapus_sk_nomor, tgl_sk: a.hapus_sk_tgl })},
              ${JSON.stringify({ sk: input.sk_nomor, tgl_sk: input.sk_tgl })}, ${input.catatan || 'Koreksi SK penghapusan'}, ${input.file_id || null}, ${userId})
    `;
    return { sebelum };
  });
}

/**
 * Aset yang salah ditandai dihapus (§20.3) — khusus Admin: membatalkan berarti menyatakan SK itu tidak berlaku
 * untuk aset ini. `siap_dihapus` DIHITUNG ULANG dari rencana penggantian yang diterima penuh (`hapusAset`
 * sudah menolkannya, jadi tidak ada yang bisa "dikembalikan"). Impor KIB tetap tidak menghidupkan aset dihapus.
 */
export async function batalHapus(input: BatalHapusInput, userId: number, bolehAdmin: boolean): Promise<{ sk: string }> {
  if (!bolehAdmin) throw new AsetDitolakError(['Membatalkan penghapusan hanya oleh Admin.']);
  return withTransaction(async ({ tx }) => {
    const ada = await tx`
      SELECT version, status, hapus_sk_nomor, DATE_FORMAT(hapus_sk_tgl, '%Y-%m-%d') AS hapus_sk_tgl FROM bba_aset WHERE id = ${input.id} FOR UPDATE
    ` as Array<{ version: number; status: string; hapus_sk_nomor: string | null; hapus_sk_tgl: string | null }>;
    if (ada.length === 0) throw new AsetTidakAdaError();
    const a = ada[0];
    if (Number(a.version) !== input.expected_version) throw new AsetVersiError();
    if (a.status !== 'DIHAPUS') throw new AsetDitolakError(['Aset ini tidak sedang dihapus.']);
    await tx`
      UPDATE bba_aset SET status = 'AKTIF', hapus_sk_nomor = NULL, hapus_sk_tgl = NULL,
        siap_dihapus = EXISTS (
          SELECT 1 FROM bba_rencana_aset ra JOIN buku_besar_aset b ON b.id = ra.rencana_id
          WHERE ra.aset_id = ${input.id} AND b.jenis_rencana = 'PENGGANTIAN' AND b.status = 'REALISASI_PENUH'
        ),
        version = version + 1, updated_by = ${userId}
      WHERE id = ${input.id}
    `;
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, catatan, oleh)
      VALUES (${input.id}, 'BATAL_HAPUS', ${JSON.stringify({ status: 'DIHAPUS', sk: a.hapus_sk_nomor, tgl_sk: a.hapus_sk_tgl })},
              ${JSON.stringify({ status: 'AKTIF' })}, ${input.alasan}, ${userId})
    `;
    return { sk: `${a.hapus_sk_nomor ?? '—'} tgl ${a.hapus_sk_tgl ?? '—'}` };
  });
}

/** Penghapusan dengan SK (§7.6): catatannya tidak lenyap — pindah ke "dihapus", riwayat HAPUS. */
export async function hapusAset(input: HapusAsetInput, userId: number): Promise<void> {
  if (input.sk_tgl > tanggalHariIniWIB()) throw new AsetDitolakError(['Tanggal SK tidak boleh sesudah hari ini.']);
  await withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT version, status FROM bba_aset WHERE id = ${input.id} FOR UPDATE` as Array<{ version: number; status: string }>;
    if (ada.length === 0) throw new AsetTidakAdaError();
    if (Number(ada[0].version) !== input.expected_version) throw new AsetVersiError();
    if (ada[0].status !== 'AKTIF') throw new AsetDitolakError(['Aset ini sudah dihapus.']);
    await pastikanBerkasBba(tx, [input.file_id]);
    await tx`
      UPDATE bba_aset SET status = 'DIHAPUS', hapus_sk_nomor = ${input.sk_nomor}, hapus_sk_tgl = ${input.sk_tgl}, siap_dihapus = 0,
        version = version + 1, updated_by = ${userId}
      WHERE id = ${input.id}
    `;
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, catatan, file_id, oleh)
      VALUES (${input.id}, 'HAPUS', ${JSON.stringify({ status: 'AKTIF' })}, ${JSON.stringify({ status: 'DIHAPUS', sk: input.sk_nomor, tgl_sk: input.sk_tgl })},
              ${input.catatan || null}, ${input.file_id || null}, ${userId})
    `;
  });
}

/** Rehab selesai → kondisi gedung sasaran diperbarui, riwayat REHAB menyebut rencananya (§15). */
export async function catatRehab(input: RehabInput, userId: number): Promise<{ canonical_id: string }> {
  if (input.tgl > tanggalHariIniWIB()) throw new AsetDitolakError(['Tanggal tidak boleh sesudah hari ini.']);
  return withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT version, status, golongan, kondisi FROM bba_aset WHERE id = ${input.aset_id} FOR UPDATE` as Array<{ version: number; status: string; golongan: Golongan; kondisi: Kondisi | null }>;
    if (ada.length === 0) throw new AsetTidakAdaError();
    if (Number(ada[0].version) !== input.expected_version) throw new AsetVersiError();
    if (ada[0].status !== 'AKTIF') throw new AsetDitolakError(['Aset ini sudah dihapus.']);
    const rr = await tx`
      SELECT b.canonical_id FROM buku_besar_aset b JOIN bba_rencana_aset ra ON ra.rencana_id = b.id AND ra.aset_id = ${input.aset_id}
      WHERE b.id = ${input.rencana_id} AND b.jenis_rencana = 'REHAB' AND b.status IN ('REALISASI_PENUH', 'REALISASI_SEBAGIAN')
    ` as Array<{ canonical_id: string }>;
    if (rr.length === 0) throw new AsetDitolakError(['Aset ini bukan sasaran rencana rehab yang sudah diterima.']);
    await pastikanBerkasBba(tx, [input.file_id]);
    const kondisi = punyaKondisi(ada[0].golongan) ? input.kondisi : null;
    await tx`
      UPDATE bba_aset SET kondisi = ${kondisi}, kondisi_sumber = ${kondisi ? 'CEK' : null}, kondisi_tgl = ${kondisi ? input.tgl : null},
        kondisi_oleh = ${kondisi ? userId : null}, version = version + 1, updated_by = ${userId}
      WHERE id = ${input.aset_id}
    `;
    await tx`
      INSERT INTO bba_aset_riwayat (aset_id, jenis, sebelum, sesudah, catatan, file_id, oleh)
      VALUES (${input.aset_id}, 'REHAB', ${JSON.stringify({ kondisi: ada[0].kondisi ? TEKS_KONDISI_KIB[ada[0].kondisi] : null })},
              ${JSON.stringify({ rencana: rr[0].canonical_id, kondisi: kondisi ? TEKS_KONDISI_KIB[kondisi] : null, tgl: input.tgl })},
              ${input.catatan || null}, ${input.file_id || null}, ${userId})
    `;
    return { canonical_id: rr[0].canonical_id };
  });
}
