'use client';
// Aset sasaran rencana (docs/CONCEPT-bba-buku-aset.md §7.3): yang diganti, diperbaiki, atau direhab.
// Hanya mengubah ISIAN — ditulis server saat Simpan item, di transaksi yang sama (L78).

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { LABEL_KONDISI } from '@/lib/bba/kib';
import type { AsetOpname } from '@/lib/data/bba-aset';
import type { SasaranRencana } from '@/lib/data/buku-besar-aset';
import type { Warna } from './ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const WARNA_KONDISI = { B: '#1D9E75', RR: '#BA7517', RB: '#E24B4A' } as const;

export const keSasaran = (a: AsetOpname): SasaranRencana => ({
  id: a.id, golongan: a.golongan, nama: a.nama?.trim() || a.nama_resmi, register: a.register, tahun: a.tahun_perolehan,
  lokasi: a.lokasi_nama, kondisi: a.kondisi, status: a.status,
});

type Props = {
  c: Warna; inp: React.CSSProperties; barangId: number | null;
  dipilih: SasaranRencana[]; onUbah: (xs: SasaranRencana[]) => void;
};

export default function PilihSasaran({ c, inp, barangId, dipilih, onUbah }: Props) {
  const [buka, setBuka] = useState(false);
  const [q, setQ] = useState('');
  const [calon, setCalon] = useState<SasaranRencana[] | null>(null);
  const nomor = useRef(0);

  async function cari(teks: string) {
    const n = ++nomor.current;
    const p = new URLSearchParams({ sasaran: '1' });
    if (barangId) p.set('barang', String(barangId));
    if (teks.trim()) p.set('q', teks.trim());
    if (!barangId && !teks.trim()) { setCalon([]); return; }
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/aset?${p}`);
    if (n !== nomor.current) return;
    if (!d.ok) { toast.error(d.message || 'Gagal memuat aset'); setCalon([]); return; }
    setCalon((d as unknown as { rows: AsetOpname[] }).rows.map(keSasaran));
  }

  useEffect(() => {
    if (!buka) return;
    const t = setTimeout(() => { void cari(q); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cari membaca barang & teks terbaru
  }, [buka, q, barangId]);

  const terpilih = new Set(dipilih.map(x => x.id));
  const label = (x: SasaranRencana) => `${x.nama}${x.register ? ` · reg. ${x.register}` : ''}`;
  const ket = (x: SasaranRencana) => [x.tahun ? `perolehan ${x.tahun}` : '', x.lokasi ?? ''].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {dipilih.length === 0
        ? <span style={{ fontSize: 12, color: c.sub }}>Belum ada — pilih register yang diganti / diperbaiki / direhab (boleh kosong untuk penambahan & pengadaan baru).</span>
        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dipilih.map(x => (
              <span key={x.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 4px 2px 10px', fontSize: 11.5 }}>
                {label(x)}
                {x.kondisi && <b style={{ color: WARNA_KONDISI[x.kondisi], fontFamily: MONO }}>{x.kondisi}</b>}
                {x.status === 'DIHAPUS' && <b style={{ color: '#E24B4A' }}>dihapus</b>}
                <button type="button" aria-label={`Lepas ${label(x)}`} onClick={() => onUbah(dipilih.filter(y => y.id !== x.id))}
                  style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', display: 'flex', padding: 2 }}><X size={12} /></button>
              </span>
            ))}
          </div>}
      <div>
        <button type="button" onClick={() => setBuka(b => !b)}
          style={{ background: 'none', border: 'none', color: '#7C5CFC', cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline' }}>
          {buka ? 'Tutup pilihan' : '+ Pilih aset sasaran'}
        </button>
      </div>
      {buka && (
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={barangId ? 'Saring register barang ini, atau cari aset lain (mis. gedung)…' : 'Cari aset: nama, kode barang, register…'} style={inp} aria-label="Cari aset sasaran" />
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            {calon === null ? <span style={{ fontSize: 12, color: c.sub }}>Memuat…</span>
              : calon.length === 0 ? <span style={{ fontSize: 12, color: c.sub }}>{barangId || q.trim() ? 'Tidak ada aset aktif yang cocok.' : 'Ketik untuk mencari.'}</span>
              : calon.map(x => (
                <label key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', fontSize: 12, cursor: 'pointer', borderTop: `1px solid ${c.border}` }}>
                  <input type="checkbox" checked={terpilih.has(x.id)} onChange={e => onUbah(e.target.checked ? [...dipilih, x] : dipilih.filter(y => y.id !== x.id))} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {label(x)} <span style={{ color: c.sub, fontFamily: MONO, fontSize: 10.5 }}>{x.golongan}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: c.sub }}>{ket(x)}</span>
                  </span>
                  {x.kondisi && <span style={{ color: WARNA_KONDISI[x.kondisi], fontWeight: 600, fontSize: 11 }}>{LABEL_KONDISI[x.kondisi].toLowerCase()}</span>}
                </label>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
