// lib/sentinel/data-query.ts — klien Q&A data-aware Rima F6a (multi-modul:
// usulan/bba/pk). Deteksi pertanyaan-data terpola lalu panggil GET /api/rima/query.
// Slot di sini hanya MEMILIH BENTUK pertanyaan — server (session.role) yang
// menentukan akses (L60/G20). Render jawaban di RimaChat (text node, G4); angka
// dari server (anti halusinasi, tak ada LLM). Pisah fetch/.json + try/catch.

import { SYNONYMS } from '@/lib/sentinel/nlu/normalize.mjs';

export type RimaApp = 'usulan' | 'bba' | 'pk' | 'lkjip' | 'blud' | 'kinerja' | 'rencana_aksi';
/** target klien: app modul tunggal, atau 'summary' (Tugasku lintas-modul). */
export type RimaTarget = RimaApp | 'summary';
export interface RimaQuery { app: RimaTarget; intent: string; tahun?: string; no?: string; jenis?: string; topn?: string }

interface RekapRow { status: string; label: string; count: number; nilai?: number; rencana?: number; realisasi?: number; sub_bidang?: string; sumber?: string }
interface RimaData {
  kind: 'rekap' | 'lookup' | 'top' | 'tren' | 'inbox' | 'summary' | 'rincian';
  // rekap (semua app)
  tahun?: string | null; total?: number; rows?: RekapRow[];
  // rekap bba
  totalRencana?: number; totalRealisasi?: number;
  // rekap rencana aksi
  totalNilai?: number;
  // rekap pk
  jenis_pk?: string | null;
  // lookup usulan
  found?: boolean; no_usulan?: string; status?: string; label?: string; jumlah_item?: number; total_nilai?: number;
  // lookup bba
  canonical_id?: string; nilai_rencana?: number; nilai_realisasi?: number;
  // #3 top / tren (usulan + bba)
  items?: { no_usulan?: string; canonical_id?: string; status?: string; label: string; total_nilai?: number; nilai_rencana?: number; nilai_realisasi?: number }[];
  years?: { tahun: string; count: number; nilai: number; realisasi?: number }[];
  // #4 inbox proaktif + summary lintas-modul
  aksi?: string; count?: number;
  modules?: { app: string; title: string; label: string | null; aksi: string; count: number; total_nilai: number }[];
}
export interface RimaDataResult { ok: boolean; denied?: boolean; message?: string; data?: RimaData }

// Sinyal "ini pertanyaan-data" — dipakai semua modul. Konservatif: ragu → null
// (biar classifier KB yang jawab, bukan salah panggil endpoint).
const DATA_SIGNAL = /\b(data|daftar|list|semua|seluruh|tampil(?:kan)?|lihat|tunjuk(?:kan)?|ada\s+berapa|berapa|jumlah|total|rekap(?:itulasi)?|ringkas(?:an)?|status|disetujui|ditolak|ditelaah|diproses|realisasi|sampai mana|posisi|sudah\s+(final|disetujui))\b/i;
const NO_HINT = /\b(no|nomor)\b/i;

function tahunOf(low: string): string | undefined { return low.match(/\b(20\d{2})\b/)?.[1]; }

/** Token no_usulan: ber-slash (001/PROGRAM/2026) atau setelah "no/nomor". */
function extractNo(low: string): string | undefined {
  const slashed = low.match(/([a-z0-9][a-z0-9._-]*\/[a-z0-9/._-]+)/i);
  if (slashed) return slashed[1].toUpperCase();
  if (NO_HINT.test(low)) {
    const m = low.match(/\b(?:no|nomor)\s*[:.]?\s*([a-z0-9][a-z0-9/._-]{2,})/i);
    if (m) return m[1].toUpperCase();
  }
  return undefined;
}

