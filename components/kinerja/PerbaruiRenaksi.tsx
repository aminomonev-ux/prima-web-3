'use client';
// Pemberitahuan "Rencana Aksi berubah" + dialog Perbarui di tab Master & Rekening E-Anggaran.
// Konsep: docs/CONCEPT-renaksi-terhubung.md §5.4–5.5. Pembandingnya murni
// (lib/kinerja/banding-renaksi.ts); yang menulis tetap jalur lama: Edit Master yang menjalar
// (ganti nama), Init Renaksi (baru), dan route asal (tanda). Tidak ada pintu tulis kedua.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import PrimaButton from '@/components/ui/PrimaButton';
import {
  jumlahPerubahan, kalimatSpanduk, type HasilBanding, type ItemEntri,
} from '@/lib/kinerja/banding-renaksi';
import { jumlahJalaran, kalimatJalaran, labelTipeMaster, type DampakData } from '@/lib/kinerja/master-ubah';

const JEDA_MUAT_ULANG_MS = 15 * 60 * 1000;

/**
 * Dimuat saat dibuka / ganti tahun, dan lagi saat tab peramban kembali aktif sesudah 15 menit
 * (pola pengingat LKJIP). Gagal memuat = diam: pemberitahuan bukan syarat bekerja.
 */
export function useBandingRenaksi(tahun: string) {
  // Ditandai tahunnya: hasil tahun sebelumnya tidak ikut tampil selama tahun baru dimuat.
  const [muatan, setMuatan] = useState<{ tahun: string; hasil: HasilBanding | null }>({ tahun, hasil: null });
  const hasil = muatan.tahun === tahun ? muatan.hasil : null;
  const terakhir = useRef(0);
  const giliran = useRef(0);

  const muat = useCallback(async () => {
    const ke = ++giliran.current;
    terakhir.current = Date.now();
    const d = await fetchJson<unknown>(`/api/kinerja/master/banding-renaksi?tahun=${encodeURIComponent(tahun)}`);
    if (ke !== giliran.current) return;
    setMuatan({ tahun, hasil: d.ok ? (d as unknown as HasilBanding) : null });
  }, [tahun]);

  useEffect(() => {
    void muat();
    const saatTampil = () => {
      if (document.visibilityState === 'visible' && Date.now() - terakhir.current >= JEDA_MUAT_ULANG_MS) void muat();
    };
    document.addEventListener('visibilitychange', saatTampil);
    return () => document.removeEventListener('visibilitychange', saatTampil);
  }, [muat]);

  return { hasil, muat, jumlah: hasil ? jumlahPerubahan(hasil) : 0 };
}

export function SpandukRenaksi({ hasil, tahun, isLight, onBuka }: {
  hasil: HasilBanding | null; tahun: string; isLight?: boolean; onBuka: () => void;
}) {
  if (!hasil || jumlahPerubahan(hasil) === 0) return null;
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      padding: '10px 14px', marginBottom: '14px', borderRadius: '10px',
      background: isLight ? 'rgba(186,117,23,.10)' : 'rgba(186,117,23,.14)',
      border: '1px solid rgba(186,117,23,.55)', borderLeft: '3px solid #BA7517',
      color: isLight ? '#854F0B' : '#FAC775', fontSize: '13px', fontWeight: 600,
    }}>
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: '1 1 240px' }}>{kalimatSpanduk(hasil, tahun)}</span>
      <PrimaButton variant="warning" size="sm" iconLeft={<RefreshCw size={14} />} onClick={onBuka}>
        Lihat &amp; perbarui
      </PrimaButton>
    </div>
  );
}

interface HasilUbah { berubah: boolean; gabung_ke: string | null; anak: number; data: DampakData }
type Pratinjau = { ok: true; hasil: HasilUbah } | { ok: false; pesan: string };

const kunciGanti = (id: number) => `g${id}`;
const kunciBaru = (kunci: string) => `b${kunci}`;
const kunciHilang = (id: number) => `h${id}`;
const kunciTanda = (id: number) => `t${id}`;

function jalurTeks(e: { program_ref: string | null; kegiatan_ref: string | null }): string {
  return [e.program_ref, e.kegiatan_ref].filter(Boolean).join(' › ');
}

/**
 * Tiap baris bercentang. Bawaan: ganti nama & baru tercentang (memang perubahan Renaksi),
 * "jadikan manual" & "tandai" tidak (pilihan, bukan perubahan). Diterapkan berurutan:
 * ganti nama (program → kegiatan → sub), lalu baru, lalu tanda. Yang gagal disebut, yang
 * berhasil tetap.
 */
