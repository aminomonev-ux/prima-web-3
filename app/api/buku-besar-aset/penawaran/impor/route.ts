import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { KepalaPenawaranSchema, PenawaranSimpanSchema } from '@/lib/data/bba-penawaran-schemas';
import { bacaPenawaranGrid, tulisTemplatPenawaran, MAKS_LEMBAR_PENAWARAN } from '@/lib/bba/penawaran-impor';
import { bacaMatriksGrid, kunciSuratMatriks, type SuratMatriks } from '@/lib/bba/penawaran-matriks';
import { JENIS_SURAT, LABEL_PAJAK, LABEL_TINDAK_LANJUT, STATUS_PAJAK, STATUS_TINDAK_LANJUT } from '@/lib/bba/penawaran';
import { kunciNamaBarang } from '@/lib/bba/barang';
import { polosSelExcel } from '@/lib/shared/excel-sel';
import type { MasterKategoriData } from '@/lib/bba/kategori';
import { listBarang, listKategoriLengkap, BbaBerkasTidakDikenalError, BbaKategoriTidakDikenalError, BbaBarangTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { simpanPenawaran, imporSuratMatriks, kunciSuratTercatat, BbaSyaratSuratError } from '@/lib/data/bba-penawaran';
import { guard, tolakKecualiEdit } from '../../_guard';

// Impor penawaran dari Excel (docs/konsep/bba/CONCEPT-bba-penawaran-matriks.md §6) — pola impor KIB:
//   GET              — templat Matriks kosong.
//   ?step=pratinjau  — membaca & mencocokkan rekanan/barang/kategori, TIDAK menulis.
//   ?step=simpan     — berkas yang SAMA diunggah ulang; server membaca ulang lalu menulis.
// Berkas Matriks (kepala Rekanan + Tgl Surat + Nama Barang) = BANYAK surat, ditulis SATU transaksi; surat yang sudah tercatat
// (rekanan + nomor + tanggal sama) dilewati. Berkas templat lama tanpa kolom rekanan = item SATU surat, kepala diisi di modal.
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
  tulisTemplatPenawaran(wb, { jenis: JENIS_SURAT, pajak: STATUS_PAJAK.map(s => LABEL_PAJAK[s]), status: STATUS_TINDAK_LANJUT.map(s => LABEL_TINDAK_LANJUT[s]) });
  const isi = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(isi, { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="Templat Matriks Penawaran Rekanan.xlsx"',
  } });
}

type Grid = unknown[][];
const MAKS_BARIS_GRID = 2100;

/** Semua lembar sebagai grid sel polos (L67: batas lembar & baris). */
function gridLembar(ws: import('exceljs').Worksheet): Grid {
  const grid: Grid = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    if (r > MAKS_BARIS_GRID) return;
    const b: unknown[] = [];
    for (let c = 1; c <= Math.min(row.cellCount, 40); c++) b.push(polosSelExcel(row.getCell(c)) ?? '');
    grid[r - 1] = b;
  });
  return Array.from(grid, b => b ?? []);
}

/** Kategori teks berkas → id Master bila namanya ada (tanpa beda huruf); jenis yang tidak ada tetap teks (ketik sendiri). */
function petakanKategori(master: MasterKategoriData, induk: string | null, jenis: string | null) {
  const sama = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const i = induk ? master.induk.find(x => sama(x.nama, induk)) : undefined;
  const calon = jenis ? master.jenis.filter(j => sama(j.nama, jenis) && (!i || j.kategori_id === i.id)) : [];
  const j = calon.length === 1 ? calon[0] : undefined;
  return {
    kategori_id: j?.kategori_id ?? i?.id ?? null, jenis_kategori_id: j?.id ?? null, kode_rekening: j?.kode_rekening ?? null,
    jenis_kategori: j ? null : jenis, catatan: induk && !i ? `kategori "${induk}" tidak ada di Master Kategori — diabaikan` : null,
  };
}

