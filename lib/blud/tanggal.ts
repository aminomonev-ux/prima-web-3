// lib/blud/tanggal.ts — format tanggal versi BLUD, satu sumber untuk semua layar.
//
// Dipisah supaya VersiDropdown, pil "Pagu dari …", dan layar lain memakai bunyi
// yang sama persis. Sengaja parsing string YYYY-MM-DD dengan regex, BUKAN
// `new Date(iso)`: konstruktor Date menafsirkan tanggal polos sebagai UTC lalu
// menggesernya ke zona lokal, jadi 2026-07-01 bisa tampil 30 Jun.

const BULAN_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

/** "2026-07-26" → "26 Jul 2026". Nilai yang tidak dikenali dikembalikan apa adanya. */
export function formatTanggalId(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  if (!m) return String(iso)
  return `${m[3]} ${BULAN_ID[Number(m[2]) - 1] ?? m[2]} ${m[1]}`
}
