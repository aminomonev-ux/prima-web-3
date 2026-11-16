# Pemeliharaan & keluar otomatis

2026-11-03. Nol migrasi — jadwalnya satu baris `app_config` (`pemeliharaan_jadwal`, JSON).

## 1. Masalah

Sebelum build di server kantor, orang yang masih bekerja harus dikeluarkan. Yang ada:
- **Broadcast** hanya notifikasi lonceng — baru terlihat kalau loncengnya dibuka.
- **Emergency logout** mematikan semua sesi seketika tanpa peringatan — isian yang belum disimpan hilang.
- **SessionKeepAlive** baru bertanya ke server tiap 10 menit, terlalu jarang untuk hitung mundur 5 menit,
  dan pertanyaannya memperpanjang sesi.

## 2. Keputusan pemilik

- Pengirim **SUPER_ADMIN saja** (sama dengan Broadcast & emergency logout).
- Jeda bisa dipilih **1 / 5 / 10 / 15 menit**, bawaan 5.
- **Tahan login** sesudahnya: centang bawaan nyala; hanya SUPER_ADMIN yang bisa masuk; dibuka manual
  lewat "Buka login sekarang", atau **terbuka sendiri** sesudah waktu habis supaya tidak terkunci
  seharian karena lupa. Lamanya dipilih **tiap kali mengirim** (susulan 2026-11-04): 30 menit / 1 / 2 /
  4 / 8 jam, atau "Lainnya…" diketik dalam jam (koma boleh, "1,5" = 1 jam 30 menit); bawaan 2 jam.
  Pagar teknis 30 menit–168 jam (7 hari), diperiksa SERVER — Zod route dan `kirimDalam` (400), bukan
  hanya layar. Disimpan sebagai jam mutlak `login_dibuka`, jadi jadwal lama tetap terbaca.

- **Tidak digabung dengan Sakelar** (keputusan 2026-11-04), hanya diletakkan berdampingan di grup
  Aplikasi. Sakelar menutup pintu modul/seluruh aplikasi tanpa mengeluarkan siapa pun dan bertahan
  sampai dimatikan; Pemeliharaan mengeluarkan semua orang dengan peringatan lalu selesai sendiri.
  Mengirim pemeliharaan TIDAK mengubah sakelar mana pun — untuk build, "Tahan login" sudah cukup.

## 3. Alur

1. Admin Panel → Aplikasi → **Pemeliharaan** (di bawah Sakelar; sejak 2026-11-04, dulu di grup Sistem): pesan (isian bawaan), jeda, centang tahan login + lamanya →
   Kirim (konfirmasi menyebut jumlah sesi lain yang aktif dan perkiraan jam login terbuka, dihitung dari
   jam MySQL yang dipulangkan GET panel, bukan jam peramban). Panel menampilkan hitung mundur + Batalkan,
   lalu "Login ditahan" + sisa waktu (`j:mm:ss` bila ≥ 1 jam) + Buka login sekarang.
   Jam login terbuka ditulis lewat SATU `kapanDari` di dialog, kartu panel, halaman login, dan audit:
   hari ini "pukul 10:30", hari lain "Kamis, 5 Nov pukul 10:30", tahun lain ikut tahunnya.
2. Tiap tab PRIMA (`PenjagaPemeliharaan` di tata letak dashboard) bertanya `GET /api/auth/pemeliharaan`
   tiap 30 detik dan saat tab kembali terlihat. Ada jadwal → modal pesan + hitung mundur:
   - **Lanjut simpan dulu** → modal mengecil jadi spanduk merah (sisa waktu) supaya Simpan bisa ditekan;
   - **Keluar sekarang** → menanyakan isian belum tersimpan (`bolehTinggalkanHalaman`), lalu keluar.
   Modal ikut tema terang (palet `ConfirmDialog`); spanduk merahnya sama di kedua tema.
