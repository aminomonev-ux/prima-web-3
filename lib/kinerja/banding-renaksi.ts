// lib/kinerja/banding-renaksi.ts — Master E-Anggaran dibandingkan dengan Rencana Aksi tahun yang sama.
//
// PURE & aman-klien. Konsep: docs/CONCEPT-renaksi-terhubung.md §5.3. Tidak ada status
// "sudah dibaca": pemberitahuan muncul selama Master memang berbeda dari Renaksi dan hilang
// sendiri begitu sudah sama.
//
// Ganti nama dikenali dari catatan `renaksi_ganti_nama` (Tahap A), bukan ditebak dari
// kemiripan nama. Identitas = JALUR [program, kegiatan, sub kegiatan]: kegiatan senama di
// program lain entitas lain.

import type { MasterTipe } from '@/lib/data/kinerja';
import {
  dariRenaksi, jalurAdaDiRenaksi, kunciNamaRenaksi, bisaDariRenaksi,
  type EntriBerasal, type BarisRenaksi,
} from './asal-renaksi';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';

export interface EntriBanding extends EntriBerasal { id: number }

export interface CatatanGanti {
  level: string;
  dari: string;
  ke: string;
  induk: string | null;
  induk_program: string | null;
  /** Tahap H — induk BARU bila entitas dipindah (kegiatan: program; sub: kegiatan). Kosong = tetap. */
  induk_baru?: string | null;
  /** Tahap H — program BARU sub kegiatan. Kosong = tetap. */
  induk_program_baru?: string | null;
}

type TipeBerasal = Extract<MasterTipe, 'program' | 'kegiatan' | 'subkegiatan' | 'sumber_anggaran'>;

export interface ItemEntri {
  id: number;
  tipe: TipeBerasal;
  nama: string;
  program_ref: string | null;
  kegiatan_ref: string | null;
}

/**
 * `ke` = nama Renaksi tanpa penanda — nama yang akan ditulis ke Master. Tahap H: bila entitas
 * itu sendiri DIPINDAH di Renaksi, `program_ke` (kegiatan & sub) dan `kegiatan_ke` (sub) berisi
 * induk tujuannya; tanpa itu (`undefined`) induknya tetap.
 */
export interface ItemGanti extends ItemEntri {
  ke: string;
  program_ke?: string;
  kegiatan_ke?: string;
}

/** Item ini memindah induk (bukan sekadar ganti nama)? */
export const itemPindah = (g: ItemGanti): boolean => g.program_ke !== undefined || g.kegiatan_ke !== undefined;

/** Isian Edit Master (yang menjalar) untuk satu item — induk hanya dikirim bila memang dipindah. */
export function badanUbahMaster(g: ItemGanti): { nama: string; program_ref?: string; kegiatan_ref?: string } {
  return {
    nama: g.ke,
    ...(g.program_ke !== undefined ? { program_ref: g.program_ke } : {}),
    ...(g.kegiatan_ke !== undefined ? { kegiatan_ref: g.kegiatan_ke } : {}),
  };
}

/**
 * Induk tujuan pindah belum ada di Master tapi ada di daftar "Baru" — Edit Master menolak induk
 * yang tidak ada (L68), jadi item ini menunggu entri baru dibuat lebih dulu.
 */
export function indukTujuanDiBaru(g: ItemGanti, baru: readonly ItemBaru[]): boolean {
  if (!itemPindah(g)) return false;
  const adaProgram = baru.some(b => b.tipe === 'program' && k(b.nama) === k(g.program_ke));
  const adaKegiatan = g.tipe === 'subkegiatan'
    && baru.some(b => b.tipe === 'kegiatan' && k(b.nama) === k(g.kegiatan_ke) && k(b.program_ref) === k(g.program_ke));
  return adaProgram || adaKegiatan;
}

export interface ItemBaru {
  tipe: TipeBerasal;
  nama: string;
  program_ref: string | null;
  kegiatan_ref: string | null;
  /** Dikirim ke Init Renaksi sebagai pilihan (`kunciJalur`). */
  kunci: string;
}

