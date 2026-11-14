// scripts/test-renaksi-pagu-sumber.mts — pagu Rencana Aksi per sumber dana, babak Perubahan, dan
// penjumlahan ke atas yang mengikuti tautan indikator (docs/CONCEPT-renaksi-pagu-rko.md Tahap A').
// Jalankan: npx tsx --env-file=.env.local scripts/test-renaksi-pagu-sumber.mts
// Bagian C memakai MySQL kotak pasir 2075/2076 (dibersihkan otomatis; tanpa --env-file GAGAL).

import { readFileSync } from 'node:fs';
import {
  PESAN_MURNI_BEKU, alasanTolakRincian, daftarBelumTertaut, paguBaris, paguEntitas, totalBerlaku, tulisPerSumber,
  type BarisPagu, type RincianPagu,
} from '../lib/renaksi/pagu';

let lulus = 0;
const gagal: string[] = [];
const ok = (n: string, s: unknown, k = '') => {
  if (s) { lulus++; console.log(`  ok  ${n}`); } else { gagal.push(n); console.log(`FAIL  ${n}${k ? ' — ' + k : ''}`); }
};
const R = (sumber: string, pagu: number | null, pagu_perubahan: number | null = null): RincianPagu => ({ sumber, pagu, pagu_perubahan });

// ── A. Aturan rincian ─────────────────────────────────────────────────────────
console.log('A. Aturan rincian & pembekuan Murni');
ok('A1 total berlaku = Perubahan ?? Murni', totalBerlaku([R('APBD', 10, 12), R('BLUD', 5)]) === 17);
ok('A2 tanpa angka sama sekali = null (bukan 0)', totalBerlaku([R('APBD', null)]) === null && totalBerlaku([]) === null);
ok('A3 sumber kembar (beda huruf/spasi) ditolak', !!alasanTolakRincian([R('APBD', 1), R(' apbd ', 2)], [], false));
ok('A4 kolom Perubahan sebelum babaknya dimulai ditolak', !!alasanTolakRincian([R('APBD', 1, 2)], [], false));
ok('A5 babak Murni: Murni bebas diubah', alasanTolakRincian([R('APBD', 9)], [R('APBD', 1)], false) === null);
ok('A6 babak Perubahan: Murni bersumber tidak boleh berubah', alasanTolakRincian([R('APBD', 9)], [R('APBD', 1)], true) === PESAN_MURNI_BEKU);
ok('A6b babak Perubahan: menggeser Murni antar sumber (jumlah tetap) juga ditolak',
  alasanTolakRincian([R('APBD', 6), R('BLUD', 4)], [R('APBD', 5), R('BLUD', 5)], true) === PESAN_MURNI_BEKU);
ok('A7 babak Perubahan: mengisi Perubahan boleh', alasanTolakRincian([R('APBD', 1, 9)], [R('APBD', 1)], true) === null);
ok('A8 babak Perubahan: sumber baru hanya lewat Perubahan (Murni 0 / kosong)',
  alasanTolakRincian([R('APBD', 1), R('BLUD', null, 4)], [R('APBD', 1)], true) === null
  && alasanTolakRincian([R('APBD', 1), R('BLUD', 4)], [R('APBD', 1)], true) === PESAN_MURNI_BEKU);
ok('A9 babak Perubahan: Murni "tanpa sumber" boleh diberi sumber (jumlah Murni tetap)',
  alasanTolakRincian([R('APBD', 10)], [R('', 10)], true) === null
  && alasanTolakRincian([R('APBD', 11)], [R('', 10)], true) === PESAN_MURNI_BEKU);
ok('A10 babak Perubahan: menghapus sumber ber-Murni ditolak', alasanTolakRincian([], [R('APBD', 1)], true) === PESAN_MURNI_BEKU);
ok('A11 pagu negatif / pecahan ditolak', !!alasanTolakRincian([R('APBD', -1)], [], false) && !!alasanTolakRincian([R('APBD', 1.5)], [], false));

