import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { AsetDaftarSchema, AsetIdSchema, AsetIdsSchema, AsetOpnameSchema, UbahAsetSchema } from '@/lib/data/bba-aset-schemas';
import { daftarAset, detailAset, asetMenurutId, asetOpname, batasCekSekarang, ubahAset, AsetVersiError, AsetTidakAdaError } from '@/lib/data/bba-aset';
import { BbaBarangTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit, tolakKecualiLihat } from '../_guard';

// Buku Aset (docs/CONCEPT-bba-buku-aset.md §14): GET daftar berkelompok · ?id= kartu aset ·
// ?ids= register sebuah kelompok · ?ruang= / ?gedung= register untuk opname (beserta angka kuncinya).
// PATCH = tambahan PRIMA di kartu aset (nama sehari-hari, barang).
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'aset'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  if (sp.has('id')) {
    const p = AsetIdSchema.safeParse({ id: sp.get('id') });
    if (!p.success) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
    const [d, batas] = await Promise.all([detailAset(p.data.id), batasCekSekarang()]);
    if (!d) return NextResponse.json({ ok: false, message: 'Aset tidak ditemukan.' }, { status: 404 });
    return NextResponse.json({ ok: true, ...d, batas });
  }
  if (sp.has('ids')) {
    const p = AsetIdsSchema.safeParse({ ids: sp.get('ids') });
    if (!p.success) return NextResponse.json({ ok: false, message: 'Daftar register tidak valid' }, { status: 400 });
    return NextResponse.json({ ok: true, rows: await asetMenurutId(p.data.ids) });
  }
  if (sp.has('ruang') || sp.has('gedung')) {
    const p = AsetOpnameSchema.safeParse(sp.has('ruang') ? { ruang: sp.get('ruang') } : { gedung: sp.get('gedung') });
    if (!p.success) return NextResponse.json({ ok: false, message: 'Ruangan/gedung tidak valid' }, { status: 400 });
    const [rows, batas] = await Promise.all([asetOpname(p.data), batasCekSekarang()]);
    return NextResponse.json({ ok: true, rows, batas });
  }
  const p = AsetDaftarSchema.safeParse(Object.fromEntries([...sp].filter(([, v]) => v !== '')));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Saringan tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await daftarAset(p.data)) });
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-ubah', 60); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const p = UbahAsetSchema.safeParse(raw);
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    await ubahAset(p.data, g.session.userId);
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    if (err instanceof BbaBarangTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
  const ket = [p.data.nama !== undefined ? 'nama' : '', p.data.barang_baru ? `barang_baru="${p.data.barang_baru.slice(0, 40)}"` : p.data.barang_id !== undefined ? `barang_id=${p.data.barang_id}` : ''].filter(Boolean).join(' ');
  await writeAuditLog({ req, eventType: 'BBA_ASET_UBAH', userId: g.session.userId, username: g.session.username, detail: `BBA aset id=${p.data.id} ${ket}` });
  return NextResponse.json({ ok: true });
}
