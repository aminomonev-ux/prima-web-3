import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { bacaWorkbookKib, type HasilBacaKib } from '@/lib/bba/kib-baca';
import { pratinjauImpor, simpanImpor, ImporBasiError } from '@/lib/data/bba-aset';
import { PasanganImporSchema } from '@/lib/data/bba-aset-schemas';
import type { PasanganImpor } from '@/lib/bba/aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// Impor KIB dari ekspor sistem aset provinsi (docs/CONCEPT-bba-buku-aset.md §7.1, §16, §23.1).
//   ?step=pratinjau — membaca & membandingkan dengan buku aset, TIDAK menulis apa pun.
//   ?step=simpan    — berkas yang SAMA diunggah ulang; server membaca ulang lalu menulis dalam satu
//                     transaksi. Baris tidak pernah dikirim balik dari layar, jadi yang tersimpan
//                     selalu isi berkasnya, bukan salinan yang bisa disunting di tengah jalan.
//                     Yang dikirim layar hanya pilihan pasangan nomor ({aset_id, kunci}).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAKS_UKURAN = 15 * 1024 * 1024;
const MIME_XLSX = ['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

/** L38/G22 — percaya magic-number, bukan `file.type` kiriman klien. */
async function endusMime(buf: Buffer): Promise<string | null> {
  const mod = await import('file-type');
  return (await mod.fileTypeFromBuffer(buf))?.mime ?? null;
}

const tolak = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const step = new URL(req.url).searchParams.get('step');
  if (step !== 'pratinjau' && step !== 'simpan') return tolak('Langkah impor tidak dikenali. Muat ulang halaman, lalu ulangi.');
  const limited = await bbaRateLimit(g.session.userId, `aset-impor-${step}`, step === 'simpan' ? 5 : 20); if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const berkas = form?.get('file');
  if (!(berkas instanceof File)) return tolak('Pilih berkas Excel ekspor KIB.');
  if (berkas.size > MAKS_UKURAN) return tolak(`Berkas lebih dari ${MAKS_UKURAN / 1024 / 1024} MB.`);
  const buf = Buffer.from(await berkas.arrayBuffer());
  if (!MIME_XLSX.includes((await endusMime(buf)) ?? '')) return tolak('Berkas harus Excel .xlsx (ekspor KIB sistem provinsi).');

  let hasil: HasilBacaKib;
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    hasil = bacaWorkbookKib(wb);
  } catch {
    return tolak('Berkas tidak bisa dibaca sebagai Excel. Simpan ulang dari Excel sebagai .xlsx, lalu coba lagi.');
  }
  const nama = berkas.name.slice(0, 120);
  const ringkasBaca = { lembar: hasil.lembar, peringatan: hasil.peringatan.slice(0, 100), kop: hasil.kop, jumlah: hasil.aset.length };
  if (hasil.masalah.length) {
    return NextResponse.json({ ok: false, code: 'BERKAS_BERMASALAH', message: 'Berkas belum bisa diimpor.', masalah: hasil.masalah.slice(0, 50), ...ringkasBaca }, { status: 422 });
  }

  if (step === 'pratinjau') return NextResponse.json({ ok: true, ...ringkasBaca, rencana: await pratinjauImpor(hasil) });

  let pasangan: PasanganImpor[] = [];
  const mentah = form?.get('pasangan');
  if (typeof mentah === 'string' && mentah) {
    let isi: unknown = null;
    try { isi = JSON.parse(mentah); } catch { /* ditolak Zod di bawah */ }
    const p = PasanganImporSchema.safeParse(isi);
    if (!p.success) return tolak('Pilihan pasangan nomor tidak valid: ' + p.error.issues[0].message);
    pasangan = p.data;
  }
  let tersimpan;
  try {
    tersimpan = await simpanImpor(hasil, g.session.userId, nama, pasangan);
  } catch (err) {
    if (err instanceof ImporBasiError) return NextResponse.json({ ok: false, code: 'PRATINJAU_BASI', message: err.message, masalah: err.alasan.slice(0, 50) }, { status: 409 });
    throw err;
  }
  await writeAuditLog({
    req, eventType: 'BBA_ASET_IMPOR', userId: g.session.userId, username: g.session.username,
    detail: `BBA impor KIB "${nama}" ${hasil.lembar.map(l => `${l.nama}:${l.jumlah}`).join(' ')} → baru=${tersimpan.baru} cocok=${tersimpan.cocok} dipasangkan=${tersimpan.dipasangkan} berubah=${tersimpan.berubah} sama=${tersimpan.sama} tidak_di_berkas=${tersimpan.tidakDiBerkas}`,
  });
  return NextResponse.json({ ok: true, ...ringkasBaca, tersimpan });
}
