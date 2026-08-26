# CONCEPT — Riwayat Simpan per Jam (BLUD: DPA & Pergeseran)

> Status: **usulan** (2026-08-26). Belum dikerjakan.
> Lahir dari kejadian nyata: versi DPA 2026 & 2027 terhapus karena layar Pengaturan
> menampilkan tanggal simpan sebagai identitas utama. Revamp layar itu dibahas
> terpisah; dokumen ini soal yang kedua — riwayat simpan yang lebih rinci.

---

## 1. Yang diminta

Dua kali Simpan pada **tanggal yang sama tapi jam berbeda** harus **dua-duanya
tersimpan**, untuk DPA maupun Pergeseran, dan bisa **dipulihkan lewat alur yang
sudah ada**.

Hari ini yang terjadi sebaliknya: Simpan itu hapus-lalu-tulis-ulang untuk
`(tahun, versi_tanggal)` yang sama ([data.ts:578](../lib/blud/data.ts:578)). Simpan
jam 16:40 **menghapus** hasil simpan jam 09:15 tanpa sisa. Yang tercatat cuma
peristiwanya di `audit_log` (`BLUD_SAVE_DPA` — siapa, jam berapa, berapa baris),
bukan isinya.

## 2. Keputusan pokok — jam hidup di lapisan riwayat, bukan di identitas versi

`versi_tanggal` **tetap DATE**. Jam disimpan di tabel baru yang tidak dirujuk
siapa pun.

Ini keputusan yang paling menentukan bentuk seluruh fitur, jadi alasannya ditulis
lengkap:

| Kalau `versi_tanggal` diubah jadi DATETIME | Akibatnya |
|---|---|
| Kolomnya dipakai 298 kali di 38 berkas, dan tidak semuanya BLUD — `lib/data/pk.ts`, `app/api/perjanjian-kinerja/blud-nominal`, `lib/data/dashboard.ts`, `lib/rima/blud-provider.ts`, plus `buku_besar_aset.dpa_versi_tanggal` | Semua harus berubah serentak. Yang berbahaya bukan yang error — perbandingan `'2026-08-26' === versi` tetap lolos `tsc`, tetap jalan, tapi tidak pernah cocok lagi. Itu keluarga bug yang sama dengan **L75** |
| `pergeseran_dpa.dpa_versi_tanggal`, `rekap_pk.versi_dpa`, `buku_besar_aset.dpa_versi_tanggal` menunjuk versi DPA | Ketiganya dipaksa menjawab "menunjuk jam berapa?" — pertanyaan yang tidak punya jawaban benar untuk dokumen yang sudah terbit |
| Pagar `VERSI_DIRUJUK` mencocokkan `dpa_versi_tanggal = versiTanggal` ([data.ts:608](../lib/blud/data.ts:608)) | Pencocokan jadi per-detik: DPA jam 09:15 tidak lagi terlindungi oleh pergeseran yang menunjuk 16:40 di hari yang sama. **Lebih banyak versi jadi bisa dihapus** — arah yang berlawanan dengan kejadian kemarin |
| Kata "versi" berubah makna | Berhenti berarti *keputusan anggaran* (DPA Murni, DPA Perubahan), mulai berarti *setiap kali saya menekan Simpan*. Rekap PJ yang sudah dicetak akan menunjuk `26 Agu 14:32`, dan enam bulan lagi tidak ada yang bisa menjelaskan kenapa jam itu yang dipilih |

Dengan riwayat di lapisan terpisah, pertanyaan "menunjuk jam berapa" **tidak pernah
muncul**: pergeseran, Rekap PJ, dan BBA tetap menunjuk tanggal seperti sekarang.

## 3. Keputusan kedua — pulihkan berhenti di form, bukan di database

Memulihkan snapshot = **mengisi form di layar**. Tidak ada satu baris pun masuk
database sampai manusia menekan Simpan.

Ini bukan kehati-hatian kosong, dan bukan pula jalur baru — **alur ini sudah ada
sekarang, cuma tidak bernama**: buka versi lama dari dropdown → isinya masuk form →
Simpan → jadi versi hari ini. Snapshot cuma menambah pilihan yang lebih rinci di
titik yang sama.

| Akibat | Kenapa penting |
|---|---|
| Nol jalur tulis baru | Simpan-nya `simpan()` yang sudah ada, jadi gembok optimistik, `pagarSimpanVersi`, `periksaJangkar`, `SAFE_DROP_THRESHOLD`, dan Sentinel **berlaku otomatis**. Tidak ada pagar yang perlu ditulis ulang — dan tidak ada yang bisa lupa dipasang |
| Tidak ada lubang kunci ganda | Kalau pulihkan jadi endpoint tulis sendiri, dua klik beruntun menulis dua kali: `assertBludVersion` melakukan `FOR UPDATE` pada baris `blud_locks` yang belum ada, dan itu tidak mengunci apa pun (**L69-a**) |
| Sentinel memeriksa lebih dulu | Konflik PJ segaris & baris tak lengkap dari snapshot lama muncul sebagai spanduk **sebelum** Simpan |

