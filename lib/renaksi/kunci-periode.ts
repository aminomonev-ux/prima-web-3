// ═══ PRIMA — Renaksi — Kunci Periode (pure, aman-klien) ═══
// Satu aturan untuk server (`lib/data/rencana-aksi.ts`) DAN layar (Detail Indikator, Matriks Bulanan): bulan/triwulan
// mana yang realisasinya tidak boleh diubah. `kunci` = 0 (terbuka) atau 1–12 (terkunci s.d. bulan itu).
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** Bulan ke-`i` (0 = Januari) terkunci. */
export const bulanTerkunci = (i: number, kunci: number): boolean => kunci > 0 && i < kunci;

/** Triwulan `q` (1–4) terkunci bila SELURUH bulannya ≤ batas kunci — sama dengan penolakan `updateQuarter`. */
export const triwulanTerkunci = (q: number, kunci: number): boolean => kunci > 0 && q * 3 <= kunci;

/** "terkunci s.d. Sep"; '' bila terbuka. */
export const kalimatKunci = (kunci: number): string => (kunci > 0 ? `terkunci s.d. ${BULAN_PENDEK[kunci - 1] ?? ''}` : '');
