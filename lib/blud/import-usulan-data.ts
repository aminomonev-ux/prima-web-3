// lib/blud/import-usulan-data.ts
// Sumber data modal "Import dari Usulan" di Form DPA BLUD.
// Ref: docs/session/blud/CONCEPT-import-usulan-dpa.md §6 — seleksi item mirror
// pola BBA (lib/data/buku-besar-aset.ts::candidateQuery), tapi:
//   - HANYA status DISETUJUI (final Kabag) — DITOLAK tidak relevan untuk DPA
//   - SEMUA jenis belanja (bukan cuma Belanja Modal)
//   - + imported_in: daftar versi DPA yang sudah menarik item ini (badge anti-dobel)

import { sql, queryMany } from '@/lib/data/db'

export interface DpaImportCandidate {
  usulan_item_id: number
  usulan_no:      string
  sub_bidang:     string
  pengusul:       string
  jenis_belanja:  string
  tahun:          string
  uraian:         string
  vol:            number
  satuan:         string
  harga:          number
  jumlah:         number
  /** Versi DPA (yyyy-mm-dd) yang sudah berisi item ini — basis badge "sudah diimport". */
  imported_in:    string[]
}

export async function listDpaImportCandidates(): Promise<DpaImportCandidate[]> {
  const rows = await queryMany<Record<string, unknown>>(sql`
    SELECT ui.id AS usulan_item_id, ui.no_usulan, ui.sub_bidang, ui.pengusul,
           ui.jenis_belanja, uh.tahun_anggaran,
           ui.nama_barang, ui.spesifikasi, ui.satuan,
           COALESCE(ui.kasubag_qty,   ui.admin_qty,   ui.qty)       AS vol_final,
           COALESCE(ui.kasubag_harga, ui.admin_harga, ui.harga_est) AS harga_final,
           ui.nominal_disetujui,
           (SELECT GROUP_CONCAT(DISTINCT d.versi_tanggal ORDER BY d.versi_tanggal DESC)
            FROM dpa_blud d WHERE d.usulan_item_id = ui.id) AS imported_in
    FROM usulan_items ui
    JOIN usulan_headers uh ON uh.id = ui.usulan_id
    WHERE ui.status = 'DISETUJUI'
    ORDER BY ui.jenis_belanja ASC, ui.no_usulan ASC, ui.no_item ASC
    LIMIT 2000
  `)
  return rows.map(r => {
    const vol   = Number(r.vol_final ?? 0)
    const harga = Number(r.harga_final ?? 0)
    const spesifikasi = r.spesifikasi ? String(r.spesifikasi).trim() : ''
    const importedRaw = r.imported_in != null ? String(r.imported_in) : ''
    return {
      usulan_item_id: Number(r.usulan_item_id),
      usulan_no:      String(r.no_usulan ?? ''),
      sub_bidang:     String(r.sub_bidang ?? ''),
      pengusul:       String(r.pengusul ?? ''),
      jenis_belanja:  String(r.jenis_belanja ?? 'Lainnya'),
      tahun:          String(r.tahun_anggaran ?? ''),
      uraian:         spesifikasi ? `${String(r.nama_barang ?? '')} — ${spesifikasi}` : String(r.nama_barang ?? ''),
      vol,
      satuan:         String(r.satuan ?? 'unit'),
      harga,
      jumlah:         Number(r.nominal_disetujui ?? 0) || vol * harga,
      // GROUP_CONCAT DATE → "2026-06-10,2026-05-01"; slice(0,10) buang time kalau driver kasih datetime
      imported_in:    importedRaw ? importedRaw.split(',').map(s => s.trim().slice(0, 10)) : [],
    }
  })
}
