// lib/services/drive-status.ts — aturan MURNI panel "Drive & Backup" (aman-klien: tanpa DB/Drive).
// Konsep: docs/CONCEPT-drive-terpusat.md §8, §10, §18.
import type { DriveTujuan } from '@/lib/services/drive-tujuan';

export const LABEL_TUJUAN: Record<DriveTujuan, string> = {
  backup_db:   'Backup database',
  lkjip:       'LKJIP — gambar & impor Word',
  lkjip_arsip: 'LKJIP — arsip Simpan Versi',
  blud_json:   'Cadangan JSON BLUD',
  bba:         'Buku Besar Aset — bukti & referensi',
  usulan:      'Lampiran usulan',
  salinan_lampiran: 'Salinan kedua lampiran (Drive)',
};

export type KodeUji = 'quota' | 'permission' | 'notfound' | 'token' | 'jaringan' | 'lain' | 'kosong' | 'lama_tak_terbaca';

/** Apa yang harus dilakukan operator, per kode. Satu kalimat, menyebut tempat membetulkannya. */
export const SARAN_KODE: Record<KodeUji, string> = {
  quota:            'Drive akun ini penuh — kosongkan Drive atau turunkan BACKUP_RETENTION.',
  permission:       'Akun token tidak boleh menulis ke folder ini — bagikan foldernya sebagai Editor ke akun itu.',
  notfound:         'Folder tidak ditemukan — ID salah, atau folder sudah dihapus/dipindah ke tempat sampah.',
  token:            'Refresh token ditolak (dicabut/kedaluwarsa/sandi akun diganti) — buat ulang GOOGLE_OAUTH_REFRESH_TOKEN.',
  jaringan:         'Server tidak bisa menghubungi Google — periksa internet keluar.',
  lain:             'Galat tak dikenal — lihat pesan di sampingnya.',
  kosong:           'Belum diatur — isi folder induk di atas, atau GOOGLE_DRIVE_FOLDER_ID_* di .env.local.',
  lama_tak_terbaca: 'Berkas lama tidak terbaca akun ini — pindah akun tanpa membagikan folder lama? Lihat konsep §11.',
};

/** Jam jadwal backup harian — sama dengan docs/PANDUAN-jadwal-backup.md. */
export const JAM_JADWAL_BACKUP = 12;
const HARI_MERAH = 4;
const MENIT_HIDUP_MINIMAL = 120;

export type TingkatBackup = 'aman' | 'kuning' | 'merah' | 'belum';

/** 'YYYY-MM-DD HH:MM:SS' (WIB) → menit sejak epoch. Bentuk lain → NaN. */
function menit(wib: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(wib);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60_000 : NaN;
}

/**
 * Apakah backup perlu dikhawatirkan. Semua waktu WIB 'YYYY-MM-DD HH:MM:SS'.
 *
 * Server PRIMA laptop yang mati tiap malam (A17), jadi "> 36 jam" berbunyi tiap Senin.
 * - merah: terakhir berhasil > 4 hari (libur panjang tetap tertangkap begitu laptop hidup);
 * - kuning: hari ini belum ada, padahal sudah lewat jadwal + 2 jam DAN aplikasi sudah hidup
 *   ≥ 2 jam (restart siang tidak memicu, laptop yang baru dinyalakan sore juga tidak; proses
 *   sejak kemarin otomatis lolos karena "lewat jadwal + 2 jam" sudah ≥ 14 jam sejak 00.00);
 * - belum: belum pernah tercatat (migrasi baru dijalankan / backup belum pernah naik).
 */
export function backupBasi(terakhirOk: string | null, prosesMulai: string, sekarang: string, jamJadwal = JAM_JADWAL_BACKUP): { tingkat: TingkatBackup; kalimat: string } {
  if (!terakhirOk || Number.isNaN(menit(terakhirOk))) {
    return { tingkat: 'belum', kalimat: 'Belum ada backup yang tercatat. Jalankan node scripts/backup-db.js sekali di server.' };
  }
  const kini = menit(sekarang);
  const selisihHari = (kini - menit(terakhirOk)) / (60 * 24);
  if (selisihHari > HARI_MERAH) {
    return { tingkat: 'merah', kalimat: `Backup terakhir berhasil ${Math.floor(selisihHari)} hari lalu — periksa tugas terjadwal & scripts\\backup-db.log.` };
  }
  const hariIni = sekarang.slice(0, 10);
  const awalHari = menit(`${hariIni} 00:00`);
  const jamKini = (kini - awalHari) / 60;
  if (terakhirOk.slice(0, 10) !== hariIni && jamKini >= jamJadwal + 2 && kini - menit(prosesMulai) >= MENIT_HIDUP_MINIMAL) {
    return { tingkat: 'kuning', kalimat: `Backup hari ini belum naik (jadwal pukul ${String(jamJadwal).padStart(2, '0')}.00).` };
  }
  return { tingkat: 'aman', kalimat: '' };
}

/**
 * Isian folder induk: ID polos, atau URL folder Drive yang ditempel apa adanya
 * (`…/drive/folders/<ID>?usp=sharing`, `…/drive/u/0/folders/<ID>`, `…open?id=<ID>`) → ID-nya.
 * Yang disimpan tetap ID (konsep §3 no. 3); server memeriksa bentuknya lagi.
 */
export function bacaIdFolder(teks: string): string {
  const t = teks.trim();
  const dariUrl = /\/folders\/([\w-]+)/.exec(t)?.[1] ?? /[?&]id=([\w-]+)/.exec(t)?.[1];
  return dariUrl ?? t;
}

/** Ukuran byte → teks pendek ("3,2 GB"). */
export function ukuranBerkas(b: number | null): string {
  if (b == null || !Number.isFinite(b)) return '—';
  const satuan = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, n = b;
  while (n >= 1024 && i < satuan.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: i ? 1 : 0 })} ${satuan[i]}`;
}
