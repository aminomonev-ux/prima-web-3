// ─── PRIMA — Usulan Helper Functions ─────────────────────────────────────────
import { sql } from '@/lib/data/db';
import { SUBBIDANG_TO_BIDANG } from '@/lib/constants';

// ─── Generate No. Usulan: <kode>-YYYYMM-XXXX ─────────────────────────────────
// Prefix per jenis: MURNI=UA · PERUBAHAN=UAPB · PERGESERAN=UAPR. Prefix disjoint
// (dipisah '-') → LIKE per-prefix mengisolasi urutan tiap jenis per bulan.
const NO_USULAN_PREFIX: Record<string, string> = { MURNI: 'UA', PERUBAHAN: 'UAPB', PERGESERAN: 'UAPR' };
export async function generateNoUsulan(subBidang: string, tahunAnggaran?: number, jenis = 'MURNI'): Promise<string> {
  const now    = new Date();
  const year   = tahunAnggaran ?? now.getFullYear();
  const base   = NO_USULAN_PREFIX[jenis] ?? 'UA';
  const prefix = `${base}-${year}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const rows   = await sql`
    SELECT no_usulan FROM usulan_headers
    WHERE no_usulan LIKE ${prefix + '%'}
    ORDER BY no_usulan DESC LIMIT 1
  ` as Array<{ no_usulan: string }>;
  const last = rows[0]?.no_usulan;
  const seq  = last ? parseInt(last.split('-')[2] ?? '0') + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

// BUG-C6: Retry wrapper untuk INSERT yang berisiko race-condition di no_usulan.
// Combine dengan UNIQUE constraint (migration 013) untuk safety net.
// Kalau dapat ER_DUP_ENTRY → retry dengan no_usulan baru (max `tries` percobaan).
//
// Usage:
//   const { noUsulan, headerId } = await withNoUsulanRetry(subBidang, tahun, async (no) => {
//     const r = await sql`INSERT INTO usulan_headers (no_usulan, ...) VALUES (${no}, ...)`;
//     return (r[0] as { insertId: number }).insertId;
//   });
export async function withNoUsulanRetry<T extends number>(
  subBidang: string,
  tahunAnggaran: number | undefined,
  insertFn: (noUsulan: string) => Promise<T>,
  tries = 5,
): Promise<{ noUsulan: string; headerId: T }> {
  for (let i = 0; i < tries; i++) {
    const noUsulan = await generateNoUsulan(subBidang, tahunAnggaran);
    try {
      const headerId = await insertFn(noUsulan);
      return { noUsulan, headerId };
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === 'ER_DUP_ENTRY') {
        // Backoff kecil untuk hindari thundering herd di concurrent inserts
        await new Promise(r => setTimeout(r, 30 + Math.random() * 70));
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Gagal generate no_usulan unik setelah ${tries} percobaan.`);
}

// ─── Hitung status_ringkas dari semua item ─────────────────────────────────────
// Matching GAS _uaRingkasStatus() exactly:
//   DRAFT → DIAJUKAN → DITELAAH (admin telaah) → DIPROSES (kasubag) → DISETUJUI (kabag)
export function hitungStatusRingkas(statuses: string[]): string {
  if (!statuses.length) return 'DRAFT';
  const counts: Record<string, number> = {};
  statuses.forEach(s => { counts[s] = (counts[s] || 0) + 1; });
  const total = statuses.length;

  if (counts['DISETUJUI'] === total) return 'DISETUJUI';
  if (counts['DITOLAK']   === total) return 'DITOLAK';
  if (counts['DITOLAK_ADMIN'] === total) return 'DITOLAK_ADMIN';
  if ((counts['DITOLAK'] || 0) + (counts['DITOLAK_ADMIN'] || 0) === total) return 'DITOLAK';
  if (counts['DRAFT'] === total) return 'DRAFT';

  // ── Pure bidang-stage ──
  if (counts['DITOLAK_BIDANG'] === total) return 'DITOLAK_BIDANG';
  if (counts['REVISI_BIDANG']  === total) return 'REVISI_BIDANG';
  if (statuses.every(s => s === 'DIAJUKAN_REVIEW' || s === 'DRAFT')) return 'DIAJUKAN_REVIEW';
  if (statuses.every(s => ['REVISI_BIDANG','DITOLAK_BIDANG','DIAJUKAN_REVIEW','DRAFT'].includes(s))) return 'REVISI_BIDANG';

  // ── Semua masih di tahap pengajuan/bidang ──
  if (statuses.every(s => ['DIAJUKAN','DRAFT','REVISI_BIDANG','DITOLAK_BIDANG','DIAJUKAN_REVIEW'].includes(s))) return 'DIAJUKAN';

  // ── Admin sudah menelaah → header DITELAAH (antrian Kasubag) ──
  if (counts['DITELAAH'] || counts['DIREVISI_ADMIN']) return 'DITELAAH';

  // ── Kasubag sudah memutuskan → header DIPROSES (antrian Kabag) ──
  if (counts['DIPROSES'] || counts['DIREVISI_KASUBAG']) return 'DIPROSES';

  // Kabag sudah memutuskan semua (DIPROSES=0, DIREVISI_KASUBAG=0), ada yg disetujui → final
  if (counts['DISETUJUI']) return 'DISETUJUI';

  return 'DIAJUKAN';
}

// ─── Update header stats ───────────────────────────────────────────────────────
// PERF-C4: maintain jumlah_item_admin + total_nilai_admin di kolom header agar
// query list bisa SELECT langsung tanpa correlated subquery per row.
const NON_ADMIN_STATUSES = ['DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG'];

export async function updateHeaderStats(usulanId: number): Promise<void> {
  const items = await sql`
    SELECT status, harga_est, qty, nominal_disetujui
    FROM usulan_items WHERE usulan_id = ${usulanId}
  ` as Array<Record<string,unknown>>;
  const statusList   = items.map(i => i.status as string);
  const totalNilai   = items.reduce((s, i) => s + Number(i.harga_est) * Number(i.qty), 0);
  // total_nominal = "Total Disetujui" final → hanya item status DISETUJUI (putusan Kabag).
  // nominal_disetujui keisi sejak telaah Admin, jadi tanpa filter status ini salah ke-isi dini.
  const totalNominal = items.reduce((s, i) => s + (i.status === 'DISETUJUI' ? (Number(i.nominal_disetujui) || 0) : 0), 0);

  // Admin-stage items: yang sudah lolos review bidang (status BUKAN dalam NON_ADMIN_STATUSES)
  const adminItems    = items.filter(i => !NON_ADMIN_STATUSES.includes(i.status as string));
  const jumlahAdmin   = adminItems.length;
  const totalNilaiAdm = adminItems.reduce((s, i) => s + Number(i.harga_est) * Number(i.qty), 0);


  const statusRingkas = hitungStatusRingkas(statusList);

  await sql`
    UPDATE usulan_headers SET
      jumlah_item        = ${items.length},
      total_nilai        = ${totalNilai},
      total_nominal      = ${totalNominal},
      jumlah_item_admin  = ${jumlahAdmin},
      total_nilai_admin  = ${totalNilaiAdm},
      status_ringkas     = ${statusRingkas}
    WHERE id = ${usulanId}
  `;
}

// ─── Get bidang from sub_bidang ────────────────────────────────────────────────
export function getBidang(subBidang: string): string {
  return SUBBIDANG_TO_BIDANG[subBidang] ?? '';
}

// PERF-W1: fmtRp dipindah ke lib/shared/utils.ts (canonical single source).
// Export di sini sebelumnya dead code (no consumer external).
