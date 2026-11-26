// ═══ PRIMA — BBA laporan Excel + salinan otomatis ke Drive (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B) ═══
// `bahanBukuRencana` = SATU bahan untuk tombol Unduh Excel DAN cron Drive (L78). Status kirim di `app_config`
// (`bba_drive_status`, JSON) + manifest `drive_arsip` yang sudah ada — tanpa tabel baru.
import { sql, queryMany, queryOne, withTransaction } from '@/lib/data/db';
import { acquireBludLock } from '@/lib/data/locks';
import { tanggalHariIniWIB, waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { rencanaSetahun } from '@/lib/data/buku-besar-aset';
import { penerimaanUntuk } from '@/lib/data/bba-penerimaan';
import { itemPenawaran } from '@/lib/data/bba-penawaran';
import { asetUntukKib, bacaPengaturanBba } from '@/lib/data/bba-aset';
import { masukBukuResmi } from '@/lib/bba/lembar';
import { GOLONGAN } from '@/lib/bba/kib';
import { tulisLembarKib } from '@/lib/bba/kib-excel';
import { tulisBukuRencana, sidikBahan, namaBerkasBukuRencana, NAMA_BERKAS_KIB_DRIVE, type BahanBukuRencana, type LembarBuku } from '@/lib/bba/laporan-excel';
import { putuskanKirim, catatHasilKirim, type StatusBerkasDrive } from '@/lib/bba/drive-kirim';
import { timpaDiTujuan, ringkasGalat } from '@/lib/services/drive-catatan';
import { tujuanTerkonfigurasi } from '@/lib/services/drive-tujuan';
import { createHash } from 'node:crypto';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const KUNCI_STATUS_DRIVE = 'bba_drive_status';

export async function bahanBukuRencana(tahun: number): Promise<BahanBukuRencana> {
  const rows = await rencanaSetahun(tahun);
  const per = await penerimaanUntuk(rows.map(r => r.id));
  const rencana = rows.map(r => ({
    id: r.id, canonical_id: r.canonical_id, uraian: r.uraian, barang_nama: r.barang_nama, sumber_anggaran: r.sumber_anggaran, vol: r.vol, satuan: r.satuan,
    harga: r.harga, nilai_rencana: r.nilai_rencana, anggaran: r.anggaran, anggaran_nilai: r.anggaran_nilai, jenis_rencana: r.jenis_rencana, tgl_proses: r.tgl_proses,
    vol_realisasi: r.vol_realisasi, nilai_realisasi: r.nilai_realisasi, usulan_no: r.usulan_no, alasan: r.alasan,
    status: r.status, usulan_keputusan: r.usulan_keputusan, barang_id: r.barang_id, ref: r.ref, belum_dicatat: r.belum_dicatat,
  }));
  const penerimaan = Object.values(per).flat().map(p => ({ rencana_id: p.rencana_id, tgl: p.tgl, vol: p.vol, harga_satuan: p.harga_satuan, nilai: p.nilai, merk_tipe: p.merk_tipe, penyedia: p.penyedia, catatan: p.catatan, pindahan: p.pindahan, ditempatkan: p.ditempatkan }));
  return { tahun, rencana, penerimaan, penawaran: await itemPenawaran(), hariIni: tanggalHariIniWIB() };
}

export async function bukuRencanaBuffer(tahun: number, aktif: LembarBuku = 'Ringkasan'): Promise<{ buffer: Buffer; nama: string; sidik: string }> {
  const b = await bahanBukuRencana(tahun);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  tulisBukuRencana(wb, b, aktif);
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nama: namaBerkasBukuRencana(tahun), sidik: sidikBahan(b) };
}

/** Buku Aset (KIB) — format provinsi yang sudah ada, satu lembar per golongan (§5B.1), hanya buku resmi. */
async function kibBuffer(): Promise<{ buffer: Buffer; sidik: string }> {
  const [pengaturan, isi] = await Promise.all([bacaPengaturanBba(), Promise.all(GOLONGAN.map(asetUntukKib))]);
  const resmi = isi.map(xs => xs.filter(masukBukuResmi));
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const tanggal = tanggalHariIniWIB();
  GOLONGAN.forEach((g, i) => tulisLembarKib(wb, g, resmi[i], pengaturan, tanggal));
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), sidik: createHash('sha256').update(JSON.stringify([pengaturan, resmi])).digest('hex') };
}

