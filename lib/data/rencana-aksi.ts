// ═══ PRIMA — Rencana Aksi Data Layer ═══════════════════════════════════════
// CRUD untuk tabel `rencana_aksi`. Single-table flat (lihat migration 032).
// Optimistic locking via kolom `version` (migration 034): cegah lost-update concurrent edit.

import { sql, queryMany, queryOne, withTransaction, type Penanya, type TxSql } from '@/lib/data/db';
import { bulatkanDesimal } from '@/lib/shared/desimal';
import { acquireBludLock } from '@/lib/data/locks';
import { rencanaGantiNama, type GantiNama } from '@/lib/renaksi/ganti-nama';
import type { RaLevel, UpsertRencanaAksiInput } from './rencana-aksi-schemas';
import { INDUK_LEVEL, namaEntitas, namaIndukLangsung, type BarisRantai } from '@/lib/renaksi/rantai';

/** Tautan indikator induk yang tidak sah — 400, bukan 500: yang salah pilihannya, bukan servernya. */
export class RaIndukIndikatorError extends Error {
  constructor(pesan: string) { super(pesan); this.name = 'RaIndukIndikatorError'; }
}

/** Baris yang menjadikan indikator yang akan dihapus sebagai induknya (dialog "Lepas tautan & hapus"). */
export type PenunjukTautan = { level: RaLevel; nama: string; indikator: string };

/** Penunjuk yang disebut di dialog — sisanya cukup jumlahnya. */
export const BATAS_PENUNJUK = 10;

/** Baris masih dipakai sebagai indikator induk baris lain — menghapusnya meninggalkan tautan hantu. */
export class RaTautanAnakError extends Error {
  constructor(public readonly jumlah: number, public readonly penunjuk: PenunjukTautan[] = []) {
    super(`Tidak bisa dihapus — masih ada ${jumlah} baris yang menjadikan indikator ini induknya. Lepas tautannya lewat "Lepas tautan & hapus", atau pilih ulang indikator induk baris itu di Data Entry.`);
    this.name = 'RaTautanAnakError';
  }
}

/**
 * Tautan indikator induk harus benar-benar INDUK baris ini: satu tahun, satu tingkat di atas,
 * dan nama entitasnya cocok dengan kolom induk baris. Tanpa cek ini id sembarang dari klien
 * lolos begitu saja — soft-FK tidak menolak apa pun (L68).
 */
async function assertIndukIndikator(tx: TxSql, data: UpsertRencanaAksiInput): Promise<void> {
  if (data.induk_indikator_id == null) return;
  const levelInduk = INDUK_LEVEL[data.level];
  if (!levelInduk) throw new RaIndukIndikatorError('Tujuan tidak punya indikator induk.');
  // FOR SHARE di transaksi tulis yang sama (§6 tautan-lanjutan): hapus induk yang berbarengan
  // menunggu Simpan ini selesai, atau Simpan ini menunggu hapusnya lalu mendapati induk sudah tiada.
  const [induk] = await tx`
    SELECT id, level, tahun, program, kegiatan, sub_kegiatan, tujuan, sasaran, indikator, induk_indikator_id
    FROM rencana_aksi WHERE id = ${data.induk_indikator_id}
    FOR SHARE
  ` as Array<BarisRantai & { tahun: number }>;
  if (!induk) {
    throw new RaIndukIndikatorError('Indikator induk yang dipilih tidak ada — mungkin baru dihapus. Muat ulang daftar.');
  }
  if (Number(induk.tahun) !== Number(data.tahun)) {
    throw new RaIndukIndikatorError('Indikator induk berasal dari tahun lain.');
  }
  if (induk.level !== levelInduk) {
    throw new RaIndukIndikatorError(`Indikator induk harus dari tingkat ${levelInduk}.`);
  }
  const anak: BarisRantai = {
    id: 0, level: data.level, program: data.program,
    kegiatan: data.kegiatan ?? null, sub_kegiatan: data.sub_kegiatan ?? null,
    tujuan: data.tujuan ?? null, sasaran: data.sasaran ?? null,
    indikator: data.indikator, induk_indikator_id: null,
  };
  const namaDiharapkan = (namaIndukLangsung(anak) ?? '').trim();
  if (namaDiharapkan !== namaEntitas(induk).trim()
      || (induk.level === 'kegiatan' && (induk.program ?? '').trim() !== data.program.trim())) {
    throw new RaIndukIndikatorError('Indikator induk yang dipilih bukan milik induk baris ini.');
  }
}

/** Nama induk langsung (dan program untuk sub-kegiatan) berbeda antara baris tersimpan & kiriman. */
function indukBarisBerubah(
  lama: Pick<RaRow, 'level' | 'program' | 'kegiatan' | 'tujuan' | 'sasaran'>,
  data: UpsertRencanaAksiInput,
): boolean {
  const t = (s: string | null | undefined) => (s ?? '').trim();
  switch (lama.level) {
    case 'sasaran': return t(lama.tujuan) !== t(data.tujuan);
    case 'program': return t(lama.sasaran) !== t(data.sasaran);
    case 'kegiatan': return t(lama.program) !== t(data.program);
    case 'sub-kegiatan': return t(lama.kegiatan) !== t(data.kegiatan) || t(lama.program) !== t(data.program);
    default: return false;
  }
}

export class RaVersionConflictError extends Error {
  constructor() {
    super('Data sudah diubah pengguna lain. Memuat versi terbaru.');
    this.name = 'RaVersionConflictError';
  }
}

// R5: kuartal baris ber-data bulanan = turunan — edit langsung akan ditimpa
// saat simpan bulanan berikutnya, jadi ditolak.
export class RaMonthlyManagedError extends Error {
  constructor() {
    super('Indikator ini memakai data bulanan — angka kuartal dihitung otomatis. Ubah lewat target/realisasi bulanan.');
    this.name = 'RaMonthlyManagedError';
  }
}

// Kunci Periode: realisasi bulan terkunci tidak boleh berubah.
export class RaPeriodLockedError extends Error {
  constructor(bulan: number) {
    super(`Periode terkunci sampai bulan ke-${bulan} — realisasi periode terkunci tidak bisa diubah. Minta Admin membuka kunci bila perlu koreksi.`);
    this.name = 'RaPeriodLockedError';
  }
}

export class RaTahunTujuanBerisiError extends Error {
  constructor(tahun: number) {
    super(`Tahun ${tahun} sudah berisi data Rencana Aksi — duplikasi hanya ke tahun kosong.`);
    this.name = 'RaTahunTujuanBerisiError';
  }
}

// T7: hierarki Renaksi disambung lewat TEKS NAMA (kolom program/kegiatan/sub_kegiatan),
// bukan foreign key — jadi MySQL tidak punya cara menolak hapus induk. Penjagaannya
// harus di sini, atau anak-anaknya menunjuk induk yang sudah tidak ada.
export class RaPunyaAnakError extends Error {
  constructor(labelAnak: string, jumlah: number) {
    super(`Tidak bisa dihapus — ini baris terakhir yang memikul nama tersebut, dan masih ada ${jumlah} ${labelAnak} di bawahnya. Hapus dari tingkat terbawah lebih dulu.`);
    this.name = 'RaPunyaAnakError';
  }
}

