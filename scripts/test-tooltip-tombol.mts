#!/usr/bin/env npx tsx
// scripts/test-tooltip-tombol.mts — tooltip PrimaButton & baris L1 sticky BLUD (2026-10-09).
//
// Dua cacat lama yang ketahuan saat memeriksa layar DPA:
//   A. Tooltip `::after` PrimaButton tidak pernah terlihat — `clip-path` sudut-terpotong
//      `.btn-prima` memotongnya — tapi tetap ikut tata letak: tooltip yang tak tampil
//      memperlebar HALAMAN (DPA 1014px → 1230px; 375px → 592px). Kini portal.
//   B. Tooltip pseudo lain (chip, ikon) juga ikut tata letak saat tak tampil → diciutkan.
//   C. Sel L1 sticky tembus pandang: `background: transparent !important` milik
//      `.dpa-table.v2 tbody td` mengalahkan latarnya.
//
// Pemeriksaan teks membuang komentar dulu dan mengutip utuh (L82c).
// Jalankan: npx tsx scripts/test-tooltip-tombol.mts

import fs from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentType, ReactNode } from 'react'
import * as ModulTombol from '../components/ui/PrimaButton'
import { KunciTulisProvider, sebabKunciTulis } from '../components/ui/KunciTulis'
import type { InfoBeku } from '../lib/security/beku'

type KomponenTombol = typeof ModulTombol.default
const PrimaButton: KomponenTombol =
  (ModulTombol.default as unknown as { default?: KomponenTombol }).default ?? ModulTombol.default
const Penyedia = KunciTulisProvider as ComponentType<{ beku: InfoBeku | null; children?: ReactNode }>

