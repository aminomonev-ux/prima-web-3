# PROMPT — DPA Perubahan BLUD: uji lokal + Tahap 1–5

> Untuk agen Claude Code yang berjalan di laptop pemilik (MySQL lokal + `npm run dev`
> menyala, `.env.local` ada). Ditulis 2026-10-08 dari sesi cloud yang mengerjakan
> konsep + Tahap 0 tanpa akses database.

---

## 0. Baca dulu, berurutan

1. `CLAUDE.md` — seluruhnya. Aturan yang paling sering terlanggar di pekerjaan ini:
   konsep dulu sebelum mengubah perilaku, **commit hanya saat diminta pemilik**,
   jawab dalam Bahasa Indonesia, L69 (semua jalur tulis), L78 (satu aturan satu
   tempat), L82 (pagar di API, bukan cuma tombol), L82c (uji statis membuang
   komentar dulu dan mengutip utuh sampai kurung buka), L86 (recalc tidak menyentuh
   kolom yang tidak dihitungnya), design system, `docs/AUDIT-*.md` tidak pernah
   di-commit.
2. `docs/CONCEPT-blud-dpa-perubahan.md` (v3) — **sumber kebenaran**. Terutama §0
   (10 keputusan pemilik), §5, §6, §8 (aturan pagu baru), §9, §10 (pagar realisasi
   R1–R9), §11 (impor), §15 (tahapan + Definition of Done).
3. `lib/blud/sumber-pagu.ts` + `scripts/test-blud-sumber-pagu.mts` — hasil Tahap 0.

Kalau menemukan sesuatu yang bertentangan dengan konsep, atau keputusan yang belum
diambil pemilik: **berhenti dan tanyakan**, jangan memutuskan sendiri.

## 1. Aturan keselamatan data (WAJIB)

- Uji yang menulis ke database **hanya di tahun kotak pasir 2099**, seperti semua
  skrip `scripts/test-blud-*.mjs` yang sudah ada. Bersihkan di awal **dan** di blok
  `finally`.
- Data tahun berjalan (2026) **hanya dibaca**. Tidak ada simpan, hapus, maupun
  "Jadikan DPA Perubahan" pada 2026 tanpa izin eksplisit pemilik.
- Sebelum uji lewat aplikasi yang menulis apa pun, **cadangkan dulu** tabel BLUD:
  `mysqldump` untuk `dpa_blud pergeseran_dpa blud_locks blud_riwayat_simpan
  blud_pergeseran_tutup pergeseran_mutasi blud_realisasi_tx blud_realisasi_alokasi
  rekap_pk` (+ `blud_dpa_perubahan` sesudah Tahap 1).
- Uji aplikasi end-to-end memakai tahun 2099 yang diisi lewat **Salin dari Tahun
  Lain** (2026 → 2099), lalu dibersihkan sesudahnya.

## 2. Bagian A — Verifikasi Tahap 0 di lokal (kerjakan dulu, lalu LAPOR)

Tahap 0 (`415ceb4`) menyatukan aturan sumber pagu ke `lib/blud/sumber-pagu.ts`
**tanpa mengubah perilaku**. Di sesi cloud sudah terbukti lewat pembanding di
memori (1.024 kombinasi, 0 beda), `tsc`, lint, gate tanggal/SQL, dan 8 suite
statis. Yang **belum**: semua uji ber-MySQL dan pembuktian pada data asli.

```bash
git fetch origin
git checkout claude/friendly-goodall-y7su7m
git pull
```

**A1. Suite statis BLUD** (tsx bukan dependensi proyek → `npx --yes tsx`):

```bash
for f in scripts/test-blud-*.mts scripts/test-pergeseran-*.mts scripts/test-pagu-per-tahun.mts; do
  echo "== $f"; npx --yes tsx "$f" 2>&1 | tail -1
done
```

**A2. Suite ber-database** (semuanya di kotak pasir 2099; baca kepala tiap berkas
dulu):

```bash
for f in scripts/test-blud-*.mjs; do echo "== $f"; node "$f" 2>&1 | tail -2; done
node scripts/test-blud-race-hapus-versi.mjs
node scripts/check-schema.mjs
node scripts/concurrency-test.js
```

