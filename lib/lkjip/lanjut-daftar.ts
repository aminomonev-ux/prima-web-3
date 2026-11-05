// ═══ PRIMA — LKJIP — Nomor "Lanjut daftar" di editor (pure, aman-klien) ═══
// Cermin alokasi daftar `narasiToXml` + `makeNumAlloc` di docgen.ts: daftar baru mulai dari nomornya
// sendiri; blok "Lanjut daftar" memakai ulang daftar SEJENIS TERAKHIR — di mana pun letaknya, termasuk
// Kata Pengantar dan bab lain — dan hanya untuk daftar PERTAMA di blok itu.
// Word menomori PARAGRAF, bukan <li>: butir tanpa teks tidak memakan nomor, dan butir sesudah daftar
// bersarang memakai daftar bersarangnya (sifat narasiToXml). Daftar PERTAMA yang bersarang: butir
// terluarnya sendiri tak memakan nomor (paragrafnya sudah di-flush sebelum numPr daftar luar dipasang),
// jadi hitungan sesudahnya ikut daftar bersarang itu — bukan cacat di sini, melainkan cermin Word.
// Kesamaannya dengan berkas Word diuji di scripts/test-lkjip-lanjut-daftar.mts (bagian E khusus daftar
// pertama bersarang) — kalau narasiToXml berubah, fungsi ini wajib ikut.

import { flattenTree, type SectionNode } from './numbering';

export type JenisNomor = 'ol' | 'ola';
/** Nomor yang akan dipakai daftar angka / huruf terakhir SEBELUM sebuah blok, bila blok itu menyambungnya. */
export type LanjutanBlok = Partial<Record<JenisNomor, number>>;

export type JenisDaftar = 'ul' | JenisNomor;
interface Daftar { berikut: number }

/**
 * Nomor awal yang DITAMPILKAN daftar pertama sebuah blok: sambungan bila ada (blok dicentang dan daftar
 * sejenis sudah muncul sebelumnya), kalau tidak nomornya sendiri. `null` = daftar pertamanya bullet.
 */
export function mulaiTampil(pertama: { jenis: JenisDaftar; start?: number } | null, lanjutan?: LanjutanBlok): number | null {
  if (!pertama || pertama.jenis === 'ul') return null;
  return lanjutan?.[pertama.jenis] ?? Math.max(1, pertama.start ?? 1);
}

const POLA_MULAI = /(?<![-a-zA-Z])start\s*=\s*["']?(\d{1,4})/;
const POLA_RUJUK = /(?<![-a-zA-Z])data-rujuk\s*=\s*["']?\d{1,12}/;

/** Per blok NARASI: nomor lanjutan daftar angka & huruf (kunci tak ada = belum ada daftar sejenis sebelumnya). */
export function lanjutanDaftar(tree: SectionNode[], kataPengantarHtml = ''): Map<number, LanjutanBlok> {
  const terakhir: Partial<Record<JenisDaftar, Daftar>> = {};
  const hasil = new Map<number, LanjutanBlok>();

  // `rujuk`: di isi dokumen span rujukan jadi field REF (selalu bertulisan), di Kata Pengantar tidak.
  const jalani = (html: string, lanjut: boolean, rujuk: boolean) => {
    if (!html || !html.trim()) return;
    let pertama = true;
    let kini: Daftar | null = null;
    let dalamLi = false;
    let adaTeks = false;
    let rujukan = false;
    const span: boolean[] = [];
    for (const tok of html.split(/(<[^>]+>)/)) {
      if (tok === '') continue;
      if (!tok.startsWith('<')) { if (!(rujukan && rujuk)) adaTeks = true; continue; }
      const tag = (/^<\/?([a-zA-Z0-9]+)/.exec(tok)?.[1] ?? '').toLowerCase();
      const tutup = tok.startsWith('</');
      switch (tag) {
        case 'p': case 'h1': case 'h2': case 'h3':
          if (!dalamLi) adaTeks = false;
          break;
        case 'br': adaTeks = true; break;
        case 'span':
          if (tutup) { if (span.pop()) { if (rujuk) adaTeks = true; rujukan = false; } }
          else { const rj = !rujukan && POLA_RUJUK.test(tok); span.push(rj); if (rj) rujukan = true; }
          break;
        case 'ul': case 'ol': {
          if (tutup) break;
          const jenis: JenisDaftar = tag === 'ul' ? 'ul' : /type\s*=\s*["']?a/i.test(tok) ? 'ola' : 'ol';
          const sambung = lanjut && pertama;
          pertama = false;
          const lalu = terakhir[jenis];
          if (sambung && lalu) { kini = lalu; break; }
          kini = { berikut: Math.max(1, Number(POLA_MULAI.exec(tok)?.[1] ?? 1)) };
          terakhir[jenis] = kini;
          break;
        }
        case 'li':
          if (tutup) { if (adaTeks && kini) kini.berikut++; dalamLi = false; }
          else dalamLi = true;
          adaTeks = false;
          break;
        default: break;
      }
    }
  };

  jalani(kataPengantarHtml, false, false);
  for (const node of flattenTree(tree)) {
    for (const b of node.blocks) {
      if (b.tipe !== 'NARASI') continue;
      const p = (b.payload ?? {}) as { html?: string; continueList?: boolean };
      const l: LanjutanBlok = {};
      if (terakhir.ol) l.ol = terakhir.ol.berikut;
      if (terakhir.ola) l.ola = terakhir.ola.berikut;
      hasil.set(b.id, l);
      jalani(p.html ?? '', p.continueList === true, true);
    }
  }
  return hasil;
}
