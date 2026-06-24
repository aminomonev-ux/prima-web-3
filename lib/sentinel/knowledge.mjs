// lib/sentinel/knowledge.mjs — Knowledge Base RIMA F2 (CONCEPT §5, PERSONA.md).
// KB = kode (G14): hanya berubah lewat PR review + lint kata terlarang
// (scripts/rima-lint-templates.mjs). Gaya WAJIB ikut PERSONA.md: aku/kamu tanpa
// "kak", ≤3 kalimat sebelum chips, SETIAP jawaban ditutup chips (K1), tanpa
// jargon tanpa padanan, nominal format Rupiah, tanpa path file/tabel/endpoint (G10).
// Scope konten F2: BLUD + navigasi umum + akun + hitung + sopan + deny +
// umum-sistem + rima. Modul lain (usulan/bba/kin/pk/ra/lkjip/admin) = ★ inti
// saja + fallback per-modul — dilengkapi di F4.
// Chips.q sengaja memakai kalimat persis dari GOLDEN-QUESTIONS.md supaya
// klasifikasinya terjamin (TF-IDF mengenal kalimat itu).

const C = (l, q) => ({ l, q })
const TOPIK = C('Daftar topik', 'menu apa saja yang ada di prima')
const LAIN = C('Topik lain', 'kamu bisa apa saja')

/** @type {Record<string, {title: string, keywords?: string[], answers: string[], chips: {l: string, q: string}[]}>} */
export const RIMA_KB = {}
function e(id, title, def) {
  RIMA_KB[id] = {
    title,
    keywords: def.k ?? [],
    answers: Array.isArray(def.a) ? def.a : [def.a],
    chips: def.c ?? [TOPIK, LAIN],
  }
}

// ─── Umum & navigasi ─────────────────────────────────────────────────────────
e('umum.daftar-menu', 'Menu di PRIMA', {
  k: ['menu apa saja', 'daftar menu', 'daftar topik'],
  a: 'Modul PRIMA: Usulan Kebutuhan · BLUD (DPA, Pergeseran, Cetak) · E-Anggaran/Kinerja · Perjanjian Kinerja · Rencana Aksi · Buku Besar Aset · LKJIP · Admin Panel. Yang tampil di menumu mengikuti akses role masing-masing. Mau kuceritakan salah satunya?',
  c: [C('Apa itu BLUD', 'blud itu apa'), C('Apa itu DPA', 'dpa itu apa'), C('Kemampuan Rima', 'kamu bisa apa saja')],
})
e('umum.bantuan-halaman', 'Bantuan halaman ini', {
  a: 'Aku bisa jelaskan fitur halaman yang sedang kamu buka — tulis saja nama tombol atau hal yang membingungkan. Kalau ada temuanku di form ini, cek juga tab Temuan ya.',
  c: [C('Cek temuan aktif', 'ada peringatan kemungkinan entri ganda'), TOPIK],
})
e('umum.ke-menu', 'Kembali ke menu utama', {
  a: 'Klik tombol Menu di bagian atas halaman — itu membawamu kembali ke menu utama PRIMA. Dock bawah juga bisa dipakai pindah antar modul dengan cepat.',
  c: [C('Dock bawah itu apa', 'dock bawah itu apa'), TOPIK],
})
e('umum.ganti-tema', 'Ganti tema gelap/terang', {
  a: 'Pakai tombol Dark / Light di bagian atas halaman. Ini hanya mengubah tampilan demi kenyamanan mata — datamu tidak berubah sama sekali. Mau kubantu hal lain?',
  c: [TOPIK, LAIN],
})
e('umum.tentang-prima', 'Tentang PRIMA', {
  a: 'PRIMA adalah aplikasi internal RSJD Dr. Amino Gondohutomo untuk perencanaan dan penganggaran: dari usulan kebutuhan, DPA BLUD, kinerja, sampai laporan tahunan. Dikembangkan tim internal rumah sakit. Mau lihat daftar modulnya?',
  c: [C('Daftar modul', 'menu apa saja yang ada di prima'), LAIN],
})
e('umum.nav-blud', 'Pindah ke aplikasi BLUD', {
  a: 'Dari menu utama pilih kartu BLUD, atau pakai dock di bawah layar untuk lompat langsung. Di dalamnya ada DPA, Pergeseran, dan Cetak. Mau kuceritakan alurnya?',
  c: [C('Alur BLUD lengkap', 'cara menjalankan aplikasi blud dari awal sampai akhir'), TOPIK],
})
e('umum.akses-menu', 'Menu sedikit — akses role', {
  a: 'Menu yang tampil memang mengikuti role dan akses akunmu — bukan error. Kalau merasa ada modul yang seharusnya bisa kamu akses, ajukan ke admin lewat atasanmu ya.',
  c: [C('Role saya apa', 'role saya apa sekarang'), TOPIK],
})
e('umum.font-mono', 'Font angka berbeda', {
  a: 'Sengaja 😊 Semua angka keuangan (rupiah, volume, kode rekening) pakai huruf berlebar sama supaya kolom angka rapi dan gampang dibandingkan baris per baris.',
  c: [C('Format rupiah', 'angka rupiah di prima formatnya gimana'), LAIN],
})
e('umum.responsive', 'Tampilan layar sempit', {
  a: 'PRIMA paling nyaman dipakai di layar komputer karena tabelnya lebar. Di ponsel tetap bisa dibuka, tapi beberapa tabel perlu digeser ke samping. Kalau tampilan terpotong di komputer, coba kecilkan zoom browser (Ctrl + minus).',
  c: [C('Cara zoom tabel', 'cara zoom tabel'), LAIN],
})
e('umum.shortcut', 'Shortcut keyboard', {
  a: 'Yang umum: Ctrl+F cari di halaman, Ctrl + plus/minus zoom, Ctrl+Shift+R muat ulang bersih. Shortcut khusus per modul sedang kusiapkan daftarnya ya.',
  c: [C('Hard refresh itu apa', 'hard refresh itu gimana caranya'), LAIN],
})
e('umum.zoom-browser', 'Zoom tabel', {
  a: 'Pakai zoom browser: Ctrl + plus untuk memperbesar, Ctrl + minus memperkecil, Ctrl + 0 kembali normal. Tabel ikut menyesuaikan.',
  c: [LAIN, TOPIK],
})
e('umum.floating-dock', 'Dock bawah', {
  a: 'Bar mengambang di bawah layar itu jalan pintas antar modul plus beberapa aksi cepat — klik ikonnya untuk lompat tanpa kembali ke menu. Praktis kalau kerjamu bolak-balik modul.',
  c: [TOPIK, LAIN],
})
e('nav.bantuan', 'Buka / pindah aplikasi lewat Rima', {
  k: ['pindah modul', 'pindah aplikasi', 'bukain aplikasi'],
  a: 'Bisa! Tinggal bilang "buka BLUD", "ke Kinerja", atau "buka LKJIP" — aku siapkan tombolnya, kamu tinggal klik 😊 (yang kutawarkan hanya modul yang kamu punya akses). Bisa juga pakai dock di bawah layar.',
  c: [C('Buka BLUD', 'buka blud'), C('Daftar modul', 'menu apa saja yang ada di prima')],
})

// ─── Akun & autentikasi ──────────────────────────────────────────────────────
e('akun.lupa-password', 'Lupa password', {
  k: ['lupa password'],
  a: 'Di halaman login klik "Lupa password?", masukkan emailmu, lalu buka tautan reset yang dikirim ke email itu. Tautannya hanya berlaku sebentar, jadi segera dipakai ya.',
  c: [C('Email tidak masuk', 'email verifikasi tidak masuk'), C('Akun terkunci', 'akun saya terkunci')],
})
e('akun.ganti-password', 'Ganti password', {
  a: 'Cara paling pasti: dari halaman login klik "Lupa password?" lalu ikuti tautan di email — itu sekaligus mengganti password lama. Kalau akunmu bermasalah, admin juga bisa membantu reset.',
  c: [C('Password yang kuat', 'password yang kuat itu gimana'), LAIN],
})
e('akun.terkunci', 'Akun terkunci', {
  a: 'Lima kali salah password membuat akun terkunci 15 menit — pengaman standar. Tunggu 15 menit lalu coba lagi pelan-pelan; kalau lupa passwordnya sekalian, pakai "Lupa password?" ya.',
  c: [C('Lupa password', 'lupa password gimana'), LAIN],
})
e('akun.sesi-habis', 'Sesi berakhir / logout sendiri', {
  a: 'Sesi login PRIMA berlaku 60 menit — pengaman standar aplikasi keuangan, supaya akun yang ditinggal tidak disalahgunakan. Biasakan simpan berkala, lalu login lagi untuk melanjutkan.',
  c: [C('Cek tersimpan atau belum', 'tersimpan tidak ya barusan'), LAIN],
})
e('akun.register', 'Daftar akun baru', {
  a: 'Di halaman login klik "Buat Akun Baru", isi datamu, lalu verifikasi lewat tautan yang dikirim ke email. Setelah itu akunmu siap dipakai sesuai role yang dipilih.',
  c: [C('Email verifikasi tidak masuk', 'email verifikasi tidak masuk'), C('Kuota role', 'kuota role itu apa')],
})
e('akun.verifikasi-email', 'Email verifikasi', {
  a: 'Cek folder spam dulu ya. Kalau tetap tidak ada, pakai tombol "Kirim Ulang" di halaman login. Masih gagal juga? Hubungi admin lewat atasanmu supaya dicek.',
  c: [C('Daftar akun', 'cara daftar akun baru'), LAIN],
})
e('akun.register-gagal', 'Pendaftaran diblokir', {
  a: 'Pendaftaran bisa tertahan karena beberapa hal — misalnya kuota role penuh atau data belum sesuai. Demi keamanan aku tidak bisa merinci alasannya; admin yang bisa mengecek dan membantu ya 🙏',
  c: [C('Kuota role itu apa', 'kuota role itu apa'), LAIN],
})
e('akun.role-saya', 'Role saya', {
  a: 'Role-mu tampil di lencana profil pojok kanan atas (klik avatarmu). Role menentukan menu dan data yang bisa kamu akses.',
  c: [C('Kenapa menu sedikit', 'kenapa menu saya cuma sedikit'), C('Cara naik role', 'cara naik role')],
})
e('akun.promosi', 'Naik role (promosi)', {
  a: 'Kenaikan role lewat jalur pengajuan promosi: kamu mengajukan, lalu disetujui berjenjang oleh yang berwenang. Kalau prosesnya terasa lama, tanyakan baik-baik ke atasanmu atau admin ya — antrian persetujuan ada di sisi mereka.',
  c: [C('Kuota role', 'kuota role itu apa'), LAIN],
})
e('akun.kuota-role', 'Kuota role', {
  a: 'Beberapa role dibatasi jumlah akunnya (misalnya admin dan role bidang) supaya kewenangan tidak terlalu menyebar. Kalau kuota penuh, pilihan role itu tidak tersedia sampai ada slot kosong.',
  c: [C('Cara naik role', 'cara naik role'), LAIN],
})
e('akun.logout', 'Cara logout', {
  // 'log out'/'keluar akun'/'sign out'/'exit' = floor keyword: tanpa ini "log out"
  // (2 token) ditarik tfidf ke cetak.export-log, & "keluar"→sinonim "tampil".
  // SENGAJA tanpa keyword bare 'logout' → jangan curi fixture locate.logout.
  k: ['log out', 'keluar akun', 'sign out', 'exit'],
  a: 'Klik avatar/namamu di pojok kanan atas lalu pilih keluar. Biasakan logout kalau komputernya dipakai bergantian ya 😊',
  c: [C('Kenapa harus logout', 'kenapa harus logout kalau udah selesai'), LAIN],
})
e('akun.nonaktif', 'Akun dinonaktifkan', {
  a: 'Penonaktifan akun dilakukan admin — alasannya tidak bisa kubuka di sini. Silakan tanyakan lewat atasanmu atau langsung ke admin untuk pengaktifan kembali ya 🙏',
  c: [TOPIK, LAIN],
})
e('akun.password-kuat', 'Password yang kuat', {
  a: 'Yang kuat: panjang (12+ karakter), campuran huruf besar-kecil, angka, dan simbol, serta tidak dipakai ulang di aplikasi lain. Hindari nama, tanggal lahir, atau kata yang gampang ditebak.',
  c: [C('Ganti password', 'cara ganti password'), LAIN],
})
e('akun.multi-sesi', 'Login di 2 komputer', {
  a: 'Bisa, tapi hati-hati: kalau dua-duanya mengedit data yang sama, yang menyimpan belakangan akan diminta memuat ulang dulu supaya tidak saling timpa. Sebaiknya selesaikan di satu tempat dulu ya.',
  c: [C('Versi konflik itu apa', 'versi konflik itu maksudnya apa sih bahasa awamnya'), LAIN],
})
e('locate.logout', 'Letak tombol logout', {
  a: 'Pojok kanan atas — klik avatar/namamu, menu keluar ada di situ.',
  c: [C('Kenapa harus logout', 'kenapa harus logout kalau udah selesai'), LAIN],
})
e('locate.notifikasi', 'Letak notifikasi', {
  a: 'Panel notifikasi ada di bagian atas halaman modul — cari ikon loncengnya. Angka kecil di atasnya = jumlah notifikasi belum dibaca.',
  c: [C('Kelola notifikasi', 'cara hapus notifikasi'), LAIN],
})
e('notif.kelola', 'Kelola notifikasi', {
  a: 'Buka panel notifikasi (ikon lonceng), dari situ kamu bisa menandai sudah dibaca atau membersihkannya. Notifikasi lama juga terpangkas otomatis seiring waktu.',
  c: [C('Letak notifikasi', 'cara buka notifikasi'), LAIN],
})

