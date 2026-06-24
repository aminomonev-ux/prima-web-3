// lib/theme.ts — Token warna UI terpusat (dual-theme).
// Sumber tunggal untuk SURFACE & TEKS lintas-modul. Aksen khusus modul
// (mis. gradient ungu/pink Kinerja) tetap lokal di komponen masing-masing.
//
// Light = off-white per DESIGN-SYSTEM ("bukan pure white supaya mata tidak silau"):
//   canvas #F5F5F7 · card #FAFAFA · elevated #F1EFE8. SEBELUMNYA banyak komponen
//   hardcode #FFFFFF → kontras ketinggian. Ganti `isLight ? 'X' : 'Y'` inline
//   dengan `uiTheme(isLight).<token>`.

export interface UiTheme {
  canvas: string;      // page floor
  card: string;        // surface card / panel
  elevated: string;    // table header / elevated surface
  hover: string;       // hover row / item
  rowEven: string;     // baris genap tabel
  rowOdd: string;      // baris ganjil tabel
  input: string;       // background input
  text: string;        // teks utama
  textSub: string;     // teks sekunder / caption
  textSubAlt: string;  // teks sekunder alternatif (sedikit lebih gelap)
  hairline: string;    // border tipis
  shadow: string;      // box-shadow card
}

const DARK: UiTheme = {
  canvas:     '#020F1C',
  card:       '#042C53',
  elevated:   '#0C447C',
  hover:      '#185FA5',
  rowEven:    '#042C53',
  rowOdd:     'rgba(4,44,83,.6)',
  input:      '#042C53',
  text:       '#E6F1FB',
  textSub:    '#85B7EB',
  textSubAlt: '#B5D4F4',
  hairline:   '#0C447C',
  shadow:     '0 4px 16px rgba(0,0,0,.3)',
};

const LIGHT: UiTheme = {
  canvas:     '#F5F5F7',
  card:       '#FAFAFA',
  elevated:   '#F1EFE8',
  hover:      '#EFEDE6',
  rowEven:    '#FAFAFA',
  rowOdd:     '#F3F4F6',
  input:      '#FFFFFF',
  text:       '#1F2937',
  textSub:    '#6B7280',
  textSubAlt: '#374151',
  hairline:   '#D3D1C7',
  shadow:     '0 4px 16px rgba(0,0,0,.06)',
};

export const uiTheme = (isLight: boolean): UiTheme => (isLight ? LIGHT : DARK);
