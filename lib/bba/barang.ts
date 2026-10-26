// lib/bba/barang.ts — Master Barang BBA: nama, saran tautan, agregasi per barang. MURNI (tanpa
// impor server): dipakai data layer, route, DAN layar. Kueri hanya mengambil bahan; semua hitungan
// "pernah dibeli / dalam proses / direncanakan" lewat sini. Konsep: docs/CONCEPT-bba-perencanaan.md §5.
import type { BbaStatus } from './status';
import { ringkasHarga, type ReferensiIsian } from './referensi';

export const PANJANG_NAMA_BARANG = 160;

/** Nama yang disimpan: rapi spasi. Huruf besar-kecil dipertahankan; kembar beda huruf ditolak kolasi `ci`. */
export function rapikanNamaBarang(nama: string | null | undefined): string {
  return (nama ?? '').replace(/\s+/g, ' ').trim().slice(0, PANJANG_NAMA_BARANG);
}

/** Kunci pembanding: rapi spasi, huruf kecil, tanpa tanda aksen — cermin kolasi `utf8mb4_0900_ai_ci`. */
export function kunciNamaBarang(nama: string | null | undefined): string {
  return rapikanNamaBarang(nama).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('id-ID');
}

/**
 * Nama barang dasar dari uraian item. Baris tarikan Usulan berbentuk "nama — spesifikasi"
 * (`mapCandidate`), jadi bagian sebelum " — " adalah nama barangnya.
 */
export function namaDasarUraian(uraian: string | null | undefined): string {
  return rapikanNamaBarang((uraian ?? '').split(' — ')[0]);
}

export type BarangRingan = { id: number; nama: string };

/**
 * Saran tautan: barang yang namanya AWALAN UTUH uraian ("Laptop" untuk "Laptop Core i5", bukan
 * untuk "Laptopan"); yang terpanjang menang ("Printer A3" mengalahkan "Printer"). Tanpa saran → null.
 */
export function saranBarang<T extends BarangRingan>(uraian: string | null | undefined, daftar: readonly T[]): T | null {
  const ku = kunciNamaBarang(uraian);
  let terbaik: T | null = null;
  let panjang = 0;
  for (const b of daftar) {
    const kb = kunciNamaBarang(b.nama);
    if (!kb || kb.length <= panjang || !ku.startsWith(kb)) continue;
    const sesudah = ku.charAt(kb.length);
    if (sesudah && /[\p{L}\p{N}]/u.test(sesudah)) continue;
    terbaik = b; panjang = kb.length;
  }
  return terbaik;
}

/** Barang yang namanya SAMA PERSIS (sesudah dirapikan) — dipakai tautan otomatis saat Tarik dari Usulan. */
export function barangBernamaSama<T extends BarangRingan>(nama: string | null | undefined, daftar: readonly T[]): T | null {
  const k = kunciNamaBarang(nama);
  return k ? daftar.find(b => kunciNamaBarang(b.nama) === k) ?? null : null;
}

// ─── Agregasi ─────────────────────────────────────────────────────────────────

/** Bahan per item; baris usulan DITOLAK disaring di sini (dikecualikan seperti KPI). */
export type BahanBarang = {
  barang_id: number | null;
  tahun_anggaran: number;
  status: BbaStatus;
  usulan_keputusan: 'DISETUJUI' | 'DITOLAK' | null;
  vol: number; vol_realisasi: number;
  nilai_rencana: number; nilai_realisasi: number;
  tgl_realisasi: string | null;
};

const terhitung = (b: BahanBarang) => b.usulan_keputusan !== 'DITOLAK';
const terbeli = (b: BahanBarang) => (b.status === 'REALISASI_PENUH' || b.status === 'REALISASI_SEBAGIAN') && b.vol_realisasi > 0;
const hargaSatuan = (nilai: number, vol: number) => vol > 0 ? Math.round(nilai / vol) : null;

export type RingkasBarang = {
  /** Σ unit terealisasi, tahun ≤ T. */
  dibeli: number;
  tahun_beli_terakhir: number | null;
  /** nilai ÷ unit realisasi dari pembelian TERAKHIR (tahun, lalu tanggal realisasi). */
  harga_beli_terakhir: number | null;
  /** Σ unit berstatus Dalam Proses, tahun ≤ T — pesanan tahun lalu bisa belum datang. */
  diproses: number;
  /** Σ unit berstatus Direncanakan di tahun T. */
  direncanakan: number;
  /** Jumlah item & Σ nilai rencana tahun T (semua status) — penjumlahnya = KPI Total Rencana. */
  item_tahun: number;
  rencana_tahun: number;
};