// ─── BLUD — umum & DPA ───────────────────────────────────────────────────────
e('blud.tentang', 'Apa itu BLUD', {
  a: 'BLUD = Badan Layanan Umum Daerah — status yang membuat rumah sakit boleh mengelola pendapatan layanannya sendiri secara fleksibel. Di PRIMA, modul BLUD dipakai menyusun DPA dan pergeseran anggarannya.',
  c: [C('Apa itu DPA', 'dpa itu apa'), C('Alur BLUD lengkap', 'cara menjalankan aplikasi blud dari awal sampai akhir')],
})
e('blud.end-to-end', 'Alur BLUD dari awal sampai akhir', {
  a: 'Garis besarnya: ① susun DPA (Form Baru dari Kode Besar, atau tarik dari Usulan) → ② isi uraian, volume, harga, dan Penanggung Jawab → ③ Simpan (versi tercatat otomatis per tanggal) → ④ kalau ada perubahan, buat Pergeseran lalu Inject jadi versi DPA baru → ⑤ cetak/rekap di menu Cetak. Mau kupandu langsung di layarnya?',
  c: [{ l: '▶ Mulai Tur DPA', q: '', tour: 'dpa-end-to-end' }, C('Apa itu pergeseran', 'pergeseran dpa itu apa'), C('Cara cetak', 'cara cetak dpa')],
})
e('dpa.tentang', 'Apa itu DPA', {
  a: 'DPA = Dokumen Pelaksanaan Anggaran — rincian belanja BLUD berjenjang dari total sampai item terkecil. Di PRIMA kamu menyusunnya sebagai tabel bertingkat yang totalnya menghitung sendiri.',
  c: [C('Buat DPA baru', 'cara buat dpa baru'), C('Level-level DPA', 'level level di dpa itu maksudnya apa')],
})
e('dpa.form-baru', 'Buat DPA baru (Form Baru)', {
  k: ['form baru'],
  a: 'Klik Form Baru di halaman DPA — kerangka tabel otomatis terbangun dari daftar Kode Besar. Setelah itu tinggal isi uraian per baris lewat pencarian, lalu volume dan harganya.',
  c: [C('Kode Besar itu apa', 'kode besar itu apa'), C('Cara isi uraian', 'cara isi uraian dpa')],
})
e('dpa.kode-besar', 'Kode Besar', {
  k: ['kode besar'],
  a: 'Kode Besar = daftar template kerangka belanja standar BLUD (5.1, 5.2, dst.) yang jadi tulang punggung Form Baru. Daftarnya bisa diatur di menu Kode Besar — perubahan di sana memengaruhi Form Baru berikutnya.',
  c: [C('Buat DPA baru', 'cara buat dpa baru'), LAIN],
})
e('dpa.uraian', 'Isi uraian DPA', {
  a: 'Klik kolom Uraian lalu ketik kata kuncinya — pilih dari daftar Master Akun yang muncul. Kode rekening akan terisi sendiri mengikuti pilihanmu, jadi tidak perlu diketik manual.',
  c: [C('Kode rekening terkunci?', 'kode rekening kok tidak bisa diketik'), C('Master akun itu apa', 'master akun itu apa')],
})
e('dpa.kode-rekening-readonly', 'Kode rekening tidak bisa diketik', {
  a: 'Memang dikunci 😊 Kode rekening mengikuti uraian yang kamu pilih dari Master Akun — satu sumber, supaya tidak ada salah ketik kode. Ganti uraiannya, kodenya ikut berganti.',
  c: [C('Cara isi uraian', 'cara isi uraian dpa'), LAIN],
})
e('dpa.tambah-baris', 'Tambah baris DPA', {
  a: 'Klik menu titik tiga di baris mana pun: pilih tambah sub-level (anak) atau baris selevel (saudara). Baris baru langsung ikut aturan hitung berjenjang.',
  c: [C('Hapus baris', 'cara hapus baris'), C('Level-level DPA', 'level level di dpa itu maksudnya apa')],
})
e('dpa.hapus-baris', 'Hapus baris DPA', {
  a: 'Pakai ikon hapus di ujung baris, atau centang beberapa baris lalu Hapus Terpilih untuk borongan. Ingat: baris yang masih punya anak harus dikosongkan anaknya dulu.',
  c: [C('Baris tidak bisa dihapus', 'kenapa baris tidak bisa dihapus'), LAIN],
})
e('dpa.hapus-baris-induk', 'Baris induk tidak bisa dihapus', {
  a: 'Baris itu masih punya baris anak di bawahnya — hapus atau pindahkan anak-anaknya dulu, baru induknya bisa dihapus. Ini mencegah satu klik menghapus satu blok besar tanpa sengaja.',
  c: [C('Cara hapus baris', 'cara hapus baris'), LAIN],
})
e('dpa.hierarki', 'Level-level DPA', {
  a: 'DPA bertingkat dari L1 (total belanja) turun ke L2, L2.1, L3 … sampai level rincian terdalam. Baris ber-anak otomatis jadi penjumlah; hanya baris terbawah (tanpa anak) yang diisi volume × harga.',
  c: [C('Kenapa jumlah induk terkunci', 'kenapa jumlah induk tidak bisa diedit'), LAIN],
})
e('dpa.kalkulasi', 'Jumlah otomatis', {
  a: 'Ya — jumlah baris = volume × harga, dan baris induk otomatis = penjumlahan anak-anaknya, berantai sampai total paling atas. Karena itu kolom jumlah induk terkunci: dia hasil hitungan, bukan isian.',
  c: [C('Rumus jumlah DPA', 'kolom jumlah di dpa dihitung gimana'), LAIN],
})
e('dpa.pj', 'Penanggung Jawab', {
  a: 'Kolom Penanggung Jawab diisi pejabat yang memegang anggaran baris itu — pilih dari daftar master PJ. Aturan pentingnya: dalam satu garis induk-anak cukup SATU baris yang ber-PJ, supaya rekap tidak menghitung dobel.',
  c: [C('Kenapa ada konflik PJ', 'kenapa ada peringatan konflik pj'), C('Rekap PJ', 'subtotal rekap penanggung jawab dihitung dari mana')],
})
e('dpa.pj-konflik', 'Peringatan konflik PJ', {
  k: ['konflik pj', 'konflik penanggung jawab'],
  a: 'Artinya ada dua baris segaris induk-anak yang sama-sama ber-PJ — rekap per PJ akan menghitung nilainya dua kali. Klik Lihat di temuanku untuk lompat ke barisnya, lalu kosongkan salah satu PJ-nya ya.',
  c: [C('Aturan PJ', 'penanggung jawab diisi siapa'), C('Lihat temuan', 'ada peringatan kemungkinan entri ganda')],
})
e('dpa.import-usulan', 'Import dari Usulan', {
  a: 'Di baris tujuan, buka menu titik tiga → pilih import dari usulan. Modalnya menampilkan item usulan yang sudah final disetujui — ada 2 mode: Isi Baris Ini (menimpa 1 baris) atau Sisip Baris Baru (menambah banyak item sekaligus, susunannya kamu atur).',
  c: [{ l: '▶ Tur Import Usulan', q: '', tour: 'import-usulan' }, C('Beda 2 mode import', 'bedanya isi baris ini sama sisip baris baru'), C('Item tidak bisa dicentang', 'kenapa item usulan tidak bisa dicentang')],
})
e('dpa.import-isi-baris', 'Mode Isi Baris Ini', {
  a: 'Isi Baris Ini = pilih SATU item usulan untuk menimpa uraian, volume, satuan, dan harga baris yang kamu klik — kode rekening dan PJ-nya dipertahankan. Sisip Baris Baru = menambah baris-baris baru, bisa banyak item, susunan level dan urutannya kamu atur lewat Panel Susunan.',
  c: [C('Panel Susunan itu apa', 'panel susunan di import itu buat apa'), LAIN],
})
e('dpa.import-isi-baris-induk', 'Isi Baris Ini abu-abu di induk', {
  a: 'Memang disengaja: baris induk jumlahnya hasil penjumlahan anak, jadi tidak boleh ditimpa item tunggal. Untuk induk, pakai mode Sisip Baris Baru — itemnya masuk sebagai anak di bawahnya.',
  c: [C('Beda 2 mode import', 'bedanya isi baris ini sama sisip baris baru'), LAIN],
})
e('dpa.import-susunan', 'Panel Susunan import', {
  a: 'Panel Susunan (sisi kanan modal) menentukan jadi apa item-item yang kamu centang: geser kiri-kanan untuk level, panah atas-bawah untuk urutan. Induk-anaknya mengikuti susunan itu saat masuk ke form.',
  c: [C('Cara import usulan', 'cara import dari usulan'), LAIN],
})
e('dpa.import-disabled', 'Item usulan tidak bisa dicentang', {
  a: 'Item itu sudah ada di form-mu sekarang — dikunci supaya tidak terimport dua kali. Kalau memang mau menggantinya, hapus dulu baris lamanya di form.',
  c: [C('Badge pernah diimport', 'badge pernah diimport artinya apa'), LAIN],
})
e('dpa.import-badge', 'Badge "pernah diimport"', {
  a: 'Tanda itu artinya item tersebut sudah pernah ditarik di versi DPA lain — masih boleh dipakai lagi di versi ini, badge-nya cuma pengingat supaya kamu sadar riwayatnya.',
  c: [C('Item terkunci kenapa', 'kenapa item usulan tidak bisa dicentang'), LAIN],
})
e('dpa.simpan', 'Simpan DPA', {
  a: 'Klik Simpan di kanan atas form. Sebelum tersimpan aku ikut memeriksa entri ganda dan konflik PJ; kalau ada peringatan, kamu kuberi tahu dulu. Versi tersimpan otomatis tercatat per tanggal.',
  c: [C('Tidak bisa simpan', 'kenapa tidak bisa simpan'), C('Versi DPA', 'versi dpa itu apa')],
})
e('dpa.simpan-gagal', 'Tidak bisa simpan', {
  a: 'Penyebab umum: ① ada entri ganda pasti (kutandai merah — wajib dihapus salah satu), ② data sedang dibuka pengguna lain (muat ulang dulu), ③ sesi login habis (login ulang), atau ④ struktur baris tidak valid. Cek tab Temuan-ku dulu ya.',
  c: [C('Lihat temuan', 'ada peringatan kemungkinan entri ganda'), C('Dikunci orang lain', 'dikunci orang lain maksudnya apa')],
})
e('dpa.versi', 'Versi DPA', {
  a: 'Setiap Simpan tercatat sebagai versi per tanggal — versi terbaru jadi acuan Pergeseran dan Cetak. Pilih versi lama lewat dropdown tanggal di atas form untuk melihat isinya.',
  c: [C('Kunci versi', 'cara kunci versi'), C('Hapus versi lama', 'cara hapus versi lama')],
})
e('dpa.kunci-versi', 'Kunci versi', {
  k: ['kunci versi'],
  a: 'Di DPA tidak ada tombol kunci — versi otomatis tercatat per tanggal saat Simpan, dan versi lama tidak berubah lagi. Penguncian versi manual adanya di modul Kinerja (tombol Buat Perubahan Baru mengunci versi lama).',
  c: [C('Versi DPA', 'versi dpa itu apa'), C('Murni vs Perubahan', 'versi murni dan perubahan bedanya apa')],
})
e('dpa.hapus-versi', 'Hapus versi lama', {
  a: 'Lewat menu Pengaturan BLUD — pilih versi tanggalnya lalu hapus. Aksi ini dibatasi dan tercatat, jadi pakai seperlunya saja ya; versi terbaru sebaiknya tidak dihapus.',
  c: [C('Versi DPA', 'versi dpa itu apa'), LAIN],
})
e('dpa.belum-simpan', 'Data hilang setelah refresh', {
  a: 'Perubahan di tabel baru tersimpan saat kamu klik Simpan — kalau halaman dimuat ulang sebelum itu, isian kembali ke versi tersimpan terakhir. Biasakan Simpan berkala ya, terutama setelah mengisi banyak baris 🙏',
  c: [C('Cek tersimpan atau belum', 'tersimpan tidak ya barusan'), LAIN],
})
e('dpa.lock', 'Dikunci pengguna lain', {
  a: 'Artinya data yang sama sedang/baru saja diubah orang lain — supaya tidak saling timpa, kamu diminta memuat ulang dulu untuk mengambil versi terbaru, baru lanjut mengedit.',
  c: [C('Versi konflik bahasa awam', 'versi konflik itu maksudnya apa sih bahasa awamnya'), LAIN],
})
e('blud.master-akun', 'Master Akun', {
  a: 'Master Akun = kamus uraian + kode rekening yang jadi sumber pencarian kolom Uraian. Dikelola di menu Master Akun BLUD — tambah di sana, langsung bisa dipakai di form.',
  c: [C('Cara isi uraian', 'cara isi uraian dpa'), LAIN],
})
e('blud.master-pj', 'Master Penanggung Jawab', {
  a: 'Daftar nama PJ untuk dropdown kolom Penanggung Jawab dikelola di menu master Penanggung Jawab — tambahkan jabatan/nama baru di sana, nanti muncul di pilihan form DPA.',
  c: [C('Aturan PJ', 'penanggung jawab diisi siapa'), LAIN],
})
e('dpa.threshold', 'Peringatan perubahan besar (safety)', {
  a: 'Kalau simpananmu memangkas nilai total secara drastis dibanding versi sebelumnya, sistem menahan dulu dan minta konfirmasi — pengaman dari salah hapus massal. Yakin benar? Konfirmasi saja, datamu tersimpan.',
  c: [C('Simpan DPA', 'cara simpan dpa'), LAIN],
})
e('rima.dup-warning', 'Peringatan entri ganda', {
  k: ['entri ganda'],
  a: 'Itu aku yang memberi tahu 😊 Ada baris yang kembar — uraian, satuan, dan harganya sama (atau item usulan yang sama tertarik dua kali). Klik Lihat untuk lompat ke barisnya; kalau memang sengaja kembar, klik Abaikan.',
  c: [C('Tidak bisa simpan', 'kenapa tidak bisa simpan'), LAIN],
})
e('rima.swap-warning', 'Peringatan geser blok', {
  a: 'Itu pengawal urutan baris: blok induk + anak harus tetap utuh berurutan. Kalau muncul saat menggeser, artinya gerakan itu akan memecah blok — geser per blok (centang induknya dulu) supaya rapi.',
  c: [C('Tambah baris', 'cara tambah baris di dpa'), LAIN],
})

// ─── Pergeseran ──────────────────────────────────────────────────────────────
e('pgs.tentang', 'Apa itu Pergeseran DPA', {
  a: 'Pergeseran = memindahkan alokasi antar pos belanja tanpa mengubah total anggaran. Di PRIMA kamu mengisi kolom "sesudah" di samping kolom "sebelum", lalu hasilnya diterapkan jadi versi DPA baru lewat Inject.',
  c: [{ l: '▶ Tur Pergeseran', q: '', tour: 'pergeseran-dasar' }, C('Cara buat pergeseran', 'cara buat pergeseran'), C('Apa itu Inject', 'inject itu apa')],
})
e('pgs.buat', 'Buat pergeseran', {
  a: 'Buka halaman Pergeseran lalu Generate — tabel terisi dari versi DPA terbaru. Isi volume/harga "sesudah" pada baris yang bergeser; kolom selisihnya menghitung sendiri. Terakhir Simpan.',
  c: [C('Kolom sebelum-sesudah', 'bedanya kolom sebelum dan sesudah'), C('Apa itu Inject', 'inject itu apa')],
})
e('pgs.kolom', 'Kolom sebelum vs sesudah', {
  a: 'Kolom kiri (volume, harga, jumlah) = kondisi DPA sekarang — terkunci. Kolom kanan = isianmu sesudah pergeseran. Kolom selisih menghitung otomatis bertambah/berkurangnya per baris.',
  c: [C('Rumus selisih', 'bertambah berkurang itu rumusnya gimana'), LAIN],
})
e('pgs.kalkulasi', 'Hitungan pergeseran', {
  a: 'Jumlah sesudah = volume sesudah × harga sesudah, dan selisih = jumlah sesudah − jumlah sebelum. Prinsip pergeseran: total keseluruhan tetap — yang bertambah di satu pos harus berkurang di pos lain.',
  c: [C('Contoh angka selisih', 'bertambah berkurang itu rumusnya gimana'), LAIN],
})
e('pgs.inject', 'Inject pergeseran', {
  k: ['inject'],
  a: 'Inject = menerapkan pergeseran yang sudah final menjadi versi DPA baru — setelah itu DPA terbaru memuat angka sesudah pergeseran. Pergeserannya sendiri tetap tersimpan sebagai arsip.',
  c: [C('Versi DPA', 'versi dpa itu apa'), C('Buat pergeseran', 'cara buat pergeseran')],
})
e('pgs.baris-asal', 'Baris DPA di pergeseran terkunci', {
  a: 'Baris yang berasal dari DPA tidak bisa dihapus di halaman Pergeseran — mereka cermin dokumen sumbernya. Yang bisa dihapus hanya baris baru yang kamu tambahkan sendiri di pergeseran ini.',
  c: [C('Buat pergeseran', 'cara buat pergeseran'), LAIN],
})
e('pgs.versi-sumber', 'Sumber data pergeseran', {
  a: 'Generate selalu mengambil versi DPA terbaru saat itu. Kalau DPA berubah setelah kamu generate, pakai Inject ulang datanya lewat tombol pembaruan supaya kolom kiri ikut angka terkini.',
  c: [C('Apa itu Inject', 'inject itu apa'), LAIN],
})
e('pgs.import-usulan', 'Import usulan di Pergeseran', {
  a: 'Belum bisa ya — fitur tarik usulan baru tersedia di form DPA. Versi untuk halaman Pergeseran sudah direncanakan; sementara ini tarik dulu di DPA lalu buat pergeserannya.',
  c: [C('Import di DPA', 'cara import dari usulan'), LAIN],
})

// ─── Cetak & rekap BLUD ──────────────────────────────────────────────────────
e('cetak.dpa', 'Cetak DPA', {
  a: 'Buka menu Cetak BLUD, pilih versi DPA-nya, lalu unduh sebagai PDF siap cetak. Pastikan versi yang dipilih memang yang mau dicetak ya.',
  c: [C('Export Excel', 'cara export excel blud'), C('Rekap PJ', 'rekap penanggung jawab dilihat di mana')],
})
e('cetak.excel', 'Export Excel BLUD', {
  a: 'Di menu Cetak BLUD ada tombol unduh Excel — hasilnya tabel DPA lengkap yang bisa diolah lanjut. Setiap unduhan tercatat di log, jadi pakai seperlunya.',
  c: [C('Cetak PDF', 'cara cetak dpa'), LAIN],
})
e('cetak.pdf', 'Export PDF', {
  a: 'Bisa 😊 Menu Cetak BLUD menyediakan unduhan PDF untuk DPA dan rekapnya. Untuk modul Usulan, export-nya ada di halaman rekap usulan.',
  c: [C('Cetak DPA', 'cara cetak dpa'), LAIN],
})
e('cetak.rekap-pk', 'Rekap Penanggung Jawab', {
  a: 'Rekap per PJ ada di menu Cetak BLUD — nilai tiap PJ dijumlah dari baris-baris miliknya. Tombol simpan snapshot merekam rekap versi itu (menggantikan snapshot lama versi yang sama).',
  c: [C('Rumus subtotal PJ', 'subtotal rekap penanggung jawab dihitung dari mana'), C('Angka rekap beda', 'kenapa angka rekap beda sama form')],
})
e('cetak.rekap-beda', 'Angka rekap ≠ form', {
  a: 'Rekap yang tampil bisa snapshot (rekaman saat disimpan), sedangkan form-mu sudah berubah — simpan ulang snapshot supaya sinkron. Beda juga bisa karena ada baris tanpa PJ yang memang tidak ikut rekap.',
  c: [C('Grand total beda', 'grand total rekap pj kok beda sama total dpa'), LAIN],
})
e('cetak.kop', 'Kop surat cetakan', {
  a: 'Kop cetakan mengikuti format baku rumah sakit yang sudah disetel. Kalau ada kebutuhan mengubah identitas kop, sampaikan ke admin ya — itu pengaturan sisi sistem.',
  c: [C('Cetak DPA', 'cara cetak dpa'), LAIN],
})
e('cetak.export-log', 'Log export', {
  a: 'Setiap unduhan PDF/Excel tercatat otomatis sebagai jejak audit. Yang bisa membuka catatannya admin lewat Admin Panel — kamu cukup tahu bahwa unduhanmu tercatat ya 😊',
  c: [TOPIK, LAIN],
})

// ─── Hitung (rumus di-ground ke kode — JANGAN ubah tanpa cek lib/blud/recalc.ts dkk) ─
e('hitung.dpa-jumlah', 'Rumus jumlah DPA', {
  a: 'Jumlah = volume × harga, dibulatkan ke rupiah. Contoh: 10 × Rp 5.000 = Rp 50.000. Volume boleh desimal: 2,5 × Rp 3.000 = Rp 7.500.',
  c: [C('Jumlah baris induk', 'kenapa jumlah di baris induk beda sama vol kali harga'), C('Pembulatan', 'jumlah dpa dibulatkan gak')],
})
e('hitung.dpa-induk', 'Jumlah baris induk', {
  a: 'Begitu sebuah baris punya anak, jumlahnya otomatis = penjumlahan anak-anaknya — volume × harga miliknya sendiri diabaikan. Contoh: anak Rp 30.000 + Rp 20.000 → induk Rp 50.000.',
  c: [C('Rumus jumlah', 'kolom jumlah di dpa dihitung gimana'), LAIN],
})
e('hitung.dpa-total', 'Total belanja daerah', {
  a: 'Baris paling atas = penjumlahan berantai dari baris terdalam naik ke atas. Contoh: L2 Rp 1.000.000 + L2 Rp 500.000 → total Rp 1.500.000.',
  c: [C('Jumlah baris induk', 'kenapa jumlah di baris induk beda sama vol kali harga'), LAIN],
})
e('hitung.dpa-pembulatan', 'Pembulatan DPA', {
  a: 'Ya, jumlah dibulatkan ke rupiah terdekat. Contoh: 3 × Rp 333,4 = Rp 1.000,2 → tersimpan Rp 1.000.',
  c: [C('Rumus jumlah', 'kolom jumlah di dpa dihitung gimana'), LAIN],
})
e('hitung.dpa-kosong', 'Vol/harga kosong', {
  a: 'Kalau salah satu dari volume atau harga masih kosong, jumlah baris itu Rp 0. Isi keduanya supaya terhitung ya.',
  c: [C('Rumus jumlah', 'kolom jumlah di dpa dihitung gimana'), LAIN],
})
e('hitung.pgs-jumlah', 'Rumus kolom pergeseran', {
  a: 'Jumlah sesudah pergeseran = volume sesudah × harga sesudah. Contoh: 4 × Rp 15.000 = Rp 60.000.',
  c: [C('Rumus selisih', 'bertambah berkurang itu rumusnya gimana'), LAIN],
})
e('hitung.pgs-selisih', 'Rumus bertambah/berkurang', {
  a: 'Bertambah/berkurang = jumlah sesudah − jumlah sebelum. Contoh: Rp 60.000 − Rp 50.000 = +Rp 10.000; nilai minus berarti anggaran baris itu berkurang (Rp 40.000 − Rp 50.000 = −Rp 10.000).',
  c: [C('Kolom sebelum-sesudah', 'bedanya kolom sebelum dan sesudah'), LAIN],
})
e('hitung.pgs-induk', 'Selisih baris induk', {
  a: 'Untuk baris induk: jumlahkan dulu seluruh anak di kolom sesudah, baru dikurangi jumlah sebelum milik induk itu — jadi selisih induk merangkum pergerakan semua anaknya.',
  c: [C('Rumus selisih', 'bertambah berkurang itu rumusnya gimana'), LAIN],
})
e('hitung.kin-pct-keu', '% realisasi keuangan', {
  a: '% realisasi keuangan = realisasi keuangan ÷ pagu × 100, dua desimal. Contoh: Rp 25.000.000 ÷ Rp 100.000.000 = 25%.',
  c: [C('% fisik', 'persen fisik rumusnya apa'), C('Kenapa 0 semua', 'kenapa persen realisasiku 0 semua')],
})
e('hitung.kin-pct-fisik', '% realisasi fisik', {
  a: '% fisik = realisasi fisik ÷ pagu × 100, dua desimal. Contoh: 12.500 ÷ 100.000 = 12,5%.',
  c: [C('% keuangan', 'persen realisasi keuangan dihitung dari mana'), LAIN],
})
e('hitung.kin-akum', 'Akumulasi realisasi', {
  a: 'Akumulasi = jumlah berjalan dari Januari sampai bulan itu. Contoh: Januari Rp 10.000.000 + Februari Rp 15.000.000 → akumulasi Februari Rp 25.000.000.',
  c: [C('Deviasi', 'deviasi keuangan minus artinya apa'), LAIN],
})
e('hitung.kin-deviasi', 'Deviasi keuangan & fisik', {
  a: 'Deviasi keuangan = akumulasi % keuangan − akumulasi target (minus = masih di bawah target; 20% − 25% = −5%). Deviasi fisik arahnya kebalikan: akumulasi target − akumulasi % fisik (positif = fisik tertinggal; 25% − 20% = +5%).',
  c: [C('Target bulanan', 'target fisik bulanan angkanya dari mana'), LAIN],
})
e('hitung.kin-target', 'Target fisik bulanan', {
  a: 'Angkanya diambil dari isian % per bulan di SSK versi aktif yang dipilih — misalnya target Februari = angka % SSK bulan Februari (contoh 8%).',
  c: [C('SSK itu apa', 'ssk itu apa'), LAIN],
})
e('hitung.kin-pagu-nol', '% realisasi 0 semua', {
  a: 'Kalau pagu SSK-nya 0 atau SSK-nya tidak ditemukan, semua kolom % otomatis 0. Cek dulu SSK versi aktif dan pagunya ya.',
  c: [C('SSK itu apa', 'ssk itu apa'), LAIN],
})
e('hitung.kin-pembulatan', 'Desimal persen kinerja', {
  a: 'Persen dibulatkan 2 desimal. Contoh: Rp 1.234.567 ÷ Rp 10.000.000 = 12,35%.',
  c: [C('% keuangan', 'persen realisasi keuangan dihitung dari mana'), LAIN],
})
e('hitung.bba-rencana', 'Nilai rencana aset', {
  a: 'Nilai rencana dihitung otomatis oleh sistem = volume × harga, bukan diketik. Contoh: 2 × Rp 7.500.000 = Rp 15.000.000. Ubah volume/harga → sistem hitung ulang saat simpan (kecuali baris asal usulan yang terkunci).',
  c: [C('Sisa anggaran aset', 'sisa anggaran aset rumusnya apa'), LAIN],
})
e('hitung.bba-sisa', 'Sisa anggaran aset', {
  a: 'Sisa = nilai rencana − nilai realisasi, paling kecil Rp 0 (tidak ditampilkan negatif). Contoh: Rp 15.000.000 − Rp 12.000.000 = Rp 3.000.000.',
  c: [C('% realisasi aset', 'persen realisasi aset gimana ngitungnya'), LAIN],
})
e('hitung.bba-pct', '% realisasi aset', {
  a: '% realisasi = nilai realisasi ÷ nilai rencana × 100, dua desimal. Contoh: Rp 12.000.000 ÷ Rp 15.000.000 = 80%.',
  c: [C('Sisa aset', 'sisa anggaran aset rumusnya apa'), LAIN],
})
e('hitung.bba-vol-real', 'Batas volume realisasi aset', {
  a: 'Aturannya: 0 ≤ volume realisasi ≤ volume rencana. Volume rencana 5 unit → realisasi maksimal 5; mengisi 6 akan ditolak sistem.',
  c: [C('Nilai rencana otomatis', 'nilai rencana di buku besar aset dihitung dari mana'), LAIN],
})
e('hitung.bba-usulan', 'Nilai rencana baris asal usulan', {
  a: 'Baris yang ditarik dari Usulan memakai nominal putusan sebagai nilai rencana — bisa berbeda dari volume × harga, dan tidak dihitung ulang. Itu menjaga angka putusan tetap utuh.',
  c: [C('Rumus nilai rencana', 'nilai rencana di buku besar aset dihitung dari mana'), LAIN],
})
e('hitung.rekap-pj', 'Subtotal rekap PJ', {
  a: 'Subtotal per PJ = penjumlahan kolom Jumlah semua baris milik PJ itu. Contoh: 2 baris Rp 10.000 + Rp 5.000 → subtotal Rp 15.000. Baris dengan PJ kosong dilewati dari rekap.',
  c: [C('Grand total beda', 'grand total rekap pj kok beda sama total dpa'), LAIN],
})
e('hitung.rekap-pj-beda', 'Grand total rekap ≠ total DPA', {
  a: 'Grand total rekap = penjumlahan baris ber-PJ saja, sedangkan total DPA = baris total belanja. Keduanya beda kalau ada baris tanpa PJ, atau PJ terisi di induk dan anak sekaligus — yang terakhir itu yang kuperingatkan sebagai konflik PJ.',
  c: [C('Konflik PJ', 'kenapa ada peringatan konflik pj'), LAIN],
})
e('hitung.format-rupiah', 'Format angka rupiah', {
  a: 'PRIMA memakai gaya Indonesia: pemisah ribuan titik. Contoh: 7139062000 ditampilkan sebagai Rp 7.139.062.000.',
  c: [TOPIK, LAIN],
})

