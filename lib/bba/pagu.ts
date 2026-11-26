// lib/bba/pagu.ts — pagu belanja modal untuk lembar keputusan anggaran BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §4).
// MURNI (tanpa impor server): dipakai route `pagu-blud`, kartu pagu di layar, dan uji. Pagu ini ALAT BANTU memutuskan —
// tidak disimpan; data anggarannya tetap DPA/Pergeseran BLUD.
import type { Anggaran } from './rencana';

export type BarisPagu = { row_id: string; parent_id: string | null; kode_rekening: string | null; uraian: string | null; nilai: number };
export type DasarPagu = 'KODE' | 'URAIAN' | 'TIDAK_ADA';

/** "5.2", "5.02", " 5.2.03 " → [5, 2, 3]. Ruas bukan angka = bukan kode rekening. */
function ruas(kode: string | null): number[] | null {
  const t = (kode ?? '').replace(/\s+/g, '');
  if (!t || !/^\d+(\.\d+)*\.?$/.test(t)) return null;
  return t.replace(/\.$/, '').split('.').map(Number);
}
const kodeModal = (kode: string | null) => { const r = ruas(kode); return !!r && r.length >= 2 && r[0] === 5 && r[1] === 2; };
const uraianModal = (u: string | null) => /belanja\s+modal/i.test(u ?? '');

/**
 * Total belanja modal = Σ baris "akar belanja modal": berkode 5.2… sementara tidak ada LELUHUR-nya yang berkode 5.2
 * (cabang 5.2.03 yang tersimpan di bawah 5.2.02 tidak dihitung dua kali). Leluhur, bukan induk langsung: baris
 * pengelompok tanpa kode di antara keduanya tidak boleh membuatnya terhitung ulang. Tanpa baris berkode 5.2 →
 * baris ber-uraian "BELANJA MODAL" teratas (formulir yang kodenya lain).
 */
export function paguBelanjaModal(rows: readonly BarisPagu[]): { nilai: number; dasar: DasarPagu; akar: number } {
  const per = new Map(rows.map(r => [r.row_id, r]));
  const leluhurCocok = (r: BarisPagu, cocok: (x: BarisPagu) => boolean) => {
    const lewat = new Set<string>([r.row_id]);
    for (let p = r.parent_id ? per.get(r.parent_id) : undefined; p && !lewat.has(p.row_id); p = p.parent_id ? per.get(p.parent_id) : undefined) {
      if (cocok(p)) return true;
      lewat.add(p.row_id);
    }
    return false;
  };
  for (const [dasar, cocok] of [['KODE', (x: BarisPagu) => kodeModal(x.kode_rekening)], ['URAIAN', (x: BarisPagu) => uraianModal(x.uraian)]] as const) {
    const akar = rows.filter(r => cocok(r) && !leluhurCocok(r, cocok));
    if (akar.length) return { nilai: Math.round(akar.reduce((s, r) => s + r.nilai, 0) * 100) / 100, dasar, akar: akar.length };
  }
  return { nilai: 0, dasar: 'TIDAK_ADA', akar: 0 };
}

export const SUMBER_PAGU = ['berlaku', 'dpa', 'pergeseran', 'ketik'] as const;
export type SumberPaguBba = typeof SUMBER_PAGU[number];
export const LABEL_SUMBER_PAGU: Record<SumberPaguBba, string> = {
  berlaku: 'Yang berlaku sekarang', dpa: 'DPA BLUD terbaru', pergeseran: 'Pergeseran terbaru', ketik: 'Ketik sendiri',
};
export const SUMBER_DANA_PAGU = ['BLUD', 'APBD', 'DAK', 'LAINNYA', 'SEMUA'] as const;
export type SumberDanaPagu = typeof SUMBER_DANA_PAGU[number];

/** Pagu BLUD hanya dibandingkan dengan rencana bersumber BLUD; selain BLUD pagunya harus diketik. */
export const paguBisaDariBlud = (dana: SumberDanaPagu) => dana === 'BLUD';

type RencanaPagu = { id: number; sumber_anggaran: string; anggaran: Anggaran; nilai_rencana: number; anggaran_nilai: number | null };

/**
 * Hitungan kartu pagu (§4.3): sudah didanai (tersimpan) + pilihan yang berubah (ke Danai menambah, dari Didanai
 * mengurangi), lalu sisanya. Didanai tersimpan memakai `anggaran_nilai` (nilai saat ditandai); pilihan baru memakai
 * nilai rencana sekarang — sama dengan yang akan ditulis server saat disimpan.
 */
export function hitungKartuPagu(pagu: number | null, rows: readonly RencanaPagu[], pilihan: ReadonlyMap<number, Anggaran>, dana: SumberDanaPagu) {
  const ikut = rows.filter(r => dana === 'SEMUA' || r.sumber_anggaran === dana);
  const tersimpan = (r: RencanaPagu) => r.anggaran_nilai ?? r.nilai_rencana;
  const sudah = ikut.filter(r => r.anggaran === 'DIDANAI').reduce((s, r) => s + tersimpan(r), 0);
  let pilihanIni = 0;
  for (const r of ikut) {
    const baru = pilihan.get(r.id);
    if (baru === undefined || baru === r.anggaran) continue;
    if (baru === 'DIDANAI') pilihanIni += r.nilai_rencana;
    else if (r.anggaran === 'DIDANAI') pilihanIni -= tersimpan(r);
  }
  const terpakai = sudah + pilihanIni;
  return { sudah, pilihanIni, terpakai, sisa: pagu === null ? null : pagu - terpakai, lewat: pagu !== null && terpakai > pagu + 0.005 };
}
