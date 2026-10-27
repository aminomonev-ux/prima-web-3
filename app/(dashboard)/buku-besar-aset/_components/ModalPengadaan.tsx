'use client';
// Proses & Penerimaan satu rencana (docs/CONCEPT-bba-buku-aset.md §7.4) — dipakai halaman Rencana DAN
// Pengadaan; satu komponen, satu jalur tulis. Status pesanan (Direncanakan / Dalam Proses / Tidak
// Terealisasi) lewat PATCH proses; diterima sebagian/penuh = turunan penerimaan (POST/DELETE pengadaan).
// Rencana + referensi + penerimaan dimuat segar saat modal dibuka — angka kuncinya milik muatan itu (L77).

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Paperclip } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteButton from '@/components/ui/DeleteButton';
import { InputNominal } from '@/components/ui/input-nominal';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { LABEL_STATUS, STATUS_PROSES, pilihanStatusProses, alasanTolakProses, type StatusProses } from '@/lib/bba/status';
import { alasanTolakPenerimaan, salinanYangDibeli } from '@/lib/bba/penerimaan';
import { LABEL_ANGGARAN, LABEL_JENIS } from '@/lib/bba/rencana';
import { fmtTanggal } from '@/lib/bba/kondisi';
import type { ReferensiIsian } from '@/lib/bba/referensi';
import type { BbaRow } from '@/lib/data/buku-besar-aset';
import type { BarisPenerimaan } from '@/lib/data/bba-penerimaan';
import { Bingkai } from './AksiAset';
import { STATUS_COLOR } from './ModalItem';
import type { WarnaBba } from './BbaShell';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtAngka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

type Muatan = { item: BbaRow; referensi: ReferensiIsian[]; penerimaan: BarisPenerimaan[] };
type Props = {
  c: WarnaBba; rencanaId: number;
  /** Izin EDIT Pengadaan — tanpa itu modal hanya menampilkan. */
  bolehUbah: boolean;
  /** Admin (PERAN_PEMBATAL_FINAL): boleh menghapus penerimaan rencana yang sudah diterima penuh. */
  bolehKoreksiMundur: boolean;
  onTutup: () => void; onTersimpan: () => void;
  /** BAST & foto = bukti dukung item (tab Bukti di modal item). */
  onBukaBukti?: (item: BbaRow) => void;
};

