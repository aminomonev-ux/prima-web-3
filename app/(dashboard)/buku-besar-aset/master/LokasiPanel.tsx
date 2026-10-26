'use client';
// Master Lokasi BBA (CONCEPT-bba-perencanaan §6.1): ruangan tempat pendataan kondisi eksisting.
// Lokasi yang sudah punya pendataan tidak bisa dihapus — riwayatnya menunjuk ke sana; ganti namanya saja.

import { useState } from 'react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteButton from '@/components/ui/DeleteButton';
import EditButton from '@/components/ui/EditButton';
import Tip from '@/components/ui/Tip';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import type { BbaLokasi } from '@/lib/data/buku-besar-aset';

type Warna = { card: string; text: string; sub: string; border: string; rowOdd: string; input: string };

export default function LokasiPanel({ c, awal, bolehUbah }: { c: Warna; awal: BbaLokasi[]; bolehUbah: boolean }) {
  const [rows, setRows] = useState<BbaLokasi[]>(awal);
  const [nama, setNama] = useState('');
  const [ubah, setUbah] = useState<{ id: number; nama: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi');
    if (d.ok) setRows((d as unknown as { data: BbaLokasi[] }).data);
  }

  async function tambah() {
    if (!nama.trim()) { toast.error('Nama lokasi wajib diisi'); return; }
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi', { method: 'POST', body: JSON.stringify({ nama }) });
      if (!d.ok) { toast.error(d.message || 'Gagal menambah'); return; }
      toast.success('Lokasi ditambahkan'); setNama(''); void muat();
    } finally { setSibuk(false); }
  }

  async function simpanUbah() {
    if (!ubah || !ubah.nama.trim()) { toast.error('Nama lokasi wajib diisi'); return; }
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi', { method: 'PATCH', body: JSON.stringify(ubah) });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan'); return; }
      toast.success('Tersimpan'); setUbah(null); void muat();
    } finally { setSibuk(false); }
  }

  async function hapus(l: BbaLokasi) {
    if (!(await confirmDialog({ title: 'Hapus lokasi', message: `Hapus lokasi "${l.nama}"?`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/lokasi?id=${l.id}`, { method: 'DELETE' });
    if (!d.ok) { toast.error(d.message || 'Gagal menghapus'); void muat(); return; }
    toast.success('Lokasi dihapus'); void muat();
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: c.text, background: c.input, minWidth: 0, boxSizing: 'border-box' };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: c.text, borderBottom: `1px solid ${c.border}` };

  return (
    <div>
      <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 12, lineHeight: 1.5 }}>
        Ruangan tempat pendataan kondisi eksisting (opname berjalan ruangan demi ruangan). Pendataannya di tampilan Per Barang → <b>Pendataan eksisting</b>.
      </div>
      {bolehUbah && <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input value={nama} onChange={e => setNama(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void tambah(); }} placeholder="Nama lokasi / ruangan baru…" maxLength={160} style={{ ...inp, flex: 1 }} aria-label="Nama lokasi" />
        <PrimaButton variant="purple" onClick={() => void tambah()} disabled={sibuk}>+ Tambah</PrimaButton>
      </div>}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={2}>Belum ada lokasi.</td></tr>}
            {rows.map((l, i) => ubah?.id === l.id ? (
              <tr key={l.id} style={{ background: 'rgba(239,159,39,.08)' }}>
                <td style={td}><input value={ubah.nama} onChange={e => setUbah({ ...ubah, nama: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') void simpanUbah(); }} maxLength={160} style={{ ...inp, width: '100%' }} aria-label="Nama lokasi" /></td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <PrimaButton variant="ghost" size="sm" onClick={() => setUbah(null)}>Batal</PrimaButton>
                    <PrimaButton menulis variant="primary" size="sm" disabled={sibuk} onClick={() => void simpanUbah()}>Simpan</PrimaButton>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={l.id} style={{ background: i % 2 ? c.rowOdd : 'transparent' }}>
                <td style={td}>
                  <b>{l.nama}</b>
                  <div style={{ color: c.sub, fontSize: 11.5 }}>{l.jumlah_pendataan > 0 ? `${l.jumlah_barang} barang · ${l.jumlah_pendataan} pendataan` : 'belum ada pendataan'}</div>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
                  {bolehUbah && <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Tip label="Ganti nama"><EditButton onClick={() => setUbah({ id: l.id, nama: l.nama })} /></Tip>
                    {l.jumlah_pendataan + l.jumlah_aset > 0
                      ? <Tip label={`Punya ${[l.jumlah_pendataan ? `${l.jumlah_pendataan} pendataan` : '', l.jumlah_aset ? `${l.jumlah_aset} aset` : ''].filter(Boolean).join(' dan ')} — tidak bisa dihapus`}><span style={{ display: 'inline-flex', opacity: .35 }}><DeleteButton disabled iconSize={12} /></span></Tip>
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
