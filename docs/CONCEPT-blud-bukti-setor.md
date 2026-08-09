# CONCEPT — Bukti Setor ke Bank (BLUD)

> Pelengkap `CONCEPT-blud-realisasi.md` dan `CONCEPT-blud-potongan.md`.
> Menjawab lembar `setor BPD` di `docs/06. BKU Juni 2026.xlsx`.

---

## 1. Temuan yang mendasari

Lembar `setor BPD` **bukan laporan turunan** — sejak awal ia lembar kerja mandiri.
Ditelusuri ke berkas aslinya:

| Yang diperiksa | Hasil |
|---|---|
| 11 nominal baris + `Ambil Uang` + `Total` + `Cash` dicari di seluruh 10 lembar lain | **Tidak satu pun ditemukan** — tidak di BKU, register, maupun Realisasi BP |
| Sel `Total` (r20) | **RUMUS** `=SUM(D8:D18)` |
| Sel `Cash` (r21) | **RUMUS** `=D19-D20` — Ambil Uang − Total |
| 11 baris + `Ambil Uang` | angka ketikan |
| Tanggal slip | `20-5-2026` dan `30-1-2026` — di dalam buku bulan **Juni** |

Jadi hanya dua sel yang dihitung; sisanya diketik tangan. Slipnya pun tidak pernah
diperbarui mengikuti bulan bukunya.

> **Kekeliruan yang dikoreksi konsep ini.** Versi aplikasi sekarang mencoba
> *menurunkan* lembar ini dari transaksi (`jenis = 'SETOR_BANK' || bank_masuk > 0`).
> Itu memaksa dokumen jadi sesuatu yang bukan dirinya: pengelompokan "sebelas
> pembayaran ini berasal dari tarikan itu" adalah keputusan manusia yang tidak ada
> jejaknya di data mana pun. Hasilnya bentuknya mirip tapi isinya tidak pernah bisa
> sama.

---

## 2. Keputusan #36 — beri lembar ini masukannya sendiri

Bukti Setor jadi **dokumen yang dirakit**, bukan laporan yang diturunkan. Tapi
perakitannya diberi satu syarat yang membuatnya tetap aman:

> **Setiap baris tercatat asalnya.** Baris yang diambil dari BKU tetap **terhubung**
> ke transaksinya; baris yang diketik lepas **ditandai**. Di bawah tabel sistem
> menyatakannya terang-terangan.

Tanpa penanda itu, kita mengembalikan penyakit yang justru dibasmi modul ini: lembar
berpenampilan resmi yang angkanya bisa melenceng dari BKU tanpa ada yang curiga.
Dengan penanda itu, ketikan lepas bukan lubang — ia **sisa yang terlihat**, dan siapa
pun bisa menilai wajar atau tidak.

### Nilai baris terhubung dibaca HIDUP, tidak disalin
Baris ber-`tx_id` mengambil uraian & nominal dari transaksinya **saat dibaca**, bukan
disalin saat dirakit. Konsisten dengan §2.7 (turunan tidak disimpan) dan menutup satu-
satunya cara slip ini bisa berbeda dari BKU. Kalau transaksinya terhapus, barisnya
tampil sebagai `(transaksi terhapus)` dan ikut dihitung sebagai **peringatan** — bukan
diam-diam mempertahankan angka basi.

---

## 3. Model data

```sql
blud_bukti_setor
  id, tahun_anggaran, bulan, tanggal
  no_bukti      VARCHAR(64) NULL
  ambil_tx_id   BIGINT NULL   -- tunjuk transaksi AMBIL_BANK di BKU
  ambil_manual  DECIMAL(18,2) NULL  -- hanya kalau tarikannya memang tidak ada di BKU
  version       INT           -- CAS per-baris (L48)
  created_by, created_at, updated_at

blud_bukti_setor_baris
  id, bukti_id, urutan
  asal        ENUM('BKU','POTONGAN','KETIK')
  tx_id       BIGINT NULL   -- asal = BKU
  potongan_id BIGINT NULL   -- asal = POTONGAN
  uraian      VARCHAR(255) NULL  -- asal = KETIK saja
  nilai       DECIMAL(18,2) NULL -- asal = KETIK saja
```

`asal = 'POTONGAN'` menyelesaikan baris `PPH 21 JP` di slip asli: setoran pajak
sekarang hidup di `blud_realisasi_potongan`, bukan sebagai transaksi, jadi tanpa jalur
ini ia mustahil muncul di slip.

**Yang TIDAK disimpan** (dihitung saat dibaca, §2.7):

| Angka | Rumus | Padanan di berkas asli |
|---|---|---|
| `Total` | Jumlah seluruh baris | `=SUM(D8:D18)` |
| `Cash` | `Ambil Uang − Total` | `=D19-D20` |
| Ringkasan asal | *n* terhubung · *m* ketikan lepas senilai Rp … | — (tidak ada di asli) |

---

## 4. Layar

### Menu sendiri, bukan tab di Buku Kas
Buku Kas adalah **catatan resmi** — tiap barisnya fakta, dan semua lembar lain
diturunkan darinya. Bukti Setor adalah **dokumen rakitan** yang sebagian barisnya
boleh diketik lepas. Menaruh keduanya di satu layar berarti baris "boleh ngarang"
duduk bersebelahan dengan baris "sumber kebenaran"; cepat atau lambat tertukar.
Pemisahannya menjaga wibawa BKU — bukan sekadar kenyamanan.

Pemilih baris membawa daftar BKU ke hadapan bendahara (pola yang sama dengan pemilih
rekening di `TransaksiModal`), jadi ia memang tidak perlu sedang berada di layar Buku
Kas.

