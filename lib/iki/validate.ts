// lib/iki/validate.ts — validasi LUNAK kewajaran target triwulan vs tahunan.
// Murni & client-safe: dipakai editor (ikon warning) + dialog finalize.
// Tidak pernah memblokir — server tetap menerima apa pun (jaring pengaman ketik).

export type TargetWarning = {
  no_urut: number;
  rhk: string;
  message: string;
};

/**
 * Ambil angka dari target VARCHAR campuran: "93%", "765 Orang", "1 Dok", "4,02".
 * Konvensi Indonesia: titik = pemisah ribuan, koma = desimal.
 * Tidak ada angka yang bisa diparse → null (baris di-skip, tanpa warning palsu).
 */
export function parseTargetNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).trim().replace(/\./g, '').replace(/,/g, '.').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

type RhkLike = {
  no_urut: number;
  rhk: string;
  aspek_b: string;
  target_tahunan: string;
  triwulan: Array<{ triwulan: number; target_tw: string }>;
};

const EPS = 0.01;

export function validateRhkTargets(rows: RhkLike[]): TargetWarning[] {
  const warnings: TargetWarning[] = [];
  for (const r of rows) {
    const tahunan = parseTargetNumber(r.target_tahunan);
    if (tahunan == null) continue;
    const tw = [1, 2, 3, 4].map((n) =>
      parseTargetNumber(r.triwulan.find((t) => t.triwulan === n)?.target_tw),
    );
    if (tw.some((v) => v == null)) continue;
    const vals = tw as number[];
    const label = r.rhk.length > 60 ? r.rhk.slice(0, 57) + '…' : r.rhk;

    if (r.aspek_b === 'Akumulatif') {
      const sum = vals.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - tahunan) > EPS) {
        warnings.push({
          no_urut: r.no_urut, rhk: r.rhk,
          message: `"${label}" (Akumulatif): jumlah target TW I–IV = ${fmtNum(sum)}, tidak sama dengan target tahunan ${fmtNum(tahunan)}.`,
        });
      }
    } else if (r.aspek_b === 'Progres Positif' || r.aspek_b === 'Progres Negatif') {
      if (Math.abs(vals[3] - tahunan) > EPS) {
        warnings.push({
          no_urut: r.no_urut, rhk: r.rhk,
          message: `"${label}" (${r.aspek_b}): target TW IV = ${fmtNum(vals[3])}, seharusnya sama dengan target tahunan ${fmtNum(tahunan)}.`,
        });
      }
    }
    // Pengulangan: semantik target per-kejadian ambigu — sengaja di-skip
  }
  return warnings;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}
