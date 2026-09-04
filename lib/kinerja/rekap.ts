// lib/kinerja/rekap.ts — perhitungan view "Rekap" Cetak E-Anggaran.
// PURE: tidak menyentuh React, DOM, jaringan, maupun DB — supaya bisa diuji
// sungguhan (pola `hitungPratinjau`/`hitungRingkas` di BLUD). Sebelumnya seluruh
// rumus ini terkubur di dalam JSX CetakTab.tsx dan tidak bisa dipanggil satu kali
// pun dari uji regresi.
//
// Tiga perubahan perilaku dibanding versi JSX lama, semuanya disengaja:
//
//  1. Target rupiah DIJUMLAH, bukan dikarang ulang dari persen yang sudah
//     dibulatkan. Versi lama menulis `round(persenBulat/100 × pagu)` padahal
//     jumlah rupiahnya sudah dihitung sebaris di atasnya lalu dibuang.
//  2. Deviasi dihitung dari rasio MENTAH, dibulatkan sekali — aturan yang sudah
//     ditulis `kinerja-calc.ts` & `_utils.ts` tapi dilanggar view rekap.
//  3. Baris dikumpulkan dari SELURUH bulan <= bulan terpilih dan dikelompokkan
//     per `ssk_canonical_id`, bukan disaring `bulan === terpilih`. Versi lama
//     membuat item yang kebetulan tidak punya baris di bulan itu lenyap total —
//     pagunya keluar dari penyebut, realisasinya keluar dari pembilang.
//  4. (A8) Item DISEMAI dari SSK versi aktif, bukan dilahirkan dari baris
//     realisasi. Versi lama mengambil pagu dari `pagu_awal` baris realisasi,
//     jadi item SSK yang belum punya satu pun baris realisasi tidak terlihat —
//     sementara Laporan & Dashboard menjumlah `pagu` dari `kinerja_ssk` dan
//     melihatnya. Karena yang hilang cuma dari PENYEBUT, Rekap melaporkan
//     serapan yang LEBIH TINGGI dari kenyataan.
//     Konsep: docs/CONCEPT-kinerja-penyebut-rekap.md

import type { RealRow, SskMonths } from '@/app/(dashboard)/kinerja/_types';

export type KedalamanRekap = 'program' | 'kegiatan' | 'subkegiatan' | 'ssk' | 'full';

/**
 * Satu item SSK versi aktif — bahan penyebut Rekap.
 *
 * Datang dari `GET /api/kinerja/realisasi` bersama barisnya, jadi versi dan
 * isinya lahir dari SATU jawaban dan mustahil berselisih (L88).
 */
export interface ItemSskAktif {
  canonical_id: string;
  program:      string;
  kegiatan:     string;
  subkegiatan:  string;
  uraian_ssk:   string;
  uraian:       string;
  pagu:         number;
  months:       SskMonths | null;
}

const BULAN_KUNCI: (keyof SskMonths)[] =
  ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];

/**
 * Target RUPIAH s/d bulan ke-N. Dijumlah dari `months`, bukan dari `target_rp`
 * baris realisasi yang kebetulan ada: target itu RENCANA, dan rencana tidak
 * hilang karena tidak ada yang membuat barisnya.
 */
export function targetSampai(months: SskMonths | null, sdBulan: number): number {
  if (!months) return 0;
  let total = 0;
  for (let b = 1; b <= Math.min(sdBulan, 12); b++) total += months[BULAN_KUNCI[b - 1]] || 0;
  return total;
}

/** Satu item SSK, sudah diakumulasi s/d bulan terpilih. */
export interface ItemRekap {
  cid:         string;
  keterangan:  string;
  program:     string;
  kegiatan:    string;
  subkegiatan: string;
  uraianSsk:   string;
  pagu:        number;
  targetRp:    number;
  realFisik:   number;
  realKeu:     number;
  /** Realisasi keuangan bulan terpilih SAJA — bukan akumulasi. */
  realKeuBulanIni: number;
}

