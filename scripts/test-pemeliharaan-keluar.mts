#!/usr/bin/env npx tsx
// scripts/test-pemeliharaan-keluar.mts — "Pemeliharaan & keluar otomatis".
// Konsep: docs/CONCEPT-pemeliharaan-keluar.md
// Jalankan: npx tsx --env-file=.env.local scripts/test-pemeliharaan-keluar.mts
// Bagian C memakai MySQL sungguhan di dalam SATU transaksi yang di-ROLLBACK di akhir — jadwal &
// sesi uji tidak pernah ter-commit, jadi sesi sungguhan di basis data pengembangan tidak tersentuh.
// Tanpa --env-file bagian itu DILEWATI dan jumlah lulusnya turun.
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  KUNCI_JADWAL_KELUAR, PILIHAN_JEDA_MENIT, PILIHAN_TAHAN_JAM, TAHAN_LOGIN_BAWAAN_JAM, TAHAN_LOGIN_MAKS_JAM, bacaJadwal, detikAntara, sesiKenaKeluar,
  loginDitahan, statusUntukSesi, ringkasJadwal, alasanTolakKirim, alasanTolakBatal, alasanTolakBukaLogin,
  kalimatLoginDitahan, formatSisa, menitTahan, labelTahan, tambahMenit, kapanDari, type JadwalKeluar,
} from '../lib/security/jadwal-keluar'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const badan = (isi: string, awal: string) => { const i = isi.indexOf(awal); return i < 0 ? '' : isi.slice(i, isi.indexOf('\n}\n', i)) }
/** Tiap potongan dicari SESUDAH potongan sebelumnya — "return null" milik cabang lain tidak ikut terhitung. */
const urut = (s: string, ...p: string[]) => { let i = 0; for (const x of p) { const j = s.indexOf(x, i); if (j < 0) return false; i = j + x.length } return true }
const coba = async <T,>(f: () => Promise<T>): Promise<T | Error> => { try { return await f() } catch (e) { return e as Error } }

// Kirim 10:00, keluar 10:05, login dibuka 12:05.
const J: JadwalKeluar = {
  pesan: 'Simpan dulu', dikirim: '2026-11-03 10:00:00', batas: '2026-11-03 10:05:00', oleh: 'sa',
  sesi_pengirim: 'SESI-SA', tahan_login: true, login_dibuka: '2026-11-03 12:05:00',
}
const staf = (dibuat: string, id = 'S1') => ({ id, dibuat, role: 'PROGRAM' })

// ─────────────────────────────────────────────────────────────────────────────
console.log('A. Aturan')
ok('A1 jadwal terbaca bolak-balik', JSON.stringify(bacaJadwal(JSON.stringify(J))) === JSON.stringify(J))
ok('A2 kosong / rusak / tanpa batas / batas sebelum dikirim → tidak ada jadwal (tidak mengeluarkan siapa pun)',
  bacaJadwal('') === null && bacaJadwal(null) === null && bacaJadwal('{rusak') === null && bacaJadwal('"teks"') === null
  && bacaJadwal(JSON.stringify({ ...J, batas: undefined })) === null
  && bacaJadwal(JSON.stringify({ ...J, batas: '2026-11-03T10:05:00Z' })) === null
  && bacaJadwal(JSON.stringify({ ...J, batas: '2026-11-03 09:00:00' })) === null)
ok('A3 tahan_login hanya true bila benar-benar true', bacaJadwal(JSON.stringify({ ...J, tahan_login: 'ya' }))?.tahan_login === false)

ok('A4 sebelum batas: tidak ada yang ditolak', !sesiKenaKeluar(J, staf('2026-11-03 09:00:00'), '2026-11-03 10:04:59'))
ok('A5 sesudah batas: sesi yang lahir sebelum batas ditolak — tepat pada detiknya', sesiKenaKeluar(J, staf('2026-11-03 09:00:00'), '2026-11-03 10:05:00'))
ok('A6 sesi yang lahir pada/sesudah batas tidak ditolak', !sesiKenaKeluar(J, staf('2026-11-03 10:05:00'), '2026-11-03 11:00:00'))
ok('A7 sesi pengirim tidak ikut keluar', !sesiKenaKeluar(J, { id: 'SESI-SA', dibuat: '2026-11-03 08:00:00', role: 'SUPER_ADMIN' }, '2026-11-03 10:06:00'))
ok('A8 SUPER_ADMIN yang masuk sesudah pesan dikirim tidak ikut keluar; yang masuk sebelumnya ikut',
  !sesiKenaKeluar(J, { id: 'SA2', dibuat: '2026-11-03 10:01:00', role: 'SUPER_ADMIN' }, '2026-11-03 10:06:00')
  && sesiKenaKeluar(J, { id: 'SA3', dibuat: '2026-11-03 09:59:59', role: 'SUPER_ADMIN' }, '2026-11-03 10:06:00'))
