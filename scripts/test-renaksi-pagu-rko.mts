// scripts/test-renaksi-pagu-rko.mts — pagu Rencana Aksi dibandingkan dengan RKO E-Anggaran (tampilan, Tahap B)
// dan sumber dana Renaksi masuk Master Rekening lewat jalur Init/Perbarui (docs/CONCEPT-renaksi-pagu-rko.md §6a).
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-pagu-rko.mts
// Bagian C memakai MySQL kotak pasir 2075 (dibersihkan otomatis; tanpa --env-file GAGAL).

import { readFileSync } from 'node:fs';
import {
  agregatRko, bandingPaguRenaksi, kalimatLebih, kunciSub, melampaui, versiTerbaruPerTab,
  pelanggaranBaru, alasanPaguSah, ringkasPelanggaran, ALASAN_PAGU_MIN,
  versiMurniPerTab, tabBerversiPerubahan, bandingDua, seragam, pelanggaranSimpanan, catatanPelanggaran,
  labelPembanding, terpakaiRkoSub, gabungNama, kalimatBelumPerubahan,
  type BarisRkoPagu, type RekeningSumberDana, type PelanggaranPagu, type AgregatRko, type JenisSimpananPagu,
} from '../lib/kinerja/pagu-renaksi';
import { jumlahPerSumber, paguSendiri, paguSubKegiatan, type BarisPagu } from '../lib/renaksi/pagu';
import { bandingRenaksi } from '../lib/kinerja/banding-renaksi';
import { jalurAdaDiRenaksi } from '../lib/kinerja/asal-renaksi';

let lulus = 0;
const gagal: string[] = [];
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`); } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`); }
};

const rko = (tab: string, uraian: string, pagu: number, o: Partial<BarisRkoPagu> = {}): BarisRkoPagu => ({
  tab, versi_tipe: 'MURNI', versi_seq: 0, program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB',
  uraian_ssk: 'SSK', uraian, pagu, is_nullified: 0, ...o,
});
const rek = (tab: string, uraian: string, sumber: string | null): RekeningSumberDana => ({ tab, uraian_ssk: 'SSK', uraian, sumber_anggaran: sumber });
const sub = (pagu: [string, number][] | null, nama = 'SUB') =>
  ({ program: 'PROG', kegiatan: 'KEG', sub_kegiatan: nama, pagu: pagu ? jumlahPerSumber(pagu.map(([sumber, nilai]) => ({ sumber, nilai }))) : null });

// ── A. Aturan murni ───────────────────────────────────────────────────────────
console.log('A. Pembanding pagu Renaksi ↔ RKO');
{
  const v = versiTerbaruPerTab([
    rko('GAJI', 'R1', 10), rko('GAJI', 'R1', 99, { versi_tipe: 'PERUBAHAN', versi_seq: 1 }),
    rko('BLUD', 'R2', 5), rko('BLUD', 'R2', 7, { versi_tipe: 'PERUBAHAN', versi_seq: 1, is_nullified: 1 }),
  ]);
  ok('A1 versi terbaru per tab; versi yang habis dinol-kan tetap terpilih (A9) dan bernilai 0',
    v.length === 2 && v.every(r => r.versi_tipe === 'PERUBAHAN')
    && agregatRko(v, []).reduce((a, x) => a + x.pagu, 0) === 99, JSON.stringify(v.map(r => [r.tab, r.versi_tipe, r.pagu])));

  const a = agregatRko([rko('GAJI', 'R1', 10), rko('GAJI', 'R2', 4), rko('BLUD', 'R3', 3), rko('GAJI', 'R4', 2)],
    [rek('GAJI', 'R1', 'APBD'), rek('GAJI', 'R2', ' apbd '), rek('BLUD', 'R3', 'BLUD'),
      rek('GAJI', 'R4', 'APBD'), rek('GAJI', 'R4', 'BLUD')]);
  const cari = (tab: string, s: string) => a.find(x => x.tab === tab && x.sumber.toLowerCase() === s.toLowerCase())?.pagu;
  ok('A2 sumber dana dari rekening (kunci Inject, beda huruf disatukan)', cari('GAJI', 'apbd') === 14 && cari('BLUD', 'blud') === 3, JSON.stringify(a));
  ok('A3 rekening berkunci sama dengan sumber dana berbeda → "sumber belum diisi"', cari('GAJI', '') === 2);
  ok('A4 RKO tanpa rekening → "sumber belum diisi"', agregatRko([rko('GAJI', 'X', 1)], [])[0].sumber === '');

  const h = bandingPaguRenaksi([sub([['APBD', 10], ['BLUD', 5]])], [
    { tab: 'GAJI', program: 'PROG ***', kegiatan: 'keg', subkegiatan: 'Sub', sumber: 'APBD', pagu: 12 },
    { tab: 'BLUD', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'BLUD', pagu: 2 },
  ]);
  const b = h.sub[0];
  ok('A5 per sumber: APBD lebih walau total masih di bawah pagu (nama dicocokkan tanpa bintang/huruf besar)',
    melampaui(b) && b.lebih.length === 1 && b.lebih[0].nilai === 2 && b.lebihTotal === 0 && b.sisa === 1, JSON.stringify(b));
  ok('A6 kalimat kelebihan', kalimatLebih(b) === 'APBD lebih Rp 2', kalimatLebih(b));
  ok('A7 per tab dicatat', b.perTab.length === 2);
  const h2 = bandingPaguRenaksi([sub([['', 10], ['BLUD', 5]])], [{ tab: 'GAJI', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'APBD', pagu: 12 }]);
  ok('A8 sebagian pagu Renaksi "tanpa sumber" → hanya total dibandingkan', !h2.sub[0].cekPerSumber && !melampaui(h2.sub[0]));
  const h3 = bandingPaguRenaksi([sub([['APBD', 10]])], [{ tab: 'GAJI', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'APBD', pagu: 13 }]);
  ok('A9 total lebih ikut disebut', h3.sub[0].lebihTotal === 3 && kalimatLebih(h3.sub[0]) === 'APBD lebih Rp 3 · total lebih Rp 3');
  const h4 = bandingPaguRenaksi([sub(null)], [{ tab: 'GAJI', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'APBD', pagu: 999 }]);
  ok('A10 pagu Renaksi kosong = tanpa batas', !melampaui(h4.sub[0]) && h4.sub[0].sisa === null);
  const h5 = bandingPaguRenaksi([sub([['APBD', 10]])], [{ tab: 'GAJI', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'LAIN', sumber: 'APBD', pagu: 5 }]);
  ok('A11 sub kegiatan RKO yang tidak ada di Renaksi → "di luar Rencana Aksi", tidak diperiksa',
    h5.diLuarRenaksi.length === 1 && h5.diLuarRenaksi[0].sub_kegiatan === 'LAIN' && !melampaui(h5.sub[0]));
  const h6 = bandingPaguRenaksi([sub([['APBD', 10]])], [{ tab: 'BLUD', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'BLUD', pagu: 1 }]);
  ok('A12 sumber yang tidak direncanakan di Renaksi ikut lebih (pagu Renaksi sumber itu 0)',
    h6.sub[0].lebih.length === 1 && h6.sub[0].lebih[0].sumber === 'BLUD' && h6.sub[0].lebihTotal === 0);
  const h7 = bandingPaguRenaksi([sub([['APBD', 10]])], [{ tab: 'GAJI', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: '', pagu: 12 }]);
  ok('A13 RKO dari rekening tanpa sumber dana hanya kena pembanding total', h7.sub[0].lebih.length === 0 && h7.sub[0].lebihTotal === 2);

  const rows: BarisPagu[] = [
    { id: 1, level: 'sub-kegiatan', program: 'P', kegiatan: 'K', sub_kegiatan: 'S', tujuan: null, sasaran: null, induk_indikator_id: null, anggaran_nominal: 2, pagu_rincian: [{ sumber: 'APBD', pagu: 2, pagu_perubahan: null }] },
    { id: 2, level: 'sub-kegiatan', program: 'P', kegiatan: 'K', sub_kegiatan: 'S', tujuan: null, sasaran: null, induk_indikator_id: null, anggaran_nominal: 3, pagu_rincian: [{ sumber: 'APBD', pagu: 1, pagu_perubahan: 3 }] },
    { id: 3, level: 'sub-kegiatan', program: 'P', kegiatan: 'K', sub_kegiatan: 'T', tujuan: null, sasaran: null, induk_indikator_id: null, anggaran_nominal: null, pagu_rincian: [] },
  ];
  const ps = paguSubKegiatan(rows);
  ok('A14 pagu sub kegiatan Renaksi = Σ pagu berlaku indikatornya; sub tanpa pagu tetap ada (null)',
    ps.length === 2 && ps.find(x => x.sub_kegiatan === 'S')?.pagu?.total === 5 && ps.find(x => x.sub_kegiatan === 'T')?.pagu === null);
  ok('A15 kunci sub kegiatan sama dari kedua modul', kunciSub('PROG ***', 'Keg', ' sub ') === kunciSub('prog', 'KEG', 'SUB'));
}

