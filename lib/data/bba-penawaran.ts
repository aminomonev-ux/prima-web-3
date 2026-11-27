// ═══ PRIMA — BBA Penawaran Rekanan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A) — Data Layer ═══
// Gudang penawaran harga dari rekanan. Rencana MENYALIN yang dipakainya ke bba_referensi_harga (`penawaran_item_id`
// hanya jejak), jadi surat boleh disunting/dihapus tanpa mengubah catatan sejarah rencana.
import { sql, queryMany, withTransaction, bulkInsert, escapeLike } from '@/lib/data/db';
import type { Penanya } from '@/lib/data/db';
import { rapikanNamaRekanan, saranRekananDari, syaratSurat, type ItemPenawaran, type SaranRekanan, type StatusPajak, type StatusTindakLanjut } from '@/lib/bba/penawaran';
import { normalisasiKategoriItem } from '@/lib/bba/kategori';
import { pastikanBerkasBba, tentukanBarang, selesaikanKategori, BbaVersionConflictError, BbaNotFoundError } from '@/lib/data/buku-besar-aset';
import type { PenawaranSimpanInput } from './bba-penawaran-schemas';

export interface SuratPenawaran {
  id: number; rekanan: string; nomor_surat: string | null; tgl_surat: string; berlaku_sampai: string | null;
  kategori_id: number | null; jenis_kategori_id: number | null; kategori: string | null; jenis_kategori: string | null;
  kode_rekening: string | null; kelompok_kib: string | null;
  file_id: string | null; catatan: string | null; version: number; oleh: string | null;
  jenis_surat: string | null; pic_kontak: string | null; masa_berlaku_teks: string | null; status_tindak_lanjut: StatusTindakLanjut | null;
  item: Array<ItemPenawaran & { dipakai: number }>;
}

/** Surat berharga tanpa item berharga — dilempar di transaksi bila jenis surat tidak dikirim (dinilai dari yang tersimpan). */
export class BbaSyaratSuratError extends Error {
  constructor(msg: string) { super(msg); this.name = 'BbaSyaratSuratError'; }
}

const KOLOM_ITEM = sql`
  i.id, i.penawaran_id, w.rekanan, w.nomor_surat, DATE_FORMAT(w.tgl_surat, '%Y-%m-%d') AS tgl_surat,
  DATE_FORMAT(w.berlaku_sampai, '%Y-%m-%d') AS berlaku_sampai, w.kategori, w.jenis_kategori, w.kode_rekening, w.file_id,
  w.jenis_surat, w.pic_kontak, w.masa_berlaku_teks, w.status_tindak_lanjut, w.catatan AS syarat,
  i.barang_id, g.nama AS barang_nama, i.nama_barang, i.merk, i.merk_tipe, i.spesifikasi, i.satuan, i.harga_satuan, i.status_pajak, i.tautan, i.garansi
`;
const DARI_ITEM = sql`FROM bba_penawaran_item i JOIN bba_penawaran w ON w.id = i.penawaran_id LEFT JOIN bba_barang g ON g.id = i.barang_id`;

const petakanItem = (r: Record<string, unknown>): ItemPenawaran => ({
  id: Number(r.id), penawaran_id: Number(r.penawaran_id), rekanan: String(r.rekanan ?? ''), nomor_surat: (r.nomor_surat as string | null) ?? null,
  tgl_surat: (r.tgl_surat as string | null) ?? '', berlaku_sampai: (r.berlaku_sampai as string | null) ?? null, file_id: (r.file_id as string | null) ?? null, // tanggal: DATE_FORMAT di SQL
  barang_id: r.barang_id == null ? null : Number(r.barang_id), barang_nama: (r.barang_nama as string | null) ?? null,
  nama_barang: String(r.nama_barang ?? ''), merk: (r.merk as string | null) ?? null, merk_tipe: (r.merk_tipe as string | null) ?? null, spesifikasi: (r.spesifikasi as string | null) ?? null,
  satuan: (r.satuan as string | null) ?? null, harga_satuan: r.harga_satuan == null ? null : Number(r.harga_satuan),
  status_pajak: (r.status_pajak as StatusPajak | null) ?? null, tautan: (r.tautan as string | null) ?? null, garansi: (r.garansi as string | null) ?? null,
  jenis_surat: (r.jenis_surat as string | null) ?? null, pic_kontak: (r.pic_kontak as string | null) ?? null, masa_berlaku_teks: (r.masa_berlaku_teks as string | null) ?? null,
  status_tindak_lanjut: (r.status_tindak_lanjut as StatusTindakLanjut | null) ?? null, syarat: (r.syarat as string | null) ?? null,
  kategori: (r.kategori as string | null) ?? null, jenis_kategori: (r.jenis_kategori as string | null) ?? null, kode_rekening: (r.kode_rekening as string | null) ?? null,
});

