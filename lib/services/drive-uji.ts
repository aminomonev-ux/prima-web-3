// lib/services/drive-uji.ts — tombol UJI & status panel "Drive & Backup" (server).
// Konsep: docs/CONCEPT-drive-terpusat.md §8 (Uji), §10 (panel), §16.2 (tempat ID berkas lama).
import { sql, sqlInt } from '@/lib/data/db';
import { getDriveClient, infoKuota, jenisGalatDrive, uploadBufferToDrive } from '@/lib/services/drive';
import { catatKesehatan, ringkasGalat } from '@/lib/services/drive-catatan';
import { DRIVE_TUJUAN, folderInduk, folderTercatat, folderUntuk, terkonfigurasiDengan, type DriveTujuan } from '@/lib/services/drive-tujuan';
import { backupBasi, type KodeUji } from '@/lib/services/drive-status';
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib';

/** Kapan proses Next ini mulai — patokan "aplikasi sudah hidup ≥ 2 jam" (§10). */
const PROSES_MULAI = waktuSekarangWIB();

export const KUNCI_UJI_TERAKHIR = 'drive_uji_terakhir';

export interface HasilUjiTujuan {
  tujuan: DriveTujuan; ok: boolean; kode: KodeUji | null; pesan: string | null;
  folderId: string | null; ms: number | null;
  /** Berkas lama yang diperiksa terbaca (langkah 5): diperiksa = 0 berarti belum ada berkas tercatat. */
  lama: { diperiksa: number; terbaca: number };
  sisaProbe?: string;
}
export interface HasilUji {
  waktu: string;
  akun: { email: string | null; terpakai: number | null; batas: number | null } | null;
  galatAkun: string | null;
  tujuan: HasilUjiTujuan[];
}

/** DATETIME mysql2 (pool +07:00) → 'YYYY-MM-DD HH:MM:SS' WIB. */
function wib(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return waktuSekarangWIB(v.getTime());
  return String(v).slice(0, 19).replace('T', ' ');
}

/** ID berkas TERTUA & TERBARU yang tercatat untuk tujuan itu (§16.2). Tabel belum ada = []. */
async function berkasLama(tujuan: DriveTujuan): Promise<string[]> {
  const ambil = async (q: () => PromiseLike<unknown>) => {
    try { return ((await q()) as { id?: unknown }[]).map((r) => String(r.id ?? '')).filter(Boolean); } catch { return []; }
  };
  const ujung = async (pertama: () => PromiseLike<unknown>, terakhir: () => PromiseLike<unknown>) =>
    [...new Set([...(await ambil(pertama)), ...(await ambil(terakhir))])];
  const konteks = { usulan: 'usulan_aset', bba: 'buku_besar_aset', lkjip: 'lkjip' } as const;
  if (tujuan === 'usulan' || tujuan === 'bba' || tujuan === 'lkjip') {
    const c = konteks[tujuan];
    return ujung(
      () => sql`SELECT file_id AS id FROM uploaded_files WHERE context = ${c} ORDER BY created_at ASC LIMIT 1`,
      () => sql`SELECT file_id AS id FROM uploaded_files WHERE context = ${c} ORDER BY created_at DESC LIMIT 1`);
  }
  if (tujuan === 'lkjip_arsip') return ujung(
    () => sql`SELECT drive_file_id AS id FROM lkjip_versi WHERE drive_file_id IS NOT NULL ORDER BY id ASC LIMIT 1`,
    () => sql`SELECT drive_file_id AS id FROM lkjip_versi WHERE drive_file_id IS NOT NULL ORDER BY id DESC LIMIT 1`);
  if (tujuan === 'blud_json') return ujung(
    () => sql`SELECT drive_file_id AS id FROM blud_riwayat_simpan WHERE drive_file_id IS NOT NULL ORDER BY id ASC LIMIT 1`,
    () => sql`SELECT drive_file_id AS id FROM blud_riwayat_simpan WHERE drive_file_id IS NOT NULL ORDER BY id DESC LIMIT 1`);
  // backup_db & salinan_lampiran: hanya tercatat di manifest.
  return ujung(
    () => sql`SELECT file_id AS id FROM drive_arsip WHERE tujuan = ${tujuan} AND dihapus_pada IS NULL ORDER BY id ASC LIMIT 1`,
    () => sql`SELECT file_id AS id FROM drive_arsip WHERE tujuan = ${tujuan} AND dihapus_pada IS NULL ORDER BY id DESC LIMIT 1`);
}

