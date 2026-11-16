// app/api/perjanjian-kinerja/dokumen/bulk-download/route.ts
// GET  ?tahun=2026 → daftar versi DPA/Pergeseran tahun itu (pilihan lampiran satu batch).
// POST { ids, format, sumber?, versi? } → satu ZIP berisi Word/PDF dokumen terpilih.
//
// Pagar = pagar unduh satu dokumen (kepemilikan, sakelar modul). Lampiran BLUD satu versi
// untuk seluruh batch, jadi dokumennya WAJIB satu tahun — versi BLUD berlaku per tahun.

import { NextRequest, NextResponse } from 'next/server';
import PizZip from 'pizzip';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { pkRateLimit, UnduhMassalBodySchema } from '@/lib/data/pk-schemas';
import { bolehLihatSalahSatu, forbidden, pkMati } from '../../_guard';
import { ADMIN_ROLES } from '@/lib/constants';
import { isiLampiranBlud, LampiranBludError, LampiranTanpaBludError } from '@/lib/data/pk-lampiran-blud';
import { pilihanVersiBlud } from '@/lib/data/pk-blud-nominal';
import { buildLampiranBludXml, sisipkanKeDocx } from '@/lib/pk/lampiran-blud';
import { namaUnik } from '@/lib/pk/unduh-massal';
import { docxKePdf, PdfTidakTersediaError } from '@/lib/services/docx-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Baris = {
  id: number;
  tahun: string;
  unit_pertama: string;
  created_by: number | null;
  generated_file: Buffer | null;
  generated_filename: string | null;
};

