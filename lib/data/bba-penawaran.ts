// ═══ PRIMA — BBA Penawaran Rekanan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A) — Data Layer ═══
// Gudang penawaran harga dari rekanan. Rencana MENYALIN yang dipakainya ke bba_referensi_harga (`penawaran_item_id`
// hanya jejak), jadi surat boleh disunting/dihapus tanpa mengubah catatan sejarah rencana.
import { sql, queryMany, withTransaction, bulkInsert, escapeLike } from '@/lib/data/db';
import type { ItemPenawaran } from '@/lib/bba/penawaran';
import { normalisasiKategoriItem } from '@/lib/bba/kategori';
import { pastikanBerkasBba, tentukanBarang, selesaikanKategori, BbaVersionConflictError, BbaNotFoundError } from '@/lib/data/buku-besar-aset';
import type { PenawaranSimpanInput } from './bba-penawaran-schemas';

export interface SuratPenawaran {
  id: number; rekanan: string; nomor_surat: string | null; tgl_surat: string; berlaku_sampai: string | null;
  kategori_id: number | null; jenis_kategori_id: number | null; kategori: string | null; jenis_kategori: string | null;
  kode_rekening: string | null; kelompok_kib: string | null;
  file_id: string | null; catatan: string | null; version: number; oleh: string | null;
  item: Array<ItemPenawaran & { dipakai: number }>;
}

const KOLOM_ITEM = sql`
  i.id, i.penawaran_id, w.rekanan, w.nomor_surat, DATE_FORMAT(w.tgl_surat, '%Y-%m-%d') AS tgl_surat,
  DATE_FORMAT(w.berlaku_sampai, '%Y-%m-%d') AS berlaku_sampai, w.kategori, w.jenis_kategori, w.kode_rekening, w.file_id,
  i.barang_id, g.nama AS barang_nama, i.nama_barang, i.merk_tipe, i.spesifikasi, i.satuan, i.harga_satuan
`;
const DARI_ITEM = sql`FROM bba_penawaran_item i JOIN bba_penawaran w ON w.id = i.penawaran_id LEFT JOIN bba_barang g ON g.id = i.barang_id`;

const petakanItem = (r: Record<string, unknown>): ItemPenawaran => ({
  id: Number(r.id), penawaran_id: Number(r.penawaran_id), rekanan: String(r.rekanan ?? ''), nomor_surat: (r.nomor_surat as string | null) ?? null,
  tgl_surat: (r.tgl_surat as string | null) ?? '', berlaku_sampai: (r.berlaku_sampai as string | null) ?? null, file_id: (r.file_id as string | null) ?? null, // tanggal: DATE_FORMAT di SQL
  barang_id: r.barang_id == null ? null : Number(r.barang_id), barang_nama: (r.barang_nama as string | null) ?? null,
  nama_barang: String(r.nama_barang ?? ''), merk_tipe: (r.merk_tipe as string | null) ?? null, spesifikasi: (r.spesifikasi as string | null) ?? null,
  satuan: (r.satuan as string | null) ?? null, harga_satuan: Number(r.harga_satuan ?? 0),
  kategori: (r.kategori as string | null) ?? null, jenis_kategori: (r.jenis_kategori as string | null) ?? null, kode_rekening: (r.kode_rekening as string | null) ?? null,
});

/** Daftar surat + itemnya; `q` mencocokkan rekanan, nomor surat, kode rekening, kategori, atau nama barang. */
export async function listPenawaran(q?: string, filter?: { kategori?: string; jenis_kategori?: string }): Promise<SuratPenawaran[]> {
  const term = q?.trim() ? `%${escapeLike(q.trim())}%` : null;
  let where = sql`WHERE 1=1`;
  if (term) {
    where = sql`${where} AND (w.rekanan LIKE ${term} OR w.nomor_surat LIKE ${term} OR w.kode_rekening LIKE ${term} OR w.kategori LIKE ${term} OR w.jenis_kategori LIKE ${term} OR EXISTS (SELECT 1 FROM bba_penawaran_item x WHERE x.penawaran_id = w.id AND x.nama_barang LIKE ${term}))`;
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
           w.file_id, w.catatan, w.version, u.username AS oleh
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
      catatan: (s.catatan as string | null) ?? null, version: Number(s.version ?? 0), oleh: (s.oleh as string | null) ?? null, item: per.get(Number(s.id)) ?? [],
    };
  });
}

/** Semua item (Bandingkan) atau item satu barang (Ambil dari penawaran di modal rencana). */
export async function itemPenawaran(barangId?: number): Promise<ItemPenawaran[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`SELECT ${KOLOM_ITEM} ${DARI_ITEM} ${barangId ? sql`WHERE i.barang_id = ${barangId}` : sql``} ORDER BY w.tgl_surat DESC, i.id DESC`);
  return rows.map(petakanItem);
}

