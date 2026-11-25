# Audit Rekap Penanggung Jawab yang Lebih Pintar

> Status: **DIEKSEKUSI** 2026-11-25. Keputusan pemilik: saran PJ ditampilkan, catatan ikut tercetak,
> pemeriksaan ejaan ketat; ditambah permintaan "paham mana yang menyebabkan selisih kurang atau lebih" (§7).
> Layar: menu Cetak BLUD → view Penanggung Jawab (DPA & Pergeseran), panel di bawah tabel.
> Kode sekarang: `auditRekapPJ` (`lib/blud/audit-pj.ts`) → `validatePjRules` (`lib/blud/pj-conflict.ts`)
> → `renderAuditPanel` (`lib/blud/cetak-data.ts`).

## 1. Kenapa panel sekarang kurang membantu

Contoh nyata (Pergeseran, kantor): Total Pergeseran **77.145.537.000**, Total Rekap PJ
**75.275.037.000**, kekurangan **1.870.500.000**, "Belum Entry **121 baris**".

1. **Daftar "Belum Entry" menghitung uang yang sama berkali-kali.** Aturannya: baris berkode
   yang dirinya dan leluhurnya tanpa PJ. Itu ikut memuat **induk** yang anak-anaknya SUDAH
   ber-PJ. Butir pertama "5.1 BELANJA OPERASI BLUD — 74.645.537.000" padahal hampir seluruh
   uang itu sudah masuk rekap lewat anak-anaknya. Lalu "BELANJA PEGAWAI 20,58 M" muncul tiga
   kali (5.1.01.99, .99.99, .99.99.999), satu rantai yang sama. Hasilnya 121 baris
   bernilai puluhan miliar untuk kekurangan yang cuma 1,87 M. Orang tidak tahu harus mulai
   dari mana. (Pelajaran yang sama sudah dicatat di `daunTanpaPj`, rekap-pj.ts — L85.)
2. **Baris rincian tanpa kode tidak pernah dilaporkan** (`/^\d/.test(kode)`), padahal justru
   di situ uangnya. Yang muncul induknya, yang tidak disebut anaknya.
3. **Tidak ada jawaban "1,87 M itu dari mana".** Angka kekurangan dan daftar tidak terhubung:
   jumlah daftar ≠ kekurangan, jadi daftar itu tidak bisa dipakai untuk mencocokkan.
4. **Hanya 5 butir tampil**, sisanya "+116 lainnya…" tanpa cara membukanya.
5. **Tidak ada saran & jalan pintas.** Orang harus mencari sendiri baris itu di layar
   Pergeseran/DPA dan menebak PJ-nya.
6. **Tampilan:** angka kartu berwarna pastel untuk tema gelap (`#7DD3FC`, `#C4B5FD`) di atas
   latar abu — hampir tak terbaca di tema terang (terlihat di gambar keluhan). Label
   "Hybrid rule-based (no AI)" tidak berarti apa pun bagi pemakai.

## 2. Usulan — enam perbaikan

### 2.1 "Celah PJ": daftar yang jumlahnya PERSIS = kekurangan

Ganti daftar Belum Entry dengan **celah**: simpul TERTINGGI yang seluruh cabangnya tanpa PJ —
dirinya, semua leluhurnya, dan semua keturunannya tidak ber-PJ, dan nilainya bukan nol.

- Induk yang sebagian anaknya ber-PJ **tidak** jadi celah; yang jadi celah anak-anaknya
  yang kosong. Jadi tidak ada uang yang terhitung dua kali.
- Rincian tanpa kode ikut terhitung (yang dinilai cabangnya, bukan kodenya).
- Σ celah = Total anggaran − Total rekap PJ, **persis**, selama angka induk = jumlah anaknya.

Tampilan contoh di atas akan berbunyi kira-kira:
"**Celah PJ: 6 pos, Rp 1.870.500.000** — 77.145.537.000 = 75.275.037.000 (rekap PJ) +
1.870.500.000 (celah)". Setiap pos menyebut kode/uraian, nilai, dan **jalur induknya**
("di bawah 5.1.02.99 Belanja Barang dan Jasa BLUD") supaya rincian tanpa kode tetap bisa
dikenali.

### 2.2 Saran PJ per celah

Untuk tiap celah, sistem menebak PJ dari tetangganya, bukan mengarang:

- semua **saudara** (anak induk yang sama) yang ber-PJ memakai satu PJ yang sama →
  "kemungkinan milik **Kasubbag Umum** (4 saudaranya ber-PJ itu)";
- saudara ber-PJ campuran → disebut pilihan terbanyak + "campuran";
- tidak ada saudara ber-PJ → tanpa saran.

Saran hanya teks; PJ tetap diisi orang di layar DPA/Pergeseran (Cetak tidak menulis apa pun).

### 2.3 Tombol "Buka" ke barisnya

Tiap celah dan tiap double entry punya tautan ke layar asalnya yang langsung menyorot baris
itu: Pergeseran sudah punya `?versi=&fokus=` (Beranda BLUD), DPA perlu ditambah dengan pola
yang sama (`tungguVersiTautan`).

### 2.4 Pemeriksaan tambahan yang selama ini diam

1. **Ejaan PJ berbeda untuk orang yang sama** — "Kasubbag Umum" vs "KASUBBAG UMUM " vs
   "Kasubag Umum": di rekap jadi dua kelompok. Dideteksi dengan pembanding yang membuang
   spasi & huruf besar + jarak ejaan kecil; disebut pasangannya.
2. **PJ di luar Master Penanggung Jawab** — label yang tidak ada di daftar master (salah
   ketik, jabatan lama). Dicek ke tabel `penanggung_jawab`.
