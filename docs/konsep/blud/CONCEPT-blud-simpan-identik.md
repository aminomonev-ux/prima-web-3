# Konsep — Simpan BLUD yang isinya sama tidak menulis apa pun + jebakan arsip

Status: disetujui pemilik aplikasi 2026-10-12 ("oke setuju"), SELESAI 2026-10-12.

## 1. Masalah

Versi DPA/Pergeseran = satu **tanggal**; Simpan menghapus lalu menulis ulang versi tanggal
itu. Kebiasaan wajar "klik Simpan sekali lagi biar yakin" punya akibat yang tidak terlihat:

- membuka versi 6 Okt lalu Simpan tanpa mengubah apa pun melahirkan **versi kembar 12 Okt**;
- versi bertanggal hari ini **mengunci Jadikan DPA Perubahan sampai besok** (konsep DPA
  Perubahan §5.1 — Perubahan harus jatuh sesudah semua versi DPA);
- tiap klik menghabiskan satu dari 50 slot Riwayat Simpan dan satu baris audit.

## 2. Aturan

**Kalau isi yang disimpan sama persis dengan versi yang BERLAKU pada tanggal sasaran
(versi terakhir ≤ sasaran), tidak ada yang ditulis** — tanpa versi baru, angka kunci tidak
naik, tanpa foto riwayat, tanpa audit. Satu aturan, tiga keadaan:

| Keadaan | Pembanding | Hasil bila sama |
|---|---|---|
| Simpan ulang di hari yang sama | versi hari itu sendiri | tidak ditulis ulang |
| Buka 6 Okt, Simpan ke hari ini | versi 6 Okt | tidak lahir versi 12 Okt |
| Simpan Periode September | versi yang berlaku 30 Sep | tidak lahir arsip kembar |

Arsip akhir bulan ikut dilewati (keputusan pemilik): untuk tanggal mana pun sistem memakai
versi terakhir ≤ tanggal itu, jadi arsip kembar tidak mengubah jawaban apa pun — hanya
memanjangkan daftar dan, begitu dirujuk pergeseran, ikut terkunci dari penghapusan.
Mengembalikan isi arsip ke versi bulan ini yang salah ketik TETAP ditulis: pembandingnya
versi salah ketik itu, isinya berbeda.

- **Di server**, di dalam transaksi, sesudah angka kunci diperiksa (kunci basi tetap 409)
  dan SEBELUM pagar lain — tidak ada tulisan yang perlu dijaga. Versi berlaku dibaca lewat
  `getDpaVersiBerlaku`/`getPergeseranVersiBerlaku` dengan `tx` (satu definisi, L78/L69-b).
- **Dikecualikan**: pembuat DPA Perubahan (`asal_perubahan`) dan penutupan Pergeseran
  (`asal_tutup`) — keduanya menerbitkan baris penanda walau isinya sama.
- **Yang dinilai** (`lib/blud/isi-sama.ts`, murni): kolom yang ditulis `saveDpa`/
  `savePergeseran` kecuali milik server (`*_sebelum`); Pergeseran + acuan DPA + catatan
  perpindahan (bila dikirim). Teks NULL = ''; angka NULL ≠ 0 (vol kosong ≠ vol nol);
  angka sampai 4 desimal (`vol` DECIMAL(18,4)); urutan daftar bebas, kolom `urutan` dinilai.
- **Layar**: toast menyebut versi mana yang tetap berlaku; versi, periode, dan angka kunci
  TIDAK berpindah (tidak ada versi baru untuk dibuka).

## 3. Jebakan arsip

Membuka/memulihkan arsip akhir bulan lampau memindahkan sasaran Simpan ke arsip itu (L79),
padahal orangnya biasanya ingin MEMBAWA isinya ke bulan ini. Simpan lalu menimpa arsipnya.

Saat Simpan menyasar arsip yang SUDAH berisi dan ada versi yang lebih baru
(`jebakanArsip`), muncul `pilihDialog` tiga jalan:

- **Pakai Salin Versi Lain** (tombol utama, juga Enter): pindah ke periode bulan berjalan
  (`gantiPeriode('')`, yang tetap bertanya bila ada isian belum tersimpan) lalu membuka
  Salin Versi Lain dengan arsip itu terpilih (`sumberAwal`). Menyalin mengganti ISI,
  sasaran tetap bulan berjalan (L80).
- **Tetap simpan ke arsip** — memperbaiki arsip itu sendiri memang sah.
- **Batal** (juga Esc / klik luar).

