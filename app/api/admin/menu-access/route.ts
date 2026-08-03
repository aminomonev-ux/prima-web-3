// app/api/admin/menu-access/route.ts — pengaturan akses menu dari Admin Panel.
// Konsep: docs/CONCEPT-menu-access-control.md §4.5, §6
//
// GET  ?appKey=blud&userId=12  → izin satu orang: bawaan perannya, perkecualiannya, hasilnya
// GET  ?appKey=blud&role=KEUANGAN → aturan satu peran: bawaan kode, yang tersimpan, hasilnya
// POST { scope:'user'|'role', ... , izin:{menu_key: IZIN} } — ganti-semua; peta kosong =
//      kembalikan ke bawaan.
//
// Dua tingkat kewenangan, dan pembedaannya disengaja: mengubah perkecualian SATU orang
// boleh ADMIN, mengubah aturan sebuah PERAN hanya SUPER_ADMIN — yang kedua mengenai semua
// orang berperan itu sekaligus, termasuk yang tidak sedang dibicarakan.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { queryOne, sql } from '@/lib/data/db'
import { MENU_BLUD, izinMenu, type Izin, type MenuBlud } from '@/lib/blud/peran'
import { petaIzinBawaan } from '@/lib/blud/izin-server'
import { aplikasiMenu, infoMenu, keyMenuBlud } from '@/lib/registry/menu-apps'
import {
  APP_BLUD, IzinBerubahError, getIzinOrang, getIzinPeran, sidikJariIzin,
  simpanIzinOrang, simpanIzinPeran,
} from '@/lib/data/menu-access'
import { MenuAccessBodySchema } from '@/lib/data/menu-access-schemas'
import { checkRateLimit, getClientIp } from '@/lib/security/ratelimit'
import { RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS } from '@/lib/constants'
import { BLUD_HAPUS_VERSI_ROLES } from '@/lib/blud/schemas'
import { BLUD_BUKA_PERIODE_ROLES } from '@/lib/blud/realisasi-schemas'

export const dynamic = 'force-dynamic'

function unauthorized() { return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }) }
function forbidden(pesan = 'Akses ditolak.') { return NextResponse.json({ ok: false, message: pesan }, { status: 403 }) }

/** Daftar menu + sifat yang tidak bisa diubah admin — supaya UI tidak perlu menebaknya. */
function daftarMenu(appKey: string) {
  return aplikasiMenu(appKey)?.menus ?? []
}

/**
 * Aksi berat yang TIDAK menerima pengaturan dari sini (§4.5.4 nomor 3). Dikirim ke UI
 * bukan untuk dipakai memutuskan apa pun, melainkan untuk ditampilkan sebagai baris
 * terkunci: admin yang melihat siapa pemegangnya tahu kenapa toggle-nya tidak ada,
 * alih-alih mengira fiturnya lupa dibuat.
 */
function aksiTerkunci() {
  return [
    { label: 'Hapus versi DPA / Pergeseran', peran: [...BLUD_HAPUS_VERSI_ROLES] },
    { label: 'Buka kembali periode yang sudah ditutup', peran: [...BLUD_BUKA_PERIODE_ROLES] },
  ]
}

