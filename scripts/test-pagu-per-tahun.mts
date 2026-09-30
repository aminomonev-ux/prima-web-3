// scripts/test-pagu-per-tahun.mts — regresi lingkup TAHUN: KPI Usulan, /dashboard, PK (B5/B6/I3)
//
//   npx tsx scripts/test-pagu-per-tahun.mts
//
// Audit 2026-09-29:
//   B5  KPI Usulan membandingkan nilai SEMUA tahun dengan satu angka `pagu_blud`; widget &
//       detail Usulan di /dashboard mengabaikan pemilih tahun; detail BLUD memakai DPA
//       terbaru tahun apa pun. Keputusan: pagu per tahun anggaran (`pagu_blud_{tahun}`),
//       batang pagu disembunyikan saat "semua tahun".
//   B6  Nominal BLUD otomatis di PK memakai rekap tahun apa pun yang paling baru.
//   I3  POST /api/config tidak memeriksa bentuk nilai.
//
// Bagian DB membuat data bertanda `UJI B5/B6` di tahun 2097–2099 dan membersihkannya di
// awal DAN di akhir. Dilewati kalau MySQL tidak menyala.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import { statusPagu, paguPerTahunDariConfig, kunciPaguBlud, POLA_KUNCI_PAGU_BLUD } from '../lib/shared/pagu-blud'
import { aturanConfig, bolehTulisConfig, configTerbuka } from '../lib/data/admin-schemas'
import { getPanels } from '../app/(dashboard)/usulan-kebutuhan/_utils'
import { moduleMenusFor } from '../lib/sentinel/module-menus'
import type { Role } from '../types'
import { BludNominalQuerySchema } from '../lib/data/pk-schemas'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) {
  if (syarat) lulus++
  else gagal.push(nama)
}
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, dapat === harap)
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
/** Komentar dibuang dulu — prosa yang menjelaskan bug lama tidak boleh ikut dicocokkan. */
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const hitung = (isi: string, pola: string) => isi.split(pola).length - 1
/** Badan satu fungsi: dari deklarasinya sampai deklarasi `async function`/`export` berikutnya. */
function badan(isi: string, awal: string): string {
  const i = isi.indexOf(awal)
  if (i < 0) return ''
  const sisa = isi.slice(i + awal.length)
  const j = sisa.search(/\n(export |async function |function )/)
  return awal + (j < 0 ? sisa : sisa.slice(0, j))
}

// ── A. statusPagu ────────────────────────────────────────────────────────────
sama('A1 semua tahun (pagu null) → SEMUA_TAHUN', statusPagu({ pagu: null, nilai_aktif: 5, tahun: null }).jenis, 'SEMUA_TAHUN')
sama('A2 tanpa tahun walau pagu ada → SEMUA_TAHUN', statusPagu({ pagu: 100, nilai_aktif: 5, tahun: null }).jenis, 'SEMUA_TAHUN')
sama('A3 pagu tahun 0 → BELUM_DIATUR', statusPagu({ pagu: 0, nilai_aktif: 5, tahun: '2026' }).jenis, 'BELUM_DIATUR')
sama('A4 nilai = pagu → DALAM', statusPagu({ pagu: 100, nilai_aktif: 100, tahun: '2026' }).jenis, 'DALAM')
sama('A5 nilai > pagu → MELEBIHI', statusPagu({ pagu: 100, nilai_aktif: 101, tahun: '2026' }).jenis, 'MELEBIHI')
const st50 = statusPagu({ pagu: 200, nilai_aktif: 50, tahun: '2026' })
sama('A6 persen = nilai / pagu', st50.jenis === 'DALAM' ? st50.pct : -1, 25)
const st300 = statusPagu({ pagu: 100, nilai_aktif: 300, tahun: '2026' })
sama('A7 persen dipagari 100 untuk batang', st300.jenis === 'MELEBIHI' ? st300.pct : -1, 100)