ok('A9 staf yang masuk SESUDAH pesan dikirim (login tidak ditahan) tetap ikut keluar', sesiKenaKeluar(J, staf('2026-11-03 10:02:00'), '2026-11-03 10:06:00'))
ok('A10 tanpa jadwal: tidak ada yang ditolak', !sesiKenaKeluar(null, staf('2026-01-01 00:00:00'), '2026-11-03 10:06:00'))
ok('A11 pengirim tanpa id sesi tidak membebaskan semua sesi tanpa id', sesiKenaKeluar({ ...J, sesi_pengirim: '' }, staf('2026-11-03 09:00:00', ''), '2026-11-03 10:06:00'))

ok('A12 login ditahan sejak pesan dikirim sampai dibuka',
  !loginDitahan(J, '2026-11-03 09:59:59') && loginDitahan(J, '2026-11-03 10:00:00') && loginDitahan(J, '2026-11-03 12:04:59')
  && !loginDitahan(J, '2026-11-03 12:05:00'))
ok('A13 tanpa centang tahan: login tidak pernah ditahan', !loginDitahan({ ...J, tahan_login: false }, '2026-11-03 10:06:00') && !loginDitahan(null, '2026-11-03 10:06:00'))
ok('A14 kalimat login ditahan menyebut jamnya; hari lain → nama hari + tanggal', kalimatLoginDitahan(J, '2026-11-03 10:06:00').includes('paling lambat pukul 12:05')
  && kalimatLoginDitahan({ ...J, login_dibuka: '2026-11-05 10:30:00' }, '2026-11-03 10:06:00').includes('paling lambat Kamis, 5 Nov pukul 10:30'),
  kalimatLoginDitahan({ ...J, login_dibuka: '2026-11-05 10:30:00' }, '2026-11-03 10:06:00'))

const st = statusUntukSesi(J, staf('2026-11-03 09:00:00'), '2026-11-03 10:01:30')
ok('A15 status tab: hitung mundur dari sisa menurut server', st.aktif && st.sisa_detik === 210 && !st.dikecualikan && st.pesan === 'Simpan dulu', JSON.stringify(st))
const stSa = statusUntukSesi(J, { id: 'SESI-SA', dibuat: '2026-11-03 08:00:00', role: 'SUPER_ADMIN' }, '2026-11-03 10:01:30')
ok('A16 tab pengirim: aktif tapi dikecualikan (tidak dapat modal)', stSa.aktif && stSa.dikecualikan)
ok('A17 tepat pada batas / sesudahnya / tanpa jadwal: tidak aktif',
  !statusUntukSesi(J, staf('2026-11-03 09:00:00'), '2026-11-03 10:05:00').aktif
  && !statusUntukSesi(J, staf('2026-11-03 10:06:00'), '2026-11-03 10:06:00').aktif && !statusUntukSesi(null, staf('x'), 'y').aktif)

const r1 = ringkasJadwal(J, '2026-11-03 10:04:00'), r2 = ringkasJadwal(J, '2026-11-03 11:05:00'), r3 = ringkasJadwal(J, '2026-11-03 12:05:00')
ok('A18 ringkasan Admin Panel: hitung mundur → login ditahan → selesai, sisa menuju tujuan masing-masing',
  r1?.tahap === 'HITUNG_MUNDUR' && r1.sisa_detik === 60 && r2?.tahap === 'LOGIN_DITAHAN' && r2.sisa_detik === 3600
  && r3?.tahap === 'SELESAI' && r3.sisa_detik === 0, JSON.stringify([r1?.tahap, r1?.sisa_detik, r2?.tahap, r2?.sisa_detik, r3?.tahap]))
ok('A19 tanpa tahan login: langsung selesai sesudah batas', ringkasJadwal({ ...J, tahan_login: false }, '2026-11-03 10:06:00')?.tahap === 'SELESAI')

ok('A20 kirim baru ditolak selama hitung mundur berjalan, boleh sesudahnya',
  !!alasanTolakKirim(J, '2026-11-03 10:04:00') && alasanTolakKirim(J, '2026-11-03 10:05:00') === null && alasanTolakKirim(null, 'x') === null)
ok('A21 batalkan hanya sebelum batas', alasanTolakBatal(J, '2026-11-03 10:04:00') === null && !!alasanTolakBatal(J, '2026-11-03 10:05:00') && !!alasanTolakBatal(null, 'x'))
ok('A22 buka login hanya selama ditahan', alasanTolakBukaLogin(J, '2026-11-03 10:30:00') === null && !!alasanTolakBukaLogin(J, '2026-11-03 12:05:00')
  && !!alasanTolakBukaLogin({ ...J, tahan_login: false }, '2026-11-03 10:30:00'))
