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
 * Kolom DATE dari MySQL → 'YYYY-MM-DD'.
 *
 * Pool memakai `timezone: '+07:00'`, jadi mysql2 menafsirkan kolom DATE sebagai
 * tengah malam di +07:00. Di server UTC, `toISOString()` menggesernya balik dan
 * bisa memulangkan tanggal SEBELUMNYA — 2026-07-01 tampil 30 Jun. Offset yang
 * sama ditambahkan supaya string ISO-nya mewakili tengah malam DATE aslinya.
 *
 * Tinggal di sini, bukan di `data.ts`, supaya `riwayat-simpan.ts` bisa
 * memakainya tanpa membentuk lingkaran modul — `data.ts` memanggil pencatat
 * riwayat, jadi arah impornya tidak boleh berbalik. `data.ts` me-re-export ini
 * agar 38 pemanggil lama tidak perlu disentuh.
 */
export function toDateStr(v: unknown): string {
  if (!v) return ''
  if (v instanceof Date) {
    return new Date(v.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10)
  }
  return String(v).slice(0, 10)
}

/**
 * Saat ini menurut WIB dalam bentuk `YYYY-MM-DD HH:MM:SS` — siap masuk kolom
 * DATETIME MySQL. Dipakai `disimpan_pada` di `blud_riwayat_simpan`.
 *
 * SENGAJA bukan `NOW()` MySQL: `versi_tanggal` ditetapkan klien lewat
 * `tanggalHariIniWIB` di atas, sedangkan `NOW()` mengikuti zona server. Kalau
 * servernya UTC, tanggal keduanya bisa berbeda pada dini hari WIB dan snapshot
 * terlihat nyasar dari versinya. Satu tetapan (`JAKARTA_OFFSET_MS`) untuk dua
 * angka yang harus sepakat.
 *
 * Juga bukan `.toISOString()` apa adanya: MySQL menolak sisipan 'T' dan 'Z'.
 *
 * @param sekarang epoch ms — parameter hanya untuk pengujian.
 */
