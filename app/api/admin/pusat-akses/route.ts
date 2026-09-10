// app/api/admin/pusat-akses/route.ts — satu orang, satu halaman, satu Simpan.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §4.5 & §16.4 (Tahap 5 / Fase C).
//
// GET                       → daftar orang (cari, saring status, termasuk yang diarsipkan)
// GET ?userId=12            → berkas orang: peran, pintu modul + sebabnya, izin menu, kuota
// GET ?userId=12&jejak=1    → hitungan baris yang kehilangan pemilik kalau dihapus (C5)
// GET ?paket=1              → daftar Paket Akses (P1)
// PUT                       → simpan peran + pintu + menu dalam SATU transaksi
// DELETE ?id=12&mode=arsip|permanen → T-12
//
// SUPER_ADMIN saja — lantai yang sama dengan Admin Panel sesudah T-16.
import { NextRequest, NextResponse } from 'next/server'
import { sql, sqlInt, safeInt, escapeLike, withTransaction } from '@/lib/data/db'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { ROLE_LABELS } from '@/lib/constants'
import { QuotaFullError } from '@/lib/security/promotion'
import { IzinBerubahError } from '@/lib/data/menu-access'
import {
  DaftarPaketSchema, PaketAksesSchema, PusatAksesSimpanSchema, PusatAksesHapusSchema,
} from '@/lib/data/admin-schemas'
import { z } from 'zod'
import {
  berkasOrang, hitungJejakOrang, simpanBerkasOrang, garisWaktuOrang,
  AlasanWajibError, PeranBerubahError, BULAN_GARIS_WAKTU,
} from '@/lib/admin/pusat-akses'

export const dynamic = 'force-dynamic'

const KUNCI_PAKET = 'akses_paket'

function tolak(pesan: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message: pesan, ...extra }, { status })
}

async function jagaSA() {
  const session = await getSession()
  if (!session) return { ok: false as const, res: tolak('Unauthorized', 401) }
  if (session.role !== 'SUPER_ADMIN') return { ok: false as const, res: tolak('Akses ditolak.', 403) }
  return { ok: true as const, session }
}

/**
 * Paket dibaca lewat Zod, dan baris yang tidak lolos jatuh jadi daftar KOSONG — bukan
 * melempar. `app_config.value` TEXT tanpa bentuk; satu suntingan tangan di MySQL tidak
 * boleh merobohkan layar yang mengatur wewenang (§12 P1).
 */
