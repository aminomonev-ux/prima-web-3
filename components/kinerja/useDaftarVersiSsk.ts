'use client'
// components/kinerja/useDaftarVersiSsk.ts
// Daftar versi SSK satu sumber untuk pemilih versi yang hanya MEMBACA (tab Realisasi & Cetak).
// SATU pemuat: dua salinan efek yang sama cepat atau lambat berbeda soal kapan memuat ulang.
// Tab RKO sengaja memegang pemuatnya sendiri — ia memuat ulang sesudah Simpan & Buat Perubahan.

import { useEffect, useState } from 'react'
import { fetchJson } from '@/lib/shared/api'
import type { VersiKinerja } from './VersiPickerKinerja'

export function useDaftarVersiSsk(tahun: string, sumber: string): { items: VersiKinerja[]; loading: boolean } {
  const [items,   setItems]   = useState<VersiKinerja[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let alive = true
    queueMicrotask(() => { if (alive) setLoading(true) })
    fetchJson<unknown>(`/api/kinerja/ssk/versi-list?tahun=${tahun}&sumber=${sumber}`)
      .then(d => { if (alive && d.ok) setItems(((d as unknown as { items: VersiKinerja[] }).items) ?? []) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [tahun, sumber])
  return { items, loading }
}
