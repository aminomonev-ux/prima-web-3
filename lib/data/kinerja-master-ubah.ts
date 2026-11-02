// lib/data/kinerja-master-ubah.ts — penulis ganti nama/pindah induk/gabung entri Master,
// Rapikan Bintang, dan Lengkapi Master. Aturannya di lib/kinerja/master-ubah.ts (PURE).
//
// Nama Master DISALIN ke Rekening, RKO (semua versi — termasuk yang terkunci, keputusan
// pemilik 2026-11-02: hanya label, angka & kunci tetap), dan Realisasi. Mengubah Master
// tanpa ikut mengubah salinannya memecah satu program jadi dua kelompok di Cetak Rekap.

import { sql, bulkInsert, withTransaction, type TxSql, type Penanya } from './db';
import { acquireBludLock, bumpBludVersion } from './locks';
import { SUMBER_LIST, kunciVersiSsk, KinerjaMasterTidakAdaError, type MasterTipe, type SumberSSK } from './kinerja';
import { REALISASI_LOCK_ENTITY, realisasiLockKey } from '@/lib/kinerja/tutup-bulan';
import {
  rencanaUbahMaster, jalarkanKeBaris, kelompokkanNilai, rencanaRapikanBintang, rapikanBarisNama,
  rencanaLengkapiMaster, hitungKembar,
  type EntriMaster, type BarisNama, type NilaiBaris, type MasukanUbahMaster, type RencanaUbahMaster,
  type DampakData, type DampakVersiRko, type ContohRapikan, type EntriBaru, type Jalur,
} from '@/lib/kinerja/master-ubah';

export class KinerjaMasterTolakError extends Error {
  constructor(pesan: string) { super(pesan); this.name = 'KinerjaMasterTolakError'; }
}

/** Jalur tujuan sudah dihuni entri lain — menggabungkan harus dinyatakan, bukan efek samping. */
export class KinerjaMasterPerluGabungError extends Error {
  constructor(public tujuan: string) {
    super(`Sudah ada entri "${tujuan}" di induk yang sama — konfirmasi untuk menggabungkannya.`);
    this.name = 'KinerjaMasterPerluGabungError';
  }
}

const MASTER_LOCK_ENTITY = 'kinerja_master';

type BarisRekening = BarisNama & { sumber: SumberSSK; uraian: string; sumber_anggaran: string | null };
type BarisSsk = BarisNama & { sumber: SumberSSK; versi_tipe: string; versi_seq: number };
type BarisRealisasi = BarisNama & { sumber: SumberSSK };

interface Bahan { master: EntriMaster[]; rekening: BarisRekening[]; ssk: BarisSsk[]; realisasi: BarisRealisasi[] }
interface Tulisan<B> { baris: B; nilai: NilaiBaris }
interface TulisanData { rekening: Tulisan<BarisRekening>[]; ssk: Tulisan<BarisSsk>[]; realisasi: Tulisan<BarisRealisasi>[] }

/**
 * Seluruh tahun: Master + salinan nama. `kunci` = di dalam transaksi tulis — baris Master
 * dan Rekening dikunci (Rekening tak punya gembok sendiri); RKO & Realisasi sudah dijaga
 * gembok `kunciTahun`, dan SELECT biasa pertama sesudah gembok itu = foto yang segar (L84).
 */
async function muatBahan(q: Penanya, tahun: string, kunci: boolean): Promise<Bahan> {
  const master = (kunci
    ? await q`SELECT id, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref FROM kinerja_master WHERE tahun = ${tahun} ORDER BY id FOR UPDATE`
    : await q`SELECT id, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref FROM kinerja_master WHERE tahun = ${tahun} ORDER BY id`
  ) as EntriMaster[];
  const rekening = (kunci
    ? await q`SELECT id, sumber, program, kegiatan, subkegiatan, uraian_ssk, uraian, sumber_anggaran FROM kinerja_rekening WHERE tahun = ${tahun} ORDER BY id FOR UPDATE`
    : await q`SELECT id, sumber, program, kegiatan, subkegiatan, uraian_ssk, uraian, sumber_anggaran FROM kinerja_rekening WHERE tahun = ${tahun} ORDER BY id`
  ) as BarisRekening[];
  const ssk = await q`
    SELECT id, sumber, versi_tipe, versi_seq, program, kegiatan, subkegiatan, uraian_ssk
    FROM kinerja_ssk WHERE tahun = ${tahun} ORDER BY id
  ` as BarisSsk[];
  const realisasi = await q`
    SELECT id, sumber, program, kegiatan, subkegiatan, uraian_ssk
    FROM kinerja_realisasi WHERE tahun = ${tahun} ORDER BY id
  ` as BarisRealisasi[];
  return {
    master: master.map(m => ({ ...m, id: Number(m.id) })),
    rekening, ssk: ssk.map(s => ({ ...s, versi_seq: Number(s.versi_seq) })), realisasi,
  };
}

