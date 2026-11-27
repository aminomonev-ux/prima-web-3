// ═══ PRIMA — BBA: perubahan laporan di Google Drive dibawa balik ke PRIMA (docs/konsep/bba/CONCEPT-bba-drive-balik.md) ═══
// Pratinjau tidak menulis apa pun. Terapkan menulis HANYA lewat jalur simpan menu masing-masing (updateAset, createAset,
// tandaiAnggaran, ubahStatusProses, catatPenerimaan, simpanPenawaran) — semua pagarnya berlaku, tiap catatan transaksinya
// sendiri. Aturan baca/gabung: lib/bba/drive-balik.ts (murni), dipakai pratinjau DAN terapkan.
import { sql, queryMany, withTransaction } from '@/lib/data/db';
import { polosSelExcel } from '@/lib/shared/excel-sel';
import {
  LEMBAR_BALIK, NAMA_LEMBAR, type LembarBalik,
} from '@/lib/bba/laporan-excel';
import {
  bacaLembar, potretDariBahan, pilihAsal, gabungTigaArah, barangBelumAda, tampilNilai,
  type BacaanBerkas, type MetaPrima, type PetaLembar, type Potret, type Tinjauan, type NilaiBaku, type UsulUbah, type UsulBaru,
} from '@/lib/bba/drive-balik';
import { lepasTahanan, type PerubahanLuar } from '@/lib/bba/drive-kirim';
import { kunciNamaBarang } from '@/lib/bba/barang';
import type { Anggaran, JenisRencana } from '@/lib/bba/rencana';
import { muatBahanBukuRencana, bacaStatusDrive, tulisStatusDrive, kunciPengirim } from '@/lib/data/bba-laporan';
import { listBarang, createAset, updateAset, tandaiAnggaran, ubahStatusProses, getAsetById, BbaVersionConflictError, type BbaRow } from '@/lib/data/buku-besar-aset';
import { BbaCreateSchema, BbaUpdateSchema, AnggaranSchema, BbaProsesSchema } from '@/lib/data/buku-besar-aset-schemas';
import { catatPenerimaan } from '@/lib/data/bba-penerimaan';
import { PenerimaanSchema } from '@/lib/data/bba-penerimaan-schemas';
import { listPenawaran, simpanPenawaran, type SuratPenawaran } from '@/lib/data/bba-penawaran';
import { PenawaranSimpanSchema } from '@/lib/data/bba-penawaran-schemas';
import { metadataBerkasDrive, unduhRevisiDrive, kodeGalatDrive } from '@/lib/services/drive';
import type { MenuBba } from '@/lib/bba/peran';

export class TinjauanDriveError extends Error {
  constructor(public code: 'TIDAK_ADA' | 'PRATINJAU_BASI' | 'SIBUK' | 'BENTURAN_BELUM_DIPILIH' | 'BERKAS_RUSAK', message: string) { super(message); this.name = 'TinjauanDriveError'; }
}

/** Bagian izin pemegang tiap lembar (§7): Penawaran cukup salah satu. */
export const IZIN_LEMBAR: Record<LembarBalik, MenuBba[]> = { rencana: ['rencana'], pengadaan: ['pengadaan'], penerimaan: ['pengadaan'], penawaran: ['rencana', 'pengadaan'] };

const MAKS_LEMBAR = 20, MAKS_BARIS = 5000, MAKS_KOLOM = 40;

