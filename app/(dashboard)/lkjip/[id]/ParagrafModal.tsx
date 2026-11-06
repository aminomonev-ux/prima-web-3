'use client';

// Dialog Paragraf (menu klik kanan): perataan + indent, nilai & aturannya sama dengan penggaris (`halaman.ts`).
// Baru diterapkan saat Terapkan, satu langkah Undo. Spasi per paragraf menyusul (konsep daftar-word §2).

import { useEffect, useState } from 'react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import { BUTIR_GANTUNG_DXA, TWIPS_PER_CM, jepitInden, type Inden, type JenisInden } from '@/lib/lkjip/halaman';

export type PerataanNarasi = 'left' | 'center' | 'right' | 'justify';
const angkaCm = (dxa: number) => Math.round((dxa / TWIPS_PER_CM) * 100) / 100;
const dxaDariCm = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * TWIPS_PER_CM) : 0; };

interface Props {
  inden: Inden;
  jenis: JenisInden;
  perataan: PerataanNarasi | null;
  onTerapkan: (hasil: { inden: Inden; perataan: PerataanNarasi | null }) => void;
  onTutup: () => void;
}

export default function ParagrafModal({ inden, jenis, perataan, onTerapkan, onTutup }: Props) {
  const [draf, setDraf] = useState<Inden>(inden);
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
        <div className="lk-modal-actions">
          <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
          <PrimaButton variant="primary" onClick={() => onTerapkan({ inden: jepitInden(draf, jenis), perataan: rata })}>Terapkan</PrimaButton>
        </div>
      </div>
    </div>
  );
}