Yang paling menentukan untuk Tahap 0:
- `test-blud-hapus-versi.mjs` — mengompilasi `data.ts` sungguhan (lewat
  `kompilasiUji`), jadi `paguPenerus` → `sumberPaguPenerus` teruji di MySQL.
- `test-blud-potongan-identitas.mjs` — `realisasi-data.ts` sungguhan, jadi
  `bacaPaguTerkunci` → `sumberPaguTahun(tx, …)` teruji.
- `test-blud-race-hapus-versi.mjs` — CERMIN kueri (tidak memanggil kode); tetap
  harus hijau.

**A3. Pembuktian "angka tidak bergeser" pada data asli (baca saja).** Buat skrip
sementara di luar repo (mis. folder tmp) yang memuat `.env.local` sendiri (pola
`scripts/test-pagu-per-tahun.mts`), lalu mencetak JSON dari
`getPaguSumber(t)`, `getPaguEfektif(t)` (anggaran_key + pagu, urut), dan
`getPaguCap(t)` untuk setiap tahun di `getTahunList()`. Jalankan **dua kali**:

```bash
git worktree add ../prima-main main      # kode sebelum Tahap 0
# worktree TIDAK punya node_modules: tautkan punya repo ini
#   (Linux/Mac: ln -s "$PWD/node_modules" ../prima-main/node_modules
#    Windows:  mklink /J ..\prima-main\node_modules node_modules)
# lalu salin .env.local ke ../prima-main (JANGAN di-commit)
# jalankan skrip dgn akar repo = ../prima-main  → sebelum.json
# jalankan skrip dgn akar repo = repo ini       → sesudah.json
diff sebelum.json sesudah.json           # HARUS kosong
git worktree remove --force ../prima-main   # ikut membuang .env.local salinannya
```

**A4. Lihat sendiri di aplikasi** (`npm run dev` sudah menyala): layar Realisasi
BLUD 2026 (label sumber pagu, total pagu, beberapa rekening + sisa), Beranda BLUD
(kartu serapan), dan form Buku Kas (daftar rekening). Bandingkan dengan main.

**Laporkan ke pemilik**: tiap suite lulus/gagal + jumlah pemeriksaan, hasil `diff`
A3, dan apa yang tidak bisa dijalankan beserta alasannya. **Tunggu "lanjut" dari
pemilik sebelum Bagian B.**

## 3. Bagian B — Tahap 1: inti data

Isi lengkapnya di konsep §4–§10. Daftar kerja:

1. **Skema**: `docs/migrations/migration-blud-dpa-perubahan.sql` — `ALTER TABLE
   dpa_blud ADD COLUMN vol_sebelum DECIMAL(18,4) NULL`, `satuan_sebelum
   VARCHAR(32) NULL`, `harga_sebelum DECIMAL(18,2) NULL`, `jumlah_sebelum
   DECIMAL(18,2) NULL` (tanpa `IF NOT EXISTS` pada `ADD COLUMN`) + `CREATE TABLE
   blud_dpa_perubahan` persis §4 (termasuk `sumber_dasar`). Tulis juga di
   `docs/schema-mysql.sql`. Jalankan migrasinya di MySQL lokal, lalu
   `node scripts/check-schema.mjs`.
2. **Aturan pagu §8** di `sumber-pagu.ts` saja: M = `versi_mulai` Perubahan
   terakhir; pagu = pergeseran terbaru yang **acuannya** (`dpa_versi_tanggal`) ≥ M,
   kalau belum ada → DPA terbaru. Tanpa penanda, hasilnya HARUS identik dengan
   aturan lama.
