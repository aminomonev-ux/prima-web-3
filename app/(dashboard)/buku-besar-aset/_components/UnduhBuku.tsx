'use client';
// Unduh "BBA {tahun} — Rencana s.d. Pengadaan.xlsx" + status salinan Drive (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B).
// Satu berkas lima lembar; `lembar` = lembar yang aktif saat dibuka (menu tempat tombolnya ditekan).
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileSpreadsheet, CloudUpload } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import type { LembarBuku } from '@/lib/bba/laporan-excel';
import type { WarnaBba } from './BbaShell';

export const urlBukuRencana = (tahun: number, lembar: LembarBuku) => `/api/buku-besar-aset/unduh?tahun=${tahun}&lembar=${encodeURIComponent(lembar)}`;

// Berkas dikirim server dengan Content-Disposition attachment — halaman tidak berpindah.
export function TombolUnduhBuku({ tahun, lembar }: { tahun: number; lembar: LembarBuku }) {
  return (
    <PrimaButton variant="success" size="sm" iconLeft={<FileSpreadsheet size={14} />} disabled={tahun < 2020 || tahun > 2100}
      data-tooltip={`BBA ${tahun} — Rencana s.d. Pengadaan (5 lembar, terbuka di lembar ${lembar})`}
      onClick={() => { window.location.href = urlBukuRencana(tahun, lembar); }}>Unduh Excel</PrimaButton>
  );
}

type Status = { diatur: boolean; terakhir: { pada: string; ok: boolean; pesan: string } | null; berkas: Array<{ kunci: string; terkirim_pada: string | null; galat: string | null; menunggu: boolean }> };

/** Tanda hidup salinan otomatis (pelajaran cadangan DB yang dulu berhenti 2 bulan tanpa ada yang sadar). */
export function StatusDriveBba({ c, bolehKirim }: { c: WarnaBba; bolehKirim: boolean }) {
  const [s, setS] = useState<Status | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const muat = useCallback(async () => { const d = await fetchJson<unknown>('/api/buku-besar-aset/drive-kirim'); if (d.ok) setS(d as unknown as Status); }, []);
  useEffect(() => { void Promise.resolve().then(muat); }, [muat]);
  async function kirim() {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/drive-kirim', { method: 'POST' }) as unknown as { ok: boolean; message?: string; dikirim?: string[]; gagal?: string[] };
      if (!d.ok) toast.error(d.message || 'Gagal mengirim');
      else if (d.gagal?.length) toast.error(`${d.dikirim?.length ?? 0} terkirim, ${d.gagal.length} gagal: ${d.gagal[0]}`);
      else toast.success(d.dikirim?.length ? `${d.dikirim.length} berkas terkirim ke Drive` : 'Tidak ada yang berubah sejak kiriman terakhir');
      void muat();
    } finally { setSibuk(false); }
  }
  if (!s) return null;
  const menunggu = s.berkas.filter(b => b.menunggu).length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, border: `1px solid ${s.terakhir && !s.terakhir.ok ? '#E24B4A' : c.border}`, background: c.card, fontSize: 12.5, marginBottom: 12 }}>
      <CloudUpload size={16} color={c.sub} />
      <span style={{ flex: 1, minWidth: 220 }}>
        <b>Salinan otomatis ke Google Drive</b> — folder &ldquo;07 Laporan Buku Besar Aset&rdquo;, paling lambat ± 7 menit sesudah perubahan.{' '}
        {!s.diatur ? <span style={{ color: '#BA7517' }}>Folder induk Drive belum diatur (Admin Panel → Drive &amp; Backup).</span>
          : s.terakhir ? <span style={{ color: s.terakhir.ok ? c.sub : '#E24B4A' }}>Terakhir terkirim: {s.terakhir.pada.slice(0, 16)} · {s.terakhir.ok ? 'berhasil' : s.terakhir.pesan}</span>
          : <span style={{ color: c.sub }}>Belum pernah terkirim.</span>}
        {s.diatur && menunggu > 0 && <span style={{ color: c.sub }}> · {menunggu} berkas menunggu dikirim</span>}
      </span>
      {bolehKirim && s.diatur && <PrimaButton menulis variant="primary" size="sm" disabled={sibuk} onClick={() => void kirim()}>{sibuk ? 'Mengirim…' : 'Kirim ke Drive sekarang'}</PrimaButton>}
    </div>
  );
}
