import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { BuktiCreateSchema, BuktiDeleteSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { tambahBukti, hapusBukti, BbaNotFoundError, BbaBuktiPenuhError, BbaBerkasTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../_guard';

// Bukti dukung ditulis per aksi, BUKAN lewat Simpan item (CONCEPT-bba-perencanaan §4.2):
// menunda sampai Simpan meninggalkan berkas Drive yatim tiap kali modal dibatalkan.
// Tidak menaikkan `version` item → tidak memicu 409 palsu pada orang yang sedang menyunting item.
// Balasan membawa daftar bukti terbaru supaya modal tidak perlu memuat ulang.

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'bukti', 60); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = BuktiCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const { canonical_id, bukti } = await tambahBukti(parsed.data, g.session.userId);
    await writeAuditLog({ req, eventType: 'BBA_BUKTI_ADD', userId: g.session.userId, username: g.session.username, detail: `BBA bukti ${parsed.data.jenis} "${parsed.data.nama.slice(0, 80)}" → ${canonical_id}${parsed.data.file_id ? ` berkas=${parsed.data.file_id}` : ''}` });
    return NextResponse.json({ ok: true, bukti });
  } catch (err) {
    if (err instanceof BbaNotFoundError)           return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    if (err instanceof BbaBuktiPenuhError)         return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaBerkasTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'bukti', 60); if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const parsed = BuktiDeleteSchema.safeParse({ id: searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  const hasil = await hapusBukti(parsed.data.id);
  if (!hasil) return NextResponse.json({ ok: false, message: 'Bukti tidak ditemukan — mungkin sudah dihapus orang lain.' }, { status: 404 });
  await writeAuditLog({ req, eventType: 'BBA_BUKTI_DELETE', userId: g.session.userId, username: g.session.username, detail: `BBA lepas bukti "${hasil.nama.slice(0, 80)}" dari ${hasil.canonical_id} (berkas Drive tetap)` });
  return NextResponse.json({ ok: true, bukti: hasil.bukti });
}
