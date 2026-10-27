'use client';
// Bar kondisi Baik / Rusak Ringan / Rusak Berat dari register Buku Aset (docs/CONCEPT-bba-buku-aset.md §8).
// Warna = token action-success / action-warning / action-danger, sama dengan warna status BBA.

import type { Kondisi } from '@/lib/bba/kondisi';

export const WARNA_KONDISI = { baik: '#1D9E75', rusak_ringan: '#BA7517', rusak_berat: '#E24B4A' } as const;
const MONO = "'JetBrains Mono', ui-monospace, monospace";

export default function BarKondisi({ k, sub, satuan = 'unit', ringkas }: { k: Kondisi; sub: string; satuan?: string; ringkas?: boolean }) {
  const bagian = (['baik', 'rusak_ringan', 'rusak_berat'] as const).filter(x => k[x] > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <div style={{ display: 'flex', height: ringkas ? 6 : 8, borderRadius: 4, overflow: 'hidden', background: sub, opacity: k.total === 0 ? .25 : 1 }}>
        {bagian.map(x => <span key={x} style={{ width: `${(k[x] / k.total) * 100}%`, background: WARNA_KONDISI[x] }} />)}
      </div>
      <div style={{ fontSize: ringkas ? 10.5 : 11.5, color: sub, fontFamily: MONO, whiteSpace: 'nowrap' }}>
        <span style={{ color: WARNA_KONDISI.baik }}>{k.baik}</span> baik · <span style={{ color: WARNA_KONDISI.rusak_ringan }}>{k.rusak_ringan}</span> RR · <span style={{ color: WARNA_KONDISI.rusak_berat }}>{k.rusak_berat}</span> RB
        {!ringkas && <> = {k.total.toLocaleString('id-ID')} {satuan}</>}
      </div>
    </div>
  );
}