```
PENATAUSAHAAN   Buku Kas · Bukti Setor 🆕 · Realisasi · Tutup Kas
```

Tile baru disisipkan **setelah Buku Kas** (urutan kerja), sehingga `Cetak` dan
`Pengaturan` tetap dua terakhir. `MAX_INLINE_TILES` di `blud-shell.tsx` dinaikkan
**10 → 11**: dengan 12 tile, tepat dua yang masuk dropdown "Lainnya" — yaitu keduanya
itu. Perlu dilihat sekali pada lebar 1280 px; ribbon tidak boleh sampai menggulung
mendatar.

### Daftar
Satu baris per slip di bulan berjalan:

```
20 Mei 2026    11 baris    Total 1.410.429.497    Cash 26.570.503
30 Jan 2026     4 baris    Total   286.528.930    Cash 65.471.070
```

### Perakit

| Bagian | Cara isi |
|---|---|
| Tanggal · No. bukti | No. bukti opsional |
| **Ambil Uang** | **"Pilih dari BKU"** — mencari transaksi `AMBIL_BANK` di sekitar tanggal itu · ketik hanya kalau memang tidak ada. Mengetik ulang tarikan yang sudah ada di BKU = salinan kedua dari satu kejadian |
| Daftar baris | **"Ambil dari BKU"** (pemilih multi-centang, termasuk potongan) · **"Ketik Baris"** (uraian + nominal) · urutan bisa digeser |
| **Total** | Otomatis — tidak bisa diketik |
| **Cash** | Otomatis — tidak bisa diketik |

Baris dari BKU diberi tanda kecil (no. kuitansi / kode rekening); baris ketikan polos.
Di bawah tabel, satu kalimat:

> *9 baris terhubung ke BKU · 2 baris diketik lepas senilai Rp 607.764*

Kalimat itulah yang membuat seluruh rancangan ini aman.

---

## 5. Pagar

| Pagar | Sikap | Alasan |
|---|---|---|
| Satu transaksi dipakai dua kali **di slip yang sama** | **Tolak** | Dobel hitung murni, tidak ada kasus sahnya |
| Satu transaksi dipakai di **dua slip berbeda** dalam satu bulan | **Peringatkan**, jangan blokir | Bisa sah (pembayaran dicicil), tapi harus terlihat |
| `Cash` negatif | **Peringatkan**, jangan blokir | Artinya pemakaian melebihi tarikan — sinyal nyata, bukan kesalahan isian |
| Baris menunjuk transaksi yang sudah terhapus | Tampilkan `(transaksi terhapus)` + hitung sebagai peringatan | Jangan pernah diam |
| Periode bulan itu `TUTUP` | Slip jadi baca-saja | Konsisten dengan seluruh modul |
| Akses | `bolehLihat`/`bolehInput` pada menu **`bukti-setor`** (`app/api/blud/realisasi/_guard.ts`) — **tanpa** kunci `app_access` baru | Menu sendiri di tabel peran (bawaan EDIT), setara Buku Kas — bukan menumpang padanya |
| Rate limit & audit | `bludRateLimit` · `BLUD_BUKTI_SETOR_{CREATE,UPDATE,DELETE}` | Pola sama dengan route BLUD lain |

---

## 6. Akibat ke ekspor SPJ

`sheetSetorBpd()` berhenti menyaring transaksi dan **membaca `blud_bukti_setor`**.
Tata letaknya sudah sama dengan berkas asli (judul · `NO · URAIAN · JUMLAH` ·
bernomor · Total · tanda tangan); yang bertambah dua baris: **`Ambil Uang`** dan
**`Cash`**.

Bulan yang belum punya slip tercatat menghasilkan lembar bertuliskan *"Belum ada bukti
setor dicatat pada bulan ini."* — **penyaring lama tidak dipertahankan sebagai
cadangan**. Dua sumber untuk satu lembar berarti tidak ada yang tahu angkanya datang
dari mana; lebih baik kosong dan jujur.

---

## 7. Batas — yang sengaja TIDAK dikerjakan

| Hal | Alasan |
|---|---|
| Memecah pembagian JP jadi baris per penerima di BKU | Itu keputusan **cara mengisi data**, bukan fitur. Selama JP tetap satu baris 1.522.096.730, slip tidak akan memuat `Transfer Go eddy gunawan` dkk kecuali diketik lepas |
| Menghubungkan pembayaran ke tarikan yang mendanainya secara umum (di luar slip) | Cakupan lebih besar; `Cash` di sini sudah cukup sebagai kontrol |

> ⚠️ **Catatan privasi.** Baris seperti `Transfer Go eddy gunawan` adalah **nominal
> gaji orang per nama**. Berkas SPJ beredar antar-meja. Apakah rincian per penerima
> pantas ikut tercetak adalah keputusan bendahara/pimpinan, bukan keputusan teknis —
> dan perlu diputuskan sadar sebelum kebiasaan terbentuk.

---

## 8. Urutan pengerjaan

1. Migrasi 2 tabel + entri `schema-mysql.sql`
2. Data layer + Zod + guard (`lib/blud/bukti-setor-data.ts`, `bukti-setor-schemas.ts`)
3. Route `app/api/blud/bukti-setor/route.ts`
4. Layar `app/(dashboard)/blud/bukti-setor/` + tile + `MAX_INLINE_TILES` 10 → 11
5. `sheetSetorBpd()` beralih sumber
6. Regresi: kasus `Cash` negatif · transaksi terhapus · dobel di satu slip
7. `TUTORIAL-blud.md`: peta menu 11 → 12, daftar lembar, kode error, model data