// ── B. Sumber dana Renaksi → Master Rekening (pembanding yang sudah ada) ──────
console.log('B. Sumber dana di pembanding Master ↔ Renaksi');
{
  const renaksi = [
    { level: 'program', program: 'P', kegiatan: null, sub_kegiatan: null },
    { level: 'sumber', program: 'APBD', kegiatan: null, sub_kegiatan: null },
    { level: 'sumber', program: 'BLUD', kegiatan: null, sub_kegiatan: null },
  ];
  const master = [
    { id: 1, tipe: 'program' as const, nama: 'P', program_ref: null, kegiatan_ref: null, subkegiatan_ref: null, asal: 'RENAKSI' as const },
    { id: 2, tipe: 'sumber_anggaran' as const, nama: 'apbd', program_ref: null, kegiatan_ref: null, subkegiatan_ref: null, asal: 'MANUAL' as const },
    { id: 3, tipe: 'sumber_anggaran' as const, nama: 'DAK', program_ref: null, kegiatan_ref: null, subkegiatan_ref: null, asal: 'RENAKSI' as const },
    { id: 4, tipe: 'sumber_anggaran' as const, nama: 'HIBAH', program_ref: null, kegiatan_ref: null, subkegiatan_ref: null, asal: 'MANUAL' as const },
  ];
  const h = bandingRenaksi(master, renaksi, []);
  ok('B1 sumber dana Renaksi yang belum ada di Master → baru (bertipe sumber_anggaran)',
    h.baru.length === 1 && h.baru[0].tipe === 'sumber_anggaran' && h.baru[0].nama === 'BLUD', JSON.stringify(h.baru));
  ok('B2 sumber manual yang dipakai Renaksi → ditawarkan bertanda (beda huruf tetap cocok)', h.belumBertanda.some(e => e.id === 2));
  ok('B3 sumber bertanda Renaksi yang tidak dipakai lagi → hilang (ditawarkan "jadikan manual")', h.hilang.some(e => e.id === 3));
  ok('B4 sumber manual yang tidak ada di Renaksi tidak disebut sama sekali',
    ![...h.baru, ...h.hilang, ...h.belumBertanda].some(e => e.nama === 'HIBAH'));
  ok('B5 jalurAdaDiRenaksi mengenali sumber dana', jalurAdaDiRenaksi(master[1], renaksi) && !jalurAdaDiRenaksi(master[3], renaksi));
  ok('B6 PK (tanpa baris sumber) tidak menerima entri sumber', bandingRenaksi(master.slice(0, 1), renaksi.slice(0, 1), []).baru.length === 0);
}

// ── E. Pagar Simpan: aturan murni (Tahap C/D) ─────────────────────────────────
console.log('E. Pelanggaran baru vs yang sudah ada');
{
  const banding = (rkoApbd: number, rkoTanpa = 0) => bandingPaguRenaksi([sub([['APBD', 10]])], [
    { tab: 'GAJI', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'APBD', pagu: rkoApbd },
    ...(rkoTanpa ? [{ tab: 'BLUD', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: '', pagu: rkoTanpa }] : []),
  ]);
  ok('E1 belum melampaui → melampaui: ditahan', pelanggaranBaru(banding(9), banding(12)).length === 1);
  ok('E2 sudah melampaui & tidak berubah: tidak menahan', pelanggaranBaru(banding(12), banding(12)).length === 0);
  ok('E3 sudah melampaui lalu membaik: tidak menahan', pelanggaranBaru(banding(13), banding(12)).length === 0);
  ok('E4 sudah melampaui lalu memburuk (per sumber): ditahan', pelanggaranBaru(banding(12), banding(13)).length === 1);
  ok('E5 memburuk hanya di total (RKO tanpa sumber dana bertambah): ditahan',
    pelanggaranBaru(banding(11, 1), banding(11, 3)).length === 1);
  const sumberBaru = bandingPaguRenaksi([sub([['APBD', 10]])], [
    { tab: 'GAJI', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'APBD', pagu: 12 },
    { tab: 'BLUD', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'BLUD', pagu: 1 },
  ]);
  ok('E6 sumber lain ikut lebih sementara yang lama tetap: ditahan', pelanggaranBaru(banding(12), sumberBaru).length === 1);
  ok('E7 sub kegiatan yang tidak ada di potret lama dinilai baru', pelanggaranBaru({ sub: [], diLuarRenaksi: [] }, banding(12)).length === 1);
  ok('E8 alasan minimal ALASAN_PAGU_MIN huruf, spasi tidak dihitung',
    ALASAN_PAGU_MIN === 10 && !alasanPaguSah('  123456789  ') && alasanPaguSah('1234567890') && !alasanPaguSah(null));
  const r = ringkasPelanggaran(pelanggaranBaru(banding(9), banding(12)));
  ok('E9 ringkasan ke layar tanpa rincian rekening', r.length === 1 && Object.keys(r[0]).sort().join() === 'kalimat,kegiatan,program,sub_kegiatan'
    && r[0].kalimat === 'melebihi pagu Rencana Aksi: APBD lebih Rp 2 · total lebih Rp 2', JSON.stringify(r));
}

