// app/(dashboard)/perjanjian-kinerja/_utils/salin-draft.ts
// Satu sumber untuk aksi "Salin jadi DRAFT baru" di dua layar (Riwayat & Form):
// kalimat konfirmasi dan panggilan endpoint. Dua salinan kalimat = dua versi yang
// cepat atau lambat berbeda bunyi, dan pengguna melihat keduanya di modul yang sama.
import { fetchJson } from '@/lib/shared/api'

export const JUDUL_SALIN_DRAFT = 'Salin jadi DRAFT baru?'

export function pesanSalinDraft(id: number, unit: string): string {
  return `Semua isi dokumen FINAL #${id} (${unit}) — pihak, lampiran, dan anggaran — disalin ke dokumen DRAFT baru yang bisa disunting. `
    + 'Dokumen FINAL lama tetap utuh sebagai arsip.'
}

export function salinDraftBaru(id: number) {
  return fetchJson<{ ok: boolean; id?: number; message?: string }>(
    `/api/perjanjian-kinerja/dokumen/${id}/salin-draft`, { method: 'POST' },
  )
}
