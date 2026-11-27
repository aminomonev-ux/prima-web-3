'use client';
// Pemilih Kategori → Jenis Kategori → Kode Rekening (docs/konsep/bba/CONCEPT-bba-master-kategori.md §3.2).
// SATU komponen untuk form Rencana, Master Barang, dan surat Penawaran. Hanya mengisi form — yang menulis
// tetap tombol Simpan masing-masing; nama, kelompok KIB, dan kode bawaan diselesaikan server dari id-nya.
import { kelompokKibPilihan, type MasterKategoriData, type PilihanKategori } from '@/lib/bba/kategori';

export type NilaiKategori = PilihanKategori & { kode_rekening: string };

const MONO = "'JetBrains Mono', ui-monospace, monospace";

type Props = {
  c: { sub: string };
  master: MasterKategoriData;
  nilai: NilaiKategori;
  onChange: (n: NilaiKategori) => void;
  inp: React.CSSProperties;
  /** Teks tersimpan yang tidak ada di Master (data lama) — ditampilkan supaya tidak terlihat hilang. */
  teksLama?: string | null;
  disabled?: boolean;
  /** false = tanpa isian kode rekening (Master Barang menyimpannya juga, tapi tampil ringkas). */
  denganKode?: boolean;
};

export default function PilihKategori({ c, master, nilai, onChange, inp, teksLama, disabled, denganKode = true }: Props) {
  const jenis = master.jenis.filter(j => j.kategori_id === nilai.kategori_id);
  const kib = kelompokKibPilihan(master, nilai, nilai.kode_rekening || null);
  const label: React.CSSProperties = { fontSize: 11, color: c.sub, display: 'grid', gap: 4 };

  function pilihInduk(id: number | null) {
    // Jenis milik induk lain tidak boleh tertinggal; kode yang diketik tangan dipertahankan.
    onChange({ kategori_id: id, jenis_kategori_id: null, kode_rekening: nilai.kode_rekening });
  }
  function pilihJenis(id: number | null) {
    const j = master.jenis.find(x => x.id === id);
    onChange({ ...nilai, jenis_kategori_id: id, kode_rekening: j?.kode_rekening ?? nilai.kode_rekening });
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      <label style={label}>Kategori
        <select value={nilai.kategori_id ?? ''} disabled={disabled} onChange={e => pilihInduk(e.target.value ? Number(e.target.value) : null)} style={inp}>
          <option value="">{teksLama && !nilai.kategori_id ? `— ${teksLama} (di luar Master) —` : '— belum dipilih —'}</option>
          {master.induk.map(i => <option key={i.id} value={i.id}>{i.nama}</option>)}
        </select>
      </label>
      <label style={label}>Jenis Kategori
        <select value={nilai.jenis_kategori_id ?? ''} disabled={disabled || !nilai.kategori_id} onChange={e => pilihJenis(e.target.value ? Number(e.target.value) : null)} style={inp}>
          <option value="">{nilai.kategori_id ? (jenis.length ? '— pilih jenis —' : '— belum ada jenis di Master —') : '— pilih kategori dulu —'}</option>
          {jenis.map(j => <option key={j.id} value={j.id}>{j.kode_rekening ? `${j.kode_rekening} — ${j.nama}` : j.nama}</option>)}
        </select>
      </label>
      {denganKode && (
        <label style={label}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span>Kode Rekening</span>
            {kib && <span style={{ fontSize: 10, color: '#7C5CFC', fontWeight: 700 }}>KIB: {kib}</span>}
          </span>
          <input value={nilai.kode_rekening} disabled={disabled} maxLength={64} placeholder="otomatis dari jenis, boleh diubah"
            onChange={e => onChange({ ...nilai, kode_rekening: e.target.value })} style={{ ...inp, fontFamily: MONO }} />
        </label>
      )}
    </div>
  );
}
