// Smoke test detectRimaDataQuery + RAL-5/6 — jalankan: npx tsx scripts/rima-detect-test.mts
import { detectRimaDataQuery, mergeWithContext, hasDataSignalNoModule, type RimaQuery } from '../lib/sentinel/data-query';

const Y = new Date().getFullYear();
type Exp = { app: string; intent: string; tahun?: string } | null;
const cases: [string, Exp][] = [
  // ── existing behavior (regresi)
  ['berapa usulan tahun 2026?', { app: 'usulan', intent: 'rekap', tahun: '2026' }],
  ['status usulan no 001/RENBANG/2026', { app: 'usulan', intent: 'lookup' }],
  ['5 usulan termahal', { app: 'usulan', intent: 'top' }],
  ['tren usulan antar tahun', { app: 'usulan', intent: 'tren' }],
  ['apa tugasku', { app: 'summary', intent: 'inbox' }],
  ['rekap bba 2025', { app: 'bba', intent: 'rekap', tahun: '2025' }],
  ['rekap pk perubahan', { app: 'pk', intent: 'rekap' }],
  ['data dpa blud', { app: 'blud', intent: 'rekap' }],
  ['halo rima apa kabar', null],
  // ── tanda baca menempel + slang Jawa
  ['usulan sing disetujui piro?', { app: 'usulan', intent: 'rekap' }],
  ['ndelok rekap bba!', { app: 'bba', intent: 'rekap' }],
  // ── tahun relatif
  ['rekap bba tahun ini', { app: 'bba', intent: 'rekap', tahun: String(Y) }],
  ['berapa usulan tahun lalu', { app: 'usulan', intent: 'rekap', tahun: String(Y - 1) }],
  ['jumlah usulan thn ini', { app: 'usulan', intent: 'rekap', tahun: String(Y) }],
  // ── sinyal data baru
  ['jumlahnya usulan 2026 berapa ya', { app: 'usulan', intent: 'rekap', tahun: '2026' }],
  ['berapakah aset yang terealisasi', { app: 'bba', intent: 'rekap' }],
  ['progres usulan 2026', { app: 'usulan', intent: 'rekap', tahun: '2026' }],
  ['laporan kinerja lkjip 2025', { app: 'lkjip', intent: 'rekap', tahun: '2025' }],
  ['info anggaran rencana aksi', { app: 'rencana_aksi', intent: 'rekap' }],
  ['capaian kinerja tahun ini', { app: 'kinerja', intent: 'rekap', tahun: String(Y) }],
  // ── top / tren / rincian variasi baru
  ['usulan paling besar apa', { app: 'usulan', intent: 'top' }],
  ['peringkat aset terbanyak', { app: 'bba', intent: 'top' }],
  ['perbandingan tahun usulan', { app: 'usulan', intent: 'tren' }],
  ['histori usulan', { app: 'usulan', intent: 'tren' }],
  ['rincian usulan per bidang', { app: 'usulan', intent: 'rincian' }],   // bug rincian→detail
  ['detail usulan per sub bidang', { app: 'usulan', intent: 'rincian' }],
  ['sebaran aset per sumber', { app: 'bba', intent: 'rincian' }],
  // ── task / inbox variasi baru
  ['usulan yang pending', { app: 'usulan', intent: 'inbox' }],
  ['pekerjaanku apa saja', { app: 'summary', intent: 'inbox' }],
  ['apa pr saya hari ini', { app: 'summary', intent: 'inbox' }],
  ['gaweanku opo wae', { app: 'summary', intent: 'inbox' }],
  // ── keyword modul baru
  ['berapa pengajuan yang ditolak', { app: 'usulan', intent: 'rekap' }],
  ['rekap lakip 2024', { app: 'lkjip', intent: 'rekap', tahun: '2024' }],
  ['status usulanku', { app: 'usulan', intent: 'rekap' }],
  ['jumlah inventaris tahun ini', { app: 'bba', intent: 'rekap', tahun: String(Y) }],
  // ── how-to guard: JANGAN dijawab data, serahkan ke KB
  ['bagaimana cara buat usulan', null],
  ['cara lihat rekap usulan gimana', { app: 'usulan', intent: 'rekap' }], // ada sinyal keras 'rekap' → langsung jawab data
  ['panduan mengisi aset', null],
  ['langkah membuat usulan baru', null],
  ['kolom jumlah di dpa dihitung gimana', null],   // RAL-5: pertanyaan MEKANISME → KB hitung.*
  // ── RAL-5: slot status + fuzzy typo
  ['berapa usulan yang ditolak 2026', { app: 'usulan', intent: 'rekap', tahun: '2026' }],
  ['berapa usulen yang disetujui', { app: 'usulan', intent: 'rekap' }],   // typo "usulen"
  ['jumlha usulan 2025', { app: 'usulan', intent: 'rekap', tahun: '2025' }], // transposisi "jumlha"
];

// ── RAL-6: konteks multi-turn (mergeWithContext) ──
const prevRekap: RimaQuery = { app: 'usulan', intent: 'rekap', tahun: '2026' };
const mergeCases: [string, RimaQuery | null, Exp][] = [
  ['kalau 2025?', prevRekap, { app: 'usulan', intent: 'rekap', tahun: '2025' }],
  ['yang ditolak?', prevRekap, { app: 'usulan', intent: 'rekap', tahun: '2026' }],
  ['per bidang dong', prevRekap, { app: 'usulan', intent: 'rincian' }],
  ['trennya gimana', prevRekap, { app: 'usulan', intent: 'tren' }],
  ['yang termahal', prevRekap, { app: 'usulan', intent: 'top' }],
  ['halo rima apa kabar hari ini semoga sehat selalu ya', prevRekap, null], // panjang → bukan lanjutan
  ['oke makasih', prevRekap, null],                                          // tanpa slot baru
  ['kalau 2025?', null, null],                                               // tanpa konteks
];

let fail = 0;
const check = (label: string, got: RimaQuery | null, exp: Exp) => {
  const ok = exp === null
    ? got === null
    : !!got && got.app === exp.app && got.intent === exp.intent && (exp.tahun === undefined || got.tahun === exp.tahun);
  if (!ok) { fail++; console.log(`FAIL: ${label}\n  exp=${JSON.stringify(exp)}\n  got=${JSON.stringify(got)}`); }
};
for (const [q, exp] of cases) check(`"${q}"`, detectRimaDataQuery(q), exp);
for (const [q, prev, exp] of mergeCases) check(`merge "${q}"`, mergeWithContext(q, prev), exp);

// RAL-5 — klarifikasi: sinyal data keras tanpa modul → true; lainnya false
const clarifyCases: [string, boolean][] = [
  ['berapa total anggaran tahun ini', true],
  ['rekap semuanya dong', true],
  ['halo apa kabar', false],
  ['berapa usulan 2026', false],          // modul disebut → langsung dijawab
  ['cara pakai aplikasi ini', false],     // how-to
];
for (const [q, exp] of clarifyCases) {
  if (hasDataSignalNoModule(q) !== exp) { fail++; console.log(`FAIL: clarify "${q}" exp=${exp}`); }
}

const total = cases.length + mergeCases.length + clarifyCases.length;
console.log(fail === 0 ? `ALL ${total} PASS` : `${fail}/${total} FAIL`);
