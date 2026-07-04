// lib/sentinel/nlu/normalize.mjs — normalisasi teks NLU RIMA (F2, CONCEPT §9e).
// SATU sumber untuk runtime browser (TS via normalize.d.mts), scripts/rima-train.mjs,
// dan scripts/rima-nlu-test.mjs — train & runtime WAJIB normalisasi identik,
// karena itu file ini .mjs polos tanpa dependensi.

// A2 — kamus sinonim/bahasa sehari-hari → bentuk kanonik. Nilai boleh 2 kata
// (di-split ulang setelah mapping). Surface form di kiri, kanonik di kanan.
export const SYNONYMS = {
  gimana: 'bagaimana', gmn: 'bagaimana', gmana: 'bagaimana', bgmn: 'bagaimana',
  gak: 'tidak', ga: 'tidak', g: 'tidak', nggak: 'tidak', ngga: 'tidak',
  engga: 'tidak', enggak: 'tidak', tdk: 'tidak', kagak: 'tidak', tak: 'tidak',
  gabisa: 'tidak bisa', gakbisa: 'tidak bisa', gbs: 'tidak bisa', gamau: 'tidak ingin',
  yg: 'yang', dgn: 'dengan', dg: 'dengan', utk: 'untuk', dr: 'dari',
  krn: 'karena', karna: 'karena', kalo: 'kalau', klo: 'kalau', klu: 'kalau',
  udah: 'sudah', udh: 'sudah', dah: 'sudah', blm: 'belum', blum: 'belum',
  bs: 'bisa', jg: 'juga', sm: 'sama', dmn: 'mana', dimana: 'mana', dmana: 'mana',
  knp: 'kenapa', np: 'kenapa', kok: 'kenapa', ngapain: 'kenapa',
  hrs: 'harus', kudu: 'harus', msti: 'harus', mesti: 'harus',
  sy: 'saya', aku: 'saya', aq: 'saya', gue: 'saya', gw: 'saya', ku: 'saya',
  lu: 'kamu', lo: 'kamu', kau: 'kamu',
  duit: 'anggaran', uang: 'anggaran', dana: 'anggaran',
  ilang: 'hilang', bikin: 'buat', bkin: 'buat',
  pengen: 'ingin', pgn: 'ingin', pingin: 'ingin', kepengen: 'ingin', mau: 'ingin',
  nambah: 'tambah', nambahin: 'tambah', ngedit: 'edit', ngisi: 'isi',
  nyimpen: 'simpan', nyimpan: 'simpan', simpen: 'simpan', simpenin: 'simpan',
  ngehapus: 'hapus', hapusin: 'hapus', delete: 'hapus', buang: 'hapus',
  benerin: 'perbaiki', betulin: 'perbaiki', benerinnya: 'perbaiki',
  ngeliat: 'lihat', liat: 'lihat', ngecek: 'cek', ngeprint: 'cetak', print: 'cetak',
  download: 'unduh', didownload: 'unduh', upload: 'unggah', diupload: 'unggah',
  ekspor: 'export', impor: 'import',
  brp: 'berapa', brapa: 'berapa', trs: 'terus', trus: 'terus', abis: 'habis',
  jgn: 'jangan', pencet: 'klik', tekan: 'klik', button: 'tombol',
  apk: 'aplikasi', app: 'aplikasi', web: 'aplikasi', website: 'aplikasi',
  hp: 'ponsel', handphone: 'ponsel', henpon: 'ponsel',
  pswd: 'password', pass: 'password', sandi: 'password', katasandi: 'password',
  eror: 'error', err: 'error', galat: 'error',
  lemot: 'lambat', lelet: 'lambat', ngelag: 'lambat', lag: 'lambat',
  gede: 'besar', org: 'orang', sebelom: 'sebelum', sblm: 'sebelum',
  ssdh: 'sesudah', stlh: 'setelah', dll: 'lainnya', dsb: 'lainnya',
  bukak: 'buka', ngebuka: 'buka', muncul: 'tampil', keluar: 'tampil',
  ketik: 'isi', input: 'isi', diinput: 'isi', diisi: 'isi',
  tampilkan: 'tampil', tampilin: 'tampil', tampilken: 'tampil', nampilin: 'tampil', munculin: 'tampil',
  rincian: 'detail', perincian: 'detail', rinci: 'detail', detil: 'detail', rekapan: 'rekap',
  keseluruhan: 'semua', semuanya: 'semua', sluruh: 'semua', seluruhnya: 'semua',
  piye: 'bagaimana', pripun: 'bagaimana', kepripun: 'bagaimana',
  // A2-Jawa/slang (basis user Semarang) — hanya function-word non-diskriminatif
  // + content-word yang memetakan ke kanonik yang sudah dipakai (aman, konsolidasi).
  gmna: 'bagaimana', kepiye: 'bagaimana', pie: 'bagaimana',
  ora: 'tidak', mboten: 'tidak', ndak: 'tidak', kgk: 'tidak', emoh: 'tidak ingin', ogah: 'tidak ingin',
  iso: 'bisa', biso: 'bisa',
  wis: 'sudah', wes: 'sudah', uwis: 'sudah', sampun: 'sudah',
  durung: 'belum', dereng: 'belum',
  piro: 'berapa', pinten: 'berapa',
  ndi: 'mana', endi: 'mana', ngendi: 'mana',
  ngopo: 'kenapa', kenopo: 'kenapa', knpa: 'kenapa', knapa: 'kenapa', napa: 'kenapa',
  kowe: 'kamu', koe: 'kamu', situ: 'kamu', ente: 'kamu', antum: 'kamu',
  gawe: 'buat', nggawe: 'buat', ndamel: 'buat',
  delok: 'lihat', ndelok: 'lihat', tengok: 'lihat',
  pw: 'password', save: 'simpan', disave: 'simpan',
  // A2-Jawa krama + typo lanjutan (Wave 5) — surface → kanonik existing.
  kulo: 'saya', kula: 'saya', gua: 'saya', gwe: 'saya', daku: 'saya',
  panjenengan: 'kamu', sampeyan: 'kamu', dirimu: 'kamu',
  saged: 'bisa', isa: 'bisa',
  kedah: 'harus',
  arep: 'ingin', badhe: 'ingin', kepingin: 'ingin',
  pundi: 'mana',
  sepiro: 'berapa', pira: 'berapa',
  kepriben: 'bagaimana', kepriye: 'bagaimana',
  kenpa: 'kenapa', kenangapa: 'kenapa',
  belom: 'belum', urung: 'belum',
  damel: 'buat', ningali: 'lihat', disimpen: 'simpan',
  donlot: 'unduh', donload: 'unduh', nyetak: 'cetak', diprint: 'cetak',
  carane: 'cara', lemod: 'lambat', lola: 'lambat',
  // A2-Wave 6 (data-aware) — surface → kanonik existing; fokus kata pertanyaan-data
  // (jumlah/total/tahun/status/persetujuan) supaya detectRimaDataQuery ikut mengenal.
  jml: 'jumlah', jmlh: 'jumlah', jumlahe: 'jumlah',
  ttl: 'total', totale: 'total',
  thn: 'tahun', taun: 'tahun', taon: 'tahun', tahon: 'tahun',
  skrg: 'sekarang', skrng: 'sekarang', saiki: 'sekarang',
  kemaren: 'kemarin', kmrn: 'kemarin', wingi: 'kemarin',
  iki: 'ini', niki: 'ini',
  sts: 'status', setatus: 'status', statuse: 'status',
  acc: 'disetujui', diacc: 'disetujui', approve: 'disetujui', approved: 'disetujui',
  diapprove: 'disetujui', disetujuin: 'disetujui',
  reject: 'ditolak', direject: 'ditolak', ditolakin: 'ditolak',
  summary: 'ringkasan', rangkuman: 'ringkasan',
  berkas: 'dokumen', file: 'dokumen',
  gawean: 'tugas', gaweanku: 'tugas', pr: 'tugas', kerjoan: 'kerjaan',
  brpa: 'berapa', berpa: 'berapa', berapaan: 'berapa',
  duite: 'anggaran', anggarane: 'anggaran',
}

