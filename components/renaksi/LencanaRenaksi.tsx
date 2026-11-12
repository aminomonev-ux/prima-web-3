'use client';
// Lencana "Renaksi" — entri Master/Rekening yang diambil dari Rencana Aksi.
// Hanya layar kerja; Cetak, Excel, PDF tidak memuatnya (docs/CONCEPT-renaksi-terhubung.md §5.2).
// Tooltip lewat portal `Tip`: lencana hidup di dalam tabel ber-overflow.

import Tip from '@/components/ui/Tip';
import { labelLencanaRenaksi } from '@/lib/kinerja/asal-renaksi';

export default function LencanaRenaksi({ tahun, isLight }: { tahun: string; isLight?: boolean }) {
  return (
    <Tip label={labelLencanaRenaksi(tahun)}>
      <span
        aria-label={labelLencanaRenaksi(tahun)}
        style={{
          display: 'inline-block', verticalAlign: 'middle', marginLeft: '6px',
          padding: '1px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
          letterSpacing: '.03em', whiteSpace: 'nowrap', lineHeight: 1.5,
          color: isLight ? '#5B21B6' : '#C4B5FD',
          background: isLight ? 'rgba(124,92,252,.10)' : 'rgba(124,92,252,.18)',
          border: `1px solid ${isLight ? 'rgba(124,92,252,.35)' : 'rgba(124,92,252,.45)'}`,
        }}
      >
        Renaksi
      </span>
    </Tip>
  );
}
