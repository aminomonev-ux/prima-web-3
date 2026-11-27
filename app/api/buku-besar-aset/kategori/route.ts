import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  KategoriPostSchema, JenisKategoriUpdateSchema, KategoriDeleteSchema, RekeningBludQuerySchema, bbaRateLimit,
} from '@/lib/data/buku-besar-aset-schemas';
import {
  listKategoriLengkap, createKategoriInduk, deleteKategoriInduk, createKelompokKib, deleteKelompokKib,
  createJenisKategori, updateJenisKategori, deleteJenisKategori, cariRekeningBlud,
  BbaKategoriTidakDikenalError, BbaKategoriDipakaiError, BbaKategoriKembarError,
} from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../_guard';

export const dynamic = 'force-dynamic';

// Master Kategori 2 tingkat (docs/konsep/bba/CONCEPT-bba-master-kategori.md).
//   GET              → { induk, jenis, kelompok_kib } — pemilih kategori di Rencana/Pengadaan/Penawaran/Barang (izin LIHAT)
//   GET ?rekening=q  → cari Master Akun + Kode Besar BLUD (hanya penyunting Master: daftarnya cuma dipakai saat menambah jenis)
function galat(err: unknown): NextResponse | null {
  if (err instanceof BbaKategoriKembarError) return NextResponse.json({ ok: false, code: 'KEMBAR', message: err.message }, { status: 409 });
  if (err instanceof BbaKategoriDipakaiError) return NextResponse.json({ ok: false, code: 'DIPAKAI', message: err.message }, { status: 409 });
  if (err instanceof BbaKategoriTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return NextResponse.json({ ok: false, code: 'KEMBAR', message: 'Nama itu sudah ada di Master Kategori.' }, { status: 409 });
  return null;
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  if (sp.has('rekening')) {
    const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
    const limited = await bbaRateLimit(g.session.userId, 'rekening', 120); if (limited) return limited;
    const p = RekeningBludQuerySchema.safeParse({ q: sp.get('rekening') ?? '' });
    if (!p.success) return NextResponse.json({ ok: false, message: 'Kata kunci tidak valid' }, { status: 400 });
    return NextResponse.json({ ok: true, data: await cariRekeningBlud(p.data.q) });
  }
  return NextResponse.json({ ok: true, ...(await listKategoriLengkap()) });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'kategori', 30); if (limited) return limited;
  const parsed = KategoriPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  try {
    if (d.aksi === 'induk') {
      const r = await createKategoriInduk(d.nama);
      await writeAuditLog({ req, eventType: 'BBA_KATEGORI_ADD', userId: g.session.userId, username: g.session.username, detail: `BBA kategori induk add id=${r.id} "${r.nama}"` });
      return NextResponse.json({ ok: true, ...r });
    }
    if (d.aksi === 'kelompok_kib') {
      const r = await createKelompokKib(d.nama);
      await writeAuditLog({ req, eventType: 'BBA_KATEGORI_ADD', userId: g.session.userId, username: g.session.username, detail: `BBA kelompok KIB add id=${r.id} "${r.nama}"` });
      return NextResponse.json({ ok: true, ...r });
    }
    const r = await createJenisKategori(d);
    await writeAuditLog({ req, eventType: 'BBA_KATEGORI_ADD', userId: g.session.userId, username: g.session.username,
      detail: `BBA jenis kategori add id=${r.id} "${r.nama}" induk="${r.kategori}" kode=${r.kode_rekening ?? '-'} kib=${r.kelompok_kib ?? '-'}` });
    return NextResponse.json({ ok: true, data: r });
  } catch (err) {
    const res = galat(err); if (res) return res;
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'kategori', 30); if (limited) return limited;
  const parsed = JenisKategoriUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const r = await updateJenisKategori(parsed.data);
    if (!r) return NextResponse.json({ ok: false, message: 'Jenis kategori tidak ditemukan.' }, { status: 404 });
    await writeAuditLog({ req, eventType: 'BBA_KATEGORI_UPDATE', userId: g.session.userId, username: g.session.username,
      detail: `BBA jenis kategori update id=${r.id} "${r.nama}" induk="${r.kategori}" kode=${r.kode_rekening ?? '-'} kib=${r.kelompok_kib ?? '-'}` });
    return NextResponse.json({ ok: true, data: r });
  } catch (err) {
    const res = galat(err); if (res) return res;
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'kategori', 30); if (limited) return limited;
  const sp = new URL(req.url).searchParams;
  const parsed = KategoriDeleteSchema.safeParse({ id: sp.get('id') ?? undefined, aksi: sp.get('aksi') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid' }, { status: 400 });
  const { id, aksi } = parsed.data;
  try {
    const ok = aksi === 'induk' ? await deleteKategoriInduk(id)
      : aksi === 'kelompok_kib' ? await deleteKelompokKib(id)
      : await deleteJenisKategori(id);
    if (!ok) return NextResponse.json({ ok: false, message: 'Data tidak ditemukan' }, { status: 404 });
    await writeAuditLog({ req, eventType: 'BBA_KATEGORI_DELETE', userId: g.session.userId, username: g.session.username, detail: `BBA kategori delete ${aksi} id=${id}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = galat(err); if (res) return res;
    throw err;
  }
}
