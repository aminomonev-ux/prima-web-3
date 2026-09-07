// lib/kinerja/versi.ts — satu aturan "versi mana yang paling belakang".
//
// PURE: tidak menyentuh DB, React, maupun jaringan — supaya aturannya bisa
// diuji perilakunya, bukan cuma teks sumbernya.
//
// L88 lahir karena modul ini pernah punya TIGA jawaban untuk "versi mana yang
// dipakai", dan tiga layar akhirnya mengukur realisasi yang sama terhadap tiga
// pagu. Aturannya sekarang satu, dan tinggal di sini.
//
// YANG BERBEDA ANTAR-PEMANGGIL BUKAN ATURANNYA, MELAINKAN DAFTAR MASUKANNYA —
// dan itu perbedaan yang memang harus ada:
//
//   `versiAktifKinerja`  memberi baris yang `is_nullified = FALSE`. Ia menjawab
//                        "versi mana yang jadi PENGUKUR" — baris yang dinol-kan
//                        tidak punya pagu, jadi tidak boleh ikut menghitung.
//   `reset`              memberi SEMUA slot versi yang tersisa. Ia menjawab
//                        "slot mana yang tidak punya penerus lagi", supaya
//                        kuncinya dibuka. Versi yang seluruh barisnya dinol-kan
//                        tetap sebuah slot yang ada di pemilih versi dan tetap
//                        boleh disunting — menyaringnya justru akan membuka
//                        kunci versi yang MASIH punya turunan, persis keadaan
//                        yang balapan 1B di scripts/test-kinerja-race-versi.mjs
//                        buktikan merusak.
//
// Konsep: docs/AUDIT-kinerja-2026-09-04.md §A7

/**
 * PERUBAHAN mengalahkan MURNI; di antara sesama PERUBAHAN, `versi_seq` tertinggi
 * yang menang.
 *
 * Sengaja BUKAN `ORDER BY versi_seq DESC, versi_tipe DESC` di SQL: itu kebetulan
 * memberi jawaban yang sama hanya selama MURNI selalu ber-seq 0, dan urutan
 * `versi_tipe` di situ bergantung pada urutan deklarasi ENUM-nya — dua hal yang
 * tidak tertulis di mana pun dan bisa berubah tanpa ada yang sadar.
 */
export function pickVersiAktif<T extends { versi_tipe?: unknown; versi_seq?: unknown }>(
  rows: T[],
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best) { best = r; continue; }
    const rp = r.versi_tipe === 'PERUBAHAN' ? 1 : 0;
    const bp = best.versi_tipe === 'PERUBAHAN' ? 1 : 0;
    if (rp > bp || (rp === bp && Number(r.versi_seq ?? 0) > Number(best.versi_seq ?? 0))) best = r;
  }
  return best;
}

/**
 * A9 — DAFTAR CALON LENGKAP, ANGKANYA DISARING.
 *
 * Satu saringan pernah mengerjakan dua pekerjaan: `WHERE is_nullified = FALSE`
 * benar untuk MENGHITUNG pagu, tapi ia juga menentukan versi mana yang masuk
 * daftar calon — jadi versi yang SELURUH barisnya dinol-kan tidak menghasilkan
 * satu baris pun, hilang dari `GROUP BY`, dan versi SEBELUMNYA diambil sebagai
 * "berlaku". Akibatnya menol-kan seluruh isi sebuah Perubahan tidak berpengaruh
 * apa pun: angkanya MUNDUR ke versi yang sudah digantikan, bukan turun ke nol,
 * dan ia melaporkan pagu LEBIH BESAR dari kenyataan tanpa satu spanduk pun.
 *
 * Karena itu pemanggilnya membaca calonnya TANPA saringan dan menjumlah dengan
 * `SUM(CASE WHEN is_nullified = FALSE …)`. Fungsi ini yang menyatukan keduanya,
 * dan itu sebabnya ia ada: bentuk yang sama diulang di EMPAT tempat
 * (`versiAktifKinerja`, `getLaporanData`, `getLaporanSemua`, `getKinerjaKpi`),
 * dan empat salinan aturan cepat atau lambat berbeda pendapat (L88).
 *
 * `dinolkan` dipulangkan, bukan disimpulkan pemanggilnya dari "pagu === 0":
 * pagu nol punya DUA sebab yang sangat berbeda — belum diisi, dan sengaja
 * dinol-kan — dan layar wajib bisa membedakannya.
 */
