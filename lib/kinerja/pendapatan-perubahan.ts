// lib/kinerja/pendapatan-perubahan.ts — Target Pendapatan Perubahan (tab Pendapatan & CRR).
// PURE (aman-klien): dipakai layar, server (pagar + capaian tersimpan), Beranda, dan Excel.
//
// Target pendapatan dulu satu kolom per bulan, jadi mengubahnya saat Perubahan anggaran
// menimpa target murni dan perbandingan "Murni vs Perubahan" hilang. Kini tiap bulan punya
// `target_perubahan` (NULL = belum ada Perubahan). Target berlaku = Perubahan bila ada.
// Sesudah Perubahan tersimpan, Target Murni final: server menolak perubahannya.
// Konsep: docs/CONCEPT-kinerja-pendapatan-perubahan.md

export interface BarisTargetPendapatan {
  keterangan: string;
  target: number;
  target_perubahan?: number | null;
  realisasi: number;
  capaian_pct: number;
}

const sen = (v: number | null | undefined) => Math.round(Number(v ?? 0) * 100);

export const adaTargetPerubahan = (rows: readonly { target_perubahan?: number | null }[]) =>
  rows.some(r => r.target_perubahan !== null && r.target_perubahan !== undefined);

/** Target yang dipakai capaian, Beranda, dan laporan. */
export const targetBerlaku = (r: { target: number; target_perubahan?: number | null }) =>
  r.target_perubahan ?? r.target;

export function capaianPendapatan(r: { target: number; target_perubahan?: number | null; realisasi: number }): number {
  const t = targetBerlaku(r);
  return t > 0 ? Math.round((r.realisasi / t) * 10000) / 100 : 0;
}

const dgnCapaian = <T extends BarisTargetPendapatan>(r: T): T => ({ ...r, capaian_pct: capaianPendapatan(r) });

/** Target murni disalin ke kolom Perubahan — bulan yang berubah lalu diketik di sana. */
export function buatTargetPerubahan<T extends BarisTargetPendapatan>(rows: readonly T[]): T[] {
  return rows.map(r => dgnCapaian({ ...r, target_perubahan: r.target }));
}

export function batalkanTargetPerubahan<T extends BarisTargetPendapatan>(rows: readonly T[]): T[] {
  return rows.map(r => dgnCapaian({ ...r, target_perubahan: null }));
}

export interface RingkasTargetPendapatan { murni: number; perubahan: number | null; realisasi: number; capaian: number }

export function ringkasTargetPendapatan(rows: readonly BarisTargetPendapatan[]): RingkasTargetPendapatan {
  const murni = rows.reduce((s, r) => s + r.target, 0);
  const perubahan = adaTargetPerubahan(rows) ? rows.reduce((s, r) => s + targetBerlaku(r), 0) : null;
  const realisasi = rows.reduce((s, r) => s + r.realisasi, 0);
  const berlaku = perubahan ?? murni;
  return { murni, perubahan, realisasi, capaian: berlaku > 0 ? Math.round((realisasi / berlaku) * 10000) / 100 : 0 };
}

/**
 * Selisih antara total Perubahan yang diinginkan dan total sekarang dibagi rata ke bulan yang
 * BELUM ada realisasinya — bulan yang sudah berjalan tetap. Sisa pembulatan rupiah ke bulan
 * terakhir. Memulangkan alasan (string) kalau tidak bisa.
 */
export function sebarkanSelisih<T extends BarisTargetPendapatan>(rows: readonly T[], totalBaru: number): T[] | string {
  if (!adaTargetPerubahan(rows)) return 'Buat Target Perubahan dulu.';
  const sekarang = rows.reduce((s, r) => s + targetBerlaku(r), 0);
  const selisih = Math.round(totalBaru) - Math.round(sekarang);
  if (selisih === 0) return 'Total Target Perubahan sudah sama dengan angka itu.';
  const kosong = rows.map((r, i) => (r.realisasi === 0 ? i : -1)).filter(i => i >= 0);
  if (kosong.length === 0) return 'Semua bulan sudah ada realisasinya — ubah Target Perubahan per bulan langsung di tabel.';
  const bagian = Math.trunc(selisih / kosong.length);
  const sisa = selisih - bagian * kosong.length;
  const tambah = new Map(kosong.map((i, k) => [i, bagian + (k === kosong.length - 1 ? sisa : 0)]));
  const hasil = rows.map((r, i) => {
    const t = tambah.get(i);
    return t === undefined ? r : dgnCapaian({ ...r, target_perubahan: targetBerlaku(r) + t });
  });
  const negatif = hasil.findIndex(r => targetBerlaku(r) < 0);
  if (negatif >= 0) return `Target Perubahan ${rows[negatif].keterangan} jadi negatif — kurangi selisihnya atau ubah per bulan.`;
  return hasil;
}

/**
 * Pagar server: sesudah Target Perubahan tersimpan, Target Murni tidak boleh berubah lagi
 * (termasuk di simpanan yang sekaligus membatalkan Perubahan — batalkan dulu, simpan, baru
 * ubah Murni). Baris dipasangkan menurut urutan bulan. `null` = boleh.
 */
export function alasanTolakUbahMurni(lama: readonly BarisTargetPendapatan[], baru: readonly BarisTargetPendapatan[]): string | null {
  if (!adaTargetPerubahan(lama)) return null;
  const berubah = lama.map((l, i) => (baru[i] && sen(baru[i].target) !== sen(l.target) ? l.keterangan : null)).filter(Boolean);
  if (berubah.length === 0) return null;
  return `Target Murni ${berubah.slice(0, 3).join(', ')}${berubah.length > 3 ? ` dan ${berubah.length - 3} bulan lain` : ''} `
    + 'sudah final karena Target Perubahan sudah ada. Ubah Target Perubahan-nya, atau batalkan Target Perubahan dulu.';
}

/** Ekor detail audit `KINERJA_SAVE_PENDAPATAN`: Perubahan dibuat / diubah / dibatalkan. */
export function jejakTargetPerubahan(lama: readonly BarisTargetPendapatan[], baru: readonly BarisTargetPendapatan[]): string {
  const a = ringkasTargetPendapatan(lama);
  const b = ringkasTargetPendapatan(baru);
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
  if (a.perubahan === null && b.perubahan !== null) return `; Target Perubahan dibuat: Murni ${rp(b.murni)} → Perubahan ${rp(b.perubahan)}`;
  if (a.perubahan !== null && b.perubahan === null) return `; Target Perubahan dibatalkan (sebelumnya ${rp(a.perubahan)})`;
  if (a.perubahan !== null && b.perubahan !== null && sen(a.perubahan) !== sen(b.perubahan)) {
    return `; Target Perubahan ${rp(a.perubahan)} → ${rp(b.perubahan)}`;
  }
  return '';
}
