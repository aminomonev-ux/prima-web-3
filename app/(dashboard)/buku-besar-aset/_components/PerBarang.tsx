'use client';
// Tampilan Per Barang (CONCEPT-bba-perencanaan §5.3): satu baris per barang untuk tahun T. Angka dari
// server (`perBarangTahun` → `ringkasPerBarang`). Baris "Belum ditautkan" membuat kolom Rencana T
// berjumlah sama dengan KPI Total Rencana (pelajaran "Belum ada PJ" Realisasi BLUD).

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import type { PerBarangTahun, BarisPerBarang } from '@/lib/data/buku-besar-aset';
import KartuBarang from './KartuBarang';
import type { Warna } from './ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtVol = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

type Props = {
  tahun: number;
  c: Warna;
  /** Dinaikkan induk sesudah ada yang tertulis (item/tautan) — memicu muat ulang. */
  segarkan: number;
  onTautkan: () => void;
};

export default function PerBarang({ tahun, c, segarkan, onTautkan }: Props) {
  const [data, setData] = useState<PerBarangTahun | null>(null);
  const [galat, setGalat] = useState('');
  const [buka, setBuka] = useState<BarisPerBarang | null>(null);
  const nomor = useRef(0);

  useEffect(() => {
    if (tahun < 2020 || tahun > 2100) return;
    const n = ++nomor.current;
    void Promise.resolve().then(async () => {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/barang?ringkas=1&tahun=${tahun}`);
      if (n !== nomor.current) return; // muatan tahun lain yang pulang terlambat
      if (!d.ok) { setGalat(d.message || 'Gagal memuat'); return; }
      setGalat(''); setData(d as unknown as PerBarangTahun);
    });
  }, [tahun, segarkan]);

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, color: c.text, borderBottom: `1px solid ${c.border}` };
  const tdNum: React.CSSProperties = { ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' };

  if (galat) return <div style={{ fontSize: 12.5, color: '#E24B4A', padding: 12 }}>{galat}</div>;
  if (!data || data.tahun !== tahun) return <div style={{ fontSize: 12.5, color: c.sub, padding: 12 }}>Memuat…</div>;
  const jumlahRencana = data.rows.reduce((s, r) => s + r.rencana_tahun, 0) + data.belum.rencana;

  return (
    <>
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={th}>Barang</th>
            <th style={th}>Eksisting</th>
            <th style={{ ...th, textAlign: 'right' }}>Pernah dibeli</th>
            <th style={{ ...th, textAlign: 'right' }}>Dalam proses</th>
            <th style={{ ...th, textAlign: 'right' }}>Direncanakan {tahun}</th>
            <th style={{ ...th, textAlign: 'center' }}>Item {tahun}</th>
            <th style={{ ...th, textAlign: 'right' }}>Rencana {tahun}</th>
          </tr></thead>
          <tbody>
            {data.rows.length === 0 && data.belum.item === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={7}>Tidak ada data.</td></tr>}
            {data.rows.map((r, i) => {
              const sat = r.satuan || 'unit';
              return (
                <tr key={r.id} onClick={() => setBuka(r)} style={{ background: i % 2 ? c.rowOdd : 'transparent', cursor: 'pointer' }}>
                  <td style={td}><b>{r.nama}</b>{r.kategori_aset ? <span style={{ fontSize: 11, color: c.sub }}> · {r.kategori_aset}</span> : null}</td>
                  <td style={{ ...td, color: c.sub, fontSize: 11.5 }}>Belum didata</td>
                  <td style={tdNum}>
                    {r.dibeli > 0 ? <>{fmtVol(r.dibeli)} {sat}<div style={{ fontSize: 10.5, color: c.sub }}>{r.tahun_beli_terakhir}{r.harga_beli_terakhir ? ` · ${fmtRp(r.harga_beli_terakhir)}/${sat}` : ''}</div></> : <span style={{ color: c.sub }}>—</span>}
                  </td>
                  <td style={{ ...tdNum, color: r.diproses > 0 ? '#378ADD' : c.sub }}>{r.diproses > 0 ? `${fmtVol(r.diproses)} ${sat}` : '—'}</td>
                  <td style={tdNum}>{r.direncanakan > 0 ? `${fmtVol(r.direncanakan)} ${sat}` : '—'}</td>
                  <td style={{ ...td, fontFamily: MONO, textAlign: 'center' }}>{r.item_tahun || '—'}</td>
                  <td style={tdNum}>{r.rencana_tahun > 0 ? fmtRp(r.rencana_tahun) : '—'}</td>
                </tr>
              );
            })}
            {data.belum.item > 0 && (
              <tr style={{ background: 'rgba(186,117,23,.08)' }}>
                <td style={td} colSpan={2}>
                  <span style={{ fontWeight: 600, color: '#BA7517' }}>Belum ditautkan ({data.belum.item} item)</span>
                  <span style={{ marginLeft: 10 }}><PrimaButton variant="warning" size="sm" onClick={onTautkan}>Tautkan</PrimaButton></span>
                </td>
                <td style={{ ...tdNum, color: c.sub }}>—</td>
                <td style={{ ...tdNum, color: c.sub }}>—</td>
                <td style={tdNum}>{data.belum.direncanakan > 0 ? fmtVol(data.belum.direncanakan) : '—'}</td>
                <td style={{ ...td, fontFamily: MONO, textAlign: 'center' }}>{data.belum.item}</td>
                <td style={tdNum}>{fmtRp(data.belum.rencana)}</td>
              </tr>
            )}
          </tbody>
          <tfoot><tr>
            <td style={{ ...td, fontWeight: 700 }} colSpan={6}>Jumlah <span style={{ fontWeight: 400, fontSize: 11, color: c.sub }}>— sama dengan Total Rencana tanpa saringan; usulan ditolak tidak dihitung</span></td>
            <td style={{ ...tdNum, fontWeight: 700 }}>{fmtRp(jumlahRencana)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8 }}>
        Pernah dibeli & dalam proses dihitung s.d. {tahun} (pesanan tahun lalu bisa belum datang). Saringan status/sumber/asal di atas tidak berlaku di tampilan ini.
      </div>
      {buka && (
        <div onClick={() => setBuka(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: 'min(640px, 96vw)', maxHeight: '90vh', overflow: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" aria-label="Tutup" onClick={() => setBuka(null)} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
            </div>
            <KartuBarang barangId={buka.id} tahun={tahun} c={c} tandaiTahun={tahun} />
          </div>
        </div>
      )}
    </>
  );
}
