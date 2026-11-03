// lib/kinerja/rekening-menjalar.ts — suntingan nama/rantai di tab Rekening yang menjalar
// ke RKO (semua versi) dan Realisasi. PURE (aman-klien); penulisnya `saveRekeningBatch`.
//
// RKO & Realisasi menyimpan SALINAN teks Rekening sejak Inject, jadi mengubah Program/
// Kegiatan/Sub/Uraian SSK/Rekening Belanja di tab Rekening dulu hanya mengubah baris
// rekening itu — RKO-nya tetap di rantai lama dan Cetak Rekap memecahnya jadi dua kelompok.
// Pasangan lama ↔ baru dibaca lewat `id` baris yang dikirim layar; baris tanpa id (baru,
// impor, pulihan) tidak menjalarkan apa pun. Tautan Rekening ↔ RKO = `uraian_ssk||uraian`
// per sumber, kunci yang sama dipakai Inject untuk "sudah ada".
// Konsep: docs/CONCEPT-kinerja-rekening-menjalar.md

import { hitungKembar, kalimatJalaran, adaJalaran, type DampakData, type DampakVersiRko } from './master-ubah';

export interface NamaRekening {
  uraian: string;
  uraian_ssk: string | null;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
}
export interface RekeningLama extends NamaRekening { id: number }
export interface RekeningMasuk extends NamaRekening { id?: number }
export interface BarisRkoRekening extends NamaRekening {
  id: number;
  versi_tipe: string;
  versi_seq: number;
  canonical_id: string;
}
export interface BarisRealRekening {
  id: number;
  ssk_canonical_id: string;
  keterangan: string;
  uraian_ssk: string | null;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
}
/** Yang ditulis ke RKO & Realisasi — teks apa adanya dari Rekening, kosong bukan NULL (seperti Inject & Init). */
export interface NilaiJalar { uraian: string; uraian_ssk: string; program: string; kegiatan: string; subkegiatan: string }

export interface LewatRekening { uraian: string; sebab: string }
export interface RencanaJalarRekening {
  perubahan: { lama: NamaRekening; baru: NamaRekening; rekening: number }[];
  rko: { baris: BarisRkoRekening; nilai: NilaiJalar }[];
  realisasi: { baris: BarisRealRekening; nilai: NilaiJalar }[];
  dilewati: LewatRekening[];
  /** Baris RKO yang sesudahnya bernama sama dengan baris lain di versi yang sama. */
  kembarRko: number;
}

const t = (v: string | null | undefined) => (v ?? '').trim();
const kunciTaut = (uraianSsk: string | null, uraian: string) => `${t(uraianSsk)}\u0001${t(uraian)}`;
const identitas = (r: NamaRekening) =>
  [kunciTaut(r.uraian_ssk, r.uraian), t(r.program), t(r.kegiatan), t(r.subkegiatan)].join('\u0001');
/** Rantai RKO/Realisasi cocok dengan rekening lama: tiap tingkat kosong atau sama (aturan `cocokInduk`). */
const rantaiPas = (b: { program: string | null; kegiatan: string | null; subkegiatan: string | null }, l: NamaRekening) =>
  (['program', 'kegiatan', 'subkegiatan'] as const).every(k => !t(b[k]) || t(b[k]) === t(l[k]));
const nilaiDari = (r: NamaRekening): NilaiJalar => ({
  uraian: r.uraian, uraian_ssk: r.uraian_ssk ?? '',
  program: r.program ?? '', kegiatan: r.kegiatan ?? '', subkegiatan: r.subkegiatan ?? '',
});
const labelVersi = (b: BarisRkoRekening) => `${b.versi_tipe}:${b.versi_seq}`;

