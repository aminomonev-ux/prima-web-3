# CONCEPT — Memilih versi SSK saat mencetak Rekap

> Jawaban atas pertanyaan pemilik aplikasi: *"membuat perubahan tetapi data yang
> murni masih ada, jadi nanti di rekap ada milih versi murni dan perubahan, biar
> mudah — gimana menurut anda? mudah mana?"*
>
> **Nol tabel, nol kolom, nol migrasi, nol endpoint baru.**

---

## 1. Pertanyaannya

Perubahan anggaran terjadi di tengah tahun — **tidak selalu Agustus, sering
Oktober**. Sesudah itu ada dua dokumen yang dua-duanya sah: RKO murni dan RKO
perubahan. Layar Cetak → Rekap sekarang selalu mengukur ke **versi berlaku**
(yang terbaru), jadi angka sebelum perubahan tidak bisa dicetak lagi — padahal
datanya masih utuh di basis data.

Dua jalan yang sudah dibahas:

- **(A) Pemilih versi** — orang memilih; data murni masih ada, tinggal ditawarkan.
- **(B) Bulan berlaku** — versinya ditentukan otomatis dari bulan periode laporan.

Konsep ini memilih **(A) sekarang, (B) ditunda**. Alasannya di §5.

---

## 2. Yang SUDAH ada — dan ini yang menentukan jawabannya

Diperiksa di kode, bukan diperkirakan:

1. **Tiap versi itu dokumen UTUH, bukan selisih.**
   `app/api/kinerja/ssk/perubahan/route.ts` menyalin SELURUH baris versi sumber
   — `canonical_id`, `pagu`, `months` (12 target rupiah), `months_pct`, `total`,
   `urut` — jadi baris baru ber-`versi_tipe='PERUBAHAN'`. Versi sumber hanya
   di-`locked_at`, **tidak dihapus**. Jadi MURNI-0 tetap lengkap selamanya.
2. **Jalur baca per versi sudah ada.**
   `getRealisasiHydrated(tahun, sumber, versiTipe, versiSeq)` dan
   `itemSskVersi(tahun, sumber, versiTipe, versiSeq)` sudah menerima versi
   eksplisit, dan `GET /api/kinerja/realisasi?versi_tipe=&versi_seq=` sudah
   memulangkan `{ rows, itemSsk, versi, version }` untuk versi mana pun —
   pagu & targetnya sudah dihidrasi dari versi itu. Dibangun waktu Checkpoint A,
   dilengkapi A8.
3. **Daftar versinya sudah ada**: `app/api/kinerja/ssk/versi-list` (yang
   mengisi dropdown "MURNI · 15 baris · LATEST" di tab RKO).
4. **Spanduk yatim + catatannya sudah ikut ke Excel dan PDF** (A8 + opsi 3).

Artinya bagian yang mahal sudah terbangun. Yang belum ada cuma satu: layar Cetak
tidak pernah MEMINTA versi selain yang berlaku.

---

## 3. "Pagu bisa bertambah atau bergeser" — tidak butuh apa pun yang baru

Karena tiap versi adalah dokumen utuh (§2.1), seluruh bentuk perubahan pagu
sudah tersimpan apa adanya:

| Yang terjadi di Perubahan | Tersimpannya bagaimana | Perlu tambahan? |
|---|---|---|
| Pagu item **bertambah** (40 M → 50 M) | angka `pagu` yang berbeda di baris versi itu | tidak ada |
| Pagu **bergeser** (A 40→30, B 20→30) | dua baris dengan angkanya masing-masing | tidak ada |
| Target bulanannya ikut berubah | `months` disalin lalu disunting per versi | tidak ada |
| **Item baru** muncul di Perubahan | ada di PERUBAHAN-1, tidak ada di MURNI-0 | tidak ada — §3.1 |
| Item **dinol-kan / dihapus** di Perubahan | `is_nullified` / barisnya tidak ikut disalin | **A9 dulu** — §3.2 |

Memilih versi = memilih SATU set angka yang lengkap. Tidak ada penjumlahan
selisih, tidak ada penggabungan dua dokumen — dan justru itu yang membuatnya
aman.

### 3.1 Item yang cuma ada di satu versi