/** Daftar surat + itemnya; `q` mencocokkan rekanan, nomor surat, kode rekening, kategori, atau nama barang. */
export async function listPenawaran(q?: string, filter?: { kategori?: string; jenis_kategori?: string }): Promise<SuratPenawaran[]> {
  const term = q?.trim() ? `%${escapeLike(q.trim())}%` : null;
  let where = sql`WHERE 1=1`;
  if (term) {
    where = sql`${where} AND (w.rekanan LIKE ${term} OR w.nomor_surat LIKE ${term} OR w.pic_kontak LIKE ${term} OR w.kode_rekening LIKE ${term} OR w.kategori LIKE ${term} OR w.jenis_kategori LIKE ${term} OR EXISTS (SELECT 1 FROM bba_penawaran_item x WHERE x.penawaran_id = w.id AND (x.nama_barang LIKE ${term} OR x.merk LIKE ${term} OR x.merk_tipe LIKE ${term})))`;
  }
  if (filter?.kategori?.trim()) {
    where = sql`${where} AND w.kategori = ${filter.kategori.trim()}`;
  }
  if (filter?.jenis_kategori?.trim()) {
    where = sql`${where} AND w.jenis_kategori = ${filter.jenis_kategori.trim()}`;
  }
  const surat = await queryMany<Record<string, unknown>>(sql`
    SELECT w.id, w.rekanan, w.nomor_surat, DATE_FORMAT(w.tgl_surat, '%Y-%m-%d') AS tgl_surat, DATE_FORMAT(w.berlaku_sampai, '%Y-%m-%d') AS berlaku_sampai,
           w.kategori_id, w.jenis_kategori_id, w.kategori, w.jenis_kategori, w.kode_rekening, w.kelompok_kib,
           w.file_id, w.catatan, w.version, u.username AS oleh, w.jenis_surat, w.pic_kontak, w.masa_berlaku_teks, w.status_tindak_lanjut
    FROM bba_penawaran w LEFT JOIN users u ON u.id = COALESCE(w.updated_by, w.created_by)
    ${where}
    ORDER BY w.tgl_surat DESC, w.id DESC
  `);
  if (surat.length === 0) return [];
  const ids = surat.map(s => Number(s.id));
  const items = await queryMany<Record<string, unknown>>(sql`
    SELECT ${KOLOM_ITEM}, (SELECT COUNT(DISTINCT rh.aset_id) FROM bba_referensi_harga rh WHERE rh.penawaran_item_id = i.id) AS dipakai
    ${DARI_ITEM} WHERE i.penawaran_id IN (${ids}) ORDER BY i.penawaran_id, i.urutan, i.id
  `);
  const per = new Map<number, Array<ItemPenawaran & { dipakai: number }>>();
  for (const r of items) { const it = { ...petakanItem(r), dipakai: Number(r.dipakai ?? 0) }; per.set(it.penawaran_id, [...(per.get(it.penawaran_id) ?? []), it]); }
  return surat.map(s => {
    const kat = normalisasiKategoriItem({
      kategori: (s.kategori as string | null) ?? null,
      jenis_kategori: (s.jenis_kategori as string | null) ?? null,
      kode_rekening: (s.kode_rekening as string | null) ?? null,
      kelompok_kib: (s.kelompok_kib as string | null) ?? null,
    });
    return {
      id: Number(s.id), rekanan: String(s.rekanan ?? ''), nomor_surat: (s.nomor_surat as string | null) ?? null, tgl_surat: (s.tgl_surat as string | null) ?? '', // DATE_FORMAT di SQL
      berlaku_sampai: (s.berlaku_sampai as string | null) ?? null,
      kategori_id: s.kategori_id == null ? null : Number(s.kategori_id),
      jenis_kategori_id: s.jenis_kategori_id == null ? null : Number(s.jenis_kategori_id),
      kategori: kat.kategori, jenis_kategori: kat.jenis_kategori, kode_rekening: kat.kode_rekening, kelompok_kib: kat.kelompok_kib,
      file_id: (s.file_id as string | null) ?? null,
      catatan: (s.catatan as string | null) ?? null, version: Number(s.version ?? 0), oleh: (s.oleh as string | null) ?? null,
      jenis_surat: (s.jenis_surat as string | null) ?? null, pic_kontak: (s.pic_kontak as string | null) ?? null,
      masa_berlaku_teks: (s.masa_berlaku_teks as string | null) ?? null, status_tindak_lanjut: (s.status_tindak_lanjut as StatusTindakLanjut | null) ?? null,
      item: per.get(Number(s.id)) ?? [],
    };
  });
}

