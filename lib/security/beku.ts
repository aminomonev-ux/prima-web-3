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
import {
  formatSampai, KUNCI_GLOBAL, kunciDenganGlobal, kunciPesan, kunciSampai, LABEL_SAKELAR, sebabTerburuk,
} from '@/lib/registry/apps'
import { PERAN_TEMBUS_SAKELAR } from '@/lib/security/guard'

export type InfoBeku = {
  /** Modulnya memang sedang dibekukan — apa pun peran yang bertanya. */
  beku: boolean
  /** Peran ini menembus pembekuan (SUPER_ADMIN), jadi ia MASIH bisa menyimpan. */
  tembus: boolean
  pesan: string
  /** Sudah diformat untuk dibaca manusia; string kosong kalau tidak diisi. */
  sampai: string
  /**
   * P12 — yang membekukan sakelar SELURUH APLIKASI, bukan sakelar modul ini.
   *
   * Bedanya perlu sampai ke layar: "modul ini dibekukan" mengirim orang bertanya ke
   * penanggung jawab modulnya, padahal yang berlaku hari itu berlaku di mana-mana
   * (aturan 11.3 — layar menyebut sebabnya).
   */
  global: boolean
  /**
   * Tahap 14a — nama BAGIAN yang dibekukan kalau sebabnya sub-sakelar (mis. "BLUD —
   * Realisasi"), string kosong kalau sebabnya modul itu sendiri atau global. Tanpa ini
   * spanduk di layar Buku Kas berbunyi "Modul sedang dibekukan" padahal DPA di menu
   * sebelah masih bisa disimpan.
   */
  bagian: string
}

export const TIDAK_BEKU: InfoBeku = { beku: false, tembus: false, pesan: '', sampai: '', global: false, bagian: '' }

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
    // P12 — sakelar global ikut ditanyakan, lewat penolong yang sama dengan `guard.ts`.
    // Kalau tidak, membekukan seluruh aplikasi menutup tombol simpan di sembilan modul
    // tanpa satu spanduk pun menjelaskan kenapa: pagarnya berdiri, kalimatnya hilang.
    const semua = kunciDenganGlobal(kunci)
    const rows = await sql`
      SELECT \`key\`, value FROM app_config
      WHERE \`key\` IN (${[...semua, ...semua.map(kunciPesan), ...semua.map(kunciSampai)]})
    ` as { key: string; value: string }[]
    const peta = new Map(rows.map((r) => [r.key, r.value]))
    const sebab = sebabTerburuk(semua.map((k) => [k, peta.get(k)] as const))
    if (sebab.keadaan !== 'readonly') return TIDAK_BEKU
    // Kalimatnya diambil dari sakelar yang MENYEBABKANNYA — global, modul, ATAU
    // sub-sakelar. Dulu cuma global-atau-kunci-pertama, jadi Realisasi yang dibekukan
    // sendirian menampilkan keterangan milik BLUD (biasanya kosong).
    const global = sebab.kunci === KUNCI_GLOBAL
    const sumber = sebab.kunci ?? utama
    return {
      beku: true,
      tembus: Boolean(role && PERAN_TEMBUS_SAKELAR.includes(role)),
      pesan: (peta.get(kunciPesan(sumber)) ?? '').trim(),
      sampai: formatSampai((peta.get(kunciSampai(sumber)) ?? '').trim()),
      global,
      bagian: !global && sumber !== utama ? (LABEL_SAKELAR[sumber] ?? '') : '',
    }
  } catch {
    return TIDAK_BEKU
  }
}
