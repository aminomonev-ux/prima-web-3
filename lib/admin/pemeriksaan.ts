// lib/admin/pemeriksaan.ts — P10 Pemeriksaan Mandiri.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P10 (Tahap 4).
//
// Tujuh pertanyaan yang hari ini hanya bisa dijawab dengan SQL manual — jadi tidak
// pernah ditanyakan sampai ada yang salah. Layarnya MELAPORKAN, tidak membereskan:
// memperbaiki wewenang secara otomatis adalah cara tercepat membuat orang kehilangan
// akses tanpa ada yang tahu kenapa.
//
// Nol tabel, nol kolom, nol migrasi.
//
// Bagian yang berupa ATURAN dipisah dari bagian yang MEMBACA DB — bukan demi kerapian,
// tapi supaya bisa diuji sungguhan. Selama "grant ini mubazir atau tidak" hidup di
// dalam kueri, satu-satunya yang bisa diperiksa uji regresi adalah teks SQL-nya.

import { sql, sqlInt } from '@/lib/data/db';
import { getRoleQuota, ROLE_LABELS } from '@/lib/constants';
import { KUNCI_SAKELAR, LABEL_SAKELAR, SAKELAR_TANPA_PENJAGA, modul } from '@/lib/registry/apps';
import { MENU_APP_KEYS, semuaKeyMenu } from '@/lib/registry/menu-apps';

// Kedua ambang hari di bawah masuk SQL lewat `sqlInt`, bukan placeholder biasa: mysql2
// menolak sebagian posisi angka di prepared statement (L66 — ketahuan saat live pada
// `LIMIT ?`, lolos tsc). Keduanya konstanta modul, tidak pernah datang dari permintaan.

/** Berapa hari tanpa login sebelum sebuah akun dianggap menganggur. */
export const HARI_MENGANGGUR = 90;
/** Berapa lama sakelar boleh mati sebelum dicurigai lupa dinyalakan balik. */
export const HARI_SAKELAR_LAMA = 7;
/** Kuota terpakai di atas ini dianggap "hampir penuh". */
export const AMBANG_KUOTA = 0.8;
/** Kunci induk sebaiknya sedikit. Angkanya sendiri kebijakan, bukan pagar. */
export const BATAS_SUPER_ADMIN = 2;
/** Contoh yang ikut dikirim ke layar per temuan. Sisanya cukup dihitung. */
export const MAKS_CONTOH = 12;

export type Keparahan = 'merah' | 'kuning' | 'aman';

export type Temuan = {
  id: string;
  judul: string;
  jumlah: number;
  keparahan: Keparahan;
  /** Satu kalimat: kenapa ini perlu dilihat. Selalu terisi, termasuk saat jumlahnya nol. */
  ringkas: string;
  /** Ke mana orang harus pergi untuk membereskannya. */
  tindakan: string;
  contoh: string[];
};

// ─── Aturan (murni, tanpa DB) ────────────────────────────────────────────────

export type BarisKuota = { role: string; jumlah: number };

/**
 * Peran yang pemakaiannya sudah ≥80% kuota. Peran tanpa kuota (`getRoleQuota` null)
 * dilewati — bukan "aman", memang tidak punya batas.
 */
export function kuotaHampirPenuh(baris: readonly BarisKuota[]): { role: string; jumlah: number; kuota: number }[] {
  const out: { role: string; jumlah: number; kuota: number }[] = [];
  for (const b of baris) {
    const kuota = getRoleQuota(b.role);
    if (kuota === null || kuota <= 0) continue;
    if (b.jumlah / kuota >= AMBANG_KUOTA) out.push({ role: b.role, jumlah: b.jumlah, kuota });
  }
  return out.sort((a, z) => z.jumlah / z.kuota - a.jumlah / a.kuota);
}

export type BarisGrant = { username: string; role: string; appAccess: unknown };

/**
 * Grant yang tidak menambah apa pun karena perannya sudah membuka modul itu.
 * Mencabutnya nol risiko — dan membiarkannya adalah sumber kebingungan T-6: dua
 * penjelasan untuk satu pintu, jadi mencabut yang salah satu terasa tidak berpengaruh.
 *
 * Kunci yang TIDAK dikenal registry ikut dilaporkan, tapi sebagai hal yang berbeda:
 * ia bukan mubazir, ia tidak berarti apa-apa (`bolehMasukModul` menjawab `false`).
 */
export function grantMubazir(baris: readonly BarisGrant[]): { username: string; kunci: string; sebab: string }[] {
  const out: { username: string; kunci: string; sebab: string }[] = [];
  for (const b of baris) {
    if (!Array.isArray(b.appAccess)) continue;
    for (const k of b.appAccess as unknown[]) {
      if (typeof k !== 'string') continue;
      const m = modul(k);
      if (!m) { out.push({ username: b.username, kunci: k, sebab: 'kunci tidak dikenal' }); continue; }
      if (m.peranBawaan === 'SEMUA') {
        out.push({ username: b.username, kunci: k, sebab: `${m.label} terbuka untuk semua peran` });
      } else if (m.peranBawaan.includes(b.role)) {
        out.push({ username: b.username, kunci: k, sebab: `${ROLE_LABELS[b.role] ?? b.role} sudah dapat ${m.label} dari perannya` });
      }
    }
  }
  return out;
}

