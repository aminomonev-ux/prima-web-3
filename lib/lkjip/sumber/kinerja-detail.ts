// lib/lkjip/sumber/kinerja-detail.ts — sumber "E-Anggaran · Cetak Detail per Sumber" (satu sumber dana,
// satu bulan, per rekening + JUMLAH). Konsep: docs/CONCEPT-lkjip-tabel-dari-modul.md
//
// Baris = GET /api/kinerja/realisasi yang dipakai layar Cetak apa adanya (versi final membaca foto
// beku, hak akses E-Anggaran berlaku), lalu `recalcAllRealisasi` seperti layarnya. JUMLAH =
// `hitungJumlahBulan` — rumus yang sama dengan layar, Excel, dan PDF; rekening yatim keluar dari
// jumlah dan disebut di catatan. Kunci baris = identitas rekening (`ssk_canonical_id`), bukan
// namanya: rekening yang diganti nama tetap menempel pada barisnya saat Perbarui.

import { SUMBER_LIST, CRR_BULAN_LABELS, recalcAllRealisasi } from '@/app/(dashboard)/kinerja/_utils';
import { DETAIL_BULAN_HEADER } from '@/app/(dashboard)/kinerja/_exports';
import type { RealRow, SumberSSK } from '@/app/(dashboard)/kinerja/_types';
import { hitungJumlahBulan, tandaYatim, catatanYatimBulan } from '@/lib/kinerja/cetak-detail';
import { versiUntukPilihan, labelVersi, kalimatVersiLebihBaru, type SlotVersiSsk } from '@/lib/kinerja/versi';
import type { BarisSumber, HasilTarik, JenisKolomSumber, KolomSumber } from '../tautan';
import { GagalTarik, pesanDitolak, angkaDalam, type AmbilJson } from './umum';
import type { SalinanModul } from '../salinan-modul';

/** 'berlaku' = versi paling belakang · 'murni' = Murni · 'PERUBAHAN:1' = versi tertentu (dari layar Cetak). */
export type PilihanVersiDetail = string;
export interface SetelanKinerjaDetail { tahun: number; sumber: SumberSSK; bulan: number; versi: PilihanVersiDetail }

const POLA_VERSI = /^(MURNI|PERUBAHAN):(\d{1,3})$/;

const KUNCI = ['no', 'uraian', 'pagu', 'targetFisik', 'realFisik', 'pctFisik', 'akumTarget', 'akumRealFisik', 'akumPctFisik',
  'realKeu', 'pctKeu', 'akumKeu', 'akumPctKeu', 'devFisik', 'devKeu'] as const;
const JENIS: Record<(typeof KUNCI)[number], JenisKolomSumber> = {
  no: 'angka', uraian: 'teks', pagu: 'rp', targetFisik: 'persen', realFisik: 'rp', pctFisik: 'persen',
  akumTarget: 'persen', akumRealFisik: 'rp', akumPctFisik: 'persen', realKeu: 'rp', pctKeu: 'persen',
  akumKeu: 'rp', akumPctKeu: 'persen', devFisik: 'persen', devKeu: 'persen',
};
/** Judul kolom = kepala tabel Cetak Detail (`DETAIL_BULAN_HEADER`), jadi tabel tempelan bertajuk sama. */
export const KOLOM_KINERJA_DETAIL: KolomSumber[] = KUNCI.map((kunci, i) => ({ kunci, label: DETAIL_BULAN_HEADER[i], jenis: JENIS[kunci] }));
export const KOLOM_BAWAAN_DETAIL = ['no', 'uraian', 'pagu', 'realKeu', 'pctKeu', 'akumKeu', 'akumPctKeu'];

export function setelanKinerjaDetail(raw: unknown, tahunDokumen: number): SetelanKinerjaDetail {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const versi = typeof o.versi === 'string' && (o.versi === 'murni' || POLA_VERSI.test(o.versi)) ? o.versi : 'berlaku';
  return {
    tahun:  angkaDalam(o.tahun, 2000, 2100, tahunDokumen),
    sumber: SUMBER_LIST.includes(o.sumber as SumberSSK) ? o.sumber as SumberSSK : 'GAJI',
    bulan:  angkaDalam(o.bulan, 1, 12, 12),
    versi,
  };
}

/** Label pilihan versi untuk layar setelan. */
export function labelPilihanVersiDetail(v: PilihanVersiDetail): string {
  if (v === 'berlaku') return 'Versi Berlaku';
  if (v === 'murni') return 'Versi Murni (sebelum perubahan)';
  const m = POLA_VERSI.exec(v);
  return m ? `Versi ${labelVersi(m[1] as 'MURNI' | 'PERUBAHAN', Number(m[2]))} (tetap)` : v;
}