export const ringkasKosong = (): RingkasBarang => ({
  dibeli: 0, tahun_beli_terakhir: null, harga_beli_terakhir: null, diproses: 0, direncanakan: 0, item_tahun: 0, rencana_tahun: 0,
});

/** Untuk tahun T: per barang + satu kelompok "Belum ditautkan" (item tahun T tanpa barang). */
export function ringkasPerBarang(bahan: readonly BahanBarang[], tahun: number): { perBarang: Map<number, RingkasBarang>; belum: { item: number; direncanakan: number; rencana: number } } {
  const perBarang = new Map<number, RingkasBarang>();
  const terakhir = new Map<number, BahanBarang>();
  const belum = { item: 0, direncanakan: 0, rencana: 0 };
  for (const b of bahan) {
    if (!terhitung(b) || b.tahun_anggaran > tahun) continue;
    const ini = b.tahun_anggaran === tahun;
    if (b.barang_id == null) {
      if (ini) {
        belum.item++; belum.rencana += b.nilai_rencana;
        if (b.status === 'DIRENCANAKAN') belum.direncanakan += b.vol;
      }
      continue;
    }
    const r = perBarang.get(b.barang_id) ?? ringkasKosong();
    if (terbeli(b)) {
      r.dibeli += b.vol_realisasi;
      const t = terakhir.get(b.barang_id);
      if (!t || b.tahun_anggaran > t.tahun_anggaran
        || (b.tahun_anggaran === t.tahun_anggaran && (b.tgl_realisasi ?? '') > (t.tgl_realisasi ?? ''))) terakhir.set(b.barang_id, b);
    }
    if (b.status === 'DIPROSES') r.diproses += b.vol;
    if (ini) {
      r.item_tahun++; r.rencana_tahun += b.nilai_rencana;
      if (b.status === 'DIRENCANAKAN') r.direncanakan += b.vol;
    }
    perBarang.set(b.barang_id, r);
  }
  for (const [id, t] of terakhir) {
    const r = perBarang.get(id)!;
    r.tahun_beli_terakhir = t.tahun_anggaran;
    r.harga_beli_terakhir = hargaSatuan(t.nilai_realisasi, t.vol_realisasi);
  }
  return { perBarang, belum };
}

export type BarisRiwayat = {
  tahun: number; item: number;
  vol_rencana: number; nilai_rencana: number;
  vol_realisasi: number; nilai_realisasi: number;
  /** nilai ÷ unit realisasi setahun itu; tanpa realisasi → null. */
  harga_satuan: number | null;
  /** Rata-rata referensi harga sah item-item tahun itu (tren harga survei). */
  ref_rata: number | null;
  status: Partial<Record<BbaStatus, number>>;
};

export type BahanRefBarang = Pick<ReferensiIsian, 'harga' | 'url' | 'file_id'> & { tahun_anggaran: number };

/** Riwayat satu barang per tahun, terbaru di atas. Baris usulan DITOLAK tidak dihitung. */
export function riwayatPerTahun(bahan: readonly BahanBarang[], refs: readonly BahanRefBarang[] = []): BarisRiwayat[] {
  const per = new Map<number, BarisRiwayat>();
  for (const b of bahan) {
    if (!terhitung(b)) continue;
    const r = per.get(b.tahun_anggaran) ?? {
      tahun: b.tahun_anggaran, item: 0, vol_rencana: 0, nilai_rencana: 0, vol_realisasi: 0, nilai_realisasi: 0,
      harga_satuan: null, ref_rata: null, status: {},
    };
    r.item++;
    r.vol_rencana += b.vol; r.nilai_rencana += b.nilai_rencana;
    if (terbeli(b)) { r.vol_realisasi += b.vol_realisasi; r.nilai_realisasi += b.nilai_realisasi; }
    r.status[b.status] = (r.status[b.status] ?? 0) + 1;
    per.set(b.tahun_anggaran, r);
  }
  for (const r of per.values()) {
    r.harga_satuan = hargaSatuan(r.nilai_realisasi, r.vol_realisasi);
    r.ref_rata = ringkasHarga(refs.filter(x => x.tahun_anggaran === r.tahun))?.rata ?? null;
  }
  return [...per.values()].sort((a, b) => b.tahun - a.tahun);
}