export interface BarisVersiAgregat {
  versi_tipe?: unknown;
  versi_seq?: unknown;
  /** COUNT(*) seluruh baris versi ini, termasuk yang dinol-kan. */
  baris?: unknown;
  /** Baris yang `is_nullified = FALSE` — yang angkanya ikut dihitung. */
  baris_aktif?: unknown;
}

export function pilihVersiAgregat<T extends BarisVersiAgregat>(rows: T[]): {
  versi: { tipe: 'MURNI' | 'PERUBAHAN'; seq: number } | null;
  agregat: T | null;
  dinolkan: boolean;
} {
  const aktif = pickVersiAktif(rows);
  if (!aktif) return { versi: null, agregat: null, dinolkan: false };
  return {
    versi: {
      tipe: aktif.versi_tipe === 'PERUBAHAN' ? 'PERUBAHAN' : 'MURNI',
      seq:  Number(aktif.versi_seq ?? 0),
    },
    agregat: aktif,
    // `baris > 0` BUKAN jaga kosong: pemanggil yang lupa memilih kedua kolom
    // hitungan membuat keduanya terbaca 0, dan tanpa pagar ini SETIAP versi
    // akan mengaku habis dinol-kan — layar penuh spanduk untuk keadaan yang
    // tidak terjadi. Kolom yang lupa didaftar itu cacat yang sudah berulang di
    // repo ini (row-map DPA), jadi pagarnya berdiri di sisi yang aman: tanpa
    // bukti, jawabannya "tidak dinol-kan".
    dinolkan: Number(aktif.baris ?? 0) > 0 && Number(aktif.baris_aktif ?? 0) === 0,
  };
}

// ─── Memilih versi saat mencetak Rekap ───────────────────────────────────────
//
// Perubahan anggaran terjadi di tengah tahun — tidak selalu Agustus, sering
// Oktober — dan sesudahnya ada DUA dokumen yang dua-duanya sah. Datanya sudah
// utuh di basis data (tiap versi disalin lengkap oleh `ssk/perubahan`), yang
// belum ada cuma cara memintanya.
//
// SENGAJA dua keadaan, bukan pemilih per sumber: Rekap menjumlah SEMUA sumber
// sekaligus dan tiap sumber punya riwayat versinya sendiri (GAJI bisa sudah
// PERUBAHAN-1 sementara BLUD masih MURNI). Sumber yang belum berperubahan
// memberi angka yang SAMA di kedua pilihan, jadi pilihannya tidak pernah
// menyesatkan untuk sumber itu.
//
// Konsep: docs/CONCEPT-kinerja-pilih-versi-rekap.md

export type PilihanVersiRekap = 'berlaku' | 'murni';

/** Satu slot versi dari `GET /api/kinerja/ssk/versi-list`. */
export interface SlotVersiSsk { versi_tipe?: unknown; versi_seq?: unknown }

/** Versi yang dipakai satu sumber. `tipe: null` = tidak ada versi untuk pilihan ini. */
export interface VersiSumberRekap {
  sumber: string;
  tipe: 'MURNI' | 'PERUBAHAN' | null;
  seq: number;
}

/**
 * "berlaku" = versi paling belakang, persis yang dipakai seluruh layar lain.
 * "murni"   = versi MURNI paling belakang, yaitu dokumen sebelum Perubahan.
 *
 * BUKAN `{ tipe: 'MURNI', seq: 0 }` mati: nomor urut MURNI tidak dijamin 0 di
 * mana pun (lihat alasan `pickVersiAktif` menolak ORDER BY), jadi menuliskannya
 * berarti memasang kembali andaian yang sudah pernah ditolak di berkas ini.
 *
 * Null kalau sumbernya tidak punya slot yang cocok — dan itu keadaan yang NYATA,
 * bukan jaga-jaga: `parent_versi_id` ber-ON DELETE SET NULL, jadi MURNI bisa
 * dihapus lewat Reset sementara PERUBAHAN-nya tetap hidup. Pemanggil WAJIB
 * memperlakukannya sebagai "tidak ada", bukan diam-diam jatuh ke versi berlaku:
 * layar yang berbunyi "murni" sambil menampilkan angka perubahan itu cacat yang
 * lebih buruk daripada tidak punya fiturnya.
 */
