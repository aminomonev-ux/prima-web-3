import { buatGuardModul, type GuardedSession } from '@/lib/security/app-guard';
import { isIkiRole } from '@/lib/data/iki-schemas';

export type { GuardedSession };

// Akses: SUPER_ADMIN/ADMIN, atau role lain yang punya app_access 'iki'
// (diatur Admin Panel → User Management).
// T1: argumen ketiga = sakelar maintenance (lihat catatan di app-guard.ts).
export const guard = buatGuardModul(isIkiRole, 'message', 'app_status_iki');
