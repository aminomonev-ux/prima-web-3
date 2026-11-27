'use client';
// Pengadaan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.3): hanya rencana DIDANAI tahun itu, dikelompokkan per TAHAP
// (`tahapRencana`). Tiap baris punya satu tombol langkah berikutnya — Tandai dipesan · Catat barang datang · Pesan lagi —
// dan menu ⋯ (Tidak jadi dibeli / Batalkan pesanan / Riwayat dan batalkan). Route tetap PATCH /proses & POST /pengadaan.
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { RefreshCw, Search, FileText, Paperclip, History, Ban, Undo2 } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { LABEL_JENIS } from '@/lib/bba/rencana';
import { tahapRencana, tabPengadaan as tabDari, TAB_PENGADAAN, LABEL_TAB_PENGADAAN as LABEL_TAB, type TabPengadaan } from '@/lib/bba/tahap';
import { fmtTanggal } from '@/lib/bba/kondisi';
import type { BbaRow } from '@/lib/data/buku-besar-aset';
import type { PengadaanTahun } from '@/lib/data/bba-penerimaan';
import type { InfoBeku } from '@/lib/security/beku';
import BbaShell from '../_components/BbaShell';
import type { PetaIzinLayar } from '../_components/BbaNav';
import ModalItem, { type TabItem } from '../_components/ModalItem';
import { ModalTandaiDipesan, ModalCatatDatang, langkahMundur } from '../_components/ModalPesan';
import PanelRiwayat from '../_components/PanelRiwayat';
import { TombolUnduhBuku } from '../_components/UnduhBuku';
import GarisTahap from '../_components/GarisTahap';
import { cocokSaringKategori, type MasterKategoriData } from '@/lib/bba/kategori';
import MenuBaris, { type ButirMenu } from '../_components/MenuBaris';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtAngka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });


type Props = {
  username: string; role: string; themePreference: 'dark' | 'light'; beku: InfoBeku; izin: PetaIzinLayar;
  awal: PengadaanTahun; kategori: MasterKategoriData; bolehKoreksiMundur: boolean; tabAwal: TabPengadaan | null;
};
type Buka = { jenis: 'pesan' | 'datang' | 'riwayat'; id: number } | { jenis: 'item'; id: number; tab: TabItem };

