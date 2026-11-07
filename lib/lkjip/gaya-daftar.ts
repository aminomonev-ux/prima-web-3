// ═══ PRIMA — LKJIP — Gaya daftar: SATU sumber aturan (pure, aman-klien) ═══
// Konsep `docs/CONCEPT-lkjip-daftar-word.md`. Dipakai pihak yang wajib sepakat: CSS editor, penyaring HTML,
// `docgen.ts` (numbering.xml), `lanjut-daftar.ts`, `impor-word.ts`, dan galeri bilah alat. Menambah format =
// satu baris di sini; kalau aturannya ditulis dua kali, layar dan Word bisa berbeda bunyi tanpa ada yang sadar.

import { BUTIR_GANTUNG_DXA, BUTIR_KIRI_DXA } from './halaman';

type Dasar = '1' | 'a' | 'A' | 'I' | 'i';
export type KodeNomor = `${Dasar}.` | `${Dasar})` | `(${Dasar})` | '1.1.';
export type KodeBullet = '•' | '●' | '○' | '▪' | '➢' | '✓' | '–';
export type KodeGaya = KodeNomor | KodeBullet;

const FORMAT: Record<Dasar, { word: string; css: string }> = {
  1: { word: 'decimal', css: 'decimal' },
  a: { word: 'lowerLetter', css: 'lower-alpha' },
  A: { word: 'upperLetter', css: 'upper-alpha' },
  I: { word: 'upperRoman', css: 'upper-roman' },
  i: { word: 'lowerRoman', css: 'lower-roman' },
};
const DASAR = Object.keys(FORMAT) as Dasar[];

export const KODE_DESIMAL = '1.1.' as const;
export const GAYA_BULLET: readonly KodeBullet[] = ['•', '●', '○', '▪', '➢', '✓', '–'];
export const GAYA_NOMOR: readonly KodeNomor[] = [
  ...DASAR.flatMap(d => [`${d}.`, `${d})`, `(${d})`] as KodeNomor[]),
  KODE_DESIMAL,
];
const SEMUA = new Set<string>([...GAYA_BULLET, ...GAYA_NOMOR]);

export const gayaSah = (x: unknown): x is KodeGaya => typeof x === 'string' && SEMUA.has(x);
export const adalahBullet = (k: KodeGaya): k is KodeBullet => (GAYA_BULLET as readonly string[]).includes(k);
export const tagGaya = (k: KodeGaya): 'ol' | 'ul' => (adalahBullet(k) ? 'ul' : 'ol');
export const gayaBawaan = (tag: 'ol' | 'ul'): KodeGaya => (tag === 'ul' ? '•' : '1.');

const uraiNomor = (k: KodeNomor) => {
  const m = /^(\(?)([1aAIi])([.)])$/.exec(k);
  return m ? { awal: m[1], dasar: m[2] as Dasar, akhir: m[3] } : { awal: '', dasar: '1' as Dasar, akhir: '.' };
};

// ─── Susunan tingkat ──────────────────────────────────────────────────────────
export const TINGKAT_DAFTAR = 9;
export const SUSUNAN = {
  // Keputusan pemilik: bawaan Tab mengikuti format yang dipakai berkas LKJIP-nya.
  naskah: ['1.', 'a.', '1)', 'a)', '(1)', '(a)', 'i.', '1.', 'a.'],
  word: ['1.', 'a.', 'i.', '1.', 'a.', 'i.', '1.', 'a.', 'i.'],
  desimal: Array<KodeGaya>(TINGKAT_DAFTAR).fill(KODE_DESIMAL),
  romawi: ['I.', 'A.', '1.', 'a.', '1)', 'a)', '(1)', '(a)', 'i.'],
  kurung: ['1)', 'a)', 'i)', '(1)', '(a)', '(i)', '1.', 'a.', 'i.'],
  bullet: ['•', '○', '▪', '•', '○', '▪', '•', '○', '▪'],
} as const satisfies Record<string, readonly KodeGaya[]>;
export type KodeSusunan = keyof typeof SUSUNAN;
export const URUTAN_SUSUNAN: readonly KodeSusunan[] = ['naskah', 'word', 'desimal', 'romawi', 'kurung', 'bullet'];

