'use client';
// Master Ruangan BBA (docs/CONCEPT-bba-buku-aset.md §15): tempat peralatan berada, di gedung mana
// (Kode Gedung kop KIR), luasnya, dan penanggung jawab ruangan (tanda tangan kiri KIR). Ruangan yang
// masih berisi aset tidak bisa dihapus — pindahkan asetnya dulu atau ganti namanya saja.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteButton from '@/components/ui/DeleteButton';
import EditButton from '@/components/ui/EditButton';
import Tip from '@/components/ui/Tip';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import type { BbaLokasi } from '@/lib/data/buku-besar-aset';
import type { GedungPilihan } from '@/lib/data/bba-aset';

type Warna = { card: string; text: string; sub: string; border: string; rowOdd: string; input: string };
type Isian = { id: number; nama: string; gedung_aset_id: number | null; luas: string; pj_nama: string; pj_nip: string };

const keIsian = (l: BbaLokasi): Isian => ({
  id: l.id, nama: l.nama, gedung_aset_id: l.gedung_aset_id, luas: l.luas == null ? '' : String(l.luas).replace('.', ','),
  pj_nama: l.pj_nama ?? '', pj_nip: l.pj_nip ?? '',
});

export default function LokasiPanel({ c, awal, bolehUbah }: { c: Warna; awal: BbaLokasi[]; bolehUbah: boolean }) {
  const [rows, setRows] = useState<BbaLokasi[]>(awal);
  const [gedung, setGedung] = useState<GedungPilihan[]>([]);
  const [nama, setNama] = useState('');
  const [ubah, setUbah] = useState<Isian | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi');
    if (!d.ok) return;
    const x = d as unknown as { data: BbaLokasi[]; gedung: GedungPilihan[] };
    setRows(x.data); setGedung(x.gedung);
  }
  useEffect(() => { void Promise.resolve().then(muat); }, []);

  async function tambah() {
    if (!nama.trim()) { toast.error('Nama ruangan wajib diisi'); return; }
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi', { method: 'POST', body: JSON.stringify({ nama }) });
      if (!d.ok) { toast.error(d.message || 'Gagal menambah'); return; }
      toast.success('Ruangan ditambahkan'); setNama(''); void muat();
    } finally { setSibuk(false); }
  }

  async function simpanUbah() {
    if (!ubah || !ubah.nama.trim()) { toast.error('Nama ruangan wajib diisi'); return; }
    const luasTeks = ubah.luas.trim().replace(/\./g, '').replace(',', '.');
    const luas = luasTeks === '' ? null : Number(luasTeks);
    if (luas !== null && (!Number.isFinite(luas) || luas < 0)) { toast.error('Luas harus angka (m²), mis. 24,5'); return; }
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi', {
        method: 'PATCH',
        body: JSON.stringify({ id: ubah.id, nama: ubah.nama, gedung_aset_id: ubah.gedung_aset_id, luas, pj_nama: ubah.pj_nama.trim() || null, pj_nip: ubah.pj_nip.trim() || null }),
      });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan'); return; }
      toast.success('Tersimpan'); setUbah(null); void muat();
    } finally { setSibuk(false); }
  }

  async function hapus(l: BbaLokasi) {
    if (!(await confirmDialog({ title: 'Hapus ruangan', message: `Hapus ruangan "${l.nama}"?`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/lokasi?id=${l.id}`, { method: 'DELETE' });
    if (!d.ok) { toast.error(d.message || 'Gagal menghapus'); void muat(); return; }
    toast.success('Ruangan dihapus'); void muat();
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: c.text, background: c.input, minWidth: 0, boxSizing: 'border-box' };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: c.text, borderBottom: `1px solid ${c.border}` };
  const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: c.sub, minWidth: 0 };

  return (
    <div>
      <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 12, lineHeight: 1.5 }}>
        Ruangan tempat peralatan berada. Gedung, luas, dan penanggung jawab dipakai kop & tanda tangan <b>KIR</b>; opname kondisi bisa dijalankan
        per ruangan atau per gedung dari halaman Buku Aset.
      </div>
      {bolehUbah && <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input value={nama} onChange={e => setNama(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void tambah(); }} placeholder="Nama ruangan baru…" maxLength={160} style={{ ...inp, flex: 1 }} aria-label="Nama ruangan" />
        <PrimaButton variant="purple" onClick={() => void tambah()} disabled={sibuk}>+ Tambah</PrimaButton>
      </div>}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={2}>Belum ada ruangan.</td></tr>}
            {rows.map((l, i) => ubah?.id === l.id ? (
              <tr key={l.id} style={{ background: 'rgba(239,159,39,.08)' }}>
                <td style={td} colSpan={2}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <label style={lbl}>Nama ruangan
                      <input value={ubah.nama} onChange={e => setUbah({ ...ubah, nama: e.target.value })} maxLength={160} style={inp} />
                    </label>
                    <label style={lbl}>Gedung (KIB C)
                      <select value={ubah.gedung_aset_id ?? ''} onChange={e => setUbah({ ...ubah, gedung_aset_id: e.target.value ? Number(e.target.value) : null })} style={inp}>
                        <option value="">— belum dipilih —</option>
                        {gedung.map(g => <option key={g.id} value={g.id}>{g.nama}{g.register ? ` · reg. ${g.register}` : ''}</option>)}
                      </select>
                    </label>
                    <label style={lbl}>Luas (m²)
                      <input value={ubah.luas} onChange={e => setUbah({ ...ubah, luas: e.target.value })} inputMode="decimal" placeholder="mis. 24,5" style={inp} />
                    </label>
                    <label style={lbl}>Penanggung jawab ruangan
                      <input value={ubah.pj_nama} onChange={e => setUbah({ ...ubah, pj_nama: e.target.value })} maxLength={120} style={inp} />
                    </label>
                    <label style={lbl}>NIP penanggung jawab
                      <input value={ubah.pj_nip} onChange={e => setUbah({ ...ubah, pj_nip: e.target.value })} maxLength={40} style={inp} />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
                    <PrimaButton variant="ghost" size="sm" onClick={() => setUbah(null)}>Batal</PrimaButton>
                    <PrimaButton menulis variant="primary" size="sm" disabled={sibuk} onClick={() => void simpanUbah()}>Simpan</PrimaButton>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={l.id} style={{ background: i % 2 ? c.rowOdd : 'transparent' }}>
                <td style={td}>
                  <b>{l.nama}</b>
                  <div style={{ color: c.sub, fontSize: 11.5 }}>
                    {[l.gedung_nama ? `di ${l.gedung_nama}` : 'gedung belum dipilih', l.luas != null ? `${l.luas.toLocaleString('id-ID')} m²` : '',
                      l.pj_nama ? `PJ ${l.pj_nama}` : '', `${l.jumlah_aset} aset`].filter(Boolean).join(' · ')}
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
                  {bolehUbah && <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Tip label="Ubah ruangan"><EditButton onClick={() => setUbah(keIsian(l))} /></Tip>
                    {l.jumlah_pendataan + l.jumlah_aset > 0
                      ? <Tip label={`Punya ${[l.jumlah_aset ? `${l.jumlah_aset} aset` : '', l.jumlah_pendataan ? `${l.jumlah_pendataan} pendataan eksisting lama` : ''].filter(Boolean).join(' dan ')} — tidak bisa dihapus`}><span style={{ display: 'inline-flex', opacity: .35 }}><DeleteButton disabled iconSize={12} /></span></Tip>
                      : <Tip label="Hapus"><DeleteButton iconSize={12} onClick={() => void hapus(l)} /></Tip>}
                  </div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
