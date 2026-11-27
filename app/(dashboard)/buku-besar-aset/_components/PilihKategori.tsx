'use client';
// Pemilih Kategori → Jenis Kategori → Kode Rekening (docs/konsep/bba/CONCEPT-bba-master-kategori.md §3.2).
// SATU komponen untuk form Rencana, Master Barang, dan surat Penawaran. Hanya mengisi form — yang menulis
// tetap tombol Simpan masing-masing; nama, kelompok KIB, dan kode bawaan diselesaikan server dari id-nya.
// Jenis Kategori dicari lewat kode ATAU uraian lintas induk (memilihnya ikut mengisi induk); `manual` = boleh teks sendiri
// (CONCEPT-bba-penawaran-matriks §4.4 — server menyimpannya sebagai teks tanpa id lewat `selesaikanKategori`).
import { useState } from 'react';
import { kelompokKibPilihan, type MasterKategoriData, type PilihanKategori } from '@/lib/bba/kategori';
import CariPilih from './CariPilih';

/** `jenis_teks` = jenis yang diketik sendiri (tanpa id Master); hanya dipakai pemanggil ber-`manual`. */
export type NilaiKategori = PilihanKategori & { kode_rekening: string; jenis_teks?: string };

const MONO = "'JetBrains Mono', ui-monospace, monospace";

type Props = {
  c: { sub: string; card: string; border: string; text: string };
  master: MasterKategoriData;
  nilai: NilaiKategori;
  onChange: (n: NilaiKategori) => void;
  inp: React.CSSProperties;
  /** Teks tersimpan yang tidak ada di Master (data lama) — ditampilkan supaya tidak terlihat hilang. */
  teksLama?: string | null;
  disabled?: boolean;
  /** false = tanpa isian kode rekening (Master Barang menyimpannya juga, tapi tampil ringkas). */
  denganKode?: boolean;
  /** true = jenis boleh diketik sendiri bila tidak ada di Master. */
  manual?: boolean;
};

export default function PilihKategori({ c, master, nilai, onChange, inp, teksLama, disabled, denganKode = true, manual = false }: Props) {
  const jenis = master.jenis.filter(j => j.kategori_id === nilai.kategori_id);
  const kib = kelompokKibPilihan(master, nilai, nilai.kode_rekening || null);
  const label: React.CSSProperties = { fontSize: 11, color: c.sub, display: 'grid', gap: 4 };
  const terpilih = master.jenis.find(j => j.id === nilai.jenis_kategori_id);
  const teksJenis = terpilih ? terpilih.nama : nilai.jenis_teks ?? '';
  // Teks pencarian selama mengetik (tanpa `manual` ia bukan nilai — dibuang saat kotak ditinggalkan).
  const [ketik, setKetik] = useState<string | null>(null);

  function pilihInduk(id: number | null) {
    // Jenis milik induk lain tidak boleh tertinggal; kode yang diketik tangan dipertahankan.
    onChange({ kategori_id: id, jenis_kategori_id: null, kode_rekening: nilai.kode_rekening, ...(manual ? { jenis_teks: '' } : {}) });
  }
  function pilihJenis(id: number | null) {
    const j = master.jenis.find(x => x.id === id);
    onChange({ ...nilai, kategori_id: j ? j.kategori_id : nilai.kategori_id, jenis_kategori_id: id, kode_rekening: j?.kode_rekening ?? nilai.kode_rekening, ...(manual ? { jenis_teks: '' } : {}) });
  }

  // Daftar cari: jenis induk terpilih dulu, lalu induk lain (memilihnya memindah induk).
  const opsi = [...master.jenis].sort((a, b) => Number(b.kategori_id === nilai.kategori_id) - Number(a.kategori_id === nilai.kategori_id))
    .map(j => ({ kunci: String(j.id), label: j.nama, sub: [j.kategori, j.kode_rekening, j.kelompok_kib ? `KIB ${j.kelompok_kib}` : null].filter(Boolean).join(' · '), cari: j.kode_rekening ?? '' }));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
      <label style={label}>Kategori
        <select value={nilai.kategori_id ?? ''} disabled={disabled} onChange={e => pilihInduk(e.target.value ? Number(e.target.value) : null)} style={inp}>
          <option value="">{teksLama && !nilai.kategori_id ? `— ${teksLama} (di luar Master) —` : '— belum dipilih —'}</option>
          {master.induk.map(i => <option key={i.id} value={i.id}>{i.nama}</option>)}
        </select>
      </label>
      <div style={label}>
        <span>Jenis Kategori <span style={{ color: c.sub, fontWeight: 400 }}>— cari kode/uraian{manual ? ' atau ketik sendiri' : ''}</span></span>
        <CariPilih c={c} inp={inp} disabled={disabled} ariaLabel="Jenis kategori" judul={`Master Kategori — ${master.jenis.length} jenis`}
          teks={ketik ?? teksJenis} onBlur={() => setKetik(null)} placeholder={nilai.kategori_id ? (jenis.length ? 'cari jenis…' : 'belum ada jenis di Master') : 'cari kode atau uraian…'}
          onTeks={t => {
            setKetik(t);
            if (manual) onChange({ ...nilai, jenis_kategori_id: null, jenis_teks: t });
            else if (!t) pilihJenis(null);
          }}
          opsi={opsi} onPilih={o => { setKetik(null); pilihJenis(Number(o.kunci)); }}
          manual={manual ? (t => `Pakai “${t}” (ketik sendiri, di luar Master)`) : null} />
        {manual && !terpilih && nilai.jenis_teks?.trim() && <span style={{ fontSize: 10.5, color: '#BA7517' }}>Diketik sendiri — tidak terhubung ke Master Kategori.</span>}
      </div>
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
