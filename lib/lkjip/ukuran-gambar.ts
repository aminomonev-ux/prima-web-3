// Ukuran tampil gambar LKJIP. Konsep: docs/konsep/lkjip/CONCEPT-lkjip-ukuran-gambar.md.
// Satu sumber untuk docgen, impor, dan editor, supaya angka di layar sama dengan angka di Word.
import { BATAS_MARGIN_CM, KERTAS, LEBAR_DXA, MARGIN, UKURAN_KERTAS, indentTwips, type Geometri } from './halaman';

export const EMU_PER_CM = 360000;
export const EMU_PER_PX = 9525;
const EMU_PER_DXA = 635;
const RUANG_KETERANGAN_EMU = 1.5 * EMU_PER_CM;

export const LEBAR_MAKS_EMU = LEBAR_DXA * EMU_PER_DXA;
// Keterangan diikat ke gambarnya (W1), jadi gambar setinggi halaman membuatnya terpisah.
export const TINGGI_MAKS_EMU = (KERTAS.tinggi - MARGIN.atas - MARGIN.bawah) * EMU_PER_DXA - RUANG_KETERANGAN_EMU;
/**
 * Batas MUTLAK untuk data tersimpan (Zod): bidang tulis terbesar yang mungkin (kertas terbesar, margin terkecil).
 * Ganti kertas/margin tidak boleh membuat simpanan lama ditolak; yang menjepit ke dokumen adalah saat digambar.
 */
const MARGIN_MIN_DXA = indentTwips(BATAS_MARGIN_CM.min);
const LEBAR_KERTAS_MAKS = Math.max(...Object.values(UKURAN_KERTAS).map(k => k.lebar));
const TINGGI_KERTAS_MAKS = Math.max(...Object.values(UKURAN_KERTAS).map(k => k.tinggi));
export const LEBAR_MAKS_MUTLAK_EMU = (LEBAR_KERTAS_MAKS - 2 * MARGIN_MIN_DXA) * EMU_PER_DXA;
export const TINGGI_MAKS_MUTLAK_EMU = (TINGGI_KERTAS_MAKS - 2 * MARGIN_MIN_DXA) * EMU_PER_DXA - RUANG_KETERANGAN_EMU;

/** Batas gambar satu dokumen (tegak): lebar & tinggi bidang tulisnya. */
export function batasGambar(geo: Geometri): { lebarMaks: number; tinggiMaks: number } {
  return { lebarMaks: geo.lebarTulis * EMU_PER_DXA, tinggiMaks: geo.tinggiTulis * EMU_PER_DXA - RUANG_KETERANGAN_EMU };
}
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

/**
 * Lebar paling besar satu gambar bila `n` gambar berdampingan (konsep pratinjau-dan-word §4.3): bidang tulis dibagi
 * rata, dikurangi jarak isi sel kiri-kanan (108 dxa, sama dengan tabel). Satu gambar = seluruh bidang tulis.
 */
export const JARAK_SEL_DXA = 108;
export function lebarMaksEmu(n = 1, lebarTulis = LEBAR_DXA): number {
  return n <= 1 ? lebarTulis * EMU_PER_DXA : (Math.floor(lebarTulis / n) - 2 * JARAK_SEL_DXA) * EMU_PER_DXA;
}

/** Kedua sisi diperkecil sebanding bila melewati bidang tulis (atau lebar kolomnya bila berdampingan). */
export function jepitUkuran(w: number, h: number, lebarMaks = LEBAR_MAKS_EMU, tinggiMaks = TINGGI_MAKS_EMU): UkuranAlami & { diperkecil: boolean } {
  const skala = Math.min(1, lebarMaks / w, tinggiMaks / h);
  return {
    wEmu: Math.min(lebarMaks, Math.max(1, Math.round(w * skala))),
    hEmu: Math.min(tinggiMaks, Math.max(1, Math.round(h * skala))),
    diperkecil: skala < 1,
  };
}

const proporsiAlami = (u: UkuranGambar, alami: UkuranAlami): number => {
  const f = terlihat(u.potong);
  return (alami.wEmu * f.w) / (alami.hEmu * f.h);
};

export function ukuranTampilEmu(u: UkuranGambar, alami: UkuranAlami, lebarMaks = LEBAR_MAKS_EMU, tinggiMaks = TINGGI_MAKS_EMU): UkuranAlami {
  const f = terlihat(u.potong);
  const { wEmu, hEmu } = u.lebarEmu
    ? jepitUkuran(u.lebarEmu, u.tinggiEmu ?? u.lebarEmu / proporsiAlami(u, alami), lebarMaks, tinggiMaks)
    : jepitUkuran(alami.wEmu * f.w, alami.hEmu * f.h, lebarMaks, tinggiMaks);
  return { wEmu, hEmu };
}

/** Hanya ukuran pasti yang bisa menyimpang; yang mengikuti proporsi selalu sesuai. */
export function proporsiMenyimpang(u: UkuranGambar, alami: UkuranAlami): boolean {
  if (!u.lebarEmu || !u.tinggiEmu) return false;
  return Math.abs(u.lebarEmu / u.tinggiEmu / proporsiAlami(u, alami) - 1) > AMBANG_MENYIMPANG;
}

/** Persentase pratinjau: kotak mewakili bidang tulis (atau kolomnya), gambar di dalam bingkai digeser sebesar potongannya. */
export function gayaPratinjau(u: UkuranGambar, alami: UkuranAlami, lebarMaks = LEBAR_MAKS_EMU, tinggiMaks = TINGGI_MAKS_EMU) {
  const { wEmu, hEmu } = ukuranTampilEmu(u, alami, lebarMaks, tinggiMaks);
  const f = terlihat(u.potong);
  return {
    lebarPct: (wEmu / lebarMaks) * 100,
    rasio: wEmu / hEmu,
    gambar: { widthPct: 100 / f.w, heightPct: 100 / f.h, leftPct: (-f.l / f.w) * 100, topPct: (-f.t / f.h) * 100 },
  };
}

/** Yang menyimpang tetap menyimpang sebanding; hanya tombol Kembalikan proporsi yang meluruskannya. */
export function ubahLebar(u: UkuranGambar, lebarEmu: number | null, lebarMaks = LEBAR_MAKS_EMU, tinggiMaks = TINGGI_MAKS_EMU): UkuranGambar {
  if (lebarEmu == null) return { ...u, lebarEmu: null, tinggiEmu: null };
  const lebar = Math.min(lebarMaks, Math.max(LEBAR_MIN_EMU, Math.round(lebarEmu)));
  if (!u.lebarEmu || !u.tinggiEmu) return { ...u, lebarEmu: lebar, tinggiEmu: null };
  const j = jepitUkuran(lebar, (u.tinggiEmu * lebar) / u.lebarEmu, lebarMaks, tinggiMaks);
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
