'use client';

// Pratinjau Cetak = PDF buatan LibreOffice dari Word yang SAMA dgn Unduh Word (konsep §1).
// Penampil PDF bawaan peramban sudah menyediakan perbesaran, lompat halaman, panel bab, cetak.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';

export const KALIMAT_ACUAN = 'Dibuat LibreOffice dari berkas Word yang sama. Bila letak halaman berbeda, yang berlaku Word.';

export interface HasilPdf { blob: Blob; nama: string; halaman: number | null; hurufHilang: string | null }

/** Ambil PDF dokumen. Galat server dipulangkan sebagai pesan yang bisa dibaca orang. */
export async function ambilPdf(dokumenId: number, tampil: boolean, signal?: AbortSignal): Promise<HasilPdf> {
  let res: Response;
  try {
    res = await fetch(`/api/lkjip/${dokumenId}/generate?format=pdf${tampil ? '&tampil=1' : ''}`, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('Gagal menghubungi server.');
  }
  if (!res.ok) {
    let pesan = `PDF gagal dibuat (${res.status}).`;
    try { const j = await res.json() as { msg?: string }; if (j.msg) pesan = j.msg; } catch { /* bukan JSON */ }
    throw new Error(pesan);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') ?? '';
  const m = /filename="([^"]+)"/.exec(cd);
  const halaman = Number(res.headers.get('X-Lkjip-Halaman'));
  const huruf = res.headers.get('X-Lkjip-Huruf-Hilang');
  return {
    blob,
    nama: m ? decodeURIComponent(m[1]) : `LKJIP-${dokumenId}.pdf`,
    halaman: Number.isFinite(halaman) && halaman > 0 ? halaman : null,
    hurufHilang: huruf ? decodeURIComponent(huruf) : null,
  };
}

export function simpanBlob(blob: Blob, nama: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const kalimatHurufHilang = (huruf: string) =>
  `Huruf ${huruf} tidak terpasang di server; PDF memakai huruf pengganti, letak halaman bisa berbeda dari Word.`;

/** Tombol dock Unduh PDF: berkas lampiran (audit LKJIP_GENERATE format pdf). */
export async function unduhPdf(dokumenId: number) {
  const tunggu = toast.loading('Menyusun PDF… (beberapa detik)');
  try {
    const h = await ambilPdf(dokumenId, false);
    simpanBlob(h.blob, h.nama);
    if (h.hurufHilang) toast.warning(kalimatHurufHilang(h.hurufHilang), { duration: 9000 });
    else toast.success(`PDF diunduh${h.halaman ? ` (${h.halaman} halaman)` : ''}`);
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    toast.dismiss(tunggu);
  }
}

// Chrome Android tidak menampilkan PDF di dalam iframe → layar sempit memakai tombol Buka PDF.
const KUERI_SEMPIT = '(max-width: 760px)';
const langgananSempit = (cb: () => void) => { const m = window.matchMedia(KUERI_SEMPIT); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
const bacaSempit = () => window.matchMedia(KUERI_SEMPIT).matches;

type Keadaan =
  | { tahap: 'muat' }
  | { tahap: 'siap'; url: string; hasil: HasilPdf }
  | { tahap: 'galat'; pesan: string };

export default function PratinjauPdf({ dokumenId, judul, onTutup }: { dokumenId: number; judul: string; onTutup: () => void }) {
  const [k, setK] = useState<Keadaan>({ tahap: 'muat' });
  const [ulang, setUlang] = useState(0);
  const sempit = useSyncExternalStore(langgananSempit, bacaSempit, () => false);

  useEffect(() => {
    // Satu permintaan per pembukaan; ditutup/diulang di tengah jalan = jawaban lama dibuang (AbortController).
    const henti = new AbortController();
    let url: string | null = null;
    ambilPdf(dokumenId, true, henti.signal)
      .then(hasil => { url = URL.createObjectURL(hasil.blob); setK({ tahap: 'siap', url, hasil }); })
      .catch((e: Error) => { if (e.name !== 'AbortError') setK({ tahap: 'galat', pesan: e.message }); });
    return () => { henti.abort(); if (url) URL.revokeObjectURL(url); };
  }, [dokumenId, ulang]);

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup(); };
    window.addEventListener('keydown', tekan);
    return () => window.removeEventListener('keydown', tekan);
  }, [onTutup]);

  return (
    <div className="lk-pdf-bg" onClick={onTutup}>
      <style>{PDF_CSS}</style>
      <div className="lk-pdf" role="dialog" aria-label="Pratinjau cetak" onClick={e => e.stopPropagation()}>
        <header className="lk-pdf-kepala">
          <div className="lk-pdf-judul">
            <FileText size={16} />
            <span className="lk-pdf-nama">Pratinjau Cetak — {judul}</span>
            {k.tahap === 'siap' && k.hasil.halaman != null && <span className="lk-pdf-hlm">{k.hasil.halaman} halaman</span>}
          </div>
          <div className="lk-pdf-aksi">
            {k.tahap === 'siap' && (
              <PrimaButton variant="success" iconLeft={<Download size={14} />} onClick={() => simpanBlob(k.hasil.blob, k.hasil.nama)}>Unduh PDF</PrimaButton>
            )}
            <PrimaButton variant="ghost" iconLeft={<Download size={14} />} onClick={() => window.open(`/api/lkjip/${dokumenId}/generate`, '_blank')}>Unduh Word</PrimaButton>
            <button type="button" className="lk-pdf-tutup" onClick={onTutup} aria-label="Tutup pratinjau"><X size={18} /></button>
          </div>
        </header>
        <p className="lk-pdf-acuan">{KALIMAT_ACUAN}</p>
        {k.tahap === 'siap' && k.hasil.hurufHilang && <p className="lk-pdf-ingat">{kalimatHurufHilang(k.hasil.hurufHilang)}</p>}

        <div className="lk-pdf-isi">
          {k.tahap === 'muat' && <div className="lk-pdf-pesan">Menyusun halaman… (beberapa detik)</div>}
          {k.tahap === 'galat' && (
            <div className="lk-pdf-pesan">
              <p>{k.pesan}</p>
              <PrimaButton variant="ghost" onClick={() => { setK({ tahap: 'muat' }); setUlang(n => n + 1); }}>Coba lagi</PrimaButton>
            </div>
          )}
          {k.tahap === 'siap' && (sempit
            ? (
              <div className="lk-pdf-pesan">
                <p>Layar sempit tidak bisa menampilkan PDF di sini.</p>
                <PrimaButton variant="primary" iconLeft={<ExternalLink size={14} />} onClick={() => window.open(k.url, '_blank')}>Buka PDF</PrimaButton>
              </div>
            )
            : <iframe className="lk-pdf-bingkai" src={k.url} title="Pratinjau PDF" />)}
        </div>
      </div>
    </div>
  );
}

