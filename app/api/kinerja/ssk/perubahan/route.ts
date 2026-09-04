// app/api/kinerja/ssk/perubahan/route.ts
// Refactor Versi E-Anggaran — Checkpoint B Task #16.
// Buat versi PERUBAHAN baru dari versi aktif (auto-copy + lock previous).
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// POST body: { tahun, sumber, from_versi_tipe, from_versi_seq }
// Response: { ok: true, new_versi_seq: number, copied: number }
//
// Pattern:
//   - getSession + isKinerjaRole + Zod
//   - withTransaction + bulkInsert (audit anti-pattern: no for-await INSERT)
//   - writeAuditLog KINERJA_VERSI_CREATED
//
// A6: SELURUH pembacaan yang menentukan hasil ada DI DALAM transaksi, dan kunci
// (tahun, sumber) diambil sebagai perintah pertama. Dulu `MAX(versi_seq)` dan
// baris sumbernya dibaca dengan `sql` biasa SEBELUM transaksi dibuka, lalu
// transaksinya mengunci versi sumber dan menyalin baris yang sudah dibaca tadi —
// jadi simpanan yang mendarat di sela itu ikut terkunci tapi TIDAK ikut tersalin,
// dan versi yang katanya "dicopy dari MURNI-0" berbeda dari MURNI-0 yang sudah
// tidak bisa dibetulkan lagi. Rinciannya: docs/AUDIT-kinerja-2026-09-04.md §A6

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/security/auth';
import { bulkInsert, withTransaction } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, TahunSchema, SumberSchema, VersiTipeSchema, VersiSeqSchema } from '@/lib/data/kinerja-schemas';
import { kunciVersiSsk, KinerjaVersiSumberKosongError, KinerjaVersiBentrokError } from '@/lib/data/kinerja';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

const BodySchema = z.object({
  tahun:           TahunSchema,
  sumber:          SumberSchema,
  from_versi_tipe: VersiTipeSchema,
  from_versi_seq:  VersiSeqSchema,
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  // SDL-M14: versi creation = low cadence, 10/menit.
  const limited = await kinerjaRateLimit(session.userId, 'versi-create', 10); if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { tahun, sumber, from_versi_tipe, from_versi_seq } = parsed.data;

  // ─── Semuanya di bawah SATU kunci: nomor versi, baris sumber, tulis ───────
  let newVersiSeq = 0;
  let copied = 0;
  try {
    await withTransaction(async ({ tx, conn }) => {
      // L84: kunci lingkup (tahun, sumber) sebagai perintah PERTAMA — snapshot
      // baca-konsisten lahir di SELECT biasa yang pertama, jadi mengambilnya
      // sesudah `MAX(versi_seq)` cuma menjaga angka yang sudah basi.
      await kunciVersiSsk(tx, tahun, sumber);

      const maxRows = await tx`
        SELECT COALESCE(MAX(versi_seq), 0) AS max_seq
        FROM kinerja_ssk
        WHERE tahun = ${tahun} AND sumber = ${sumber} AND versi_tipe = 'PERUBAHAN'
      ` as { max_seq: unknown }[];
      newVersiSeq = Number(maxRows[0]?.max_seq ?? 0) + 1;

      // FOR UPDATE pada baris SUMBERNYA, bukan cuma pada baris kunci: yang
      // mengubah isi versi sumber adalah `saveSskBatch` lewat DELETE + tulis
      // ulang, dan DELETE itu menunggu kunci baris ini. Tanpanya kedua jalur
      // memegang kunci `blud_locks` yang berbeda dan tidak saling menahan.
      // Urutannya seragam dengan `saveSskBatch` (blud_locks dulu, baris
      // kinerja_ssk sesudahnya), jadi tidak ada lingkaran tunggu.
      const sourceRows = await tx`
        SELECT id, canonical_id, uraian_ssk, uraian,
               COALESCE(program,'') AS program, COALESCE(kegiatan,'') AS kegiatan, COALESCE(subkegiatan,'') AS subkegiatan,
               pagu, months, months_pct, total, total_pct, urut, is_nullified
        FROM kinerja_ssk
        WHERE tahun = ${tahun} AND sumber = ${sumber}
          AND versi_tipe = ${from_versi_tipe} AND versi_seq = ${from_versi_seq}
        FOR UPDATE
      ` as Record<string, unknown>[];

      if (sourceRows.length === 0) throw new KinerjaVersiSumberKosongError(from_versi_tipe, from_versi_seq);
      copied = sourceRows.length;

      // 1) Kunci versi sumber (semua row dengan versi yg dipilih + tahun + sumber)
      await tx`
        UPDATE kinerja_ssk
        SET locked_at = NOW()
        WHERE tahun = ${tahun} AND sumber = ${sumber}
          AND versi_tipe = ${from_versi_tipe} AND versi_seq = ${from_versi_seq}
          AND locked_at IS NULL
      `;

      // 2) Bulk insert row PERUBAHAN baru (copy data + set parent_versi_id ke id source)
      const values = sourceRows.map(r => [
        tahun,
        sumber,
        'PERUBAHAN',          // versi_tipe
        newVersiSeq,          // versi_seq
        String(r.canonical_id ?? ''),
        Number(r.id),         // parent_versi_id → row source langsung
        // locked_at = NULL (versi baru editable)
        Number(r.is_nullified ?? 0) ? 1 : 0,
        String(r.uraian_ssk ?? ''),
        String(r.uraian ?? ''),
        String(r.program ?? ''),
        String(r.kegiatan ?? ''),
        String(r.subkegiatan ?? ''),
        Number(r.pagu ?? 0),
        typeof r.months === 'string' ? r.months : JSON.stringify(r.months ?? {}),
        typeof r.months_pct === 'string' ? r.months_pct : JSON.stringify(r.months_pct ?? {}),
        Number(r.total ?? 0),
        Number(r.total_pct ?? 0),
        Number(r.urut ?? 0),
        session.userId,
      ]);

      await bulkInsert(
        'kinerja_ssk',
        [
          'tahun','sumber','versi_tipe','versi_seq','canonical_id','parent_versi_id','is_nullified',
          'uraian_ssk','uraian','program','kegiatan','subkegiatan',
          'pagu','months','months_pct','total','total_pct','urut','updated_by',
        ],
        values,
        conn,
      );
    });
  } catch (e) {
    if (e instanceof KinerjaVersiSumberKosongError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 404 });
    }
    // `uq_ks_canonical_versi` (migration-022) yang membuat dua PERUBAHAN
    // ber-versi_seq sama mustahil lahir bersamaan. Kuncinya di atas sudah
    // membuat ini nyaris mustahil, tapi indeksnya tetap jaminan terakhirnya —
    // dan yang kalah pantas dijawab 409 dengan sebabnya, bukan 500 "Gagal
    // membuat versi baru" yang tidak memberi tahu apa pun.
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') {
      const bentrok = new KinerjaVersiBentrokError(newVersiSeq);
      return NextResponse.json({ ok: false, code: 'VERSI_BENTROK', message: bentrok.message }, { status: 409 });
    }
    throw e;
  }

  await writeAuditLog({
    req,
    eventType: 'KINERJA_VERSI_CREATED',
    userId:    session.userId,
    username:  session.username,
    detail:    `Buat PERUBAHAN-${newVersiSeq} ${sumber} ${tahun} dari ${from_versi_tipe}-${from_versi_seq}: ${copied} baris dicopy, versi source dikunci.`,
  });

  return NextResponse.json({
    ok: true,
    new_versi_tipe: 'PERUBAHAN',
    new_versi_seq:  newVersiSeq,
    copied,
  });
}