/** Grid sel mentah per lembar laporan (L67: batas lembar/baris/kolom; sel lewat penolong bersama). */
export async function bacaBerkasLaporan(buf: Buffer, koreksi?: Partial<Record<LembarBalik, PetaLembar>> | null): Promise<BacaanBerkas> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { throw new TinjauanDriveError('BERKAS_RUSAK', 'Berkas di Drive tidak bisa dibaca sebagai Excel — mungkin disimpan dalam format lain.'); }
  if (wb.worksheets.length > MAKS_LEMBAR) throw new TinjauanDriveError('BERKAS_RUSAK', `Berkas berisi ${wb.worksheets.length} lembar — paling banyak ${MAKS_LEMBAR}.`);
  const hasil = {} as BacaanBerkas;
  for (const l of LEMBAR_BALIK) {
    const ws = wb.worksheets.find(w => w.name.trim().toLowerCase() === NAMA_LEMBAR[l].toLowerCase());
    if (!ws) { hasil[l] = { ada: false, peta: null, baris: [] }; continue; }
    const grid: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      if (r > MAKS_BARIS) return;
      const b: unknown[] = [];
      for (let c = 1; c <= Math.min(row.cellCount, MAKS_KOLOM); c++) b.push(polosSelExcel(row.getCell(c)) ?? '');
      grid[r - 1] = b;
    });
    hasil[l] = bacaLembar(l, Array.from(grid, b => b ?? []), koreksi?.[l]);
  }
  return hasil;
}

/** Label & angka kunci tiap catatan PRIMA sekarang. Penawaran: angka kunci SURAT (yang disimpan `simpanPenawaran`). */
function metaDari(rows: BbaRow[], surat: SuratPenawaran[], penerimaan: Array<{ id: number; rencana_id: number; tgl: string; vol: number }>): MetaPrima {
  const per = new Map(rows.map(r => [r.id, r]));
  const meta: MetaPrima = { rencana: {}, pengadaan: {}, penerimaan: {}, penawaran: {} };
  for (const r of rows) {
    const m = { label: `${r.canonical_id} · ${r.uraian}`, versi: r.version, terkunciUsulan: r.origin === 'USULAN', ditolakUsulan: r.usulan_keputusan === 'DITOLAK' };
    meta.rencana[r.id] = m; meta.pengadaan[r.id] = m;
  }
  for (const p of penerimaan) meta.penerimaan[p.id] = { label: `${per.get(p.rencana_id)?.canonical_id ?? '?'} · diterima ${p.tgl} · ${p.vol} unit` };
  for (const s of surat) for (const i of s.item) meta.penawaran[i.id] = { label: `${s.rekanan} · ${i.nama_barang}`, versi: s.version };
  return meta;
}

export interface Pratinjau {
  kunci: string; tahun: number; luar: PerubahanLuar;
  /** Revisi yang dibaca (bisa kepala berkas bila revisi yang dicatat sudah dipangkas Drive). */
  revisiDibaca: string | null; revisiHilang: boolean;
  peta: Partial<Record<LembarBalik, NonNullable<BacaanBerkas[LembarBalik]['peta']>>>;
  lembarHilang: LembarBalik[];
  tinjauan: Tinjauan;
  barangBaru: Array<{ nama: string; mirip: string | null }>;
  asal: { ada: boolean; dikirimPada: string | null; terbaru: boolean };
}

type Bahan = { pratinjau: Pratinjau; rows: BbaRow[]; surat: SuratPenawaran[]; master: Array<{ id: number; nama: string }> };

const tahunDari = (kunci: string) => { const m = /^rencana:(\d{4})$/.exec(kunci); return m ? Number(m[1]) : null; };

