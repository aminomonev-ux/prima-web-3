// lib/services/drive-tujuan.ts — SATU-SATUNYA penjawab "berkas ini ditaruh di folder Drive mana".
// Konsep: docs/CONCEPT-drive-terpusat.md §6.2 & §7. Tidak boleh ada `process.env.GOOGLE_DRIVE_FOLDER_ID*`
// di luar berkas ini dan `scripts/backup-db.js` (dijaga `scripts/test-drive-terpusat.mts`).
//
// Dua mode:
//  - FOLDER INDUK (`app_config.drive_root` dari Admin Panel, cadangannya env
//    `GOOGLE_DRIVE_FOLDER_ID_ROOT`): tiap tujuan mendapat subfolder sendiri
//    di dalam induk, dibuat aplikasi saat pertama dibutuhkan, ID-nya diingat di `app_config`.
//    Mode ini MENGALAHKAN env per-tujuan — tujuannya memang "semua berkas PRIMA di satu tempat".
//  - PER TUJUAN (induk kosong): env per tujuan, cadangannya folder umum (perilaku lama).
import { sql, withTransaction, type Penanya } from '@/lib/data/db';
import { acquireBludLock } from '@/lib/data/locks';
import { cariAtauBuatFolder } from '@/lib/services/drive';

/** `salinan_lampiran` = salinan kedua lampiran semua modul, dibuat `scripts/backup-db.js` (konsep §20). */
export const DRIVE_TUJUAN = ['backup_db', 'lkjip', 'lkjip_arsip', 'blud_json', 'bba', 'usulan', 'salinan_lampiran'] as const;
export type DriveTujuan = (typeof DRIVE_TUJUAN)[number];

/** Subfolder di mode induk. `lkjip` & `lkjip_arsip` berbagi satu folder LKJIP. */
export const FOLDER_TUJUAN = {
  backup_db: 'backup_db', lkjip: 'lkjip', lkjip_arsip: 'lkjip', blud_json: 'blud_json', bba: 'bba', usulan: 'usulan',
  salinan_lampiran: 'salinan',
} as const satisfies Record<DriveTujuan, string>;
export type KunciFolder = (typeof FOLDER_TUJUAN)[DriveTujuan];

/**
 * Nama subfolder. `backup_db` & `salinan` WAJIB sama dengan `NAMA_SUBFOLDER_*` di `scripts/backup-db.js` (dijaga uji):
 * kalau berbeda, skrip backup membuat folder kembar di samping yang dibuat aplikasi.
 */
export const NAMA_SUBFOLDER: Record<KunciFolder, string> = {
  backup_db: '01 Backup Database',
  lkjip:     '02 LKJIP',
  blud_json: '03 Cadangan BLUD',
  bba:       '04 Buku Besar Aset',
  usulan:    '05 Lampiran Usulan',
  salinan:   '06 Salinan Lampiran',
};

/** `app_config` — ID subfolder yang sudah dibuat, terikat pada induknya. */
export const KUNCI_PETA_SUBFOLDER = 'drive_subfolder_otomatis';
/** `app_config` — folder induk yang diisi dari Admin Panel; tidak ada = ikut env. */
export const KUNCI_FOLDER_INDUK = 'drive_root';
/** ID folder/berkas Drive: huruf, angka, `-`, `_`. Dipakai juga untuk isian Admin Panel. */
export const POLA_ID_DRIVE = /^[\w-]{10,128}$/;
const ENTITAS_KUNCI = 'drive_folder';

type Env = Record<string, string | undefined>;
const isi = (v: string | undefined) => v?.trim() ?? '';

/** Cadangan bila env khusus kosong. `null` = tanpa cadangan (kosong = tujuan belum dipakai). */
const ENV_TUJUAN: Record<DriveTujuan, { khusus: string | null; cadanganUmum: boolean }> = {
  backup_db:   { khusus: 'GOOGLE_DRIVE_FOLDER_ID_BACKUP',    cadanganUmum: false },
  lkjip:       { khusus: 'GOOGLE_DRIVE_FOLDER_ID_LKJIP',     cadanganUmum: true },
  lkjip_arsip: { khusus: 'GOOGLE_DRIVE_FOLDER_ID_LKJIP',     cadanganUmum: false },
  blud_json:   { khusus: 'GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON', cadanganUmum: false },
  bba:         { khusus: 'GOOGLE_DRIVE_FOLDER_ID_BBA',       cadanganUmum: true },
  usulan:      { khusus: null,                               cadanganUmum: true },
  salinan_lampiran: { khusus: 'GOOGLE_DRIVE_FOLDER_ID_SALINAN', cadanganUmum: false },
};

