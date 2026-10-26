'use client';
// Master Barang BBA (CONCEPT-bba-perencanaan §5.1): tambah, ubah nama, gabungkan kembar, hapus.
// Barang yang masih dipakai item tidak bisa dihapus — jalannya Gabungkan (item pindah, satu transaksi).

import { useState } from 'react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteButton from '@/components/ui/DeleteButton';
import EditButton from '@/components/ui/EditButton';
import Tip from '@/components/ui/Tip';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { rapikanNamaBarang } from '@/lib/bba/barang';
import type { BbaBarang } from '@/lib/data/buku-besar-aset';

type Warna = { card: string; text: string; sub: string; border: string; rowOdd: string; input: string };
type Isian = { nama: string; kategori_aset: string; satuan: string };
const kosong: Isian = { nama: '', kategori_aset: '', satuan: '' };

type Props = { c: Warna; awal: BbaBarang[]; kategori: string[] };

export default function BarangPanel({ c, awal, kategori }: Props) {
  const [rows, setRows] = useState<BbaBarang[]>(awal);
  const [baru, setBaru] = useState<Isian>(kosong);
  const [ubah, setUbah] = useState<{ id: number } & Isian | null>(null);
  const [gabung, setGabung] = useState<{ dari: BbaBarang; ke: number | null } | null>(null);
  const [cari, setCari] = useState('');
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/barang');
    if (d.ok) setRows((d as unknown as { data: BbaBarang[] }).data);
  }

  async function tambah() {
    const nama = rapikanNamaBarang(baru.nama);
    if (!nama) { toast.error('Nama barang wajib diisi'); return; }
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/barang', { method: 'POST', body: JSON.stringify({ ...baru, nama }) });
      if (!d.ok) { toast.error(d.message || 'Gagal menambah'); return; }
      toast.success('Barang ditambahkan'); setBaru(kosong); void muat();
    } finally { setSibuk(false); }
  }

  async function simpanUbah() {
    if (!ubah) return;
    const nama = rapikanNamaBarang(ubah.nama);
    if (!nama) { toast.error('Nama barang wajib diisi'); return; }
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/barang', { method: 'PATCH', body: JSON.stringify({ ...ubah, nama }) });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan'); return; }
      toast.success('Tersimpan'); setUbah(null); void muat();
    } finally { setSibuk(false); }
  }

  async function hapus(b: BbaBarang) {
    if (!(await confirmDialog({ title: 'Hapus barang', message: `Hapus barang "${b.nama}" dari Master?`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/barang?id=${b.id}`, { method: 'DELETE' });
    if (!d.ok) { toast.error(d.message || 'Gagal menghapus'); void muat(); return; }
    toast.success('Barang dihapus'); void muat();
  }

  async function jalankanGabung() {
    if (!gabung?.ke) return;
    const ke = rows.find(r => r.id === gabung.ke);
    if (!ke) return;
    if (!(await confirmDialog({
      title: 'Gabungkan barang',
      message: `${gabung.dari.jumlah_item} item "${gabung.dari.nama}" dipindah ke "${ke.nama}", lalu "${gabung.dari.nama}" dihapus dari Master. Riwayat belinya ikut pindah.`,
      confirmLabel: 'Gabungkan', variant: 'warning',
    }))) return;
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/barang/gabung', { method: 'POST', body: JSON.stringify({ dari: gabung.dari.id, ke: ke.id }) });
      if (!d.ok) { toast.error(d.message || 'Gagal menggabungkan'); return; }
      toast.success(`${(d as unknown as { dipindah: number }).dipindah} item dipindah ke "${ke.nama}"`);
      setGabung(null); void muat();
    } finally { setSibuk(false); }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: c.text, background: c.input, minWidth: 0, boxSizing: 'border-box' };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: c.text, borderBottom: `1px solid ${c.border}` };
  const k = cari.trim().toLocaleLowerCase('id-ID');
  const tampil = k ? rows.filter(r => r.nama.toLocaleLowerCase('id-ID').includes(k)) : rows;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 12, lineHeight: 1.5 }}>
        Jenis barang di tingkat perencanaan (“Laptop”, “Kursi Roda”) — kunci riwayat beli di tampilan Per Barang. Spesifikasi tetap di uraian item.
        Kembar seperti “Laptop” / “Laptop Kantor”? Pakai <b>Gabungkan</b>.
      </div>
      <datalist id="bba-kategori-barang">{kategori.map(k => <option key={k} value={k} />)}</datalist>
      <div className="bba-mb-form" style={{ marginBottom: 14 }}>
        <input value={baru.nama} onChange={e => setBaru({ ...baru, nama: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') void tambah(); }} placeholder="Nama barang baru…" maxLength={160} style={inp} aria-label="Nama barang" />
        <input value={baru.kategori_aset} onChange={e => setBaru({ ...baru, kategori_aset: e.target.value })} list="bba-kategori-barang" placeholder="Kategori (opsional)" maxLength={64} style={inp} aria-label="Kategori" />
        <input value={baru.satuan} onChange={e => setBaru({ ...baru, satuan: e.target.value })} placeholder="Satuan" maxLength={32} style={inp} aria-label="Satuan" />
        <PrimaButton variant="purple" onClick={() => void tambah()} disabled={sibuk}>+ Tambah</PrimaButton>
      </div>
      {rows.length > 8 && <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari barang…" style={{ ...inp, width: '100%', marginBottom: 10 }} aria-label="Cari barang" />}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {tampil.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={4}>{rows.length === 0 ? 'Belum ada barang.' : 'Tidak ada yang cocok.'}</td></tr>}
            {tampil.map((r, i) => ubah?.id === r.id ? (
              <tr key={r.id} style={{ background: 'rgba(239,159,39,.08)' }}>
                <td style={td} colSpan={3}>
                  <div className="bba-mb-form">
                    <input value={ubah.nama} onChange={e => setUbah({ ...ubah, nama: e.target.value })} maxLength={160} style={inp} aria-label="Nama barang" />
                    <input value={ubah.kategori_aset} onChange={e => setUbah({ ...ubah, kategori_aset: e.target.value })} list="bba-kategori-barang" placeholder="Kategori" maxLength={64} style={inp} aria-label="Kategori" />
                    <input value={ubah.satuan} onChange={e => setUbah({ ...ubah, satuan: e.target.value })} placeholder="Satuan" maxLength={32} style={inp} aria-label="Satuan" />
                  </div>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <PrimaButton variant="ghost" size="sm" onClick={() => setUbah(null)}>Batal</PrimaButton>
                    <PrimaButton menulis variant="primary" size="sm" disabled={sibuk} onClick={() => void simpanUbah()}>Simpan</PrimaButton>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={r.id} style={{ background: i % 2 ? c.rowOdd : 'transparent' }}>
                <td style={td} colSpan={3}>
                  <b>{r.nama}</b>
                  <div style={{ color: c.sub, fontSize: 11.5 }}>{[r.kategori_aset, r.satuan, `${r.jumlah_item} item`].filter(Boolean).join(' · ')}</div>
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Tip label="Ubah"><EditButton onClick={() => setUbah({ id: r.id, nama: r.nama, kategori_aset: r.kategori_aset ?? '', satuan: r.satuan ?? '' })} /></Tip>
                    <PrimaButton variant="ghost" size="sm" disabled={rows.length < 2} onClick={() => setGabung({ dari: r, ke: null })}>Gabungkan…</PrimaButton>
                    {r.jumlah_item > 0
                      ? <Tip label={`Dipakai ${r.jumlah_item} item — gabungkan ke barang lain dulu`}><span style={{ display: 'inline-flex', opacity: .35 }}><DeleteButton disabled iconSize={12} onClick={() => {}} /></span></Tip>
                      : <Tip label="Hapus"><DeleteButton iconSize={12} onClick={() => void hapus(r)} /></Tip>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gabung && (
        <div onClick={() => setGabung(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: 'min(460px, 96vw)', padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Gabungkan “{gabung.dari.nama}”</div>
            <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 12 }}>
              {gabung.dari.jumlah_item} item pindah ke barang yang dipilih, lalu “{gabung.dari.nama}” dihapus dari Master.
            </div>
            <select value={gabung.ke ?? ''} onChange={e => setGabung({ ...gabung, ke: e.target.value ? Number(e.target.value) : null })} style={{ ...inp, width: '100%' }} aria-label="Gabungkan ke">
              <option value="">— pilih barang tujuan —</option>
              {rows.filter(r => r.id !== gabung.dari.id).map(r => <option key={r.id} value={r.id}>{r.nama} ({r.jumlah_item} item)</option>)}
            </select>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <PrimaButton variant="ghost" onClick={() => setGabung(null)}>Batal</PrimaButton>
              <PrimaButton menulis variant="warning" disabled={sibuk || !gabung.ke} onClick={() => void jalankanGabung()}>Gabungkan</PrimaButton>
            </div>
          </div>
        </div>
      )}
      <style>{`
.bba-mb-form { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) 110px auto; gap: 8px; }
@media (max-width: 640px) { .bba-mb-form { grid-template-columns: 1fr 1fr; } .bba-mb-form > :first-child { grid-column: 1 / -1; } }
`}</style>
    </div>
  );
}
