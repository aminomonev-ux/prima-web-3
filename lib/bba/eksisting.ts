// lib/bba/eksisting.ts — kondisi eksisting per barang × lokasi (CONCEPT-bba-perencanaan §6). MURNI:
// dipakai data layer DAN layar. Kueri hanya mengambil baris pendataan; "yang berlaku", jumlah, dan
// tanda "perlu didata ulang" dihitung di sini.

export const MAKS_UNIT = 1_000_000;
export const MAKS_BARIS_PENDATAAN = 300;

export type BarisEksisting = {
  id: number; barang_id: number; lokasi_id: number; lokasi_nama: string;
  baik: number; rusak_ringan: number; rusak_berat: number;
  tgl_cek: string; catatan: string | null; file_id: string | null;
  /** 'YYYY-MM-DD HH:MM:SS' — jam MySQL, sama dengan `digabung_pada`, jadi bisa dibandingkan sebagai teks. */
  created_at: string;
  digabung_dari: string | null; digabung_pada: string | null;
};

export type Kondisi = { baik: number; rusak_ringan: number; rusak_berat: number; total: number };

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** '2026-04-12' → '12 Apr 2026'. */
export function fmtTanggal(t: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t ?? '');
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : '';
}

const lebihBaru = (a: BarisEksisting, b: BarisEksisting) => a.tgl_cek > b.tgl_cek || (a.tgl_cek === b.tgl_cek && a.id > b.id);

/** Yang berlaku = pendataan TERBARU per barang × lokasi (tanggal cek, lalu id). Urut nama lokasi. */
export function eksistingBerlaku(rows: readonly BarisEksisting[]): BarisEksisting[] {
  const per = new Map<string, BarisEksisting>();
  for (const r of rows) {
    const k = `${r.barang_id}:${r.lokasi_id}`;
    const ada = per.get(k);
    if (!ada || lebihBaru(r, ada)) per.set(k, r);
  }
  return [...per.values()].sort((a, b) => a.lokasi_nama.localeCompare(b.lokasi_nama, 'id') || a.barang_id - b.barang_id);
}

export function jumlahKondisi(rows: readonly Pick<BarisEksisting, 'baik' | 'rusak_ringan' | 'rusak_berat'>[]): Kondisi {
  const k = { baik: 0, rusak_ringan: 0, rusak_berat: 0, total: 0 };
  for (const r of rows) { k.baik += r.baik; k.rusak_ringan += r.rusak_ringan; k.rusak_berat += r.rusak_berat; }
  k.total = k.baik + k.rusak_ringan + k.rusak_berat;
  return k;
}

/** Bahan pembelian: item yang terbeli (bukan usulan ditolak) dengan tanggal realisasinya. */
export type BahanBeli = { barang_id: number; vol_realisasi: number; tgl_realisasi: string | null };

export type AlasanUlang =
  | { jenis: 'BELI'; unit: number; tgl_awal: string; tgl_akhir: string; lokasi: string; tgl_cek: string }
  | { jenis: 'GABUNG'; lokasi: string; dari: string[] };

/**
 * "Perlu didata ulang" (§6.2/§6.3). Pembelian TIDAK dijumlahkan ke eksisting — bisa terhitung dua kali
 * di pendataan berikutnya, dan BBA tidak tahu unitnya ditaruh di lokasi mana. Gantinya ditandai:
 *  - BELI: ada unit dibeli SESUDAH pendataan terlama yang masih berlaku.
 *  - GABUNG: satu lokasi punya pendataan dari dua barang yang digabung, dan belum didata lagi sesudahnya
 *    — angkanya tidak dijumlah diam-diam (bisa jadi dua pendataan itu menghitung barang fisik yang sama).
 */
