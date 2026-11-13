# Konsep — Tautan indikator Renaksi: lanjutan (impor, turunan, IKI, hapus, kunci, LKJIP)

Status: **SELESAI** — §2, §3, §4, §5, §6, §8 dikerjakan (2026-11-13). Keempat pertanyaan dijawab "ya" (2026-11-12).
Dasar: `docs/CONCEPT-renaksi-pilih-indikator.md` (kolom `rencana_aksi.induk_indikator_id`).
Nomor mengikuti daftar saran 2026-11-12 (nomor 1 & 7 tidak dikerjakan — keputusan pemilik).

---

## 2. Excel Renaksi membawa tautan (unduh ↔ impor)

**Masalah.** Unduhan Excel Data Entry (`exportListXlsx`) tidak punya kolom tautan, dan pembaca
impor tidak mengenalinya. Unduh → sunting → impor: mode *perbarui* mempertahankan tautan lama
(baik), tetapi mode *ganti* menghapus lalu menulis ulang barisnya → **semua tautan tingkat itu dan
tingkat di bawahnya hilang**, tanpa peringatan.

**Usulan.**
- Unduhan Excel Data Entry dapat kolom **"Indikator Induk"** = TEKS indikator induk (bukan id: id
  tidak bermakna di berkas dan berubah lintas tahun/impor ganti).
- Pembaca impor mengenali kolom itu lewat alias baru `indikator_induk` (`/indikator\s*induk/i`).
  Alias `indikator` yang sudah ada WAJIB diberi `not: /induk/` — kalau tidak, ia merebut kolom
  yang salah (ia dicocokkan lebih dulu).
- Saat ditulis, teks → id baris di tingkat atasnya, **dibatasi entitas induk baris itu**
  (kegiatan: indikator milik programnya; sub: milik kegiatannya) dengan aturan pencocokan yang sama
  dengan `selaraskanImpor` (penanda & huruf besar tidak membedakan). Diselesaikan SESUDAH baris
  induk ditulis, di transaksi yang sama — di mode ganti induknya baru lahir dengan id baru.