// ── B. Penjumlahan ke atas ikut tautan indikator ─────────────────────────────
console.log('B. Penjumlahan ke atas');
{
  const b = (id: number, level: BarisPagu['level'], program: string, kegiatan: string | null, sub: string | null,
    induk: number | null, rincian?: RincianPagu[], extra: Partial<BarisPagu> = {}): BarisPagu =>
    ({ id, level, program, kegiatan, sub_kegiatan: sub, tujuan: null, sasaran: null, induk_indikator_id: induk,
      anggaran_nominal: rincian ? totalBerlaku(rincian) : null, pagu_rincian: rincian ?? null, ...extra });
  const rows: BarisPagu[] = [
    b(1, 'tujuan', 'TUJ', null, null, null),
    b(2, 'sasaran', 'SAS', null, null, 1, undefined, { tujuan: 'TUJ' }),
    b(3, 'program', 'P', null, null, 2, undefined, { sasaran: 'SAS' }),
    b(10, 'kegiatan', 'P', 'K', null, 3), b(11, 'kegiatan', 'P', 'K', null, 3),          // K berindikator dua
    b(20, 'sub-kegiatan', 'P', 'K', 'S1', 10, [R('APBD', 2_500_000)]),                  // → K ind 10
    b(21, 'sub-kegiatan', 'P', 'K', 'S1', 11, [R('APBD', 2_500_000)]),                  // → K ind 11
    b(22, 'sub-kegiatan', 'P', 'K', 'S2', null, [R('BLUD', 1_000_000)]),                // belum tertaut, K ganda
    b(23, 'sub-kegiatan', 'P', 'K', 'S3', 999, [R('BLUD', 500_000)]),                   // tautan usang
    b(12, 'kegiatan', 'P', 'K2', null, null),                                            // K2 berindikator satu
    b(24, 'sub-kegiatan', 'P', 'K2', 'S4', null, [R('APBD', 300_000, 400_000), R('BLUD', 100_000)]),
    { ...b(25, 'sub-kegiatan', 'P', 'K2', 'S5', 12), anggaran_nominal: 70_000 },        // data lama tanpa rincian
    b(30, 'kegiatan', 'P', 'YATIM', null, null), b(40, 'sub-kegiatan', 'P', 'TIDAK ADA', 'S9', null, [R('APBD', 9)]),
  ];
  const p = (id: number) => paguBaris(rows.find(r => r.id === id)!, rows);
  ok('B1 indikator kegiatan menerima anak yang tertaut kepadanya saja', p(10)?.total === 2_500_000 && p(11)?.total === 2_500_000,
    `${p(10)?.total}/${p(11)?.total}`);
  const eK = paguEntitas(rows.find(r => r.id === 10)!, rows);
  ok('B2 total entitas K tetap Σ seluruh sub kegiatannya', eK?.total.total === 6_500_000, String(eK?.total.total));
  ok('B3 anak belum tertaut / tautan usang di entitas berindikator dua = "belum tertaut", tidak dibagi',
    eK?.belumTertaut.total === 1_500_000 && tulisPerSumber(eK.belumTertaut) === 'BLUD 1.500.000', JSON.stringify(eK?.belumTertaut));
  ok('B4 entitas berindikator SATU menerima anak belum tertaut (tidak ambigu); Perubahan berlaku; data lama = tanpa sumber',
    p(12)?.total === 570_000 && tulisPerSumber(p(12)) === 'APBD 400.000 · BLUD 100.000 · Tanpa sumber 70.000', `${p(12)?.total} ${tulisPerSumber(p(12))}`);
  ok('B5 program berindikator satu = jumlah indikator kegiatannya (yang belum tertaut di K tidak naik)',
    p(3)?.total === 5_570_000, String(p(3)?.total));
  ok('B6 total entitas program = Σ seluruh sub di bawah kegiatan yang ada; sub yatim (kegiatan tak ada) tidak ikut',
    paguEntitas(rows.find(r => r.id === 3)!, rows)?.total.total === 7_070_000, String(paguEntitas(rows.find(r => r.id === 3)!, rows)?.total.total));
  ok('B7 naik sampai sasaran & tujuan lewat tautan', p(2)?.total === 5_570_000 && p(1)?.total === 5_570_000);
  ok('B8 per sumber ikut naik', tulisPerSumber(p(3)) === 'APBD 5.400.000 · BLUD 100.000 · Tanpa sumber 70.000', tulisPerSumber(p(3)));
  const belum = daftarBelumTertaut(rows);
  ok('B9 daftar "belum tertaut" hanya menyebut entitas tempat uangnya tertahan (tidak berulang di program/sasaran/tujuan)',
    belum.length === 1 && belum[0].level === 'kegiatan' && belum[0].nama === 'K' && belum[0].pagu.total === 1_500_000, JSON.stringify(belum));
  ok('B10 kegiatan tanpa sub kegiatan = null (bukan 0)', p(30) === null);
  ok('B11 sub kegiatan tanpa pagu = null', paguBaris(b(50, 'sub-kegiatan', 'P', 'K', 'S7', 10), [b(50, 'sub-kegiatan', 'P', 'K', 'S7', 10)]) === null);
}