/** R3: null = belum diisi, 0 = nol nyata (penting utk jenis Progres Negatif). */
export type MonthVal = number | null;

export interface RaRow {
  id: number;
  tahun: number;
  level: RaLevel;
  /** Kode nomenklatur — jangkar identitas yang tidak ikut berubah saat nama diganti. */
  kode: string | null;
  sasaran: string | null;
  tujuan: string | null;
  outcome_program: string | null;
  outcome_kegiatan: string | null;
  outcome_sub_kegiatan: string | null;
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  indikator: string;
  /** Soft-FK `rencana_aksi.id` — baris indikator induk yang dijabarkan. NULL = belum diisi (data lama & impor). */
  induk_indikator_id: number | null;
  jenis: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';
  satuan: string;
  target_rpjmd: number;
  target_tahunan: number;
  /** null = belum diisi, 0 = nol nyata (migration-renaksi-realisasi-null). */
  q1_target: number;  q1_realisasi: number | null;
  q2_target: number;  q2_realisasi: number | null;
  q3_target: number;  q3_realisasi: number | null;
  q4_target: number;  q4_realisasi: number | null;
  anggaran_nominal: number | null;
  bulan_target: MonthVal[] | null;
  bulan_realisasi: MonthVal[] | null;
  version: number;
}

type RaJenis = 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';

/**
 * Derive q1-q4 dari 12 target bulanan per `jenis` (Opsi A).
 *   Akumulatif            → TWn = SUM 3 bulan triwulan itu
 *   Progres Pos/Neg/Ulang → TWn = bulan TERAKHIR terisi (non-null) dalam triwulan itu (snapshot)
 *   Triwulan yang ketiga bulannya belum diisi → null (realisasi: "belum diisi"; target: `?? 0`).
 * Sync dengan client helper di app/(dashboard)/rencana-aksi/_lib/types.ts.
 */
function deriveQuartersFromMonthly(months: MonthVal[], jenis: RaJenis): [MonthVal, MonthVal, MonthVal, MonthVal] {
  const seg = (start: number): MonthVal => {
    const part = months.slice(start, start + 3);
    if (part.every(v => v == null)) return null;
    // Sama dengan helper klien: pecahan biner (7,5 + 2,68 + 3,25 = 13,430000000000001)
    // dibulatkan di tempat penjumlahannya. Kolom q*_target DECIMAL(14,2) memang
    // akan membulatkannya juga, tapi diam-diam — dan angka itu keburu dipakai
    // pembanding sebelum sampai ke MySQL.
    if (jenis === 'Akumulatif') return bulatkanDesimal(part.reduce((a: number, b) => a + (b ?? 0), 0));
    // R3: "terisi" = non-null — 0 nyata ikut terekam (capaian terbaik Progres Negatif)
    for (let i = part.length - 1; i >= 0; i--) { const v = part[i]; if (v != null) return v; }
    return null;
  };
  return [seg(0), seg(3), seg(6), seg(9)];
}

/** Target triwulan tetap NOT NULL — bulan target yang kosong dihitung 0, seperti dulu. */
function deriveTargetQuarters(months: MonthVal[], jenis: RaJenis): [number, number, number, number] {
  const [a, b, c, d] = deriveQuartersFromMonthly(months, jenis);
  return [a ?? 0, b ?? 0, c ?? 0, d ?? 0];
}

// R3: format simpan v2 `{v:2,m:[...]}` — null = belum diisi, 0 = nol nyata.
// Array polos = data legacy (konvensi lama 0 = belum diisi) → 0 dinormalisasi null.
function parseMonths(v: unknown): MonthVal[] | null {
  if (v == null) return null;
  let raw: unknown = v;
  if (typeof v === 'string') { try { raw = JSON.parse(v); } catch { return null; } }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { v?: unknown }).v === 2) {
    const m = (raw as { m?: unknown }).m;
    if (!Array.isArray(m) || m.length !== 12) return null;
    return m.map((x) => (x == null ? null : Number(x) || 0));
  }
  if (Array.isArray(raw) && raw.length === 12) {
    return raw.map((n) => { const x = Number(n) || 0; return x > 0 ? x : null; });
  }
  return null;
}

const monthsToJson = (m: MonthVal[]): string => JSON.stringify({ v: 2, m });

// R6: kolom DECIMAL (migration 043) — mysql2 kembalikan string → normalisasi Number.
function normNumerics(r: RaRow): void {
  r.target_rpjmd = Number(r.target_rpjmd); r.target_tahunan = Number(r.target_tahunan);
  // Number(null) = 0 — realisasi WAJIB lolos sebagai null, itu satu-satunya
  // pembeda "belum diisi" dari nol sungguhan.
  const angkaAtauKosong = (v: number | null): number | null => (v == null ? null : Number(v));
  r.q1_target = Number(r.q1_target); r.q1_realisasi = angkaAtauKosong(r.q1_realisasi);
  r.q2_target = Number(r.q2_target); r.q2_realisasi = angkaAtauKosong(r.q2_realisasi);
  r.q3_target = Number(r.q3_target); r.q3_realisasi = angkaAtauKosong(r.q3_realisasi);
  r.q4_target = Number(r.q4_target); r.q4_realisasi = angkaAtauKosong(r.q4_realisasi);
  r.anggaran_nominal = r.anggaran_nominal == null ? null : Number(r.anggaran_nominal);
}

export async function listRencanaAksi(tahun: number, level: RaLevel): Promise<RaRow[]> {
  const rows = await queryMany<RaRow>(sql`
    SELECT id, tahun, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator,
           jenis, satuan, target_rpjmd, target_tahunan,
           q1_target, q1_realisasi, q2_target, q2_realisasi,
           q3_target, q3_realisasi, q4_target, q4_realisasi, anggaran_nominal,
           bulan_target, bulan_realisasi, induk_indikator_id, version, kode
    FROM rencana_aksi
    WHERE tahun = ${tahun} AND level = ${level}
    ORDER BY program, kegiatan, sub_kegiatan, indikator
  `);
  for (const r of rows) {
    r.bulan_target = parseMonths(r.bulan_target);
    r.bulan_realisasi = parseMonths(r.bulan_realisasi);
    normNumerics(r);
  }
  return rows;
}