/**
 * Semua item (Bandingkan, unduhan) atau item BERHARGA satu barang (Ambil dari penawaran di modal rencana) — item tanpa
 * harga tidak pernah ditawarkan jadi referensi (§3.3).
 */
export async function itemPenawaran(barangId?: number): Promise<ItemPenawaran[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_ITEM} ${DARI_ITEM} ${barangId ? sql`WHERE i.barang_id = ${barangId} AND i.harga_satuan > 0` : sql``} ORDER BY w.tgl_surat DESC, i.id DESC`);
  return rows.map(petakanItem);
}

/** Surat tanpa barang (permohonan presentasi, company profile) — satu baris Matriks di unduhan; `penawaran_id` = id surat. */
export async function suratTanpaBarang(): Promise<ItemPenawaran[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT ${KOLOM_ITEM}, w.id AS surat_id FROM bba_penawaran w LEFT JOIN bba_penawaran_item i ON i.penawaran_id = w.id LEFT JOIN bba_barang g ON g.id = i.barang_id
    WHERE i.id IS NULL ORDER BY w.tgl_surat DESC, w.id DESC
  `);
  return rows.map(r => ({ ...petakanItem(r), id: 0, penawaran_id: Number(r.surat_id) }));
}

/** Menu Penawaran = daftar rekanan (keputusan pemilik): satu saran per nama, PIC & kontak dari surat terakhirnya. */
export async function saranRekanan(): Promise<SaranRekanan[]> {
  const rows = await queryMany<{ rekanan: string; pic_kontak: string | null }>(sql`SELECT rekanan, pic_kontak FROM bba_penawaran ORDER BY tgl_surat DESC, id DESC LIMIT 2000`);
  return saranRekananDari(rows);
}

/**
 * Satu Simpan = surat + semua item, satu transaksi (§5A.1). Item lama yang dikirim balik (ber-id) diperbarui di tempat
 * supaya jejak `penawaran_item_id` di referensi rencana tetap menunjuk; yang tidak dikirim dihapus dan jejaknya dilepas.
 * Surat diubah dengan angka kunci (L77).
 */
export async function simpanPenawaran(input: PenawaranSimpanInput, userId: number): Promise<{ id: number; baru: boolean; item: number }> {
  return withTransaction(t => simpanPenawaranDi(t, input, userId));
}

type Transaksi = Parameters<Parameters<typeof withTransaction>[0]>[0];