async function susunPratinjau(kunci: string, koreksi?: Partial<Record<LembarBalik, PetaLembar>> | null): Promise<Bahan> {
  const tahun = tahunDari(kunci);
  const s = (await bacaStatusDrive()).berkas[kunci];
  if (!tahun || !s?.luar || !s.file_id) throw new TinjauanDriveError('TIDAK_ADA', 'Tidak ada perubahan Drive yang menunggu ditinjau untuk berkas ini — mungkin sudah ditinjau orang lain.');
  let revisiDibaca: string | null = s.luar.revisi, revisiHilang = false, buf: Buffer;
  try { buf = await unduhRevisiDrive(s.file_id, s.luar.revisi); } catch (e) {
    if (kodeGalatDrive(e) !== 404) throw e;
    // Revisi biner dipangkas Drive (± 30 hari) — yang terbaru dipakai dan disebut.
    buf = await unduhRevisiDrive(s.file_id, null); revisiDibaca = null; revisiHilang = true;
  }
  const berkas = await bacaBerkasLaporan(buf, koreksi);
  const [{ bahan, rows }, surat, masterBarang, kandidat] = await Promise.all([
    muatBahanBukuRencana(tahun), listPenawaran(), listBarang(),
    queryMany<{ isi: unknown; dikirim_pada: string }>(sql`SELECT isi, DATE_FORMAT(dikirim_pada, '%Y-%m-%d %H:%i') AS dikirim_pada FROM bba_drive_potret WHERE kunci = ${kunci} ORDER BY id`),
  ]);
  const prima = potretDariBahan(bahan);
  const potret = kandidat.map(k => (typeof k.isi === 'string' ? JSON.parse(k.isi) : k.isi) as Potret);
  const i = pilihAsal(berkas, potret);
  const tinjauan = gabungTigaArah(berkas, i >= 0 ? potret[i] : null, prima, metaDari(rows, surat, bahan.penerimaan));
  const master = masterBarang.map(b => ({ id: b.id, nama: b.nama }));
  return {
    rows, surat, master,
    pratinjau: {
      kunci, tahun, luar: s.luar, revisiDibaca, revisiHilang,
      peta: Object.fromEntries(LEMBAR_BALIK.filter(l => berkas[l].peta).map(l => [l, berkas[l].peta!])),
      lembarHilang: LEMBAR_BALIK.filter(l => !berkas[l].ada),
      tinjauan, barangBaru: barangBelumAda(tinjauan, master.map(b => b.nama)),
      asal: { ada: i >= 0, dikirimPada: i >= 0 ? kandidat[i].dikirim_pada : null, terbaru: i === kandidat.length - 1 },
    },
  };
}

export async function pratinjauDriveBalik(kunci: string, koreksi?: Partial<Record<LembarBalik, PetaLembar>> | null): Promise<Pratinjau> {
  return (await susunPratinjau(kunci, koreksi)).pratinjau;
}

/** Status untuk spanduk: berkas yang menunggu ditinjau. Hanya membaca DB. */
export async function menungguTinjauan(): Promise<Array<{ kunci: string; tahun: number; luar: PerubahanLuar }>> {
  const st = await bacaStatusDrive();
  return Object.entries(st.berkas).flatMap(([kunci, s]) => {
    const tahun = tahunDari(kunci);
    return tahun && s.luar ? [{ kunci, tahun, luar: s.luar }] : [];
  });
}

// ─── Terapkan ────────────────────────────────────────────────────────────────

export type PilihUbah = { lembar: LembarBalik; id: number; versi: number | null; sel: Record<string, 'drive' | 'prima'> };
export type PilihBaru = { lembar: LembarBalik; baris: number };
export interface PilihanTerapkan {
  kunci: string; revisi: string;
  peta?: Partial<Record<LembarBalik, PetaLembar>> | null;
  ubah: PilihUbah[]; baru: PilihBaru[];
  /** Nama barang baru yang disetujui dibuat di Master. */
  barangBaru: string[];
  /** "Maksudnya …?" — kunci nama berkas → nama Master yang dipilih (tidak ada = tidak dipetakan). */
  barangPeta: Record<string, string>;
}
export interface HasilTerapkan { diterapkan: string[]; ditolak: string[] }

/** Kalimat galat jalur simpan untuk laporan (semua galat BBA berkalimat manusia). */
const sebab = (e: unknown) => (e instanceof BbaVersionConflictError ? 'diubah orang lain di PRIMA sesudah pratinjau dibuka' : e instanceof Error ? e.message : String(e));
const s = (v: NilaiBaku | undefined) => (v === null || v === undefined ? null : String(v));
const n = (v: NilaiBaku | undefined) => (v === null || v === undefined ? null : Number(v));

/**
 * Terapkan pilihan (§7). Memegang kunci pengirim Drive selama berjalan (status berkas satu JSON dengan cron; cron yang datang
 * di tengah menjawab "sibuk"). Pratinjau dihitung ULANG dari revisi yang sama; yang dikirim layar hanya pilihan.
 */
