// lib/kinerja/muat-rekap.ts — bahan view "Rekap Semua Sumber" Cetak E-Anggaran.
//
// Satu resep pemuatan untuk DUA pemakai: layar Cetak (kinerja-client.tsx) dan tabel LKJIP
// yang tertaut ke Rekap. Dua salinan resep = dua jawaban untuk tabel yang sama (L78/L88).
// Urusan giliran muat (jawaban basi dibuang) tetap milik layar pemanggil.
//
// Aman-klien: tidak menyentuh DB; `ambil` adalah fetchJson pemanggil.

import type { RealRow, SumberSSK } from '@/app/(dashboard)/kinerja/_types';
import { SUMBER_LIST, recalcAllRealisasi } from '@/app/(dashboard)/kinerja/_utils';
import type { ItemSskAktif } from './rekap';
import { versiUntukPilihan, type PilihanVersiRekap, type SlotVersiSsk, type VersiSumberRekap } from './versi';
import type { ApiResult } from '@/lib/shared/api';

export type AmbilJson = (url: string) => Promise<ApiResult<unknown>>;

export interface GagalMuat { sumber: SumberSSK; status?: number; message: string }

export interface BahanRekap {
  rows:       RealRow[];
  items:      ItemSskAktif[];
  dinolkan:   SumberSSK[];
  versiRekap: VersiSumberRekap[];
  /**
   * Sumber yang permintaannya ditolak/gagal. Layar Cetak sejak dulu mendiamkannya (sumber lain
   * tetap tampil); LKJIP memakainya untuk membedakan "tidak punya akses E-Anggaran" dari
   * "memang kosong".
   */
  gagal:      GagalMuat[];
}

export async function muatBahanRekap(tahun: string, pilihan: PilihanVersiRekap, ambil: AmbilJson): Promise<BahanRekap> {
  const gagal: GagalMuat[] = [];
  const catatGagal = (sumber: SumberSSK, d: ApiResult<unknown>) => {
    if (!d.ok) gagal.push({ sumber, status: d.status, message: d.message });
  };
  const results = await Promise.all(
    SUMBER_LIST.map(async s => {
      const kosong = { sumber: s, rows: [] as RealRow[], itemSsk: [] as ItemSskAktif[],
                       dinolkan: false, versi: null as VersiSumberRekap | null };
      let param = '';
      // Diuji POSITIF (`=== 'murni'`), bukan `!== 'berlaku'`: dengan negasi, pilihan ketiga
      // yang ditambahkan nanti akan diam-diam masuk ke cabang ini dan memuat versi BERLAKU
      // sementara label & nama berkasnya mengumumkan pilihan baru itu.
      if (pilihan === 'murni') {
        // Versinya DIRESOLUSI dari daftar versi sumber itu, bukan ditulis `MURNI-0` mati —
        // nomor urut MURNI tidak dijamin 0 di mana pun.
        const dv = await ambil(`/api/kinerja/ssk/versi-list?tahun=${tahun}&sumber=${s}`);
        catatGagal(s, dv);
        const slot = dv.ok ? ((dv as { items?: SlotVersiSsk[] }).items ?? []) : [];
        const diminta = versiUntukPilihan(slot, pilihan);
        // Sumber punya SSK tapi tidak punya versi murni (MURNI-nya dihapus lewat Reset;
        // `parent_versi_id` ber-ON DELETE SET NULL sehingga PERUBAHAN-nya tetap hidup). TIDAK
        // dimuat — jatuh ke versi berlaku akan membuat layar berbunyi "murni" sambil
        // menampilkan angka perubahan. Disebut apa adanya lewat `tipe: null`.
        if (!diminta) {
          return slot.length > 0
            ? { ...kosong, versi: { sumber: s, tipe: null, seq: 0 } }
            : kosong;
        }
        param = `&versi_tipe=${diminta.tipe}&versi_seq=${diminta.seq}`;
      }
      const d = await ambil(`/api/kinerja/realisasi?tahun=${tahun}&sumber=${s}${param}`);
      if (!d.ok) { catatGagal(s, d); return kosong; }
      const j = d as { rows?: RealRow[]; itemSsk?: ItemSskAktif[];
                       versi?: { tipe?: 'MURNI'|'PERUBAHAN'; seq?: number; dinolkan?: boolean } };
      return {
        sumber: s,
        // Ditandai di sini: larik hasilnya datar, dan unduhan gabungan perlu memisahkannya
        // kembali per sumber.
        rows: (j.rows ?? []).map(r => ({ ...r, sumber: s })),
        itemSsk: j.itemSsk ?? [],
        // A9: dibaca dari balasan server, BUKAN disimpulkan dari `itemSsk.length === 0` —
        // daftar kosong punya dua sebab yang berbeda (belum diisi vs sengaja dinol-kan).
        dinolkan: j.versi?.dinolkan === true,
        versi: { sumber: s, tipe: j.versi?.tipe ?? 'MURNI', seq: Number(j.versi?.seq ?? 0) } as VersiSumberRekap,
      };
    }),
  );
  return {
    // BUG-FIX: recalc setelah fetch supaya deviasi_keuangan pakai rumus baru
    // (akum % keu - akum tgt fisik). DB row masih simpan nilai lama.
    rows: recalcAllRealisasi(results.flatMap(x => x.rows)),
    items: results.flatMap(x => x.itemSsk),
    dinolkan: results.filter(x => x.dinolkan).map(x => x.sumber),
    // Hanya sumber yang punya isi yang dicatat versinya: kop yang menyebut 8 sumber padahal
    // satu yang berdata cuma bising. Sumber ber-`tipe: null` TETAP masuk — ia punya SSK,
    // cuma tidak punya versi untuk pilihan ini. `x.dinolkan` WAJIB ikut jadi alasan masuk:
    // versi yang habis dinol-kan TIDAK punya item dan bisa belum punya realisasi, jadi tanpa
    // syarat ini ia hilang dari daftar versi di kop (cacat A9).
    versiRekap: results
      .filter(x => x.versi !== null
        && (x.versi.tipe === null || x.dinolkan || x.itemSsk.length > 0 || x.rows.length > 0))
      .map(x => x.versi as VersiSumberRekap),
    gagal,
  };
}