/** Badan `simpanPenawaran` di transaksi pemanggil — impor Matriks menulis banyak surat dalam SATU transaksi. */
export async function simpanPenawaranDi({ tx, conn }: Transaksi, input: PenawaranSimpanInput, userId: number): Promise<{ id: number; baru: boolean; item: number }> {
  {
    const k = input.kepala;
    await pastikanBerkasBba(tx, [k.file_id]);
    const kat = await selesaikanKategori(tx, {
      kategori_id: k.kategori_id, jenis_kategori_id: k.jenis_kategori_id,
      kategori: k.kategori, jenis_kategori: k.jenis_kategori,
      kode_rekening: k.kode_rekening, kelompok_kib: k.kelompok_kib,
    });
    const kodeRek = k.kode_rekening !== undefined ? (k.kode_rekening?.trim() || null) : kat.kode_rekening;
    const rekanan = rapikanNamaRekanan(k.rekanan);
    let id = input.id ?? 0;
    if (id) {
      const ada = await tx`SELECT version, jenis_surat FROM bba_penawaran WHERE id = ${id} FOR UPDATE` as Array<{ version: number; jenis_surat: string | null }>;
      if (ada.length === 0) throw new BbaNotFoundError();
      if (Number(ada[0].version) !== input.expected_version) throw new BbaVersionConflictError();
      if (k.jenis_surat === undefined) {
        const sebab = syaratSurat(ada[0].jenis_surat, input.item);
        if (sebab) throw new BbaSyaratSuratError(sebab);
      }
      // L87: kolom Matriks yang tidak dikirim (tab lama, tinjauan Drive berbentuk lama) = jangan sentuh.
      let setMatriks = sql``;
      if (k.jenis_surat !== undefined) setMatriks = sql`${setMatriks}jenis_surat = ${k.jenis_surat || null}, `;
      if (k.pic_kontak !== undefined) setMatriks = sql`${setMatriks}pic_kontak = ${k.pic_kontak || null}, `;
      if (k.masa_berlaku_teks !== undefined) setMatriks = sql`${setMatriks}masa_berlaku_teks = ${k.masa_berlaku_teks || null}, `;
      if (k.status_tindak_lanjut !== undefined) setMatriks = sql`${setMatriks}status_tindak_lanjut = ${k.status_tindak_lanjut ?? null}, `;
      if (k.catatan !== undefined) setMatriks = sql`${setMatriks}catatan = ${k.catatan || null}, `;
      // L87: kategori/kode yang tidak dikirim (tab lama, tinjauan Drive) = jangan sentuh, bukan kosongkan.
      let setKat = sql``;
      if (kat.terisi) {
        setKat = sql`kategori_id = ${kat.kategori_id}, jenis_kategori_id = ${kat.jenis_kategori_id},
          kategori = ${kat.kategori || null}, jenis_kategori = ${kat.jenis_kategori || null}, kelompok_kib = ${kat.kelompok_kib || null}, `;
      }
      if (k.kode_rekening !== undefined || kat.terisi) setKat = sql`${setKat}kode_rekening = ${kodeRek}, `;
      await tx`
        UPDATE bba_penawaran SET rekanan = ${rekanan}, nomor_surat = ${k.nomor_surat || null}, tgl_surat = ${k.tgl_surat}, berlaku_sampai = ${k.berlaku_sampai || null},
          ${setKat}${setMatriks}file_id = ${k.file_id || null}, version = version + 1, updated_by = ${userId}
        WHERE id = ${id}
      `;
    } else {
      const res = await tx`
        INSERT INTO bba_penawaran (rekanan, pic_kontak, nomor_surat, tgl_surat, berlaku_sampai, masa_berlaku_teks, jenis_surat, kategori_id, jenis_kategori_id, kategori, jenis_kategori,
          kode_rekening, kelompok_kib, file_id, catatan, status_tindak_lanjut, created_by, updated_by)
        VALUES (${rekanan}, ${k.pic_kontak || null}, ${k.nomor_surat || null}, ${k.tgl_surat}, ${k.berlaku_sampai || null}, ${k.masa_berlaku_teks || null}, ${k.jenis_surat || null},
          ${kat.kategori_id}, ${kat.jenis_kategori_id}, ${kat.kategori || null}, ${kat.jenis_kategori || null}, ${kodeRek}, ${kat.kelompok_kib || null}, ${k.file_id || null},
          ${k.catatan || null}, ${k.status_tindak_lanjut ?? null}, ${userId}, ${userId})
      ` as unknown as Array<{ insertId: number }>;
      id = Number(res[0]?.insertId ?? 0);
    }
    // Barang tiap item: yang ada diperiksa (L68), yang baru dibuat/dipakai yang senama — di transaksi ini.
    const barang: Array<number | null> = [];
    for (const it of input.item) barang.push((await tentukanBarang(tx, {
      barang_id: it.barang_id, barang_baru: it.barang_baru, satuan: it.satuan,
      ...(kat.terisi ? {
        kategori_id: kat.kategori_id, jenis_kategori_id: kat.jenis_kategori_id,
        kategori: kat.kategori, jenis_kategori: kat.jenis_kategori,
        kode_rekening: kodeRek, kelompok_kib: kat.kelompok_kib, kategori_aset: kat.kategori_aset,
      } : {}),
    }, userId)) ?? null);
    const lama = new Set((await tx`SELECT id FROM bba_penawaran_item WHERE penawaran_id = ${id}` as Array<{ id: number }>).map(x => Number(x.id)));
    const dipertahankan = new Set(input.item.map(it => it.id).filter((x): x is number => !!x && lama.has(x)));
    const dibuang = [...lama].filter(x => !dipertahankan.has(x));
    if (dibuang.length) {
      await tx`UPDATE bba_referensi_harga SET penawaran_item_id = NULL WHERE penawaran_item_id IN (${dibuang})`;
      await tx`DELETE FROM bba_penawaran_item WHERE id IN (${dibuang})`;
    }
    const baru: unknown[][] = [];
    for (const [i, it] of input.item.entries()) {
      const harga = it.harga_satuan ?? null;
      if (it.id && dipertahankan.has(it.id)) {
        // L87 per item: merk/pajak/tautan/garansi yang tidak dikirim (Drive balik berbentuk lama) dipertahankan.
        let setBaru = sql``;
        if (it.merk !== undefined) setBaru = sql`${setBaru}, merk = ${it.merk || null}`;
        if (it.status_pajak !== undefined) setBaru = sql`${setBaru}, status_pajak = ${it.status_pajak ?? null}`;
        if (it.tautan !== undefined) setBaru = sql`${setBaru}, tautan = ${it.tautan || null}`;
        if (it.garansi !== undefined) setBaru = sql`${setBaru}, garansi = ${it.garansi || null}`;
        await tx`
          UPDATE bba_penawaran_item SET barang_id = ${barang[i]}, nama_barang = ${it.nama_barang}, merk_tipe = ${it.merk_tipe || null}, spesifikasi = ${it.spesifikasi || null},
            satuan = ${it.satuan || null}, harga_satuan = ${harga}, urutan = ${i + 1}${setBaru}
          WHERE id = ${it.id} AND penawaran_id = ${id}
        `;
      } else baru.push([id, barang[i], it.nama_barang, it.merk || null, it.merk_tipe || null, it.spesifikasi || null, it.satuan || null, harga,
        it.status_pajak ?? null, it.tautan || null, it.garansi || null, i + 1]);
    }
    await bulkInsert('bba_penawaran_item', ['penawaran_id', 'barang_id', 'nama_barang', 'merk', 'merk_tipe', 'spesifikasi', 'satuan', 'harga_satuan', 'status_pajak', 'tautan', 'garansi', 'urutan'], baru, conn);
    return { id, baru: !input.id, item: input.item.length };
  }
}