export function PerbaruiRenaksiModal({ tahun, hasil, isLight, canEdit, onTutup, onSelesai }: {
  tahun: string; hasil: HasilBanding; isLight?: boolean; canEdit: boolean;
  onTutup: () => void; onSelesai: () => void;
}) {
  const [pilih, setPilih] = useState<Set<string>>(() => new Set([
    ...hasil.gantiNama.map(g => kunciGanti(g.id)),
    ...hasil.baru.map(b => kunciBaru(b.kunci)),
  ]));
  const [pratinjau, setPratinjau] = useState<Record<number, Pratinjau>>({});
  const [jalan, setJalan] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      for (const g of hasil.gantiNama) {
        const d = await fetchJson<unknown>(`/api/kinerja/master/${g.id}`, { method: 'PUT', body: JSON.stringify({ nama: g.ke, dry: true }) });
        if (batal) return;
        setPratinjau(p => ({ ...p, [g.id]: d.ok ? { ok: true, hasil: d as unknown as HasilUbah } : { ok: false, pesan: d.message || 'Tidak bisa diperiksa' } }));
      }
    })();
    return () => { batal = true; };
  }, [hasil.gantiNama]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !jalan) onTutup(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [jalan, onTutup]);

  const ubah = (k: string) => setPilih(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  async function terapkan() {
    setJalan(true);
    const gagal: string[] = [];
    let ganti = 0, baru = 0, manual = 0, tanda = 0;
    try {
      const urut = { program: 0, kegiatan: 1, subkegiatan: 2 } as const;
      const daftar = hasil.gantiNama.filter(g => pilih.has(kunciGanti(g.id))).sort((a, b) => urut[a.tipe] - urut[b.tipe]);
      for (const g of daftar) {
        const p = pratinjau[g.id];
        const gabung = !!(p && p.ok && p.hasil.gabung_ke);
        const d = await fetchJson<unknown>(`/api/kinerja/master/${g.id}`, { method: 'PUT', body: JSON.stringify({ nama: g.ke, gabung }) });
        if (d.ok) ganti++; else gagal.push(`${labelTipeMaster(g.tipe)} "${g.nama}": ${d.message || 'gagal'}`);
      }
      const pilihBaru = hasil.baru.filter(b => pilih.has(kunciBaru(b.kunci))).map(b => b.kunci);
      if (pilihBaru.length > 0) {
        const d = await fetchJson<unknown>('/api/kinerja/master/init-renaksi', { method: 'POST', body: JSON.stringify({ tahun, pilih: pilihBaru }) });
        if (d.ok) {
          const r = d as unknown as { programInserted: number; kegiatanInserted: number; subkegiatanInserted: number };
          baru = r.programInserted + r.kegiatanInserted + r.subkegiatanInserted;
        } else gagal.push(`Entri baru: ${d.message || 'gagal'}`);
      }
      const kirimAsal = async (ids: number[], asal: 'MANUAL' | 'RENAKSI') => {
        if (ids.length === 0) return 0;
        const d = await fetchJson<unknown>('/api/kinerja/master/asal', { method: 'POST', body: JSON.stringify({ tahun, ids, asal }) });
        if (!d.ok) { gagal.push(`${asal === 'MANUAL' ? 'Jadikan manual' : 'Tandai dari Renaksi'}: ${d.message || 'gagal'}`); return 0; }
        return (d as unknown as { diubah: number }).diubah;
      };
      manual = await kirimAsal(hasil.hilang.filter(e => pilih.has(kunciHilang(e.id))).map(e => e.id), 'MANUAL');
      tanda = await kirimAsal(hasil.belumBertanda.filter(e => pilih.has(kunciTanda(e.id))).map(e => e.id), 'RENAKSI');
    } finally {
      setJalan(false);
    }
    const ringkas = [
      ganti ? `${ganti} berganti nama` : '', baru ? `${baru} entri baru` : '',
      manual ? `${manual} dijadikan manual` : '', tanda ? `${tanda} ditandai dari Renaksi` : '',
    ].filter(Boolean).join(', ');
    if (gagal.length) toast.error(`${ringkas ? `Sebagian diterapkan (${ringkas}). ` : ''}Gagal:\n${gagal.join('\n')}`, { duration: 12000 });
    else if (ringkas) toast.success(`Master diperbarui dari Rencana Aksi ${tahun}: ${ringkas}.`);
    else toast.info('Tidak ada yang dipilih.');
    onSelesai();
  }

  const c = {
    surface: isLight ? '#FFFFFF' : '#042C53',
    border: isLight ? 'rgba(139,92,246,.18)' : '#0C447C',
    text: isLight ? '#1F2937' : '#E6F1FB',
    sub: isLight ? '#6B7280' : '#85B7EB',
    head: isLight ? '#5B21B6' : '#FAC775',
  };
  const judul = (t: string, n: number, ket: string) => (
    <div style={{ margin: '14px 0 6px' }}>
      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: c.head }}>{t} ({n})</div>
      <div style={{ fontSize: '12px', color: c.sub }}>{ket}</div>
    </div>
  );
  const baris = (k: string, isi: React.ReactNode, ket?: React.ReactNode) => (
    <label key={k} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 4px', borderBottom: `1px solid ${c.border}`, cursor: canEdit ? 'pointer' : 'default' }}>
      <input type="checkbox" checked={pilih.has(k)} disabled={!canEdit || jalan} onChange={() => ubah(k)} style={{ marginTop: '3px' }} />
      <span style={{ fontSize: '13px', color: c.text, minWidth: 0 }}>
        {isi}
        {ket && <span style={{ display: 'block', fontSize: '12px', color: c.sub, whiteSpace: 'pre-line' }}>{ket}</span>}
      </span>
    </label>
  );
  const entri = (e: ItemEntri) => (
    <>
      <b>{labelTipeMaster(e.tipe)}</b> {e.nama}
      {jalurTeks(e) && <span style={{ color: c.sub }}> — {jalurTeks(e)}</span>}
    </>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={`Perbarui dari Rencana Aksi ${tahun}`}
      onClick={e => { if (e.target === e.currentTarget && !jalan) onTutup(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '14px', width: '100%', maxWidth: '720px', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontWeight: 800, fontSize: '15px', color: c.text }}>Perbarui dari Rencana Aksi {tahun}</div>
          <button onClick={onTutup} disabled={jalan} aria-label="Tutup" style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '4px 18px 14px', overflowY: 'auto' }}>
          <p style={{ fontSize: '12.5px', color: c.sub, margin: '10px 0 0' }}>
            Nama yang ditulis ke Master = nama Rencana Aksi tanpa penanda bintang. Ganti nama ikut mengubah Rekening, RKO (semua versi, termasuk yang terkunci), dan Realisasi — angkanya tidak berubah. Tidak ada entri yang dihapus.
          </p>

          {hasil.gantiNama.length > 0 && judul('Berganti nama', hasil.gantiNama.length, 'Diganti lewat Edit Master yang menjalar.')}
          {hasil.gantiNama.map(g => {
            const p = pratinjau[g.id];
            const ket = !p ? 'Memeriksa dampak…'
              : !p.ok ? `Tidak bisa diterapkan: ${p.pesan}`
              : [
                p.hasil.gabung_ke ? `"${p.hasil.gabung_ke}" sudah ada di Master — entri ini akan digabung ke sana.` : '',
                p.hasil.anak ? `${p.hasil.anak} entri di bawahnya ikut pindah.` : '',
                jumlahJalaran(p.hasil.data) ? `Ikut berganti nama:\n${kalimatJalaran(p.hasil.data)}` : '',
              ].filter(Boolean).join('\n');
            return baris(kunciGanti(g.id), <><b>{labelTipeMaster(g.tipe)}</b> {g.nama} → <b>{g.ke}</b></>, ket || undefined);
          })}

          {hasil.baru.length > 0 && judul('Baru di Rencana Aksi', hasil.baru.length, 'Ditambahkan ke Master dengan tanda Renaksi. Induk yang juga baru ikut dibuat.')}
          {hasil.baru.map(b => baris(kunciBaru(b.kunci), <><b>{labelTipeMaster(b.tipe)}</b> {b.nama}{jalurTeks(b) && <span style={{ color: c.sub }}> — {jalurTeks(b)}</span>}</>))}

          {hasil.hilang.length > 0 && judul('Tidak ada lagi di Rencana Aksi', hasil.hilang.length, 'Tidak dihapus dari E-Anggaran. Centang untuk melepas tanda Renaksi (jadikan manual).')}
          {hasil.hilang.map(e => baris(kunciHilang(e.id), entri(e)))}

          {hasil.belumBertanda.length > 0 && judul('Sudah ada, belum bertanda', hasil.belumBertanda.length, 'Diketik tangan di Master, jalurnya ada di Rencana Aksi. Centang untuk menandainya.')}
          {hasil.belumBertanda.map(e => baris(kunciTanda(e.id), entri(e)))}

          {!canEdit && <p style={{ fontSize: '12.5px', color: c.sub, marginTop: '12px' }}>Anda hanya bisa melihat — memperbarui butuh hak mengubah Master.</p>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
          <PrimaButton variant="ghost" onClick={onTutup} disabled={jalan}>Batal</PrimaButton>
          {canEdit && (
            <PrimaButton variant="primary" menulis onClick={terapkan} disabled={jalan || pilih.size === 0}>
              {jalan ? 'Menerapkan…' : `Terapkan (${pilih.size})`}
            </PrimaButton>
          )}
        </div>
      </div>
    </div>
  );
}