3. **Angka induk ≠ jumlah anaknya** — kalau ada, identitas 2.1 tidak berlaku dan selisih
   sisanya disebut dengan barisnya ("selisih sisa Rp X dari baris …"), bukan dibiarkan
   tak terjelaskan.
4. **Double entry dengan dampaknya** — sudah ada; ditambah nominal yang tertahan dari total
   dan saran "hapus PJ di salah satu baris".

### 2.5 Ringkasan yang menjawab, bukan menghitung

Kepala panel: **"97,6% anggaran sudah ber-PJ — kurang Rp 1.870.500.000 di 6 pos"** (atau
"Lengkap — seluruh anggaran ber-PJ"). Kartu angka tetap, ditambah **Tercakup %**. "Belum
Entry 121 baris" diganti "Celah: 6 pos".

### 2.6 Tampilan

- Semua butir bisa dibuka (lipat/buka), bukan "+116 lainnya…".
- Warna lewat kelas bertema (`[data-theme="light"]`), bukan hex pastel sebaris; angka monospace.
- Label "Hybrid rule-based (no AI)" dibuang.
- Celah urut nilai terbesar dulu.

## 3. Yang tidak berubah

- Angka rekap & total bersih (`grandTotal`, subtotal mentah) tidak berubah — Form PK dan
  unduhan tetap sama.
- Sentinel di layar DPA/Pergeseran tetap memakai `validateAllPj` (chain-conflict saja).
- Cetak tetap hanya membaca; tidak ada endpoint tulis baru, nol migrasi.

## 4. Opsional (boleh menyusul)

- Catatan celah ikut tercetak di bawah tabel unduhan Excel/PDF Rekap PJ (sekarang hanya
  kalimat total/selisih).
- Panel yang sama di layar Realisasi per PJ ("Belum ada PJ" di sana memakai aturan yang sama).

## 5. Rencana pengerjaan

1. `lib/blud/audit-pj.ts`: fungsi MURNI `celahPj(rows)` (2.1), `saranPj` (2.2),
   `pjMirip`/`pjDiLuarMaster` (2.4), `indukTakCocok` (2.4.3); `auditRekapPJ` membawa hasilnya.
   `belumEntry` lama tetap ada untuk pemakai lain (dicek dulu siapa).
2. `renderAuditPanel`: kepala ringkasan, daftar celah + saran + tautan, lipat/buka, kelas tema.
3. Layar DPA: dukung `?versi=&fokus=` seperti Pergeseran.
4. Uji `scripts/test-blud-audit-pj.mts`: pohon dgn induk ber-PJ sebagian, rincian tanpa kode,
   ejaan PJ berbeda, induk ≠ Σ anak; identitas Σ celah = kekurangan; uji mutasi.
5. Dicoba di layar (tema terang & gelap, lebar ponsel).

## 6. Yang perlu diputuskan

1. Saran PJ (2.2): ditampilkan, atau cukup daftar celahnya saja?
2. Pemeriksaan ejaan mirip (2.4.1) — ambang "mirip" sengaja ketat (hanya beda huruf besar,
   spasi, dan satu-dua huruf). Setuju?
3. Catatan celah ikut tercetak di unduhan (§4) sekarang, atau menyusul?

## 7. Catatan pengerjaan (2026-11-25)

**Rekonsiliasi penuh** — `lib/blud/rekonsiliasi-pj.ts` (MURNI). Selisih (total anggaran −
rekap PJ) dipecah HABIS ke pos, masing-masing bertanda *kurang* (+) atau *lebih* (−):

| Pos | Artinya | Arah |
|---|---|---|
| celah | cabang tertinggi yang seluruhnya tanpa PJ | kurang (lebih kalau nilainya negatif) |
| induk | di jalur tanpa PJ, angka induk ≠ jumlah anaknya | kurang bila induk lebih besar, lebih bila lebih kecil |
| luar | baris ber-PJ yang tidak di bawah total anggaran (induk hilang / menaungi Belanja Daerah) | lebih |

Σ pos + sisa = selisih; sisa dihitung dan ditampilkan bila ≠ 0 (struktur di luar pola).
Diuji 400 pohon acak (dengan induk tak cocok, PJ acak, baris yatim ber-PJ): sisa selalu 0.
Pemeriksaan label (`periksaLabelPj`): ejaan berbeda (huruf besar/spasi/tanda baca), mirip
(≤ 2 huruf, label ≥ 8 huruf), di luar Master PJ (`GET /api/blud/penanggung-jawab`, best-effort).

**Layar**: panel ditulis ulang (`renderAuditPanel`, kelas `.apj-*` per tema di
`cetak-client.tsx`), tautan "Buka" ke layar DPA/Pergeseran `?tahun=&versi=&fokus=<anggaran_key>`
— layar DPA kini mendukungnya (pola Pergeseran). **Unduhan**: `susunRekapPj` mencetak neraca +
≤ 40 pos (`BATAS_CATATAN_POS`) + temuan label; kalimatnya bebas karakter di luar WinAnsi (Gate F —
"→ ≠ −" sempat merusak baris PDF, ketahuan oleh uji). Tinggi baris catatan Excel (sel gabung)
ditaksir dari lebar kolom.

**Regresi**: `npx tsx scripts/test-blud-audit-pj.mts` (41), 11 uji mutasi tertangkap — dua sempat
LOLOS (PJ "-" dianggap kosong, PJ yang menaungi Belanja Daerah) lalu diberi uji A11/C5.
Dicoba di layar (2026, tema gelap & terang): panel, tautan Pergeseran & DPA menyorot baris yang dituju.