const angkaTahun = (v: string | null): number | null => {
  const n = Number(v);
  return /^\d{4}$/.test(String(v ?? '')) && n >= 2000 && n <= 2100 ? n : null;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['form', 'riwayat']))) return forbidden();

  const limited = await pkRateLimit(session.userId, 'unduh-massal-opsi', 30);
  if (limited) return limited;

  const tahun = angkaTahun(req.nextUrl.searchParams.get('tahun'));
  if (tahun === null) return NextResponse.json({ ok: false, message: 'Tahun tidak valid' }, { status: 400 });

  return NextResponse.json({ ok: true, versi: await pilihanVersiBlud(tahun) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await pkMati(session.role);
  if (mati) return mati;
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['form', 'riwayat']))) return forbidden();

  const q = UnduhMassalBodySchema.safeParse(await req.json().catch(() => null));
  if (!q.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  }
  const { format, sumber, versi } = q.data;
  const ids = [...new Set(q.data.ids)];

  // Batasnya dihitung per PERMINTAAN, bukan per berkas. Jadwal PDF dinaikkan 3 → 6/menit hanya
  // karena isi tiap permintaan turun 10 → 5 dokumen (layar memecahnya): plafon konversi tetap
  // 30 PDF/menit seperti sebelumnya.
  const limited = await pkRateLimit(session.userId, 'unduh-massal', 10)
    ?? (format === 'pdf' ? await pkRateLimit(session.userId, 'unduh-massal-pdf', 6) : null);
  if (limited) return limited;

  const rows = await sql`
    SELECT id, tahun, unit_pertama, created_by, generated_file, generated_filename
    FROM pk_dokumen WHERE id IN (${ids}) ORDER BY id
  ` as Baris[];

  if (rows.length !== ids.length) {
    const ada = new Set(rows.map(r => r.id));
    const hilang = ids.filter(id => !ada.has(id));
    return NextResponse.json({ ok: false, message: `Dokumen tidak ditemukan: #${hilang.join(', #')}` }, { status: 404 });
  }

  // Non-admin hanya boleh mengunduh dokumennya sendiri. Yang bukan haknya DISARING, bukan
  // menggagalkan seluruh ZIP; jumlahnya dikabarkan lewat header supaya tidak hilang diam-diam.
  // (Daftar Riwayat memang sudah menyaring, jadi ini pagar untuk permintaan yang disusun sendiri.)
  const isAdmin = (ADMIN_ROLES as readonly string[]).includes(session.role);
  const milik = isAdmin ? rows : rows.filter(r => r.created_by === session.userId);
  const dilewati = rows.length - milik.length;
  if (milik.length === 0) {
    return NextResponse.json({ ok: false, message: 'Tidak ada dokumen milik Anda di pilihan itu.' }, { status: 403 });
  }

  const kosong = milik.filter(r => !r.generated_file);
  if (kosong.length) {
    return NextResponse.json({
      ok: false,
      message: `Belum ada berkas Word (belum finalisasi): #${kosong.map(r => r.id).join(', #')}`,
    }, { status: 409 });
  }

  if (sumber && versi) {
    const tahunBatch = new Set(milik.map(r => String(r.tahun)));
    if (tahunBatch.size > 1) {
      return NextResponse.json({
        ok: false,
        message: 'Lampiran BLUD memakai satu versi untuk semua dokumen, dan versinya berlaku per tahun. '
          + 'Pilih dokumen dari satu tahun saja.',
      }, { status: 400 });
    }
  }

  const dipakai = new Set<string>();
  const isiZip: Array<{ nama: string; isi: Buffer }> = [];

  for (const r of milik) {
    let berkas: Uint8Array = new Uint8Array(r.generated_file!);
    let keterangan = '';
    if (sumber && versi) {
      try {
        const isi = await isiLampiranBlud({ id: r.id, tahun: Number(r.tahun), unit_pertama: r.unit_pertama }, sumber, versi);
        berkas = sisipkanKeDocx(berkas, buildLampiranBludXml(isi));
        keterangan = `, lampiran BLUD per PJ dari ${isi.sumber} (total ${isi.total})`;
      } catch (e) {
        // PK tanpa BLUD tetap ikut tanpa lampiran; versi/unit yang bermasalah menghentikan batch
        // supaya tidak ada berkas yang diam-diam kehilangan lampirannya.
        if (e instanceof LampiranTanpaBludError) { /* tanpa lampiran */ }
        else if (e instanceof LampiranBludError) {
          return NextResponse.json({ ok: false, message: `Dokumen #${r.id}: ${e.message}` }, { status: 422 });
        } else throw e;
      }
    }

    let nama = r.generated_filename ?? `PK-${r.id}.docx`;
    if (format === 'pdf') {
      try {
        berkas = new Uint8Array(await docxKePdf(berkas));
      } catch (e) {
        if (e instanceof PdfTidakTersediaError) {
          return NextResponse.json({ ok: false, code: 'PDF_TIDAK_TERSEDIA', message: e.message }, { status: 503 });
        }
        console.error('[pk unduh massal pdf]', r.id, e);
        return NextResponse.json({ ok: false, message: `PDF dokumen #${r.id} gagal dibuat. Coba lagi, atau unduh Word.` }, { status: 500 });
      }
      nama = nama.replace(/\.docx$/i, '') + '.pdf';
    }

    const namaAkhir = namaUnik(nama, dipakai);
    isiZip.push({ nama: namaAkhir, isi: Buffer.from(berkas) });
    await writeAuditLog({
      req,
      eventType: 'PK_DOKUMEN_DOWNLOAD',
      userId:    session.userId,
      username:  session.username,
      detail:    `Download massal dokumen PK id=${r.id}, file=${namaAkhir}${keterangan}`,
    });
  }

  const zip = new PizZip();
  for (const f of isiZip) zip.file(f.nama, f.isi);
  const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer;
  const namaZip = `PK-${milik[0].tahun}-${milik.length}-dokumen.zip`;

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':           'application/zip',
      'Content-Disposition':    `attachment; filename="${encodeURIComponent(namaZip)}"`,
      'Content-Length':         String(buf.length),
      'Cache-Control':          'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Dokumen-Dilewati':     String(dilewati),
    },
  });
}
