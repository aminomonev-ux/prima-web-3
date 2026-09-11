// app/api/akses/permintaan/route.ts — pintu pemohon (P4, Tahap 11).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P4.
//
// GET  → permintaan saya + modul yang masih masuk akal saya minta
// POST → titipkan satu permintaan ke antrean Pusat Akses
//
// SATU-SATUNYA route di seluruh fitur ini yang boleh dipanggil pemakai biasa, dan ia
// tidak menyentuh wewenang siapa pun — ia menulis PERTANYAAN, bukan jawabannya. Yang
// memberi akses tetap satu jalur: `PUT /api/admin/pusat-akses` (aturan 11.1).
//
// Di luar `app/api/<modul>`, jadi tidak dipindai gate G — dan memang tidak boleh punya
// sakelar: modul yang sedang dimatikan justru saat yang paling wajar untuk ditanyakan
// aksesnya, dan menutup pintu bertanya cuma memindahkan pertanyaannya ke WhatsApp.
import { NextRequest, NextResponse } from 'next/server'
import { sql, queryOne } from '@/lib/data/db'
import { getSession } from '@/lib/security/auth'
import { checkRateLimit } from '@/lib/security/ratelimit'
import { writeAuditLog } from '@/lib/security/auditlog'
import { addNotif } from '@/lib/services/notifications'
import { ROLE_LABELS } from '@/lib/constants'
import { PermintaanAksesSchema } from '@/lib/data/admin-schemas'
import { bolehDimintaOleh, labelModul, modulYangBisaDiminta } from '@/lib/admin/permintaan-baris'
import { buatPermintaan, permintaanSaya } from '@/lib/admin/permintaan-akses'

export const dynamic = 'force-dynamic'

function tolak(pesan: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message: pesan, ...extra }, { status })
}

/**
 * Grant orang yang sedang bertanya — dibaca dari DB, BUKAN dari sesinya.
 *
 * Token JWT memuat peran, tidak memuat `app_access`, dan andaikan ia memuatnya pun
 * isinya berumur sesi: seseorang yang aksesnya baru saja dicabut masih memegang token
 * yang mengaku sebaliknya. Yang memutuskan boleh-tidaknya bertanya harus keadaan
 * sekarang.
 */
async function grantSekarang(userId: number): Promise<string[]> {
  const row = await queryOne<{ app_access: unknown }>(
    sql`SELECT app_access FROM users WHERE id = ${userId} LIMIT 1`,
  )
  return Array.isArray(row?.app_access) ? (row.app_access as string[]).filter((k) => typeof k === 'string') : []
}

export async function GET() {
  const session = await getSession()
  if (!session) return tolak('Unauthorized', 401)
  try {
    const grant = await grantSekarang(session.userId)
    return NextResponse.json({
      ok: true,
      data: await permintaanSaya(session.userId),
      // Daftarnya datang dari server, bukan disusun ulang di layar dari kartu yang
      // kebetulan terkunci: kartu /menu punya daftarnya sendiri (`APP_CARDS`) yang bisa
      // berbeda dari registry, dan modul yang `bolehDigrant: false` tidak boleh
      // ditawarkan sama sekali (T-9 — mencentangnya tidak pernah membuka apa pun).
      bisaDiminta: modulYangBisaDiminta(session.role, grant),
    })
  } catch (e) {
    console.error('[PermintaanAkses GET Error]', e)
    return tolak('Terjadi kesalahan server.', 500)
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return tolak('Unauthorized', 401)

  try {
    // Gesekan yang ikut dari alur promosi cuma ini — bukan kata sandi ulang, bukan
    // cooldown, bukan probation (aturan 11.4). Yang dijaga bukan wewenangnya (tidak ada
    // yang diberikan di sini) melainkan antreannya: seratus permintaan dalam semenit
    // membuat layar Pusat Akses tidak terbaca, dan itu sama saja dengan mematikannya.
    const rl = await checkRateLimit(`akses-minta:${session.userId}`, 5, 300)
    if (!rl.allowed) {
      return tolak(`Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.`, 429, { code: 'TERLALU_SERING' })
    }

    const parsed = PermintaanAksesSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return tolak(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 400)
    const { app_key: appKey, alasan } = parsed.data

    // Pagar sungguhannya di sini, bukan di layar: tautan "Minta akses" cuma muncul pada
    // kartu terkunci, tapi menyembunyikan bukan menjaga (aturan 11.2). Aturannya sendiri
    // dipinjam dari berkas daun yang dipakai layar — satu aturan, dua pembaca.
    const grant = await grantSekarang(session.userId)
    if (!bolehDimintaOleh(appKey, session.role, grant)) {
      return tolak('Modul itu tidak bisa diminta dari sini — kemungkinan sudah terbuka untuk Anda.', 400, { code: 'TIDAK_BISA_DIMINTA' })
    }

    const hasil = await buatPermintaan(session.userId, appKey, alasan)
    if (hasil.hasil === 'sudah-menunggu') {
      return tolak(`Permintaan ${labelModul(appKey)} Anda sebelumnya masih menunggu.`, 409, { code: 'SUDAH_MENUNGGU' })
    }

    // `targetUserId` = pemohon sendiri. Ia PELAKU sekaligus SASARAN, dan mengisi
    // keduanya bukan pengulangan: garis waktu di Pusat Akses disaring lewat kolom
    // sasaran, jadi tanpa ia permintaan itu tidak pernah muncul di riwayat orang yang
    // memintanya — tepat di sebelah baris pemberian yang menjawabnya.
    await writeAuditLog({
      req, eventType: 'ACCESS_REQUEST',
      userId: session.userId, username: session.username, targetUserId: session.userId,
      detail: `Minta akses ${labelModul(appKey)} (${appKey}) · alasan: ${alasan}`,
    })

    // Antrean SUPER_ADMIN saja, bukan `buildNotifRecipients`: helper itu ikut menyiarkan
    // ke antrean ADMIN/KASUBAG/KABAG, padahal yang bisa memberi akses hanya SUPER_ADMIN
    // sejak T-16. Pemberitahuan yang sampai ke orang yang tidak bisa menindaklanjutinya
    // cuma menambah bunyi — dan bunyi yang tidak bisa ditindaklanjuti diabaikan.
    await addNotif(
      '__SUPER_ADMIN__', 'SUPER_ADMIN', 'AKSES_DIMINTA',
      `${session.username} (${ROLE_LABELS[session.role] ?? session.role}) meminta akses ${labelModul(appKey)}. Alasan: ${alasan}`,
    )

    return NextResponse.json({
      ok: true,
      message: `Permintaan ${labelModul(appKey)} terkirim. Super Admin akan meninjaunya.`,
      data: { id: hasil.id },
    })
  } catch (e) {
    console.error('[PermintaanAkses POST Error]', e)
    return tolak('Terjadi kesalahan server.', 500)
  }
}
