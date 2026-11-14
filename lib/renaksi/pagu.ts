// lib/renaksi/pagu.ts — pagu Rencana Aksi per sumber dana & penjumlahan ke atas. MURNI, aman-klien.
// Konsep: docs/CONCEPT-renaksi-pagu-rko.md (§3, §4, §6c).
//
// Pagu milik baris INDIKATOR sub kegiatan (sub kegiatan Rp 5 juta berindikator dua diisi 2,5 + 2,5),
// dirinci per sumber dana. Naik ke atas mengikuti tautan `induk_indikator_id` — aturan yang sama
// dengan pohon Cetak (`anakMilikIndikator`), kecuali satu hal: anak yang belum tertaut di entitas
// berindikator BANYAK tidak dibagikan ke semua indikator (uangnya akan terhitung berkali-kali).
// Ia tetap masuk total entitas dan disebut "belum tertaut".

export interface RincianPagu {
  /** '' = tanpa sumber (data lama sebelum sumber dana ada). */
  sumber: string;
  pagu: number | null;
  /** NULL = belum diubah di babak Perubahan (yang berlaku tetap Murni). */
  pagu_perubahan: number | null;
}

export const BATAS_RINCIAN = 10;
export const PANJANG_SUMBER = 100;
export const LABEL_TANPA_SUMBER = 'Tanpa sumber';

export const rapikanSumber = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
export const kunciSumber = (s: string | null | undefined): string => rapikanSumber(s).toLowerCase();
export const labelSumber = (s: string | null | undefined): string => rapikanSumber(s) || LABEL_TANPA_SUMBER;

/** Yang berlaku: Perubahan bila sudah diisi, kalau tidak Murni. */
export const nilaiBerlaku = (r: RincianPagu): number => r.pagu_perubahan ?? r.pagu ?? 0;

/** Total berlaku satu baris — null bila tidak ada satu angka pun (beda dengan nol sungguhan). */
export function totalBerlaku(rs: readonly RincianPagu[] | null | undefined): number | null {
  const terisi = (rs ?? []).filter(r => r.pagu != null || r.pagu_perubahan != null);
  return terisi.length ? terisi.reduce((a, r) => a + nilaiBerlaku(r), 0) : null;
}

export const PESAN_MURNI_BEKU = 'Pagu Murni sudah dibekukan sejak babak Perubahan dimulai — ubah kolom Perubahan, bukan Murni.';

const jumlahMurni = (rs: readonly RincianPagu[]) => rs.reduce((a, r) => a + (r.pagu ?? 0), 0);

/**
 * Aturan simpan rincian — dipakai server (penentu) DAN form (supaya tolakannya terbaca sebelum
 * Simpan). Babak Perubahan membekukan Murni per sumber; satu-satunya yang boleh bergerak adalah
 * Murni "tanpa sumber" yang diberi sumber (membetulkan data lama lewat pensil), selama jumlah
 * Murni seluruhnya tetap.
 */
export function alasanTolakRincian(
  baru: readonly RincianPagu[], lama: readonly RincianPagu[], perubahanAktif: boolean,
): string | null {
  if (baru.length > BATAS_RINCIAN) return `Paling banyak ${BATAS_RINCIAN} sumber dana per indikator.`;
  const dilihat = new Set<string>();
  for (const r of baru) {
    const k = kunciSumber(r.sumber);
    if (dilihat.has(k)) return `Sumber "${labelSumber(r.sumber)}" ditulis dua kali — gabungkan jadi satu baris.`;
    dilihat.add(k);
    if (rapikanSumber(r.sumber).length > PANJANG_SUMBER) return `Nama sumber paling panjang ${PANJANG_SUMBER} huruf.`;
    for (const v of [r.pagu, r.pagu_perubahan]) {
      if (v != null && (!Number.isInteger(v) || v < 0)) return 'Pagu harus rupiah bulat, tidak negatif.';
    }
  }
  if (!perubahanAktif) {
    return baru.some(r => r.pagu_perubahan != null)
      ? 'Pagu Perubahan belum dimulai untuk tahun ini — isi kolom Murni, atau mulai babak Perubahan dulu.'
      : null;
  }
  const murniLama = new Map(lama.map(r => [kunciSumber(r.sumber), r.pagu ?? 0]));
  const murniBaru = new Map(baru.map(r => [kunciSumber(r.sumber), r.pagu ?? 0]));
  const beku = PESAN_MURNI_BEKU;
  for (const [k, v] of murniLama) {
    if (k !== '' && (murniBaru.get(k) ?? 0) !== v) return beku;
  }
  // Sumber bernama lama sudah dikunci di atas, jadi jumlah yang sama berarti Murni yang pindah hanya
  // milik "tanpa sumber" — tidak bisa bertambah dari mana pun.
  return jumlahMurni(baru) === jumlahMurni(lama) ? null : beku;
}