export type BarisIzinMenu = { appKey: string; menuKey: string; pemilik: string };

/**
 * Baris izin yang menunjuk menu yang sudah tidak ada — menu berganti nama atau dihapus,
 * barisnya tertinggal. Diam-diam tidak berbahaya, tapi ia membuat matriks izin bercerita
 * tentang layar yang tak bisa dibuka siapa pun.
 *
 * `app_key` yang bukan modul ber-menu ikut yatim: registry-lah yang tahu modul mana
 * punya izin per-menu, dan kalau modulnya berhenti punya, seluruh barisnya jadi sisa.
 */
export function izinMenuYatim(baris: readonly BarisIzinMenu[]): BarisIzinMenu[] {
  const sah = new Map<string, Set<string>>(
    MENU_APP_KEYS.map((a) => [a, new Set(semuaKeyMenu(a))]),
  );
  return baris.filter((b) => !sah.get(b.appKey)?.has(b.menuKey));
}

/** Potong daftar contoh, tapi katakan berapa yang tidak ikut — bukan diam-diam terpotong. */
export function contohkan(items: readonly string[]): string[] {
  if (items.length <= MAKS_CONTOH) return [...items];
  return [...items.slice(0, MAKS_CONTOH), `… dan ${items.length - MAKS_CONTOH} lagi`];
}

// ─── Pembacaan DB ────────────────────────────────────────────────────────────

function nomor(v: unknown): number {
  return Number(v ?? 0);
}

