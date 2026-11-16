# Konsep — Pagu Rencana Aksi dan RKO dipasangkan Murni dengan Murni, Perubahan dengan Perubahan

Status: **DIKERJAKAN** (2026-11-15, keempat saran §6 disetujui — lihat §9). Lanjutan
`docs/konsep/renaksi/CONCEPT-renaksi-pagu-rko.md` (Tahap A'–D sudah terpasang).

## 1. Masalahnya

Pembanding sekarang (`lib/kinerja/pagu-renaksi.ts`) selalu membandingkan:

> Σ pagu RKO **versi terbaru** tiap tab ↔ pagu **berlaku** Rencana Aksi (Perubahan kalau sudah diisi, kalau
> belum Murni)

Kedua sisi punya anggaran murni dan perubahan, tapi tidak saling tahu sedang di mana:

- **Rencana Aksi**: perubahan dimulai sekali per tahun (tombol "Mulai Perubahan"), kolom Perubahan per rincian
  sumber dana, Murni dibekukan.
- **RKO E-Anggaran**: perubahan dibuat per tab (GAJI, BLUD, OBAT, …) lewat "Buat Perubahan", versi Murni
  dikunci.

Akibatnya, kalau urutan kerjanya tidak sama, angka yang dibandingkan salah pasangan:

| Keadaan | Yang dibandingkan sekarang | Yang terjadi |
|---|---|---|
| RKO GAJI sudah perubahan, Rencana Aksi belum | RKO perubahan ↔ pagu **murni** Renaksi | Pagu yang naik di RKO ditahan, pesannya tidak menyebut sebabnya |
| Rencana Aksi sudah perubahan (pagu turun), RKO GAJI masih murni | RKO **murni** ↔ pagu perubahan Renaksi | Simpan Data Entry Renaksi ditahan, padahal urutannya benar: Renaksi dulu, RKO menyusul |
| Menyunting RKO murni sesudah Renaksi masuk perubahan | RKO murni ↔ pagu perubahan | Dokumen murni dinilai dengan batas perubahan |
| RKO murni sudah dikunci | Tidak diperiksa lagi | Kalau Renaksi murni diubah di bawahnya, tidak ketahuan |

## 2. Usulan: dua pembanding

Satu pembanding diganti **dua**. Keduanya tetap per sub kegiatan × sumber dana plus total (aturan §5 konsep
lama tidak berubah):

**Pembanding Murni**
> Σ pagu RKO **versi Murni** tiap tab ↔ pagu **Murni** Rencana Aksi

**Pembanding Perubahan**
> Σ pagu RKO **versi terbaru** tiap tab ↔ pagu **berlaku** Rencana Aksi

Catatan:
- Tab yang belum punya versi perubahan ikut Pembanding Perubahan dengan angka murninya. Ini sama dengan cara
  Renaksi: rincian yang kolom Perubahannya kosong tetap memakai angka Murni. Artinya: "anggaran yang berlaku
  sekarang".
- Selama Renaksi belum mulai perubahan dan belum ada tab RKO yang perubahan, kedua pembanding sama persis.
  Perilaku tahun yang belum berubah anggarannya tidak bergeser sedikit pun.
- Tab yang tidak punya versi Murni (dianggarkan baru di perubahan, mis. OBAT; atau Murninya dihapus lewat
  Reset) menyumbang 0 ke Pembanding Murni.
- Rencana Aksi hanya punya satu perubahan per tahun. RKO PERUBAHAN-2, -3 tetap dibandingkan dengan pagu
  perubahan Renaksi yang satu itu.

## 3. Simpanan mana ditahan pembanding mana

Pagar tetap "hanya yang **baru atau memburuk**" (`pelanggaranBaru`) dan tetap bisa diteruskan dengan alasan.
Yang berubah: tiap simpanan dinilai dengan pembanding yang **sepasang dengannya**.

| Simpanan | Ditahan bila memburuk di | Hanya diberitahukan |
|---|---|---|
| RKO versi Murni | Pembanding Murni | Pembanding Perubahan (bila Renaksi sudah perubahan) |
| RKO versi Perubahan | Pembanding Perubahan | — |
| Rekening (sumber dana / rantai rekening) | Keduanya | — |
| Renaksi, belum mulai perubahan (mengubah Murni) | Keduanya (sama angkanya) | — |
| Renaksi, sudah perubahan (mengubah kolom Perubahan) | Pembanding Perubahan **dihitung dari tab yang sudah perubahan saja** | Pembanding Perubahan lengkap (tab yang masih murni ikut) |
| Hapus indikator & Impor Renaksi | Mengikuti baris Renaksi di atas | |

Baris Renaksi-sudah-perubahan perlu penjelasan. Contohnya: anggaran perubahan memotong sub kegiatan A dari
Rp 15 jt ke Rp 12 jt. RKO GAJI masih murni Rp 14 jt.
- **Sekarang**: mengisi Rp 12 jt di Renaksi ditahan (14 > 12). Orang yang bekerja dengan urutan yang benar
  justru harus mengisi alasan.
- **Usulan**: tidak ditahan, karena GAJI belum perubahan. Muncul pemberitahuan bahwa GAJI masih murni Rp 14 jt
  dan perlu diturunkan sesudah dibuat versi perubahannya. Kalau tab yang **sudah** perubahan sendiri sudah
  melebihi Rp 12 jt, barulah ditahan, karena itu sudah pasti salah.

Langkah sesudahnya: GAJI "Buat Perubahan" menyalin Rp 14 jt (tidak ditahan, angkanya hanya disalin), pita di
RKO langsung merah "melebihi Rp 2 jt". Begitu diturunkan ke Rp 12 jt, pitanya hijau.

## 4. Yang tampil di layar

Kalimatnya dalam bahasa sehari-hari. Kata "babak" tidak dipakai di layar.

**Pita di RKO** (di atas tabel) menyebut pembandingnya:
- Versi murni dibuka: "Dibandingkan dengan pagu murni Rencana Aksi."
- Versi perubahan dibuka, Renaksi sudah perubahan: "Dibandingkan dengan pagu perubahan Rencana Aksi."
- Versi perubahan dibuka, Renaksi **belum** perubahan:
  > Rencana Aksi 2026 belum memasuki anggaran perubahan, jadi RKO perubahan ini masih dibatasi pagu murni.
  > Kalau pagunya memang naik, mulai anggaran perubahan di Rencana Aksi dan isi pagu barunya lebih dulu.

**Dialog "Buat Perubahan" RKO**, bila Renaksi belum perubahan, menambah satu kalimat:
> Rencana Aksi belum memasuki anggaran perubahan. Sampai pagu perubahannya diisi di sana, pagu RKO perubahan
> tetap dibatasi pagu murni.

**Data Entry Renaksi**, bagian "Terpakai di RKO" di editor pagu:
- Kolom Murni: angka dari RKO versi murni.
- Kolom Perubahan: angka dari RKO yang berlaku sekarang. Kalau ada tab yang masih murni:
  > RKO GAJI dan BLUD masih versi murni. Angkanya ikut dihitung di sini sampai dibuatkan versi perubahan di
  > E-Anggaran.
- Bila pagu perubahan lebih kecil dari RKO yang masih murni:
  > Pagu perubahan sub kegiatan ini Rp 12.000.000, sedangkan RKO GAJI (masih versi murni) Rp 14.000.000.
  > Sesudah RKO GAJI dibuatkan versi perubahan, pagunya perlu diturunkan Rp 2.000.000.

**Pesan bila ditahan** (409, dialog alasan) menyebut pembandingnya:
> Pagu RKO melebihi pagu **murni** Rencana Aksi 2026: Pelayanan Kesehatan Jiwa (APBD lebih Rp 2.000.000).
> Sesuaikan angkanya, atau simpan dengan alasan.

dan untuk RKO perubahan saat Renaksi belum perubahan, kalimat dari pita di atas ikut di dialog.

**Audit** `PAGU_RENAKSI_DITEMBUS` menyebut "pagu murni" atau "pagu perubahan".

## 5. Rancangan teknis

Nol tabel, nol kolom, nol migrasi, nol endpoint tulis baru. Semua bahannya sudah ada:
`renaksi_pagu_perubahan` (Renaksi sudah perubahan atau belum), `rencana_aksi_pagu.pagu` /
`pagu_perubahan`, `kinerja_ssk.versi_tipe`.

- `lib/renaksi/pagu.ts`: `paguSubKegiatan(rows, jenis: 'murni' | 'berlaku')`. Yang murni membaca `pagu`
  (bukan `pagu_perubahan ?? pagu`).
- `lib/kinerja/pagu-renaksi.ts` (tetap murni, aman-klien, SATU aturan untuk layar dan server):
  - `versiMurniPerTab` di samping `versiTerbaruPerTab`;
  - `bandingPaguRenaksi` dipakai dua kali; hasilnya `{ murni, perubahan, perubahanKetat, renaksiPerubahan:
    boolean, tabMasihMurni: string[] }`;
  - `pelanggaranBaru(sebelum, sesudah, jenisSimpanan)` memilih pembanding menurut tabel §3.
- `lib/data/pagu-renaksi-rko.ts`: `muatBahanPaguRenaksi` ikut membaca `statusPaguPerubahan` dan baris RKO
  versi murni (kueri `kinerja_ssk` yang sama, tidak bertambah). `pagarPaguRenaksi` menerima `jenisSimpanan`;
  5 pemanggilnya mengoper jenisnya (Simpan RKO tahu versinya, Rekening, Data Entry, Hapus, Impor).
- Layar: `PaguRenaksiPita` (RKO), dialog Buat Perubahan, editor pagu Data Entry, `tanyaAlasanPagu`.
- Kunci tidak berubah: semua jalur tetap memegang `kunciTahunRenaksi` lebih dulu.

## 6. Keputusan yang perlu dijawab

1. **RKO perubahan saat Renaksi belum perubahan.** Saran: **tetap dibatasi pagu murni** (ditahan, bisa
   diteruskan dengan alasan), dengan pesan yang menyebut sebabnya. Pilihan lain: tidak ditahan sama sekali
   sampai Renaksi mulai perubahan. Ini melepas batasnya selama itu.
2. **Renaksi perubahan diturunkan di bawah RKO yang masih murni.** Saran: **hanya diberitahukan**
   (§3, contoh Rp 12 jt). Pilihan lain: tetap ditahan seperti sekarang.
3. **Menyunting RKO murni sesudah Renaksi masuk perubahan.** Saran: dinilai dengan pagu **murni** saja; pagu
   perubahan hanya diberitahukan.
4. **Mengubah pagu murni Renaksi di bawah RKO murni yang sudah dikunci.** Ini hanya mungkin sebelum Renaksi
   mulai perubahan. Saran: **ditahan** (bisa dengan alasan), karena dokumen murni RKO-nya sudah final.

## 7. Yang sengaja tidak

- Tidak ada perubahan kedua di Rencana Aksi.
- Pagu Renaksi tetap tidak diisi otomatis dari RKO, dan sebaliknya.
- "Buat Perubahan" RKO dan "Mulai Perubahan" Renaksi tidak dipagari: keduanya tidak mengubah angka.
- Cetak Renaksi dan LKJIP tidak berubah.

## 8. Uji

Perluasan `scripts/test-renaksi-pagu-rko.mts`:
- **Murni**: keempat baris tabel §1, masing-masing dengan pembanding yang benar.
- **Data**: contoh §3 (Rp 15 jt → 12 jt) dari awal sampai pita hijau.
- **MySQL**: kotak pasir 2075.
- **Uji mutasi**: pemilihan pembanding per jenis simpanan, `versiMurniPerTab`, dan "tab yang sudah perubahan
  saja".

## 9. Yang dikerjakan (2026-11-15)

Nol tabel/kolom/migrasi/endpoint tulis. Aturan murni di `lib/kinerja/pagu-renaksi.ts`:
`versiMurniPerTab`, `tabBerversiPerubahan`, `bandingDua` (murni, perubahan, perubahan-ketat),
`pelanggaranSimpanan(sebelum, sesudah, jenis)` (tabel §3), `labelPembanding`, `kalimatBelumPerubahan`,
`terpakaiRkoSub` (Data Entry). `paguSendiri`/`paguSubKegiatan` (`lib/renaksi/pagu.ts`) menerima
`'murni' | 'berlaku'`. Pemuat `muatBahanPaguRenaksi` membaca `statusPaguPerubahan` + RKO versi murni dari
kueri yang sama; `pagarPaguRenaksi(…, jenis)` dioper oleh kelima jalur (RKO murni/perubahan, Rekening,
Data Entry simpan & hapus, Impor). 409 membawa `catatan`; dialog `tanyaAlasanPagu` menampilkannya.

Layar: pita RKO menyebut pembandingnya dan memakai pembanding murni saat versi murni dibuka (versi murni
terbaru sesudah Renaksi perubahan mendapat pemberitahuan kuning); dialog Buat Perubahan memberi tahu bila
Renaksi belum perubahan (`useBahanPaguRenaksi`, dipakai bersama pita); editor pagu Data Entry menampilkan
RKO versi murni dan RKO yang berlaku terpisah. Kata "babak" diganti "anggaran murni/perubahan" di kalimat
yang tampil ke pengguna (editor pagu, toast, `PESAN_MURNI_BEKU`, galat batal, audit).

Ikut dibereskan: peringatan React "Updating borderTop borderColor" di kepala bulan tabel RKO
(`SskTab.tsx`, shorthand + `borderColor`) setiap tema berganti.

Regresi: `npx tsx --env-file=.env.local scripts/test-renaksi-pagu-rko.mts` (95; bagian G aturan, bagian H
MySQL kotak pasir 2075), 14 uji mutasi tertangkap. Diperiksa di peramban pada 2045 (dibersihkan): pita GAJI
perubahan & BLUD murni, penjelasan "belum memasuki anggaran perubahan" di pita & dialog alasan, dialog Buat
Perubahan, editor pagu (pemberitahuan kuning → merah saat di bawah RKO yang sudah perubahan), simpan 19 jt
tanpa dialog & 17 jt dengan dialog, tema terang. Susulan (hari yang sama): Simpan Rekening (sumber dana
APBD → BLUD) dan Impor Renaksi (berkas unduhan Data Entry + kolom Anggaran, pagu 20 → 10 jt) dicoba di layar
— keduanya menyebut kedua pembanding, tersimpan sesudah alasan diisi, audit mencatatnya.

**Bug lama yang ketahuan saat impor di layar**: pola kolom `target_tahunan` (`/target/i`) ikut menangkap
"Target RPJMD", yang di unduhan Data Entry terletak di kiri "Target Tahunan" — impor-balik unduhan menulis
angka RPJMD ke target tahunan. Kini `rpjmd` dikecualikan (`lib/renaksi/import-renaksi.ts`); uji
`test-renaksi-impor-tautan.mts` A9 memakai RPJMD ≠ tahunan (data uji lama 100 = 100, jadi tak pernah
kelihatan). Kalibrasi `test-renaksi-import.mjs` (matriks Renaksi 2026 asli, 47 baris) tetap lolos.
