// app/api/kinerja/riwayat-simpan/route.ts
// Riwayat tiap klik Simpan SSK/Realisasi/Rekening — daftar & isi satu snapshot.
//
// BACA-SAJA. Memulihkan snapshot TIDAK terjadi di sini: isinya dipulangkan ke
// form, dan yang menuliskannya tetap PUT /api/kinerja/ssk|realisasi|rekening yang
// sudah ada. Itu sebabnya tidak ada handler PUT/POST/DELETE di berkas ini — dan
// sebabnya seluruh pagar simpan (gembok optimistik, pagarReplace, Zod, rate
// limit) berlaku otomatis tanpa ditulis ulang.
//
// Konsep: docs/CONCEPT-kinerja-riwayat-simpan.md §6

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { writeAuditLog } from '@/lib/security/auditlog';
import { getKinerjaVersion } from '@/lib/data/kinerja';
import {
  getRiwayatKinerja, getRiwayatKinerjaIsi,
  type JenisRiwayatKinerja, type LingkupRiwayat,
} from '@/lib/kinerja/riwayat-simpan';
import {
  isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, JenisRiwayatSchema,
} from '@/lib/data/kinerja-schemas';
import { kinerjaMati } from '../_guard';

export const dynamic = 'force-dynamic';

/**
 * Entitas & kunci gembok per jenis — SATU tempat, karena angka gembok yang
 * dipulangkan bersama snapshot harus milik kunci yang nanti benar-benar ditulis.
 * Rekening memang tidak punya gembok; `null` di situ bukan kelalaian.
 */
function kunciGembok(l: LingkupRiwayat): { entity: string; key: string } | null {
  if (l.jenis === 'SSK') {
    return { entity: 'kinerja_ssk', key: `${l.tahun}:${l.sumber}:${l.versiTipe ?? 'MURNI'}:${l.versiSeq ?? 0}` };
  }
  if (l.jenis === 'REALISASI') {
    return { entity: 'kinerja_realisasi', key: `${l.tahun}:${l.sumber}` };
  }
  return null;
}

// GET ?jenis=&tahun=&sumber=[&versi_tipe=&versi_seq=] → daftar snapshot (tanpa isi)
// GET ?id=                                            → satu snapshot + isi + angka gembok segar
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) {
    return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  }
  const limited = await kinerjaRateLimit(session.userId, 'view-riwayat', 60); if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get('id');

  try {
    if (idRaw) {
      const id = Number(idRaw);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json({ ok: false, message: 'Nomor riwayat tidak dikenali.' }, { status: 400 });
      }
      const data = await getRiwayatKinerjaIsi(id);
      if (!data) return NextResponse.json({ ok: false, message: 'Riwayat simpan itu sudah tidak ada.' }, { status: 404 });

      // Angka gembok dibaca SEKARANG, bukan diambil dari `versi_ke` snapshot.
      // Snapshot pagi membawa angka 1; mengirim angka itu saat Simpan sementara
      // kuncinya sudah di angka 3 membuat Simpan ditolak "diubah orang lain"
      // (L77). Ikut di balasan yang sama supaya klien tidak perlu menembak
      // endpoint kedua yang bisa kena rate limit lalu gagal dengan sebab palsu.
      const k = kunciGembok(data);
      const version = k ? await getKinerjaVersion(k.entity, k.key) : null;

      // Dicatat saat ISINYA diambil, bukan saat daftarnya dibuka: mengambil isi
      // berarti ada yang hendak memulihkannya. Simpan sesudahnya tetap tercatat
      // sendiri lewat KINERJA_SAVE_*.
      await writeAuditLog({
        req,
        eventType: 'KINERJA_RIWAYAT_PULIHKAN',
        userId:    session.userId,
        username:  session.username,
        detail:    `Ambil riwayat ${data.jenis} ${data.sumber} ${data.tahun} `
          + `(${data.disimpan_pada}, ${data.jumlah_baris} baris)`,
      });
      return NextResponse.json({ ok: true, data, version });
    }

    const jenis = JenisRiwayatSchema.safeParse(searchParams.get('jenis'));
    if (!jenis.success) {
      return NextResponse.json({ ok: false, message: 'Jenis riwayat harus SSK, REALISASI, atau REKENING.' }, { status: 400 });
    }
    const q = KinerjaQuerySchema.safeParse({
      tahun:      searchParams.get('tahun')      ?? undefined,
      sumber:     searchParams.get('sumber')     ?? undefined,
      versi_tipe: searchParams.get('versi_tipe') ?? undefined,
      versi_seq:  searchParams.get('versi_seq')  ?? undefined,
    });
    if (!q.success) {
      return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
    }

    const j: JenisRiwayatKinerja = jenis.data;
    // Versi hanya berlaku untuk SSK. Untuk jenis lain dipaksa null — kalau tidak,
    // klien yang mengirim `versi_tipe` nyasar akan mendapat daftar KOSONG
    // (`<=>` NULL vs 'MURNI' tidak cocok) dan mengira riwayatnya hilang.
    const data = await getRiwayatKinerja({
      jenis:     j,
      tahun:     q.data.tahun  ?? new Date().getFullYear().toString(),
      sumber:    q.data.sumber ?? 'GAJI',
      versiTipe: j === 'SSK' ? (q.data.versi_tipe ?? 'MURNI') : null,
      versiSeq:  j === 'SSK' ? (q.data.versi_seq  ?? 0)       : null,
    });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    console.error('[kinerja/riwayat-simpan] GET gagal:', e);
    return NextResponse.json({ ok: false, message: 'Riwayat simpan belum bisa dimuat. Coba lagi sebentar lagi.' }, { status: 500 });
  }
}