// ── E. Unduhan Cetak membawa kolom & catatan yang sama dengan layar ──────────
console.log('E. PDF & Excel Cetak');
{
  const { buatWorkbookGabungan, buildCombinedPdf } = await import('../app/(dashboard)/rencana-aksi/_lib/exports');
  const { DEFAULT_CETAK_FILTER } = await import('../app/(dashboard)/rencana-aksi/_lib/cetak-filter');
  type RaRow = import('../app/(dashboard)/rencana-aksi/_lib/types').RaRow;
  const ra = (id: number, level: RaRow['level'], o: Partial<RaRow>): RaRow => ({
    id, tahun: 2099, level, kode: null, sasaran: null, tujuan: null, outcome_program: null, outcome_kegiatan: null, outcome_sub_kegiatan: null,
    program: 'P', kegiatan: null, sub_kegiatan: null, indikator: `I${id}`, induk_indikator_id: null, jenis: 'Akumulatif', satuan: '%',
    target_rpjmd: 100, target_tahunan: 100, q1_target: 25, q2_target: 25, q3_target: 25, q4_target: 25,
    q1_realisasi: null, q2_realisasi: null, q3_realisasi: null, q4_realisasi: null, anggaran_nominal: null,
    bulan_target: null, bulan_realisasi: null, version: 1, ...o,
  } as RaRow);
  const rows: RaRow[] = [
    ra(1, 'program', { program: 'P' }),
    ra(2, 'kegiatan', { kegiatan: 'K', induk_indikator_id: 1 }), ra(3, 'kegiatan', { kegiatan: 'K', induk_indikator_id: 1 }),
    ra(4, 'sub-kegiatan', { kegiatan: 'K', sub_kegiatan: 'S', induk_indikator_id: 2, anggaran_nominal: 4, pagu_rincian: [R('APBD', 4)] }),
    ra(5, 'sub-kegiatan', { kegiatan: 'K', sub_kegiatan: 'S2', anggaran_nominal: 7, pagu_rincian: [R('BLUD', 7)] }),
  ];
  const f = { ...DEFAULT_CETAK_FILTER, showSumberAnggaran: true };
  const wb = await buatWorkbookGabungan(rows, f);
  const ws = wb.worksheets[0];
  const kepala = (ws.getRow(1).values as unknown[]).map(v => String(v ?? ''));
  const iSumber = kepala.indexOf('Sumber Dana');
  const teks: string[] = [];
  ws.eachRow(r => teks.push((r.values as unknown[]).map(v => String(v ?? '')).join('|')));
  ok('E1 Excel: kolom "Sumber Dana" tepat sesudah Anggaran', iSumber === kepala.indexOf('Anggaran (Rp)') + 1, kepala.join('|'));
  ok('E2 Excel: catatan "belum tertaut" di bawah tabel', teks.some(t => t.includes('Catatan: Pagu Rp 7 di bawah Kegiatan "K"')), teks.slice(-2).join(' / '));
  ok('E3 Excel bawaan (tanpa pilihan Sumber Dana) tidak berubah bentuk',
    !((await buatWorkbookGabungan(rows, DEFAULT_CETAK_FILTER)).worksheets[0].getRow(1).values as unknown[]).includes('Sumber Dana'));
  const pdf = (await buildCombinedPdf(rows, 2099, f)).output();
  // Judul kolom sempit dibungkus autotable jadi dua potong teks.
  ok('E4 PDF: catatan & kolom Sumber Dana ikut', pdf.includes('Catatan: Pagu Rp 7') && pdf.includes('(Sumber)') && pdf.includes('(BLUD 7)'));
}