export async function getRencanaAksiById(id: number): Promise<RaRow | null> {
  const row = await queryOne<RaRow>(sql`
    SELECT id, tahun, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator,
           jenis, satuan, target_rpjmd, target_tahunan,
           q1_target, q1_realisasi, q2_target, q2_realisasi,
           q3_target, q3_realisasi, q4_target, q4_realisasi, anggaran_nominal,
           bulan_target, bulan_realisasi, induk_indikator_id, version, kode
    FROM rencana_aksi WHERE id = ${id}
  `);
  if (row) {
    row.bulan_target = parseMonths(row.bulan_target);
    row.bulan_realisasi = parseMonths(row.bulan_realisasi);
    normNumerics(row);
  }
  return row;
}

/**
 * T16 — ganti nama entitas Renaksi menjalar ke baris senama dan seluruh turunannya.
 *
 * Dua jenis baris yang harus ikut, dan yang pertama paling mudah terlewat:
 *   1. baris SENAMA di level yang sama (satu entitas = banyak baris indikator), dan
 *   2. baris TURUNAN yang memikul nama itu di kolom penyambungnya.
 *
 * `version` ikut naik di setiap baris yang tersentuh: tab yang sudah terbuka di baris
 * turunan harus kena 409 dan memuat nama baru, bukan menulis balik nama lama lewat
 * simpan berikutnya. `updated_at` sengaja TIDAK bergeser — merapikan label bukan
 * suntingan isi, jadi stempel "terakhir diubah" milik orang yang mengetik angkanya tetap.
 *
 * Nama kolom di-dispatch statis per level, tidak pernah dirangkai jadi string SQL.
 * `<=>` untuk kolom induk yang boleh NULL (L90: `= NULL` tak pernah benar); `program`
 * NOT NULL, jadi `=` cukup.
 */
export async function jalarkanGantiNama(tx: TxSql, tahun: number, g: GantiNama): Promise<void> {
  if (g.level === 'tujuan') {
    await tx`
      UPDATE rencana_aksi SET program = ${g.ke}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'tujuan' AND program = ${g.dari}
    `;
    await tx`
      UPDATE rencana_aksi SET tujuan = ${g.ke}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'sasaran' AND tujuan = ${g.dari}
    `;
    return;
  }

  if (g.level === 'sasaran') {
    await tx`
      UPDATE rencana_aksi SET program = ${g.ke}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'sasaran' AND program = ${g.dari} AND tujuan <=> ${g.induk}
    `;
    // Baris program hanya menyimpan nama sasaran — tidak ada tujuan yang bisa dipakai
    // mempersempit, jadi sasaran senama di tujuan lain ikut terbawa.
    await tx`
      UPDATE rencana_aksi SET sasaran = ${g.ke}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'program' AND sasaran = ${g.dari}
    `;
    return;
  }

  if (g.level === 'program') {
    await tx`
      UPDATE rencana_aksi SET program = ${g.ke}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'program' AND program = ${g.dari} AND sasaran <=> ${g.induk}
    `;
    await tx`
      UPDATE rencana_aksi SET program = ${g.ke}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'kegiatan' AND program = ${g.dari}
    `;
    await tx`
      UPDATE rencana_aksi SET program = ${g.ke}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'sub-kegiatan' AND program = ${g.dari}
    `;
    return;
  }

  if (g.level === 'kegiatan') {
    // Tahap H: pindah program ikut dijalarkan — tanpa `indukBaru` programnya tetap.
    const program = g.indukBaru ?? g.induk;
    // Saudara yang ikut pindah program: tautan indikator induknya menunjuk indikator program
    // LAMA, jadi dilepas (NULL) — menebak indikator program baru per baris itu menebak.
    const lepasTautan = g.indukBaru != null ? 1 : 0;
    await tx`
      UPDATE rencana_aksi SET kegiatan = ${g.ke}, program = ${program},
        induk_indikator_id = IF(${lepasTautan} = 1, NULL, induk_indikator_id),
        version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'kegiatan' AND kegiatan = ${g.dari} AND program = ${g.induk}
    `;
    // Kegiatan senama di program lain TIDAK ikut — sub-kegiatan menyimpan program induknya.
    await tx`
      UPDATE rencana_aksi SET kegiatan = ${g.ke}, program = ${program}, version = version + 1, updated_at = updated_at
      WHERE tahun = ${tahun} AND level = 'sub-kegiatan' AND kegiatan = ${g.dari} AND program = ${g.induk}
    `;
    return;
  }

  // Sub-kegiatan daun: yang ikut hanya baris senamanya sendiri (satu entitas = banyak
  // indikator), dan lingkupnya butuh program + kegiatan — nama kegiatan saja tidak unik.
  // Pindah kegiatan (atau program kegiatannya): tautan ke indikator kegiatan lama dilepas.
  const lepasTautanSub = g.indukBaru != null || g.indukProgramBaru != null ? 1 : 0;
  await tx`
    UPDATE rencana_aksi SET sub_kegiatan = ${g.ke},
      kegiatan = ${g.indukBaru ?? g.induk}, program = ${g.indukProgramBaru ?? g.indukProgram},
      induk_indikator_id = IF(${lepasTautanSub} = 1, NULL, induk_indikator_id),
      version = version + 1, updated_at = updated_at
    WHERE tahun = ${tahun} AND level = 'sub-kegiatan' AND sub_kegiatan = ${g.dari}
      AND kegiatan <=> ${g.induk} AND program = ${g.indukProgram}
  `;
}

/**
 * Jejak ganti nama untuk modul yang MENYALIN nama Renaksi (E-Anggaran, PK, IKI) —
 * docs/CONCEPT-renaksi-terhubung.md §4. Entitas Renaksi tidak punya id, jadi tanpa
 * catatan ini ganti nama hanya terbaca "satu hilang + satu baru". Ditulis di transaksi
 * yang sama dengan penjalarannya: ganti nama yang batal tidak boleh meninggalkan catatan.
 * Tanpa status "sudah diterapkan" — pembacanya menilai sendiri apakah masih berlaku.
 */
export async function catatGantiNama(tx: TxSql, tahun: number, g: GantiNama, userId: number): Promise<void> {
  await tx`
    INSERT INTO renaksi_ganti_nama (tahun, level, dari, ke, induk, induk_program, induk_baru, induk_program_baru, oleh)
    VALUES (${tahun}, ${g.level}, ${g.dari}, ${g.ke}, ${g.induk}, ${g.indukProgram}, ${g.indukBaru}, ${g.indukProgramBaru}, ${userId})
  `;
}

export interface CatatanGantiNama {
  id: number;
  level: RaLevel;
  dari: string;
  ke: string;
  induk: string | null;
  induk_program: string | null;
  /** Tahap H: induk BARU bila entitas dipindah (NULL = tetap). */
  induk_baru: string | null;
  induk_program_baru: string | null;
}

/** Urut kejadian (id naik) — pembaca merangkai A → B → C. */
export async function listGantiNama(tahun: number): Promise<CatatanGantiNama[]> {
  return queryMany<CatatanGantiNama>(sql`
    SELECT CAST(id AS UNSIGNED) AS id, level, dari, ke, induk, induk_program, induk_baru, induk_program_baru
    FROM renaksi_ganti_nama
    WHERE tahun = ${tahun}
    ORDER BY id
  `);
}

