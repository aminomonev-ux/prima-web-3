'use client';
// app/(dashboard)/admin/_panels/TabPemeliharaan.tsx — "Pemeliharaan & keluar otomatis" (SUPER_ADMIN).
// Kirim pesan + jeda → semua tab PRIMA menampilkan hitung mundur, lalu sesi lain dikeluarkan server.
// Konsep: docs/CONCEPT-pemeliharaan-keluar.md
import { useCallback, useEffect, useState } from 'react';
import { Wrench, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import {
  PILIHAN_JEDA_MENIT, JEDA_BAWAAN_MENIT, TAHAN_LOGIN_MAKS_JAM, PESAN_KELUAR_BAWAAN, SELANG_TANYA_MS,
  formatSisa, jamDari, type RingkasJadwal,
} from '@/lib/security/jadwal-keluar';

interface Keadaan { jadwal: RingkasJadwal | null; sesi_lain_aktif: number }

const SELANG_MUAT_MS = 15_000;
const detikTanya = SELANG_TANYA_MS / 1000;

export function TabPemeliharaan() {
  const [k,      setK]      = useState<Keadaan | null>(null);
  const [tujuan, setTujuan] = useState(0);
  const [sisa,   setSisa]   = useState(0);
  const [pesan,  setPesan]  = useState(PESAN_KELUAR_BAWAAN);
  const [menit,  setMenit]  = useState<number>(JEDA_BAWAAN_MENIT);
  const [tahan,  setTahan]  = useState(true);
  const [sibuk,  setSibuk]  = useState(false);

  const terima = useCallback((jadwal: RingkasJadwal | null, sesiLain?: number) => {
    setK(lama => ({ jadwal, sesi_lain_aktif: sesiLain ?? lama?.sesi_lain_aktif ?? 0 }));
    setTujuan(Date.now() + (jadwal?.sisa_detik ?? 0) * 1000);
    setSisa(jadwal?.sisa_detik ?? 0);
  }, []);

  const muat = useCallback(async () => {
    const r = await fetchJson('/api/admin/pemeliharaan');
    if (r.ok) terima((r.jadwal as RingkasJadwal | null) ?? null, Number(r.sesi_lain_aktif ?? 0));
  }, [terima]);

  useEffect(() => {
    const awal = setTimeout(() => { void muat(); }, 0);
    const berkala = setInterval(() => { void muat(); }, SELANG_MUAT_MS);
    return () => { clearTimeout(awal); clearInterval(berkala); };
  }, [muat]);

  const tahap = k?.jadwal?.tahap ?? null;
  useEffect(() => {
    if (tahap !== 'HITUNG_MUNDUR' && tahap !== 'LOGIN_DITAHAN') return;
    const detak = setInterval(() => {
      const s = Math.max(0, Math.ceil((tujuan - Date.now()) / 1000));
      setSisa(s);
      if (s <= 0) void muat();
    }, 1000);
    return () => clearInterval(detak);
  }, [tahap, tujuan, muat]);

  async function kirimAksi(body: Record<string, unknown>, berhasil: string) {
    setSibuk(true);
    try {
      const r = await fetchJson('/api/admin/pemeliharaan', { method: 'POST', body: JSON.stringify(body) });
      if (!r.ok) { toast.error(r.message); return; }
      toast.success(berhasil);
      terima((r.jadwal as RingkasJadwal | null) ?? null);
      void muat();
    } finally { setSibuk(false); }
  }

  async function kirim() {
    const n = k?.sesi_lain_aktif ?? 0;
    const ok = await confirmDialog({
      title: 'Kirim pemeliharaan?',
      message: `${n} sesi lain yang aktif akan melihat pesan ini paling lambat ${detikTanya} detik lagi, `
        + `lalu dikeluarkan otomatis dalam ${menit} menit. Sesi Anda sendiri tidak ikut keluar.`
        + (tahan ? `\n\nSesudah itu login ditahan (hanya Super Admin yang bisa masuk) sampai Anda membukanya, paling lama ${TAHAN_LOGIN_MAKS_JAM} jam.` : ''),
      confirmLabel: 'Kirim',
      variant: 'danger',
    });
    if (!ok) return;
    await kirimAksi({ aksi: 'kirim', pesan: pesan.trim(), menit, tahan_login: tahan }, `Pemeliharaan dikirim. Keluar otomatis dalam ${menit} menit.`);
  }

  async function batalkan() {
    const ok = await confirmDialog({
      title: 'Batalkan pemeliharaan?',
      message: 'Hitung mundur di semua tab berhenti (paling lambat 30 detik) dan tidak ada yang dikeluarkan.',
      confirmLabel: 'Batalkan pemeliharaan',
      cancelLabel: 'Kembali',
    });
    if (ok) await kirimAksi({ aksi: 'batalkan' }, 'Pemeliharaan dibatalkan.');
  }

  const j = k?.jadwal ?? null;
  const berjalan = tahap === 'HITUNG_MUNDUR' || tahap === 'LOGIN_DITAHAN';

  return (
    <div>
      <div className="ap-section-title">PEMELIHARAAN &amp; KELUAR OTOMATIS</div>

      {j && tahap === 'HITUNG_MUNDUR' && (
        <div className="ap-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="ap-badge badge-red">HITUNG MUNDUR</span>
            <span style={{ fontSize: 12, color: 'var(--ap-dim)' }}>Dikirim {j.oleh} pukul {jamDari(j.dikirim)} · keluar pukul {jamDari(j.batas)}</span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: 'var(--ap-fg)', marginBottom: 8 }}>{formatSisa(sisa)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ap-fg2)', whiteSpace: 'pre-line', marginBottom: 10 }}>{j.pesan}</div>
          <div style={{ fontSize: 12, color: 'var(--ap-dim)', marginBottom: 14 }}>
            {k?.sesi_lain_aktif ?? 0} sesi lain akan dikeluarkan.{' '}
            {j.tahan_login ? `Sesudahnya login ditahan sampai pukul ${jamDari(j.login_dibuka)} atau sampai Anda membukanya.` : 'Login tidak ditahan.'}
          </div>
          <PrimaButton variant="ghost" size="sm" onClick={() => void batalkan()} disabled={sibuk}>Batalkan</PrimaButton>
        </div>
      )}

      {j && tahap === 'LOGIN_DITAHAN' && (
        <div className="ap-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <span className="ap-badge badge-yellow">LOGIN DITAHAN</span>
            <span style={{ fontSize: 12, color: 'var(--ap-dim)' }}>Sesi dikeluarkan pukul {jamDari(j.batas)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ap-fg2)', marginBottom: 14 }}>
            Hanya Super Admin yang bisa masuk. Login terbuka sendiri pukul {jamDari(j.login_dibuka)} (sisa {formatSisa(sisa)}).
            {' '}Sesi lain yang masih aktif: {k?.sesi_lain_aktif ?? 0}.
          </div>
          <PrimaButton variant="success" size="sm" iconLeft={<LogIn size={12} />} disabled={sibuk}
            onClick={() => void kirimAksi({ aksi: 'buka_login' }, 'Login dibuka kembali.')}>
            Buka login sekarang
          </PrimaButton>
        </div>
      )}

      {!berjalan && (
        <div className="ap-card" style={{ marginBottom: 20 }}>
          {j && tahap === 'SELESAI' && (
            <div style={{ fontSize: 12, color: 'var(--ap-dim)', marginBottom: 12 }}>
              Pemeliharaan terakhir: sesi dikeluarkan pukul {jamDari(j.batas)} ({j.dikirim.slice(0, 10)}) oleh {j.oleh}.
            </div>
          )}
          <textarea className="ap-input" rows={3} value={pesan} maxLength={500} onChange={e => setPesan(e.target.value)}
            aria-label="Pesan pemeliharaan" style={{ resize: 'vertical', marginBottom: 6 }} />
          <div style={{ fontSize: 10, color: 'var(--ap-dim)', marginBottom: 12 }}>{pesan.length}/500 karakter</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ap-fg2)' }}>
              Keluar otomatis dalam
              <select className="ap-select" value={menit} onChange={e => setMenit(Number(e.target.value))}>
                {PILIHAN_JEDA_MENIT.map(m => <option key={m} value={m}>{m} menit</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ap-fg2)' }}>
              <input type="checkbox" checked={tahan} onChange={e => setTahan(e.target.checked)} />
              Tahan login sesudahnya (hanya Super Admin yang bisa masuk; terbuka sendiri {TAHAN_LOGIN_MAKS_JAM} jam kemudian)
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <PrimaButton variant="danger" size="sm" iconLeft={<Wrench size={12} />} onClick={() => void kirim()}
              disabled={sibuk || !pesan.trim() || k === null}>
              Kirim
            </PrimaButton>
            <span style={{ fontSize: 12, color: 'var(--ap-dim)' }}>Sesi lain yang aktif sekarang: {k?.sesi_lain_aktif ?? '…'}</span>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--ap-dim)' }}>
        Pesan muncul di setiap tab PRIMA yang terbuka paling lambat {detikTanya} detik setelah dikirim. Aplikasi tidak menyimpan
        isian orang secara otomatis, modal hanya mengingatkan. Komputer yang sedang tidur menerimanya saat bangun; kalau waktunya
        sudah lewat, langsung ke halaman login.
      </div>
    </div>
  );
}
