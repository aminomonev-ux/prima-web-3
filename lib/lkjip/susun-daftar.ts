// ═══ PRIMA — LKJIP — Paragraf bernomor → HTML narasi (pure, aman-klien) ═══
// Dipakai Impor Word dan Tempel dari Word, supaya dua pintu masuk menyusun daftar dengan aturan yang sama.
import { KODE_DESIMAL, adalahBullet, gantungDxa, tagDaftar, tagGaya, teksNomor, type KodeGaya } from './gaya-daftar';
import { atributInden, indenBawaan, indenBerlaku, keTersimpan, type IndenTersimpan } from './halaman';

export interface NomorSusun { kunci: string; ilvl: number; gaya: KodeGaya; nomor: number; induk: number[] }
export interface ParagrafSusun {
  isi: string;
  jc: string | null;
  ind: IndenTersimpan;
  num: NomorSusun | null;
  /** HTML asli paragraf tanpa nomor (Tempel): dipakai apa adanya selama ia berdiri di luar daftar. */
  mentah?: string;
}

const pembukaP = (jc: string | null, ind = '') => (jc === 'center' ? `<p style="text-align:center"${ind}>` : jc === 'right' || jc === 'end' ? `<p style="text-align:right"${ind}>` : `<p${ind}>`);

/**
 * Tingkat Word jadi daftar bersarang sungguhan selama satu abstrak, jadi Tab/Shift+Tab bekerja dan Word menomorinya
 * sama. Tingkat yang melompat (0 → 2) dipendekkan: posisinya tetap lewat `data-ind-*`, yang ditulis hanya bila
 * berbeda dari bawaan tingkat barunya. Tiap `<ol>` membawa `start` = nomor Word butir pertamanya — daftar yang
 * terpotong paragraf/tabel tetap "2. Misi", tidak kembali ke "1.".
 *
 * `1.1.` hanya benar kalau induknya satu pohon. Word tidak butuh itu: ia membaca hitungan, walau di antaranya ada
 * paragraf tanpa nomor. Karena itu paragraf tanpa nomor yang disusul `1.1.` milik pohon ini dimasukkan ke butir
 * yang sedang terbuka (paragraf kedua butir, rata sendiri lewat `lanjutan`). Yang induknya benar-benar terpotong
 * (tabel, batas blok) tetap ditulis sebagai teks supaya tercetak sama dengan berkas asal.
 */
export function susunNarasi(par: readonly ParagrafSusun[], bawaanDxa: number, batasHtml = Infinity): string[] {
  const potong: string[] = [];
  let html = '';
  // Butir terakhir tiap daftar dibiarkan terbuka: daftar anaknya masuk ke dalam butir itu.
  const buka: { kunci: string; ilvl: number; gaya: KodeGaya; berikut: number; kiri: number }[] = [];
  const tutupSatu = () => { const d = buka.pop(); if (d) html += `</li></${tagGaya(d.gaya)}>`; };
  const tutupSemua = () => { while (buka.length) tutupSatu(); };
  const bernomorBerikut = (k: number): NomorSusun | null => {
    for (let j = k + 1; j < par.length; j++) if (par[j].num && par[j].isi) return par[j].num;
    return null;
  };
  // Tiap tingkat di atasnya harus sedang terbuka dengan nomor yang sama persis: `2.1.` tidak boleh menumpang `1.`.
  const anakPohonIni = (q: NomorSusun | null): boolean =>
    !!q && q.gaya === KODE_DESIMAL && q.ilvl > 0 && !!buka.length && buka[0].kunci === q.kunci && q.induk.length === q.ilvl
    && q.induk.every((nomor, l) => buka.some(b => b.ilvl === l && b.berikut - 1 === nomor));

  par.forEach((p, k) => {
    const isi = p.isi;
    if (!isi && p.mentah === undefined) return;
    const n = p.num;
    // +200 = tag & atribut paragraf ini; tiap tingkat terbuka masih butuh penutup.
    if (html && html.length + isi.length + 200 + buka.length * 10 > batasHtml) {
      // Blok dipecah: daftar yang sedang terbuka dilanjutkan di blok berikutnya dari nomor butir ini.
      tutupSemua();
      potong.push(html);
      html = '';
    }
    if (!n) {
      if (anakPohonIni(bernomorBerikut(k))) {
        const bawaanKiri = buka[buka.length - 1].kiri;
        if (isi) html += `${pembukaP(p.jc, atributInden(keTersimpan({ ...indenBawaan('lanjutan', bawaanKiri), ...p.ind }, 'lanjutan', bawaanKiri)))}${isi}</p>`;
        return;
      }
      tutupSemua();
      html += p.mentah ?? `${pembukaP(p.jc, atributInden(keTersimpan({ ...indenBawaan('paragraf', bawaanDxa), ...p.ind }, 'paragraf', bawaanDxa)))}${isi}</p>`;
      return;
    }
    if (buka.length && buka[buka.length - 1].kunci !== n.kunci) tutupSemua();
    while (buka.length && buka[buka.length - 1].ilvl > n.ilvl) tutupSatu();
    // Hitungan sebabstrak dipakai bersama, jadi "daftar baru" terbaca dari nomornya yang melompat.
    const sama = buka[buka.length - 1];
    if (sama && sama.ilvl === n.ilvl && (sama.gaya !== n.gaya || (!adalahBullet(n.gaya) && sama.berikut !== n.nomor))) tutupSatu();
    const puncak = buka[buka.length - 1];
    if (!puncak && n.gaya === KODE_DESIMAL && n.ilvl > 0) {
      html += `${pembukaP(p.jc, atributInden(keTersimpan({ ...indenBawaan('paragraf', bawaanDxa), ...p.ind }, 'paragraf', bawaanDxa)))}${teksNomor(n.gaya, n.nomor, n.induk)} ${isi}</p>`;
      return;
    }
    if (puncak && puncak.ilvl === n.ilvl) html += '</li>';
    else {
      html += tagDaftar(n.gaya, { start: n.nomor });
      buka.push({ kunci: n.kunci, ilvl: n.ilvl, gaya: n.gaya, berikut: n.nomor, kiri: 0 });
    }
    const atas = buka[buka.length - 1];
    atas.berikut = n.nomor + 1;
    const gantung = gantungDxa(n.gaya, buka.length);
    const simpan = keTersimpan({ ...indenBawaan('butir', 0, buka.length, gantung), ...p.ind }, 'butir', 0, buka.length, gantung);
    atas.kiri = indenBerlaku(simpan, 'butir', 0, buka.length, gantung).kiri;
    html += `<li${atributInden(simpan)}><p>${isi}</p>`;
  });
  tutupSemua();
  if (html) potong.push(html);
  return potong;
}
