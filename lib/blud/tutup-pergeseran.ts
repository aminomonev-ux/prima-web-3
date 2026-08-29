// lib/blud/tutup-pergeseran.ts — aturan "Tutup Pergeseran".
// Konsep lengkap: docs/CONCEPT-blud-tutup-pergeseran.md
//
// Menutup satu PUTARAN pergeseran: kolom P disalin ke kolom kiri, sehingga
// geseran berikutnya dihitung terhadap hasil putaran ini — bukan terhadap DPA
// murni. Tanpa ini, dokumen Februari berbunyi "menggeser 20 juta ke B" padahal
// itu kerjaan Januari; angka pagunya benar, dokumennya yang bohong — dan
// dokumen itulah bahan Rekap Penanggung Jawab.
//
// Dua keputusan yang membentuk seluruh berkas ini:
//
// 1. **Berhenti di FORM.** Tidak ada satu pun fungsi di sini yang menulis ke
//    database. Yang menulis tetap tombol Simpan halaman, dengan rumus tanggal
//    yang sudah ada (`sasaranSimpan`). Modal yang memegang tanggal versi DAN
//    jalur tulisnya sendiri adalah persis bentuk L78, dan itu sudah pernah
//    menimpa 558 baris bulan berjalan.
//
// 2. **Ini "tutup putaran", bukan "tutup bulan".** Batasnya kebijakan kantor —
//    tanggal terakhir unit lain boleh mengajukan pergeseran — jadi bisa jatuh di
//    tengah bulan dan bisa lebih dari sekali sebulan. Karena itu tidak ada
//    aturan "bulannya harus sudah lewat", dan penomorannya "Pergeseran ke-n".

import { recalcPergeseranJumlah } from './recalc'
import { akhirBulan, formatTanggalId, labelPeriodeVersi, tanggalPeriodeHistoris } from './tanggal'
import type { PergeseranBarisInput } from '@/types'

/** Satu peristiwa penutupan — cermin baris `blud_pergeseran_tutup`. */
export interface TutupPergeseran {
  versi_ditutup: string
  versi_basis:   string
  ditutup_pada:  string
  ditutup_oleh:  string | null
}

/**
 * Jejak audit — ikut body Simpan, pola persis `asal_salin`/`asal_pulihkan`.
 * Tidak ada kolom di `pergeseran_dpa` yang menyatakan "versi ini lahir dari
 * penutupan"; baris `blud_pergeseran_tutup` yang ditulis dari sinilah jawabannya.
 */
export interface AsalTutup {
  versi_ditutup: string
}

/**
 * Kolom P → kolom kiri. Angka pergeserannya sendiri TIDAK disentuh, dan itu
 * seluruh alasan penutupan ini tidak bisa mengganggu realisasi: pagu dibaca dari
 * kolom `pergeseran` versi terbaru, sedangkan `recalcPergeseranJumlah` menghitung
 * kolom itu dari `vol_p × harga_p` yang tetap sama persis.
 *
 * Urutannya penting dan bukan kerapian: recalc DULU, baru disalin. Kalau
 * dibalik, baris induk yang angkanya sempat tidak sinkron dengan anak-anaknya
 * akan mendapat `jumlah` dari nilai lama lalu `pergeseran`-nya dihitung ulang ke
 * nilai baru — hasilnya `bertambah_berkurang` bukan nol, dan Simpan langsung
 * ditolak PERGESERAN_TIDAK_BERIMBANG oleh angka yang tidak pernah digeser siapa
 * pun. Dengan urutan ini `jumlah` selalu diambil dari `pergeseran` yang SUDAH
 * final, jadi selisihnya nol secara konstruksi.
 *
 * `vol`/`harga` induk ikut `vol_p`/`harga_p` (biasanya null) — sederajat dengan
 * bentuk baris induk di DPA, yang angkanya juga datang dari anak-anaknya.
 */
export function tutupPergeseranRows(rows: PergeseranBarisInput[]): PergeseranBarisInput[] {
  return recalcPergeseranJumlah(rows).map(r => ({
    ...r,
    vol:                 r.vol_p,
    harga:               r.harga_p,
    jumlah:              r.pergeseran,
    bertambah_berkurang: 0,
  }))
}

