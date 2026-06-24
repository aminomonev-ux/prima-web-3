// lib/rima/usulan-provider.ts — Provider Q&A data-aware Rima untuk modul Usulan
// (CONCEPT-rima-v3-data-aware.md §11 F6a, purwarupa pertama). READ-ONLY.
//
// PRINSIP KEAMANAN (inti fitur, jangan dilonggarkan):
//  • G20/L60 — hak akses dihitung dari session.role SERVER-SIDE, BUKAN param request.
//    Slot dari klien hanya MEMILIH BENTUK query (intent/tahun/no), tak pernah
//    MELONGGARKAN akses. `usulanOwnershipWhere()` mencerminkan persis jalur fallback
//    L60 di app/api/usulan/route.ts (lowPriv→milik · BIDANG→sub-bidang · admin/
//    kasubag/kabag→verif-stage · SUPER_ADMIN→semua). ⚠️ Bila aturan akses di route
//    berubah, fungsi ini WAJIB ikut (G31 paritas — kandidat extract helper bersama).
//  • G24 — intent allowlist deny-by-default (Zod enum). Tak ada passthrough query bebas.
//  • G25 — field allowlist: hanya kolom DTO bersih yang keluar (anti over-fetch/PII).
//  • G10 — jawaban tanpa nama tabel/kolom/path.

import { sql, sqlInt } from '@/lib/data/db';
import {
  ADMIN_ROLES, BIDANG_ROLES, SUBBIDANG_ROLES, BIDANG_TO_SUBBIDANG, STATUS_LABELS,
} from '@/lib/constants';
import { z } from 'zod';

export const USULAN_APP_KEY = 'usulan_aset';

/** Role yang boleh tanya data Usulan = semua peserta flow Usulan, atau app_access. */
export function isUsulanRimaRole(role: string, appAccess: string[] | null | undefined): boolean {
  if (
    (ADMIN_ROLES as readonly string[]).includes(role)
    || (BIDANG_ROLES as readonly string[]).includes(role)
    || (SUBBIDANG_ROLES as readonly string[]).includes(role)
  ) return true;
  return Array.isArray(appAccess) && appAccess.includes(USULAN_APP_KEY);
}

// G24 — slot allowlist. Param hanya bentuk query; tahun divalidasi ketat, no_usulan
// dibatasi & dibersihkan, topn di-clamp. Tak ada `scope`/`bidang`/`created_by` dari
// klien (anti L60) — bentuk pertanyaan boleh kaya, akses tetap dari role server.
export const UsulanSlotSchema = z.object({
  intent:    z.enum(['rekap', 'lookup', 'top', 'tren', 'inbox', 'rincian']),
  tahun:     z.string().regex(/^\d{4}$/).optional(),
  no_usulan: z.string().trim().min(1).max(40).optional(),
  topn:      z.coerce.number().int().min(1).max(10).optional(),
});
export type UsulanSlot = z.infer<typeof UsulanSlotSchema>;

type SqlFrag = ReturnType<typeof sql>;

/**
 * G20/L60 — filter kepemilikan dari ROLE (server-side), mencerminkan jalur fallback
 * di app/api/usulan/route.ts. `denied=true` → user tak boleh lihat apa pun.
 */
function usulanOwnershipWhere(role: string, userId: number): { frag: SqlFrag; denied: boolean } {
  if (role === 'SUPER_ADMIN') return { frag: sql``, denied: false };
  if (role === 'ADMIN_KASUBAG')
    return { frag: sql`AND h.status_ringkas IN ('DITELAAH','DIPROSES','DISETUJUI','DITOLAK')`, denied: false };
  if (role === 'ADMIN_KABAG')
    return { frag: sql`AND h.status_ringkas IN ('DIPROSES','DISETUJUI','DITOLAK')`, denied: false };
  if (role === 'ADMIN')
    return { frag: sql`AND h.status_ringkas NOT IN ('DRAFT','DIAJUKAN_REVIEW','REVISI_BIDANG','DITOLAK_BIDANG')`, denied: false };
  if ((BIDANG_ROLES as readonly string[]).includes(role)) {
    const subs = (BIDANG_TO_SUBBIDANG as Record<string, string[]>)[role] ?? [];
    if (!subs.length) return { frag: sql``, denied: true };
    return { frag: sql`AND h.sub_bidang IN (${subs})`, denied: false };
  }
  // lowPriv (sub-bidang) → hanya miliknya
  return { frag: sql`AND h.created_by = ${userId}`, denied: false };
}

/**
 * #4 proaktif — status "inbox" yang DITUNGGU aksi role ini (mengikuti alur status
 * usulan_headers). Dihitung dari role server (bukan klien). null = role tanpa satu
 * inbox tunggal (SUPER_ADMIN) → ringkasan non-final.
 */
