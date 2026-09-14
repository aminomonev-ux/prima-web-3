// lib/security/pemeliharaan.ts — pemberitahuan pemeliharaan untuk halaman login (Fase F Tahap 17, K2).
//
// K2 diputuskan pemilik (2026-09-14): pemberitahuan pemeliharaan boleh dibaca SEBELUM login,
// dan login tetap bisa. Karena itu yang dipulangkan cuma yang memang ditulis untuk pemakai:
// nama sakelar penyebab, keterangannya, dan tenggatnya — tidak ada siapa yang menyetel.
//
// Aturannya di registry (`daftarPemeliharaanDari`), bukan di sini: halaman `/maintenance`,
// kartu /menu, dan spanduk sudah membaca registry; pembaca dengan rumus sendiri adalah T1/T14.
import { sql } from '@/lib/data/db'
import { daftarPemeliharaanDari, KUNCI_PESAN, KUNCI_SAKELAR, KUNCI_SAMPAI } from '@/lib/registry/apps'

export type Pemberitahuan = { label: string; pesan: string; sampai: string; global: boolean }

/**
 * Gagal membaca DB = tidak ada pemberitahuan (pola `buktikan` di `/maintenance`). Halaman
 * login tidak boleh ikut roboh karena app_config tidak terbaca; pagar sesungguhnya tetap di
 * `modulMati`, yang menolak saat pembacaan gagal.
 */
export async function pemberitahuanPemeliharaan(): Promise<Pemberitahuan[]> {
  try {
    const rows = await sql`
      SELECT \`key\`, value FROM app_config
      WHERE \`key\` IN (${[...KUNCI_SAKELAR, ...KUNCI_PESAN, ...KUNCI_SAMPAI]})
    ` as { key: string; value: string }[]
    return daftarPemeliharaanDari(Object.fromEntries(rows.map((r) => [r.key, r.value])))
      .map((k) => ({ label: k.label, pesan: k.pesan, sampai: k.sampai, global: k.global }))
  } catch {
    return []
  }
}
