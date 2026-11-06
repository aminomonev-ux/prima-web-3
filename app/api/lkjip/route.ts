import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { DokumenQuerySchema, DokumenCreateSchema, DokumenDeleteSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import { listDokumen, createDokumen, hapusDokumen } from '@/lib/lkjip/data';
import { guard } from './_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { searchParams } = new URL(req.url);
  const parsed = DokumenQuerySchema.safeParse({
    tahun:  searchParams.get('tahun')  ?? undefined,
    status: searchParams.get('status') ?? undefined,
    q:      searchParams.get('q')      ?? undefined,
    page:   searchParams.get('page')   ?? undefined,
    limit:  searchParams.get('limit')  ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Parameter tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const result = await listDokumen(parsed.data);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'doc-create', 20); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = DokumenCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { id, canonical_id } = await createDokumen(parsed.data.tahun, parsed.data.judul, g.session.userId, parsed.data.template);
  await writeAuditLog({ req, eventType: 'LKJIP_CREATE', userId: g.session.userId, username: g.session.username, detail: `LKJIP create ${canonical_id} tahun ${parsed.data.tahun} (${parsed.data.template})` });
  return NextResponse.json({ ok: true, id, canonical_id });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'doc-delete', 20); if (limited) return limited;
  const { searchParams } = new URL(req.url);
  // Alasan lewat badan permintaan, bukan alamat: alamat ikut tercatat di log Nginx/PM2, dan isinya kalimat bebas.
  const badan = await req.json().catch(() => null) as { alasan?: unknown; arsip_diunduh?: unknown } | null;
  const parsed = DokumenDeleteSchema.safeParse({ id: searchParams.get('id') ?? undefined, alasan: badan?.alasan, arsip_diunduh: badan?.arsip_diunduh });
  if (!parsed.success) {
    const salah = parsed.error.issues[0];
    return NextResponse.json({ ok: false, msg: salah.path[0] === 'id' ? 'ID tidak valid' : salah.message }, { status: 400 });
  }
  const alasan = parsed.data.alasan ?? '';
  const hasil = await hapusDokumen(parsed.data.id, { alasan, arsipDiunduh: parsed.data.arsip_diunduh });
  if (hasil.jenis === 'TIDAK_ADA') return NextResponse.json({ ok: false, msg: 'Dokumen tidak ditemukan' }, { status: 404 });
  if (hasil.jenis === 'DITOLAK') return NextResponse.json({ ok: false, code: hasil.tolak.code, msg: hasil.tolak.msg }, { status: 400 });
  const doc = hasil.dokumen;
  // Jejak harus bisa dibaca SETELAH barisnya tiada: `id=165` saja menjadi angka tanpa arti
  // begitu dokumennya terhapus, dan judulnya tidak bisa dicari lagi di mana pun. Karena itu
  // kode dokumen dan judul ikut ditulis untuk semua penghapusan, bukan hanya yang FINAL.
  const jejakFinal = doc.status === 'FINAL' ? ` · FINAL · arsip Word dinyatakan sudah diunduh · alasan: ${alasan}` : '';
  const detail = `LKJIP delete id=${doc.id} ${doc.canonical_id} "${doc.judul.slice(0, 80)}"${jejakFinal}`;
  await writeAuditLog({ req, eventType: 'LKJIP_DELETE', userId: g.session.userId, username: g.session.username, detail });
  return NextResponse.json({ ok: true });
}