export interface AngkaRekap {
  pagu:       number;
  targetRp:   number;
  targetPct:  number;
  realFisik:  number;
  pctFisik:   number;
  devFisik:   number;
  /**
   * Realisasi fisik ÷ TARGET × 100 — berapa persen dari rencana yang tercapai.
   * Beda dengan `devFisik` yang merupakan selisih poin persen terhadap pagu.
   *
   * `null` kalau targetnya nol: "0% dari rencana nol" tidak berarti apa-apa, dan
   * pembagian dengan nol menghasilkan Infinity yang merusak seluruh baris. Di
   * layar & dokumen ditulis "—", BUKAN 0%.
   */
  capaianFisik: number | null;
  /** Bulan terpilih saja, untuk menjawab "bulan ini habis berapa" tanpa mengurangkan dua bulan. */
  realKeuBulanIni: number;
  realKeu:    number;
  pctKeu:     number;
  devKeu:     number;
}

export interface BarisRekap extends AngkaRekap {
  no:     number;
  label:  string;
  indent: number;
  tebal:  boolean;
}

/** Baris realisasi yang canonical_id-nya tidak ada di SSK versi acuan. */
export interface LaporanYatim {
  jumlahBaris: number;
  jumlahItem:  number;
  nominal:     number;
  contoh:      string[];
}

/** Satu (canonical_id, bulan) muncul lebih dari sekali — akumulasinya dobel. */
export interface LaporanDobel {
  jumlahItem: number;
  contoh:     string[];
}

export interface HasilRekap {
  baris:         BarisRekap[];
  yatim:         LaporanYatim;
  dobel:         LaporanDobel;
  bulanTersedia: number[];
}

const MAX_CONTOH = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Turunkan seluruh persen & deviasi dari nilai mentah.
 *
 * Deviasi sengaja TIDAK memakai `pctFisik`/`pctKeu` yang sudah dibulatkan:
 * `52,664 − 55,065` dan `52,66 − 55,07` bisa berbeda 0,01, dan bedanya muncul
 * tepat di angka yang dipakai orang untuk menilai capaian.
 */
export function hitungAngka(
  pagu: number, targetRp: number, realFisik: number, realKeu: number, realKeuBulanIni = 0,
): AngkaRekap {
  const targetPctRaw = pagu > 0 ? (targetRp  / pagu) * 100 : 0;
  const fisikPctRaw  = pagu > 0 ? (realFisik / pagu) * 100 : 0;
  const keuPctRaw    = pagu > 0 ? (realKeu   / pagu) * 100 : 0;
  return {
    pagu,
    targetRp,
    targetPct: r2(targetPctRaw),
    realFisik,
    pctFisik:  r2(fisikPctRaw),
    devFisik:  r2(fisikPctRaw - targetPctRaw),
    // Pembaginya TARGET, bukan pagu — itu seluruh bedanya dengan pctFisik.
    capaianFisik: targetRp > 0 ? r2((realFisik / targetRp) * 100) : null,
    realKeuBulanIni,
    realKeu,
    pctKeu:    r2(keuPctRaw),
    devKeu:    r2(keuPctRaw - targetPctRaw),
  };
}

export function jumlahkan(items: ItemRekap[]): AngkaRekap {
  let pagu = 0, targetRp = 0, realFisik = 0, realKeu = 0, bulanIni = 0;
  for (const it of items) {
    pagu      += it.pagu;
    targetRp  += it.targetRp;
    realFisik += it.realFisik;
    realKeu   += it.realKeu;
    bulanIni  += it.realKeuBulanIni;
  }
  return hitungAngka(pagu, targetRp, realFisik, realKeu, bulanIni);
}

function identitas(r: RealRow): string {
  // Sama persis dengan groupKey recalcAllRealisasi — kalau berbeda, rekap dan
  // kolom akumulasi di tab Realisasi akan mengelompokkan hal yang berbeda.
  return r.ssk_canonical_id
    ? `cid:${r.ssk_canonical_id}`
    : `${r.keterangan || ''}||${r.uraian_ssk || ''}`;
}