export interface HasilBanding {
  gantiNama: ItemGanti[];
  baru: ItemBaru[];
  hilang: ItemEntri[];
  /** Entri manual yang jalurnya ada di Renaksi — ditawarkan, tidak memunculkan spanduk. */
  belumBertanda: ItemEntri[];
}

/** Kunci jalur yang dipakai bersama pembanding DAN Init Renaksi (pilihan dialog). */
export function kunciJalur(tipe: string, nama: string, program: string | null, kegiatan: string | null): string {
  return [tipe, nama, program ?? '', kegiatan ?? ''].map(kunciNamaRenaksi).join('|');
}

/** Jumlah yang memunculkan spanduk. "Belum bertanda" bukan perubahan Renaksi. */
export function jumlahPerubahan(h: HasilBanding): number {
  return h.gantiNama.length + h.baru.length + h.hilang.length;
}

export function kalimatSpanduk(h: HasilBanding, tahun: string | number): string {
  const pindah = h.gantiNama.filter(itemPindah).length;
  const ganti = h.gantiNama.length - pindah;
  const bagian = [
    ganti ? `${ganti} berganti nama` : '',
    pindah ? `${pindah} pindah induk` : '',
    h.baru.length ? `${h.baru.length} baru` : '',
    h.hilang.length ? `${h.hilang.length} tidak ada lagi` : '',
  ].filter(Boolean);
  return `Rencana Aksi ${tahun} berbeda dari Master: ${bagian.join(', ')}.`;
}

const k = kunciNamaRenaksi;
const bersih = (s: string) => rapikanNamaEntitas(s);

/** Tempat akhir sebuah entitas: induknya (teks tampil) dan namanya. */
interface Lokasi { induk: string[]; nama: string }

/**
 * Peta ganti nama / pindah induk satu tingkat, rantai dirangkai: A → B → C terbaca A → C
 * (B → C juga), A → B → A saling meniadakan. Yang disimpan LOKASI akhir (induk + nama),
 * bukan nama saja (Tahap H): catatan "K dipindah P1 → P2" lalu "K di P2 diganti K2" harus
 * terbaca (P1, K) → (P2, K2). `awalan` = kunci induk AKHIR, supaya catatan yang ditulis
 * sebelum dan sesudah induknya berganti nama jatuh di kelompok yang sama.
 */
class PetaGanti {
  private peta = new Map<string, Lokasi & { awalan: string }>();
  tambah(awalan: string, dari: string, awalanBaru: string, induk: string[], ke: string) {
    const tujuan = { awalan: awalanBaru, induk, nama: ke };
    for (const [kunci, nilai] of this.peta) {
      if (nilai.awalan === awalan && k(nilai.nama) === k(dari)) this.peta.set(kunci, tujuan);
    }
    const kd = `${awalan}\u0001${k(dari)}`;
    if (!this.peta.has(kd)) this.peta.set(kd, tujuan);
  }
  akhir(awalan: string, nama: string): Lokasi | null {
    const v = this.peta.get(`${awalan}\u0001${k(nama)}`);
    return v ? { induk: v.induk, nama: v.nama } : null;
  }
}

