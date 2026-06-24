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

/** Range tahun untuk dropdown — 2 tahun sebelum sekarang sampai 5 tahun ke depan. */
export function tahunRange(): string[] {
  const cur = new Date().getFullYear();
  const out: string[] = [];
  for (let y = cur - 2; y <= cur + 5; y++) out.push(String(y));
  return out;
}
