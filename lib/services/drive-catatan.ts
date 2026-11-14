// lib/services/drive-catatan.ts — satu pintu UNGGAH ke tujuan Drive + catatannya.
// Konsep: docs/CONCEPT-drive-terpusat.md §5.2–§5.3, §6.3 Tahap 2.
//
// `unggahKeTujuan` = folder tujuan (`folderUntuk`) → unggah → manifest `drive_arsip` →
// kesehatan `drive_health`. Pemanggil baru WAJIB lewat sini, bukan `uploadBufferToDrive`
// langsung, supaya panel "Drive & Backup" melihat semua jalur.
//
// Catatan adalah CATATAN, bukan pagar (§6.3 no. 3): gagal menulisnya (mis. migrasi
// belum dijalankan) tidak pernah menggagalkan unggahan.
import { createHash } from 'node:crypto';
import { sql } from '@/lib/data/db';
import { jenisGalatDrive, uploadBufferToDrive } from '@/lib/services/drive';
import { folderUntuk, type DriveTujuan } from '@/lib/services/drive-tujuan';

/** Pesan galat dipotong — kolomnya VARCHAR(255), dan pesan Google bisa memuat isi respons panjang. */
export function ringkasGalat(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err ?? '');
  return m.replace(/\s+/g, ' ').trim().slice(0, 250) || 'galat tidak dikenal';
}

/** `galat` kosong = berhasil. `kode` menimpa golongan dari `jenisGalatDrive` (mis. 'lama_tak_terbaca' dari Uji). */
export async function catatKesehatan(tujuan: DriveTujuan, galat?: unknown, kodeTimpa?: string): Promise<void> {
  try {
    if (galat === undefined) {
      await sql`INSERT INTO drive_health (tujuan, terakhir_ok_at, jumlah_ok) VALUES (${tujuan}, NOW(), 1)
                ON DUPLICATE KEY UPDATE terakhir_ok_at = NOW(), jumlah_ok = jumlah_ok + 1`;
    } else {
      const kode = kodeTimpa ?? jenisGalatDrive(galat);
      const pesan = ringkasGalat(galat);
      await sql`INSERT INTO drive_health (tujuan, terakhir_gagal_at, pesan, kode, jumlah_gagal) VALUES (${tujuan}, NOW(), ${pesan}, ${kode}, 1)
                ON DUPLICATE KEY UPDATE terakhir_gagal_at = NOW(), pesan = VALUES(pesan), kode = VALUES(kode), jumlah_gagal = jumlah_gagal + 1`;
    }
  } catch (e) { console.error('[drive] catatan kesehatan gagal ditulis', e); }
}

export async function catatArsip(o: {
  tujuan: DriveTujuan; fileId: string; nama: string; ukuran: number | null; sha256: string | null; folderId: string;
}): Promise<void> {
  try {
    await sql`INSERT IGNORE INTO drive_arsip (tujuan, file_id, nama, ukuran, sha256, folder_id, sumber, dibuat_pada)
              VALUES (${o.tujuan}, ${o.fileId}, ${o.nama.slice(0, 255)}, ${o.ukuran}, ${o.sha256}, ${o.folderId}, 'aplikasi', NOW())`;
  } catch (e) { console.error('[drive] manifest gagal ditulis', e); }
}

export class FolderBelumDiaturError extends Error {
  constructor(public tujuan: DriveTujuan) {
    super(`Folder Drive untuk "${tujuan}" belum diatur (folder induk di Admin Panel, atau GOOGLE_DRIVE_FOLDER_ID_* di .env.local).`);
    this.name = 'FolderBelumDiaturError';
  }
}

/**
 * Unggah ke tujuan. Melempar bila folder belum diatur atau Google menolak — kegagalannya
 * SUDAH tercatat di `drive_health` sebelum dilempar, jadi pemanggil cukup menangani pesannya.
 * Folder yang belum diatur bukan kegagalan sambungan: tidak dicatat sebagai gagal.
 */
export async function unggahKeTujuan(tujuan: DriveTujuan, o: { buffer: Buffer; name: string; mimeType: string }): Promise<{ fileId: string; name: string; size: number | null; folderId: string }> {
  let folderId = '';
  try {
    folderId = await folderUntuk(tujuan);
    if (!folderId) throw new FolderBelumDiaturError(tujuan);
    const hasil = await uploadBufferToDrive({ ...o, folderId });
    if (!hasil.fileId) throw new Error('Drive tidak mengembalikan id berkas.');
    const sha256 = createHash('sha256').update(o.buffer).digest('hex');
    await Promise.all([
      catatArsip({ tujuan, fileId: hasil.fileId, nama: hasil.name, ukuran: hasil.size, sha256, folderId }),
      catatKesehatan(tujuan),
    ]);
    return { ...hasil, folderId };
  } catch (e) {
    if (!(e instanceof FolderBelumDiaturError)) await catatKesehatan(tujuan, e);
    throw e;
  }
}
