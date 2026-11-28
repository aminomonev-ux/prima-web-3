// POST /api/cron/bba-drive — salinan otomatis laporan Buku Besar Aset ke Google Drive (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B.3).
// Jadwal: tiap 5 menit (crontab / MySQL EVENT kantor — BUKAN vercel.json). Auth: `Authorization: Bearer ${CRON_SECRET}`.
// Berkas dikirim hanya bila isinya berubah DAN sudah diam 2 menit, jadi memanggilnya lebih sering tidak berakibat apa-apa;
// laptop server yang mati semalam cukup dikejar oleh panggilan pertama sesudah menyala.
// SENGAJA tidak memeriksa sakelar maintenance: sakelar menutup pintu PEMAKAI; menyalin laporan tetap diinginkan
// (alasan yang sama dengan `blud-cadangan-json`).
import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/security/auditlog'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { kirimLaporanKeDrive } from '@/lib/data/bba-laporan'
import { segarkanMenunggu } from '@/lib/data/bba-drive-balik'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const auth = verifyCronSecret(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })
  try {
    const h = await kirimLaporanKeDrive(false)
    // 'sibuk' = tombol "Kirim sekarang" sedang jalan; putaran berikutnya mengejar.
    // Dicatat hanya bila ada yang dikirim/gagal — 288 panggilan sehari yang tidak mengirim apa-apa bukan jejak yang berguna.
    if (h.status === 'selesai' && (h.dikirim.length || h.gagal.length)) {
      await writeAuditLog({ req, eventType: 'BBA_DRIVE_KIRIM', username: 'cron',
        detail: `BBA laporan ke Drive (cron): ${h.dikirim.length} terkirim${h.gagal.length ? `, ${h.gagal.length} gagal — ${h.gagal.join(' · ')}` : ''}`.slice(0, 1000) })
    }
    // Berkas yang ditahan: ringkasan per baris untuk layar + lepas sendiri bila semua sudah diputuskan di web
    // (CONCEPT-bba-drive-dua-arah U2). Kiriman hasil gabungan menyusul di putaran berikutnya (kirim_segera).
    const menunggu = h.status === 'selesai' && h.ditahan.length ? await segarkanMenunggu() : []
    for (const m of menunggu.filter(x => x.dilepas)) {
      await writeAuditLog({ req, eventType: 'BBA_DRIVE_BALIK', username: 'cron',
        detail: `BBA perubahan Drive DILEPAS OTOMATIS — ${m.kunci}: semua sel yang diubah di Drive sudah dipakai atau ditolak di web; salinan otomatis berlanjut` })
    }
    return NextResponse.json({ ok: true, ...h, menunggu })
  } catch (e) {
    console.error('[cron bba-drive]', e)
    return NextResponse.json({ ok: false, message: 'Gagal mengirim laporan BBA ke Drive' }, { status: 500 })
  }
}
