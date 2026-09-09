
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { sql, queryOne } from '@/lib/data/db';
import { MODUL_APPS, bolehMasukModul } from '@/lib/registry/apps';

// AC-1: kunci kartu /menu dijawab oleh aturan yang SAMA dengan guard halaman/API-nya,
// supaya kunci di menu tidak pernah beda arti dengan satpam di belakang.
//
// Fase B (Tahap 2): daftarnya hilang, diganti perulangan atas registry. Bentuk lama —
// tujuh pasangan `['blud', isBludRole]` yang harus diingat orang — persis yang membuat
// T-6 lahir: Dashboard punya `isDashboardRole`, punya halaman, punya API, tapi tidak
// pernah didaftarkan di sini, jadi kartunya terkunci untuk Kasubag & Kabag yang justru
// berhak. Penjaga yang daftarnya diketik terpisah hanya menjaga yang sudah diingat.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  if (session.role === 'SUPER_ADMIN' || session.role === 'ADMIN') {
    return NextResponse.json({ ok: true, app_access: null });
  }

  // O1: queryOne — null check + typed return value, no manual cast.
  const row = await queryOne<{ app_access: string[] | null }>(
    sql`SELECT app_access FROM users WHERE id = ${session.userId} LIMIT 1`
  );
  const granted = Array.isArray(row?.app_access) ? row.app_access : [];

  // Akses efektif = grant manual ∪ peran bawaan. Modul ber-`peranBawaan: 'SEMUA'`
  // (hari ini Usulan Kebutuhan) ikut lewat `bolehMasukModul`, tidak lagi disebut
  // namanya di sini — dulu ia satu-satunya kunci yang ditulis literal, dan kunci
  // literal adalah bentuk awal dari daftar tangan berikutnya.
  const effective = new Set<string>(granted);
  for (const m of MODUL_APPS) {
    if (bolehMasukModul(m.kunci, session.role, granted)) effective.add(m.kunci);
  }

  return NextResponse.json({ ok: true, app_access: [...effective] });
}