/**
 * Nilai pemilih periode yang harus disetel sesudah penutupan. `''` berarti
 * "bulan berjalan" — yaitu hari ini, lewat `sasaranSimpan`.
 *
 * Ini SATU-SATUNYA tempat di aplikasi yang memindahkan sasaran Simpan dari
 * sebuah aksi, dan pengecualiannya disengaja. L80 melarangnya untuk "Salin dari
 * Versi Lain" karena di sana memindahkan sasaran adalah efek samping yang tidak
 * diminta siapa pun; di sini periode berikutnya ADALAH pekerjaannya. Syaratnya
 * tetap: perpindahannya terlihat (chip periode berganti) dan disebutkan lebih
 * dulu di konfirmasi.
 *
 * Yang ditutup arsip periode (mis. 31 Jan) → basisnya milik bulan berikutnya.
 * Kalau bulan itu sendiri sudah lewat, ia punya tanggal kanoniknya; kalau belum,
 * jatuh ke bulan berjalan. Yang ditutup revisi harian → basisnya hari ini.
 */
export function periodeSetelahTutup(versiDitutup: string, sekarang: number = Date.now()): string {
  if (!tanggalPeriodeHistoris(versiDitutup, sekarang)) return ''

  const tahun = Number(versiDitutup.slice(0, 4))
  const bulan = Number(versiDitutup.slice(5, 7))
  // Desember tidak punya bulan berikutnya DI TAHUN ITU. Basisnya jatuh ke bulan
  // berjalan, dan `alasanTolakTutup` yang memutuskan apakah itu masuk akal —
  // menebak tahun berikutnya di sini akan melahirkan versi bertahun-anggaran
  // sama tapi bertanggal tahun lain, tepat kebingungan yang §2 hindari.
  if (bulan >= 12) return ''

  const berikut = akhirBulan(tahun, bulan + 1)
  return tanggalPeriodeHistoris(berikut, sekarang) ? berikut : ''
}

/**
 * Dua pagar sasaran. Kosong = boleh disimpan.
 *
 * Keduanya diperiksa pada AKIBATNYA, bukan pada tebakan soal niat, dan itu yang
 * membuatnya cukup dua. Simpan itu hapus-lalu-tulis-ulang per
 * `(tahun, versi_tanggal)`, jadi setiap sasaran yang sudah dihuni berarti
 * dokumen orang lain hilang tanpa sisa — termasuk dokumen yang sedang ditutup.
 *
 * @param versiTerpakai daftar `versi_tanggal` yang sudah ada di tahun itu
 */
export function alasanTolakTutup(
  sasaran: string,
  versiDitutup: string,
  versiTerpakai: readonly string[],
): string {
  if (!versiDitutup) return 'Tidak ada versi pergeseran yang sedang dibuka untuk ditutup.'

  if (sasaran <= versiDitutup) {
    // `sasaran === versiDitutup` cuma bisa terjadi satu cara: versi yang ditutup
    // BERTANGGAL HARI INI (`periodeSetelahTutup` memulangkan '' → sasaran = hari
    // ini). Jadi kalimatnya boleh menyebutnya langsung.
    //
    // JANGAN menyuruh "pilih periode setelah tanggal ini": pemilih periode hanya
    // menawarkan bulan yang SUDAH lewat (`periodeHistorisTersedia`, batas =
    // bulan ini − 1), jadi tanggal sesudah hari ini tidak pernah ada di sana —
    // sama cacatnya dengan penolakan sasaran-dihuni yang sudah diperbaiki.
    //
    // Dan JANGAN pula diam-diam membidik besok. `periodeUntukVersi` memulangkan
    // '' untuk tanggal yang bukan akhir bulan lampau, jadi sesudah Simpan ke
    // besok pemilih periode pulang ke "bulan berjalan" dan koreksi BERIKUTNYA
    // mendarat di hari ini — menimpa versi yang barusan ditutup. Itu L79 lahir
    // kembali, dengan akibat yang lebih parah.
    return sasaran === versiDitutup
      ? `Versi ini disimpan hari ini juga, jadi belum bisa ditutup sekarang.\n`
        + `Hasil penutupan selalu jadi versi baru, sedangkan satu tanggal cuma bisa berisi satu `
        + `versi. Kalau diteruskan, yang tertimpa malah versi ${formatTanggalId(versiDitutup)} ini, `
        + `dan catatan geserannya ikut hilang.\n`
        + `Coba lagi besok. Hasilnya nanti tersimpan sebagai versi besok.`
      : `Basis akan disimpan ke ${formatTanggalId(sasaran)}, lebih dulu dari versi yang ditutup `
        + `(${formatTanggalId(versiDitutup)}). Hasil penutupan harus mendarat sesudahnya.`
  }

  if (versiTerpakai.includes(sasaran)) {
    // JANGAN menyuruh "pilih periode lain": sasaran penutupan tidak dipilih
    // orang, ia diturunkan dari versi yang ditutup (`periodeSetelahTutup`).
    // Kalimat yang menawarkan tindakan yang tidak bisa dilakukan lebih buruk
    // daripada penolakan polos — orangnya mencari tombol yang tidak ada.
    return `${formatTanggalId(sasaran)} sudah punya versi pergeseran, dan basis penutupan `
      + `akan menimpanya. Biasanya ini berarti hasil putaran ini memang sudah dibawa ke sana. `
      + `Kalau memang perlu diulang, hapus dulu versi ${formatTanggalId(sasaran)} di menu Pengaturan.`
  }

  return ''
}

