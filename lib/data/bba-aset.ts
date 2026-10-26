// ═══ PRIMA — BBA Buku Aset (Tahap B) — Data Layer ═══════════════════
// Konsep: docs/CONCEPT-bba-buku-aset.md §5, §7.1, §15, §16.
// Satu baris = satu register KIB. Impor: pratinjau (tanpa menulis) → simpan (satu transaksi,
// dikunci per modul supaya dua impor tidak berselang-seling — L69-a lewat `blud_locks`).
import type mysql from 'mysql2/promise';
import { sql, queryMany, queryOne, withTransaction, bulkInsert, escapeLike, type TxSql } from '@/lib/data/db';
import { acquireBludLock } from '@/lib/data/locks';
import { toDateStr } from '@/lib/shared/waktu-wib';
import {
  kelompokkan, rencanakanImpor, namaDariKeterangan, namaTampil,
  type AsetRingan, type KelompokAset, type RencanaImpor,
} from '@/lib/bba/aset';
import type { AsetBaca, HasilBacaKib, NilaiKib } from '@/lib/bba/kib-baca';
import { GOLONGAN, kodeTanah, type Golongan, type Kondisi } from '@/lib/bba/kib';
import { KUNCI_PENGATURAN, bacaPengaturan, type PengaturanBba } from '@/lib/bba/pengaturan';
import { tentukanBarang } from '@/lib/data/buku-besar-aset';

export class AsetVersiError extends Error {
  constructor() { super('Aset ini baru saja diubah orang lain. Memuat versi terbarunya.'); this.name = 'AsetVersiError'; }
}
export class AsetTidakAdaError extends Error {
  constructor() { super('Aset tidak ditemukan.'); this.name = 'AsetTidakAdaError'; }
}

