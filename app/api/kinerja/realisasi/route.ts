import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getRealisasiRows, getRealisasiHydrated, saveRealisasiBatch, getKinerjaVersion, penyimpanTerakhir, KinerjaVersionConflictError, KinerjaReplaceSafetyError } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import type { RealRow } from '@/lib/data/kinerja';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema, RealisasiBodySchema, jejakPulihkan } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../_guard';
import { kalimatRingkasan } from '@/lib/kinerja/banding-realisasi';
import { KinerjaBulanTertutupError } from '@/lib/kinerja/tutup-bulan';
import { daftarBulanTertutup } from '@/lib/kinerja/tutup-bulan-data';
import { sql } from '@/lib/data/db';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan PUT.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  // C-WORK-1/2 (Tahap 12): validate tahun + sumber via Zod
  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({
    tahun:      searchParams.get('tahun')      ?? undefined,
    sumber:     searchParams.get('sumber')     ?? undefined,
    versi_tipe: searchParams.get('versi_tipe') ?? undefined,
    versi_seq:  searchParams.get('versi_seq')  ?? undefined,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun  = q.data.tahun ?? new Date().getFullYear().toString();
  const sumber = q.data.sumber ?? 'GAJI';

  // Refactor Versi (Checkpoint A #12): kalau client kirim versi_tipe → pakai hydrated path
  // (compute pagu/target/akum/deviasi server-side dari SSK versi aktif). Backwards-compat:
  // tanpa versi_tipe, default MURNI seq=0 — sama persis dgn data lama.
  if (q.data.versi_tipe !== undefined || q.data.versi_seq !== undefined) {
    const versiTipe = q.data.versi_tipe ?? 'MURNI';
    const versiSeq  = q.data.versi_seq  ?? 0;
    // A9 + pemilih versi: `dinolkan` WAJIB ikut di cabang ini juga. Kalau tidak,
    // memilih versi yang habis dinol-kan di layar Cetak membuat spanduknya diam
    // — dan pagu Rp 0 tanpa keterangan itu yang A9 ada untuk mencegahnya. Ia
    // datang dari kueri yang SAMA dengan itemnya, bukan kueri COUNT tersendiri.
    const [{ rows, itemSsk, dinolkan }, version, tertutup] = await Promise.all([
      getRealisasiHydrated(tahun, sumber, versiTipe, versiSeq),
      getKinerjaVersion('kinerja_realisasi', `${tahun}:${sumber}`),
      // Satu balasan dengan barisnya: layar yang menampilkan angka bulan tertutup
      // tidak boleh mendapat jawaban "tertutup atau tidak" dari pemuatan lain (L88).
      daftarBulanTertutup(sql, tahun, sumber),
    ]);
    // A8: `itemSsk` ikut di KEDUA cabang. Satu bentuk balasan, bukan dua yang
    // berbeda tergantung ada-tidaknya parameter versi — beda bentuk yang tidak
    // disengaja itu yang membuat `sumber` di RealRow jadi jebakan (bentuk T1).
    return NextResponse.json({ ok: true, rows, itemSsk, versi: { tipe: versiTipe, seq: versiSeq, dinolkan }, version, tertutup });
  }

  // Tanpa parameter versi → versi AKTIF (bukan lagi MURNI-0 paksa). Versinya ikut
  // dipulangkan supaya layar bisa menuliskan angka ini mengacu ke mana.
  const { rows, versi, itemSsk } = await getRealisasiRows(tahun, sumber);
  return NextResponse.json({ ok: true, rows, itemSsk, versi });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'save-realisasi', 30); if (limited) return limited;

  // C-SEC-2 (Tahap 12): Zod validation untuk body
  const raw = await req.json().catch(() => null);
  const parsed = RealisasiBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, sumber, rows, expected_version, force, asal_pulihkan } = parsed.data;

  // Cast ke type yang ditunggu saveRealisasiBatch — Zod schema passthrough sudah handle extra fields
  let hasil;
  try {
    hasil = await saveRealisasiBatch(tahun, sumber, rows as Omit<RealRow, 'id' | 'tahun' | 'sumber'>[], session.userId, expected_version, force ?? false);
  } catch (err) {
    // V3-6: optimistic-lock conflict → 409 dengan code agar client bisa auto-reload.
    if (err instanceof KinerjaVersionConflictError) {
      // Siapa & jam berapa: layar memasang ketikan di atas isi terbaru dan menyebut
      // pemicunya — 'diubah pengguna lain' tanpa nama tidak bisa ditindaklanjuti.
      const { oleh, pada } = await penyimpanTerakhir('kinerja_realisasi', `${tahun}:${sumber}`);
      return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message, actual: err.actual, oleh, pada }, { status: 409 });
    }
    // Pagar simpan: klien menerjemahkannya jadi konfirmasi lalu mengulang dengan force.
    if (err instanceof KinerjaReplaceSafetyError) {
      return NextResponse.json(
        { ok: false, code: 'PENURUNAN_DRASTIS', message: err.message, existing: err.existing, incoming: err.incoming },
        { status: 409 },
      );
    }
    // Pagar, bukan peringatan — dan sengaja tidak bisa ditembus `force`.
    if (err instanceof KinerjaBulanTertutupError) {
      return NextResponse.json(
        { ok: false, code: 'BULAN_TERTUTUP', message: err.message, pelanggaran: err.pelanggaran.slice(0, 50) },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : 'Gagal menyimpan';
    return NextResponse.json({ ok: false, message: msg }, { status: 409 });
  }

  const version = await getKinerjaVersion('kinerja_realisasi', `${tahun}:${sumber}`);
  // Isi identik = tidak ada yang ditulis, jadi tidak ada yang perlu dicatat.
  if (!hasil.tidakBerubah) {
    await writeAuditLog({
      req,
      eventType: 'KINERJA_SAVE_REALISASI',
      userId:    session.userId,
      username:  session.username,
      // Yang benar-benar berubah, bukan "180 baris": Simpan selalu mengirim setahun.
      detail:    `Simpan realisasi ${sumber} tahun ${tahun}: ${kalimatRingkasan(hasil.perBulan, 12)} `
        + `(${rows.length} baris dikirim)` + jejakPulihkan(asal_pulihkan),
    });
  }

  return NextResponse.json({ ok: true, saved: rows.length, version,
    tidak_berubah: hasil.tidakBerubah, ringkasan: hasil.perBulan });
}
