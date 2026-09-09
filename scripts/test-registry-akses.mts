#!/usr/bin/env npx tsx
// scripts/test-registry-akses.mts — tabel kebenaran "siapa boleh masuk modul mana".
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §17.2 Tahap 2 (Fase B).
//
// Dipakai DUA kali, dan urutannya yang menentukan gunanya:
//
//   1. **Sebelum** refactor — dijalankan terhadap delapan `is*Role` yang masih asli,
//      hasilnya dibekukan ke `docs/registry-akses-baseline.json`.
//   2. **Sesudah** refactor — dijalankan lagi; tiap sel dibandingkan dengan bekuan itu.
//
// Kalau bekuannya dibuat SESUDAH kode diganti, ia cuma memotret keadaan baru dan tidak
// membuktikan apa pun. Itu sebabnya berkas baseline di-commit lebih dulu, di commit
// yang TERPISAH dari refactornya.
//
// Yang dijaga: satu sel bergeser diam-diam = satu peran kehilangan (atau mendapat)
// sebuah modul, tanpa galat, tanpa gejala, sampai ada yang mengeluh berbulan kemudian.
//
// Jalankan: npx tsx --env-file=.env.local scripts/test-registry-akses.mts
//           npx tsx --env-file=.env.local scripts/test-registry-akses.mts --bekukan

import fs from 'node:fs'
import { ADMIN_ROLES, BIDANG_ROLES, SUBBIDANG_ROLES } from '../lib/constants'
import { isBludRole } from '../lib/blud/schemas'
import { isKinerjaRole } from '../lib/data/kinerja-schemas'
import { isPkRole } from '../lib/data/pk-schemas'
import { isAsetRole } from '../lib/data/buku-besar-aset-schemas'
import { isLkjipRole } from '../lib/lkjip/schemas'
import { isRencanaAksiRole } from '../lib/data/rencana-aksi-schemas'
import { isIkiRole } from '../lib/data/iki-schemas'
import { isDashboardRole } from '../lib/data/dashboard-schemas'
import { bolehMasukModul } from '../lib/registry/apps'

const BASELINE = 'docs/registry-akses-baseline.json'

type Cek = (role: string, appAccess: string[] | null) => boolean

// Kunci di sini = kunci `app_access` yang dipakai `users.app_access`, bukan nama modul
// di layar. Keduanya memang beda untuk E-Anggaran (`new_econtrolling`), dan justru
// beda itu salah satu alasan registry ini perlu ada.
const MODUL: Array<[string, Cek]> = [
  ['blud',               isBludRole],
  ['new_econtrolling',   isKinerjaRole],
  ['perjanjian_kinerja', isPkRole],
  ['buku_besar_aset',    isAsetRole],
  ['lkjip',              isLkjipRole],
  ['rencana_aksi',       isRencanaAksiRole],
  ['iki',                isIkiRole],
  ['dashboard',          isDashboardRole],
]

const PERAN: string[] = [...ADMIN_ROLES, ...BIDANG_ROLES, ...SUBBIDANG_ROLES]
const SEMUA_KUNCI = MODUL.map(([k]) => k)

/**
 * Lima keadaan `app_access`, dipilih supaya tiap cabang `is*Role` kena:
 * peran saja (null / kosong), grant modulnya sendiri, grant modul lain (harus TIDAK
 * membuka pintu ini), dan grant semuanya.
 */
function keadaan(kunci: string): Array<[string, string[] | null]> {
  return [
    ['null', null],
    ['kosong', []],
    ['grant-sendiri', [kunci]],
    ['grant-lain', SEMUA_KUNCI.filter((k) => k !== kunci)],
    ['grant-semua', [...SEMUA_KUNCI]],
  ]
}

type Tabel = Record<string, Record<string, Record<string, boolean>>>

function bangunTabel(): Tabel {
  const tabel: Tabel = {}
  for (const [kunci, cek] of MODUL) {
    tabel[kunci] = {}
    for (const peran of PERAN) {
      tabel[kunci][peran] = {}
      for (const [nama, akses] of keadaan(kunci)) {
        tabel[kunci][peran][nama] = cek(peran, akses)
      }
    }
  }
  return tabel
}