3. **Jebakan yang wajib ditangani di `AndaiVersi`** (kalau terlewat, pagar
   realisasi diam-diam tidak berjalan):
   - `versiJadiSumberPagu` untuk **pergeseran** butuh acuan versi khayalannya
     (`savePergeseran` sudah memegang `dpaVersiTanggal`). Tanpa itu, pergeseran
     babak lama bisa dianggap sumber pagu, atau sebaliknya.
   - Simpanan yang **membuat** Perubahan (`asal_perubahan` ada, penanda belum ada)
     harus dihitung DENGAN penanda khayalan. Kalau tidak, `versiJadiSumberPagu`
     menjawab "bukan sumber pagu" (karena pergeseran ada), dan `pagarSimpanVersi`
     **dilewati** tepat pada simpanan Perubahan pertama — R2 bocor.
   - Menghapus versi Perubahan **terakhir** ikut menghapus penandanya, jadi
     penerus dihitung TANPA penanda itu (pagu kembali ke pergeseran lama). R5
     bergantung pada ini.
4. **Simpan Perubahan** (§5, §7 lama): `asal_perubahan` di skema body POST DPA →
   `saveDpa` menulis baris `blud_dpa_perubahan` di transaksi yang sama, sesudah
   barisnya. PRIMARY KEY yang menolak ganda. Pagar §5.1: sasaran belum berisi versi
   DPA — dibaca dari `existing` di bawah kunci.
5. **Kolom Sebelum milik server** (§6): di SETIAP simpan dalam babak Perubahan,
   server mengisinya dari versi dasar (`sumber_dasar` + `versi_dasar`) lewat
   `anggaran_key`. Isian dari klien diabaikan. Zod kolom Sebelum **opsional**
   (foto riwayat & cadangan Drive lama tidak punya kolom ini). `row-map.ts`,
   `DPA_COLUMNS`, dan `normDpa` ikut diperbarui; kolom yang lupa didaftar terbuang
   tanpa suara.
6. **Pagar R1–R8** (§10), semuanya di `data.ts`/`sumber-pagu.ts`, bukan cuma di
   route (L82):
   - R4: simpanan Perubahan yang membuang baris ber-`anggaran_key` dari versi dasar
     ditolak (harus dinolkan).
   - R6: `savePergeseran` bertanggal ≥ M wajib acuan ≥ M —
     `PERGESERAN_ACUAN_SEBELUM_PERUBAHAN`; termasuk cadangan
     `dpa_versi_tanggal || getDpaLatestDate` di `app/api/blud/pergeseran/route.ts`.
   - R8: `turunkanPaksa` ditolak untuk versi di babak Perubahan, diperiksa di
     **`saveDpa`**, bukan di route saja.
   - Versi dasar dikunci (§6): simpan ulang / hapus versi dasar →
     `VERSI_DASAR_PERUBAHAN`.
   - L69: **4 jalur simpan** (`saveDpa` ×2, `savePergeseran` ×2 — termasuk cabang
     kosong+force) + **2 jalur hapus** semuanya kena, termasuk penghapusan penanda.
7. **Mapper** (§5 langkah 3–4): pecah `pergeseranKeTahunBaruInput` jadi
   `pergeseranKeDpaInput` (jangkar DIBAWA) + pembungkus Tahun Baru (jangkar
   dilepas). Jejak usulan (`origin`/`usulan_item_id`/`usulan_no`) diambil dari baris
   DPA acuan lewat `row_id`.
8. **`PaguSumber`** perlu tahu "Perubahan ke-n". Konsep §8 menyebut nilai
   `'PERUBAHAN'`, tetapi hampir semua pemakai bercabang
   `sumber === 'PERGESERAN' ? pergeseran_dpa : dpa_blud`. Lebih aman `sumber` tetap
   `'DPA'` ditambah field `perubahan_ke`. Pilih salah satu, tulis alasannya, lalu
   **grep semua pemakai** `PaguSumber`/`getPaguSumber`.
9. **R7 — balapan**: `bacaPaguTerkunci` (jalur belanja) membaca sumber pagu dengan
   SELECT biasa di dalam `tx`. Buktikan dengan uji balapan (di bawah) apakah
   belanja yang commit di sela simpan/hapus Perubahan bisa membaca sumber yang basi.
   Kalau terbukti bisa, perbaiki (mis. pembacaan berkunci untuk jalur `tx`) dan
   ulangi ujinya. **Jangan berasumsi ke arah mana pun.**