/**
 * Nomor putaran sebuah versi — DIHITUNG dari urutan, tidak pernah disimpan.
 * Menyimpannya berarti baca-lalu-tulis pada sebuah penghitung, anti-pattern L55.
 * Memulangkan 0 kalau versi itu belum pernah ditutup.
 */
export function nomorPutaran(daftar: readonly TutupPergeseran[], versiDitutup: string): number {
  const urut = [...daftar].sort((a, b) => a.versi_ditutup.localeCompare(b.versi_ditutup))
  return urut.findIndex(t => t.versi_ditutup === versiDitutup) + 1
}

/** Label daftar versi: "Pergeseran ke-2 · ditutup 21 Jan 2027". */
export function labelTutup(daftar: readonly TutupPergeseran[], versiDitutup: string): string {
  const n = nomorPutaran(daftar, versiDitutup)
  if (!n) return ''
  const t = daftar.find(x => x.versi_ditutup === versiDitutup)
  return `Pergeseran ke-${n}${t ? ` · ditutup ${formatTanggalId(t.versi_basis)}` : ''}`
}

/**
 * Keterangan satu versi di daftar/pil: apa perannya dalam penutupan.
 * `undefined` = versi biasa.
 *
 * Dua peran berbeda dan keduanya perlu terbaca: versi yang DITUTUP (dokumen
 * putaran itu) dan versi BASIS yang lahir darinya. Tanpa keduanya, daftar versi
 * cuma deretan tanggal dan "kenapa versi ini selisihnya nol" tidak terjawab di
 * mana pun.
 *
 * Tinggal di lib, bukan di berkas layar: dipakai layar Pergeseran DAN layar
 * Cetak. Dua salinan aturan yang sama adalah cara L78 lahir.
 */
export function catatanVersi(
  daftar: readonly TutupPergeseran[], versiTanggal: string,
): string | undefined {
  if (daftar.some(t => t.versi_ditutup === versiTanggal)) return labelTutup(daftar, versiTanggal)
  const basisDari = daftar.find(t => t.versi_basis === versiTanggal)
  return basisDari ? `basis dari ${formatTanggalId(basisDari.versi_ditutup)}` : undefined
}

/** Ringkasan sasaran untuk lembar konfirmasi — "Periode Februari 2026" / "hari ini". */
export function labelSasaranTutup(sasaran: string, periode: string): string {
  return periode ? labelPeriodeVersi(periode) : `${formatTanggalId(sasaran)} (bulan berjalan)`
}

/**
 * Total pagu tahun itu menurut kolom `pergeseran` baris AKAR. Ditampilkan
 * sebelum dan sesudah penutupan di lembar konfirmasi.
 *
 * Bukan hiasan: kedua angka WAJIB sama. Penutupan tidak menyentuh `vol_p`/
 * `harga_p`, jadi kalau totalnya sampai bergeser, ada yang salah — dan orangnya
 * melihatnya sebelum menekan Simpan, bukan sesudah.
 */
export function totalPaguAkar(rows: readonly PergeseranBarisInput[]): number {
  return rows.reduce((s, r) => (r.parent_id ? s : s + (r.pergeseran ?? 0)), 0)
}