ok('A23 selisih detik melewati tengah malam & akhir bulan', detikAntara('2026-10-31 23:59:30', '2026-11-01 00:00:10') === 40)
ok('A24 hitung mundur mm:ss, tak pernah negatif; ≥ 1 jam → j:mm:ss', formatSisa(299) === '04:59' && formatSisa(0) === '00:00' && formatSisa(-5) === '00:00'
  && formatSisa(900) === '15:00' && formatSisa(3599) === '59:59' && formatSisa(3600) === '1:00:00' && formatSisa(129600) === '36:00:00')
ok('A25 pilihan jeda 1/5/10/15; tahan bawaan 2 jam, pilihan cepat 30 menit–8 jam', PILIHAN_JEDA_MENIT.join() === '1,5,10,15'
  && TAHAN_LOGIN_BAWAAN_JAM === 2 && PILIHAN_TAHAN_JAM.join() === '0.5,1,2,4,8')
ok('A26 lama tahan: 30 menit–168 jam (7 hari) dalam menit; di luar itu / bukan angka ditolak',
  menitTahan(0.5) === 30 && menitTahan(1.5) === 90 && menitTahan(168) === 10080 && menitTahan(12) === 720
  && menitTahan(0.25) === null && menitTahan(168.5) === null && menitTahan(Number.NaN) === null && menitTahan(-2) === null && TAHAN_LOGIN_MAKS_JAM === 168)
ok('A27 label lama tahan', labelTahan(0.5) === '30 menit' && labelTahan(1) === '1 jam' && labelTahan(1.5) === '1,5 jam' && labelTahan(36) === '36 jam' && labelTahan(500) === '')
ok('A28 tambah menit melewati tengah malam, akhir bulan & akhir tahun',
  tambahMenit('2026-11-03 23:50:00', 20) === '2026-11-04 00:10:00' && tambahMenit('2026-12-31 22:00:00', 10080) === '2027-01-07 22:00:00')
ok('A29 jam buka: hari sama → "pukul", hari lain → nama hari, tahun lain → + tahun',
  kapanDari('2026-11-03 12:05:00', '2026-11-03 10:00:00') === 'pukul 12:05' && kapanDari('2026-11-05 10:30:00', '2026-11-03 10:00:00') === 'Kamis, 5 Nov pukul 10:30'
  && kapanDari('2027-01-07 22:00:00', '2026-12-31 22:00:00') === 'Kamis, 7 Jan 2027 pukul 22:00')