// Partikel/penghalus yang dibuang — JANGAN buang kata bermakna intent
export const STOPWORDS = new Set([
  'yang', 'di', 'ke', 'dan', 'itu', 'ini', 'sih', 'dong', 'deh', 'nih',
  'lah', 'kah', 'ya', 'yah', 'aja', 'saja', 'kan', 'banget', 'bgt', 'amat',
  'kak', 'pak', 'bu', 'mas', 'mbak', 'tolong', 'mohon', 'deh', 'tuh', 'kek',
])

// Stemming imbuhan ringan (port aturan Sastrawi sederhana, CONCEPT A3).
// Restorasi luluh umum: meny→s (menyimpan→simpan), men+vokal→t (menulis→tulis),
// mem+vokal→p (memilih→pilih). Sisanya strip polos — over-stem kecil ditoleransi.
const PREFIXES = ['meng', 'meny', 'men', 'mem', 'me', 'peng', 'peny', 'pen', 'pem', 'ber', 'ter', 'di', 'se']
const SUFFIXES = ['kan', 'nya', 'in', 'i']
const VOWELS = 'aiueo'

export function stem(word) {
  let s = word
  if (s.length > 5) {
    for (const p of PREFIXES) {
      if (s.startsWith(p) && s.length - p.length >= 3) {
        let rest = s.slice(p.length)
        if ((p === 'meny' || p === 'peny') && VOWELS.includes(rest[0])) rest = 's' + rest
        else if ((p === 'men' || p === 'pen') && VOWELS.includes(rest[0])) rest = 't' + rest
        else if ((p === 'mem' || p === 'pem') && VOWELS.includes(rest[0])) rest = 'p' + rest
        s = rest
        break
      }
    }
  }
  if (s.length > 5) {
    for (const suf of SUFFIXES) {
      if (s.endsWith(suf) && s.length - suf.length >= 3) {
        s = s.slice(0, s.length - suf.length)
        break
      }
    }
  }
  return s
}

/** Lowercase + buang tanda baca/emoji → spasi tunggal. Belum sinonim/stem. */
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9é\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pipeline penuh: normalize → sinonim (A2) → stopword → stem (A3) → token[] */
export function tokenize(text) {
  const out = []
  for (const raw of normalize(text).split(' ')) {
    if (!raw) continue
    const mapped = SYNONYMS[raw] ?? raw
    for (const w of mapped.split(' ')) {
      if (STOPWORDS.has(w)) continue
      const st = stem(w)
      if (st) out.push(st)
    }
  }
  return out
}

/** Levenshtein dgn early-exit (A1 toleransi typo) — maxDist kecil saja. */
export function levenshtein(a, b, maxDist = 2) {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1
  const m = a.length, n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > maxDist) return maxDist + 1
    prev = cur
  }
  return prev[n]
}
