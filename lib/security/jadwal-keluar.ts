// lib/security/jadwal-keluar.ts — "Pemeliharaan & keluar otomatis": aturan MURNI (aman-klien).
//
// SUPER_ADMIN mengirim pesan + jeda dari Admin Panel. Tiap tab PRIMA menampilkan hitung mundur,
// lalu begitu batasnya lewat server menolak sesi yang lahir sebelum batas (`getSession`) — jadi
// komputer yang tertidur atau putus jaringan tetap sampai di halaman login saat bangun. Login bisa
// ditahan sementara (hanya SUPER_ADMIN) supaya orang tidak masuk lagi di tengah build.
// Jadwalnya SATU baris `app_config` berisi JSON — nol migrasi.
// Konsep: docs/CONCEPT-pemeliharaan-keluar.md

export const KUNCI_JADWAL_KELUAR = 'pemeliharaan_jadwal';
export const PILIHAN_JEDA_MENIT = [1, 5, 10, 15] as const;
export const JEDA_BAWAAN_MENIT = 5;
/**
 * Login yang ditahan terbuka sendiri sekian jam sesudah batas — supaya tidak terkunci karena lupa.
 * Dipilih tiap kali mengirim (pemeliharaan kecil 30 menit, pindah server bisa berjam-jam). Batas 7 hari
 * hanya penangkap salah ketik (200 padahal 20); "Buka login sekarang" & login Super Admin tetap jalan.
 */
export const PILIHAN_TAHAN_JAM = [0.5, 1, 2, 4, 8] as const;
export const TAHAN_LOGIN_BAWAAN_JAM = 2;
export const TAHAN_LOGIN_MIN_JAM = 0.5;
export const TAHAN_LOGIN_MAKS_JAM = 168;

/** Lama tahan login dalam MENIT; `null` = di luar 30 menit–7 hari atau bukan angka. */
export function menitTahan(jam: number): number | null {
  if (!Number.isFinite(jam)) return null;
  const menit = Math.round(jam * 60);
  return menit >= TAHAN_LOGIN_MIN_JAM * 60 && menit <= TAHAN_LOGIN_MAKS_JAM * 60 ? menit : null;
}

export const PESAN_TAHAN_TIDAK_SAH = `Lama tahan login 30 menit sampai ${TAHAN_LOGIN_MAKS_JAM} jam (7 hari).`;

/** 0,5 → "30 menit" · 1 → "1 jam" · 1,5 → "1,5 jam" · 36 → "36 jam". */
export function labelTahan(jam: number): string {
  const menit = menitTahan(jam);
  if (menit === null) return '';
  if (menit < 60) return `${menit} menit`;
  return `${(menit / 60).toLocaleString('id-ID', { maximumFractionDigits: 2 })} jam`;
}
export const SELANG_TANYA_MS = 30_000;
export const PESAN_KELUAR_BAWAAN =
  'Simpan pekerjaan Anda sekarang. Aplikasi akan dikeluarkan untuk pemeliharaan; silakan masuk lagi sesudah pemeliharaan selesai.';

/**
 * Semua waktu = jam MySQL berbentuk 'YYYY-MM-DD HH:MM:SS', diambil dari `NOW()` — bukan jam
 * peramban atau jam Node — dan dibandingkan sebagai TEKS: bentuknya tetap, jadi urutan teks
 * = urutan waktu. `user_sessions.created_at` juga dari `NOW()`, jadi satu jam untuk semuanya.
 */
export interface JadwalKeluar {
  pesan:         string;
  dikirim:       string;
  batas:         string;
  oleh:          string;
  /** Sesi pengirim tidak ikut dikeluarkan — ia yang menjalankan build. */
  sesi_pengirim: string;
  tahan_login:   boolean;
  /** Login terbuka lagi pada jam ini: batas + 2 jam, atau saat dibuka manual. */
  login_dibuka:  string;
}

export interface SesiDinilai { id: string; dibuat: string; role: string }

