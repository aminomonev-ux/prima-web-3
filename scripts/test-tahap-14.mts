#!/usr/bin/env npx tsx
// scripts/test-tahap-14.mts — penjaga regresi Tahap 14 (T1, T12, T13, T14).
// Konsep: docs/CONCEPT-perbaikan-audit-akses.md §5 Tahap 14.
//
// DoD konsep: yang dibandingkan JAWABAN API vs APA YANG LAYAR TAMPILKAN, bukan teks sumber.
// Karena itu bagian B memutar matriks (global × induk × sub) × tiga keadaan dan menghitung
// "jawaban API" dengan penolong yang dipakai `guard.ts` (`keadaanTerburuk` atas
// `kunciDenganGlobal(kunci)`), lalu membandingkannya dengan kartu /menu dan spanduk.
// Bagian D merender `PrimaButton` sungguhan lewat react-dom/server.
//
// Jalankan: npx tsx scripts/test-tahap-14.mts

import fs from 'node:fs'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  KEADAAN_SAKELAR, KUNCI_GLOBAL, infoSakelar, keadaanTerburuk, kunciDenganGlobal,
  kunciSakelarUntuk, lingkupSakelarModul, modul, type KeadaanSakelar,
} from '../lib/registry/apps'
import { sakelarKartu } from '../app/(dashboard)/menu/_kartu-sakelar'
import { bekuUntukMenu } from '../lib/security/beku-lingkup'
import * as ModulTombol from '../components/ui/PrimaButton'
import { KunciTulisProvider, sebabKunciTulis } from '../components/ui/KunciTulis'
import type { InfoBeku } from '../lib/security/beku'

// tsx memuat `.tsx` sebagai CJS, jadi ekspor default bisa terbungkus satu lapis lagi.
type KomponenTombol = typeof ModulTombol.default
const PrimaButton: KomponenTombol =
  (ModulTombol.default as unknown as { default?: KomponenTombol }).default ?? ModulTombol.default