// ─────────────────────────────────────────────────────────────────────────────
console.log('B. Sambungan kode')
const AUTH = tanpaKomentar(sumber('lib/security/auth.ts'))
const GS = badan(AUTH, 'export async function getSession')
ok('B1 getSession: jadwal menumpang kueri sesi lewat LEFT JOIN (nol kueri tambahan)',
  /LEFT JOIN app_config m ON m\.\\`key\\` = \$\{KUNCI_JADWAL_KELUAR\}/.test(GS) && (GS.match(/await sql`/g) ?? []).length === 2, GS.slice(0, 200))
ok('B2 getSession: sesi kena pemeliharaan ditolak (return null) sebelum pemeriksaan idle',
  urut(GS, 'if (sesiKenaKeluar(bacaJadwal(r.jadwal), { id: payload.sessionId, dibuat: r.dibuat, role: r.role }, r.sekarang))', 'return null;', 'if (payload.lastActive)'))
ok('B3 getSession: waktu sesi & sekarang dari jam MySQL yang sama', GS.includes("DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s') AS dibuat") && GS.includes("DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')"))
ok('B4 getSession: peran dari users.role (segar), bukan user_sessions.role', /SELECT u\.status, u\.role,/.test(GS) && !/s\.role/.test(GS))

const LOGIN = tanpaKomentar(sumber('app/api/auth/login/route.ts'))
ok('B5 login: ditahan diperiksa SESUDAH kata sandi benar dan SEBELUM sesi dibuat',
  urut(LOGIN, 'const isValid = await verifyPassword(', "if (user.role !== 'SUPER_ADMIN') {", 'await alasanLoginDitahan()', 'INSERT INTO user_sessions'))
ok('B6 login ditahan: 503 PEMELIHARAAN + jejak LOGIN_BLOCKED', /code: 'PEMELIHARAAN', message: ditahan \}, \{ status: 503 \}/.test(LOGIN) && LOGIN.includes("detail: 'Login ditahan: pemeliharaan'"))

const STATUS = tanpaKomentar(sumber('app/api/auth/pemeliharaan/route.ts'))
ok('B7 status tab TIDAK memperpanjang sesi', !/createToken|setSessionCookie|last_active|keepalive/.test(STATUS))
ok('B8 status tab: token dibaca sebelum getSession, 401 membawa alasan',
  urut(STATUS, 'cookies()).get(COOKIE_NAME)', 'await getSession()', 'alasan: await alasanSesiDitolak(token)'))
const KEEP = tanpaKomentar(sumber('app/api/auth/keepalive/route.ts'))
ok('B9 keepalive: 401 juga membawa alasan (token dibaca sebelum getSession)',
  urut(KEEP, 'cookies()).get(COOKIE_NAME)', 'const session = await getSession()', 'alasan: await alasanSesiDitolak(token)'))
const SKA = tanpaKomentar(sumber('components/guards/SessionKeepAlive.tsx'))
ok('B10 SessionKeepAlive: alasan PEMELIHARAAN → login ?reason=pemeliharaan', SKA.includes("redirectExpired(alasan === 'PEMELIHARAAN' ? 'pemeliharaan' : 'expired')") && SKA.includes('router.replace(`/login?reason=${reason}`)'))

const LAYOUT = tanpaKomentar(sumber('app/(dashboard)/layout.tsx'))
ok('B11 tata letak dashboard memasang penjaga di samping SessionKeepAlive', urut(LAYOUT, '<SessionKeepAlive />', '<PenjagaPemeliharaan />'))
const PJ = tanpaKomentar(sumber('components/guards/PenjagaPemeliharaan.tsx'))
const KELUAR = badan(PJ, '  const keluar = useCallback(').slice(0, 1400)
ok('B12 penjaga: Keluar sekarang menanyakan isian belum tersimpan; keluar otomatis tidak', KELUAR.includes('if (!otomatis && !(await bolehTinggalkanHalaman())) return;'))
ok('B13 penjaga: pengingat dilepas & beforeunload layar lain diputus SEBELUM pindah halaman',
  urut(KELUAR, 'lepaskanPengingat();', "window.addEventListener('beforeunload', e => e.stopImmediatePropagation(), { capture: true });", "fetch('/api/auth/logout'", "window.location.href = '/login?reason=pemeliharaan'"))
ok('B14 penjaga: bertanya berkala SELANG_TANYA_MS + saat tab kembali terlihat', /setInterval\(\(\) => \{ void tanya\(\); \}, SELANG_TANYA_MS\)/.test(PJ) && PJ.includes("addEventListener('visibilitychange', onLihat)"))
ok('B15 penjaga: tab yang bangun sesudah batas langsung pulang tanpa menunggu jaringan', /if \(h && Date\.now\(\) >= h\.batasMs\) void keluar\(true\);/.test(PJ))
ok('B16 penjaga: batas dari sisa menurut server, bukan jam peramban', PJ.includes('batasMs: Date.now() + Number(d.sisa_detik ?? 0) * 1000'))
ok('B17 penjaga: pengirim (dikecualikan) tidak dapat modal', PJ.includes('d.aktif && !d.dikecualikan ?'))
ok('B18 penjaga: hitung mundur habis → keluar otomatis', /if \(s <= 0\) void keluar\(true\);/.test(PJ))
ok('B18b modal ikut tema terang (palet ConfirmDialog), spanduk merah sama di kedua tema',
  PJ.includes('[data-theme="light"] .pml-kartu { background: #FAFAFA; color: #0F0F12;') && PJ.includes('[data-theme="light"] .pml-sisa-label, [data-theme="light"] .pml-catatan { color: #6B7280; }'))

const ADM = tanpaKomentar(sumber('app/api/admin/pemeliharaan/route.ts'))
ok('B19 route admin: GET & POST hanya SUPER_ADMIN', ADM.includes("return session?.role === 'SUPER_ADMIN' ? session : null;")
  && (ADM.match(/const session = await sesiSuperAdmin\(\);\n  if \(!session\) return NextResponse\.json\(\{ ok: false, message: 'Unauthorized' \}, \{ status: 403 \}\);/g) ?? []).length === 2)
ok('B20 route admin: jeda divalidasi ke daftar pilihan, pesan ≤ 500', ADM.includes('(PILIHAN_JEDA_MENIT as readonly number[]).includes(n)') && ADM.includes(".max(500,"))
ok('B21 route admin: tiap aksi diaudit PEMELIHARAAN_KELUAR, sesi pengirim dari sesi server', ADM.includes("eventType: 'PEMELIHARAAN_KELUAR'") && ADM.includes('sesiPengirim: session.sessionId'))
const DATA = tanpaKomentar(sumber('lib/security/jadwal-keluar-data.ts'))
const SYARAT = badan(DATA, 'const sesiKenaKeluarSql')
const TERAPKAN = badan(DATA, 'export async function terapkanKeluar')
const HITUNG = badan(DATA, 'export async function hitungSesiLain')
ok('B22 syarat SQL kena-keluar = cermin sesiKenaKeluar (batas lewat, lahir sebelum batas, bukan pengirim, bukan SA sesudah dikirim)',
  SYARAT.includes('NOW() >= ${j.batas}') && SYARAT.includes('AND s.created_at < ${j.batas}') && SYARAT.includes('AND s.session_id <> ${j.sesi_pengirim}')
  && SYARAT.includes("AND NOT (u.role = 'SUPER_ADMIN' AND s.created_at >= ${j.dikirim})"))
ok('B22b satu syarat untuk mematikan DAN menghitung (bukan dua salinan)', TERAPKAN.includes('WHERE s.invalidated_at IS NULL AND ${sesiKenaKeluarSql(j)}')
  && HITUNG.includes('${j ? sql`AND NOT ${sesiKenaKeluarSql(j)}` : sql``}') && !/NOW\(\) >= \$\{j\.batas\}/.test(TERAPKAN + HITUNG))
ok('B22c GET panel Admin hanya membaca: tanpa terapkanKeluar, jadwal dioper ke penghitung',
  !/terapkanKeluar|UPDATE/.test(badan(ADM, 'export async function GET')) && ADM.includes("hitungSesiLain(session.sessionId ?? '', jadwal)"))
const KUNCI = badan(DATA, 'async function kunciJadwal')
ok('B23 baris jadwal dibuat dulu (INSERT IGNORE) lalu dikunci FOR UPDATE (L69-a)', urut(KUNCI, 'INSERT IGNORE INTO app_config', 'FOR UPDATE'))
const KIRIM = badan(DATA, 'export async function kirimDalam')
ok('B24 kirim: tolak dulu, matikan sesi jadwal lama, baru tulis', urut(KIRIM, 'await kunciJadwal(tx)', 'alasanTolakKirim(lama, sekarang)', 'if (lama) await terapkanKeluar(tx, lama);', 'await tulisJadwal(tx, baru)'))
ok('B25 kirim: batas dihitung jam MySQL, bukan jam Node', KIRIM.includes('CAST(${sekarang} AS DATETIME) + INTERVAL ${opsi.menit} MINUTE') && !/Date\.now|new Date/.test(KIRIM))
ok('B25b kirim: lama tahan pilihan (menit) dinilai SEBELUM ditulis, tidak lagi angka mati 2 jam',
  urut(KIRIM, 'const tahan = menitTahan(opsi.tahanJam);', 'if (opsi.tahanLogin && tahan === null) throw new JadwalKeluarError(PESAN_TAHAN_TIDAK_SAH, 400);', 'await tulisJadwal(tx, baru)')
  && KIRIM.includes('+ INTERVAL ${opsi.menit} MINUTE + INTERVAL ${tahan ?? 0} MINUTE') && !/HOUR/.test(KIRIM))
ok('B20b route admin: tahan_jam dinilai menitTahan, tab lama tanpa kolom = 2 jam, diteruskan ke kirim',
  ADM.includes('tahan_jam:   z.number().refine(j => menitTahan(j) !== null, PESAN_TAHAN_TIDAK_SAH).default(TAHAN_LOGIN_BAWAAN_JAM),')
  && ADM.includes('tahanJam: b.tahan_jam,') && /export async function GET[\s\S]*?\n    sekarang,\n/.test(ADM))
const TP = tanpaKomentar(sumber('app/(dashboard)/admin/_panels/TabPemeliharaan.tsx'))
ok('B30 panel: pilihan cepat + "Lainnya" (ketik jam, koma boleh), Kirim mati bila tidak sah, jam buka bertanggal',
  TP.includes('PILIHAN_TAHAN_JAM.map(h =>') && TP.includes('<option value={LAINNYA}>Lainnya…</option>')
  && TP.includes("const tahanJam = tahanPilih === LAINNYA ? bacaDesimal(tahanKetik) : Number(tahanPilih);")
  && TP.includes('disabled={sibuk || !pesan.trim() || k === null || !tahanSah}') && TP.includes('...(tahan ? { tahan_jam: tahanJam } : {})')
  && (TP.match(/kapanDari\(j\.login_dibuka, j\.sekarang\)/g) ?? []).length === 2 && !TP.includes('TAHAN_LOGIN_MAKS_JAM} jam kemudian'))

const LF = tanpaKomentar(sumber('app/(auth)/login/login-form.tsx'))
ok('B26 halaman login: keterangan dikeluarkan untuk pemeliharaan + pemberitahuan login ditahan',
  LF.includes("searchParams.get('reason') === 'pemeliharaan'") && LF.includes('Login dibuka lagi paling lambat {loginDitahan.sampai}')
  && DATA.includes('{ sampai: kapanDari(jadwal.login_dibuka, sekarang) }')
  && tanpaKomentar(sumber('app/(auth)/login/page.tsx')).includes('<LoginForm pemeliharaan={pemeliharaan} loginDitahan={loginDitahan} />'))
const AC = tanpaKomentar(sumber('app/(dashboard)/admin/admin-client.tsx'))
ok('B27 tab Admin Panel hanya untuk SUPER_ADMIN', AC.includes("...(isSA ? [{ id:'pemeliharaan' as Tab,") && AC.includes("{tab === 'pemeliharaan'    && isSA && <TabPemeliharaan/>}"))
ok('B28 jenis audit baru digolongkan retensi PANJANG', tanpaKomentar(sumber('lib/security/retensi-audit.ts')).includes('PEMELIHARAAN_KELUAR: P'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('C. MySQL (satu transaksi, di-ROLLBACK)')
if (!process.env.MYSQL_HOST) {
  console.log('  (dilewati — jalankan dengan --env-file=.env.local)')
} else {
  const { kirimDalam, batalkanDalam, bukaLoginDalam, terapkanKeluar, hitungSesiLain, bacaJadwalSekarang, alasanSesiDitolak, JadwalKeluarError } = await import('../lib/security/jadwal-keluar-data')
  const { createToken } = await import('../lib/security/auth')
  const { sql } = await import('../lib/data/db')
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
    timezone: '+07:00',
  })
  // Penyusun kueri aplikasi (`sql`) dipakai apa adanya — potongan SQL bersarang ikut tersusun — lalu
  // dijalankan di koneksi transaksi uji ini.
  const tx = async (strings: TemplateStringsArray, ...values: Parameters<typeof sql>[1][]) => {
    const f = sql(strings, ...values)
    const [r] = await c.execute(f.query, f.params as never)
    return Array.isArray(r) ? r as unknown[] : [r]
  }
  const F = '%Y-%m-%d %H:%i:%s'
  const asliJadwal = ((await c.query('SELECT value FROM app_config WHERE `key` = ?', [KUNCI_JADWAL_KELUAR]))[0] as { value: string }[])[0]?.value ?? null
  try {
    await c.beginTransaction()
    await c.query('DELETE FROM app_config WHERE `key` = ?', [KUNCI_JADWAL_KELUAR])
    const [rSa] = await c.query("INSERT INTO users (username, email, password_hash, role, status) VALUES ('uji_pml_sa', 'uji_pml_sa@uji.test', 'x', 'SUPER_ADMIN', 'AKTIF')")
    const [rSt] = await c.query("INSERT INTO users (username, email, password_hash, role, status) VALUES ('uji_pml_staf', 'uji_pml_staf@uji.test', 'x', 'PROGRAM', 'AKTIF')")
    const idSa = (rSa as { insertId: number }).insertId, idSt = (rSt as { insertId: number }).insertId

    const j = await kirimDalam(tx, { pesan: 'uji', menit: 5, tahanLogin: true, tahanJam: 2, oleh: 'uji_pml_sa', sesiPengirim: 'UJI-PML-PENGIRIM' })
    ok('C1 kirim: batas = dikirim + 5 menit, login dibuka = batas + 2 jam (jam MySQL)',
      detikAntara(j.dikirim, j.batas) === 300 && detikAntara(j.batas, j.login_dibuka) === 7200, JSON.stringify(j))
    const { jadwal: tersimpan } = await bacaJadwalSekarang(tx)
    ok('C2 jadwal tersimpan di app_config persis seperti yang dipulangkan', JSON.stringify(tersimpan) === JSON.stringify(j))
    const dua = await coba(() => kirimDalam(tx, { pesan: 'lagi', menit: 1, tahanLogin: false, tahanJam: 2, oleh: 'x', sesiPengirim: '' }))
    ok('C3 kirim kedua selama hitung mundur ditolak', dua instanceof JadwalKeluarError)
    // Lama tahan yang tidak sah tidak dipersoalkan bila login memang tidak ditahan.
    const tanpaTahan = await coba(async () => { await batalkanDalam(tx); return kirimDalam(tx, { pesan: 'u', menit: 1, tahanLogin: false, tahanJam: 999, oleh: 'x', sesiPengirim: '' }) })
    ok('C4 tanpa tahan login: login_dibuka = batas', !(tanpaTahan instanceof Error) && tanpaTahan.login_dibuka === tanpaTahan.batas)
    await batalkanDalam(tx)
    const jamRagam = await coba(async () => {
      const satuSetengah = await kirimDalam(tx, { pesan: 'u', menit: 5, tahanLogin: true, tahanJam: 1.5, oleh: 'x', sesiPengirim: '' })
      await batalkanDalam(tx)
      const tujuhHari = await kirimDalam(tx, { pesan: 'u', menit: 5, tahanLogin: true, tahanJam: 168, oleh: 'x', sesiPengirim: '' })
      await batalkanDalam(tx)
      return [detikAntara(satuSetengah.batas, satuSetengah.login_dibuka), detikAntara(tujuhHari.batas, tujuhHari.login_dibuka)]
    })
    ok('C4a lama tahan pilihan: 1,5 jam & 7 hari sesudah batas (jam MySQL)', !(jamRagam instanceof Error) && jamRagam[0] === 5400 && jamRagam[1] === 604800, JSON.stringify(jamRagam))
    const kelamaan = await coba(() => kirimDalam(tx, { pesan: 'u', menit: 5, tahanLogin: true, tahanJam: 200, oleh: 'x', sesiPengirim: '' }))
    ok('C4b lama tahan di luar 7 hari ditolak oleh jalur tulis sendiri (bukan hanya Zod), jadwal tidak tertulis',
      kelamaan instanceof JadwalKeluarError && kelamaan.status === 400 && (await bacaJadwalSekarang(tx)).jadwal === null)
    ok('C5 batalkan mengosongkan jadwal; batalkan lagi ditolak', (await bacaJadwalSekarang(tx)).jadwal === null && (await coba(() => batalkanDalam(tx))) instanceof JadwalKeluarError)

    // Jadwal yang batasnya sudah lewat: dikirim 6 menit lalu, keluar 1 menit lalu.
    const [[w]] = await c.query(`SELECT DATE_FORMAT(NOW() - INTERVAL 6 MINUTE, '${F}') AS dikirim, DATE_FORMAT(NOW() - INTERVAL 1 MINUTE, '${F}') AS batas,
      DATE_FORMAT(NOW() + INTERVAL 119 MINUTE, '${F}') AS dibuka`) as unknown as [{ dikirim: string; batas: string; dibuka: string }[]]
    const lewat: JadwalKeluar = { pesan: 'u', dikirim: w.dikirim, batas: w.batas, oleh: 'uji_pml_sa', sesi_pengirim: 'UJI-PML-PENGIRIM', tahan_login: true, login_dibuka: w.dibuka }
    await c.query('UPDATE app_config SET value = ? WHERE `key` = ?', [JSON.stringify(lewat), KUNCI_JADWAL_KELUAR])
    const SESI: [string, number, string, string, boolean][] = [
      ['UJI-PML-STAF-LAMA',  idSt, 'PROGRAM',     'NOW() - INTERVAL 10 MINUTE', true],
      ['UJI-PML-STAF-BARU',  idSt, 'PROGRAM',     'NOW()',                      false],
      ['UJI-PML-STAF-TENGAH', idSt, 'PROGRAM',    'NOW() - INTERVAL 4 MINUTE',  true],
      ['UJI-PML-PENGIRIM',   idSa, 'SUPER_ADMIN', 'NOW() - INTERVAL 10 MINUTE', false],
      ['UJI-PML-SA-SESUDAH', idSa, 'SUPER_ADMIN', 'NOW() - INTERVAL 3 MINUTE',  false],
      ['UJI-PML-SA-LAMA',    idSa, 'SUPER_ADMIN', 'NOW() - INTERVAL 10 MINUTE', true],
    ]
    for (const [sid, uid, role, dibuat] of SESI) {
      await c.query(`INSERT INTO user_sessions (session_id, user_id, username, role, created_at, last_active) VALUES (?, ?, 'uji', ?, ${dibuat}, NOW())`, [sid, uid, role])
    }
    // Sebelum ditandai: penghitung panel Admin sudah tidak menghitung yang kena — dibandingkan dengan aturan
    // murni pada SEMUA sesi aktif di basis data ini (sesi pengembang sungguhan ikut dinilai, bukan hanya uji).
    const aktif = (await c.query(`SELECT s.session_id, u.role, DATE_FORMAT(s.created_at, '${F}') AS dibuat, DATE_FORMAT(NOW(), '${F}') AS sekarang
      FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.invalidated_at IS NULL AND s.session_id <> 'UJI-PML-PENGIRIM'
      AND s.last_active >= NOW() - INTERVAL 60 MINUTE`))[0] as { session_id: string; role: string; dibuat: string; sekarang: string }[]
    const kenaAktif = aktif.filter(b => sesiKenaKeluar(lewat, { id: b.session_id, dibuat: b.dibuat, role: b.role }, b.sekarang)).length
    const tanpaJadwal = await hitungSesiLain('UJI-PML-PENGIRIM', null, tx), denganJadwal = await hitungSesiLain('UJI-PML-PENGIRIM', lewat, tx)
    ok('C5a hitung sesi lain (panel Admin): yang kena keluar paksa tidak dihitung walau belum ditandai — cermin aturan murni',
      tanpaJadwal === aktif.length && tanpaJadwal - denganJadwal === kenaAktif && kenaAktif >= 3, JSON.stringify({ tanpaJadwal, denganJadwal, kenaAktif }))
    const n = await terapkanKeluar(tx, lewat)
    const baris = (await c.query(`SELECT s.session_id, u.role, DATE_FORMAT(s.created_at, '${F}') AS dibuat, s.invalidated_at IS NOT NULL AS mati,
      DATE_FORMAT(NOW(), '${F}') AS sekarang FROM user_sessions s JOIN users u ON u.id = s.user_id WHERE s.session_id LIKE 'UJI-PML-%'`))[0] as
      { session_id: string; role: string; dibuat: string; mati: number; sekarang: string }[]
    const mati = new Map(baris.map(b => [b.session_id, !!Number(b.mati)]))
    ok('C6 terapkan: yang kena persis staf lama, staf yang masuk sesudah pesan, SA yang masuk sebelum pesan',
      SESI.every(([sid, , , , kena]) => mati.get(sid) === kena) && n >= 3, JSON.stringify([...mati]))
    ok('C7 SQL massal & aturan murni sepakat untuk tiap sesi uji (jam MySQL)',
      baris.every(b => sesiKenaKeluar(lewat, { id: b.session_id, dibuat: b.dibuat, role: b.role }, b.sekarang) === !!Number(b.mati)))
    ok('C8 terapkan berulang aman: tidak ada yang ditulis lagi', (await terapkanKeluar(tx, lewat)) === 0)

    // Alasan 401 untuk halaman login — dari token sungguhan.
    const token = (sid: string, uid: number, role: string) => createToken({ userId: uid, username: 'uji', role: role as never, email: '' }, sid)
    await c.query("INSERT INTO user_sessions (session_id, user_id, username, role, created_at, last_active, invalidated_at) VALUES ('UJI-PML-KELUAR-SENDIRI', ?, 'uji', 'PROGRAM', NOW() - INTERVAL 10 MINUTE, NOW(), NOW() - INTERVAL 2 MINUTE)", [idSt])
    ok('C8a alasan 401: sesi yang dikeluarkan pemeliharaan → PEMELIHARAAN',
      (await alasanSesiDitolak(await token('UJI-PML-STAF-LAMA', idSt, 'PROGRAM'), tx)) === 'PEMELIHARAAN')
    ok('C8b alasan 401: sesi yang keluar sendiri SEBELUM batas, sesi yang tidak kena, token kosong/palsu → SESI_BERAKHIR',
      (await alasanSesiDitolak(await token('UJI-PML-KELUAR-SENDIRI', idSt, 'PROGRAM'), tx)) === 'SESI_BERAKHIR'
      && (await alasanSesiDitolak(await token('UJI-PML-STAF-BARU', idSt, 'PROGRAM'), tx)) === 'SESI_BERAKHIR'
      && (await alasanSesiDitolak(undefined, tx)) === 'SESI_BERAKHIR' && (await alasanSesiDitolak('bukan.jwt.sah', tx)) === 'SESI_BERAKHIR')
    const belum = { ...lewat, batas: '2999-01-01 00:00:00', login_dibuka: '2999-01-01 02:00:00' }
    await c.query("UPDATE user_sessions SET invalidated_at = NULL WHERE session_id = 'UJI-PML-STAF-LAMA'")
    ok('C9 batas belum lewat: terapkan tidak mematikan apa pun (dijaga di SQL juga)', (await terapkanKeluar(tx, belum)) === 0)

    ok('C10 login ditahan sesudah batas', loginDitahan((await bacaJadwalSekarang(tx)).jadwal, (await bacaJadwalSekarang(tx)).sekarang))
    const dibuka = await bukaLoginDalam(tx)
    const sesudah = await bacaJadwalSekarang(tx)
    ok('C11 buka login: tidak ditahan lagi, batas tetap tersimpan, sesi lama yang belum dipakai ikut dimatikan',
      !loginDitahan(sesudah.jadwal, sesudah.sekarang) && sesudah.jadwal?.batas === lewat.batas && dibuka.login_dibuka === sesudah.sekarang
      && Number(((await c.query("SELECT invalidated_at IS NOT NULL AS m FROM user_sessions WHERE session_id = 'UJI-PML-STAF-LAMA'"))[0] as { m: number }[])[0].m) === 1)
    ok('C12 buka login lagi ditolak', (await coba(() => bukaLoginDalam(tx))) instanceof JadwalKeluarError)

    await c.query("UPDATE user_sessions SET invalidated_at = NULL WHERE session_id = 'UJI-PML-STAF-LAMA'")
    const baru = await kirimDalam(tx, { pesan: 'kedua', menit: 10, tahanLogin: false, tahanJam: 2, oleh: 'uji_pml_sa', sesiPengirim: 'UJI-PML-PENGIRIM' })
    ok('C13 kirim sesudah jadwal lama selesai: jadwal lama ditimpa, sesi yang dikeluarkannya dimatikan permanen dulu',
      baru.pesan === 'kedua' && Number(((await c.query("SELECT invalidated_at IS NOT NULL AS m FROM user_sessions WHERE session_id = 'UJI-PML-STAF-LAMA'"))[0] as { m: number }[])[0].m) === 1)
  } finally {
    await c.rollback()
    const sisa = ((await c.query("SELECT COUNT(*) AS n FROM user_sessions WHERE session_id LIKE 'UJI-PML-%'"))[0] as { n: number }[])[0].n
    const jadwalKini = ((await c.query('SELECT value FROM app_config WHERE `key` = ?', [KUNCI_JADWAL_KELUAR]))[0] as { value: string }[])[0]?.value ?? null
    ok('C14 sesudah ROLLBACK: nol sesi uji, jadwal asli utuh', Number(sisa) === 0 && jadwalKini === asliJadwal)
    await c.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal${gagal.length ? ': ' + gagal.join(', ') : ''}`)
process.exit(gagal.length ? 1 : 0)
