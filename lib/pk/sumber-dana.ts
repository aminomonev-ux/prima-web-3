// lib/pk/sumber-dana.ts — keterangan (sumber dana) baris Anggaran PK. MURNI, aman-klien.
//
// Sejak awal, tombol ✎ di Keterangan selain BLUD MENJUMLAHKAN nominal BLUD ke nominal yang diketik dan
// menandai barisnya `auto_filled_from_blud`, tapi keterangannya tetap "APBD" — Word lalu mencetak angka
// gabungan berlabel "APBD" saja. Baris lama dikenali dari pasangan itu (bukan BLUD + bertanda auto) dan
// labelnya dilengkapi saat dibuka di form DAN saat Word disusun. Bentuk labelnya "X & BLUD" (keputusan
// pemilik 2026-11-13); "X + BLUD" yang sempat tersimpan sebelum itu ikut diseragamkan.

/** Keterangan yang benar untuk baris tersimpan: bertanda BLUD-auto tapi labelnya belum menyebut BLUD → "X & BLUD". */
export function keteranganTercetak(keterangan: string, autoBlud: boolean | number | null | undefined): string {
  const k = (keterangan ?? '').trim().replace(/\s*\+\s*BLUD$/i, ' & BLUD')
  if (!autoBlud || !k || /\bBLUD\b/i.test(k)) return k
  return `${k} & BLUD`
}
