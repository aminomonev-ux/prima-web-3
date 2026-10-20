# CONCEPT — Beranda IKI dikelompokkan per tahun (2 pilihan)

> Status: **dieksekusi 2026-10-20** — pilihan **B** (§4, keputusan §7, pelaksanaan §8).
> Berkas yang berubah: `app/(dashboard)/iki/iki-client.tsx` + `lib/data/iki.ts` (`listDokumen`, `duplicateDokumen`) + route duplikat. Nol migrasi.
> Varian CUSTOM (`docs/CONCEPT-iki-custom.md`) **ditunda** — dikerjakan sesudah beranda ini.

## 1. Keadaan sekarang dan masalahnya

Alur: Beranda (2 kartu folder **IKI Murni / IKI Perubahan** + pilihan tahun) → buka folder → 3 kotak KPI → pencarian + pilihan tahun + kartu/daftar → kartu dokumen.

1. **Tahun bercampur.** Pilihan tahun bawaannya "Semua tahun". Begitu dokumen 2027 dibuat (lewat Duplikat atau Buat IKI), 20 kartu 2026 dan 20 kartu 2027 tampil dalam satu kisi yang sama, dibedakan hanya oleh angka kecil di pojok kartu.
2. **Murni dan Perubahan terpisah folder.** Jabatan yang sama punya dua dokumen di dua tempat. Untuk menjawab "Kasubbag Program sudah punya Perubahan belum?" orang harus bolak-balik folder.
3. **Kartu boros tempat.** Di layar 1.750 px cuma 6 kartu terlihat; 20 dokumen = 4 kali gulir. Kartu mengulang informasi yang sama di tiap dokumen (tahun, PERUBAHAN, DRAFT).
4. **Hubungan atasan tidak terlihat**, padahal datanya lengkap: 20/20 dokumen 2026 tertaut ke dokumen atasannya (`atasan_dokumen_id`), 4 tingkat — Direktur → 2 Wadir → 6 Kabag/Kabid → 11 Kasubbag/Kasie.
5. **Tidak ada yang memberi tahu siapa yang belum.** Menjelang 2027, pertanyaan utamanya "jabatan mana yang belum punya IKI 2027?" — tidak terjawab di mana pun.

## 2. Yang sama di kedua pilihan

- **Folder Murni/Perubahan dihapus** sebagai halaman; jenis jadi pilihan di dalam tahun. Satu klik lebih sedikit.
- **Tahun jadi kelompok utama**, tahun terbaru di atas/terpilih. Tahun dibaca dari data (`tahunList`), bukan daftar mati.
- Tahun & jenis yang sedang dibuka disimpan di URL (`/iki?tahun=2026&jenis=PERUBAHAN`) — tombol Kembali dari editor pulang ke tempat yang sama.
- **Pencarian lintas tahun**; hasilnya tetap dikelompokkan per tahun.
- Tetap ada: Pilih (hapus massal), Unduh Zip (kini **per tahun**, tahunnya tidak perlu dipilih lagi), Import Excel, Buat IKI (tahun bawaan = tahun yang sedang dibuka), Duplikat, Hapus, tema terang/gelap, lebar ponsel ≤ 560 px.
- Lencana yang sama untuk semua baris (mis. tahun) tidak diulang di tiap dokumen.

## 3. Pilihan A — "Rak per tahun"

Halaman berisi deretan **rak tahun** yang bisa dibuka-tutup (accordion). Tahun terbaru terbuka, sisanya tertutup.

- **Kepala rak:** `2027` · 12 dokumen · bilah kemajuan FINAL (mis. 3/12) · tombol Unduh Zip & Buat IKI untuk tahun itu.
- **Di dalam rak:** pilihan **Murni | Perubahan** (dengan jumlah masing-masing), lalu daftar dokumen **ringkas** — satu baris per dokumen: inisial, jabatan, nama, NIP, jumlah RHK, status, aksi. Kira-kira 3× lebih padat dari kartu sekarang.
- Urutan: mengikuti tautan atasan (bawahan langsung di bawah atasannya), tanpa garis pohon.
- Tampilan kartu tetap tersedia lewat sakelar Kartu/Daftar.

**Kelebihan:** paling dekat dengan yang sekarang, paling sedikit kerja, tidak perlu mengubah API.
**Kekurangan:** Murni dan Perubahan jabatan yang sama tetap di dua tab; "siapa yang belum" tetap tidak terjawab.

## 4. Pilihan B — "Pohon jabatan per tahun"

Dua panel: **rel tahun** di kiri, **tabel pohon** di kanan.

