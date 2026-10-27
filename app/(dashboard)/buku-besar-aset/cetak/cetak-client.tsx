'use client';
// Cetak & Excel (docs/CONCEPT-bba-buku-aset.md §9, §14): KIB A–F, KIR per ruangan, hasil sensus,
// Rekapitulasi BMD, Buku Inventaris — bentuk ekspor sistem aset provinsi — format kerja PRIMA, dan
// daftar rencana per tahun (Tahap D). Semua disusun server (`/aset/excel`).
import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { GOLONGAN, NAMA_GOLONGAN, JUDUL_KIB, type Golongan } from '@/lib/bba/kib';
import type { InfoBeku } from '@/lib/security/beku';
import BbaShell, { type WarnaBba } from '../_components/BbaShell';
import type { PetaIzinLayar } from '../_components/BbaNav';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const URL_EXCEL = '/api/buku-besar-aset/aset/excel';

type Props = {
  username: string; role: string; themePreference: 'dark' | 'light'; beku: InfoBeku; izin: PetaIzinLayar;
  perGolongan: Record<Golongan, number>; ruangan: { id: number; nama: string; n: number }[]; tahunIni: number;
};

// Berkas dikirim server dengan Content-Disposition attachment — halaman tidak berpindah.
const urlExcel = (q: Record<string, string | number>) => `${URL_EXCEL}?${new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)]))}`;
const keBerkas = (href: string) => { window.location.href = href; };
const unduh = (q: Record<string, string | number>) => keBerkas(urlExcel(q));