/**
 * Upsert by (tahun, level, indikator). Realisasi tidak di-update (preserve).
 * Kalau `id` diberikan dan exists → update by id (allow rename indikator).
 */
export async function upsertRencanaAksi(
  data: UpsertRencanaAksiInput,
  userId: number,
  /** Diisi bila simpanan ini mengganti nama entitas — route memakainya untuk menyebut pemakai nama lama. */
  hasil?: { gantiNama: GantiNama | null },
): Promise<number> {
  // Opsi A: untuk sub-kegiatan dengan bulanan terisi, q1-q4 target di-derive
  // server-side (otoritatif) dari `bulan_target` per jenis. Level lain / tanpa
  // bulanan → pakai q target dari form apa adanya. Tahunan/RPJMD tetap manual.
  const hasMonthly = data.level === 'sub-kegiatan'
    && Array.isArray(data.bulan_target) && data.bulan_target.length === 12;
  const bulanTargetJson = hasMonthly ? monthsToJson(data.bulan_target as MonthVal[]) : null;
  const [dq1, dq2, dq3, dq4] = hasMonthly
    ? deriveTargetQuarters(data.bulan_target as MonthVal[], data.jenis)
    : [data.q1_target, data.q2_target, data.q3_target, data.q4_target];

  // Satu jalur tulis untuk SEMUA edit baris yang sudah ada — dipanggil dari dua
  // tempat: edit-by-id (form Data Entry) dan tabrakan (tahun, level, indikator).
  // Dulu dua UPDATE terpisah dengan daftar kolom nyaris sama, dan hanya yang
  // pertama punya CAS; yang kedua diam-diam menimpa tanpa cek versi sama sekali.
  // L69: satu aturan, satu tempat — kalau tidak, perbaikan berikutnya cuma kena
  // salah satunya lagi.
  const updateBarisAda = async (id: number, expectedVersion: number | null): Promise<number> => {
    const lama = await getRencanaAksiById(id);
    if (!lama) throw new RaVersionConflictError();

    // T6: `jenis` menentukan RUMUS kuartal turunan (Akumulatif=jumlah, sisanya
    // snapshot). `updateJenis` sudah menghitung ulang saat jenis berubah — jalur
    // form ini dulu tidak, jadi q1-q4 realisasi tetap hasil rumus LAMA sampai
    // simpan bulanan berikutnya. Bug yang komentar R1 di updateJenis bilang sudah
    // ditutup, ternyata masih hidup di jalur sebelah.
    const jenisBerubah = lama.jenis !== data.jenis;

    // T2: ganti jenis MENGGERAKKAN angka realisasi, jadi jalur ini ikut tunduk
    // Kunci Periode — tapi HANYA saat jenisnya berubah. Mengedit uraian/satuan/
    // target saat periode terkunci tetap boleh (alasannya di `updateTargets`).
    // Pakai tahun BARIS, bukan `data.tahun`: kolom tahun tidak ikut di-update,
    // jadi tahun kiriman tidak menentukan periode mana yang sebenarnya tersentuh.
    if (jenisBerubah) await assertPeriodeTerbuka(Number(lama.tahun));

    const rr = jenisBerubah && lama.bulan_realisasi
      ? deriveQuartersFromMonthly(lama.bulan_realisasi, data.jenis)
      : null;

    // T16: ganti nama entitas menjalar. Hierarki disambung TEKS NAMA, jadi membuang
    // satu tanda di ujung nama induk meninggalkan seluruh baris turunan menunjuk
    // nama yang sudah tidak ada — dulu satu-satunya jalan membereskannya adalah
    // mengedit tiap baris satu per satu.
    const gantiNama = rencanaGantiNama(lama, {
      program: data.program,
      kegiatan: data.kegiatan,
      sub_kegiatan: data.sub_kegiatan,
    });

    // Induk baris ini berganti (pindah program/kegiatan/sasaran/tujuan): tautan lama menunjuk
    // indikator milik induk LAMA. COALESCE akan mempertahankannya — barisnya lalu hilang dari
    // daftar anak induk baru, dan Simpan berikutnya ditolak `assertIndukIndikator`. Tanpa
    // pilihan baru, tautannya dilepas jadi NULL (bentuk data lama yang sah).
    const indukBerubah = indukBarisBerubah(lama, data);

    // COALESCE, bukan tulis-balik nilai hasil baca: kolom realisasi hanya berubah
    // kalau memang ada hasil hitung ulang. Menulis balik nilai yang baru saja
    // dibaca akan menimpa realisasi yang diubah orang lain di sela baca-dan-tulis.
    // Baris yang diedit + seluruh turunannya ada di SATU transaksi: ganti nama yang
    // berhenti di tengah meninggalkan keadaan persis yang fitur ini mau cegah.
    await withTransaction(async ({ tx }) => {
      await assertIndukIndikator(tx, data);
      const res = await tx`
        UPDATE rencana_aksi SET
          kode                 = ${data.kode ?? null},
          sasaran              = ${data.sasaran ?? null},
          tujuan               = ${data.tujuan ?? null},
          outcome_program      = ${data.outcome_program ?? null},
          outcome_kegiatan     = ${data.outcome_kegiatan ?? null},
          outcome_sub_kegiatan = ${data.outcome_sub_kegiatan ?? null},
          program              = ${data.program},
          kegiatan             = ${data.kegiatan ?? null},
          sub_kegiatan         = ${data.sub_kegiatan ?? null},
          indikator            = ${data.indikator},
          jenis                = ${data.jenis},
          satuan               = ${data.satuan},
          target_rpjmd         = ${data.target_rpjmd},
          target_tahunan       = ${data.target_tahunan},
          q1_target            = ${dq1},
          q2_target            = ${dq2},
          q3_target            = ${dq3},
          q4_target            = ${dq4},
          q1_realisasi         = COALESCE(${rr?.[0] ?? null}, q1_realisasi),
          q2_realisasi         = COALESCE(${rr?.[1] ?? null}, q2_realisasi),
          q3_realisasi         = COALESCE(${rr?.[2] ?? null}, q3_realisasi),
          q4_realisasi         = COALESCE(${rr?.[3] ?? null}, q4_realisasi),
          anggaran_nominal     = ${data.level === 'sub-kegiatan' ? (data.anggaran_nominal ?? null) : null},
          bulan_target         = ${bulanTargetJson},
          induk_indikator_id   = IF(${indukBerubah ? 1 : 0} = 1, ${data.induk_indikator_id ?? null},
                                    COALESCE(${data.induk_indikator_id ?? null}, induk_indikator_id)),
          version              = version + 1,
          updated_by           = ${userId}
        WHERE id = ${id}
          AND (${expectedVersion === null ? 1 : 0} = 1 OR version = ${expectedVersion ?? 0})
      `;
      assertUpdated(res);
      if (gantiNama) {
        await jalarkanGantiNama(tx, Number(lama.tahun), gantiNama);
        await catatGantiNama(tx, Number(lama.tahun), gantiNama, userId);
      }
    });
    if (hasil) hasil.gantiNama = gantiNama;
    return id;
  };

  if (data.id) {
    // L51: CAS via version (bila klien kirim expected_version) + selalu bump version
    // supaya editor kuartal/target yang pegang versi lama ikut terdeteksi konflik.
    return updateBarisAda(
      data.id,
      typeof data.expected_version === 'number' ? data.expected_version : null,
    );
  }

  const existing = await queryOne<{ id: number }>(sql`
    SELECT id FROM rencana_aksi
    WHERE tahun = ${data.tahun} AND level = ${data.level} AND indikator = ${data.indikator}
    LIMIT 1
  `);

  // Tanpa expectedVersion: pengirimnya mengira sedang MEMBUAT baris, jadi ia memang
  // tidak punya versi untuk dibandingkan. Yang penting jalurnya kini sama.
  if (existing) return updateBarisAda(existing.id, null);

  // Race SELECT-lalu-INSERT ditutup uk_tahun_level_ind: submit kembar jatuh ke
  // ODKU (update, bukan ER_DUP_ENTRY 500). LAST_INSERT_ID(id) → insertId = id existing.
  const res = await withTransaction(async ({ tx }) => {
    await assertIndukIndikator(tx, data);
    return tx`
    INSERT INTO rencana_aksi
      (tahun, level, kode, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
       program, kegiatan, sub_kegiatan, indikator, jenis, satuan,
       target_rpjmd, target_tahunan,
       q1_target, q2_target, q3_target, q4_target, anggaran_nominal, bulan_target,
       induk_indikator_id, created_by, updated_by)
    VALUES (
      ${data.tahun}, ${data.level}, ${data.kode ?? null}, ${data.sasaran ?? null}, ${data.tujuan ?? null},
      ${data.outcome_program ?? null}, ${data.outcome_kegiatan ?? null}, ${data.outcome_sub_kegiatan ?? null},
      ${data.program}, ${data.kegiatan ?? null}, ${data.sub_kegiatan ?? null},
      ${data.indikator}, ${data.jenis}, ${data.satuan},
      ${data.target_rpjmd}, ${data.target_tahunan},
      ${dq1}, ${dq2}, ${dq3}, ${dq4},
      ${data.level === 'sub-kegiatan' ? (data.anggaran_nominal ?? null) : null}, ${bulanTargetJson},
      ${data.induk_indikator_id ?? null},
      ${userId}, ${userId}
    ) AS new
    ON DUPLICATE KEY UPDATE
      id                   = LAST_INSERT_ID(rencana_aksi.id),
      kode                 = new.kode,
      sasaran              = new.sasaran,
      tujuan               = new.tujuan,
      outcome_program      = new.outcome_program,
      outcome_kegiatan     = new.outcome_kegiatan,
      outcome_sub_kegiatan = new.outcome_sub_kegiatan,
      program              = new.program,
      kegiatan             = new.kegiatan,
      sub_kegiatan         = new.sub_kegiatan,
      jenis                = new.jenis,
      satuan               = new.satuan,
      target_rpjmd         = new.target_rpjmd,
      target_tahunan       = new.target_tahunan,
      q1_target            = new.q1_target,
      q2_target            = new.q2_target,
      q3_target            = new.q3_target,
      q4_target            = new.q4_target,
      anggaran_nominal     = new.anggaran_nominal,
      bulan_target         = new.bulan_target,
      induk_indikator_id   = COALESCE(new.induk_indikator_id, rencana_aksi.induk_indikator_id),
      version              = rencana_aksi.version + 1,
      updated_by           = new.updated_by
  `;
  }) as Array<{ insertId: number }>;
  return res[0]?.insertId ?? 0;
}

