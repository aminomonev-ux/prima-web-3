// lib/bba/pengaturan.ts — pengaturan BBA (kop & penanda tangan Excel, jarak opname).
// Satu kunci `app_config` = `bba_pengaturan` (JSON), ditulis lewat route BBA berizin Master —
// bukan panel Config admin (docs/CONCEPT-bba-buku-aset.md §14, §15). MURNI: dipakai Zod,
// layar Master, dan penyusun Excel.
import { z } from 'zod'

export const KUNCI_PENGATURAN = 'bba_pengaturan'

const teks = (maks: number) => z.string().trim().max(maks).default('')

export const PengaturanBbaSchema = z.object({
  kop: z.object({
    kode_lokasi: teks(60), bidang: teks(160), sub_bidang: teks(160), satuan_kerja: teks(160),
  }).default({ kode_lokasi: '', bidang: '', sub_bidang: '', satuan_kerja: '' }),
  ttd: z.object({
    kota: teks(60),
    kepala_jabatan: teks(80), kepala_nama: teks(120), kepala_nip: teks(40),
    pengurus_nama: teks(120), pengurus_nip: teks(40),
    /** Kanan bawah KIR (Tahap C). Penanggung Jawab Ruangan di kiri diisi per ruangan (Master → Ruangan). */
    pembantu_nama: teks(120), pembantu_nip: teks(40),
  }).default({ kota: '', kepala_jabatan: '', kepala_nama: '', kepala_nip: '', pengurus_nama: '', pengurus_nip: '', pembantu_nama: '', pembantu_nip: '' }),
  /** §13 keputusan 2: setahun sekali, bisa diubah ke 6 bulan tanpa memperbarui aplikasi. */
  opname_bulan: z.number().int().min(1).max(60).default(12),
})

export type PengaturanBba = z.infer<typeof PengaturanBbaSchema>

export const PENGATURAN_BAWAAN: PengaturanBba = PengaturanBbaSchema.parse({
  ttd: { kota: 'Semarang', kepala_jabatan: 'KEPALA SKPD' },
})

/** Nilai tersimpan yang rusak/kosong tidak boleh mematikan halaman — jatuh ke bawaan. */
export function bacaPengaturan(teksJson: string | null | undefined): PengaturanBba {
  if (!teksJson) return PENGATURAN_BAWAAN
  try {
    const p = PengaturanBbaSchema.safeParse(JSON.parse(teksJson))
    return p.success ? p.data : PENGATURAN_BAWAAN
  } catch { return PENGATURAN_BAWAAN }
}