const TOP_SIGNAL  = /\b(termahal|terbesar|tertinggi|paling\s+mahal|top\s*\d{0,2})\b/;
// #B3 — rekap per DIMENSI (sub-bidang), bukan per status.
const RINCIAN_SIGNAL = /\b(per\s+(sub[\s-]*)?bidang|per\s+sumber|per\s+kategori|rincian|breakdown|pecahan|sebaran|per\s+bagian)\b/;
const TREN_SIGNAL = /\b(tren|antar\s*tahun|tahun\s+ke\s+tahun|per\s*tahun|riwayat\s+tahun)\b/;
// #4 — sinyal "tugas/antrian" yang menunggu aksi user (proaktif).
const TASK_SIGNAL = /\b(tugas(ku)?|antrian(ku)?|inbox|kerjaan(ku)?|ada\s+apa|yang\s+(harus|perlu|menunggu)|menunggu\s+(aku|saya|ku)|to-?do)\b/;
const USULAN_KW = /\busulan\b/;
const BBA_KW = /\b(bba|buku\s+besar\s+aset|aset|belanja\s+modal)\b/;
const PK_KW = /\b(perjanjian\s+kinerja|\bpk\b)\b/;
const LKJIP_KW = /\b(lkjip|laporan\s+kinerja)\b/;
const BLUD_KW = /\b(blud|dpa)\b/;
const RA_KW = /\b(rencana\s+aksi|renaksi)\b/;
const KINERJA_KW = /\b(kinerja|e-?controlling|econtrolling|e-?anggaran)\b/;
// gabungan keyword modul — dipakai detectSummary utk tahu "ada sebut modul atau tidak".
const ANY_MODULE_KW = [USULAN_KW, BBA_KW, PK_KW, LKJIP_KW, BLUD_KW, RA_KW, KINERJA_KW];
const topnOf = (low: string) => low.match(/\b(\d{1,2})\b/)?.[1];

function detectUsulan(low: string): RimaQuery | null {
  if (!USULAN_KW.test(low)) return null;
  const tahun = tahunOf(low);
  const no = extractNo(low);
  if (no) return { app: 'usulan', intent: 'lookup', no, tahun };
  if (TASK_SIGNAL.test(low)) return { app: 'usulan', intent: 'inbox', tahun };
  // #3 — top-N termahal (angka 1–2 digit; tahun 4 digit tak ikut terambil).
  if (TOP_SIGNAL.test(low)) return { app: 'usulan', intent: 'top', tahun, topn: topnOf(low) };
  if (TREN_SIGNAL.test(low)) return { app: 'usulan', intent: 'tren' };
  if (RINCIAN_SIGNAL.test(low)) return { app: 'usulan', intent: 'rincian', tahun };
  if (DATA_SIGNAL.test(low)) return { app: 'usulan', intent: 'rekap', tahun };
  return null;
}

function detectBba(low: string): RimaQuery | null {
  if (!BBA_KW.test(low)) return null;
  const tahun = tahunOf(low);
  const canon = low.match(/\b(bba-[a-z0-9]+)\b/i)?.[1];
  if (canon) return { app: 'bba', intent: 'lookup', no: canon.toUpperCase(), tahun };
  if (TASK_SIGNAL.test(low)) return { app: 'bba', intent: 'inbox', tahun };
  if (TOP_SIGNAL.test(low)) return { app: 'bba', intent: 'top', tahun, topn: topnOf(low) };
  if (TREN_SIGNAL.test(low)) return { app: 'bba', intent: 'tren' };
  if (RINCIAN_SIGNAL.test(low)) return { app: 'bba', intent: 'rincian', tahun };
  if (DATA_SIGNAL.test(low)) return { app: 'bba', intent: 'rekap', tahun };
  return null;
}

function detectPk(low: string): RimaQuery | null {
  if (!PK_KW.test(low)) return null;
  const tahun = tahunOf(low);
  const jenis = /\bperubahan\b/.test(low) ? 'PERUBAHAN' : /\bmurni\b/.test(low) ? 'MURNI' : undefined;
  if (TASK_SIGNAL.test(low)) return { app: 'pk', intent: 'inbox', tahun };
  if (TREN_SIGNAL.test(low)) return { app: 'pk', intent: 'tren', jenis };
  if (DATA_SIGNAL.test(low)) return { app: 'pk', intent: 'rekap', tahun, jenis };
  return null;
}

function detectLkjip(low: string): RimaQuery | null {
  if (!LKJIP_KW.test(low)) return null;
  const tahun = tahunOf(low);
  const canon = low.match(/\b(lkjip-[a-z0-9]+)\b/i)?.[1];
  if (canon) return { app: 'lkjip', intent: 'lookup', no: canon.toUpperCase(), tahun };
  if (TASK_SIGNAL.test(low)) return { app: 'lkjip', intent: 'inbox', tahun };
  if (TREN_SIGNAL.test(low)) return { app: 'lkjip', intent: 'tren' };
  if (DATA_SIGNAL.test(low)) return { app: 'lkjip', intent: 'rekap', tahun };
  return null;
}

