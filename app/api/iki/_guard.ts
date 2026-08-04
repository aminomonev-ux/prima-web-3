import { buatGuardModul, type GuardedSession } from '@/lib/security/app-guard';
import { isIkiRole } from '@/lib/data/iki-schemas';

export type { GuardedSession };

// Akses: SUPER_ADMIN/ADMIN, atau role lain yang punya app_access 'iki'
// (diatur Admin Panel → User Management).
export const guard = buatGuardModul(isIkiRole);
