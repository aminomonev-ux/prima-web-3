// components/blud/KelompokAksi.tsx — satu kelompok tombol berlabel di baris aksi toolbar
// DPA & Pergeseran ("Isi tabel", "Lanjutan"). Satu komponen untuk dua layar supaya
// susunannya tidak berbeda lagi.

import type { ReactNode } from 'react'

export default function KelompokAksi({ label, garis = false, children }: {
  label: string
  /** Garis pemisah di kiri — untuk kelompok kedua dan seterusnya (`.blud-kelompok-garis`). */
  garis?: boolean
  children: ReactNode
}) {
  return (
    // flex 0 0 auto + maxWidth 100%: kalau tidak muat, SELURUH kelompok turun ke baris
    // baru bersama labelnya. Dengan flex-shrink bawaan, kelompok diperas di ujung baris
    // dan labelnya tertinggal sendirian di sana sementara tombolnya turun.
    <div className={garis ? 'blud-kelompok-garis' : undefined}
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: '0 0 auto', maxWidth: '100%' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#85B7EB', marginRight: 2 }}>{label}</span>
      {children}
    </div>
  )
}