const AKAR = path.join(import.meta.dirname, '..')
const baca = (p: string) => fs.readFileSync(path.join(AKAR, p), 'utf8').replace(/\r\n/g, '\n')
const buangKomentarCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const buangKomentarTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/** Isi blok aturan CSS yang selektornya PERSIS `sel` (bukan bagian selektor lain). */
function blok(css: string, sel: string): string | null {
  const i = css.indexOf(`\n${sel} {`)
  if (i < 0) return null
  const buka = css.indexOf('{', i)
  return css.slice(buka + 1, css.indexOf('}', buka))
}

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(74)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(74)} ${catatan}`) }
}

const css = buangKomentarCss(baca('app/globals.css'))

// ─── A. PrimaButton: tooltip portal ───────────────────────────────────────────
console.log('\nA · PrimaButton — tooltip portal, bukan ::after')
cek('premis: .btn-prima memang ber-clip-path (yang memotong ::after)', /clip-path: polygon\(/.test(blok(css, '.btn-prima') ?? ''))
cek('pseudo tooltip dimatikan pada .btn-prima',
  css.includes('\n.btn-prima[data-tooltip]::after,\n.btn-prima[data-tooltip]::before { content: none; }'))
const tombol = buangKomentarTs(baca('components/ui/PrimaButton.tsx'))
cek('letak dari letakTip, lebar layar = clientWidth',
  tombol.includes('letakTip(e.currentTarget.getBoundingClientRect(), document.documentElement.clientWidth)'))
cek('dipicu POINTER event (React menelan mouse event pada tombol disabled)',
  tombol.includes('onPointerEnter={tampilkanTooltip}') && tombol.includes('onPointerLeave={sembunyikanTooltip}')
  && !/onMouseEnter|onMouseLeave/.test(tombol))
cek('ditekan = tooltip ditutup (tidak menggantung di atas modal yang dibuka)',
  tombol.includes('onPointerDown={tutupSaatDitekan}') && /function tutupSaatDitekan\([^)]*\) \{\s*setLetak\(null\)/.test(tombol))
cek('penangan milik pemanggil tetap dipanggil',
  tombol.includes('onPointerEnter?.(e)') && tombol.includes('onPointerLeave?.(e)') && tombol.includes('onPointerDown?.(e)'))
cek('portal dirender lewat TipLayang (satu bentuk dgn Tip)', tombol.includes('{tooltip && letak && <TipLayang label={tooltip} pos={letak} />}'))
cek('kalimat kunci-tulis tetap menang atas tooltip asli', tombol.includes("const tooltip = kunci ? sebab : (rest as { 'data-tooltip'?: string })['data-tooltip']"))
{
  const h = renderToStaticMarkup(createElement(PrimaButton, { 'data-tooltip': 'Alasan tombol mati', disabled: true } as never, 'Impor'))
  cek('markup: data-tooltip tetap dipasang (sumber kalimat & pemeriksaan lain)', h.includes('data-tooltip="Alasan tombol mati"'))
  cek('markup: TIDAK ada kotak tooltip selagi tak ditunjuk', !h.includes('blud-tip-portal'))
  cek('markup: tombol tetap satu elemen <button> (tanpa pembungkus)', /^<button[^>]*class="btn-prima"/.test(h) && h.endsWith('</button>'))
  // Portal membaca kalimat yang SAMA dgn atributnya — saat modul beku, sebab kuncinya.
  const beku: InfoBeku = { beku: true, tembus: false, pesan: '', sampai: '', global: false, bagian: '' }
  const hb = renderToStaticMarkup(createElement(Penyedia, { beku },
    createElement(PrimaButton, { menulis: true, 'data-tooltip': 'Simpan ke server', onClick: () => {} } as never, 'Simpan')))
  const sebab = sebabKunciTulis({ global: false, bagian: '' })
  cek('markup beku: atribut memuat SEBAB kunci, bukan tooltip asli',
    hb.includes(`data-tooltip="${sebab}"`) && !hb.includes('Simpan ke server'))
}
const tip = buangKomentarTs(baca('components/ui/Tip.tsx'))
cek('Tip memakai TipLayang yang sama', tip.includes('{label && pos && <TipLayang label={label} pos={pos} />}'))
cek('TipLayang: kelas portal, position fixed, variabel letak',
  /export function TipLayang[\s\S]*className="blud-tip-portal"[\s\S]*position: 'fixed', top: pos\.top, left: pos\.left,[\s\S]*'--tip-tx': pos\.tx, '--tip-ty': pos\.ty, '--tip-maks': `\$\{pos\.lebar\}px`/.test(tip))
{
  const portal = blok(css, '.blud-tip-portal') ?? ''
  cek('portal berbaris & dibatasi lebarnya', /white-space: normal;\s*width: max-content;\s*max-width: var\(--tip-maks, 280px\);/.test(portal))
  // Portal hidup di <body>: tanpa konteks tumpukan pemiliknya, ia harus melampaui SEMUA
  // lapisan, kalau tidak PrimaButton di modal ber-z 9999 menaruh tooltipnya di bawah modal.
  const zPortal = Number(/z-index: (\d+);/.exec(portal)?.[1] ?? 0)
  const angka: number[] = []
  const jelajah = (dir: string) => {
    for (const f of fs.readdirSync(path.join(AKAR, dir), { withFileTypes: true })) {
      const rel = path.join(dir, f.name)
      if (f.isDirectory()) { jelajah(rel); continue }
      if (!/\.(tsx|css)$/.test(f.name)) continue
      let isi = baca(rel)
      if (f.name === 'globals.css') isi = buangKomentarCss(isi).replace(/@media print \{[\s\S]*?\n\}/g, '').replace(/\.blud-tip-portal \{[^}]*\}/, '')
      for (const m of isi.matchAll(/z-?[iI]ndex:\s*'?(\d+)/g)) angka.push(Number(m[1]))
    }
  }
  jelajah('app'); jelajah('components')
  const maks = Math.max(...angka)
  cek('z-index portal melampaui lapisan tertinggi di aplikasi', zPortal > maks, `${zPortal} > ${maks}`)
}

// ─── B. Tooltip pseudo yang tak tampil tidak menempati tata letak ────────────
console.log('\nB · tooltip pseudo diciutkan selagi tak tampil')
{
  const sel = '[data-tooltip]:not(:hover):not(select):not(input):not(textarea)::after,\n[data-tooltip]:not(:hover):not(select):not(input):not(textarea)::before'
  const isi = blok(css, sel) ?? ''
  cek('aturan ciut ada untuk ::after DAN ::before', isi.length > 0)
  cek('diciutkan lewat scale (tidak bertabrakan dgn transform varian)', /\bscale: 0;/.test(isi))
  cek('keluar: ciut DITUNDA sampai fade 180ms selesai', isi.includes('transition: opacity .18s ease, transform .18s ease, scale 0s linear .18s;'))
  const dasar = blok(css, '[data-tooltip]:not(select):not(input):not(textarea)::after') ?? ''
  cek('masuk: transisi dasar tidak menyebut scale (muncul seketika)',
    dasar.includes('transition: opacity .18s ease, transform .18s ease;') && !/scale/.test(dasar))
  cek('tidak ada aturan yang menampilkan tooltip lewat keadaan selain :hover',
    !/\[data-tooltip[^\]]*\][^{,]*:(focus|focus-visible|active)[^{,]*::after[^{]*\{[^}]*opacity: 1/.test(css))
}

// ─── C. Baris L1 sticky BLUD ──────────────────────────────────────────────────
console.log('\nC · baris L1 sticky DPA/Pergeseran')
cek('premis: semua sel tabel v2 dipaksa transparan (!important)',
  /background: transparent !important;/.test(blok(css, '.dpa-table.v2 tbody td') ?? ''))
{
  const l1 = blok(css, '.blud-scroll-wrapper.v2 tbody tr.lv-l1 td') ?? ''
  cek('sel L1 sticky', /position: sticky; top: 36px;/.test(l1))
  cek('latar L1 buram MENEMBUS aturan transparan (!important)', l1.includes('background: #042C53 !important;'))
  cek('hover L1 juga menembus', (blok(css, '.blud-scroll-wrapper.v2 tbody tr.lv-l1:hover td') ?? '').includes('background: #334155 !important;'))
  cek('tema terang tetap menang (lebih khusus & !important)',
    (blok(css, '[data-theme="light"] .blud-scroll-wrapper.v2 tbody tr.lv-l1 td') ?? '').includes('background: #FAFAFA !important;')
    && (blok(css, '[data-theme="light"] .blud-scroll-wrapper.v2 tbody tr.lv-l1:hover td') ?? '').includes('background: #F1F5F9 !important;'))
}

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal) process.exit(1)
