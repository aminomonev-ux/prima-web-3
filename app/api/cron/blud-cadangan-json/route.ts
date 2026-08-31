// app/api/cron/blud-cadangan-json/route.ts
// Cadangan foto per-simpan BLUD → Google Drive, pemicu TERJADWAL.
// Auth: header `Authorization: Bearer <CRON_SECRET>`.
//
// Dipanggil penjadwal OS (Task Scheduler / crontab), bukan MySQL EVENT: EVENT
// hidup di dalam database dan tidak menjangkau internet.
//
// SENGAJA tidak memeriksa sakelar maintenance. Sakelar itu menutup pintu bagi
// PEMAKAI; mencadangkan justru tetap diinginkan selama pemeliharaan, dan tidak
// ada layar yang terlibat. Route ini juga di luar `app/api/blud`, jadi tidak
// masuk pemindaian `npm run check:killswitch`.
//
// Konsep: docs/CONCEPT-blud-cadangan-json.md §4 Tahap 2

import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/security/auditlog'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { cadangkanJsonBlud } from '@/lib/blud/cadangan-json'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = verifyCronSecret(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

  try {
    // Batasnya lebih longgar daripada tombol: tidak ada orang yang menunggu di
    // depan layar, dan tunggakan sesudah beberapa hari mati bisa menumpuk.
    const hasil = await cadangkanJsonBlud({ batas: 200 })

    // Dicatat SELALU, termasuk saat nol berkas naik. Baris audit yang cuma muncul
    // saat ada pekerjaan membuat "cron berhenti jalan" tidak bisa dibedakan dari
    // "tidak ada yang perlu diunggah" — dan itu persis kegagalan yang membuat
    // cadangan database berhenti dua bulan tanpa ada yang sadar.
    await writeAuditLog({
      req,
      eventType: 'BLUD_CADANGAN_JSON',
      userId:    undefined,
      username:  'cron',
      detail:    `Cadangan JSON BLUD terjadwal: ${hasil.diunggah} berkas naik`
        + `${hasil.gagal ? `, ${hasil.gagal} gagal (${hasil.pesan})` : ''}`
        + ` · tersisa ${hasil.belum} belum tercadang`,
    })

    return NextResponse.json({ ok: true, ...hasil })
  } catch (e) {
    console.error('[cron/blud-cadangan-json] gagal:', e)
    return NextResponse.json({ ok: false, message: 'Pencadangan gagal dijalankan.' }, { status: 500 })
  }
}