- Sel kosong = **jangan sentuh** (pola `kode`: berkas lama tanpa kolom ini tidak boleh menghapus
  tautan). Teks yang tidak ketemu = tautan tidak diisi + disebut di pratinjau ("3 indikator induk
  tidak dikenali"), bukan baris ditahan.
- Pratinjau menyebut berapa tautan akan diisi/diganti.

**Batas.** Cetak Excel (laporan) tidak diubah — yang dipakai bolak-balik adalah unduhan Data Entry.

## 3. Impor yang memindah/mengganti nama ikut membawa turunannya

**Masalah.** Data Entry menjalarkan ganti nama/pindah ke baris turunan (`jalarkanGantiNama`).
Impor tidak: kegiatan dipindah lewat berkas, sub kegiatannya yang tidak ada di berkas tetap
menunjuk program lama → hierarki terbelah tanpa peringatan.

**Usulan.**
- Pratinjau impor menghitung dengan aturan yang SAMA dengan pencatat (`rencanaGantiNamaImpor`):
  entitas yang tegas pindah/berganti nama + jumlah baris turunan yang TIDAK ada di berkas.
- Kalimat di pratinjau: "Kegiatan *X* pindah ke *Program B* — 4 sub kegiatan di bawahnya tidak
  ada di berkas." dengan centang **"Ikut pindahkan turunannya"** (bawaan menyala).
- Saat Simpan: turunan yang tidak ada di berkas diperbarui lewat `jalarkanGantiNama` yang sudah ada
  (satu aturan — L78), di transaksi yang sama. Turunan yang ADA di berkas mengikuti berkas.
- Entitas yang TIDAK tegas (terbelah / beda tujuan) tidak dijalarkan; pratinjau menyebutnya
  sebagai peringatan saja.
- Server menghitung ulang daftar itu (layar hanya mengirim "setuju/tidak"), pola impor yang ada.

## 4. IKI memakai tautan untuk menyaring indikator bawahan

**Masalah.** Di editor IKI, "Isi dari Renaksi" dan tab "Dari Rencana Aksi" menawarkan SEMUA
indikator tingkat itu, padahal grup RHK sudah tertaut ke RHK atasan (`atasan_rhk_id`), dan RHK
atasan membawa `renaksi_id`.

**Usulan.**
- Bila RHK atasan grup itu ber-`renaksi_id`, pilihan Renaksi disaring ke baris yang
  `induk_indikator_id`-nya = `renaksi_id` itu, **ditambah** baris yang belum tertaut (aturan §5
  konsep induk: data lama tidak boleh lenyap). Penyaring = `anakMilikIndikator` yang sudah ada.
- Tombol "Tampilkan semua" untuk keluar dari saringan (kaskade IKI tidak selalu 1:1 dengan Renaksi).
- Hanya mengubah daftar pilihan; kartu yang sudah terisi tidak disentuh, nol migrasi.
- `GET /api/iki/import-renaksi` ikut memulangkan `induk_indikator_id` (route baca yang sudah ada).

## 5. Hapus indikator induk: "lepas tautan lalu hapus" dalam satu langkah

**Masalah.** Hapus baris yang masih ditunjuk ditolak (`RaTautanAnakError`) dengan pesan "pilih
ulang indikator induk baris itu dulu" — pengguna harus membuka N baris satu per satu.

**Usulan.**
- Penolakan 400 `MASIH_DITUNJUK` ikut memulangkan daftar baris penunjuknya (level, entitas,
  indikator, maks. 10 + jumlah).
- Dialog hapus menyebut daftar itu dan menawarkan **"Lepas tautan N baris & hapus"** (varian
  danger, pakai `confirmDialog`).
- Server: `DELETE` menerima `lepas_tautan: true` → dalam SATU transaksi: kunci baris (§6), lepas
  tautan penunjuk (`SET induk_indikator_id = NULL`), hapus. Pagar lama (Kunci Periode, induk
  terakhir yang memikul nama — `assertTidakPunyaAnak`) TETAP berlaku dan tidak bisa ditembus.
- Audit `RA_DELETE` menyebut "melepas tautan N baris".

## 6. Pemeriksaan tautan & hapus di dalam transaksi berkunci

**Masalah.** `assertIndukIndikator` membaca induk di luar transaksi tulis, dan
`deleteRencanaAksi` menghitung penunjuk lalu menghapus tanpa transaksi. Simpan yang menautkan ke
X tepat ketika X sedang dihapus bisa meninggalkan tautan ke id yang tidak ada (peluang kecil).

**Usulan.**
- Simpan (edit & baru): pemeriksaan pindah ke dalam `withTransaction`, induk dibaca
  `FOR SHARE` (barisnya pasti ada — bukan kasus L69-a), lalu tulis. Jalur baris baru yang kini
  satu `INSERT … ON DUPLICATE KEY` ikut dibungkus transaksi.
- Hapus: `withTransaction` → baris yang dihapus `FOR UPDATE` lebih dulu → hitung penunjuk → hapus.
  Simpan yang menautkan ke baris itu menunggu kunci, lalu mendapati induknya sudah tiada (400).
- Uji balapan deterministik pola `test-blud-race-*` (dua koneksi, `performance_schema.data_lock_waits`).

## 8. LKJIP "Renaksi · Cetak": perubahan urutan karena tautan dijelaskan

**Keadaan.** Sesudah tautan diisi, pohon Cetak menaruh kegiatan di bawah indikator program yang
dijabarkannya — urutan baris tabel LKJIP tertaut berubah. Perbarui & pengingat otomatis sudah
mendeteksinya ("urutan baris berubah"), tapi tanpa sebab.

**Usulan.**
- Bila satu-satunya beda adalah urutan (angka sama, tidak ada baris baru/hilang), kalimat dialog
  Perbarui & lencana pengingat menjadi: "Urutan baris mengikuti Rencana Aksi (kegiatan kini di
  bawah indikator program yang dijabarkannya). Angka tidak berubah."
- Tidak mengubah apa pun yang ditulis; hanya kalimat. Nol migrasi.
- Catatan pemasangan di kantor: karena tautan di server sudah terisi, sesudah kode dipasang
  **Master Sasaran PK** akan menampilkan spanduk "n pasangan indikator tidak tertaut lagi" dan
  tabel LKJIP Renaksi akan melapor urutan berubah — keduanya memang diharapkan.

---

## Urutan kerja yang diusulkan

| Tahap | Isi | Migrasi |
|---|---|---|
| A | §6 kunci & transaksi (fondasi §5) | — |
| B | §5 lepas tautan & hapus | — |
| C | §2 Excel membawa tautan | — |
| D | §3 impor membawa turunan | — |
| E | §4 saringan IKI | — |
| F | §8 kalimat LKJIP | — |

Tiap tahap: uji otomatis + uji mutasi + dicoba di peramban tahun kotak pasir, lalu commit + push.

## Pertanyaan

1. §2: kolom "Indikator Induk" ditaruh **sesudah kolom Indikator** di unduhan? (usulan: ya)
2. §3: centang "Ikut pindahkan turunannya" **bawaan menyala**? (usulan: ya — Data Entry pun
   selalu menjalarkan)
3. §4: saringan IKI **bawaan menyala** dengan tombol "Tampilkan semua"? (usulan: ya)
4. §5: tombol "Lepas tautan & hapus" untuk **semua pemegang akses Renaksi** (sama dengan hak
   hapus sekarang)? (usulan: ya)

## Hasil (2026-11-13)

