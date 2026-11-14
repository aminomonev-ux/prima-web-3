// ═══ PRIMA — LKJIP — Impor dari Word ═══════════════════════════════════════════
// Konsep: docs/CONCEPT-lkjip-impor-word.md §5. POST multipart, `step=pratinjau|buat`.
// pratinjau TIDAK menulis apa pun. buat mengunggah berkas yang SAMA lagi dan server membacanya
// ulang (pola Impor KIB BBA) — layar hanya mengirim koreksi + sidik, jadi koreksi tidak bisa
// terpasang ke berkas lain dan isi dokumen tidak pernah datang dari layar.
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/security/auditlog';
import { lkjipRateLimit, parseBlockPayload, StyleConfigSchema, DEFAULT_STYLE } from '@/lib/lkjip/schemas';
import { createDokumen, type BagianTulis } from '@/lib/lkjip/data';
import {
  bacaDocxLkjip, ImporWordError, BATAS_BERKAS_IMPOR, PESAN_TERLALU_BESAR,
  type BagianImpor, type HasilImporWord, type Koreksi,
} from '@/lib/lkjip/impor-word';
import { tujuanTerkonfigurasi } from '@/lib/services/drive-tujuan';
import { unggahKeTujuan } from '@/lib/services/drive-catatan';
import { bulkInsert } from '@/lib/data/db';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // googleapis + node:crypto

const KoreksiSchema = z.record(z.string().regex(/^\d{1,6}$/), z.enum(['bab', 'sub', 'subsub', 'judul', 'narasi', 'buang']))
  .refine(k => Object.keys(k).length <= 2000, 'Koreksi terlalu banyak');
const BuatSchema = z.object({
  tahun: z.coerce.number().int().min(2015, 'Tahun 2015-2100').max(2100, 'Tahun 2015-2100'),
  judul: z.string().trim().max(255).optional(),
  sidik: z.string().regex(/^[0-9a-f]{64}$/, 'Sidik berkas tidak sah'),
});

const tolak = (msg: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, msg, ...extra }, { status });
const namaAman = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);

function bagianTulis(bs: BagianImpor[], fileIdDari: (ref: string | null) => string): BagianTulis[] {
  return bs.map(b => ({
    judul: b.judul,
    locked: b.locked,
    anak: bagianTulis(b.anak, fileIdDari),
    blok: b.blok.map(bl => {
      if (bl.tipe === 'GAMBAR') return { tipe: bl.tipe, payload: { ...bl.payload, fileId: fileIdDari(bl.gambar) } };
      if (bl.tipe === 'GRAFIK') return { tipe: bl.tipe, payload: { ...bl.payload, imageFileId: fileIdDari(bl.gambar) } };
      return { tipe: bl.tipe, payload: bl.payload };
    }),
  }));
}

/** Blok yang tidak lolos skema editor dibuang dan disebut — satu blok rusak tidak menggagalkan seluruh impor. */
function saringBlok(bs: BagianTulis[]): { bersih: BagianTulis[]; dibuang: number } {
  let dibuang = 0;
  const jalan = (xs: BagianTulis[]): BagianTulis[] => xs.map(b => ({
    ...b,
    blok: b.blok.filter(bl => {
      try { parseBlockPayload(bl.tipe, bl.payload); return true; } catch { dibuang++; return false; }
    }),
    anak: jalan(b.anak),
  }));
  return { bersih: jalan(bs), dibuang };
}

