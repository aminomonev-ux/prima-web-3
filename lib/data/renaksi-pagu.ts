// lib/data/renaksi-pagu.ts — rincian pagu Rencana Aksi per sumber dana (DB).
// Konsep: docs/CONCEPT-renaksi-pagu-rko.md. Aturannya MURNI di lib/renaksi/pagu.ts.
//
// SATU penulis rincian (`tulisRincianPagu`) untuk Data Entry DAN Impor (L69). Ia juga satu-satunya
// yang menulis `rencana_aksi.anggaran_nominal` (= Σ pagu berlaku) — kolom itu dibaca Cetak,
// Realisasi, RIMA, dan dua angka untuk hal yang sama cepat atau lambat berbeda pendapat.
// Dipanggil DI DALAM transaksi yang sudah memegang `kunciTahunRenaksi` (mulai/batal Perubahan
// memegang kunci yang sama), jadi status babak Perubahan yang dibaca di sini tidak bisa berubah
// di tengah jalan.

import type { PoolConnection } from 'mysql2/promise';
import { bulkInsert, type Penanya } from '@/lib/data/db';
import { PESAN_MURNI_BEKU, alasanTolakRincian, rapikanSumber, totalBerlaku, type RincianPagu } from '@/lib/renaksi/pagu';
import type { BarisRenaksi } from '@/lib/kinerja/asal-renaksi';

export class RaPaguError extends Error {
  constructor(pesan: string, public readonly kode: 'PAGU_TIDAK_SAH' | 'PAGU_MURNI_BEKU' | 'PAGU_PERUBAHAN_TERISI') {
    super(pesan); this.name = 'RaPaguError';
  }
}

type BarisRincian = { rencana_aksi_id: number; sumber: string; pagu: unknown; pagu_perubahan: unknown };
const angka = (v: unknown): number | null => (v == null ? null : Number(v));

/** Rincian pagu banyak baris sekaligus (urut sesuai isian). */
export async function muatRincianPagu(q: Penanya, ids: readonly number[]): Promise<Map<number, RincianPagu[]>> {
  const peta = new Map<number, RincianPagu[]>();
  if (!ids.length) return peta;
  const rows = await q`
    SELECT rencana_aksi_id, sumber, pagu, pagu_perubahan FROM rencana_aksi_pagu
    WHERE rencana_aksi_id IN (${[...ids]}) ORDER BY rencana_aksi_id, urutan, id
  ` as BarisRincian[];
  for (const r of rows) {
    const id = Number(r.rencana_aksi_id);
    peta.set(id, [...(peta.get(id) ?? []), { sumber: r.sumber, pagu: angka(r.pagu), pagu_perubahan: angka(r.pagu_perubahan) }]);
  }
  return peta;
}

/**
 * Baris Renaksi untuk pembanding Master E-Anggaran: entitas program/kegiatan/sub + satu baris
 * `level: 'sumber'` per sumber dana yang dipakai rincian pagu tahun itu (konsep §6a). Satu pembaca
 * untuk pembanding, Init, pagar tanda dari form, dan warisan tanda — beberapa pembaca = beberapa jawaban (L78).
 */
export async function barisRenaksiPembanding(q: Penanya, tahun: number): Promise<BarisRenaksi[]> {
  return await q`
    SELECT level, program, kegiatan, sub_kegiatan FROM rencana_aksi
    WHERE tahun = ${tahun} AND level IN ('program','kegiatan','sub-kegiatan')
    UNION ALL
    SELECT DISTINCT 'sumber', p.sumber, NULL, NULL FROM rencana_aksi_pagu AS p
    JOIN rencana_aksi AS r ON r.id = p.rencana_aksi_id
    WHERE r.tahun = ${tahun} AND p.sumber <> ''
  ` as BarisRenaksi[];
}

export interface StatusPaguPerubahan { aktif: boolean; dimulai_pada: string | null }

export async function statusPaguPerubahan(q: Penanya, tahun: number): Promise<StatusPaguPerubahan> {
  const [r] = await q`
    SELECT DATE_FORMAT(dimulai_pada, '%Y-%m-%d %H:%i') AS dimulai_pada FROM renaksi_pagu_perubahan WHERE tahun = ${tahun}
  ` as Array<{ dimulai_pada: string }>;
  return { aktif: !!r, dimulai_pada: r?.dimulai_pada ?? null };
}

/**
 * Ganti rincian pagu banyak baris (satu tahun) lalu tulis totalnya ke `anggaran_nominal`. Pemanggil
 * WAJIB sudah di dalam transaksi yang memegang `kunciTahunRenaksi(tahun)`. Satu baris gagal aturan →
 * seluruhnya batal (transaksi pemanggil).
 */
export async function tulisRincianPaguBorongan(
  tx: Penanya, conn: PoolConnection, tahun: number, isian: ReadonlyMap<number, readonly RincianPagu[]>,
): Promise<void> {
  const ids = [...isian.keys()];
  if (!ids.length) return;
  const { aktif } = await statusPaguPerubahan(tx, tahun);
  const semuaLama = await muatRincianPagu(tx, ids);
  const tulis: unknown[][] = [];
  const total = new Map<number, number | null>();
  for (const [id, rincian] of isian) {
    const baru = rincian.map(r => ({ ...r, sumber: rapikanSumber(r.sumber) }));
    const alasan = alasanTolakRincian(baru, semuaLama.get(id) ?? [], aktif);
    if (alasan) throw new RaPaguError(alasan, alasan === PESAN_MURNI_BEKU ? 'PAGU_MURNI_BEKU' : 'PAGU_TIDAK_SAH');
    const isi = baru.filter(r => r.pagu != null || r.pagu_perubahan != null);
    isi.forEach((r, i) => tulis.push([id, r.sumber, r.pagu, r.pagu_perubahan, i]));
    total.set(id, totalBerlaku(isi));
  }
  await tx`DELETE FROM rencana_aksi_pagu WHERE rencana_aksi_id IN (${ids})`;
  if (tulis.length) {
    await bulkInsert('rencana_aksi_pagu', ['rencana_aksi_id', 'sumber', 'pagu', 'pagu_perubahan', 'urutan'], tulis, conn);
  }
  await conn.query(
    `UPDATE rencana_aksi SET anggaran_nominal = CASE id ${ids.map(() => 'WHEN ? THEN ?').join(' ')} END WHERE id IN (?)`,
    [...ids.flatMap(id => [id, total.get(id) ?? null]), ids],
  );
}

export function tulisRincianPagu(
  tx: Penanya, conn: PoolConnection, rowId: number, tahun: number, rincian: readonly RincianPagu[],
): Promise<void> {
  return tulisRincianPaguBorongan(tx, conn, tahun, new Map([[rowId, rincian]]));
}
