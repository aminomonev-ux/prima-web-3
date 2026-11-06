// ═══ PRIMA — LKJIP — Nomor "Lanjut daftar" di editor (pure, aman-klien) ═══
// Cermin alokasi daftar `narasiToXml` + `makeNumAlloc` di docgen.ts: daftar baru mulai dari nomornya
// sendiri; blok "Lanjut daftar" memakai ulang daftar SEJENIS TERAKHIR — di mana pun letaknya, termasuk
// Kata Pengantar dan bab lain — dan hanya untuk daftar PERTAMA di blok itu.
// Word menomori PARAGRAF, bukan <li>: butir tanpa teks tidak memakan nomor, dan paragraf kedua sebuah butir
// tidak bernomor. Daftar bersarang punya hitungan sendiri, jadi tidak ikut hitungan sambungan.
// "Sejenis" = gaya yang sama (`gaya-daftar.ts`): `1.` tidak menyambung `1)`. `data-lanjut` menyambung di mana pun.
// Kesamaannya dengan berkas Word diuji di scripts/test-lkjip-lanjut-daftar.mts — kalau narasiToXml berubah,
// fungsi ini wajib ikut.

import { flattenTree, type SectionNode } from './numbering';
import { POLA_LANJUT, POLA_MULAI, adalahBullet, gayaDariTagDaftar, type KodeGaya } from './gaya-daftar';

/** Nomor yang akan dipakai daftar terakhir tiap gaya SEBELUM sebuah blok, bila blok itu menyambungnya. */
export type LanjutanBlok = Partial<Record<KodeGaya, number>>;
interface Daftar { berikut: number }

/** Daftar akar sebuah blok, sebagaimana terbaca dari isi editor. `bernomor` = butir yang memakai nomor (bertulisan). */
export interface AkarBlok { gaya: KodeGaya; start?: number; lanjut?: boolean; bernomor: number }

/**
 * Nomor awal yang DITAMPILKAN tiap daftar akar sebuah blok, urut seperti di blok itu: sambungan bila dicentang
 * (daftar pertama, centang blok) atau `lanjut` dan daftar sebaya sudah ada, kalau tidak nomornya sendiri.
 * `null` = bullet. Cermin `alloc` di docgen.ts.
 */
export function mulaiDaftarBlok(akar: readonly AkarBlok[], lanjutan: LanjutanBlok | undefined, continueList: boolean): (number | null)[] {
  const terakhir: LanjutanBlok = { ...(lanjutan ?? {}) };
  return akar.map((a, i) => {
    if (adalahBullet(a.gaya)) return null;
    const sambung = a.lanjut || (continueList && i === 0);
    const mulai = (sambung ? terakhir[a.gaya] : undefined) ?? Math.max(1, a.start ?? 1);
    terakhir[a.gaya] = mulai + a.bernomor;
    return mulai;
  });
}

const POLA_RUJUK = /(?<![-a-zA-Z])data-rujuk\s*=\s*["']?\d{1,12}/;

/** Per blok NARASI: nomor lanjutan daftar angka & huruf (kunci tak ada = belum ada daftar sejenis sebelumnya). */
export function lanjutanDaftar(tree: SectionNode[], kataPengantarHtml = ''): Map<number, LanjutanBlok> {
  const terakhir: Partial<Record<KodeGaya, Daftar>> = {};
  const hasil = new Map<number, LanjutanBlok>();

  // `rujuk`: di isi dokumen span rujukan jadi field REF (selalu bertulisan), di Kata Pengantar tidak.
  const jalani = (html: string, lanjut: boolean, rujuk: boolean) => {
    if (!html || !html.trim()) return;
    let pertama = true;
    // `null` = daftar bersarang: bernomor sendiri, tidak pernah jadi yang disambung.
    const daftar: (Daftar | null)[] = [];
    const butir: { bernomor: boolean }[] = [];
    const dalamButir = () => daftar.length > 0 && butir.length === daftar.length;
    let adaTeks = false;
    let rujukan = false;
    const span: boolean[] = [];
    // Cermin `tulisButir`: paragraf bertulisan pertama sebuah butir yang memakai nomor.
    const catatButir = () => {
      const b = butir[butir.length - 1];
      if (b && adaTeks && !b.bernomor) {
        const d = daftar[daftar.length - 1];
        if (d) d.berikut++;
        b.bernomor = true;
      }
      adaTeks = false;
    };
    for (const tok of html.split(/(<[^>]+>)/)) {
      if (tok === '') continue;
      if (!tok.startsWith('<')) { if (!(rujukan && rujuk)) adaTeks = true; continue; }
      const tag = (/^<\/?([a-zA-Z0-9]+)/.exec(tok)?.[1] ?? '').toLowerCase();
      const tutup = tok.startsWith('</');
      switch (tag) {
        case 'p':
          if (dalamButir()) catatButir();
          else adaTeks = false;
          break;
        case 'h1': case 'h2': case 'h3':
          if (!dalamButir()) adaTeks = false;
          break;
        case 'br': adaTeks = true; break;
        case 'span':
          if (tutup) { if (span.pop()) { if (rujuk) adaTeks = true; rujukan = false; } }
          else { const rj = !rujukan && POLA_RUJUK.test(tok); span.push(rj); if (rj) rujukan = true; }
          break;
        case 'ul': case 'ol': {
          if (tutup) {
            if (dalamButir()) { catatButir(); butir.pop(); }
            daftar.pop();
            break;
          }
          if (dalamButir()) catatButir();
          if (daftar.length > 0) { daftar.push(null); break; }
          const jenis = gayaDariTagDaftar(tok);
          const sambung = (lanjut && pertama) || POLA_LANJUT.test(tok);
          pertama = false;
          const lalu = terakhir[jenis];
          if (sambung && lalu) { daftar.push(lalu); break; }
          const baru = { berikut: Math.max(1, Number(POLA_MULAI.exec(tok)?.[1] ?? 1)) };
          terakhir[jenis] = baru;
          daftar.push(baru);
          break;
        }
        case 'li':
          if (dalamButir()) { catatButir(); butir.pop(); }
          adaTeks = false;
          if (!tutup && daftar.length > 0) butir.push({ bernomor: false });
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
      for (const [g, d] of Object.entries(terakhir) as [KodeGaya, Daftar][]) if (!adalahBullet(g)) l[g] = d.berikut;
      hasil.set(b.id, l);
      jalani(p.html ?? '', p.continueList === true, true);
    }
  }
  return hasil;
}