// ── G. Murni dengan murni, perubahan dengan perubahan ─────────────────────────
// docs/CONCEPT-renaksi-rko-murni-perubahan.md §3 & keputusan §6.
console.log('G. Dua pembanding (murni & perubahan)');
{
  const baris = (id: number, nama: string, rincian: BarisPagu['pagu_rincian'], nominal: number | null = null): BarisPagu => ({
    id, level: 'sub-kegiatan', program: 'P', kegiatan: 'K', sub_kegiatan: nama, tujuan: null, sasaran: null,
    induk_indikator_id: null, anggaran_nominal: nominal, pagu_rincian: rincian,
  });
  const rows = [
    baris(1, 'S', [{ sumber: 'APBD', pagu: 2, pagu_perubahan: null }]),
    baris(2, 'S', [{ sumber: 'APBD', pagu: 1, pagu_perubahan: 3 }, { sumber: 'BLUD', pagu: null, pagu_perubahan: 4 }]),
    baris(3, 'T', [{ sumber: 'BLUD', pagu: null, pagu_perubahan: 7 }]),
    baris(4, 'U', [], 6),
  ];
  const m2 = paguSendiri(rows[1], 'murni');
  ok('G1 pagu murni satu baris = kolom Murni saja; sumber yang lahir di Perubahan tidak ikut',
    m2?.total === 1 && m2.perSumber.length === 1 && paguSendiri(rows[1])?.total === 7, JSON.stringify(m2));
  const pm = paguSubKegiatan(rows, 'murni');
  const pb = paguSubKegiatan(rows);
  const t = (xs: typeof pm, n: string) => xs.find(x => x.sub_kegiatan === n)?.pagu?.total ?? null;
  ok('G2 pagu sub kegiatan murni vs berlaku; data lama tanpa rincian = murni sekaligus berlaku',
    t(pm, 'S') === 3 && t(pm, 'T') === null && t(pm, 'U') === 6 && t(pb, 'S') === 9 && t(pb, 'T') === 7 && t(pb, 'U') === 6,
    JSON.stringify({ pm, pb }));

  const semua = [
    rko('GAJI', 'R1', 10), rko('GAJI', 'R1', 99, { versi_tipe: 'PERUBAHAN', versi_seq: 1 }),
    rko('BLUD', 'R2', 5), rko('OBAT', 'R3', 8, { versi_tipe: 'PERUBAHAN', versi_seq: 1 }),
  ];
  const vm = versiMurniPerTab(semua);
  ok('G3 versi murni tiap tab; tab yang hanya punya perubahan tidak menyumbang ke murni',
    vm.map(r => `${r.tab}:${r.pagu}`).sort().join() === 'BLUD:5,GAJI:10' && tabBerversiPerubahan(semua).join() === 'GAJI,OBAT',
    JSON.stringify(vm));

  const ag = (tab: string, pagu: number): AgregatRko => ({ tab, program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB', sumber: 'APBD', pagu });
  const dua = (o: { murni: number; berlaku?: number; perubahan?: boolean; rkoMurni: AgregatRko[]; rkoTerbaru: AgregatRko[]; tabPerubahan?: string[] }) =>
    bandingDua({
      renaksiMurni: [sub([['APBD', o.murni]])], renaksiBerlaku: [sub([['APBD', o.berlaku ?? o.murni]])],
      renaksiPerubahan: !!o.perubahan, rkoMurni: o.rkoMurni, rkoTerbaru: o.rkoTerbaru, tabPerubahan: o.tabPerubahan ?? [],
    });
  const tahan = (a: ReturnType<typeof dua>, b: ReturnType<typeof dua>, j: JenisSimpananPagu) =>
    pelanggaranSimpanan(a, b, j).map(p => p.pembanding).join();

  const s0 = dua({ murni: 10, rkoMurni: [ag('GAJI', 9)], rkoTerbaru: [ag('GAJI', 9)] });
  const s1 = dua({ murni: 10, rkoMurni: [ag('GAJI', 12)], rkoTerbaru: [ag('GAJI', 12)] });
  const semuaJenis: JenisSimpananPagu[] = ['rko-murni', 'rko-perubahan', 'rekening', 'renaksi'];
  ok('G4 belum ada yang perubahan: satu pembanding untuk semua jenis simpanan (perilaku lama)',
    seragam(s1) && semuaJenis.every(j => pelanggaranSimpanan(s0, s1, j).length === 1)
    && pelanggaranSimpanan(s0, s1, 'rekening')[0].label === 'pagu Rencana Aksi');

  // §6 no. 1 — RKO perubahan saat Renaksi belum perubahan: tetap dibatasi pagu murni, dengan penjelasan.
  const k1a = dua({ murni: 15, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 14)], tabPerubahan: ['GAJI'] });
  const k1b = dua({ murni: 15, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 18)], tabPerubahan: ['GAJI'] });
  const p1 = pelanggaranSimpanan(k1a, k1b, 'rko-perubahan');
  ok('G5 RKO perubahan melebihi pagu murni saat Renaksi belum perubahan → ditahan & dijelaskan',
    p1.length === 1 && p1[0].pembanding === 'perubahan' && p1[0].label === 'pagu murni Rencana Aksi, untuk RKO perubahan'
    && catatanPelanggaran(p1, k1b, 2026) === kalimatBelumPerubahan(2026), JSON.stringify(p1.map(x => x.label)));

  // §6 no. 2 — pagu perubahan Renaksi diturunkan di bawah RKO yang masih murni: hanya diberitahukan.
  const k2a = dua({ murni: 15, berlaku: 15, perubahan: true, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 14)] });
  const k2b = dua({ murni: 15, berlaku: 12, perubahan: true, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 14)] });
  ok('G6 Renaksi perubahan di bawah RKO yang MASIH murni → tidak ditahan (pembanding lengkap tetap mencatatnya)',
    tahan(k2a, k2b, 'renaksi') === '' && melampaui(k2b.perubahan.sub[0]) && !melampaui(k2b.perubahanKetat.sub[0]));
  const k2c = dua({ murni: 15, berlaku: 15, perubahan: true, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 14)], tabPerubahan: ['GAJI'] });
  const k2d = dua({ murni: 15, berlaku: 12, perubahan: true, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 14)], tabPerubahan: ['GAJI'] });
  const p2 = pelanggaranSimpanan(k2c, k2d, 'renaksi');
  ok('G7 Renaksi perubahan di bawah RKO yang SUDAH perubahan → ditahan, labelnya pagu perubahan',
    p2.length === 1 && p2[0].pembanding === 'perubahan' && p2[0].label === 'pagu perubahan Rencana Aksi', JSON.stringify(p2.map(x => x.label)));
  const k2e = dua({ murni: 15, berlaku: 15, perubahan: true, rkoMurni: [ag('GAJI', 14), ag('BLUD', 3)], rkoTerbaru: [ag('GAJI', 10), ag('BLUD', 3)], tabPerubahan: ['GAJI'] });
  const k2f = dua({ murni: 15, berlaku: 12, perubahan: true, rkoMurni: [ag('GAJI', 14), ag('BLUD', 3)], rkoTerbaru: [ag('GAJI', 10), ag('BLUD', 3)], tabPerubahan: ['GAJI'] });
  ok('G7b campuran: tab yang sudah perubahan (10) masih muat di 12, tab murni (3) menyusul → tidak ditahan',
    tahan(k2e, k2f, 'renaksi') === '');

  // §6 no. 3 — menyunting RKO murni sesudah Renaksi perubahan: dinilai dengan pagu murni saja.
  const k3 = (gaji: number) => dua({ murni: 15, berlaku: 12, perubahan: true, rkoMurni: [ag('GAJI', gaji)], rkoTerbaru: [ag('GAJI', gaji)] });
  const p3 = pelanggaranSimpanan(k3(14), k3(16), 'rko-murni');
  ok('G8 RKO murni dinilai dengan pagu murni: 15 lolos walau pagu perubahan 12; 16 ditahan',
    tahan(k3(14), k3(15), 'rko-murni') === '' && p3.length === 1 && p3[0].label === 'pagu murni Rencana Aksi');

  // §6 no. 4 — pagu murni Renaksi diturunkan di bawah RKO murni yang sudah dikunci.
  const k4 = (murni: number) => dua({ murni, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 14)], tabPerubahan: ['GAJI'] });
  ok('G9 Renaksi murni di bawah RKO murni terkunci → ditahan (pembanding murni ikut)',
    tahan(k4(15), k4(13), 'renaksi') === 'murni,perubahan');

  const k5a = dua({ murni: 15, berlaku: 20, perubahan: true, rkoMurni: [ag('GAJI', 14)], rkoTerbaru: [ag('GAJI', 18)], tabPerubahan: ['GAJI'] });
  const k5b = dua({ murni: 15, berlaku: 20, perubahan: true, rkoMurni: [ag('GAJI', 16)], rkoTerbaru: [ag('GAJI', 18)], tabPerubahan: ['GAJI'] });
  ok('G10 Rekening dinilai dengan kedua pembanding; RKO perubahan hanya dengan pembanding perubahan',
    tahan(k5a, k5b, 'rekening') === 'murni' && tahan(k5a, k5b, 'rko-perubahan') === '');

  ok('G11 label pembanding', labelPembanding('murni', { renaksiPerubahan: false, tabPerubahan: [] }) === 'pagu Rencana Aksi'
    && labelPembanding('perubahan', { renaksiPerubahan: true, tabPerubahan: [] }) === 'pagu perubahan Rencana Aksi'
    && labelPembanding('murni', { renaksiPerubahan: true, tabPerubahan: [] }) === 'pagu murni Rencana Aksi');

  const rb = (xs: AgregatRko[]) => bandingPaguRenaksi([sub(null)], xs).sub[0];
  const nama = { program: 'PROG', kegiatan: 'KEG', sub_kegiatan: 'SUB' };
  const jp = (n: number) => jumlahPerSumber([{ sumber: 'APBD', nilai: n }]);
  const tr = terpakaiRkoSub({
    sub: nama, layarMurni: jp(20), layarBerlaku: jp(12),
    rkoMurni: rb([ag('GAJI', 9), ag('BLUD', 3)]), rkoBerlaku: rb([ag('GAJI', 2), ag('BLUD', 14)]), rkoKetat: rb([ag('GAJI', 2)]),
    renaksiPerubahan: true, tabPerubahan: ['GAJI'],
  });
  ok('G12 Terpakai di RKO: lebih karena tab yang masih murni → bukan kelebihan yang menahan',
    !!tr && !tr.seragam && !tr.murni.lebih && tr.berlaku.lebih === 'APBD lebih Rp 4 · total lebih Rp 4' && tr.ketatLebih === null
    && JSON.stringify(tr.tabMasihMurni) === '[{"tab":"BLUD","nilai":14}]', JSON.stringify(tr));
  const tr2 = terpakaiRkoSub({
    sub: nama, layarMurni: jp(20), layarBerlaku: jp(12),
    rkoMurni: rb([ag('GAJI', 9)]), rkoBerlaku: rb([ag('GAJI', 13)]), rkoKetat: rb([ag('GAJI', 13)]),
    renaksiPerubahan: true, tabPerubahan: ['GAJI'],
  });
  ok('G13 Terpakai di RKO: tab yang sudah perubahan melebihi → kelebihan yang menahan', tr2?.ketatLebih === 'APBD lebih Rp 1 · total lebih Rp 1');
  ok('G14 Terpakai di RKO: tanpa RKO sama sekali → tidak tampil',
    terpakaiRkoSub({ sub: nama, layarMurni: jp(1), layarBerlaku: jp(1), renaksiPerubahan: false, tabPerubahan: [] }) === null);
  ok('G15 gabungNama', gabungNama(['GAJI']) === 'GAJI' && gabungNama(['GAJI', 'BLUD']) === 'GAJI dan BLUD'
    && gabungNama(['A', 'B', 'C']) === 'A, B, dan C');
}

