// lib/security/beku.ts — keterangan mode BACA-SAJA untuk layar (P5).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P5 (Tahap 9).
//
// Terpisah dari `guard.ts` karena pertanyaannya berbeda arah. `guard.ts` menjawab
// "tolak atau lanjut"; berkas ini menjawab "apa yang harus tertulis di layar". Yang
// pertama dipanggil ratusan kali per permintaan dan harus murah; yang kedua sekali per
// layar dan boleh membawa kalimat.
//
// Kenapa keterangannya wajib ada: tombol simpan yang mati tanpa sebab adalah cacat
// tersendiri (L79c). Pembekuan yang benar tapi diam menghasilkan orang yang mengira
// aplikasinya rusak, lalu menelepon — persis yang P6 hindari untuk sakelar mati.
import { sql } from '@/lib/data/db'
import { formatSampai, keadaanTerburuk, kunciPesan, kunciSampai } from '@/lib/registry/apps'
import { PERAN_TEMBUS_SAKELAR } from '@/lib/security/guard'

export type InfoBeku = {
  /** Modulnya memang sedang dibekukan — apa pun peran yang bertanya. */
  beku: boolean
  /** Peran ini menembus pembekuan (SUPER_ADMIN), jadi ia MASIH bisa menyimpan. */
  tembus: boolean
  pesan: string
  /** Sudah diformat untuk dibaca manusia; string kosong kalau tidak diisi. */
  sampai: string
}

export const TIDAK_BEKU: InfoBeku = { beku: false, tembus: false, pesan: '', sampai: '' }

/**
 * `beku` SENGAJA tidak dimatikan untuk peran yang menembus.
 *
 * Kalau SUPER_ADMIN tidak diberi tahu apa-apa, yang terjadi persis ini: ia membekukan
 * modul, mencoba sendiri, ternyata masih bisa menyimpan, lalu menyimpulkan sakelarnya
 * tidak bekerja. Yang dibedakan bukan tahu-atau-tidak, melainkan KALIMATNYA.
 *
 * Gagal baca `app_config` → dianggap tidak beku. Ini kebalikan `modulMati` yang
 * fail-closed, dan bedanya disengaja: yang di sini cuma keterangan layar. Pagarnya
 * sendiri sudah berdiri di `modulMati`, yang tetap menolak saat pembacaan gagal —
 * spanduk yang hilang tidak membuka satu pintu pun.
 */
export async function infoBeku(kunci: readonly string[], role?: string): Promise<InfoBeku> {
  const utama = kunci[0]
  if (!utama) return TIDAK_BEKU
  try {
    const rows = await sql`
      SELECT \`key\`, value FROM app_config
      WHERE \`key\` IN (${[...kunci, kunciPesan(utama), kunciSampai(utama)]})
    ` as { key: string; value: string }[]
    const peta = new Map(rows.map((r) => [r.key, r.value]))
    if (keadaanTerburuk(kunci.map((k) => peta.get(k))) !== 'readonly') return TIDAK_BEKU
    return {
      beku: true,
      tembus: Boolean(role && PERAN_TEMBUS_SAKELAR.includes(role)),
      pesan: (peta.get(kunciPesan(utama)) ?? '').trim(),
      sampai: formatSampai((peta.get(kunciSampai(utama)) ?? '').trim()),
    }
  } catch {
    return TIDAK_BEKU
  }
}