export function alasanDataUlang(semua: readonly BarisEksisting[], beli: readonly BahanBeli[]): AlasanUlang[] {
  const berlaku = eksistingBerlaku(semua);
  if (berlaku.length === 0) return [];
  const alasan: AlasanUlang[] = [];
  const terlama = berlaku.reduce((a, b) => (b.tgl_cek < a.tgl_cek ? b : a));
  const sesudah = beli.filter(b => b.tgl_realisasi && b.vol_realisasi > 0 && b.tgl_realisasi > terlama.tgl_cek);
  if (sesudah.length > 0) {
    const tgl = sesudah.map(b => b.tgl_realisasi!).sort();
    alasan.push({
      jenis: 'BELI', unit: sesudah.reduce((s, b) => s + b.vol_realisasi, 0),
      tgl_awal: tgl[0], tgl_akhir: tgl[tgl.length - 1], lokasi: terlama.lokasi_nama, tgl_cek: terlama.tgl_cek,
    });
  }
  for (const r of berlaku) {
    const dilokasi = semua.filter(x => x.barang_id === r.barang_id && x.lokasi_id === r.lokasi_id);
    const gabung = dilokasi.map(x => x.digabung_pada).filter((x): x is string => !!x).sort();
    if (gabung.length === 0) continue;
    const asal = new Set(dilokasi.map(x => x.digabung_dari ?? ''));
    if (asal.size < 2 || r.created_at > gabung[gabung.length - 1]) continue;
    alasan.push({ jenis: 'GABUNG', lokasi: r.lokasi_nama, dari: [...asal].filter(Boolean).sort((a, b) => a.localeCompare(b, 'id')) });
  }
  return alasan;
}

export function kalimatDataUlang(a: AlasanUlang, satuan = 'unit'): string {
  if (a.jenis === 'BELI') {
    const kapan = a.tgl_awal === a.tgl_akhir ? fmtTanggal(a.tgl_akhir) : `${fmtTanggal(a.tgl_awal)} – ${fmtTanggal(a.tgl_akhir)}`;
    return `${a.unit.toLocaleString('id-ID')} ${satuan} dibeli ${kapan}, sesudah pendataan ${a.lokasi} (${fmtTanggal(a.tgl_cek)}). Data ulang supaya angka eksisting memuatnya.`;
  }
  return `${a.lokasi} punya pendataan dari barang yang digabung (${a.dari.join(', ')}) — angkanya tidak dijumlah. Data ulang ${a.lokasi}.`;
}

export type RingkasEksisting = {
  kondisi: Kondisi;
  /** Pendataan yang berlaku, satu per lokasi. */
  lokasi: BarisEksisting[];
  perlu_ulang: AlasanUlang[];
};

/** Satu barang: kondisi = Σ pendataan yang berlaku di semua lokasi. */
export function ringkasEksisting(semua: readonly BarisEksisting[], beli: readonly BahanBeli[]): RingkasEksisting {
  const lokasi = eksistingBerlaku(semua);
  return { kondisi: jumlahKondisi(lokasi), lokasi, perlu_ulang: alasanDataUlang(semua, beli) };
}

/** Banyak barang sekaligus (tampilan Per Barang). Barang tanpa pendataan tidak ada di peta = "Belum didata". */
export function ringkasEksistingPerBarang(semua: readonly BarisEksisting[], beli: readonly BahanBeli[]): Map<number, RingkasEksisting> {
  const rowsPer = new Map<number, BarisEksisting[]>();
  for (const r of semua) rowsPer.set(r.barang_id, [...(rowsPer.get(r.barang_id) ?? []), r]);
  const beliPer = new Map<number, BahanBeli[]>();
  for (const b of beli) beliPer.set(b.barang_id, [...(beliPer.get(b.barang_id) ?? []), b]);
  return new Map([...rowsPer].map(([id, rows]) => [id, ringkasEksisting(rows, beliPer.get(id) ?? [])]));
}

/** Riwayat per lokasi untuk kartu barang: terbaru di atas, lokasi urut nama. */
export function riwayatPerLokasi(semua: readonly BarisEksisting[]): { lokasi_id: number; lokasi: string; baris: BarisEksisting[] }[] {
  const per = new Map<number, BarisEksisting[]>();
  for (const r of semua) per.set(r.lokasi_id, [...(per.get(r.lokasi_id) ?? []), r]);
  return [...per].map(([lokasi_id, baris]) => ({ lokasi_id, lokasi: baris[0].lokasi_nama, baris: [...baris].sort((a, b) => (lebihBaru(a, b) ? -1 : 1)) }))
    .sort((a, b) => a.lokasi.localeCompare(b.lokasi, 'id'));
}

/** Isian satu baris form pendataan: tiga kotak kosong = barang ini tidak didata kali ini (dilewati). */
export type IsianPendataan = { baik: number | null; rusak_ringan: number | null; rusak_berat: number | null };
export const isianTerisi = (i: IsianPendataan) => i.baik !== null || i.rusak_ringan !== null || i.rusak_berat !== null;
