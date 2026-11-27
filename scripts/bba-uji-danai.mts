// Penolong uji BBA: syarat "boleh didanai" (barang, jenis, ≥ 1 referensi berharga — lib/bba/tahap.ts `semuaKurang`)
// untuk rencana uji yang dibuat seadanya. Hanya yang KOSONG yang diisi: barang/jenis/referensi yang sengaja dipasang
// suite tidak tertimpa. Referensinya harga saja (tanpa tautan/berkas), jadi tidak mengubah hitungan "Ref n/3".
import type mysql from 'mysql2/promise'

export async function lengkapiUntukDanai(k: mysql.Connection, id: number, namaBarang: string): Promise<void> {
  await k.query('INSERT IGNORE INTO bba_barang (nama) VALUES (?)', [namaBarang])
  const [b] = await k.query('SELECT id FROM bba_barang WHERE nama = ?', [namaBarang]) as [Array<{ id: number }>, unknown]
  await k.query("UPDATE buku_besar_aset SET barang_id = COALESCE(barang_id, ?), jenis_rencana = COALESCE(jenis_rencana, 'PENAMBAHAN') WHERE id = ?", [b[0].id, id])
  await k.query(`INSERT INTO bba_referensi_harga (aset_id, urutan, sumber, harga) SELECT ?, 99, 'LAINNYA', 1 FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM bba_referensi_harga WHERE aset_id = ? AND harga > 0)`, [id, id])
}

/** Dipanggil SESUDAH rencana uji dihapus (FK barang RESTRICT). */
export async function buangBarangDanai(k: mysql.Connection, namaBarang: string): Promise<void> {
  await k.query(`DELETE g FROM bba_barang g WHERE g.nama = ? AND NOT EXISTS (SELECT 1 FROM buku_besar_aset b WHERE b.barang_id = g.id)
    AND NOT EXISTS (SELECT 1 FROM bba_aset a WHERE a.barang_id = g.id)`, [namaBarang])
}
