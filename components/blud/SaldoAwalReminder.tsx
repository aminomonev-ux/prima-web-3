'use client'
// components/blud/SaldoAwalReminder.tsx — pengingat "saldo awal tahun ini belum ditetapkan".
// Konsep: docs/CONCEPT-blud-realisasi.md §4.6
//
// Kenapa ada: saldo awal Januari ikut menentukan saldo SETIAP bulan di bawahnya
// (§4.6 — bulan 2–12 diturunkan, tidak disimpan). Kalau lupa diisi, seluruh
// tahun salah tanpa satu gejala pun di layar. Dan begitu ada satu bulan yang
// ditutup, angkanya beku — perbaikannya butuh prosedur buka-periode.
//
// Dua bentuk, sengaja berbeda beratnya:
//   Spanduk — menetap selama belum ditetapkan, tidak menghalangi apa pun
//   Modal   — sekali saat hendak menambah transaksi pertama, menuntut jawaban
//
// Jalan keluarnya BUKAN "abaikan", melainkan "Tetapkan 0": satu klik yang
// menuliskan keputusan itu beserta siapa & kapan. Dengan begitu yang saldo
// awalnya memang nol berhenti diingatkan selamanya, tanpa perlu tombol
// "jangan tampilkan lagi" yang gampang jadi refleks.
import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import PrimaButton from '@/components/ui/PrimaButton'

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export interface SaldoAwalReminderProps {
  tahun: number
  /** Bulan yang sedang dibuka — dipakai menjelaskan dampaknya, bukan tempat mengisi. */
  bulan: number
  bolehBuka: boolean
  bolehIsi: boolean
  onDitetapkan: () => void
}

/** Spanduk menetap. Tidak menghalangi; hanya menolak dilupakan. */
export function SaldoAwalSpanduk({
  tahun, bulan, bolehBuka, onBuka,
}: {
  tahun: number
  bulan: number
  bolehBuka: boolean
  onBuka: () => void
}) {
  return (
    <div className="bk-warn" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <AlertTriangle className="w-4 h-4 shrink-0" style={{ marginTop: 2 }} />
      <span style={{ flex: 1 }}>
        <b>Saldo awal tahun {tahun} belum pernah ditetapkan.</b>{' '}
        Saldo awal {NAMA_BULAN[bulan - 1]} yang tampil di bawah dihitung dari angka Januari —
        selama Januari belum diisi, angkanya dianggap nol.
      </span>
      {bolehBuka && (
        <PrimaButton variant="warning" size="sm" onClick={onBuka}>Periksa</PrimaButton>
      )}
    </div>
  )
}

export default function SaldoAwalReminder({
  tahun, bulan, bolehBuka, bolehIsi, onDitetapkan, onLanjut, onTutup,
}: SaldoAwalReminderProps & { onLanjut: () => void; onTutup: () => void }) {
  const router = useRouter()
  const [sibuk, setSibuk] = useState(false)

  const tetapkanNol = useCallback(async () => {
    setSibuk(true)
    try {
      const res = await fetch('/api/blud/realisasi/saldo-awal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahun_anggaran: tahun, saldo_awal_kas: 0, saldo_awal_bank: 0 }),
      })
      let json: { ok?: boolean; error?: string }
      try { json = await res.json() } catch { toast.error('Balasan server tidak terbaca.'); return }
      if (!res.ok || !json.ok) { toast.error(json.error ?? 'Gagal menetapkan saldo awal'); return }
      toast.success(`Saldo awal ${tahun} ditetapkan nol. Pengingat ini tidak muncul lagi.`)
      onDitetapkan()
    } catch (e) {
      toast.error('Gagal menetapkan: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSibuk(false)
    }
  }, [tahun, onDitetapkan])

  const keTutupKas = useCallback(() => {
    router.push(`/blud/tutup-kas?tahun=${tahun}&bulan=1`)
  }, [router, tahun])

  const mulaiAgustus = bulan !== 1

  return (
    <div
      onClick={onTutup}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="blud-imp-text"
        style={{ background: 'var(--surface-card, #042C53)', borderRadius: 14, width: 'min(560px, 94vw)', padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <AlertTriangle size={17} style={{ color: '#BA7517' }} />
          <div style={{ fontSize: 14, fontWeight: 800 }}>Saldo awal {tahun} belum ditetapkan</div>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p>
            Saldo awal kas dan bank tahun {tahun} masih <b>Rp 0</b> dan belum pernah ditetapkan
            siapa pun. Angka itu bukan sekadar isian Januari — <b>seluruh bulan di bawahnya
            dihitung darinya</b>, termasuk {NAMA_BULAN[bulan - 1]} yang sedang Anda buka.
          </p>

          {mulaiAgustus && (
            <div className="blud-imp-badge-warn" style={{ padding: '9px 12px', borderRadius: 8 }}>
              Anda sedang di bulan {NAMA_BULAN[bulan - 1]}, tapi isiannya tetap di{' '}
              <b>Januari</b> — dan itu memang benar. Saldo awal hanya diketik sekali untuk
              satu tahun; bulan lain dihitung otomatis dari arus kas bulan sebelumnya. Jadi
              walau Anda baru mulai memakai sistem ini di {NAMA_BULAN[bulan - 1]} dan
              bulan-bulan sebelumnya kosong, mengisinya di Januari tidak keliru dan tidak
              merusak apa pun.
            </div>
          )}

          <p className="blud-imp-muted">
            Kalau saldo awalnya memang nol, tetapkan sekarang supaya keputusan itu tercatat
            — pengingat ini akan berhenti muncul. Mengisi belakangan juga masih boleh:
            angkanya merambat sendiri ke semua bulan, <b>selama belum ada bulan yang ditutup</b>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
          <PrimaButton variant="ghost" onClick={onLanjut} disabled={sibuk}>
            Nanti saja, lanjut mencatat
          </PrimaButton>
          {bolehIsi && (
            <PrimaButton variant="ghost" onClick={() => void tetapkanNol()} disabled={sibuk}>
              {sibuk ? 'Menetapkan…' : 'Memang nol — tetapkan'}
            </PrimaButton>
          )}
          {bolehBuka ? (
            <PrimaButton variant="warning" iconLeft={<ArrowRight size={13} />} onClick={keTutupKas} disabled={sibuk}>
              Isi di Tutup Kas Januari
            </PrimaButton>
          ) : (
            <span className="blud-imp-muted" style={{ fontSize: 11, alignSelf: 'center' }}>
              Isiannya di menu Tutup Kas — mintakan ke pemegang menu itu.
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