export function versiUntukPilihan<T extends SlotVersiSsk>(
  slot: T[],
  pilihan: PilihanVersiRekap,
): { tipe: 'MURNI' | 'PERUBAHAN'; seq: number } | null {
  const kandidat = pilihan === 'murni'
    ? slot.filter(r => r.versi_tipe !== 'PERUBAHAN')
    : slot;
  const pilih = pickVersiAktif(kandidat);
  if (!pilih) return null;
  return {
    tipe: pilih.versi_tipe === 'PERUBAHAN' ? 'PERUBAHAN' : 'MURNI',
    seq:  Number(pilih.versi_seq ?? 0),
  };
}

/** 'MURNI' · 'MURNI-1' · 'PERUBAHAN-1'. Seq 0 tidak ditulis: itu bunyi di layar RKO. */
export function labelVersi(tipe: 'MURNI' | 'PERUBAHAN', seq: number): string {
  return seq === 0 ? tipe : `${tipe}-${seq}`;
}

/**
 * Satu kalimat untuk kop dokumen DAN label layar.
 *
 * Kalimat lamanya "mengacu SSK versi aktif tiap sumber" menyebut ATURANNYA,
 * bukan versinya — jadi dua rekap yang diukur ke versi berbeda terbaca
 * identik, di layar maupun di berkasnya. Begitu versinya bisa dipilih, itu
 * berubah dari kurang informatif menjadi menyesatkan.
 *
 * Sumber yang tidak punya versi untuk pilihan ini disebut apa adanya, bukan
 * dihilangkan dari daftar: sumber yang lenyap tanpa keterangan adalah bentuk
 * cacat yang sama dengan A9.
 */
export function ringkasVersiRekap(daftar: VersiSumberRekap[], pilihan: PilihanVersiRekap): string {
  if (daftar.length === 0) return 'Belum ada versi SSK yang bisa diacu';
  const isi = daftar
    .map(v => v.tipe === null
      ? `${v.sumber} tidak punya versi ${pilihan === 'murni' ? 'murni' : 'aktif'}`
      : `${v.sumber} ${labelVersi(v.tipe, v.seq)}`)
    .join(' · ');
  return `Pagu & target mengacu SSK: ${isi}`;
}

/**
 * Sisipan nama berkas. Hanya pilihan NON-BAWAAN yang ditandai, supaya nama
 * berkas yang sudah beredar tidak berubah — dan nama tanpa sisipan selalu
 * berarti "versi berlaku", jadi tetap tak bermakna ganda. Gunanya nyata:
 * mengunduh kedua pilihan tidak saling menimpa di folder unduhan.
 */
export function imbuhanBerkasVersi(pilihan: PilihanVersiRekap): string {
  return pilihan === 'murni' ? 'Murni-' : '';
}

/**
 * Nama berkas unduhan Rekap — SATU fungsi untuk Excel dan PDF.
 *
 * Dipisah dari pemanggilnya supaya penjaganya bisa menguji PERILAKU, bukan
 * mencocokkan teks templatnya: pemeriksaan yang cuma menghitung kemunculan
 * `imbuhanBerkasVersi` tetap lulus walau imbuhannya dipasang di tempat yang
 * salah, dan nama berkas yang salah tempat baru terlihat sesudah orang
 * mengunduhnya.
 */
export function namaBerkasRekap(
  pilihan: PilihanVersiRekap,
  namaBulan: string,
  tahun: string,
  ekstensi: 'xlsx' | 'pdf',
): string {
  return `Rekap-SemuaSumber-${imbuhanBerkasVersi(pilihan)}sd-${namaBulan}-${tahun}.${ekstensi}`;
}