// ── B. Kunci pagu per tahun ──────────────────────────────────────────────────
sama('B1 kunci pagu per tahun', kunciPaguBlud('2027'), 'pagu_blud_2027')
cek('B2 kunci lama `pagu_blud` bukan kunci per tahun', !POLA_KUNCI_PAGU_BLUD.test('pagu_blud'))
sama('B3 config → peta pagu per tahun',
  JSON.stringify(paguPerTahunDariConfig({ pagu_blud_2026: '5000', pagu_blud_2027: '7000', pagu_blud: '9', batas_aktif: 'true' })),
  JSON.stringify({ 2026: 5000, 2027: 7000 }))

// ── C. I3: bentuk nilai config ───────────────────────────────────────────────
const sah = (k: string, v: string) => aturanConfig(k)?.nilai.safeParse(v).success === true
cek('C1 tanggal kosong boleh (batas tidak dipakai)', sah('batas_mulai', ''))
cek('C2 tanggal YYYY-MM-DD sah', sah('batas_selesai', '2026-10-31'))
cek('C3 teks bebas ditolak (dulu diam-diam mematikan jendela)', !sah('batas_mulai', 'besok'))
cek('C4 tanggal yang tidak ada ditolak', !sah('batas_mulai', '2026-02-30'))
cek('C5 batas_aktif hanya true/false', sah('batas_aktif', 'false') && !sah('batas_aktif', 'ya'))
cek('C6 pagu angka bulat sah', sah('pagu_blud_2026', '72700000000'))
cek('C7 pagu bertitik ditolak', !sah('pagu_blud_2026', '72.700.000.000'))
cek('C8 pagu negatif ditolak', !sah('pagu_blud_2026', '-5'))
sama('C9 kunci lama `pagu_blud` tidak lagi diterima', aturanConfig('pagu_blud'), null)
sama('C10 kunci tak dikenal ditolak', aturanConfig('app_status_global'), null)
const penulis = (k: string) => (aturanConfig(k)?.peran ?? []).join(',')
sama('C11 pengaturan email hanya Super Admin (sesuai layar Email)', penulis('email_notif_enabled') + '|' + penulis('email_notif_recipient'), 'SUPER_ADMIN|SUPER_ADMIN')
sama('C12 batas waktu tetap milik peran admin Usulan', penulis('batas_mulai'), 'SUPER_ADMIN,ADMIN,ADMIN_KASUBAG,ADMIN_KABAG')
// Keputusan 30 Sep: pagu DILIHAT semua, DIUBAH hanya Super Admin, Admin Staff, dan PROGRAM.
sama('C12b pengubah pagu', penulis('pagu_blud_2026'), 'SUPER_ADMIN,ADMIN,PROGRAM')
for (const r of ['ADMIN_KASUBAG', 'ADMIN_KABAG', 'BIDANG_RENBANG', 'MDSI', 'DIKLAT']) {
  cek(`C12c ${r} tidak bisa mengubah pagu`, !aturanConfig('pagu_blud_2026')?.peran.includes(r))
}
cek('C12d penyaring awal POST: PROGRAM lolos, sub-bidang lain tidak', bolehTulisConfig('PROGRAM') && !bolehTulisConfig('MDSI') && bolehTulisConfig('ADMIN_KASUBAG'))
cek('C12e angka pagu terbuka untuk semua pengguna', configTerbuka('pagu_blud_2026') && configTerbuka('batas_mulai'))
cek('C12f kunci lain tetap tertutup untuk non-admin', !configTerbuka('email_notif_enabled') && !configTerbuka('email_notif_recipient') && !configTerbuka('app_status_global'))
cek('C13 alamat email penerima diperiksa', sah('email_notif_recipient', '') && sah('email_notif_recipient', 'a@b.id') && !sah('email_notif_recipient', 'bukan email'))

