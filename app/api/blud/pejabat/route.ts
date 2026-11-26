// app/api/blud/pejabat/route.ts — pejabat penanda tangan dokumen SPJ BLUD.
// Konsep: docs/konsep/blud/CONCEPT-blud-realisasi.md §3.1, keputusan #29.
//
// GET  ?tahun=[&sumber=pk]  daftar tersimpan · `sumber=pk` = saran dari master PK
// GET  ?untuk=cetak&tahun=  Direktur saja, untuk tanda tangan unduhan Cetak
// POST                      simpan (replace-all per tahun)
//
// Saran PK adalah SUMBER ISIAN, bukan sumber kebenaran: yang tersimpan salinan
// nama/NIP/pangkat. Tidak ada JOIN ke pk_pejabat di jalur cetak, supaya SPJ yang
// sudah ditandatangani tidak berubah saat master PK diperbarui tahun berikutnya.
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { bludRateLimit, TahunSchema } from '@/lib/blud/schemas'
import { listPejabat, simpanPejabat, sarankanDariPk, getDirekturCetak } from '@/lib/blud/pejabat-data'
import { SimpanPejabatBodySchema } from '@/lib/blud/realisasi-schemas'
import { bolehInput, bolehLihat, bolehLihatSalahSatu, forbidden, unauthorized, tolakEdit, realisasiMati } from '../realisasi/_guard'
import { bludMati } from '../_guard'

export const dynamic = 'force-dynamic'

/**
 * `?untuk=cetak` — Direktur saja, untuk tanda tangan unduhan Cetak/DPA/Pergeseran.
 * Pagarnya sakelar BLUD (bukan Realisasi) + salah satu menu yang mencetaknya: nama, NIP,
 * pangkat Direktur memang tercetak di semua dokumen resmi. Bendahara & PPK tetap di balik
 * menu Pengaturan. CONCEPT-blud-pejabat-penanda-tangan §3.1 (K1–K3).
 */
async function getDirekturUntukCetak(req: NextRequest, session: { userId: number; role: string }) {
  const mati = await bludMati(session.role)
  if (mati) return mati
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['cetak', 'dpa', 'pergeseran', 'pengaturan']))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'view-pejabat', 60)
  if (limited) return limited

  const parsed = TahunSchema.safeParse(new URL(req.url).searchParams.get('tahun'))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tahun anggaran tidak dikenali. Pilih tahun antara 2000 dan 2100.' }, { status: 400 })
  }
  try {
    return NextResponse.json({ ok: true, data: await getDirekturCetak(parsed.data) })
  } catch (err) {
    console.error('[API /blud/pejabat GET untuk=cetak]', err)
    return NextResponse.json({ ok: false, error: 'Ada gangguan di server. Coba lagi sebentar lagi.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  if (new URL(req.url).searchParams.get('untuk') === 'cetak') return getDirekturUntukCetak(req, session)

  const mati = await realisasiMati(session.role)
  if (mati) return mati
  if (!(await bolehLihat(session.userId, session.role, 'pengaturan'))) return forbidden()

  const limited = await bludRateLimit(session.userId, 'view-pejabat', 60)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const parsed = TahunSchema.safeParse(searchParams.get('tahun'))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tahun anggaran tidak dikenali. Pilih tahun antara 2000 dan 2100.' }, { status: 400 })
  }

  try {
    if (searchParams.get('sumber') === 'pk') {
      return NextResponse.json({ ok: true, data: await sarankanDariPk(parsed.data) })
    }
    return NextResponse.json({ ok: true, data: await listPejabat(parsed.data) })
  } catch (err) {
    console.error('[API /blud/pejabat GET]', err)
    return NextResponse.json({ ok: false, error: 'Ada gangguan di server. Coba lagi sebentar lagi.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const mati = await realisasiMati(session.role)
  if (mati) return mati
  if (!(await bolehInput(session.userId, session.role, 'pengaturan'))) return tolakEdit('pengaturan')

  const limited = await bludRateLimit(session.userId, 'blud-pejabat', 20)
  if (limited) return limited

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Data yang dikirim tidak terbaca. Muat ulang halaman, lalu coba lagi.' }, { status: 400 }) }

  const parsed = SimpanPejabatBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Data tidak valid' }, { status: 400 })
  }
  const { tahun_anggaran, pejabat } = parsed.data

  const rangkap = new Set<string>()
  for (const p of pejabat) {
    if (rangkap.has(p.jabatan)) {
      return NextResponse.json({ ok: false, error: `Peran ${p.jabatan} muncul dua kali` }, { status: 400 })
    }
    rangkap.add(p.jabatan)
  }

  try {
    const data = await simpanPejabat(
      tahun_anggaran,
      pejabat.map((p) => ({
        jabatan: p.jabatan,
        nama: p.nama,
        nip: p.nip ?? null,
        pangkat: p.pangkat ?? null,
        jabatan_teks: p.jabatan_teks ?? null,
        pk_pejabat_id: p.pk_pejabat_id ?? null,
      })),
      session.userId,
    )
    await writeAuditLog({
      req,
      eventType: 'BLUD_PEJABAT_SIMPAN',
      userId: session.userId,
      username: session.username,
      detail: `Pejabat SPJ ${tahun_anggaran}: ${pejabat.map((p) => `${p.jabatan}=${p.nama}`).join(', ') || '(dikosongkan)'}`,
    })
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.error('[API /blud/pejabat POST]', err)
    return NextResponse.json({ ok: false, error: 'Ada gangguan di server. Coba lagi sebentar lagi.' }, { status: 500 })
  }
}