function petaDariCatatan(catatan: readonly CatatanGanti[]) {
  const program = new PetaGanti();
  for (const c of catatan) if (c.level === 'program') program.tambah('', c.dari, '', [], c.ke);
  const progAkhir = (p: string | null) => (p ? (program.akhir('', p)?.nama ?? p) : '');

  const kegiatan = new PetaGanti();
  for (const c of catatan) {
    if (c.level !== 'kegiatan') continue;
    const pBaru = progAkhir(c.induk_baru || c.induk);
    kegiatan.tambah(k(progAkhir(c.induk)), c.dari, k(pBaru), [pBaru], c.ke);
  }
  // Lokasi akhir kegiatan (program, nama) — kegiatan yang dipindah membawa sub-nya.
  const kegLok = (p: string, kg: string | null): [string, string] => {
    if (!kg) return [p, ''];
    const l = kegiatan.akhir(k(p), kg);
    return l ? [l.induk[0], l.nama] : [p, kg];
  };

  const sub = new PetaGanti();
  for (const c of catatan) {
    if (c.level !== 'sub-kegiatan') continue;
    const [p, kg] = kegLok(progAkhir(c.induk_program), c.induk);
    const [pBaru, kgBaru] = kegLok(progAkhir(c.induk_program_baru || c.induk_program), c.induk_baru || c.induk);
    sub.tambah(`${k(p)}|${k(kg)}`, c.dari, `${k(pBaru)}|${k(kgBaru)}`, [pBaru, kgBaru], c.ke);
  }
  return {
    program: (nama: string) => program.akhir('', nama)?.nama ?? nama,
    kegiatan: (p: string, nama: string) => kegiatan.akhir(k(p), nama),
    sub: (p: string, kg: string, nama: string) => sub.akhir(`${k(p)}|${k(kg)}`, nama),
  };
}

const keItem = (e: EntriBanding): ItemEntri => ({
  id: e.id, tipe: e.tipe as TipeBerasal, nama: e.nama, program_ref: e.program_ref, kegiatan_ref: e.kegiatan_ref,
});

