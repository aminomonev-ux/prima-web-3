// ═══ PRIMA — LKJIP — Tempel dari Word: daftar jadi daftar sungguhan (pure, aman-klien) ═══
// Word menempelkan daftar sebagai paragraf biasa: `<p style="mso-list:l0 level1 lfo1"><![if !supportLists]>1.  <![endif]>Teks</p>`.
// Peramban membuang penanda kondisionalnya tapi membiarkan isinya, jadi "1." ikut tertempel sebagai teks ketikan.
// Bentuk ini dibaca dari papan klip Word sungguhan (`scripts/fixtures/lkjip-papan-klip/word-daftar.html`).
// Penyusunan pohonnya memakai `susunNarasi`, aturan yang sama dengan Impor Word.
import { KODE_DESIMAL, gayaDariWord, gayaSah, type KodeGaya } from './gaya-daftar';
import { dxaDariCss, type IndenTersimpan } from './halaman';
import { susunNarasi, type NomorSusun, type ParagrafSusun } from './susun-daftar';

const POLA_DAFTAR = /mso-list\s*:\s*(l\d+)\s+level(\d+)/i;
const POLA_PENANDA = /<!(?:--)?\[if !supportLists\](?:--)?>[\s\S]*?<!(?:--)?\[endif\](?:--)?>/i;
// Tab Word: spasi tak-putus dalam span bertanda, tanpa tanda itu yang tersisa hanya beberapa spasi.
const POLA_TAB_WORD = /<span\b[^>]*mso-tab-count\s*:\s*(\d+)[^>]*>[^<]*<\/span>/gi;
// Huruf Symbol & Wingdings yang ditempel Word mewakili bentuk bullet, bukan hurufnya.
const BULLET_HURUF: Record<string, string> = { '·': '•', o: 'o', '§': '▪', Ø: '➢', ü: '✓', '-': '–', '–': '–' };
const FORMAT_MSO: Record<string, string> = {
  'alpha-lower': 'lowerLetter', 'alpha-upper': 'upperLetter', 'roman-lower': 'lowerRoman', 'roman-upper': 'upperRoman', bullet: 'bullet',
};

const polos = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const nilaiGaya = (gaya: string, nama: string) => new RegExp(`(?:^|[;\\s'"])${nama}\\s*:\\s*([^;'"]+)`, 'i').exec(gaya)?.[1]?.trim() ?? null;

function bacaTingkatDaftar(html: string): Map<string, { fmt: string | null; teks: string | null }> {
  const peta = new Map<string, { fmt: string | null; teks: string | null }>();
  for (const m of html.matchAll(/@list\s+(l\d+):level(\d+)\s*\{([^}]*)\}/gi)) {
    peta.set(`${m[1]}:${m[2]}`, {
      fmt: /mso-level-number-format\s*:\s*([a-z-]+)/i.exec(m[3])?.[1]?.toLowerCase() ?? null,
      teks: /mso-level-text\s*:\s*"([^"]*)"/i.exec(m[3])?.[1]?.replace(/\\/g, '') ?? null,
    });
  }
  return peta;
}

/** `margin-left` kelas Word: tingkat 2 sering tak menuliskannya di paragraf dan memakai 36 pt milik kelas. */
function bacaKiriKelas(html: string): Map<string, number> {
  const peta = new Map<string, number>();
  for (const m of html.matchAll(/\bp\.([A-Za-z0-9]+)\s*,[^{}]*\{([^}]*)\}/g)) {
    const kiri = dxaDariCss(nilaiGaya(m[2], 'margin-left'));
    if (kiri !== null) peta.set(m[1], kiri);
  }
  return peta;
}

const angkaRomawi = (t: string) => {
  const nilai: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  const a = t.toLowerCase().split('').map(c => nilai[c] ?? 0);
  return a.reduce((j, n, i) => j + (n < (a[i + 1] ?? 0) ? -n : n), 0);
};
const angkaHuruf = (t: string) => {
  const c = t.toLowerCase();
  return (c.charCodeAt(0) - 96) + 26 * (c.length - 1);
};

/** Penanda "b)" + bentuk tingkat → nomornya. Penanda yang tak terbaca = null: paragrafnya tetap teks apa adanya. */
function bacaPenanda(penanda: string, tingkat: { fmt: string | null; teks: string | null } | undefined): { gaya: KodeGaya; nomor: number; induk: number[] } | null {
  const fmt = tingkat?.fmt ? FORMAT_MSO[tingkat.fmt] ?? 'decimal' : null;
  if (fmt === 'bullet' || penanda === 'o' || !/[\dA-Za-z]/.test(penanda)) {
    const gaya = gayaDariWord('bullet', BULLET_HURUF[penanda] ?? penanda);
    return gaya ? { gaya, nomor: 1, induk: [] } : null;
  }
  const bertingkat = /^\d+(?:\.\d+)+\.?$/.exec(penanda);
  if (bertingkat) {
    const a = penanda.replace(/\.$/, '').split('.').map(Number);
    return { gaya: KODE_DESIMAL, nomor: a[a.length - 1], induk: a.slice(0, -1) };
  }
  const m = /^(\(?)(\d+|[A-Za-z]+)([.)])$/.exec(penanda);
  if (!m) return null;
  const inti = m[2];
  const dasar = /^\d+$/.test(inti) ? '1'
    : fmt === 'lowerRoman' ? 'i' : fmt === 'upperRoman' ? 'I' : fmt === 'lowerLetter' ? 'a' : fmt === 'upperLetter' ? 'A'
      // Tanpa definisi @list: satu huruf dibaca huruf, kecuali i/I yang memulai deret romawi.
      : /^(?:[ivxlcdm]{2,}|i)$/.test(inti) ? 'i' : /^(?:[IVXLCDM]{2,}|I)$/.test(inti) ? 'I' : /^[a-z]+$/.test(inti) ? 'a' : 'A';
  const gaya = `${m[1]}${dasar}${m[3]}`;
  if (!gayaSah(gaya)) return null;
  const nomor = dasar === '1' ? Number(inti) : dasar === 'i' || dasar === 'I' ? angkaRomawi(inti) : angkaHuruf(inti);
  return { gaya, nomor: Math.max(1, nomor), induk: [] };
}

