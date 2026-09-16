#!/usr/bin/env npx tsx
// scripts/test-tahap-18.mts — penjaga regresi Tahap 18 (bahasa Admin Panel & sakelar).
// Konsep: docs/CONCEPT-perbaikan-audit-akses.md §5 Tahap 18.
//
// Pemilik aplikasi meminta dua hal: "beku" diganti bahasa Indonesia yang wajar, dan kalimat
// yang terdengar seperti tulisan mesin di Admin Panel ditulis ulang. Yang dijaga di sini:
//   A  istilah keadaan sakelar punya SATU sumber (`LABEL_KEADAAN`) dan dipakai layar,
//   B  pemindai kalimatnya sendiri benar — kalau ia buta, bagian C lulus tanpa arti (L82c),
//   C  tidak ada kalimat di layar/API admin yang memakai kata terlarang,
//   D  kalimat pengganti yang penting memang ada (pengembalian ke bunyi lama ketahuan),
//   E  `detail` jejak audit sengaja TIDAK diubah.
//
// Jalankan: npx tsx scripts/test-tahap-18.mts

import fs from 'node:fs'
import { LABEL_KEADAAN, SEBAB_TAK_BISA_BEKU, infoSakelar } from '../lib/registry/apps'
import { sebabKunciTulis } from '../components/ui/KunciTulis'
import { labelPeran } from '../components/admin/PilihPeran'
import { berkasDi, kalimat, prosaDari, prosaDariTeks, type Prosa } from './_prosa-layar'
import { fmtIdle, keadaanSesi } from '../app/(dashboard)/admin/_panels/_shared'
import { SESSION_INACTIVE_MINUTES } from '../lib/constants'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(72)} ${catatan}`) }
  else { gagal++; console.log(`  GAGAL ${nama.padEnd(72)} ${catatan}`) }
}
const baca = (p: string) => fs.readFileSync(p, 'utf8')

// ── A · Istilah keadaan ──────────────────────────────────────────────────────
console.log('\nA · istilah keadaan sakelar')

cek('online → AKTIF', LABEL_KEADAAN.online === 'AKTIF', LABEL_KEADAAN.online)
cek('readonly → HANYA BACA', LABEL_KEADAAN.readonly === 'HANYA BACA', LABEL_KEADAAN.readonly)
cek('maintenance → PEMELIHARAAN', LABEL_KEADAAN.maintenance === 'PEMELIHARAAN', LABEL_KEADAAN.maintenance)

const menu = baca('app/(dashboard)/menu/menu-client.tsx')
cek('lencana /menu mengambil istilah dari LABEL_KEADAAN (hanya baca)', menu.includes('isBeku ? LABEL_KEADAAN.readonly'))
cek('…dan pemeliharaan', menu.includes('(isMaint || isMaintSA) ? LABEL_KEADAAN.maintenance'))
cek('…dan lencana SEBAGIAN ikut istilah yang sama',
  menu.includes('`SEBAGIAN ${bagianMaint ? LABEL_KEADAAN.maintenance : LABEL_KEADAAN.readonly}`'))
const panelSakelar = baca('app/(dashboard)/admin/_panels/TabAppControl.tsx')
cek('tombol keadaan di layar Sakelar memakai LABEL_KEADAAN[k]', panelSakelar.includes('{LABEL_KEADAAN[k]}'))

// ── B · Pemindainya sendiri ──────────────────────────────────────────────────
// Tanpa bagian ini, pemindai yang keliru melewatkan teks JSX akan membuat bagian C lulus
// selamanya. Contoh di bawah sengaja memuat JEBAKAN dua arah: yang harus tertangkap dan
// yang harus diabaikan.
console.log('\nB · pemindai kalimat')

const contoh = `
import x from 'modul beku sekali'
// komentar: sedang dibekukan
export function Contoh({ isBeku }: { isBeku: boolean }) {
  console.error('log dibekukan tidak dibaca orang')
  writeAuditLog({ detail: 'jejak dibekukan tetap apa adanya' })
  if (keadaan === 'MAINTENANCE sekali') return null
  toast.error('Modul sedang dibekukan admin.')
  const kelas = isBeku ? 'beku' : ''
  return <div className="beku ap-kartu" data-tooltip={\`\${nama} sedang dibekukan\`}>Tombol simpan — dimatikan</div>
}
`
const hasilContoh = prosaDariTeks('contoh.tsx', contoh)
const ada = (s: string) => hasilContoh.some((p) => p.teks.includes(s))
cek('menangkap teks toast', ada('Modul sedang dibekukan admin.'))
cek('menangkap template di atribut data-tooltip', ada('sedang dibekukan') && hasilContoh.some((p) => p.teks.startsWith('…')))
cek('menangkap teks JSX', ada('Tombol simpan — dimatikan'))
cek('mengabaikan komentar', !ada('komentar: sedang dibekukan'))
cek('mengabaikan console.*', !ada('log dibekukan'))
cek('mengabaikan detail jejak audit', !ada('jejak dibekukan'))
cek('mengabaikan perbandingan kunci', !ada('MAINTENANCE sekali'))
cek('mengabaikan className', !hasilContoh.some((p) => p.teks === 'beku ap-kartu'))
cek('mengabaikan jalur impor', !ada('modul beku sekali'))
cek('kata tunggal bukan kalimat', !kalimat({ berkas: '', baris: 0, teks: 'beku' }))
cek('blok CSS bukan kalimat', !kalimat({ berkas: '', baris: 0, teks: '.a { color: red; }' }))
cek('alamat API bukan kalimat', !kalimat({ berkas: '', baris: 0, teks: '/api/admin/promotion/ … /cancel-cooldown' }))
cek('…tapi kalimat yang menyebut garis miring tetap kalimat',
  kalimat({ berkas: '', baris: 0, teks: 'Hapus versi DPA / Pergeseran' }))

// ── C · Tidak ada kata terlarang di layar & API admin ────────────────────────
console.log('\nC · kata terlarang di kalimat')

const RUANG = [
  ...berkasDi('app/(dashboard)/admin', /\.tsx?$/),
  ...berkasDi('app/api/admin', /\.ts$/),
  ...berkasDi('components/admin', /\.tsx?$/),
  ...berkasDi('components/akses', /\.tsx?$/),
  ...berkasDi('lib/admin', /\.ts$/),
  'components/ui/SpandukBeku.tsx', 'components/ui/SpandukLihat.tsx', 'components/ui/KunciTulis.tsx',
  'app/(dashboard)/menu/menu-client.tsx', 'app/maintenance/page.tsx', 'app/(auth)/login/login-form.tsx',
  'lib/registry/apps.ts', 'lib/registry/apps-data.mjs', 'lib/security/guard.ts', 'lib/security/promotion.ts',
]
cek('ruang pemindaian mencakup seluruh panel admin', RUANG.includes('app/(dashboard)/admin/_panels/PromotionRequestsPanel.tsx')
  && RUANG.includes('app/(dashboard)/admin/_panels/TabSessions.tsx') && RUANG.length >= 55, `${RUANG.length} berkas`)

const semua: Prosa[] = RUANG.flatMap(prosaDari).filter(kalimat)
cek('pemindai benar-benar memungut kalimat', semua.length > 600, `${semua.length} kalimat`)

const LARANGAN: [string, RegExp][] = [
  // Permintaan pemilik aplikasi: "beku" diganti.
  ['beku / dibekukan', /\bbeku\b|dibekukan|membekukan|pembekuan/i],
  // Tanda pisah panjang di tengah kalimat adalah ciri paling mudah dikenali dari tulisan mesin.
  ['tanda pisah panjang (—)', /—/],
  // Kiasan yang dipakai di catatan pengembang, bukan kata orang kantor.
  // Tanpa `\b` di belakang: "pintunya" dan "lantainya" lolos dari `\bpintu\b` (uji mutasi).
  ['kiasan (pintu, menggigit, berbohong, jebol, mendarat, lantai)', /\bpintu|menggigit|berbohong|\bjebol|mendarat|\blantai/i],
  ['nama peran mentah SUPER_ADMIN', /SUPER_ADMIN/],
  ['istilah Inggris keadaan (MAINTENANCE/LIVE/ONLINE/BEKU)', /\bMAINTENANCE\b|\bLIVE\b|\bONLINE\b|\bBEKU\b/],
  ['campuran Inggris (di-approve, di-revoke, cooldown, quota, emergency logout, master toggle)',
    /\bdi-(approve|reject|revoke|reset)\b|\bcooldown\b|\bquota\b|emergency logout|master toggle|\bUser (dinonaktifkan|diaktifkan)\b/i],
]
for (const [nama, re] of LARANGAN) {
  const kena = semua.filter((p) => re.test(p.teks))
  cek(`tanpa ${nama}`, kena.length === 0, kena.slice(0, 3).map((p) => `${p.berkas}:${p.baris} "${p.teks.slice(0, 60)}"`).join(' | '))
}
const KATA_TUNGGAL = /^(BEKU|MAINTENANCE|LIVE|ONLINE)$/
const tunggal = RUANG.flatMap(prosaDari).filter((p) => KATA_TUNGGAL.test(p.teks))
cek('tanpa lencana satu kata BEKU/MAINTENANCE/LIVE/ONLINE', tunggal.length === 0,
  tunggal.slice(0, 3).map((p) => `${p.berkas}:${p.baris} ${p.teks}`).join(' | '))

// ── D · Kalimat pengganti yang menentukan ────────────────────────────────────
console.log('\nD · kalimat pengganti')

const spanduk = baca('components/ui/SpandukBeku.tsx')
cek('spanduk: "sedang dalam mode hanya baca"', spanduk.includes("'Modul ini sedang dalam mode hanya baca.'"))
cek('spanduk: Super Admin disebut dengan nama yang dibaca orang', spanduk.includes('karena Anda Super Admin'))
cek('tooltip tombol simpan terkunci', sebabKunciTulis({ global: false, bagian: '' }) === 'Modul ini sedang dalam mode hanya baca, jadi belum bisa menyimpan.')
cek('sebab tombol HANYA BACA yang dimatikan', SEBAB_TAK_BISA_BEKU === 'Mode hanya baca untuk layar yang tetap bisa dibuka dan dicetak sambil penyimpanannya ditahan. Bagian ini bukan layar semacam itu.')
cek('lencana TERJAGA menjelaskan akibat, bukan nama route',
  infoSakelar('app_status_iki')?.sebab === 'Layar dan jalur datanya ikut tertutup saat sakelar ini diubah. Diperiksa otomatis setiap ada perubahan kode.')
cek('label sub-sakelar "Realisasi BLUD"', infoSakelar('app_status_blud_realisasi')?.label === 'Realisasi BLUD')
cek('kuota penuh ditulis ", penuh"', labelPeran('ADMIN', { role: 'ADMIN', count: 6, quota: 6, full: true }) === 'Admin Staff (6/6, penuh)')

const promosi = baca('app/(dashboard)/admin/_panels/PromotionRequestsPanel.tsx')
cek('panel Permintaan: Setujui / Tolak', promosi.includes("'Menyetujui…' : 'Setujui'") && promosi.includes("'Menolak…' : 'Tolak'"))
cek('panel Permintaan: status berbahasa Indonesia', promosi.includes("label: 'Masa tunggu'") && promosi.includes("label: 'Kedaluwarsa'"))
const sesi = baca('app/(dashboard)/admin/_panels/TabSessions.tsx')
cek('Sesi Aktif: tombol darurat punya nama yang menjelaskan akibatnya', sesi.includes('PUTUSKAN SEMUA SESI') && !sesi.includes('EMERGENCY LOGOUT'))
cek('notifikasi naik peran disetujui', baca('app/api/admin/promotion/[id]/approve/route.ts').includes('disetujui. Peran baru berlaku dalam'))
cek('notifikasi masa percobaan dicabut', baca('app/api/admin/users/[id]/revoke-probation/route.ts').includes('Masa percobaan peran Anda dicabut.'))

// ── E · Jejak audit tidak disentuh ───────────────────────────────────────────
// Riwayat yang sudah tersimpan berbunyi dengan kalimat lama. Mengganti `detail` membuat
// pencarian di Jejak Audit terbelah dua ejaan untuk kejadian yang sama.
console.log('\nE · detail jejak audit tetap')

cek('sesi darurat: detail lama utuh', baca('app/api/admin/sessions/route.ts').includes('detail: `Emergency logout: ${deleted} sesi dihapus`'))
cek('persetujuan naik peran: detail lama utuh', baca('app/api/admin/promotion/[id]/approve/route.ts').includes('detail: `Approved reqId=${id} target=${reqRow.to_role}`'))

// ── F · Checklist keamanan tidak mengaku memakai fitur yang sudah dimatikan ─
// Pertanyaan akhir nomor 4. Edisi intranet mematikan Turnstile, registrasi publik, dan
// reset kata sandi lewat email; checklist-nya tetap mencentang ketiganya hijau.
console.log('\nF · checklist keamanan jujur')

const status = baca('app/(dashboard)/admin/_panels/TabSecurityStatus.tsx')
const labelCek = [...status.matchAll(/\{ label:'([^']+)',\s*ok:(true|false),\s*val:'([^']*)' \}/g)].map((m) => `${m[1]}=${m[3]}`)
cek('checklist terbaca', labelCek.length >= 8, `${labelCek.length} baris`)
cek('tanpa Turnstile (verifyTurnstile hanya no-op)',
  !labelCek.some((l) => /turnstile/i.test(l)) && baca('lib/security/recaptcha.ts').includes('verifyTurnstile selalu pass'))
for (const [nama, route] of [['Register', 'app/api/auth/register/route.ts'], ['Reset PW', 'app/api/auth/forgot-password/route.ts']] as const) {
  cek(`tanpa Rate Limit ${nama} (endpoint-nya 410)`,
    !labelCek.some((l) => l.includes(nama)) && baca(route).includes('status: 410'))
}
cek('CSP tidak lagi mengaku mengizinkan Cloudflare',
  labelCek.includes('CSP Headers=self + nonce')
  && !baca('proxy.ts').split('\n').some((b) => !/^\s*\/\//.test(b) && /cloudflare/i.test(b)))

// ── G · Daftar sesi ──────────────────────────────────────────────────────────
// "1d" terbaca satu hari padahal satu detik, dan sesi yang sudah diputus `getSession`
// sesudah 60 menit tetap berlencana IDLE sampai cron (8 jam; di laptop tanpa cron: selamanya).
console.log('\nG · daftar sesi')

cek('lama diam: detik ditulis utuh', fmtIdle(1) === '1 dtk', fmtIdle(1))
cek('lama diam: menit', fmtIdle(12 * 60) === '12 mnt', fmtIdle(12 * 60))
cek('lama diam: jam', fmtIdle(3 * 3600 + 59) === '3 jam', fmtIdle(3 * 3600 + 59))
cek('lama diam: 435 jam jadi hari', fmtIdle(435 * 3600) === '18 hari', fmtIdle(435 * 3600))
const batasSesi = SESSION_INACTIVE_MINUTES * 60
cek('sesi di bawah separuh batas → aktif', keadaanSesi(batasSesi * 0.5 - 1) === 'aktif')
cek('sesi separuh batas → diam (sama dengan system-status)', keadaanSesi(batasSesi * 0.5) === 'diam')
cek('sesi tepat di batas getSession → masih diam', keadaanSesi(batasSesi) === 'diam')
cek('sesi lewat batas getSession → berakhir', keadaanSesi(batasSesi + 1) === 'berakhir')
cek('lencana BERAKHIR dipakai tabel, IDLE tidak lagi', sesi.includes("teks: 'BERAKHIR'") && sesi.includes('LENCANA_SESI[keadaan]') && !sesi.includes("isIdle?'IDLE':'AKTIF'") && !sesi.includes('idleSec > 1800'))
cek('judul kolom berbahasa Indonesia',
  sesi.includes('<th>NAMA PENGGUNA</th><th>PERAN</th><th>ALAMAT IP</th>') && sesi.includes('<th>TERAKHIR AKTIF</th><th>LAMA DIAM</th>')
  && !/<th>(USERNAME|ROLE|IP ADDRESS|LAST ACTIVE|IDLE)<\/th>/.test(sesi))
cek('peran ditulis dengan namanya, bukan kode', sesi.includes('{ROLE_LABELS[r.role] ?? r.role}') && !sesi.includes('badge-cyan">{r.role}'))
cek('sesi berakhir: konfirmasi tidak mengaku memutus', sesi.includes('Sesi ini sudah berakhir sendiri dan tidak bisa dipakai lagi.'))

console.log(`\n${lulus + gagal} pemeriksaan · ${lulus} lulus · ${gagal} gagal`)
if (gagal) { console.log('GAGAL — Tahap 18 tidak lagi utuh.'); process.exit(1) }
console.log('Tahap 18 utuh.')