function detectRencanaAksi(low: string): RimaQuery | null {
  if (!RA_KW.test(low)) return null;
  const tahun = tahunOf(low);
  if (TOP_SIGNAL.test(low)) return { app: 'rencana_aksi', intent: 'top', tahun, topn: topnOf(low) };
  if (TREN_SIGNAL.test(low)) return { app: 'rencana_aksi', intent: 'tren' };
  if (DATA_SIGNAL.test(low)) return { app: 'rencana_aksi', intent: 'rekap', tahun };
  return null;
}

function detectBlud(low: string): RimaQuery | null {
  if (!BLUD_KW.test(low)) return null;
  if (!DATA_SIGNAL.test(low)) return null;
  return { app: 'blud', intent: 'rekap' };
}

function detectKinerja(low: string): RimaQuery | null {
  if (!KINERJA_KW.test(low)) return null;
  if (TREN_SIGNAL.test(low)) return { app: 'kinerja', intent: 'tren' };
  if (DATA_SIGNAL.test(low)) return { app: 'kinerja', intent: 'rekap', tahun: tahunOf(low) };
  return null;
}

// #4 — "apa tugasku" TANPA sebut modul → ringkasan lintas-modul (/api/rima/summary).
// Bila sebut modul, biarkan detektor modul yang tangani (inbox per-modul).
function detectSummary(low: string): RimaQuery | null {
  if (!TASK_SIGNAL.test(low)) return null;
  if (ANY_MODULE_KW.some(re => re.test(low))) return null;
  return { app: 'summary', intent: 'inbox' };
}

/**
 * Deteksi pertanyaan-data; null = bukan (serahkan ke classifier). Urutan penting
 * (anti tabrakan keyword): summary → usulan → bba → lkjip/PK (keduanya pakai kata
 * "kinerja", frasa beda) → rencana_aksi → blud → kinerja (bare "kinerja" paling akhir).
 */
// B1 — petakan slang/Jawa → kanonik (reuse SYNONYMS, SATU sumber dgn NLU) supaya
// pertanyaan-data gaya daerah ("piro/ndelok/gawe") ikut terdeteksi. Hanya menukar
// surface-form slang; angka, no_usulan, & nama modul (usulan/bba/dpa/…) tetap utuh.
function canonicalize(low: string): string {
  return low.split(/\s+/).map(w => SYNONYMS[w] ?? w).join(' ');
}

export function detectRimaDataQuery(text: string): RimaQuery | null {
  const low = canonicalize(text.toLowerCase());
  return detectSummary(low)
    ?? detectUsulan(low) ?? detectBba(low)
    ?? detectLkjip(low) ?? detectPk(low)
    ?? detectRencanaAksi(low) ?? detectBlud(low) ?? detectKinerja(low);
}

/** Panggil endpoint baca-data. Tak melempar — balikkan {ok:false} saat gagal. */
export async function fetchRimaData(q: RimaQuery): Promise<RimaDataResult> {
  // 'summary' → endpoint agregasi lintas-modul (Tugasku). Lainnya → query per-modul.
  const url = q.app === 'summary'
    ? '/api/rima/summary'
    : (() => {
        const qs = new URLSearchParams({ app: q.app, intent: q.intent });
        if (q.tahun) qs.set('tahun', q.tahun);
        if (q.no) qs.set('no', q.no);
        if (q.jenis) qs.set('jenis', q.jenis);
        if (q.topn) qs.set('topn', q.topn);
        return `/api/rima/query?${qs.toString()}`;
      })();
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { ok: false, message: 'Gagal menghubungi server.' };
  }
  let json: RimaDataResult | null = null;
  try {
    json = await res.json();
  } catch {
    return { ok: false, message: 'Jawaban server tidak terbaca.' };
  }
  return json ?? { ok: false };
}

