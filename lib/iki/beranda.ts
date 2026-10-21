// lib/iki/beranda.ts
// Susunan beranda IKI (docs/CONCEPT-iki-beranda.md §4): satu baris per jabatan per tahun,
// menjorok mengikuti tautan atasan, Murni & Perubahan berdampingan, plus jabatan tahun
// sebelumnya yang belum punya Murni. MURNI tanpa impor server — dipakai layar DAN route
// salin-tahun, supaya "jabatan mana yang belum ada" cuma punya satu jawaban (L78).

export type JenisIki = 'MURNI' | 'PERUBAHAN';

export type DokBeranda = {
  id: number;
  tahun: string;
  varian: 'STANDAR' | 'DIREKTUR' | 'CUSTOM';
  jenis: JenisIki;
  nama: string;
  nip: string;
  jabatan: string;
  status: 'DRAFT' | 'FINAL';
  atasan_dokumen_id: number | null;
};

export type BarisPohon<T extends DokBeranda> = {
  kunci: string;
  jabatan: string;
  nama: string;
  nip: string;
  pucuk: boolean;
  murni: T | null;
  perubahan: T | null;
  /** Dokumen tahun sumber yang akan disalin ke kolom Murni (dari `rencanaSalinTahun`). */
  sumber: T | null;
  induk: string | null;
  anak: string[];
  kedalaman: number;
  /** Bukan pucuk tapi tidak tertaut ke atasan di tahun ini — dikumpulkan terpisah, tidak disembunyikan. */
  lepas: boolean;
};