const RUTE_CONFIG = kode('app/api/config/route.ts')
cek('C14 route config memakai aturanConfig', RUTE_CONFIG.includes('const aturan = aturanConfig(key);'))
cek('C15 route config memeriksa bentuk nilai', RUTE_CONFIG.includes('const nilaiSah = aturan.nilai.safeParse(value);'))
cek('C16 route config memagari penulis per kunci', RUTE_CONFIG.includes('if (!aturan.peran.includes(session.role)) {'))
cek('C16b route config: penyaring awal POST', RUTE_CONFIG.includes("if (!bolehTulisConfig(session.role)) return NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 });"))
cek('C16c route config: GET membuka kunci terbuka ke non-admin', RUTE_CONFIG.includes('if (isAdmin || configTerbuka(r.key)) {'))
cek('C17 tidak ada lagi daftar kunci inline di route', !RUTE_CONFIG.includes('allowedKeys'))
cek('C18 layar Batas Waktu menolak mulai sesudah selesai',
  kode('app/(dashboard)/usulan-kebutuhan/_panels/BatasWaktuPanel.tsx').includes('if (bwMulai && bwSelesai && bwMulai > bwSelesai) {'))

// ── D. Route KPI Usulan ──────────────────────────────────────────────────────
const RUTE_KPI = kode('app/api/usulan/kpi/route.ts')
cek('D1 KPI membaca pagu tahun yang dipilih', RUTE_KPI.includes('const pagu = tahun ? await paguBludTahun(tahun) : null;'))
cek('D2 KPI menolak tahun tak sah', RUTE_KPI.includes('if (tahun !== null && !POLA_TAHUN_ANGGARAN.test(tahun)) {'))
cek("D3 KPI tak lagi membaca kunci tunggal 'pagu_blud'", !RUTE_KPI.includes("'pagu_blud'"))
sama('D4 cabang Bidang: header disaring tahun', hitung(RUTE_KPI, '${tahunHeader}'), 1)
sama('D5 cabang Bidang: kedua kueri item disaring tahun', hitung(RUTE_KPI, '${tahunItem}'), 2)
cek('D6 verifikator: ringkasan disaring lingkup', RUTE_KPI.includes('FROM usulan_items ${scope}`'))
cek('D7 verifikator + tahun: saringan header tahun',
  RUTE_KPI.includes('? (tahun ? sql`WHERE h.tahun_anggaran = ${tahun}` : null)'))
cek('D8 pemohon + tahun: miliknya DAN tahunnya',
  RUTE_KPI.includes('sql`WHERE h.created_by = ${session.userId} AND h.tahun_anggaran = ${tahun}`'))
sama('D9 grafik status & sub bidang ikut lingkup', hitung(RUTE_KPI, 'FROM usulan_items ${scope} GROUP BY'), 2)
sama('D10 tahun dipulangkan di kedua cabang', hitung(RUTE_KPI, 'pagu, tahun,'), 2)

// ── E. /dashboard ────────────────────────────────────────────────────────────
const DASH = kode('lib/data/dashboard.ts')
cek('E1 ringkasan Usulan menerima tahun', DASH.includes('async function getUsulanSummary(tahun: string)'))
cek('E2 detail Usulan menerima tahun', DASH.includes('async function getUsulanDetail(tahun: string)'))
sama('E3 keempat kueri Usulan disaring tahun', hitung(DASH, '${itemUsulanTahun(tahun)}'), 4)
cek('E4 ringkasan dipanggil dengan tahun', DASH.includes('getUsulanSummary(tahun),'))
cek('E5 detail Usulan dipanggil dengan tahun', DASH.includes("case 'usulan':            return { modul, data: await getUsulanDetail(tahun) };"))
cek('E6 detail BLUD menerima tahun', DASH.includes('async function getBludDetail(tahun: number)'))
cek('E7 detail BLUD memakai DPA tahun itu', badan(DASH, 'async function getBludDetail(').includes('await getDpaLatestDate(tahun)'))
cek('E8 tak ada lagi "DPA terbaru tahun apa pun"', !DASH.includes('getDpaLatest('))
cek('E9 detail BLUD dipanggil dengan tahun', DASH.includes("case 'blud':              return { modul, data: await getBludDetail(Number(tahun)) };"))