const POLA_WAKTU = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * Isi `app_config` yang rusak/kosong = tidak ada jadwal. Arahnya disengaja: jadwal yang tidak
 * terbaca tidak boleh mengeluarkan seluruh kantor.
 */
export function bacaJadwal(nilai: string | null | undefined): JadwalKeluar | null {
  if (!nilai) return null;
  let o: Record<string, unknown>;
  try {
    const v = JSON.parse(nilai) as unknown;
    if (!v || typeof v !== 'object') return null;
    o = v as Record<string, unknown>;
  } catch { return null; }
  const waktu = (k: string) => (typeof o[k] === 'string' && POLA_WAKTU.test(o[k] as string) ? (o[k] as string) : null);
  const dikirim = waktu('dikirim'), batas = waktu('batas'), dibuka = waktu('login_dibuka');
  if (!dikirim || !batas || !dibuka || batas < dikirim) return null;
  return {
    pesan:         typeof o.pesan === 'string' ? o.pesan.slice(0, 500) : '',
    dikirim, batas,
    oleh:          typeof o.oleh === 'string' ? o.oleh : '',
    sesi_pengirim: typeof o.sesi_pengirim === 'string' ? o.sesi_pengirim : '',
    tahan_login:   o.tahan_login === true,
    login_dibuka:  dibuka,
  };
}

/** Detik dari `a` ke `b` (keduanya jam MySQL yang sama zonanya). */
export function detikAntara(a: string, b: string): number {
  const ms = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16), +s.slice(17, 19));
  return Math.round((ms(b) - ms(a)) / 1000);
}

/** Sesi yang tidak ikut dikeluarkan walau lahir sebelum batas. */
function sesiDikecualikan(j: JadwalKeluar, s: SesiDinilai): boolean {
  if (s.dibuat >= j.batas) return true;
  if (j.sesi_pengirim && s.id === j.sesi_pengirim) return true;
  // SUPER_ADMIN yang masuk SESUDAH pesan dikirim sudah tahu ada pemeliharaan — biasanya ia ikut build.
  return s.role === 'SUPER_ADMIN' && s.dibuat >= j.dikirim;
}

/** Penegak server (`getSession`): sesi ini ditolak karena pemeliharaan? */
export function sesiKenaKeluar(j: JadwalKeluar | null, s: SesiDinilai, sekarang: string): boolean {
  return !!j && sekarang >= j.batas && !sesiDikecualikan(j, s);
}

/** Login ditahan untuk selain SUPER_ADMIN — sejak pesan dikirim sampai dibuka. */
export function loginDitahan(j: JadwalKeluar | null, sekarang: string): boolean {
  return !!j && j.tahan_login && sekarang >= j.dikirim && sekarang < j.login_dibuka;
}

export const jamDari = (waktu: string) => waktu.slice(11, 16);

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * "pukul 10:30" kalau hari yang sama dengan `sekarang`, kalau tidak "Rabu, 5 Nov pukul 10:30" (+ tahun
 * bila beda tahun) — tahan login bisa sampai 7 hari, dan jam tanpa tanggal menyembunyikan salah ketik.
 */
export function kapanDari(waktu: string, sekarang: string): string {
  if (waktu.slice(0, 10) === sekarang.slice(0, 10)) return `pukul ${jamDari(waktu)}`;
  const t = +waktu.slice(0, 4), b = +waktu.slice(5, 7), h = +waktu.slice(8, 10);
  const hari = HARI[new Date(Date.UTC(t, b - 1, h)).getUTCDay()];
  const tahun = waktu.slice(0, 4) === sekarang.slice(0, 4) ? '' : ` ${t}`;
  return `${hari}, ${h} ${BULAN[b - 1]}${tahun} pukul ${jamDari(waktu)}`;
}