const BERIKUT: Partial<Record<KodeGaya, KodeGaya>> = {
  '1.': 'a.', 'a.': '1)', '1)': 'a)', 'a)': '(1)', '(1)': '(a)', '(a)': 'i.', 'i.': '1.',
  'I.': 'A.', 'A.': '1.', 'I)': 'A)', 'A)': '1)', 'i)': '(1)', '(I)': '(A)', '(A)': '(1)', '(i)': '1.',
  '•': '○', '●': '○', '○': '▪', '▪': '•', '➢': '•', '✓': '•', '–': '•',
  [KODE_DESIMAL]: KODE_DESIMAL,
};
/** Format tingkat di bawah `k` kalau belum ada yang menentukannya. */
export const gayaBerikut = (k: KodeGaya): KodeGaya => BERIKUT[k] ?? '1.';

/** Lengkapi sampai 9 tingkat: yang kosong diturunkan dari tingkat di atasnya. */
export function susunanPenuh(awal: readonly (KodeGaya | null | undefined)[]): KodeGaya[] {
  const hasil: KodeGaya[] = [];
  for (let l = 0; l < TINGKAT_DAFTAR; l++) {
    const k = awal[l];
    hasil.push(k ?? (l === 0 ? (awal.find(x => x) ?? '1.') : gayaBerikut(hasil[l - 1])));
  }
  return hasil;
}

export const tulisSusunan = (s: readonly KodeGaya[]): string => s.join('|');
/** Isian tak sah = null, bukan dibaca sebagian: susunan rusak diturunkan ulang dari pohonnya. */
export function bacaSusunan(teks: unknown): KodeGaya[] | null {
  if (typeof teks !== 'string' || !teks) return null;
  const a = teks.split('|');
  return a.length <= TINGKAT_DAFTAR && a.every(gayaSah) ? susunanPenuh(a as KodeGaya[]) : null;
}