- **Rel tahun** (kiri): `2027 · 12/20`, `2026 · 20/20`, … — angka = dokumen yang ada dibanding jabatan tahun sebelumnya. Di ponsel rel jadi deretan pil di atas.
- **Tabel pohon** (kanan): satu baris per **jabatan**, menjorok mengikuti tautan atasan (Direktur → Wadir → Kabag/Kabid → Kasubbag/Kasie), tiap tingkat bisa dilipat. Kolom: Jabatan & nama · NIP · **Murni** · **Perubahan**. Sel Murni/Perubahan berisi status (DRAFT/FINAL + jumlah RHK) dan bisa diklik untuk membuka dokumennya; kosong = tombol "+ Buat".
- **Baris "belum ada"**: jabatan yang punya dokumen di tahun sebelumnya tapi belum di tahun ini tampil pudar dengan tombol **Salin dari 2026** (memakai `duplicate` yang sudah ada — ia sudah menyelesaikan atasan lewat NIP di tahun tujuan). Ini yang menjawab "jabatan mana yang belum punya IKI 2027".
- Kepala tabel: kemajuan tahun itu (`12 dari 20 jabatan · 3 FINAL`) + Unduh Zip + Buat IKI.
- Dokumen tanpa atasan tertaut dikumpulkan di bawah kelompok **"Belum tertaut ke atasan"** — tidak disembunyikan.
- Pencarian: baris yang cocok tampil **beserta atasannya** supaya letaknya di pohon tetap terbaca.

**Perubahan data:** `listDokumen` ikut mengembalikan `atasan_dokumen_id` (kolomnya sudah ada). Pencocokan jabatan antar-tahun untuk baris "belum ada": **NIP + jabatan** dulu, cadangan jabatan yang dinormalkan (tanpa "Plt.", spasi/kapital disamakan) — dan harus diuji pada data nyata, karena nama jabatan bisa berganti antar-tahun.

**Kelebihan:** Murni & Perubahan satu baris; susunan sama dengan cara IKI berjenjang; "siapa yang belum" terlihat sekali pandang; paling hemat tempat (20 jabatan muat satu layar).
**Kekurangan:** kerja lebih banyak; butuh tata letak ponsel tersendiri (rel → pil, kolom NIP disembunyikan).

**Opsional sesudahnya:** "Salin semua yang belum ada dari 2026" sekaligus — harus menyalin **dari atas ke bawah** (atasan dulu), kalau tidak tautan atasan bawahan tidak ketemu di tahun tujuan.

## 5. Rekomendasi

**B.** Masalah yang dikhawatirkan muncul justru saat 2027 mulai diisi, dan B satu-satunya yang menunjukkan jabatan mana yang belum dibuat. A cocok bila yang dicari cuma "tahun tidak bercampur" dengan kerja sesingkat mungkin.

## 6. Temuan saat menimbang "Salin dari 2026" — Duplikat salah jenis

`duplicateDokumen` (`lib/data/iki.ts`) selalu menyalin **jenis yang sama** dengan sumbernya. Data 2026 seluruhnya PERUBAHAN (20/20), jadi menyalinnya ke 2027 menghasilkan 20 dokumen **2027 PERUBAHAN** — padahal tahun baru semestinya dibuka dengan MURNI, dan sumber terbaiknya justru dokumen Perubahan tahun lalu (versi terakhir yang berlaku). Sekarang pun tombol Duplikat di kartu sudah begitu — jalan keluarnya ada (isian "Jenis Dokumen" di editor bisa diganti sesudahnya), tapi harus diingat 20 kali, dan selama belum diganti dokumennya tercetak berjudul "… PERUBAHAN". B membuat tombol ini lebih sering ditekan.

Usulan perbaikan, ikut tahap ini karena tombol B bergantung padanya:
- Route duplikat menerima `jenis_target` (opsional; tanpa itu perilakunya sama dengan sekarang, supaya tab lama tidak berubah arti).
- Tombol "Salin dari 2026" di kolom **Murni** mengirim `jenis_target: 'MURNI'`, dan sumbernya dokumen Perubahan tahun lalu bila ada, kalau tidak Murni tahun lalu.
- Penaut atasan memilih dokumen atasan berjenis sama di tahun tujuan. Sekarang ia mencari lewat NIP saja dengan `LIMIT 1`, jadi bila atasan punya Murni **dan** Perubahan di tahun tujuan, yang tertaut acak.
- Sel **Perubahan** yang kosong: "+ Buat" menawarkan "Salin dari Murni tahun ini". Ini butuh duplikat di tahun yang SAMA, yang sekarang ditolak ("Tahun tujuan sama dengan tahun sumber") — boleh selama jenisnya berbeda.

## 7. Keputusan (2026-10-20)

