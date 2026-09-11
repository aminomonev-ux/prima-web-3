// POST /api/cron/akses-kedaluwarsa — P2 Akses Berjangka (Tahap 10).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P2.
//
// Dua pekerjaan, satu jadwal:
//   (a) mencabut akses yang tenggatnya SUDAH LEWAT;
//   (b) mengingatkan yang tinggal ≤3 hari, ke pemegang dan ke SUPER_ADMIN.
//
// Frekuensi: harian (MySQL EVENT / crontab — BUKAN `vercel.json`; aplikasi ini berjalan
// di server kantor dengan PM2 + Nginx).
// Auth: header `Authorization: Bearer ${CRON_SECRET}`, sama dengan cron lain di sini.
//
// TAHAN TERLEWAT, dan itu syarat bukan kemewahan: server PRIMA adalah laptop kantor yang
// dimatikan tiap malam, jadi jadwal harian BISA tidak jalan sepenuhnya. Kedua kuerinya
// karena itu bertanya "yang sudah lewat" dan "yang belum pernah diingatkan" — bukan
// "yang jatuh tempo hari ini". Menjalankannya dua kali sehari tidak berakibat apa-apa;
// tidak menjalankannya tiga hari hanya membuat pencabutannya terlambat tiga hari, bukan
// hilang.
//
// SENGAJA tidak memeriksa sakelar maintenance: sakelar menutup pintu PEMAKAI, sedangkan
// mencabut akses yang sudah kedaluwarsa tetap diinginkan — sama dengan alasan
// `blud-cadangan-json`. Berkas ini juga di luar `app/api/blud` sehingga tidak dipindai
// gate G.
import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/security/auditlog'
import { verifyCronSecret } from '@/lib/security/cron-auth'
import { tanggalServer } from '@/lib/admin/akses-berjangka'
import { cabutYangLewat, ingatkanYangHampirHabis } from '@/lib/admin/cabut-kedaluwarsa'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = verifyCronSecret(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

  const mulai = Date.now()
  try {
    const hariIni = await tanggalServer()
    const hasil = await cabutYangLewat()
    hasil.diingatkan = await ingatkanYangHampirHabis(hariIni)

    // Satu baris audit per akses yang dicabut, dengan SASARANNYA (P8 lapis 1) — bukan
    // satu ringkasan. Yang dicari orang di jejak audit adalah "kenapa akses Sari
    // hilang", dan pertanyaan itu dijawab lewat penyaring `target_user_id`.
    for (const d of hasil.dicabut) {
      await writeAuditLog({
        req, eventType: 'ACCESS_REVOKE', username: 'cron', targetUserId: d.userId,
        detail: `Akses berjangka ${d.appKey} milik ${d.username} dicabut otomatis (berakhir ${d.berakhir})`,
      })
    }
    // Ringkasannya tetap ditulis walau NOL — persis alasan yang sama dengan cadangan
    // Drive: tanda hidup sebuah cron yang cuma muncul saat ia bekerja tidak bisa
    // membedakan "tidak ada yang perlu dicabut" dari "cron-nya sudah dua bulan mati".
    await writeAuditLog({
      req, eventType: 'CONFIG_UPDATE', username: 'cron',
      detail: JSON.stringify({
        cron: 'akses-kedaluwarsa', hari_ini: hariIni,
        dicabut: hasil.dicabut.length, diingatkan: hasil.diingatkan,
        permintaan_terjawab: hasil.permintaanTerjawab,
        galat: hasil.galat, durasi_ms: Date.now() - mulai,
      }),
    })

    return NextResponse.json({
      ok: true, hari_ini: hariIni,
      dicabut: hasil.dicabut.length, diingatkan: hasil.diingatkan,
      permintaan_terjawab: hasil.permintaanTerjawab, galat: hasil.galat,
    })
  } catch (error) {
    console.error('[Cron akses-kedaluwarsa]', error)
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}