function usulanInbox(role: string): { status: string; aksi: string } | null {
  if (role === 'ADMIN')         return { status: 'DIAJUKAN',        aksi: 'menunggu telaah kamu' };
  if (role === 'ADMIN_KASUBAG') return { status: 'DITELAAH',        aksi: 'menunggu putusanmu' };
  if (role === 'ADMIN_KABAG')   return { status: 'DIPROSES',        aksi: 'menunggu putusanmu' };
  if ((BIDANG_ROLES as readonly string[]).includes(role))
    return { status: 'DIAJUKAN_REVIEW', aksi: 'menunggu review bidangmu' };
  if (role === 'SUPER_ADMIN')   return null;
  return { status: 'REVISI_BIDANG', aksi: 'dikembalikan & perlu kamu revisi' };
}

export interface UsulanRekapAnswer {
  kind: 'rekap';
  tahun: string | null;
  total: number;
  rows: { status: string; label: string; count: number; nilai: number }[];
}
export interface UsulanLookupAnswer {
  kind: 'lookup';
  found: boolean;
  no_usulan: string;
  status?: string;
  label?: string;
  jumlah_item?: number;
  total_nilai?: number;
  tahun?: string;
}
export interface UsulanTopAnswer {
  kind: 'top';
  tahun: string | null;
  items: { no_usulan: string; status: string; label: string; total_nilai: number }[];
}
export interface UsulanTrenAnswer {
  kind: 'tren';
  years: { tahun: string; count: number; nilai: number }[];
}
export interface UsulanInboxAnswer {
  kind: 'inbox';
  status: string | null;
  label: string | null;
  aksi: string;
  count: number;
  total_nilai: number;
  tahun: string | null;
}
export interface UsulanRincianAnswer {
  kind: 'rincian';
  tahun: string | null;
  total: number;
  rows: { sub_bidang: string; count: number; nilai: number }[];
}
export type UsulanAnswer =
  | UsulanRekapAnswer | UsulanLookupAnswer | UsulanTopAnswer | UsulanTrenAnswer
  | UsulanInboxAnswer | UsulanRincianAnswer;

const ROW_CAP = 50; // L39 — array cap

/** Jalankan query terpola (parameterized) sesuai slot. Read-only. */
export async function runUsulanQuery(
  role: string, userId: number, slot: UsulanSlot,
): Promise<{ ok: true; data: UsulanAnswer } | { ok: false; denied: true }> {
  const own = usulanOwnershipWhere(role, userId);
  if (own.denied) return { ok: false, denied: true };
  const tahunFrag = slot.tahun ? sql`AND h.tahun_anggaran = ${slot.tahun}` : sql``;

  if (slot.intent === 'lookup') {
    if (!slot.no_usulan) {
      return { ok: true, data: { kind: 'lookup', found: false, no_usulan: '' } };
    }
    // G25 — SELECT kolom allowlist saja (tak pernah h.*). Ownership tetap menempel
    // → user low-priv tanya no milik orang lain = tak ketemu (anti-enumeration, L60).
    const rows = await sql`
      SELECT h.no_usulan, h.status_ringkas, h.jumlah_item, h.total_nilai, h.tahun_anggaran
        FROM usulan_headers h
       WHERE h.no_usulan = ${slot.no_usulan} ${own.frag}
       LIMIT 1`;
    const r = rows[0] as Record<string, unknown> | undefined;
    if (!r) return { ok: true, data: { kind: 'lookup', found: false, no_usulan: slot.no_usulan } };
    const st = String(r.status_ringkas ?? '');
    return {
      ok: true,
      data: {
        kind: 'lookup', found: true,
        no_usulan: String(r.no_usulan ?? slot.no_usulan),
        status: st, label: STATUS_LABELS[st] ?? st,
        jumlah_item: Number(r.jumlah_item ?? 0),
        total_nilai: Number(r.total_nilai ?? 0),
        tahun: String(r.tahun_anggaran ?? ''),
      },
    };
  }

  if (slot.intent === 'top') {
    // #3 — top-N termahal. Ownership tetap menempel (anti L60: low-priv hanya miliknya).
    const n = Math.min(slot.topn ?? 5, 10);
    const rows = await sql`
      SELECT h.no_usulan, h.status_ringkas, h.total_nilai, h.tahun_anggaran
        FROM usulan_headers h
       WHERE 1=1 ${own.frag} ${tahunFrag}
       ORDER BY h.total_nilai DESC
       LIMIT ${sqlInt(n)}`;
    const items = (rows as Record<string, unknown>[]).map(r => {
      const s = String(r.status_ringkas ?? '');
      return {
        no_usulan: String(r.no_usulan ?? ''), status: s, label: STATUS_LABELS[s] ?? s,
        total_nilai: Number(r.total_nilai ?? 0),
      };
    });
    return { ok: true, data: { kind: 'top', tahun: slot.tahun ?? null, items } };
  }

  if (slot.intent === 'tren') {
    // #3 — tren antar-tahun (count + nilai per tahun), dibatasi kepemilikan.
    const rows = await sql`
      SELECT h.tahun_anggaran AS th, COUNT(*) AS c, COALESCE(SUM(h.total_nilai),0) AS nilai
        FROM usulan_headers h
       WHERE 1=1 ${own.frag}
       GROUP BY h.tahun_anggaran
       ORDER BY h.tahun_anggaran DESC
       LIMIT ${sqlInt(ROW_CAP)}`;
    const years = (rows as Record<string, unknown>[]).map(r => ({
      tahun: String(r.th ?? ''), count: Number(r.c ?? 0), nilai: Number(r.nilai ?? 0),
    }));
    return { ok: true, data: { kind: 'tren', years } };
  }

  if (slot.intent === 'inbox') {
    // #4 proaktif — berapa usulan menunggu AKSI role ini. Hitung di usulanInboxCount
    // (dipakai ulang oleh /api/rima/summary lintas-modul). Ownership tetap menempel.
    const box = usulanInbox(role);
    const ic = await usulanInboxCount(role, userId, slot.tahun);
    return {
      ok: true,
      data: {
        kind: 'inbox', status: box?.status ?? null,
        label: ic.label, aksi: ic.aksi, count: ic.count, total_nilai: ic.total_nilai,
        tahun: slot.tahun ?? null,
      },
    };
  }

  if (slot.intent === 'rincian') {
    // #B3 — rekap per DIMENSI sub-bidang (bukan status). Ownership tetap menempel
    // (own.frag): BIDANG hanya sub-bidangnya, low-priv hanya miliknya (anti L60).
    const rows = await sql`
      SELECT h.sub_bidang AS s, COUNT(*) AS c, COALESCE(SUM(h.total_nilai),0) AS nilai
        FROM usulan_headers h
       WHERE 1=1 ${own.frag} ${tahunFrag}
       GROUP BY h.sub_bidang
       ORDER BY nilai DESC
       LIMIT ${sqlInt(ROW_CAP)}`;
    const list = (rows as Record<string, unknown>[]).map(r => ({
      sub_bidang: String(r.s ?? ''), count: Number(r.c ?? 0), nilai: Number(r.nilai ?? 0),
    }));
    const total = list.reduce((a, b) => a + b.count, 0);
    return { ok: true, data: { kind: 'rincian', tahun: slot.tahun ?? null, total, rows: list } };
  }

  // intent === 'rekap' — hitung per status + total nilai, dibatasi kepemilikan.
  const rows = await sql`
    SELECT h.status_ringkas AS s, COUNT(*) AS c, COALESCE(SUM(h.total_nilai),0) AS nilai
      FROM usulan_headers h
     WHERE 1=1 ${own.frag} ${tahunFrag}
     GROUP BY h.status_ringkas
     ORDER BY c DESC
     LIMIT ${sqlInt(ROW_CAP)}`;
  const list = (rows as Record<string, unknown>[]).map(r => {
    const s = String(r.s ?? '');
    return { status: s, label: STATUS_LABELS[s] ?? s, count: Number(r.c ?? 0), nilai: Number(r.nilai ?? 0) };
  });
  const total = list.reduce((a, b) => a + b.count, 0);
  return { ok: true, data: { kind: 'rekap', tahun: slot.tahun ?? null, total, rows: list } };
}