export async function saranRekanan(): Promise<string[]> {
  const rows = await queryMany<{ rekanan: string }>(sql`SELECT DISTINCT rekanan FROM bba_penawaran ORDER BY rekanan LIMIT 500`);
  return rows.map(r => r.rekanan);
}

/**
 * Satu Simpan = surat + semua item, satu transaksi (§5A.1). Item lama yang dikirim balik (ber-id) diperbarui di tempat
 * supaya jejak `penawaran_item_id` di referensi rencana tetap menunjuk; yang tidak dikirim dihapus dan jejaknya dilepas.
 * Surat diubah dengan angka kunci (L77).
 */
export async function simpanPenawaran(input: PenawaranSimpanInput, userId: number): Promise<{ id: number; baru: boolean; item: number }> {
  return withTransaction(async ({ tx, conn }) => {
    const k = input.kepala;
    await pastikanBerkasBba(tx, [k.file_id]);
    const kat = await selesaikanKategori(tx, {
      kategori_id: k.kategori_id, jenis_kategori_id: k.jenis_kategori_id,
      kategori: k.kategori, jenis_kategori: k.jenis_kategori,
      kode_rekening: k.kode_rekening, kelompok_kib: k.kelompok_kib,
    });
    const kodeRek = k.kode_rekening !== undefined ? (k.kode_rekening?.trim() || null) : kat.kode_rekening;
    let id = input.id ?? 0;
    if (id) {
      const ada = await tx`SELECT version FROM bba_penawaran WHERE id = ${id} FOR UPDATE` as Array<{ version: number }>;
      if (ada.length === 0) throw new BbaNotFoundError();
      if (Number(ada[0].version) !== input.expected_version) throw new BbaVersionConflictError();
      // L87: kategori/kode yang tidak dikirim (tab lama, tinjauan Drive) = jangan sentuh, bukan kosongkan.
      let setKat = sql``;
      if (kat.terisi) {
        setKat = sql`kategori_id = ${kat.kategori_id}, jenis_kategori_id = ${kat.jenis_kategori_id},
          kategori = ${kat.kategori || null}, jenis_kategori = ${kat.jenis_kategori || null}, kelompok_kib = ${kat.kelompok_kib || null}, `;
      }
      if (k.kode_rekening !== undefined || kat.terisi) setKat = sql`${setKat}kode_rekening = ${kodeRek}, `;
      await tx`
        UPDATE bba_penawaran SET rekanan = ${k.rekanan}, nomor_surat = ${k.nomor_surat || null}, tgl_surat = ${k.tgl_surat}, berlaku_sampai = ${k.berlaku_sampai || null},
          ${setKat}file_id = ${k.file_id || null}, catatan = ${k.catatan || null}, version = version + 1, updated_by = ${userId}
        WHERE id = ${id}
      `;
    } else {
      const res = await tx`
        INSERT INTO bba_penawaran (rekanan, nomor_surat, tgl_surat, berlaku_sampai, kategori_id, jenis_kategori_id, kategori, jenis_kategori, kode_rekening, kelompok_kib, file_id, catatan, created_by, updated_by)
        VALUES (${k.rekanan}, ${k.nomor_surat || null}, ${k.tgl_surat}, ${k.berlaku_sampai || null}, ${kat.kategori_id}, ${kat.jenis_kategori_id}, ${kat.kategori || null}, ${kat.jenis_kategori || null}, ${kodeRek}, ${kat.kelompok_kib || null}, ${k.file_id || null}, ${k.catatan || null}, ${userId}, ${userId})
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
      const nilai = [barang[i], it.nama_barang, it.merk_tipe || null, it.spesifikasi || null, it.satuan || null, it.harga_satuan, i + 1];
      if (it.id && dipertahankan.has(it.id)) {
        await tx`
          UPDATE bba_penawaran_item SET barang_id = ${nilai[0]}, nama_barang = ${it.nama_barang}, merk_tipe = ${nilai[2]}, spesifikasi = ${nilai[3]},
            satuan = ${nilai[4]}, harga_satuan = ${it.harga_satuan}, urutan = ${i + 1}
          WHERE id = ${it.id} AND penawaran_id = ${id}
        `;
      } else baru.push([id, ...nilai]);
    }
    await bulkInsert('bba_penawaran_item', ['penawaran_id', 'barang_id', 'nama_barang', 'merk_tipe', 'spesifikasi', 'satuan', 'harga_satuan', 'urutan'], baru, conn);
    return { id, baru: !input.id, item: input.item.length };
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