// ─── Format jawaban (Indonesia, ramah; G10: tanpa nama tabel/kolom) ──────────
const rupiah = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function formatUsulan(d: RimaData): string {
  if (d.kind === 'lookup') {
    if (!d.found) return `Aku tak menemukan usulan ${d.no_usulan || 'itu'} di wilayah yang bisa kamu lihat 🤔 Coba cek lagi nomornya ya.`;
    return `Usulan ${d.no_usulan} (TA ${d.tahun || '-'}) statusnya: ${d.label} — ${d.jumlah_item ?? 0} item, total ${rupiah(d.total_nilai ?? 0)}. 😊`;
  }
  if (d.kind === 'top') {
    const items = d.items ?? [];
    if (!items.length) return `Belum ada usulan untuk diurutkan${d.tahun ? ` di TA ${d.tahun}` : ''} 🙂`;
    const lines = items.map((x, i) => `${i + 1}. ${x.no_usulan} — ${rupiah(x.total_nilai ?? 0)} (${x.label})`).join('\n');
    return `Usulan termahal yang bisa kamu lihat${d.tahun ? ` TA ${d.tahun}` : ''}:\n${lines}`;
  }
  if (d.kind === 'tren') {
    const years = d.years ?? [];
    if (!years.length) return `Belum ada data usulan untuk dilihat trennya 🙂`;
    const lines = years.map(y => `TA ${y.tahun}: ${y.count} usulan · ${rupiah(y.nilai)}`).join('\n');
    return `Tren usulan yang bisa kamu lihat:\n${lines} 😊`;
  }
  if (d.kind === 'inbox') {
    const n = d.count ?? 0;
    if (n === 0) return `Mantap! Tidak ada usulan yang ${d.aksi ?? 'menunggu'} saat ini 🎉`;
    const label = d.label ? ` — status: ${d.label}` : '';
    return `Kamu punya ${n} usulan yang ${d.aksi ?? 'menunggu'}${d.tahun ? ` di TA ${d.tahun}` : ''}${label}, total ${rupiah(d.total_nilai ?? 0)}. 😊`;
  }
  if (d.kind === 'rincian') {
    if ((d.total ?? 0) === 0) return `Belum ada usulan yang tercatat${d.tahun ? ` untuk TA ${d.tahun}` : ''} di wilayahmu 🙂`;
    const lines = (d.rows ?? []).map(x => `${x.sub_bidang}: ${x.count} usulan · ${rupiah(x.nilai ?? 0)}`).join('\n');
    return `Rincian usulan per sub-bidang${d.tahun ? ` TA ${d.tahun}` : ''} yang bisa kamu lihat (${d.total} total):\n${lines} 😊`;
  }
  if ((d.total ?? 0) === 0) return `Belum ada usulan yang tercatat${d.tahun ? ` untuk TA ${d.tahun}` : ''} di wilayahmu 🙂`;
  const lines = (d.rows ?? []).map(x => `${x.label}: ${x.count}`).join(' · ');
  return `Rekap usulan${d.tahun ? ` TA ${d.tahun}` : ''} yang bisa kamu lihat (${d.total} total) — ${lines}.`;
}

function formatInbox(d: RimaData, satuan: string): string {
  const n = d.count ?? 0;
  if (n === 0) return `Mantap! Tidak ada ${satuan} yang ${d.aksi ?? 'menunggu'} saat ini 🎉`;
  const label = d.label ? ` — status: ${d.label}` : '';
  const nilai = (d.total_nilai ?? 0) > 0 ? `, total ${rupiah(d.total_nilai ?? 0)}` : '';
  return `Kamu punya ${n} ${satuan} yang ${d.aksi ?? 'menunggu'}${d.tahun ? ` di TA ${d.tahun}` : ''}${label}${nilai}. 😊`;
}