// ── D. Sambungan kode ─────────────────────────────────────────────────────────
console.log('D. Sambungan kode');
{
  const kode = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const pita = kode('components/kinerja/PaguRenaksiPita.tsx');
  ok('D1 pita RKO: tab yang dibuka dari isi layar, tab lain dari server, lewat aturan yang sama (dua pembanding)',
    pita.includes("rkoMurni: layarTerbaru && versiTipe === 'MURNI' ? ganti(bahan.rkoMurni, tab, layar) : bahan.rkoMurni,")
    && pita.includes('rkoTerbaru: layarTerbaru ? ganti(bahan.rkoTerbaru, tab, layar) : bahan.rkoTerbaru,')
    && pita.includes('const h = bandingDua({')
    && pita.includes("const utama = versiTipe === 'MURNI' && !satu ? h.murni : h.perubahan;"));
  const ssk = kode('app/(dashboard)/kinerja/_tabs/SskTab.tsx');
  ok('D2 isi layar hanya dipakai bila versi yang dibuka = versi terbaru & tidak terkunci',
    ssk.includes('layarTerbaru={!versiLocked && !!versiTerbaru && versiTerbaru.versi_tipe === sskVersi.tipe && versiTerbaru.versi_seq === sskVersi.seq}')
    && ssk.includes('versiTipe={sskVersi.tipe}'));
  ok('D2b dialog Buat Perubahan menyebut Renaksi yang belum memasuki anggaran perubahan',
    ssk.includes('{bahanPagu && !bahanPagu.renaksiPerubahan && (') && ssk.includes('kalimatBelumPerubahanBuat(tahun)'));
  const kmu = kode('lib/data/kinerja-master-ubah.ts');
  const kin = kode('lib/data/kinerja.ts');
  ok('D3 pembanding, pagar tanda, warisan tanda, dan Init membaca Renaksi lewat SATU pembaca (dengan baris sumber)',
    (kmu.match(/barisRenaksiPembanding\(/g) ?? []).length === 3 && kin.includes('await barisRenaksiPembanding(sql, tahunNum)')
    && !/level IN \('program','kegiatan','sub-kegiatan'\)/.test(kmu));

  // Tahap C/D: tiap jalur = kunci tahun Renaksi PERTAMA → potret → tulis → pagar (L84).
  const badan = (s: string, kepala: string) => { const i = s.indexOf(kepala); return i < 0 ? '' : s.slice(i, s.indexOf('\n}\n', i)); };
  const urut = (s: string, ...p: string[]) => p.every((x, i) => s.indexOf(x) >= 0 && (i === 0 || s.indexOf(x) > s.indexOf(p[i - 1])));
  const fSsk = badan(kin, 'export async function saveSskBatch(');
  ok('D4 Simpan RKO: kunci tahun Renaksi → kunciVersiSsk → potret → DELETE → pagar',
    urut(fSsk, 'await kunciTahunRenaksi(tx, Number(tahun));', 'await kunciVersiSsk(tx, tahun, sumber);', 'potretPaguRenaksi(tx, Number(tahun))',
      'DELETE FROM kinerja_ssk', 'pagarPaguRenaksi(tx, Number(tahun), paguSebelum, alasanPaguRenaksi,')
    && fSsk.includes("versiTipe === 'PERUBAHAN' ? 'rko-perubahan' : 'rko-murni'"));
  const fRek = badan(kin, 'export async function saveRekeningBatch(');
  ok('D5 Simpan Rekening: urutan sama, pagar juga untuk simpanan kosong (tanpa return dini)',
    urut(fRek, 'await kunciTahunRenaksi(tx, Number(tahun));', 'await kunciVersiSsk(tx, tahun, sumber);', 'potretPaguRenaksi(tx, Number(tahun))',
      'DELETE FROM kinerja_rekening', "pagarPaguRenaksi(tx, Number(tahun), paguSebelum, alasanPaguRenaksi, 'rekening')")
    && !fRek.includes('if (rows.length === 0) return'));
  const ra = kode('lib/data/rencana-aksi.ts');
  const fHapus = badan(ra, 'export async function deleteRencanaAksi(');
  ok('D6 Hapus Renaksi: kunci tahun pertama, potret sebelum DELETE, pagar sesudahnya',
    urut(fHapus, 'await kunciTahunRenaksi(tx, Number(row.tahun));', 'potretPaguRenaksi(tx, Number(row.tahun))', 'DELETE FROM rencana_aksi WHERE id', 'pagarPaguRenaksi('));
  ok('D7 Simpan Renaksi (baris ada & baru) & Hapus dipagari sebagai simpanan Renaksi',
    (ra.match(/pagarPaguRenaksi\(tx, /g) ?? []).length === 3 && (ra.match(/alasan(_pagu_renaksi|Pagu), 'renaksi'\)/g) ?? []).length === 3);
  const imp = kode('lib/renaksi/import-data.ts');
  ok('D8 Impor: kunci tahun → potret → siapkanImpor; pagar sebelum hasil dipulangkan',
    urut(badan(imp, 'export async function commitImportRenaksi('), 'await kunciTahunRenaksi(tx, tahun);', 'potretPaguRenaksi(tx, tahun)', 'siapkanImpor(', "pagarPaguRenaksi(tx, tahun, paguSebelum, alasanPagu, 'renaksi')"));
  const rute = ['app/api/kinerja/ssk/route.ts', 'app/api/kinerja/rekening/route.ts', 'app/api/rencana-aksi/route.ts', 'app/api/rencana-aksi/import/route.ts'].map(kode);
  ok('D9 empat route: 409 lewat jawabPaguTerlampaui & audit PAGU_RENAKSI_DITEMBUS',
    rute.every(s => /instanceof PaguRenaksiTerlampauiError\) return jawabPaguTerlampaui\(/.test(s) && s.includes("eventType: 'PAGU_RENAKSI_DITEMBUS'")));
  ok('D10 alasan hapus lewat BADAN, bukan alamat (alamat masuk log server)',
    !/searchParams\.get\('alasan/.test(rute[2]) && rute[2].includes('badan?.alasan_pagu_renaksi'));
  const layar = ['app/(dashboard)/kinerja/_tabs/SskTab.tsx', 'app/(dashboard)/kinerja/_tabs/RekeningTab.tsx',
    'app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx', 'app/(dashboard)/rencana-aksi/_components/ImportRenaksiModal.tsx'].map(kode);
  ok('D11 empat layar menanyakan alasan lewat SATU dialog', layar.every(s => s.includes('tanyaAlasanPagu(')));
  ok('D12 retensi audit menggolongkan PAGU_RENAKSI_DITEMBUS', /PAGU_RENAKSI_DITEMBUS: P/.test(kode('lib/security/retensi-audit.ts')));
}

// ── C. MySQL kotak pasir ──────────────────────────────────────────────────────
console.log('C. MySQL (kotak pasir 2075)');
const { sql, queryOne } = await import('../lib/data/db');
const { upsertRencanaAksi } = await import('../lib/data/rencana-aksi');
const { bandingPaguTahun } = await import('../lib/data/pagu-renaksi-rko');
const { initMasterFromRenaksi } = await import('../lib/data/kinerja');
const T = 2075;
const bersih = async () => {
  await sql`DELETE FROM rencana_aksi WHERE tahun = ${T}`;
  await sql`DELETE FROM renaksi_pagu_perubahan WHERE tahun = ${T}`;
  // Buat Perubahan (bagian H) melahirkan foto realisasi, kunci versi perubahan, dan parent_versi_id.
  await sql`DELETE FROM kinerja_realisasi_foto WHERE tahun = ${String(T)}`;
  await sql`UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_ssk WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_realisasi WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_bulan_tutup WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_rekening WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_master WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_riwayat_simpan WHERE tahun = ${String(T)}`;
  // L92: hanya gembok uji yang persis.
  await sql`DELETE FROM blud_locks WHERE entity = 'RA_TAHUN' AND key_id = ${String(T)}`;
  for (const s of ['GAJI', 'BLUD']) {
    await sql`DELETE FROM blud_locks WHERE entity IN ('kinerja_versi_ssk', 'kinerja_realisasi') AND key_id = ${`${T}:${s}`}`;
    for (const v of ['MURNI:0', 'PERUBAHAN:1']) await sql`DELETE FROM blud_locks WHERE entity = 'kinerja_ssk' AND key_id = ${`${T}:${s}:${v}`}`;
  }
};
await bersih();
try {
  const uid = Number((await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`))!.id);
  const d = { tahun: T, jenis: 'Akumulatif' as const, satuan: '%', target_rpjmd: 1, target_tahunan: 1, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 1 };
  const s = { ...d, level: 'sub-kegiatan' as const, program: 'PROG UJI', kegiatan: 'KEG UJI', sub_kegiatan: 'SUB UJI' };
  await upsertRencanaAksi({ ...s, indikator: 'I1', pagu_rincian: [{ sumber: 'APBD', pagu: 10_000_000, pagu_perubahan: null }] }, uid);
  await upsertRencanaAksi({ ...s, indikator: 'I2', pagu_rincian: [{ sumber: 'BLUD', pagu: 5_000_000, pagu_perubahan: null }] }, uid);
  const ssk = (sumber: string, cid: string, uraian: string, pagu: number, tipe = 'MURNI', seq = 0, nol = 0) => sql`
    INSERT INTO kinerja_ssk (tahun, sumber, versi_tipe, versi_seq, canonical_id, uraian_ssk, uraian, program, kegiatan, subkegiatan, pagu, is_nullified)
    VALUES (${String(T)}, ${sumber}, ${tipe}, ${seq}, ${cid}, 'SSK UJI', ${uraian}, 'PROG UJI ***', 'KEG UJI', 'SUB UJI', ${pagu}, ${nol})`;
  await ssk('GAJI', 'UJIP-1', 'Belanja A', 9_000_000);
  await ssk('GAJI', 'UJIP-1', 'Belanja A', 12_000_000, 'PERUBAHAN', 1);
  await ssk('BLUD', 'UJIP-2', 'Belanja B', 2_000_000);
  await ssk('BLUD', 'UJIP-3', 'Belanja C', 8_000_000, 'MURNI', 0, 1);
  await sql`INSERT INTO kinerja_rekening (tahun, sumber, uraian, uraian_ssk, sumber_anggaran, program, kegiatan, subkegiatan)
    VALUES (${String(T)}, 'GAJI', 'Belanja A', 'SSK UJI', 'APBD', 'PROG UJI', 'KEG UJI', 'SUB UJI'),
           (${String(T)}, 'BLUD', 'Belanja B', 'SSK UJI', 'BLUD', 'PROG UJI', 'KEG UJI', 'SUB UJI')`;
  const h = await bandingPaguTahun(sql, T);
  const b = h.perubahan.sub.find(x => x.sub_kegiatan === 'SUB UJI');
  ok('C1 data sungguhan: GAJI Perubahan-1 (12 jt) dipakai, BLUD dinol-kan tidak dihitung, APBD lebih 2 jt',
    !!b && b.rko.total === 14_000_000 && b.renaksi?.total === 15_000_000 && kalimatLebih(b) === 'APBD lebih Rp 2.000.000',
    JSON.stringify(b));
  const bm = h.murni.sub.find(x => x.sub_kegiatan === 'SUB UJI');
  ok('C1b pembanding murni: GAJI murni (9 jt) + BLUD (2 jt) = 11 jt, tidak lebih',
    !!bm && bm.rko.total === 11_000_000 && !melampaui(bm) && h.tabPerubahan.join() === 'GAJI' && !h.renaksiPerubahan, JSON.stringify(bm));

  const hasil = await initMasterFromRenaksi(String(T), uid, false);
  const m = await sql`SELECT nama, asal FROM kinerja_master WHERE tahun = ${String(T)} AND tipe = 'sumber_anggaran' ORDER BY nama` as Array<{ nama: string; asal: string }>;
  ok('C2 Init dari Renaksi membuat sumber dana di Master Rekening bertanda RENAKSI',
    hasil.sumberInserted === 2 && m.map(x => `${x.nama}:${x.asal}`).join() === 'APBD:RENAKSI,BLUD:RENAKSI', JSON.stringify({ hasil, m }));
  const ulang = await initMasterFromRenaksi(String(T), uid, true);
  ok('C3 Init ulang tidak menggandakan', ulang.sumberInserted === 0 && ulang.sumberSkipped === 2);
} finally {
  await bersih();
  const [sisa] = await sql`SELECT (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ${T}) + (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ${String(T)})
    + (SELECT COUNT(*) FROM kinerja_master WHERE tahun = ${String(T)}) + (SELECT COUNT(*) FROM kinerja_rekening WHERE tahun = ${String(T)}) AS n` as Array<{ n: number }>;
  ok('C4 kotak pasir bersih kembali', Number(sisa.n) === 0);
}

// ── F. Pagar Simpan di MySQL (Tahap C/D) ──────────────────────────────────────
console.log('F. Pagar Simpan (kotak pasir 2075)');
const { getRencanaAksiById, deleteRencanaAksi } = await import('../lib/data/rencana-aksi');
const { commitImportRenaksi } = await import('../lib/renaksi/import-data');
const { PaguRenaksiTerlampauiError } = await import('../lib/data/pagu-renaksi-rko');
const K = await import('../lib/data/kinerja');
const mysql = (await import('mysql2/promise')).default;
const ALASAN = 'pagu Renaksi belum diperbarui sesudah perubahan';
const galat = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return 'TIDAK-DITOLAK'; } catch (e) { return e instanceof PaguRenaksiTerlampauiError ? `PAGU:${e.pelanggaran.length}` : `LAIN:${(e as Error).message}`; }
};
await bersih();
try {
  const uid = Number((await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`))!.id);
  const d = { tahun: T, jenis: 'Akumulatif' as const, satuan: '%', target_rpjmd: 1, target_tahunan: 1, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 1 };
  const s = (nama: string) => ({ ...d, level: 'sub-kegiatan' as const, program: 'PROG UJI', kegiatan: 'KEG UJI', sub_kegiatan: nama });
  const R = (sumber: string, pagu: number) => ({ sumber, pagu, pagu_perubahan: null });
  const rekening = (tab: string, uraian: string, sumberDana: string, subNama: string) => sql`
    INSERT INTO kinerja_rekening (tahun, sumber, uraian, uraian_ssk, sumber_anggaran, program, kegiatan, subkegiatan)
    VALUES (${String(T)}, ${tab}, ${uraian}, 'SSK UJI', ${sumberDana}, 'PROG UJI', 'KEG UJI', ${subNama})`;
  const rko = (cid: string, uraian: string, subNama: string, pagu: number) => ({
    canonical_id: cid, uraian_ssk: 'SSK UJI', uraian, program: 'PROG UJI', kegiatan: 'KEG UJI', subkegiatan: subNama,
    pagu, months: K.emptyMonths(), months_pct: K.emptyMonths(), total: 0, total_pct: 0, urut: 0, is_nullified: false,
  });
  const simpanRko = (tab: 'GAJI' | 'BLUD', baris: ReturnType<typeof rko>[], alasan: string | null = null) =>
    K.saveSskBatch(String(T), tab, baris, uid, 'MURNI', 0, undefined, false, false, alasan);
  const paguRko = async (cid: string) => Number((await queryOne<{ p: number }>(sql`SELECT pagu AS p FROM kinerja_ssk WHERE tahun = ${String(T)} AND canonical_id = ${cid}`))?.p ?? -1);
  const ubahRenaksi = async (id: number, extra: Record<string, unknown>, hasil?: { gantiNama: null; paguDitembus?: PelanggaranPagu[] }) => {
    const r = (await getRencanaAksiById(id))!;
    return upsertRencanaAksi({ ...s(r.sub_kegiatan!), indikator: r.indikator, id, expected_version: r.version, ...extra }, uid, hasil);
  };
  const totalRenaksi = async (id: number) => Number((await getRencanaAksiById(id))?.anggaran_nominal ?? -1);

  // RKO tab GAJI menuju sub kegiatan yang pagu Renaksinya APBD 10 jt.
  const i1 = await upsertRencanaAksi({ ...s('SUB UJI'), indikator: 'I1', pagu_rincian: [R('APBD', 10_000_000)] }, uid);
  await rekening('GAJI', 'Belanja A', 'APBD', 'SUB UJI');
  ok('F1 RKO di bawah pagu: tersimpan, tidak ada yang ditembus', (await simpanRko('GAJI', [rko('UJIC-A', 'Belanja A', 'SUB UJI', 9_000_000)])).length === 0);
  ok('F2 RKO menjadi melampaui → ditolak', await galat(() => simpanRko('GAJI', [rko('UJIC-A', 'Belanja A', 'SUB UJI', 12_000_000)])) === 'PAGU:1');
  ok('F3 penolakan membatalkan seluruh transaksi', await paguRko('UJIC-A') === 9_000_000);
  ok('F4 alasan terlalu pendek tetap ditolak', await galat(() => simpanRko('GAJI', [rko('UJIC-A', 'Belanja A', 'SUB UJI', 12_000_000)], 'pendek')) === 'PAGU:1');
  const tembus = await simpanRko('GAJI', [rko('UJIC-A', 'Belanja A', 'SUB UJI', 12_000_000)], ALASAN);
  ok('F5 diteruskan dengan alasan: tersimpan & kelebihannya dipulangkan untuk audit',
    tembus.length === 1 && kalimatLebih(tembus[0]) === 'APBD lebih Rp 2.000.000 · total lebih Rp 2.000.000' && await paguRko('UJIC-A') === 12_000_000,
    JSON.stringify(tembus.map(kalimatLebih)));
  ok('F6 kelebihan lama yang tidak memburuk tidak menahan simpanan berikutnya',
    (await simpanRko('GAJI', [rko('UJIC-A', 'Belanja A', 'SUB UJI', 12_000_000)])).length === 0);
  ok('F7 kelebihan yang memburuk ditahan lagi', await galat(() => simpanRko('GAJI', [rko('UJIC-A', 'Belanja A', 'SUB UJI', 13_000_000)])) === 'PAGU:1');

  // Tahap D: dari arah Renaksi.
  ok('F8 menurunkan pagu Renaksi sampai lebih buruk → ditolak, pagu tetap',
    await galat(() => ubahRenaksi(i1, { pagu_rincian: [R('APBD', 8_000_000)] })) === 'PAGU:1' && await totalRenaksi(i1) === 10_000_000);
  const hNaik: { gantiNama: null; paguDitembus?: PelanggaranPagu[] } = { gantiNama: null };
  await ubahRenaksi(i1, { pagu_rincian: [R('APBD', 11_000_000)] }, hNaik);
  ok('F9 menaikkan pagu (masih lebih, tapi membaik) diterima tanpa alasan', await totalRenaksi(i1) === 11_000_000 && (hNaik.paguDitembus ?? []).length === 0);
  const hTurun: { gantiNama: null; paguDitembus?: PelanggaranPagu[] } = { gantiNama: null };
  await ubahRenaksi(i1, { pagu_rincian: [R('APBD', 9_000_000)], alasan_pagu_renaksi: ALASAN }, hTurun);
  ok('F10 menurunkan pagu dengan alasan: tersimpan & ditembus tercatat', await totalRenaksi(i1) === 9_000_000 && (hTurun.paguDitembus ?? []).length === 1);
  await ubahRenaksi(i1, { pagu_rincian: [R('APBD', 12_000_000)] });
  const i2a = await upsertRencanaAksi({ ...s('SUB UJI'), indikator: 'I2', pagu_rincian: [R('APBD', 3_000_000)] }, uid);
  const hBaik = await deleteRencanaAksi((await getRencanaAksiById(i2a))!, {});
  ok('F11 hapus yang tidak membuat RKO melampaui jalan biasa', (await getRencanaAksiById(i2a)) === null && hBaik.paguDitembus.length === 0);
  const i2 = await upsertRencanaAksi({ ...s('SUB UJI'), indikator: 'I2', pagu_rincian: [R('APBD', 3_000_000)] }, uid);
  await ubahRenaksi(i1, { pagu_rincian: [R('APBD', 10_000_000)] });
  ok('F12 hapus yang menurunkan total di bawah RKO → ditolak', await galat(async () => deleteRencanaAksi((await getRencanaAksiById(i2))!, {})) === 'PAGU:1'
    && (await getRencanaAksiById(i2)) !== null);
  const hapus = await deleteRencanaAksi((await getRencanaAksiById(i2))!, { alasanPagu: ALASAN });
  ok('F13 hapus dengan alasan: terhapus & ditembus tercatat', hapus.paguDitembus.length === 1 && (await getRencanaAksiById(i2)) === null);

  // Tahap C: sumber dana rekening menentukan sumber pagu RKO.
  await ubahRenaksi(i1, { pagu_rincian: [R('APBD', 20_000_000)] });
  const rek = await K.getRekeningRows(String(T), 'GAJI');
  const keBlud = rek.map(r => ({ ...r, sumber_anggaran: 'BLUD' }));
  ok('F14 mengganti sumber dana rekening ke sumber yang tidak direncanakan → ditolak',
    await galat(() => K.saveRekeningBatch(String(T), 'GAJI', keBlud, uid)) === 'PAGU:1'
    && (await K.getRekeningRows(String(T), 'GAJI'))[0]?.sumber_anggaran === 'APBD');
  const hRek = await K.saveRekeningBatch(String(T), 'GAJI', keBlud, uid, false, false, ALASAN);
  ok('F15 Rekening dengan alasan: tersimpan', hRek.paguDitembus.length === 1 && hRek.rows[0]?.sumber_anggaran === 'BLUD');

  // Tahap D: impor menimpa pagu "tanpa sumber" dengan angka lebih kecil.
  const i3 = await upsertRencanaAksi({ ...s('SUB DUA'), indikator: 'I3' }, uid);
  await sql`UPDATE rencana_aksi SET anggaran_nominal = 10000000 WHERE id = ${i3}`;
  await sql`INSERT INTO rencana_aksi_pagu (rencana_aksi_id, sumber, pagu) VALUES (${i3}, '', 10000000)`;
  await rekening('BLUD', 'Belanja C', 'BLUD', 'SUB DUA');
  await simpanRko('BLUD', [rko('UJIC-C', 'Belanja C', 'SUB DUA', 9_000_000)]);
  const barisImpor = (anggaran: number) => ({
    level: 'sub-kegiatan' as const, kode: null, nama: 'SUB DUA', induk_tujuan: null, induk_sasaran: null, induk_program: 'PROG UJI', induk_kegiatan: 'KEG UJI',
    outcome: null, indikator: 'I3', indikator_induk: null, satuan: '%', jenis: 'Akumulatif' as const, target_tahunan: 1,
    q: [0, 0, 0, 1] as [number, number, number, number], bulan: null, anggaran,
  });
  ok('F16 impor yang menurunkan pagu di bawah RKO → seluruh impor ditolak, pagu tetap',
    await galat(() => commitImportRenaksi(T, 'upsert', [barisImpor(5_000_000)], uid)) === 'PAGU:1' && await totalRenaksi(i3) === 10_000_000);
  const hImp = await commitImportRenaksi(T, 'upsert', [barisImpor(5_000_000)], uid, true, ALASAN);
  ok('F17 impor dengan alasan: tersimpan & ditembus tercatat', hImp.paguDitembus.length === 1 && await totalRenaksi(i3) === 5_000_000);

  // Balapan: dua tab menyimpan berbarengan, masing-masing lolos sendiri, bersama-sama melampaui.
  await sql`DELETE FROM kinerja_ssk WHERE tahun = ${String(T)}`;
  await upsertRencanaAksi({ ...s('SUB TIGA'), indikator: 'I4', pagu_rincian: [R('APBD', 10_000_000)] }, uid);
  await rekening('GAJI', 'Belanja R', 'APBD', 'SUB TIGA');
  await rekening('BLUD', 'Belanja S', 'APBD', 'SUB TIGA');
  const k = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  });
  try {
    await k.query('START TRANSACTION');
    await k.query('INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)', ['RA_TAHUN', String(T)]);
    await k.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE', ['RA_TAHUN', String(T)]);
    const tangkap = (p: Promise<unknown>) => p.then(() => 'OK', e => e instanceof PaguRenaksiTerlampauiError ? 'PAGU' : `LAIN:${(e as Error).message}`);
    const gaji = tangkap(simpanRko('GAJI', [rko('UJIC-R', 'Belanja R', 'SUB TIGA', 6_000_000)]));
    const blud = tangkap(simpanRko('BLUD', [rko('UJIC-S', 'Belanja S', 'SUB TIGA', 6_000_000)]));
    let menunggu = 0;
    for (let i = 0; i < 100 && menunggu < 2; i++) {
      // Transaksi, bukan baris: satu penunggu atas baris ber-S+X tercatat dua baris.
      const [r] = await k.query('SELECT COUNT(DISTINCT REQUESTING_ENGINE_TRANSACTION_ID) AS n FROM performance_schema.data_lock_waits') as unknown as [Array<{ n: number }>];
      menunggu = Number(r[0]?.n ?? 0);
      if (menunggu < 2) await new Promise(res => setTimeout(res, 50));
    }
    ok('F18 kedua simpanan menunggu kunci tahun Renaksi yang sama', menunggu >= 2, `menunggu=${menunggu}`);
    await k.query('COMMIT');
    const hasil = [await gaji, await blud].sort();
    ok('F19 hanya satu yang lolos; yang kedua melihat tulisan pertama dan ditolak', hasil.join() === 'OK,PAGU', hasil.join());
    const n = Number((await queryOne<{ n: number }>(sql`SELECT COALESCE(SUM(pagu), 0) AS n FROM kinerja_ssk WHERE tahun = ${String(T)} AND subkegiatan = 'SUB TIGA'`))?.n);
    ok('F20 RKO sub kegiatan itu tidak pernah melampaui', n === 6_000_000, String(n));
  } finally {
    await k.query('ROLLBACK').catch(() => {});
    await k.end();
  }
} finally {
  await bersih();
  const [sisa] = await sql`SELECT (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ${T}) + (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ${String(T)})
    + (SELECT COUNT(*) FROM kinerja_rekening WHERE tahun = ${String(T)}) + (SELECT COUNT(*) FROM kinerja_riwayat_simpan WHERE tahun = ${String(T)})
    + (SELECT COUNT(*) FROM blud_locks WHERE key_id LIKE ${`${T}%`}) AS n` as Array<{ n: number }>;
  ok('F21 kotak pasir bersih kembali', Number(sisa.n) === 0);
}

