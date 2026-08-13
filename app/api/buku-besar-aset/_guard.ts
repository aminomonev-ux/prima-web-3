import { buatGuardModul, type GuardedSession } from '@/lib/security/app-guard';
import { isAsetRole } from '@/lib/data/buku-besar-aset-schemas';

export type { GuardedSession };

// Akses: SUPER_ADMIN/ADMIN, atau role lain yang punya app_access 'buku_besar_aset'
// (diatur Admin Panel → User Management).
// T1: argumen ketiga = sakelar maintenance (lihat catatan di app-guard.ts).
export const guard = buatGuardModul(isAsetRole, 'message', 'app_status_buku_besar_aset');