/** Jam MySQL + menit → jam MySQL (aritmetika kalender murni, tanpa zona). */
export function tambahMenit(waktu: string, menit: number): string {
  const ms = Date.UTC(+waktu.slice(0, 4), +waktu.slice(5, 7) - 1, +waktu.slice(8, 10), +waktu.slice(11, 13), +waktu.slice(14, 16), +waktu.slice(17, 19))
    + Math.round(menit * 60) * 1000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function kalimatLoginDitahan(j: JadwalKeluar, sekarang: string): string {
  return `PRIMA sedang dalam pemeliharaan. Login dibuka lagi paling lambat ${kapanDari(j.login_dibuka, sekarang)}.`;
}

export type StatusTab =
  | { aktif: false }
  | { aktif: true; pesan: string; sisa_detik: number; dikecualikan: boolean };

/** Jawaban untuk tab pengguna: hitung mundur berjalan selama batas belum lewat. */
export function statusUntukSesi(j: JadwalKeluar | null, s: SesiDinilai, sekarang: string): StatusTab {
  if (!j || sekarang >= j.batas) return { aktif: false };
  return { aktif: true, pesan: j.pesan, sisa_detik: Math.max(0, detikAntara(sekarang, j.batas)), dikecualikan: sesiDikecualikan(j, s) };
}

export type TahapJadwal = 'HITUNG_MUNDUR' | 'LOGIN_DITAHAN' | 'SELESAI';

export interface RingkasJadwal {
  pesan: string; oleh: string; dikirim: string; batas: string; tahan_login: boolean; login_dibuka: string;
  /** Jam MySQL saat ringkasan dibuat — panel menulis tanggal bila jamnya bukan hari ini. */
  sekarang: string;
  tahap: TahapJadwal;
  /** Detik menuju batas (HITUNG_MUNDUR) atau menuju login terbuka (LOGIN_DITAHAN). */
  sisa_detik: number;
}

export function ringkasJadwal(j: JadwalKeluar | null, sekarang: string): RingkasJadwal | null {
  if (!j) return null;
  const tahap: TahapJadwal = sekarang < j.batas ? 'HITUNG_MUNDUR' : loginDitahan(j, sekarang) ? 'LOGIN_DITAHAN' : 'SELESAI';
  const tujuan = tahap === 'HITUNG_MUNDUR' ? j.batas : tahap === 'LOGIN_DITAHAN' ? j.login_dibuka : sekarang;
  return {
    pesan: j.pesan, oleh: j.oleh, dikirim: j.dikirim, batas: j.batas, tahan_login: j.tahan_login, login_dibuka: j.login_dibuka,
    sekarang, tahap, sisa_detik: Math.max(0, detikAntara(sekarang, tujuan)),
  };
}

/** Jadwal baru menolak kalau masih ada hitung mundur yang berjalan — dua batas sekaligus membingungkan. */
export function alasanTolakKirim(lama: JadwalKeluar | null, sekarang: string): string | null {
  return lama && sekarang < lama.batas
    ? `Masih ada pemeliharaan berjalan (keluar pukul ${jamDari(lama.batas)}). Batalkan dulu kalau ingin mengubahnya.`
    : null;
}

export function alasanTolakBatal(j: JadwalKeluar | null, sekarang: string): string | null {
  if (!j) return 'Tidak ada pemeliharaan yang dijadwalkan.';
  return sekarang >= j.batas ? 'Waktunya sudah lewat dan sesi sudah dikeluarkan. Yang masih bisa dilakukan: buka login.' : null;
}

export function alasanTolakBukaLogin(j: JadwalKeluar | null, sekarang: string): string | null {
  return loginDitahan(j, sekarang) ? null : 'Login sedang tidak ditahan.';
}

/** Sisa waktu "04:59" untuk hitung mundur; ≥ 1 jam → "36:00:00" (tahan login bisa sampai 7 hari). */
export function formatSisa(detik: number): string {
  const d = Math.max(0, Math.floor(detik));
  const dua = (n: number) => String(n).padStart(2, '0');
  if (d >= 3600) return `${Math.floor(d / 3600)}:${dua(Math.floor((d % 3600) / 60))}:${dua(d % 60)}`;
  return `${dua(Math.floor(d / 60))}:${dua(d % 60)}`;
}