// ── H. Murni & perubahan di MySQL (kotak pasir 2075) ──────────────────────────
// Contoh docs/CONCEPT-renaksi-rko-murni-perubahan.md §3, dari awal sampai akhir lewat jalur sungguhan.
console.log('H. Murni & perubahan (kotak pasir 2075)');
const { ubahPaguPerubahan } = await import('../lib/data/rencana-aksi');
await bersih();
try {
  const uid = Number((await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`))!.id);
  const d = { tahun: T, jenis: 'Akumulatif' as const, satuan: '%', target_rpjmd: 1, target_tahunan: 1, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 1 };
  const s = { ...d, level: 'sub-kegiatan' as const, program: 'PROG UJI', kegiatan: 'KEG UJI', sub_kegiatan: 'SUB H' };
  for (const [tab, uraian] of [['GAJI', 'Belanja HA'], ['BLUD', 'Belanja HB']]) {
    await sql`INSERT INTO kinerja_rekening (tahun, sumber, uraian, uraian_ssk, sumber_anggaran, program, kegiatan, subkegiatan)
      VALUES (${String(T)}, ${tab}, ${uraian}, 'SSK UJI', 'APBD', 'PROG UJI', 'KEG UJI', 'SUB H')`;
  }
  const baris = (cid: string, uraian: string, pagu: number) => ({
    canonical_id: cid, uraian_ssk: 'SSK UJI', uraian, program: 'PROG UJI', kegiatan: 'KEG UJI', subkegiatan: 'SUB H',
    pagu, months: K.emptyMonths(), months_pct: K.emptyMonths(), total: 0, total_pct: 0, urut: 0, is_nullified: false,
  });
  const gaji = (tipe: 'MURNI' | 'PERUBAHAN', pagu: number) =>
    K.saveSskBatch(String(T), 'GAJI', [baris('UJIH-A', 'Belanja HA', pagu)], uid, tipe, tipe === 'MURNI' ? 0 : 1);
  const blud = (pagu: number) => K.saveSskBatch(String(T), 'BLUD', [baris('UJIH-B', 'Belanja HB', pagu)], uid, 'MURNI', 0);
  const id = await upsertRencanaAksi({ ...s, indikator: 'IH', pagu_rincian: [{ sumber: 'APBD', pagu: 20_000_000, pagu_perubahan: null }] }, uid);
  const ubah = async (perubahan: number, hasil?: { gantiNama: null; paguDitembus?: PelanggaranPagu[] }) => {
    const r = (await getRencanaAksiById(id))!;
    return upsertRencanaAksi({ ...s, indikator: 'IH', id, expected_version: r.version,
      pagu_rincian: [{ sumber: 'APBD', pagu: 20_000_000, pagu_perubahan: perubahan }] }, uid, hasil);
  };
  const tolak = async (fn: () => Promise<unknown>) => {
    try { await fn(); return null; } catch (e) { if (e instanceof PaguRenaksiTerlampauiError) return e; throw e; }
  };

  ok('H1 RKO murni GAJI 14 jt + BLUD 4 jt di bawah pagu murni 20 jt', (await gaji('MURNI', 14_000_000)).length === 0 && (await blud(4_000_000)).length === 0);
  await K.buatVersiPerubahan(String(T), 'GAJI', 'MURNI', 0, uid);
  const e1 = await tolak(() => gaji('PERUBAHAN', 18_000_000));
  ok('H2 Renaksi belum perubahan: RKO GAJI perubahan 18 jt (total 22 jt) ditahan dengan penjelasannya',
    !!e1 && e1.pelanggaran[0]?.pembanding === 'perubahan' && (e1.catatan ?? '').includes('belum memasuki anggaran perubahan')
    && e1.message.includes('pagu murni Rencana Aksi, untuk RKO perubahan'), e1?.message);
  await ubahPaguPerubahan(T, 'mulai', uid);
  const h3: { gantiNama: null; paguDitembus?: PelanggaranPagu[] } = { gantiNama: null };
  await ubah(24_000_000, h3);
  ok('H3 Renaksi mulai perubahan, pagu perubahan 24 jt', (h3.paguDitembus ?? []).length === 0);
  ok('H4 sesudahnya RKO GAJI perubahan 18 jt lolos (18 + BLUD murni 4 = 22 ≤ 24)', (await gaji('PERUBAHAN', 18_000_000)).length === 0);
  const h5: { gantiNama: null; paguDitembus?: PelanggaranPagu[] } = { gantiNama: null };
  // 21 jt, bukan 20: pagu berlaku sengaja beda dari pagu murni (20 jt) supaya H8 membedakan keduanya.
  await ubah(21_000_000, h5);
  ok('H5 pagu perubahan turun ke 21 jt: tidak ditahan karena yang lewat BLUD yang masih murni',
    (h5.paguDitembus ?? []).length === 0 && Number((await getRencanaAksiById(id))?.anggaran_nominal) === 21_000_000);
  const lengkap = (await bandingPaguTahun(sql, T)).perubahan.sub.find(x => x.sub_kegiatan === 'SUB H');
  ok('H5b pembanding lengkap tetap mencatat kelebihan 1 jt (untuk pemberitahuan di layar)', !!lengkap && lengkap.lebihTotal === 1_000_000);
  const e6 = await tolak(() => ubah(17_000_000));
  ok('H6 pagu perubahan 17 jt di bawah GAJI yang sudah perubahan (18 jt) → ditahan',
    !!e6 && e6.pelanggaran.length === 1 && e6.pelanggaran[0].label === 'pagu perubahan Rencana Aksi', e6?.message);
  ok('H7 BLUD murni 4 → 5 jt lolos: dinilai dengan pagu murni (14 + 5 = 19 ≤ 20)', (await blud(5_000_000)).length === 0);
  const e8 = await tolak(() => blud(7_000_000));
  ok('H8 BLUD murni 7 jt (14 + 7 = 21 > 20) → ditahan dengan pembanding murni',
    !!e8 && e8.pelanggaran.length === 1 && e8.pelanggaran[0].pembanding === 'murni' && e8.catatan === null, e8?.message);
} finally {
  await bersih();
  const [sisa] = await sql`SELECT (SELECT COUNT(*) FROM rencana_aksi WHERE tahun = ${T}) + (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ${String(T)})
    + (SELECT COUNT(*) FROM kinerja_rekening WHERE tahun = ${String(T)}) + (SELECT COUNT(*) FROM kinerja_realisasi_foto WHERE tahun = ${String(T)})
    + (SELECT COUNT(*) FROM renaksi_pagu_perubahan WHERE tahun = ${T})
    + (SELECT COUNT(*) FROM blud_locks WHERE key_id LIKE ${`${T}%`}) AS n` as Array<{ n: number }>;
  ok('H9 kotak pasir bersih kembali', Number(sisa.n) === 0);
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1); }
process.exit(0);
