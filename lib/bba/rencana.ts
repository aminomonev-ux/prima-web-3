// lib/bba/rencana.ts — aturan rencana di atas buku aset (docs/CONCEPT-bba-buku-aset.md §7.3, §7.4,
// §7.7, §8). MURNI: dipakai Zod, data layer, modal item, daftar Rencana, Excel, dan uji.
import type { BbaStatus } from './status';
import type { Dimiliki } from './kondisi';

export const JENIS_RENCANA = ['PENGGANTIAN', 'PENAMBAHAN', 'PENGADAAN_BARU', 'PEMELIHARAAN', 'REHAB'] as const;
export type JenisRencana = typeof JENIS_RENCANA[number];
export const LABEL_JENIS: Record<JenisRencana, string> = {
  PENGGANTIAN: 'Penggantian', PENAMBAHAN: 'Penambahan', PENGADAAN_BARU: 'Pengadaan baru',
  PEMELIHARAAN: 'Pemeliharaan / perbaikan', REHAB: 'Rehab / renovasi',
};
/** Kapan jenis itu masuk akal (§7.3) — keterangan di pemilih jenis. */
export const KAPAN_JENIS: Record<JenisRencana, string> = {
  PENGGANTIAN: 'barangnya ada tapi rusak berat / terlalu tua',
  PENAMBAHAN: 'ada dan baik, tapi jumlahnya kurang',
  PENGADAAN_BARU: 'RS belum pernah punya',
  PEMELIHARAAN: 'rusak ringan, masih layak diperbaiki',
  REHAB: 'gedung atau jaringan rusak',
};

export const ANGGARAN = ['BELUM', 'DIDANAI', 'TIDAK_DIDANAI'] as const;
export type Anggaran = typeof ANGGARAN[number];
export const LABEL_ANGGARAN: Record<Anggaran, string> = { BELUM: 'Belum ditandai', DIDANAI: 'Didanai', TIDAK_DIDANAI: 'Tidak didanai' };

/**
 * Petunjuk, bukan larangan (§8). Dihitung dari jenis rencana + ringkasan "dimiliki" barang itu.
 * Tanpa jenis atau tanpa barang: hanya petunjuk pemeriksaan kondisi (bila ada).
 */
export function petunjukRencana(jenis: JenisRencana | null, d: Dimiliki | null, satuan = 'unit'): string[] {
  const hasil: string[] = [];
  const punya = d?.jumlah ?? 0;
  if (jenis === 'PENAMBAHAN' && d && d.kondisi.rusak_berat > 0) hasil.push(`Ada ${d.kondisi.rusak_berat} ${satuan} rusak berat — mungkin cukup penggantian?`);
  if (jenis === 'PENGGANTIAN' && d && punya > 0 && d.kondisi.rusak_berat === 0) hasil.push('Tidak ada yang rusak berat — apa alasan penggantiannya?');
  if (jenis === 'PENGGANTIAN' && punya === 0) hasil.push('Belum ada register barang ini di Buku Aset — yang diganti yang mana?');
  if (jenis === 'PENGADAAN_BARU' && punya > 0) hasil.push(`RS sudah punya ${punya} ${satuan} barang ini.`);
  if (jenis === 'PEMELIHARAAN' && d && punya > 0 && d.kondisi.rusak_ringan === 0) hasil.push('Tidak ada yang rusak ringan — yang diperbaiki yang mana?');
  if (d && d.perluDicek > 0) hasil.push(`Kondisi ${d.perluDicek} register belum pernah dicek atau lewat jarak opname — minta Umum Aset memeriksa dulu.`);
  return hasil;
}

/**
 * Tanda anggaran (§7.4). Rencana yang sudah dipesan/diterima tidak bisa dicabut pendanaannya —
 * daftar Pengadaan & penerimaan berdiri di atas tanda itu.
 */
export function alasanTakBisaUbahAnggaran(status: BbaStatus, lama: Anggaran, baru: Anggaran): string | null {
  if (lama === baru || status === 'DIRENCANAKAN' || baru === 'DIDANAI') return null;
  return 'Rencana yang sudah diproses atau diterima pasti didanai — pendanaannya tidak bisa dicabut.';
}

/** Usulan DITOLAK itu catatan sejarah — tidak ikut ditandai anggaran maupun disarankan lagi. */
export const bolehDitandai = (r: { usulan_keputusan: string | null }) => r.usulan_keputusan !== 'DITOLAK';

/** Saran tahun T: rencana T-1 yang tidak didanai dan belum pernah disalin ke T (§14). */
export function saranTahunLalu<T extends { id: number; anggaran: Anggaran; usulan_keputusan: string | null }>(
  tahunLalu: readonly T[], sudahDisalin: ReadonlySet<number>,
): T[] {
  return tahunLalu.filter(r => r.anggaran === 'TIDAK_DIDANAI' && bolehDitandai(r) && !sudahDisalin.has(r.id));
}
