# CONCEPT — A8: penyebut Rekap diambil dari SSK, bukan dari baris realisasi

> Temuan A8 dari `docs/AUDIT-kinerja-2026-09-04.md`.
>
> **Nol tabel baru, nol kolom baru, nol migrasi, nol endpoint baru.** Semua
> bahannya sudah ada di DB dan di jalur baca yang sudah berjalan.

---

## 1. Cacatnya dalam satu kalimat

Rekap menghitung pagunya dari `pagu_awal` **baris realisasi**, jadi item SSK yang
belum punya satu pun baris realisasi tidak terlihat olehnya — sementara Laporan
dan Dashboard menjumlah `pagu` dari `kinerja_ssk` dan melihatnya.

Karena yang hilang cuma dari **penyebut**, Rekap melaporkan serapan yang **lebih
tinggi** dari kenyataan. Bukan lebih rendah — dan itu yang membuatnya berbahaya:
angka yang terlalu bagus tidak memancing pertanyaan.

Terukur (dilaporkan di catatan audit, data uji GAJI 2026 dengan satu item
ber-pagu Rp 23.683.980.000 tanpa baris realisasi):

| | Pagu | Realisasi | Serapan |
|---|---|---|---|
| Cetak → Rekap | 50.470.799.000 | 3.693.354.000 | **7,32%** |
| Laporan & Dashboard | 74.154.779.000 | 3.693.354.000 | **4,98%** |

Cara paling lumrah kejadiannya sehari-hari: item SSK ditambahkan **sesudah**
"Init dari SSK" pernah dijalankan, dan Init belum diulang. Selama jeda itu
penyebut Rekap kurang sebesar pagu item baru — dan tidak ada apa pun di layar
yang menyebutkannya.

---

## 2. Keputusan pokok — yang dibetulkan REKAP, bukan Laporan

Arah perbaikannya bisa dibalik: Laporan dikecilkan penyebutnya supaya cocok
dengan Rekap. **Ditolak.** Pagu itu ADA, apakah ada yang mengisi realisasinya
atau tidak; anggaran yang belum tersentuh tetap anggaran. Laporan yang benar.

Turunannya: Rekap butuh daftar item SSK versi aktif, bukan cuma baris realisasi.

---

## 3. Dari mana daftar itu datang — dan kenapa BUKAN endpoint baru

Rekap itu lintas-sumber (satu tabel untuk 8 sumber sekaligus), jadi yang
dibutuhkan daftar item SSK **semua sumber** pada **versi aktif masing-masing**.

Tiga jalan yang dipertimbangkan:

**(a) Endpoint rekap baru di server.** Ditolak. Ia permukaan baru — guard,
sakelar maintenance, gate G, rate limit — untuk sesuatu yang sudah bisa dijawab
jalur yang ada. Dan ia akan memuat SALINAN KEDUA rumus rekap; dua tempat yang
menghitung tabel yang sama pasti berbeda pendapat begitu satu disunting (L78).

**(b) Layar menembak `/api/kinerja/ssk` 8 kali lagi.** Ditolak, dan alasannya
bukan jumlah permintaan. Endpoint itu menerima `versi_tipe`/`versi_seq` dari
klien, jadi layar harus lebih dulu tahu versi aktif tiap sumber lalu bertanya
lagi — **dua jawaban untuk satu pertanyaan "versi mana"**, persis bentuk yang
L88 lahir darinya.

**(c) DIPILIH — `GET /api/kinerja/realisasi` ikut memulangkan item SSK-nya.**
Jalur tanpa parameter versi sudah bertanya ke `versiAktifKinerja` dan sudah
memulangkan `versi` di balasan yang sama. Menyertakan daftar itemnya di balasan
itu juga berarti **versi dan isinya lahir dari satu jawaban** — mustahil
berselisih. `fetchRealisasiAll` sudah memanggilnya 8 kali; nol permintaan
tambahan.

Bentuk barunya:

```ts
export interface ItemSskAktif {
  canonical_id: string;
  program: string; kegiatan: string; subkegiatan: string;
  uraian_ssk: string; uraian: string;
  pagu: number;
  months: SskMonths;
}
// GET /api/kinerja/realisasi?tahun&sumber  →  { ok, rows, versi, itemSsk }
```

`months` ikut karena target "s/d bulan N" hanya bisa dihitung sesudah orang
memilih bulannya, dan bulan itu keadaan di layar. Ukurannya kecil: pada data
2026 satu sumber 15 item; 8 sumber di kisaran ratusan item — jauh di bawah baris
realisasinya sendiri (180 baris × 25 kolom per sumber) yang sudah dikirim.

