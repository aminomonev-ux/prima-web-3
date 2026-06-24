// lib/sentinel/anchors.ts — registry anchor `data-rima` RIMA F3 (CONCEPT §6).
// Konvensi nama: modul.area-aksi (G15). Setiap id di sini WAJIB punya atribut
// data-rima="<id>" di src — divalidasi scripts/rima-anchor-check.mjs (CI gate C).
// label dipakai intent locate ("di mana tombol X") + teks fallback saat elemen
// tidak ada di DOM (role-hidden / modal tertutup).

export interface RimaAnchor {
  /** Pathname halaman tempat elemen hidup (prefix match). */
  page: string
  /** Nama manusiawi untuk locate + narasi fallback. */
  label: string
  /** F5c: 1 kalimat FUNGSI tombol — dipakai jawaban "tombol X buat apa?".
   *  Kalau kosong, Rima jatuh ke label. */
  desc?: string
  /** Kontrol destruktif (hapus). Rima boleh MENUNJUK dgn caution, tak pernah klik (G1/G16). */
  destructive?: boolean
}

export const RIMA_ANCHORS: Record<string, RimaAnchor> = {
  // ── /menu (kenal-prima) ────────────────────────────────────────────────────
  'menu.user-badge':   { page: '/menu', label: 'badge profil & menu akun' },
  'menu.brand-status': { page: '/menu', label: 'kartu status PRIMA (modul aktif & versi)' },
  'menu.daftar-app':   { page: '/menu', label: 'daftar aplikasi/modul' },

  // ── /blud/dpa ──────────────────────────────────────────────────────────────
  'dpa.versi-dropdown':     { page: '/blud/dpa', label: 'dropdown pilih versi DPA' },
  'dpa.form-baru':          { page: '/blud/dpa', label: 'tombol Form Baru', desc: 'Tombol Form Baru membangun kerangka DPA otomatis dari daftar Kode Besar — titik awal menyusun DPA baru.' },
  'dpa.overlay-buat-form':  { page: '/blud/dpa', label: 'tombol Buat Form di overlay Kode Besar' },
  'dpa.kolom-uraian':       { page: '/blud/dpa', label: 'kolom Uraian (pencarian Master Akun)', desc: 'Kolom Uraian: ketik kata kunci lalu pilih dari Master Akun — kode rekening ikut terisi otomatis, tak perlu diketik.' },
  'dpa.kolom-vol':          { page: '/blud/dpa', label: 'kolom Vol baris rincian' },
  'dpa.kolom-pj':           { page: '/blud/dpa', label: 'kolom Penanggung Jawab' },
  'dpa.kebab-aksi':         { page: '/blud/dpa', label: 'menu aksi baris (kebab ⋮)' },
  'dpa.kebab-import':       { page: '/blud/dpa', label: 'menu Import dari Usulan', desc: 'Menu Import dari Usulan menarik item usulan yang sudah final ke baris DPA — praktis, tanpa ketik ulang.' },
  'dpa.import-mode-fill':   { page: '/blud/dpa', label: 'mode Isi Baris Ini di modal import' },
  'dpa.import-mode-insert': { page: '/blud/dpa', label: 'mode Sisip Baris Baru di modal import' },
  'dpa.import-susunan':     { page: '/blud/dpa', label: 'Panel Susunan modal import' },
  'dpa.import-submit':      { page: '/blud/dpa', label: 'tombol Import / Isi Baris Ini' },
  'dpa.search-jump':        { page: '/blud/dpa', label: 'pencarian kode/uraian + Jump' },
  'dpa.legend-chips':       { page: '/blud/dpa', label: 'chip legenda level' },
  'dpa.hapus-terpilih':     { page: '/blud/dpa', label: 'tombol Hapus Terpilih', destructive: true, desc: 'Tombol Hapus Terpilih menghapus baris-baris yang kamu centang. Aku hanya menunjukkannya — penghapusan kamu sendiri yang klik & putuskan.' },
  'dpa.simpan':             { page: '/blud/dpa', label: 'tombol Simpan DPA', desc: 'Tombol Simpan menyimpan DPA; sebelum tersimpan aku memeriksa entri ganda & konflik PJ, lalu versinya tercatat per tanggal.' },

  // ── /blud/pergeseran ───────────────────────────────────────────────────────
  // ── /usulan-kebutuhan (F4c — tur usulan-buat-baru) ─────────────────────────
  'usulan.sidebar-grup-pengajuan': { page: '/usulan-kebutuhan', label: 'grup sidebar Pengajuan' },
  'usulan.sidebar-buat':  { page: '/usulan-kebutuhan', label: 'menu sidebar Buat Usulan' },
  'usulan.tahun-mulai':   { page: '/usulan-kebutuhan', label: 'tombol Mulai Pengajuan (pilih tahun)' },
  'usulan.field-nama':    { page: '/usulan-kebutuhan', label: 'kolom Nama Barang' },
  'usulan.field-qty':     { page: '/usulan-kebutuhan', label: 'kolom Jumlah (Qty)' },
  'usulan.field-harga':   { page: '/usulan-kebutuhan', label: 'kolom Estimasi Harga Satuan' },
  'usulan.tambah-item':   { page: '/usulan-kebutuhan', label: 'tombol Tambah ke Daftar', desc: 'Tombol Tambah ke Daftar memasukkan item (nama barang, jumlah, harga) ke daftar usulanmu — bisa banyak item.' },
  'usulan.preview-no':    { page: '/usulan-kebutuhan', label: 'pratinjau Nomor Usulan otomatis' },
  'usulan.btn-draft':     { page: '/usulan-kebutuhan', label: 'tombol simpan Draft' },
  'usulan.btn-ajukan':    { page: '/usulan-kebutuhan', label: 'tombol Kirim Usulan', desc: 'Tombol Kirim Usulan mengirim usulanmu untuk ditelaah — setelah terkirim tidak bisa diedit lagi demi menjaga jejak telaah.' },
  'usulan.tab-tracking':  { page: '/usulan-kebutuhan', label: 'menu sidebar Lacak Usulan' },

  // ── /buku-besar-aset (F4d — tur bba-entry) ─────────────────────────────────
  'bba.tambah-item':      { page: '/buku-besar-aset', label: 'tombol Tambah Item', desc: 'Tombol Tambah Item mencatat belanja modal baru; Nilai Rencana dihitung otomatis = volume × harga, bukan diketik.' },
  'bba.tarik-usulan':     { page: '/buku-besar-aset', label: 'tombol Tarik dari Usulan Kebutuhan' },
  'bba.tarik-cmt':        { page: '/buku-besar-aset', label: 'tombol Tarik Item di modal preview' },
  'bba.kpi-cards':        { page: '/buku-besar-aset', label: 'kartu KPI (Total Rencana, Realisasi, % Terakomodir)' },
  'bba.tab-keputusan':    { page: '/buku-besar-aset', label: 'tab Semua / Disetujui / Ditolak' },
  'bba.filter-cari':      { page: '/buku-besar-aset', label: 'kolom Cari uraian/kode/no. usulan' },
  'bba.row-realisasi':    { page: '/buku-besar-aset', label: 'ikon Set realisasi di baris', desc: 'Ikon Set realisasi dipakai mengisi realisasi (nilai + unit terpakai) saat aset benar-benar dibeli — status menyesuaikan otomatis.' },
  'bba.realisasi-simpan': { page: '/buku-besar-aset', label: 'tombol Simpan Realisasi' },

  // ── /kinerja (F4e — tur kinerja-keliling; sidebar selalu ada) ──────────────
  'kinerja.sidebar-tahun':     { page: '/kinerja', label: 'selektor Tahun di sidebar' },
  'kinerja.sidebar-master':    { page: '/kinerja', label: 'menu Master Rekening' },
  'kinerja.sidebar-rko':       { page: '/kinerja', label: 'menu RKO (SSK per sumber)' },
  'kinerja.sidebar-realisasi': { page: '/kinerja', label: 'menu Realisasi', desc: 'Menu Realisasi: Init dari SSK lalu isi realisasi bulanan — persen realisasi dihitung otomatis terhadap pagu.' },

  // ── /perjanjian-kinerja (F4 E — tur pk-keliling; ribbon nav selalu ada) ────
  'pk.nav-sasaran': { page: '/perjanjian-kinerja', label: 'menu Master Sasaran di ribbon' },
  'pk.nav-program': { page: '/perjanjian-kinerja', label: 'menu Master Program di ribbon' },
  'pk.nav-form':    { page: '/perjanjian-kinerja', label: 'menu Form PK di ribbon' },
  'pk.nav-pejabat': { page: '/perjanjian-kinerja', label: 'menu Master Pejabat di ribbon' },
  'pk.nav-riwayat': { page: '/perjanjian-kinerja', label: 'menu Riwayat PK di ribbon' },

  // ── /lkjip (F4 E — tur lkjip-susun; adaptif list↔editor, skip-by-absence) ──
  'lkjip.list-buat':         { page: '/lkjip', label: 'tombol Buat E-LKJIP (daftar dokumen)' },
  'lkjip.editor-tree':       { page: '/lkjip', label: 'panel Kerangka (outline bab) di editor' },
  'lkjip.editor-tambah-bab': { page: '/lkjip', label: 'tombol Tambah Bab di editor' },
  'lkjip.editor-blok':       { page: '/lkjip', label: 'panel isi bab terpilih di editor' },
  'lkjip.editor-addblock':   { page: '/lkjip', label: 'tombol tambah blok (Narasi/Tabel/Gambar/Grafik)', desc: 'Tombol tambah blok menyisipkan isi ke bab terpilih: Narasi (teks kaya), Tabel, Gambar, atau Grafik.' },

  'pergeseran.buat':           { page: '/blud/pergeseran', label: 'tombol Buat Pergeseran' },
  'pergeseran.sinkron-dpa':    { page: '/blud/pergeseran', label: 'tombol Sinkronkan DPA' },
  'pergeseran.versi-dropdown': { page: '/blud/pergeseran', label: 'dropdown history pergeseran' },
  'pergeseran.sumber-dpa':     { page: '/blud/pergeseran', label: 'badge Sumber DPA' },
  'pergeseran.kolom-vol-p':    { page: '/blud/pergeseran', label: 'kolom Vol P (nilai sesudah)' },
  'pergeseran.kolom-harga-p':  { page: '/blud/pergeseran', label: 'kolom Harga P (nilai sesudah)' },
  'pergeseran.kolom-selisih':  { page: '/blud/pergeseran', label: 'kolom selisih pergeseran' },
  'pergeseran.simpan':         { page: '/blud/pergeseran', label: 'tombol Simpan pergeseran' },
}

/** Cari anchor by label untuk intent locate — substring sederhana atas kata kunci. */
export function findAnchorByLabel(query: string, pathname: string): { id: string; anchor: RimaAnchor } | null {
  const q = query.toLowerCase()
  const words = q.split(/\s+/).filter(w => w.length >= 3)
  let best: { id: string; anchor: RimaAnchor; score: number } | null = null
  for (const [id, anchor] of Object.entries(RIMA_ANCHORS)) {
    const label = anchor.label.toLowerCase()
    let score = words.filter(w => label.includes(w)).length
    if (score === 0) continue
    if (pathname.startsWith(anchor.page)) score += 2 // prioritas halaman aktif
    if (!best || score > best.score) best = { id, anchor, score }
  }
  return best ? { id: best.id, anchor: best.anchor } : null
}