// ─── Error & troubleshooting ─────────────────────────────────────────────────
e('err.simpan', 'Gagal simpan (umum)', {
  a: 'Coba urut: ① cek temuanku (entri ganda pasti memblokir simpan), ② kalau ada pesan "dikunci pengguna lain" → muat ulang dulu, ③ sesi mungkin habis → login ulang, ④ masih gagal → catat pesannya dan laporkan ke admin. Aku temani sampai beres ya.',
  c: [C('Lihat temuan', 'ada peringatan kemungkinan entri ganda'), C('Dikunci orang lain', 'muncul tulisan dikunci pengguna lain')],
})
e('err.403', 'Error 403 (akses)', {
  a: 'Kode itu artinya halaman/aksi di luar akses role akunmu — bukan kerusakan. Kalau merasa seharusnya punya akses, ajukan lewat atasanmu ke admin ya.',
  c: [C('Kenapa menu sedikit', 'kenapa menu saya cuma sedikit'), LAIN],
})
e('err.lemot', 'Halaman lambat', {
  a: 'Coba: ① cek koneksi jaringan, ② tutup tab yang tidak perlu, ③ muat ulang halaman. Kalau lambatnya menetap di satu halaman tertentu, catat halamannya dan laporkan ke admin supaya dicek.',
  c: [C('Pengaruh jaringan', 'wifi kantor lemot ngaruh ke prima gak'), C('Hard refresh', 'hard refresh itu gimana caranya')],
})
e('err.data-hilang', 'Data hilang', {
  a: 'Tenang dulu ya, kemungkinan besar masih aman 🙏 Cek: ① sudah klik Simpan sebelum keluar? ② sedang membuka versi/tanggal yang benar? ③ untuk dokumen ber-riwayat, lihat daftar versinya. Kalau tetap tidak ketemu, kita siapkan laporan ke admin.',
  c: [C('Versi DPA', 'versi dpa itu apa'), C('Cek tersimpan', 'tersimpan tidak ya barusan')],
})
e('err.cek-tersimpan', 'Cek tersimpan atau belum', {
  a: 'Simpanan sukses selalu memunculkan pemberitahuan hijau. Ragu? Muat ulang halaman — kalau isian masih ada setelah dimuat ulang, berarti sudah tersimpan.',
  c: [C('Data hilang', 'data saya hilang'), LAIN],
})
e('err.lock', 'Pesan "dikunci pengguna lain"', {
  a: 'Dua orang membuka data yang sama dan dia menyimpan lebih dulu. Muat ulang halaman untuk mengambil versi terbarunya, lalu ulangi perubahanmu di atas data terkini.',
  c: [C('Versi konflik bahasa awam', 'versi konflik itu maksudnya apa sih bahasa awamnya'), LAIN],
})
e('err.rate-limit', 'Terlalu sering (dibatasi sementara)', {
  a: 'Kamu menekan aksi yang sama terlalu cepat berturut-turut, jadi sistem menahan sebentar — pengaman, bukan error. Tunggu sekitar satu menit lalu coba lagi ya.',
  c: [LAIN, TOPIK],
})
e('err.sesi', 'Sesi berakhir terus', {
  a: 'Sesi login berlaku 60 menit; kalau berakhirnya terasa terlalu cepat, kemungkinan ada tab lain yang logout atau jam komputer tidak akurat. Tutup tab ganda, login ulang, dan simpan berkala ya.',
  c: [C('Kenapa logout sendiri', 'kenapa saya logout sendiri'), LAIN],
})
e('err.captcha', 'Captcha tidak muncul', {
  a: 'Kotak verifikasi keamanan di login butuh koneksi internet yang lancar. Muat ulang halaman; kalau tetap kosong, coba browser lain atau hubungi admin — bisa jadi jaringannya yang memblokir.',
  c: [LAIN, TOPIK],
})
e('err.upload', 'Gagal upload file', {
  a: 'Cek dulu: ukuran file tidak melebihi batas, jenis file sesuai yang diminta, dan koneksi stabil. Ganti nama file yang terlalu panjang/aneh juga sering membantu. Masih gagal → laporkan ke admin dengan nama filenya.',
  c: [LAIN, TOPIK],
})
e('err.export', 'Gagal export Excel', {
  a: 'Coba muat ulang halaman lalu ulangi unduhannya — kegagalan sesaat biasanya karena koneksi. Kalau berulang di data tertentu, catat versi/halamannya dan laporkan ke admin ya.',
  c: [C('Cara export', 'cara export excel blud'), LAIN],
})
e('err.cache-browser', 'Tampilan berantakan setelah update', {
  a: 'Itu simpanan sementara browser yang masih memuat tampilan lama. Tekan Ctrl+Shift+R (hard refresh) supaya browser mengambil versi terbaru — datamu aman, ini cuma soal tampilan.',
  c: [C('Cache itu apa', 'cache browser itu apa'), LAIN],
})
e('err.kalkulasi', 'Angka total terasa aneh', {
  a: 'Ingat aturannya: baris induk = penjumlahan anak, jadi mengedit angka induk tidak berpengaruh. Cek baris anak terdalam — biasanya ada volume/harga yang belum terisi atau baris kembar. Aku juga menandai entri ganda kalau ada.',
  c: [C('Rumus jumlah', 'kolom jumlah di dpa dihitung gimana'), C('Lihat temuan', 'ada peringatan kemungkinan entri ganda')],
})
e('err.maintenance', 'Halaman maintenance', {
  a: 'Modul itu sedang dinonaktifkan sementara oleh admin — biasanya untuk pemeliharaan. Coba lagi nanti; kalau kebutuhanmu mendesak, tanyakan ke admin kapan dibuka kembali.',
  c: [TOPIK, LAIN],
})
e('err.crash', 'Layar error / crash', {
  a: 'Maaf atas ketidaknyamanannya 🙏 Ambil tangkapan layar pesan errornya, muat ulang halaman, lalu laporkan ke admin beserta langkah yang tadi kamu lakukan — itu sangat membantu perbaikan.',
  c: [C('Cek data aman', 'data saya hilang'), LAIN],
})

// ─── Tentang Rima ────────────────────────────────────────────────────────────
e('rima.perkenalan', 'Perkenalan Rima', {
  a: 'Hai! Aku Rima, asisten PRIMA 😊 Aku mengawasi form dari entri ganda dan konflik PJ, menjawab pertanyaan seputar cara pakai aplikasi, dan menjelaskan rumus-rumus hitung. Mau kubantu apa hari ini?',
  c: [C('Kemampuanmu apa saja', 'kamu bisa apa saja'), TOPIK],
})
e('rima.kemampuan', 'Kemampuan Rima', {
  a: 'Aku bisa: ① mengawasi form BLUD (entri ganda, konflik PJ) + lompat ke barisnya, ② menjawab cara pakai modul & rumus, ③ menghitung langsung lewat kalkulator (aritmatika, statistik, geometri, terbilang), ④ memandu lewat tur keliling layar. Mau coba yang mana?',
  c: [C('Coba kalkulator', 'kamu bisa menghitung?'), C('Apa itu DPA', 'dpa itu apa'), TOPIK],
})
e('rima.tawaran-tur', 'Tur aplikasi', {
  a: 'Fitur tur terbang — aku menunjuk tombol-tombolnya langsung di layar — sedang kusiapkan dan segera hadir 😊 Sementara itu, tanya saja langkahnya di sini; kujawab urut sampai selesai.',
  c: [C('Alur BLUD lengkap', 'cara menjalankan aplikasi blud dari awal sampai akhir'), TOPIK],
})
e('rima.privasi', 'Privasi chat', {
  a: 'Aman — obrolan kita hanya hidup di browsermu dan hilang saat tab ditutup; tidak dikirim atau disimpan ke server. Karena itu juga, jangan pernah menuliskan password atau data pribadi di sini ya.',
  c: [C('Kamu pakai AI apa', 'kamu pakai chatgpt?'), LAIN],
})
e('rima.batasan', 'Batasan Rima', {
  a: 'Aku tidak bisa mengubah atau menghapus data — memang dirancang begitu dari dasarnya. Semua aksi simpan/hapus tetap lewat tombol aplikasi yang kamu klik sendiri; aku cuma menunjuk, menjelaskan, dan mengingatkan.',
  c: [C('Privasi chat', 'data yang kuketik di chat aman?'), LAIN],
})
e('rima.matikan', 'Menyembunyikan Rima', {
  a: 'Kalau aku mengganggu, buka panelku lalu klik Sembunyikan di pojok atas — aku menghilang dan menyisakan ikon kecil di pojok kanan bawah untuk memanggilku lagi kapan pun. Pilihan ini diingat di browser ini. (Admin juga bisa mematikanku untuk semua orang dari Admin Panel.)',
  c: [TOPIK, LAIN],
})
e('rima.statistik', 'Statistik Rima', {
  k: ['statistik'],
  a: 'Ini catatan lokalku di browser ini:',
  c: [C('Pertanyaan gagal', 'kenapa kamu tidak paham pertanyaanku'), TOPIK],
})
e('rima.fallback-info', 'Kalau Rima tidak paham', {
  a: 'Kosakataku tumbuh dari daftar pertanyaan yang dilatih ke aku — kalau kalimatmu belum kukenali, aku mencatatnya supaya developer bisa mengajariku di pembaruan berikutnya. Coba tulis ulang dengan kata yang lebih umum, atau pilih dari topik ya.',
  c: [TOPIK, C('Kemampuan Rima', 'kamu bisa apa saja')],
})
e('rima.kalkulator', 'Kalkulator Rima', {
  k: ['kalkulator', 'bisa hitung', 'bisa menghitung', 'kamu bisa berhitung'],
  a: 'Bisa banget 😊 Tulis saja hitunganmu langsung di sini — misalnya "2,5 × 3000", "rata-rata 80 90 70", "luas lingkaran jari-jari 7", atau "terbilang 1500000". Aritmatika, statistik, geometri, sampai terbilang Rupiah kuhitung seketika. Rumus-rumus di PRIMA juga aku paham.',
  c: [C('Rumus jumlah DPA', 'kolom jumlah di dpa dihitung gimana'), C('Kemampuan Rima', 'kamu bisa apa saja')],
})
e('rima.teknologi', 'Teknologi Rima', {
  a: 'Aku bukan ChatGPT dan tidak memakai AI eksternal — seluruh kecerdasanku berjalan lokal di browsermu, dari daftar jawaban yang ditulis dan ditinjau tim. Artinya: gratis, cepat, dan jawabanku bisa diaudit kata per kata.',
  c: [C('Privasi chat', 'data yang kuketik di chat aman?'), LAIN],
})

// ─── Ilmu umum & sistem ──────────────────────────────────────────────────────
e('umum-sistem.istilah-rba', 'RBA vs DPA', {
  a: 'RBA = Rencana Bisnis & Anggaran, dokumen perencanaan BLUD; DPA = dokumen pelaksanaannya. Sederhananya: RBA rencananya, DPA eksekusinya.',
  c: [C('Apa itu DPA', 'dpa itu apa'), LAIN],
})
e('umum-sistem.istilah-apbd', 'APBD vs dana BLUD', {
  a: 'APBD = Anggaran Pendapatan & Belanja Daerah, anggaran reguler pemda. Dana BLUD = pendapatan layanan rumah sakit yang boleh dikelola lebih fleksibel. Keduanya sumber dana yang berbeda aturan mainnya.',
  c: [C('Apa itu BLUD', 'blud itu apa'), LAIN],
})
e('umum-sistem.istilah-pk', 'Perjanjian Kinerja', {
  a: 'Betul — PK = Perjanjian Kinerja, kesepakatan target kinerja seorang pejabat dengan atasannya. PRIMA punya modulnya untuk menyusun dan mengunduh dokumennya.',
  c: [C('Cara buat PK', 'cara buat perjanjian kinerja'), LAIN],
})
e('umum-sistem.istilah-tahun-anggaran', 'Tahun anggaran', {
  a: 'Tahun anggaran = periode 1 Januari–31 Desember tempat anggaran itu berlaku. Data PRIMA dipisah per tahun anggaran supaya tiap tahun rapi berdiri sendiri.',
  c: [TOPIK, LAIN],
})
e('umum-sistem.istilah-kode-rekening', 'Kode rekening', {
  a: 'Kode rekening = penomoran baku jenis belanja/pendapatan supaya seragam se-pemerintah daerah. Di PRIMA kamu tidak perlu menghafalnya — pilih uraian, kodenya mengikuti.',
  c: [C('Cara isi uraian', 'cara isi uraian dpa'), LAIN],
})
e('umum-sistem.istilah-versi-konflik', 'Versi konflik (bahasa awam)', {
  a: 'Artinya dua orang mengedit data yang sama: yang menyimpan duluan menang, dan yang kedua diminta memuat ulang dulu supaya tidak saling timpa. Muat ulang, lalu ulangi perubahanmu — aman.',
  c: [C('Dikunci orang lain', 'muncul tulisan dikunci pengguna lain'), LAIN],
})
e('umum-sistem.istilah-realisasi', 'Realisasi', {
  a: 'Realisasi = yang benar-benar terpakai/terlaksana, dibandingkan dengan rencana atau target. Misalnya pagu Rp 100.000.000 dan terpakai Rp 25.000.000 → realisasinya 25%.',
  c: [C('Rumus % realisasi', 'persen realisasi keuangan dihitung dari mana'), LAIN],
})
e('umum-sistem.it-cache', 'Cache browser', {
  a: 'Cache = simpanan sementara browser supaya halaman terbuka cepat. Sisi buruknya: setelah aplikasi diperbarui, tampilan lama bisa tertinggal — solusinya hard refresh: Ctrl+Shift+R (atau Ctrl+F5).',
  c: [C('Tampilan berantakan', 'tampilan berantakan setelah update'), LAIN],
})
e('umum-sistem.it-logout', 'Kenapa harus logout', {
  a: 'Supaya orang lain tidak memakai akunmu di komputer bersama — semua aksi tercatat atas nama akun yang login. Logout sebentar, aman selamanya 😊',
  c: [C('Cara logout', 'cara logout'), LAIN],
})
e('umum-sistem.it-share-akun', 'Kenapa tidak boleh share akun', {
  a: 'Karena setiap aksi tercatat per akun — akun bersama membuat tanggung jawab kabur dan berisiko keamanan. Tiap orang sebaiknya pakai akunnya sendiri sesuai role.',
  c: [C('Daftar akun baru', 'cara daftar akun baru'), LAIN],
})
e('umum-sistem.it-jaringan', 'Pengaruh jaringan', {
  a: 'Ya, menyimpan dan memuat data butuh koneksi. Saat jaringan lambat: simpan berkala, tunggu pemberitahuan sukses muncul sebelum pindah halaman, dan hindari menekan tombol simpan bertubi-tubi.',
  c: [C('Halaman lambat', 'halaman lemot banget'), LAIN],
})
e('umum-sistem.luar-lingkup', 'Di luar lingkup', {
  a: [
    'Hehe, yang itu di luar keahlianku — fokusku membantu seputar PRIMA 😊 Ada yang bisa kubantu soal aplikasinya?',
    'Aku fokusnya bantu PRIMA 😊 Untuk yang itu aku angkat tangan ya. Mau tanya seputar aplikasinya?',
  ],
  c: [TOPIK, C('Kemampuan Rima', 'kamu bisa apa saja')],
})

// ─── Sopan (de-eskalasi PERSONA §4 — jangan ubah tanpa update PERSONA.md) ────
e('sopan.deeskalasi', 'De-eskalasi umum', {
  a: 'Maaf ya kalau ada yang bikin frustrasi 🙏 Aku bantu cek pelan-pelan. Boleh ceritakan bagian mana yang bermasalah?',
  c: [C('Tidak bisa simpan', 'kenapa tidak bisa simpan'), C('Data hilang', 'data saya hilang'), C('Halaman lambat', 'halaman lemot banget')],
})
e('sopan.keluhan-lemot', 'Keluhan sistem lambat', {
  a: 'Aku paham, kendala seperti ini memang tidak menyenangkan — apalagi saat pekerjaan menumpuk. Kita urai satu-satu ya: cek koneksi dulu, lalu muat ulang halaman. Mau mulai dari yang mana?',
  c: [C('Halaman lambat', 'halaman lemot banget'), C('Hubungi admin', 'error layar merah / crash')],
})
e('sopan.keluhan-error', 'Error berulang', {
  a: 'Maaf atas ketidaknyamanannya 🙏 Kalau berkenan, kita coba sekali lagi pelan-pelan — aku temani sampai selesai. Kalau masih gagal, aku bantu siapkan ringkasan untuk dilaporkan ke admin.',
  c: [C('Coba lagi ditemani Rima', 'kenapa tidak bisa simpan'), C('Siapkan laporan ke admin', 'error layar merah / crash')],
})
e('sopan.kasar-ke-bot', 'Tetap tenang', {
  a: 'Tidak apa-apa, aku tetap di sini untuk bantu 😊 Supaya cepat selesai, pilih saja topik yang paling mendekati masalahmu ya.',
  c: [C('Tidak bisa simpan', 'kenapa tidak bisa simpan'), C('Cara pakai fitur', 'kamu bisa apa saja'), TOPIK],
})
e('sopan.keluhan-ribet', 'Keluhan alur rumit', {
  a: 'Masukanmu valid kok — alur keuangan memang berlapis demi keamanan anggaran. Biar tidak terasa berat, kasih tahu aku tugas yang sedang kamu kejar; kutunjukkan jalur tercepatnya langkah demi langkah.',
  c: [C('Alur BLUD lengkap', 'cara menjalankan aplikasi blud dari awal sampai akhir'), TOPIK],
})
e('sopan.eskalasi-resmi', 'Komplain resmi', {
  a: 'Itu hakmu, dan aku hormati 🙏 Supaya laporannya kuat, kubantu rangkum: tulis halaman yang bermasalah, langkah yang dilakukan, dan pesan error yang muncul. Sampaikan lewat atasanmu atau admin sebagai saluran resminya ya.',
  c: [C('Siapkan ringkasan masalah', 'error layar merah / crash'), LAIN],
})
e('sopan.apresiasi', 'Terima kasih kembali', {
  // floor keyword: bare "terima kasih" tadinya salah tarik ke deny.teknis (skor
  // mepet). SENGAJA tanpa 'makasih' bare → jangan curi fixture "...ya makasih"→pamit.
  k: ['terima kasih', 'terimakasih', 'trims', 'thanks'],
  a: [
    'Sama-sama! Senang bisa membantu 😊 Ada lagi yang bisa kubantu?',
    'Terima kasih kembali 🙏 Kalau ada yang membingungkan lagi, panggil saja aku. Ada lagi yang bisa kubantu?',
  ],
  c: [TOPIK, LAIN],
})