/** Kunci surat (rekanan + nomor + tanggal) yang sudah tercatat — impor Matriks tidak mencatat surat yang sama dua kali. */
export async function kunciSuratTercatat(q?: Penanya): Promise<Array<{ rekanan: string; nomor_surat: string | null; tgl_surat: string }>> {
  type Baris = { rekanan: string; nomor_surat: string | null; tgl_surat: string };
  if (!q) return queryMany<Baris>(sql`SELECT rekanan, nomor_surat, DATE_FORMAT(tgl_surat, '%Y-%m-%d') AS tgl_surat FROM bba_penawaran`);
  return await q`SELECT rekanan, nomor_surat, DATE_FORMAT(tgl_surat, '%Y-%m-%d') AS tgl_surat FROM bba_penawaran FOR UPDATE` as Baris[];
}

/** Status tindak lanjut dari menu ⋯ baris — satu kolom, dengan angka kunci surat (L77). */
export async function ubahStatusPenawaran(id: number, versi: number, status: StatusTindakLanjut | null, userId: number): Promise<{ rekanan: string }> {
  return withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT rekanan, version FROM bba_penawaran WHERE id = ${id} FOR UPDATE` as Array<{ rekanan: string; version: number }>;
    if (ada.length === 0) throw new BbaNotFoundError();
    if (Number(ada[0].version) !== versi) throw new BbaVersionConflictError();
    await tx`UPDATE bba_penawaran SET status_tindak_lanjut = ${status}, version = version + 1, updated_by = ${userId} WHERE id = ${id}`;
    return { rekanan: String(ada[0].rekanan) };
  });
}

/** Hapus surat boleh walau itemnya sudah dipakai — referensi rencana salinan; jejaknya dilepas di transaksi yang sama. */
export async function hapusPenawaran(id: number, versi: number): Promise<{ rekanan: string; item: number }> {
  return withTransaction(async ({ tx }) => {
    const ada = await tx`SELECT rekanan, version FROM bba_penawaran WHERE id = ${id} FOR UPDATE` as Array<{ rekanan: string; version: number }>;
    if (ada.length === 0) throw new BbaNotFoundError();
    if (Number(ada[0].version) !== versi) throw new BbaVersionConflictError();
    const items = (await tx`SELECT id FROM bba_penawaran_item WHERE penawaran_id = ${id}` as Array<{ id: number }>).map(x => Number(x.id));
    if (items.length) await tx`UPDATE bba_referensi_harga SET penawaran_item_id = NULL WHERE penawaran_item_id IN (${items})`;
    await tx`DELETE FROM bba_penawaran WHERE id = ${id}`;
    return { rekanan: String(ada[0].rekanan), item: items.length };
  });
}
