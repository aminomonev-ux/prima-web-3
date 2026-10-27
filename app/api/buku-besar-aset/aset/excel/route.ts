import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { AsetExcelSchema, type AsetExcelInput } from '@/lib/data/bba-aset-schemas';
import { asetUntukKib, asetAktifLengkap, ruangUntukKir, bacaPengaturanBba, batasCekSekarang } from '@/lib/data/bba-aset';
import { tulisLembarKib, NAMA_BERKAS_KIB } from '@/lib/bba/kib-excel';
import {
  tulisLembarSensus, tulisRekapSensus, tulisLembarKir, tulisBukuInventaris, tulisRekapBmd, tulisLembarKerja, namaLembarAman,
} from '@/lib/bba/lembar-excel';
import { masukBukuResmi } from '@/lib/bba/lembar';
import { tulisDaftarRencana } from '@/lib/bba/rencana-excel';
import { rencanaUntukExcel } from '@/lib/data/buku-besar-aset';
import { GOLONGAN, type Golongan } from '@/lib/bba/kib';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { guard, tolakKecualiLihat } from '../../_guard';

// Unduhan Excel Buku Aset (docs/CONCEPT-bba-buku-aset.md §9): KIB A–F, KIR per ruangan, hasil sensus
// + rekapnya, Rekapitulasi BMD, Buku Inventaris — bentuk ekspor sistem aset provinsi — dan format kerja
// PRIMA. Disusun di server supaya satu penyusun dipakai semua pintu unduh dan tiap unduhan tercatat.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ascii = (s: string) => s.normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'ruangan';

type Hasil = { nama: string; register: number } | { kosong: string };

async function susun(wb: import('exceljs').Workbook, p: AsetExcelInput, tanggal: string): Promise<Hasil> {
  const pengaturan = await bacaPengaturanBba();
  switch (p.jenis) {
    case 'KIB': {
      const daftar: Golongan[] = p.golongan === 'SEMUA' ? [...GOLONGAN] : [p.golongan];
      const isi = await Promise.all(daftar.map(asetUntukKib));
      daftar.forEach((gol, i) => tulisLembarKib(wb, gol, isi[i], pengaturan, tanggal));
      return { nama: NAMA_BERKAS_KIB(p.golongan, tanggal), register: isi.reduce((s, x) => s + x.length, 0) };
    }
    case 'KIR': {
      const ruang = await ruangUntukKir(p.lokasi === 'SEMUA' ? undefined : p.lokasi);
      if (ruang.length === 0) return { kosong: p.lokasi === 'SEMUA' ? 'Belum ada ruangan yang berisi aset.' : 'Ruangan tidak ditemukan.' };
      const dipakai = new Set<string>();
      for (const r of ruang) tulisLembarKir(wb, r, r.aset, pengaturan, tanggal, namaLembarAman(`KIR ${r.nama}`, dipakai));
      const nama = p.lokasi === 'SEMUA' ? 'semua-ruangan' : ascii(ruang[0].nama);
      return { nama: `KIR-${nama}-${tanggal}.xlsx`, register: ruang.reduce((s, r) => s + r.aset.length, 0) };
    }
    case 'SENSUS': {
      const aset = (await asetAktifLengkap()).filter(masukBukuResmi);
      for (const g of GOLONGAN) tulisLembarSensus(wb, g, aset.filter(a => a.golongan === g), pengaturan, p.tahun, tanggal);
      tulisRekapSensus(wb, aset, pengaturan, p.tahun, tanggal);
      return { nama: `Hasil-Sensus-${p.tahun}-${tanggal}.xlsx`, register: aset.length };
    }
    case 'REKAP': {
      const aset = await asetAktifLengkap();
      const periode = tanggal.slice(0, 7).replace('-', '');
      tulisRekapBmd(wb, aset, pengaturan, periode, tanggal);
      return { nama: `Rekap-BMD-${periode}.xlsx`, register: aset.filter(masukBukuResmi).length };
    }
    case 'BI': {
      const aset = await asetAktifLengkap();
      tulisBukuInventaris(wb, aset, pengaturan, tanggal);
      return { nama: `Buku-Inventaris-${tanggal}.xlsx`, register: aset.filter(masukBukuResmi).length };
    }
    case 'KERJA': {
      const [aset, batas] = await Promise.all([asetAktifLengkap(), batasCekSekarang()]);
      tulisLembarKerja(wb, aset, batas);
      return { nama: `Buku-Aset-PRIMA-${tanggal}.xlsx`, register: aset.length };
    }
    case 'RENCANA': {
      const { rows, dimiliki, sasaran } = await rencanaUntukExcel(p.tahun);
      tulisDaftarRencana(wb, p.tahun, rows, dimiliki, sasaran);
      return { nama: `Daftar-Rencana-${p.tahun}-${tanggal}.xlsx`, register: rows.length };
    }
  }
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'cetak'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  // Tanpa `jenis` = KIB (bentuk tautan Tahap B).
  const p = AsetExcelSchema.safeParse({ jenis: 'KIB', ...Object.fromEntries([...sp].filter(([, v]) => v !== '')) });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Permintaan unduhan tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  const limited = await bbaRateLimit(g.session.userId, 'aset-excel', 20); if (limited) return limited;

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PRIMA';
  const tanggal = tanggalHariIniWIB();
  const hasil = await susun(wb, p.data, tanggal);
  if ('kosong' in hasil) return NextResponse.json({ ok: false, message: hasil.kosong }, { status: 404 });
  const buf = await wb.xlsx.writeBuffer();
  await writeAuditLog({ req, eventType: 'BBA_ASET_UNDUH', userId: g.session.userId, username: g.session.username, detail: `BBA unduh ${hasil.nama} (${hasil.register} register)` });
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${hasil.nama}"`,
      'Cache-Control': 'no-store',
    },
  });
}