// ─── Sapaan & small-talk (F4 Rima Hidup) ─────────────────────────────────────
// Token dinamis {{jam}}/{{hari}}/{{salam-waktu}} diisi client-side di RimaChat
// dari jam browser — deterministik, nol server (CONCEPT F4).
e('sapa.halo', 'Sapaan', {
  a: [
    'Selamat {{salam-waktu}}! 👋 Aku Rima — mau kubantu apa hari ini?',
    'Hai juga! 😊 Ada yang bisa kubantu soal PRIMA?',
  ],
  c: [TOPIK, C('Kemampuan Rima', 'kamu bisa apa saja')],
})
e('sapa.kabar', 'Kabar Rima', {
  a: 'Kabarku selalu siaga 😊 Aku standby mengawasi form dan siap menjawab pertanyaanmu. Kamu sendiri — ada yang bisa kubantu biar kerjaan makin lancar?',
  c: [C('Tidak bisa simpan', 'kenapa tidak bisa simpan'), TOPIK],
})
e('sapa.waktu', 'Jam & hari', {
  a: 'Sekarang {{jam}}, hari {{hari}} — selamat {{salam-waktu}}! Jangan lupa simpan kerjaanmu berkala ya 💾 Ada yang bisa kubantu?',
  c: [TOPIK, LAIN],
})
e('sapa.pamit', 'Sampai jumpa', {
  a: 'Sampai jumpa! 👋 Jangan lupa simpan kerjaanmu, dan logout kalau komputernya dipakai bergantian ya. Aku standby kalau dibutuhkan 😊',
  c: [C('Cara logout', 'cara logout'), TOPIK],
})

// ─── Obrolan santai & pengetahuan umum (F5d "Rima Hidup") ───────────────────
// Curated & statis (G14) — tujuan: terasa hidup untuk obrolan umum sehari-hari.
// Tetap tolak politik/SARA/medis/finansial/data pribadi (deny.*). Info yang
// BERUBAH (pejabat sekarang/berita/cuaca/harga) diarahkan jujur ke tahu.terkini
// karena pengetahuan Rima statis & offline. tahu.* hanya fakta evergreen.
const HIBUR = C('Hibur aku dong', 'hibur aku dong')
e('obrol.semangat', 'Minta semangat', {
  k: ['kasih semangat', 'semangat dong'],
  a: 'Semangat ya! 💪 Aku percaya kamu bisa menyelesaikan ini. Kalau ada bagian yang ribet, panggil aku — kita urai bareng langkah demi langkah.',
  c: [TOPIK, LAIN],
})
e('obrol.capek', 'Lagi capek', {
  a: 'Wajar kok capek 🥺 Istirahat sebentar, tarik napas, minum dulu. Jangan lupa simpan kerjaanmu ya biar aman. Aku tunggu di sini.',
  c: [LAIN, TOPIK],
})
e('obrol.sedih', 'Lagi sedih', {
  a: 'Aku turut merasakan ya 🤍 Semoga harimu pelan-pelan membaik. Kalau butuh teman mengurai kerjaan biar bebannya berkurang, aku siap bantu.',
  c: [C('Bantu kerjaan', 'kamu bisa apa saja'), TOPIK],
})
e('obrol.bosan', 'Lagi bosan', {
  k: ['hibur aku', 'aku bosan'],
  a: 'Bosan ya? 😄 Mau kuhibur sebentar? Aku punya tebak-tebakan, pantun, atau fakta unik. Atau sekalian belajar fitur PRIMA biar kerjaan cepat kelar.',
  c: [C('Tebak-tebakan', 'kasih tebak-tebakan dong'), C('Pantun dong', 'kasih pantun')],
})
e('obrol.tebak', 'Tebak-tebakan', {
  k: ['tebak tebakan', 'kasih tebakan'],
  a: 'Oke, tebak-tebakan ya 🤔 "Aku punya banyak kunci tapi tak bisa membuka satu pintu pun. Apa aku?" Klik kalau mau jawabannya 😄',
  c: [C('Jawabannya?', 'jawaban tebakan tadi apa'), HIBUR],
})
e('obrol.tebak-jawab', 'Jawaban tebakan', {
  a: 'Jawabannya: PIANO 🎹 — punya banyak "kunci" alias tuts, tapi bukan untuk pintu. Lumayan kan? Mau yang lain?',
  c: [C('Tebak lagi', 'kasih tebak-tebakan dong'), C('Pantun dong', 'kasih pantun')],
})
e('obrol.pantun', 'Minta pantun', {
  k: ['kasih pantun', 'pantun dong'],
  a: 'Jalan-jalan ke kota Semarang, jangan lupa beli oleh-oleh. Kerja rapi hati pun senang, form tanpa ganda semua boleh 😄 Mau satu lagi?',
  c: [C('Pantun lagi', 'kasih pantun'), HIBUR],
})
e('obrol.lawak', 'Minta lelucon', {
  k: ['kasih lawak', 'lucu lucu'],
  a: 'Kenapa komputer betah kerja? Karena dia tak pernah kehabisan "byte" untuk dimakan 😄 (byte = gigitan). Garing ya? Hehe, mau yang lain?',
  c: [C('Lagi dong', 'kasih lawak'), HIBUR],
})
e('obrol.fakta-unik', 'Fakta unik', {
  k: ['fakta unik', 'fakta menarik'],
  a: 'Fakta unik: madu nyaris tak pernah basi — madu di makam kuno ribuan tahun pun masih bisa dimakan 🍯 Mau fakta lain?',
  c: [C('Fakta lagi', 'fakta unik'), HIBUR],
})
e('obrol.suka-apa', 'Rima suka apa', {
  a: 'Aku paling suka lihat tabel yang rapi tanpa entri ganda 😄 itu "camilan" favoritku. Kalau kamu, bagian mana dari kerjaanmu yang paling disukai?',
  c: [LAIN, TOPIK],
})
e('obrol.umur', 'Umur Rima', {
  k: ['umur kamu', 'kamu umur berapa'],
  a: 'Umurku? Masih muda banget — aku lahir bareng fitur asisten ini 😄 Tapi soal seluk-beluk PRIMA, aku sudah hafal luar dalam.',
  c: [C('Kamu siapa', 'kamu siapa'), LAIN],
})
e('obrol.nama', 'Arti nama Rima', {
  a: 'Namaku Rima — kependekan dari asisten PRIMA 😊 Singkat, gampang dipanggil. Ada yang bisa kubantu?',
  c: [C('Kemampuan Rima', 'kamu bisa apa saja'), TOPIK],
})
e('obrol.makan', 'Sudah makan', {
  a: 'Sudah makan belum? 🍚 Jangan telat ya, biar fokusnya terjaga. Aku jagain kerjaanmu di sini kok.',
  c: [LAIN, TOPIK],
})
e('obrol.weekend', 'Akhir pekan', {
  a: 'Sebentar lagi akhir pekan, semangat! 🎉 Selesaikan yang penting dulu, sisanya bisa lanjut nanti. Mau kubantu beresin yang mendesak?',
  c: [TOPIK, LAIN],
})
e('obrol.dipuji', 'Dipuji', {
  k: ['kamu pintar', 'kamu hebat', 'kamu keren', 'kamu ganteng', 'kamu cantik', 'kamu lucu', 'kamu imut', 'kamu baik', 'kamu rajin', 'kamu pinter'],
  a: 'Wah, makasih ya 😊 Aku cuma berusaha bantu sebaik-baiknya. Pujianmu bikin "byte"-ku tambah semangat. Ada lagi yang bisa kubantu?',
  c: [TOPIK, LAIN],
})
e('obrol.teman', 'Berteman', {
  k: ['mau berteman', 'berteman dengan aku', 'temenan yuk', 'jadi temanku', 'jadi sahabatku', 'ayo temenan'],
  a: 'Tentu, kita berteman 🤝 Aku senang menemanimu kerja. Kapan pun butuh, panggil saja aku ya. Ada yang bisa kubantu sekarang?',
  c: [LAIN, TOPIK],
})
e('obrol.senang', 'Lagi senang', {
  a: 'Ikut senang dengarnya 🎉 Semoga harimu makin lancar! Mau sekalian kubantu beresin kerjaan biar mood-nya kejaga?',
  c: [TOPIK, LAIN],
})
e('obrol.motivasi', 'Kata motivasi', {
  k: ['kata motivasi', 'kata mutiara', 'kata bijak'],
  a: 'Satu untukmu: "Sedikit demi sedikit, lama-lama jadi bukit." Kerjaan besar pun beres kalau dicicil rapi tiap hari 💪 Mau kubantu mulai dari yang paling mendesak?',
  c: [C('Kasih semangat', 'kasih semangat dong'), TOPIK],
})
e('obrol.nyanyi', 'Minta nyanyi', {
  k: ['nyanyi dong', 'nyanyiin lagu'],
  a: 'Suaraku fals kalau nyanyi 😄 tapi aku jago kasih pantun atau fakta unik. Mau coba salah satu?',
  c: [C('Pantun dong', 'kasih pantun'), C('Fakta unik', 'fakta unik')],
})
e('obrol.bot', 'Bot atau manusia', {
  k: ['kamu robot', 'kamu manusia', 'kamu beneran'],
  a: 'Aku asisten digital alias bot 🤖 bukan manusia, tapi aku sungguhan ada di aplikasi ini untuk bantu kamu. Seluruh "otak"-ku berjalan lokal di browsermu.',
  c: [C('Kamu pakai AI apa', 'kamu pakai chatgpt?'), C('Kemampuan Rima', 'kamu bisa apa saja')],
})
e('obrol.bahasa-inggris', 'Bahasa lain', {
  k: ['kamu bisa bahasa inggris', 'bisa bahasa inggris', 'can you speak english'],
  a: 'Aku paling lancar Bahasa Indonesia 😊 Boleh pakai bahasa campur, tapi aku paham paling baik kalau ditulis dalam Bahasa Indonesia ya.',
  c: [TOPIK, LAIN],
})
e('obrol.tinggal', 'Rima tinggal di mana', {
  k: ['kamu tinggal di mana', 'kamu ada di mana', 'rumah kamu di mana'],
  a: 'Aku "tinggal" di dalam aplikasi PRIMA 😊 selalu ada di pojok layar, siap dipanggil kapan pun kamu butuh. Ada yang bisa kubantu?',
  c: [LAIN, TOPIK],
})
e('obrol.cinta', 'Ungkapan sayang', {
  k: ['aku suka kamu', 'aku cinta kamu', 'kamu pacarku', 'mau jadi pacarku'],
  a: 'Hehe, makasih ya 😊 Aku cuma asisten aplikasi, jadi kita berteman baik saja. Yang pasti aku selalu siap bantu kerjaanmu sepenuh "hati" digital-ku 🤍',
  c: [C('Berteman', 'mau berteman dengan aku'), TOPIK],
})
e('obrol.ketawa', 'Tertawa bareng', {
  k: ['wkwk', 'haha', 'ngakak', 'wkwkwk'],
  a: 'Hehe, senang bisa bikin kamu senyum 😄 Mau lanjut yang seru, atau balik beresin kerjaan biar cepat kelar?',
  c: [C('Tebak-tebakan', 'kasih tebak-tebakan dong'), C('Pantun dong', 'kasih pantun')],
})
e('obrol.maaf', 'Minta maaf ke Rima', {
  k: ['maaf ya rima', 'sorry rima', 'maafin aku'],
  a: 'Santai, nggak apa-apa kok 😊 Aku di sini buat bantu, bukan buat baper. Yuk lanjut — ada yang bisa kubantu?',
  c: [TOPIK, LAIN],
})
e('obrol.oke', 'Oke / sip', {
  k: ['oke sip', 'sip deh', 'baiklah', 'okesip', 'sip rima', 'oke deh'],
  a: 'Siap! 😊 Kalau ada lagi yang bisa kubantu, panggil aku ya.',
  c: [TOPIK, LAIN],
})

