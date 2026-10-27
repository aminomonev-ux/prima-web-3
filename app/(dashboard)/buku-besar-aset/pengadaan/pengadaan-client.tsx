'use client';
// Pengadaan (docs/CONCEPT-bba-buku-aset.md §7.4, §14): hanya rencana yang DIDANAI tahun itu. Pesan →
// Dalam Proses; barang datang → catat penerimaan (bertahap, dengan "yang dibeli"). Proses & penerimaan
// lewat modal yang SAMA dengan halaman Rencana (ModalPengadaan) — satu jalur tulis.
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Search, FileText } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import RealisasiButton from '@/components/ui/RealisasiButton';
import Tip from '@/components/ui/Tip';
import { fetchJson } from '@/lib/shared/api';
import { LABEL_JENIS } from '@/lib/bba/rencana';
import type { BbaStatus } from '@/lib/bba/status';
import type { BbaRow } from '@/lib/data/buku-besar-aset';
import type { PengadaanTahun } from '@/lib/data/bba-penerimaan';
import type { InfoBeku } from '@/lib/security/beku';
import BbaShell from '../_components/BbaShell';
import type { PetaIzinLayar } from '../_components/BbaNav';
import ModalPengadaan from '../_components/ModalPengadaan';
import ModalItem, { STATUS_COLOR, type TabItem } from '../_components/ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtAngka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

/** Bahasa Pengadaan (§14): yang dihitung barangnya, bukan "realisasi". */
const LABEL_PENGADAAN: Record<BbaStatus, string> = {
  DIRENCANAKAN: 'Belum diproses', DIPROSES: 'Dalam proses', REALISASI_SEBAGIAN: 'Diterima sebagian',
  REALISASI_PENUH: 'Diterima penuh', TIDAK_TEREALISASI: 'Tidak terealisasi',
};
const URUT_STATUS: BbaStatus[] = ['DIRENCANAKAN', 'DIPROSES', 'REALISASI_SEBAGIAN', 'REALISASI_PENUH', 'TIDAK_TEREALISASI'];

type Props = {
  username: string; role: string; themePreference: 'dark' | 'light'; beku: InfoBeku; izin: PetaIzinLayar;
  awal: PengadaanTahun; kategori: string[]; bolehKoreksiMundur: boolean;
};

