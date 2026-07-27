// lib/blud/bukti-setor-schemas.ts — Zod sentral + error domain Bukti Setor BLUD.
// Konsep: docs/CONCEPT-blud-bukti-setor.md (keputusan #36)
//
// Akses mengikuti Buku Kas persis — peruntukannya sama, jadi TIDAK ada kunci
// `app_access` baru. Menambah kunci berarti menambah kolom izin yang harus
// diberikan terpisah untuk pekerjaan yang sebenarnya satu.
import { z } from 'zod'
import { BulanSchema, RupiahSchema, TanggalTxSchema } from './realisasi-schemas'

export const ASAL_BARIS = ['BKU', 'POTONGAN', 'KETIK'] as const
export type AsalBaris = typeof ASAL_BARIS[number]

/**
 * Baris `BKU`/`POTONGAN` hanya membawa penunjuk — uraian & nilainya dibaca HIDUP
 * dari sumbernya saat ditampilkan. Menyalinnya ke sini akan membuka satu-satunya
 * jalan slip ini melenceng dari BKU.
 */
export const BarisBuktiSetorSchema = z.object({
  asal: z.enum(ASAL_BARIS),
  tx_id: z.number().int().positive().nullish(),
  potongan_id: z.number().int().positive().nullish(),
  uraian: z.string().trim().max(255).nullish(),
  nilai: RupiahSchema.nullish(),
}).superRefine((v, ctx) => {
  if (v.asal === 'BKU' && !v.tx_id) {
    ctx.addIssue({ code: 'custom', path: ['tx_id'], message: 'Baris dari BKU wajib menunjuk transaksinya' })
  }
  if (v.asal === 'POTONGAN' && !v.potongan_id) {
    ctx.addIssue({ code: 'custom', path: ['potongan_id'], message: 'Baris potongan wajib menunjuk potongannya' })
  }
  if (v.asal === 'KETIK') {
    if (!v.uraian) {
      ctx.addIssue({ code: 'custom', path: ['uraian'], message: 'Baris ketikan wajib punya uraian' })
    }
    if (v.nilai == null || v.nilai <= 0) {
      ctx.addIssue({ code: 'custom', path: ['nilai'], message: 'Baris ketikan wajib punya nilai lebih dari 0' })
    }
  }
})

export const SimpanBuktiSetorSchema = z.object({
  id: z.number().int().positive().nullish(),
  expected_version: z.number().int().gte(0).nullish(),
  tahun_anggaran: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema,
  tanggal: TanggalTxSchema,
  no_bukti: z.string().trim().max(64).nullish(),
  /** Diutamakan menunjuk transaksi AMBIL_BANK; ketikan hanya kalau memang tak ada di BKU. */
  ambil_tx_id: z.number().int().positive().nullish(),
  ambil_manual: RupiahSchema.nullish(),
  baris: z.array(BarisBuktiSetorSchema).max(100, 'Maksimal 100 baris per bukti setor').default([]),
}).superRefine((v, ctx) => {
  const bl = String(v.bulan).padStart(2, '0')
  if (!v.tanggal.startsWith(`${v.tahun_anggaran}-${bl}-`)) {
    ctx.addIssue({ code: 'custom', path: ['tanggal'], message: 'Tanggal bukti setor harus berada di bulan yang dipilih' })
  }
  if (v.ambil_tx_id && v.ambil_manual != null) {
    ctx.addIssue({
      code: 'custom', path: ['ambil_manual'],
      message: 'Pilih salah satu: tarikan dari BKU atau nominal ketikan — bukan keduanya.',
    })
  }
  // Dobel di dalam satu slip tidak punya kasus sahnya: itu murni hitung dua kali.
  // Dobel LINTAS slip bisa sah (pembayaran dicicil) — itu diperingatkan saat baca,
  // tidak diblokir di sini.
  const tx = new Set<number>()
  const pot = new Set<number>()
  for (const b of v.baris) {
    if (b.tx_id) {
      if (tx.has(b.tx_id)) {
        ctx.addIssue({ code: 'custom', path: ['baris'], message: 'Satu transaksi dipakai dua kali di bukti setor ini' })
        break
      }
      tx.add(b.tx_id)
    }
    if (b.potongan_id) {
      if (pot.has(b.potongan_id)) {
        ctx.addIssue({ code: 'custom', path: ['baris'], message: 'Satu potongan dipakai dua kali di bukti setor ini' })
        break
      }
      pot.add(b.potongan_id)
    }
  }
})
export type SimpanBuktiSetorInput = z.infer<typeof SimpanBuktiSetorSchema>

export const ListBuktiSetorQuerySchema = z.object({
  tahun: z.coerce.number().int().gte(2000).lte(2100),
  bulan: BulanSchema.optional(),
  id: z.coerce.number().int().positive().optional(),
})

export class BludBuktiSetorConflictError extends Error {
  constructor(public id: number, public expected: number, public actual: number) {
    super('Bukti setor ini sudah diubah pengguna lain. Memuat versi terbaru.')
    this.name = 'BludBuktiSetorConflictError'
  }
}

export class BludBuktiSetorTidakAdaError extends Error {
  constructor(public id: number) {
    super(`Bukti setor ${id} tidak ditemukan.`)
    this.name = 'BludBuktiSetorTidakAdaError'
  }
}
