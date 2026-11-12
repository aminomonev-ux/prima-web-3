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
}

type TipeBerasal = Extract<MasterTipe, 'program' | 'kegiatan' | 'subkegiatan'>;

export interface ItemEntri {
  id: number;
  tipe: TipeBerasal;
  nama: string;
  program_ref: string | null;
  kegiatan_ref: string | null;
}

/** `ke` = nama Renaksi tanpa penanda — nama yang akan ditulis ke Master. */
export interface ItemGanti extends ItemEntri { ke: string }

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
  const bagian = [
    h.gantiNama.length ? `${h.gantiNama.length} berganti nama` : '',
    h.baru.length ? `${h.baru.length} baru` : '',
    h.hilang.length ? `${h.hilang.length} tidak ada lagi` : '',
  ].filter(Boolean);
  return `Rencana Aksi ${tahun} berbeda dari Master: ${bagian.join(', ')}.`;
}

const k = kunciNamaRenaksi;
const bersih = (s: string) => rapikanNamaEntitas(s);

/**
 * Peta ganti nama satu tingkat, rantai dirangkai: A → B → C terbaca A → C (B → C juga),
 * A → B → A saling meniadakan. `awalan` = kunci induk AKHIR, supaya catatan yang ditulis
 * sebelum dan sesudah induknya berganti nama jatuh di kelompok yang sama.
 */
class PetaGanti {
  private peta = new Map<string, string>();
  tambah(awalan: string, dari: string, ke: string) {
    for (const [kunci, nilai] of this.peta) {
      if (kunci.startsWith(awalan + '\u0001') && k(nilai) === k(dari)) this.peta.set(kunci, ke);
    }
    const kd = `${awalan}\u0001${k(dari)}`;
    if (!this.peta.has(kd)) this.peta.set(kd, ke);
  }
  akhir(awalan: string, nama: string): string {
    const v = this.peta.get(`${awalan}\u0001${k(nama)}`);
    return v ?? nama;
  }
}

function petaDariCatatan(catatan: readonly CatatanGanti[]) {
  const program = new PetaGanti();
  for (const c of catatan) if (c.level === 'program') program.tambah('', c.dari, c.ke);
  const progAkhir = (p: string | null) => (p ? program.akhir('', p) : '');

  const kegiatan = new PetaGanti();
  for (const c of catatan) if (c.level === 'kegiatan') kegiatan.tambah(k(progAkhir(c.induk)), c.dari, c.ke);
  const kegAkhir = (p: string, kg: string | null) => (kg ? kegiatan.akhir(k(p), kg) : '');

  const sub = new PetaGanti();
  for (const c of catatan) {
    if (c.level !== 'sub-kegiatan') continue;
    const p = progAkhir(c.induk_program);
    sub.tambah(`${k(p)}|${k(kegAkhir(p, c.induk))}`, c.dari, c.ke);
  }
  return {
    program: (nama: string) => program.akhir('', nama),
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

  // Jalur tiap entri SESUDAH ganti nama diterapkan. Hanya entri ber-asal Renaksi yang
  // diganti namanya; keturunannya ikut induk (itu kerja Edit Master yang menjalar).
  const proyeksi = new Map<number, EntriBanding>();
  const proyek = (e: EntriBanding): EntriBanding => {
    const ada = proyeksi.get(e.id);
    if (ada) return ada;
    let hasil: EntriBanding;
    if (e.tipe === 'program') {
      hasil = { ...e, nama: dariRenaksi(e) && !jalurAdaDiRenaksi(e, renaksi) ? peta.program(e.nama) : e.nama };
    } else {
      const ip = programDi(e.program_ref);
      const p = ip ? proyek(ip).nama : e.program_ref;
      let kg = e.kegiatan_ref;
      if (e.tipe === 'subkegiatan') {
        const ik = kegiatanDi(e.kegiatan_ref, e.program_ref);
        kg = ik ? proyek(ik).nama : e.kegiatan_ref;
      }
      const ganti = dariRenaksi(e) && !jalurAdaDiRenaksi(e, renaksi) && p;
      const nama = !ganti ? e.nama
        : e.tipe === 'kegiatan' ? peta.kegiatan(p, e.nama)
        : peta.sub(p, kg ?? '', e.nama);
      hasil = { ...e, nama, program_ref: p, kegiatan_ref: kg };
    }
    proyeksi.set(e.id, hasil);
    return hasil;
  };

  const gantiNama: ItemGanti[] = [];
  const hilang: ItemEntri[] = [];
  const hilangId = new Set<number>();
  const urut: TipeBerasal[] = ['program', 'kegiatan', 'subkegiatan'];
  for (const tipe of urut) {
    for (const e of master.filter(x => x.tipe === tipe && dariRenaksi(x))) {
      // Jalur yang masih ada di Renaksi diproyeksikan ke dirinya sendiri (lihat `proyek`).
      const p = proyek(e);
      if (jalurAdaDiRenaksi(p, renaksi)) {
        if (k(p.nama) !== k(e.nama)) gantiNama.push({ ...keItem(e), ke: bersih(p.nama) });
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
