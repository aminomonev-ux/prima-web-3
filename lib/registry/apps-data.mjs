// lib/registry/apps-data.mjs — ISI daftar modul PRIMA. Tipe & penolongnya di apps.ts.
//
// Kenapa berkas ini JavaScript polos, bukan TypeScript: gate G (`check:killswitch`)
// jalan di CI dengan `node` biasa, dan `tsx` bukan devDependency di repo ini. Kalau
// datanya hanya ada dalam bentuk .ts, penjaga CI-nya terpaksa mengetik ulang daftar
// modul — dan daftar penjaga yang terpisah dari daftar yang dijaga persis cacat yang
// seluruh registry ini ada untuk membuangnya (T-1). Jadi yang dikorbankan bentuk
// berkasnya, bukan ketunggalan datanya.
//
// Tipenya tetap ditegakkan: `apps.ts` menyatakan larik ini `readonly Modul[]`, jadi
// entri yang bentuknya salah tetap gagal di `tsc`.
//
// MENAMBAH MODUL = MENAMBAH SATU ENTRI DI SINI. Tidak ada tempat kedua.

/** @typedef {import('./apps').Modul} Modul */

/** @type {readonly Modul[]} */
export const MODUL_APPS_DATA = [
  {
    kunci: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG'],
    bolehDigrant: true,
    sakelar: 'app_status_dashboard',
    dirApi: 'app/api/dashboard',
    penjagaApi: { lewat: 'per-route', penanda: ['dashboardMati'] },
    punyaMenu: false,
    alias: ['dashboard', 'ringkasan', 'beranda lintas modul'],
  },
  {
    kunci: 'rencana_aksi',
    label: 'Renaksi & Kinerja',
    href: '/rencana-aksi',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN'],
    bolehDigrant: true,
    sakelar: 'app_status_rencana_aksi',
    dirApi: 'app/api/rencana-aksi',
    penjagaApi: { lewat: 'pabrik', penanda: ['guard'] },
    punyaMenu: false,
    alias: ['rencana aksi', 'renaksi', 'renaksi & kinerja'],
  },
  {
    kunci: 'buku_besar_aset',
    label: 'Buku Besar Aset',
    href: '/buku-besar-aset',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN'],
    bolehDigrant: true,
    sakelar: 'app_status_buku_besar_aset',
    dirApi: 'app/api/buku-besar-aset',
    penjagaApi: { lewat: 'pabrik', penanda: ['guard'] },
    punyaMenu: false,
    alias: ['buku besar aset', 'bba', 'belanja modal'],
  },
  {
    kunci: 'blud',
    label: 'BLUD',
    href: '/blud',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN'],
    bolehDigrant: true,
    sakelar: 'app_status_blud',
    // Berjenjang: mematikan BLUD ikut mematikan Realisasi, tidak sebaliknya.
    // Label tanpa embel "(sub-modul)": ia dipakai DUA tempat sekaligus — kartu di layar
    // Sakelar, yang sudah menampilkannya menjorok di bawah induknya, dan halaman
    // `/maintenance` yang dibaca pemakai biasa. Kata "sub-modul" jargon admin di layar
    // yang salah; posisinya yang menyatakan itu, bukan namanya.
    subSakelar: [{ kunci: 'app_status_blud_realisasi', label: 'BLUD — Realisasi' }],
    dirApi: 'app/api/blud',
    penjagaApi: { lewat: 'per-route', penanda: ['bludMati', 'realisasiMati'] },
    punyaMenu: true,
    alias: ['blud', 'dpa', 'pergeseran', 'anggaran blud'],
  },
  {
    kunci: 'perjanjian_kinerja',
    label: 'Perjanjian Kinerja',
    href: '/perjanjian-kinerja',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG', 'RENBANG', 'PROGRAM'],
    bolehDigrant: true,
    sakelar: 'app_status_perjanjian_kinerja',
    dirApi: 'app/api/perjanjian-kinerja',
    penjagaApi: { lewat: 'per-route', penanda: ['pkMati'] },
    punyaMenu: true,
    alias: ['perjanjian kinerja', 'pk'],
  },
  {
    kunci: 'iki',
    label: 'IKI',
    href: '/iki',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN'],
    bolehDigrant: true,
    sakelar: 'app_status_iki',
    dirApi: 'app/api/iki',
    penjagaApi: { lewat: 'pabrik', penanda: ['guard'] },
    punyaMenu: false,
    alias: ['iki', 'indikator kinerja individu', 'kinerja individu'],
  },
  {
    kunci: 'lkjip',
    label: 'E-LKJIP',
    href: '/lkjip',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN'],
    bolehDigrant: true,
    sakelar: 'app_status_lkjip',
    dirApi: 'app/api/lkjip',
    penjagaApi: { lewat: 'pabrik', penanda: ['guard'] },
    punyaMenu: false,
    alias: ['lkjip', 'e-lkjip', 'laporan kinerja'],
  },
  {
    kunci: 'new_econtrolling',
    label: 'E-Anggaran',
    // Kuncinya `new_econtrolling` sementara alamatnya `/kinerja` dan labelnya
    // "E-Anggaran" — tiga nama untuk satu modul, warisan yang sengaja TIDAK dirapikan
    // di sini: kuncinya sudah tertulis di `users.app_access` orang-orang sungguhan,
    // dan menggantinya butuh migrasi. Registry justru tempat yang benar untuk menampung
    // ketidakcocokan seperti ini, supaya tidak perlu diingat di delapan tempat.
    href: '/kinerja',
    peranBawaan: ['SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG', 'RENBANG', 'PROGRAM', 'KEUANGAN'],
    bolehDigrant: true,
    sakelar: 'app_status_new_econtrolling',
    dirApi: 'app/api/kinerja',
    penjagaApi: { lewat: 'per-route', penanda: ['kinerjaMati'] },
    punyaMenu: false,
    alias: ['kinerja', 'e-anggaran', 'e anggaran', 'e-controlling', 'econtrolling', 'eanggaran'],
  },
  {
    kunci: 'usulan_aset',
    label: 'Usulan Kebutuhan',
    href: '/usulan-kebutuhan',
    // Terbuka untuk SEMUA peran, dan itu memang disengaja: alur usulan dimulai dari
    // sub-bidang. Pembatasannya hidup di dalam modulnya (panel per peran), bukan di
    // pintunya.
    peranBawaan: 'SEMUA',
    // Grant-nya TIDAK menambah apa pun — tapi tetap `true`, karena hari ini kuncinya
    // diterima `AppAccessKeyEnum` dan centangnya ada di "Atur Akses Aplikasi". Menutupnya
    // di sini akan membuat tombol "pilih semua" mengirim kunci yang ditolak Zod 400.
    // Tahap 2 berjanji nol perubahan perilaku; centang yang menyesatkan itu urusan
    // Tahap 5, yang menampilkannya sebagai "terkunci — terbuka untuk semua peran".
    bolehDigrant: true,
    sakelar: 'app_status_usulan_aset',
    dirApi: 'app/api/usulan',
    penjagaApi: { lewat: 'per-route', penanda: ['usulanMati'] },
    punyaMenu: false,
    alias: ['usulan kebutuhan', 'usulan', 'pengajuan'],
  },
  {
    kunci: 'admin',
    label: 'Admin Panel',
    href: '/admin',
    // SUPER_ADMIN saja (keputusan 2026-09-09). Admin Staff mengawasi ISI aplikasi,
    // bukan mengatur siapa boleh masuk — lihat §9-1 konsep.
    peranBawaan: ['SUPER_ADMIN'],
    // T-9: `admin` sempat hidup di `AppAccessKeyEnum` sebagai nilai yang sah, padahal
    // tidak ada satu pun kode yang membacanya sebagai grant. Memberi centang itu ke
    // seseorang tidak pernah membuka apa pun — janji kosong yang terlihat resmi.
    bolehDigrant: false,
    sakelar: null,
    // Route admin sengaja tanpa sakelar: yang mematikan modul harus tetap bisa masuk
    // untuk menyalakannya kembali. Sakelar di sini = kunci yang tertinggal di dalam.
    dirApi: 'app/api/admin',
    punyaMenu: false,
    alias: ['admin panel', 'admin'],
  },
]
