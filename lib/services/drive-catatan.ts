// lib/services/drive-catatan.ts — satu pintu UNGGAH ke tujuan Drive + catatannya.
// Konsep: docs/konsep/sistem/CONCEPT-drive-terpusat.md §5.2–§5.3, §6.3 Tahap 2.
//
// `unggahKeTujuan` = folder tujuan (`folderUntuk`) → unggah → manifest `drive_arsip` →
// kesehatan `drive_health`. Pemanggil baru WAJIB lewat sini, bukan `uploadBufferToDrive`
// langsung, supaya panel "Drive & Backup" melihat semua jalur.
//
// Catatan adalah CATATAN, bukan pagar (§6.3 no. 3): gagal menulisnya (mis. migrasi
// belum dijalankan) tidak pernah menggagalkan unggahan.
import { createHash } from 'node:crypto';
import { sql } from '@/lib/data/db';
import { jenisGalatDrive, uploadBufferToDrive, perbaruiBerkasDrive, cariAtauBuatFolder, kodeGalatDrive } from '@/lib/services/drive';
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

/**
 * Unggah-atau-timpa untuk laporan berkala (CONCEPT-bba-revamp-alur §5B.2): `fileId` lama ditimpa di tempat; hilang/terhapus
 * (404) → dibuat baru. `subfolder` = folder di dalam folder tujuan (mis. per tahun), dibuat bila belum ada. Berkas BARU
 * masuk manifest `drive_arsip`; kesehatan dicatat dua-duanya.
 * Berkas lama yang ada di tempat sampah, atau tidak lagi di folder tujuan (folder induk diganti di Admin Panel), juga
 * dibuatkan berkas baru — kalau tidak, laporan terus diperbarui di tempat yang tidak dibuka siapa pun.
 */
export async function timpaDiTujuan(tujuan: DriveTujuan, o: { buffer: Buffer; name: string; mimeType: string; fileId?: string | null; subfolder?: string }): Promise<{ fileId: string; baru: boolean }> {
  try {
    const akar = await folderUntuk(tujuan);
    if (!akar) throw new FolderBelumDiaturError(tujuan);
    const folderId = o.subfolder ? (await cariAtauBuatFolder(akar, o.subfolder)).id : akar;
    if (o.fileId) {
      try {
        const h = await perbaruiBerkasDrive({ fileId: o.fileId, buffer: o.buffer, mimeType: o.mimeType });
        if (!h.trashed && (h.parents === null || h.parents.includes(folderId))) {
          await catatKesehatan(tujuan);
          return { fileId: h.fileId, baru: false };
        }
      } catch (e) { if (kodeGalatDrive(e) !== 404) throw e; }
    }
    const h = await uploadBufferToDrive({ buffer: o.buffer, name: o.name, mimeType: o.mimeType, folderId });
    if (!h.fileId) throw new Error('Drive tidak mengembalikan id berkas.');
    await Promise.all([
      catatArsip({ tujuan, fileId: h.fileId, nama: h.name, ukuran: h.size, sha256: createHash('sha256').update(o.buffer).digest('hex'), folderId }),
      catatKesehatan(tujuan),
    ]);
    return { fileId: h.fileId, baru: true };
  } catch (e) {
    if (!(e instanceof FolderBelumDiaturError)) await catatKesehatan(tujuan, e);
    throw e;
  }
}
