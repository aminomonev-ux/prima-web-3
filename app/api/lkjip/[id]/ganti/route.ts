// Cari & Ganti seluruh dokumen (konsep daftar-word §11). Mencari di klien; menulis di sini, satu transaksi.
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { GantiTeksSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import { gantiTeksDokumen, getDokumenDetail, LkjipFinalError, LkjipNotFoundError } from '@/lib/lkjip/data';
import { saveVersi } from '@/lib/lkjip/versi';
import { GantiTerlaluPanjangError, gantiDiDokumen } from '@/lib/lkjip/cari-ganti';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'ganti-teks', 60); if (limited) return limited;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const parsed = GantiTeksSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { kata, dengan, hurufBesar, seluruhKata, sasaran } = parsed.data;
  const opsi = { kata, hurufBesar, seluruhKata };
  try {
    const detail = await getDokumenDetail(id);
    if (!detail) throw new LkjipNotFoundError();
    if (detail.status === 'FINAL') throw new LkjipFinalError();
    // Tak ada Undo lintas blok: Ganti semua memotret dulu ke Riwayat. Sebelum transaksi, sebab memotret membaca
    // seluruh dokumen dan tidak perlu menahan kunci selama itu.
    let versi_no: number | null = null;
    if (!parsed.data.sasaran) {
      const pra = gantiDiDokumen({ tree: detail.tree, kataPengantarHtml: detail.style_config.kataPengantarHtml ?? '' }, opsi, dengan);
      if (!pra.jumlah) return NextResponse.json({ ok: true, jumlah: 0, ditahan: pra.ditahan, versi_no: null });
      versi_no = (await saveVersi(id, `Sebelum ganti "${kata.slice(0, 60)}"`, g.session.userId)).versi_no;
    }
    const hasil = await gantiTeksDokumen(id, opsi, dengan, sasaran, g.session.userId);
    if (hasil.jumlah) {
      await writeAuditLog({
        req, eventType: 'LKJIP_GANTI_TEKS', userId: g.session.userId, username: g.session.username,
        detail: `LKJIP ganti teks id=${id}: "${kata.slice(0, 80)}" → "${dengan.slice(0, 80)}" · ${hasil.jumlah} diganti, ${hasil.ditahan} ditahan${sasaran ? ' (satu kecocokan)' : ''}${versi_no ? ` · foto versi ${versi_no}` : ''}`,
      });
    }
    return NextResponse.json({ ok: true, jumlah: hasil.jumlah, ditahan: hasil.ditahan, versi_no });
  } catch (err) {
    if (err instanceof GantiTerlaluPanjangError) return NextResponse.json({ ok: false, msg: err.message }, { status: 400 });
    if (err instanceof ZodError)            return NextResponse.json({ ok: false, msg: 'Hasil penggantian tidak valid: ' + err.issues[0].message + '. Tidak ada yang diubah.' }, { status: 400 });
    if (err instanceof LkjipFinalError)     return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });
    if (err instanceof LkjipNotFoundError)  return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
    throw err;
  }
}
