# Master Rekening yang menjalar — ganti nama, pindah induk, gabung, Rapikan Bintang, Lengkapi

Status: dikerjakan 2 Nov 2026 (Tahap 1 + 2 sekaligus, atas permintaan pemilik).

## 1. Masalahnya

Dilaporkan dari server kantor: uraian SSK baru di RKO BLUD (PERUBAHAN-1) tampil di Cetak →
Rekap sebagai **program terpisah**, padahal program sampai sub kegiatannya "sama" dengan
baris Murni. Ternyata namanya tidak sama:

| | Baris Murni | Baris baru |
|---|---|---|
| Program | PROGRAM PENUNJANG … PROVINSI | PROGRAM PENUNJANG … PROVINSI `***` |
| Kegiatan | Peningkatan Pelayanan BLUD | Peningkatan Pelayanan BLUD `****` |
| Sub | Pelayanan dan Penunjang Pelayanan BLUD `**` | … `*****` |

Rantai sebabnya, semuanya dibuktikan dari kode dan berkas unduhan server:

1. **Data Renaksi menyimpan bintang penanda tingkat** dari matriks resmi (`*` tujuan …
   `*****` sub kegiatan) — pembaca impor Renaksi tidak membuangnya.
2. **Init Renaksi** menyalin nama itu apa adanya ke Master. Master sudah diisi manual lebih
   dulu, jadi lahir entri kembar berbintang di samping entri manual.
3. Rekening BLUD untuk SSK baru dipasang ke entri berbintang; Inject/Impor RKO **menyalin**
   nama dari Rekening. Rekap mengelompokkan per teks persis → kelompok baru.
4. Mencoba membetulkan lewat **Edit Uraian SSK** di Master gagal diam-diam: form menampilkan
   pilihan Program/Kegiatan/Sub induk, tapi Simpan hanya mengirim `nama` dan server hanya
   mengubah kolom nama. Toast tetap "Berhasil diperbarui".
5. Ganti nama di Master (A3) hanya berlaku di Master. Salinan di Rekening, RKO, Realisasi
   sengaja tidak disentuh — jadi tidak ada jalan membereskan data tanpa hapus-buat-ulang.
6. Uraian SSK Murni tidak ada di Master: Impor Rekening/RKO menulis nama dari berkas tanpa
   membuat entri Master, jadi pilihan Uraian SSK di form Rekening kosong untuk baris itu.
7. Pilihan Kegiatan di tab Rekening menilai baris **pertama** yang bernama sama — kegiatan
   senama di program lain ikut hilang/tampil.

## 2. Keputusan

- **Identitas entri = jalurnya**: `[program, kegiatan, sub, uraian SSK]` sampai tingkatnya.
  Ganti nama / pindah induk = jalur lama → jalur baru untuk entri itu, keturunannya di Master,
  dan **setiap baris Rekening, RKO, Realisasi** yang jalurnya diawali jalur lama. Ini membalik
  keputusan A3 (salinan tidak disentuh) — dengan sengaja: tanpa itu data tidak bisa dibereskan.
- **RKO semua versi ikut, termasuk yang terkunci** — keputusan pemilik 2 Nov 2026. Hanya label;
  angka, `canonical_id`, dan kunci versi tetap. Kalau tidak, Cetak "Murni" dan "Versi Berlaku"
  menampilkan program yang sama dengan dua nama.
- **Jalur tujuan sudah dihuni entri lain = gabung**: harus dinyatakan (`gabung: true`, 409
  `PERLU_GABUNG` bila tidak). Keturunan yang jadi kembar ikut digabung; yang dipertahankan
  selalu entri yang **sudah ada** di tujuan. Gabung (dan Rapikan Bintang) **terbuka bagi semua
  pemegang akses E-Anggaran** — keputusan pemilik 2 Nov 2026: tidak ada data yang hilang
  (anak & salinan namanya pindah ke entri tujuan, angka tak tersentuh, jejaknya di audit),
  sejalan dengan aturan modul kolaboratif (AUTHZ-02). Tombol **Hapus** satu entri — entrinya
  benar-benar hilang — tetap khusus SUPER_ADMIN/ADMIN. Konsekuensinya pemberian akses
  E-Anggaran tetap harus konservatif.
