// app/api/perjanjian-kinerja/program/import-renaksi/route.ts
// Import hierarki Program → Kegiatan → Sub-Kegiatan dari aplikasi Rencana Aksi
// (tabel `rencana_aksi`, level program/kegiatan/sub-kegiatan) untuk init Master
// Program PK. Sebelumnya sumber = E-Anggaran (kinerja_master); diganti ke
// Rencana Aksi sebagai single-source hulu (mirror "Import Renaksi" Master Sasaran).
// Pattern: getSession + isPkEditRole + pkRateLimit + Zod (tahun) + audit log.
// Read-only — tidak modify pk_program (client populate form lalu user Simpan).
import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/data/db'
import { getSession } from '@/lib/security/auth'
import { writeAuditLog } from '@/lib/security/auditlog'
import { isPkEditRole, pkRateLimit, TahunSchema } from '@/lib/data/pk-schemas'
import { hasAppAccess } from '@/lib/security/guard'

export const dynamic = 'force-dynamic'

type RaSrc = {
  level:        'program' | 'kegiatan' | 'sub-kegiatan'
  program:      string
  kegiatan:     string | null
  sub_kegiatan: string | null
}

type ImportRow = {
  program:     string
  kegiatan:    string | null
  subkegiatan: string | null
  level:       'program' | 'kegiatan' | 'subkegiatan'
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  if (!(await hasAppAccess(session.userId, session.role, isPkEditRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 })

  const limited = await pkRateLimit(session.userId, 'import-program', 10)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const tahunParse = TahunSchema.safeParse(searchParams.get('tahun') ?? '')
  if (!tahunParse.success) {
    return NextResponse.json(
      { ok: false, message: 'Parameter tahun tidak valid (4 digit, 2020-2100)' },
      { status: 400 },
    )
  }
  const tahunStr = tahunParse.data
  const tahunNum = Number(tahunStr)

  // Source: rencana_aksi level program/kegiatan/sub-kegiatan — pakai nama struktural
  // (kolom program/kegiatan/sub_kegiatan), bukan outcome statement. Sasaran-level
  // (induk khas Renaksi) tidak dibawa karena Master Program hanya butuh hierarki
  // program → kegiatan → sub-kegiatan.
  const raRows = await sql`
    SELECT level, program, kegiatan, sub_kegiatan
    FROM rencana_aksi
    WHERE tahun = ${tahunNum}
      AND level IN ('program','kegiatan','sub-kegiatan')
      AND program IS NOT NULL
      AND TRIM(program) <> ''
    ORDER BY program, kegiatan, sub_kegiatan
  ` as RaSrc[]

  // Expand jadi row per level + dedup pakai Set key. Tiap baris memunculkan
  // ancestor-nya (program → +kegiatan → +sub-kegiatan) sekali saja, supaya
  // hierarki lengkap tanpa duplikat meski beberapa sub-kegiatan berbagi program.
  const seen = new Set<string>()
  const rows: ImportRow[] = []
  for (const r of raRows) {
    const p  = (r.program ?? '').trim()
    if (!p) continue
    const keyP = `P||${p}`
    if (!seen.has(keyP)) {
      seen.add(keyP)
      rows.push({ program: p, kegiatan: null, subkegiatan: null, level: 'program' })
    }
    const k = (r.kegiatan ?? '').trim()
    if (!k) continue
    const keyK = `K||${p}||${k}`
    if (!seen.has(keyK)) {
      seen.add(keyK)
      rows.push({ program: p, kegiatan: k, subkegiatan: null, level: 'kegiatan' })
    }
    const sk = (r.sub_kegiatan ?? '').trim()
    if (!sk) continue
    const keyS = `S||${p}||${k}||${sk}`
    if (!seen.has(keyS)) {
      seen.add(keyS)
      rows.push({ program: p, kegiatan: k, subkegiatan: sk, level: 'subkegiatan' })
    }
  }

  const stats = {
    program:     rows.filter(r => r.level === 'program').length,
    kegiatan:    rows.filter(r => r.level === 'kegiatan').length,
    subkegiatan: rows.filter(r => r.level === 'subkegiatan').length,
    source_ra:   raRows.length,
  }

  await writeAuditLog({
    req,
    eventType: 'PK_IMPORT_PROGRAM',
    userId:    session.userId,
    username:  session.username,
    detail:    `Import hierarki Rencana Aksi → PK Master Program tahun ${tahunStr}: ${stats.program} program, ${stats.kegiatan} kegiatan, ${stats.subkegiatan} sub-kegiatan (sumber: ${stats.source_ra} baris renaksi)`,
  })

  return NextResponse.json({ ok: true, tahun: tahunStr, rows, stats })
}