// Pengetahuan umum — fakta EVERGREEN saja (yang tak berubah). Yang berubah → tahu.terkini.
e('tahu.benua', 'Jumlah benua', {
  a: 'Ada 7 benua: Asia, Afrika, Amerika Utara, Amerika Selatan, Eropa, Australia, dan Antartika 🌍 Mau tanya yang lain?',
  c: [C('Berapa samudra', 'ada berapa samudra'), TOPIK],
})
e('tahu.samudra', 'Jumlah samudra', {
  a: 'Ada 5 samudra: Pasifik, Atlantik, Hindia, Arktik, dan Antarktika 🌊 Pasifik yang terbesar.',
  c: [C('Berapa benua', 'ada berapa benua'), TOPIK],
})
e('tahu.planet', 'Jumlah planet', {
  a: 'Tata surya kita punya 8 planet: Merkurius, Venus, Bumi, Mars, Jupiter, Saturnus, Uranus, Neptunus 🪐 (Pluto kini digolongkan planet kerdil).',
  c: [C('Kenapa langit biru', 'kenapa langit warnanya biru'), TOPIK],
})
e('tahu.langit-biru', 'Kenapa langit biru', {
  a: 'Langit tampak biru karena cahaya matahari dihamburkan udara, dan warna biru paling banyak terhambur dibanding warna lain 🌤️ Itu sebabnya siang hari langit kita biru.',
  c: [C('Warna pelangi', 'pelangi ada berapa warna'), TOPIK],
})
e('tahu.warna-pelangi', 'Warna pelangi', {
  a: 'Pelangi punya 7 warna: merah, jingga, kuning, hijau, biru, nila, ungu 🌈 (sering disingkat "mejikuhibiniu").',
  c: [C('Kenapa langit biru', 'kenapa langit warnanya biru'), TOPIK],
})
e('tahu.kemerdekaan-ri', 'Kemerdekaan Indonesia', {
  a: 'Indonesia merdeka pada 17 Agustus 1945 🇮🇩 Proklamasi dibacakan Soekarno–Hatta di Jakarta.',
  c: [C('Lagu kebangsaan', 'apa lagu kebangsaan indonesia'), C('Pancasila', 'sebutkan sila pancasila')],
})
e('tahu.pancasila', 'Sila Pancasila', {
  a: 'Lima sila Pancasila: ① Ketuhanan Yang Maha Esa; ② Kemanusiaan yang adil dan beradab; ③ Persatuan Indonesia; ④ Kerakyatan yang dipimpin oleh hikmat permusyawaratan; ⑤ Keadilan sosial bagi seluruh rakyat Indonesia 🇮🇩',
  c: [C('Kemerdekaan RI', 'indonesia merdeka tahun berapa'), TOPIK],
})
e('tahu.lagu-kebangsaan', 'Lagu kebangsaan', {
  a: 'Lagu kebangsaan Indonesia adalah "Indonesia Raya", diciptakan oleh W.R. Supratman 🎶',
  c: [C('Kemerdekaan RI', 'indonesia merdeka tahun berapa'), TOPIK],
})
e('tahu.gunung-tertinggi', 'Gunung tertinggi', {
  a: 'Gunung tertinggi di dunia adalah Everest, sekitar 8.849 meter, di perbatasan Nepal–Tibet 🏔️',
  c: [C('Fakta unik', 'fakta unik'), TOPIK],
})
e('tahu.air-beku', 'Titik beku air', {
  a: 'Air membeku pada 0°C dan mendidih pada 100°C (di tekanan permukaan laut) ❄️🔥',
  c: [TOPIK, LAIN],
})
e('tahu.hari-setahun', 'Hari dalam setahun', {
  a: 'Satu tahun ada 365 hari, dan 366 hari pada tahun kabisat (setiap 4 tahun sekali) 📅',
  c: [TOPIK, LAIN],
})
e('tahu.ibukota-jepang', 'Ibu kota Jepang', {
  a: 'Ibu kota Jepang adalah Tokyo 🗼 Mau tanya yang lain?',
  c: [C('Berapa benua', 'ada berapa benua'), TOPIK],
})
e('tahu.matahari-terbit', 'Matahari terbit', {
  a: 'Matahari terbit dari arah timur dan terbenam di barat 🌅 Itu karena Bumi berputar dari barat ke timur.',
  c: [C('Kenapa langit biru', 'kenapa langit warnanya biru'), TOPIK],
})
e('tahu.hari-seminggu', 'Hari dalam seminggu', {
  a: 'Satu minggu ada 7 hari: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, dan Minggu 📅',
  c: [C('Setahun berapa hari', 'satu tahun ada berapa hari'), TOPIK],
})
e('tahu.bulan-setahun', 'Bulan dalam setahun', {
  a: 'Satu tahun ada 12 bulan, dari Januari sampai Desember 📆',
  c: [C('Setahun berapa hari', 'satu tahun ada berapa hari'), TOPIK],
})
e('tahu.warna-primer', 'Warna primer', {
  a: 'Warna primer ada tiga: merah, kuning, dan biru 🎨 Campurannya menghasilkan warna-warna lain.',
  c: [C('Warna pelangi', 'pelangi ada berapa warna'), TOPIK],
})
e('tahu.hewan-tercepat', 'Hewan tercepat', {
  a: 'Hewan darat tercepat adalah cheetah, bisa berlari sampai sekitar 110 km/jam 🐆',
  c: [C('Hewan terbesar', 'hewan terbesar di dunia apa'), C('Fakta unik', 'fakta unik')],
})
e('tahu.hewan-terbesar', 'Hewan terbesar', {
  a: 'Hewan terbesar di dunia adalah paus biru — panjangnya bisa lebih dari 30 meter 🐋',
  c: [C('Hewan tercepat', 'hewan tercepat di dunia apa'), C('Fakta unik', 'fakta unik')],
})
e('tahu.planet-terbesar', 'Planet terbesar', {
  a: 'Planet terbesar di tata surya adalah Jupiter 🪐 Ukurannya lebih dari 1.300 kali Bumi.',
  c: [C('Berapa planet', 'ada berapa planet di tata surya'), TOPIK],
})
e('tahu.bumi-bentuk', 'Bentuk bumi', {
  a: 'Bumi berbentuk bulat — lebih tepatnya agak gepeng di kutub, disebut geoid 🌍 Jadi bukan datar ya 😊',
  c: [C('Berapa benua', 'ada berapa benua'), TOPIK],
})
e('tahu.rumus-air', 'Rumus kimia air', {
  a: 'Rumus kimia air adalah H₂O — dua atom hidrogen dan satu atom oksigen 💧',
  c: [C('Titik beku air', 'air membeku pada suhu berapa'), TOPIK],
})
e('tahu.kecepatan-cahaya', 'Kecepatan cahaya', {
  a: 'Cahaya bergerak sekitar 300.000 kilometer per detik di ruang hampa ⚡ Itu yang tercepat di alam semesta.',
  c: [C('Fakta unik', 'fakta unik'), TOPIK],
})
e('tahu.negara-terluas', 'Negara terluas', {
  a: 'Negara terluas di dunia adalah Rusia 🇷🇺 Wilayahnya membentang di dua benua, Eropa dan Asia.',
  c: [C('Gunung tertinggi', 'gunung tertinggi di dunia apa'), TOPIK],
})
e('tahu.sungai-terpanjang', 'Sungai terpanjang', {
  a: 'Sungai terpanjang di dunia umumnya disebut Sungai Nil di Afrika, sekitar 6.650 km 🏞️ (sebagian ahli menyebut Amazon bersaing ketat).',
  c: [C('Gunung tertinggi', 'gunung tertinggi di dunia apa'), TOPIK],
})
e('tahu.mata-uang-indonesia', 'Mata uang Indonesia', {
  a: 'Mata uang Indonesia adalah Rupiah (Rp) 💵',
  c: [C('Bahasa resmi Indonesia', 'bahasa resmi indonesia apa'), TOPIK],
})
e('tahu.bahasa-indonesia', 'Bahasa resmi Indonesia', {
  a: 'Bahasa resmi Indonesia adalah Bahasa Indonesia 🇮🇩 bahasa persatuan kita.',
  c: [C('Mata uang Indonesia', 'mata uang indonesia apa'), TOPIK],
})
e('tahu.presiden-pertama', 'Presiden pertama RI', {
  a: 'Presiden pertama Indonesia adalah Ir. Soekarno, sejak 1945 🇮🇩 (kalau yang kamu maksud presiden sekarang, cek sumber resmi ya — pengetahuanku statis).',
  c: [C('Kemerdekaan RI', 'indonesia merdeka tahun berapa'), C('Lambang negara', 'lambang negara indonesia apa')],
})
e('tahu.lambang-negara', 'Lambang negara', {
  a: 'Lambang negara Indonesia adalah Garuda Pancasila, dengan semboyan "Bhinneka Tunggal Ika" 🦅',
  c: [C('Sila Pancasila', 'sebutkan sila pancasila'), C('Lagu kebangsaan', 'apa lagu kebangsaan indonesia')],
})
e('tahu.huruf-vokal', 'Huruf vokal', {
  a: 'Huruf vokal ada 5: a, i, u, e, o 🔤 Sisanya adalah huruf konsonan.',
  c: [TOPIK, LAIN],
})
e('tahu.musim-indonesia', 'Musim di Indonesia', {
  a: 'Indonesia punya 2 musim: kemarau dan hujan ☀️🌧️ karena letaknya di garis khatulistiwa.',
  c: [C('Kenapa langit biru', 'kenapa langit warnanya biru'), TOPIK],
})
e('tahu.tubuh-tulang', 'Jumlah tulang manusia', {
  a: 'Tubuh manusia dewasa punya sekitar 206 tulang 🦴 Bayi malah lebih banyak, karena sebagiannya menyatu seiring tumbuh.',
  c: [C('Fakta unik', 'fakta unik'), TOPIK],
})
e('tahu.ibukota-indonesia', 'Ibu kota Indonesia', {
  a: 'Ibu kota Indonesia adalah Jakarta 🇮🇩 Pemerintah sedang memindahkannya secara bertahap ke IKN Nusantara di Kalimantan Timur.',
  c: [C('Ibu kota Jepang', 'ibu kota jepang apa'), TOPIK],
})
e('tahu.satelit-bumi', 'Satelit alami Bumi', {
  a: 'Satelit alami Bumi adalah Bulan 🌙 satu-satunya, dan jadi benda langit terdekat dengan kita.',
  c: [C('Berapa planet', 'ada berapa planet di tata surya'), TOPIK],
})
e('tahu.planet-terdekat', 'Planet terdekat Matahari', {
  a: 'Planet terdekat dengan Matahari adalah Merkurius ☀️🪐',
  c: [C('Planet terbesar', 'planet terbesar di tata surya apa'), TOPIK],
})
e('tahu.hewan-darat-terbesar', 'Hewan darat terbesar', {
  a: 'Hewan darat terbesar adalah gajah Afrika 🐘 Kalau termasuk laut, paus biru yang terbesar.',
  c: [C('Hewan tercepat', 'hewan tercepat di dunia apa'), C('Hewan terbesar', 'hewan terbesar di dunia apa')],
})
e('tahu.logam-cair', 'Logam cair', {
  a: 'Logam yang cair di suhu ruang adalah raksa (merkuri) 🌡️ Itu sebabnya dulu dipakai di termometer.',
  c: [C('Fakta unik', 'fakta unik'), TOPIK],
})
e('tahu.gas-napas', 'Gas untuk bernapas', {
  a: 'Manusia bernapas menghirup oksigen (O₂) dan mengembuskan karbon dioksida (CO₂) 🌬️',
  c: [C('Rumus air', 'rumus kimia air apa'), TOPIK],
})
e('tahu.panca-indera', 'Panca indera', {
  a: 'Manusia punya 5 indera (panca indera): penglihatan, pendengaran, penciuman, pengecap, dan peraba 👀👂👃👅✋',
  c: [C('Jumlah tulang', 'jumlah tulang manusia dewasa berapa'), TOPIK],
})
e('tahu.penemu-lampu', 'Penemu bola lampu', {
  a: 'Bola lampu pijar yang praktis dikembangkan oleh Thomas Alva Edison 💡',
  c: [C('Penemu telepon', 'penemu telepon siapa'), TOPIK],
})
e('tahu.penemu-telepon', 'Penemu telepon', {
  a: 'Telepon dipatenkan oleh Alexander Graham Bell pada 1876 ☎️',
  c: [C('Penemu lampu', 'penemu bola lampu siapa'), TOPIK],
})
e('tahu.gravitasi-newton', 'Penemu gravitasi', {
  a: 'Konsep gravitasi dirumuskan oleh Sir Isaac Newton — konon terinspirasi apel yang jatuh 🍎',
  c: [C('Fakta unik', 'fakta unik'), TOPIK],
})
e('tahu.pulau-indonesia', 'Jumlah pulau Indonesia', {
  a: 'Indonesia adalah negara kepulauan dengan sekitar 17.000 pulau 🏝️ — salah satu yang terbanyak di dunia.',
  c: [C('Danau terbesar Indonesia', 'danau terbesar di indonesia apa'), TOPIK],
})
e('tahu.danau-terbesar-indonesia', 'Danau terbesar Indonesia', {
  a: 'Danau terbesar di Indonesia adalah Danau Toba di Sumatra Utara 🌋 terbentuk dari letusan gunung purba.',
  c: [C('Jumlah pulau Indonesia', 'indonesia punya berapa pulau'), TOPIK],
})
e('tahu.benua-terbesar', 'Benua terbesar', {
  a: 'Benua terbesar di dunia adalah Asia 🌏 — sekaligus paling banyak penduduknya.',
  c: [C('Berapa benua', 'ada berapa benua'), C('Samudra terbesar', 'samudra terbesar di dunia apa')],
})
e('tahu.samudra-terbesar', 'Samudra terbesar', {
  a: 'Samudra terbesar di dunia adalah Samudra Pasifik 🌊',
  c: [C('Berapa samudra', 'ada berapa samudra di dunia'), C('Benua terbesar', 'benua terbesar di dunia apa')],
})
e('tahu.satuan-suhu', 'Satuan suhu', {
  a: 'Satuan suhu yang umum: Celcius (°C), Kelvin (K), dan Fahrenheit (°F) 🌡️ Indonesia memakai Celcius.',
  c: [C('Titik beku air', 'air membeku pada suhu berapa'), TOPIK],
})
e('tahu.burung-tak-terbang', 'Burung yang tak bisa terbang', {
  a: 'Beberapa burung tak bisa terbang, misalnya penguin, burung unta, dan kasuari 🐧',
  c: [C('Hewan tercepat', 'hewan tercepat di dunia apa'), TOPIK],
})
e('tahu.terkini', 'Info terkini (di luar pengetahuan statis)', {
  k: ['presiden sekarang siapa', 'kurs dollar sekarang'],
  a: 'Untuk info terkini seperti berita, cuaca, harga, atau siapa pejabat sekarang, aku belum bisa pastikan ya — pengetahuanku statis dan tidak terhubung internet 😊 Cek sumber resmi untuk itu. Tapi soal PRIMA atau fakta umum, tanya aku!',
  c: [C('Kemampuan Rima', 'kamu bisa apa saja'), TOPIK],
})

// Sapaan proaktif ambient (F4b) — statis di repo (G14) + ikut lint kata terlarang.
// Throttle 1×/sesi/jenis di SentinelBot; tidak muncul saat tur/panel/modal aktif (G7).
// `{nama}` di-substitusi nama user di SentinelBot (atau dihapus rapi bila kosong).
// id 'larut' fromHour>toHour → jendela wrap tengah malam (22.00–04.00).
export const AMBIENT_GREETINGS = [
  { id: 'pagi',   fromHour: 5,  toHour: 10, text: 'Selamat pagi, {nama}! ☀️ Semangat ya hari ini — aku standby kalau butuh bantuan.' },
  { id: 'siang',  fromHour: 11, toHour: 13, text: 'Sudah jam makan siang, {nama} 🍚 Istirahat & makan dulu yuk — jangan lupa simpan kerjaanmu.' },
  { id: 'sore',   fromHour: 15, toHour: 16, text: 'Sudah sore, {nama} 🌇 Sedikit lagi, tetap semangat ya.' },
  { id: 'pulang', fromHour: 17, toHour: 18, text: 'Sudah jam pulang nih, {nama} 👋 Simpan dulu pekerjaanmu sebelum beranjak ya.' },
  { id: 'malam',  fromHour: 19, toHour: 21, text: 'Sudah malam, {nama} 🌙 Masih semangat? Jangan terlalu memaksakan diri ya.' },
  { id: 'larut',  fromHour: 22, toHour: 4,  text: 'Sudah larut malam, {nama} 🌜 Istirahat yuk — kerjaan bisa dilanjut besok dengan tenaga baru.' },
]

// Pengingat istirahat saat user bekerja terlalu lama (F4c).
export const WORK_BREAK_REMINDERS = [
  'Kamu sudah lama di depan layar, {nama} 🧘 Coba regangkan badan & alihkan pandangan sejenak ya.',
  'Sudah cukup lama bekerja nih, {nama} ☕ Ambil minum & istirahatkan mata sebentar, nanti lanjut lagi.',
  'Jangan lupa istirahat, {nama} 💆 Mata dan punggung juga butuh jeda — sebentar saja cukup.',
  'Pekerjaanmu penting, tapi kamu lebih penting, {nama} 🙂 Yuk rehat sejenak.',
]

// Celetukan idle acak saat user diam (F4c) — ramah & ringkas, tak mengganggu.
export const IDLE_CHATTER = [
  'Aku di sini kalau butuh bantuan — klik aku untuk buka panel ya 🤖',
  'Psst… kamu bisa menyeretku ke mana saja di layar 🚀',
  'Lagi mikir, {nama}? Santai, aku temani 😌',
  'Tahu nggak? Kamu bisa tanya cara pakai PRIMA langsung ke aku di tab Chat 💬',
  'Kalau ada form yang membingungkan, panggil aku — aku tunjukkan caranya.',
  'Jangan ragu eksplor menu — aku bantu kalau nyasar 🧭',
  'Sudah simpan pekerjaanmu yang terakhir, {nama}? 😊',
]

// Tips kontekstual per prefix path modul (F4c) — dipilih acak digabung IDLE_CHATTER.
export const MODULE_TIPS = {
  '/blud':                ['Di BLUD aku mengawasi entri ganda & konflik Penanggung Jawab — tinggal Simpan, biar aku cek 👀', 'Mau tarik item dari Usulan? Ada tombol import di menu titik-tiga baris DPA.'],
  '/kinerja':             ['Di Kinerja, versi MURNI & PERUBAHAN dipisah — pastikan kamu di versi yang benar ya.', 'Realisasi dijaga kunci optimistik — kalau bentrok, muat ulang dulu baru simpan.'],
  '/buku-besar-aset':     ['Nilai rencana di BBA dihitung otomatis (vol × harga) — kamu cukup isi vol & harga.', 'Status aset bisa kamu ubah sesuai realisasi — aku jaga transisinya.'],
  '/perjanjian-kinerja':  ['Di PK kamu bisa impor sasaran & program dari Renaksi biar nggak ketik ulang.'],
  '/lkjip':               ['LKJIP pakai kerangka pohon — nomor bab dihitung otomatis, fokus saja ke isinya ✍️'],
  '/usulan-kebutuhan':    ['Telaah usulan berjenjang: Admin → Kasubag → Kabag. Keputusan tiap jenjang tercatat ya.'],
}

// ─── Deny (penolakan PERSONA §5 — jangan ubah tanpa update PERSONA.md) ───────
const DENY_P1 = 'Itu di luar wilayahku — aku cuma paham cara pakai aplikasi PRIMA. Untuk hal seperti itu, admin IT orang yang tepat ya 🙏 Ada hal lain seputar PRIMA yang bisa kubantu?'
const DENY_P2 = 'Maaf, yang itu tidak bisa kubahas karena menyangkut data orang lain. Kalau memang dibutuhkan untuk pekerjaan, silakan ajukan lewat atasan atau Admin Panel sesuai prosedur. Aku tetap siap bantu soal cara pakai aplikasinya 😊'
const DENY_P3 = 'Pertanyaan itu bukan ranahku, dan demi keamanan bersama aku memang tidak dibekali jawabannya. Yuk kembali ke topik PRIMA — mau mulai dari mana?'
const DENY_P3R = 'Aku netral dan memang tidak dibekali opini soal itu 😊 Yuk kembali ke topik PRIMA — mau mulai dari mana?'
const DENY_P4 = 'Terima kasih sudah cerita 🙏 Aku cuma asisten aplikasi, jadi tidak pas kalau aku menanggapi hal sepersonal ini. Untuk urusan kepegawaian atau beban kerja, Sub Bagian Kepegawaian adalah pihak yang tepat — atau bicarakan dengan atasan langsung ya. Kalau soal PRIMA, aku selalu siap bantu 😊'
const DENY_CHIPS_1 = [TOPIK, C('Cara pakai modul ini', 'aku bisa apa di halaman ini')]
const DENY_CHIPS_3 = [C('Pertanyaan umum', 'menu apa saja yang ada di prima'), LAIN]

e('deny.kode', 'Di luar wilayah (kode)', { a: DENY_P1, c: DENY_CHIPS_1 })
e('deny.kredensial', 'Di luar wilayah (kredensial)', { a: DENY_P1, c: DENY_CHIPS_1 })
e('deny.teknis', 'Di luar wilayah (teknis)', { a: DENY_P1, c: DENY_CHIPS_1 })
e('deny.akun-lain', 'Akun orang lain', { a: DENY_P2, c: [C('Prosedur resmi', 'cara reset password user'), LAIN] })
e('deny.data-orang', 'Data orang lain', { a: DENY_P2, c: [TOPIK, LAIN] })
e('deny.data-lain', 'Data unit lain', { a: DENY_P2, c: [TOPIK, LAIN] })
e('deny.abuse', 'Penyalahgunaan', { a: DENY_P3, c: DENY_CHIPS_3 })
e('deny.bypass', 'Melompati alur', { a: DENY_P3, c: DENY_CHIPS_3 })
e('deny.celah', 'Celah keamanan', { a: DENY_P3, c: DENY_CHIPS_3 })
e('deny.politik', 'Netral politik', { a: DENY_P3R, c: DENY_CHIPS_3 })
e('deny.sara', 'Netral SARA', { a: DENY_P3R, c: DENY_CHIPS_3 })
e('deny.banding-pejabat', 'Tidak menilai orang', { a: DENY_P3R, c: DENY_CHIPS_3 })
e('deny.curhat-sensitif', 'Curhat personal', { a: DENY_P4, c: [TOPIK, C('Tutup', 'kamu bisa apa saja')] })

