import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { petaIzinBba } from '@/lib/bba/izin-server';
import { LEMBAR_BALIK, type LembarBalik } from '@/lib/bba/laporan-excel';
import {
  menungguTinjauan, pratinjauDriveBalik, terapkanDriveBalik, abaikanDriveBalik, TinjauanDriveError, IZIN_LEMBAR,
  menungguPerBaris, tetapkanNilaiPrima,
} from '@/lib/data/bba-drive-balik';
import { guard, tolakKecualiEdit } from '../_guard';

// Perubahan laporan BBA di Google Drive dibawa balik ke PRIMA (docs/konsep/bba/CONCEPT-bba-drive-balik.md).
//   GET                 — berkas yang menunggu ditinjau (spanduk) — semua pemegang BBA, baca DB saja.
//   POST ?step=pratinjau — baca revisi Drive + gabung tiga arah; TIDAK menulis.
//   POST ?step=terapkan  — pilihan pengguna; server menghitung ulang dari revisi yang sama, lalu jalur simpan tiap menu.
//   POST ?step=abaikan   — lepas tahanan tanpa menulis apa pun.
// Izin: pratinjau/abaikan = EDIT Rencana ATAU Pengadaan; terapkan menilai izin PER LEMBAR (`IZIN_LEMBAR`) di data layer.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Lembar = z.enum(LEMBAR_BALIK as unknown as [string, ...string[]]);
const Kunci = z.string().regex(/^rencana:\d{4}$/, 'Berkas tidak dikenal');
const Peta = z.record(Lembar, z.record(z.string().max(40), z.number().int().min(0).max(60).nullable())).nullish();
const PratinjauSchema = z.object({ kunci: Kunci, peta: Peta });
const TahunSchema = z.coerce.number().int().min(2000).max(2100).optional();
const TetapSchema = z.object({ kunci: Kunci, revisi: z.string().min(1).max(255), lembar: Lembar, id: z.number().int().positive(), kolom: z.string().min(1).max(40) });
const AbaikanSchema = z.object({ kunci: Kunci, revisi: z.string().min(1).max(255) });
const TerapkanSchema = z.object({
  kunci: Kunci, revisi: z.string().min(1).max(255), peta: Peta,
  ubah: z.array(z.object({ lembar: Lembar, id: z.number().int().positive(), versi: z.number().int().min(0).nullable(), sel: z.record(z.string().max(40), z.enum(['drive', 'prima'])) })).max(3000),
  baru: z.array(z.object({ lembar: Lembar, baris: z.number().int().positive() })).max(3000),
  barangBaru: z.array(z.string().trim().min(1).max(160)).max(300),
  barangPeta: z.record(z.string().max(160), z.string().max(160)),
});

const galat = (err: unknown) => {
  if (err instanceof TinjauanDriveError) {
    const status = err.code === 'BENTURAN_BELUM_DIPILIH' || err.code === 'BERKAS_RUSAK' ? 400 : 409;
    return NextResponse.json({ ok: false, code: err.code, message: err.message }, { status });
  }
  throw err;
};

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const izin = await petaIzinBba(g.session.userId, g.session.role);
  const sp = new URL(req.url).searchParams;
  // ?step=menunggu[&tahun=] — sel yang diubah di Drive & masih menunggu, per baris (CONCEPT-bba-drive-dua-arah U2).
  if (sp.get('step') === 'menunggu') {
    const t = TahunSchema.safeParse(sp.get('tahun') ?? undefined);
    if (!t.success) return NextResponse.json({ ok: false, message: 'Tahun tidak valid.' }, { status: 400 });
    return NextResponse.json({ ok: true, berkas: await menungguPerBaris(t.data),
      bolehLembar: Object.fromEntries(LEMBAR_BALIK.map(l => [l, IZIN_LEMBAR[l].some(m => izin[m] === 'EDIT')])) });
  }
  return NextResponse.json({ ok: true, menunggu: await menungguTinjauan(),
    bolehTinjau: izin.rencana === 'EDIT' || izin.pengadaan === 'EDIT' });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  const step = new URL(req.url).searchParams.get('step');
  if (step !== 'pratinjau' && step !== 'terapkan' && step !== 'abaikan' && step !== 'tetap') return NextResponse.json({ ok: false, message: 'Langkah tidak dikenali. Muat ulang halaman.' }, { status: 400 });
  const limited = await bbaRateLimit(g.session.userId, `drive-balik-${step}`, step === 'pratinjau' || step === 'tetap' ? 30 : 10); if (limited) return limited;
  const body = await req.json().catch(() => null);
  const izin = await petaIzinBba(g.session.userId, g.session.role);
  const bolehLembar = Object.fromEntries(LEMBAR_BALIK.map(l => [l, IZIN_LEMBAR[l].some(m => izin[m] === 'EDIT')]));
  try {
    if (step === 'tetap') {
      const p = TetapSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
      const l = p.data.lembar as LembarBalik;
      // Izin lembar = izin menu yang memiliki kolom itu (sama dengan Terapkan).
      if (!bolehLembar[l]) return NextResponse.json({ ok: false, message: 'Izin Anda di bagian ini hanya melihat.' }, { status: 403 });
      const h = await tetapkanNilaiPrima(p.data.kunci, p.data.revisi, l, p.data.id, p.data.kolom);
      await writeAuditLog({ req, eventType: 'BBA_DRIVE_BALIK', userId: g.session.userId, username: g.session.username,
        detail: `BBA perubahan Drive DITOLAK DI WEB (tetap nilai PRIMA) — ${p.data.kunci}, ${l} #${p.data.id} ${h.judul}: isi Drive "${String(h.drive ?? '(kosong)').slice(0, 120)}"` });
      return NextResponse.json({ ok: true });
    }
    if (step === 'pratinjau') {
      const p = PratinjauSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
      return NextResponse.json({ ok: true, pratinjau: await pratinjauDriveBalik(p.data.kunci, p.data.peta), bolehLembar });
    }
    if (step === 'abaikan') {
      const p = AbaikanSchema.safeParse(body);
      if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
      const luar = await abaikanDriveBalik(p.data.kunci, p.data.revisi);
      await writeAuditLog({ req, eventType: 'BBA_DRIVE_BALIK', userId: g.session.userId, username: g.session.username,
        detail: `BBA perubahan Drive DIABAIKAN — ${p.data.kunci}, revisi ${luar.revisi.slice(-12)} oleh "${(luar.oleh ?? '?').slice(0, 80)}" ${luar.pada ?? ''}` });
      return NextResponse.json({ ok: true });
    }
    const p = TerapkanSchema.safeParse(body);
    if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
    const h = await terapkanDriveBalik(p.data as Parameters<typeof terapkanDriveBalik>[0], g.session.userId, izin);
    await writeAuditLog({ req, eventType: 'BBA_DRIVE_BALIK', userId: g.session.userId, username: g.session.username,
      detail: `BBA perubahan Drive DITERAPKAN — ${p.data.kunci}, revisi ${h.pratinjau.luar.revisi.slice(-12)} oleh "${(h.pratinjau.luar.oleh ?? '?').slice(0, 80)}" ${h.pratinjau.luar.pada ?? ''}; `
        + `${h.diterapkan.length} diterapkan: ${h.diterapkan.join(' | ')}; ${h.ditolak.length} ditolak: ${h.ditolak.join(' | ')}`.slice(0, 3800) });
    return NextResponse.json({ ok: true, diterapkan: h.diterapkan, ditolak: h.ditolak });
  } catch (err) { return galat(err); }
}