/**
 * Baris realisasi yang tidak punya pagu yang menaunginya.
 *
 * Dipisah dari `kumpulkanItem` karena spanduk di tab Realisasi cuma butuh ini —
 * memaksanya menyodorkan daftar item SSK yang tidak ia pakai sama sekali cuma
 * memindahkan kerumitan ke pemanggil.
 *
 * DUA sumber jawabannya, dan keduanya perlu:
 *
 *   `r.yatim`  — sudah dihitung saat hidrasi (server maupun layar), terhadap
 *                SSK versi acuan.
 *   `cidAktif` — daftar canonical yang benar-benar ada di versi yang SEDANG
 *                dibuka. Ia menangkap baris yang bendera hidrasinya belum
 *                sempat menyusul, mis. sesudah baris SSK-nya dinol-kan di layar
 *                tapi belum disimpan.
 *
 * `cidAktif` KOSONG diperlakukan sebagai "belum dimuat", BUKAN sebagai
 * pernyataan bahwa tidak ada satu pun item: tanpa itu, sekejap sebelum SSK
 * selesai dimuat seluruh baris akan dilaporkan yatim sekaligus.
 */
export function laporanYatim(rows: RealRow[], cidAktif: Set<string>, sdBulan: number): LaporanYatim {
  let jumlahBaris = 0, nominal = 0;
  const item = new Set<string>();
  for (const r of rows) {
    if (r.bulan > sdBulan) continue;
    if (!yatimkah(r, cidAktif)) continue;
    jumlahBaris += 1;
    nominal     += (r.real_keuangan || 0);
    if (r.keterangan) item.add(r.keterangan);
  }
  return {
    jumlahBaris,
    jumlahItem: item.size,
    nominal,
    contoh: Array.from(item).slice(0, MAX_CONTOH),
  };
}

function yatimkah(r: RealRow, cidAktif: Set<string>): boolean {
  if (r.yatim) return true;
  if (cidAktif.size === 0) return false;
  return !cidAktif.has(r.ssk_canonical_id || '');
}

/**
 * Kumpulkan item SSK versi aktif, lalu lipat realisasinya ke dalam — s/d `sdBulan`.
 *
 * A8: urutannya SEMAI DULU, baru dilipat. Kebalikannya (melahirkan item dari
 * baris realisasi) membuat item yang belum punya baris lenyap dari penyebut,
 * dan Rekap melaporkan serapan yang lebih tinggi dari kenyataan.
 *
 * Pagu diambil dari SSK, sekali per item — jadi baris kembar tidak lagi bisa
 * menggandakan penyebut sama sekali, bukan cuma "diambil sekali". Realisasinya
 * tetap dijumlah apa adanya, dan kekembarannya dilaporkan lewat `dobel`: yang
 * mana dari dua baris itu yang benar bukan sesuatu yang bisa ditebak program.
 *
 * Baris yatim dikeluarkan dan dilaporkan terpisah. Memasukkannya menaikkan
 * pembilang tanpa menaikkan penyebut — persen serapan jadi berdiri di atas pagu
 * yang tidak memuatnya (§9.1a BLUD).
 */
export function kumpulkanItem(rows: RealRow[], itemSsk: ItemSskAktif[], sdBulan: number): {
  items: ItemRekap[];
  yatim: LaporanYatim;
  dobel: LaporanDobel;
} {
  const items = new Map<string, ItemRekap>();
  const cidAktif = new Set<string>();

  for (const s of itemSsk) {
    const cid = s.canonical_id;
    if (!cid) continue;
    cidAktif.add(cid);
    items.set(`cid:${cid}`, {
      cid,
      keterangan:  s.uraian      || '-',
      program:     s.program     || '-',
      kegiatan:    s.kegiatan    || '-',
      subkegiatan: s.subkegiatan || '-',
      uraianSsk:   s.uraian_ssk  || '-',
      pagu:        s.pagu || 0,
      targetRp:    targetSampai(s.months, sdBulan),
      realFisik:   0,
      realKeu:     0,
      realKeuBulanIni: 0,
    });
  }

  const bulanTerlihat = new Map<string, Set<number>>();
  const cidDobel = new Set<string>();

  for (const r of rows) {
    if (r.bulan > sdBulan) continue;
    if (yatimkah(r, cidAktif)) continue;

    const key = identitas(r);
    const ada = items.get(key);
    // Tidak ketemu di semaian padahal tidak yatim: hanya mungkin untuk baris
    // lama tanpa canonical_id, yang `identitas()`-nya memang bukan `cid:`.
    // Melahirkan item baru di sini akan mengembalikan cacat A8 lewat pintu
    // belakang — pagunya akan datang dari baris realisasi lagi.
    if (!ada) continue;

    const bulanSet = bulanTerlihat.get(key) ?? new Set<number>();
    if (bulanSet.has(r.bulan)) cidDobel.add(key);
    bulanSet.add(r.bulan);
    bulanTerlihat.set(key, bulanSet);

    ada.realFisik       += r.real_fisik    || 0;
    ada.realKeu         += r.real_keuangan || 0;
    ada.realKeuBulanIni += r.bulan === sdBulan ? (r.real_keuangan || 0) : 0;
  }

  const contohDobel = Array.from(cidDobel)
    .map(k => items.get(k)?.keterangan ?? k)
    .slice(0, MAX_CONTOH);

  return {
    items: Array.from(items.values()),
    yatim: laporanYatim(rows, cidAktif, sdBulan),
    dobel: { jumlahItem: cidDobel.size, contoh: contohDobel },
  };
}