/**
 * T7 — tolak hapus kalau baris ini induk TERAKHIR yang masih memikul namanya.
 *
 * Dua angka yang harus dihitung, dan yang kedua paling mudah terlewat:
 *   1. berapa anak yang menunjuk nama ini, dan
 *   2. berapa SAUDARA yang masih memikul nama yang sama.
 * Satu entitas bisa punya banyak baris indikator — UNIQUE-nya di
 * (tahun, level, indikator), bukan di nama. Selama masih ada saudara, anaknya
 * tidak jadi yatim; memblokir di situ akan menolak penghapusan yang sah.
 *
 * Nama kolom di-dispatch statis per level, tidak pernah dirangkai jadi string SQL.
 * Konvensi kolomnya mengikuti `lib/renaksi/import-data.ts`: kolom `program`
 * menampung nama entitas SENDIRI untuk tujuan/sasaran/program, dan nama induk
 * untuk kegiatan/sub-kegiatan.
 */
async function assertTidakPunyaAnak(q: Penanya, row: RaRow): Promise<void> {
  type Hitung = { sisa: number; anak: number };
  let hasil: Hitung | undefined;
  let labelAnak = '';

  if (row.level === 'tujuan' && row.program) {
    labelAnak = 'sasaran';
    [hasil] = await q`
      SELECT
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='tujuan'  AND program=${row.program} AND id<>${row.id}) AS sisa,
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='sasaran' AND tujuan=${row.program})                    AS anak
    ` as Hitung[];
  } else if (row.level === 'sasaran' && row.program) {
    labelAnak = 'program';
    [hasil] = await q`
      SELECT
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='sasaran' AND program=${row.program} AND id<>${row.id}) AS sisa,
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='program' AND sasaran=${row.program})                   AS anak
    ` as Hitung[];
  } else if (row.level === 'program' && row.program) {
    labelAnak = 'kegiatan';
    [hasil] = await q`
      SELECT
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='program'  AND program=${row.program} AND id<>${row.id}) AS sisa,
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='kegiatan' AND program=${row.program})                   AS anak
    ` as Hitung[];
  } else if (row.level === 'kegiatan' && row.kegiatan) {
    labelAnak = 'sub kegiatan';
    [hasil] = await q`
      SELECT
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='kegiatan'     AND kegiatan=${row.kegiatan} AND id<>${row.id}) AS sisa,
        (SELECT COUNT(*) FROM rencana_aksi WHERE tahun=${row.tahun} AND level='sub-kegiatan' AND kegiatan=${row.kegiatan})                    AS anak
    ` as Hitung[];
  } else {
    return; // sub-kegiatan = daun, tidak punya anak
  }

  const sisa = Number(hasil?.sisa ?? 0);
  const anak = Number(hasil?.anak ?? 0);
  if (sisa === 0 && anak > 0) throw new RaPunyaAnakError(labelAnak, anak);
}