Pola yang sama persis dengan `SalinTahunModal` ([CONCEPT-blud-salin-tahun.md](CONCEPT-blud-salin-tahun.md) §2).

**Pulihkan bukan batal-hapus.** Snapshot dimuat lalu disimpan sebagai versi
**hari ini**, bukan menghidupkan kembali tanggal lamanya. Pergeseran yang dulu
menunjuk tanggal yang sudah dihapus tetap yatim. Ini harus terbaca jelas di layar
supaya tidak ada yang mengharapkan keajaiban.

## 4. Tabel baru

`docs/migrations/migration-blud-riwayat-simpan.sql`

```sql
CREATE TABLE IF NOT EXISTS blud_riwayat_simpan (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  jenis             ENUM('DPA','PERGESERAN') NOT NULL,
  tahun_anggaran    SMALLINT UNSIGNED NOT NULL,
  versi_tanggal     DATE          NOT NULL COMMENT 'Versi yang ditulis simpanan ini',
  disimpan_pada     DATETIME      NOT NULL COMMENT 'Jam-menit WIB, distempel server',
  versi_ke          INT UNSIGNED  NOT NULL COMMENT 'Angka kunci setelah simpan = simpan ke-n hari itu',
  jumlah_baris      INT UNSIGNED  NOT NULL DEFAULT 0,
  total_nilai       DECIMAL(18,2) NOT NULL DEFAULT 0,
  dpa_versi_tanggal DATE              NULL COMMENT 'Acuan DPA — hanya untuk jenis PERGESERAN',
  isi               JSON          NOT NULL COMMENT 'Array baris, bentuknya sama dgn payload POST',
  disimpan_oleh     INT               NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_brs_versi   (jenis, tahun_anggaran, versi_tanggal, disimpan_pada),
  INDEX idx_brs_retensi (jenis, tahun_anggaran, id),
  CONSTRAINT fk_brs_user FOREIGN KEY (disimpan_oleh) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Riwayat tiap klik Simpan DPA/Pergeseran — snapshot, tidak dirujuk siapa pun';
```

**Satu tabel dengan kolom `jenis`, bukan dua tabel kembar.** Menambah jenis
ketiga nanti = satu nilai enum + satu pemanggilan, bukan migrasi baru.

**`isi` disimpan sebagai payload POST, bukan baris hasil SELECT.** Yang dipulihkan
harus bisa langsung dikirim balik ke endpoint simpan tanpa penerjemahan — kalau
bentuknya beda, `lib/blud/row-map.ts` jadi punya arah ketiga yang harus dipelihara,
dan kolom yang lupa didaftar terbuang senyap (persis jebakan yang sudah dicatat
untuk `PERGESERAN_COLUMNS`).

**`disimpan_pada` DATETIME, bukan TIMESTAMP.** TIMESTAMP dikonversi menurut zona
sesi; seluruh skema ini sudah memakai DATETIME.

### Jam WIB, bukan jam server

`versi_tanggal` datang dari klien lewat `tanggalHariIniWIB()` — helper yang ada
justru karena `toISOString()` di browser memulangkan tanggal **kemarin** antara
00:00–06:59 WIB (catatan B4 di [tanggal.ts](../lib/blud/tanggal.ts)). Kalau
`disimpan_pada` diisi `NOW()` MySQL sementara servernya UTC, tanggal keduanya bisa
berbeda dan snapshot terlihat "nyasar" dari versinya.

Dua aturan yang menutup ini:

1. Tambah `waktuSekarangWIB()` di `lib/blud/tanggal.ts`, memakai `JAKARTA_OFFSET_MS`
   yang sudah ada di berkas itu. Distempel **di server** (route), bukan dikirim
   klien — jam yang bisa dipalsukan bukan riwayat.
2. Pengelompokan di layar **selalu pakai kolom `versi_tanggal`**, tidak pernah
   `DATE(disimpan_pada)`. Dengan begitu selisih jam apa pun tidak bisa memisahkan
   snapshot dari versinya.

## 5. Sisi tulis — satu INSERT di dalam transaksi yang sudah ada

Di [`saveDpa`](../lib/blud/data.ts:515) dan `savePergeseran`, tepat **setelah**
`bumpBludVersion`, di dalam `withTransaction` yang sama.

Di dalam, bukan best-effort setelah commit: ini INSERT lokal, bukan panggilan
jaringan seperti arsip Drive-nya LKJIP. Kalau ia gagal berarti ada yang salah
sungguhan, dan Simpan memang layak ikut batal. Simpan yang ditolak 409 tidak
meninggalkan snapshot — otomatis, karena ikut rollback.