export async function terapkanDriveBalik(p: PilihanTerapkan, userId: number, izin: Record<MenuBba, string>): Promise<HasilTerapkan & { pratinjau: Pratinjau }> {
  return withTransaction(async ({ tx }) => {
    if (!(await kunciPengirim(tx))) throw new TinjauanDriveError('SIBUK', 'Salinan otomatis ke Drive sedang berjalan, atau perubahan ini sedang diterapkan orang lain. Coba lagi sebentar lagi.');
    const { pratinjau, rows, surat, master } = await susunPratinjau(p.kunci, p.peta);
    const st = await bacaStatusDrive();
    const s0 = st.berkas[p.kunci]!;
    if (pratinjau.luar.revisi !== p.revisi) throw new TinjauanDriveError('PRATINJAU_BASI', 'Berkas di Drive diubah lagi sesudah pratinjau dibuka — pratinjau dimuat ulang.');
    const kepala = await metadataBerkasDrive(s0.file_id!);
    if (!pratinjau.luar.tertimpa && kepala.md5 !== pratinjau.luar.md5) throw new TinjauanDriveError('PRATINJAU_BASI', 'Berkas di Drive baru saja disimpan lagi — pratinjau dimuat ulang supaya suntingan terbarunya ikut ditinjau.');

    const boleh = (l: LembarBalik) => IZIN_LEMBAR[l].some(m => izin[m] === 'EDIT');
    const hasil: HasilTerapkan = { diterapkan: [], ditolak: [] };
    const t = pratinjau.tinjauan;
    const cariUbah = (l: LembarBalik, id: number) => t.ubah.find(u => u.lembar === l && u.id === id);
    const cariBaru = (l: LembarBalik, b: number) => t.baru.find(x => x.lembar === l && x.baris === b);

    // Benturan wajib dipilih — layar mematikan Terapkan, tapi pagarnya di sini (L82).
    for (const pu of p.ubah) {
      const u = cariUbah(pu.lembar, pu.id);
      const belum = u?.sel.filter(x => x.jenis === 'benturan' && !pu.sel[x.kunci]) ?? [];
      if (belum.length) throw new TinjauanDriveError('BENTURAN_BELUM_DIPILIH', `${u!.label}: pilih dulu "pakai Drive" atau "pakai PRIMA" untuk ${belum.map(x => x.judul).join(', ')}.`);
    }

    // Barang: Master (tanpa beda huruf) → "maksudnya …?" → baru yang disetujui → tidak ditautkan.
    const perNama = new Map(master.map(b => [kunciNamaBarang(b.nama), b]));
    const disetujui = new Set(p.barangBaru.map(kunciNamaBarang));
    const barang = (nama: NilaiBaku | undefined): { barang_id?: number | null; barang_baru?: string } | null => {
      if (nama === null || nama === undefined || nama === '') return { barang_id: null };
      const k = kunciNamaBarang(String(nama));
      const ada = perNama.get(k) ?? (p.barangPeta[k] ? perNama.get(kunciNamaBarang(p.barangPeta[k])) : undefined);
      if (ada) return { barang_id: ada.id };
      return disetujui.has(k) ? { barang_baru: String(nama) } : null;
    };

    const versiKini = new Map(rows.map(r => [r.id, r.version]));
    const segarkanVersi = async (id: number) => { const r = await getAsetById(id); if (r) versiKini.set(id, r.version); };
    const coba = async (label: string, f: () => Promise<string | void>) => {
      try { const x = await f(); hasil.diterapkan.push(x ? `${label}: ${x}` : label); } catch (e) {
        if (!(e instanceof Error) || e.name === 'Error') console.error('[drive-balik]', e);
        hasil.ditolak.push(`${label}: ${sebab(e)}`);
      }
    };
    const nilaiDipilih = (u: UsulUbah, pu: PilihUbah) => Object.fromEntries(u.sel.filter(x => pu.sel[x.kunci] === 'drive').map(x => [x.kunci, x.drive]));
    const keputusan = async (id: number, a: NilaiBaku | undefined) => {
      if (a !== 'DIDANAI' && a !== 'TIDAK_DIDANAI' && a !== 'BELUM') return;
      const z = AnggaranSchema.parse({ item: [{ id, expected_version: versiKini.get(id)!, anggaran: a as Anggaran }] });
      await tandaiAnggaran(z, userId); await segarkanVersi(id);
    };

    // 1. Rencana yang berubah.
    for (const pu of p.ubah.filter(x => x.lembar === 'rencana')) {
      const u = cariUbah('rencana', pu.id);
      if (!u) { hasil.ditolak.push(`Rencana #${pu.id}: tidak ada lagi di pratinjau terbaru`); continue; }
      if (!boleh('rencana')) { hasil.ditolak.push(`${u.label}: izin Anda di bagian Rencana hanya melihat`); continue; }
      if (pu.versi !== u.versi) { hasil.ditolak.push(`${u.label}: diubah orang lain di PRIMA sesudah pratinjau dibuka — buka pratinjau lagi`); continue; }
      const v = nilaiDipilih(u, pu);
      if (!Object.keys(v).length) continue;
      await coba(u.label, async () => {
        const isian: Record<string, unknown> = { id: pu.id, expected_version: versiKini.get(pu.id)! };
        for (const k of ['uraian', 'satuan', 'alasan', 'kode_rekening'] as const) if (k in v) isian[k] = s(v[k]);
        // Sel angka yang dikosongkan bukan "nol" — tidak diubah, disebut.
        let catatan = '';
        for (const [k, kol] of [['vol', 'vol'], ['harga', 'harga']] as const) {
          if (!(k in v)) continue;
          if (v[k] === null) catatan += ` (${k === 'vol' ? 'Vol' : 'Harga'} dikosongkan di berkas — tidak diubah)`;
          else isian[kol] = n(v[k]);
        }
        if ('sumber' in v && v.sumber) isian.sumber_anggaran = v.sumber;
        if ('jenis' in v) isian.jenis_rencana = (v.jenis as JenisRencana | null) ?? null;
        if ('barang' in v) { const b = barang(v.barang); if (b) Object.assign(isian, b); else catatan = ` (barang "${v.barang}" belum ada di Master — tidak ditautkan)`; }
        if (Object.keys(isian).length > 2) {
          const z = BbaUpdateSchema.safeParse(isian);
          if (!z.success) throw new Error(z.error.issues[0].message);
          await updateAset(z.data, userId); await segarkanVersi(pu.id);
        }
        if ('keputusan' in v) await keputusan(pu.id, v.keputusan);
        return `${u.sel.filter(x => x.kunci in v).map(x => `${x.judul} ${tampilNilai(x.prima)} → ${tampilNilai(x.drive)}`).join('; ')}${catatan}`;
      });
    }

    // 2. Rencana baru.
    for (const pb of p.baru.filter(x => x.lembar === 'rencana')) {
      const b = cariBaru('rencana', pb.baris);
      if (!b || b.tolak) { hasil.ditolak.push(`Rencana baris ${pb.baris}: ${b?.tolak ?? 'tidak ada lagi di pratinjau terbaru'}`); continue; }
      if (!boleh('rencana')) { hasil.ditolak.push(`Rencana baris ${pb.baris}: izin Anda di bagian Rencana hanya melihat`); continue; }
      await coba(`Rencana baru (baris ${pb.baris}) ${b.label}`, async () => {
        const v = b.nilai;
        const bar = barang(v.barang);
        const z = BbaCreateSchema.safeParse({
          tahun_anggaran: pratinjau.tahun, uraian: s(v.uraian), sumber_anggaran: v.sumber ?? 'BLUD', vol: n(v.vol) ?? 0, harga: n(v.harga) ?? 0,
          satuan: s(v.satuan), alasan: s(v.alasan), kode_rekening: s(v.kode_rekening), jenis_rencana: v.jenis ?? null, ...(bar ?? {}),
        });
        if (!z.success) throw new Error(z.error.issues[0].message);
        const r = await createAset(z.data, userId);
        await segarkanVersi(r.id);
        let ket = r.canonical_id;
        if (v.keputusan && v.keputusan !== 'BELUM') {
          try { await keputusan(r.id, v.keputusan); } catch (e) { ket += ` — dibuat, tapi keputusan tidak diterapkan: ${sebab(e)}`; }
        }
        return ket + (bar ? '' : ` (barang "${v.barang}" belum ada di Master — tidak ditautkan)`);
      });
    }

    // 3. Pengadaan: tanggal pesan.
    for (const pu of p.ubah.filter(x => x.lembar === 'pengadaan')) {
      const u = cariUbah('pengadaan', pu.id);
      if (!u) { hasil.ditolak.push(`Pengadaan #${pu.id}: tidak ada lagi di pratinjau terbaru`); continue; }
      if (!boleh('pengadaan')) { hasil.ditolak.push(`${u.label}: izin Anda di bagian Pengadaan hanya melihat`); continue; }
      if (pu.versi !== u.versi) { hasil.ditolak.push(`${u.label}: diubah orang lain di PRIMA sesudah pratinjau dibuka — buka pratinjau lagi`); continue; }
      const v = nilaiDipilih(u, pu);
      if (!('tgl_pesan' in v)) continue;
      await coba(u.label, async () => {
        const tgl = s(v.tgl_pesan);
        const z = BbaProsesSchema.safeParse({ id: pu.id, expected_version: versiKini.get(pu.id)!, status: tgl ? 'DIPROSES' : 'DIRENCANAKAN', tgl_proses: tgl });
        if (!z.success) throw new Error(z.error.issues[0].message);
        await ubahStatusProses(z.data, userId); await segarkanVersi(pu.id);
        return tgl ? `dipesan ${tgl}` : 'pesanan dibatalkan';
      });
    }

    // 4. Penerimaan baru.
    const perKode = new Map(rows.map(r => [r.canonical_id.toUpperCase(), r]));
    for (const pb of p.baru.filter(x => x.lembar === 'penerimaan')) {
      const b = cariBaru('penerimaan', pb.baris);
      if (!b || b.tolak) { hasil.ditolak.push(`Penerimaan baris ${pb.baris}: ${b?.tolak ?? 'tidak ada lagi di pratinjau terbaru'}`); continue; }
      if (!boleh('penerimaan')) { hasil.ditolak.push(`Penerimaan baris ${pb.baris}: izin Anda di bagian Pengadaan hanya melihat`); continue; }
      await coba(`Penerimaan baru (baris ${pb.baris}) ${b.label}`, async () => {
        const r = perKode.get(String(b.nilai.kode ?? '').toUpperCase());
        if (!r) throw new Error(`kode ${b.nilai.kode} tidak ada di rencana ${pratinjau.tahun}`);
        const z = PenerimaanSchema.safeParse({
          rencana_id: r.id, expected_version: versiKini.get(r.id)!, tgl: s(b.nilai.tgl), vol: n(b.nilai.vol), harga_satuan: n(b.nilai.harga) ?? 0,
          merk_tipe: s(b.nilai.merk), penyedia: s(b.nilai.penyedia), catatan: s(b.nilai.catatan),
        });
        if (!z.success) throw new Error(z.error.issues[0].message);
        await catatPenerimaan(z.data, userId); await segarkanVersi(r.id);
      });
    }

    // 5. Penawaran: per surat, dari isi PRIMA SEKARANG + perubahan yang disetujui + item baru (§6A aturan 2).
    if (p.ubah.some(x => x.lembar === 'penawaran') || p.baru.some(x => x.lembar === 'penawaran')) {
      if (!boleh('penawaran')) hasil.ditolak.push('Penawaran: izin Anda di bagian Rencana dan Pengadaan hanya melihat');
      else await terapkanPenawaran(p, t, surat, barang, userId, hasil);
    }

    // Tinjauan selesai: tahanan dilepas; kiriman berikutnya menimpa berkas dengan hasil gabungan.
    st.berkas[p.kunci] = lepasTahanan(s0, kepala.md5);
    await tulisStatusDrive(tx, st);
    await tx`DELETE FROM bba_drive_potret WHERE kunci = ${p.kunci} AND id < (SELECT m FROM (SELECT MAX(id) AS m FROM bba_drive_potret WHERE kunci = ${p.kunci}) AS x)`;
    return { ...hasil, pratinjau };
  });
}

