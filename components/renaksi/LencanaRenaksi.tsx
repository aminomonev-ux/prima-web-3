'use client';
// Lencana "Renaksi" — entri Master/Rekening yang diambil dari Rencana Aksi.
// Hanya layar kerja; Cetak, Excel, PDF tidak memuatnya (docs/CONCEPT-renaksi-terhubung.md §5.2).
// Tooltip lewat portal `Tip`: lencana hidup di dalam tabel ber-overflow.

import Tip from '@/components/ui/Tip';
import { labelLencanaRenaksi } from '@/lib/kinerja/asal-renaksi';

/** Warna mengikuti [data-theme] lewat kelas `.lencana-renaksi` (globals.css). */
export default function LencanaRenaksi({ tahun }: { tahun: string }) {
  return (
    <Tip label={labelLencanaRenaksi(tahun)}>
      <span className="lencana-renaksi" aria-label={labelLencanaRenaksi(tahun)}>
        Renaksi
      </span>
    </Tip>
  );
}