/** Unggahan Drive DI LUAR transaksi: panggilan Google yang lambat tidak boleh menahan kunci DB. */
async function unggahGambar(hasil: HasilImporWord, sidik: string, userId: number): Promise<{ peta: Map<string, string>; gagal: number }> {
  const peta = new Map<string, string>();
  const daftar = Object.values(hasil.gambar);
  if (!daftar.length) return { peta, gagal: 0 };
  if (!(await tujuanTerkonfigurasi('lkjip'))) return { peta, gagal: daftar.length };
  let gagal = 0;
  for (let i = 0; i < daftar.length; i += 3) {
    await Promise.all(daftar.slice(i, i + 3).map(async (g, j) => {
      try {
        const up = await unggahKeTujuan('lkjip', {
          buffer: Buffer.from(g.bytes), name: `impor-word-${sidik.slice(0, 8)}-${i + j + 1}.${g.ext}`, mimeType: g.mime,
        });
        if (up.fileId) peta.set(g.ref, up.fileId); else gagal++;
      } catch (e) { gagal++; console.error('[LKJIP impor] unggah gambar gagal', e); }
    }));
  }
  // L61: tanpa baris pelacak, berkas hanya bisa diunduh admin. Silent-fail seperti /api/upload.
  if (peta.size) {
    try { await bulkInsert('uploaded_files', ['file_id', 'uploaded_by', 'context', 'sniff_ok'], [...peta.values()].map(id => [id, userId, 'lkjip', 1])); }
    catch (e) { console.error('[LKJIP impor] pelacak unggahan gagal', e); }
  }
  return { peta, gagal };
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const form = await req.formData().catch(() => null);
  if (!form) return tolak('Data tidak terbaca.');
  const langkah = form.get('step') === 'buat' ? 'buat' : 'pratinjau';
  const limited = await lkjipRateLimit(g.session.userId, `impor-${langkah}`, langkah === 'buat' ? 5 : 40);
  if (limited) return limited;

  const file = form.get('file');
  if (!(file instanceof File)) return tolak('Pilih berkas Word (.docx) dulu.');
  if (/\.doc$/i.test(file.name)) return tolak('Berkas ini format Word lama (.doc). Buka di Word lalu Simpan Sebagai .docx dulu.');
  if (!/\.docx$/i.test(file.name)) return tolak('Yang bisa diimpor hanya berkas Word .docx.');
  if (file.size > BATAS_BERKAS_IMPOR) return tolak(PESAN_TERLALU_BESAR);

  let koreksi: Koreksi = {};
  const mentahKoreksi = form.get('koreksi');
  if (typeof mentahKoreksi === 'string' && mentahKoreksi) {
    let json: unknown = null;
    try { json = JSON.parse(mentahKoreksi); } catch { /* ditolak di bawah */ }
    const k = KoreksiSchema.safeParse(json);
    if (!k.success) return tolak('Koreksi pratinjau tidak sah.');
    koreksi = Object.fromEntries(Object.entries(k.data).map(([i, j]) => [Number(i), j]));
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sidik = createHash('sha256').update(bytes).digest('hex');
  let hasil: HasilImporWord;
  try { hasil = bacaDocxLkjip(bytes, koreksi); }
  catch (e) {
    if (e instanceof ImporWordError) return tolak(e.message);
    throw e;
  }

  if (langkah === 'pratinjau') {
    return NextResponse.json({
      ok: true, sidik, namaBerkas: namaAman(file.name),
      judulBerkas: hasil.judulBerkas, tahunTebakan: hasil.tahunTebakan,
      ringkasan: hasil.ringkasan, baris: hasil.baris, peringatan: hasil.peringatan,
      kataPengantar: { paragraf: hasil.kataPengantar.paragraf, ttd: hasil.kataPengantar.ttd },
    });
  }

  const p = BuatSchema.safeParse({ tahun: form.get('tahun'), judul: form.get('judul') || undefined, sidik: form.get('sidik') });
  if (!p.success) return tolak('Data tidak valid: ' + p.error.issues[0].message);
  if (p.data.sidik !== sidik) {
    return tolak('Berkas yang dikirim berbeda dengan yang dipratinjau. Baca ulang berkasnya dulu.', 409, { code: 'PRATINJAU_BASI' });
  }

  const { peta, gagal } = await unggahGambar(hasil, sidik, g.session.userId);
  const peringatan = [...hasil.peringatan];
  if (gagal) peringatan.push(`${gagal} gambar gagal diunggah ke Drive — bloknya dibuat tanpa gambar; unggah ulang di editor.`);
  const { bersih, dibuang } = saringBlok(bagianTulis(hasil.bagian, ref => (ref ? peta.get(ref) ?? '' : '')));
  if (dibuang) peringatan.push(`${dibuang} blok tidak lolos pemeriksaan isi dan dilewati.`);
  const ttd = hasil.kataPengantar.ttd;
  const style = StyleConfigSchema.parse({
    ...DEFAULT_STYLE, ...(hasil.spasiBawaan ?? {}), firstLineIndentCm: hasil.indenBawaanCm ?? DEFAULT_STYLE.firstLineIndentCm, kataPengantarHtml: hasil.kataPengantar.html,
    ttdTempatTanggal: ttd.tempatTanggal, ttdJabatan: ttd.jabatan, ttdNama: ttd.nama, ttdPangkat: ttd.pangkat, ttdNip: ttd.nip,
  });

  // D3: selalu dokumen BARU — tidak ada jalur yang menimpa dokumen yang sudah disunting.
  const { id, canonical_id } = await createDokumen(p.data.tahun, p.data.judul || hasil.judulBerkas || undefined, g.session.userId, 'kosong', { style, bagian: bersih });
  const r = hasil.ringkasan;
  await writeAuditLog({
    req, eventType: 'LKJIP_IMPOR_WORD', userId: g.session.userId, username: g.session.username,
    detail: `LKJIP impor Word ${canonical_id} tahun ${p.data.tahun} dari "${namaAman(file.name)}" (sidik ${sidik.slice(0, 12)}): `
      + `${r.bab} bab, ${r.sub} sub-bab, ${r.tabel} tabel, ${r.gambar} gambar, ${r.grafik} grafik, `
      + `${Object.keys(koreksi).length} koreksi, ${peringatan.length} peringatan${gagal ? `, ${gagal} gambar gagal unggah` : ''}`,
  });
  return NextResponse.json({ ok: true, id, canonical_id, peringatan });
}