export interface StatusDrive { berkas: Record<string, StatusBerkasDrive>; terakhir?: { pada: string; ok: boolean; pesan: string } }

export async function bacaStatusDrive(): Promise<StatusDrive> {
  const r = await queryOne<{ value: string | null }>(sql`SELECT value FROM app_config WHERE \`key\` = ${KUNCI_STATUS_DRIVE} LIMIT 1`);
  try { const j = JSON.parse(r?.value ?? 'null') as StatusDrive | null; return j && typeof j === 'object' && j.berkas ? j : { berkas: {} }; } catch { return { berkas: {} }; }
}

export type HasilKirim = { status: 'belum-diatur' } | { status: 'selesai'; dikirim: string[]; gagal: string[]; tetap: number };

/**
 * Cron tiap 5 menit DAN tombol "Kirim ke Drive sekarang" (`paksa` = tanpa menunggu 2 menit diam). Satu pengirim pada satu
 * waktu (kunci `blud_locks bba_drive:kirim`) — dua pengirim berbarengan akan sama-sama membuat berkas baru. Yang dikunci
 * hanya baris kunci itu, bukan data BBA: Simpan tidak pernah menunggu Drive.
 */
export async function kirimLaporanKeDrive(paksa: boolean): Promise<HasilKirim> {
  if (!(await tujuanTerkonfigurasi('bba_laporan'))) return { status: 'belum-diatur' };
  return withTransaction(async ({ tx }) => {
    await acquireBludLock(tx, 'bba_drive', 'kirim');
    const st = await bacaStatusDrive();
    const kini = Date.now();
    const dikirim: string[] = [], gagal: string[] = [];
    let tetap = 0;
    const tahun = (await queryMany<{ t: number }>(sql`SELECT DISTINCT tahun_anggaran AS t FROM buku_besar_aset ORDER BY t`)).map(x => Number(x.t));
    const kerja: Array<{ kunci: string; buat: () => Promise<{ buffer: Buffer; sidik: string; nama: string; subfolder?: string }> }> = [
      ...tahun.map(t => ({ kunci: `rencana:${t}`, buat: async () => ({ ...(await bukuRencanaBuffer(t)), subfolder: String(t) }) })),
      { kunci: 'kib', buat: async () => ({ ...(await kibBuffer()), nama: NAMA_BERKAS_KIB_DRIVE }) },
    ];
    for (const w of kerja) {
      const isi = await w.buat();
      const { kirim, status } = putuskanKirim(st.berkas[w.kunci], isi.sidik, kini, paksa);
      st.berkas[w.kunci] = status;
      if (!kirim) { tetap++; continue; }
      try {
        const h = await timpaDiTujuan('bba_laporan', { buffer: isi.buffer, name: isi.nama, mimeType: MIME_XLSX, fileId: status.file_id, subfolder: isi.subfolder });
        st.berkas[w.kunci] = catatHasilKirim(status, isi.sidik, { fileId: h.fileId, pada: waktuSekarangWIB() });
        dikirim.push(isi.nama);
      } catch (e) {
        st.berkas[w.kunci] = catatHasilKirim(status, isi.sidik, { galat: ringkasGalat(e) });
        gagal.push(`${isi.nama}: ${ringkasGalat(e)}`);
      }
    }
    if (dikirim.length || gagal.length) st.terakhir = { pada: waktuSekarangWIB(), ok: gagal.length === 0, pesan: gagal.length ? gagal.join(' · ') : `${dikirim.length} berkas terkirim` };
    await tx`INSERT INTO app_config (\`key\`, value) VALUES (${KUNCI_STATUS_DRIVE}, ${JSON.stringify(st)}) ON DUPLICATE KEY UPDATE value = VALUES(value)`;
    return { status: 'selesai', dikirim, gagal, tetap };
  });
}