/**
 * Menerima baris utuh, bukan id: route sudah membacanya untuk audit log, dan penjaga nama butuh
 * level + nama entitasnya. Satu transaksi, baris dikunci DULU (§6 tautan-lanjutan, L84): Simpan
 * yang menautkan ke baris ini (`FOR SHARE`) menunggu, lalu mendapati induknya sudah tiada.
 *
 * Tautan indikator induk menunjuk ID baris. Penjaga nama hanya menolak bila barisnya yang TERAKHIR
 * memikul nama entitas itu; program ber-4 indikator lolos padahal kegiatan di bawahnya menunjuk
 * baris ini — soft-FK tidak menolak apa pun. Penunjuk itu ditolak (`RaTautanAnakError` membawa
 * daftarnya), atau dengan `lepasTautan` tautannya dilepas jadi NULL di transaksi yang sama (§5).
 * Pagar Kunci Periode & induk terakhir tidak bisa ditembus `lepasTautan`.
 */
export async function deleteRencanaAksi(row: RaRow, opsi: { lepasTautan?: boolean } = {}): Promise<{ lepas: number }> {
  // T2: menghapus baris = menghapus realisasinya. Ini pintu paling telak untuk
  // menembus Kunci Periode — lebih telak dari sekadar mengubah nilai, karena
  // angkanya tidak berubah melainkan hilang.
  await assertPeriodeTerbuka(Number(row.tahun));
  return withTransaction(async ({ tx }) => {
    const [ada] = await tx`SELECT id FROM rencana_aksi WHERE id = ${row.id} FOR UPDATE`;
    if (!ada) return { lepas: 0 };
    await assertTidakPunyaAnak(tx, row);
    const penunjuk = await tx`
      SELECT id, level, program, kegiatan, sub_kegiatan, tujuan, sasaran, indikator, induk_indikator_id
      FROM rencana_aksi WHERE tahun = ${row.tahun} AND induk_indikator_id = ${row.id}
      ORDER BY FIELD(level, 'tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'), indikator
    ` as BarisRantai[];
    if (penunjuk.length && !opsi.lepasTautan) {
      throw new RaTautanAnakError(penunjuk.length, penunjuk.slice(0, BATAS_PENUNJUK).map(p => ({
        level: p.level, nama: namaEntitas(p), indikator: p.indikator,
      })));
    }
    if (penunjuk.length) {
      await tx`
        UPDATE rencana_aksi SET induk_indikator_id = NULL, version = version + 1
        WHERE tahun = ${row.tahun} AND induk_indikator_id = ${row.id}
      `;
    }
    await tx`DELETE FROM rencana_aksi WHERE id = ${row.id}`;
    return { lepas: penunjuk.length };
  });
}

type SqlResult = { affectedRows?: number };

/**
 * T15 — **kunci anti-tabrakan Renaksi tidak pernah bekerja sejak dipasang.**
 *
 * L53: wrapper `sql` mengembalikan hasil non-SELECT sebagai `[{ affectedRows }]`
 * — sebuah ARRAY, bukan object. Versi lama membaca `res.affectedRows` langsung
 * pada array itu, jadi nilainya SELALU `undefined`, penjaga `typeof === 'number'`
 * selalu gagal, dan fungsi ini tidak pernah melempar apa pun.
 *
 * Akibat berantainya diam sepenuhnya: versi basi tetap diterima di kelima jalur
 * tulis, `409 VERSION_CONFLICT` di route jadi kode mati, dan `VersionConflictError`
 * di klien tidak pernah sekali pun terpicu. Edit rekan tertimpa tanpa jejak — persis
 * yang L51 seharusnya cegah.
 *
 * tsc tidak bisa menangkap ini karena parameternya `unknown`. Yang menangkapnya
 * uji hidup: `node scripts/test-renaksi-audit.mjs`.
 *
 * Aman dari salah-alarm: SETIAP UPDATE yang memakai penjaga ini juga menaikkan
 * `version = version + 1`, jadi barisnya pasti berubah kalau WHERE-nya kena.
 * `affectedRows = 0` karena itu hanya berarti satu hal — WHERE tidak kena, versinya
 * memang sudah basi.
 */
function assertUpdated(res: unknown): void {
  const baris = (res as SqlResult[] | undefined)?.[0];
  if (baris && baris.affectedRows === 0) {
    throw new RaVersionConflictError();
  }
}

/**
 * T2 — penjaga Kunci Periode untuk jalur yang bisa MENGUBAH NILAI REALISASI,
 * termasuk yang mengubahnya tidak langsung (ganti `jenis` → kuartal dihitung ulang
 * dengan rumus lain) dan yang menghapusnya (DELETE baris).
 *
 * L69: kunci yang cuma dipasang di sebagian jalur tulis bukan kunci. Modal Kunci
 * Periode berjanji realisasi bulan terkunci "tidak bisa diubah/direset oleh siapa
 * pun" — janji itu berlaku untuk SETIAP pintu, bukan tiga pintu yang kebetulan
 * diingat. Dulu updateQuarter/updateBulanRealisasi/resetRealisasi memeriksa
 * sendiri-sendiri; ganti jenis, hapus baris, dan impor mode 'ganti' lolos begitu saja.
 *
 * Sengaja memeriksa "ada kunci sama sekali", bukan per-bulan: pemanggilnya adalah
 * aksi yang menggerakkan SELURUH deret (rumus berubah / baris hilang), jadi tidak
 * ada gunanya bertanya bulan ke berapa.
 */
export async function assertPeriodeTerbuka(tahun: number): Promise<void> {
  const lock = await getRaLock(tahun);
  if (lock > 0) throw new RaPeriodLockedError(lock);
}

