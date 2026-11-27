'use client';
// Master Kategori 2 tingkat (docs/konsep/bba/CONCEPT-bba-master-kategori.md §3.1): kategori induk → jenis kategori
// berkode rekening BLUD; kelompok KIB hanya untuk Modal. Rekening dicari dari Master Akun + Kode Besar BLUD
// atau diketik sendiri. Tiap aksi menulis langsung (per baris), lalu daftar dimuat ulang dari server.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteButton from '@/components/ui/DeleteButton';
import EditButton from '@/components/ui/EditButton';
import Tip from '@/components/ui/Tip';
import { confirmDialog, promptDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { deteksiKelompokKib, type JenisKategoriItem, type MasterKategoriData, type RekeningBludItem } from '@/lib/bba/kategori';

type Warna = { card: string; text: string; sub: string; border: string; rowOdd: string; input: string };
type Props = { c: Warna; data: MasterKategoriData; onData: (d: MasterKategoriData) => void; bolehUbah: boolean };
type IsianJenis = { kode: string; nama: string; kib: string };

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const KIB_BARU = '__baru__';
const isModal = (nama: string) => nama.trim().toLowerCase() === 'modal';

export default function KategoriPanel({ c, data, onData, bolehUbah }: Props) {
  const [buka, setBuka] = useState<Set<number>>(() => new Set(data.induk.slice(0, 1).map(i => i.id)));
  const [isian, setIsian] = useState<Record<number, IsianJenis>>({});
  const [ubah, setUbah] = useState<(IsianJenis & { id: number }) | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/kategori');
    if (d.ok) onData(d as unknown as MasterKategoriData);
  }

  async function kirim(method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, query = ''): Promise<boolean> {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/kategori${query}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan'); return false; }
      await muat();
      return true;
    } finally { setSibuk(false); }
  }

  async function tambahInduk() {
    const nama = await promptDialog({ title: 'Tambah kategori', message: 'Kategori induk baru, sejajar Barang dan Jasa, Modal, dan Pegawai.', label: 'Nama kategori', maxLength: 100, minLength: 2, confirmLabel: 'Tambah', variant: 'purple' });
    if (!nama) return;
    if (await kirim('POST', { aksi: 'induk', nama })) toast.success(`Kategori "${nama}" ditambahkan`);
  }

  async function tambahKib(): Promise<string | null> {
    const nama = await promptDialog({ title: 'Tambah kelompok KIB', message: 'Golongan buku inventaris untuk kategori Modal.', label: 'Nama kelompok KIB', maxLength: 128, minLength: 2, confirmLabel: 'Tambah', variant: 'purple' });
    if (!nama) return null;
    return (await kirim('POST', { aksi: 'kelompok_kib', nama: nama.toUpperCase() })) ? nama.toUpperCase() : null;
  }

  async function tambahJenis(indukId: number) {
    const v = isian[indukId];
    if (!v?.nama.trim()) { toast.error('Nama jenis kategori wajib diisi'); return; }
    const ok = await kirim('POST', { aksi: 'jenis', kategori_id: indukId, jenis_kategori: v.nama.trim(), kode_rekening: v.kode.trim() || null, kelompok_kib: v.kib || null });
    if (ok) { toast.success('Jenis kategori ditambahkan'); setIsian(s => ({ ...s, [indukId]: { kode: '', nama: '', kib: '' } })); }
  }

  async function simpanUbah() {
    if (!ubah?.nama.trim()) { toast.error('Nama jenis kategori wajib diisi'); return; }
    if (await kirim('PATCH', { id: ubah.id, jenis_kategori: ubah.nama.trim(), kode_rekening: ubah.kode.trim() || null, kelompok_kib: ubah.kib || null })) {
      toast.success('Tersimpan'); setUbah(null);
    }
  }

  async function ubahKib(j: JenisKategoriItem, kib: string) {
    const nilai = kib === KIB_BARU ? await tambahKib() : kib;
    if (nilai === null && kib === KIB_BARU) return;
    await kirim('PATCH', { id: j.id, kelompok_kib: nilai || null });
  }

  async function hapus(aksi: 'jenis' | 'induk' | 'kelompok_kib', id: number, nama: string, ket: string) {
    if (!(await confirmDialog({ title: 'Hapus dari Master Kategori', message: `Hapus "${nama}"? ${ket}`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    if (await kirim('DELETE', undefined, `?aksi=${aksi}&id=${id}`)) toast.success('Dihapus');
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: c.text, background: c.input, minWidth: 0, boxSizing: 'border-box' };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: 13, color: c.text, borderBottom: `1px solid ${c.border}`, verticalAlign: 'middle' };

  const pilihKib = (nilai: string, onPilih: (v: string) => void) => (
    <select value={nilai} disabled={!bolehUbah || sibuk} onChange={e => onPilih(e.target.value)} style={inp} aria-label="Kelompok KIB">
      <option value="">— kelompok KIB —</option>
      {data.kelompok_kib.map(k => <option key={k.id} value={k.nama}>{k.nama}</option>)}
      {nilai && !data.kelompok_kib.some(k => k.nama === nilai) && <option value={nilai}>{nilai}</option>}
      {bolehUbah && <option value={KIB_BARU}>+ Tambah Kelompok KIB…</option>}
    </select>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: c.sub, lineHeight: 1.5, maxWidth: 520 }}>
          Kelola kategori utama, sub-jenis kategori, dan tautan kode rekening BLUD. Hanya item berkategori <b>Modal</b> yang masuk antrean Buku Aset (KIB);
          Barang dan Jasa serta Pegawai selesai di Pengadaan.
        </div>
        {bolehUbah && <PrimaButton variant="purple" disabled={sibuk} onClick={() => void tambahInduk()}>+ Tambah Kategori</PrimaButton>}
      </div>

      {data.induk.map((ind, no) => {
        const milik = data.jenis.filter(j => j.kategori_id === ind.id);
        const terbuka = buka.has(ind.id);
        const modal = isModal(ind.nama);
        const v = isian[ind.id] ?? { kode: '', nama: '', kib: '' };
        const setV = (n: IsianJenis) => setIsian(s => ({ ...s, [ind.id]: n }));
        return (
          <div key={ind.id} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
              <button type="button" onClick={() => setBuka(s => { const n = new Set(s); if (n.has(ind.id)) n.delete(ind.id); else n.add(ind.id); return n; })}
                aria-expanded={terbuka}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 0, color: c.text, cursor: 'pointer', fontSize: 14, fontWeight: 700, textAlign: 'left', padding: 0 }}>
                {terbuka ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {no + 1}. {ind.nama}
                <span style={{ fontSize: 11.5, color: c.sub, fontWeight: 400, marginLeft: 'auto' }}>{milik.length} jenis</span>
              </button>
              {bolehUbah && !ind.bawaan && (
                <Tip label={milik.length ? 'Kosongkan jenisnya dulu' : 'Hapus kategori'}>
                  <DeleteButton iconSize={12} onClick={() => void hapus('induk', ind.id, ind.nama, 'Kategori yang masih punya jenis tidak bisa dihapus.')} />
                </Tip>
              )}
            </div>
            {terbuka && (
              <div style={{ borderTop: `1px solid ${c.border}`, padding: '10px 12px' }}>
                {bolehUbah && (
                  <div style={{ marginBottom: 10 }}>
                    <CariRekening c={c} inp={inp} onPilih={r => setV({ kode: r.kode, nama: r.uraian, kib: modal ? (deteksiKelompokKib(r.kode, r.uraian) ?? v.kib) : '' })} />
                    <div className="bba-kat-form" style={{ marginTop: 8, gridTemplateColumns: modal ? undefined : 'minmax(0, 1fr) minmax(0, 2fr) auto' }}>
                      <input value={v.kode} onChange={e => setV({ ...v, kode: e.target.value })} placeholder="Kode rekening" maxLength={64} style={{ ...inp, fontFamily: MONO }} aria-label="Kode rekening" />
                      <input value={v.nama} onChange={e => setV({ ...v, nama: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') void tambahJenis(ind.id); }}
                        placeholder="Nama jenis kategori" maxLength={255} style={inp} aria-label="Nama jenis kategori" />
                      {modal && pilihKib(v.kib, async val => { if (val === KIB_BARU) { const n = await tambahKib(); if (n) setV({ ...v, kib: n }); } else setV({ ...v, kib: val }); })}
                      <PrimaButton variant="purple" disabled={sibuk} onClick={() => void tambahJenis(ind.id)}>+ Tambah</PrimaButton>
                    </div>
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {milik.length === 0 && <tr><td style={{ ...td, color: c.sub, textAlign: 'center' }}>Belum ada jenis kategori.</td></tr>}
                    {milik.map((j, i) => ubah?.id === j.id ? (
                      <tr key={j.id} style={{ background: 'rgba(239,159,39,.08)' }}>
                        <td style={td} colSpan={3}>
                          <div className="bba-kat-form" style={{ gridTemplateColumns: modal ? undefined : 'minmax(0, 1fr) minmax(0, 2fr)' }}>
                            <input value={ubah.kode} onChange={e => setUbah({ ...ubah, kode: e.target.value })} placeholder="Kode rekening" maxLength={64} style={{ ...inp, fontFamily: MONO }} aria-label="Kode rekening" />
                            <input value={ubah.nama} onChange={e => setUbah({ ...ubah, nama: e.target.value })} maxLength={255} style={inp} aria-label="Nama jenis kategori" />
                            {modal && pilihKib(ubah.kib, async val => { if (val === KIB_BARU) { const n = await tambahKib(); if (n) setUbah({ ...ubah, kib: n }); } else setUbah({ ...ubah, kib: val }); })}
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
                      <tr key={j.id} style={{ background: i % 2 ? c.rowOdd : 'transparent' }}>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 12, width: 1, whiteSpace: 'nowrap', color: j.kode_rekening ? c.text : c.sub }}>{j.kode_rekening || '—'}</td>
                        <td style={td}>{j.nama}</td>
                        <td style={{ ...td, width: modal ? 220 : 1 }}>{modal && pilihKib(j.kelompok_kib ?? '', val => void ubahKib(j, val))}</td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 1 }}>
                          {bolehUbah && <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <Tip label="Ubah"><EditButton onClick={() => setUbah({ id: j.id, kode: j.kode_rekening ?? '', nama: j.nama, kib: j.kelompok_kib ?? '' })} /></Tip>
                            <Tip label="Hapus"><DeleteButton iconSize={12} onClick={() => void hapus('jenis', j.id, j.nama, 'Item, barang, dan surat penawaran yang sudah memakainya tetap menyimpan nama jenisnya.')} /></Tip>
                          </div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 12px', marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>Kelompok KIB</b>
          {bolehUbah && <PrimaButton variant="ghost" size="sm" disabled={sibuk} onClick={() => void tambahKib()}>+ Kelompok KIB</PrimaButton>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data.kelompok_kib.map(k => (
            <span key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 4px 2px 10px', fontSize: 11.5 }}>
              {k.nama}
              {bolehUbah && !k.bawaan
                ? <DeleteButton iconSize={10} onClick={() => void hapus('kelompok_kib', k.id, k.nama, 'Kelompok yang masih dipakai tidak bisa dihapus.')} />
                : <span style={{ width: 6 }} />}
            </span>
          ))}
        </div>
      </div>

      <style>{`
.bba-kat-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1.2fr) auto; gap: 8px; }
@media (max-width: 640px) { .bba-kat-form { grid-template-columns: 1fr 1fr !important; } }
`}</style>
    </div>
  );
}

/** Pencarian gabungan Master Akun + Kode Besar BLUD — hanya mengisi isian di bawahnya. */
function CariRekening({ c, inp, onPilih }: { c: Warna; inp: React.CSSProperties; onPilih: (r: RekeningBludItem) => void }) {
  const [q, setQ] = useState('');
  const [hasil, setHasil] = useState<RekeningBludItem[]>([]);
  const [terbuka, setTerbuka] = useState(false);
  const giliran = useRef(0);

  useEffect(() => {
    const kata = q.trim();
    if (kata.length < 2) return;
    const ke = ++giliran.current;
    const t = setTimeout(async () => {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/kategori?rekening=${encodeURIComponent(kata)}`);
      // Jawaban terlambat (ketikan sudah berganti) dibuang.
      if (ke !== giliran.current) return;
      setHasil(d.ok ? (d as unknown as { data: RekeningBludItem[] }).data.slice(0, 50) : []);
      setTerbuka(true);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ position: 'relative' }}>
      <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: c.sub }} />
      <input value={q} onChange={e => { setQ(e.target.value); if (e.target.value.trim().length < 2) setTerbuka(false); }} onFocus={() => hasil.length && setTerbuka(true)}
        onBlur={() => setTimeout(() => setTerbuka(false), 150)}
        placeholder="Cari dari Master Akun / Kode Besar BLUD (kode atau uraian)…" style={{ ...inp, width: '100%', paddingLeft: 30 }} aria-label="Cari rekening BLUD" />
      {terbuka && (
        <div role="listbox" style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, maxHeight: 260, overflowY: 'auto', background: c.card, border: `1px solid ${c.border}`, borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
          {hasil.length === 0 && <div style={{ padding: 10, fontSize: 12.5, color: c.sub }}>Tidak ada rekening yang cocok — isi kode & nama sendiri di bawah.</div>}
          {hasil.map(r => (
            <button key={r.kode} type="button" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()}
              onClick={() => { onPilih(r); setTerbuka(false); setQ(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, borderBottom: `1px solid ${c.border}`, padding: '7px 10px', cursor: 'pointer', color: c.text, fontSize: 12.5 }}>
              <span style={{ fontFamily: MONO, fontSize: 11.5 }}>{r.kode}</span> — {r.uraian}
              <span style={{ fontSize: 10, color: c.sub, marginLeft: 6 }}>{r.sumber === 'MASTER_AKUN' ? 'Master Akun' : 'Kode Besar'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
