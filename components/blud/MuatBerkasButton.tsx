'use client'
// components/blud/MuatBerkasButton.tsx — "Pulihkan Cadangan" dari berkas JSON.
// Konsep: docs/CONCEPT-blud-cadangan-json.md §4 Tahap 3
//
// Pintu masuk KEDUA ke jalur yang sudah dipakai tombol Pulihkan di dalam dropdown
// versi; bedanya cuma sumbernya — berkas di komputer, bukan tabel di server.
// Gunanya justru saat Pulihkan tidak bisa menolong: fotonya kena rotasi, atau
// databasenya hilang.
//
// NAMANYA "Pulihkan Cadangan", bukan "Muat dari Berkas". Nama lama generik dan
// duduk persis di sebelah tombol Impor, jadi orang wajar mengira keduanya
// sekeluarga — padahal Impor MENYUSUN DPA dari Excel, sedangkan ini
// MENGEMBALIKAN foto simpanan. "Pulihkan" sudah punya arti mapan di aplikasi ini.
//
// BERHENTI DI FORM. Komponen ini tidak pernah memanggil endpoint tulis; ia
// memulangkan isi berkas lewat `onMuat`, dan yang menuliskannya tetap tombol
// Simpan halaman. Nol endpoint tulis baru berarti seluruh pagar lama berlaku
// otomatis (L78/L80).
//
// TIDAK dikunci `alasanKunciBorongan`, dan itu keputusan, bukan kelalaian.
// Kunci itu untuk tombol yang membawa baris dari LUAR dengan jangkar kosong —
// Form Baru dari Kode Besar, Impor dari Excel, Buat Pergeseran dari DPA;
// menyimpannya di atas versi berisi memutus jangkar realisasi. Berkas cadangan
// membawa `anggaran_key` lengkap (diperiksa: 558 dari 558), jadi sifatnya sama
// dengan "Salin Versi Lain" yang memang sengaja di luar kunci itu (L80).
//
// Satu komponen dipakai DUA layar. Menyalinnya ke masing-masing berarti dua
// tempat memutuskan berkas mana yang sah — persis cara L78 lahir.

import { useRef, useState } from 'react'
import { History } from 'lucide-react'
import { toast } from 'sonner'
import PrimaButton from '@/components/ui/PrimaButton'
import { bacaBerkasCadangan, type BerkasCadangan, type JenisCadangan } from '@/lib/blud/cadangan-berkas'

interface Props {
  jenis:  JenisCadangan
  tahun:  number
  onMuat: (data: BerkasCadangan, namaBerkas: string) => void
}

export default function MuatBerkasButton({ jenis, tahun, onMuat }: Props) {
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
      <PrimaButton variant="ghost" size="sm" iconLeft={<History className="w-3.5 h-3.5" />}
        disabled={baca}
        data-tooltip={`Kembalikan isi ${jenis === 'DPA' ? 'DPA' : 'Pergeseran'} ${tahun} dari berkas cadangan JSON — `
          + `bukan untuk menyusun tabel baru, dan belum tersimpan sampai Anda menekan Simpan`}
        onClick={() => inputRef.current?.click()}>
        {baca ? 'Membaca…' : 'Pulihkan Cadangan'}
      </PrimaButton>
    </>
  )
}