export function waktuSekarangWIB(sekarang: number = Date.now()): string {
  return new Date(sekarang + JAKARTA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}

// ─── PERIODE VERSI HISTORIS ──────────────────────────────────────────────────
// Aplikasi bisa mulai dipakai di tengah tahun; bulan-bulan sebelumnya perlu punya
// versi DPA/Pergeseran sendiri supaya bisa dicetak sebagai dokumen bulanan.

/** Hari terakhir bulan itu, 'YYYY-MM-DD'. Februari kabisat ikut benar (hari 0 bulan berikutnya). */
export function akhirBulan(tahun: number, bulan: number): string {
  const hari = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate()
  return `${tahun}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`
}

export interface PeriodeVersi {
  bulan:   number
  label:   string
  tanggal: string
}

const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

/**
 * '2026-07-31' → 'Juli 2026'. Nilai yang tidak dikenali dikembalikan apa adanya.
 *
 * Dipakai dua tempat yang harus berbunyi sama: daftar pilihan di bawah, dan
 * `PeriodeVersiSelect` saat harus menampilkan periode yang bulannya SUDAH punya
 * versi — periode itu tidak ada di daftar, jadi labelnya tidak bisa diambil
 * dari sana.
 */
export function labelPeriodeVersi(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(tanggal))
  if (!m) return String(tanggal)
  return `${BULAN_PANJANG[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}

/**
 * Bulan mana saja yang boleh dipilih sebagai versi historis.
 *
 * Dua syarat, dan keduanya punya alasan berbeda:
 *
 * 1. **Sudah lewat.** Bulan berjalan sengaja TIDAK ditawarkan. Tanggal kanoniknya
 *    hari terakhir bulan, jadi "Agustus" akan jadi 31 Agustus — lebih baru dari
 *    hari ini (26 Agustus) dan merebut `MAX(versi_tanggal)` dari versi hari ini.
 *    Pagu tahun berjalan akan pindah ke dokumen yang belum tentu final.
 *
 * 2. **Belum punya versi.** Bukan "hanya boleh sekali di awal": aturan begitu jadi
 *    jebakan bagi orang yang mengisi Januari lalu sadar butuh Februari. Daftarnya
 *    menyusut sendiri sampai habis, jadi tidak perlu penanda "sudah pernah".
 *
 * Tahun selain tahun berjalan: seluruh 12 bulannya sudah lewat.
 *
 * @param versiTerpakai daftar `versi_tanggal` yang sudah ada di tahun itu
 */
export function periodeHistorisTersedia(
  tahun: number,
  versiTerpakai: readonly string[],
  sekarang: number = Date.now(),
): PeriodeVersi[] {
  const hariIni = tanggalHariIniWIB(sekarang)
  const tahunIni = Number(hariIni.slice(0, 4))
  const bulanIni = Number(hariIni.slice(5, 7))
  if (tahun > tahunIni) return []

  const terpakai = new Set(versiTerpakai.map(v => String(v).slice(0, 7)))
  const batas = tahun < tahunIni ? 12 : bulanIni - 1

  const hasil: PeriodeVersi[] = []
  for (let b = 1; b <= batas; b++) {
    const tanggal = akhirBulan(tahun, b)
    if (terpakai.has(tanggal.slice(0, 7))) continue
    hasil.push({ bulan: b, label: labelPeriodeVersi(tanggal), tanggal })
  }
  return hasil
}

/**
 * Apakah `tanggal` itu tanggal kanonik sebuah PERIODE historis — hari terakhir
 * bulan yang sudah lewat?
 *
 * Bedanya penting, dan bukan soal rapi-rapian. Ada dua jenis versi di tabel
 * yang sama:
 *
 *   • 2026-08-27 — revisi harian biasa, lahir pada hari orang menyimpannya.
 *   • 2026-07-31 — arsip periode, lahir karena seseorang SENGAJA memilih
 *     "Periode Juli" di pemilih periode. Tanggalnya tidak pernah kebetulan.
 *
 * Yang membedakan hanya bentuk tanggalnya, jadi di sinilah pembedanya tinggal.
 */
export function tanggalPeriodeHistoris(tanggal: string, sekarang: number = Date.now()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(tanggal))
  if (!m) return false
  if (tanggal !== akhirBulan(Number(m[1]), Number(m[2]))) return false
  // Akhir bulan BERJALAN masih di depan, jadi ia bukan periode historis —
  // `periodeHistorisTersedia` juga tidak pernah menawarkannya.
  return tanggal < `${tanggalHariIniWIB(sekarang).slice(0, 8)}01`
}

/**
 * Nilai pemilih periode yang MEWAKILI sebuah `versi_tanggal` di layar.
 *
 * Pemilih periode dan versi yang dibuka harus menunjuk hal yang sama — kalau
 * tidak, Simpan menulis ke tempat yang berbeda dari yang dibaca layar. Itu bug
 * yang dilaporkan (L78b), dan ia punya empat pintu: memilih periode, membuka
 * versi dari daftar, memulihkan snapshot, dan selesai menyimpan. Keempatnya
 * lewat sini supaya jawabannya satu.
 *
 * Revisi harian memulangkan '' — SENGAJA. Membuka revisi 27 Agustus lalu
 * menekan Simpan harus melahirkan revisi HARI INI, seperti sedia kala; kalau
 * pemilih periode ikut mengunci ke 27 Agustus, tiap penyuntingan menimpa revisi
 * kemarin dan riwayat harian berhenti tumbuh. Yang dikunci hanya arsip periode,
 * karena di situlah "simpan lagi" memang harus mendarat di bulan yang sama.
 */
export function periodeUntukVersi(versiTanggal: string, sekarang: number = Date.now()): string {
  return tanggalPeriodeHistoris(versiTanggal, sekarang) ? versiTanggal : ''
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
