// lib/rima/registry.ts — registry provider Q&A data-aware Rima. Satu sumber
// kebenaran daftar app yang boleh ditanya datanya (G24 deny-by-default di level
// app). Tiap provider WAJIB reuse guard role yang SAMA dgn endpoint modulnya
// (G31 paritas) + ownership cermin route asli (L60/G20). Menambah modul = tambah
// provider + 1 baris di sini — keamanan otomatis seragam, tak ada route drift.

import { isUsulanRimaRole, usulanDispatch, usulanInboxCount } from './usulan-provider';
import { isBbaRimaRole, bbaDispatch, bbaInboxCount } from './bba-provider';
import { isPkRimaRole, pkDispatch, pkInboxCount } from './pk-provider';
import { isLkjipRimaRole, lkjipDispatch, lkjipInboxCount } from './lkjip-provider';
import { isBludRimaRole, bludDispatch, bludInboxCount } from './blud-provider';
import { isKinerjaRimaRole, kinerjaDispatch, kinerjaInboxCount } from './kinerja-provider';
import { isRencanaAksiRimaRole, rencanaAksiDispatch, rencanaAksiInboxCount } from './rencana-aksi-provider';

export type RimaRunResult = { ok: true; data: unknown } | { ok: false; denied: true };
export type RimaDispatch =
  | { ok: false }
  | { ok: true; intent: string; run: (role: string, userId: number) => Promise<RimaRunResult> };

/** #4 — hitung "menunggu aksi" per-modul (terikat ownership di tiap provider). */
export type RimaInbox = { label: string | null; aksi: string; count: number; total_nilai: number };

export interface RimaProvider {
  title:    string;
  isRole:   (role: string, appAccess: string[] | null | undefined) => boolean;
  dispatch: (bag: Record<string, string | undefined>) => RimaDispatch;
  inbox:    (role: string, userId: number) => Promise<RimaInbox>;
}

export const RIMA_APPS = ['usulan', 'bba', 'pk', 'lkjip', 'blud', 'kinerja', 'rencana_aksi'] as const;
export type RimaApp = typeof RIMA_APPS[number];

export const RIMA_PROVIDERS: Record<RimaApp, RimaProvider> = {
  usulan:       { title: 'Usulan',             isRole: isUsulanRimaRole,     dispatch: usulanDispatch,     inbox: usulanInboxCount },
  bba:          { title: 'Buku Besar Aset',    isRole: isBbaRimaRole,        dispatch: bbaDispatch,        inbox: bbaInboxCount },
  pk:           { title: 'Perjanjian Kinerja', isRole: isPkRimaRole,         dispatch: pkDispatch,         inbox: pkInboxCount },
  lkjip:        { title: 'LKJIP',              isRole: isLkjipRimaRole,      dispatch: lkjipDispatch,      inbox: lkjipInboxCount },
  blud:         { title: 'BLUD',               isRole: isBludRimaRole,       dispatch: bludDispatch,       inbox: bludInboxCount },
  kinerja:      { title: 'Kinerja',            isRole: isKinerjaRimaRole,    dispatch: kinerjaDispatch,    inbox: kinerjaInboxCount },
  rencana_aksi: { title: 'Rencana Aksi',       isRole: isRencanaAksiRimaRole, dispatch: rencanaAksiDispatch, inbox: rencanaAksiInboxCount },
};

export function isRimaApp(v: string | null | undefined): v is RimaApp {
  return v != null && (RIMA_APPS as readonly string[]).includes(v);
}
