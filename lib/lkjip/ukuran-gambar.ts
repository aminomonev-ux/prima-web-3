// Ukuran tampil gambar LKJIP. Konsep: docs/CONCEPT-lkjip-ukuran-gambar.md.
// Satu sumber untuk docgen, impor, dan editor, supaya angka di layar sama dengan angka di Word.
import { KERTAS, LEBAR_DXA, MARGIN } from './halaman';

export const EMU_PER_CM = 360000;
export const EMU_PER_PX = 9525;
const EMU_PER_DXA = 635;
const RUANG_KETERANGAN_EMU = 1.5 * EMU_PER_CM;

export const LEBAR_MAKS_EMU = LEBAR_DXA * EMU_PER_DXA;
// Keterangan diikat ke gambarnya (W1), jadi gambar setinggi halaman membuatnya terpisah.
export const TINGGI_MAKS_EMU = (KERTAS.tinggi - MARGIN.atas - MARGIN.bawah) * EMU_PER_DXA - RUANG_KETERANGAN_EMU;
export const LEBAR_MIN_CM = 1;
export const LEBAR_MAKS_CM = 15.5;
const LEBAR_MIN_EMU = LEBAR_MIN_CM * EMU_PER_CM;

const SKALA_POTONG = 100000;
/** Sisa terlihat paling sedikit 1%: pembagian di `gayaPratinjau` tidak boleh mendekati nol. */
const POTONG_MAKS = 99000;
const AMBANG_MENYIMPANG = 0.02;

/** Satuan `a:srcRect` Word: 1/1000 persen tiap sisi. */
export interface Potongan { kiri: number; atas: number; kanan: number; bawah: number }
export interface UkuranGambar { lebarEmu: number | null; tinggiEmu: number | null; potong: Potongan | null }
/** Ukuran alami berkas pada 96 dpi, sebelum dipotong dan sebelum dibatasi. */
export interface UkuranAlami { wEmu: number; hEmu: number }

export const TANPA_UKURAN: UkuranGambar = { lebarEmu: null, tinggiEmu: null, potong: null };

const positif = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const sisiSah = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= POTONG_MAKS;

export function potonganSah(p: unknown): p is Potongan {
  if (!p || typeof p !== 'object') return false;
  const { kiri, atas, kanan, bawah } = p as Record<string, unknown>;
  return sisiSah(kiri) && sisiSah(atas) && sisiSah(kanan) && sisiSah(bawah)
    && kiri + kanan <= POTONG_MAKS && atas + bawah <= POTONG_MAKS;
}

/** Payload apa pun → ukuran yang aman dipakai. Foto Riwayat lama tanpa kunci ini = otomatis. */
export function bacaUkuran(payload: unknown): UkuranGambar {
  const p = (payload ?? {}) as Record<string, unknown>;
  const lebarEmu = positif(p.lebarEmu);
  return {
    lebarEmu,
    tinggiEmu: lebarEmu ? positif(p.tinggiEmu) : null,
    potong: potonganSah(p.potong) ? p.potong : null,
  };
}

const terlihat = (p: Potongan | null) => ({
  l: (p?.kiri ?? 0) / SKALA_POTONG,
  t: (p?.atas ?? 0) / SKALA_POTONG,
  w: 1 - ((p?.kiri ?? 0) + (p?.kanan ?? 0)) / SKALA_POTONG,
  h: 1 - ((p?.atas ?? 0) + (p?.bawah ?? 0)) / SKALA_POTONG,
});

/** Kedua sisi diperkecil sebanding bila melewati bidang tulis. */
export function jepitUkuran(w: number, h: number): UkuranAlami & { diperkecil: boolean } {
  const skala = Math.min(1, LEBAR_MAKS_EMU / w, TINGGI_MAKS_EMU / h);
  return {
    wEmu: Math.min(LEBAR_MAKS_EMU, Math.max(1, Math.round(w * skala))),
    hEmu: Math.min(TINGGI_MAKS_EMU, Math.max(1, Math.round(h * skala))),
    diperkecil: skala < 1,
  };
}

const proporsiAlami = (u: UkuranGambar, alami: UkuranAlami): number => {
  const f = terlihat(u.potong);
  return (alami.wEmu * f.w) / (alami.hEmu * f.h);
};

export function ukuranTampilEmu(u: UkuranGambar, alami: UkuranAlami): UkuranAlami {
  const f = terlihat(u.potong);
  const { wEmu, hEmu } = u.lebarEmu
    ? jepitUkuran(u.lebarEmu, u.tinggiEmu ?? u.lebarEmu / proporsiAlami(u, alami))
    : jepitUkuran(alami.wEmu * f.w, alami.hEmu * f.h);
  return { wEmu, hEmu };
}

/** Hanya ukuran pasti yang bisa menyimpang; yang mengikuti proporsi selalu sesuai. */
export function proporsiMenyimpang(u: UkuranGambar, alami: UkuranAlami): boolean {
  if (!u.lebarEmu || !u.tinggiEmu) return false;
  return Math.abs(u.lebarEmu / u.tinggiEmu / proporsiAlami(u, alami) - 1) > AMBANG_MENYIMPANG;
}

/** Persentase pratinjau: kotak mewakili bidang tulis, gambar di dalam bingkai digeser sebesar potongannya. */
export function gayaPratinjau(u: UkuranGambar, alami: UkuranAlami) {
  const { wEmu, hEmu } = ukuranTampilEmu(u, alami);
  const f = terlihat(u.potong);
  return {
    lebarPct: (wEmu / LEBAR_MAKS_EMU) * 100,
    rasio: wEmu / hEmu,
    gambar: { widthPct: 100 / f.w, heightPct: 100 / f.h, leftPct: (-f.l / f.w) * 100, topPct: (-f.t / f.h) * 100 },
  };
}

/** Yang menyimpang tetap menyimpang sebanding; hanya tombol Kembalikan proporsi yang meluruskannya. */
export function ubahLebar(u: UkuranGambar, lebarEmu: number | null): UkuranGambar {
  if (lebarEmu == null) return { ...u, lebarEmu: null, tinggiEmu: null };
  const lebar = Math.min(LEBAR_MAKS_EMU, Math.max(LEBAR_MIN_EMU, Math.round(lebarEmu)));
  if (!u.lebarEmu || !u.tinggiEmu) return { ...u, lebarEmu: lebar, tinggiEmu: null };
  const j = jepitUkuran(lebar, (u.tinggiEmu * lebar) / u.lebarEmu);
  return { ...u, lebarEmu: j.wEmu, tinggiEmu: j.hEmu };
}

export const kembalikanProporsi = (u: UkuranGambar): UkuranGambar => ({ ...u, tinggiEmu: null });

/** Berkas lain = proporsi lain dan potongan lain; lebar yang sudah dipilih tetap berlaku. */
export const lepasDariBerkas = (u: UkuranGambar): UkuranGambar => ({ lebarEmu: u.lebarEmu, tinggiEmu: null, potong: null });

export const cmDariEmu = (emu: number): number => Math.round((emu / EMU_PER_CM) * 100) / 100;
export const emuDariCm = (cm: number): number => Math.round(cm * EMU_PER_CM);

export function xmlPotongan(p: Potongan | null): string {
  return p ? `<a:srcRect l="${p.kiri}" t="${p.atas}" r="${p.kanan}" b="${p.bawah}"/>` : '';
}