// ── F. Layar Usulan ──────────────────────────────────────────────────────────
const KLIEN = kode('app/(dashboard)/usulan-kebutuhan/usulan-client.tsx')
cek('F1 kunci SWR KPI membawa tahun', KLIEN.includes("kpiEnabled ? `/api/usulan/kpi${kpiTahun ? `?tahun=${kpiTahun}` : ''}` : null,"))
for (const [panel, state] of [
  ['dashboard', 'dashTahun'], ['milik', 'filterTahun'], ['semua', 'filterTahunSemua'], ['data-admin', 'filterTahunDA'],
  ['antrian', 'filterAntrianTahun'], ['bidang-antrian', 'filterBidangAntrianTahun'], ['bidang-data', 'filterBidangDataTahun'],
] as const) {
  cek(`F2 panel ${panel} → saringan ${state}`, new RegExp(`panel === '${panel}'\\s+\\? ${state} :`).test(KLIEN))
}
cek('F3 panel ber-KPI yang dulu memakai sisa panel lain ikut memuat',
  KLIEN.includes("|| panel === 'milik'   || panel === 'bidang-antrian' || panel === 'bidang-data';"))
cek('F4 segarkan KPI menyegarkan SEMUA tahun',
  KLIEN.includes("await swrMutate((k) => typeof k === 'string' && k.startsWith('/api/usulan/kpi'), undefined,"))
cek('F5 pagu dibaca per tahun dari config', KLIEN.includes('setPaguPerTahun(paguPerTahunDariConfig(cfg));'))
cek('F6 Dashboard mengoper pemilih tahunnya', KLIEN.includes('tahun={dashTahun} setTahun={setDashTahun} tahunList={tahunList}'))
const PANEL_DIR = 'app/(dashboard)/usulan-kebutuhan/_panels/'
for (const p of ['DashboardPanel', 'MilikPanel']) {
  const isi = kode(`${PANEL_DIR}${p}.tsx`)
  cek(`F7 ${p} memakai PaguKpiBar bersama`, isi.includes('<PaguKpiBar kpi={kpi}'))
  cek(`F8 ${p} tak lagi menghitung pagu sendiri`, !isi.includes('kpi.pagu'))
}
const UTILS = kode('app/(dashboard)/usulan-kebutuhan/_utils.tsx')
cek('F9 PaguKpiBar memakai statusPagu', UTILS.includes('const st = statusPagu(kpi);'))
cek('F10 semua tahun: batang diganti keterangan', UTILS.includes("{st.jenis === 'SEMUA_TAHUN' ? ("))
cek('F11 Set Pagu menulis kunci per tahun', kode(`${PANEL_DIR}SetPaguPanel.tsx`).includes('body: JSON.stringify({ key: kunciPaguBlud(tahun), value: String(value) }),'))
const adaSetPagu = (r: string) => getPanels(r as Role).includes('set-pagu')
cek('F12 panel Set Pagu: Super Admin, Admin, PROGRAM', adaSetPagu('SUPER_ADMIN') && adaSetPagu('ADMIN') && adaSetPagu('PROGRAM'))
cek('F13 panel Set Pagu tidak untuk peran lain', !['ADMIN_KASUBAG', 'ADMIN_KABAG', 'BIDANG_RENBANG', 'MDSI', 'DIKLAT'].some(adaSetPagu))
// Cermin getPanels milik Sentinel (lib/sentinel/module-menus.ts) wajib sepakat (L69).
cek('F14 Sentinel menawarkan Set Pagu BLUD ke PROGRAM', moduleMenusFor('usulan_aset', 'PROGRAM' as Role).includes('Set Pagu BLUD'))
cek('F15 Sentinel tidak menawarkannya ke sub-bidang lain', !moduleMenusFor('usulan_aset', 'MDSI' as Role).includes('Set Pagu BLUD'))

