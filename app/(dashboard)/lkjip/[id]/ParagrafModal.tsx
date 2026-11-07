'use client';

// Dialog Paragraf (menu klik kanan): perataan, indent, dan spasi — nilai & aturannya di `halaman.ts`, sama dengan
// penggaris dan ekspor Word. Baru diterapkan saat Terapkan, satu langkah Undo.

import { useEffect, useState } from 'react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import { BUTIR_GANTUNG_DXA, TWIPS_PER_CM, jepitInden, jepitSpasi, type Inden, type JenisInden, type Spasi } from '@/lib/lkjip/halaman';

export type PerataanNarasi = 'left' | 'center' | 'right' | 'justify';
const angkaCm = (dxa: number) => Math.round((dxa / TWIPS_PER_CM) * 100) / 100;
const dxaDariCm = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * TWIPS_PER_CM) : 0; };
const TWIPS_PER_PT = 20;
const angkaPt = (twips: number) => Math.round((twips / TWIPS_PER_PT) * 10) / 10;
const twipsDariPt = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * TWIPS_PER_PT) : 0; };
const PILIHAN_BARIS = [{ nilai: 240, label: 'Tunggal (1)' }, { nilai: 276, label: '1,15' }, { nilai: 360, label: '1,5' }, { nilai: 480, label: 'Ganda (2)' }];

interface Props {
  inden: Inden;
  jenis: JenisInden;
  perataan: PerataanNarasi | null;
  spasi: Spasi;
  onTerapkan: (hasil: { inden: Inden; perataan: PerataanNarasi | null; spasi: Spasi }) => void;
  onTutup: () => void;
}

export default function ParagrafModal({ inden, jenis, perataan, spasi, onTerapkan, onTutup }: Props) {
  const [draf, setDraf] = useState<Inden>(inden);
  const [drafSpasi, setDrafSpasi] = useState<Spasi>(spasi);
  const [rata, setRata] = useState<PerataanNarasi | null>(perataan);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onTutup]);
  const khusus = draf.pertama > 0 ? 'pertama' : draf.pertama < 0 ? 'gantung' : 'tanpa';
  const ubahKhusus = (nilai: string, besar: number) => {
    if (nilai === 'tanpa') setDraf(d => ({ ...d, pertama: 0 }));
    else if (nilai === 'pertama') setDraf(d => ({ ...d, pertama: besar || 720 }));
    else { const b = besar || BUTIR_GANTUNG_DXA; setDraf(d => ({ ...d, kiri: Math.max(d.kiri, b), pertama: -b })); }
  };
  return (
    <div className="lk-modal-bg" onMouseDown={onTutup}>
      <div className="lk-modal lk-paragraf" role="dialog" aria-modal="true" aria-label="Paragraf" onMouseDown={e => e.stopPropagation()}>
        <h3>Paragraf</h3>
        <label className="lk-paragraf-baris">Perataan
          <select value={rata ?? ''} onChange={e => setRata((e.target.value || null) as PerataanNarasi | null)}>
            <option value="">Ikut setelan dokumen</option>
            <option value="left">Rata kiri</option>
            <option value="center">Rata tengah</option>
            <option value="right">Rata kanan</option>
            <option value="justify">Rata kiri-kanan</option>
          </select>
        </label>
        <div className="lk-paragraf-judul">Indentasi</div>
        <div className="lk-paragraf-kisi">
          <label>Kiri (cm)
            <PrimaNumberField size="sm" desimal={2} min={0} step={0.05} value={angkaCm(draf.kiri)} onChange={e => setDraf(d => ({ ...d, kiri: dxaDariCm(e.target.value) }))} />
          </label>
          <label>Kanan (cm)
            <PrimaNumberField size="sm" desimal={2} min={0} step={0.05} value={angkaCm(draf.kanan)} onChange={e => setDraf(d => ({ ...d, kanan: dxaDariCm(e.target.value) }))} />
          </label>
          <label>Khusus
            <select value={khusus} disabled={jenis === 'butir'} onChange={e => ubahKhusus(e.target.value, Math.abs(draf.pertama))}>
              <option value="tanpa">Tanpa</option>
              <option value="pertama">Baris pertama</option>
              <option value="gantung">Gantung</option>
            </select>
          </label>
          <label>Sebesar (cm)
            <PrimaNumberField size="sm" desimal={2} min={0} step={0.05} disabled={khusus === 'tanpa'} value={angkaCm(Math.abs(draf.pertama))} onChange={e => ubahKhusus(khusus, dxaDariCm(e.target.value))} />
          </label>
        </div>
        <div className="lk-paragraf-judul">Spasi</div>
        <div className="lk-paragraf-kisi">
          <label>Sebelum (pt)
            <PrimaNumberField size="sm" desimal={1} min={0} max={200} step={6} value={angkaPt(drafSpasi.sebelum)} onChange={e => setDrafSpasi(s => ({ ...s, sebelum: twipsDariPt(e.target.value) }))} />
          </label>
          <label>Sesudah (pt)
            <PrimaNumberField size="sm" desimal={1} min={0} max={200} step={6} value={angkaPt(drafSpasi.sesudah)} onChange={e => setDrafSpasi(s => ({ ...s, sesudah: twipsDariPt(e.target.value) }))} />
          </label>
          <label>Spasi baris
            <select value={drafSpasi.baris} onChange={e => setDrafSpasi(s => ({ ...s, baris: Number(e.target.value) }))}>
              {!PILIHAN_BARIS.some(p => p.nilai === drafSpasi.baris) && <option value={drafSpasi.baris}>{String(Math.round((drafSpasi.baris / 240) * 100) / 100).replace('.', ',')}</option>}
              {PILIHAN_BARIS.map(p => <option key={p.nilai} value={p.nilai}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="lk-modal-actions">
          <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
          <PrimaButton variant="primary" onClick={() => onTerapkan({ inden: jepitInden(draf, jenis), perataan: rata, spasi: jepitSpasi(drafSpasi) })}>Terapkan</PrimaButton>
        </div>
      </div>
    </div>
  );
}
