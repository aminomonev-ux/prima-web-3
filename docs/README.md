# Isi folder `docs/`

| Folder / berkas | Isi | Catatan |
|---|---|---|
| [`panduan/PANDUAN-instalasi-prima.md`](panduan/PANDUAN-instalasi-prima.md) | memasang PRIMA dari server kosong sampai backup harian, restore, memutakhirkan versi, serah terima | **mulai dari sini** untuk urusan server |
| `konsep/<modul>/CONCEPT-*.md` | catatan keputusan tiap fitur: masalahnya, pilihan yang ditimbang, yang dipilih & kenapa, cara mengujinya | dirujuk `CLAUDE.md` & komentar kode. Konsep yang berbunyi "TIDAK DIKERJAKAN" sengaja disimpan — alasannya mencegah usulan yang sama diulang |
| `konsep/blud/` · `kinerja/` · `renaksi/` · `lkjip/` · `pk/` · `iki/` · `bba/` · `usulan/` · `rima/` | konsep per modul | E-Anggaran = `kinerja/` |
| `konsep/sistem/` | lintas modul: hak akses & Pusat Akses, pemeliharaan, Google Drive terpusat, Defender, edisi intranet | |
| `schema-mysql.sql` | skema MySQL lengkap & terkini | acuan tunggal; dibaca `check-schema`, uji, dan CI |
| `migrations/` | perubahan skema untuk database yang **sudah berisi data** | pemasangan baru tidak menjalankannya |
| `design/` | `DESIGN-SYSTEM.md` + `token-baseline.json` | dibaca gerbang CI E |
| `registry-akses-baseline.json` | potret matriks akses | dibaca `scripts/test-registry-akses.mts` |
| `session/sentinel/` | data & persona RIMA (`GOLDEN-QUESTIONS.md`, `PERSONA.md`, alur modul) | dibaca skrip `rima-*` — **jangan dipindah** |

Hanya ada di komputer lokal (diabaikan git, repo ini publik):

| Folder | Isi |
|---|---|
| `audit/` | laporan audit keamanan & `AUDIT-LESSONS-LEARNED.md` |
| `referensi/` | contoh berkas berisi data nyata (Excel BKU, master BBA, alur BBA) |
| `konsep-sistem/` | dokumen konsep sistem (Word/PDF) |

Konsep baru ditulis langsung di `konsep/<modul>/`.
