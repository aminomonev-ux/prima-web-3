// app/api/blud/realisasi/_guard.ts — gerbang akses modul Realisasi BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §7.4
//
// Guard ditaruh di SETIAP route, bukan hanya di UI: menyembunyikan tombol bukan
// keamanan — endpoint tetap bisa dipanggil lewat curl (pelajaran V3-1).
import { NextResponse } from 'next/server'
import { hasAppAccess } from '@/lib/security/guard'
import { canInputRealisasi, canViewRealisasi } from '@/lib/blud/realisasi-schemas'

export function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

export async function bolehLihat(userId: number, role: string): Promise<boolean> {
  return hasAppAccess(userId, role, canViewRealisasi)
}

export async function bolehInput(userId: number, role: string): Promise<boolean> {
  return hasAppAccess(userId, role, canInputRealisasi)
}