// ─── Penjumlahan ke atas ────────────────────────────────────────────────────

export interface PaguSumber { sumber: string; nilai: number }
export interface Pagu { total: number; perSumber: PaguSumber[] }

/** Baris Renaksi sejauh yang dibutuhkan penjumlahan. */
export interface BarisPagu {
  id: number;
  level: 'tujuan' | 'sasaran' | 'program' | 'kegiatan' | 'sub-kegiatan';
  program: string;
  kegiatan: string | null;
  sub_kegiatan: string | null;
  tujuan: string | null;
  sasaran: string | null;
  induk_indikator_id: number | null;
  anggaran_nominal: number | null;
  pagu_rincian?: RincianPagu[] | null;
}

class Kantong {
  private readonly peta = new Map<string, PaguSumber>();
  total = 0;
  tambah(sumber: string, nilai: number) {
    const k = kunciSumber(sumber);
    const ada = this.peta.get(k);
    if (ada) ada.nilai += nilai; else this.peta.set(k, { sumber: rapikanSumber(sumber), nilai });
    this.total += nilai;
  }
  tambahPagu(p: Pagu) { for (const s of p.perSumber) this.tambah(s.sumber, s.nilai); }
  hasil(): Pagu {
    const perSumber = [...this.peta.values()].sort((a, b) =>
      (a.sumber === '' ? 1 : 0) - (b.sumber === '' ? 1 : 0) || a.sumber.localeCompare(b.sumber, 'id'));
    return { total: this.total, perSumber };
  }
}

const URUTAN_NAIK: BarisPagu['level'][] = ['kegiatan', 'program', 'sasaran', 'tujuan'];
const ANAK: Record<string, BarisPagu['level']> = {
  kegiatan: 'sub-kegiatan', program: 'kegiatan', sasaran: 'program', tujuan: 'sasaran',
};

/** Kunci entitas baris ini & kunci entitas induknya — pencocokan nama persis, sama dengan pohon Cetak. */
function kunciEntitas(r: BarisPagu): string {
  if (r.level === 'kegiatan') return `${r.program}\u0000${r.kegiatan ?? ''}`;
  if (r.level === 'sub-kegiatan') return `${r.program}\u0000${r.kegiatan ?? ''}\u0000${r.sub_kegiatan ?? ''}`;
  return r.program;
}
function kunciInduk(r: BarisPagu): string | null {
  if (r.level === 'sub-kegiatan') return `${r.program}\u0000${r.kegiatan ?? ''}`;
  if (r.level === 'kegiatan') return r.program;
  if (r.level === 'program') return r.sasaran;
  if (r.level === 'sasaran') return r.tujuan;
  return null;
}

/** Pagu baris sub kegiatan: rinciannya, atau angka lama tanpa rincian sebagai "tanpa sumber". */
export function paguSendiri(r: BarisPagu): Pagu | null {
  const k = new Kantong();
  if (r.pagu_rincian?.length) {
    if (totalBerlaku(r.pagu_rincian) == null) return null;
    for (const x of r.pagu_rincian) if (x.pagu != null || x.pagu_perubahan != null) k.tambah(x.sumber, nilaiBerlaku(x));
    return k.hasil();
  }
  if (r.anggaran_nominal == null) return null;
  k.tambah('', Number(r.anggaran_nominal));
  return k.hasil();
}

