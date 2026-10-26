import { NextResponse } from 'next/server';
import { buatGuardModul, type GuardedSession } from '@/lib/security/app-guard';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';
import { LABEL_MENU_BBA, type MenuBba } from '@/lib/bba/peran';
import { petaIzinBba } from '@/lib/bba/izin-server';

export type { GuardedSession };

// DUA LAPIS (docs/CONCEPT-bba-buku-aset.md §16), urutannya penting:
//   1. `guard()` — sakelar maintenance + boleh masuk modul (peran bawaan atau grant app_access).
//   2. `tolakKecualiEdit` — di dalam modul, bagian ini boleh diubah? (lib/bba/peran.ts)
// Lapis kedua dipasang di SETIAP handler tulis — tombol mati di layar hanya cerminnya (L82).
// T1: argumen ketiga = sakelar maintenance (lihat catatan di app-guard.ts).
export const guard = buatGuardModul(isAsetRole, 'message', 'app_status_buku_besar_aset');

/**
 * 403 yang menyebut bagiannya — "Akses ditolak" polos membuat orang mengira akunnya rusak.
 * `null` = boleh. Beberapa bagian = cukup salah satu EDIT (bukti dukung dipegang Rencana
 * dan Pengadaan sekaligus).
 */
export async function tolakKecualiEdit(s: GuardedSession, ...menus: MenuBba[]): Promise<NextResponse | null> {
  const peta = await petaIzinBba(s.userId, s.role);
  if (menus.some(m => peta[m] === 'EDIT')) return null;
  const nama = menus.map(m => LABEL_MENU_BBA[m]).join(' atau ');
  return NextResponse.json({
    ok: false, code: 'MENU_BACA_SAJA',
    message: `Izin Anda di bagian ${nama} hanya melihat — perubahan tidak disimpan. Hubungi Admin kalau memang perlu mengubahnya.`,
  }, { status: 403 });
}
