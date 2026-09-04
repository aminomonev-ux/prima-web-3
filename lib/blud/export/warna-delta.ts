// lib/blud/export/warna-delta.ts — hijau/merah kolom Bertambah, Berkurang, Selisih.
//
// SATU tempat untuk tiga jalur keluaran: pratinjau HTML sudah punya warnanya
// sendiri di `cetak-data.ts`, sedangkan Excel dan PDF sebelumnya mencetak
// ketiganya hitam polos — jadi berkas yang beredar tidak menunjukkan mana yang
// naik dan mana yang turun, padahal itu satu-satunya hal yang dicari orang di
// dokumen pergeseran.
//
// Arahnya ditentukan dari NAMA kolom, bukan nomornya: nomor kolom sudah pernah
// diam waktu kolom lain disisipkan di depannya, dan akibatnya dokumen
// menyembunyikan kolom yang salah selama berminggu-minggu tanpa satu galat pun.

export type ArahDelta = 'naik' | 'turun'

/**
 * Hex tanpa awalan alfa — pemanggil menambahkan sendiri bentuk yang dibutuhkan
 * (`FF…` untuk exceljs, larik RGB untuk jspdf).
 *
 * SENGAJA bukan warna yang sama persis dengan layar. Layar memakai #6EE7B7 dan
 * #FCA5A5, dua warna yang dipilih untuk latar gelap dan nyaris tak terbaca di
 * atas kertas putih. Yang dipakai di sini `financial-up`/`financial-down` milik
 * design system — token yang memang diperuntukkan bagi delta tabel seperti ini.
 */
export const HEX_NAIK = '1D9E75'
export const HEX_TURUN = 'E24B4A'

export const RGB_NAIK: [number, number, number] = [0x1D, 0x9E, 0x75]
export const RGB_TURUN: [number, number, number] = [0xE2, 0x4B, 0x4A]

const KOLOM_NAIK = 'Bertambah'
const KOLOM_TURUN = 'Berkurang'
const KOLOM_BERTANDA = 'Selisih'

/**
 * Arah warna satu sel, atau `null` kalau kolomnya bukan kolom delta — atau
 * angkanya nol.
 *
 * Nol dibiarkan hitam dengan sengaja: pada dokumen 558 baris, yang benar-benar
 * bergeser cuma segelintir, dan mewarnai semuanya membuat yang segelintir itu
 * tenggelam. Ini sama dengan yang dilakukan pratinjau HTML.
 */
export function arahDelta(namaKolom: string, nilai: unknown): ArahDelta | null {
  if (namaKolom !== KOLOM_NAIK && namaKolom !== KOLOM_TURUN && namaKolom !== KOLOM_BERTANDA) {
    return null
  }
  const n = typeof nilai === 'number' ? nilai : Number(nilai)
  if (!Number.isFinite(n) || n === 0) return null
  // Berkurang disimpan sebagai angka POSITIF — merahnya dari kolomnya, bukan
  // dari tandanya. Hanya Selisih yang bertanda.
  if (namaKolom === KOLOM_NAIK) return 'naik'
  if (namaKolom === KOLOM_TURUN) return 'turun'
  return n > 0 ? 'naik' : 'turun'
}