Kueri SSK-nya **tidak baru**: `getRealisasiHydrated` sudah membaca
`canonical_id, pagu, months` dari versi yang sama untuk membangun peta
hidrasinya. Yang berubah cuma kolom hierarkinya ikut diambil, dan hasilnya
dipakai dua kali — satu fungsi, bukan dua SELECT yang bisa berbeda saringan.

---

## 4. Apa yang berubah di `hitungRekap`

```
sekarang:  hitungRekap(rows, sdBulan, kedalaman, label)
nanti:     hitungRekap(rows, itemSsk, sdBulan, kedalaman, label)
```

`kumpulkanItem` berhenti melahirkan item dari baris realisasi. Urutannya jadi:

1. **Semai** dari `itemSsk`: pagu, hierarki, dan target = Σ `months[1..sdBulan]`,
   realisasi 0.
2. **Lipat** baris realisasi ke dalamnya lewat `canonical_id`.
3. Baris yang canonical-nya tidak ada di semaian → **yatim**, seperti sekarang.

Parameternya WAJIB, bukan opsional bernilai bawaan `[]`. Bawaan diam-diam
mengembalikan cacatnya di pemanggil yang lupa disesuaikan, dan cacat ini justru
yang tidak menyalakan apa pun.

### Tiga perubahan angka yang ikut terjadi — semuanya disengaja

**4.1 Pagu.** Item tanpa baris realisasi kini masuk penyebut. Ini inti temuannya.

**4.2 Target.** Sekarang target diakumulasi dari `target_rp` baris realisasi yang
KEBETULAN ada; nanti dari `months` SSK. Untuk item yang barisnya lengkap 12
bulan (hasil "Init dari SSK") hasilnya **sama persis** — `target_rp` memang
dihidrasi dari `months` yang sama. Bedanya muncul pada item yang barisnya tidak
lengkap: hari ini targetnya ikut menyusut mengikuti baris yang ada, nanti tidak.
Yang benar yang nanti: target itu **rencana**, dan rencana tidak hilang karena
tidak ada yang membuat barisnya.

**4.3 Label hierarki.** Nama program/kegiatan/sub-kegiatan/uraian di Rekap kini
ikut SSK versi aktif, bukan salinan yang tersimpan di baris realisasi saat Init.
Keduanya sama sampai ada yang membetulkan nama di SSK tanpa Init ulang — dan
sesudah itu yang benar tetap SSK. Sepupu keputusan A4 dan A3.

---

## 5. Invarian yang dipakai untuk membuktikannya

> **Grand-total pagu Rekap === Σ `total_pagu` Laporan atas seluruh sumber**,
> untuk bulan mana pun yang dipilih.

Pagu itu tahunan, jadi ia tidak bergerak mengikuti pilihan bulan — itu yang
membuatnya jangkar yang enak dipakai. Invarian ini yang diuji, bukan sekadar
"angkanya berubah".

Satu syarat yang membuatnya sah dan perlu ditulis: Laporan menjumlah pagu per
**baris** SSK, Rekap per **item**. Keduanya sama hanya kalau satu `canonical_id`
tidak bisa muncul dua kali dalam satu versi — dan itu baru benar-benar dijamin
sejak `uq_ks_canonical_versi` dipasang di A6.

---

## 6. Yang SENGAJA tidak diubah