const PDF_CSS = `
  /* 450 = lapisan modal LKJIP: di atas FloatingDock (400), di bawah confirmDialog (4000). */
  .lk-pdf-bg { position: fixed; inset: 0; z-index: 450; background: rgba(2,15,28,0.78); backdrop-filter: blur(4px); display: flex; align-items: stretch; justify-content: center; padding: 14px; }
  .lk-pdf { display: flex; flex-direction: column; width: min(1180px, 100%); background: #042C53; border: 1px solid #0C447C; border-radius: 14px; overflow: hidden; }
  .lk-pdf-kepala { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid #0C447C; }
  .lk-pdf-judul { display: flex; align-items: center; gap: 8px; min-width: 0; color: #E6F1FB; font-weight: 800; font-size: 14px; }
  .lk-pdf-nama { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lk-pdf-hlm { flex-shrink: 0; font-weight: 600; font-size: 12px; color: #85B7EB; }
  .lk-pdf-aksi { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .lk-pdf-tutup { background: transparent; border: 1px solid #0C447C; color: #B5D4F4; width: 32px; height: 32px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .lk-pdf-tutup:hover { border-color: #185FA5; color: #E6F1FB; }
  .lk-pdf-acuan { margin: 0; padding: 7px 16px; font-size: 11.5px; color: #85B7EB; border-bottom: 1px solid #0C447C; }
  .lk-pdf-ingat { margin: 0; padding: 7px 16px; font-size: 12px; color: #FAC775; background: rgba(186,117,23,0.14); border-bottom: 1px solid #0C447C; }
  .lk-pdf-isi { flex: 1; min-height: 0; display: flex; background: #020F1C; }
  .lk-pdf-bingkai { flex: 1; width: 100%; border: 0; background: #020F1C; }
  .lk-pdf-pesan { margin: auto; padding: 24px 16px; text-align: center; color: #B5D4F4; font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .lk-pdf-pesan p { margin: 0; max-width: 460px; line-height: 1.5; }
  [data-theme="light"] .lk-pdf { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-pdf-kepala, [data-theme="light"] .lk-pdf-acuan, [data-theme="light"] .lk-pdf-ingat { border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-pdf-judul { color: #0F0F12; }
  [data-theme="light"] .lk-pdf-hlm, [data-theme="light"] .lk-pdf-acuan { color: #6B7280; }
  [data-theme="light"] .lk-pdf-ingat { color: #854F0B; background: #FEF3C7; }
  [data-theme="light"] .lk-pdf-isi { background: #F5F5F7; }
  [data-theme="light"] .lk-pdf-pesan { color: #374151; }
  [data-theme="light"] .lk-pdf-tutup { border-color: rgba(0,0,0,.15); color: #4B5563; }
  @media (max-width: 560px) { .lk-pdf-bg { padding: 0; } .lk-pdf { border-radius: 0; border: 0; } }
`;
