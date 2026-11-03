'use client';
// components/lkjip/SalinKeLkjip.tsx — tombol "Salin ke LKJIP" di layar modul (Cetak E-Anggaran, Cetak
// Renaksi, Laporan per Sumber Dana). Menyalin tabel di layar + resepnya; di LKJIP tempelannya jadi
// tabel tertaut. Konsep: docs/CONCEPT-lkjip-tabel-dari-modul.md

import { ClipboardCopy } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { htmlSalinan, type SalinanModul } from '@/lib/lkjip/salinan-modul';

/**
 * Lewat event `copy` + `execCommand`, bukan `navigator.clipboard`: server kantor http, dan Clipboard
 * API hanya hidup di halaman https/localhost. Pola yang sama dengan Ctrl+C di editor tabel LKJIP.
 */
function salinHtmlKePapanKlip(html: string, teks: string): boolean {
  let terisi = false;
  const tangkap = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/html', html);
    e.clipboardData.setData('text/plain', teks);
    e.preventDefault();
    terisi = true;
  };
  document.addEventListener('copy', tangkap);
  try { document.execCommand('copy'); } catch { /* terisi tetap false */ } finally { document.removeEventListener('copy', tangkap); }
  return terisi;
}

interface Props {
  /** `null` = tombol mati (mis. Cetak Detail "Semua Bulan" — satu tabel LKJIP = satu bulan). */
  salinan: SalinanModul | null;
  /** Tabel di layar yang disalin, dicari saat diklik. */
  tabel: () => HTMLTableElement | null;
  alasanMati?: string;
}

export default function SalinKeLkjip({ salinan, tabel, alasanMati }: Props) {
  function salin() {
    if (!salinan) return;
    const t = tabel();
    const ok = salinHtmlKePapanKlip(htmlSalinan(salinan, t?.outerHTML ?? ''), t?.innerText ?? salinan.judul);
    if (ok) toast.success('Tabel disalin. Di LKJIP: klik sel tabel kosong lalu tekan Ctrl+V, atau pakai "Tempel dari Modul".', { duration: 6000 });
    else toast.error('Peramban menolak menyalin. Coba lagi.');
  }
  return (
    <PrimaButton variant="ghost" size="sm" iconLeft={<ClipboardCopy size={14} />} onClick={salin} disabled={!salinan}
      data-tooltip={salinan ? 'Salin tabel ini lalu tempel di LKJIP. Tabelnya tetap tersambung ke modul ini dan bisa diperbarui.' : alasanMati}>
      Salin ke LKJIP
    </PrimaButton>
  );
}
