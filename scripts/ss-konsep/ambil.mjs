// scripts/ss-konsep/ambil.mjs — memotret layar PRIMA 1440x900 tema terang (sementara)
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const DIR = 'docs/konsep-sistem/gambar'
fs.mkdirSync(DIR, { recursive: true })

const HALAMAN = [
  ['02-menu', '/menu', 'Halaman menu dengan kartu modul'],
  ['03-dasbor', '/dashboard', 'Dasbor ringkasan lintas modul'],
  ['04-usulan', '/usulan-kebutuhan', 'Layar Usulan Kebutuhan'],
  ['05-renaksi', '/rencana-aksi', 'Layar Rencana Aksi'],
  ['06-e-anggaran', '/kinerja', 'Layar E-Anggaran'],
  ['07-blud', '/blud', 'Layar modul BLUD'],
  ['08-pk', '/perjanjian-kinerja', 'Layar Perjanjian Kinerja'],
  ['09-iki', '/iki', 'Layar Indikator Kinerja Individu'],
  ['10-bba', '/buku-besar-aset', 'Layar Buku Besar Aset'],
  ['11-lkjip', '/lkjip', 'Layar E-LKJIP'],
  ['12-admin', '/admin', 'Panel Admin'],
]

const SEMBUNYI = `
  nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay],
  [aria-label="Open Next.js Dev Tools"], #__next-build-watcher,
  [aria-label="Buka panel RIMA"], [data-rima-launcher] { display: none !important; }
`

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
  locale: 'id-ID',
})
await ctx.addCookies([{ name: 'prima_theme', value: 'light', domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
const galat = []
page.on('console', (m) => { if (m.type() === 'error') galat.push(m.text().slice(0, 160)) })
page.on('pageerror', (e) => galat.push('pageerror: ' + String(e).slice(0, 160)))

async function jepret(nama, judul) {
  await page.addStyleTag({ content: SEMBUNYI }).catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${DIR}/${nama}.png` })
  const { width, height } = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  console.log(`✓ ${nama}.png  ${page.url().replace('http://localhost:3000', '')}  ${width}x${height}  ${judul}`)
  return { nama, url: page.url(), judul }
}

// 1) halaman masuk
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
const hasil = [await jepret('01-masuk', 'Halaman masuk PRIMA')]

// 2) login
await page.fill('input[autocomplete="username"]', 'prima.admin')
await page.fill('input[autocomplete="current-password"]', process.env.SS_KONSEP_SANDI ?? '')
await page.click('button[type="submit"]')
await page.waitForURL(/\/menu/, { timeout: 25000 })

// 3) tiap modul
for (const [nama, jalur, judul] of HALAMAN) {
  await page.goto('http://localhost:3000' + jalur, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  hasil.push(await jepret(nama, judul))
}

fs.writeFileSync(`${DIR}/daftar.json`, JSON.stringify({ hasil, galat }, null, 2))
console.log('\nURL akhir yang tercatat:')
for (const h of hasil) console.log(' -', h.nama, '→', h.url.replace('http://localhost:3000', ''))
if (galat.length) console.log('\ngalat konsol:', [...new Set(galat)].slice(0, 8))
await browser.close()