// ── G. PK (B6) ───────────────────────────────────────────────────────────────
const PK = badan(kode('lib/data/pk.ts'), 'export async function getBludNominalByUnit(')
cek('G1 fungsi menerima tahun', PK.includes('export async function getBludNominalByUnit(unitKerja: string, tahun: number)'))
cek('G2 versi terbaru TAHUN itu, sebagai teks',
  PK.includes("sql`SELECT DATE_FORMAT(MAX(versi_dpa), '%Y-%m-%d') AS versi FROM rekap_pk WHERE tahun_anggaran = ${tahun}`"))
sama('G3 kedua kueri nominal disaring tahun', hitung(PK, 'WHERE rp.tahun_anggaran = ${tahun}'), 2)
cek('G4 tahun WAJIB di query', !BludNominalQuerySchema.safeParse({ unit: 'X' }).success)
sama('G5 tahun dibaca sebagai angka', BludNominalQuerySchema.safeParse({ unit: 'X', tahun: '2026' }).data?.tahun, 2026)
cek('G6 route meneruskan tahun', kode('app/api/perjanjian-kinerja/blud-nominal/route.ts').includes('getBludNominalByUnit(q.data.unit, q.data.tahun)'))
const LAMPIRAN = kode('app/(dashboard)/perjanjian-kinerja/form/_components/LampiranAnggaranSplit.tsx')
sama('G7 layar PK mengirim tahun dokumen di satu pintu', hitung(LAMPIRAN, '/api/perjanjian-kinerja/blud-nominal?'), 1)
cek('G8 layar PK mengirim tahun dokumen', LAMPIRAN.includes('&tahun=${encodeURIComponent(form.tahun)}'))
cek('G9 tahun tanpa rekap dikatakan, tidak diisi Rp 0', LAMPIRAN.includes('if (!r.versi_dpa) {'))

// ── H. Basis data sungguhan ─────────────────────────────────────────────────
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost', port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
    timezone: '+07:00',
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}

async function bersih(k: mysql.Connection) {
  await k.query("DELETE FROM app_config WHERE `key` IN ('pagu_blud_2099')")
  await k.query("DELETE FROM usulan_headers WHERE no_usulan LIKE 'UJI-B5-%'")
  await k.query("DELETE FROM rekap_pk WHERE label LIKE 'UJI B6%'")
  await k.query("DELETE FROM pk_unit_kerja_blud_pj WHERE unit_pk LIKE 'UJI B6%'")
  await k.query("DELETE FROM pk_unit_kerja WHERE nama_unit LIKE 'UJI B6%'")
  await k.query("DELETE FROM penanggung_jawab WHERE label LIKE 'UJI B6%'")
}