### L69 — SEMUA jalur tulis, bukan yang utama saja

`saveDpa` punya **dua** jalur yang menulis, dan yang kedua mudah terlewat:

| Jalur | Baris | Snapshot? |
|---|---|---|
| Simpan biasa (DELETE + `bulkInsert`) | [data.ts:563–581](../lib/blud/data.ts:563) | Ya |
| Kirim kosong + `force` → versi dikosongkan | [data.ts:533–540](../lib/blud/data.ts:533) | **Ya**, dengan `isi = []` |

Yang kedua justru riwayat paling berharga: "jam 16:40 versinya dikosongkan". Kalau
terlewat, satu-satunya penghapusan isi yang bisa dilakukan tanpa lewat layar
Pengaturan jadi tak berjejak.

`savePergeseran` diperlakukan sama, plus mengisi `dpa_versi_tanggal`.

### Retensi

Per `(jenis, tahun_anggaran)`, **50**. LKJIP/IKI pakai 20, tapi DPA disimpan jauh
lebih sering — 20 bisa habis dalam satu sore. Angka ini knob, bukan prinsip.

Pemangkasan ikut di transaksi yang sama. MySQL menolak subquery ke tabel yang
sedang di-DELETE, jadi wajib lewat derived table:

```sql
DELETE FROM blud_riwayat_simpan
 WHERE jenis = ? AND tahun_anggaran = ?
   AND id NOT IN (SELECT id FROM (
         SELECT id FROM blud_riwayat_simpan
          WHERE jenis = ? AND tahun_anggaran = ?
          ORDER BY id DESC LIMIT 50) t);
```

## 6. Snapshot selamat dari penghapusan versi

`deleteDpaVersi` **tidak** menyentuh `blud_riwayat_simpan`.

Ini keputusan sadar, dan langsung menjawab kejadian kemarin: versi yang salah
terhapus jadi **bisa dipulihkan angkanya** selama snapshot-nya masih dalam retensi.
Pagar `VERSI_TERPAKAI` dan `VERSI_DIRUJUK` tidak melemah sedikit pun — memulihkan
tetap lewat form + Simpan biasa, yang tunduk pada semua pagar itu.

Konsekuensinya, **spanduk merah di layar Pengaturan harus berubah**. Kalimat
"versi yang dihapus tidak bisa dikembalikan" ([pengaturan-client.tsx:210](<../app/(dashboard)/blud/pengaturan/pengaturan-client.tsx>:210))
berhenti benar. Gantinya menyebut angka: baris versinya hilang, riwayat simpannya
masih ada *n* dan bisa dipulihkan sebagai versi baru.

## 7. Sisi baca — bersarang di dropdown versi, bukan layar baru

Memilih versi dan memilih snapshot itu **tindakan yang sama di kedalaman berbeda**:
dua-duanya memuat isi ke form. Jadi tempatnya juga sama —
[`VersiDropdown`](../components/blud/VersiDropdown.tsx), yang ikonnya memang sudah
`History`.

```
┌ 🕘 26 Agu 2026 · 573 baris  [BERLAKU]              ▾ ┐
│                                                      │
│   🕘 26 Agu 2026 · 573 baris  [BERLAKU]         ✓    │
│      └ Simpan ke-3 · 16:40 · 573 baris · Vian        │
│      └ Simpan ke-2 · 14:32 · 570 baris · Vian  [Pulihkan]
│      └ Simpan ke-1 · 09:15 · 558 baris · Vian  [Pulihkan]
│                                                      │
│   🕘 05 Agu 2026 · 558 baris                         │
│      └ Simpan ke-1 · 11:02 · 558 baris · Rina [Pulihkan]
└──────────────────────────────────────────────────────┘
```

- Anak baris **tertutup secara default** — dropdown tidak boleh meledak jadi 50 baris.
- Simpan **terakhir** tiap tanggal tidak diberi tombol Pulihkan: itu isi yang
  sedang tampil, jadi tombolnya tidak melakukan apa-apa.
- `LATEST` diganti **`BERLAKU`** — sekalian membuang istilah Inggris yang bocor
  ke layar (sejalan commit `6abed15`), dan kata itu menyampaikan akibat: yang
  dihapus bukan "versi terbaru" tapi "versi yang sedang dipakai".

Endpoint: `GET /api/blud/riwayat-simpan?jenis=&tahun=&versi=` (daftar, tanpa `isi`)
dan `?id=` (satu snapshot, dengan `isi`). Daftar dibuat tanpa `isi` supaya membuka
dropdown tidak menyeret puluhan megabita.

## 8. Jebakan yang harus ditangani saat memuat snapshot

**Angka kunci diambil segar dari server, BUKAN dari `versi_ke` snapshot.**