const bersihkanIsi = (html: string) => html.replace(/<o:p>[\s\S]*?<\/o:p>/gi, '').trim();

const ubahTab = (html: string) => html.replace(POLA_TAB_WORD, (_, n: string) => '<span data-tab="1">\t</span>'.repeat(Math.max(1, Math.min(20, Number(n)))));

/**
 * HTML papan klip → HTML yang dibaca editor. Yang bukan dari Word dikembalikan apa adanya, sebab paragraf,
 * judul, dan tabelnya sudah ditangani pembaca editor.
 */
export function tempelDariWord(html: string): string {
  if (!/mso-list\s*:|mso-tab-count/i.test(html)) return html;
  const tingkat = bacaTingkatDaftar(html);
  const kiriKelas = bacaKiriKelas(html);
  const fragmen = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/.exec(html)?.[1] ?? /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;

  let hasil = '';
  let run: ParagrafSusun[] = [];
  const salurkan = () => {
    if (!run.length) return;
    hasil += run.some(p => p.mentah === undefined) ? susunNarasi(run, 0).join('') : run.map(p => p.mentah).join('');
    run = [];
  };
  let lalu = 0;
  for (const m of fragmen.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const sela = fragmen.slice(lalu, m.index);
    lalu = m.index + m[0].length;
    if (sela.trim()) { salurkan(); hasil += sela; }
    run.push(bacaParagrafWord(m[0], m[1], m[2], tingkat, kiriKelas));
  }
  const ujung = fragmen.slice(lalu);
  salurkan();
  if (ujung.trim()) hasil += ujung;
  return ubahTab(hasil);
}

function bacaParagrafWord(
  utuh: string, atribut: string, dalam: string,
  tingkat: ReadonlyMap<string, { fmt: string | null; teks: string | null }>,
  kiriKelas: ReadonlyMap<string, number>,
): ParagrafSusun {
  const gaya = /style\s*=\s*(?:'([^']*)'|"([^"]*)")/i.exec(atribut);
  const css = (gaya?.[1] ?? gaya?.[2] ?? '').replace(/\s+/g, ' ');
  const kelas = /class\s*=\s*["']?([A-Za-z0-9]+)/i.exec(atribut)?.[1] ?? '';
  const rata = (nilaiGaya(css, 'text-align') ?? /align\s*=\s*["']?(\w+)/i.exec(atribut)?.[1] ?? '').toLowerCase();
  const kiri = dxaDariCss(nilaiGaya(css, 'margin-left')) ?? kiriKelas.get(kelas) ?? null;
  const pertama = dxaDariCss(nilaiGaya(css, 'text-indent'));
  const kanan = dxaDariCss(nilaiGaya(css, 'margin-right'));
  const ind: IndenTersimpan = {
    ...(kiri !== null ? { kiri: Math.max(0, kiri) } : {}),
    ...(kanan !== null && kanan > 0 ? { kanan } : {}),
    ...(pertama !== null ? { pertama } : {}),
  };
  const jc = rata === 'center' || rata === 'right' ? rata : null;
  const daftar = POLA_DAFTAR.exec(css);
  const penandaHtml = POLA_PENANDA.exec(dalam)?.[0];
  if (!daftar || !penandaHtml) return { isi: bersihkanIsi(dalam), jc, ind, num: null, mentah: utuh };

  const isi = bersihkanIsi(dalam.replace(POLA_PENANDA, ''));
  const penanda = polos(penandaHtml.replace(/<span\b[^>]*style\s*=\s*['"]font\s*:[^>]*>[\s\S]*?<\/span>/gi, '').replace(/<!(?:--)?\[[^\]]*\](?:--)?>/g, ''));
  const ilvl = Math.max(0, Number(daftar[2]) - 1);
  const baca = bacaPenanda(penanda, tingkat.get(`${daftar[1].toLowerCase()}:${daftar[2]}`));
  // Penanda tak terbaca, atau `1.1.` di tingkat teratas (pola berawalan tetap): tak bisa dibawa sebagai nomor.
  if (!baca || (baca.gaya === KODE_DESIMAL && ilvl === 0)) {
    return { isi: `${penanda} ${isi}`.trim(), jc, ind: { ...ind, ...(pertama !== null && pertama < 0 ? { pertama: 0 } : {}) }, num: null };
  }
  const num: NomorSusun = { kunci: daftar[1].toLowerCase(), ilvl, gaya: baca.gaya, nomor: baca.nomor, induk: baca.induk };
  return { isi, jc, ind, num };
}
