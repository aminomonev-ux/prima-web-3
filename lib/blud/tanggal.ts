// lib/blud/tanggal.ts — format tanggal versi BLUD, satu sumber untuk semua layar.
//
// Dipisah supaya VersiDropdown, pil "Pagu dari …", dan layar lain memakai bunyi
// yang sama persis. Sengaja parsing string YYYY-MM-DD dengan regex, BUKAN
// `new Date(iso)`: konstruktor Date menafsirkan tanggal polos sebagai UTC lalu
// menggesernya ke zona lokal, jadi 2026-07-01 bisa tampil 30 Jun.

const BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** "2026-07-26" → "26 Jul 2026". Nilai yang tidak dikenali dikembalikan apa adanya. */
export function formatTanggalId(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  if (!m) return String(iso)
  return `${m[3]} ${BULAN_ID[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/**
 * Selisih WIB terhadap UTC. Satu tetapan untuk dua sisi: `toDateStr` di
 * `data.ts` (server, membaca kolom DATE) dan `tanggalHariIniWIB` di bawah
 * (klien, menetapkan versi baru).
 */
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * Tanggal hari ini menurut WIB, bukan UTC.
 *
 * B4: `new Date().toISOString()` di browser mengembalikan tanggal KEMARIN antara
 * pukul 00:00–06:59 WIB. Dipakai sebagai `versi_tanggal`, simpanan dini hari
 * MENIMPA versi kemarin alih-alih membuka versi baru — dan tidak ada pagar yang
 * menahannya: `assertBludVersion` lolos (kuncinya memang kunci versi yang sedang
 * dibuka) dan ambang `SAFE_DROP_THRESHOLD` lolos (jumlah baris naik, bukan turun).
 *
 * @param sekarang epoch ms — parameter hanya untuk menguji batas pergantian hari.
 */
export function tanggalHariIniWIB(sekarang: number = Date.now()): string {
  return new Date(sekarang + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Angka kunci (`expected_version`) yang benar untuk versi yang AKAN ditulis.
 *
 * Kunci optimistik itu milik pasangan (tahun, versi_tanggal) — lihat `bludVersiKey`
 * — bukan milik layar. Menyimpan ke tanggal yang BUKAN versi yang sedang dibuka
 * berarti membuat versi BARU, dan versi yang belum ada selalu bermula dari 0.
 * Mengirim angka milik versi yang sedang dibuka membuat simpan pertama di setiap
 * hari baru ditolak "sudah diubah orang lain": versi kemarin sudah di angka 1,
 * sedangkan versi hari ini masih 0.
 *
 * Nol untuk versi baru bukan sekadar menyenangkan server. Kalau ternyata versi
 * tanggal itu SUDAH ada (rekan kerja mendahului pagi tadi), 0 tidak sama dengan
 * angkanya dan penolakannya justru benar — tanpa itu kita menimpa pekerjaan orang
 * lain tanpa satu pun peringatan.
 */
export function expectedVersionUntuk(
  targetTanggal: string, versiDibuka: string, versionDibuka: number,
): number {
  return targetTanggal === versiDibuka ? versionDibuka : 0
}
