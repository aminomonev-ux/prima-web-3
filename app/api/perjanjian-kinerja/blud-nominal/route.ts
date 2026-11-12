// app/api/perjanjian-kinerja/blud-nominal/route.ts
// Nominal BLUD untuk lampiran anggaran Form PK — dihitung langsung dari DPA/Pergeseran versi
// yang dipilih. Aturan: lib/data/pk-blud-nominal.ts. Konsep: docs/CONCEPT-pk-nominal-blud-langsung.md.
//
// GET ?mode=versi&tahun=2026                                        → { ok, versi: VersiBlud[] }
// GET ?unit=Kabid%20Pelayanan&tahun=2026&sumber=pergeseran&versi=2026-11-10 → { ok, hasil }

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { pkRateLimit, BludNominalQuerySchema, BludVersiQuerySchema } from '@/lib/data/pk-schemas';
import { bolehLihatSalahSatu, forbidden, pkMati } from '../_guard';
import { nominalBludUnit, pilihanVersiBlud } from '@/lib/data/pk-blud-nominal';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;
  // Angka BLUD untuk lampiran anggaran Form PK. Sengaja TIDAK ikut memeriksa izin menu
  // BLUD: menambah syarat itu terdengar lebih ketat, tapi ia mengubah SIAPA yang bisa
  // menyusun PK — keputusan proses kerja, bukan keputusan teknis. Dicatat di
  // docs/CONCEPT-pk-peran.md §6 supaya tidak terbaca sebagai kelalaian. Yang dipulangkan
  // hanya total per label PJ + daftar versi, bukan baris anggaran.
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['form', 'riwayat']))) return forbidden();

  const limited = await pkRateLimit(session.userId, 'blud-nominal', 30);
  if (limited) return limited;

  const sp = new URL(req.url).searchParams;
  const ambil = (k: string) => sp.get(k) ?? undefined;
  const salah = (m: string) => NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + m }, { status: 400 });

  if (sp.get('mode') === 'versi') {
    const q = BludVersiQuerySchema.safeParse({ tahun: ambil('tahun') });
    if (!q.success) return salah(q.error.issues[0].message);
    return NextResponse.json({ ok: true, versi: await pilihanVersiBlud(q.data.tahun) });
  }

  const q = BludNominalQuerySchema.safeParse({
    unit: ambil('unit'), tahun: ambil('tahun'), sumber: ambil('sumber'), versi: ambil('versi'),
  });
  if (!q.success) return salah(q.error.issues[0].message);
  const hasil = await nominalBludUnit(q.data.unit, q.data.tahun, q.data.sumber, q.data.versi);
  return NextResponse.json({ ok: true, hasil });
}
