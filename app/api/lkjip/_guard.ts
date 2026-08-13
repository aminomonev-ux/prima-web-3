import { buatGuardModul, type GuardedSession } from '@/lib/security/app-guard';
import { isLkjipRole } from '@/lib/lkjip/schemas';

export type { GuardedSession };

// Akses: SUPER_ADMIN/ADMIN, atau role lain (mis. BIDANG_RENBANG) dgn app_access 'lkjip'
// (diatur Admin Panel → User Management).
//
// Field pesannya `msg`, bukan `message` — klien LKJIP membacanya di 7 tempat. Bentuk
// balasannya dipertahankan apa adanya supaya perapian ini tidak menyentuh klien sama
// sekali; penyeragaman nama field adalah pekerjaan tersendiri (server + klien sekaligus).
// T1: argumen ketiga = sakelar maintenance (lihat catatan di app-guard.ts).
// T1b: `app_status_lkjip` dulu TIDAK ADA di APP_KEYS admin panel — kartunya ada di
// /menu dan menyusun kuncinya dari card.id, tapi kuncinya tak pernah bisa ditulis.
// Jadi sakelar LKJIP bukan bocor seperti Renaksi, melainkan mati total.
export const guard = buatGuardModul(isLkjipRole, 'msg', 'app_status_lkjip');
