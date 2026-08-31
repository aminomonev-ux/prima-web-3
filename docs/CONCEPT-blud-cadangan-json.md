# CONCEPT — Cadangan JSON BLUD ke Google Drive

> Status: **rencana** (2026-08-31). Belum ada satu baris kode pun.
> Lahir dari pertanyaan pemilik aplikasi: *"di sistem BLUD saya sudah ada
> pencadangan? misal tiap save bisa export lalu upload ke Google Drive?"*

---

## 1. Keadaan sekarang — apa yang SUDAH ada

Dua lapis, dan dua-duanya sudah terpasang. Yang perlu ditambah lebih sedikit
daripada yang terlihat.

| Lapis | Isinya | Tempatnya | Keadaannya |
|---|---|---|---|
| Dump database | SELURUH aplikasi — pengguna, izin, realisasi, buku kas, audit | Drive, terenkripsi AES-256-GCM | Skripnya jalan, **jadwalnya belum ada** |
| Foto per-simpan | Baris DPA/Pergeseran tiap klik Simpan | `blud_riwayat_simpan`, retensi 50/jenis/tahun | Jalan, dipakai tombol Pulihkan |

`scripts/backup-db.js` terbukti sampai `UPLOAD-OK`, tapi catatan terakhir di
`scripts/backup-db.log` bertanggal **2 Juli 2026**. Ia pernah diuji manual lalu
tidak pernah dijadwalkan.

## 2. Yang sebenarnya kurang

Bukan "tidak ada pencadangan". Yang kurang tiga:

1. **Jadwal** untuk dump database.
2. Foto per-simpan **tidak pernah keluar dari server** — kalau servernya hilang,
   ia ikut hilang, dan ia juga dipangkas di angka 50.
3. **Kegagalan tidak terlihat.** Cadangan yang berhenti 2 bulan tanpa ada yang
   sadar adalah bentuk kegagalan yang paling berbahaya, karena orang merasa aman.

## 3. Keputusan bentuk

**JSON, bukan Excel.** Excel enak dibaca manusia tapi tidak bisa masuk kembali:
tidak ada jalur impor untuk Pergeseran, dan impor DPA sengaja dikunci jadi
pembaca berkas saja (L78). JSON yang disimpan `blud_riwayat_simpan` bentuknya
**persis payload POST** — jadi bisa dikirim balik tanpa penerjemahan, dan tidak
lahir arah pemetaan ketiga di `row-map.ts` yang harus dipelihara.

**Diunggah dari database, bukan dari jalur Simpan.** Menempelkan unggahan ke
tombol Simpan berarti satu panggilan ke Google yang lambat menahan kunci setahun
(`BLUD_VERSI_ENTITY`, L84) dan semua orang lain ikut antre. Fotonya sudah tersimpan
di DB; mengunggahnya belakangan tidak kehilangan apa pun.

**Memasukkan kembali berhenti di FORM.** Sama seperti Pulihkan, Impor, dan Salin
Versi (L78/L80): berkas dibaca, barisnya masuk ke tabel sebagai *belum tersimpan*,
yang menulis tetap tombol Simpan. Nol endpoint tulis baru berarti seluruh pagar
lama berlaku otomatis — pagu di bawah realisasi, jangkar `anggaran_key`,
pergeseran harus berimbang, kunci setahun, sakelar maintenance, izin per-menu.

---

## 4. Tahap pengerjaan

### Tahap 0 — Jadwalkan `backup-db.js` · NOL KODE

Yang paling menutup lubang dan tidak menyentuh repositori sama sekali. Langkahnya
sudah tertulis di `docs/BACKUP-RESTORE.md`: Task Scheduler harian (Windows) atau
`crontab` (Linux), jalan sebagai user yang sama dengan PM2.

**Wajib didahulukan.** Tahap 1–3 di bawah tidak menggantikannya: JSON BLUD tidak
memulihkan pengguna, izin, realisasi, buku kas, maupun audit.

DoD: satu baris `UPLOAD-OK` baru di `scripts/backup-db.log` yang bukan hasil
jalan manual.

### Tahap 1 — Unggah foto per-simpan ke Drive

Folder tujuan berbeda dari folder dump database: `GOOGLE_DRIVE_FOLDER_ID_BLUD_JSON`.

**Kolom baru** `blud_riwayat_simpan.drive_file_id VARCHAR(64) NULL` — cermin
`lkjip_versi.drive_file_id` yang sudah ada. Gunanya dua: menjawab "mana yang belum
diunggah" dengan `WHERE drive_file_id IS NULL` (tanpa perlu melisting Drive tiap
jalan), dan mencatat ke mana tiap foto pergi. Satu migrasi, satu kolom.

**Logikanya di lib, bukan di route** — `lib/blud/cadangan-json.ts`. Ia dipanggil
DUA pemicu (cron dan tombol), dan dua salinan logika yang sama adalah cara L78
lahir.

Nama berkas membawa identitas lengkap, kalau tidak setahun kemudian tidak ada yang
tahu berkas mana milik apa:

```
blud-pergeseran-2026-2026-02-28-ke1-20260829T164727.json
```

Retensi di Drive **tidak** mengikuti angka 50 milik database — justru itu gunanya
menyimpan di luar. Awalnya tanpa penghapusan otomatis.