Mencetak Rekap **versi murni** untuk tahun yang sudah berperubahan: item yang
lahir di Perubahan tidak punya pagu di dokumen murni, jadi baris realisasi yang
menunjuknya jadi **yatim**.

Itu **bukan cacat, itu jawaban yang benar** — belanja itu memang tidak punya
rumah di dokumen murni — dan alat untuk mengatakannya sudah ada: spanduk yatim
di layar plus catatan yang ikut ke Excel dan PDF. Uangnya tidak lenyap, ia pindah
ke tempat yang memang menerangkannya. Kebalikannya (diam-diam dihitung ke pagu
murni) itulah yang berbahaya, dan itu sudah dicegah A8.

### 3.2 Kenapa A9 harus lebih dulu

A9: versi yang SELURUH barisnya dinol-kan hilang dari daftar calon, lalu versi
SEBELUMNYA diambil sebagai "berlaku". Selama itu belum dibetulkan, pemilih versi
berdiri di atas daftar versi yang salah — dan pemilih yang menawarkan pilihan
berbohong cuma memindahkan kebohongannya ke tempat yang lebih terlihat.

Tambahan: keduanya menyentuh EMPAT tempat yang sama (`versiAktifKinerja` +
3 agregat di `getLaporanData`/`getLaporanSemua`/`getKinerjaKpi`). Dibalik
urutannya, kode yang sama disunting dua kali.

---

## 4. Bentuknya

**Dua keadaan, bukan pemilih per sumber.** Rekap menjumlah SEMUA sumber sekaligus
(GAJI, BLUD, HARLEP, …) dan tiap sumber punya riwayat versinya sendiri — GAJI
bisa sudah PERUBAHAN-1 sementara BLUD masih MURNI-0. Jadi:

- **"Versi berlaku"** (bawaan) — perilaku sekarang: tiap sumber pakai versi
  terbarunya.
- **"Versi murni"** — tiap sumber pakai MURNI-0-nya.

Sumber yang belum punya Perubahan memberi angka yang SAMA di kedua pilihan, jadi
pilihan ini tidak pernah menyesatkan untuk sumber itu.

**Bawaannya "versi berlaku"**: jawaban yang benar didapat tanpa memilih apa pun,
dan pilihan yang lain butuh tindakan sengaja.

**Versinya WAJIB tertulis di tiga tempat**: kop dokumen (tempatnya sudah ada —
"Pagu & target mengacu SSK versi aktif tiap sumber" jadi menyebut versinya),
label di layar, dan **nama berkas** unduhan. Tanpa itu dua cetakan "rekap yang
sama" bisa berbeda angka tanpa penjelasan — cacat yang lebih buruk daripada yang
sedang diperbaiki. Ini L83 lewat pintu yang sama: label yang menyebut identitas
data wajib ikut bergeser saat datanya bergeser.

**Yang sengaja TIDAK dikerjakan**: memilih PERUBAHAN-1 saat PERUBAHAN-2 sudah
ada. Kalau nanti perlu, pemilihnya tinggal jadi daftar versi penuh — jalur
bacanya sudah menerima `versi_seq` apa pun, jadi tidak ada yang harus dibongkar.

**Laporan / KPI / Dashboard TIDAK dapat pemilih**: pertanyaan di sana "sekarang
bagaimana", dan itu satu jawaban. L88 tetap utuh — satu jawaban otomatis di
mana-mana, satu penyimpangan eksplisit di satu tempat yang memang mencetak
dokumen.

---

## 5. Kenapa "bulan berlaku" (B) DITUNDA

Tiga alasan, dan yang pertama datang dari pemilik aplikasi sendiri:

1. **Bulannya berpindah-pindah** — sering Oktober, tidak selalu Agustus. Jadi
   `berlaku_dari` adalah **pernyataan yang harus diketik dengan benar** tiap
   tahun, tiap sumber. Salah ketik = laporan salah tanpa satu gejala pun.
   Pemilih versi tidak menuntut pernyataan apa pun; ia cuma menawarkan yang
   sudah ada di basis data.
2. **Laporan lama bisa berubah sendiri.** Menyunting bulan berlaku mengubah
   angka laporan yang sudah dicetak dan ditandatangani. Pemilih versi tidak
   pernah begitu — yang berubah cuma yang sedang dipilih orang di depan layar.