type Barang = (nama: NilaiBaku | undefined) => { barang_id?: number | null; barang_baru?: string } | null;

async function terapkanPenawaran(p: PilihanTerapkan, t: Tinjauan, surat: SuratPenawaran[], barang: Barang, userId: number, hasil: HasilTerapkan): Promise<void> {
  const norm = (v: NilaiBaku | undefined) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const kunciSurat = (rekanan: NilaiBaku | undefined, nomor: NilaiBaku | undefined, tgl: NilaiBaku | undefined) => `${norm(rekanan)}|${norm(nomor)}|${tgl ?? ''}`;
  const suratItem = new Map(surat.flatMap(x => x.item.map(i => [i.id, x] as const)));
  type Rencana = { surat: SuratPenawaran | null; kepala: Record<string, NilaiBaku>; ubah: Map<number, Record<string, NilaiBaku>>; baru: UsulBaru[]; label: string[] };
  const perSurat = new Map<string, Rencana>();
  const ambil = (k: string, sr: SuratPenawaran | null, kepala: Record<string, NilaiBaku>) => {
    if (!perSurat.has(k)) perSurat.set(k, { surat: sr, kepala, ubah: new Map(), baru: [], label: [] });
    return perSurat.get(k)!;
  };
  for (const pu of p.ubah.filter(x => x.lembar === 'penawaran')) {
    const u = t.ubah.find(x => x.lembar === 'penawaran' && x.id === pu.id);
    const sr = suratItem.get(pu.id);
    if (!u || !sr) { hasil.ditolak.push(`Penawaran item #${pu.id}: tidak ada lagi`); continue; }
    if (pu.versi !== u.versi) { hasil.ditolak.push(`${u.label}: surat ini diubah orang lain di PRIMA sesudah pratinjau dibuka — buka pratinjau lagi`); continue; }
    const v = Object.fromEntries(u.sel.filter(x => pu.sel[x.kunci] === 'drive').map(x => [x.kunci, x.drive]));
    const r = ambil(`id:${sr.id}`, sr, {});
    for (const k of ['rekanan', 'nomor', 'tgl_surat', 'berlaku'] as const) if (k in v && !(k in r.kepala)) r.kepala[k] = v[k];
    r.ubah.set(pu.id, v); r.label.push(u.label);
  }
  for (const pb of p.baru.filter(x => x.lembar === 'penawaran')) {
    const b = t.baru.find(x => x.lembar === 'penawaran' && x.baris === pb.baris);
    if (!b || b.tolak) { hasil.ditolak.push(`Penawaran baris ${pb.baris}: ${b?.tolak ?? 'tidak ada lagi di pratinjau terbaru'}`); continue; }
    const k = kunciSurat(b.nilai.rekanan, b.nilai.nomor, b.nilai.tgl_surat);
    // Surat yang sama (rekanan + no. + tgl) — termasuk yang baru dibuat orang lain di PRIMA — digabung, bukan kembar.
    const ada = surat.find(x => kunciSurat(x.rekanan, x.nomor_surat, x.tgl_surat) === k);
    const r = ada ? ambil(`id:${ada.id}`, ada, {}) : ambil(`baru:${k}`, null, { rekanan: b.nilai.rekanan, nomor: b.nilai.nomor, tgl_surat: b.nilai.tgl_surat, berlaku: b.nilai.berlaku });
    r.baru.push(b); r.label.push(`baris ${b.baris} ${b.label}`);
  }
  for (const r of perSurat.values()) {
    const judul = r.surat ? `Surat ${r.surat.rekanan}${r.surat.nomor_surat ? ` No. ${r.surat.nomor_surat}` : ''}` : `Surat baru ${r.kepala.rekanan ?? ''}`;
    try {
      const catatan: string[] = [];
      const kolomItem = (v: Record<string, NilaiBaku>, dasar: { barang_id: number | null; nama_barang: string; merk_tipe: string | null; spesifikasi: string | null; satuan: string | null; harga_satuan: number }) => {
        const item: Record<string, unknown> = { ...dasar };
        if ('nama' in v) item.nama_barang = s(v.nama);
        if ('merk' in v) item.merk_tipe = s(v.merk);
        if ('spesifikasi' in v) item.spesifikasi = s(v.spesifikasi);
        if ('satuan' in v) item.satuan = s(v.satuan);
        if ('harga' in v) item.harga_satuan = n(v.harga);
        if ('barang' in v) {
          const b = barang(v.barang);
          if (b) { delete item.barang_id; Object.assign(item, b.barang_baru ? { barang_baru: b.barang_baru } : { barang_id: b.barang_id }); }
          else catatan.push(`barang "${v.barang}" belum ada di Master — tidak ditautkan`);
        }
        return item;
      };
      const item = [
        ...(r.surat?.item ?? []).map(i => ({ id: i.id, ...kolomItem(r.ubah.get(i.id) ?? {}, { barang_id: i.barang_id, nama_barang: i.nama_barang, merk_tipe: i.merk_tipe, spesifikasi: i.spesifikasi, satuan: i.satuan, harga_satuan: i.harga_satuan }) })),
        ...r.baru.map(b => kolomItem(b.nilai, { barang_id: null, nama_barang: '', merk_tipe: null, spesifikasi: null, satuan: null, harga_satuan: 0 })),
      ];
      const sr = r.surat;
      const kepala = {
        rekanan: s(r.kepala.rekanan ?? sr?.rekanan), nomor_surat: s('nomor' in r.kepala ? r.kepala.nomor : sr?.nomor_surat ?? null),
        tgl_surat: s(r.kepala.tgl_surat ?? sr?.tgl_surat), berlaku_sampai: s('berlaku' in r.kepala ? r.kepala.berlaku : sr?.berlaku_sampai ?? null),
        // Kategori sengaja tidak dikirim: tinjauan Drive tidak mengubahnya, dan undefined = jangan sentuh (L87).
        file_id: sr?.file_id ?? null, catatan: sr?.catatan ?? null,
      };
      const z = PenawaranSimpanSchema.safeParse({ id: sr?.id ?? null, expected_version: sr?.version ?? null, kepala, item });
      if (!z.success) throw new Error(z.error.issues[0].message);
      await simpanPenawaran(z.data, userId);
      hasil.diterapkan.push(`${judul}: ${r.label.join('; ')}${catatan.length ? ` (${catatan.join('; ')})` : ''}`);
    } catch (e) { hasil.ditolak.push(`${judul}: ${sebab(e)}`); }
  }
}