/** "Plt. KEPALA BIDANG PENUNJANG" 2026 dan "KEPALA BIDANG PENUNJANG" 2027 = jabatan yang sama. */
export function normJabatan(jabatan: string): string {
  return jabatan.replace(/^\s*(plt|plh|pjs|pj)\.?\s+/i, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

const urutJabatan = (a: string, b: string) => normJabatan(a).localeCompare(normJabatan(b), 'id');

/** Tahun terdekat SEBELUM `tahun` yang punya dokumen — sumber "Salin dari …". */
export function tahunSumber<T extends DokBeranda>(semua: T[], tahun: string): string | null {
  let hasil: string | null = null;
  for (const d of semua) if (d.tahun < tahun && (hasil === null || d.tahun > hasil)) hasil = d.tahun;
  return hasil;
}

function kedalamanDi<T extends DokBeranda>(docs: T[]): Map<number, number> {
  const byId = new Map(docs.map(d => [d.id, d]));
  const memo = new Map<number, number>();
  const hitung = (d: T, jalur: Set<number>): number => {
    const ada = memo.get(d.id);
    if (ada !== undefined) return ada;
    const atasan = d.atasan_dokumen_id != null ? byId.get(d.atasan_dokumen_id) : undefined;
    // Tautan melingkar (data rusak) diputus di sini, bukan berputar selamanya.
    const k = !atasan || jalur.has(atasan.id) ? 0 : 1 + hitung(atasan, new Set(jalur).add(d.id));
    memo.set(d.id, k);
    return k;
  };
  for (const d of docs) hitung(d, new Set([d.id]));
  return memo;
}

/**
 * Dokumen tahun sumber yang disalin jadi MURNI `tahunTarget`, berurutan dari atasan ke
 * bawahan — penaut atasan di `duplicateDokumen` mencari dokumen atasan yang SUDAH ada di
 * tahun tujuan, jadi bawahan yang tersalin lebih dulu kehilangan tautannya.
 * Per jabatan satu sumber: Perubahan (versi terakhir yang berlaku), kalau tidak ada Murni.
 * Jabatan yang sudah punya Murni di tahun tujuan dilewati.
 */
export function rencanaSalinTahun<T extends DokBeranda>(semua: T[], sumber: string, tahunTarget: string): T[] {
  const src = semua.filter(d => d.tahun === sumber);
  const sudahMurni = new Set(semua.filter(d => d.tahun === tahunTarget && d.jenis === 'MURNI').map(d => normJabatan(d.jabatan)));
  const pilih = new Map<string, T>();
  for (const d of src) {
    const k = normJabatan(d.jabatan);
    if (sudahMurni.has(k)) continue;
    const lama = pilih.get(k);
    const lebihBaik = !lama
      || (d.jenis === 'PERUBAHAN' && lama.jenis !== 'PERUBAHAN')
      || (d.jenis === lama.jenis && d.id > lama.id);
    if (lebihBaik) pilih.set(k, d);
  }
  const dalam = kedalamanDi(src);
  return [...pilih.values()].sort((a, b) =>
    (dalam.get(a.id) ?? 0) - (dalam.get(b.id) ?? 0) || urutJabatan(a.jabatan, b.jabatan));
}

/**
 * Dokumen atasan di tahun tujuan untuk tautan hasil salinan. `calon` = dokumen orang yang
 * sama (NIP) di tahun tujuan. Jabatannya harus sama dengan jabatan atasan lama (tanpa
 * "Plt."): pejabat Plt. memegang dua jabatan sekaligus, dan menautkan ke jabatan yang
 * salah membuat pohon berbohong. Orang yang hanya punya SATU jabatan di tahun tujuan
 * dianggap pindah jabatan dan tetap ditautkan; lebih dari satu jabatan tanpa ada yang cocok
 * = tidak ditautkan (masuk "belum tertaut", bukan ditebak). Lalu jenis yang sama, lalu terbaru.
 */
export function pilihDokumenAtasan(
  jabatanLama: string, calon: { id: number; jabatan: string; jenis: JenisIki }[], jenis: JenisIki,
): number | null {
  const cocok = calon.filter(c => normJabatan(c.jabatan) === normJabatan(jabatanLama));
  const pakai = cocok.length ? cocok : new Set(calon.map(c => normJabatan(c.jabatan))).size === 1 ? calon : [];
  const terbaik = [...pakai].sort((a, b) => Number(b.jenis === jenis) - Number(a.jenis === jenis) || b.id - a.id)[0];
  return terbaik?.id ?? null;
}

/** Pohon jabatan `tahun`, sudah diratakan dalam urutan tampil (atasan → bawahan). */
export function susunPohon<T extends DokBeranda>(semua: T[], tahun: string): {
  baris: BarisPohon<T>[];
  sumber: string | null;
  rencana: T[];
} {
  const docs = semua.filter(d => d.tahun === tahun);
  const peta = new Map<string, BarisPohon<T>>();
  const barisDok = new Map<number, string>();
  const baru = (kunci: string, d: T): BarisPohon<T> => ({
    kunci, jabatan: d.jabatan, nama: d.nama, nip: d.nip, pucuk: d.varian === 'DIREKTUR',
    murni: null, perubahan: null, sumber: null, induk: null, anak: [], kedalaman: 0, lepas: false,
  });

  // Perubahan dulu: nama & jabatan baris diambil dari versi yang paling akhir.
  const urut = [...docs].sort((a, b) => (a.jenis === b.jenis ? a.id - b.id : a.jenis === 'PERUBAHAN' ? -1 : 1));
  for (const d of urut) {
    const dasar = normJabatan(d.jabatan);
    const slot = d.jenis === 'MURNI' ? 'murni' : 'perubahan';
    // Satu sel = satu dokumen. Dua dokumen sejenis untuk jabatan yang sama (dua orang)
    // jadi dua baris — dokumen tidak boleh hilang dari daftar karena bertabrakan kunci.
    let kunci = dasar;
    if (peta.get(kunci)?.[slot]) kunci = `${dasar}#${d.nip}`;
    if (peta.get(kunci)?.[slot]) kunci = `${dasar}#${d.nip}#${d.id}`;
    const b = peta.get(kunci) ?? baru(kunci, d);
    b[slot] = d;
    if (d.varian === 'DIREKTUR') b.pucuk = true;
    peta.set(kunci, b);
    barisDok.set(d.id, kunci);
  }

  const sumber = tahunSumber(semua, tahun);
  const rencana = sumber ? rencanaSalinTahun(semua, sumber, tahun) : [];
  const kunciSumber = new Map<number, string>();
  for (const s of rencana) {
    const kunci = normJabatan(s.jabatan);
    const b = peta.get(kunci) ?? baru(kunci, s);
    b.sumber = s;
    if (s.varian === 'DIREKTUR') b.pucuk = true;
    peta.set(kunci, b);
    kunciSumber.set(s.id, kunci);
  }
  const dokSumber = new Map(semua.filter(d => d.tahun === sumber).map(d => [d.id, d]));

  for (const b of peta.values()) {
    const milik = [b.perubahan, b.murni].filter((d): d is T => d !== null);
    let induk: string | undefined;
    for (const d of milik) {
      if (d.atasan_dokumen_id == null) continue;
      induk = barisDok.get(d.atasan_dokumen_id);
      if (induk) break;
    }
    // Baris yang belum punya dokumen menumpang tautan dokumen sumbernya di tahun lalu.
    if (!induk && milik.length === 0 && b.sumber?.atasan_dokumen_id != null) {
      const atasLama = dokSumber.get(b.sumber.atasan_dokumen_id);
      if (atasLama) induk = peta.has(normJabatan(atasLama.jabatan)) ? normJabatan(atasLama.jabatan) : undefined;
    }
    b.induk = induk && induk !== b.kunci ? induk : null;
  }
  // Putus lingkaran: baris yang lewat jalur induknya kembali ke dirinya sendiri jadi akar.
  for (const b of peta.values()) {
    const jalur = new Set([b.kunci]);
    for (let k = b.induk; k; k = peta.get(k)?.induk ?? null) {
      if (jalur.has(k)) { b.induk = null; break; }
      jalur.add(k);
    }
  }
  for (const b of peta.values()) {
    if (b.induk) peta.get(b.induk)!.anak.push(b.kunci);
    else b.lepas = !b.pucuk;
  }

  const urutBaris = (a: BarisPohon<T>, b: BarisPohon<T>) =>
    Number(b.pucuk) - Number(a.pucuk) || urutJabatan(a.jabatan, b.jabatan) || a.kunci.localeCompare(b.kunci);
  for (const b of peta.values()) b.anak.sort((x, y) => urutBaris(peta.get(x)!, peta.get(y)!));

  const hasil: BarisPohon<T>[] = [];
  const turun = (b: BarisPohon<T>, kedalaman: number) => {
    b.kedalaman = kedalaman;
    hasil.push(b);
    for (const k of b.anak) turun(peta.get(k)!, kedalaman + 1);
  };
  // Akar yang tidak lepas pasti pucuk, dan `urutBaris` mendahulukan pucuk — jadi baris lepas
  // otomatis berkumpul di akhir, di bawah satu judul "Belum tertaut".
  const akar = [...peta.values()].filter(b => !b.induk).sort(urutBaris);
  for (const b of akar) turun(b, 0);
  return { baris: hasil, sumber, rencana };
}

export type RingkasTahun = { jabatan: number; ada: number; dokumen: number; final: number; belum: number };

export function ringkasPohon<T extends DokBeranda>(baris: BarisPohon<T>[]): RingkasTahun {
  let ada = 0, dokumen = 0, final = 0, belum = 0;
  for (const b of baris) {
    const docs = [b.murni, b.perubahan].filter((d): d is T => d !== null);
    if (docs.length) ada++; else belum++;
    dokumen += docs.length;
    final += docs.filter(d => d.status === 'FINAL').length;
  }
  return { jabatan: baris.length, ada, dokumen, final, belum };
}

/** Kunci baris yang tampil saat mencari: yang cocok BESERTA atasannya, supaya letaknya terbaca. */
export function saringPohon<T extends DokBeranda>(baris: BarisPohon<T>[], cari: string): Set<string> {
  const q = cari.trim().toLowerCase();
  const tampil = new Set<string>();
  if (!q) { for (const b of baris) tampil.add(b.kunci); return tampil; }
  const peta = new Map(baris.map(b => [b.kunci, b]));
  for (const b of baris) {
    const teks = [b.jabatan, b.nama, b.nip, b.murni?.nama, b.perubahan?.nama, b.sumber?.nama]
      .filter(Boolean).join(' ').toLowerCase();
    if (!teks.includes(q)) continue;
    for (let k: string | null = b.kunci; k && !tampil.has(k); k = peta.get(k)?.induk ?? null) tampil.add(k);
  }
  return tampil;
}

/**
 * Dokumen yang masuk zip. Ada yang dicentang → HANYA itu, saringan jenis/FINAL tidak
 * berlaku (orang sudah memilih satu per satu). Tidak ada → seluruh tahun, disaring.
 */
export function dokumenZip<T extends DokBeranda>(
  docsTahun: T[], terpilih: ReadonlySet<number>, opsi: { jenis: JenisIki | 'SEMUA'; hanyaFinal: boolean },
): T[] {
  if (terpilih.size > 0) return docsTahun.filter(d => terpilih.has(d.id));
  return docsTahun.filter(d => (opsi.jenis === 'SEMUA' || d.jenis === opsi.jenis) && (!opsi.hanyaFinal || d.status === 'FINAL'));
}

/**
 * Jalur berkas di dalam zip. Murni & Perubahan jabatan yang sama bernama berkas sama
 * (`ikiFilename` tidak memuat jenis), jadi bila keduanya ikut tiap jenis dapat foldernya
 * sendiri; nama yang masih bertabrakan (dua orang, jabatan sama) diberi akhiran _2, _3.
 */
export function jalurZip(berkas: { jenis: JenisIki; nama: string }[]): string[] {
  const duaJenis = new Set(berkas.map(b => b.jenis)).size > 1;
  const terpakai = new Set<string>();
  return berkas.map(b => {
    const dasar = `${duaJenis ? `${b.jenis}/` : ''}${b.nama}`;
    let jalur = dasar;
    for (let n = 2; terpakai.has(jalur.toLowerCase()); n++) jalur = dasar.replace(/(\.[^./]+)?$/, `_${n}$1`);
    terpakai.add(jalur.toLowerCase());
    return jalur;
  });
}