function formatBba(d: RimaData): string {
  if (d.kind === 'lookup') {
    if (!d.found) return `Aku tak menemukan aset ${d.canonical_id || 'itu'} 🤔 Coba cek lagi kodenya ya.`;
    return `Aset ${d.canonical_id} (TA ${d.tahun || '-'}) statusnya: ${d.label} — rencana ${rupiah(d.nilai_rencana ?? 0)}, realisasi ${rupiah(d.nilai_realisasi ?? 0)}. 😊`;
  }
  if (d.kind === 'top') {
    const items = d.items ?? [];
    if (!items.length) return `Belum ada aset untuk diurutkan${d.tahun ? ` di TA ${d.tahun}` : ''} 🙂`;
    const lines = items.map((x, i) => `${i + 1}. ${x.canonical_id} — ${rupiah(x.nilai_rencana ?? 0)} (${x.label})`).join('\n');
    return `Aset rencana terbesar yang bisa kamu lihat${d.tahun ? ` TA ${d.tahun}` : ''}:\n${lines}`;
  }
  if (d.kind === 'tren') {
    const years = d.years ?? [];
    if (!years.length) return `Belum ada data aset untuk dilihat trennya 🙂`;
    const lines = years.map(y => `TA ${y.tahun}: ${y.count} aset · rencana ${rupiah(y.nilai)}, realisasi ${rupiah(y.realisasi ?? 0)}`).join('\n');
    return `Tren Buku Besar Aset:\n${lines} 😊`;
  }
  if (d.kind === 'inbox') return formatInbox(d, 'aset');
  if (d.kind === 'rincian') {
    if ((d.total ?? 0) === 0) return `Belum ada data Buku Besar Aset${d.tahun ? ` untuk TA ${d.tahun}` : ''} yang bisa kamu lihat 🙂`;
    const lines = (d.rows ?? []).map(x => `${x.sumber}: ${x.count} aset · rencana ${rupiah(x.rencana ?? 0)}, realisasi ${rupiah(x.realisasi ?? 0)}`).join('\n');
    return `Rincian Buku Besar Aset per sumber anggaran${d.tahun ? ` TA ${d.tahun}` : ''} (${d.total} aset):\n${lines} 😊`;
  }
  if ((d.total ?? 0) === 0) return `Belum ada data Buku Besar Aset${d.tahun ? ` untuk TA ${d.tahun}` : ''} yang bisa kamu lihat 🙂`;
  const lines = (d.rows ?? []).map(x => `${x.label}: ${x.count}`).join(' · ');
  const rencana = d.totalRencana ?? 0, realisasi = d.totalRealisasi ?? 0;
  return `Rekap Buku Besar Aset${d.tahun ? ` TA ${d.tahun}` : ''} (${d.total} aset) — ${lines}. Total rencana ${rupiah(rencana)}, realisasi ${rupiah(realisasi)} (${pct(realisasi, rencana)}%). 😊`;
}

function formatPk(d: RimaData): string {
  if (d.kind === 'tren') {
    const years = d.years ?? [];
    if (!years.length) return `Belum ada dokumen PK untuk dilihat trennya 🙂`;
    const lines = years.map(y => `TA ${y.tahun}: ${y.count} dokumen`).join('\n');
    return `Tren Perjanjian Kinerja yang bisa kamu lihat:\n${lines} 😊`;
  }
  if (d.kind === 'inbox') return formatInbox(d, 'dokumen PK');
  if ((d.total ?? 0) === 0) return `Belum ada dokumen Perjanjian Kinerja${d.tahun ? ` TA ${d.tahun}` : ''} yang bisa kamu lihat 🙂`;
  const lines = (d.rows ?? []).map(x => `${x.label}: ${x.count}`).join(' · ');
  const jenis = d.jenis_pk ? ` (${d.jenis_pk})` : '';
  return `Rekap Perjanjian Kinerja${d.tahun ? ` TA ${d.tahun}` : ''}${jenis} yang bisa kamu lihat (${d.total} dokumen) — ${lines}. 😊`;
}

function formatLkjip(d: RimaData): string {
  if (d.kind === 'lookup') {
    if (!d.found) return `Aku tak menemukan dokumen LKJIP ${d.canonical_id || 'itu'} 🤔 Coba cek lagi kodenya ya.`;
    return `Dokumen LKJIP ${d.canonical_id} (TA ${d.tahun || '-'}) statusnya: ${d.label}. 😊`;
  }
  if (d.kind === 'tren') {
    const years = d.years ?? [];
    if (!years.length) return `Belum ada dokumen LKJIP untuk dilihat trennya 🙂`;
    const lines = years.map(y => `TA ${y.tahun}: ${y.count} dokumen`).join('\n');
    return `Tren LKJIP yang bisa kamu lihat:\n${lines} 😊`;
  }
  if (d.kind === 'inbox') return formatInbox(d, 'dokumen LKJIP');
  if ((d.total ?? 0) === 0) return `Belum ada dokumen LKJIP${d.tahun ? ` untuk TA ${d.tahun}` : ''} yang bisa kamu lihat 🙂`;
  const lines = (d.rows ?? []).map(x => `${x.label}: ${x.count}`).join(' · ');
  return `Rekap LKJIP${d.tahun ? ` TA ${d.tahun}` : ''} (${d.total} dokumen) — ${lines}. 😊`;
}