/** Abaikan perubahan Drive: tidak ada yang ditulis; tahanan dilepas, kiriman berikutnya menimpa berkas. */
export async function abaikanDriveBalik(kunci: string, revisi: string): Promise<PerubahanLuar> {
  return withTransaction(async ({ tx }) => {
    if (!(await kunciPengirim(tx))) throw new TinjauanDriveError('SIBUK', 'Salinan otomatis ke Drive sedang berjalan. Coba lagi sebentar lagi.');
    const st = await bacaStatusDrive();
    const s0 = st.berkas[kunci];
    if (!s0?.luar || !s0.file_id) throw new TinjauanDriveError('TIDAK_ADA', 'Tidak ada perubahan Drive yang menunggu ditinjau untuk berkas ini — mungkin sudah ditinjau orang lain.');
    if (s0.luar.revisi !== revisi) throw new TinjauanDriveError('PRATINJAU_BASI', 'Berkas di Drive diubah lagi — buka tinjauannya lagi sebelum mengabaikan.');
    const kepala = await metadataBerkasDrive(s0.file_id);
    if (!s0.luar.tertimpa && kepala.md5 !== s0.luar.md5) throw new TinjauanDriveError('PRATINJAU_BASI', 'Berkas di Drive baru saja disimpan lagi — buka tinjauannya lagi supaya suntingan terbarunya terlihat.');
    const luar = s0.luar;
    st.berkas[kunci] = lepasTahanan(s0, kepala.md5);
    await tulisStatusDrive(tx, st);
    return luar;
  });
}