const sekarang = bangunTabel()
const sel = MODUL.length * PERAN.length * 5

/**
 * Deny-by-default untuk kunci yang tidak dikenal. Tidak bisa dijaga tabel di atas —
 * ia hanya menanyakan modul yang MEMANG ada, jadi `if (!m) return true` lolos di sana
 * tanpa satu sel pun bergeser. Akibatnya kalau terbalik: satu salah ketik kunci
 * membuka SEMUA pintu untuk SEMUA peran. Ketahuan lewat uji mutasi.
 */
{
  const salah = [
    bolehMasukModul('tidak-ada', 'SUPER_ADMIN', ['tidak-ada']),
    bolehMasukModul('', 'ADMIN', null),
    bolehMasukModul('BLUD', 'SUPER_ADMIN', null), // kunci peka huruf besar-kecil
  ]
  if (salah.some(Boolean)) {
    console.log('\n  GAGAL kunci modul tak dikenal TIDAK ditolak — deny-by-default bocor.')
    process.exit(1)
  }
  console.log('  ok    kunci modul tak dikenal ditolak (deny-by-default)')
}

if (process.argv.includes('--bekukan')) {
  if (fs.existsSync(BASELINE)) {
    console.log(`\n${BASELINE} SUDAH ADA — tidak ditimpa.`)
    console.log('Membekukan ulang sesudah refactor membuat berkas ini kehilangan gunanya:')
    console.log('ia akan memotret keadaan baru, bukan membuktikan keadaannya tidak bergeser.')
    console.log('Hapus manual kalau memang sengaja mau memulai dari nol.\n')
    process.exit(1)
  }
  fs.writeFileSync(BASELINE, JSON.stringify(sekarang, null, 2) + '\n', 'utf8')
  const ya = Object.values(sekarang).flatMap((p) => Object.values(p).flatMap((k) => Object.values(k))).filter(Boolean).length
  console.log(`\nDibekukan ke ${BASELINE}`)
  console.log(`${MODUL.length} modul x ${PERAN.length} peran x 5 keadaan = ${sel} sel (${ya} boleh masuk).`)
  console.log('Commit berkas ini SEBELUM menyentuh kode akses mana pun.\n')
  process.exit(0)
}

if (!fs.existsSync(BASELINE)) {
  console.log(`\n${BASELINE} belum ada. Jalankan dengan --bekukan lebih dulu,`)
  console.log('selagi delapan is*Role masih asli.\n')
  process.exit(1)
}

const beku: Tabel = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
let beda = 0
let diperiksa = 0

for (const kunci of Object.keys(beku)) {
  for (const peran of Object.keys(beku[kunci])) {
    for (const nama of Object.keys(beku[kunci][peran])) {
      diperiksa++
      const harap = beku[kunci][peran][nama]
      const dapat = sekarang[kunci]?.[peran]?.[nama]
      if (dapat !== harap) {
        beda++
        console.log(`  BEDA  ${kunci.padEnd(20)} ${peran.padEnd(24)} ${nama.padEnd(14)} beku=${harap} sekarang=${dapat}`)
      }
    }
  }
}

// Modul yang HILANG dari tabel sekarang tidak akan terlihat oleh perulangan di atas —
// ia cuma memulangkan undefined untuk tiap selnya, yang memang sudah dihitung beda.
// Yang tidak terlihat sebaliknya: modul BARU yang belum pernah dibekukan.
for (const kunci of Object.keys(sekarang)) {
  if (!(kunci in beku)) {
    beda++
    console.log(`  BARU  ${kunci} — modul ini belum ada di baseline. Kalau memang modul baru,`)
    console.log('        tambahkan barisnya ke baseline dalam commit tersendiri.')
  }
}

console.log(`\n${diperiksa} sel diperiksa — ${beda === 0 ? 'IDENTIK dengan baseline.' : `${beda} BERGESER.`}`)
process.exit(beda ? 1 : 0)