10. Event audit baru (kalau ada) WAJIB digolongkan di
    `lib/security/retensi-audit.ts`. Route baru di `app/api/blud` WAJIB memanggil
    `bludMati` (gate G).

### Uji Tahap 1

- **Perluas `scripts/test-blud-sumber-pagu.mts`**: pembanding aturan BARU (enumerasi
  penanda M × pergeseran ber-acuan × DPA). Pembanding aturan LAMA tetap ada dan
  harus identik pada semua kombinasi tanpa penanda. Tambahkan kasus bernama dari
  konsep §1 (A/B/C/D) dan ketiga jebakan di butir 3.
- **Baru: `scripts/test-blud-dpa-perubahan.mts`** (statis + fungsi murni): mapper
  (jangkar dibawa, jejak usulan dari DPA), Zod Sebelum opsional, R8 di badan
  `saveDpa`, penanda ditulis di transaksi yang sama, keenam jalur L69.
- **Baru: `scripts/test-blud-dpa-perubahan-db.mjs`** (kotak pasir 2099,
  `kompilasiUji` atas `lib/blud/data.ts` + `realisasi-data.ts` sungguhan).
  Skenario minimum:
  1. buat Perubahan dari pergeseran → penanda tertulis, Sebelum terisi server
     (isian Sebelum palsu dari klien diabaikan), `getPaguSumber` pindah ke
     Perubahan, rekening baru D muncul di `getPaguEfektif`;
  2. tahun tanpa pergeseran → dasar = DPA terakhir (`sumber_dasar = 'DPA'`);
  3. sasaran yang sudah berisi versi DPA → ditolak (§5.1);
  4. pembuatan ganda → ditolak (PRIMARY KEY);
  5. turunkan rekening di bawah terserap → ditolak, dan dengan `turunkanPaksa` →
     **tetap** ditolak (R2 + R8);
  6. buang baris dasar → ditolak (R4); nolkan baris dasar tanpa realisasi →
     diterima;
  7. pergeseran ≥ M beracuan < M → ditolak (R6); beracuan ≥ M → diterima DAN jadi
     sumber pagu;
  8. simpan ulang / hapus versi dasar → ditolak;
  9. revisi Perubahan keesokan harinya → kolom Sebelum TIDAK berubah;
  10. hapus Perubahan sesudah belanja di rekening D → ditolak (R5); tanpa realisasi
      → diterima, penanda hilang, pagu kembali ke pergeseran lama;
  11. Perubahan ke-2 (M2 > M1) → nomor ke-2, Sebelum dari dasar yang baru.
- **Balapan (R7)**, pola `test-blud-race-hapus-versi.mjs` (deterministik, dijalankan
  tanpa lalu dengan kunci, supaya terbukti pagarnya yang menahan): **belanja ×
  simpan Perubahan** dan **belanja × hapus Perubahan**. Perbarui juga kueri cermin
  di `test-blud-race-hapus-versi.mjs` ke aturan baru.
- **Uji mutasi**: minimal satu per pagar R1–R8 + aturan §8 + mapper. Rusak → jalankan
  → pastikan GAGAL → pulihkan. Catat jumlahnya. Mutan yang tidak mengubah perilaku
  diganti, bukan dihitung lolos.
- Lalu: Bagian A1 + A2 lengkap, `npx tsc --noEmit`, `npm run lint -- --max-warnings
  0`, `npm run check:tanggal`, `check:sql`, `check:killswitch`, `check:tokens`.

## 4. Bagian C — Tahap 2: layar DPA

Konsep §5, §7, §10 (R4), §11 bagian layar.
- Tombol **Jadikan DPA Perubahan** (`PrimaButton`). Sumbernya ditanya ke server
  (`sumberPaguTahun`), bukan dihitung di layar. Modal: jenis, tanggal, jumlah baris,
  total, peringatan draft tak berimbang, peringatan DPA direvisi sesudah pergeseran.
  Modal **berhenti di form** (L78/L80): mengisi layar + `belumTersimpan`, tanpa
  menulis DB.