export function folderIndukDariEnv(env: Env = process.env): string {
  return isi(env.GOOGLE_DRIVE_FOLDER_ID_ROOT);
}

/** Mode per tujuan (tanpa induk). Kosong = belum dikonfigurasi; pemanggil yang memutuskan. */
export function folderDariEnv(tujuan: DriveTujuan, env: Env = process.env): string {
  const a = ENV_TUJUAN[tujuan];
  return (a.khusus ? isi(env[a.khusus]) : '') || (a.cadanganUmum ? isi(env.GOOGLE_DRIVE_FOLDER_ID) : '');
}

let indukDiingat: { nilai: string; sampai: number } | null = null;
const UMUR_INGATAN_INDUK_MS = 60_000;

/** Isian Admin Panel. Gagal membaca DB = '' (jatuh ke env) dan tidak diingat. */
async function indukDariConfig(): Promise<string> {
  if (indukDiingat && indukDiingat.sampai > Date.now()) return indukDiingat.nilai;
  try {
    const rows = await sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_FOLDER_INDUK} LIMIT 1` as { value?: unknown }[];
    const v = String(rows[0]?.value ?? '').trim();
    const nilai = POLA_ID_DRIVE.test(v) ? v : '';
    indukDiingat = { nilai, sampai: Date.now() + UMUR_INGATAN_INDUK_MS };
    return nilai;
  } catch { return ''; }
}

/** Folder induk yang berlaku: isian Admin Panel dulu, env cadangan. Kosong = mode per tujuan. */
export async function folderInduk(env: Env = process.env): Promise<{ id: string; asal: 'panel' | 'env' | null }> {
  const panel = await indukDariConfig();
  if (panel) return { id: panel, asal: 'panel' };
  const dariEnv = folderIndukDariEnv(env);
  return dariEnv ? { id: dariEnv, asal: 'env' } : { id: '', asal: null };
}

/** Isi `drive_root`; string kosong = hapus (kembali ke env). Ingatan proses ini langsung dibuang. */
export async function aturFolderInduk(id: string): Promise<void> {
  const v = id.trim();
  if (v && !POLA_ID_DRIVE.test(v)) throw new Error('ID folder tidak sah.');
  if (v) await sql`INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_FOLDER_INDUK}, ${v}) ON DUPLICATE KEY UPDATE value = VALUES(value)`;
  else await sql`DELETE FROM app_config WHERE \`key\` = ${KUNCI_FOLDER_INDUK}`;
  indukDiingat = null;
}

/** "Sudah diatur" tanpa menyentuh Drive (murni): ada induk, atau env tujuan itu terisi. */
export function terkonfigurasiDengan(induk: string, tujuan: DriveTujuan, env: Env = process.env): boolean {
  return !!induk || !!folderDariEnv(tujuan, env);
}

/** "Sudah diatur" TANPA menyentuh Drive — untuk status di layar. */
export async function tujuanTerkonfigurasi(tujuan: DriveTujuan, env: Env = process.env): Promise<boolean> {
  return terkonfigurasiDengan((await folderInduk(env)).id, tujuan, env);
}

export interface PetaSubfolder { induk: string; folder: Partial<Record<KunciFolder, string>> }