export interface SusunanPagu {
  /** Pagu per baris indikator (null = tidak ada anak yang menyumbang). */
  baris: Map<number, Pagu | null>;
  /**
   * Per entitas (`${level}|kunci`): total seluruh sub kegiatan di bawahnya, dan pagu anak LANGSUNG
   * yang belum tertaut ke salah satu indikatornya (entitas berindikator banyak, anak tanpa tautan).
   */
  entitas: Map<string, { total: Pagu; belumTertaut: Pagu }>;
}

const cache = new WeakMap<readonly BarisPagu[], SusunanPagu>();

export function susunPaguRenaksi(rows: readonly BarisPagu[]): SusunanPagu {
  const ada = cache.get(rows);
  if (ada) return ada;

  const baris = new Map<number, Pagu | null>();
  const entitas = new Map<string, { total: Pagu; belumTertaut: Pagu }>();
  const totalEntitas = new Map<string, Kantong>();
  const perLevel = new Map<string, Map<string, BarisPagu[]>>();
  for (const r of rows) {
    const m = perLevel.get(r.level) ?? new Map<string, BarisPagu[]>();
    perLevel.set(r.level, m);
    const k = kunciEntitas(r);
    m.set(k, [...(m.get(k) ?? []), r]);
  }

  for (const [k, rs] of perLevel.get('sub-kegiatan') ?? []) {
    const t = new Kantong();
    for (const r of rs) {
      const p = paguSendiri(r);
      baris.set(Number(r.id), p);
      if (p) t.tambahPagu(p);
    }
    totalEntitas.set(`sub-kegiatan|${k}`, t);
  }

  for (const level of URUTAN_NAIK) {
    const anakLevel = ANAK[level];
    const anakPerInduk = new Map<string, BarisPagu[]>();
    for (const rs of (perLevel.get(anakLevel) ?? new Map()).values()) {
      for (const r of rs) {
        const ki = kunciInduk(r);
        if (ki != null) anakPerInduk.set(ki, [...(anakPerInduk.get(ki) ?? []), r]);
      }
    }
    for (const [k, rs] of perLevel.get(level) ?? []) {
      const ids = new Set(rs.map(r => Number(r.id)));
      const milik = new Map<number, Kantong>();
      const disumbang = new Set<number>();
      const total = new Kantong();
      // Hanya bagian anak LANGSUNG yang tak berpemilik — yang tertahan di tingkat bawah sudah
      // disebut di entitas bawah itu; mengulangnya di program/sasaran/tujuan cuma menggandakan kabar.
      const belum = new Kantong();
      const anak = anakPerInduk.get(k) ?? [];
      for (const c of anak) {
        const tautan = c.induk_indikator_id == null ? null : Number(c.induk_indikator_id);
        const pemilik = tautan != null && ids.has(tautan) ? tautan : (rs.length === 1 ? Number(rs[0].id) : null);
        const p = baris.get(Number(c.id)) ?? null;
        if (pemilik == null) { if (p) belum.tambahPagu(p); continue; }
        disumbang.add(pemilik);
        const kt = milik.get(pemilik) ?? new Kantong();
        milik.set(pemilik, kt);
        if (p) kt.tambahPagu(p);
      }
      const entitasAnak = new Set(anak.map(c => `${anakLevel}|${kunciEntitas(c)}`));
      for (const ke of entitasAnak) { const t = totalEntitas.get(ke); if (t) total.tambahPagu(t.hasil()); }
      totalEntitas.set(`${level}|${k}`, total);

      for (const r of rs) {
        const id = Number(r.id);
        baris.set(id, disumbang.has(id) ? (milik.get(id)?.hasil() ?? null) : null);
      }
      entitas.set(`${level}|${k}`, { total: total.hasil(), belumTertaut: belum.hasil() });
    }
  }
  for (const [k, t] of totalEntitas) {
    if (k.startsWith('sub-kegiatan|')) entitas.set(k, { total: t.hasil(), belumTertaut: { total: 0, perSumber: [] } });
  }

  const hasil = { baris, entitas };
  cache.set(rows, hasil);
  return hasil;
}

