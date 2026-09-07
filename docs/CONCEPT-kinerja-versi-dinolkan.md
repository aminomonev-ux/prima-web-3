# CONCEPT — A9: "versi mana" dan "isinya apa" dipisah

> Temuan A9 dari `docs/AUDIT-kinerja-2026-09-04.md`, ditemukan saat memverifikasi
> A7.
>
> **Nol tabel baru, nol kolom baru, nol migrasi, nol endpoint baru.**

---

## 1. Cacatnya

Satu saringan mengerjakan dua pekerjaan yang berbeda. Kueri versi aktif
menjumlah **dan** memilih dalam satu langkah:

```sql
SELECT sumber, versi_tipe, versi_seq FROM kinerja_ssk
WHERE tahun = ? AND is_nullified = FALSE      -- <— saringan ini
GROUP BY sumber, versi_tipe, versi_seq
```

`is_nullified = FALSE` benar untuk **menghitung pagu** — baris yang dinol-kan
memang tidak punya anggaran. Tapi ia juga menentukan **versi mana yang masuk
daftar calon**, dan itu akibat yang tidak diniatkan: versi yang SELURUH barisnya
dinol-kan tidak menghasilkan satu pun baris, jadi ia hilang dari `GROUP BY`, dan
versi SEBELUMNYA yang diambil sebagai "aktif".

Akibatnya: **menol-kan seluruh isi sebuah Perubahan tidak berpengaruh apa pun.**
Angkanya mundur ke versi yang sudah digantikan, bukan turun ke nol — padahal
arti "nol-kan semua baris" justru "sumber ini tidak beranggaran tahun ini".

## 2. Sudah diukur, bukan diperkirakan

Di aplikasi, tahun buangan 2040:

1. GAJI 2040 punya MURNI-0 (pagu Rp 1.000.000, terkunci) dan PERUBAHAN-1 yang
   **seluruh** barisnya `is_nullified = 1`.
2. `GET /api/kinerja/laporan?tahun=2040` memulangkan `total_pagu: 1000000`
   — pagu **MURNI-0**.

Arahnya buruk: ia melaporkan pagu **lebih besar** dari kenyataan, dan tidak ada
spanduk apa pun yang menyebutkannya. Yang menahan besarnya cuma kelangkaan:
penol-kan **sebagian** tidak kena sama sekali (versinya tetap punya baris tak-nol
sehingga tetap muncul di `GROUP BY`). Hanya 100% yang menggigit.

---

## 3. EMPAT tempat, bukan satu

Catatan auditnya menulis `versiAktifKinerja`. Itu kurang — bentuk yang sama
diulang di tiga tempat lain, masing-masing dengan agregatnya sendiri:

| Tempat | Yang dijumlah |
|---|---|
| `versiAktifKinerja` (:554) | tidak menjumlah apa pun, hanya memilih |
| `getLaporanData` (:1207) | `SUM(pagu)`, `SUM(total)` per versi, lalu `pickVersiAktif` |
| `getLaporanSemua` (:1339) | idem, per sumber |
| `getKinerjaKpi` (:1444) | idem + `COUNT(*)` |

Ketiga yang terakhir menjumlah **dan** memilih dari hasil yang sama, jadi
memperbaiki `versiAktifKinerja` sendirian meninggalkan tiga layar tetap salah.
L69 lewat pintu yang selalu sama: yang terlewat adalah yang tidak sedang dilihat.

---

## 4. Perbaikannya — pisahkan dua pertanyaannya

> **Daftar calon versi dibaca TANPA saringan `is_nullified`.**
> **Angkanya dihitung HANYA dari baris yang `is_nullified = FALSE`.**

Untuk versi yang habis dinol-kan hasilnya pagu 0 dan target 0 — dan itu jawaban
yang benar, bukan efek samping.

Bentuknya:

- `versiAktifKinerja` melepas `AND is_nullified = FALSE`. Ia tidak menjumlah
  apa pun, jadi ini satu-satunya perubahan yang ia butuh.
- Ketiga agregat berhenti memilih sendiri. Mereka bertanya versi aktifnya ke
  `versiAktifKinerja`, lalu **mencari** agregat versi itu di hasilnya; kalau
  tidak ada (karena semua barisnya dinol-kan) → 0. Itu juga menghapus tiga
  pemakaian `pickVersiAktif` yang berdiri di atas daftar masukan yang salah.
- `canonicalAktifKinerja` **tidak berubah** pada sisi barisnya: baris yang
  dinol-kan tetap dikecualikan dari himpunan canonical, jadi realisasi yang
  menunjuknya tetap jadi **yatim**. Uangnya tidak lenyap — ia pindah ke spanduk
  yatim, tempat yang memang untuk itu.

Sepupu A7, dan **arahnya berlawanan**: di `reset` saringan itu sengaja TIDAK
dipakai untuk memilih slot yang dibuka kuncinya, karena yang ditanyakan di sana
"slot mana yang tidak punya penerus". Dua keputusan yang tampak bertolak
belakang untuk dua pertanyaan yang berbeda — dan sesudah A9 keduanya jadi
**aturan yang sama**: daftar slot selalu lengkap, saringan hanya untuk angkanya.

---

## 5. Nol yang tidak dijelaskan adalah jebakan berikutnya

Kalau perbaikan ini berhenti di angka, Laporan akan berbunyi **"Pagu Rp 0"**
tanpa sebab, dan orang pertama yang melihatnya akan melaporkannya sebagai bug —
lalu belajar bahwa angka di layar itu tidak bisa dipercaya.