/** Isi `app_config` rusak/kosong = peta kosong. ID yang bentuknya bukan ID Drive dibuang. */
export function bacaPetaSubfolder(nilai: unknown): PetaSubfolder | null {
  if (typeof nilai !== 'string' || !nilai) return null;
  let j: unknown;
  try { j = JSON.parse(nilai); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const o = j as { induk?: unknown; folder?: unknown };
  if (typeof o.induk !== 'string' || !o.induk) return null;
  const folder: PetaSubfolder['folder'] = {};
  if (o.folder && typeof o.folder === 'object') {
    for (const k of Object.keys(NAMA_SUBFOLDER) as KunciFolder[]) {
      const v = (o.folder as Record<string, unknown>)[k];
      if (typeof v === 'string' && POLA_ID_DRIVE.test(v)) folder[k] = v;
    }
  }
  return { induk: o.induk, folder };
}

/** ID subfolder yang tercatat untuk induk INI — peta milik induk lain diabaikan (induk diganti). */
export function subfolderTercatat(peta: PetaSubfolder | null, induk: string, kunci: KunciFolder): string {
  return peta && peta.induk === induk ? peta.folder[kunci] ?? '' : '';
}

/** Peta baru sesudah satu subfolder tercatat; peta induk lain dibuang. */
export function catatSubfolder(peta: PetaSubfolder | null, induk: string, kunci: KunciFolder, id: string): PetaSubfolder {
  const folder = peta && peta.induk === induk ? { ...peta.folder } : {};
  folder[kunci] = id;
  return { induk, folder };
}

async function bacaPeta(q: Penanya): Promise<PetaSubfolder | null> {
  const rows = await q`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_PETA_SUBFOLDER} LIMIT 1` as { value?: unknown }[];
  return bacaPetaSubfolder(rows[0]?.value);
}

const ingatan = new Map<string, string>();
const sedangDibuat = new Map<string, Promise<string>>();

async function subfolderOtomatis(induk: string, kunci: KunciFolder): Promise<string> {
  const id = `${induk}|${kunci}`;
  const diingat = ingatan.get(id);
  if (diingat) return diingat;
  const tercatat = subfolderTercatat(await bacaPeta(sql), induk, kunci);
  if (tercatat) { ingatan.set(id, tercatat); return tercatat; }

  // Satu proses: permintaan bersamaan menunggu janji yang sama. Lintas proses (aplikasi ×
  // skrip backup): kunci baris `blud_locks` + baca ulang di bawahnya — tanpa itu dua
  // pemanggil sama-sama melihat "belum ada" dan masing-masing membuat folder.
  const jalan = sedangDibuat.get(id) ?? withTransaction(async ({ tx }) => {
    await acquireBludLock(tx, ENTITAS_KUNCI, 'otomatis');
    // Dibaca SESUDAH kunci: snapshot transaksi lahir di SELECT biasa pertama (L84).
    const peta = await bacaPeta(tx);
    const sudah = subfolderTercatat(peta, induk, kunci);
    if (sudah) return sudah;
    const { id: folderId, dibuat } = await cariAtauBuatFolder(induk, NAMA_SUBFOLDER[kunci]);
    const baru = JSON.stringify(catatSubfolder(peta, induk, kunci, folderId));
    await tx`INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_PETA_SUBFOLDER}, ${baru})
             ON DUPLICATE KEY UPDATE value = VALUES(value)`;
    console.info(`[drive] subfolder "${NAMA_SUBFOLDER[kunci]}" ${dibuat ? 'dibuat' : 'ditemukan'} di folder induk (${folderId}).`);
    return folderId;
  }).finally(() => sedangDibuat.delete(id));
  sedangDibuat.set(id, jalan);
  const hasil = await jalan;
  ingatan.set(id, hasil);
  return hasil;
}

/**
 * Folder tujuan. Kosong ('') = tujuan belum dikonfigurasi. Melempar bila mode induk gagal
 * menyiapkan subfolder (induk salah, token dicabut) — sengaja TIDAK jatuh ke env lama:
 * berkas yang diam-diam mendarat di tempat lain adalah kegagalan yang tidak terlihat.
 */
export async function folderUntuk(tujuan: DriveTujuan, env: Env = process.env): Promise<string> {
  const induk = (await folderInduk(env)).id;
  return induk ? subfolderOtomatis(induk, FOLDER_TUJUAN[tujuan]) : folderDariEnv(tujuan, env);
}

/** Folder yang AKAN dipakai, tanpa membuat apa pun (status di layar). id '' = belum dibuat/belum diatur. */
export async function folderTercatat(tujuan: DriveTujuan, env: Env = process.env): Promise<{ id: string; mode: 'induk' | 'env' }> {
  const induk = (await folderInduk(env)).id;
  if (!induk) return { id: folderDariEnv(tujuan, env), mode: 'env' };
  const peta = await bacaPeta(sql).catch(() => null);
  return { id: subfolderTercatat(peta, induk, FOLDER_TUJUAN[tujuan]), mode: 'induk' };
}
