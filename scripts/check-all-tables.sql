-- Cek semua tabel penting PRIMA di prima_db_3 (referensi: schema-mysql.sql, 52 tabel)
-- status: ADA = tabel ada di DB | >> HILANG << = migrasi CREATE belum dijalankan.
SELECT e.tabel,
       CASE WHEN t.TABLE_NAME IS NULL THEN '>> HILANG <<' ELSE 'ADA' END AS status
FROM (
  SELECT 'app_config' AS tabel
  UNION ALL
  SELECT 'audit_log' AS tabel
  UNION ALL
  SELECT 'bba_kategori_aset' AS tabel
  UNION ALL
  SELECT 'blud_gu_periode' AS tabel
  UNION ALL
  SELECT 'blud_locks' AS tabel
  UNION ALL
  SELECT 'blud_pejabat' AS tabel
  UNION ALL
  SELECT 'blud_periode' AS tabel
  UNION ALL
  SELECT 'blud_permintaan' AS tabel
  UNION ALL
  SELECT 'blud_realisasi_alokasi' AS tabel
  UNION ALL
  SELECT 'blud_realisasi_tx' AS tabel
  UNION ALL
  SELECT 'buku_besar_aset' AS tabel
  UNION ALL
  SELECT 'dpa_blud' AS tabel
  UNION ALL
  SELECT 'email_log' AS tabel
  UNION ALL
  SELECT 'iki_dokumen' AS tabel
  UNION ALL
  SELECT 'iki_rhk' AS tabel
  UNION ALL
  SELECT 'iki_rhk_triwulan' AS tabel
  UNION ALL
  SELECT 'iki_versi' AS tabel
  UNION ALL
  SELECT 'kinerja_master' AS tabel
  UNION ALL
  SELECT 'kinerja_pendapatan_crr' AS tabel
  UNION ALL
  SELECT 'kinerja_pendapatan_real' AS tabel
  UNION ALL
  SELECT 'kinerja_realisasi' AS tabel
  UNION ALL
  SELECT 'kinerja_realisasi_map' AS tabel
  UNION ALL
  SELECT 'kinerja_realisasi_nomen' AS tabel
  UNION ALL
  SELECT 'kinerja_rekening' AS tabel
  UNION ALL
  SELECT 'kinerja_ssk' AS tabel
  UNION ALL
  SELECT 'kode_besar' AS tabel
  UNION ALL
  SELECT 'lkjip_block' AS tabel
  UNION ALL
  SELECT 'lkjip_dokumen' AS tabel
  UNION ALL
  SELECT 'lkjip_section' AS tabel
  UNION ALL
  SELECT 'lkjip_versi' AS tabel
  UNION ALL
  SELECT 'master_akun' AS tabel
  UNION ALL
  SELECT 'notifications' AS tabel
  UNION ALL
  SELECT 'penanggung_jawab' AS tabel
  UNION ALL
  SELECT 'pergeseran_dpa' AS tabel
  UNION ALL
  SELECT 'pk_dokumen' AS tabel
  UNION ALL
  SELECT 'pk_dokumen_anggaran' AS tabel
  UNION ALL
  SELECT 'pk_dokumen_lampiran' AS tabel
  UNION ALL
  SELECT 'pk_pejabat' AS tabel
  UNION ALL
  SELECT 'pk_program' AS tabel
  UNION ALL
  SELECT 'pk_sasaran' AS tabel
  UNION ALL
  SELECT 'pk_unit_kerja' AS tabel
  UNION ALL
  SELECT 'pk_unit_kerja_blud_pj' AS tabel
  UNION ALL
  SELECT 'rekap_pk' AS tabel
  UNION ALL
  SELECT 'rencana_aksi' AS tabel
  UNION ALL
  SELECT 'rima_unanswered' AS tabel
  UNION ALL
  SELECT 'role_promotion_requests' AS tabel
  UNION ALL
  SELECT 'system_settings' AS tabel
  UNION ALL
  SELECT 'uploaded_files' AS tabel
  UNION ALL
  SELECT 'user_sessions' AS tabel
  UNION ALL
  SELECT 'users' AS tabel
  UNION ALL
  SELECT 'usulan_headers' AS tabel
  UNION ALL
  SELECT 'usulan_items' AS tabel
) e
LEFT JOIN information_schema.TABLES t
  ON t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = e.tabel
ORDER BY status DESC, e.tabel;