type SuratSiap = Omit<SuratMatriks, 'item'> & { sudahAda: boolean; kategori_id: number | null; jenis_kategori_id: number | null; kode_rekening: string | null; jenis_kategori: string | null;
  item: Array<SuratMatriks['item'][number] & { barang_id: number | null; barang_nama: string | null }> };

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  const step = new URL(req.url).searchParams.get('step');
  if (step !== 'pratinjau' && step !== 'simpan') return tolak('Langkah impor tidak dikenali. Muat ulang halaman, lalu ulangi.');
  const limited = await bbaRateLimit(g.session.userId, `penawaran-impor-${step}`, step === 'simpan' ? 10 : 30); if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const berkas = form?.get('file');
  if (!(berkas instanceof File)) return tolak('Pilih berkas Excel penawaran.');
  if (berkas.size > MAKS_UKURAN) return tolak(`Berkas lebih dari ${MAKS_UKURAN / 1024 / 1024} MB.`);
  const buf = Buffer.from(await berkas.arrayBuffer());
  if (!MIME_XLSX.includes((await endusMime(buf)) ?? '')) return tolak('Berkas harus Excel .xlsx.');
  let lembar: Grid[];
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    if (wb.worksheets.length > MAKS_LEMBAR_PENAWARAN) return tolak(`Berkas berisi ${wb.worksheets.length} lembar — paling banyak ${MAKS_LEMBAR_PENAWARAN}.`);
    lembar = wb.worksheets.map(gridLembar);
  } catch {
    return tolak('Berkas tidak bisa dibaca sebagai Excel. Simpan ulang dari Excel sebagai .xlsx, lalu coba lagi.');
  }
  const [barangMaster, kategori] = await Promise.all([listBarang(), listKategoriLengkap()]);
  const master = new Map(barangMaster.map(b => [kunciNamaBarang(b.nama), b]));
  const cariBarang = (...nama: Array<string | null>) => nama.map(n => (n ? master.get(kunciNamaBarang(n)) : undefined)).find(Boolean) ?? null;

  // ── Berkas Matriks: lembar pertama yang berkepala Matriks.
  const matriks = lembar.map(bacaMatriksGrid).find(h => h !== null) ?? null;
  if (matriks) {
    if (matriks.masalah.length) return NextResponse.json({ ok: false, code: 'BERKAS_BERMASALAH', message: matriks.masalah.join(' '), dilewati: matriks.dilewati }, { status: 422 });
    const tercatat = new Set((await kunciSuratTercatat()).map(x => kunciSuratMatriks(x.rekanan, x.nomor_surat, x.tgl_surat)));
    const siapkan = (s: SuratMatriks, sudah: Set<string>): SuratSiap => {
      const kat = petakanKategori(kategori, s.kepala.kategori, s.kepala.jenis_kategori);
      return { ...s, sudahAda: sudah.has(s.kunci), kategori_id: kat.kategori_id, jenis_kategori_id: kat.jenis_kategori_id, kode_rekening: kat.kode_rekening, jenis_kategori: kat.jenis_kategori,
        catatan: [...s.catatan, ...(kat.catatan ? [kat.catatan] : [])],
        item: s.item.map(i => { const b = cariBarang(i.barang_master, i.nama_barang); return { ...i, barang_id: b?.id ?? null, barang_nama: b?.nama ?? null }; }) };
    };
    if (step === 'pratinjau') return NextResponse.json({ ok: true, mode: 'matriks', surat: matriks.surat.map(s => siapkan(s, tercatat)), dilewati: matriks.dilewati });

    try {
      // Surat yang sudah tercatat dinilai ulang di dalam transaksi impor (imporSuratMatriks), bukan dari pratinjau.
      const hasil = await imporSuratMatriks(matriks.surat.map(x => siapkan(x, new Set())).map(s => ({
        label: `Surat ${s.kepala.rekanan} (baris ${s.baris[0]})`, lewati: !!s.masalah,
        data: {
          kepala: {
            ...s.kepala, kategori: undefined,
            ...(s.kategori_id || s.jenis_kategori ? { kategori_id: s.kategori_id, jenis_kategori_id: s.jenis_kategori_id, jenis_kategori: s.jenis_kategori_id ? undefined : s.jenis_kategori, kode_rekening: s.kode_rekening } : {}),
          },
          item: s.item.map(i => ({ barang_id: i.barang_id, nama_barang: i.nama_barang, merk: i.merk, merk_tipe: i.merk_tipe, spesifikasi: i.spesifikasi, satuan: i.satuan,
            harga_satuan: i.harga_satuan, status_pajak: i.status_pajak, tautan: i.tautan, garansi: i.garansi })),
        },
      })), g.session.userId);
      await writeAuditLog({ req, eventType: 'BBA_PENAWARAN_IMPOR', userId: g.session.userId, username: g.session.username,
        detail: `BBA impor Matriks "${berkas.name.slice(0, 80)}": ${hasil.tulis.length} surat (${hasil.tulis.reduce((n, x) => n + x.item, 0)} barang) dicatat, ${hasil.lewat} dilewati (sudah tercatat/bermasalah)` });
      return NextResponse.json({ ok: true, mode: 'matriks', surat: hasil.tulis.length, item: hasil.tulis.reduce((n, x) => n + x.item, 0), lewat: hasil.lewat, dilewati: matriks.dilewati });
    } catch (err) {
      if (err instanceof BbaSyaratSuratError || err instanceof BbaKategoriTidakDikenalError || err instanceof BbaBarangTidakDikenalError) return tolak(err.message);
      throw err;
    }
  }

  // ── Templat lama: item SATU surat, kepala dari modal.
  const satu = lembar.map(bacaPenawaranGrid).find(h => h.item.length) ?? lembar.map(bacaPenawaranGrid)[0];
  if (!satu) return tolak('Berkas tidak berisi lembar.');
  if (satu.masalah.length) return NextResponse.json({ ok: false, code: 'BERKAS_BERMASALAH', message: satu.masalah.join(' '), masalah: satu.masalah, dilewati: satu.dilewati }, { status: 422 });
  const item = satu.item.map(i => { const b = cariBarang(i.nama_barang); return { ...i, barang_id: b?.id ?? null, barang_nama: b?.nama ?? null }; });
  if (step === 'pratinjau') return NextResponse.json({ ok: true, mode: 'satu', item, dilewati: satu.dilewati });

  let kepala: unknown = null;
  try { kepala = JSON.parse(String(form?.get('kepala') ?? 'null')); } catch { /* ditolak Zod di bawah */ }
  const kp = KepalaPenawaranSchema.safeParse(kepala);
  if (!kp.success) return tolak('Kepala surat tidak valid: ' + kp.error.issues[0].message);
  const z = PenawaranSimpanSchema.safeParse({ kepala: kp.data, item: item.map(i => ({ barang_id: i.barang_id, nama_barang: i.nama_barang, merk_tipe: i.merk_tipe, spesifikasi: i.spesifikasi, satuan: i.satuan, harga_satuan: i.harga_satuan })) });
  if (!z.success) return tolak(z.error.issues[0].message);
  try {
    const h = await simpanPenawaran(z.data, g.session.userId);
    await writeAuditLog({ req, eventType: 'BBA_PENAWARAN_IMPOR', userId: g.session.userId, username: g.session.username,
      detail: `BBA impor penawaran id=${h.id} rekanan="${kp.data.rekanan.slice(0, 80)}" ${h.item} item dari "${berkas.name.slice(0, 80)}"${satu.dilewati.length ? `, ${satu.dilewati.length} baris dilewati` : ''}` });
    return NextResponse.json({ ok: true, mode: 'satu', ...h, dilewati: satu.dilewati });
  } catch (err) {
    if (err instanceof BbaBerkasTidakDikenalError || err instanceof BbaKategoriTidakDikenalError) return tolak(err.message);
    throw err;
  }
}
