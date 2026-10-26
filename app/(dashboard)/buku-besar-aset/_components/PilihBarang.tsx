'use client';
// Pemilih barang (Master Barang, CONCEPT-bba-perencanaan §5.1) untuk modal item. Memilih atau
// "buat barang baru" hanya mengubah ISIAN — barang barunya dibuat server saat Simpan item, di
// transaksi yang sama (L78), jadi batal menyimpan tidak meninggalkan barang yatim di Master.

import { useMemo, useState } from 'react';
import { kunciNamaBarang, rapikanNamaBarang, type BarangRingan } from '@/lib/bba/barang';
import type { Warna } from './ModalItem';

export type PilihanBarang = { id: number; nama: string } | { baru: string } | null;

export const labelPilihan = (p: PilihanBarang) => !p ? '' : 'id' in p ? p.nama : p.baru;

type Props = {
  daftar: readonly BarangRingan[];
  nilai: PilihanBarang;
  /** Saran dari uraian (`saranBarang`) — ditawarkan selama belum ada pilihan. */
  saran: BarangRingan | null;
  onUbah: (p: PilihanBarang) => void;
  c: Warna;
  inp: React.CSSProperties;
};

export default function PilihBarang({ daftar, nilai, saran, onUbah, c, inp }: Props) {
  const [teks, setTeks] = useState('');
  const [buka, setBuka] = useState(false);
  const cocok = useMemo(() => {
    const k = kunciNamaBarang(teks);
    return (k ? daftar.filter(b => kunciNamaBarang(b.nama).includes(k)) : daftar).slice(0, 8);
  }, [teks, daftar]);
  const namaBaru = rapikanNamaBarang(teks);
  const sudahAda = !!namaBaru && daftar.some(b => kunciNamaBarang(b.nama) === kunciNamaBarang(namaBaru));

  const pilih = (p: PilihanBarang) => { onUbah(p); setTeks(''); setBuka(false); };
  const opsi: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', fontSize: 12.5, border: 'none', background: 'transparent', color: c.text, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {nilai && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          <span style={{ border: '1px solid #378ADD', color: '#378ADD', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
            {labelPilihan(nilai)}{'baru' in nilai ? ' · baru' : ''}
          </span>
          <button type="button" onClick={() => pilih(null)} style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
            Lepas
          </button>
        </div>
      )}
      {!nilai && saran && (
        <div style={{ fontSize: 12, color: c.sub }}>
          Saran: <button type="button" onClick={() => pilih({ id: saran.id, nama: saran.nama })}
            style={{ background: 'none', border: 'none', color: '#7C5CFC', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontSize: 12 }}>{saran.nama}</button>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <input value={teks} placeholder={nilai ? 'Ganti barang — cari atau ketik nama baru…' : 'Cari barang atau ketik nama baru…'}
          onChange={e => { setTeks(e.target.value); setBuka(true); }} onFocus={() => setBuka(true)} onBlur={() => setBuka(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setBuka(false); return; }
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (cocok[0] && (!namaBaru || sudahAda)) pilih({ id: cocok[0].id, nama: cocok[0].nama });
            else if (namaBaru) pilih({ baru: namaBaru });
          }}
          style={inp} aria-label="Barang" />
        {buka && (cocok.length > 0 || (namaBaru && !sudahAda)) && (
          // onMouseDown + preventDefault: klik opsi tidak memicu blur input lebih dulu.
          <div onMouseDown={e => e.preventDefault()}
            style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 2, background: c.card, border: `1px solid ${c.border}`, borderRadius: 6, maxHeight: 220, overflow: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.25)' }}>
            {cocok.map(b => (
              <button key={b.id} type="button" style={opsi} onClick={() => pilih({ id: b.id, nama: b.nama })}>{b.nama}</button>
            ))}
            {namaBaru && !sudahAda && (
              <button type="button" style={{ ...opsi, color: '#7C5CFC', fontWeight: 600, borderTop: cocok.length ? `1px solid ${c.border}` : 'none' }} onClick={() => pilih({ baru: namaBaru })}>
                + Buat barang baru “{namaBaru}”
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