1. **B.**
2. Tampilan **kartu tetap ada sebagai pilihan, bukan bawaan.** Halaman selalu terbuka di Pohon. Pilihan Kartu tidak diingat antar-kunjungan; kalau diingat, sekali memilih Kartu membuatnya jadi bawaan bagi orang itu.
3. Varian CUSTOM menyusul sesudah beranda ini.
4. "Salin semua yang belum ada" — **menunggu jawaban** (usulan: menyusul; tombol per baris sudah menjawab kebutuhan awal tahun).
5. §6 — `jenis_target` + salin Murni → Perubahan di tahun yang sama: **menunggu persetujuan**.

## 8. Pelaksanaan (2026-10-20)

Keputusan §7 butir 4 & 5 dijawab pemilik: **Salin semua ikut tahap ini**, `jenis_target` disetujui. Tambahan permintaan: **Unduh Zip mengikuti centang** — bila ada dokumen yang dicentang lewat Pilih, zip hanya berisi itu (saringan jenis/FINAL tidak berlaku).

| Berkas | Isi |
|---|---|
| `lib/iki/beranda.ts` (MURNI) | `normJabatan`, `tahunSumber`, `rencanaSalinTahun`, `pilihDokumenAtasan`, `susunPohon`, `ringkasPohon`, `saringPohon`, `dokumenZip`, `jalurZip` — dipakai layar DAN server |
| `lib/data/iki.ts` | `listDokumen` + `atasan_dokumen_id`; `duplicateDokumen(…, jenisTarget?)` → `{ id, atasanLepas }`; `salinTahun`; `galatDuplikatDikenal` |
| `app/api/iki/salin-tahun/route.ts` (baru) | POST, `guard()` (sakelar + beku), Zod `SalinTahunSchema`, rate limit 3/menit, satu audit `IKI_CREATE` |
| `app/(dashboard)/iki/iki-client.tsx` + `PohonIki.tsx` (baru) | rel tahun, tabel pohon, Kartu sebagai pilihan, `?tahun=` lewat `history.replaceState` |
| `app/(dashboard)/iki/[id]/editor-client.tsx` | Kembali → `/iki?tahun=<tahun dokumen>` |

**Temuan saat dijalankan pada data nyata — cacat lama Duplikat:** dr. Retno Wuryan memegang dua jabatan (Plt. Wadir Pelayanan + Kabid Pelayanan Medis). Penaut atasan mencari dokumen atasan lewat NIP saja dengan `LIMIT 1`, jadi menyalin 2026 → tahun baru menautkan Kabid Penunjang (dan dua Kasie-nya) ke **Kabid Pelayanan Medis**, bukan ke Wadir — 3 dari 20 baris salah tempat di pohon. Kini `pilihDokumenAtasan`: jabatan atasan lama harus cocok (tanpa "Plt."); orang yang hanya punya satu jabatan di tahun tujuan dianggap pindah jabatan; lebih dari satu jabatan tanpa yang cocok = tidak ditautkan (masuk "Belum tertaut", tidak ditebak). Dibuktikan: salinan 20 dokumen 2026 ke kotak pasir menghasilkan pohon yang **sama persis** dengan 2026 (sebelum perbaikan: 3 baris beda).

**Yang perlu diketahui pemakai:** "Salin dari 2026" per baris pada bawahan yang atasannya belum punya IKI tahun itu menghasilkan dokumen tanpa tautan atasan (toast menyebutnya, barisnya tampil di "Belum tertaut"). "Salin semua" tidak menautkan ulang dokumen yang sudah ada — ia hanya membuat yang belum ada; tautan dokumen lama dipasang lewat isian Atasan di editor. Rel tahun menampilkan tahun data + tahun berjalan + satu tahun sesudah tahun data terakhir.

Ikut dibereskan: bilah atas halaman IKI meluap 19 px di lebar 375 px (keterangan "Indikator Kinerja Individu" + lencana pengguna) — keterangan disembunyikan ≤ 560 px; nama jabatan di ponsel boleh dua baris.

Regresi: `npx tsx scripts/test-iki-beranda.mts` (74 — bagian J memakai MySQL kotak pasir 2091–2093 lewat fungsi asli, bersih sendiri), **26 uji mutasi tertangkap**. Dua mutan awal tidak sah dan diganti (satu tidak merusak karena kunci cadangan masih memisahkan baris; satu menunjuk syarat urutan yang ternyata mubazir — syaratnya dibuang dari kode). Diverifikasi di peramban pada salinan 2026 di 2097/2098: Salin per baris (toast tautan kosong), Salin semua 19 jabatan (pohon utuh), Perubahan dari Murni, Pilih 3 → zip Excel berisi tepat 3 berkas di folder `MURNI/` & `PERUBAHAN/`, cari, lipat/buka, Kartu, 375 px tanpa luapan, tema terang.
