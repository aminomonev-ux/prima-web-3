// app/api/blud/realisasi/permintaan/route.ts — permintaan geser / rekening baru.
// Konsep: docs/CONCEPT-blud-realisasi.md §4.1, §4.2, §7.2
//
// GET    ?tahun=&status=   daftar permintaan + jumlah yang menunggu
// POST                     bendahara mengajukan (TIDAK menyentuh pagu)
// PATCH                    tandai DITOLAK
//
// Yang sengaja tidak ada: endpoint "penuhi otomatis". Pagu hanya berubah lewat
// menu Pergeseran, oleh manusia — §4.1 keputusan eksplisit.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { addNotif } from '@/lib/services/notifications'
import { bludRateLimit } from '@/lib/blud/schemas'
import { listPermintaan, countMenunggu, createPermintaan, tolakPermintaan } from '@/lib/blud/permintaan-data'
import { PermintaanBodySchema, PatchPermintaanSchema } from '@/lib/blud/realisasi-schemas'
import { TahunSchema } from '@/lib/blud/schemas'
import { bolehInput, bolehLihat, forbidden, unauthorized } from '../_guard'

export const dynamic = 'force-dynamic'

const STATUS_VALID = new Set(['MENUNGGU', 'SELESAI', 'DITOLAK'])

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehLihat(session.userId, session.role))) return forbidden()

  const { searchParams } = new URL(req.url)
  const parsed = TahunSchema.safeParse(searchParams.get('tahun'))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Parameter `tahun` tidak valid (2000–2100)' }, { status: 400 })
  }
  const statusRaw = searchParams.get('status') ?? ''
  const status = STATUS_VALID.has(statusRaw) ? (statusRaw as 'MENUNGGU' | 'SELESAI' | 'DITOLAK') : undefined

  try {
    const [data, menunggu] = await Promise.all([
      listPermintaan(parsed.data, status),
      countMenunggu(parsed.data),
    ])
    return NextResponse.json({ ok: true, data, menunggu })
  } catch (err) {
    console.error('[API /blud/realisasi/permintaan GET]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehInput(session.userId, session.role))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'realisasi-permintaan', 20)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = PermintaanBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const p = parsed.data

  try {
    const hasil = await createPermintaan(
      {
        tahun_anggaran: p.tahun_anggaran,
        jenis: p.jenis,
        anggaran_key: p.anggaran_key ?? null,
        kode_rekening: p.kode_rekening ?? null,
        uraian: p.uraian,
        kekurangan: p.kekurangan,
        tx_id: p.tx_id ?? null,
      },
      session.userId,
      session.username,
    )

    const judul = p.jenis === 'PERGESERAN' ? 'Permintaan pergeseran' : 'Permintaan rekening baru'
    const rupiah = p.kekurangan > 0 ? ` — kurang Rp ${p.kekurangan.toLocaleString('id-ID')}` : ''
    const tautan = `/blud/pergeseran?tahun=${p.tahun_anggaran}${p.anggaran_key ? `&fokus=${encodeURIComponent(p.anggaran_key)}` : ''}`
    // __ADMIN__ = kotak masuk bersama ADMIN + SUPER_ADMIN (buildNotifRecipients).
    await addNotif(
      '__ADMIN__',
      'BLUD',
      'BLUD_PERMINTAAN',
      `<b>${judul}</b> dari ${session.username}: ${p.kode_rekening ?? '(rekening baru)'} ${p.uraian}${rupiah}. Buka menu Pergeseran ${p.tahun_anggaran}: ${tautan}`,
    )

    await writeAuditLog({
      req,
      eventType: 'BLUD_PERMINTAAN_CREATE',
      userId: session.userId,
      username: session.username,
      detail: `${p.jenis} ${p.tahun_anggaran} ${p.kode_rekening ?? '-'} kurang ${p.kekurangan}: ${p.uraian.slice(0, 120)}${hasil.baru ? '' : ' (permintaan lama diperbarui)'}`,
    })

    return NextResponse.json({ ok: true, id: hasil.id, baru: hasil.baru })
  } catch (err) {
    console.error('[API /blud/realisasi/permintaan POST]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()
  if (!(await bolehInput(session.userId, session.role))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'realisasi-permintaan', 20)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Body bukan JSON' }, { status: 400 }) }

  const parsed = PatchPermintaanSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }

  try {
    const p = await tolakPermintaan(parsed.data.id)
    if (!p) return NextResponse.json({ ok: false, error: 'Permintaan tidak ditemukan' }, { status: 404 })

    if (p.diminta_username) {
      await addNotif(
        p.diminta_username,
        'BLUD',
        'BLUD_PERMINTAAN_DITOLAK',
        `Permintaan Anda untuk <b>${p.kode_rekening ?? p.uraian}</b> ditolak oleh ${session.username}.`,
      )
    }

    await writeAuditLog({
      req,
      eventType: 'BLUD_PERMINTAAN_TOLAK',
      userId: session.userId,
      username: session.username,
      detail: `Tolak permintaan id=${p.id} (${p.jenis} ${p.kode_rekening ?? '-'}) dari ${p.diminta_username ?? '-'}`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[API /blud/realisasi/permintaan PATCH]', err)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