/** Pagu satu baris indikator (sub kegiatan = miliknya sendiri; di atasnya = jumlah anak yang tertaut). */
export function paguBaris(r: BarisPagu, rows: readonly BarisPagu[]): Pagu | null {
  return susunPaguRenaksi(rows).baris.get(Number(r.id)) ?? null;
}

/** Total entitas baris ini & bagian yang belum tertaut ke salah satu indikatornya. */
export function paguEntitas(r: BarisPagu, rows: readonly BarisPagu[]): { total: Pagu; belumTertaut: Pagu } | null {
  return susunPaguRenaksi(rows).entitas.get(`${r.level}|${kunciEntitas(r)}`) ?? null;
}

export interface PaguBelumTertaut { level: BarisPagu['level']; nama: string; induk: string | null; pagu: Pagu }

/** Daftar entitas yang menahan pagu belum tertaut — bahan spanduk Cetak & catatan unduhan. */
export function daftarBelumTertaut(rows: readonly BarisPagu[]): PaguBelumTertaut[] {
  const s = susunPaguRenaksi(rows);
  const keluar: PaguBelumTertaut[] = [];
  const dilihat = new Set<string>();
  for (const r of rows) {
    const k = `${r.level}|${kunciEntitas(r)}`;
    if (dilihat.has(k)) continue;
    dilihat.add(k);
    const e = s.entitas.get(k);
    if (e && e.belumTertaut.total !== 0) {
      keluar.push({
        level: r.level,
        nama: r.level === 'kegiatan' ? (r.kegiatan ?? '') : r.program,
        induk: r.level === 'kegiatan' ? r.program : null,
        pagu: e.belumTertaut,
      });
    }
  }
  return keluar;
}

export interface PaguSubRenaksi { program: string; kegiatan: string; sub_kegiatan: string; pagu: Pagu | null }

/**
 * Pagu tiap ENTITAS sub kegiatan = Σ pagu berlaku seluruh baris indikatornya, per sumber (konsep §2
 * no. 5). Sub kegiatan tanpa pagu tetap ikut (pagu null = tanpa batas, tapi entitasnya ADA di Renaksi
 * — beda dengan sub kegiatan RKO yang tidak ada di Renaksi sama sekali).
 */
export function paguSubKegiatan(rows: readonly BarisPagu[]): PaguSubRenaksi[] {
  const peta = new Map<string, { r: BarisPagu; k: Kantong; ada: boolean }>();
  for (const r of rows) {
    if (r.level !== 'sub-kegiatan') continue;
    const kunci = kunciEntitas(r);
    const e = peta.get(kunci) ?? { r, k: new Kantong(), ada: false };
    peta.set(kunci, e);
    const p = paguSendiri(r);
    if (p) { e.k.tambahPagu(p); e.ada = true; }
  }
  return [...peta.values()].map(({ r, k, ada }) => ({
    program: r.program, kegiatan: r.kegiatan ?? '', sub_kegiatan: r.sub_kegiatan ?? '', pagu: ada ? k.hasil() : null,
  }));
}

/** Penjumlah per sumber untuk modul lain (RKO) — aturan kunci sumber yang sama. */
export function jumlahPerSumber(isi: readonly { sumber: string; nilai: number }[]): Pagu {
  const k = new Kantong();
  for (const x of isi) k.tambah(x.sumber, x.nilai);
  return k.hasil();
}

const rupiah = (n: number) => n.toLocaleString('id-ID');

/** "APBD 10.000.000 · BLUD 5.000.000" — kosong bila hanya satu sumber tanpa nama. */
export function tulisPerSumber(p: Pagu | null | undefined): string {
  if (!p || !p.perSumber.length) return '';
  if (p.perSumber.length === 1 && p.perSumber[0].sumber === '') return '';
  return p.perSumber.map(s => `${labelSumber(s.sumber)} ${rupiah(s.nilai)}`).join(' · ');
}