export async function tarikKinerjaDetail(s: SetelanKinerjaDetail, ambil: AmbilJson): Promise<HasilTarik> {
  const dv = await ambil(`/api/kinerja/ssk/versi-list?tahun=${s.tahun}&sumber=${s.sumber}`);
  if (!dv.ok) throw new GagalTarik(pesanDitolak('E-Anggaran', dv.status, dv.message));
  const slot = (dv as { items?: SlotVersiSsk[] }).items ?? [];
  const terbaru = versiUntukPilihan(slot, 'berlaku');
  const m = POLA_VERSI.exec(s.versi);
  const pakai = m ? { tipe: m[1] as 'MURNI' | 'PERUBAHAN', seq: Number(m[2]) } : versiUntukPilihan(slot, s.versi === 'murni' ? 'murni' : 'berlaku');
  if (!pakai || (m && !slot.some(x => x.versi_tipe === pakai.tipe && Number(x.versi_seq ?? 0) === pakai.seq))) {
    const sebut = m ? `versi ${labelVersi(m[1] as 'MURNI' | 'PERUBAHAN', Number(m[2]))}` : 'versi Murni';
    throw new GagalTarik(slot.length === 0
      ? `${s.sumber} ${s.tahun} belum punya RKO/SSK di E-Anggaran.`
      : `${s.sumber} ${s.tahun} tidak punya ${sebut} — pilih versi lain di setelan tabel.`);
  }
  const label = labelVersi(pakai.tipe, pakai.seq);
  const d = await ambil(`/api/kinerja/realisasi?tahun=${s.tahun}&sumber=${s.sumber}&versi_tipe=${pakai.tipe}&versi_seq=${pakai.seq}`);
  if (!d.ok) throw new GagalTarik(pesanDitolak('E-Anggaran', d.status, d.message));
  // Hitung ulang SETAHUN dulu, baru saring bulannya — kolom "Akum." menjumlah bulan-bulan sebelumnya (urutan layar Cetak).
  const rows = recalcAllRealisasi((d as { rows?: RealRow[] }).rows ?? []).filter(r => r.bulan === s.bulan);
  const j = hitungJumlahBulan(rows);
  const baris: BarisSumber[] = rows.map((r, i) => ({
    kunci: r.ssk_canonical_id ? `cid:${r.ssk_canonical_id}` : `ket:${r.keterangan}`,
    label: r.keterangan || '-',
    sel: {
      no: i + 1, uraian: `${r.keterangan || '-'}${r.yatim ? ` (${tandaYatim(label)})` : ''}`, pagu: r.pagu_awal,
      targetFisik: r.target_fisik, realFisik: r.real_fisik, pctFisik: r.pct_fisik,
      akumTarget: r.akum_target_fisik, akumRealFisik: r.akum_real_fisik, akumPctFisik: r.akum_pct_fisik,
      realKeu: r.real_keuangan, pctKeu: r.pct_keuangan, akumKeu: r.akum_keuangan, akumPctKeu: r.akum_pct_keuangan,
      devFisik: r.deviasi_fisik, devKeu: r.deviasi_keuangan,
    },
  }));
  if (rows.length) {
    baris.push({
      kunci: 'r:jumlah', label: 'JUMLAH', tebal: true,
      sel: {
        no: null, uraian: 'JUMLAH', pagu: j.pagu, targetFisik: j.targetPct, realFisik: j.realFisik, pctFisik: j.pctFisik,
        akumTarget: j.akumTgtPct, akumRealFisik: j.akumFisik, akumPctFisik: j.akumPctF,
        realKeu: j.realKeu, pctKeu: j.pctKeu, akumKeu: j.akumKeu, akumPctKeu: j.akumPctKeu, devFisik: j.devFisik, devKeu: j.devKeu,
      },
    });
  }
  const namaBulan = CRR_BULAN_LABELS[s.bulan - 1];
  const lebihBaru = terbaru && s.versi !== 'berlaku' && (terbaru.tipe !== pakai.tipe || terbaru.seq !== pakai.seq)
    ? kalimatVersiLebihBaru([{ sumber: s.sumber, label: labelVersi(terbaru.tipe, terbaru.seq) }], `versi ${label}`)
    : null;
  return {
    kolom: KOLOM_KINERJA_DETAIL,
    baris,
    catatan: [
      rows.length ? null : `Belum ada realisasi ${s.sumber} bulan ${namaBulan} ${s.tahun}.`,
      catatanYatimBulan(j, label),
    ].filter((c): c is string => c !== null),
    ringkas: `E-Anggaran · Cetak Detail ${s.sumber} ${namaBulan} ${s.tahun} · SSK ${label}`,
    info: lebihBaru ? [lebihBaru] : [],
  };
}

/** Resep "Salin ke LKJIP" dari layar Cetak → Detail (satu bulan). Versi terbaru → 'berlaku' (ikut Perubahan berikutnya). */
export function salinanKinerjaDetail(s: SetelanKinerjaDetail): SalinanModul {
  return {
    v: 1, sumber: 'kinerja-detail', setelan: { ...s }, kolom: KOLOM_KINERJA_DETAIL.map(k => k.kunci),
    judul: `Realisasi ${s.sumber} Bulan ${CRR_BULAN_LABELS[s.bulan - 1]} Tahun ${s.tahun}`,
  };
}