**Enkripsi: keputusan pemilik aplikasi.** Dump database dienkripsi karena memuat
hash sandi, sesi, dan audit. JSON BLUD isinya baris anggaran. Usul: **polos**, di
folder Drive privat — supaya bisa dibuka dan dibaca tanpa prosedur. Kalau
diputuskan harus terenkripsi, helper AES di `scripts/backup-db.js` dipakai ulang,
dan konsekuensinya tombol Tahap 3 harus bisa mendekripsi juga.

### Tahap 2 — Pemicu: cron DAN tombol

**Cron** — `app/api/cron/blud-cadangan-json/route.ts`, dijaga `verifyCronSecret`
seperti tiga route cron yang sudah ada. Dipanggil penjadwal OS; MySQL EVENT tidak
bisa dipakai karena ia hidup di dalam database dan tidak menjangkau internet.

**Tombol** — bagian "Cadangan" baru di layar BLUD → Pengaturan:

- `Cadangkan sekarang` (`PrimaButton variant="success"`)
- `Terakhir berhasil: 31 Agu 2026 01.00 · 12 berkas` ← **ini bagian terpenting**

Penanda "terakhir berhasil" itu bukan hiasan. Tanpa itu Tahap 1 mengulang
penyakit yang sedang diobati: berhenti diam-diam, tidak ada yang tahu. Ia dibaca
dari `MAX(...)` kolom penanda, bukan dari angka yang ditulis terpisah.

Izinnya mengikuti aturan yang sama dengan Hapus Versi di layar itu. Wajib ikut:
`bludRateLimit`, baris audit (`BLUD_CADANGAN_JSON`), dan **pendaftaran di gate
sakelar maintenance** — `npm run check:killswitch` memeriksa daftar route secara
statis, jadi route baru yang tidak didaftarkan akan menjatuhkan CI (L72).

Kegagalan unggah dicatat, **tidak** melempar: satu berkas gagal tidak boleh
membatalkan sisanya.

### Tahap 3 — "Muat dari berkas" di layar DPA & Pergeseran

Tombol BARU (belum ada). Pintu masuk kedua ke mesin yang sudah terbukti dipakai
tombol Pulihkan — bedanya cuma sumbernya:

| | Pulihkan (sudah ada) | Muat dari berkas (baru) |
|---|---|---|
| Sumber JSON | `blud_riwayat_simpan` | berkas di komputer pemakai |
| Hasil | tabel terisi, belum tersimpan | sama persis |
| Yang menulis | tombol Simpan | tombol Simpan |

Gunanya justru saat Pulihkan tidak bisa menolong: fotonya kena rotasi 50, atau
databasenya sendiri yang hilang.

Pagar yang tidak bisa ditawar:

- **Berkas dari luar itu masukan tak tepercaya.** Divalidasi Zod seperti body POST,
  dibatasi jumlah barisnya.
- **Ditolak kalau `tahun_anggaran` tidak cocok** dengan tahun di layar — kalau
  tidak, baris 2026 beserta jangkarnya masuk ke 2027.
- Karena ia **mengganti seluruh tabel**, tunduk `alasanKunciBorongan` — mati
  selama versi tersimpan sedang terbuka, dengan alasan tertulis di tooltip (L79c).
- Dipasang di **dua** layar, DPA dan Pergeseran (L69).

Yang TIDAK ikut: tanggal versi dan angka kunci. Keduanya memang tidak ada di
dalam foto, dan itu disengaja — angka kunci wajib diambil segar dari server (L77).
Jadi sasaran simpannya tetap dipilih lewat pemilih periode seperti biasa.

---

## 5. Yang sengaja TIDAK dikerjakan

- **Aplikasi mengunduh sendiri dari Drive.** Endpoint baru, permukaan izin baru,
  dan Drive jadi jalur masukan tepercaya — untuk tindakan sejarang pemulihan,
  mengunduh manual dari Drive cuma satu klik.
- **Ekspor Excel tiap simpan.** Tidak bisa masuk kembali, jadi ia arsip baca saja,
  sementara JSON sudah memberi itu plus jalan pulang.
- **Tombol dump database penuh dari layar.** Itu memaksa server web menjalankan
  `mysqldump` sebagai proses anak di dalam satu permintaan HTTP yang panjang, dan
  menambah ketergantungan pada PATH server. Pekerjaan ops, bukan pekerjaan UI —
  dan skripnya sudah ada.
- **Menempelkan unggahan ke tombol Simpan.** Alasannya di §3.

## 6. Definition of Done

| Tahap | Selesai kalau |
|---|---|
| 0 | `backup-db.log` punya `UPLOAD-OK` dari jalan terjadwal, bukan manual |
| 1 | Foto yang belum berkas naik ke Drive, `drive_file_id` terisi, dijalankan sungguhan bukan disimulasikan |
| 2 | Cron dan tombol memakai fungsi lib yang sama · "terakhir berhasil" tampil · gate `check:killswitch` hijau · baris audit ada |
| 3 | Berkas dari Drive dimuat ke layar di kedua modul · berkas tahun lain DITOLAK · uji mutasi membuktikan pemeriksaannya menggigit |

Regresi: satu berkas uji baru (`scripts/test-blud-cadangan-json.mts`) untuk Tahap
1–3, dengan uji mutasi seperti suite BLUD yang lain.