Snapshot jam 09:15 membawa `versi_ke = 1`. Kalau angka itu dipakai sebagai
`expected_version` saat Simpan, sementara kunci tanggal itu sudah di angka 3,
Simpan ditolak "diubah orang lain" — persis **L75** yang baru saja diperbaiki,
lahir kembali lewat pintu lain.

Yang benar: memuat snapshot menetapkan `versi` = `versi_tanggal` miliknya, lalu
angka kuncinya diambil ulang dari server untuk tanggal itu, dan `simpan()`
tetap menghitung lewat `expectedVersionUntuk(targetTanggal, versiDibuka, versionDibuka)`
seperti sekarang. Ini wajib punya uji regresi sendiri.

**Konfirmasi sebelum memuat.** Memuat membuang isian yang sedang di layar. Pakai
`confirmDialog` dengan pilihan tidak-merusak sebagai default (**L75b**) — bukan
`window.confirm`.

**Pergeseran dengan acuan yang sudah hilang.** Kalau snapshot pergeseran menunjuk
versi DPA yang sudah dihapus, muat tetap **boleh** — angkanya utuh di dalam
snapshot (`vol_p`/`harga_p` milik `pergeseran_dpa` sendiri). Yang perlu muncul
peringatan, bukan penolakan.

## 9. Izin, pagar, audit

| Hal | Aturannya |
|---|---|
| Baca daftar & isi | `bolehLihatSalahSatu(userId, role, ['dpa','cetak','pengaturan'])` — sama dengan `mode=history` yang sudah ada |
| Memulihkan | Tidak butuh izin tulis: ia cuma GET + mengisi form. Yang dijaga `bolehEditMenu` adalah Simpan sesudahnya — sama persis dengan Salin Tahun |
| Kill-switch | Route baru **wajib** memanggil `bludMati(session.role)`, kalau tidak `npm run check:killswitch` gagal (**L72**) |
| Rate limit | `bludRateLimit(userId, 'view-riwayat', 60)` |
| Audit | `BLUD_RIWAYAT_PULIHKAN` saat snapshot dimuat. Simpan sesudahnya sudah tercatat `BLUD_SAVE_DPA`; tambahkan `asal_pulihkan` ke detailnya — tanpa itu tidak ada apa pun di database yang bilang versi hari ini lahir dari snapshot jam 09:15 (sepadan `asal_salin` di Salin Tahun) |

## 10. Ukuran

573 baris JSON ≈ 100 KB per snapshot. 50 snapshot × 2 jenis × 3 tahun ≈ 30 MB —
jauh di bawah `max_allowed_packet` per baris maupun kewajaran ukuran basis data.

## 11. Yang sengaja TIDAK dikerjakan

- **`versi_tanggal` jadi DATETIME** — alasan lengkap di §2.
- **Snapshot bisa dirujuk** (pergeseran/Rekap PJ/BBA menunjuk snapshot) — snapshot
  adalah catatan, bukan entitas. Begitu ia bisa dirujuk, seluruh §2 kembali berlaku.
- **Endpoint pulihkan yang menulis sendiri** — L69-a, §3.
- **Batal-hapus versi** — pulihkan menghasilkan versi baru bertanggal hari ini.
  Menghidupkan tanggal lama berarti menulis ke masa lalu, dan realisasi yang sudah
  menempel di sana tidak punya cara mengetahui pagunya berubah.

## 12. Definition of Done

1. `migration-blud-riwayat-simpan.sql` + tabel masuk `docs/schema-mysql.sql`
2. `waktuSekarangWIB()` di `lib/blud/tanggal.ts`
3. Snapshot ditulis di **3** titik: `saveDpa` jalur normal, `saveDpa` jalur
   kosong+force, `savePergeseran` — plus pemangkasan retensi, semuanya di dalam
   `withTransaction` yang sudah ada
4. `GET /api/blud/riwayat-simpan` dengan `bludMati` + guard + rate limit
5. `VersiDropdown` bersarang, tertutup default, `LATEST` → `BERLAKU`
6. Muat snapshot: `confirmDialog` dulu, angka kunci diambil segar dari server
7. Spanduk Pengaturan §6 diperbarui supaya berhenti berbohong
8. `scripts/test-blud-riwayat-simpan.mts` — wajib lolos **uji mutasi**: buang
   snapshot dari jalur kosong+force → harus ada yang gagal; pakai `versi_ke`
   snapshot sebagai `expected_version` → harus ada yang gagal
9. Gate: `tsc`, ESLint, `check:tokens`, `check:killswitch`
10. `CLAUDE.md` — baris tabel baru + catatan Database

## 13. Urutan

Revamp layar Pengaturan **dulu** (sudah disetujui, dan itu yang menutup lubang
kemarin), riwayat simpan menyusul. Dua konsep terpisah supaya kalau ada yang
meleset, ketahuan mana penyebabnya.