export default function PengadaanClient({ username, role, themePreference, beku, izin, awal, kategori, bolehKoreksiMundur, tabAwal }: Props) {
  const bolehUbah = izin.pengadaan === 'EDIT';
  const bolehBukti = bolehUbah || izin.rencana === 'EDIT';
  const [data, setData] = useState<PengadaanTahun>(awal);
  const [tahun, setTahun] = useState(String(awal.tahun));
  const [q, setQ] = useState('');
  const [fKat, setFKat] = useState('');
  const [tab, setTab] = useState<TabPengadaan>(tabAwal ?? (awal.rows.some(r => tabDari(r) === 'siap') || !awal.rows.length ? 'siap' : 'dipesan'));
  const [memuat, setMemuat] = useState(false);
  const [buka, setBuka] = useState<Buka | null>(null);
  const [segarkan, setSegarkan] = useState(0);
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
      setSegarkan(x => x + 1);
    } finally { if (n === nomor.current) setMemuat(false); }
  }
  const sesudah = () => { setBuka(null); void muat(data.tahun); };

  const hitung = useMemo(() => {
    const per = Object.fromEntries(TAB_PENGADAAN.map(t => [t, 0])) as Record<TabPengadaan, number>;
    for (const r of data.rows) per[tabDari(r)]++;
    return per;
  }, [data.rows]);
  const kata = q.trim().toLowerCase();
  const tampil = data.rows.filter(r => tabDari(r) === tab && (!fKat || cocokSaringKategori(r, { kategori: fKat }))
    && (!kata || `${r.canonical_id} ${r.uraian} ${r.barang_nama ?? ''} ${r.kode_rekening ?? ''} ${r.jenis_kategori ?? ''}`.toLowerCase().includes(kata)));
  const totalAnggaran = data.rows.reduce((t, r) => t + (r.anggaran_nilai ?? r.nilai_rencana), 0);
  const totalDiterima = data.rows.reduce((t, r) => t + r.nilai_realisasi, 0);

  function langkahBerikutnya(r: BbaRow, c: { sub: string }) {
    const t = tahapRencana(r);
    if (t === 'DITERIMA_PENUH') return <Link href="/buku-besar-aset/aset" style={{ fontSize: 12, fontWeight: 600, color: c.sub, textDecoration: 'none', whiteSpace: 'nowrap' }}>Lihat di Buku Aset →</Link>;
    if (!bolehUbah) return <span style={{ color: c.sub }}>—</span>;
    if (t === 'DIDANAI') return <PrimaButton variant="success" size="sm" onClick={() => setBuka({ jenis: 'pesan', id: r.id })}>Tandai dipesan</PrimaButton>;
    if (t === 'DIPESAN') return <PrimaButton variant="success" size="sm" onClick={() => setBuka({ jenis: 'datang', id: r.id })}>Catat barang datang</PrimaButton>;
    if (t === 'DITERIMA_SEBAGIAN') return <PrimaButton variant="success" size="sm" onClick={() => setBuka({ jenis: 'datang', id: r.id })}>Catat barang datang (sisa {fmtAngka(r.vol - r.vol_realisasi)})</PrimaButton>;
    if (t === 'BATAL_DIBELI') return <PrimaButton variant="success" size="sm" onClick={() => setBuka({ jenis: 'pesan', id: r.id })}>Pesan lagi</PrimaButton>;
    return <span style={{ color: c.sub }}>—</span>;
  }

  function butirMenu(r: BbaRow): ButirMenu[] {
    const t = tahapRencana(r);
    const b: ButirMenu[] = [
      { kunci: 'spek', label: 'Spesifikasi & referensi', icon: <FileText size={13} /> },
      { kunci: 'bukti', label: r.jumlah_bukti ? `Bukti dukung (${r.jumlah_bukti})` : 'Bukti dukung', icon: <Paperclip size={13} /> },
      { kunci: 'riwayat', label: 'Riwayat dan batalkan', icon: <History size={13} /> },
    ];
    if (bolehUbah && t === 'DIDANAI') b.push({ kunci: 'tidak-jadi', label: 'Tidak jadi dibeli', icon: <Ban size={13} />, bahaya: true, pisah: true });
    if (bolehUbah && t === 'DIPESAN') b.push({ kunci: 'batal-pesan', label: 'Batalkan pesanan', icon: <Undo2 size={13} />, pisah: true });
    return b;
  }
  async function pilihMenu(r: BbaRow, kunci: string) {
    if (kunci === 'spek') setBuka({ jenis: 'item', id: r.id, tab: 'ref' });
    else if (kunci === 'bukti') setBuka({ jenis: 'item', id: r.id, tab: 'bukti' });
    else if (kunci === 'riwayat') setBuka({ jenis: 'riwayat', id: r.id });
    else if (kunci === 'tidak-jadi' || kunci === 'batal-pesan') {
      const ok = await langkahMundur(r.id, kunci === 'tidak-jadi' ? 'TIDAK_TEREALISASI' : 'DIRENCANAKAN');
      if (ok) toast.success(kunci === 'tidak-jadi' ? `${r.canonical_id} ditandai batal dibeli` : `Pesanan ${r.canonical_id} dibatalkan`);
      void muat(data.tahun);
    }
  }

  return (
    <BbaShell username={username} role={role} themePreference={themePreference} beku={beku} izin={izin} aktif="pengadaan" remah={`Pengadaan ${data.tahun}`}
      tahunPita={data.tahun} segarkanPita={segarkan}
      pindahPita={(halaman, t) => { if (halaman !== 'pengadaan' || !(TAB_PENGADAAN as readonly string[]).includes(t)) return false; setTab(t as TabPengadaan); return true; }}
      aksiDock={[{ icon: <RefreshCw size={17} />, label: 'Muat ulang', onClick: () => void muat() }]}>
      {c => {
        const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input };
        const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
        const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, verticalAlign: 'middle' };
        const chip = (aktif: boolean): React.CSSProperties => ({ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: `1px solid ${aktif ? '#EF9F27' : c.border}`, background: aktif ? 'rgba(239,159,39,.15)' : 'transparent', color: aktif ? '#EF9F27' : c.sub });
        return (<>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <input type="number" aria-label="Tahun anggaran" value={tahun} min={2020} max={2100} onChange={e => setTahun(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void muat(); }} style={{ ...inp, width: 90, fontFamily: MONO }} />
            <PrimaButton variant="ghost" iconLeft={<RefreshCw size={14} />} disabled={memuat} onClick={() => void muat()}>{memuat ? 'Memuat…' : 'Tampilkan'}</PrimaButton>
            <TombolUnduhBuku tahun={data.tahun} lembar="Pengadaan" />
            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', left: 9, top: 9, color: c.sub }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari kode, uraian, barang, rekening" aria-label="Cari rencana" style={{ ...inp, width: '100%', paddingLeft: 28, boxSizing: 'border-box' }} />
            </div>
            <select value={fKat} onChange={e => setFKat(e.target.value)} style={inp} aria-label="Kategori"><option value="">Semua kategori</option>{kategori.induk.map(i => <option key={i.id} value={i.nama}>{i.nama}</option>)}</select>
          </div>
          <div role="tablist" aria-label="Tahap pengadaan" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {TAB_PENGADAAN.map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} style={chip(tab === t)}>
                {LABEL_TAB[t]} <span style={{ fontFamily: MONO, opacity: .85 }}>({hitung[t]})</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 10 }}>
            {data.rows.length} rencana didanai tahun <b style={{ fontFamily: MONO, color: c.text }}>{data.tahun}</b> · anggaran <b style={{ fontFamily: MONO, color: c.text }}>{fmtRp(totalAnggaran)}</b> · sudah diterima <b style={{ fontFamily: MONO, color: c.text }}>{fmtRp(totalDiterima)}</b>
          </div>

          {data.rows.length === 0 ? (
            <div style={{ border: `1px dashed ${c.border}`, borderRadius: 10, padding: 24, fontSize: 13, color: c.sub, textAlign: 'center' }}>
              Belum ada rencana tahun {data.tahun} yang <b>didanai</b>. Perencanaan memutuskannya di halaman Rencana → tab Siap diputuskan — hanya itu yang muncul di sini.
            </div>
          ) : (
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr>
                  <th style={th}>Rencana</th><th style={{ ...th, textAlign: 'right' }}>Anggaran</th>
                  <th style={{ ...th, textAlign: 'right' }}>Datang</th><th style={th}>Tahap</th><th style={{ ...th, textAlign: 'right' }}>Langkah berikutnya</th>
                </tr></thead>
                <tbody>
                  {tampil.map((r: BbaRow) => (
                    <tr key={r.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>{r.uraian}</div>
                        <div style={{ fontSize: 11, color: c.sub }}>{[r.canonical_id, r.barang_nama, r.jenis_rencana ? LABEL_JENIS[r.jenis_rencana] : null, r.tgl_proses ? `dipesan ${fmtTanggal(r.tgl_proses)}` : null].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={{ ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtAngka(r.anggaran_vol ?? r.vol)} {r.satuan || ''}<div style={{ fontSize: 11, color: c.sub }}>{fmtRp(r.anggaran_nilai ?? r.nilai_rencana)}</div>
                      </td>
                      <td style={{ ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {fmtAngka(r.vol_realisasi)} / {fmtAngka(r.vol)}<div style={{ fontSize: 11, color: c.sub }}>{fmtRp(r.nilai_realisasi)}</div>
                      </td>
                      <td style={td}><GarisTahap tahap={tahapRencana(r)} sub={c.sub} /></td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          {langkahBerikutnya(r, c)}
                          <MenuBaris butir={butirMenu(r)} onPilih={k => void pilihMenu(r, k)} c={c} label={`Aksi lain ${r.canonical_id}`} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tampil.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: c.sub }}>Tidak ada rencana di tab ini.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {buka?.jenis === 'pesan' && <ModalTandaiDipesan c={c} rencanaId={buka.id} onTutup={() => setBuka(null)} onTersimpan={sesudah} />}
          {buka?.jenis === 'datang' && <ModalCatatDatang c={c} rencanaId={buka.id} bolehBukti={bolehBukti} onTutup={() => setBuka(null)} onTersimpan={sesudah} />}
          {buka?.jenis === 'riwayat' && (
            <PanelRiwayat c={c} rencanaId={buka.id} izin={izin} bolehAdmin={bolehKoreksiMundur}
              onTutup={() => setBuka(null)} onTersimpan={() => void muat(data.tahun)} onBukaBukti={() => setBuka({ jenis: 'item', id: buka.id, tab: 'bukti' })} />
          )}
          {buka?.jenis === 'item' && (
            <ModalItem c={c} daftar={tampil} awalId={buka.id} tabAwal={buka.tab} saringanAwal="SEMUA" tahun={data.tahun} kategori={kategori}
              bolehUbah={false} bolehBukti={bolehBukti} onTutup={() => setBuka(null)} onTersimpan={() => void muat(data.tahun)} />
          )}
        </>);
      }}
    </BbaShell>
  );
}