Penutupan Pergeseran tidak ditanya: sasarannya dipilih `terapkanTutup`, dan sasaran yang
sudah berisi ditolak server. `confirmDialog` tidak diubah bentuk balasannya.

### 3.1 Arsip yang sengaja ditulis (susulan 2026-10-13)

Ditemukan saat menguji Tutup di peramban: sesudah basis 30 Sep tersimpan, periode tetap di
September (L79) — dan koreksi berikutnya ditanya "akan MENIMPA arsip 30 Sep". Sama di DPA
sesudah "Simpan Periode Juli" sementara Agustus sudah ada, dan sesudah memilih "Tetap
simpan". Data tidak rusak, tapi dialog yang berbunyi di tiap koreksi sah melatih orang
menekan "Tetap simpan" tanpa membaca — persis saat jebakan sungguhan datang.

Tiap layar mengingat **arsip yang sudah sengaja ditulis** (`arsipDisengajaRef`, parameter
ketiga `jebakanArsip`): diisi sesudah Simpan berhasil (termasuk basis Tutup) dan saat
"Tetap simpan" dipilih. Dilepas begitu isi layar datang dari jalan lain — buka versi dari
daftar, Pulihkan riwayat, ganti periode, ganti tahun — dan hanya sesudah orangnya JADI
berpindah (batal di dialog buang-isian = layar & ingatannya tetap). Jebakan aslinya
(membuka/memulihkan arsip lalu Simpan) tetap ditanya. Hanya di layar; nol endpoint.

### 3.2 Isi layar yang belum tersimpan (susulan audit kode 2026-10-13)

"Pakai Salin Versi Lain" menyalin arsip **tersimpan**. Kalau isi layar belum tersimpan —
simpanan lama dari Riwayat Simpan yang dipulihkan, atau salah ketik yang sudah dibetulkan
di arsip yang dibuka — `gantiPeriode('')` membuangnya (sesudah bertanya) lalu Salin Versi
memasang arsip tersimpan: yang dibawa ke bulan ini justru BUKAN yang orangnya maksud.

`dialogJebakanArsip` (murni, satu sumber kalimat untuk dua layar) kini memilih jalan
amannya dari `belumTersimpan`:
- isi layar = arsip tersimpan → **Pakai Salin Versi Lain** seperti §3;
- isi layar belum tersimpan → **Bawa ke bulan ini**: isinya tetap, sasaran Simpan pindah
  ke bulan berjalan (`bawaIsiLayarKeBulanIni`) — pengecualian L80 yang sama dengan Tutup
  Pergeseran: perpindahannya ADALAH pilihan orangnya, disebut di dialog, terlihat di
  pemilih periode. Angka kunci versi hari ini diambil segar (L77); gagal diambil = tidak
  pindah. Jejak asal (`asal_pulihkan` dll.) tetap, karena isinya memang dari sana.

Sekaligus `ConfirmDialog`: Enter pada tombol dialog yang **difokus lewat Tab** = tombol
itu (dulu selalu tombol utama — Tab ke Batal lalu Enter malah menyetujui hapus), Enter
yang dipakai dialog tidak ikut menekan tombol halaman di belakangnya (`preventDefault`),
dan dialog selesai sekali saja.

## 4. Uji

`npx tsx scripts/test-blud-simpan-identik.mts` (80) + `node scripts/test-blud-simpan-identik-db.mjs`
(19, MySQL kotak pasir 2099 — termasuk bolak-balik layar `getDpaByDate → dpaKeInput`, yang
membuktikan aturannya menggigit di pemakaian nyata), 59 uji mutasi tertangkap (16 untuk
§3.1, 14 untuk §3.2 + dialog + jalan pintas COUNT). Pembanding membaca COUNT dulu: jumlah
baris berbeda = pasti berbeda, seluruh versi baru dibaca bila jumlahnya sama. Diverifikasi di peramban pada salinan DPA 2026 di 2099; §3.1: Tutup → Simpan →
koreksi tanpa dialog, buka arsip dari daftar → ditanya lagi, "Tetap simpan" → koreksi
berikutnya tanpa dialog, DPA dua koreksi sungguhan ke arsip 30 Sep (11 Okt tak tersentuh),
Pulihkan → ditanya lagi.

Akibat ke uji lama: dua pemeriksaan "simpan ulang versi dasar → VERSI_DASAR"
(`test-blud-dpa-perubahan-db.mjs`) dulu mengirim isi yang SAMA — kini dilewati sebelum
pagar itu, jadi isinya dibedakan supaya pagarnya tetap teruji.