const KOLOM_RINGAN = sql`
  a.id, a.golongan, a.kode_barang, a.register, a.kunci_impor, a.kode_objek, a.tahun_perolehan,
  a.nama_resmi, a.nama, a.lokasi_id, a.harga, a.asal_usul, a.keterangan, a.kondisi, a.kondisi_sumber, a.status
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
  };
}

// ─── Daftar & ringkasan ──────────────────────────────────────────────────────

export type SaringanKondisi = 'B' | 'RR' | 'RB' | 'BELUM_DICEK';
export interface SaringanAset {
  golongan?: Golongan;
  q?: string;
  tahun?: number;
  kondisi?: SaringanKondisi;
  status?: 'AKTIF' | 'DIHAPUS';
}

export interface RingkasAset {
  jumlah: number;
  nilai: number;
  kondisi: { B: number; RR: number; RB: number; kosong: number };
  belumDicek: number;
}

export interface DaftarAset {
  perGolongan: Record<Golongan, { jumlah: number; nilai: number }>;
  ringkas: RingkasAset;
  kelompok: (KelompokAset & { lokasi_nama: string | null })[];
  terpotong: boolean;
}

const MAKS_KELOMPOK = 1500;

function whereAset(f: SaringanAset) {
  let w = sql`WHERE a.status = ${f.status ?? 'AKTIF'}`;
  if (f.golongan) w = sql`${w} AND a.golongan = ${f.golongan}`;
  if (f.tahun) w = sql`${w} AND a.tahun_perolehan = ${f.tahun}`;
  if (f.kondisi === 'BELUM_DICEK') w = sql`${w} AND a.golongan <> 'A' AND (a.kondisi_sumber IS NULL OR a.kondisi_sumber = 'IMPOR')`;
  else if (f.kondisi) w = sql`${w} AND a.kondisi = ${f.kondisi}`;
  if (f.q?.trim()) {
    const p = `%${escapeLike(f.q.trim())}%`;
    w = sql`${w} AND (a.nama LIKE ${p} OR a.nama_resmi LIKE ${p} OR a.kode_barang LIKE ${p} OR a.register LIKE ${p} OR a.keterangan LIKE ${p})`;
  }
  return w;
}

export async function daftarAset(f: SaringanAset): Promise<DaftarAset> {
  const [rows, agg, lokasi] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_RINGAN} FROM bba_aset a ${whereAset(f)} ORDER BY a.golongan, a.kode_barang, a.register, a.id`),
    queryMany<{ golongan: Golongan; n: number; nilai: number }>(sql`
      SELECT golongan, COUNT(*) AS n, COALESCE(SUM(harga), 0) AS nilai FROM bba_aset WHERE status = ${f.status ?? 'AKTIF'} GROUP BY golongan
    `),
    queryMany<{ id: number; nama: string }>(sql`SELECT id, nama FROM bba_lokasi`),
  ]);
  const aset = rows.map(petakanRingan);
  const namaLokasi = new Map(lokasi.map(l => [Number(l.id), String(l.nama)]));
  const perGolongan = Object.fromEntries(GOLONGAN.map(g => [g, { jumlah: 0, nilai: 0 }])) as DaftarAset['perGolongan'];
  for (const a of agg) perGolongan[a.golongan] = { jumlah: Number(a.n), nilai: Number(a.nilai) };
  const kelompok = kelompokkan(aset);
  const ringkas: RingkasAset = { jumlah: aset.length, nilai: 0, kondisi: { B: 0, RR: 0, RB: 0, kosong: 0 }, belumDicek: 0 };
  for (const k of kelompok) {
    ringkas.nilai += k.harga;
    ringkas.belumDicek += k.belumDicek;
    for (const x of ['B', 'RR', 'RB', 'kosong'] as const) ringkas.kondisi[x] += k.kondisi[x];
  }
  return {
    perGolongan, ringkas,
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

// ─── Kartu aset ──────────────────────────────────────────────────────────────

export interface RiwayatAset {
  id: number; jenis: string; sebelum: Record<string, unknown> | null; sesudah: Record<string, unknown> | null;
  catatan: string | null; oleh: string | null; pada: string;
}
export interface AsetTerkait { id: number; golongan: Golongan; nama: string; register: string | null; tahun: number | null }
export interface DetailAset {
  aset: AsetRingan & { version: number; barang_id: number | null; barang_nama: string | null; lokasi_nama: string | null; kondisi_tgl: string | null; kondisi_oleh: string | null };
  riwayat: RiwayatAset[];
  /** Gedung/jalan/KDP → tanah tempatnya berdiri (Nomor Kode Tanah, §4 temuan 4). */
  tanah: AsetTerkait | null;
  /** Tanah → bangunan & jaringan yang menunjuk tanah ini. */
  diAtasnya: AsetTerkait[];
}

const terkait = (r: Record<string, unknown>): AsetTerkait => ({
  id: Number(r.id), golongan: r.golongan as Golongan, nama: namaTampil({ nama: r.nama as string | null, nama_resmi: String(r.nama_resmi ?? '') }),
  register: (r.register as string | null) ?? null, tahun: r.tahun_perolehan == null ? null : Number(r.tahun_perolehan),
});

export async function detailAset(id: number): Promise<DetailAset | null> {
  const r = await queryOne<Record<string, unknown>>(sql`
    SELECT ${KOLOM_RINGAN}, a.kib, a.version, a.barang_id, g.nama AS barang_nama, l.nama AS lokasi_nama,
           DATE_FORMAT(a.kondisi_tgl, '%Y-%m-%d') AS kondisi_tgl, u.username AS kondisi_oleh
    FROM bba_aset a
    LEFT JOIN bba_barang g ON g.id = a.barang_id
    LEFT JOIN bba_lokasi l ON l.id = a.lokasi_id
    LEFT JOIN users u ON u.id = a.kondisi_oleh
    WHERE a.id = ${id} LIMIT 1
  `);
  if (!r) return null;
  const aset = {
    ...petakanRingan(r), version: Number(r.version ?? 0), barang_id: r.barang_id == null ? null : Number(r.barang_id),
    barang_nama: (r.barang_nama as string | null) ?? null, lokasi_nama: (r.lokasi_nama as string | null) ?? null,
    kondisi_tgl: r.kondisi_tgl ? toDateStr(r.kondisi_tgl) : null, kondisi_oleh: (r.kondisi_oleh as string | null) ?? null,
  };
  const kodeTanahIni = aset.golongan === 'A' && aset.kode_barang && aset.register ? kodeTanah(aset.kode_barang, aset.register) : null;
  const rujukanTanah = typeof aset.kib.nomor_kode_tanah === 'string' ? aset.kib.nomor_kode_tanah.trim() : '';
  const [riw, tanah, diAtasnya] = await Promise.all([
    queryMany<Record<string, unknown>>(sql`
      SELECT r.id, r.jenis, r.sebelum, r.sesudah, r.catatan, u.username AS oleh, DATE_FORMAT(r.dicatat_pada, '%Y-%m-%d %H:%i') AS dicatat
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
  ]);
  return {
    aset,
    riwayat: riw.map(x => ({
      id: Number(x.id), jenis: String(x.jenis), sebelum: bacaKib(x.sebelum) as Record<string, unknown>, sesudah: bacaKib(x.sesudah) as Record<string, unknown>,
      catatan: (x.catatan as string | null) ?? null, oleh: (x.oleh as string | null) ?? null, pada: String(x.dicatat ?? ''), // sudah teks: DATE_FORMAT di SQL
    })),
    tanah: tanah ? terkait(tanah) : null,
    diAtasnya: diAtasnya.map(terkait),
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

export async function bacaPengaturanBba(): Promise<PengaturanBba> {
  const r = await queryOne<{ value: string }>(sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_PENGATURAN} LIMIT 1`);
  return bacaPengaturan(r?.value);
}

export async function simpanPengaturanBba(p: PengaturanBba): Promise<void> {
  await sql`
    INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_PENGATURAN}, ${JSON.stringify(p)})
    ON DUPLICATE KEY UPDATE value = VALUES(value)
  `;
}