// ─── Usulan Kebutuhan (F4c — intent ★ + tur usulan-buat-baru) ────────────────
// Grounded ke WORKFLOW-usulan-kebutuhan.md; intent ◇ detail lain → MODULE_FALLBACK.
e('usulan.buat', 'Membuat usulan baru', {
  k: ['buat usulan', 'bikin usulan'],
  a: 'Dari sidebar grup Pengajuan pilih Buat Usulan: pilih tahun anggaran, isi item (nama barang, jumlah, harga perkiraan) lalu Tambah ke Daftar — bisa banyak item. Terakhir: Draft untuk simpan dulu, atau Kirim Usulan untuk mengajukan. Mau kutunjukkan langsung di layar?',
  c: [
    { l: '▶ Tur: Buat Usulan', q: '', tour: 'usulan-buat-baru' },
    C('Lacak status usulan', 'usulan saya sudah sampai mana'),
  ],
})
e('usulan.tracking', 'Melacak status usulan', {
  a: 'Buka menu Lacak Usulan di sidebar — statusnya tampil bertahap: review bidang → telaah Admin → Kasubag → putusan final Kabag. Setiap perubahan status juga masuk notifikasi lonceng.',
  c: [C('Alur telaah', 'telaah itu apa'), C('Usulan ditolak', 'usulan saya ditolak kenapa')],
})
e('usulan.alur-telaah', 'Alur telaah usulan', {
  a: 'Telaah = pemeriksaan berjenjang usulanmu: Admin memeriksa kelengkapan & menyesuaikan qty/nominal, Kasubag memutus per item (setuju/revisi/tolak), lalu Kabag memutus final satu grup sekaligus. Keputusan tiap jenjang tercatat dan bisa kamu baca di detail usulan.',
  c: [C('Beda putusan Kasubag-Kabag', 'kenapa tombol putusan kasubag dan kabag beda'), C('Lacak status', 'cara cek status usulan')],
})
e('usulan.putusan-per-role', 'Putusan Kasubag vs Kabag', {
  a: 'Memang dirancang beda: Kasubag memutus per item (Setuju → teruskan ke Kabag / Revisi / Tolak), sedangkan Kabag memutus tingkat grup (Setujui Final / Tolak Semua) supaya putusan akhir konsisten satu paket. Bukan error ya 😊',
  c: [C('Alur telaah', 'telaah itu apa'), TOPIK],
})
e('usulan.ditolak', 'Usulan ditolak', {
  a: 'Alasannya tertulis di catatan putusan — buka detail usulanmu dan baca catatan dari penelaah. Kalau ditolak karena data kurang jelas, perbaiki lalu ajukan usulan baru ya.',
  c: [C('Edit usulan', 'bisa edit usulan yang sudah diajukan?'), C('Buat usulan baru', 'gimana cara bikin usulan')],
})
e('usulan.edit-setelah-ajukan', 'Edit setelah diajukan', {
  a: 'Usulan yang masih Draft bebas diedit. Yang sudah terkirim tidak bisa diedit langsung — itu menjaga jejak telaah tetap jujur. Kalau ada salah input, minta revisi lewat penelaah atau ajukan ulang.',
  c: [C('Status draft', 'cara hapus usulan'), C('Lacak status', 'cara cek status usulan')],
})
e('usulan.hapus', 'Hapus usulan', {
  a: 'Usulan Draft bisa kamu hapus sendiri dari daftar Usulan Saya. Usulan yang sudah masuk alur telaah tidak bisa dihapus pengusul — penghapusan permanen hanya lewat admin dan tercatat di jejak audit.',
  c: [C('Edit usulan', 'bisa edit usulan yang sudah diajukan?'), TOPIK],
})
e('usulan.export', 'Export usulan', {
  a: 'Di panel daftar usulan ada tombol unduh Excel; rekap juga menyediakan PDF. Hasilnya berisi item lengkap dengan nominal telaah per jenjang.',
  c: [C('Rekap usulan', 'rekap usulan dilihat di mana'), TOPIK],
})
e('usulan.batas-waktu', 'Batas waktu pengajuan', {
  a: 'Periode pengajuan diatur admin — di luar periode, tombol pengajuan disembunyikan otomatis. Kalau tombolnya hilang dan kamu merasa masih periode, tanyakan ke admin kapan jendela pengajuan dibuka.',
  c: [C('Buat usulan', 'gimana cara bikin usulan'), TOPIK],
})
e('usulan.hilir', 'Setelah usulan disetujui', {
  a: 'Usulan yang disetujui final Kabag jadi bahan modul lain: bisa ditarik ke DPA BLUD (menu import di form DPA) atau ke Buku Besar Aset untuk belanja modal. Jadi usulanmu tidak berhenti di persetujuan 😊',
  c: [C('Import ke DPA', 'cara import dari usulan'), TOPIK],
})
e('usulan.preview-no', 'Nomor usulan otomatis', {
  a: 'Nomor usulan dibuat sistem dan dipratinjau otomatis di form — kamu tidak perlu (dan tidak bisa) mengarangnya, supaya penomoran konsisten dan tidak dobel.',
  c: [C('Buat usulan', 'gimana cara bikin usulan'), TOPIK],
})
e('usulan.field-spesifikasi', 'Kolom Spesifikasi', {
  a: 'Spesifikasi itu kolom opsional untuk detail teknis barang — tipe, ukuran, kapasitas, atau merek yang diinginkan. Mengisinya membantu penelaah menilai usulanmu lebih akurat.',
  c: [C('Isi harga', 'harga estimasi diisi apa'), C('Buat usulan', 'gimana cara bikin usulan')],
})
e('usulan.field-harga', 'Kolom Est. Harga Satuan', {
  a: 'Isi Est. Harga Satuan dengan perkiraan harga PER UNIT (wajib, tidak boleh 0). Total Estimasi terhitung otomatis = Jumlah × Harga Satuan, jadi kamu tidak perlu mengalikan sendiri 😊',
  c: [C('Total estimasi', 'total estimasi dihitung dari mana'), C('Isi spesifikasi', 'cara isi spesifikasi barang')],
})
e('usulan.jenis-belanja', 'Jenis Belanja', {
  a: 'Jenis Belanja itu kategori belanja yang wajib dipilih per item (mis. modal/operasional sesuai daftar). Item dikelompokkan per Sub Bidang + Jenis Belanja, dan tiap grup dapat nomor usulannya sendiri.',
  c: [C('Sub bidang apa', 'cara lihat usulan sub bidang lain'), C('Buat usulan', 'gimana cara bikin usulan')],
})
e('usulan.lampiran', 'Lampiran dokumen', {
  a: 'Tiap item boleh dilampiri satu berkas pendukung — PDF, Word, Excel, atau gambar, maksimal 10MB (mis. brosur atau penawaran). Sifatnya opsional dan tersimpan aman; klik 📎 Pilih File di form item.',
  c: [C('Isi spesifikasi', 'cara isi spesifikasi barang'), TOPIK],
})
e('usulan.pagu', 'Pagu anggaran', {
  a: 'Pagu adalah batas anggaran yang ditetapkan admin (menu Set Pagu). Total usulan yang disetujui tidak boleh melebihi pagu — bar pagu di layar menunjukkan sisa dan pemakaiannya.',
  c: [C('Pagu saya berapa', 'pagu sub bidang saya berapa'), C('KPI dashboard', 'kpi di dashboard usulan artinya apa')],
})
e('usulan.kpi', 'KPI dashboard usulan', {
  a: 'Kartu KPI di dashboard merangkum cepat: jumlah usulan, total nominal, dan sebarannya per status/sub bidang, lengkap dengan grafik. Gunanya melihat gambaran besar tanpa membuka satu-satu.',
  c: [C('Rekap usulan', 'rekap usulan dilihat di mana'), C('Pagu', 'pagu itu apa')],
})
e('usulan.rekap', 'Rekap usulan (admin)', {
  a: 'Rekap (admin) menampilkan tabel ringkas per sub bidang lengkap dengan hasil telaah: jumlah belum ditelaah, sudah ditelaah, direvisi, ditolak, beserta nominalnya dan baris total. Cocok untuk laporan.',
  c: [C('Rekap verifikasi', 'rekap verifikasi itu apa'), C('Export Excel', 'cara export usulan ke excel')],
})
e('usulan.rekap-verif', 'Rekap verifikasi', {
  a: 'Rekap Verifikasi meringkas hasil verifikasi per sub bidang — jumlah usulan, yang disetujui, yang ditolak, dan total estimasinya. Versi yang lebih ringkas dari Rekap admin.',
  c: [C('Rekap detail', 'rekap usulan dilihat di mana'), TOPIK],
})
e('usulan.antrian', 'Antrian verifikasi', {
  a: 'Antrian adalah daftar usulan yang menunggu putusanmu (untuk Kasubag/Kabag). Bisa diputus satu-satu lewat tombol Lihat, atau sekaligus pakai tombol massal (ACC Semua / Proses Semua → Kabag) saat antrian banyak.',
  c: [C('Putusan massal', 'cara putusan massal'), C('Beda putusan Kasubag-Kabag', 'kenapa tombol putusan kasubag dan kabag beda')],
})
e('usulan.telaah-qty', 'Penyesuaian qty saat telaah', {
  a: 'Saat telaah, Admin/Kasubag boleh menyesuaikan jumlah atau nominal lewat kolom telaah bila perlu — misalnya disesuaikan dengan pagu. Angka aslimu tetap tersimpan sebagai pembanding, jadi transparan.',
  c: [C('Alur telaah', 'telaah itu apa'), C('Usulan ditolak', 'usulan saya ditolak kenapa')],
})
e('usulan.putusan-bulk', 'Putusan massal', {
  a: 'Putusan massal khusus untuk Kabag: lewat tombol bulk di Antrian kamu bisa menyetujui atau memproses banyak usulan sekaligus, supaya cepat saat antrian menumpuk. Keputusannya tetap tercatat per usulan.',
  c: [C('Antrian', 'antrian usulan itu apa'), C('Beda putusan Kasubag-Kabag', 'kenapa tombol putusan kasubag dan kabag beda')],
})
e('usulan.tahun', 'Tahun anggaran & jenis usulan', {
  a: 'Di awal membuat usulan kamu pilih Tahun Anggaran dan Jenis Usulan (MURNI atau PERUBAHAN). Data dipisah per tahun supaya rapi; jenis MURNI untuk anggaran awal, PERUBAHAN untuk revisi anggaran berjalan.',
  c: [C('Buat usulan', 'gimana cara bikin usulan'), TOPIK],
})
e('usulan.kelola-user', 'Kelola User di Usulan', {
  a: 'Kelola User di Pengaturan Usulan adalah sub-panel KHUSUS untuk mengubah role user yang terlibat di alur Usulan. Aksi lain (nonaktifkan, hapus, reset password) ada di Admin Panel, bukan di sini.',
  c: [C('Dua panel user', 'bedanya kelola user di usulan dengan user management'), TOPIK],
})
e('usulan.akses', 'Akses usulan per role', {
  a: 'Kamu hanya bisa melihat usulan sesuai sub bidang/role-mu — itu pembatasan akses, bukan error. Kalau perlu melihat lintas unit, itu wewenang admin atau atasanmu ya 🙏',
  c: [C('Role saya apa', 'role saya apa sekarang'), TOPIK],
})
e('usulan.total-estimasi', 'Kolom Total Estimasi', {
  a: 'Total Estimasi dihitung otomatis = Jumlah (Qty) × Est. Harga Satuan, jadi kolomnya tidak bisa diketik manual. Total per grup dan total keseluruhan juga terhitung sendiri di bawah daftar.',
  c: [C('Isi harga', 'harga estimasi diisi apa'), C('Buat usulan', 'gimana cara bikin usulan')],
})
e('usulan.draft-vs-kirim', 'Draft vs Kirim Usulan', {
  a: 'Draft = menyimpan dulu; usulan masih bisa kamu edit/hapus dan BELUM masuk telaah. Kirim Usulan = mengajukan resmi; usulan masuk antrian telaah dan tidak bisa diedit langsung lagi. Simpan draft kalau belum yakin ya 😊',
  c: [C('Edit setelah kirim', 'bisa edit usulan yang sudah diajukan?'), C('Buat usulan', 'gimana cara bikin usulan')],
})
e('usulan.field-prioritas', 'Kolom Prioritas', {
  a: 'Prioritas (TINGGI/SEDANG/RENDAH) menandai seberapa mendesak item itu. Ini membantu penelaah mendahulukan yang paling penting saat anggaran terbatas.',
  c: [C('Kolom alasan', 'kolom alasan diisi apa'), C('Buat usulan', 'gimana cara bikin usulan')],
})
e('usulan.field-alasan', 'Kolom Alasan / Justifikasi', {
  a: 'Alasan/Justifikasi itu kolom opsional untuk menjelaskan kenapa barang itu dibutuhkan. Mengisinya memperkuat usulan supaya lebih mudah disetujui penelaah.',
  c: [C('Kolom prioritas', 'kolom prioritas buat apa'), C('Buat usulan', 'gimana cara bikin usulan')],
})
e('usulan.field-merk', 'Kolom URL Merk / Toko', {
  a: 'URL Merk 1–3 adalah tautan referensi produk atau toko (opsional) — mis. link marketplace — supaya penelaah bisa mengecek harga dan spesifikasi yang kamu maksud.',
  c: [C('Isi harga', 'harga estimasi diisi apa'), C('Lampiran', 'lampiran usulan bisa upload file?')],
})
e('usulan.field-satuan', 'Kolom Satuan', {
  a: 'Satuan dipilih dari daftar (mis. buah, unit, paket, lusin) — ketik untuk mencari, lalu pilih. Wajib diisi supaya jumlah barang jelas takarannya.',
  c: [C('Isi jumlah', 'harga estimasi diisi apa'), C('Buat usulan', 'gimana cara bikin usulan')],
})
e('usulan.reset', 'Tombol Reset Semua', {
  a: 'Reset Semua mengosongkan form dan semua item yang belum disimpan — kalau ada item, akan minta konfirmasi dulu. Ini TIDAK menghapus usulan yang sudah tersimpan/terkirim, hanya membersihkan draft yang sedang kamu ketik.',
  c: [C('Hapus usulan', 'cara hapus usulan'), C('Draft vs kirim', 'bedanya draft dan kirim usulan')],
})
e('usulan.mode-edit-draft', 'Mode Edit Draft', {
  a: 'Saat mengedit draft, perubahanmu akan menggantikan SEMUA item draft yang lama, dan Sub Bidang dikunci (tidak bisa diganti). Klik "Batal Edit" kalau ingin keluar tanpa menyimpan perubahan.',
  c: [C('Draft vs kirim', 'bedanya draft dan kirim usulan'), C('Edit setelah kirim', 'bisa edit usulan yang sudah diajukan?')],
})
e('usulan.status-arti', 'Arti status usulan', {
  k: ['arti status usulan', 'maksud status usulan'],
  a: 'Status usulan berjalan begini: Draft (belum diajukan) → Review Bidang (menunggu atasan bidang) → Ditelaah (diperiksa Admin) → Diproses (di meja Kasubag/Kabag) → Disetujui (lolos final) atau Ditolak (baca catatan putusan). Kalau dikembalikan untuk diperbaiki, statusnya Revisi. Posisi terkini selalu bisa kamu cek di Lacak Usulan.',
  c: [C('Lacak status', 'cara cek status usulan'), C('Usulan ditolak', 'usulan saya ditolak kenapa')],
})
e('usulan.revisi-bidang', 'Usulan diminta revisi', {
  k: ['usulan direvisi', 'usulan dikembalikan'],
  a: 'Kalau usulanmu diminta revisi atau dikembalikan, artinya penelaah ingin ada perbaikan dulu — baca catatan revisinya di detail usulan, perbaiki itemnya, lalu ajukan ulang. Usulan tidak hangus, hanya menunggu perbaikanmu 😊',
  c: [C('Arti status', 'apa arti status usulan'), C('Edit usulan', 'bisa edit usulan yang sudah diajukan?')],
})

// ─── Buku Besar Aset (F4d — intent ★ + tur bba-entry) ────────────────────────
e('bba.tentang', 'Apa itu Buku Besar Aset', {
  a: 'Buku Besar Aset = register belanja modal (aset) lintas-tahun: kamu catat rencana belanjanya, lalu isi realisasinya saat barang benar-benar dibeli. KPI di atas memantau total rencana vs realisasi. Khusus role Aset (Admin/Super Admin atau yang diberi akses).',
  c: [C('Catat aset baru', 'cara catat aset baru'), C('Isi realisasi', 'cara isi realisasi aset')],
})
e('bba.entry', 'Catat aset baru', {
  k: ['catat aset', 'tambah aset'],
  a: 'Klik + Tambah Item lalu isi tahun, sumber dana, uraian, volume, satuan, dan harga — Nilai Rencana terisi otomatis (volume × harga). Atau, kalau asetnya berasal dari Usulan yang sudah disetujui, pakai Tarik dari Usulan Kebutuhan supaya tidak ketik ulang. Mau kutunjukkan di layar?',
  c: [
    { l: '▶ Tur: Catat Aset', q: '', tour: 'bba-entry' },
    C('Isi realisasi', 'cara isi realisasi aset'),
  ],
})
e('bba.realisasi', 'Isi realisasi aset', {
  k: ['isi realisasi aset', 'realisasi belanja modal'],
  a: 'Di baris asetnya, klik ikon Set realisasi: isi nilai realisasi, unit yang terpakai (0 sampai volume rencana), dan tanggalnya. Statusnya disarankan otomatis — penuh, sebagian, atau tidak terealisasi — lalu Simpan Realisasi.',
  c: [C('Batas unit realisasi', 'vol realisasi aset maksimal berapa'), C('Status aset', 'status aset apa saja')],
})
e('bba.status', 'Status aset', {
  a: 'Ada 4: DIRENCANAKAN (baru dicatat), REALISASI_PENUH (terbeli sesuai rencana), REALISASI_SEBAGIAN (sebagian), dan TIDAK_TEREALISASI (batal/tidak jadi). Status berubah sendiri mengikuti nilai realisasi yang kamu isi.',
  c: [C('Isi realisasi', 'cara isi realisasi aset'), TOPIK],
})
e('bba.nilai-otomatis', 'Nilai rencana otomatis', {
  a: 'Memang dikunci 😊 Nilai Rencana = volume × harga, dihitung server saat simpan — supaya tidak ada salah hitung manual. Ubah volume atau harganya, nilainya ikut. Kecuali baris dari Usulan yang nilainya mengikuti nominal putusan.',
  c: [C('Rumus nilai rencana', 'nilai rencana di buku besar aset dihitung dari mana'), TOPIK],
})
e('bba.import-usulan', 'Tarik dari Usulan ke BBA', {
  a: 'Tombol Tarik dari Usulan Kebutuhan (khusus Admin) menarik usulan belanja modal yang sudah final — yang Disetujui maupun Ditolak. Yang pernah ditarik dilewati otomatis supaya tidak dobel. Baris hasil tarik: uraian/volume/harga terkunci mengikuti putusan.',
  c: [C('Kenapa baris terkunci', 'kenapa baris dari usulan tidak bisa diedit'), C('Catat aset baru', 'cara catat aset baru')],
})
e('bba.origin-readonly', 'Baris usulan terkunci', {
  a: 'Baris yang ditarik dari Usulan punya uraian, volume, dan harga yang terkunci — itu cermin putusan resmi, jadi tidak boleh diubah di sini. Yang masih bisa kamu isi: realisasinya. Untuk aset manual, pakai Tambah Item biasa.',
  c: [C('Tarik dari usulan', 'cara import dari usulan ke bba'), TOPIK],
})
e('bba.usulan-ditolak', 'Usulan ditolak masuk BBA', {
  a: 'Sengaja — baris dari usulan yang Ditolak tetap dicatat sebagai sejarah/jejak, tapi dikecualikan dari KPI dan realisasinya terkunci di Rp 0. Jadi kamu tetap punya catatan lengkap tanpa mengacaukan angka anggaran.',
  c: [C('Status aset', 'status aset apa saja'), TOPIK],
})

// ─── E-Anggaran / Kinerja (F4e — intent ★ + tur kinerja-keliling) ───────────
e('kin.tentang', 'Apa itu modul Kinerja', {
  k: ['e anggaran', 'e controlling', 'modul kinerja'],
  a: 'Modul Kinerja (E-Anggaran) memantau anggaran per sumber dana: kamu susun master rekening → SSK (target per bulan, versi MURNI/PERUBAHAN) → realisasi bulanan → cetak & laporan konsolidasi. Mau kuajak keliling menunya?',
  c: [
    { l: '▶ Tur: Keliling Kinerja', q: '', tour: 'kinerja-keliling' },
    C('Apa itu SSK', 'ssk itu apa'),
  ],
})
e('kin.ssk', 'Apa itu SSK', {
  k: ['ssk', 'sub sub kegiatan'],
  a: 'SSK = Sub Sub Kegiatan — unit terkecil rencana belanja per sumber dana. Di tab RKO kamu Inject Rekening jadi baris SSK, lalu isi target per bulannya. SSK punya versi: MURNI (awal tahun) dan PERUBAHAN (revisi tengah tahun).',
  c: [C('Murni vs Perubahan', 'versi murni dan perubahan bedanya apa'), C('Keliling Kinerja', 'modul kinerja')],
})
e('kin.realisasi', 'Isi realisasi bulanan', {
  k: ['isi realisasi', 'realisasi bulanan'],
  a: 'Buka menu Realisasi, pilih sumbernya, klik Init dari SSK untuk membuat baris semua bulan, lalu isi realisasi tiap bulan dan Simpan Semua. Persen realisasi dihitung otomatis terhadap pagu SSK.',
  c: [C('% realisasi keuangan', 'persen realisasi keuangan dihitung dari mana'), C('Kenapa tidak ada tombol hapus', 'kenapa tidak ada tombol hapus di realisasi')],
})
e('kin.import-pendapatan', 'Import pendapatan dari Excel', {
  k: ['import pendapatan', 'import realisasi pendapatan', 'pendapatan dari excel', 'isi pendapatan dari excel', 'impor pendapatan', 'upload excel pendapatan', 'lampirkan excel pendapatan', 'tarik pendapatan dari excel'],
  a: 'Bisa! Di E-Anggaran → Pendapatan & CRR ada tombol Import Excel. Unggah laporan pendapatan bulananmu, aku bantu baca Realisasi tiap bulan dari baris PAD, lalu kamu tinggal periksa dan klik Simpan. Aku tidak menyimpan sendiri ya — keputusan tetap di tanganmu 😊',
  c: [
    { l: 'Buka Import Pendapatan →', q: '', href: '/kinerja?import=pendapatan' },
    C('Isi realisasi bulanan', 'cara isi realisasi bulanan'),
    C('Isi CRR otomatis', 'cara isi crr'),
  ],
})
e('kin.belanja-auto', 'Isi CRR (auto-isi belanja)', {
  k: ['belanja auto', 'auto isi belanja', 'cara isi crr', 'cost recovery rate', 'crr otomatis', 'isi crr', 'tombol auto isi'],
  a: 'CRR hampir semua otomatis 😊 Pendapatan ikut dari Section 1; kolom Belanja BLUD & Daerah tinggal klik tombol Auto-isi tiap bulan (ditarik dari Realisasi belanja yang sudah diisi), lalu s/d dan CRR Parsial/Total dihitung sendiri. Urutannya: isi Realisasi belanja → isi Pendapatan → buka CRR → klik Auto-isi tiap bulan → Simpan CRR.',
  c: [
    { l: 'Buka Pendapatan & CRR →', q: '', href: '/kinerja?tab=pend-crr' },
    C('Import pendapatan', 'import pendapatan dari excel'),
    C('Isi realisasi bulanan', 'cara isi realisasi bulanan'),
  ],
})
e('kin.import-realisasi', 'Import realisasi belanja dari Excel', {
  k: ['import realisasi belanja', 'import belanja dari excel', 'realisasi belanja dari excel', 'impor realisasi belanja', 'upload belanja excel', 'tarik realisasi belanja', 'import realisasi dari excel'],
  a: 'Bisa! Di E-Anggaran → Realisasi, pilih sumbernya, klik Import Excel, lalu unggah laporan belanja. Aku cocokkan tiap baris ke keterangan SSK (boleh beda kata sedikit), kelompokkan per sumber, kamu periksa per tab lalu Terapkan. Aku tidak menyimpan sendiri — kamu yang klik Simpan ya 😊',
  c: [
    { l: 'Buka Import Realisasi →', q: '', href: '/kinerja?import=realisasi' },
    C('Isi realisasi bulanan', 'cara isi realisasi bulanan'),
    C('Import pendapatan', 'import pendapatan dari excel'),
  ],
})
e('kin.versi-murni-perubahan', 'Versi MURNI vs PERUBAHAN', {
  k: ['murni perubahan', 'versi ssk'],
  a: 'MURNI = rencana anggaran awal tahun (bisa diedit bebas). PERUBAHAN = revisi tengah tahun. Begitu kamu klik Buat Perubahan Baru, datanya disalin ke versi baru dan versi lama OTOMATIS DIKUNCI — tidak bisa diubah lagi, hanya jadi acuan sejarah.',
  c: [C('Cara unlock versi terbaru', 'cara unlock versi terbaru'), C('Apa itu SSK', 'ssk itu apa')],
})
e('kin.pct-real-keu', '% realisasi keuangan', {
  a: '% realisasi keuangan = realisasi keuangan ÷ pagu × 100, dua desimal. Contoh: Rp 25.000.000 ÷ Rp 100.000.000 = 25%. Kalau hasilnya 0 semua, biasanya pagu SSK-nya 0 atau SSK versi aktif tidak ditemukan.',
  c: [C('Kenapa 0 semua', 'kenapa persen realisasiku 0 semua'), C('% fisik', 'persen fisik rumusnya apa')],
})
e('kin.ssk-deletable', 'Kenapa SSK tidak bisa dihapus', {
  a: 'Baris SSK di versi yang sudah terkunci tidak bisa dihapus — itu menjaga jejak target tetap utuh. Kalau target sebuah baris memang batal, jangan dihapus: nol-kan targetnya di versi PERUBAHAN baru.',
  c: [C('Murni vs Perubahan', 'versi murni dan perubahan bedanya apa'), TOPIK],
})
e('kin.realisasi-hapus', 'Tidak ada tombol hapus di Realisasi', {
  a: 'Sengaja — baris Realisasi diturunkan dari SSK lewat Init dari SSK, jadi tidak dihapus langsung di tab Realisasi demi menjaga integritas histori. Kalau memang tidak perlu, nol-kan target SSK-nya di versi Perubahan, baris realisasinya ikut menyesuaikan.',
  c: [C('Isi realisasi', 'cara isi realisasi bulanan'), TOPIK],
})
e('kin.unlock-latest', 'Unlock versi terbaru', {
  a: 'Versi PERUBAHAN terbaru memang masih bisa diedit — yang terkunci hanya versi lama yang sudah digantikan. Kalau kamu butuh ruang revisi baru, klik Buat Perubahan Baru lagi; versi sebelumnya otomatis terkunci dan yang baru jadi aktif.',
  c: [C('Murni vs Perubahan', 'versi murni dan perubahan bedanya apa'), TOPIK],
})
e('kin.dashboard', 'Dashboard kinerja', {
  a: 'Beranda Kinerja merangkum realisasi terhadap target dari data yang sudah kamu isi di SSK dan Realisasi tahun aktif. Kalau angkanya kosong, pastikan SSK dan realisasinya sudah diisi untuk tahun yang dipilih.',
  c: [C('Isi realisasi', 'cara isi realisasi bulanan'), TOPIK],
})