**6.1 Pemilih bulan tetap dari baris realisasi** (`bulanTersedia`). Akibatnya:
kalau di satu tahun tidak ada SATU pun baris realisasi di seluruh sumber, Rekap
tetap kosong walau SSK-nya berisi. Membuatnya menawarkan Jan–Des tanpa syarat
adalah perubahan UX tersendiri (dan pertanyaan tersendiri: apakah "Rekap s/d
Agustus" yang seluruhnya nol itu dokumen yang berguna atau menyesatkan). Di luar
cacat ini. **Kalau Anda mau ikut, katakan — perubahannya kecil, tapi keputusannya
bukan milik saya.**

**6.2 Pengelompokan lintas-sumber tetap lewat `canonical_id` saja.**
`identitas()` di `rekap.ts` sengaja sama persis dengan groupKey
`recalcAllRealisasi`, dan `fetchRealisasiAll` sudah memanggil recalc itu pada
larik campuran 8 sumber. Menambahkan sumber ke kuncinya di satu tempat saja akan
membuat dua tempat mengelompokkan hal yang berbeda. Aman karena `canonical_id`
memang unik lintas sumber (`K-<id>` dari AUTO_INCREMENT, atau
`K-<base36>-<acak>`), tapi itu jaminan konvensi — dicatat di sini supaya kalau
pembangkitnya berubah, orang tahu apa yang ikut runtuh.

**6.3 Baris yatim tetap dikeluarkan dari hitungan dan dilaporkan terpisah**
(§9.1a BLUD). Sesudah perbaikan ini yatim jadi lebih jarang — item yang "hilang"
karena belum di-Init tidak pernah jadi yatim sejak awal — tapi yatim yang
sesungguhnya (canonical dihapus dari versi aktif) tetap ada dan tetap dilaporkan.

**6.4 Pengekspor tidak disentuh.** `rekapAoa`/`exportRekapExcel`/`exportRekapPdf`
menerima `rekap.baris` yang sudah dihitung, jadi mereka ikut benar tanpa satu
baris pun berubah. Itu memang gunanya keputusan lama "yang diunduh menerima
angka yang sudah dihitung, bukan menghitung ulang".

---

## 7. Rencana pembuktian

**Regresi** (`scripts/test-kinerja-rekap.mts`, bab baru):

- item SSK tanpa baris realisasi ikut penyebut, realisasinya 0;
- pagu grand-total = Σ pagu item SSK, tidak bergerak saat bulan diganti;
- target = Σ `months[1..sdBulan]`, dan **sama persis** dengan hasil lama untuk
  item yang barisnya lengkap 12 bulan (kalau ini bergeser, ada yang salah);
- baris realisasi tanpa pasangan SSK tetap yatim, tidak menyelinap jadi item;
- hierarki diambil dari SSK, bukan dari salinan di baris realisasi;
- uji mutasi: kembalikan `pagu: r.pagu_awal` → penyebutnya harus jatuh lagi.

**Di aplikasi**, pada tahun buangan 2040:

1. SSK 2 item (pagu A + pagu B), realisasi di-Init lalu **hapus** baris item B;
2. sebelum: Rekap berpenyebut A saja, Laporan A+B;
3. sesudah: keduanya A+B, dan serapannya sama sampai dua desimal;
4. invarian §5 diperiksa lewat `GET /api/kinerja/laporan` vs grand-total Rekap.

Angka Rp 23.683.980.000 di §1 berasal dari sesi sebelumnya dan **tidak bisa
diulang sekarang** — data ujinya sudah dibersihkan (GAJI 2026 kini 15 baris SSK
tanpa satu pun baris realisasi). Yang akan saya laporkan angka dari percobaan
2040 di atas, bukan angka lama itu.

---

## 8. Berkas yang tersentuh

| Berkas | Perubahan |
|---|---|
| `lib/data/kinerja.ts` | `itemSskVersi()` + `getRealisasiRows` memulangkan `itemSsk`; `getRealisasiHydrated` memakai fungsi yang sama untuk peta hidrasinya |
| `app/api/kinerja/realisasi/route.ts` | `itemSsk` ikut di balasan GET jalur versi-aktif |
| `app/(dashboard)/kinerja/kinerja-client.tsx` | `fetchRealisasiAll` mengumpulkan `itemSsk`, dioper ke CetakTab |
| `app/(dashboard)/kinerja/_tabs/CetakTab.tsx` | prop baru + argumen `hitungRekap` |
| `lib/kinerja/rekap.ts` | `kumpulkanItem` menyemai dari item SSK; `laporanYatim` dipisah (lihat bawah) |
| `scripts/test-kinerja-rekap.mts` | bab baru |
| `app/(dashboard)/kinerja/_tabs/RealisasiTab.tsx` | spanduk yatim pindah ke `laporanYatim` |

### Pemanggil kedua yang hampir terlewat

`hitungRekap` memang cuma dipanggil CetakTab. Tapi `kumpulkanItem` punya
pemanggil KEDUA: `RealisasiTab.tsx:315` — `kumpulkanItem(realisasiRows, 12).yatim`,
yang cuma mengambil bagian yatimnya untuk spanduk di tab Realisasi.

Kalau `kumpulkanItem` diberi parameter wajib, pemanggil itu ikut harus menyodorkan
daftar item SSK yang **tidak ia butuhkan sama sekali**. Jadi bagian yatimnya
dipisah lebih dulu:

```ts
export function laporanYatim(rows: RealRow[], sdBulan: number): LaporanYatim
```

`kumpulkanItem` memanggilnya di dalam — satu aturan, dua pintu masuk. Spanduk itu
menjawab pertanyaan yang memang tidak berhubungan dengan penyebut ("ada uang
keluar tanpa pagu yang menaunginya"), jadi memisahkannya bukan cuma kenyamanan.

L69 lewat pintu yang sama seperti biasa: yang terlewat selalu yang tidak sedang
dilihat. Pemanggil kedua ini ketemu karena daftarnya dicari, bukan diingat.
