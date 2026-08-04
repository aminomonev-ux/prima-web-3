// lib/security/app-guard.ts — pabrik penjaga akses setingkat modul.
//
// Empat modul (BBA, IKI, LKJIP, Rencana Aksi) punya `_guard.ts` yang isinya sama
// persis: ambil sesi, baca `app_access` dari DB, panggil satu fungsi `is<Modul>Role`.
// Yang membedakan cuma nama fungsi peran itu — sisanya disalin turun-temurun, lengkap
// dengan tiga nama field pesan yang berbeda (`message` / `msg` / `error`). Tiap modul
// baru menyalin salah satu dari empat, jadi selisihnya bertambah, bukan berkurang.
//
// `app_access` sengaja dibaca dari DB tiap panggilan, TIDAK dititipkan ke JWT: pencabutan
// akses harus berlaku saat itu juga, bukan menunggu sesi berakhir.

import { NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';

export type GuardedSession = { userId: number; username: string; role: string };

export type HasilGuard =
  | { ok: true; session: GuardedSession }
  | { ok: false; res: NextResponse };

type CekPeran = (role: string, appAccess: string[] | null) => boolean;

/**
 * Nama field pesan pada balasan gagal. Dibiarkan berbeda per modul **dengan sengaja**:
 * menyeragamkannya jadi `message` berarti mengubah bentuk balasan yang sudah dibaca
 * klien LKJIP (`j.msg`, 7 titik) dan Rencana Aksi (`j.error`). Kalimatnya sendiri sama;
 * yang berubah cuma nama lacinya — dan klien yang mencari laci lama akan menemukan
 * kosong lalu menampilkan pesan cadangan yang umum. Itu pekerjaan tersendiri, harus
 * server + klien dalam satu commit.
 */
type FieldPesan = 'message' | 'msg' | 'error';

function tolak(field: FieldPesan, pesan: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, [field]: pesan }, { status });
}

/**
 * Bikin fungsi `guard()` sebuah modul. Pemakaian di route tidak berubah:
 *
 *   const g = await guard();
 *   if (!g.ok) return g.res;
 */
export function buatGuardModul(cekPeran: CekPeran, fieldPesan: FieldPesan = 'message') {
  return async function guard(): Promise<HasilGuard> {
    const session = await getSession();
    if (!session) {
      return { ok: false, res: tolak(fieldPesan, 'Unauthorized', 401) };
    }
    const row = await queryOne<{ app_access: string[] | null }>(
      sql`SELECT app_access FROM users WHERE id = ${session.userId} LIMIT 1`,
    );
    if (!cekPeran(session.role, row?.app_access ?? null)) {
      return { ok: false, res: tolak(fieldPesan, 'Akses ditolak', 403) };
    }
    return {
      ok: true,
      session: { userId: session.userId, username: session.username, role: session.role },
    };
  };
}
