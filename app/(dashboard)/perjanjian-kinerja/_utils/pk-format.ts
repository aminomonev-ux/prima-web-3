// app/(dashboard)/perjanjian-kinerja/_utils/pk-format.ts
// Format helper untuk display PK — re-export fmtRp + helper NIP/date.

export { fmtRp } from '@/lib/shared/utils';

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];

/** Format YYYY-MM-DD → "23 Mei 2026". */
export function fmtDateID(iso: string | null | undefined): string {
  if (!iso) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${BULAN_ID[Number(mo) - 1]} ${y}`;
}

/** Batas tahun yang diterima server — cermin `TahunSchema` di lib/data/pk-schemas.ts (dijaga uji). */
export const TAHUN_PK_MIN = 2020;
export const TAHUN_PK_MAX = 2100;

/**
 * Range tahun untuk dropdown — 2 tahun sebelum sekarang sampai 5 tahun ke depan. Tahun `aktif` yang
 * di luar rentang (diketik lewat "Tahun lain…") ikut disisipkan, supaya pilihan yang sedang berlaku
 * tetap terlihat di daftarnya.
 */
export function tahunRange(aktif?: string): string[] {
  const cur = new Date().getFullYear();
  const out: string[] = [];
  for (let y = cur - 2; y <= cur + 5; y++) out.push(String(y));
  if (aktif && /^\d{4}$/.test(aktif) && !out.includes(aktif)) out.push(aktif);
  return out.sort();
}

/** Tahun yang diketik di "Tahun lain…": 4 digit dalam batas server, atau null. */
export function bacaTahunKetik(teks: string): string | null {
  const t = teks.trim();
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  return n >= TAHUN_PK_MIN && n <= TAHUN_PK_MAX ? t : null;
}