export async function jalankanPemeriksaan(): Promise<Temuan[]> {
  const [peran, nganggur, grant, izinPeran, izinOrang, sakelarLama, sa] = await Promise.all([
    sql`
      SELECT role, COUNT(*) AS n FROM users
      WHERE status = 'AKTIF' AND deleted_at IS NULL GROUP BY role
    ` as PromiseLike<{ role: string; n: number | string }[]>,
    sql`
      SELECT username, last_login FROM users
      WHERE status = 'AKTIF' AND deleted_at IS NULL
        AND (last_login IS NULL OR last_login < NOW() - INTERVAL ${sqlInt(HARI_MENGANGGUR)} DAY)
      ORDER BY last_login IS NOT NULL, last_login ASC
    ` as PromiseLike<{ username: string; last_login: Date | null }[]>,
    sql`
      SELECT username, role, app_access FROM users
      WHERE status = 'AKTIF' AND deleted_at IS NULL AND app_access IS NOT NULL
    ` as PromiseLike<{ username: string; role: string; app_access: unknown }[]>,
    sql`SELECT app_key, menu_key, role FROM menu_role_access` as PromiseLike<{ app_key: string; menu_key: string; role: string }[]>,
    sql`
      SELECT m.app_key, m.menu_key, u.username FROM menu_user_access m
      LEFT JOIN users u ON u.id = m.user_id
    ` as PromiseLike<{ app_key: string; menu_key: string; username: string | null }[]>,
    sql`
      SELECT \`key\`, updated_at FROM app_config
      WHERE \`key\` IN (${[...KUNCI_SAKELAR]}) AND value <> 'online'
        AND updated_at < NOW() - INTERVAL ${sqlInt(HARI_SAKELAR_LAMA)} DAY
    ` as PromiseLike<{ key: string; updated_at: Date | null }[]>,
    sql`
      SELECT username FROM users
      WHERE role = 'SUPER_ADMIN' AND status = 'AKTIF' AND deleted_at IS NULL ORDER BY username
    ` as PromiseLike<{ username: string }[]>,
  ]);

  const kuota = kuotaHampirPenuh(peran.map((p) => ({ role: p.role, jumlah: nomor(p.n) })));
  const mubazir = grantMubazir(grant.map((g) => ({ username: g.username, role: g.role, appAccess: g.app_access })));
  const yatim = izinMenuYatim([
    ...izinPeran.map((r) => ({ appKey: r.app_key, menuKey: r.menu_key, pemilik: `peran ${r.role}` })),
    ...izinOrang.map((r) => ({ appKey: r.app_key, menuKey: r.menu_key, pemilik: r.username ?? 'akun terhapus' })),
  ]);

  return [
    {
      id: 'kuota',
      judul: 'Kuota peran hampir penuh',
      jumlah: kuota.length,
      keparahan: kuota.some((k) => k.jumlah >= k.kuota) ? 'merah' : kuota.length ? 'kuning' : 'aman',
      ringkas: `Peran yang sudah memakai ${Math.round(AMBANG_KUOTA * 100)}% kuotanya atau lebih. Kuota penuh sebaiknya diketahui sebelum ada yang perlu membuat akun, bukan saat sedang buru-buru.`,
      tindakan: 'Nonaktifkan akun yang sudah tidak dipakai di tab Pengguna, atau naikkan kuotanya di lib/constants.ts.',
      contoh: contohkan(kuota.map((k) => `${ROLE_LABELS[k.role] ?? k.role} — ${k.jumlah}/${k.kuota}`)),
    },
    {
      id: 'nganggur',
      judul: 'Akun aktif yang menganggur',
      jumlah: nganggur.length,
      keparahan: nganggur.length ? 'kuning' : 'aman',
      ringkas: `Akun berstatus AKTIF yang belum pernah login, atau tidak login lebih dari ${HARI_MENGANGGUR} hari. Akun hidup tanpa pemakai adalah pintu yang tidak dijaga siapa pun.`,
      tindakan: 'Tanyakan pemiliknya; kalau memang sudah tidak dipakai, nonaktifkan di tab Pengguna.',
      contoh: contohkan(nganggur.map((u) => `${u.username} — ${u.last_login ? `terakhir ${new Date(u.last_login).toLocaleDateString('id-ID')}` : 'belum pernah login'}`)),
    },
    {
      id: 'mubazir',
      judul: 'Pemberian akses yang tidak menambah apa-apa',
      jumlah: mubazir.length,
      keparahan: mubazir.length ? 'kuning' : 'aman',
      ringkas: 'Modul yang sudah terbuka oleh perannya, tapi tetap diberikan lagi lewat Atur Akses. Mencabutnya nol risiko — dan membiarkannya membuat satu pintu punya dua penjelasan.',
      tindakan: 'Buang centangnya di tab Pengguna → Atur Akses Aplikasi.',
      contoh: contohkan(mubazir.map((m) => `${m.username} · ${m.kunci} (${m.sebab})`)),
    },
    {
      id: 'yatim',
      judul: 'Baris izin menu yatim',
      jumlah: yatim.length,
      keparahan: yatim.length ? 'kuning' : 'aman',
      ringkas: 'Baris izin yang menunjuk menu yang sudah tidak ada — menu berganti nama atau dihapus, barisnya tertinggal. Matriksnya jadi bercerita tentang layar yang tak bisa dibuka siapa pun.',
      tindakan: 'Buka tab Akses Menu dan simpan ulang modul yang bersangkutan; penyimpanan menulis ulang seluruh barisnya.',
      contoh: contohkan(yatim.map((y) => `${y.appKey} · ${y.menuKey} (${y.pemilik})`)),
    },
    {
      id: 'sakelar-lama',
      judul: 'Sakelar mati lebih dari seminggu',
      jumlah: sakelarLama.length,
      keparahan: sakelarLama.length ? 'kuning' : 'aman',
      ringkas: `Modul yang sudah dimatikan lebih dari ${HARI_SAKELAR_LAMA} hari. Kemungkinan besar lupa dinyalakan kembali — dan yang memakainya sudah berhenti bertanya.`,
      tindakan: 'Periksa di tab Sakelar. Kalau memang masih dipelihara, isi keterangannya supaya orang berhenti menebak.',
      contoh: contohkan(sakelarLama.map((s) => `${LABEL_SAKELAR[s.key] ?? s.key} — sejak ${s.updated_at ? new Date(s.updated_at).toLocaleDateString('id-ID') : 'entah kapan'}`)),
    },
    {
      id: 'tanpa-penjaga',
      judul: 'Sakelar yang tidak menutup apa pun',
      jumlah: SAKELAR_TANPA_PENJAGA.length,
      keparahan: SAKELAR_TANPA_PENJAGA.length ? 'merah' : 'aman',
      // Gate G dibawa ke layar. Kalau ada yang lolos CI — mis. sakelar yang penjaganya
      // hidup di peramban, yang memang tidak bisa dilihat pemindai route — ia tetap
      // kelihatan orang. Ini persis bentuk T-1.
      ringkas: 'Sakelar yang tombolnya ada tapi tidak ada berkas server yang membacanya. Mematikannya hanya menyembunyikan layar; jalur datanya tetap terbuka.',
      tindakan: 'Pasang penjaganya di route modul yang bersangkutan, lalu daftarkan di lib/registry/apps.ts.',
      contoh: SAKELAR_TANPA_PENJAGA.map((s) => `${s.label} — ${s.sebab}`),
    },
    {
      id: 'super-admin',
      judul: 'Jumlah SUPER_ADMIN aktif',
      jumlah: sa.length,
      keparahan: sa.length > BATAS_SUPER_ADMIN ? 'kuning' : 'aman',
      ringkas: `Kunci induk sebaiknya sedikit. Lebih dari ${BATAS_SUPER_ADMIN} bukan pelanggaran, tapi angkanya harus terlihat, bukan ditemukan saat menelusuri jejak audit.`,
      tindakan: 'Kalau ada yang sebenarnya cukup jadi Admin Staff, turunkan perannya di tab Pengguna.',
      contoh: contohkan(sa.map((u) => u.username)),
    },
  ];
}