/**
 * #4 — hitung inbox (menunggu aksi role) terikat ownership. Dipakai intent `inbox`
 * DAN /api/rima/summary lintas-modul. role denied → count 0 (bukan bocor).
 */
export async function usulanInboxCount(
  role: string, userId: number, tahun?: string,
): Promise<{ label: string | null; aksi: string; count: number; total_nilai: number }> {
  const own = usulanOwnershipWhere(role, userId);
  if (own.denied) return { label: null, aksi: 'masih berjalan', count: 0, total_nilai: 0 };
  const box = usulanInbox(role);
  const statusFrag = box
    ? sql`AND h.status_ringkas = ${box.status}`
    : sql`AND h.status_ringkas NOT IN ('DISETUJUI','DITOLAK','DITOLAK_ADMIN','DITOLAK_BIDANG')`;
  const tahunFrag = tahun ? sql`AND h.tahun_anggaran = ${tahun}` : sql``;
  const rows = await sql`
    SELECT COUNT(*) AS c, COALESCE(SUM(h.total_nilai),0) AS nilai
      FROM usulan_headers h
     WHERE 1=1 ${own.frag} ${statusFrag} ${tahunFrag}`;
  const r = (rows as Record<string, unknown>[])[0] ?? {};
  return {
    label: box ? (STATUS_LABELS[box.status] ?? box.status) : null,
    aksi: box?.aksi ?? 'masih berjalan',
    count: Number(r.c ?? 0), total_nilai: Number(r.nilai ?? 0),
  };
}

/** Dispatch terpola: parse slot (G24) → runner ber-closure (slot terikat). Dipakai registry. */
export function usulanDispatch(bag: Record<string, string | undefined>) {
  const parsed = UsulanSlotSchema.safeParse({
    intent: bag.intent, tahun: bag.tahun || undefined, no_usulan: bag.no || undefined,
    topn: bag.topn || undefined,
  });
  if (!parsed.success) return { ok: false as const };
  return { ok: true as const, intent: parsed.data.intent, run: (role: string, userId: number) => runUsulanQuery(role, userId, parsed.data) };
}