// `children` wajib di tipe komponen, tapi `createElement` menerimanya sebagai argumen ketiga
// (react/no-children-prop). Dilonggarkan di sini saja, bukan di komponennya.
const Penyedia = KunciTulisProvider as ComponentType<{ beku: InfoBeku | null; children?: ReactNode }>

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(72)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(72)} ${catatan}`) }
}
const baca = (p: string) => fs.readFileSync(p, 'utf8')
function buangKomentar(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

const INDUK = 'app_status_blud'
const SUB = 'app_status_blud_realisasi'
const PERINGKAT: Record<KeadaanSakelar, number> = { online: 0, readonly: 1, maintenance: 2 }
const terburuk = (a: KeadaanSakelar, b: KeadaanSakelar) => (PERINGKAT[a] >= PERINGKAT[b] ? a : b)

// ── A · Registry menjawab "kunci mana yang mengatur layar ini" ───────────────
console.log('\nA · lib/registry/apps.ts — kunciSakelarUntuk (T1, T14)')

const sama = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])
cek('menu Realisasi diatur induk + sub', sama(kunciSakelarUntuk('blud', 'buku-kas'), [INDUK, SUB]))
for (const m of ['bukti-setor', 'realisasi', 'tutup-kas']) {
  cek(`…begitu juga ${m}`, sama(kunciSakelarUntuk('blud', m), [INDUK, SUB]))
}
cek('menu lain BLUD hanya diatur induk', sama(kunciSakelarUntuk('blud', 'dpa'), [INDUK]))
// `cetak` sengaja di luar: mematikannya ikut mematikan cetakan DPA.
cek('Cetak TIDAK dinaungi sakelar Realisasi', sama(kunciSakelarUntuk('blud', 'cetak'), [INDUK]))
cek('tanpa menu = seluruh modul', sama(kunciSakelarUntuk('blud'), [INDUK]))
cek('modul tanpa sakelar → kosong', kunciSakelarUntuk('admin').length === 0)
cek('modul tak dikenal → kosong (bukan melempar)', kunciSakelarUntuk('entah').length === 0)
cek('lingkup BLUD: modul + Realisasi', lingkupSakelarModul('blud').length === 2
  && lingkupSakelarModul('blud')[0].menu === null && sama(lingkupSakelarModul('blud')[1].kunci, [INDUK, SUB]))
cek('lingkup PK: modul saja', lingkupSakelarModul('perjanjian_kinerja').length === 1)
// Satu daftar menu: `MENU_REALISASI` di peran.ts dulu jawaban kedua untuk pertanyaan yang sama.
cek('daftar menu Realisasi tinggal di registry saja',
  !buangKomentar(baca('lib/blud/peran.ts')).includes('MENU_REALISASI')
  && (modul('blud')?.subSakelar?.[0]?.menu ?? []).join() === 'buku-kas,bukti-setor,realisasi,tutup-kas')
// Penjaga API membaca fungsi yang sama.
const guardBlud = buangKomentar(baca('app/api/blud/_guard.ts'))
cek('bludMati memakai kunciSakelarUntuk', guardBlud.includes("return modulMati(kunciSakelarUntuk('blud', lingkup), { role })")
  && !guardBlud.includes("'app_status_blud"))
const izin = buangKomentar(baca('app/(dashboard)/blud/_izin.ts'))
cek('halaman Realisasi memakai kunciSakelarUntuk', izin.includes("kunciSakelarUntuk('blud', menu)") && !izin.includes('app_status_blud_realisasi'))

// ── B · Matriks: jawaban API vs kartu /menu vs spanduk ──────────────────────
console.log('\nB · matriks global × induk × sub × keadaan (T1)')

let barisMatriks = 0
const salahMatriks: string[] = []
for (const g of KEADAAN_SAKELAR) for (const i of KEADAAN_SAKELAR) for (const s of KEADAAN_SAKELAR) {
  barisMatriks++
  const data: Record<string, string> = { [KUNCI_GLOBAL]: g, [INDUK]: i, [SUB]: s }
  // "Jawaban API" — persis yang `guard.bacaKeadaan` hitung untuk kunci route-nya.
  const apiDpa = keadaanTerburuk(kunciDenganGlobal(kunciSakelarUntuk('blud', 'dpa')).map((k) => data[k]))
  const apiRealisasi = keadaanTerburuk(kunciDenganGlobal(kunciSakelarUntuk('blud', 'realisasi')).map((k) => data[k]))

  const kartu = sakelarKartu({ muat: 'ada', data }, 'blud')
  const kartuK = kartu.keadaan as KeadaanSakelar
  const layarRealisasi = kartu.sebagian.reduce((acc, b) => terburuk(acc, b.keadaan), kartuK)

  const label = `g=${g} induk=${i} sub=${s}`
  if (kartuK !== apiDpa) salahMatriks.push(`${label}: kartu ${kartuK} ≠ API DPA ${apiDpa}`)
  if (layarRealisasi !== apiRealisasi) salahMatriks.push(`${label}: kartu+sebagian ${layarRealisasi} ≠ API Realisasi ${apiRealisasi}`)
  // Sub-sakelar tidak boleh membuat KARTU berbunyi maintenance: DPA masih bisa dibuka.
  if (i !== 'maintenance' && g !== 'maintenance' && kartuK === 'maintenance') salahMatriks.push(`${label}: kartu ikut maintenance`)
}
cek(`${barisMatriks} kombinasi: kartu = API DPA, kartu+sebagian = API Realisasi`, salahMatriks.length === 0,
  salahMatriks.slice(0, 2).join(' | '))
// Kasus yang dulu terukur live (T1).
{
  const k = sakelarKartu({ muat: 'ada', data: { [INDUK]: 'online', [SUB]: 'readonly' } }, 'blud')
  cek('Realisasi beku sendirian: kartu BLUD menyebutnya, tidak berbunyi normal',
    k.keadaan === 'online' && k.sebagian.length === 1 && k.sebagian[0].keadaan === 'readonly'
    && k.sebagian[0].kunci === SUB && k.sebagian[0].label === 'Realisasi BLUD')
}
{
  const k = sakelarKartu({ muat: 'ada', data: { [INDUK]: 'readonly', [SUB]: 'readonly' } }, 'blud')
  cek('induk & sub sama-sama beku: tidak disebut dua kali', k.keadaan === 'readonly' && k.sebagian.length === 0)
}
{
  const k = sakelarKartu({ muat: 'ada', data: { [INDUK]: 'online', [SUB]: 'readonly' } }, 'iki')
  cek('modul tanpa sub-sakelar tidak pernah punya "sebagian"', k.sebagian.length === 0)
}
// T14 — perilakunya tidak bisa membedakan: hari ini id kartu kebetulan = akhiran kunci
// sakelar, jadi merangkai `app_status_${id}` memberi hasil SAMA (uji mutasi lolos di sini
// sebelum pemeriksaan ini ada). Selisihnya baru muncul pada modul yang kuncinya lain.
cek('kartu tidak merangkai kunci sakelar sebagai teks',
  !buangKomentar(baca('app/(dashboard)/menu/_kartu-sakelar.ts')).includes('app_status_'))

// Spanduk memilih lingkup menurut menu aktif.
const infoPalsu = (bagian: string): InfoBeku => ({ beku: true, tembus: false, pesan: '', sampai: '', global: false, bagian })
const lingkup = [
  { menu: null, info: infoPalsu('MODUL') },
  { menu: ['buku-kas', 'bukti-setor', 'realisasi', 'tutup-kas'], info: infoPalsu('SUB') },
]
cek('spanduk Buku Kas mengambil lingkup Realisasi', bekuUntukMenu(lingkup, 'buku-kas')?.bagian === 'SUB')
cek('spanduk DPA mengambil lingkup modul', bekuUntukMenu(lingkup, 'dpa')?.bagian === 'MODUL')
cek('spanduk Beranda mengambil lingkup modul', bekuUntukMenu(lingkup, 'beranda')?.bagian === 'MODUL')
cek('tanpa lingkup sama sekali → null, bukan melempar', bekuUntukMenu([], 'dpa') === null)

const layout = buangKomentar(baca('app/(dashboard)/blud/layout.tsx'))
cek('layout BLUD menyelesaikan SEMUA lingkup', layout.includes("lingkupSakelarModul('blud').map(") && !layout.includes("infoBeku(['app_status_blud']"))
const shell = buangKomentar(baca('app/(dashboard)/blud/blud-shell.tsx'))
cek('shell BLUD memilih lewat menu aktif', shell.includes('const beku = bekuUntukMenu(bekuLingkup, menuAktif)'))

// ── C · Kalimat dari sakelar PENYEBAB ────────────────────────────────────────
console.log('\nC · lib/security/beku.ts & /maintenance — kalimat dari penyebab')

const beku = buangKomentar(baca('lib/security/beku.ts'))
cek('pesan & tenggat dibaca untuk SEMUA kunci, bukan cuma global + kunci pertama',
  beku.includes('...semua.map(kunciPesan), ...semua.map(kunciSampai)'))
cek('sumber kalimat = sakelar penyebab', beku.includes('const sumber = sebab.kunci ?? utama'))
cek('bagian disebut hanya kalau penyebabnya bukan modul itu sendiri',
  beku.includes("bagian: !global && sumber !== utama ? (LABEL_SAKELAR[sumber] ?? '') : ''"))
const spanduk = buangKomentar(baca('components/ui/SpandukBeku.tsx'))
cek('spanduk menyebut bagiannya', spanduk.includes('`${bagian} sedang dalam mode hanya baca.`'))

// ── D · K1=C: tombol tulis mati dengan sebab, lewat konteks, bukan izin ──────
console.log('\nD · PrimaButton `menulis` + KunciTulisProvider (T12)')

const html = (info: InfoBeku | null, props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(Penyedia, { beku: info },
    createElement(PrimaButton, { ...props, onClick: () => {} }, 'Simpan')))
const BEKU: InfoBeku = { beku: true, tembus: false, pesan: '', sampai: '', global: false, bagian: '' }

{
  const h = html(BEKU, { menulis: true })
  cek('beku: tombol menulis ber-aria-disabled', h.includes('aria-disabled="true"'))
  cek('…dengan tooltip sebabnya', h.includes('data-tooltip="Modul ini sedang dalam mode hanya baca, jadi belum bisa menyimpan."'))
  // `disabled` akan memudarkan tooltip lewat opacity & membuatnya tak bisa difokus.
  cek('…BUKAN atribut disabled', !/\sdisabled(=""|\s|>)/.test(h))
}
cek('beku: tombol yang tidak menulis tetap hidup', !html(BEKU, {}).includes('aria-disabled'))
cek('SUPER_ADMIN (tembus): tombol menulis tetap hidup', !html({ ...BEKU, tembus: true }, { menulis: true }).includes('aria-disabled'))
cek('tidak beku: tombol menulis hidup', !html(null, { menulis: true }).includes('aria-disabled'))
cek('tanpa provider: tombol menulis hidup', !renderToStaticMarkup(createElement(PrimaButton, { menulis: true }, 'x')).includes('aria-disabled'))
cek('tooltip asli tidak hilang saat tidak dikunci',
  html(null, { menulis: true, 'data-tooltip': 'Simpan ke server' }).includes('data-tooltip="Simpan ke server"'))
cek('sebab menyebut bagian & global',
  sebabKunciTulis({ global: false, bagian: 'Realisasi BLUD' }).startsWith('Realisasi BLUD sedang dalam mode hanya baca')
  && sebabKunciTulis({ global: true, bagian: '' }).startsWith('Seluruh aplikasi sedang dalam mode hanya baca'))

const tombol = buangKomentar(baca('components/ui/PrimaButton.tsx'))
// Klik yang dicegat juga menahan submit form (Renaksi memakai `type="submit"`).
cek('klik dicegat saat dikunci', tombol.includes('onClick={kunci ? (e) => e.preventDefault() : onClick}'))
const css = baca('app/globals.css')
cek('isi tombol dipudarkan, bukan tombolnya (tooltip tetap terbaca)',
  css.includes('.btn-prima[aria-disabled="true"] > .btn-prima-label'))
// Terukur di peramban: kalimat 745px nowrap yang dipusatkan terpotong di tepi kanan layar.
cek('tooltip tombol terkunci boleh berbaris & dijangkarkan ke kanan',
  /\.btn-prima\[aria-disabled="true"\]\[data-tooltip\]:not\(select\):not\(input\):not\(textarea\)::after \{[^}]*white-space: normal; width: max-content; max-width: 240px;[^}]*right: 0;/.test(css))
cek('kalimat tooltip pendek (penjelasan lengkap di spanduk)',
  sebabKunciTulis({ global: false, bagian: '' }).length <= 80)

// Cakupan: tiap modul yang bisa dibekukan punya provider DAN tombol bertanda.
const HALAMAN_PROVIDER = [
  'app/(dashboard)/buku-besar-aset/page.tsx', 'app/(dashboard)/buku-besar-aset/master/page.tsx',
  'app/(dashboard)/iki/page.tsx', 'app/(dashboard)/iki/[id]/page.tsx',
  'app/(dashboard)/lkjip/page.tsx', 'app/(dashboard)/lkjip/[id]/page.tsx',
  'app/(dashboard)/kinerja/page.tsx', 'app/(dashboard)/rencana-aksi/page.tsx',
  'app/(dashboard)/usulan-kebutuhan/page.tsx',
  'app/(dashboard)/blud/blud-shell.tsx', 'app/(dashboard)/perjanjian-kinerja/pk-shell.tsx',
]
for (const p of HALAMAN_PROVIDER) {
  cek(`${p.replace('app/(dashboard)/', '')} memasang KunciTulisProvider`, buangKomentar(baca(p)).includes('<KunciTulisProvider beku={beku}>'))
}
function tsxDi(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const j = `${dir}/${e.name}`
    if (e.isDirectory()) tsxDi(j, acc)
    else if (j.endsWith('.tsx')) acc.push(j)
  }
  return acc
}
const MODUL_BEKU = [
  ['blud', 'app/(dashboard)/blud', 10], ['perjanjian_kinerja', 'app/(dashboard)/perjanjian-kinerja', 6],
  ['buku_besar_aset', 'app/(dashboard)/buku-besar-aset', 1], ['iki', 'app/(dashboard)/iki', 2],
  ['lkjip', 'app/(dashboard)/lkjip', 6], ['new_econtrolling', 'app/(dashboard)/kinerja', 7],
  ['rencana_aksi', 'app/(dashboard)/rencana-aksi', 4], ['usulan_aset', 'app/(dashboard)/usulan-kebutuhan', 9],
] as const
for (const [kunci, dir, minimal] of MODUL_BEKU) {
  const n = tsxDi(dir).reduce((a, f) => a + (buangKomentar(baca(f)).match(/<PrimaButton menulis\b/g)?.length ?? 0), 0)
    + (kunci === 'blud' ? (buangKomentar(baca('components/blud/PejabatSpjPanel.tsx')).match(/<PrimaButton menulis\b/g)?.length ?? 0) : 0)
  cek(`${kunci}: tombol tulis bertanda`, n >= minimal, `${n} tombol (min ${minimal})`)
}
// Tombol Simpan ber-ikon <Save> di modul yang bisa dibekukan WAJIB bertanda — tombol
// simpan baru yang lupa ditandai membuat spanduk "Tombol simpan dimatikan" berbohong lagi.
const tanpaTanda: string[] = []
for (const [, dir] of MODUL_BEKU) {
  for (const f of tsxDi(dir)) {
    const t = buangKomentar(baca(f))
    let i = -1
    while ((i = t.indexOf('<PrimaButton', i + 1)) >= 0) {
      // Satu tombol = sampai `</PrimaButton>` atau `<PrimaButton` berikutnya, mana yang
      // lebih dulu. Jendela berukuran tetap menjulur ke ikon tombol SEBELAHNYA lalu menuduh
      // tombol Batal (terjadi saat suite ini pertama dijalankan).
      const tutup = t.indexOf('</PrimaButton>', i)
      const berikut = t.indexOf('<PrimaButton', i + 1)
      const tag = t.slice(i, Math.min(tutup < 0 ? t.length : tutup, berikut < 0 ? t.length : berikut))
      if (tag.includes('iconLeft={<Save') && !tag.startsWith('<PrimaButton menulis')) {
        tanpaTanda.push(`${f.replace('app/(dashboard)/', '')}:${t.slice(0, i).split('\n').length}`)
      }
    }
  }
}
cek('setiap tombol ber-ikon Save di modul bersakelar bertanda `menulis`', tanpaTanda.length === 0, tanpaTanda.join(', '))

// Izin tidak lagi menumpang keadaan modul.
for (const p of ['lib/blud/izin-server.ts', 'lib/pk/izin-server.ts']) {
  const t = buangKomentar(baca(p))
  cek(`${p} tidak lagi menjepit izin`, !t.includes('jepitBeku') && !t.includes('modulDibekukan'))
}

// ── E · BEKU hanya ditawarkan untuk yang memang menulis (T13) ────────────────
console.log('\nE · bisaBeku diturunkan dari kenyataan (T13)')

cek('Dashboard (GET saja) TIDAK menawarkan BEKU', infoSakelar('app_status_dashboard')?.bisaBeku === false)
for (const k of ['app_status_iki', 'app_status_blud', 'app_status_blud_realisasi', 'app_status_usulan_aset', KUNCI_GLOBAL]) {
  cek(`${k} tetap bisa dibekukan`, infoSakelar(k)?.bisaBeku === true)
}
const gate = baca('scripts/test-killswitch-modul.mjs')
cek('gate G mencocokkan `hanyaBaca` ke handler tulis sungguhan, dua arah',
  gate.includes('if (m.hanyaBaca && handlerTulis > 0)') && gate.includes('else if (!m.hanyaBaca && handlerTulis === 0)'))
cek('gate G memeriksa PER HANDLER', gate.includes('if (!m.penanda.some((p) => h.badan.includes(p)))'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal > 0) {
  console.log('GAGAL — Tahap 14 tidak lagi utuh.')
  process.exit(1)
}
console.log('LULUS.')