3. **Ia bukan jalan lain, ia tahap kedua dari jalan yang sama.** "Bulan → versi"
   mustahil tanpa lebih dulu bisa mencetak dari versi yang BUKAN versi berlaku.
   Jadi mengerjakan pemilihnya dulu tidak terbuang sedikit pun kalau nanti
   otomatisasinya tetap dibuat.

Perbandingan biayanya:

| | (A) Pemilih versi | (B) Bulan berlaku |
|---|---|---|
| Kolom / migrasi | 0 | 1 kolom + 1 migrasi |
| Endpoint baru | 0 (jalur bacanya sudah ada) | 0, tapi 4 agregat disunting |
| Yang disunting | Cetak → Rekap + pemuat datanya | `versiAktifKinerja` + 3 agregat + Buat Perubahan + semua kop |
| Data baru yang harus dijaga orang | tidak ada | bulan berlaku, per sumber, tiap tahun |
| Perubahan pindah bulan (Agu → Okt) | ikut sendiri | harus diubah manual |
| Laporan lama bisa berubah sendiri | tidak | bisa |
| Salah pilih mungkin? | ya, kalau diubah dari bawaan (kop menyebut versinya) | tidak |

**Kapan (B) layak dibuka lagi**: kalau sesudah dipakai beberapa bulan ternyata
orang lupa memindah pilihan dan berulang kali mencetak dengan versi yang salah.
Itu gejalanya. Sebelum gejalanya ada, `berlaku_dari` cuma kolom yang menuntut
perawatan.

---

## 6. Rencana pembuktian

**Regresi** (`scripts/test-kinerja-rekap.mts`, bab baru):

- `hitungRekap` dengan `itemSsk` versi MURNI vs versi PERUBAHAN pada baris
  realisasi yang SAMA → pagu & target berbeda, realisasi identik (membuktikan
  yang berganti cuma penyebutnya);
- item yang hanya ada di PERUBAHAN → yatim saat versi murni dipilih, dan
  nominalnya masuk laporan yatim (bukan hilang);
- sumber tanpa Perubahan → kedua pilihan memberi angka sama;
- bawaannya "versi berlaku" (dihitung kemunculannya, bukan dikutip sepotong — L82c);
- versinya ikut ke kop, layar, dan nama berkas — ketiganya diperiksa terpisah;
- uji mutasi: paksa pemuat data memakai versi berlaku walau pilihan "murni" →
  harus gagal; buang versi dari nama berkas → harus gagal.

**Di aplikasi**, tahun buangan 2040: MURNI-0 pagu 7 M dan PERUBAHAN-1 pagu 10 M
(sebagian bergeser, satu item baru), dengan beberapa baris realisasi berisi.

| Pilihan | Pagu Rekap | Realisasi | Yatim |
|---|---|---|---|
| Versi berlaku | 10 M | sama | 0 |
| Versi murni | 7 M | sama | item baru dilaporkan yatim |

Plus: Excel & PDF menyebut versinya di kop DAN di nama berkas, dan invarian A8
(grand-total pagu Rekap === Σ `total_pagu` Laporan) tetap berlaku untuk pilihan
"versi berlaku".

---

## 7. Berkas yang tersentuh (perkiraan)

| Berkas | Perubahan |
|---|---|
| `app/(dashboard)/kinerja/_tabs/CetakTab.tsx` | pemilih 2 keadaan + label versi di layar |
| `app/(dashboard)/kinerja/kinerja-client.tsx` | `fetchRealisasiAll` mengirim `versi_tipe`/`versi_seq` per sumber |
| `app/(dashboard)/kinerja/_exports.ts` | versi di kop + nama berkas Excel/PDF |
| `lib/kinerja/versi.ts` | penolong PURE "pilihan → versi per sumber" |
| `scripts/test-kinerja-rekap.mts` | bab baru |

Nol berkas di `lib/data/kinerja.ts`, nol route, nol migrasi.

---

## 8. Urutan yang diusulkan

1. **A9** — pagu 0 + keterangannya (bacaan A). Angka yang salah HARI INI, dan
   prasyarat supaya pemilih versi bisa dipercaya.
2. **Pemilih versi di Cetak → Rekap** — konsep ini.
3. **Bulan berlaku** — ditunda, dibuka lagi hanya kalau gejalanya muncul (§5).