function Kartu({ c, judul, ket, n, children }: { c: WarnaBba; judul: string; ket: string; n?: number; children: React.ReactNode }) {
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <FileSpreadsheet size={22} style={{ color: '#1D9E75', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{judul}</div>
        <div style={{ fontSize: 11.5, color: c.sub }}>{ket}{n !== undefined && <> · <span style={{ fontFamily: MONO }}>{n.toLocaleString('id-ID')}</span> register</>}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export default function CetakClient({ username, role, themePreference, beku, izin, perGolongan, ruangan, tahunIni }: Props) {
  const total = Object.values(perGolongan).reduce((s, n) => s + n, 0);
  const berisi = ruangan.filter(r => r.n > 0);
  const [ruang, setRuang] = useState('SEMUA');
  const [tahunSensus, setTahunSensus] = useState(String(tahunIni));
  const [tahunRencana, setTahunRencana] = useState(String(tahunIni + 1));
  return (
    <BbaShell username={username} role={role} themePreference={themePreference} beku={beku} izin={izin} aktif="cetak" remah="Cetak & Excel">
      {c => {
        const tombol = (q: Record<string, string | number>, n: number) => n > 0
          ? <PrimaButton variant="success" size="sm" onClick={() => unduh(q)}>Unduh Excel</PrimaButton>
          : <span style={{ fontSize: 11.5, color: c.sub }}>kosong</span>;
        const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12.5, color: c.text, background: c.input, maxWidth: 220 };
        const judulBagian = (t: string) => <div style={{ fontSize: 11, color: c.sub, fontWeight: 600, margin: '14px 0 8px' }}>{t}</div>;
        const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 10 };
        const nRuang = ruang === 'SEMUA' ? berisi.reduce((s, r) => s + r.n, 0) : ruangan.find(r => String(r.id) === ruang)?.n ?? 0;
        const tahunSah = /^\d{4}$/.test(tahunSensus);
        const tahunRencanaSah = /^\d{4}$/.test(tahunRencana);
        return (<>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>🖨️ Cetak & Excel</h1>
          <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 6, lineHeight: 1.6 }}>
            Bentuknya sama dengan ekspor sistem aset provinsi: kop, kepala tabel, nomor kolom, baris Jumlah, dan tanda tangan
            (diatur di Master → Pengaturan; penanggung jawab ruangan di Master → Ruangan). Hanya aset aktif; yang sudah dihapus tidak ikut.
          </div>

          {judulBagian('KARTU INVENTARIS BARANG')}
          <div style={grid}>
            {GOLONGAN.map(g => (
              <Kartu key={g} c={c} judul={`KIB ${g} — ${NAMA_GOLONGAN[g]}`} ket={JUDUL_KIB[g].replace(/^KARTU INVENTARIS BARANG \(KIB\) /, '')} n={perGolongan[g]}>
                {tombol({ jenis: 'KIB', golongan: g }, perGolongan[g])}
              </Kartu>
            ))}
            <Kartu c={c} judul="KIB A–F sekaligus" ket="enam lembar dalam satu berkas" n={total}>{tombol({ jenis: 'KIB', golongan: 'SEMUA' }, total)}</Kartu>
          </div>

          {judulBagian('RUANGAN, SENSUS, BUKU INVENTARIS')}
          <div style={grid}>
            <Kartu c={c} judul="Kartu Inventaris Ruangan (KIR)" ket={ruang === 'SEMUA' ? `satu lembar per ruangan berisi (${berisi.length})` : 'satu ruangan'} n={nRuang}>
              <select value={ruang} onChange={e => setRuang(e.target.value)} style={inp} aria-label="Ruangan KIR">
                <option value="SEMUA">Semua ruangan berisi</option>
                {ruangan.map(r => <option key={r.id} value={r.id}>{r.nama} ({r.n})</option>)}
              </select>
              {/* Ruangan kosong tetap bisa diunduh: KIR kosong = lembar isian untuk ruangan baru. */}
              {ruang === 'SEMUA' ? tombol({ jenis: 'KIR', lokasi: 'SEMUA' }, nRuang) : <PrimaButton variant="success" size="sm" onClick={() => unduh({ jenis: 'KIR', lokasi: ruang })}>Unduh Excel</PrimaButton>}
            </Kartu>
            <Kartu c={c} judul="Hasil sensus barang" ket={`KIBA–KIBF Inv + rekap sensus · kondisi = pemeriksaan di PRIMA tahun ${tahunSah ? tahunSensus : '…'}`} n={total}>
              <input value={tahunSensus} onChange={e => setTahunSensus(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" aria-label="Tahun sensus" style={{ ...inp, width: 70, fontFamily: MONO }} />
              {tahunSah ? tombol({ jenis: 'SENSUS', tahun: tahunSensus }, total) : <span style={{ fontSize: 11.5, color: c.sub }}>isi tahun</span>}
            </Kartu>
            <Kartu c={c} judul="Rekapitulasi Barang Milik Daerah" ket="jumlah & nilai per akun dan kode objek, periode s.d. bulan ini" n={total}>{tombol({ jenis: 'REKAP' }, total)}</Kartu>
            <Kartu c={c} judul="Buku Inventaris BMD" ket="seluruh golongan dalam satu daftar" n={total}>{tombol({ jenis: 'BI' }, total)}</Kartu>
          </div>

          {judulBagian('FORMAT KERJA PRIMA')}
          <div style={grid}>
            <Kartu c={c} judul="Buku Aset lengkap" ket="satu lembar datar + nama sehari-hari, ruangan, gedung, kondisi & siapa yang mengecek, barang, rencana terkait — untuk disaring sendiri" n={total}>
              {tombol({ jenis: 'KERJA' }, total)}
            </Kartu>
            <Kartu c={c} judul="Daftar rencana per tahun" ket={`per jenis rencana, dengan jumlah & kondisi yang dimiliki tiap barang · tahun ${tahunRencanaSah ? tahunRencana : '…'}`}>
              <input value={tahunRencana} onChange={e => setTahunRencana(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" aria-label="Tahun rencana" style={{ ...inp, width: 70, fontFamily: MONO }} />
              {tahunRencanaSah ? <PrimaButton variant="success" size="sm" onClick={() => unduh({ jenis: 'RENCANA', tahun: tahunRencana })}>Unduh Excel</PrimaButton> : <span style={{ fontSize: 11.5, color: c.sub }}>isi tahun</span>}
            </Kartu>
          </div>
          <div style={{ fontSize: 11.5, color: c.sub, marginTop: 12, lineHeight: 1.5 }}>
            Hasil sensus: kolom Kondisi hanya diisi register yang diperiksa di PRIMA pada tahun itu; &ldquo;Tidak Ada&rdquo; di rekap sensus selalu 0 karena
            PRIMA belum mencatat aset yang tidak ditemukan.
          </div>
        </>);
      }}
    </BbaShell>
  );
}