function keluarkan(peta: Map<string, Izin>) {
  return Object.fromEntries(peta)
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN') return forbidden()

  const p = req.nextUrl.searchParams
  const appKey = p.get('appKey') ?? APP_BLUD
  if (appKey !== APP_BLUD) return NextResponse.json({ ok: false, message: 'Modul tidak dikenal' }, { status: 400 })

  try {
    const userIdRaw = p.get('userId')
    if (userIdRaw) {
      const userId = Number(userIdRaw)
      if (!Number.isInteger(userId) || userId <= 0) {
        return NextResponse.json({ ok: false, message: 'userId tidak valid' }, { status: 400 })
      }
      const u = await queryOne<{ id: number; username: string; role: string }>(
        sql`SELECT id, username, role FROM users WHERE id = ${userId} LIMIT 1`
      )
      if (!u) return NextResponse.json({ ok: false, message: 'User tidak ditemukan' }, { status: 404 })

      const [peran, orang] = await Promise.all([getIzinPeran(appKey, u.role), getIzinOrang(userId, appKey)])
      const efektif = {} as Record<string, Izin>
      for (const menu of MENU_BLUD) {
        const k = keyMenuBlud(menu)
        efektif[k] = izinMenu(u.role, menu, orang.get(k) ?? peran.get(k) ?? null)
      }

      return NextResponse.json({
        ok: true,
        scope: 'user',
        versi: sidikJariIzin(orang),
        user: { id: u.id, username: u.username, role: u.role },
        menus: daftarMenu(appKey),
        // "Bawaan peran" = kode + apa pun yang sudah admin atur untuk peran itu.
        // Itulah yang dipulihkan tombol "Ikut bawaan peran", jadi angkanya harus sama.
        bawaanPeran: Object.fromEntries(MENU_BLUD.map((m) => [
          keyMenuBlud(m), izinMenu(u.role, m, peran.get(keyMenuBlud(m)) ?? null),
        ])),
        orang: keluarkan(orang),
        efektif,
        terkunci: aksiTerkunci(),
      })
    }

    const role = p.get('role')
    if (!role) return NextResponse.json({ ok: false, message: 'Sebutkan userId atau role' }, { status: 400 })

    const peran = await getIzinPeran(appKey, role)
    const efektif = {} as Record<string, Izin>
    for (const menu of MENU_BLUD) {
      const k = keyMenuBlud(menu)
      efektif[k] = izinMenu(role, menu, peran.get(k) ?? null)
    }
    const jumlah = await queryOne<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM users WHERE role = ${role} AND status = 'AKTIF'`
    )

    return NextResponse.json({
      ok: true,
      scope: 'role',
      versi: sidikJariIzin(peran),
      role,
      menus: daftarMenu(appKey),
      bawaanKode: petaIzinBawaanKey(role),
      tersimpan: keluarkan(peran),
      efektif,
      jumlahUser: Number(jumlah?.n ?? 0),
      terkunci: aksiTerkunci(),
    })
  } catch (err) {
    console.error('[API /admin/menu-access GET]', err)
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}

function petaIzinBawaanKey(role: string): Record<string, Izin> {
  const dariMenu = petaIzinBawaan(role)
  return Object.fromEntries(
    (Object.keys(dariMenu) as MenuBlud[]).map((m) => [keyMenuBlud(m), dariMenu[m]])
  )
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN') return forbidden()

  // Sepasang dengan rem di route admin lain (`users/route.ts`): pertahanan berlapis
  // kalau sesi admin disalahgunakan. Tiap penyimpanan itu DELETE + INSERT dalam
  // transaksi — bukan pekerjaan yang boleh dipanggil beribu kali per menit.
  const rl = await checkRateLimit(
    `admin-menu-access:${session.userId}:${getClientIp(req)}`,
    RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_SECONDS,
  )
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `Terlalu cepat menyimpan berturut-turut. Tunggu ${rl.resetIn} detik lalu coba lagi.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    )
  }

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, message: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = MenuAccessBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const b = parsed.data

  try {
    const peta = new Map<string, Izin>(Object.entries(b.izin))
    // Menu tanpa jalur tulis tidak pernah bisa disimpan sebagai EDIT. Ditolak di sini,
    // bukan diam-diam diturunkan: admin yang mencentangnya berhak tahu itu tak berarti.
    for (const [k, v] of peta) {
      const info = infoMenu(b.appKey, k)
      if (v === 'EDIT' && info?.bacaSaja) {
        return NextResponse.json({
          ok: false,
          message: `Di menu ${info.label} memang tidak ada yang bisa diubah, jadi izin ubah tidak ada gunanya di sana.`,
        }, { status: 400 })
      }
    }

    if (b.scope === 'role') {
      // Aturan peran mengenai semua orang berperan itu sekaligus — sengaja lebih sempit.
      if (session.role !== 'SUPER_ADMIN') {
        return forbidden('Yang boleh mengubah aturan peran hanya SUPER_ADMIN, karena perubahannya kena ke semua orang dengan peran ini.')
      }
      const sebelum = await getIzinPeran(b.appKey, b.role)
      await simpanIzinPeran(b.appKey, b.role, peta, session.userId, b.versi)
      await writeAuditLog({
        req,
        eventType: 'USER_UPDATE',
        userId: session.userId,
        username: session.username,
        detail: `Akses menu PERAN ${b.role} (${b.appKey}): `
          + `${ringkas(sebelum)} → ${ringkas(peta)}`,
      })
      return NextResponse.json({ ok: true })
    }

    const u = await queryOne<{ id: number; username: string; role: string }>(
      sql`SELECT id, username, role FROM users WHERE id = ${b.userId} LIMIT 1`
    )
    if (!u) return NextResponse.json({ ok: false, message: 'User tidak ditemukan' }, { status: 404 })
    // Alasan yang sama dengan baris SUPER_ADMIN di matriks peran: kalau akunnya bisa
    // dibatasi, cepat atau lambat ada yang mengunci dirinya sendiri di luar.
    if (u.role === 'SUPER_ADMIN') {
      return forbidden('Akses menu SUPER_ADMIN tidak bisa dibatasi. Kalau akun ini ikut dibatasi, tidak ada lagi yang bisa membetulkan pengaturan yang telanjur salah.')
    }

    const sebelum = await getIzinOrang(b.userId, b.appKey)
    await simpanIzinOrang(b.userId, b.appKey, peta, session.userId, b.versi)
    await writeAuditLog({
      req,
      eventType: 'USER_UPDATE',
      userId: session.userId,
      username: session.username,
      detail: `Akses menu ${u.username} (${u.role}, ${b.appKey}): `
        + `${ringkas(sebelum)} → ${ringkas(peta)}`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    // 409, bukan 500: bukan kerusakan, melainkan dua orang mengerjakan hal yang sama.
    // Layar memuat ulang lalu memberi tahu — perubahan orang pertama tidak hilang.
    if (err instanceof IzinBerubahError) {
      return NextResponse.json({ ok: false, code: 'BERUBAH', message: err.message }, { status: 409 })
    }
    console.error('[API /admin/menu-access POST]', err)
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}

/** Jejak audit dibaca manusia, bukan mesin — bentuk pendek yang bisa dibandingkan sekilas. */
function ringkas(peta: Map<string, Izin>): string {
  if (peta.size === 0) return '(ikut bawaan)'
  return [...peta].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(', ')
}
