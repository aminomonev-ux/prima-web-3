import { buatGuardModul, type GuardedSession } from '@/lib/security/app-guard';
import { isLkjipRole } from '@/lib/lkjip/schemas';

export type { GuardedSession };

// Akses: SUPER_ADMIN/ADMIN, atau role lain (mis. BIDANG_RENBANG) dgn app_access 'lkjip'
// (diatur Admin Panel → User Management).
//
// Field pesannya `msg`, bukan `message` — klien LKJIP membacanya di 7 tempat. Bentuk
// balasannya dipertahankan apa adanya supaya perapian ini tidak menyentuh klien sama
// sekali; penyeragaman nama field adalah pekerjaan tersendiri (server + klien sekaligus).
export const guard = buatGuardModul(isLkjipRole, 'msg');