if (c) {
  const k = c
  const { paguBludTahun } = await import('../lib/data/usulan')
  const { getModuleDetail } = await import('../lib/data/dashboard')
  const { getBludNominalByUnit } = await import('../lib/data/pk')
  await bersih(k)
  try {
    await k.query("INSERT INTO app_config (`key`, value) VALUES ('pagu_blud_2099', '7000000000')")
    sama('H1 pagu tahun yang diatur', await paguBludTahun('2099'), 7000000000)
    sama('H2 pagu tahun yang belum diatur = 0', await paguBludTahun('2097'), 0)

    async function usulan(no: string, tahun: string, item: { qty: number; harga: number; status: string; disetujui?: number }) {
      const [h] = await k.query(
        "INSERT INTO usulan_headers (no_usulan, pengusul, sub_bidang, tahun_anggaran, status_ringkas) VALUES (?, 'uji', 'UJI_B5', ?, 'DIAJUKAN')",
        [no, tahun]) as [{ insertId: number }, unknown]
      await k.query(
        `INSERT INTO usulan_items (usulan_id, no_usulan, no_item, sub_bidang, pengusul, nama_barang, qty, harga_est, status, nominal_disetujui)
         VALUES (?, ?, 1, 'UJI_B5', 'uji', 'barang uji', ?, ?, ?, ?)`,
        [h.insertId, no, item.qty, item.harga, item.status, item.disetujui ?? null])
    }
    await usulan('UJI-B5-2099-1', '2099', { qty: 2, harga: 1000, status: 'DIAJUKAN' })
    await usulan('UJI-B5-2098-1', '2098', { qty: 1, harga: 5000, status: 'DISETUJUI', disetujui: 5000 })
    const d99 = await getModuleDetail('usulan', '2099')
    const d98 = await getModuleDetail('usulan', '2098')
    const u99 = d99.modul === 'usulan' ? d99.data : null
    const u98 = d98.modul === 'usulan' ? d98.data : null
    sama('H3 detail Usulan 2099 hanya item 2099', u99?.kpi.total, 1)
    sama('H4 nilai aktif 2099 tanpa item 2098', u99?.kpi.nilai_aktif, 2000)
    sama('H5 detail Usulan 2098 hanya item 2098', u98?.kpi.disetujui, 1)
    sama('H6 nilai disetujui 2098', u98?.kpi.nilai_disetujui, 5000)
    sama('H7 tabel sub bidang ikut tahun', u99?.table.find(r => r.sub_bidang === 'UJI_B5')?.total, 1)
    const b97 = await getModuleDetail('blud', '2097')
    sama('H8 detail BLUD tahun tanpa DPA: versi kosong, bukan DPA tahun lain',
      b97.modul === 'blud' ? b97.data.kpi.versi_tanggal : 'bukan blud', null)

    await k.query("INSERT INTO penanggung_jawab (label, urutan) VALUES ('UJI B6 Kasubbag', 999)")
    await k.query("INSERT INTO pk_unit_kerja (nama_unit, level) VALUES ('UJI B6 Kasubbag', 'subkegiatan'), ('UJI B6 Wadir', 'program')")
    await k.query("INSERT INTO pk_unit_kerja_blud_pj (unit_pk, blud_pj_label) VALUES ('UJI B6 Wadir', 'UJI B6 Kasubbag')")
    await k.query(`INSERT INTO rekap_pk (tahun_anggaran, versi_dpa, label, nominal) VALUES
      (2098, '2098-12-31', 'UJI B6 Kasubbag', 100),
      (2099, '2099-01-15', 'UJI B6 Kasubbag', 555),
      (2099, '2099-01-31', 'UJI B6 Kasubbag', 999)`)
    const n99 = await getBludNominalByUnit('UJI B6 Kasubbag', 2099)
    sama('H9 PK 2099: versi terbaru 2099', n99.versi_dpa, '2099-01-31')
    sama('H10 PK 2099: nominal versi itu', n99.nominal, 999)
    const n98 = await getBludNominalByUnit('UJI B6 Kasubbag', 2098)
    sama('H11 PK 2098 tidak terisi angka 2099 yang lebih baru', n98.nominal, 100)
    sama('H12 PK 2098: versinya sendiri', n98.versi_dpa, '2098-12-31')
    const n97 = await getBludNominalByUnit('UJI B6 Kasubbag', 2097)
    sama('H13 tahun tanpa rekap: versi kosong', n97.versi_dpa, null)
    sama('H14 unit program lewat pemetaan ikut tahunnya', (await getBludNominalByUnit('UJI B6 Wadir', 2098)).nominal, 100)
  } finally {
    await bersih(k)
  }
  const [sisa] = await k.query(`SELECT
      (SELECT COUNT(*) FROM usulan_headers WHERE no_usulan LIKE 'UJI-B5-%') +
      (SELECT COUNT(*) FROM rekap_pk WHERE label LIKE 'UJI B6%') +
      (SELECT COUNT(*) FROM pk_unit_kerja WHERE nama_unit LIKE 'UJI B6%') +
      (SELECT COUNT(*) FROM app_config WHERE \`key\` = 'pagu_blud_2099') AS n`) as [Array<{ n: number }>, unknown]
  sama('H15 data uji dibersihkan', Number(sisa[0].n), 0)
  await k.end()
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
for (const g of gagal) console.log('  GAGAL ' + g)
process.exit(gagal.length ? 1 : 0)
