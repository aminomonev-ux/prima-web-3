import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, withTransaction } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  KUNCI_SAKELAR, KUNCI_PESAN, KUNCI_SAMPAI, kunciPesan, kunciSampai, LABEL_SAKELAR, RE_SAMPAI,
  KEADAAN_SAKELAR, infoSakelar, SEBAB_TAK_BISA_BEKU,
} from '@/lib/registry/apps';

// Fase B (Tahap 2): DITURUNKAN dari `lib/registry/apps.ts`, tidak lagi diketik.
//
// Daftar tangan di sini pernah melahirkan kegagalan senyap dua arah. T1b: kunci
// `app_status_lkjip` tidak pernah ditambahkan padahal kartunya menyusun nama kunci
// dari id-nya sendiri, jadi sakelar LKJIP tak pernah bisa dinyalakan — bukan bocor,
// mati total. T-5: sebaliknya, `app_status_blud_realisasi` ADA di sini tapi tidak di
// daftar label, jadi ia berlaku penuh tanpa punya tombol. Dua daftar yang menjawab
// pertanyaan yang sama tidak pernah bertahan sama.
const APP_KEYS = [...KUNCI_SAKELAR];

// P6 — pesan & tenggat pemeliharaan. Kunci turunan, dibaca di GET yang sama supaya
// /menu dan /maintenance tidak perlu menembak endpoint kedua.
const KEYS_TEKS = [...KUNCI_PESAN, ...KUNCI_SAMPAI];

export const PESAN_MAKS = 300;

// Tenggat ditulis sebagai teks `YYYY-MM-DD` atau `YYYY-MM-DDTHH:mm` — sengaja BUKAN
// kolom DATETIME. `app_config.value` itu TEXT dan nilainya cuma ditampilkan, tidak
// pernah dibandingkan di SQL; menyimpannya sebagai tanggal sungguhan berarti tabel
// kunci/nilai ini mulai punya skema per-kunci, dan itu tabel yang lain.
//
// Polanya dipinjam dari registry, bukan disalin: yang menerima dan yang menampilkan
// (`formatSampai`) harus setuju soal bentuk yang sah, kalau tidak nilai yang lolos
// tersimpan lalu tidak pernah tampil (L78).

const BodySchema = z.object({
  key: z.string().refine((k) => APP_KEYS.includes(k), 'Key tidak valid.'),
  // P5 — keadaan ketiga `readonly`. Daftarnya DIAMBIL dari registry, tidak diketik
  // ulang: dua daftar yang menjawab pertanyaan yang sama tidak pernah bertahan sama
  // (pelajaran yang sudah dua kali dibayar di berkas ini sendiri, lihat catatan
  // APP_KEYS di atas).
  value: z.enum(KEADAAN_SAKELAR).optional(),
  pesan: z.string().max(PESAN_MAKS).optional(),
  sampai: z.string().refine((s) => s === '' || RE_SAMPAI.test(s), 'Format tanggal tidak dikenal.').optional(),
}).refine(
  (b) => b.value !== undefined || b.pesan !== undefined || b.sampai !== undefined,
  'Tidak ada yang diubah.',
);

export async function GET() {
  // R1/L61: GET sengaja boleh dibaca SEMUA user terautentikasi — payload hanya
  // flag operasional online/maintenance (non-sensitif) yang memang dibutuhkan
  // RIMA (kill-switch G6 + kesadaran maintenance modul G18) dan semua user untuk
  // menghormati mode pemeliharaan. Mutasi (POST) tetap khusus SUPER_ADMIN.
  // Output dibatasi whitelist APP_KEYS — tidak ada data lain yang bocor.
  //
  // Pesan & tenggat ikut di sini dengan alasan yang sama: keduanya memang DITULIS
  // untuk dibaca pemakai biasa (kartu /menu, halaman /maintenance). Yang tidak boleh
  // ikut adalah siapa yang menulisnya — itu ada di jejak audit, bukan di sini.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  try {
    const rows = await sql`SELECT \`key\`, value FROM app_config WHERE \`key\` IN (${[...APP_KEYS, ...KEYS_TEKS]})`;
    const semua: Record<string, string> = {};
    for (const r of rows as { key: string; value: string }[]) semua[r.key] = r.value;

    const map: Record<string, string> = {};
    const pesan: Record<string, string> = {};
    const sampai: Record<string, string> = {};
    for (const k of APP_KEYS) {
      map[k] = semua[k] || 'online';
      const p = semua[kunciPesan(k)];
      const s = semua[kunciSampai(k)];
      if (p) pesan[k] = p;
      if (s) sampai[k] = s;
    }
    return NextResponse.json({ ok: true, data: map, pesan, sampai });
  } catch (error) {
    console.error('[AppStatus GET Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message ?? 'Data tidak valid.' },
        { status: 400 },
      );
    }
    const { key, value, pesan, sampai } = parsed.data;

    // P5 — pagar di API, bukan cuma tombol yang disembunyikan di layar (L82). Layar
    // Sakelar memang tidak menawarkan BEKU untuk sakelar baca, tapi endpoint ini bisa
    // dipanggil langsung — dan sakelar yang tersimpan `readonly` padahal tidak menjaga
    // jalur tulis apa pun menghasilkan lencana BEKU yang berbohong.
    if (value === 'readonly' && !infoSakelar(key)?.bisaBeku) {
      return NextResponse.json({ ok: false, message: SEBAB_TAK_BISA_BEKU }, { status: 400 });
    }

    // Tiga baris `app_config` untuk satu perubahan yang dimaksudkan sebagai satu hal:
    // menyalakan sakelar sambil membiarkan pesan lama tertinggal akan membuat kartu
    // modul yang sudah hidup tetap menyandang kalimat pemeliharaan. Semuanya atau
    // tidak sama sekali (CQ-01).
    const jejak: string[] = [];
    await withTransaction(async ({ tx }) => {
      if (value !== undefined) {
        await tx`INSERT INTO app_config (\`key\`, value) VALUES (${key}, ${value}) ON DUPLICATE KEY UPDATE value = ${value}`;
        jejak.push(`${key} = ${value}`);
      }
      if (pesan !== undefined) {
        const kp = kunciPesan(key);
        const isi = pesan.trim();
        await tx`INSERT INTO app_config (\`key\`, value) VALUES (${kp}, ${isi}) ON DUPLICATE KEY UPDATE value = ${isi}`;
        jejak.push(isi ? `${kp} diisi (${isi.length} huruf)` : `${kp} dikosongkan`);
      }
      if (sampai !== undefined) {
        const ks = kunciSampai(key);
        await tx`INSERT INTO app_config (\`key\`, value) VALUES (${ks}, ${sampai}) ON DUPLICATE KEY UPDATE value = ${sampai}`;
        jejak.push(sampai ? `${ks} = ${sampai}` : `${ks} dikosongkan`);
      }
    });

    await writeAuditLog({
      req, eventType: 'CONFIG_UPDATE', userId: session.userId, username: session.username,
      detail: `${LABEL_SAKELAR[key] ?? key}: ${jejak.join('; ')}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[AppStatus POST Error]', error);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
