import { buatGuardModul, type GuardedSession } from '@/lib/security/app-guard';
import { isRencanaAksiRole } from '@/lib/data/rencana-aksi-schemas';

export type { GuardedSession };

// Akses: SUPER_ADMIN/ADMIN, atau role lain yang punya app_access 'rencana_aksi'
// (diatur Admin Panel → User Management).
//
// Field pesannya `error`, bukan `message` — bentuk balasan dipertahankan supaya klien
// tidak perlu disentuh. Yang DIseragamkan cuma nama kunci hasilnya: dulu `response`,
// sekarang `res` seperti tiga modul lain, supaya tidak ada lagi dua ejaan untuk hal
// yang sama. tsc menandai tiap pemakaian lama.
// T1: argumen ketiga = sakelar maintenance. Tanpa ini, mematikan modul dari Admin
// Panel cuma membuat kartunya abu di /menu — mengetik /rencana-aksi langsung tetap
// tembus. Kunci flagnya sama dengan yang dipakai kartu menu (`app_status_${card.id}`).
export const guard = buatGuardModul(isRencanaAksiRole, 'error', 'app_status_rencana_aksi');