export async function updateQuarter(
  id: number, quarter: 1 | 2 | 3 | 4,
  target: number, realisasi: number | null, userId: number, expectedVersion: number,
): Promise<void> {
  const row = await getRencanaAksiById(id);
  if (!row) throw new RaVersionConflictError();
  // R5: baris ber-data bulanan → kuartal turunan, edit langsung ditolak
  if (row.bulan_target || row.bulan_realisasi) throw new RaMonthlyManagedError();
  // Kunci Periode: kuartal yang seluruh bulannya ≤ batas kunci tidak bisa diubah
  const lock = await getRaLock(row.tahun);
  if (lock > 0 && quarter * 3 <= lock) throw new RaPeriodLockedError(lock);
  // Static dispatch per kolom — 4 ENUM, tidak ada SQL injection risk.
  let res: unknown;
  if (quarter === 1) {
    res = await sql`UPDATE rencana_aksi SET q1_target=${target}, q1_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  } else if (quarter === 2) {
    res = await sql`UPDATE rencana_aksi SET q2_target=${target}, q2_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  } else if (quarter === 3) {
    res = await sql`UPDATE rencana_aksi SET q3_target=${target}, q3_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  } else {
    res = await sql`UPDATE rencana_aksi SET q4_target=${target}, q4_realisasi=${realisasi}, version=version+1, updated_by=${userId} WHERE id=${id} AND version=${expectedVersion}`;
  }
  assertUpdated(res);
}

/**
 * Opsi A (menu Realisasi, sub-kegiatan): simpan 12 realisasi bulanan →
 * derive q1-q4 realisasi per jenis. Optimistic lock via version.
 */
/**
 * Inti tulisnya, memakai baris + status kunci yang SUDAH di tangan pemanggil.
 * Dipisah supaya jalur massal (T8) tidak perlu menanyakan ulang keduanya per baris.
 */
async function tulisBulanRealisasi(
  row: RaRow, months: MonthVal[], userId: number, expectedVersion: number, lock: number,
): Promise<unknown> {
  // Kunci Periode: nilai bulan ≤ batas kunci tidak boleh berubah
  if (lock > 0) {
    const existing = row.bulan_realisasi ?? Array(12).fill(null);
    for (let i = 0; i < lock; i++) {
      if ((months[i] ?? null) !== (existing[i] ?? null)) throw new RaPeriodLockedError(lock);
    }
  }
  const [r1, r2, r3, r4] = deriveQuartersFromMonthly(months, row.jenis);
  return await sql`
    UPDATE rencana_aksi
    SET q1_realisasi=${r1}, q2_realisasi=${r2}, q3_realisasi=${r3}, q4_realisasi=${r4},
        bulan_realisasi=${monthsToJson(months)}, version=version+1, updated_by=${userId}
    WHERE id=${row.id} AND version=${expectedVersion}
  `;
}

export async function updateBulanRealisasi(
  id: number, months: MonthVal[], userId: number, expectedVersion: number,
): Promise<void> {
  const row = await getRencanaAksiById(id);
  if (!row) throw new RaVersionConflictError();
  const lock = await getRaLock(row.tahun);
  assertUpdated(await tulisBulanRealisasi(row, months, userId, expectedVersion, lock));
}

/**
 * T2/K2 — SENGAJA tidak tunduk Kunci Periode, dan ini keputusan, bukan kelupaan.
 *
 * Kunci Periode berjanji soal REALISASI ("realisasi bulan terkunci tidak bisa
 * diubah/direset"), bukan soal target. Membetulkan salah ketik target setelah
 * periode ditutup adalah kebutuhan nyata, dan memblokirnya melebihi apa yang
 * dijanjikan modalnya sendiri. Target juga tidak ikut menggerakkan angka realisasi
 * — beda dengan `jenis`, yang mengubah RUMUS dan karenanya memang dikunci.
 *
 * Kalau suatu saat kebijakan ini berubah, yang perlu ditambahkan cuma satu baris
 * `await assertPeriodeTerbuka(...)` di sini.
 */
export async function updateTargets(
  id: number, targetRpjmd: number, targetTahunan: number, userId: number, expectedVersion: number,
): Promise<void> {
  const res = await sql`
    UPDATE rencana_aksi
    SET target_rpjmd=${targetRpjmd}, target_tahunan=${targetTahunan}, version=version+1, updated_by=${userId}
    WHERE id=${id} AND version=${expectedVersion}
  `;
  assertUpdated(res);
}

export async function updateJenis(
  id: number, jenis: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan', userId: number, expectedVersion: number,
): Promise<void> {
  // R1: rumus derive beda per jenis (Akumulatif=SUM, lainnya=snapshot) —
  // kuartal turunan bulanan WAJIB dihitung ulang dengan rumus jenis baru,
  // kalau tidak q1-q4 tetap hasil rumus lama sampai simpan bulanan berikutnya
  const row = await getRencanaAksiById(id);
  if (!row) throw new RaVersionConflictError();
  // T2: rumus baru menghitung ulang q1-q4 REALISASI di bawah — jadi mengganti
  // jenis mengubah nilai realisasi bulan terkunci tanpa pernah menyentuh menu
  // realisasi. Dulu inilah pintu bocor paling licin dari Kunci Periode.
  await assertPeriodeTerbuka(Number(row.tahun));
  const [t1, t2, t3, t4] = row.bulan_target
    ? deriveTargetQuarters(row.bulan_target, jenis)
    : [row.q1_target, row.q2_target, row.q3_target, row.q4_target];
  const [r1, r2, r3, r4] = row.bulan_realisasi
    ? deriveQuartersFromMonthly(row.bulan_realisasi, jenis)
    : [row.q1_realisasi, row.q2_realisasi, row.q3_realisasi, row.q4_realisasi];
  const res = await sql`
    UPDATE rencana_aksi
    SET jenis=${jenis},
        q1_target=${t1}, q2_target=${t2}, q3_target=${t3}, q4_target=${t4},
        q1_realisasi=${r1}, q2_realisasi=${r2}, q3_realisasi=${r3}, q4_realisasi=${r4},
        version=version+1, updated_by=${userId}
    WHERE id=${id} AND version=${expectedVersion}
  `;
  assertUpdated(res);
}

/**
 * Reset realisasi 1 indikator → q1-q4 realisasi = NULL (belum diisi, bukan nol). Target tetap.
 * Sengaja tidak pakai version check — aksi destruktif manual user yang sadar konsekuensi (sudah ada confirm 4-digit di UI).
 */
export async function resetRealisasi(id: number, userId: number): Promise<void> {
  const row = await queryOne<{ tahun: number }>(sql`SELECT tahun FROM rencana_aksi WHERE id = ${id}`);
  if (row) {
    const lock = await getRaLock(Number(row.tahun));
    if (lock > 0) throw new RaPeriodLockedError(lock);
  }
  // R2: data bulanan ikut dibersihkan — kalau tidak, simpan bulanan berikutnya
  // mengisi ulang kuartal dari data stale (reset seperti tidak pernah terjadi)
  await sql`
    UPDATE rencana_aksi
    SET q1_realisasi=NULL, q2_realisasi=NULL, q3_realisasi=NULL, q4_realisasi=NULL,
        bulan_realisasi=NULL,
        version=version+1, updated_by=${userId}
    WHERE id=${id}
  `;
}

// ─── Matriks Bulanan: simpan massal ──────────────────────────────────────────

export interface BulanBulkItem { id: number; bulan_realisasi: MonthVal[]; expected_version: number }
export interface BulanBulkResult { saved: number; failed: { id: number; error: string }[] }

/**
 * Simpan realisasi bulanan banyak indikator sekaligus (Matriks Bulanan).
 * Per-item independen (BUKAN all-or-nothing): tiap baris tetap lewat CAS versi
 * + cek Kunci Periode via updateBulanRealisasi; kegagalan dilaporkan per id.
 */
export async function updateBulanRealisasiBulk(
  items: BulanBulkItem[], userId: number,
): Promise<BulanBulkResult> {
  const saved0 = { saved: 0 };
  const failed: { id: number; error: string }[] = [];

  // T8: dulu tiap putaran memanggil updateBulanRealisasi, yang membaca ulang
  // barisnya DAN menanyakan status kunci — 300 baris jadi ±900 kueri, 300 di
  // antaranya menanyakan hal yang sama persis (kunci untuk tahun yang sama).
  // Sekarang baris diambil sekali borongan, kunci ditanya sekali per tahun.
  const rows = await queryMany<RaRow>(sql`
    SELECT id, tahun, level, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
           program, kegiatan, sub_kegiatan, indikator,
           jenis, satuan, target_rpjmd, target_tahunan,
           q1_target, q1_realisasi, q2_target, q2_realisasi,
           q3_target, q3_realisasi, q4_target, q4_realisasi, anggaran_nominal,
           bulan_target, bulan_realisasi, version, kode
    FROM rencana_aksi WHERE id IN (${items.map(i => i.id)})
  `);
  const petaBaris = new Map<number, RaRow>();
  for (const r of rows) {
    r.bulan_target = parseMonths(r.bulan_target);
    r.bulan_realisasi = parseMonths(r.bulan_realisasi);
    normNumerics(r);
    petaBaris.set(Number(r.id), r);
  }

  // Baris satu matriks bisa saja lintas tahun; kuncinya tetap ditanya sekali
  // per tahun, bukan sekali per baris.
  const petaKunci = new Map<number, number>();
  for (const th of new Set(rows.map(r => Number(r.tahun)))) {
    petaKunci.set(th, await getRaLock(th));
  }

  // Per-baris independen (BUKAN all-or-nothing) — keputusan sadar, lihat komentar
  // fungsi. Yang berubah cuma dari mana baris & kuncinya datang.
  for (const it of items) {
    try {
      const row = petaBaris.get(it.id);
      if (!row) throw new RaVersionConflictError();
      assertUpdated(await tulisBulanRealisasi(
        row, it.bulan_realisasi, userId, it.expected_version, petaKunci.get(Number(row.tahun)) ?? 0,
      ));
      saved0.saved++;
    } catch (e) {
      failed.push({ id: it.id, error: e instanceof Error ? e.message : 'Gagal menyimpan' });
    }
  }
  return { saved: saved0.saved, failed };
}

// ─── Kunci Periode (system_settings kv: ra_lock_{tahun} = 0..12) ────────────

export async function getRaLock(tahun: number): Promise<number> {
  const r = await queryOne<{ val: string | null }>(
    sql`SELECT val FROM system_settings WHERE \`key\` = ${`ra_lock_${tahun}`}`,
  );
  const n = Number(r?.val ?? 0);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 0;
}

