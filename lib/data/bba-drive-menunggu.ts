// ═══ PRIMA — BBA: ringkasan perubahan Drive yang menunggu (docs/konsep/bba/CONCEPT-bba-drive-dua-arah.md U2) ═══
// Satu baris `app_config` per berkas laporan (`bba_drive_menunggu:rencana:{tahun}`) — bukan di status Drive: status itu satu
// JSON untuk semua berkas dan ditulis di bawah kunci pengirim. Baca-ubah-tulis lewat kunci bernama per berkas (L69-a: baris
// app_config bisa belum ada, FOR UPDATE padanya tidak mengunci apa pun).
import { sql, queryOne, type Penanya, type TxSql } from '@/lib/data/db';
import { acquireBludLock } from '@/lib/data/locks';
import type { RingkasMenunggu } from '@/lib/bba/drive-menunggu';

const kunciKonfig = (kunci: string) => `bba_drive_menunggu:${kunci}`;

export async function bacaMenunggu(kunci: string, q?: Penanya): Promise<RingkasMenunggu | null> {
  const r = q
    ? (await q`SELECT value FROM app_config WHERE \`key\` = ${kunciKonfig(kunci)} LIMIT 1` as Array<{ value: string | null }>)[0]
    : await queryOne<{ value: string | null }>(sql`SELECT value FROM app_config WHERE \`key\` = ${kunciKonfig(kunci)} LIMIT 1`);
  try {
    const j = JSON.parse(r?.value ?? 'null') as RingkasMenunggu | null;
    return j && typeof j === 'object' && Array.isArray(j.sel) ? { ...j, tetap: j.tetap ?? {} } : null;
  } catch { return null; }
}

/** Dipanggil pertama di transaksi penulis ringkasan berkas itu. */
export async function kunciMenunggu(tx: TxSql, kunci: string): Promise<void> {
  await acquireBludLock(tx, 'bba_drive_menunggu', kunci);
}

export async function tulisMenunggu(tx: TxSql, kunci: string, r: RingkasMenunggu | null): Promise<void> {
  if (!r) { await tx`DELETE FROM app_config WHERE \`key\` = ${kunciKonfig(kunci)}`; return; }
  await tx`INSERT INTO app_config (\`key\`, value) VALUES (${kunciKonfig(kunci)}, ${JSON.stringify(r)}) ON DUPLICATE KEY UPDATE value = VALUES(value)`;
}
