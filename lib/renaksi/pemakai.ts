// lib/renaksi/pemakai.ts — kalimat "nama ini dipakai modul …" sesudah ganti nama di Renaksi.
// PURE & aman-klien. Konsep: docs/CONCEPT-renaksi-terhubung.md §6 (Tahap F). Hanya keterangan:
// modul lain TIDAK ditulis dari Renaksi — masing-masing memperbarui lewat spanduknya sendiri.

export interface PemakaiNama {
  modul: 'E-Anggaran' | 'PK' | 'IKI';
  /** Tempat di modul itu, mis. "Master" / "Master Program" / "kartu RHK di 2 dokumen DRAFT". */
  tempat: string;
  jumlah: number;
}

export function kalimatPemakai(dipakai: readonly PemakaiNama[]): string | null {
  const ada = dipakai.filter(d => d.jumlah > 0);
  if (!ada.length) return null;
  const rinci = ada.map(d => `${d.modul} (${d.tempat}: ${d.jumlah})`).join(', ');
  return `Nama lama masih dipakai di ${rinci}. Perbarui dari layar masing-masing — spanduk "Rencana Aksi berubah" muncul di sana.`;
}
