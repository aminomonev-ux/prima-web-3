// lib/data/kinerja-match.ts — IK-4: pencocokan KETERANGAN Excel ⟷ SSK app.
// Fuzzy lokal (no-LLM): skor = gabungan Dice token-set (tahan beda urutan/subset
// kata) + Levenshtein ternormalisasi (tahan typo). PURE & testable; dipakai server
// saat impor realisasi belanja. Routing sumber = ikut SSK pemenang (CONCEPT §22).

export interface SskTarget {
  canonical_id: string;
  sumber: string;
  keterangan: string;
}
export interface BelanjaInput {
  keterangan: string;
  realisasi: number;
  bulan_ke: number;
  source?: string;
}
export type MatchStatus = 'match' | 'mirip' | 'none';
export interface MatchRow extends BelanjaInput {
  ssk_canonical_id: string | null;
  ssk_keterangan:   string | null;
  sumber:           string | null;
  score:            number;       // 0..1
  status:           MatchStatus;
}

const STOP = new Set(['belanja', 'dan', 'untuk', 'yang', 'dari', 'di', 'ke', 'pada']);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(' ').filter(t => t.length > 1 && !STOP.has(t)));
}
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return (2 * inter) / (a.size + b.size);
}
function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Skor kemiripan keterangan 0..1 (1 = identik). */
export function keteranganScore(a: string, b: string): number {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const d = dice(tokens(a), tokens(b));
  const l = 1 - lev(na, nb) / Math.max(na.length, nb.length);
  return Math.round((0.65 * d + 0.35 * Math.max(0, l)) * 1000) / 1000;
}

export const MATCH_THRESHOLD = 0.72; // >= → cocok (✓)
export const MIRIP_THRESHOLD = 0.45; // >= → mirip (~), di bawahnya belum cocok (✗)

/**
 * Cocokkan tiap baris Excel ke SSK terbaik (lintas semua sumber). Sumber hasil =
 * sumber SSK pemenang. Status: match/mirip/none sesuai ambang.
 */
export function matchBelanja(excel: readonly BelanjaInput[], ssk: readonly SskTarget[]): MatchRow[] {
  return excel.map((row) => {
    let best: SskTarget | null = null;
    let bestScore = 0;
    for (const s of ssk) {
      const sc = keteranganScore(row.keterangan, s.keterangan);
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    const status: MatchStatus = bestScore >= MATCH_THRESHOLD ? 'match' : bestScore >= MIRIP_THRESHOLD ? 'mirip' : 'none';
    const hit = status === 'none' ? null : best;
    return {
      ...row,
      ssk_canonical_id: hit ? hit.canonical_id : null,
      ssk_keterangan:   hit ? hit.keterangan : null,
      sumber:           hit ? hit.sumber : null,
      score:            bestScore,
      status,
    };
  });
}

/** Kelompokkan hasil match per sumber (untuk modal ber-tab). 'none' → kunci '_belum'. */
export function groupBySumber(rows: readonly MatchRow[]): Record<string, MatchRow[]> {
  const out: Record<string, MatchRow[]> = {};
  for (const r of rows) {
    const key = r.sumber ?? '_belum';
    (out[key] ??= []).push(r);
  }
  return out;
}