function formatBlud(d: RimaData): string {
  if ((d.total ?? 0) === 0) return `Belum ada data DPA BLUD yang bisa kamu lihat 🙂`;
  const lines = (d.rows ?? []).slice(0, 5).map(x => `Versi ${x.label}: ${x.count} baris`).join('\n');
  return `Versi DPA BLUD terbaru:\n${lines} 😊`;
}

function formatKinerja(d: RimaData): string {
  if (d.kind === 'tren') {
    const years = d.years ?? [];
    if (!years.length) return `Belum ada data Kinerja untuk dilihat trennya 🙂`;
    const lines = years.map(y => `TA ${y.tahun}: ${y.count} sub-kegiatan`).join('\n');
    return `Tren Kinerja (sub-kegiatan) yang bisa kamu lihat:\n${lines} 😊`;
  }
  if ((d.total ?? 0) === 0) return `Belum ada data Kinerja${d.tahun ? ` untuk TA ${d.tahun}` : ''} yang bisa kamu lihat 🙂`;
  const lines = (d.rows ?? []).map(x => `${x.label}: ${x.count}`).join(' · ');
  return `Rekap struktur Kinerja${d.tahun ? ` TA ${d.tahun}` : ''} (${d.total} baris) — ${lines}. 😊`;
}

function formatRencanaAksi(d: RimaData): string {
  if (d.kind === 'top') {
    const items = d.items ?? [];
    if (!items.length) return `Belum ada indikator untuk diurutkan${d.tahun ? ` di TA ${d.tahun}` : ''} 🙂`;
    const lines = items.map((x, i) => `${i + 1}. ${x.label} — ${rupiah(x.total_nilai ?? 0)}`).join('\n');
    return `Indikator Rencana Aksi dengan anggaran terbesar${d.tahun ? ` TA ${d.tahun}` : ''}:\n${lines}`;
  }
  if (d.kind === 'tren') {
    const years = d.years ?? [];
    if (!years.length) return `Belum ada data Rencana Aksi untuk dilihat trennya 🙂`;
    const lines = years.map(y => `TA ${y.tahun}: ${y.count} indikator · ${rupiah(y.nilai)}`).join('\n');
    return `Tren Rencana Aksi yang bisa kamu lihat:\n${lines} 😊`;
  }
  if ((d.total ?? 0) === 0) return `Belum ada data Rencana Aksi${d.tahun ? ` untuk TA ${d.tahun}` : ''} yang bisa kamu lihat 🙂`;
  const lines = (d.rows ?? []).map(x => `${x.label}: ${x.count}`).join(' · ');
  const nilai = (d.totalNilai ?? 0) > 0 ? ` Total anggaran ${rupiah(d.totalNilai ?? 0)}.` : '';
  return `Rekap Rencana Aksi${d.tahun ? ` TA ${d.tahun}` : ''} (${d.total} indikator) — ${lines}.${nilai} 😊`;
}

// #4 — ringkasan "Tugasku" lintas-modul (hanya modul yang menunggu aksi ditampilkan).
function formatSummary(d: RimaData): string {
  const mods = (d.modules ?? []).filter(m => m.count > 0);
  if (!mods.length) return `Mantap! Tidak ada yang menunggu aksimu saat ini 🎉 Semua sudah beres.`;
  const lines = mods.map(m => `• ${m.title}: ${m.count} ${m.aksi}`).join('\n');
  const total = mods.reduce((a, m) => a + m.count, 0);
  return `Ada ${total} hal yang menunggu aksimu:\n${lines}`;
}

export function formatRimaAnswer(app: RimaTarget, r: RimaDataResult): string {
  if (r.denied) return 'Sepertinya kamu belum punya akses ke data itu 🙏 Coba lewat atasanmu ya.';
  if (!r.data) return r.message || 'Maaf, aku belum bisa mengambil datanya sekarang 🙏 Coba lagi ya.';
  if (app === 'summary') return formatSummary(r.data);
  if (app === 'bba') return formatBba(r.data);
  if (app === 'pk') return formatPk(r.data);
  if (app === 'lkjip') return formatLkjip(r.data);
  if (app === 'blud') return formatBlud(r.data);
  if (app === 'kinerja') return formatKinerja(r.data);
  if (app === 'rencana_aksi') return formatRencanaAksi(r.data);
  return formatUsulan(r.data);
}
