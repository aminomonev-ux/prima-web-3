'use client'
// components/blud/MuatBerkasButton.tsx — "Muat dari berkas" cadangan JSON.
// Konsep: docs/CONCEPT-blud-cadangan-json.md §4 Tahap 3
//
// Pintu masuk KEDUA ke jalur yang sudah dipakai tombol Pulihkan; bedanya cuma
// sumbernya — berkas di komputer, bukan tabel di server. Gunanya justru saat
// Pulihkan tidak bisa menolong: fotonya kena rotasi, atau databasenya hilang.
//
// BERHENTI DI FORM. Komponen ini tidak pernah memanggil endpoint tulis; ia
// memulangkan isi berkas lewat `onMuat`, dan yang menuliskannya tetap tombol
// Simpan halaman. Nol endpoint tulis baru berarti seluruh pagar lama berlaku
// otomatis (L78/L80).
//
// Satu komponen dipakai DUA layar. Menyalinnya ke masing-masing berarti dua
// tempat memutuskan berkas mana yang sah — persis cara L78 lahir.

import { useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import PrimaButton from '@/components/ui/PrimaButton'
import { bacaBerkasCadangan, type BerkasCadangan, type JenisCadangan } from '@/lib/blud/cadangan-berkas'

interface Props {
  jenis:   JenisCadangan
  tahun:   number
  /** Kosong berarti tombolnya hidup; kalau terisi, ia jadi alasan matinya + tooltip. */
  alasanKunci?: string
  onMuat:  (data: BerkasCadangan, namaBerkas: string) => void
}

export default function MuatBerkasButton({ jenis, tahun, alasanKunci, onMuat }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [baca, setBaca] = useState(false)

  async function pilih(e: React.ChangeEvent<HTMLInputElement>) {
    const berkas = e.target.files?.[0]
    // Dikosongkan SEBELUM apa pun diproses: tanpa ini, memilih berkas yang sama
    // dua kali berturut-turut tidak memicu `change` dan tombolnya seperti rusak.
    e.target.value = ''
    if (!berkas) return

    setBaca(true)
    try {
      const hasil = bacaBerkasCadangan(await berkas.text(), { jenis, tahun })
      if (!hasil.ok) { toast.error(hasil.error, { duration: 9000 }); return }
      onMuat(hasil.data, berkas.name)
    } catch {
      toast.error('Berkasnya tidak bisa dibaca. Coba unduh ulang dari Drive.')
    } finally { setBaca(false) }
  }

  return (
    <>
      <input
        ref={inputRef} type="file" accept="application/json,.json"
        style={{ display: 'none' }} onChange={pilih}
      />
      <PrimaButton variant="ghost" size="sm" iconLeft={<FolderOpen className="w-3.5 h-3.5" />}
        disabled={baca || !!alasanKunci}
        data-tooltip={alasanKunci || `Muat baris dari berkas cadangan JSON ${jenis === 'DPA' ? 'DPA' : 'Pergeseran'} ${tahun} — belum tersimpan sampai Anda menekan Simpan`}
        onClick={() => inputRef.current?.click()}>
        {baca ? 'Membaca…' : 'Muat dari Berkas'}
      </PrimaButton>
    </>
  )
}