/** Bulan yang punya baris realisasi — untuk mengisi pemilih bulan. */
export function bulanTersedia(rows: RealRow[]): number[] {
  return [...new Set(rows.map(r => r.bulan))].sort((a, b) => a - b);
}

export function hitungRekap(
  rows: RealRow[],
  itemSsk: ItemSskAktif[],
  sdBulan: number,
  kedalaman: KedalamanRekap,
  labelGrandTotal: string,
): HasilRekap {
  const tersedia = bulanTersedia(rows);
  const { items, yatim, dobel } = kumpulkanItem(rows, itemSsk, sdBulan);

  const baris: BarisRekap[] = [];
  let no = 0;
  const dorong = (label: string, angka: AngkaRekap, indent: number, tebal: boolean) => {
    no += 1;
    baris.push({ no, label, indent, tebal, ...angka });
  };

  if (items.length === 0) {
    return { baris, yatim, dobel, bulanTersedia: tersedia };
  }

  dorong(labelGrandTotal, jumlahkan(items), 0, true);

  const pohon = new Map<string, Map<string, Map<string, Map<string, ItemRekap[]>>>>();
  for (const it of items) {
    if (!pohon.has(it.program)) pohon.set(it.program, new Map());
    const keg = pohon.get(it.program)!;
    if (!keg.has(it.kegiatan)) keg.set(it.kegiatan, new Map());
    const sub = keg.get(it.kegiatan)!;
    if (!sub.has(it.subkegiatan)) sub.set(it.subkegiatan, new Map());
    const ssk = sub.get(it.subkegiatan)!;
    if (!ssk.has(it.uraianSsk)) ssk.set(it.uraianSsk, []);
    ssk.get(it.uraianSsk)!.push(it);
  }

  for (const [program, kegMap] of pohon) {
    const itemProgram = Array.from(kegMap.values())
      .flatMap(sm => Array.from(sm.values()).flatMap(sk => Array.from(sk.values()).flat()));
    dorong(program, jumlahkan(itemProgram), 1, true);
    if (kedalaman === 'program') continue;

    for (const [kegiatan, subMap] of kegMap) {
      const itemKegiatan = Array.from(subMap.values()).flatMap(sk => Array.from(sk.values()).flat());
      dorong(kegiatan, jumlahkan(itemKegiatan), 2, false);
      if (kedalaman === 'kegiatan') continue;

      for (const [subkegiatan, sskMap] of subMap) {
        const itemSub = Array.from(sskMap.values()).flat();
        dorong(`** ${subkegiatan}`, jumlahkan(itemSub), 3, false);
        if (kedalaman === 'subkegiatan') continue;

        for (const [uraianSsk, daftar] of sskMap) {
          dorong(uraianSsk, jumlahkan(daftar), 4, false);
          if (kedalaman !== 'full') continue;
          for (const it of daftar) {
            dorong(it.keterangan, hitungAngka(it.pagu, it.targetRp, it.realFisik, it.realKeu, it.realKeuBulanIni), 5, false);
          }
        }
      }
    }
  }

  return { baris, yatim, dobel, bulanTersedia: tersedia };
}
