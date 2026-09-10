// app/api/admin/tinjauan/route.ts — Tinjauan Akses Berkala (P3).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P3 (Tahap 8).
//
// GET  → satu tabel orang × modul, urut yang paling lama tidak ditinjau lebih dulu
// POST → tandai satu orang sudah ditinjau
//
// TIDAK ADA jalur pencabutan akses di sini, dan itu keputusan. Mencabut akses adalah
// perubahan wewenang: ia butuh alasan (P9), transaksi yang sama dengan pembersihan
// perkecualian menunya (L69), dan pemeriksaan bentrok dua admin — semuanya sudah ada di
// `PUT /api/admin/pusat-akses`. Endpoint kedua yang mencabut akses berarti aturan
// P9/L69 punya dua salinan, dan salinan kedua yang akan ketinggalan.
//
// SUPER_ADMIN saja — lantai yang sama dengan Admin Panel sesudah T-16.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { BULAN_TINJAUAN, daftarTinjauan, tandaiDitinjau } from '@/lib/admin/tinjauan'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({ user_id: z.number().int().positive() })

async function jagaSA() {
  const session = await getSession()
  if (!session) return { ok: false as const, res: NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }) }
  if (session.role !== 'SUPER_ADMIN') return { ok: false as const, res: NextResponse.json({ ok: false, message: 'Akses ditolak.' }, { status: 403 }) }
  return { ok: true as const, session }
}

export async function GET() {
  const g = await jagaSA()
  if (!g.ok) return g.res
  try {
    // `bulan` ikut dipulangkan, bukan diketik di layar: ambang "kedaluwarsa" dipakai
    // SQL untuk menyaring DAN oleh layar untuk menjelaskan penyaringnya. Dua angka di
    // dua tempat akan berbeda pada hari salah satunya disunting.
    return NextResponse.json({ ok: true, data: await daftarTinjauan(), bulan: BULAN_TINJAUAN })
  } catch (error) {
    console.error('[Tinjauan GET Error]', error)
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await jagaSA()
  if (!g.ok) return g.res
  const { session } = g
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ ok: false, message: 'user_id tidak valid.' }, { status: 400 })

    const ada = await tandaiDitinjau(parsed.data.user_id, session.userId)
    if (!ada) return NextResponse.json({ ok: false, message: 'User tidak ditemukan.' }, { status: 404 })

    // Tinjauan TIDAK diminta alasannya (P9 §12 aturan 11.4): ia bukan perubahan
    // wewenang, dan meminta alasan pada aksi yang diulang 40 kali dalam satu duduk
    // adalah cara tercepat membuat kolom alasan berisi "-".
    //
    // `USER_UPDATE`, bukan jenis baru: yang dicari orang di jejak audit adalah PERUBAHAN
    // wewenang, dan menambah jenis untuk peristiwa yang tidak mengubah apa pun membuat
    // penyaring jenis lebih ramai tanpa menjawab lebih banyak.
    await writeAuditLog({
      req, eventType: 'USER_UPDATE', userId: session.userId, username: session.username,
      targetUserId: parsed.data.user_id,
      detail: `Tinjauan akses: user id=${parsed.data.user_id} ditandai sudah ditinjau`,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Tinjauan POST Error]', error)
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}
