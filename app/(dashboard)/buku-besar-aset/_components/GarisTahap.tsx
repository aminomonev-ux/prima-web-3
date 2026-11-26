'use client';
// Garis 5 titik tahap rencana (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.2) — Rencana · Diputuskan · Dipesan ·
// Diterima · Tercatat. Cabang di luar urutan utama (tidak didanai, batal dibeli) merah; usulan ditolak abu-abu.
import { LABEL_TAHAP, TITIK_TAHAP, langkahTahap, type Tahap } from '@/lib/bba/tahap';

export default function GarisTahap({ tahap, sub, tanpaLabel = false }: { tahap: Tahap; sub: string; tanpaLabel?: boolean }) {
  const { langkah, cabang } = langkahTahap(tahap);
  const isi = cabang === 'MERAH' ? '#E24B4A' : cabang === 'ABU' ? sub : '#1D9E75';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span role="img" aria-label={`Tahap: ${LABEL_TAHAP[tahap]}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
        {TITIK_TAHAP.map((nama, i) => {
          const lewat = i < langkah;
          return (
            <span key={nama} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && <span style={{ width: 10, height: 2, background: lewat ? isi : sub, opacity: lewat ? 1 : .35 }} />}
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: `1.5px solid ${lewat ? isi : sub}`, background: lewat ? isi : 'transparent', opacity: lewat ? 1 : .5 }} />
            </span>
          );
        })}
      </span>
      {!tanpaLabel && <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', color: cabang === 'MERAH' ? '#E24B4A' : cabang === 'ABU' ? sub : 'inherit' }}>{LABEL_TAHAP[tahap]}</span>}
    </span>
  );
}