- **Berhenti di pratinjau dulu**: layar memanggil `dry`, menyebut jumlah baris per tempat
  (Rekening, RKO per versi, Realisasi) dan anak yang ikut pindah; ganti nama yang tidak
  menyentuh apa pun langsung disimpan.
- **Angka kunci RKO per versi & Realisasi per sumber dinaikkan**: tab yang dibuka sebelum
  perubahan kena 409 dan menggabungkan ketikannya di atas isi terbaru — bukan menulis balik nama
  lama lewat Simpan hapus-tulis-ulang.
- **`updated_at = updated_at`**: label yang dirapikan bukan suntingan isi; stempel "terakhir
  diubah" milik orang yang mengetik angkanya tetap.

## 3. Aturan rinci (`lib/kinerja/master-ubah.ts`, PURE)

- Kolom induk yang tidak dikirim = dipertahankan; induk yang tadinya ada tidak boleh dikosongkan.
- Induk baru wajib ada di Master (L68), diperiksa dari tingkat pertama yang berubah ke bawah:
  pindah Program dengan Kegiatan yang sama berarti Kegiatan itu harus ada di bawah Program baru.
- "Tampil di bawah induk" = setiap kolom induk entri **kosong atau sama** (`cocokInduk`) — satu
  aturan untuk pilihan berantai tab Master & Rekening, pagar pindah induk, dan Lengkapi.
- Data lama yang kolom induknya kosong dianggap milik entri ini **hanya kalau nama entri unik**
  di tipenya; kalau ada saudara senama di induk lain, baris tanpa induk tidak bisa dipastikan
  milik siapa dan dibiarkan.
- Kegiatan senama di program lain tidak pernah ikut (jalurnya beda).

## 4. Rapikan Bintang, Init Renaksi, Lengkapi

- **Rapikan Bintang** (tombol di Master, semua pemegang akses): bintang di ujung nama dibuang per
  kolom di Master (nama + ketiga kolom induk) dan di Rekening, RKO, Realisasi; entri Master yang
  jadi kembar digabung. Rekening yang jadi bernama sama di Uraian SSK yang sama **disebut, tidak
  dihapus**. Bintang di tengah nama tidak disentuh.
- **Init Renaksi** membuang bintang penanda sebelum menyalin; entri lama yang masih berbintang
  dianggap sudah ada (dibereskan lewat Rapikan). Data Renaksi sendiri tidak disentuh — di sana
  bintang bagian dari format dokumen resmi.
- **Lengkapi Master** (semua pemegang akses): entri yang belum ada untuk nama yang dipakai di
  Rekening & RKO, lengkap dengan induknya, berhenti di tingkat pertama yang kosong. Hanya
  menambah. Urutan yang benar: Rapikan dulu, baru Lengkapi (pratinjau menyebut nama berbintang).

## 5. Batas yang disadari

- Rekening tidak punya gembok optimistik; tab Rekening yang terbuka sebelum perubahan masih bisa
  menulis balik nama lama lewat Simpan (hapus-tulis-ulang).
- Foto Riwayat Simpan memuat nama saat foto dibuat; memulihkannya membawa nama lama kembali —
  disebut di dialog Pulihkan.
- Tabel LKJIP yang tertaut ke Rekap memakai label sebagai kunci baris; nama yang berubah membuat
  barisnya terbaca baru/hilang di Perbarui (dialog Perbarui sudah menyebutnya).
- Gembok diambil untuk SEMUA sumber tahun itu (sumber yang terkena baru diketahui sesudah data
  dibaca, dan membaca dulu lalu mengunci = foto lama, L84).

## 6. Uji

`npx tsx --env-file=.env.local scripts/test-kinerja-master-menjalar.mts` — bagian A–F murni &
statis, bagian G MySQL kotak pasir 2097 (gabung program dengan versi MURNI terkunci, pindah induk
Uraian SSK, Rapikan, Lengkapi, angka & stempel waktu tetap, angka kunci naik, bersih kembali).
`test-kinerja-rekap.mts` bagian X dan `test-kinerja-audit.mjs` disesuaikan (jalur A3 lama dibuang).