export const KUNCI_RINGKAS_SALINAN = 'salinan_lampiran_ringkas';

/** Ditulis `scripts/backup-db.js` tiap jalan (konsep §20). Bentuknya WAJIB sama dengan di sana. */
export interface RingkasSalinan {
  waktu: string;
  /** Berkas yang seharusnya punya salinan (uploaded_files + arsip Word LKJIP). */
  total: number;
  lokal: { folder: string; ada: number; baru: number; gagal: number; hilang: number; byte: number; tertunda: number };
  drive: { aktif: boolean; ada: number; baru: number; gagal: number; hilang: number; tertunda: number };
  pesan: string | null;
}

/** Tulis → baca → hapus satu berkas 16 byte. Melempar galat Drive apa adanya. */
async function probe(folderId: string): Promise<{ ms: number; sisaProbe?: string }> {
  const t0 = Date.now();
  const drive = getDriveClient();
  const isi = Buffer.from(`PRIMA-DRIVE-TEST ${waktuSekarangWIB()}`);
  const { fileId } = await uploadBufferToDrive({ buffer: isi, name: `prima-uji-${Date.now()}.txt`, mimeType: 'text/plain', folderId });
  try {
    await drive.files.get({ fileId, fields: 'id,size' });
  } finally {
    try { await drive.files.delete({ fileId }); }
    catch { return { ms: Date.now() - t0, sisaProbe: fileId }; }
  }
  return { ms: Date.now() - t0 };
}

/**
 * Uji semua tujuan. Folder induk aktif → subfolder yang belum ada IKUT DIBUAT (itu sekalian
 * cara melihat kelima subfolder sejak hari pertama). Tujuan berbagi folder (`lkjip`/
 * `lkjip_arsip`) diprobe sekali. Hasil ditulis ke `drive_health` dan `app_config`.
 */
export async function ujiDrive(): Promise<HasilUji> {
  const hasil: HasilUji = { waktu: waktuSekarangWIB(), akun: null, galatAkun: null, tujuan: [] };
  try { hasil.akun = await infoKuota(); } catch (e) { hasil.galatAkun = ringkasGalat(e); }

  const induk = (await folderInduk()).id;
  const probeFolder = new Map<string, Promise<{ ms: number; sisaProbe?: string }>>();
  for (const tujuan of DRIVE_TUJUAN) {
    const baris: HasilUjiTujuan = { tujuan, ok: false, kode: null, pesan: null, folderId: null, ms: null, lama: { diperiksa: 0, terbaca: 0 } };
    hasil.tujuan.push(baris);
    if (!terkonfigurasiDengan(induk, tujuan)) { baris.kode = 'kosong'; continue; }
    try {
      const folderId = await folderUntuk(tujuan);
      baris.folderId = folderId;
      if (!probeFolder.has(folderId)) probeFolder.set(folderId, probe(folderId));
      const p = await probeFolder.get(folderId)!;
      baris.ms = p.ms;
      if (p.sisaProbe) baris.sisaProbe = p.sisaProbe;
    } catch (e) {
      baris.kode = jenisGalatDrive(e); baris.pesan = ringkasGalat(e);
      await catatKesehatan(tujuan, e);
      continue;
    }
    // Langkah 5: menulis berkas baru tidak membuktikan berkas LAMA masih terbaca (A15).
    const lama = await berkasLama(tujuan);
    const drive = getDriveClient();
    for (const id of lama) {
      baris.lama.diperiksa++;
      try { await drive.files.get({ fileId: id, fields: 'id' }); baris.lama.terbaca++; } catch { /* dihitung di bawah */ }
    }
    if (baris.lama.terbaca < baris.lama.diperiksa) {
      baris.kode = 'lama_tak_terbaca';
      baris.pesan = `${baris.lama.diperiksa - baris.lama.terbaca} dari ${baris.lama.diperiksa} berkas lama yang diperiksa tidak terbaca akun ini.`;
      await catatKesehatan(tujuan, new Error(baris.pesan), 'lama_tak_terbaca');
      continue;
    }
    baris.ok = true;
    await catatKesehatan(tujuan);
  }

  try {
    const ringkas = JSON.stringify(hasil);
    await sql`INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_UJI_TERAKHIR}, ${ringkas}) ON DUPLICATE KEY UPDATE value = VALUES(value)`;
  } catch (e) { console.error('[drive] hasil uji gagal disimpan', e); }
  return hasil;
}