3. Waktu habis, dua lapis:
   - **Peramban**: tab keluar sendiri ke `/login?reason=pemeliharaan`. Pengingat "belum tersimpan" dilepas
     dan `beforeunload` layar lain diputus (pendengar capture + `stopImmediatePropagation`) — kalau tidak,
     dialog "tinggalkan halaman?" di komputer yang ditinggal menahan tabnya di halaman yang Simpan-nya 401.
   - **Server (penentu)**: `getSession` menolak sesi yang lahir sebelum batas — jadwalnya menumpang kueri
     sesi lewat LEFT JOIN, nol kueri tambahan. Komputer yang tidur/putus jaringan sampai di halaman login
     begitu bangun. `terapkanKeluar` mematikan semuanya sekaligus sebelum jadwal ditimpa / saat login
     dibuka (sesi yang tak pernah dipakai lagi tidak boleh hidup kembali). Panel Admin hanya MEMBACA:
     angka "sesi lain" tidak menghitung sesi yang sudah kena — syarat SQL-nya satu (`sesiKenaKeluarSql`)
     untuk mematikan dan menghitung (audit 2026-11-04: dulu GET panel menjalankan UPDATE tiap 15 detik,
     selamanya sesudah pemeliharaan apa pun).

## 4. Aturan (`lib/security/jadwal-keluar.ts`, MURNI)

- Semua waktu = jam MySQL `NOW()` berbentuk teks `YYYY-MM-DD HH:MM:SS` — sama dengan
  `user_sessions.created_at`, dibandingkan sebagai teks. Hitung mundur di tab memakai **sisa detik menurut
  server**, jadi jam komputer yang meleset tidak berpengaruh.
- Kena = `sekarang ≥ batas` dan sesi lahir sebelum batas, **kecuali** sesi pengirim, dan SUPER_ADMIN yang
  masuk sesudah pesan dikirim (ia sudah tahu, biasanya ikut build). Staf yang masuk sesudah pesan
  dikirim (login tidak ditahan) tetap ikut keluar.
- Login ditahan = centang tahan dan `dikirim ≤ sekarang < login_dibuka`. Diperiksa di route login
  **sesudah** kata sandi benar — sebelum itu, beda jawaban "ditahan" vs "salah" membocorkan username mana
  yang SUPER_ADMIN. Ditolak 503 `PEMELIHARAAN` + `LOGIN_BLOCKED`.
- Jadwal yang rusak = tidak ada jadwal (tidak mengeluarkan siapa pun).
- Kirim baru ditolak selama hitung mundur berjalan; Batalkan hanya sebelum batas; Buka login hanya selama
  ditahan. Baris dikunci `INSERT IGNORE` + `FOR UPDATE` (L69-a).
- 401 dari keepalive & status membawa `alasan` (`alasanSesiDitolak`; token dibaca SEBELUM `getSession`,
  yang menghapus cookie) → halaman login menyebut "dikeluarkan untuk pemeliharaan", bukan "tidak ada
  aktivitas". Sesi yang keluar sendiri sebelum batas tidak dihitung pemeliharaan.
- Pertanyaan tab **tidak memperpanjang sesi** — kalau memperpanjang, komputer yang ditinggal tidak pernah
  kena batas idle 60 menit.
- Audit `PEMELIHARAAN_KELUAR` (kirim / batalkan / buka login), retensi panjang.

## 5. Batas

- Aplikasi tidak menyimpan isian siapa pun — tiap layar punya Simpan + pengaman bentrok sendiri; modal
  hanya mengingatkan.
- Modal muncul paling lambat ±30 detik sesudah dikirim. Komputer yang tidur menerimanya saat bangun:
  waktu masih ada → modal; sudah lewat → langsung ke halaman login.
- Halaman yang sudah terbuka dengan sesi yang ditolak tetap tergambar sampai tabnya bertanya ke server
  (`proxy.ts` hanya memeriksa JWT) — sama seperti emergency logout.

Regresi: `npx tsx --env-file=.env.local scripts/test-pemeliharaan-keluar.mts` (82; bagian C MySQL di
SATU transaksi yang di-ROLLBACK — sesi sungguhan tidak tersentuh; `tx` uji memakai penyusun `sql` aplikasi
supaya potongan SQL bersarang ikut tersusun).