/**
 * Gembok Master tahun ini, lalu gembok versi RKO & Realisasi SEMUA sumber — dengan urutan
 * yang sama dengan Simpan RKO (`kunciVersiSsk` dulu) dan Simpan/Tutup Realisasi. Sumbernya
 * belum diketahui sebelum data dibaca, dan membacanya dulu lalu mengunci = menjaga jawaban
 * dari foto lama (L84). Tab yang sedang menyimpan menunggu; sesudah itu angka kuncinya naik.
 */
async function kunciTahun(tx: TxSql, tahun: string): Promise<void> {
  await acquireBludLock(tx, MASTER_LOCK_ENTITY, tahun);
  for (const s of SUMBER_LIST) await kunciVersiSsk(tx, tahun, s);
  for (const s of SUMBER_LIST) await acquireBludLock(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, s));
}

async function tulisMaster(tx: TxSql, tulis: readonly EntriMaster[], hapus: readonly number[]): Promise<void> {
  const daftar = tulis.map(e => ({ id: e.id, nilai: [e.nama, e.program_ref, e.kegiatan_ref, e.subkegiatan_ref] as const }));
  for (const k of kelompokkanNilai(daftar)) {
    const [nama, p, kg, s] = k.nilai;
    await tx`UPDATE kinerja_master SET nama = ${nama}, program_ref = ${p}, kegiatan_ref = ${kg}, subkegiatan_ref = ${s} WHERE id IN (${k.ids})`;
  }
  if (hapus.length > 0) await tx`DELETE FROM kinerja_master WHERE id IN (${[...hapus]})`;
}

/**
 * Satu UPDATE per kelompok nilai baru. `updated_at = updated_at`: label yang dirapikan
 * bukan suntingan isi — stempel "terakhir diubah" milik orang yang mengetik angkanya tetap.
 * Nama tabel tiga cabang eksplisit, bukan dirangkai ke SQL.
 */
async function tulisNama(tx: TxSql, tabel: 'rekening' | 'ssk' | 'realisasi', daftar: readonly Tulisan<BarisNama>[]): Promise<void> {
  for (const k of kelompokkanNilai(daftar.map(t => ({ id: t.baris.id, nilai: t.nilai })))) {
    const { program, kegiatan, subkegiatan, uraian_ssk } = k.nilai;
    if (tabel === 'rekening') {
      await tx`UPDATE kinerja_rekening SET program = ${program}, kegiatan = ${kegiatan}, subkegiatan = ${subkegiatan}, uraian_ssk = ${uraian_ssk}, updated_at = updated_at WHERE id IN (${k.ids})`;
    } else if (tabel === 'ssk') {
      await tx`UPDATE kinerja_ssk SET program = ${program}, kegiatan = ${kegiatan}, subkegiatan = ${subkegiatan}, uraian_ssk = ${uraian_ssk ?? ''}, updated_at = updated_at WHERE id IN (${k.ids})`;
    } else {
      await tx`UPDATE kinerja_realisasi SET program = ${program}, kegiatan = ${kegiatan}, subkegiatan = ${subkegiatan}, uraian_ssk = ${uraian_ssk}, updated_at = updated_at WHERE id IN (${k.ids})`;
    }
  }
}

/**
 * Angka kunci RKO (per versi) & Realisasi (per sumber) dinaikkan: tab yang dibuka sebelum
 * perubahan ini kena 409 lalu menggabungkan ketikannya di atas isi terbaru — bukan menulis
 * balik nama lama lewat Simpan hapus-tulis-ulang. Rekening tak punya gembok; tab Rekening
 * yang terbuka tetap bisa menimpa (dicatat di konsep §5).
 */
async function naikkanGembok(tx: TxSql, tahun: string, data: TulisanData, userId: number): Promise<void> {
  const versi = [...new Set(data.ssk.map(t => `${t.baris.sumber}:${t.baris.versi_tipe}:${t.baris.versi_seq}`))].sort();
  for (const v of versi) await bumpBludVersion(tx, 'kinerja_ssk', `${tahun}:${v}`, userId);
  const sumber = [...new Set(data.realisasi.map(t => t.baris.sumber))].sort();
  for (const s of sumber) await bumpBludVersion(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, s), userId);
}

async function tulisData(tx: TxSql, tahun: string, data: TulisanData, userId: number): Promise<void> {
  await tulisNama(tx, 'rekening', data.rekening);
  await tulisNama(tx, 'ssk', data.ssk);
  await tulisNama(tx, 'realisasi', data.realisasi);
  await naikkanGembok(tx, tahun, data, userId);
}