async function bacaPaket() {
  try {
    const rows = await sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_PAKET} LIMIT 1` as { value: string }[]
    if (!rows[0]?.value) return []
    const hasil = DaftarPaketSchema.safeParse(JSON.parse(rows[0].value))
    return hasil.success ? hasil.data : []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const g = await jagaSA()
  if (!g.ok) return g.res
  const p = req.nextUrl.searchParams

  try {
    if (p.get('paket')) {
      return NextResponse.json({ ok: true, data: await bacaPaket() })
    }

    const userIdRaw = p.get('userId')
    if (userIdRaw) {
      const userId = safeInt(userIdRaw, 0)
      if (!userId) return tolak('userId tidak valid', 400)
      if (p.get('jejak')) {
        return NextResponse.json({ ok: true, data: await hitungJejakOrang(userId) })
      }
      if (p.get('garisWaktu')) {
        // `bulan` ikut dipulangkan, bukan cuma barisnya: `audit_log` dipangkas cron
        // retensi 12 bulan, jadi garis waktunya PUNYA UJUNG — dan layar yang tidak
        // mengatakannya membiarkan orang menyimpulkan "tidak ada catatan" dari
        // "catatannya sudah dibuang" (§12 P8).
        return NextResponse.json({
          ok: true,
          data: await garisWaktuOrang(userId),
          bulan: BULAN_GARIS_WAKTU,
        })
      }
      const berkas = await berkasOrang(userId)
      if (!berkas) return tolak('User tidak ditemukan.', 404)
      return NextResponse.json({ ok: true, data: berkas })
    }

    // Akun ber-`deleted_at` disembunyikan kecuali diminta (§5.5). Bukan disaring di
    // klien: daftar yang memuat orang yang sudah diarsipkan lalu menyembunyikannya
    // tetap mengirim namanya ke peramban.
    const cari = p.get('cari') ?? ''
    const status = p.get('status') ?? ''
    const arsip = p.get('arsip') === '1'
    const esc = cari ? escapeLike(cari) : ''

    const rows = await sql`
      SELECT u.id, u.username, u.nama_lengkap, u.email, u.role, u.status, u.last_login,
             u.deleted_at,
             (SELECT COUNT(*) FROM user_sessions s
               WHERE s.user_id = u.id AND s.invalidated_at IS NULL) AS sesi_aktif
      FROM users u
      WHERE 1=1
        ${arsip ? sql`` : sql`AND u.deleted_at IS NULL`}
        ${status ? sql`AND u.status = ${status}` : sql``}
        ${esc ? sql`AND (u.username LIKE ${'%' + esc + '%'} OR u.nama_lengkap LIKE ${'%' + esc + '%'} OR u.email LIKE ${'%' + esc + '%'})` : sql``}
      ORDER BY
        CASE u.status WHEN 'MENUNGGU' THEN 0 WHEN 'AKTIF' THEN 1 ELSE 2 END,
        u.username ASC
      LIMIT ${sqlInt(300)}
    `
    return NextResponse.json({ ok: true, data: rows })
  } catch (error) {
    console.error('[PusatAkses GET Error]', error)
    return tolak('Terjadi kesalahan server.', 500)
  }
}

/**
 * P1 — menyusun paket. Bentuk gesturnya sengaja "jadikan paket dari orang ini yang
 * sudah benar", bukan formulir kosong: yang tahu isi paket "Bendahara Pengeluaran"
 * adalah orang yang baru saja menyiapkan bendahara pengeluaran, dan ia sedang melihat
 * jawabannya di layar. Formulir kosong meminta orang mengetik ulang sesuatu yang sudah
 * ada di depannya, dan itu jalan tercepat menuju paket yang isinya meleset.
 *
 * Paket TIDAK memuat peran (§12 P1): memberi peran punya kuota, mencabut sesi, dan
 * membatalkan probation. Itu aksi tersendiri.
 */
const PaketAksiSchema = z.discriminatedUnion('aksi', [
  z.object({ aksi: z.literal('simpan-paket'), paket: PaketAksesSchema }),
  z.object({ aksi: z.literal('hapus-paket'), nama: z.string().min(1).max(60) }),
])

export async function POST(req: NextRequest) {
  const g = await jagaSA()
  if (!g.ok) return g.res
  const { session } = g
  try {
    const parsed = PaketAksiSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return tolak(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 400)
    const b = parsed.data

    const lama = await bacaPaket()
    const baru = b.aksi === 'simpan-paket'
      ? [...lama.filter((x) => x.nama !== b.paket.nama), b.paket].sort((a, z) => a.nama.localeCompare(z.nama))
      : lama.filter((x) => x.nama !== b.nama)

    // Divalidasi lagi SESUDAH disusun, bukan cuma potongannya. `value` bertipe TEXT,
    // jadi skema inilah satu-satunya yang menjaga bentuknya — dan batas 20 paket hanya
    // berlaku kalau yang diperiksa daftar utuhnya.
    const sah = DaftarPaketSchema.safeParse(baru)
    if (!sah.success) return tolak(sah.error.issues[0]?.message ?? 'Daftar paket tidak valid.', 400)

    const isi = JSON.stringify(sah.data)
    await sql`
      INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_PAKET}, ${isi})
      ON DUPLICATE KEY UPDATE value = ${isi}
    `
    await writeAuditLog({
      req, eventType: 'CONFIG_UPDATE', userId: session.userId, username: session.username,
      detail: b.aksi === 'simpan-paket'
        ? `Paket akses "${b.paket.nama}" disimpan (${b.paket.app_access.length} modul)`
        : `Paket akses "${b.nama}" dihapus`,
    })
    return NextResponse.json({ ok: true, data: sah.data })
  } catch (error) {
    console.error('[PusatAkses POST Error]', error)
    return tolak('Terjadi kesalahan server.', 500)
  }
}

export async function PUT(req: NextRequest) {
  const g = await jagaSA()
  if (!g.ok) return g.res
  const { session } = g

  try {
    const parsed = PusatAksesSimpanSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return tolak(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 400)
    const b = parsed.data

    // SUPER_ADMIN tidak diatur dari sini — kalau barisnya bisa disunting, cepat atau
    // lambat ada yang mengunci dirinya sendiri di luar (§4.5.4 nomor 5).
    if (b.role_awal === 'SUPER_ADMIN') return tolak('Akses SUPER_ADMIN tidak dapat dibatasi.', 403)
    if (b.user_id === session.userId) return tolak('Wewenang sendiri tidak diatur dari layar ini.', 403)

    const hasil = await simpanBerkasOrang({
      userId: b.user_id,
      role: b.role,
      roleAwal: b.role_awal,
      appAccess: b.app_access,
      menu: b.menu,
      versi: b.versi,
      alasan: b.alasan,
      berjangka: b.berjangka,
      olehUserId: session.userId,
    })

    // C6 — tiga jenis peristiwa, bukan satu USER_UPDATE untuk semuanya. Ditulis
    // terpisah supaya penyaring jenis di Jejak Audit benar-benar menyaring; satu baris
    // gabungan akan memaksa auditor kembali membaca kolom `detail`.
    const asal = b.asal_paket ? ` [paket ${b.asal_paket.nama}, ${b.asal_paket.diubah} hal diubah]` : ''
    // P9 — alasannya ikut ke tiap baris yang mencatat perubahan wewenang, bukan cuma ke
    // satu baris ringkasan: yang membaca jejak audit menyaring per jenis peristiwa, dan
    // alasan yang cuma menempel di satu jenis hilang begitu penyaringnya digeser.
    const sebab = b.alasan ? ` · alasan: ${b.alasan}` : ''
    // P8 — `targetUserId` menjawab "kepada siapa". Tanpa ia, satu-satunya cara mencari
    // riwayat seseorang adalah `detail LIKE '%id=12%'`, yang ikut cocok dengan id=120.
    const jejak = { req, userId: session.userId, username: session.username, targetUserId: b.user_id } as const
    if (hasil.peranBerubah) {
      await writeAuditLog({
        ...jejak, eventType: 'ROLE_CHANGE',
        detail: `user id=${b.user_id}: ${hasil.peranBerubah.dari} → ${hasil.peranBerubah.ke}`
          + (hasil.izinDihapus ? ` [${hasil.izinDihapus} perkecualian menu dihapus]` : '') + sebab,
      })
    }
    if (hasil.grantDitambah.length) {
      await writeAuditLog({
        ...jejak, eventType: 'ACCESS_GRANT',
        detail: `user id=${b.user_id}: +${hasil.grantDitambah.join(', ')}${asal}${sebab}`,
      })
    }
    if (hasil.grantDicabut.length) {
      await writeAuditLog({
        ...jejak, eventType: 'ACCESS_REVOKE',
        detail: `user id=${b.user_id}: -${hasil.grantDicabut.join(', ')}${sebab}`,
      })
    }
    // P2 — tenggat itu BATAS wewenang, jadi menggesernya ikut dicatat. Baris sendiri,
    // bukan disisipkan ke ACCESS_GRANT: memberi akses tanpa batas waktu dan memberi
    // akses sampai 30 September adalah dua keputusan berbeda, dan yang membacanya
    // belakangan perlu bisa membedakannya tanpa menebak dari kolom detail.
    if (hasil.jangkaDitulis || hasil.jangkaDihapus) {
      await writeAuditLog({
        ...jejak, eventType: 'USER_UPDATE',
        detail: `Akses berjangka user id=${b.user_id}: ${hasil.jangkaDitulis} disetel, ${hasil.jangkaDihapus} dilepas${sebab}`,
      })
    }
    if (hasil.modulMenuDitulis.length) {
      await writeAuditLog({
        ...jejak, eventType: 'USER_UPDATE',
        detail: `Izin menu user id=${b.user_id} diperbarui: ${hasil.modulMenuDitulis.join(', ')}${asal}`,
      })
    }

    return NextResponse.json({ ok: true, data: hasil })
  } catch (e) {
    if (e instanceof AlasanWajibError) return tolak(e.message, 400, { code: 'ALASAN_WAJIB' })
    if (e instanceof PeranBerubahError) return tolak(e.message, 409, { code: 'PERAN_BERUBAH' })
    if (e instanceof IzinBerubahError) {
      return tolak('Pengaturan menu orang ini baru saja diubah orang lain. Muat ulang dulu.', 409, { code: 'BERUBAH' })
    }
    if (e instanceof QuotaFullError) {
      return tolak(`Kuota peran ${ROLE_LABELS[e.role] ?? e.role} sudah penuh (${e.count}/${e.quota}). Nonaktifkan akun lain di peran itu dulu.`, 409, { code: 'KUOTA_PENUH' })
    }
    console.error('[PusatAkses PUT Error]', e)
    return tolak('Terjadi kesalahan server.', 500)
  }
}

/**
 * T-12 — dua pilihan yang jujur menyebut bedanya.
 *
 * `arsip` (bawaan): status NONAKTIF + `deleted_at` + sesi dicabut. Jejak "siapa
 * menyimpan apa" tetap utuh, PII dianonimisasi cron retensi setelah 5 tahun.
 * `permanen`: DELETE seperti hari ini — untuk akun uji / salah ketik.
 *
 * `mode` WAJIB disebut. Bawaan diam-diam yang lebih aman terdengar baik, tapi ia
 * membuat klien lama yang mengira sedang menghapus justru mengarsipkan tanpa tahu,
 * dan sebaliknya. Yang menghapus harus mengatakan bahwa ia menghapus.
 */
export async function DELETE(req: NextRequest) {
  const g = await jagaSA()
  if (!g.ok) return g.res
  const { session } = g

  try {
    const p = req.nextUrl.searchParams
    const id = safeInt(p.get('id'), 0)
    const mode = p.get('mode')
    if (!id) return tolak('ID user diperlukan.', 400)
    if (mode !== 'arsip' && mode !== 'permanen') return tolak("Sebutkan mode: 'arsip' atau 'permanen'.", 400)

    const rows = await sql`SELECT role, username, deleted_at FROM users WHERE id = ${id} LIMIT 1` as
      { role: string; username: string; deleted_at: Date | null }[]
    const t = rows[0]
    if (!t) return tolak('User tidak ditemukan.', 404)
    if (t.role === 'SUPER_ADMIN') return tolak('Akun SUPER_ADMIN tidak dapat dihapus dari sini.', 403)
    if (id === session.userId) return tolak('Tidak dapat menghapus akun sendiri.', 403)

    if (mode === 'arsip') {
      // Mengarsipkan TIDAK ditanya alasannya (§12 P9): ia aksi rutin hari seseorang
      // berhenti atau pindah, dan pertanyaan yang muncul pada aksi harian melatih orang
      // mengetik "-" — lalu kebiasaan itu terbawa ke Hapus permanen, satu-satunya yang
      // benar-benar tidak bisa ditarik balik.
      if (t.deleted_at) return tolak('Akun ini sudah diarsipkan.', 409)
      // Satu transaksi: "sudah diarsipkan tapi sesinya masih hidup" adalah keadaan
      // setengah jalan yang justru mau dihindari (pola A3).
      await withTransaction(async ({ tx }) => {
        await tx`UPDATE users SET status = 'NONAKTIF', deleted_at = NOW(), updated_at = NOW() WHERE id = ${id}`
        await tx`UPDATE user_sessions SET invalidated_at = NOW() WHERE user_id = ${id} AND invalidated_at IS NULL`
      })
      await writeAuditLog({
        req, eventType: 'USER_ARCHIVE', userId: session.userId, username: session.username,
        targetUserId: id,
        detail: `Arsipkan ${t.username} (id=${id}) — sesi dicabut, jejak dipertahankan`,
      })
      return NextResponse.json({ ok: true, message: `Akun ${t.username} diarsipkan. Jejaknya tetap utuh; sesinya dihentikan.` })
    }

    // Hapus permanen WAJIB menyebut alasannya. Ini satu-satunya aksi di layar ini yang
    // tidak bisa ditarik balik, dan enam bulan kemudian "kenapa akun itu dibuang" cuma
    // bisa dijawab kalau jawabannya ditulis sekarang.
    const badan = PusatAksesHapusSchema.safeParse(await req.json().catch(() => null))
    if (!badan.success) {
      return tolak(badan.error.issues[0]?.message ?? 'Sebutkan alasannya.', 400, { code: 'ALASAN_WAJIB' })
    }

    // Angkanya dihitung SEBELUM menghapus dan ikut ke jejak audit: sesudah barisnya
    // hilang, tidak ada lagi cara mengetahuinya.
    const jejak = await hitungJejakOrang(id)
    await withTransaction(async ({ tx }) => {
      await tx`UPDATE user_sessions SET invalidated_at = NOW() WHERE user_id = ${id} AND invalidated_at IS NULL`
      await tx`DELETE FROM users WHERE id = ${id}`
    })
    await writeAuditLog({
      req, eventType: 'USER_DELETE', userId: session.userId, username: session.username,
      // `targetUserId` sengaja TETAP diisi walau barisnya baru saja dihapus: id yatim di
      // sini lebih berguna daripada NULL yang rapi — ia yang menyambungkan baris ini
      // dengan seluruh riwayat orang itu saat ada yang menelusurinya belakangan.
      targetUserId: id,
      detail: `Hapus permanen ${t.username} (id=${id}) — ${jejak.totalKehilangan} baris kehilangan pemilik, ${jejak.totalTerhapus} baris ikut terhapus · alasan: ${badan.data.alasan}`,
    })
    return NextResponse.json({
      ok: true,
      message: `Akun ${t.username} dihapus permanen. Slot kuota perannya dibebaskan.`,
      data: jejak,
    })
  } catch (error) {
    console.error('[PusatAkses DELETE Error]', error)
    return tolak('Terjadi kesalahan server.', 500)
  }
}