- **§2** — unduhan Data Entry (`buatWorkbookList`) kini memuat kolom entitas per tingkat + Kode + "Indikator
  Induk" sesudah Indikator; impor membaca kolom itu (`indikator_induk`) dan mencocokkannya ke indikator
  entitas induk (`cocokkanIndukImpor`, ejaan dirapikan). Tak dikenal = disebut di toast, baris tetap masuk.
  **Temuan**: unduhan Data Entry sebelumnya TIDAK PERNAH bisa diimpor balik — baris datar dibaca sebagai
  judul, baris penomoran ikut jadi data, dan judul menelan baris berangka. Ketiganya dibereskan; berkas
  kalibrasi lama terbaca identik.
- **§3** — impor mode perbarui/ganti menghitung dulu turunan yang tertinggal (`step=dampak`, baca saja) lalu
  bertanya "Ikut pindahkan / Biarkan di tempat lama" (bawaan ikut); penjalarannya `jalarkanGantiNama` yang
  sama dengan Data Entry, di transaksi yang sama.
- **§4** — "Isi dari Renaksi" di kepala grup IKI menyaring pilihan ke indikator yang tertaut ke indikator RHK
  atasan grup (`indukRenaksiGrup` + `saringRenaksiGrup`, aturan `anakMilikIndikator`); belum tertaut/usang
  tetap tampil; "Tampilkan semua" membalik saringan. RHK atasan dicocokkan lewat `atasan_rhk_id`, cadangan
  teks RHK (id RHK atasan berganti tiap atasan menyimpan). Tab "Dari Rencana Aksi" (grup baru) tidak disaring
  — grup baru belum punya RHK atasan.
- Regresi: `npx tsx --env-file=.env.local scripts/test-renaksi-impor-tautan.mts` (25, kotak pasir 2074) +
  `npx tsx scripts/test-iki-isi-renaksi.mts` bagian F (17); uji mutasi §2/§3 7 tertangkap, §4 6 tertangkap.
- **§6** — `assertIndukIndikator` kini di dalam transaksi tulis (edit DAN baris baru) dan membaca induk
  `FOR SHARE`; `deleteRencanaAksi` = satu transaksi yang mengunci barisnya `FOR UPDATE` sebagai perintah
  pertama, lalu penjaga nama (`assertTidakPunyaAnak` menerima `tx`) dan hitung penunjuk. Uji balapan
  deterministik B1–B3 (`performance_schema.data_lock_waits`). B3 ditambah sesudah uji mutasi: membaca induk
  `FOR SHARE` lewat pool (di luar transaksi) tetap lolos B1/B2 — kuncinya lepas seketika, dan hapus yang
  menyelip di antara baca dan tulis Simpan meninggalkan tautan ke id yang tiada.
  **Susulan (hari yang sama)**: cacat lama di luar tautan ikut ditutup — dua hapus berbarengan atas dua
  indikator terakhir satu entitas dulu sama-sama melihat "masih ada saudara" lalu dua-duanya lolos, anaknya
  yatim. Hapus kini mengunci SEMUA baris se-nama (`kunciSeNama`, urut id → tanpa buntu) sebagai perintah
  pertama. Uji B4 (kegiatan) & B5 (program).
- **§5** — 400 `MASIH_DITUNJUK` membawa `jumlah` + `penunjuk` (≤ 10: level, nama entitas, indikator).
  Data Entry menyebut daftarnya di `confirmDialog` danger "Lepas tautan N baris & hapus" →
  `DELETE ?id=&lepas_tautan=1`: tautan penunjuk jadi NULL (versi naik) lalu baris dihapus, satu transaksi.
  Kunci Periode & induk terakhir tetap menolak. Audit `RA_DELETE` "… — melepas tautan indikator induk N baris".
- **§8** — `kalimatPerbarui(r, sumber)`: bila sumbernya Renaksi · Cetak dan yang berubah HANYA urutan
  (`hanyaUrutan`), dialog Perbarui & pengingat otomatis berbunyi `KALIMAT_URUTAN_RENAKSI`. Hanya kalimat.
- Regresi: `npx tsx --env-file=.env.local scripts/test-renaksi-hapus-tautan.mts` (47, kotak pasir 2072),
  15 uji mutasi tertangkap. §8 dicoba di peramban (2045, dihapus sesudahnya): tabel LKJIP tertaut Renaksi ·
  Cetak, tautan dua kegiatan ditukar → lencana pengingat & dialog Perbarui berbunyi kalimat urutan. Dicoba di peramban (2045, dihapus sesudahnya): dialog menyebut 2 baris, sesudah
  "Lepas tautan" indikator terhapus, kedua sub-kegiatan tanpa induk, audit tercatat. Saringan IKI §4 dicoba
  di 2073: 4 dari 5 pilihan tampil, "Tampilkan semua" → 5.
