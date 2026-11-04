'use client';
// components/guards/PenjagaPemeliharaan.tsx — hitung mundur "Pemeliharaan & keluar otomatis".
//
// Tiap tab bertanya ke /api/auth/pemeliharaan ±30 detik dan saat tab kembali terlihat; pertanyaan
// itu TIDAK memperpanjang sesi. Penegak sesungguhnya server (`getSession` menolak sesi yang lahir
// sebelum batas) — komponen ini hanya mengingatkan dan memulangkan tab ke halaman login tepat waktu.
// Aplikasi tidak menyimpan isian siapa pun: tiap layar punya Simpan + pengaman bentrok sendiri.
// Konsep: docs/CONCEPT-pemeliharaan-keluar.md

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wrench } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { bolehTinggalkanHalaman, lepaskanPengingat } from '@/lib/shared/belum-tersimpan';
import { SELANG_TANYA_MS, formatSisa } from '@/lib/security/jadwal-keluar';

interface HitungMundur { pesan: string; batasMs: number }

const sisaDetik = (h: HitungMundur) => Math.max(0, Math.ceil((h.batasMs - Date.now()) / 1000));

export default function PenjagaPemeliharaan() {
  const [hitung, setHitung] = useState<HitungMundur | null>(null);
  const [kecil,  setKecil]  = useState(false);
  const [sisa,   setSisa]   = useState(0);
  const hitungRef = useRef<HitungMundur | null>(null);
  const keluarRef = useRef(false);

  const keluar = useCallback(async (otomatis: boolean) => {
    if (keluarRef.current) return;
    if (!otomatis && !(await bolehTinggalkanHalaman())) return;
    keluarRef.current = true;
    lepaskanPengingat();
    // Pengingat "belum tersimpan" layar lain (beforeunload) tidak boleh menahan tab yang sesinya
    // dimatikan server: dialog "tinggalkan halaman?" di komputer yang ditinggal membuat tabnya
    // tertahan di halaman yang Simpan-nya 401. Pendengar capture di window jalan lebih dulu
    // daripada pendengar biasa, jadi stopImmediatePropagation memutus semuanya.
    window.addEventListener('beforeunload', e => e.stopImmediatePropagation(), { capture: true });
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* sesi tetap ditolak server */ }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- muat ulang penuh: sisa sesi ikut terbuang
    window.location.href = '/login?reason=pemeliharaan';
  }, []);

  const pasang = useCallback((h: HitungMundur | null) => {
    const lama = hitungRef.current;
    hitungRef.current = h;
    setHitung(h);
    if (h) setSisa(sisaDetik(h));
    if (h && !lama) setKecil(false);
    if (!h && lama && Date.now() < lama.batasMs) toast.info('Pemeliharaan dibatalkan. Silakan lanjut bekerja.');
  }, []);

  const tanya = useCallback(async () => {
    if (keluarRef.current) return;
    let r: Response;
    try { r = await fetch('/api/auth/pemeliharaan', { cache: 'no-store' }); } catch { return; }
    if (r.status === 401) {
      let alasan: unknown = null;
      try { alasan = ((await r.json()) as { alasan?: unknown }).alasan; } catch { /* sebab lain */ }
      // Sebab selain pemeliharaan (idle, dicabut admin) diurus SessionKeepAlive.
      if (alasan === 'PEMELIHARAAN') void keluar(true);
      return;
    }
    if (!r.ok) return;
    let d: { aktif?: boolean; pesan?: string; sisa_detik?: number; dikecualikan?: boolean };
    try { d = await r.json(); } catch { return; }
    // Batas dihitung dari SISA menurut server, bukan jam peramban — jam komputer yang meleset tidak berpengaruh.
    pasang(d.aktif && !d.dikecualikan ? { pesan: d.pesan ?? '', batasMs: Date.now() + Number(d.sisa_detik ?? 0) * 1000 } : null);
  }, [keluar, pasang]);

  useEffect(() => {
    const awal = setTimeout(() => { void tanya(); }, 0);
    const berkala = setInterval(() => { void tanya(); }, SELANG_TANYA_MS);
    const onLihat = () => {
      if (document.visibilityState !== 'visible') return;
      // Komputer yang tidur melewati batas: langsung pulang, tidak menunggu jaringan bangun.
      const h = hitungRef.current;
      if (h && Date.now() >= h.batasMs) void keluar(true);
      else void tanya();
    };
    document.addEventListener('visibilitychange', onLihat);
    return () => {
      clearTimeout(awal);
      clearInterval(berkala);
      document.removeEventListener('visibilitychange', onLihat);
    };
  }, [tanya, keluar]);

  useEffect(() => {
    if (!hitung) return;
    const detak = setInterval(() => {
      const s = sisaDetik(hitung);
      setSisa(s);
      if (s <= 0) void keluar(true);
    }, 1000);
    return () => clearInterval(detak);
  }, [hitung, keluar]);

  if (!hitung) return null;

  return createPortal(
    <>
      <style>{CSS}</style>
      {kecil ? (
        <div className="pml-spanduk" role="status">
          <Wrench size={16} aria-hidden="true" />
          <span className="pml-spanduk-teks">
            Keluar otomatis untuk pemeliharaan dalam <b className="pml-angka">{formatSisa(sisa)}</b>. Simpan pekerjaan Anda.
          </span>
          <span className="pml-spanduk-aksi">
            <button type="button" className="pml-spanduk-tombol" onClick={() => setKecil(false)}>Lihat pesan</button>
            <button type="button" className="pml-spanduk-tombol" onClick={() => void keluar(false)}>Keluar sekarang</button>
          </span>
        </div>
      ) : (
        <div className="pml-latar" role="alertdialog" aria-modal="true" aria-labelledby="pml-judul" aria-describedby="pml-pesan">
          <div className="pml-kartu">
            <div id="pml-judul" className="pml-judul"><Wrench size={18} aria-hidden="true" /> Pemeliharaan aplikasi</div>
            <p id="pml-pesan" className="pml-pesan">{hitung.pesan}</p>
            <div className="pml-sisa">
              <div className="pml-sisa-label">KELUAR OTOMATIS DALAM</div>
              <div className="pml-angka pml-sisa-angka">{formatSisa(sisa)}</div>
            </div>
            <p className="pml-catatan">Isian yang belum disimpan akan hilang. Aplikasi tidak menyimpannya untuk Anda.</p>
            <div className="pml-aksi">
              <PrimaButton variant="ghost" onClick={() => void keluar(false)}>Keluar sekarang</PrimaButton>
              <PrimaButton variant="primary" onClick={() => setKecil(true)} autoFocus>Lanjut simpan dulu</PrimaButton>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

// Di atas modal aplikasi (ConfirmDialog 10000), di bawah tooltip portal (100000). Tema terang = palet ConfirmDialog.
const CSS = `
.pml-latar { position: fixed; inset: 0; z-index: 10050; background: rgba(2, 15, 28, .78); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 16px; font-family: Inter, sans-serif; }
.pml-kartu { background: #042C53; border: 1px solid #E24B4A; border-radius: 14px; padding: 24px 26px; width: 100%; max-width: 460px;
  box-shadow: 0 28px 60px rgba(0, 0, 0, .6); color: #E6F1FB; }
.pml-judul { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; color: #E24B4A; margin-bottom: 12px; }
.pml-pesan { margin: 0 0 16px; font-size: 13px; line-height: 1.55; white-space: pre-line; }
.pml-sisa { background: rgba(226, 75, 74, .12); border: 1px solid rgba(226, 75, 74, .45); border-radius: 10px; padding: 12px 16px;
  margin-bottom: 12px; text-align: center; }
.pml-sisa-label { font-size: 10px; letter-spacing: 1px; color: #85B7EB; margin-bottom: 4px; }
.pml-angka { font-family: 'JetBrains Mono', monospace; letter-spacing: 1px; }
.pml-sisa-angka { font-size: 28px; font-weight: 700; color: #EF9F27; }
.pml-catatan { margin: 0 0 18px; font-size: 12px; line-height: 1.5; color: #85B7EB; }
.pml-aksi { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
.pml-spanduk { position: fixed; left: 16px; bottom: 16px; z-index: 10050; width: min(420px, calc(100vw - 32px));
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 10px 14px; border-radius: 10px;
  background: #E24B4A; color: #FFFFFF; font-family: Inter, sans-serif; font-size: 12.5px; line-height: 1.45;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .35); }
.pml-spanduk-teks { flex: 1 1 220px; }
.pml-spanduk-aksi { display: flex; gap: 8px; margin-left: auto; }
.pml-spanduk-tombol { background: transparent; color: #FFFFFF; border: 1px solid rgba(255, 255, 255, .7); border-radius: 6px;
  padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer; }
.pml-spanduk-tombol:hover { background: rgba(255, 255, 255, .16); }
@media (max-width: 560px) { .pml-spanduk { bottom: 92px; } }
[data-theme="light"] .pml-latar { background: rgba(0, 0, 0, .55); }
[data-theme="light"] .pml-kartu { background: #FAFAFA; color: #0F0F12; box-shadow: 0 24px 60px rgba(0, 0, 0, .18); }
[data-theme="light"] .pml-sisa-label, [data-theme="light"] .pml-catatan { color: #6B7280; }
[data-theme="light"] .pml-sisa-angka { color: #BA7517; }
`;
