// app/api/admin/permintaan-akses/route.ts — antrean permintaan akses (P4, Tahap 11).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P4.
//
// GET   → yang sedang menunggu (terlama dulu) + jumlahnya untuk lencana rel
// PATCH → TOLAK satu permintaan, beserta sebabnya
//
// Perhatikan yang TIDAK ada di sini: tidak ada "setujui". Menyetujui berarti memberi
// akses, dan memberi akses cuma punya satu jalur — `PUT /api/admin/pusat-akses`
// (aturan 11.1). Tombol SETUJUI di layar MENGISI FORM orang itu lalu berhenti; yang
// menulis tetap tombol Simpan yang sudah ada, dengan seluruh pagar yang sudah berdiri
// di sana: kunci per-modul, kuota peran, sidik jari menu, alasan P9, tenggat P2.
//
// Endpoint tulis kedua = set aturan kedua, dan itu sudah tiga kali melahirkan lubang
// nyata di BLUD (L78/L80/L82). Yang ditulis route ini cuma nasib sebuah PERTANYAAN,
// bukan wewenang siapa pun.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { addNotif } from '@/lib/services/notifications'
import { TolakPermintaanSchema } from '@/lib/data/admin-schemas'
import { labelModul } from '@/lib/admin/permintaan-baris'
import { antreanMenunggu, hitungMenunggu, tolakPermintaan } from '@/lib/admin/permintaan-akses'

export const dynamic = 'force-dynamic'

function tolak(pesan: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message: pesan, ...extra }, { status })
}

/** SUPER_ADMIN saja — lantai yang sama dengan Pusat Akses sesudah T-16. */
async function jagaSA() {
  const session = await getSession()
  if (!session) return { ok: false as const, res: tolak('Unauthorized', 401) }
  if (session.role !== 'SUPER_ADMIN') return { ok: false as const, res: tolak('Akses ditolak.', 403) }
  return { ok: true as const, session }
}

export async function GET() {
  const g = await jagaSA()
  if (!g.ok) return g.res
  try {
    // Jumlahnya dipulangkan bersama barisnya, bukan lewat permintaan kedua: lencana di
    // rel Admin Panel harus menyala tanpa tabnya pernah dibuka, dan dua permintaan
    // untuk satu fakta bisa memulangkan dua angka kalau ada yang memutuskan di selanya.
    const [data, menunggu] = await Promise.all([antreanMenunggu(), hitungMenunggu()])
    return NextResponse.json({ ok: true, data, menunggu })
  } catch (e) {
    console.error('[PermintaanAkses admin GET Error]', e)
    return tolak('Terjadi kesalahan server.', 500)
  }
}

export async function PATCH(req: NextRequest) {
  const g = await jagaSA()
  if (!g.ok) return g.res
  const { session } = g

  try {
    const parsed = TolakPermintaanSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return tolak(parsed.error.issues[0]?.message ?? 'Data tidak valid.', 400)
    const { id, catatan } = parsed.data

    const hasil = await tolakPermintaan(id, session.userId, catatan)
    if (hasil.hasil === 'tidak-menunggu') {
      return tolak('Permintaan itu sudah tidak menunggu — mungkin baru saja diputus orang lain.', 409, { code: 'SUDAH_DIPUTUS' })
    }
    const b = hasil.baris

    await writeAuditLog({
      req, eventType: 'ACCESS_REQUEST_REJECTED',
      userId: session.userId, username: session.username, targetUserId: b.userId,
      detail: `Tolak permintaan ${labelModul(b.appKey)} dari ${b.username} (id=${b.userId})`
        + ` · minta: ${b.alasan} · sebab tolak: ${catatan}`,
    })

    // SEBABNYA ikut, dan itu bagian yang paling menentukan di seluruh alur ini.
    // Penolakan tanpa sebab mengirim orangnya kembali bertanya lewat WhatsApp —
    // antrean yang persis sedang dipindahkan ke dalam aplikasi.
    await addNotif(
      b.username, b.role, 'AKSES_DITOLAK',
      `Permintaan akses ${labelModul(b.appKey)} belum bisa dipenuhi. Sebabnya: ${catatan}`,
    )

    return NextResponse.json({ ok: true, message: `Permintaan ${b.username} ditolak; sebabnya dikirim ke yang bersangkutan.` })
  } catch (e) {
    console.error('[PermintaanAkses admin PATCH Error]', e)
    return tolak('Terjadi kesalahan server.', 500)
  }
}
