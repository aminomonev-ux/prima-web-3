// scripts/test-renaksi-pagu-rko.mts — pagu Rencana Aksi dibandingkan dengan RKO E-Anggaran (tampilan, Tahap B)
// dan sumber dana Renaksi masuk Master Rekening lewat jalur Init/Perbarui (docs/CONCEPT-renaksi-pagu-rko.md §6a).
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-pagu-rko.mts
// Bagian C memakai MySQL kotak pasir 2075 (dibersihkan otomatis; tanpa --env-file GAGAL).

import { readFileSync } from 'node:fs';
import {
  agregatRko, bandingPaguRenaksi, kalimatLebih, kunciSub, melampaui, versiTerbaruPerTab,
  type BarisRkoPagu, type RekeningSumberDana,
} from '../lib/kinerja/pagu-renaksi';
import { jumlahPerSumber, paguSubKegiatan, type BarisPagu } from '../lib/renaksi/pagu';
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

// ── D. Sambungan kode ─────────────────────────────────────────────────────────
console.log('D. Sambungan kode');
{
  const kode = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const pita = kode('components/kinerja/PaguRenaksiPita.tsx');
  ok('D1 pita RKO: tab yang dibuka dari isi layar, tab lain dari server, lewat aturan yang sama',
    /layarTerbaru \? \[\.\.\.bahan\.rko\.filter\(a => a\.tab !== tab\), \.\.\.layar\] : bahan\.rko/.test(pita) && pita.includes('bandingPaguRenaksi(bahan.renaksi, rko)'));
  const ssk = kode('app/(dashboard)/kinerja/_tabs/SskTab.tsx');
  ok('D2 isi layar hanya dipakai bila versi yang dibuka = versi terbaru & tidak terkunci',
    ssk.includes('layarTerbaru={!versiLocked && !!versiTerbaru && versiTerbaru.versi_tipe === sskVersi.tipe && versiTerbaru.versi_seq === sskVersi.seq}'));
  const kmu = kode('lib/data/kinerja-master-ubah.ts');
  const kin = kode('lib/data/kinerja.ts');
  ok('D3 pembanding, pagar tanda, warisan tanda, dan Init membaca Renaksi lewat SATU pembaca (dengan baris sumber)',
    (kmu.match(/barisRenaksiPembanding\(/g) ?? []).length === 3 && kin.includes('await barisRenaksiPembanding(sql, tahunNum)')
    && !/level IN \('program','kegiatan','sub-kegiatan'\)/.test(kmu));
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
  await sql`DELETE FROM kinerja_ssk WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_rekening WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM kinerja_master WHERE tahun = ${String(T)}`;
  await sql`DELETE FROM blud_locks WHERE entity = 'RA_TAHUN' AND key_id = ${String(T)}`;
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
  const b = h.sub.find(x => x.sub_kegiatan === 'SUB UJI');
  ok('C1 data sungguhan: GAJI Perubahan-1 (12 jt) dipakai, BLUD dinol-kan tidak dihitung, APBD lebih 2 jt',
    !!b && b.rko.total === 14_000_000 && b.renaksi?.total === 15_000_000 && kalimatLebih(b) === 'APBD lebih Rp 2.000.000',
    JSON.stringify(b));

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

console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1); }
process.exit(0);
