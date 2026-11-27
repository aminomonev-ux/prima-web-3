// ═══ PRIMA — BBA laporan Excel + salinan otomatis ke Drive (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B) ═══
// `bahanBukuRencana` = SATU bahan untuk tombol Unduh Excel DAN cron Drive (L78). Status kirim di `app_config`
// (`bba_drive_status`, JSON) + manifest `drive_arsip`; potret tiap kiriman di `bba_drive_potret` (CONCEPT-bba-drive-balik §6A).
import { sql, queryMany, queryOne, withTransaction, sqlInt, type TxSql } from '@/lib/data/db';
import type { ItemPenawaran } from '@/lib/bba/penawaran';
import { acquireBludLock } from '@/lib/data/locks';
import { tanggalHariIniWIB, waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { rencanaSetahun, type BbaRow } from '@/lib/data/buku-besar-aset';
import { penerimaanUntuk } from '@/lib/data/bba-penerimaan';
import { itemPenawaran } from '@/lib/data/bba-penawaran';
import { asetUntukKib, bacaPengaturanBba } from '@/lib/data/bba-aset';
import { masukBukuResmi } from '@/lib/bba/lembar';
import { GOLONGAN } from '@/lib/bba/kib';
import { tulisLembarKib } from '@/lib/bba/kib-excel';
import { tulisBukuRencana, sidikBahan, namaBerkasBukuRencana, NAMA_BERKAS_KIB_DRIVE, type BahanBukuRencana, type LembarBuku } from '@/lib/bba/laporan-excel';
import { putuskanKirim, catatHasilKirim, periksaLuar, revisiTertimpa, type StatusBerkasDrive } from '@/lib/bba/drive-kirim';
import { potretDariBahan, type Potret } from '@/lib/bba/drive-balik';
import { timpaDiTujuan, ringkasGalat } from '@/lib/services/drive-catatan';
import { metadataBerkasDrive, daftarRevisiDrive, kodeGalatDrive } from '@/lib/services/drive';
import { tujuanTerkonfigurasi } from '@/lib/services/drive-tujuan';
import { createHash } from 'node:crypto';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const KUNCI_STATUS_DRIVE = 'bba_drive_status';

/** `penawaran` boleh dioper — pengirim Drive memuatnya sekali untuk semua tahun (isinya tidak terikat tahun). */
export async function bahanBukuRencana(tahun: number, penawaran?: ItemPenawaran[]): Promise<BahanBukuRencana> {
  return (await muatBahanBukuRencana(tahun, penawaran)).bahan;
}

/** Bahan laporan + baris rencana lengkapnya (versi, asal usulan) — pratinjau Drive balik butuh keduanya dari bacaan yang SAMA. */
export async function muatBahanBukuRencana(tahun: number, penawaran?: ItemPenawaran[]): Promise<{ bahan: BahanBukuRencana; rows: BbaRow[] }> {
  const rows = await rencanaSetahun(tahun);
  return { rows, bahan: await susunBahan(tahun, rows, penawaran) };
}

async function susunBahan(tahun: number, rows: BbaRow[], penawaran?: ItemPenawaran[]): Promise<BahanBukuRencana> {
  const per = await penerimaanUntuk(rows.map(r => r.id));
  const rencana = rows.map(r => ({
    id: r.id, canonical_id: r.canonical_id, uraian: r.uraian, barang_nama: r.barang_nama, sumber_anggaran: r.sumber_anggaran, vol: r.vol, satuan: r.satuan,
    harga: r.harga, nilai_rencana: r.nilai_rencana, anggaran: r.anggaran, anggaran_nilai: r.anggaran_nilai, jenis_rencana: r.jenis_rencana, tgl_proses: r.tgl_proses,
    vol_realisasi: r.vol_realisasi, nilai_realisasi: r.nilai_realisasi, usulan_no: r.usulan_no, alasan: r.alasan,
    status: r.status, usulan_keputusan: r.usulan_keputusan, barang_id: r.barang_id, ref: r.ref, belum_dicatat: r.belum_dicatat,
  }));
  const penerimaan = Object.values(per).flat().map(p => ({ id: p.id, rencana_id: p.rencana_id, tgl: p.tgl, vol: p.vol, harga_satuan: p.harga_satuan, nilai: p.nilai, merk_tipe: p.merk_tipe, penyedia: p.penyedia, catatan: p.catatan, pindahan: p.pindahan, ditempatkan: p.ditempatkan }));
  return { tahun, rencana, penerimaan, penawaran: penawaran ?? await itemPenawaran(), hariIni: tanggalHariIniWIB() };
}

async function tulisBuku(b: BahanBukuRencana, aktif: LembarBuku): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  tulisBukuRencana(wb, b, aktif);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function bukuRencanaBuffer(tahun: number, aktif: LembarBuku = 'Ringkasan'): Promise<{ buffer: Buffer; nama: string; sidik: string }> {
  const b = await bahanBukuRencana(tahun);
  return { buffer: await tulisBuku(b, aktif), nama: namaBerkasBukuRencana(tahun), sidik: sidikBahan(b) };
}

/** Buku Aset (KIB) — format provinsi yang sudah ada, satu lembar per golongan (§5B.1), hanya buku resmi. */
async function bahanKib(): Promise<{ sidik: string; tulis: () => Promise<Buffer> }> {
  const [pengaturan, isi] = await Promise.all([bacaPengaturanBba(), Promise.all(GOLONGAN.map(asetUntukKib))]);
  const resmi = isi.map(xs => xs.filter(masukBukuResmi));
  return {
    sidik: createHash('sha256').update(JSON.stringify([pengaturan, resmi])).digest('hex'),
    tulis: async () => {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const tanggal = tanggalHariIniWIB();
      GOLONGAN.forEach((g, i) => tulisLembarKib(wb, g, resmi[i], pengaturan, tanggal));
      return Buffer.from(await wb.xlsx.writeBuffer());
    },
  };
}

/** ER_LOCK_NOWAIT — baris kunci sedang dipegang pengirim lain. */
const KUNCI_SIBUK = 3572;

/**
 * Kunci "satu pengirim" TANPA menunggu: pemegang kedua langsung dijawab `sibuk`. Menunggu di sini = menunggu seluruh
 * unggahan Drive pemegang pertama (bisa berbilang menit), lalu gugur `innodb_lock_wait_timeout` jadi galat 500.
 */
export async function kunciPengirim(tx: TxSql): Promise<boolean> {
  try {
    const ada = await tx`SELECT version FROM blud_locks WHERE entity = 'bba_drive' AND key_id = 'kirim' FOR UPDATE NOWAIT` as unknown[];
    if (ada.length === 0) await acquireBludLock(tx, 'bba_drive', 'kirim');
    return true;
  } catch (e) {
    if ((e as { errno?: number }).errno === KUNCI_SIBUK) return false;
    throw e;
  }
}

export interface StatusDrive { berkas: Record<string, StatusBerkasDrive>; terakhir?: { pada: string; ok: boolean; pesan: string } }

export async function bacaStatusDrive(): Promise<StatusDrive> {
  const r = await queryOne<{ value: string | null }>(sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_STATUS_DRIVE} LIMIT 1`);
  try { const j = JSON.parse(r?.value ?? 'null') as StatusDrive | null; return j && typeof j === 'object' && j.berkas ? j : { berkas: {} }; } catch { return { berkas: {} }; }
}

export async function tulisStatusDrive(tx: TxSql, st: StatusDrive): Promise<void> {
  await tx`INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_STATUS_DRIVE}, ${JSON.stringify(st)}) ON DUPLICATE KEY UPDATE value = VALUES(value)`;
}

/** Potret kiriman (asal gabung tiga arah, CONCEPT-bba-drive-balik §6A) — ≤ 20 terakhir per berkas. */
export const MAKS_POTRET = 20;
async function simpanPotret(tx: TxSql, kunci: string, md5: string, revisi: string | null, potret: Potret): Promise<void> {
  await tx`INSERT INTO bba_drive_potret (kunci, md5, revisi, dikirim_pada, isi) VALUES (${kunci}, ${md5}, ${revisi}, ${waktuSekarangWIB()}, ${JSON.stringify(potret)})`;
  await tx`
    DELETE FROM bba_drive_potret WHERE kunci = ${kunci} AND id NOT IN (
      SELECT id FROM (SELECT id FROM bba_drive_potret WHERE kunci = ${kunci} ORDER BY id DESC LIMIT ${sqlInt(MAKS_POTRET)}) AS sisa)
  `;
}

export type HasilKirim = { status: 'belum-diatur' } | { status: 'sibuk' } | { status: 'selesai'; dikirim: string[]; gagal: string[]; tetap: number; ditahan: string[] };

/**
 * Cron tiap 5 menit DAN tombol "Kirim ke Drive sekarang" (`paksa` = tanpa menunggu 2 menit diam). Satu pengirim pada satu
 * waktu (kunci `blud_locks bba_drive:kirim`, tanpa menunggu) — dua pengirim berbarengan akan sama-sama membuat berkas
 * baru. Yang dikunci hanya baris kunci itu, bukan data BBA: Simpan tidak pernah menunggu Drive. Tinjauan perubahan Drive
 * memegang kunci yang SAMA (status berkas satu JSON; dua penulis = tahanan yang baru dilepas bisa dipasang balik).
 * Workbook baru DIBANGUN bila sidiknya memutuskan kirim — tiap putaran cron yang tidak mengirim cukup membaca bahan.
 * Berkas Rencana yang diubah di luar PRIMA (md5 ≠ kiriman terakhir) DITAHAN, tidak ditimpa (CONCEPT-bba-drive-balik §3).
 */
export async function kirimLaporanKeDrive(paksa: boolean): Promise<HasilKirim> {
  if (!(await tujuanTerkonfigurasi('bba_laporan'))) return { status: 'belum-diatur' };
  return withTransaction(async ({ tx }) => {
    if (!(await kunciPengirim(tx))) return { status: 'sibuk' };
    const st = await bacaStatusDrive();
    const kini = Date.now();
    const dikirim: string[] = [], gagal: string[] = [], ditahan: string[] = [];
    let tetap = 0;
    const tahun = (await queryMany<{ t: number }>(sql`SELECT DISTINCT tahun_anggaran AS t FROM buku_besar_aset ORDER BY t`)).map(x => Number(x.t));
    const penawaran = await itemPenawaran();
    type Bahan = { sidik: string; nama: string; subfolder?: string; tulis: () => Promise<Buffer>; potret?: () => Potret };
    const kerja: Array<{ kunci: string; nama: string; bahan: () => Promise<Bahan> }> = [
      ...tahun.map(t => ({ kunci: `rencana:${t}`, nama: namaBerkasBukuRencana(t), bahan: async (): Promise<Bahan> => {
        const b = await bahanBukuRencana(t, penawaran);
        return { sidik: sidikBahan(b), nama: namaBerkasBukuRencana(t), subfolder: String(t), tulis: () => tulisBuku(b, 'Ringkasan'), potret: () => potretDariBahan(b) };
      } })),
      { kunci: 'kib', nama: NAMA_BERKAS_KIB_DRIVE, bahan: async (): Promise<Bahan> => ({ ...(await bahanKib()), nama: NAMA_BERKAS_KIB_DRIVE }) },
    ];
    for (const w of kerja) {
      const s0 = st.berkas[w.kunci];
      // Deteksi DULU, sebelum bahan dihitung: berkas yang menunggu tinjauan tidak perlu disusun sama sekali.
      if (w.kunci.startsWith('rencana:') && s0?.file_id && s0.md5_terkirim) {
        try {
          const luar = periksaLuar(s0, await metadataBerkasDrive(s0.file_id));
          if (luar) { st.berkas[w.kunci] = { ...s0, luar }; ditahan.push(w.nama); continue; }
        } catch (e) {
          // 404 = berkas di Drive hilang → kiriman di bawah membuat yang baru. Galat lain: jangan menimpa sesuatu yang tidak bisa diperiksa.
          if (kodeGalatDrive(e) !== 404) { gagal.push(`${w.nama}: ${ringkasGalat(e)}`); continue; }
        }
      }
      if (s0?.luar) { ditahan.push(w.nama); continue; }
      const isi = await w.bahan();
      const { kirim, status } = putuskanKirim(s0, isi.sidik, kini, paksa);
      st.berkas[w.kunci] = status;
      if (!kirim) { tetap++; continue; }
      try {
        const h = await timpaDiTujuan('bba_laporan', { buffer: await isi.tulis(), name: isi.nama, mimeType: MIME_XLSX, fileId: status.file_id, subfolder: isi.subfolder });
        let baru = catatHasilKirim(status, isi.sidik, { fileId: h.fileId, pada: waktuSekarangWIB(), md5: h.md5, revisi: h.revisi });
        if (isi.potret && h.md5) {
          await simpanPotret(tx, w.kunci, h.md5, h.revisi, isi.potret());
          // §6A urutan 3: suntingan yang masuk di sela pemeriksaan & timpa — tertimpa, tapi masih ada di riwayat revisi.
          if (!h.baru && (status.revisi_terkirim || status.revisi_ditinjau)) {
            const kami = new Set([status.md5_terkirim, status.md5_ditinjau, h.md5].filter((x): x is string => !!x));
            const tertimpa = revisiTertimpa(await daftarRevisiDrive(h.fileId), [status.revisi_terkirim, status.revisi_ditinjau], h.revisi, kami);
            if (tertimpa) { baru = { ...baru, luar: tertimpa }; ditahan.push(isi.nama); }
          }
        }
        st.berkas[w.kunci] = baru;
        dikirim.push(isi.nama);
      } catch (e) {
        st.berkas[w.kunci] = catatHasilKirim(status, isi.sidik, { galat: ringkasGalat(e) });
        gagal.push(`${isi.nama}: ${ringkasGalat(e)}`);
      }
    }
    if (dikirim.length || gagal.length) st.terakhir = { pada: waktuSekarangWIB(), ok: gagal.length === 0, pesan: gagal.length ? gagal.join(' · ') : `${dikirim.length} berkas terkirim` };
    await tulisStatusDrive(tx, st);
    return { status: 'selesai', dikirim, gagal, tetap, ditahan };
  });
}