- `asalPerubahan` dilepas di 9 jalur pengganti isi (Form Baru, Impor, Salin Versi,
  Salin Tahun, Pulihkan, Pulihkan Cadangan, ganti tahun, ganti periode, buka versi)
  dan sesudah Simpan berhasil. Uji statis menghitung jalurnya (pola `asalSalinRef`).
- Kolom Sebelum hanya-baca + Bertambah/(Berkurang) + baris total. Sakelar "Tampilkan
  kolom Sebelum" pakai `localStorage` dibungkus try/catch, bawaan nyala.
- Lencana MURNI / PERUBAHAN KE-n di `VersiDropdown`. Hapus baris ber-Sebelum =
  nolkan.
- Salin Versi di babak Perubahan hanya menawarkan sumber dari babak yang sama.
- Design system: token warna saja, `data-tooltip` (bukan `title=`), ikon
  `lucide-react`, `confirmDialog` (bukan `window.confirm`).
- Verifikasi di aplikasi pada tahun 2099 hasil Salin Tahun dari 2026 (558 baris).
  Catat yang dilihat, termasuk tema terang dan lebar ponsel.

## 5. Bagian D — Tahap 3: layar Pergeseran

Konsep §9.
- Lencana babak diturunkan dari acuan, hanya di tahun yang punya Perubahan. Nomor
  "Pergeseran ke-n" **berlanjut** setahun.
- Spanduk babak lama + tombol Buat Pergeseran di dalamnya. `alasanKunciBorongan`
  mengecualikan versi babak lama. Sinkronkan DPA dimatikan di babak lama. Kalimat
  penolakan Tutup babak lama menyebut Buat Pergeseran.
- Kop cetak Pergeseran: "mengacu DPA Perubahan ke-n (tanggal)".

## 6. Bagian E — Tahap 4: cetak & impor

Konsep §7 (cetak) dan §11.1–11.2.
- Cetak versi Perubahan dua format: **Ringkas** (tata letak DPA murni, kop "DPA
  PERUBAHAN KE-n" + versi + angka kunci simpanan) dan **Lengkap** (Sebelum · Sesudah ·
  Bertambah/(Berkurang)).
- **Tanya pemilik contoh berkas kantor** sebelum memfinalkan tata letak Lengkap
  (konsep §14 no. 1).
- PDF: gate F (`npm run check:pdf`) menolak glyph non-WinAnsi. Jangan memakai "→",
  "≥", atau "−" di teks PDF.
- Impor: kenali Perubahan Lengkap (judul Sebelum + Sesudah) dan Ringkas (kop),
  lalu terapkan matriks §11.2. Uji lewat workbook sungguhan dari
  `buatWorkbookDpa` (pola `test-blud-impor-bolak-balik.mts`).

## 7. Bagian F — Tahap 5: impor-balik ke versi terbuka

Konsep §11.3, ketujuh penjaganya. Berlaku untuk DPA murni **dan** Perubahan (satu
aturan). Uji: jangkar asing ditolak, berkas basi diperingatkan (angka kunci di kop),
panel perbandingan, 409 kalau orang lain menyimpan di sela, `asal_impor.ke_versi_terbuka`
di audit.

## 8. Penutup setiap tahap

- Laporan ke pemilik: apa yang dikerjakan, uji yang lulus (dengan angkanya), uji
  mutasi yang tertangkap, dan apa yang **belum** diverifikasi beserta alasannya.
- Perbarui `CLAUDE.md` (entri singkat di "File Kritis") dan status tahap di §15
  konsep.
- **Commit hanya kalau pemilik meminta**, ke branch `claude/friendly-goodall-y7su7m`.
  `package-lock.json` hanya boleh berubah lewat `npx npm@10.8.2 install` (L57).
- Migrasi Tahap 1 juga **wajib dijalankan di server kantor** sebelum kodenya
  dipasang di sana. Ingatkan pemilik di laporan akhir.
- **Definition of Done keseluruhan** (konsep §15), di tahun 2099: Jadikan DPA
  Perubahan → Simpan → Realisasi membaca pagu baru → Buat Pergeseran mengacu
  Perubahan → unduh Ringkas, sunting, impor-balik → hapus Perubahan → pagu kembali
  ke pergeseran lama.