function ringkasData(data: TulisanData): DampakData {
  const perVersi = new Map<string, DampakVersiRko>();
  for (const t of data.ssk) {
    const k = `${t.baris.sumber}:${t.baris.versi_tipe}:${t.baris.versi_seq}`;
    const v = perVersi.get(k) ?? { sumber: t.baris.sumber, versi_tipe: t.baris.versi_tipe, versi_seq: t.baris.versi_seq, baris: 0 };
    v.baris += 1;
    perVersi.set(k, v);
  }
  return { rekening: data.rekening.length, rko: [...perVersi.values()], realisasi: data.realisasi.length };
}

// ─── Ganti nama / pindah induk / gabung satu entri ──────────────────────────

export interface HasilUbahMaster {
  tipe: MasterTipe;
  nama_lama: string;
  nama_baru: string;
  induk_lama: Jalur;
  induk_baru: Jalur;
  berubah: boolean;
  gabung_ke: string | null;
  anak: number;
  dihapus: number;
  data: DampakData;
}

function jalarkan(b: Bahan, r: RencanaUbahMaster): { data: TulisanData; sumberAnggaran: number[] } {
  if (r.diri.tipe === 'sumber_anggaran') {
    const ids = b.rekening.filter(x => (x.sumber_anggaran ?? '').trim() === r.jalurLama[0]).map(x => x.id);
    return { data: { rekening: [], ssk: [], realisasi: [] }, sumberAnggaran: r.berubah ? ids : [] };
  }
  return {
    data: {
      rekening: jalarkanKeBaris(b.rekening, r),
      ssk: jalarkanKeBaris(b.ssk, r),
      realisasi: jalarkanKeBaris(b.realisasi, r),
    },
    sumberAnggaran: [],
  };
}

function hasilUbah(r: RencanaUbahMaster, j: ReturnType<typeof jalarkan>): HasilUbahMaster {
  const data = ringkasData(j.data);
  return {
    tipe: r.diri.tipe, nama_lama: r.diri.nama, nama_baru: r.baru.nama,
    induk_lama: r.jalurLama.slice(0, -1), induk_baru: r.jalurBaru.slice(0, -1),
    berubah: r.berubah, gabung_ke: r.gabungKe?.nama ?? null,
    anak: r.anak, dihapus: r.hapus.length,
    data: { ...data, rekening: data.rekening + j.sumberAnggaran.length },
  };
}

/**
 * `dry` = pratinjau untuk dialog (tanpa gembok, tanpa tulis). Penggabungan harus
 * dinyatakan (`gabung`). Terbuka bagi semua pemegang akses E-Anggaran (keputusan
 * pemilik 2026-11-02): gabung tidak menghilangkan data — anak & salinan namanya
 * pindah ke entri tujuan, dan jejaknya di audit. Hapus satu entri tetap khusus admin.
 */
export async function ubahMasterMenjalar(
  id: number,
  masukan: MasukanUbahMaster,
  opsi: { userId: number; dry: boolean; gabung: boolean },
): Promise<HasilUbahMaster> {
  // Tahun entri tidak pernah berubah, jadi aman dibaca di luar transaksi — gemboknya
  // butuh tahun ini sebagai perintah PERTAMA transaksi.
  const [asal] = await sql`SELECT tahun FROM kinerja_master WHERE id = ${id}` as { tahun: string }[];
  if (!asal) throw new KinerjaMasterTidakAdaError();
  const tahun = String(asal.tahun);

  const rencanakan = (b: Bahan) => {
    const r = rencanaUbahMaster(b.master, id, masukan);
    if ('tolak' in r) throw new KinerjaMasterTolakError(r.tolak);
    return { r, j: jalarkan(b, r) };
  };

  if (opsi.dry) {
    const { r, j } = rencanakan(await muatBahan(sql, tahun, false));
    return hasilUbah(r, j);
  }

  return await withTransaction(async ({ tx }) => {
    await kunciTahun(tx, tahun);
    const { r, j } = rencanakan(await muatBahan(tx, tahun, true));
    if (r.gabungKe && !opsi.gabung) throw new KinerjaMasterPerluGabungError(r.gabungKe.nama);
    if (r.berubah) {
      await tulisMaster(tx, r.tulis, r.hapus);
      await tulisData(tx, tahun, j.data, opsi.userId);
      if (j.sumberAnggaran.length > 0) {
        await tx`UPDATE kinerja_rekening SET sumber_anggaran = ${r.baru.nama}, updated_at = updated_at WHERE id IN (${j.sumberAnggaran})`;
      }
    }
    return hasilUbah(r, j);
  });
}

// ─── Rapikan Bintang ─────────────────────────────────────────────────────────

