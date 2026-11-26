// lib/data/bba-pagu.ts — pagu belanja modal BLUD untuk kartu pagu BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §4.2).
// Hanya SATU angka total + label versi yang keluar dari sini, tidak pernah baris DPA. Versi dibaca lewat penjawab
// BLUD yang sudah ada (`sumberPaguTahun`, `get*VersiBerlaku`) — jangan menulis MAX(versi_tanggal) sendiri.
import { sql, queryMany } from '@/lib/data/db';
import { sumberPaguTahun, tabelSumber, penandaPerubahan, type TabelAnggaran } from '@/lib/blud/sumber-pagu';
import { getDpaVersiBerlaku, getPergeseranVersiBerlaku } from '@/lib/blud/data';
import { jenisSumberPagu, keBabak } from '@/lib/blud/perubahan';
import { formatTanggalId, toDateStr } from '@/lib/blud/tanggal';
import { paguBelanjaModal, type BarisPagu } from '@/lib/bba/pagu';

export type JenisPaguBlud = 'berlaku' | 'dpa' | 'pergeseran';
const BATAS_ATAS = '9999-12-31';

export type HasilPaguBlud = { tersedia: true; nilai: number; label: string; versi: string; tabel: TabelAnggaran; dasar: string } | { tersedia: false; alasan: string };

async function baris(tabel: TabelAnggaran, tahun: number, versi: string): Promise<BarisPagu[]> {
  const rows = tabel === 'dpa_blud'
    ? await queryMany<Record<string, unknown>>(sql`SELECT row_id, parent_id, kode_rekening, uraian, jumlah AS nilai FROM dpa_blud WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}`)
    : await queryMany<Record<string, unknown>>(sql`SELECT row_id, parent_id, kode_rekening, uraian, pergeseran AS nilai FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}`);
  return rows.map(r => ({ row_id: String(r.row_id), parent_id: r.parent_id == null ? null : String(r.parent_id), kode_rekening: (r.kode_rekening as string | null) ?? null, uraian: (r.uraian as string | null) ?? null, nilai: Number(r.nilai ?? 0) }));
}

async function acuanPergeseran(tahun: number, versi: string): Promise<string | null> {
  const r = await queryMany<{ a: unknown }>(sql`SELECT MIN(dpa_versi_tanggal) AS a FROM pergeseran_dpa WHERE tahun_anggaran = ${tahun} AND versi_tanggal = ${versi}`);
  return r[0]?.a ? toDateStr(r[0].a) : null;
}

export async function bacaPaguBlud(tahun: number, jenis: JenisPaguBlud): Promise<HasilPaguBlud> {
  const belumAda = (apa: string): HasilPaguBlud => ({ tersedia: false, alasan: `${apa} BLUD ${tahun} belum ada — ketik pagu sendiri.` });
  const penanda = await penandaPerubahan(sql, tahun);
  let tabel: TabelAnggaran, versi: string, label: string;
  if (jenis === 'berlaku') {
    const s = await sumberPaguTahun(sql, tahun);
    const t = tabelSumber(s);
    if (!t || !s.versi) return belumAda('DPA');
    tabel = t; versi = s.versi;
    label = `${jenisSumberPagu(s)} · ${formatTanggalId(versi)}`;
  } else if (jenis === 'dpa') {
    const v = await getDpaVersiBerlaku(tahun, BATAS_ATAS);
    if (!v) return belumAda('DPA');
    tabel = 'dpa_blud'; versi = v;
    const ke = keBabak(penanda, v);
    label = `${ke ? `DPA Perubahan ke-${ke}` : 'DPA murni'} · ${formatTanggalId(v)}`;
  } else {
    const v = await getPergeseranVersiBerlaku(tahun, BATAS_ATAS);
    if (!v) return belumAda('Pergeseran');
    tabel = 'pergeseran_dpa'; versi = v;
    const acuan = await acuanPergeseran(tahun, v);
    const ke = acuan ? keBabak(penanda, acuan) : null;
    label = `Pergeseran ${formatTanggalId(v)}${ke ? ` (mengacu DPA Perubahan ke-${ke})` : ''}`;
  }
  const h = paguBelanjaModal(await baris(tabel, tahun, versi));
  if (h.dasar === 'TIDAK_ADA') return { tersedia: false, alasan: `Baris belanja modal (kode 5.2 atau uraian "Belanja Modal") tidak ditemukan di ${label} — ketik pagu sendiri.` };
  return { tersedia: true, nilai: h.nilai, label, versi, tabel, dasar: h.dasar };
}