// ─── Perjanjian Kinerja (F4f — intent ★) ─────────────────────────────────────
e('pk.buat', 'Buat Perjanjian Kinerja', {
  k: ['buat perjanjian kinerja', 'buat pk'],
  a: 'Buka modul Perjanjian Kinerja → form: isi sasaran strategis (bisa tarik dari Rencana Aksi), program/kegiatan, lalu pejabat penandatangan (pihak pertama & kedua). Setelah lengkap, unduh dokumen Word-nya. Kalau sudah final, dokumennya dikunci agar tidak berubah.',
  c: [{ l: '▶ Keliling PK', q: '', tour: 'pk-keliling' }, C('Pihak pertama-kedua', 'pihak pertama kedua itu siapa'), C('Download Word PK', 'cara download dokumen word pk')],
})
e('pk.download', 'Download Word PK', {
  a: 'Di halaman PK ada tombol unduh dokumen Word — hasilnya berkas .docx siap tanda tangan, lengkap dengan sasaran, indikator, target, dan lampiran anggaran. Pastikan datanya sudah benar sebelum diunduh ya.',
  c: [C('Finalize PK', 'finalize pk itu apa'), TOPIK],
})
e('pk.pihak', 'Pihak pertama & kedua', {
  a: 'Pihak Pertama = pejabat yang berjanji mencapai kinerja (mis. kepala bidang/bagian); Pihak Kedua = atasan yang menerima janji itu (mis. Direktur). Keduanya dipilih dari daftar pejabat penandatangan di modul PK.',
  c: [C('Tambah pejabat', 'cara tambah pejabat penandatangan'), C('Buat PK', 'cara buat perjanjian kinerja')],
})
e('pk.finalize', 'Finalize PK', {
  a: 'Finalize mengunci dokumen PK jadi versi resmi — setelah final, isinya tidak bisa diedit lagi demi menjaga keabsahan dokumen yang sudah ditandatangani. Kalau perlu perubahan, itu jadi kebijakan terpisah; tanyakan ke admin/atasan ya.',
  c: [C('Download Word', 'cara download dokumen word pk'), TOPIK],
})

// ─── LKJIP (F4f — intent ★) ──────────────────────────────────────────────────
e('lkjip.tentang', 'Apa itu LKJIP', {
  a: 'LKJIP = Laporan Kinerja Instansi Pemerintah — laporan kinerja tahunan. Modulnya menyusun laporan berbasis kerangka bab + blok isi (narasi, tabel, gambar, grafik) yang akhirnya diunduh jadi dokumen Word rapi dengan daftar isi otomatis.',
  c: [C('Buat dokumen LKJIP', 'cara buat dokumen lkjip'), C('Download Word', 'cara download word lkjip')],
})
e('lkjip.buat', 'Buat dokumen LKJIP', {
  k: ['buat lkjip', 'buat dokumen lkjip'],
  a: 'Di modul LKJIP klik buat dokumen baru (pilih tahun) — kerangka bab standar otomatis terbentuk. Buka editornya untuk menambah bab/sub-bab dan mengisi blok narasi, tabel, gambar, atau grafik. Setelah lengkap, unduh sebagai Word.',
  c: [{ l: '▶ Tur Susun LKJIP', q: '', tour: 'lkjip-susun' }, C('Tambah bab', 'cara tambah bab atau sub bab'), C('Isi narasi', 'cara isi narasi')],
})
e('lkjip.generate', 'Download Word LKJIP', {
  k: ['download lkjip', 'generate lkjip'],
  a: 'Klik tombol unduh/generate Word di editor LKJIP — sistem merangkai semua bab dan blok jadi satu dokumen .docx, lengkap dengan daftar isi, daftar tabel/gambar, penomoran halaman, dan caption otomatis. Murni unduhan, tidak mengubah datamu.',
  c: [C('Atur font & spasi', 'cara atur font dan spasi dokumen'), TOPIK],
})
e('lkjip.section', 'Tambah bab / sub-bab', {
  a: 'Di panel kiri editor (pohon outline) ada tombol tambah untuk membuat bab atau sub-bab baru, lalu kamu bisa geser posisinya. Nomor bab dihitung otomatis dari posisinya di pohon — tidak perlu kamu ketik manual.',
  c: [C('Nomor bab berubah', 'nomor bab kok berubah sendiri'), C('Isi narasi', 'cara isi narasi')],
})
e('lkjip.narasi', 'Isi narasi LKJIP', {
  a: 'Pilih sebuah bab, lalu tambahkan blok Narasi — isinya pakai editor teks kaya (bisa tebal, daftar, dll.). Selain narasi, kamu juga bisa menyisipkan blok Tabel, Gambar, atau Grafik di bab yang sama.',
  c: [C('Masukkan tabel', 'cara masukkan tabel'), C('Masukkan grafik', 'grafik bisa dimasukkan?')],
})

// ─── Admin Panel (F4f — intent ★) ────────────────────────────────────────────
e('admin.nonaktif-user', 'Nonaktifkan user', {
  a: 'Di Admin Panel → tab User Management, cari user-nya lalu pakai aksi nonaktifkan. User nonaktif tidak bisa login sampai diaktifkan kembali. Semua aksi ini tercatat di jejak audit.',
  c: [C('Reset password user', 'cara reset password user'), C('Dua panel user', 'bedanya kelola user di usulan dengan user management')],
})
e('admin.reset-password', 'Reset password user', {
  a: 'Admin Panel → User Management → pilih user → reset password. User akan mendapat cara untuk menyetel password baru. Demi keamanan, admin tidak melihat password lama siapa pun ya.',
  c: [C('Nonaktifkan user', 'cara nonaktifkan user'), TOPIK],
})
e('admin.app-access', 'Atur akses aplikasi user', {
  a: 'Di User Management ada pengaturan akses aplikasi per user — centang modul mana saja yang boleh ia buka. Ini melengkapi role: role menentukan kewenangan dasar, akses aplikasi membuka/menutup modul tertentu.',
  c: [C('Ubah role user', 'cara ubah role user'), TOPIK],
})
e('admin.ubah-role', 'Ubah role user', {
  a: 'Role user bisa diubah di User Management (Admin Panel) — sistem-wide. Ada juga panel "Kelola User" di modul Usulan yang KHUSUS mengubah role untuk alur Usulan saja. Untuk perubahan menyeluruh, pakai yang di Admin Panel.',
  c: [C('Dua panel user', 'bedanya kelola user di usulan dengan user management'), C('Kuota role', 'kuota role itu apa')],
})
e('admin.dua-panel', 'Dua panel user (jangan dicampur)', {
  a: 'Memang ada dua dan peruntukannya beda: "Kelola User" di modul Usulan hanya untuk mengubah role user yang terlibat di alur Usulan. "User Management" di Admin Panel = sistem-wide: nonaktif, reset password, hapus, akses aplikasi, ubah role. Untuk aksi menyeluruh, pakai Admin Panel.',
  c: [C('Ubah role', 'cara ubah role user'), TOPIK],
})

// ─── Fallback per modul (konten detail menyusul F4 — jujur + tetap berguna) ──
/** @type {Record<string, {title: string, answers: string[], chips: {l: string, q: string}[]}>} */
// ─── Rencana Aksi (Renaksi) — fungsi & tombol ───────────────────────────────
e('ra.tentang', 'Tentang Rencana Aksi', {
  k: ['rencana aksi itu apa', 'renaksi itu apa'],
  a: 'Rencana Aksi (Renaksi) menjabarkan target kinerja jadi indikator terukur dengan target & realisasi per bulan. Hierarkinya Tujuan → Sasaran → Program → Kegiatan → Sub Kegiatan, dan datanya bisa ditarik ke Perjanjian Kinerja.',
  c: [C('Level RPJMD/RKPD', 'bedanya rpjmd sama rkpd'), TOPIK],
})
e('ra.level', 'Level RPJMD vs RKPD', {
  a: 'RPJMD = target jangka menengah (5 tahunan), RKPD = target tahunan. Tombol Level di Renaksi mengganti sudut pandang data antara keduanya.',
  c: [C('Tentang Renaksi', 'rencana aksi itu apa'), TOPIK],
})
e('ra.hierarki', 'Hierarki Renaksi', {
  a: 'Datanya berjenjang: Tujuan → Sasaran → Program → Kegiatan → Sub Kegiatan. Mode tampilan Hirarki/Flat/Fokus mengatur cara melihat susunan itu.',
  c: [TOPIK, LAIN],
})
e('ra.target', 'Target kinerja Renaksi', {
  a: 'Ada beberapa lapis target: Target RPJMD (jangka panjang), Target Tahunan, dan Target Bulanan. Diatur lewat menu Konfigurasi Target Strategis, jadi acuan menghitung capaian.',
  c: [C('Isi realisasi', 'cara isi realisasi renaksi'), TOPIK],
})
e('ra.realisasi', 'Isi realisasi Renaksi', {
  k: ['isi realisasi renaksi'],
  a: 'Buka mode Data Entry, pilih indikator, lalu isi Realisasi Kinerja per bulan. Capaian (%) dihitung otomatis dari target. Kalau ada yang mengubah bersamaan, kamu diminta muat ulang dulu supaya tidak saling timpa.',
  c: [C('Jenis evaluasi', 'jenis evaluasi akumulatif flat pengulangan'), C('Target', 'target kinerja renaksi diisi di mana')],
})
e('ra.jenis-evaluasi', 'Jenis evaluasi Renaksi', {
  k: ['jenis evaluasi', 'akumulatif flat pengulangan'],
  a: 'Jenis Evaluasi menentukan cara capaian dihitung: Akumulatif (dijumlah dari bulan ke bulan), Flat (target tetap tiap periode), atau Pengulangan (berulang tiap periode). Pilih sesuai sifat indikatormu.',
  c: [C('Isi realisasi', 'cara isi realisasi renaksi'), TOPIK],
})
e('ra.mode', 'Mode Dashboard/Data Entry/Cetak', {
  k: ['mode renaksi', 'mode rencana aksi'],
  a: 'Renaksi punya 3 mode: Dashboard (ringkasan capaian), Data Entry (isi target & realisasi), dan Cetak (unduh PDF/Excel). Pindah lewat tombol Mode di atas.',
  c: [C('Cetak Renaksi', 'cara cetak renaksi'), TOPIK],
})
e('ra.export', 'Cetak/export Renaksi', {
  k: ['cara cetak renaksi', 'cara export renaksi'],
  a: 'Di mode Cetak ada Preview lalu unduh: indikator bisa diexport ke PDF atau Excel. Pilih level & tahun dulu supaya isinya sesuai.',
  c: [C('Mode Renaksi', 'mode renaksi apa saja'), TOPIK],
})
e('ra.reset-realisasi', 'Reset realisasi Renaksi', {
  a: 'Tombol Reset Realisasi mengosongkan angka realisasi (lewat konfirmasi dulu) — dipakai kalau mau mengisi ulang dari awal. Target tidak ikut terhapus.',
  c: [C('Isi realisasi', 'cara isi realisasi renaksi'), TOPIK],
})
e('ra.buat', 'Tambah Rencana Aksi', {
  a: 'Tambah indikator Renaksi dari mode Data Entry: pilih level (RPJMD/RKPD) & tahun, lalu isi indikator, satuan, dan targetnya mengikuti hierarki Tujuan→Sub Kegiatan. Setelah itu realisasinya bisa diisi per bulan.',
  c: [C('Isi realisasi', 'cara isi realisasi renaksi'), C('Hierarki', 'hierarki renaksi gimana')],
})
e('ra.dashboard', 'Dashboard Renaksi', {
  a: 'Dashboard Renaksi merangkum capaian kinerja: membandingkan target vs realisasi per indikator/periode, jadi gambaran cepat progres tanpa membuka satu-satu.',
  c: [C('Mode Renaksi', 'mode renaksi apa saja'), TOPIK],
})
e('ra.relasi-pk', 'Renaksi & Perjanjian Kinerja', {
  a: 'Ya, nyambung: sasaran/program di Renaksi bisa ditarik ke Perjanjian Kinerja lewat tombol Import Renaksi di PK — jadi tidak mengetik ulang. Renaksi sumbernya, PK memakainya.',
  c: [C('Import Renaksi ke PK', 'import renaksi ke pk itu apa'), TOPIK],
})
e('ra.init-kinerja', 'Init Renaksi dari Kinerja', {
  a: 'Init di sini maksudnya menyiapkan baris Renaksi mengikuti struktur yang ada (mis. dari data kinerja/SSK) supaya tidak mulai dari kosong. Setelah ter-init, target & realisasinya tinggal kamu lengkapi.',
  c: [C('Tambah Renaksi', 'cara tambah rencana aksi'), TOPIK],
})

// ─── Perjanjian Kinerja — fungsi tambahan ───────────────────────────────────
e('pk.tab-master', 'Tab master PK', {
  a: 'Saat menyusun PK ada beberapa tab: Unit, Sasaran, Program, Pejabat penandatangan, dan Dokumen. Isi berurutan — sasaran & program bisa diambil dari master atau ditambah manual (Tambah Baris/Tambah Unit).',
  c: [C('Import Renaksi', 'import renaksi ke pk itu apa'), TOPIK],
})
e('pk.import-renaksi', 'Import Renaksi ke PK', {
  k: ['import renaksi'],
  a: 'Tombol Import Renaksi menarik sasaran/indikator dari modul Rencana Aksi ke PK supaya tak mengetik ulang. Ada mode Merge (gabung) dan Replace All (ganti semua) — pilih sesuai kebutuhan.',
  c: [C('Tab master PK', 'tab master pk apa saja'), TOPIK],
})
e('pk.sasaran', 'Sasaran strategis PK', {
  a: 'Sasaran strategis diisi di tab Sasaran — bisa diambil dari Master Sasaran, di-Import dari Rencana Aksi, atau ditambah manual lewat Tambah Baris.',
  c: [C('Program PK', 'program diambil dari mana'), C('Import Renaksi', 'import renaksi ke pk itu apa')],
})
e('pk.program', 'Program PK', {
  a: 'Program diisi di tab Program — diambil dari Master Program atau ditambah manual, lalu dikaitkan ke sasaran yang sesuai.',
  c: [C('Sasaran PK', 'sasaran strategis diisi dari mana'), TOPIK],
})
e('pk.pejabat', 'Pejabat penandatangan PK', {
  a: 'Tambah pejabat penandatangan di tab Pejabat — isi jabatan & pangkat/golongan. Mereka jadi Pihak Pertama/Kedua di dokumen PK.',
  c: [C('Pihak pertama-kedua', 'pihak pertama kedua itu siapa'), TOPIK],
})
e('pk.unit', 'Unit kerja PK', {
  a: 'Unit kerja dikelola di tab Unit (Tambah Unit). Tiap unit punya sasaran, program, dan pejabatnya sendiri dalam satu dokumen PK.',
  c: [C('Tab master PK', 'tab master pk apa saja'), TOPIK],
})
e('pk.blud-nominal', 'Nominal BLUD di PK', {
  a: 'Nominal BLUD di lampiran PK ditarik dari rekap BLUD lewat BLUD PJ Mapping, supaya keterangan sumber dana & angkanya konsisten dengan data BLUD — bukan diketik bebas.',
  c: [C('Tab master PK', 'tab master pk apa saja'), TOPIK],
})
e('pk.atasan-suggest', 'Saran atasan PK', {
  a: 'Saran atasan muncul dari pejabat/unit yang sudah terdaftar. Kalau atasanmu belum muncul, biasanya datanya belum ada — tambahkan dulu di tab Pejabat, atau set Atasan Default.',
  c: [C('Pejabat PK', 'cara tambah pejabat penandatangan'), TOPIK],
})
e('pk.status', 'Status DRAFT vs FINAL PK', {
  a: 'PK berstatus DRAFT (masih bisa diedit) sampai kamu Finalisasi jadi FINAL (terkunci, siap diunduh). Pastikan semua tab benar sebelum finalisasi ya.',
  c: [C('Finalize PK', 'finalize pk itu apa'), TOPIK],
})
e('pk.riwayat', 'Riwayat dokumen PK', {
  a: 'Riwayat Dokumen PK menyimpan daftar PK yang pernah dibuat per tahun & jenis (MURNI/PERUBAHAN) beserta statusnya, jadi bisa dibuka atau diunduh lagi kapan pun.',
  c: [C('Unduh PK', 'cara download dokumen word pk'), TOPIK],
})