export function bandingRenaksi(
  masterSemua: readonly EntriBanding[], renaksi: readonly BarisRenaksi[], catatan: readonly CatatanGanti[],
): HasilBanding {
  const master = masterSemua.filter(e => bisaDariRenaksi(e.tipe));
  const peta = petaDariCatatan(catatan);
  const programDi = (nama: string | null) => (nama ? master.find(e => e.tipe === 'program' && e.nama === nama) : undefined);
  const kegiatanDi = (nama: string | null, program: string | null) =>
    (nama ? master.find(e => e.tipe === 'kegiatan' && e.nama === nama && (!e.program_ref || !program || e.program_ref === program)) : undefined);

  // Jalur tiap entri SESUDAH ganti nama / pindah induk diterapkan. Hanya entri ber-asal
  // Renaksi yang diubah; keturunannya ikut induk (itu kerja Edit Master yang menjalar).
  // `pindah` = entri itu SENDIRI yang dipindah (bukan ikut induknya yang dipindah/diganti).
  type Proyeksi = EntriBanding & { pindah: boolean };
  const proyeksi = new Map<number, Proyeksi>();
  const proyek = (e: EntriBanding): Proyeksi => {
    const ada = proyeksi.get(e.id);
    if (ada) return ada;
    let hasil: Proyeksi;
    // Sumber dana tidak punya catatan ganti nama: ada di Renaksi atau tidak.
    if (e.tipe === 'sumber_anggaran') {
      hasil = { ...e, pindah: false };
    } else if (e.tipe === 'program') {
      hasil = { ...e, nama: dariRenaksi(e) && !jalurAdaDiRenaksi(e, renaksi) ? peta.program(e.nama) : e.nama, pindah: false };
    } else {
      const ip = programDi(e.program_ref);
      let p = ip ? proyek(ip).nama : e.program_ref;
      let kg = e.kegiatan_ref;
      if (e.tipe === 'subkegiatan') {
        const ik = kegiatanDi(e.kegiatan_ref, e.program_ref);
        if (ik) {
          const pk = proyek(ik);
          kg = pk.nama;
          // Kegiatan induk dipindah → sub ikut programnya (keturunan, bukan pindah sendiri).
          p = pk.program_ref ?? p;
        }
      }
      const ganti = dariRenaksi(e) && !jalurAdaDiRenaksi(e, renaksi) && p;
      let nama = e.nama;
      let pindah = false;
      if (ganti) {
        const lok = e.tipe === 'kegiatan' ? peta.kegiatan(p!, e.nama) : peta.sub(p!, kg ?? '', e.nama);
        if (lok) {
          nama = lok.nama;
          const [pBaru, kgBaru] = lok.induk;
          pindah = k(pBaru) !== k(p) || (e.tipe === 'subkegiatan' && k(kgBaru) !== k(kg));
          p = pBaru;
          if (e.tipe === 'subkegiatan') kg = kgBaru;
        }
      }
      hasil = { ...e, nama, program_ref: p, kegiatan_ref: kg, pindah };
    }
    proyeksi.set(e.id, hasil);
    return hasil;
  };

  const gantiNama: ItemGanti[] = [];
  const hilang: ItemEntri[] = [];
  const hilangId = new Set<number>();
  const urut: TipeBerasal[] = ['program', 'kegiatan', 'subkegiatan', 'sumber_anggaran'];
  for (const tipe of urut) {
    for (const e of master.filter(x => x.tipe === tipe && dariRenaksi(x))) {
      // Jalur yang masih ada di Renaksi diproyeksikan ke dirinya sendiri (lihat `proyek`).
      const p = proyek(e);
      if (jalurAdaDiRenaksi(p, renaksi)) {
        if (p.pindah) {
          gantiNama.push({
            ...keItem(e), ke: bersih(p.nama), program_ke: bersih(p.program_ref ?? ''),
            ...(e.tipe === 'subkegiatan' ? { kegiatan_ke: bersih(p.kegiatan_ref ?? '') } : {}),
          });
        } else if (k(p.nama) !== k(e.nama)) gantiNama.push({ ...keItem(e), ke: bersih(p.nama) });
        continue;
      }
      // Induk yang sudah disebut "tidak ada lagi" mewakili keturunannya.
      const induk = [programDi(e.program_ref), e.tipe === 'subkegiatan' ? kegiatanDi(e.kegiatan_ref, e.program_ref) : undefined];
      if (induk.some(i => i && hilangId.has(i.id))) continue;
      hilang.push(keItem(e));
      hilangId.add(e.id);
    }
  }

  const terproyeksi = master.map(proyek);

  // Induk tujuan pindah ditulis dengan ejaan MASTER (sesudah ganti nama yang ikut diterapkan):
  // Edit Master mencocokkan induk persis (L68), dan Renaksi bisa beda huruf besar / berbintang.
  // Yang belum ada di Master (masih di daftar Baru) memakai ejaan Renaksi tanpa penanda = ejaan Init.
  const ejaanMaster = (tipe: TipeBerasal, nama: string, program: string | null): string => {
    const i = terproyeksi.findIndex(p => p.tipe === tipe && k(p.nama) === k(nama)
      && (tipe === 'program' || !p.program_ref || k(p.program_ref) === k(program)));
    if (i < 0) return nama;
    const asli = master[i].nama;
    return k(asli) === k(terproyeksi[i].nama) ? asli : bersih(terproyeksi[i].nama);
  };
  for (const g of gantiNama) {
    if (g.program_ke === undefined) continue;
    g.program_ke = ejaanMaster('program', g.program_ke, null);
    if (g.kegiatan_ke !== undefined) g.kegiatan_ke = ejaanMaster('kegiatan', g.kegiatan_ke, g.program_ke);
  }
  const adaDiMaster = (tipe: TipeBerasal, nama: string, p: string | null, kg: string | null) =>
    terproyeksi.some(e => e.tipe === tipe && k(e.nama) === k(nama)
      && (!e.program_ref?.trim() || !p || k(e.program_ref) === k(p))
      && (!e.kegiatan_ref?.trim() || !kg || k(e.kegiatan_ref) === k(kg)));

  const baru = new Map<string, ItemBaru>();
  const tambahBaru = (tipe: TipeBerasal, nama: string, p: string | null, kg: string | null) => {
    const kunci = kunciJalur(tipe, nama, p, kg);
    if (baru.has(kunci) || adaDiMaster(tipe, nama, p, kg)) return;
    baru.set(kunci, { tipe, nama, program_ref: p, kegiatan_ref: kg, kunci });
  };
  for (const r of renaksi) {
    const p = bersih(r.program ?? '');
    const kg = bersih(r.kegiatan ?? '');
    const s = bersih(r.sub_kegiatan ?? '');
    if (r.level === 'program' && p) tambahBaru('program', p, null, null);
    else if (r.level === 'kegiatan' && p && kg) tambahBaru('kegiatan', kg, p, null);
    else if (r.level === 'sub-kegiatan' && p && kg && s) tambahBaru('subkegiatan', s, p, kg);
    else if (r.level === 'sumber' && p) tambahBaru('sumber_anggaran', p, null, null);
  }

  const belumBertanda = master
    .filter(e => !dariRenaksi(e) && jalurAdaDiRenaksi(e, renaksi))
    .map(keItem);

  return { gantiNama, baru: [...baru.values()], hilang, belumBertanda };
}

