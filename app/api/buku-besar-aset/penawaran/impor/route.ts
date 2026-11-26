import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { KepalaPenawaranSchema } from '@/lib/data/bba-penawaran-schemas';
import { bacaPenawaranWorkbook, tulisTemplatPenawaran, type HasilBacaPenawaran } from '@/lib/bba/penawaran-impor';
import { kunciNamaBarang } from '@/lib/bba/barang';
import { listBarang, BbaBerkasTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { simpanPenawaran } from '@/lib/data/bba-penawaran';
import { guard, tolakKecualiEdit } from '../../_guard';

// Impor item penawaran dari Excel (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A.3) — pola impor KIB:
//   GET              — templat seragam kosong.
//   ?step=pratinjau  — membaca & mencocokkan nama barang ke Master, TIDAK menulis.
//   ?step=simpan     — berkas yang SAMA diunggah ulang + kepala surat; server membaca ulang lalu menulis satu surat.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAKS_UKURAN = 5 * 1024 * 1024;
const MIME_XLSX = ['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const tolak = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

/** L38/G22 — percaya magic-number, bukan `file.type` kiriman klien. */
async function endusMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  return (await mod.fileTypeFromBuffer(buf))?.mime ?? null;
}

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  tulisTemplatPenawaran(wb);
  const isi = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(isi, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="Templat Penawaran Rekanan.xlsx"',
  } });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  const step = new URL(req.url).searchParams.get('step');
  if (step !== 'pratinjau' && step !== 'simpan') return tolak('Langkah impor tidak dikenali. Muat ulang halaman, lalu ulangi.');
  const limited = await bbaRateLimit(g.session.userId, `penawaran-impor-${step}`, step === 'simpan' ? 10 : 30); if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const berkas = form?.get('file');
  if (!(berkas instanceof File)) return tolak('Pilih berkas Excel item penawaran.');
  if (berkas.size > MAKS_UKURAN) return tolak(`Berkas lebih dari ${MAKS_UKURAN / 1024 / 1024} MB.`);
  const buf = Buffer.from(await berkas.arrayBuffer());
  if (!MIME_XLSX.includes((await endusMime(buf)) ?? '')) return tolak('Berkas harus Excel .xlsx.');
  let hasil: HasilBacaPenawaran;
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    hasil = bacaPenawaranWorkbook(wb);
  } catch {
    return tolak('Berkas tidak bisa dibaca sebagai Excel. Simpan ulang dari Excel sebagai .xlsx, lalu coba lagi.');
  }
  if (hasil.masalah.length) return NextResponse.json({ ok: false, code: 'BERKAS_BERMASALAH', message: hasil.masalah.join(' '), masalah: hasil.masalah, dilewati: hasil.dilewati }, { status: 422 });

  // Nama di surat dicocokkan ke Master Barang tanpa beda huruf/spasi; yang tidak cocok = "belum ditautkan" (tidak dibuat otomatis).
  const master = new Map((await listBarang()).map(b => [kunciNamaBarang(b.nama), b]));
  const item = hasil.item.map(i => { const b = master.get(kunciNamaBarang(i.nama_barang)); return { ...i, barang_id: b?.id ?? null, barang_nama: b?.nama ?? null }; });
  if (step === 'pratinjau') return NextResponse.json({ ok: true, item, dilewati: hasil.dilewati });

  let kepala: unknown = null;
  try { kepala = JSON.parse(String(form?.get('kepala') ?? 'null')); } catch { /* ditolak Zod di bawah */ }
  const kp = KepalaPenawaranSchema.safeParse(kepala);
  if (!kp.success) return tolak('Kepala surat tidak valid: ' + kp.error.issues[0].message);
  try {
    const h = await simpanPenawaran({ kepala: kp.data, item: item.map(i => ({ barang_id: i.barang_id, nama_barang: i.nama_barang, merk_tipe: i.merk_tipe, spesifikasi: i.spesifikasi, satuan: i.satuan, harga_satuan: i.harga_satuan })) }, g.session.userId);
    await writeAuditLog({ req, eventType: 'BBA_PENAWARAN_IMPOR', userId: g.session.userId, username: g.session.username,
      detail: `BBA impor penawaran id=${h.id} rekanan="${kp.data.rekanan.slice(0, 80)}" ${h.item} item dari "${berkas.name.slice(0, 80)}"${hasil.dilewati.length ? `, ${hasil.dilewati.length} baris dilewati` : ''}` });
    return NextResponse.json({ ok: true, ...h, dilewati: hasil.dilewati });
  } catch (err) {
    if (err instanceof BbaBerkasTidakDikenalError) return tolak(err.message);
    throw err;
  }
}