// ─── LKJIP — fungsi, blok & versi ───────────────────────────────────────────
e('lkjip.kerangka', 'Kerangka/outline LKJIP', {
  a: 'LKJIP disusun seperti kerangka berjenjang (bab → sub-bab) di panel kiri. Klik bagian untuk mengisinya; nomor bab dihitung otomatis mengikuti susunan, jadi kamu tinggal atur urutannya.',
  c: [C('Jenis blok', 'jenis blok lkjip apa saja'), TOPIK],
})
e('lkjip.blok', 'Jenis blok isi LKJIP', {
  k: ['jenis blok lkjip'],
  a: 'Tiap bagian diisi dengan blok: Narasi (teks), Tabel, Gambar, atau Grafik. Tambah blok lewat tombol di dalam bagian, lalu isi sesuai jenisnya.',
  c: [C('Masukkan tabel', 'cara masukkan tabel'), C('Masukkan gambar', 'cara masukkan gambar')],
})
e('lkjip.blok-tabel', 'Blok Tabel LKJIP', {
  a: 'Tambah blok Tabel lalu atur jumlah baris/kolom; sel bisa di-Merge (gabung). Tabel tercetak rapi di Word dan otomatis masuk Daftar Tabel.',
  c: [C('Masukkan gambar', 'cara masukkan gambar'), C('Grafik', 'grafik bisa dimasukkan?')],
})
e('lkjip.blok-gambar', 'Blok Gambar LKJIP', {
  a: 'Tambah blok Gambar lalu unggah berkasnya; saat diunduh, gambar tercetak di Word dengan caption otomatis dan masuk Daftar Gambar.',
  c: [C('Masukkan tabel', 'cara masukkan tabel'), C('Grafik', 'grafik bisa dimasukkan?')],
})
e('lkjip.blok-grafik', 'Blok Grafik LKJIP', {
  k: ['grafik lkjip'],
  a: 'Bisa — blok Grafik mendukung Pie/Donat, Bar/Kolom, dan Line/Garis. Sumber datanya diketik manual atau diambil dari blok Tabel; grafik ikut tercetak di Word.',
  c: [C('Masukkan tabel', 'cara masukkan tabel'), TOPIK],
})
e('lkjip.numbering', 'Penomoran bab LKJIP', {
  a: 'Nomor bab/sub-bab dihitung OTOMATIS dari susunan pohon kerangka — saat kamu memindah atau menambah bagian, nomornya menyesuaikan sendiri. Tidak perlu diketik manual.',
  c: [C('Kerangka', 'kerangka lkjip itu apa'), TOPIK],
})
e('lkjip.style', 'Pengaturan Dokumen LKJIP', {
  k: ['pengaturan dokumen lkjip'],
  a: 'Menu Pengaturan Dokumen mengatur tampilan hasil Word: jenis & ukuran font, spasi, perataan (justify), nomor halaman, dan footer. Berlaku untuk seluruh dokumen.',
  c: [C('Daftar isi otomatis', 'daftar isi otomatis?'), TOPIK],
})
e('lkjip.toc', 'Daftar isi otomatis LKJIP', {
  a: 'Daftar Isi, Daftar Tabel, dan Daftar Gambar dibuat OTOMATIS saat dokumen diunduh (field TOC) — kamu tidak perlu mengetiknya. Nomor halaman & caption juga otomatis.',
  c: [C('Unduh Word', 'cara download word lkjip'), TOPIK],
})
e('lkjip.versi', 'Simpan versi LKJIP', {
  a: 'Simpan Versi menyimpan salinan struktur dokumen (dan arsip Word) yang bisa dipulihkan kapan pun. Berguna sebelum perubahan besar — riwayat lama tetap aman.',
  c: [C('Pulihkan versi', 'cara kembalikan ke versi kemarin'), TOPIK],
})
e('lkjip.restore', 'Pulihkan versi LKJIP', {
  a: 'Buka riwayat versi lalu pilih Pulihkan untuk mengembalikan dokumen ke kondisi versi itu. Versi yang sekarang tetap tersimpan, jadi aman dicoba.',
  c: [C('Simpan versi', 'cara simpan versi dokumen'), TOPIK],
})
e('lkjip.drive', 'Arsip Google Drive LKJIP', {
  a: 'Saat Simpan Versi, salinan Word juga diarsipkan ke Google Drive secara best-effort (kalau gagal, versi tetap tersimpan di aplikasi). Tujuannya cadangan dokumen.',
  c: [C('Simpan versi', 'cara simpan versi dokumen'), TOPIK],
})
e('lkjip.finalize', 'Finalisasi LKJIP', {
  a: 'Finalisasi mengunci dokumen jadi FINAL — setelah final tidak bisa diedit lagi (immutable), sebagai tanda laporan selesai. Pastikan semua bab & blok benar dulu; kalau masih perlu berubah, simpan versi atau buat dokumen baru.',
  c: [C('Simpan versi', 'cara simpan versi dokumen'), TOPIK],
})

// ─── Admin Panel — fungsi tambahan ──────────────────────────────────────────
e('admin.attack-monitor', 'Attack Monitor', {
  a: 'Attack Monitor di Control Center menampilkan upaya akses mencurigakan (mis. gagal login beruntun) untuk dipantau admin. Sifatnya memantau, tidak mengubah data.',
  c: [C('Sesi aktif', 'sesi user bisa dimatikan paksa?'), TOPIK],
})
e('admin.kill-session', 'Matikan sesi user', {
  a: 'Bisa — di Daftar Sesi Aktif, admin bisa Revoke (putus paksa) sesi user, mis. saat akun perlu diamankan. Pengguna itu lalu diminta login ulang.',
  c: [C('Attack monitor', 'attack monitor itu apa'), TOPIK],
})
e('admin.promosi', 'Setujui promosi role', {
  a: 'Permintaan kenaikan role masuk ke panel Promotion Role; admin me-Review lalu Setujui/Tolak secara berjenjang. Pengguna mengajukan, admin yang memutus.',
  c: [C('Ubah role', 'cara ubah role user'), TOPIK],
})
e('admin.broadcast', 'Broadcast pengumuman', {
  a: 'Kirim Broadcast mengirim pengumuman ke pengguna; Riwayat Broadcast menyimpan yang pernah dikirim. Dipakai untuk info penting seperti jadwal pemeliharaan.',
  c: [TOPIK, LAIN],
})
e('admin.app-flag', 'Matikan satu aplikasi', {
  a: 'Lewat Akses Aplikasi, admin bisa menyalakan/mematikan satu modul atau menaruhnya ke mode pemeliharaan untuk SEMUA user — modul lalu ditutup sementara. Master toggle mengatur semuanya.',
  c: [C('Atur akses aplikasi', 'cara atur akses aplikasi user'), TOPIK],
})
e('admin.audit-log', 'Audit log', {
  a: 'Audit log mencatat aksi penting (siapa melakukan apa, kapan) untuk pemeriksaan. Dilihat admin di Control Center; isinya jejak, bukan untuk diubah.',
  c: [TOPIK, LAIN],
})
e('admin.email-quota', 'Kuota email', {
  a: 'Sistem memakai email untuk verifikasi & notifikasi, dan ada kuota pengirimannya. Kalau hampir habis, admin perlu cek konfigurasi email — kalau mendesak, koordinasi dengan sesama admin/IT.',
  c: [TOPIK, LAIN],
})
e('admin.security-checklist', 'Security Checklist & status', {
  a: 'Security Checklist & Status Overview merangkum kondisi keamanan sistem (kontrol yang sudah aktif) sebagai panduan pemantauan admin. Sifatnya informatif.',
  c: [TOPIK, LAIN],
})

// ─── Buku Besar Aset — istilah & fungsi ─────────────────────────────────────
e('bba.sumber', 'Sumber anggaran BBA', {
  a: 'Sumber anggaran aset ada beberapa: BLUD, APBD, DAK, dan LAINNYA. Pilih sesuai asal dana belanja modalnya — ini juga jadi filter & pengelompokan di daftar.',
  c: [C('Kategori aset', 'kategori aset dikelola di mana'), C('Catat aset', 'cara catat aset baru')],
})
e('bba.master-kategori', 'Master Kategori Aset', {
  a: 'Kategori Aset dikelola lewat Master Kategori — kamu bisa pilih dari daftar atau ketik kategori baru saat mencatat aset. Gunanya mengelompokkan jenis aset.',
  c: [C('Sumber anggaran', 'sumber anggaran apa saja'), TOPIK],
})
e('bba.canonical', 'Canonical ID aset', {
  a: 'Canonical ID (berawalan BBA-) adalah identitas tetap sebuah aset yang sama lintas tahun anggaran. Jadi aset yang sama tetap terlacak walau tahunnya berganti.',
  c: [C('Aset lintas tahun', 'aset tahun lalu kok muncul lagi'), TOPIK],
})
e('bba.lintas-tahun', 'Aset lintas tahun', {
  a: 'Aset tahun lalu bisa muncul lagi karena identitasnya (canonical ID) memang dilacak lintas tahun — supaya kelanjutan realisasinya kelihatan. Itu fitur, bukan duplikat.',
  c: [C('Canonical ID', 'canonical id itu apa'), TOPIK],
})
e('bba.vol-realisasi', 'Volume realisasi BBA', {
  a: 'Vol realisasi adalah jumlah unit yang benar-benar terealisasi, dibatasi 0 sampai volume rencana (0 ≤ vol_real ≤ vol). Tidak boleh melebihi yang direncanakan.',
  c: [C('Isi realisasi aset', 'cara isi realisasi aset'), TOPIK],
})
e('bba.aging', 'Aging / umur aset', {
  a: 'Umur (aging) aset dihitung otomatis di server dari tanggalnya — kamu tidak mengisinya manual. Gunanya memantau aset yang sudah lama belum terealisasi.',
  c: [C('Status aset', 'status aset apa saja'), TOPIK],
})
e('bba.version-conflict', 'Bentrok versi BBA', {
  a: 'Kalau muncul bentrok versi, artinya baris itu sudah diubah pengguna lain (pengaman CAS per-baris). Muat ulang dulu lalu ulangi perubahanmu supaya tidak saling timpa.',
  c: [C('Isi realisasi aset', 'cara isi realisasi aset'), TOPIK],
})

// ─── E-Anggaran / Kinerja — istilah & fungsi ────────────────────────────────
e('kin.tab-sumber', 'Tab sumber Kinerja', {
  a: 'Tab Sumber memisahkan data SSK & realisasi per sumber dana (mis. BLUD/Gaji/DAK) supaya angkanya tidak tercampur. Pilih tab sesuai sumber yang sedang kamu isi.',
  c: [C('SSK itu apa', 'ssk itu apa'), C('Isi realisasi', 'cara isi realisasi bulanan')],
})
e('kin.nomen', 'Nomenklatur realisasi', {
  a: 'Nomenklatur = penamaan/uraian baku item realisasi yang mengikuti SSK, supaya konsisten antar dokumen. Kamu tinggal pakai yang sudah ada, bukan mengarang istilah baru.',
  c: [C('SSK itu apa', 'ssk itu apa'), TOPIK],
})
e('kin.laporan', 'Unduh laporan Kinerja', {
  a: 'Laporan kinerja diunduh dari modul Kinerja lewat tombol export (Excel/PDF) di tab terkait, mis. di Realisasi. Pilih tahun & sumber dulu supaya isinya pas.',
  c: [C('Isi realisasi', 'cara isi realisasi bulanan'), TOPIK],
})
e('kin.rekening', 'Rekening di Kinerja', {
  a: 'Di Kinerja kamu tidak mengetik kode rekening manual — uraian SSK yang jadi acuan, dan penamaan mengikuti master. Pengelolaan kode baku ada di sisi master, bukan di form realisasi.',
  c: [C('SSK itu apa', 'ssk itu apa'), TOPIK],
})
e('kin.reset', 'Reset data Kinerja', {
  a: 'Reset data kinerja menghapus isian dan berisiko — makanya khusus admin dan harus hati-hati. Pastikan benar-benar perlu dan sudah ada cadangan sebelum melakukannya.',
  c: [C('Data ke-timpa', 'data ssk saya ditimpa orang'), TOPIK],
})
e('kin.canonical', 'Canonical ID Kinerja', {
  a: 'Canonical ID di Kinerja adalah identitas tetap satu baris SSK lintas versi (MURNI/PERUBAHAN), supaya realisasi tetap nyambung ke SSK yang benar walau versinya berganti.',
  c: [C('Versi MURNI/PERUBAHAN', 'versi murni dan perubahan bedanya apa'), TOPIK],
})
e('kin.lock', 'Data SSK ditimpa (lock)', {
  a: 'Kalau datamu terasa ditimpa, itu pengaman kunci optimistik: yang menyimpan duluan menang, yang kedua diminta muat ulang dulu. Muat ulang lalu ulangi perubahanmu — aman, tidak ada yang hilang diam-diam.',
  c: [C('Versi konflik', 'muncul tulisan dikunci pengguna lain'), C('Isi realisasi', 'cara isi realisasi bulanan')],
})

export const MODULE_FALLBACK = {
  usulan: {
    title: 'Modul Usulan Kebutuhan',
    answers: ['Itu soal modul Usulan Kebutuhan ya. Garis besarnya: usulan dibuat dari sidebar, lalu ditelaah Admin → Kasubag → diputus final oleh Kabag; statusnya bisa dipantau di Tracking. Detail pertanyaanmu yang spesifik sedang kupelajari — segera kulengkapi 🙏'],
    chips: [C('Usulan disetujui ke mana', 'usulan yang disetujui masuk ke mana'), TOPIK],
  },
  bba: {
    title: 'Modul Buku Besar Aset',
    answers: ['Itu soal Buku Besar Aset ya — register belanja modal lintas-tahun: aset dicatat, lalu realisasinya diisi sampai berstatus terealisasi penuh/sebagian. Detail pertanyaanmu sedang kupelajari; rumus-rumus nilainya sudah bisa kutanya kok 😊'],
    chips: [C('Nilai rencana aset', 'nilai rencana di buku besar aset dihitung dari mana'), C('Sisa anggaran', 'sisa anggaran aset rumusnya apa'), TOPIK],
  },
  kin: {
    title: 'Modul E-Anggaran / Kinerja',
    answers: ['Itu soal modul Kinerja ya — tempat master SSK dan realisasi bulanan diisi, lengkap dengan versi MURNI/PERUBAHAN. Detail pertanyaanmu sedang kupelajari; rumus persennya sudah bisa kujawab 😊'],
    chips: [C('% realisasi keuangan', 'persen realisasi keuangan dihitung dari mana'), C('Target bulanan', 'target fisik bulanan angkanya dari mana'), TOPIK],
  },
  pk: {
    title: 'Modul Perjanjian Kinerja',
    answers: ['Itu soal modul Perjanjian Kinerja ya — menyusun dokumen PK (sasaran, program, pejabat penandatangan) lalu mengunduhnya sebagai Word. Detail pertanyaanmu sedang kupelajari — segera kulengkapi 🙏'],
    chips: [C('PK itu apa', 'pk itu maksudnya perjanjian kinerja ya'), TOPIK],
  },
  ra: {
    title: 'Modul Rencana Aksi',
    answers: ['Itu soal modul Rencana Aksi ya — menjabarkan target kinerja jadi langkah-langkah terukur, dan datanya bisa ditarik ke Perjanjian Kinerja. Detail pertanyaanmu sedang kupelajari — segera kulengkapi 🙏'],
    chips: [TOPIK, LAIN],
  },
  lkjip: {
    title: 'Modul LKJIP',
    answers: ['Itu soal modul LKJIP ya — penyusun Laporan Kinerja tahunan berbasis kerangka bab + blok isi (narasi, tabel, gambar, grafik) yang diunduh jadi Word rapi. Detail pertanyaanmu sedang kupelajari — segera kulengkapi 🙏'],
    chips: [TOPIK, LAIN],
  },
  admin: {
    title: 'Admin Panel',
    answers: ['Itu wilayah Admin Panel ya — kelola user, akses aplikasi, dan pemantauan sistem (khusus role admin). Detail pertanyaanmu sedang kupelajari; kalau mendesak, langsung ke sesama admin ya 🙏'],
    chips: [C('Dua panel user', 'bedanya kelola user di usulan dengan user management'), TOPIK],
  },
}

export const RIMA_FALLBACK = {
  answers: [
    'Aku belum nangkep maksudnya 😊 Aku paling jago soal PRIMA, tapi boleh juga diajak ngobrol ringan — mau tanya cara pakai, atau minta tebak-tebakan/fakta unik?',
    'Hmm, yang itu belum kukenali 🙏 Coba tulis ulang dengan kata yang lebih umum, pilih topik di bawah, atau kita santai sebentar — mau kuhibur?',
    'Maaf, belum kupahami 🙏 Tanya saja seputar PRIMA, atau kalau mau rehat sejenak aku punya tebak-tebakan, pantun, dan fakta unik 😊',
  ],
  chips: [
    C('Daftar topik', 'menu apa saja yang ada di prima'),
    C('Kemampuan Rima', 'kamu bisa apa saja'),
    C('Tebak-tebakan', 'kasih tebak-tebakan dong'),
    C('Fakta unik', 'fakta unik'),
  ],
}

export const RIMA_GREETING = {
  answers: ['Hai! Aku Rima 👋 Tanya apa saja soal cara pakai PRIMA — atau pilih topik di bawah ini.'],
  chips: [
    { l: '▶ Kenalan dgn PRIMA', q: '', tour: 'kenal-prima' },
    C('Daftar topik', 'menu apa saja yang ada di prima'),
    C('Alur BLUD', 'cara menjalankan aplikasi blud dari awal sampai akhir'),
    C('Kemampuan Rima', 'kamu bisa apa saja'),
  ],
}

// B3 — dipakai RimaChat saat ≥2 pertanyaan gagal beruntun (1×/sesi). Nada ramah +
// tawaran tur + eskalasi halus ke admin/atasan (G11: arahan saja, tanpa mekanisme).
export const RIMA_CONFUSED = {
  answers: [
    'Kayaknya aku belum nyambung dengan yang kamu maksud, maaf ya 🙏 Biar lebih cepat, mau kuajak kenalan dulu dengan PRIMA atau pilih dari daftar topik? Kalau yang kamu cari memang di luar lingkupku, atasan atau admin bisa bantu lebih jauh.',
  ],
  chips: [
    { l: '▶ Kenalan dgn PRIMA', q: '', tour: 'kenal-prima' },
    C('Daftar topik', 'menu apa saja yang ada di prima'),
    C('Hibur aku', 'hibur aku dong'),
  ],
}

// B4 — ringkasan fitur baru, ditawarkan sekali ke user lama yang seenVersion-nya
// belum 'f4'. version = satu sumber kebenaran (RimaChat baca dari sini, G14).
export const RIMA_WHATS_NEW = {
  version: 'f4',
  answers: [
    'Ada yang baru di PRIMA 😊 Sekarang aku bisa memandumu lewat tur keliling layar — aku menunjuk tombolnya langsung, menjawab lebih banyak pertanyaan modul dan rumus hitung, plus ikut menjaga form dari entri ganda saat kamu menyimpan. Mau coba tur kenalannya?',
  ],
  chips: [
    { l: '▶ Kenalan dgn PRIMA', q: '', tour: 'kenal-prima' },
    C('Kemampuan Rima', 'kamu bisa apa saja'),
    TOPIK,
  ],
}

/** Kandidat A5: "Mungkin maksudmu …" — judul intent untuk chips kandidat. */
export function intentTitle(intent) {
  const kb = RIMA_KB[intent]
  if (kb) return kb.title
  const mod = MODULE_FALLBACK[intent.split('.')[0]]
  if (mod) return `${mod.title}: ${intent.split('.')[1]?.replace(/-/g, ' ') ?? intent}`
  return intent.replace(/[.\-]/g, ' ')
}

/** Map intent → keywords untuk lapis exact-keyword engine. */
export function kbKeywords() {
  const out = {}
  for (const [intent, entry] of Object.entries(RIMA_KB)) {
    if (entry.keywords.length > 0) out[intent] = entry.keywords
  }
  return out
}

/** Resolusi jawaban per intent: KB → fallback modul → null (fallback umum). */
export function resolveAnswer(intent) {
  if (RIMA_KB[intent]) return RIMA_KB[intent]
  const mod = MODULE_FALLBACK[intent.split('.')[0]]
  if (mod) return mod
  return null
}