export function rencanaJalarRekening(
  lama: readonly RekeningLama[],
  masuk: readonly RekeningMasuk[],
  rko: readonly BarisRkoRekening[],
  realisasi: readonly BarisRealRekening[],
): RencanaJalarRekening {
  const lamaById = new Map(lama.map(r => [r.id, r]));
  const terpakai = new Set<number>();
  const grup = new Map<string, { lama: RekeningLama; idx: Set<number>; baru: RekeningMasuk[] }>();
  masuk.forEach((m, i) => {
    const l = m.id ? lamaById.get(m.id) : undefined;
    if (!l || terpakai.has(l.id)) return;
    terpakai.add(l.id);
    if (identitas(l) === identitas(m)) return;
    const k = identitas(l);
    const g = grup.get(k) ?? { lama: l, idx: new Set<number>(), baru: [] };
    g.idx.add(i);
    g.baru.push(m);
    grup.set(k, g);
  });

  const hasil: RencanaJalarRekening = { perubahan: [], rko: [], realisasi: [], dilewati: [], kembarRko: 0 };
  const ditugaskan = new Map<number, NilaiJalar>();
  const nilaiCid = new Map<string, NilaiJalar>();
  const nilaiTanpaCid: { lama: NamaRekening; nilai: NilaiJalar }[] = [];

  for (const g of grup.values()) {
    const l = g.lama;
    if (new Set(g.baru.map(identitas)).size > 1) {
      hasil.dilewati.push({ uraian: l.uraian, sebab: 'rekening bernama sama diubah ke dua tujuan berbeda' });
      continue;
    }
    const lain = masuk.filter((_, i) => !g.idx.has(i));
    if (lain.some(o => identitas(o) === identitas(l))) {
      hasil.dilewati.push({ uraian: l.uraian, sebab: 'masih ada rekening lain bernama sama di rantai lama — RKO-nya tetap milik rekening itu' });
      continue;
    }
    const kunciLama = kunciTaut(l.uraian_ssk, l.uraian);
    const kunciMasihDipakai = lain.some(o => kunciTaut(o.uraian_ssk, o.uraian) === kunciLama);
    const nilai = nilaiDari(g.baru[0]);

    const perVersi = new Map<string, BarisRkoRekening[]>();
    for (const b of rko) {
      if (ditugaskan.has(b.id) || kunciTaut(b.uraian_ssk, b.uraian) !== kunciLama) continue;
      perVersi.set(labelVersi(b), [...(perVersi.get(labelVersi(b)) ?? []), b]);
    }
    let ragu = false;
    for (const calon of perVersi.values()) {
      const pas = calon.filter(b => rantaiPas(b, l));
      // RKO yang rantainya sudah berbeda dari rekening (disunting sebelum fitur ini ada) tetap
      // ikut — asal satu-satunya baris bernama itu dan tidak ada rekening lain yang memakainya.
      const pilih = pas.length > 0 ? pas : (!kunciMasihDipakai && calon.length === 1 ? calon : []);
      if (pilih.length === 0) { ragu = true; continue; }
      for (const b of pilih) {
        ditugaskan.set(b.id, nilai);
        if (b.canonical_id && !nilaiCid.has(b.canonical_id)) nilaiCid.set(b.canonical_id, nilai);
        if (berbedaRko(b, nilai)) hasil.rko.push({ baris: b, nilai });
      }
    }
    if (ragu) {
      hasil.dilewati.push({ uraian: l.uraian, sebab: 'RKO punya baris bernama sama di rantai lain — tidak bisa dipastikan yang mana' });
    }
    if (!kunciMasihDipakai) nilaiTanpaCid.push({ lama: l, nilai });
    hasil.perubahan.push({ lama: l, baru: g.baru[0], rekening: g.baru.length });
  }

  for (const r of realisasi) {
    const nilai = r.ssk_canonical_id
      ? nilaiCid.get(r.ssk_canonical_id)
      : nilaiTanpaCid.find(x => kunciTaut(r.uraian_ssk, r.keterangan) === kunciTaut(x.lama.uraian_ssk, x.lama.uraian)
          && rantaiPas(r, x.lama))?.nilai;
    if (nilai && berbedaReal(r, nilai)) hasil.realisasi.push({ baris: r, nilai });
  }

  const kembar = (pakaiBaru: boolean) => hitungKembar(rko.map(b => {
    const n = pakaiBaru ? ditugaskan.get(b.id) : undefined;
    return { grup: labelVersi(b), kunci: n ? kunciTaut(n.uraian_ssk, n.uraian) : kunciTaut(b.uraian_ssk, b.uraian) };
  }));
  hasil.kembarRko = Math.max(kembar(true) - kembar(false), 0);
  return hasil;
}

function berbedaRko(b: BarisRkoRekening, n: NilaiJalar): boolean {
  return b.uraian !== n.uraian || (b.uraian_ssk ?? '') !== n.uraian_ssk || (b.program ?? '') !== n.program
    || (b.kegiatan ?? '') !== n.kegiatan || (b.subkegiatan ?? '') !== n.subkegiatan;
}
function berbedaReal(r: BarisRealRekening, n: NilaiJalar): boolean {
  return r.keterangan !== n.uraian || (r.uraian_ssk ?? '') !== n.uraian_ssk || (r.program ?? '') !== n.program
    || (r.kegiatan ?? '') !== n.kegiatan || (r.subkegiatan ?? '') !== n.subkegiatan;
}