export async function setRaLock(tahun: number, bulan: number): Promise<void> {
  await sql`
    INSERT INTO system_settings (\`key\`, val) VALUES (${`ra_lock_${tahun}`}, ${String(bulan)})
    ON DUPLICATE KEY UPDATE val = ${String(bulan)}
  `;
}

// ─── Duplikasi struktur + target ke tahun baru (realisasi kosong) ────────────

export async function duplicateYear(
  fromTahun: number, toTahun: number, userId: number,
): Promise<{ inserted: number }> {
  let inserted = 0;
  await withTransaction(async ({ tx }) => {
    // T10 / L69(a): `SELECT … FOR UPDATE` pada tahun tujuan yang MASIH KOSONG tidak
    // mengunci apa pun — tidak ada baris untuk dikunci. Dulu dua klik hampir
    // bersamaan sama-sama melihat COUNT=0, lalu sama-sama menyalin, dan tahun
    // tujuannya berisi dua salinan. Rate limit 5/menit tidak menahan dua tab.
    // `acquireBludLock` (INSERT IGNORE lalu FOR UPDATE) mengunci baris penanda
    // yang PASTI ada — namanya menyebut BLUD, isinya generik.
    await acquireBludLock(tx, 'RA_DUPLIKASI', String(toTahun));

    // COUNT diulang DI DALAM kunci. Yang dihitung sebelum mengunci tidak menjamin
    // apa pun: itu justru bagian yang dulu bocor.
    const cek = await tx`SELECT COUNT(*) AS c FROM rencana_aksi WHERE tahun = ${toTahun}` as Array<{ c: unknown }>;
    if (Number(cek[0]?.c ?? 0) > 0) throw new RaTahunTujuanBerisiError(toTahun);

    // Single INSERT..SELECT = atomic; realisasi (q*_realisasi/bulan_realisasi)
    // memakai DEFAULT (0/NULL) — hanya struktur + target yang tersalin.
    const res = await tx`
      INSERT INTO rencana_aksi
        (tahun, level, kode, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
         program, kegiatan, sub_kegiatan, indikator, jenis, satuan,
         target_rpjmd, target_tahunan, q1_target, q2_target, q3_target, q4_target,
         anggaran_nominal, bulan_target, induk_indikator_id, created_by, updated_by)
      SELECT ${toTahun}, level, kode, sasaran, tujuan, outcome_program, outcome_kegiatan, outcome_sub_kegiatan,
         program, kegiatan, sub_kegiatan, indikator, jenis, satuan,
         target_rpjmd, target_tahunan, q1_target, q2_target, q3_target, q4_target,
         anggaran_nominal, bulan_target, induk_indikator_id, ${userId}, ${userId}
      FROM rencana_aksi
      WHERE tahun = ${fromTahun}
    ` as unknown as Array<{ affectedRows?: number }>;
    inserted = res[0]?.affectedRows ?? 0;

    // Konsep §9: `induk_indikator_id` ikut tersalin apa adanya, jadi salinannya masih menunjuk
    // baris TAHUN ASAL. Tautan itu harus dipindahkan ke salinan induknya di tahun baru, kalau
    // tidak seluruh rantai di tahun baru menyeberang tahun (dan ditolak `assertIndukIndikator`
    // begitu baris itu disunting). Pasangan id lama→baru tidak bisa dibaca dari hasil INSERT
    // (MySQL tanpa RETURNING), jadi dicari lewat kunci unik yang sudah ada:
    // (tahun, level, indikator).
    await tx`
      UPDATE rencana_aksi AS anak
      JOIN rencana_aksi AS induk_asal ON induk_asal.id = anak.induk_indikator_id
      JOIN rencana_aksi AS induk_baru
        ON induk_baru.tahun = ${toTahun}
       AND induk_baru.level = induk_asal.level
       AND induk_baru.indikator = induk_asal.indikator
      SET anak.induk_indikator_id = induk_baru.id
      WHERE anak.tahun = ${toTahun} AND anak.induk_indikator_id IS NOT NULL
    `;

    // Sisa tautan yang induknya tidak ikut tersalin (data lama yatim / tautan lintas tahun) tidak
    // boleh dibawa ke tahun baru: dilepas jadi NULL, sama seperti baris lama yang belum tertaut.
    await tx`
      UPDATE rencana_aksi SET induk_indikator_id = NULL
      WHERE tahun = ${toTahun} AND induk_indikator_id IS NOT NULL
        AND induk_indikator_id NOT IN (
          SELECT id FROM (SELECT id FROM rencana_aksi WHERE tahun = ${toTahun}) AS s
        )
    `;
  });
  return { inserted };
}

