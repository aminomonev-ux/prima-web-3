'use client';
// Nilai tersimpan yang tidak ada di pilihan Master tetap ditampilkan sebagai opsi.
// `<select>` yang nilainya di luar daftar tampil seolah kosong — orang mengira isiannya
// hilang (Uraian SSK hasil impor memang tidak pernah tercatat di Master), lalu memilih
// ulang dan memutus salinan namanya. Dipakai tab Master & Rekening.

export default function OpsiDiLuarMaster({ nilai, opsi }: { nilai: string; opsi: readonly string[] }) {
  if (!nilai || opsi.includes(nilai)) return null;
  return <option value={nilai}>{nilai} (tidak ada di Master)</option>;
}