export interface HasilRapikan {
  master_tulis: number;
  master_hapus: number;
  induk_saja: number;
  contoh: ContohRapikan[];
  data: DampakData;
  /** Rekening yang sesudah dirapikan bernama sama di Uraian SSK yang sama — tidak dihapus, disebut. */
  kembar_rekening: number;
}

function rencanakanRapikan(b: Bahan) {
  const master = rencanaRapikanBintang(b.master);
  const data: TulisanData = {
    rekening: rapikanBarisNama(b.rekening),
    ssk: rapikanBarisNama(b.ssk),
    realisasi: rapikanBarisNama(b.realisasi),
  };
  const baruRek = new Map(data.rekening.map(t => [t.baris.id, t.nilai]));
  const kunciRek = (x: BarisRekening, n?: NilaiBaris) => ({ grup: x.sumber, kunci: `${(n ?? x).uraian_ssk ?? ''}\u0001${x.uraian}` });
  const kembar = hitungKembar(b.rekening.map(x => kunciRek(x, baruRek.get(x.id)))) - hitungKembar(b.rekening.map(x => kunciRek(x)));
  return { master, data, kembar: Math.max(kembar, 0) };
}

function hasilRapikan(x: ReturnType<typeof rencanakanRapikan>): HasilRapikan {
  return {
    master_tulis: x.master.tulis.length, master_hapus: x.master.hapus.length, induk_saja: x.master.indukSaja,
    contoh: x.master.contoh, data: ringkasData(x.data), kembar_rekening: x.kembar,
  };
}

export async function rapikanBintangMaster(tahun: string, opsi: { userId: number; dry: boolean }): Promise<HasilRapikan> {
  if (opsi.dry) return hasilRapikan(rencanakanRapikan(await muatBahan(sql, tahun, false)));
  return await withTransaction(async ({ tx }) => {
    await kunciTahun(tx, tahun);
    const x = rencanakanRapikan(await muatBahan(tx, tahun, true));
    await tulisMaster(tx, x.master.tulis, x.master.hapus);
    await tulisData(tx, tahun, x.data, opsi.userId);
    return hasilRapikan(x);
  });
}

// ─── Lengkapi Master dari Rekening & RKO ─────────────────────────────────────

export interface HasilLengkapi { baru: EntriBaru[]; berbintang: number }

async function muatRantai(q: Penanya, tahun: string) {
  return await q`
    SELECT program, kegiatan, subkegiatan, uraian_ssk FROM kinerja_rekening WHERE tahun = ${tahun}
    UNION
    SELECT program, kegiatan, subkegiatan, uraian_ssk FROM kinerja_ssk WHERE tahun = ${tahun}
  ` as Omit<BarisNama, 'id'>[];
}

/** Hanya MENAMBAH entri Master — Rekening, RKO, Realisasi tidak disentuh. */
export async function lengkapiMasterDariData(tahun: string, opsi: { userId: number; dry: boolean }): Promise<HasilLengkapi> {
  if (opsi.dry) {
    const master = await sql`SELECT id, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref FROM kinerja_master WHERE tahun = ${tahun}` as EntriMaster[];
    return rencanaLengkapiMaster(master, await muatRantai(sql, tahun));
  }
  return await withTransaction(async ({ tx, conn }) => {
    // Dua "Lengkapi" berbarengan sama-sama melihat entri belum ada → dua kali dibuat (L69-a).
    await acquireBludLock(tx, MASTER_LOCK_ENTITY, tahun);
    const master = await tx`SELECT id, tipe, nama, program_ref, kegiatan_ref, subkegiatan_ref FROM kinerja_master WHERE tahun = ${tahun}` as EntriMaster[];
    const rencana = rencanaLengkapiMaster(master, await muatRantai(tx, tahun));
    if (rencana.baru.length === 0) return rencana;
    const urutAwal = await tx`SELECT tipe, COALESCE(MAX(urut), 0) AS m FROM kinerja_master WHERE tahun = ${tahun} GROUP BY tipe` as { tipe: string; m: unknown }[];
    const urut = new Map(urutAwal.map(u => [u.tipe, Number(u.m)]));
    const rows = rencana.baru.map(e => {
      const n = (urut.get(e.tipe) ?? 0) + 1;
      urut.set(e.tipe, n);
      return [tahun, e.tipe, null, e.nama, e.program_ref, e.kegiatan_ref, e.subkegiatan_ref, n, opsi.userId];
    });
    await bulkInsert('kinerja_master',
      ['tahun', 'tipe', 'sumber', 'nama', 'program_ref', 'kegiatan_ref', 'subkegiatan_ref', 'urut', 'created_by'],
      rows, conn);
    return rencana;
  });
}
