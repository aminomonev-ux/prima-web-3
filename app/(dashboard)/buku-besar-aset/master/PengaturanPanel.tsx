'use client';
// Pengaturan BBA (docs/CONCEPT-bba-buku-aset.md §14): kop & penanda tangan Excel format provinsi, jarak opname.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import type { PengaturanBba } from '@/lib/bba/pengaturan';

type Warna = { card: string; text: string; sub: string; border: string; input: string };

export default function PengaturanPanel({ c, bolehUbah }: { c: Warna; bolehUbah: boolean }) {
  const [p, setP] = useState<PengaturanBba | null>(null);
  const [dasar, setDasar] = useState('');
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/pengaturan');
      if (!d.ok) { toast.error(d.message || 'Gagal memuat pengaturan'); return; }
      const isi = (d as unknown as { pengaturan: PengaturanBba }).pengaturan;
      setP(isi); setDasar(JSON.stringify(isi));
    });
  }, []);

  async function simpan() {
    if (!p) return;
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/pengaturan', { method: 'PUT', body: JSON.stringify(p) });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan'); return; }
      const isi = (d as unknown as { pengaturan: PengaturanBba }).pengaturan;
      setP(isi); setDasar(JSON.stringify(isi));
      toast.success('Pengaturan tersimpan');
    } finally { setSibuk(false); }
  }

  if (!p) return <div style={{ fontSize: 12.5, color: c.sub }}>Memuat…</div>;
  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  const isian = (label: string, nilai: string, ubah: (v: string) => void, maks: number, contoh = '') => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11.5, color: c.sub }}>{label}</span>
      <input value={nilai} maxLength={maks} placeholder={contoh} onChange={e => ubah(e.target.value)} style={inp} />
    </label>
  );
  const kop = (k: keyof PengaturanBba['kop']) => (v: string) => setP({ ...p, kop: { ...p.kop, [k]: v } });
  const ttd = (k: keyof PengaturanBba['ttd']) => (v: string) => setP({ ...p, ttd: { ...p.ttd, [k]: v } });
  const berubah = JSON.stringify(p) !== dasar;
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 };

  return (
    <fieldset disabled={!bolehUbah} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12.5, color: c.sub, lineHeight: 1.5 }}>Dipakai semua Excel format provinsi — KIB, KIR, hasil sensus, Buku Inventaris, Rekap BMD (kop dan tanda tangan di bawah tabel).</div>
      <section style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Kop</div>
        <div style={grid}>
          {isian('Kode Lokasi', p.kop.kode_lokasi, kop('kode_lokasi'), 60, '010206.00000.00000')}
          {isian('Bidang', p.kop.bidang, kop('bidang'), 160)}
          {isian('Sub Bidang', p.kop.sub_bidang, kop('sub_bidang'), 160)}
          {isian('Satuan Kerja', p.kop.satuan_kerja, kop('satuan_kerja'), 160)}
        </div>
      </section>
      <section style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Tanda tangan</div>
        <div style={grid}>
          {isian('Kota (sebelum tanggal cetak)', p.ttd.kota, ttd('kota'), 60, 'Semarang')}
          {isian('Jabatan kiri', p.ttd.kepala_jabatan, ttd('kepala_jabatan'), 80, 'KEPALA SKPD')}
          {isian('Nama Kepala SKPD', p.ttd.kepala_nama, ttd('kepala_nama'), 120)}
          {isian('NIP Kepala SKPD', p.ttd.kepala_nip, ttd('kepala_nip'), 40)}
          {isian('Nama Pengurus Barang', p.ttd.pengurus_nama, ttd('pengurus_nama'), 120)}
          {isian('NIP Pengurus Barang', p.ttd.pengurus_nip, ttd('pengurus_nip'), 40)}
          {isian('Nama Pembantu Pengurus Barang (KIR)', p.ttd.pembantu_nama, ttd('pembantu_nama'), 120)}
          {isian('NIP Pembantu Pengurus Barang', p.ttd.pembantu_nip, ttd('pembantu_nip'), 40)}
        </div>
        <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8 }}>Penanggung jawab ruangan (kiri bawah KIR) diisi per ruangan di tab Ruangan.</div>
      </section>
      <section style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Jarak opname</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          Kondisi dianggap perlu dicek lagi sesudah
          <input type="number" min={1} max={60} value={p.opname_bulan} onChange={e => setP({ ...p, opname_bulan: Math.max(1, Math.min(60, Number(e.target.value) || 12)) })}
            style={{ ...inp, width: 80, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }} />
          bulan <span style={{ color: c.sub }}>(12 = setahun sekali; 6 = per semester)</span>
        </label>
      </section>
      {bolehUbah && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
          {berubah && <span style={{ fontSize: 11.5, color: '#BA7517' }}>Ada perubahan yang belum disimpan</span>}
          <PrimaButton menulis variant="primary" disabled={sibuk || !berubah} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Simpan'}</PrimaButton>
        </div>
      )}
    </fieldset>
  );
}
