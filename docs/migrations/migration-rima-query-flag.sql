-- migration-rima-query-flag.sql — kill-switch fitur Q&A data-aware Rima (CONCEPT v3 §18 G30).
-- FAIL-CLOSED: endpoint /api/rima/query menolak (503) bila flag != 'online' atau hilang.
-- Set 'maintenance' untuk mematikan baca-data tanpa mematikan chat/tur Rima yang aman.
INSERT IGNORE INTO app_config (`key`, value) VALUES ('app_status_rima_query', 'online');