export default function PengadaanClient({ username, role, themePreference, beku, izin, awal, kategori, bolehKoreksiMundur }: Props) {
  const bolehUbah = izin.pengadaan === 'EDIT';
  const bolehBukti = bolehUbah || izin.rencana === 'EDIT';
  const [data, setData] = useState<PengadaanTahun>(awal);
  const [tahun, setTahun] = useState(String(awal.tahun));
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<BbaStatus | ''>('');
  const [memuat, setMemuat] = useState(false);
  const [proses, setProses] = useState<number | null>(null);
  const [item, setItem] = useState<{ id: number; tab: TabItem } | null>(null);
  const nomor = useRef(0);

  async function muat(t = Number(tahun)) {
    if (!Number.isInteger(t) || t < 2020 || t > 2100) { toast.error('Tahun 2020–2100'); return; }
    const n = ++nomor.current;
    setMemuat(true);
    try {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/pengadaan?tahun=${t}`);
      if (n !== nomor.current) return; // jawaban lama yang datang terlambat dibuang
      if (!d.ok) { toast.error(d.message || 'Gagal memuat'); return; }
      setData(d as unknown as PengadaanTahun);
    } finally { if (n === nomor.current) setMemuat(false); }
  }

  const hitung = useMemo(() => {
    const per = Object.fromEntries(URUT_STATUS.map(s => [s, 0])) as Record<BbaStatus, number>;
    for (const r of data.rows) per[r.status]++;
    return per;
  }, [data.rows]);
  const kata = q.trim().toLowerCase();
  const tampil = data.rows.filter(r => (!status || r.status === status)
    && (!kata || `${r.canonical_id} ${r.uraian} ${r.barang_nama ?? ''}`.toLowerCase().includes(kata)));
  const totalAnggaran = data.rows.reduce((t, r) => t + (r.anggaran_nilai ?? r.nilai_rencana), 0);
  const totalDiterima = data.rows.reduce((t, r) => t + r.nilai_realisasi, 0);

  return (
    <BbaShell username={username} role={role} themePreference={themePreference} beku={beku} izin={izin} aktif="pengadaan" remah="Pengadaan"
      aksiDock={[{ icon: <RefreshCw size={17} />, label: 'Muat ulang', onClick: () => void muat() }]}>
      {c => {
        const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input };
        const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
        const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' };
        const chip = (aktif: boolean): React.CSSProperties => ({ padding: '4px 11px', fontSize: 12, borderRadius: 20, cursor: 'pointer', border: `1px solid ${aktif ? '#EF9F27' : c.border}`, background: aktif ? 'rgba(239,159,39,.15)' : 'transparent', color: aktif ? '#EF9F27' : c.sub });
        return (<>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <input type="number" aria-label="Tahun anggaran" value={tahun} min={2020} max={2100} onChange={e => setTahun(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void muat(); }} style={{ ...inp, width: 90, fontFamily: MONO }} />
            <PrimaButton variant="ghost" iconLeft={<RefreshCw size={14} />} disabled={memuat} onClick={() => void muat()}>{memuat ? 'Memuat…' : 'Tampilkan'}</PrimaButton>
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: c.sub }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari kode, uraian, barang" aria-label="Cari rencana" style={{ ...inp, width: '100%', paddingLeft: 28, boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <button type="button" onClick={() => setStatus('')} style={chip(status === '')}>Semua · {data.rows.length}</button>
            {URUT_STATUS.map(s => hitung[s] > 0 && (
              <button key={s} type="button" onClick={() => setStatus(s)} style={chip(status === s)}>{LABEL_PENGADAAN[s]} · {hitung[s]}</button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 10 }}>
            {data.rows.length} rencana didanai tahun <b style={{ fontFamily: MONO, color: c.text }}>{data.tahun}</b> · anggaran <b style={{ fontFamily: MONO, color: c.text }}>{fmtRp(totalAnggaran)}</b> · sudah diterima <b style={{ fontFamily: MONO, color: c.text }}>{fmtRp(totalDiterima)}</b>
          </div>

          {data.rows.length === 0 ? (
            <div style={{ border: `1px dashed ${c.border}`, borderRadius: 10, padding: 24, fontSize: 13, color: c.sub, textAlign: 'center' }}>
              Belum ada rencana tahun {data.tahun} yang ditandai <b>didanai</b>. Perencanaan menandainya di halaman Rencana — hanya itu yang muncul di sini.
            </div>
          ) : (
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr>
                  <th style={th}>Kode</th><th style={th}>Rencana</th><th style={{ ...th, textAlign: 'right' }}>Anggaran</th>
                  <th style={{ ...th, textAlign: 'right' }}>Diterima</th><th style={th}>Status</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {tampil.map((r: BbaRow) => (
                    <tr key={r.id}>
                      <td style={{ ...td, fontFamily: MONO, fontSize: 11.5, whiteSpace: 'nowrap' }}>{r.canonical_id}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{r.uraian}</div>
                        <div style={{ fontSize: 11, color: c.sub }}>{[r.barang_nama, r.jenis_rencana ? LABEL_JENIS[r.jenis_rencana] : null, r.tgl_proses ? `dipesan ${r.tgl_proses}` : null].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={{ ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtAngka(r.anggaran_vol ?? r.vol)} {r.satuan || ''}<div style={{ fontSize: 11, color: c.sub }}>{fmtRp(r.anggaran_nilai ?? r.nilai_rencana)}</div>
                      </td>
                      <td style={{ ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtAngka(r.vol_realisasi)} / {fmtAngka(r.vol)}<div style={{ fontSize: 11, color: c.sub }}>{fmtRp(r.nilai_realisasi)}</div>
                      </td>
                      <td style={td}><span style={{ background: STATUS_COLOR[r.status], color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{LABEL_PENGADAAN[r.status]}</span></td>
                      <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <Tip label="Spesifikasi, referensi & bukti"><button type="button" aria-label="Spesifikasi, referensi & bukti" onClick={() => setItem({ id: r.id, tab: 'ref' })}
                            style={{ width: 30, height: 30, borderRadius: '50%', border: `1px solid ${c.border}`, background: 'transparent', color: c.sub, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={14} /></button></Tip>
                          <Tip label={bolehUbah ? 'Proses & penerimaan' : 'Lihat penerimaan'}><RealisasiButton aria-label={bolehUbah ? 'Proses & penerimaan' : 'Lihat penerimaan'} onClick={() => setProses(r.id)} /></Tip>
                        </span>
                      </td>
                    </tr>
                  ))}
                  {tampil.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: c.sub }}>Tidak ada rencana yang cocok.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {proses !== null && (
            <ModalPengadaan c={c} rencanaId={proses} bolehUbah={bolehUbah} bolehKoreksiMundur={bolehKoreksiMundur}
              onTutup={() => setProses(null)} onTersimpan={() => void muat(data.tahun)}
              onBukaBukti={r => { setProses(null); setItem({ id: r.id, tab: 'bukti' }); }} />
          )}
          {item && (
            <ModalItem c={c} daftar={tampil} awalId={item.id} tabAwal={item.tab} saringanAwal="SEMUA" tahun={data.tahun} kategori={kategori}
              bolehUbah={false} bolehBukti={bolehBukti} onTutup={() => setItem(null)} onTersimpan={() => void muat(data.tahun)} />
          )}
        </>);
      }}
    </BbaShell>
  );
}