// ─── Tag HTML ─────────────────────────────────────────────────────────────────
const POLA_GAYA = /(?<![-a-zA-Z])data-gaya\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const POLA_SUSUNAN = /(?<![-a-zA-Z])data-susunan\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const POLA_HURUF_LAMA = /(?<![-a-zA-Z])type\s*=\s*["']?a(?![a-zA-Z])|list-style-type\s*:\s*lower-alpha/i;
export const POLA_MULAI = /(?<![-a-zA-Z])start\s*=\s*["']?(\d{1,4})/;
export const POLA_LANJUT = /(?<![-a-zA-Z])data-lanjut\s*=/;

/** Gaya sebuah tag pembuka `<ol …>`/`<ul …>`. `data-gaya` yang tak cocok tagnya diabaikan. */
export function gayaDariTagDaftar(tok: string): KodeGaya {
  const tag = /^<\s*ul\b/i.test(tok) ? 'ul' : 'ol';
  const m = POLA_GAYA.exec(tok);
  const k = m ? m[1] ?? m[2] : null;
  if (gayaSah(k) && tagGaya(k) === tag) return k;
  if (tag === 'ol' && POLA_HURUF_LAMA.test(tok)) return 'a.';
  return gayaBawaan(tag);
}

export const susunanDariTag = (tok: string): KodeGaya[] | null => {
  const m = POLA_SUSUNAN.exec(tok);
  return m ? bacaSusunan(m[1] ?? m[2]) : null;
};

/**
 * Tag pembuka bentuk tersimpan — dibentuk dari tabel, bukan echo masukan. `1.`/`•` tanpa atribut dan `a.`
 * sebagai `type="a"` supaya isi dokumen lama tidak berubah bunyi lewat penyaring.
 */
export function tagDaftar(k: KodeGaya, o: { start?: number; lanjut?: boolean; susunan?: readonly KodeGaya[] | null } = {}): string {
  const tag = tagGaya(k);
  const a: string[] = [];
  if (k === 'a.') a.push(' type="a"');
  if (tag === 'ol' && o.start && o.start > 1) a.push(` start="${o.start}"`);
  if (k !== '1.' && k !== '•' && k !== 'a.') a.push(` data-gaya="${k}"`);
  if (o.susunan) a.push(` data-susunan="${tulisSusunan(o.susunan)}"`);
  if (tag === 'ol' && o.lanjut) a.push(' data-lanjut="1"');
  return `<${tag}${a.join('')}>`;
}

// ─── Lebar & teks nomor ───────────────────────────────────────────────────────
/**
 * Gantung tingkat: nomor yang lebih lebar dari gantungnya mendorong baris pertama ke tab berikutnya di Word,
 * jadi yang lebar perlu ruang lebih. `1.1.1.` di Arial 12 = 30 pt (600 dxa), jauh di atas 360.
 */
export function gantungDxa(k: KodeGaya, kedalaman = 1): number {
  if (k === KODE_DESIMAL) return BUTIR_GANTUNG_DXA + 160 * (Math.max(1, kedalaman) - 1);
  if (k === 'I.' || k === 'I)') return 540;
  if (k === '(I)') return 600;
  if (k === '(1)') return 480;
  return BUTIR_GANTUNG_DXA;
}

function romawi(n: number): string {
  const p: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let sisa = Math.max(1, Math.min(3999, n)), s = '';
  for (const [v, h] of p) while (sisa >= v) { s += h; sisa -= v; }
  return s;
}
const hurufWord = (n: number) => String.fromCharCode(97 + ((Math.max(1, n) - 1) % 26)).repeat(Math.floor((Math.max(1, n) - 1) / 26) + 1);

/** Nomor seperti yang Word tulis: `n` = hitungan tingkat ini, `induk` = hitungan tingkat di atasnya (untuk `1.1.`). */
export function teksNomor(k: KodeGaya, n: number, induk: readonly number[] = []): string {
  if (adalahBullet(k)) return k;
  if (k === KODE_DESIMAL) return `${[...induk, n].join('.')}.`;
  const { awal, dasar, akhir } = uraiNomor(k);
  const inti = dasar === '1' ? String(n) : dasar === 'a' ? hurufWord(n) : dasar === 'A' ? hurufWord(n).toUpperCase() : dasar === 'I' ? romawi(n) : romawi(n).toLowerCase();
  return `${awal}${inti}${akhir}`;
}

// ─── Word ─────────────────────────────────────────────────────────────────────
export function lvlTextWord(k: KodeGaya, ilvl: number): string {
  if (adalahBullet(k)) return k;
  if (k === KODE_DESIMAL) return `${Array.from({ length: ilvl + 1 }, (_, i) => `%${i + 1}`).join('.')}.`;
  const { awal, akhir } = uraiNomor(k);
  return `${awal}%${ilvl + 1}${akhir}`;
}
const fmtWord = (k: KodeGaya) => (adalahBullet(k) ? 'bullet' : k === KODE_DESIMAL ? 'decimal' : FORMAT[uraiNomor(k).dasar].word);
// Arial tidak punya sebagian bentuk ini — tanpa huruf yang disebut, hasilnya tergantung pengganti pilihan Word.
const FONT_SIMBOL = 'Segoe UI Symbol';
const perluFontSimbol = (k: KodeGaya) => adalahBullet(k) && k !== '•' && k !== '–';

/** `isLgl` pada `1.1.`: nomor induk selalu angka, sama dengan `counters()` di editor. */
export function xmlTingkatWord(k: KodeGaya, ilvl: number): string {
  const kiri = BUTIR_KIRI_DXA * (ilvl + 1);
  const rPr = perluFontSimbol(k) ? `<w:rPr><w:rFonts w:ascii="${FONT_SIMBOL}" w:hAnsi="${FONT_SIMBOL}" w:cs="${FONT_SIMBOL}" w:hint="default"/></w:rPr>` : '';
  return `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmtWord(k)}"/>${k === KODE_DESIMAL ? '<w:isLgl/>' : ''}<w:lvlText w:val="${lvlTextWord(k, ilvl)}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${kiri}" w:hanging="${gantungDxa(k, ilvl + 1)}"/></w:pPr>${rPr}</w:lvl>`;
}

const BULLET_WORD: [RegExp, KodeBullet][] = [
  [/●/, '●'], [/[\uF0A7■▪□]/, '▪'], [/[\uF0D8➢►▶→]/, '➢'], [/[\uF0FC✓✔]/, '✓'], [/^o$|[○◦]/, '○'], [/^[-–—]$/, '–'],
];
/** Format tingkat berkas Word → kode kita. `null` = tingkat tanpa nomor (`numFmt none`). */
export function gayaDariWord(fmt: string, lvlText: string | null | undefined): KodeGaya | null {
  if (fmt === 'none') return null;
  const t = lvlText ?? '';
  if (fmt === 'bullet') return BULLET_WORD.find(([p]) => p.test(t))?.[1] ?? '•';
  const dasar: Dasar = /^lowerLetter/.test(fmt) ? 'a' : /^upperLetter/.test(fmt) ? 'A' : /^lowerRoman/.test(fmt) ? 'i' : /^upperRoman/.test(fmt) ? 'I' : '1';
  if (dasar === '1' && /^%\d(?:\.%\d)+\.?$/.test(t)) return KODE_DESIMAL;
  const m = /^(\(?)%\d([.)])$/.exec(t);
  // Awalan tetap ("1.%1", "Bab %1") tidak bisa dibawa: jatuh ke bentuk paling dekat.
  if (!m) return `${dasar}.`;
  return `${m[1]}${dasar}${m[2]}` as KodeNomor;
}

// ─── CSS editor ───────────────────────────────────────────────────────────────
function isiCss(k: KodeNomor): string {
  if (k === KODE_DESIMAL) return 'counters(list-item, ".") "."';
  const { awal, dasar, akhir } = uraiNomor(k);
  const hitung = dasar === '1' ? 'counter(list-item)' : `counter(list-item, ${FORMAT[dasar].css})`;
  return `${awal ? `"${awal}" ` : ''}${hitung} "${akhir}"`;
}

/** Aturan format & gantung per gaya. Nilai dari tabel ini saja, bukan masukan pengguna. */
export function cssGayaDaftar(lingkup: string): string {
  const r: string[] = [];
  for (const k of GAYA_NOMOR) r.push(`${lingkup} ol[data-gaya="${k}"] > li::before { content: ${isiCss(k)}; }`);
  for (const k of GAYA_BULLET) r.push(`${lingkup} ul[data-gaya="${k}"] > li::before { content: "${k}"; }`);
  for (const k of GAYA_NOMOR) {
    if (k !== KODE_DESIMAL && gantungDxa(k) !== BUTIR_GANTUNG_DXA) r.push(`${lingkup} ol[data-gaya="${k}"] > li { --lk-gantung: ${gantungDxa(k)}; }`);
  }
  // Rantai pemilih makin panjang = kekhususan makin tinggi, jadi tingkat terdalam yang menang. Leluhurnya daftar apa
  // pun: `1.1.` di bawah `1.` (bentuk berkas Word) juga selebar tingkatnya, sama dengan `numbering.xml`.
  for (let d = 2; d <= TINGKAT_DAFTAR; d++) {
    r.push(`${lingkup} ${':is(ol, ul) '.repeat(d - 1)}ol[data-gaya="${KODE_DESIMAL}"] > li { --lk-gantung: ${gantungDxa(KODE_DESIMAL, d)}; }`);
  }
  return r.join('\n');
}