export default function ModalPengadaan({ c, rencanaId, bolehUbah, bolehKoreksiMundur, onTutup, onTersimpan, onBukaBukti }: Props) {
  const [m, setM] = useState<Muatan | null>(null);
  const [status, setStatus] = useState<StatusProses>('DIPROSES');
  const [tglProses, setTglProses] = useState('');
  const hariIni = tanggalHariIniWIB();
  const [f, setF] = useState({ tgl: hariIni, vol: 0, harga: 0, ref: 0, merk: '', penyedia: '', url: '', catatan: '' });
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/pengadaan?rencana=${rencanaId}`);
    if (!d.ok) { toast.error(d.message || 'Gagal memuat rencana'); return; }
    const x = d as unknown as Muatan;
    setM(x);
    const s = x.item.status;
    setStatus(s === 'TIDAK_TEREALISASI' ? s : 'DIPROSES');
    setTglProses(x.item.tgl_proses || '');
    const sudah = x.penerimaan.reduce((t, p) => t + p.vol, 0);
    setF(v => ({ ...v, vol: Math.max(0, x.item.vol - sudah), harga: x.item.harga, ref: x.referensi.length > 0 ? 1 : 0 }));
  }
  useEffect(() => {
    void Promise.resolve().then(muat);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat sekali per rencana yang dibuka
  }, [rencanaId]);

  if (!m) {
    return <Bingkai c={c} judul="Proses & Penerimaan" lebar={760} onTutup={onTutup} kaki={<PrimaButton variant="ghost" onClick={onTutup}>Tutup</PrimaButton>}>
      <div style={{ fontSize: 12.5, color: c.sub }}>Memuat rencana…</div>
    </Bingkai>;
  }

  const { item, referensi, penerimaan } = m;
  const sudah = penerimaan.reduce((t, p) => t + p.vol, 0);
  const pilihan = pilihanStatusProses(item.status);
  const alasanProses = bolehUbah ? alasanTolakProses(item, status, penerimaan.length) : null;
  const alasanTerima = alasanTolakPenerimaan(item, sudah, f.vol, f.tgl, hariIni);
  const ref = f.ref > 0 ? referensi[f.ref - 1] ?? null : null;
  const dibeli = salinanYangDibeli(ref, { merk_tipe: f.merk, penyedia: f.penyedia, url: f.url });
  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub };
  const judulBagian: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: c.sub, margin: '16px 0 8px' };

  async function simpanStatus() {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/proses', {
        method: 'PATCH',
        body: JSON.stringify({ id: item.id, expected_version: item.version, status, tgl_proses: status === 'DIPROSES' ? tglProses || null : null }),
      });
      if (d.ok) { toast.success(`Status: ${LABEL_STATUS[status]}`); onTersimpan(); void muat(); }
      else if ((d as { code?: string }).code === 'VERSION_CONFLICT') { toast.error('Rencana baru diubah orang lain — dimuat ulang.'); void muat(); }
      else toast.error(d.message || 'Gagal menyimpan');
    } finally { setSibuk(false); }
  }

  async function catat() {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/pengadaan', {
        method: 'POST',
        body: JSON.stringify({
          rencana_id: item.id, expected_version: item.version, tgl: f.tgl, vol: f.vol, harga_satuan: f.harga,
          referensi_urutan: f.ref || null, merk_tipe: f.merk.trim() || null, penyedia: f.penyedia.trim() || null,
          url: f.url.trim() || null, catatan: f.catatan.trim() || null,
        }),
      });
      if (d.ok) {
        const h = d as unknown as { status: string; siapDihapus: number };
        toast.success(`Penerimaan dicatat — ${h.status === 'REALISASI_PENUH' ? 'diterima penuh' : 'diterima sebagian'}${h.siapDihapus ? ` · ${h.siapDihapus} aset lama ditandai siap dihapus` : ''}`);
        setF(v => ({ ...v, merk: '', penyedia: '', url: '', catatan: '' }));
        onTersimpan(); void muat();
      } else if ((d as { code?: string }).code === 'VERSION_CONFLICT') { toast.error('Rencana baru diubah orang lain — dimuat ulang, isian tetap.'); void muat(); }
      else toast.error(d.message || 'Gagal mencatat penerimaan');
    } finally { setSibuk(false); }
  }

  async function hapus(p: BarisPenerimaan) {
    if (!(await confirmDialog({ title: 'Hapus penerimaan', message: `Hapus penerimaan ${fmtAngka(p.vol)} ${item.satuan || 'unit'} tanggal ${fmtTanggal(p.tgl)}? Realisasi rencana dihitung ulang dari penerimaan yang tersisa.`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/pengadaan?id=${p.id}`, { method: 'DELETE' });
    if (d.ok) { toast.success('Penerimaan dihapus'); onTersimpan(); void muat(); } else toast.error(d.message || 'Gagal menghapus');
  }

  return (
    <Bingkai c={c} judul={`Proses & Penerimaan — ${item.canonical_id}`} lebar={820} onTutup={onTutup}
      sub={`${item.uraian}${item.jenis_rencana ? ` · ${LABEL_JENIS[item.jenis_rencana]}` : ''}`}
      kaki={<>
        {onBukaBukti && <PrimaButton variant="ghost" iconLeft={<Paperclip size={14} />} onClick={() => onBukaBukti(item)}>Bukti dukung (BAST, foto) · {item.jumlah_bukti}</PrimaButton>}
        <PrimaButton variant="ghost" onClick={onTutup}>Tutup</PrimaButton>
      </>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12.5, alignItems: 'center' }}>
        <span style={{ background: STATUS_COLOR[item.status], color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20 }}>{LABEL_STATUS[item.status]}</span>
        <span>Rencana <b style={{ fontFamily: MONO }}>{fmtAngka(item.vol)} {item.satuan || ''}</b> · <b style={{ fontFamily: MONO }}>{fmtRp(item.nilai_rencana)}</b></span>
        <span>Anggaran: <b>{LABEL_ANGGARAN[item.anggaran]}</b>{item.anggaran_nilai != null && <span style={{ fontFamily: MONO }}> · {fmtRp(item.anggaran_nilai)}</span>}</span>
        <span>Diterima <b style={{ fontFamily: MONO }}>{fmtAngka(sudah)} dari {fmtAngka(item.vol)}</b> · <span style={{ fontFamily: MONO }}>{fmtRp(item.nilai_realisasi)}</span></span>
      </div>

      {pilihan.length > 0 && (<>
        <div style={judulBagian}>Status pesanan</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ ...label, minWidth: 200 }}>Status
            <select value={status} disabled={!bolehUbah} onChange={e => setStatus(e.target.value as StatusProses)} style={inp} aria-label="Status pesanan">
              {STATUS_PROSES.map(s => <option key={s} value={s}>{LABEL_STATUS[s]}{s === item.status ? ' (sekarang)' : ''}</option>)}
            </select>
          </label>
          {status === 'DIPROSES' && (
            <label style={{ ...label, minWidth: 170 }}>Tanggal pesan/kontrak
              <input type="date" value={tglProses} max={hariIni} disabled={!bolehUbah} onChange={e => setTglProses(e.target.value)} style={inp} />
            </label>
          )}
          {bolehUbah && (
            <PrimaButton menulis variant="success" data-rima="bba.realisasi-simpan" disabled={sibuk || !!alasanProses} data-tooltip={alasanProses ?? undefined} onClick={() => void simpanStatus()}>
              Simpan status
            </PrimaButton>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: c.sub, marginTop: 6 }}>
          {status === 'DIPROSES' ? 'Sudah dipesan/dikontrak, barang belum datang. Begitu datang, catat penerimaannya di bawah.'
            : status === 'DIRENCANAKAN' ? 'Kembali direncanakan (pesanan batal) — tanggal pesan dikosongkan, referensi harga terbuka lagi.'
            : 'Tidak jadi dibeli tahun ini.'}
        </div>
        {alasanProses && <div style={{ fontSize: 12, color: '#BA7517', marginTop: 6 }}>{alasanProses}</div>}
      </>)}

      <div style={judulBagian}>Penerimaan</div>
      {penerimaan.length === 0 ? <div style={{ fontSize: 12.5, color: c.sub }}>Belum ada barang yang diterima.</div> : (
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{['Tanggal', 'Jumlah', 'Harga satuan', 'Nilai', 'Yang dibeli', 'Di Buku Aset', ''].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: c.sub, fontSize: 11, borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>
              {penerimaan.map(p => {
                const kunciHapus = p.ditempatkan > 0 ? 'Sudah ditempatkan di Buku Aset — tidak bisa dihapus'
                  : item.status === 'REALISASI_PENUH' && !bolehKoreksiMundur ? 'Sudah diterima penuh — koreksi mundur hanya oleh Admin' : null;
                return (
                  <tr key={p.id}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtTanggal(p.tgl)}</td>
                    <td style={{ padding: '6px 8px', fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtAngka(p.vol)} {item.satuan || ''}</td>
                    <td style={{ padding: '6px 8px', fontFamily: MONO, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtRp(p.harga_satuan)}</td>
                    <td style={{ padding: '6px 8px', fontFamily: MONO, whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtRp(p.nilai)}</td>
                    <td style={{ padding: '6px 8px', minWidth: 180 }}>
                      {p.pindahan ? <span style={{ color: c.sub }}>Realisasi lama (sebelum pencatatan penerimaan)</span> : <>
                        <div>{[p.merk_tipe, p.penyedia].filter(Boolean).join(' · ') || <span style={{ color: c.sub }}>—</span>}</div>
                        <div style={{ fontSize: 11, color: c.sub }}>
                          {p.referensi_urutan ? `Referensi ke-${p.referensi_urutan}` : 'Di luar referensi'}
                          {p.url && <> · <a href={p.url} target="_blank" rel="noopener noreferrer" style={{ color: '#7C5CFC' }}>tautan <ExternalLink size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /></a></>}
                        </div>
                      </>}
                    </td>
                    <td style={{ padding: '6px 8px', fontFamily: MONO, whiteSpace: 'nowrap' }}>{p.pindahan || item.jenis_rencana === 'REHAB' ? '—' : `${p.ditempatkan} register`}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      {bolehUbah && <DeleteButton disabled={!!kunciHapus} data-tooltip={kunciHapus ?? 'Hapus penerimaan (salah catat)'} onClick={() => void hapus(p)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {bolehUbah && item.anggaran === 'DIDANAI' && item.usulan_keputusan !== 'DITOLAK' && sudah < item.vol && item.status !== 'TIDAK_TEREALISASI' && (<>
        <div style={judulBagian}>Catat penerimaan</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <label style={label}>Tanggal diterima<input type="date" value={f.tgl} max={hariIni} onChange={e => setF({ ...f, tgl: e.target.value })} style={inp} /></label>
          <label style={label}>Jumlah (sisa {fmtAngka(item.vol - sudah)})
            <input type="number" min={0} step="any" value={f.vol} onChange={e => setF({ ...f, vol: Number(e.target.value) })} style={{ ...inp, fontFamily: MONO }} />
          </label>
          <label style={label}>Harga satuan riil<InputNominal value={f.harga} onChange={v => setF({ ...f, harga: v })} style={{ ...inp, fontFamily: MONO, textAlign: 'right' }} /></label>
          <div style={{ ...label, justifyContent: 'flex-end' }}>Nilai<div style={{ fontFamily: MONO, fontSize: 13, color: c.text, padding: '6px 0' }}>{fmtRp(f.vol * f.harga)}</div></div>
        </div>
        <div style={{ fontSize: 11.5, color: c.sub, margin: '12px 0 6px' }}>Yang benar-benar dibeli — dipakai saat merencanakan barang yang sama tahun berikutnya</div>
        <div role="radiogroup" aria-label="Yang dibeli" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {referensi.map((r, i) => (
            <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, cursor: 'pointer' }}>
              <input type="radio" name="ref-dibeli" checked={f.ref === i + 1} onChange={() => setF({ ...f, ref: i + 1 })} />
              <span>Referensi ke-{i + 1}: <b>{[r.merk_tipe, r.nama_penyedia].filter(Boolean).join(' · ') || r.sumber}</b>
                {r.harga != null && <span style={{ fontFamily: MONO, color: c.sub }}> · {fmtRp(r.harga)}</span>}</span>
            </label>
          ))}
          <label style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, cursor: 'pointer' }}>
            <input type="radio" name="ref-dibeli" checked={f.ref === 0} onChange={() => setF({ ...f, ref: 0 })} />
            <span>Beli di tempat lain (isi sendiri)</span>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
          <label style={label}>Merk / tipe<input value={f.merk} maxLength={160} placeholder={ref?.merk_tipe ?? ''} onChange={e => setF({ ...f, merk: e.target.value })} style={inp} /></label>
          <label style={label}>Penyedia<input value={f.penyedia} maxLength={255} placeholder={ref?.nama_penyedia ?? ''} onChange={e => setF({ ...f, penyedia: e.target.value })} style={inp} /></label>
          <label style={label}>Tautan<input value={f.url} maxLength={2048} placeholder={ref?.url ?? 'https://…'} onChange={e => setF({ ...f, url: e.target.value })} style={inp} /></label>
          <label style={label}>Catatan<input value={f.catatan} maxLength={500} placeholder="mis. No. BAST" onChange={e => setF({ ...f, catatan: e.target.value })} style={inp} /></label>
        </div>
        <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8 }}>
          Tersimpan: {[dibeli.merk_tipe, dibeli.penyedia].filter(Boolean).join(' · ') || '—'}{dibeli.url ? ' · dengan tautan' : ''}. Isian kosong mengikuti referensi terpilih.
        </div>
        {alasanTerima && <div style={{ fontSize: 12, color: '#BA7517', marginTop: 8 }}>{alasanTerima}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <PrimaButton menulis variant="success" disabled={sibuk || !!alasanTerima} onClick={() => void catat()}>{sibuk ? 'Menyimpan…' : 'Catat penerimaan'}</PrimaButton>
        </div>
      </>)}
      {item.anggaran !== 'DIDANAI' && item.usulan_keputusan !== 'DITOLAK' && (
        <div style={{ fontSize: 12, color: '#BA7517', marginTop: 12 }}>Rencana ini belum ditandai didanai — penerimaan hanya untuk rencana yang masuk anggaran (ditandai Perencanaan).</div>
      )}
    </Bingkai>
  );
}