// ─── Ringkasan untuk dialog, balasan route, dan audit ────────────────────────

const KOLOM: [keyof NamaRekening, string][] = [
  ['uraian', 'Rekening Belanja'], ['uraian_ssk', 'Uraian SSK'],
  ['program', 'Program'], ['kegiatan', 'Kegiatan'], ['subkegiatan', 'Sub Kegiatan'],
];

export interface RingkasJalarRekening {
  perubahan: { uraian: string; rincian: string[]; rekening: number }[];
  /** `rekening` selalu 0 — baris rekening ditulis Simpan itu sendiri. */
  dampak: DampakData;
  dilewati: LewatRekening[];
  kembar_rko: number;
}

export function ringkasJalarRekening(r: RencanaJalarRekening, sumber: string): RingkasJalarRekening {
  const perVersi = new Map<string, DampakVersiRko>();
  for (const { baris } of r.rko) {
    const k = labelVersi(baris);
    const v = perVersi.get(k) ?? { sumber, versi_tipe: baris.versi_tipe, versi_seq: baris.versi_seq, baris: 0 };
    v.baris += 1;
    perVersi.set(k, v);
  }
  return {
    perubahan: r.perubahan.map(p => ({
      uraian: p.lama.uraian,
      rincian: KOLOM.filter(([k]) => t(p.lama[k]) !== t(p.baru[k]))
        .map(([k, label]) => `${label}: "${t(p.lama[k]) || '—'}" → "${t(p.baru[k]) || '—'}"`),
      rekening: p.rekening,
    })),
    dampak: {
      rekening: 0,
      rko: [...perVersi.values()].sort((a, b) => a.versi_tipe.localeCompare(b.versi_tipe) || a.versi_seq - b.versi_seq),
      realisasi: r.realisasi.length,
    },
    dilewati: r.dilewati,
    kembar_rko: r.kembarRko,
  };
}

/** Ditanyakan dulu bila ada yang ikut berganti, atau ada suntingan yang tidak bisa dijalarkan. */
export const perluKonfirmasiJalar = (x: RingkasJalarRekening) => adaJalaran(x.dampak) || x.dilewati.length > 0;

const BATAS_DAFTAR = 5;
const daftar = (baris: string[]) => baris.length > BATAS_DAFTAR
  ? [...baris.slice(0, BATAS_DAFTAR), `… dan ${baris.length - BATAS_DAFTAR} lainnya`].join('\n')
  : baris.join('\n');

export function kalimatJalarRekening(x: RingkasJalarRekening): string {
  const bagian: string[] = [];
  if (x.perubahan.length > 0) {
    bagian.push(`${x.perubahan.length} rekening berganti nama atau pindah rantai:\n`
      + daftar(x.perubahan.map(p => `• ${p.uraian} — ${p.rincian.join('; ')}`)));
  }
  if (adaJalaran(x.dampak)) {
    bagian.push('Ikut berganti — angka, target, dan realisasi tidak berubah:\n' + kalimatJalaran(x.dampak)
      + '\nRKO semua versi ikut, termasuk yang terkunci.');
  }
  if (x.dilewati.length > 0) {
    bagian.push('Tidak ikut berganti (RKO-nya ubah sendiri di tab RKO):\n'
      + daftar(x.dilewati.map(d => `• ${d.uraian} — ${d.sebab}`)));
  }
  if (x.kembar_rko > 0) {
    bagian.push(`Perhatian: ${x.kembar_rko} nama di RKO jadi dipakai dua baris di versi yang sama — periksa di tab RKO.`);
  }
  return bagian.join('\n\n');
}

/** Ekor detail audit `KINERJA_SAVE_REKENING`. Kosong bila tidak ada yang menjalar. */
export function jejakJalarRekening(x: RingkasJalarRekening): string {
  if (!adaJalaran(x.dampak) && x.dilewati.length === 0) return '';
  const rko = x.dampak.rko.map(v => `${v.versi_tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${v.versi_seq}`} ${v.baris}`).join(', ');
  const nama = x.perubahan.slice(0, BATAS_DAFTAR).map(p => p.uraian).join(' · ');
  return `; ikut berganti: RKO ${rko || '0'} baris, Realisasi ${x.dampak.realisasi} baris`
    + (nama ? ` (${nama}${x.perubahan.length > BATAS_DAFTAR ? ' …' : ''})` : '')
    + (x.dilewati.length > 0 ? `; ${x.dilewati.length} tidak dijalarkan` : '');
}