// ── D. Sumber kode: satu penulis, satu pembaca ────────────────────────────────
console.log('D. Satu penulis pagu');
{
  const kode = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const ra = kode('lib/data/rencana-aksi.ts');
  const imp = kode('lib/renaksi/import-data.ts');
  const tulis = kode('lib/data/renaksi-pagu.ts');
  ok('D1 Data Entry tidak lagi menulis anggaran_nominal dari isian klien', !/anggaran_nominal\s*=\s*\$\{data\./.test(ra) && !/new\.anggaran_nominal/.test(ra));
  ok('D2 Impor tidak menulis anggaran_nominal langsung', !imp.includes("'anggaran_nominal'"));
  ok('D3 satu-satunya UPDATE anggaran_nominal ada di penulis rincian', /SET anggaran_nominal = CASE id/.test(tulis)
    && [ra, imp].every(s => !/UPDATE rencana_aksi SET anggaran_nominal/.test(s)));
  ok('D4 Duplikasi Tahun ikut menyalin rincian (berlaku → Murni)', /INSERT INTO rencana_aksi_pagu[\s\S]*COALESCE\(p\.pagu_perubahan, p\.pagu\), NULL/.test(ra));
  ok('D5 mulai/batal Perubahan di bawah kunci tahun yang sama dengan simpan', /export async function ubahPaguPerubahan[\s\S]*?withTransaction\(async \(\{ tx \}\) => \{\s*await kunciTahunRenaksi\(tx, tahun\);/.test(ra));
  ok('D6 penulis rincian tidak menulis tanpa memeriksa aturan', /const alasan = alasanTolakRincian\(baru, semuaLama\.get\(id\) \?\? \[\], aktif\);\s*if \(alasan\) throw/.test(tulis));
}

// ── C. MySQL kotak pasir ──────────────────────────────────────────────────────
console.log('C. MySQL (kotak pasir 2075/2076)');
const { sql, queryOne } = await import('../lib/data/db');
const { upsertRencanaAksi, getRencanaAksiById, ubahPaguPerubahan, duplicateYear } = await import('../lib/data/rencana-aksi');
const { RaPaguError } = await import('../lib/data/renaksi-pagu');
const { commitImportRenaksi } = await import('../lib/renaksi/import-data');
const T = 2075, T2 = 2076;
const bersih = async () => {
  for (const t of [T, T2]) {
    await sql`DELETE FROM rencana_aksi WHERE tahun = ${t}`;
    await sql`DELETE FROM renaksi_pagu_perubahan WHERE tahun = ${t}`;
    await sql`DELETE FROM renaksi_ganti_nama WHERE tahun = ${t}`;
  }
  // L92: hanya gembok uji yang persis.
  await sql`DELETE FROM blud_locks WHERE entity IN ('RA_TAHUN', 'RA_DUPLIKASI') AND key_id IN (${String(T)}, ${String(T2)})`;
};
await bersih();
const kodeGalat = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return 'TIDAK-DITOLAK'; } catch (e) { return e instanceof RaPaguError ? e.kode : `LAIN:${(e as Error).message}`; }
};
try {
  const uid = Number((await queryOne<{ id: number }>(sql`SELECT id FROM users LIMIT 1`))!.id);
  const dasar = { tahun: T, jenis: 'Akumulatif' as const, satuan: '%', target_rpjmd: 1, target_tahunan: 1, q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 1 };
  const sub = { ...dasar, level: 'sub-kegiatan' as const, program: 'PROG', kegiatan: 'KEG', sub_kegiatan: 'SUB' };
  const simpan = async (id: number, extra: Record<string, unknown>) =>
    upsertRencanaAksi({ ...sub, indikator: (await getRencanaAksiById(id))!.indikator, id, expected_version: (await getRencanaAksiById(id))!.version, ...extra }, uid);
  const isi = async (id: number) => {
    const r = await getRencanaAksiById(id);
    return `${r?.anggaran_nominal}|${(r?.pagu_rincian ?? []).map(x => `${x.sumber}:${x.pagu}:${x.pagu_perubahan}`).join(',')}`;
  };

  const a = await upsertRencanaAksi({ ...sub, indikator: 'IND A', pagu_rincian: [R('APBD', 10_000_000), R(' BLUD ', 5_000_000)] }, uid);
  ok('C1 baris baru: rincian tersimpan (sumber dirapikan), anggaran_nominal = total berlaku', await isi(a) === '15000000|APBD:10000000:null,BLUD:5000000:null', await isi(a));
  await simpan(a, { satuan: 'Orang' });
  ok('C2 simpan tanpa pagu_rincian tidak menyentuh pagu (L87)', await isi(a) === '15000000|APBD:10000000:null,BLUD:5000000:null', await isi(a));
  await simpan(a, { pagu_rincian: [R('APBD', 8_000_000)], anggaran_nominal: 999 });
  ok('C3 isian anggaran_nominal klien diabaikan; total dari rincian', await isi(a) === '8000000|APBD:8000000:null', await isi(a));
  ok('C4 sumber kembar ditolak PAGU_TIDAK_SAH', await kodeGalat(() => simpan(a, { pagu_rincian: [R('APBD', 1), R('apbd', 2)] })) === 'PAGU_TIDAK_SAH');
  ok('C5 kolom Perubahan sebelum babaknya ditolak', await kodeGalat(() => simpan(a, { pagu_rincian: [R('APBD', 8_000_000, 9_000_000)] })) === 'PAGU_TIDAK_SAH');
  ok('C6 tolakan tidak meninggalkan sisa (transaksi batal)', await isi(a) === '8000000|APBD:8000000:null', await isi(a));

  const lama = await upsertRencanaAksi({ ...sub, indikator: 'IND LAMA' }, uid);
  await sql`UPDATE rencana_aksi SET anggaran_nominal = 2000000 WHERE id = ${lama}`;
  await sql`INSERT INTO rencana_aksi_pagu (rencana_aksi_id, sumber, pagu) VALUES (${lama}, '', 2000000)`;

  await ubahPaguPerubahan(T, 'mulai', uid);
  ok('C7 babak Perubahan: mengubah Murni ditolak PAGU_MURNI_BEKU', await kodeGalat(() => simpan(a, { pagu_rincian: [R('APBD', 7_000_000)] })) === 'PAGU_MURNI_BEKU');
  await simpan(a, { pagu_rincian: [R('APBD', 8_000_000, 9_500_000), R('BLUD', null, 1_000_000)] });
  ok('C8 babak Perubahan: kolom Perubahan berlaku & sumber baru lewat Perubahan', await isi(a) === '10500000|APBD:8000000:9500000,BLUD:null:1000000', await isi(a));
  await simpan(lama, { pagu_rincian: [R('APBD', 2_000_000)] });
  ok('C9 babak Perubahan: pagu lama "tanpa sumber" boleh diberi sumber', await isi(lama) === '2000000|APBD:2000000:null', await isi(lama));
  ok('C10 batal Perubahan ditolak selama ada pagu Perubahan terisi', await kodeGalat(() => ubahPaguPerubahan(T, 'batal', uid)) === 'PAGU_PERUBAHAN_TERISI');

  // Impor: berkas tanpa sumber dana.
  const baris = (indikator: string, anggaran: number | null) => ({
    level: 'sub-kegiatan' as const, kode: null, nama: 'SUB', induk_tujuan: null, induk_sasaran: null, induk_program: 'PROG', induk_kegiatan: 'KEG',
    outcome: null, indikator, indikator_induk: null, satuan: '%', jenis: 'Akumulatif' as const, target_tahunan: 1, q: [0, 0, 0, 1] as [number, number, number, number], bulan: null, anggaran,
  });
  const c = await upsertRencanaAksi({ ...sub, indikator: 'IND C' }, uid);
  const hasil = await commitImportRenaksi(T, 'upsert', [baris('IND A', 1), baris('IND C', 3_000_000), baris('IND LAMA', null)], uid);
  ok('C11 impor: pagu yang sudah bersumber tidak ditimpa & disebut', hasil.paguBersumberDilewati.join() === 'IND A' && (await isi(a)).startsWith('10500000|'),
    JSON.stringify(hasil.paguBersumberDilewati));
  ok('C12 impor di babak Perubahan: angka masuk kolom Perubahan baris tanpa sumber', await isi(c) === '3000000|:null:3000000', await isi(c));
  ok('C13 impor: sel anggaran kosong tidak menghapus pagu', await isi(lama) === '2000000|APBD:2000000:null', await isi(lama));

  await simpan(a, { pagu_rincian: [R('APBD', 8_000_000), R('BLUD', null)] });
  await simpan(c, { pagu_rincian: [] });
  await ubahPaguPerubahan(T, 'batal', uid);
  const st = await sql`SELECT COUNT(*) AS n FROM renaksi_pagu_perubahan WHERE tahun = ${T}` as Array<{ n: number }>;
  ok('C14 sesudah kolom Perubahan dikosongkan, batal Perubahan berhasil', Number(st[0].n) === 0);
  ok('C15 larik kosong = kosongkan pagu (anggaran_nominal NULL)', await isi(c) === 'null|', await isi(c));

  await ubahPaguPerubahan(T, 'mulai', uid);
  await simpan(a, { pagu_rincian: [R('APBD', 8_000_000, 6_000_000)] });
  await duplicateYear(T, T2, uid);
  const salin = await queryOne<{ id: number }>(sql`SELECT id FROM rencana_aksi WHERE tahun = ${T2} AND indikator = 'IND A'`);
  const isiSalin = await isi(Number(salin!.id));
  ok('C16 Duplikasi Tahun: pagu berlaku jadi Murni tahun baru, tanpa Perubahan; total sama', isiSalin === '6000000|APBD:6000000:null', isiSalin);
  const stBaru = await sql`SELECT COUNT(*) AS n FROM renaksi_pagu_perubahan WHERE tahun = ${T2}` as Array<{ n: number }>;
  ok('C17 tahun baru mulai di babak Murni', Number(stBaru[0].n) === 0);

  await sql`DELETE FROM rencana_aksi WHERE id = ${a}`;
  const yatim = await sql`SELECT COUNT(*) AS n FROM rencana_aksi_pagu WHERE rencana_aksi_id = ${a}` as Array<{ n: number }>;
  ok('C18 hapus baris ikut membuang rinciannya (FK CASCADE)', Number(yatim[0].n) === 0);
} finally {
  await bersih();
  const sisa = await sql`SELECT (SELECT COUNT(*) FROM rencana_aksi WHERE tahun IN (${T}, ${T2})) + (SELECT COUNT(*) FROM renaksi_pagu_perubahan WHERE tahun IN (${T}, ${T2})) AS n` as Array<{ n: number }>;
  ok('C19 kotak pasir bersih kembali', Number(sisa[0].n) === 0);
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1); }
process.exit(0);