Jadi sekalian: `LaporanSumber` mendapat penanda bahwa versi aktifnya kosong
karena **dinol-kan**, bukan karena tidak ada datanya, dan Laporan/Dashboard
menuliskannya sebaris. Persis pola yang baru dipakai untuk "belum ada realisasi
yang diisi" di Rekap: angka nol yang tidak lumrah wajib mengatakan kenapa.

Kalimatnya kira-kira: *"Seluruh baris SSK PERUBAHAN-1 dinol-kan, jadi pagu GAJI
tahun ini 0. Kalau maksudnya membatalkan Perubahan itu, hapus versinya di
Pengaturan → Reset, bukan menol-kan barisnya."* — sebab itu memang yang
seharusnya dilakukan orang, dan menyebutkannya lebih berguna daripada
memberitahu bahwa angkanya nol.

---

## 6. Yang ikut berubah, dan perlu Anda tahu

**6.1 Rekap ikut jadi kosong.** Sesudah A8, item Rekap datang dari
`itemSskVersi` yang menyaring `is_nullified = FALSE` — untuk versi yang habis
dinol-kan daftarnya kosong, jadi Rekap menampilkan keadaan-kosong. Kalimatnya
sekarang "Belum ada item SSK untuk tahun X — isi RKO/SSK dulu", dan itu akan
**salah alamat**: SSK-nya ada, cuma dinol-kan semua. Kalimat itu ikut dibedakan.

**6.2 Invarian A8 tetap terjaga.** Grand-total pagu Rekap tetap === `total_pagu`
Laporan; keduanya jadi 0 bersamaan. Itu sekaligus pemeriksaan yang enak dipakai:
kalau salah satu 0 dan yang lain tidak, perbaikannya belum lengkap.

**6.3 Hidrasi realisasi ikut.** `getRealisasiRows` bertanya ke
`versiAktifKinerja`, jadi baris realisasi di tab Realisasi akan berpagu 0 dan
ditandai yatim. Itu keadaan yang benar dan sudah punya spanduknya sendiri —
tapi bagi pemakai perubahannya terasa besar, jadi disebut di sini, bukan
dibiarkan jadi kejutan.

**6.4 Versi yang benar-benar tanpa baris** (0 baris di DB, bisa lahir dari
Simpan kosong berpaksa) tetap tidak muncul di daftar calon — tidak ada barisnya
sama sekali, jadi tidak ada apa pun yang bisa dikelompokkan. Tidak berubah dari
sekarang, dan disebut supaya tidak dikira lupa.

---

## 7. Rencana pembuktian

**Regresi** (`scripts/test-kinerja-rekap.mts`, bab baru) — `pickVersiAktif`
sudah PURE dan diuji, jadi yang perlu ditambah bagian yang selama ini tidak bisa
diuji: aturan "daftar calon lengkap, angka disaring". Kandidatnya dipisah jadi
fungsi PURE (mis. `agregatVersiAktif(daftarVersi, agregat)`) supaya bisa diuji
perilakunya, bukan cuma teksnya — pola yang sudah dipakai `himpunanCanonical`.

- versi habis dinol-kan → tetap terpilih sebagai aktif, agregatnya 0;
- versi dinol-kan SEBAGIAN → terpilih, agregatnya hanya baris tak-nol;
- versi tanpa baris sama sekali → tidak terpilih;
- keempat tempat memakai satu aturan (dihitung kemunculannya, bukan dikutip);
- uji mutasi: kembalikan `AND is_nullified = FALSE` ke kueri pemilih versi →
  harus gagal.

**Di aplikasi**, tahun buangan 2040 — MURNI-0 pagu 7 M + PERUBAHAN-1 habis
dinol-kan, dengan beberapa baris realisasi berisi:

| | Laporan pagu | Rekap pagu | Realisasi |
|---|---|---|---|
| sebelum | 7 M (pagu MURNI) | 7 M | terhitung normal |
| sesudah | 0 | 0 | dilaporkan **yatim** |

Plus: spanduk penjelas muncul, dan angka 7 M tidak tersisa di satu layar pun.

---

## 8. Berkas yang tersentuh (perkiraan)

| Berkas | Perubahan |
|---|---|
| `lib/data/kinerja.ts` | `versiAktifKinerja` melepas saringan; 3 agregat berhenti memilih sendiri; `LaporanSumber` dapat penanda |
| `lib/kinerja/versi.ts` | penolong PURE untuk "ambil agregat versi aktif" |
| `app/(dashboard)/kinerja/_tabs/LaporanTab.tsx` + `DashboardTab.tsx` | spanduk penjelas |
| `app/(dashboard)/kinerja/_tabs/CetakTab.tsx` | kalimat keadaan-kosong dibedakan |
| `scripts/test-kinerja-rekap.mts` | bab baru |

---

## 9. Yang perlu Anda putuskan

**Apakah "nol-kan seluruh baris Perubahan" memang berarti "sumber ini tidak
beranggaran tahun ini"?**

Saya berangkat dari jawaban YA, karena itu satu-satunya bacaan yang membuat
nol-kan berarti apa pun, dan karena membatalkan sebuah Perubahan punya jalannya
sendiri (hapus versinya). Tapi kalau di kantor kebiasaannya justru
"nol-kan semua = anggap Perubahan ini tidak ada, pakai yang lama", maka yang
harus diperbaiki bukan angkanya melainkan **jalannya** — nol-kan borongan
diblokir dan orang diarahkan ke Reset. Dua arah yang sangat berbeda, dan yang
tahu kebiasaannya Anda.
