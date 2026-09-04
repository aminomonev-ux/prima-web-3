import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { safeInt } from '@/lib/data/db';
import {
  updateMasterRow, deleteMasterRow,
  KinerjaMasterTidakAdaError, KinerjaMasterPunyaAnakError, KinerjaMasterNamaKembarError,
} from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, MasterUpdateBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

const DELETE_ONLY_ROLES = ['SUPER_ADMIN', 'ADMIN']; // hapus master hanya super/admin (lebih ketat dari KINERJA_ALLOWED_ROLES)

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'update-master', 30); if (limited) return limited;

  // C-BUG-2 (Tahap 12): safeInt guard untuk NaN. /api/.../abc → 400, bukan silent fail.
  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID master tidak valid' }, { status: 400 });

  // C-SEC-2 (Tahap 12): Zod validation untuk body
  const raw = await req.json().catch(() => null);
  const parsed = MasterUpdateBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { nama } = parsed.data;

  let hasil;
  try {
    hasil = await updateMasterRow(id, nama);
  } catch (e) {
    // T12: id yang tidak ada dulu tetap dijawab ok:true — pemanggil tidak pernah
    // tahu perubahannya tidak mendarat di baris mana pun.
    if (e instanceof KinerjaMasterTidakAdaError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 404 });
    }
    // A3: kaskadenya akan nyasar ke anak baris lain. Pesannya diteruskan apa
    // adanya — ia yang menjelaskan apa yang harus dibereskan dulu, bentuk yang
    // sama dengan KinerjaMasterPunyaAnakError di DELETE.
    if (e instanceof KinerjaMasterNamaKembarError) {
      return NextResponse.json({ ok: false, code: 'NAMA_KEMBAR', message: e.message }, { status: 400 });
    }
    throw e;
  }

  await writeAuditLog({
    req,
    eventType: 'KINERJA_SAVE_MASTER',
    userId:    session.userId,
    username:  session.username,
    // A3: nama LAMA ikut dicatat, dan berapa anak yang ikut dipindah. Tanpa nama
    // lamanya, jejaknya tidak bisa dibaca ulang — "id=42 jadi X" tidak memberi
    // tahu X itu tadinya apa, dan justru itu yang dicari saat ada yang mengeluh
    // cabangnya hilang.
    detail:    `Update master ${hasil.tipe} id=${id}: "${hasil.nama_lama}" -> "${nama}"`
      + (hasil.anak_dipindah > 0 ? ` (${hasil.anak_dipindah} baris di bawahnya ikut dipindah)` : ''),
  });

  return NextResponse.json({ ok: true, anak_dipindah: hasil.anak_dipindah });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!DELETE_ONLY_ROLES.includes(session.role)) {
    return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN/ADMIN yang dapat menghapus master' }, { status: 403 });
  }
  const limited = await kinerjaRateLimit(session.userId, 'delete-master', 10); if (limited) return limited;

  // C-BUG-2 (Tahap 12): safeInt guard
  const { id: idRaw } = await params;
  const id = safeInt(idRaw, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID master tidak valid' }, { status: 400 });

  let dihapus;
  try {
    dihapus = await deleteMasterRow(id);
  } catch (e) {
    if (e instanceof KinerjaMasterTidakAdaError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 404 });
    }
    // T12: pesannya menyebut berapa baris yang masih menggantung — diteruskan apa
    // adanya supaya pengguna tahu harus menghapus apa dulu.
    if (e instanceof KinerjaMasterPunyaAnakError) {
      return NextResponse.json({ ok: false, message: e.message }, { status: 400 });
    }
    throw e;
  }

  await writeAuditLog({
    req,
    eventType: 'KINERJA_DELETE_MASTER',
    userId:    session.userId,
    username:  session.username,
    // T12: nama ikut dicatat. Barisnya sudah lenyap saat log ini dibaca ulang —
    // "id=42" saja tidak bisa dipulihkan jadi informasi oleh siapa pun.
    detail:    `Hapus master ${dihapus.tipe} ${dihapus.tahun} id=${id}: "${dihapus.nama}"`,
  });

  return NextResponse.json({ ok: true });
}