/**
 * Pilihan "baru" yang dikirim ke Init dilengkapi induknya: kegiatan baru di bawah program
 * yang juga baru tidak boleh ditulis tanpa programnya (Master disambung teks nama).
 */
export function lengkapiIndukPilihan(pilih: readonly string[], kandidat: readonly ItemBaru[]): Set<string> {
  const hasil = new Set(pilih);
  const adaKandidat = new Set(kandidat.map(c => c.kunci));
  for (const c of kandidat) {
    if (!hasil.has(c.kunci)) continue;
    const induk = c.tipe === 'kegiatan' ? [kunciJalur('program', c.program_ref ?? '', null, null)]
      : c.tipe === 'subkegiatan' ? [
        kunciJalur('program', c.program_ref ?? '', null, null),
        kunciJalur('kegiatan', c.kegiatan_ref ?? '', c.program_ref, null),
      ] : [];
    for (const i of induk) if (adaKandidat.has(i)) hasil.add(i);
  }
  return hasil;
}

export interface EntriKetikan {
  tipe: MasterTipe;
  nama: string;
  program_ref: string | null;
  kegiatan_ref: string | null;
}

/**
 * Entri yang baru diketik di Master tapi jalurnya sudah ada di Renaksi (= masuk daftar
 * "baru" pembanding). Dipakai saat Simpan untuk bertanya "pakai dari Rencana Aksi?".
 * Hanya kecocokan setelah penanda & huruf besar-kecil dirapikan; salah ketik tidak ditebak.
 */
export function ketikanAdaDiRenaksi(rows: readonly EntriKetikan[], baru: readonly ItemBaru[]): Map<number, ItemBaru> {
  const peta = new Map(baru.map(b => [b.kunci, b]));
  const hasil = new Map<number, ItemBaru>();
  // Tipe ikut di kunci jalur: uraian SSK / sumber anggaran tidak pernah cocok.
  rows.forEach((r, i) => {
    const b = peta.get(kunciJalur(r.tipe, r.nama, r.program_ref, r.tipe === 'subkegiatan' ? r.kegiatan_ref : null));
    if (b) hasil.set(i, b);
  });
  return hasil;
}

export function kalimatKetikanRenaksi(cocok: readonly { ketikan: string; renaksi: ItemBaru }[], tahun: string | number): string {
  const daftar = cocok.slice(0, 8).map(c => `• ${c.ketikan}${c.ketikan !== c.renaksi.nama ? ` (di Rencana Aksi: ${c.renaksi.nama})` : ''}`);
  return `${cocok.length === 1 ? 'Entri ini sudah ada' : `${cocok.length} entri ini sudah ada`} di Rencana Aksi ${tahun}:\n`
    + daftar.join('\n') + (cocok.length > 8 ? `\n• … dan ${cocok.length - 8} lagi` : '')
    + '\n\n"Pakai dari Rencana Aksi" menyimpannya dengan nama persis seperti di Rencana Aksi dan memberi tanda Renaksi, '
    + 'sehingga perubahannya nanti diberitahukan. "Tetap manual" menyimpannya apa adanya tanpa tanda.';
}
