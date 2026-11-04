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
import { bacaDesimal } from '@/lib/shared/desimal';
import {
  PILIHAN_JEDA_MENIT, JEDA_BAWAAN_MENIT, PILIHAN_TAHAN_JAM, TAHAN_LOGIN_BAWAAN_JAM, PESAN_TAHAN_TIDAK_SAH, PESAN_KELUAR_BAWAAN, SELANG_TANYA_MS,
  formatSisa, jamDari, kapanDari, labelTahan, menitTahan, tambahMenit, type RingkasJadwal,
} from '@/lib/security/jadwal-keluar';

/** `sekarang` + `dimuatPada` = jam MySQL saat dimuat & jam peramban saat itu (untuk perkiraan di dialog). */
interface Keadaan { jadwal: RingkasJadwal | null; sesi_lain_aktif: number; sekarang: string; dimuatPada: number }

const LAINNYA = 'lainnya';

const SELANG_MUAT_MS = 15_000;
const detikTanya = SELANG_TANYA_MS / 1000;

export function TabPemeliharaan() {
  const [k,      setK]      = useState<Keadaan | null>(null);
  const [tujuan, setTujuan] = useState(0);
  const [sisa,   setSisa]   = useState(0);
  const [pesan,  setPesan]  = useState(PESAN_KELUAR_BAWAAN);
  const [menit,  setMenit]  = useState<number>(JEDA_BAWAAN_MENIT);
  const [tahan,  setTahan]  = useState(true);
  const [tahanPilih, setTahanPilih] = useState<string>(String(TAHAN_LOGIN_BAWAAN_JAM));
  const [tahanKetik, setTahanKetik] = useState('');
  const [sibuk,  setSibuk]  = useState(false);

  const terima = useCallback((jadwal: RingkasJadwal | null, sesiLain?: number, sekarang?: string) => {
    setK(lama => ({
      jadwal, sesi_lain_aktif: sesiLain ?? lama?.sesi_lain_aktif ?? 0,
      sekarang: sekarang ?? jadwal?.sekarang ?? lama?.sekarang ?? '', dimuatPada: Date.now(),
    }));
    setTujuan(Date.now() + (jadwal?.sisa_detik ?? 0) * 1000);
    setSisa(jadwal?.sisa_detik ?? 0);
  }, []);

  const muat = useCallback(async () => {
    const r = await fetchJson('/api/admin/pemeliharaan');
    if (r.ok) terima((r.jadwal as RingkasJadwal | null) ?? null, Number(r.sesi_lain_aktif ?? 0), String(r.sekarang ?? ''));
  }, [terima]);

  // Lama tahan: pilihan cepat, atau "Lainnya" = ketik jumlah jam ("1,5" = 1 jam 30 menit).
  const tahanJam = tahanPilih === LAINNYA ? bacaDesimal(tahanKetik) : Number(tahanPilih);
  const tahanSah = !tahan || (tahanJam !== null && menitTahan(tahanJam) !== null);

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
    if (!k || !tahanSah || tahanJam === null) return;
    const n = k.sesi_lain_aktif;
    // Perkiraan dari jam server saat panel dimuat + waktu yang sudah berjalan; jam pastinya ditulis server sesudah dikirim.
    const kiniServer = k.sekarang ? tambahMenit(k.sekarang, (Date.now() - k.dimuatPada) / 60_000) : '';
    const dibuka = kiniServer ? kapanDari(tambahMenit(kiniServer, menit + (menitTahan(tahanJam) ?? 0)), kiniServer) : '';
    const ok = await confirmDialog({
      title: 'Kirim pemeliharaan?',
      message: `${n} sesi lain yang aktif akan melihat pesan ini paling lambat ${detikTanya} detik lagi, `
        + `lalu dikeluarkan otomatis dalam ${menit} menit. Sesi Anda sendiri tidak ikut keluar.`
        + (tahan ? `\n\nSesudah itu login ditahan (hanya Super Admin yang bisa masuk) selama ${labelTahan(tahanJam)}`
          + (dibuka ? ` (terbuka sendiri sekitar ${dibuka})` : '') + ', atau lebih cepat kalau Anda membukanya.' : ''),
      confirmLabel: 'Kirim',
      variant: 'danger',
    });
    if (!ok) return;
    await kirimAksi({ aksi: 'kirim', pesan: pesan.trim(), menit, tahan_login: tahan, ...(tahan ? { tahan_jam: tahanJam } : {}) },
      `Pemeliharaan dikirim. Keluar otomatis dalam ${menit} menit.`);
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
            {j.tahan_login ? `Sesudahnya login ditahan sampai ${kapanDari(j.login_dibuka, j.sekarang)} atau sampai Anda membukanya.` : 'Login tidak ditahan.'}
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
            Hanya Super Admin yang bisa masuk. Login terbuka sendiri {kapanDari(j.login_dibuka, j.sekarang)} (sisa {formatSisa(sisa)}).
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
              Tahan login sesudahnya (hanya Super Admin yang bisa masuk)
            </label>
            {tahan && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ap-fg2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  terbuka sendiri sesudah
                  <select className="ap-select" value={tahanPilih} onChange={e => setTahanPilih(e.target.value)} aria-label="Lama tahan login">
                    {PILIHAN_TAHAN_JAM.map(h => <option key={h} value={String(h)}>{labelTahan(h)}</option>)}
                    <option value={LAINNYA}>Lainnya…</option>
                  </select>
                </label>
                {tahanPilih === LAINNYA && (
                  <>
                    <input className="ap-input" inputMode="decimal" value={tahanKetik} onChange={e => setTahanKetik(e.target.value)}
                      placeholder="mis. 12 atau 1,5" aria-label="Lama tahan login dalam jam" style={{ width: 140 }} />
                    jam
                  </>
                )}
              </div>
            )}
          </div>
          {tahan && !tahanSah && tahanKetik.trim() !== '' && (
            <div style={{ fontSize: 12, color: 'var(--ap-bad-fg)', marginBottom: 12 }}>{PESAN_TAHAN_TIDAK_SAH}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <PrimaButton variant="danger" size="sm" iconLeft={<Wrench size={12} />} onClick={() => void kirim()}
              disabled={sibuk || !pesan.trim() || k === null || !tahanSah}
              data-tooltip={tahanSah ? undefined : PESAN_TAHAN_TIDAK_SAH}>
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
