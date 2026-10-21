// Isian RHK dari Rencana Aksi — dipakai tab "Dari Rencana Aksi" (grup baru) DAN tombol "Isi dari Renaksi"
// di kepala grup (mengisi grup yang RHK atasannya sudah diambil dari IKI Atasan). MURNI, aman-klien;
// regresi: scripts/test-iki-isi-renaksi.mts.
import { emptyRhk, type IkiRhk, type IkiTriwulan, type RenaksiImportRow } from './types';

type IsianRenaksi = Pick<IkiRhk, 'rhk' | 'indikator' | 'aspek_b' | 'target_tahunan' | 'renaksi_id' | 'triwulan'>;

/**
 * Satu baris Renaksi → isian kartu RHK. Cara hitung ikut jenis indikator Renaksi: target TW-nya dihitung
 * menurut jenis itu, dan peringatan TW vs tahunan memakai cara hitung ini. Uraian & Target Aksi kartu dipertahankan.
 */
export function isianRenaksi(r: RenaksiImportRow, triwulan: IkiTriwulan[]): IsianRenaksi {
  return {
    rhk: r.rhk,
    indikator: r.indikator,
    aspek_b: r.jenis,
    target_tahunan: r.target_tahunan,
    renaksi_id: r.renaksi_id,
    triwulan: triwulan.map((t, i) => ({ ...t, target_tw: r.target_tw[i] ?? '0' })),
  };
}

const twKosong = (t: IkiTriwulan) => t.target_tw.trim() === '' || t.target_tw.trim() === '0';

/** Kartu yang boleh diisi: RHK, indikator, target tahunan, dan target TW belum diketik. Isian lain tidak menentukan. */
export function kartuKosong(r: IkiRhk): boolean {
  return !r.rhk.trim() && !r.indikator.trim() && !r.target_tahunan.trim() && r.triwulan.every(twKosong);
}

export type HasilIsiGrup = {
  rhk: IkiRhk[];
  /** Kartu kosong yang terisi. */
  diisi: number;
  /** Kartu baru di grup itu untuk pilihan yang tidak kebagian kartu kosong. */
  baru: number;
  /** Kartu berisi di grup itu — tidak disentuh. */
  dilewati: number;
};

/**
 * Pilihan Renaksi → grup `noUrut`: kartu kosong diisi lebih dulu (urutan kartu), sisanya jadi kartu baru
 * sesudah kartu terakhir grup, membawa RHK atasan grup seperti tombol "+ RHK". Kartu berisi TIDAK disentuh,
 * dan RHK atasan + tautan IKI Atasan kartu yang diisi tetap.
 */
export function isiGrupDariRenaksi(semua: IkiRhk[], noUrut: number, pilihan: RenaksiImportRow[]): HasilIsiGrup {
  const antre = [...pilihan];
  let diisi = 0;
  let dilewati = 0;
  const hasil = semua.map(r => {
    if (r.no_urut !== noUrut) return r;
    if (!kartuKosong(r)) { dilewati++; return r; }
    const src = antre.shift();
    if (!src) return r;
    diisi++;
    return { ...r, ...isianRenaksi(src, r.triwulan) };
  });
  if (!antre.length) return { rhk: hasil, diisi, baru: 0, dilewati };
  const akhir = hasil.map(r => r.no_urut).lastIndexOf(noUrut);
  const rhkAtasan = akhir >= 0 ? hasil[akhir].rhk_intervensi : null;
  const kartuBaru = antre.map(src => {
    const r = emptyRhk(noUrut);
    return { ...r, rhk_intervensi: rhkAtasan, ...isianRenaksi(src, r.triwulan) };
  });
  const sisip = akhir >= 0 ? akhir + 1 : hasil.length;
  return { rhk: [...hasil.slice(0, sisip), ...kartuBaru, ...hasil.slice(sisip)], diisi, baru: kartuBaru.length, dilewati };
}

/** renaksi_id → nomor grup pertama yang memakainya (tanda "dipakai di grup N" di jendela pilih). */
export function renaksiDipakai(semua: IkiRhk[]): Map<number, number> {
  const peta = new Map<number, number>();
  for (const r of semua) if (r.renaksi_id != null && !peta.has(r.renaksi_id)) peta.set(r.renaksi_id, r.no_urut);
  return peta;
}