export interface BarisKesehatan {
  terakhir_ok: string | null; terakhir_gagal: string | null; pesan: string | null; kode: string | null;
  jumlah_ok: number; jumlah_gagal: number;
}
export interface StatusDrive {
  induk: { id: string; asal: 'panel' | 'env' | null };
  tujuan: { tujuan: DriveTujuan; terkonfigurasi: boolean; folderId: string; mode: 'induk' | 'env'; kesehatan: BarisKesehatan | null }[];
  arsip: { nama: string; ukuran: number | null; sha256: string | null; dibuat: string | null; file_id: string }[];
  backup: ReturnType<typeof backupBasi>;
  ujiTerakhir: HasilUji | null;
  salinan: RingkasSalinan | null;
  /** false = migrasi drive_arsip/drive_health belum dijalankan. */
  tabelAda: boolean;
}

/** Status panel — HANYA membaca DB; tidak memanggil Google dan tidak membuat folder. */
export async function bacaStatusDrive(): Promise<StatusDrive> {
  const induk = await folderInduk();
  let tabelAda = true;
  const kesehatan = new Map<string, BarisKesehatan>();
  try {
    const rows = await sql`SELECT tujuan, terakhir_ok_at, terakhir_gagal_at, pesan, kode, jumlah_ok, jumlah_gagal FROM drive_health` as Record<string, unknown>[];
    for (const r of rows) kesehatan.set(String(r.tujuan), {
      terakhir_ok: wib(r.terakhir_ok_at), terakhir_gagal: wib(r.terakhir_gagal_at),
      pesan: r.pesan == null ? null : String(r.pesan), kode: r.kode == null ? null : String(r.kode),
      jumlah_ok: Number(r.jumlah_ok ?? 0), jumlah_gagal: Number(r.jumlah_gagal ?? 0),
    });
  } catch { tabelAda = false; }

  const tujuan = await Promise.all(DRIVE_TUJUAN.map(async (t) => {
    const f = await folderTercatat(t);
    return { tujuan: t, terkonfigurasi: terkonfigurasiDengan(induk.id, t), folderId: f.id, mode: f.mode, kesehatan: kesehatan.get(t) ?? null };
  }));

  let arsip: StatusDrive['arsip'] = [];
  try {
    const rows = await sql`SELECT file_id, nama, ukuran, sha256, dibuat_pada FROM drive_arsip
                            WHERE tujuan = 'backup_db' AND dihapus_pada IS NULL ORDER BY dibuat_pada DESC, id DESC LIMIT ${sqlInt(10)}` as Record<string, unknown>[];
    arsip = rows.map((r) => ({
      file_id: String(r.file_id), nama: String(r.nama), ukuran: r.ukuran == null ? null : Number(r.ukuran),
      sha256: r.sha256 == null ? null : String(r.sha256), dibuat: wib(r.dibuat_pada),
    }));
  } catch { tabelAda = false; }

  let ujiTerakhir: HasilUji | null = null;
  try {
    const r = await sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_UJI_TERAKHIR} LIMIT 1` as { value?: unknown }[];
    if (r[0]?.value) ujiTerakhir = JSON.parse(String(r[0].value)) as HasilUji;
  } catch { ujiTerakhir = null; }

  let salinan: RingkasSalinan | null = null;
  try {
    const r = await sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_RINGKAS_SALINAN} LIMIT 1` as { value?: unknown }[];
    if (r[0]?.value) salinan = JSON.parse(String(r[0].value)) as RingkasSalinan;
  } catch { salinan = null; }

  return {
    induk, tujuan, arsip, tabelAda, ujiTerakhir, salinan,
    backup: backupBasi(kesehatan.get('backup_db')?.terakhir_ok ?? null, PROSES_MULAI, waktuSekarangWIB()),
  };
}
