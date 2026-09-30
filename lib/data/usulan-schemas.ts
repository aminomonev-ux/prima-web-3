// lib/data/usulan-schemas.ts — skema Zod BERSAMA untuk semua jalur tulis Usulan.
//
// B4/B10, audit 2026-09-29: tiap jalur dulu menulis skemanya sendiri dan ketiganya sudah
// berbeda pendapat — buat baru menerima PERGESERAN, edit draf tidak (draf PERGESERAN tak
// bisa disimpan); buat baru menolak `javascript:` di tautan merek (V5-INJ-01), edit draf
// tidak; buat baru mewajibkan qty ≥ 1, revisi Bidang & kirim-ulang menerima 0/negatif.
// Satu sumber di sini supaya jalur berikutnya tidak bisa lupa (L69/L78).
import { z } from 'zod'
import { isSafeHttpUrl, isSafeFileUrl } from '@/lib/shared/url'

export const JenisUsulanSchema = z.enum(['MURNI', 'PERUBAHAN', 'PERGESERAN'])

export const QtyUsulanSchema = z.number().min(1, 'Jumlah minimal 1')
export const HargaUsulanSchema = z.number().min(0, 'Harga tidak boleh negatif')

// V5-INJ-01: tolak skema non-http(s) (cegah `javascript:`/`data:` stored-XSS saat
// link dirender sebagai <a href> di reviewer). Kosong tetap boleh.
const optUrl = z.string().trim().optional()
  .refine(v => !v || isSafeHttpUrl(v), 'URL harus diawali http:// atau https://')

// file_url = path download internal dari /api/upload (relatif), bukan URL eksternal.
const optFileUrl = z.string().trim().optional()
  .refine(v => !v || isSafeFileUrl(v), 'Lampiran tidak valid')

export const ItemUsulanSchema = z.object({
  nama_barang: z.string().min(1, 'Nama barang wajib diisi').max(255),
  spesifikasi: z.string().max(2000).optional(),
  qty:         QtyUsulanSchema,
  satuan:      z.string().min(1).max(50),
  harga_est:   HargaUsulanSchema,
  prioritas:   z.enum(['TINGGI', 'SEDANG', 'RENDAH']),
  alasan:      z.string().max(2000).optional(),
  url_merk1:   optUrl,
  url_merk2:   optUrl,
  url_merk3:   optUrl,
  file_url:    optFileUrl,
})
