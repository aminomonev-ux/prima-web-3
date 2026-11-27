'use client';
// Penawaran Rekanan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A; kolom & form: CONCEPT-bba-penawaran-matriks.md). Dua
// tampilan dari data yang sama — Matriks (satu baris per barang, kolom lembar "Matriks Inventarisasi") dan Bandingkan
// (barang × rekanan, aturan `bandingkanPenawaran`). Catat/ubah/hapus = EDIT Rencana atau Pengadaan; yang lain melihat.
import { Fragment, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, ExternalLink, FileSpreadsheet, Paperclip, Pencil, RefreshCw, Trash2, Upload, Download } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { InputNominal } from '@/components/ui/input-nominal';
import SatuanCombobox from '@/components/shared/SatuanCombobox';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import {
  bandingkanPenawaran, masihBerlaku, gabungMerkTipe, syaratSurat, durasiDariTeks, tambahDurasi, teksDurasi, kunciRekanan, rapikanNamaRekanan,
  JENIS_SURAT, STATUS_PAJAK, LABEL_PAJAK, STATUS_TINDAK_LANJUT, LABEL_TINDAK_LANJUT, kunciSatuan,
  type ItemPenawaran, type SaranRekanan, type StatusPajak, type StatusTindakLanjut, type Durasi,
} from '@/lib/bba/penawaran';
import { fmtTanggal } from '@/lib/bba/kondisi';
import type { SuratPenawaran } from '@/lib/data/bba-penawaran';
import type { InfoBeku } from '@/lib/security/beku';
import { isSafeHttpUrl } from '@/lib/shared/url';
import BbaShell, { type WarnaBba } from '../_components/BbaShell';
import { bolehUbahPenawaran, type PetaIzinLayar } from '../_components/BbaNav';
import { Bingkai } from '../_components/AksiAset';
import PilihBarang, { type PilihanBarang } from '../_components/PilihBarang';
import { unggahBerkas, unduhBerkas } from '../_components/ModalItem';
import MenuBaris, { type ButirMenu } from '../_components/MenuBaris';
import { TombolUnduhBuku } from '../_components/UnduhBuku';
import PilihKategori, { type NilaiKategori } from '../_components/PilihKategori';
import CariPilih from '../_components/CariPilih';
import { pilihanDariBaris, type MasterKategoriData } from '@/lib/bba/kategori';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtAngka = (n: number) => Math.round(n).toLocaleString('id-ID');

export type BarangPilih = { id: number; nama: string; satuan: string | null; kategori: string | null; jenis_kategori: string | null; kode_rekening: string | null };
type Props = {
  username: string; role: string; themePreference: 'dark' | 'light'; beku: InfoBeku; izin: PetaIzinLayar;
  awal: SuratPenawaran[]; rekanan: SaranRekanan[]; barang: BarangPilih[]; kategori: MasterKategoriData;
};
type SaringBerlaku = 'BERLAKU' | 'SEMUA' | 'KEDALUWARSA';
type BukaSurat = { surat: SuratPenawaran | null } | null;

/** Warna lencana status tindak lanjut — petunjuk Matriks (kuning menunggu, biru telaah, hijau lanjut, abu arsip), token design system. */
const WARNA_TL: Record<StatusTindakLanjut, string> = {
  MENUNGGU_PRESENTASI: '#BA7517', MENUNGGU_DEMO: '#BA7517', PERLU_TELAAH: '#378ADD', LANJUT: '#1D9E75', ARSIP: '#85B7EB', DITOLAK: '#E24B4A',
};
const LABEL_TL_PENDEK: Record<StatusTindakLanjut, string> = {
  MENUNGGU_PRESENTASI: 'Menunggu presentasi', MENUNGGU_DEMO: 'Menunggu demo', PERLU_TELAAH: 'Perlu telaah', LANJUT: 'Lanjut proses', ARSIP: 'Arsip vendor', DITOLAK: 'Ditolak',
};
function Lencana({ warna, children, kecil }: { warna: string; children: React.ReactNode; kecil?: boolean }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: kecil ? '0 6px' : '1px 8px', borderRadius: 20, fontSize: kecil ? 9.5 : 10.5, fontWeight: 600, whiteSpace: 'nowrap', border: `1px solid ${warna}`, color: warna }}>{children}</span>;
}

const hargaSurat = (s: SuratPenawaran) => s.item.reduce((t, i) => t + (i.harga_satuan ?? 0), 0);
const suratBerharga = (s: SuratPenawaran) => s.item.some(i => (i.harga_satuan ?? 0) > 0);

export default function PenawaranClient({ username, role, themePreference, beku, izin, awal, rekanan: rekananAwal, barang: barangAwal, kategori }: Props) {
  const bolehUbah = bolehUbahPenawaran(izin);
  const [surat, setSurat] = useState(awal);
  const [rekanan, setRekanan] = useState(rekananAwal);
  const [barang, setBarang] = useState(barangAwal);
  const [tampilan, setTampilan] = useState<'MATRIKS' | 'BANDING'>('MATRIKS');
  const [q, setQ] = useState('');
  const [saring, setSaring] = useState<SaringBerlaku>('SEMUA');
  const [fKat, setFKat] = useState('');
  const [fJenis, setFJenis] = useState('');
  const [fStatus, setFStatus] = useState<StatusTindakLanjut | 'KOSONG' | ''>('');
  const [buka, setBuka] = useState<BukaSurat>(null);
  const [impor, setImpor] = useState(false);
  const nomor = useRef(0);
  const hariIni = tanggalHariIniWIB();

  async function muat() {
    const n = ++nomor.current;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/penawaran?q=${encodeURIComponent(q.trim())}`);
    if (n !== nomor.current) return;
    if (!d.ok) { toast.error(d.message || 'Gagal memuat'); return; }
    const x = d as unknown as { surat: SuratPenawaran[]; rekanan: SaranRekanan[] };
    setSurat(x.surat); setRekanan(x.rekanan);
    const b = await fetchJson<unknown>('/api/buku-besar-aset/barang');
    if (b.ok) setBarang(((b as unknown as { data: BarangPilih[] }).data ?? []).map(x => ({ id: x.id, nama: x.nama, satuan: x.satuan ?? null, kategori: x.kategori ?? null, jenis_kategori: x.jenis_kategori ?? null, kode_rekening: x.kode_rekening ?? null })));
  }

  const jenisAda = useMemo(() => [...new Set(surat.map(s => s.jenis_surat).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'id')), [surat]);
  const tampilSurat = surat.filter(s => (saring === 'SEMUA' || (saring === 'BERLAKU') === masihBerlaku(s.berlaku_sampai, hariIni))
    && (!fKat || s.kategori === fKat) && (!fJenis || s.jenis_surat === fJenis)
    && (!fStatus || (fStatus === 'KOSONG' ? !s.status_tindak_lanjut : s.status_tindak_lanjut === fStatus)));
  const banding = useMemo(() => bandingkanPenawaran(surat.flatMap(s => s.item), hariIni), [surat, hariIni]);
  const kpi = useMemo(() => ({
    surat: surat.length, rekanan: new Set(surat.map(s => kunciRekanan(s.rekanan))).size, berharga: surat.filter(suratBerharga).length,
    nilai: surat.reduce((t, s) => t + hargaSurat(s), 0),
    status: Object.fromEntries(STATUS_TINDAK_LANJUT.map(k => [k, surat.filter(s => s.status_tindak_lanjut === k).length])) as Record<StatusTindakLanjut, number>,
    tanpaStatus: surat.filter(s => !s.status_tindak_lanjut).length,
  }), [surat]);
  const merkAda = useMemo(() => [...new Set(surat.flatMap(s => s.item.map(i => i.merk?.trim())).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'id')), [surat]);

  async function hapus(s: SuratPenawaran) {
    const dipakai = s.item.reduce((t, i) => t + i.dipakai, 0);
    if (!(await confirmDialog({ title: 'Hapus surat penawaran', message: `Hapus surat ${s.rekanan}${s.nomor_surat ? ` No. ${s.nomor_surat}` : ''} beserta ${s.item.length} barangnya?${dipakai ? ` ${dipakai} referensi rencana yang menyalinnya tetap utuh (salinan).` : ''}`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/penawaran?id=${s.id}&v=${s.version}`, { method: 'DELETE' });
    if (!d.ok) { toast.error(d.message || 'Gagal menghapus'); void muat(); return; }
    toast.success('Surat penawaran dihapus'); void muat();
  }
  async function ubahStatus(s: SuratPenawaran, st: StatusTindakLanjut | null) {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/penawaran?aksi=status', { method: 'PATCH', body: JSON.stringify({ id: s.id, expected_version: s.version, status_tindak_lanjut: st }) });
    if (!d.ok) { toast.error(d.message || 'Gagal mengubah status'); void muat(); return; }
    toast.success(`Status ${s.rekanan}: ${st ? LABEL_TINDAK_LANJUT[st] : 'dikosongkan'}`); void muat();
  }
  const butirMenu = (s: SuratPenawaran): ButirMenu[] => [
    { kunci: 'ubah', label: 'Ubah surat & barang', icon: <Pencil size={13} /> },
    ...STATUS_TINDAK_LANJUT.map((st, i): ButirMenu => ({ kunci: `status:${st}`, label: `Status: ${LABEL_TINDAK_LANJUT[st]}`, pisah: i === 0, mati: s.status_tindak_lanjut === st ? 'Status sekarang' : null })),
    ...(s.status_tindak_lanjut ? [{ kunci: 'status:', label: 'Kosongkan status' }] : []),
    { kunci: 'hapus', label: 'Hapus surat', icon: <Trash2 size={13} />, bahaya: true, pisah: true },
  ];

  return (
    <BbaShell username={username} role={role} themePreference={themePreference} beku={beku} izin={izin} aktif="penawaran" remah="Penawaran Rekanan"
      aksiDock={[{ icon: <RefreshCw size={17} />, label: 'Muat ulang', onClick: () => void muat() }]}>
      {c => {
        const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input };
        const chip = (aktif: boolean): React.CSSProperties => ({ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: `1px solid ${aktif ? '#EF9F27' : c.border}`, background: aktif ? 'rgba(239,159,39,.15)' : 'transparent', color: aktif ? '#EF9F27' : c.sub });
        const kartu: React.CSSProperties = { background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px' };
        const judulKartu: React.CSSProperties = { fontSize: 10.5, color: c.sub, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
        return (<>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Penawaran Rekanan</h1>
              <div style={{ fontSize: 12.5, color: c.sub }}>Matriks inventarisasi penawaran & permohonan rekanan — satu baris per barang. Harga yang dipakai rencana disalin lewat &ldquo;Ambil dari penawaran&rdquo;.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {bolehUbah && <PrimaButton variant="purple" onClick={() => setBuka({ surat: null })}>+ Catat surat penawaran</PrimaButton>}
              {bolehUbah && <PrimaButton variant="ghost" iconLeft={<Upload size={14} />} onClick={() => setImpor(true)}>Impor Matriks Excel</PrimaButton>}
              <TombolUnduhBuku tahun={Number(hariIni.slice(0, 4))} lembar="Penawaran" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div style={kartu}><div style={judulKartu}>Surat terdata</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700 }}>{kpi.surat}</div><div style={{ fontSize: 11, color: c.sub }}>{kpi.rekanan} rekanan</div></div>
            <div style={kartu}><div style={judulKartu}>Surat dengan harga</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700 }}>{kpi.berharga}</div><div style={{ fontSize: 11, color: c.sub }}>{kpi.surat - kpi.berharga} surat belum mencantumkan harga</div></div>
            <div style={{ ...kartu, borderColor: 'rgba(239,159,39,.55)' }}><div style={judulKartu}>Total nilai penawaran berharga</div><div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: '#EF9F27', wordBreak: 'break-all' }}>{fmtRp(kpi.nilai)}</div><div style={{ fontSize: 11, color: c.sub }}>hanya barang yang mencantumkan harga</div></div>
            <div style={{ ...kartu, gridColumn: 'span 2', minWidth: 0 }}>
              <div style={judulKartu}>Status tindak lanjut — klik untuk menyaring</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {STATUS_TINDAK_LANJUT.map(st => (
                  <button key={st} type="button" onClick={() => setFStatus(f => (f === st ? '' : st))} aria-pressed={fStatus === st}
                    style={{ background: fStatus === st ? 'rgba(239,159,39,.15)' : 'transparent', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20 }}>
                    <Lencana warna={WARNA_TL[st]}>{LABEL_TL_PENDEK[st]} · {kpi.status[st]}</Lencana>
                  </button>
                ))}
                <button type="button" onClick={() => setFStatus(f => (f === 'KOSONG' ? '' : 'KOSONG'))} aria-pressed={fStatus === 'KOSONG'}
                  style={{ background: fStatus === 'KOSONG' ? 'rgba(239,159,39,.15)' : 'transparent', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 20 }}>
                  <Lencana warna={c.sub}>Belum ditentukan · {kpi.tanpaStatus}</Lencana>
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <div role="tablist" aria-label="Tampilan penawaran" style={{ display: 'flex', gap: 6 }}>
              {([['MATRIKS', 'Matriks'], ['BANDING', 'Bandingkan harga']] as const).map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={tampilan === v} onClick={() => setTampilan(v)} style={chip(tampilan === v)}>{l}</button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            {tampilan === 'MATRIKS' && <>
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void muat(); }} placeholder="Cari rekanan, PIC, nomor, barang, merk… (Enter)" aria-label="Cari penawaran" style={{ ...inp, minWidth: 240 }} />
              <select value={fKat} onChange={e => setFKat(e.target.value)} style={inp} aria-label="Kategori"><option value="">Semua kategori</option>{kategori.induk.map(i => <option key={i.id} value={i.nama}>{i.nama}</option>)}</select>
              <select value={fJenis} onChange={e => setFJenis(e.target.value)} style={inp} aria-label="Jenis surat"><option value="">Semua jenis surat</option>{jenisAda.map(j => <option key={j} value={j}>{j}</option>)}</select>
              <select value={saring} onChange={e => setSaring(e.target.value as SaringBerlaku)} style={inp} aria-label="Masa berlaku">
                <option value="SEMUA">Semua masa berlaku</option><option value="BERLAKU">Masih berlaku</option><option value="KEDALUWARSA">Kedaluwarsa</option>
              </select>
            </>}
          </div>

          {tampilan === 'MATRIKS'
            ? <Matriks c={c} surat={tampilSurat} kosongTotal={surat.length === 0} hariIni={hariIni} bolehUbah={bolehUbah} butirMenu={butirMenu}
                onMenu={(s, k) => { if (k === 'ubah') setBuka({ surat: s }); else if (k === 'hapus') void hapus(s); else if (k.startsWith('status:')) void ubahStatus(s, (k.slice(7) || null) as StatusTindakLanjut | null); }} />
            : <Bandingkan c={c} banding={banding} onBukaSurat={id => { const s = surat.find(x => x.id === id); if (s) { setTampilan('MATRIKS'); setSaring('SEMUA'); setFStatus(''); setFJenis(''); setFKat(''); setBuka({ surat: s }); } }} />}

          {buka && <PanelSurat c={c} awal={buka.surat} semua={surat} rekanan={rekanan} barang={barang} merkAda={merkAda} kategori={kategori} hariIni={hariIni} onTutup={() => setBuka(null)} onTersimpan={() => { setBuka(null); void muat(); }} />}
          {impor && <ModalImporPenawaran c={c} rekanan={rekanan} onTutup={() => setImpor(false)} onTersimpan={() => { setImpor(false); void muat(); }} />}
        </>);
      }}
    </BbaShell>
  );
}

// ─── Daftar Matriks ───────────────────────────────────────────────────────────

function Matriks({ c, surat, kosongTotal, hariIni, bolehUbah, butirMenu, onMenu }: {
  c: WarnaBba; surat: SuratPenawaran[]; kosongTotal: boolean; hariIni: string; bolehUbah: boolean;
  butirMenu: (s: SuratPenawaran) => ButirMenu[]; onMenu: (s: SuratPenawaran, kunci: string) => void;
}) {
  const th: React.CSSProperties = { padding: '7px 8px', fontSize: 10.5, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', background: c.card, fontWeight: 600 };
  const grup = (warna: string): React.CSSProperties => ({ ...th, textAlign: 'center', color: c.text, textTransform: 'uppercase', letterSpacing: '.06em', background: warna });
  const td: React.CSSProperties = { padding: '8px', fontSize: 12, borderBottom: `1px solid ${c.border}`, verticalAlign: 'top', lineHeight: 1.35 };
  const sub: React.CSSProperties = { fontSize: 10.8, color: c.sub };
  const kosong = <span style={{ color: c.sub }}>—</span>;
  const lengket: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1, background: c.card };
  const total = surat.reduce((t, s) => t + hargaSurat(s), 0);
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1500 }}>
        <thead>
          <tr>
            <th colSpan={6} style={grup(c.rowOdd)}>I. Identitas surat &amp; rekanan</th>
            <th colSpan={4} style={grup('rgba(124,92,252,.14)')}>II. Detail barang / jasa &amp; spesifikasi</th>
            <th colSpan={5} style={grup('rgba(239,159,39,.14)')}>III. Informasi harga &amp; syarat komersial</th>
            <th colSpan={2} style={grup(c.rowOdd)}>Tindak lanjut</th>
          </tr>
          <tr>
            <th style={{ ...th, ...lengket }}>No</th><th style={th}>Tgl Surat</th><th style={th}>No. Surat Rekanan</th><th style={th}>Jenis Surat</th>
            <th style={th}>Rekanan / Vendor · PIC &amp; Kontak</th><th style={th}>Kategori · Kode Rekening</th>
            <th style={th}>Nama Barang</th><th style={th}>Merk</th><th style={th}>Tipe / Spesifikasi</th><th style={th}>Satuan</th>
            <th style={{ ...th, textAlign: 'right' }}>Harga Penawaran (Rp)</th><th style={th}>Status Pajak</th><th style={th}>E-Katalog / Ref.</th><th style={th}>Garansi</th><th style={th}>Berlaku s.d.</th>
            <th style={th}>Status · Syarat</th><th style={th} />
          </tr>
        </thead>
        <tbody>
          {surat.length === 0 && <tr><td colSpan={17} style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }}>{kosongTotal ? 'Belum ada surat penawaran. Catat suratnya atau impor berkas Matriks.' : 'Tidak ada surat yang cocok dengan saringan.'}</td></tr>}
          {surat.map((s, n) => {
            const baris: Array<SuratPenawaran['item'][number] | null> = s.item.length ? s.item : [null];
            const rs = baris.length;
            const berlaku = masihBerlaku(s.berlaku_sampai, hariIni);
            const latar = n % 2 ? c.rowOdd : 'transparent';
            return (
              <Fragment key={s.id}>
                {baris.map((i, k) => (
                  <tr key={i?.id ?? `s${s.id}`} style={{ background: latar }}>
                    {k === 0 && <>
                      <td rowSpan={rs} style={{ ...td, ...lengket, fontFamily: MONO }}>{n + 1}</td>
                      <td rowSpan={rs} style={{ ...td, fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtTanggal(s.tgl_surat)}</td>
                      <td rowSpan={rs} style={{ ...td, fontFamily: MONO, whiteSpace: 'pre-line', maxWidth: 190, wordBreak: 'break-all' }}>{s.nomor_surat || kosong}</td>
                      <td rowSpan={rs} style={{ ...td, maxWidth: 160 }}>{s.jenis_surat || kosong}</td>
                      <td rowSpan={rs} style={{ ...td, maxWidth: 230 }}><b>{s.rekanan}</b>{s.pic_kontak && <div style={{ ...sub, whiteSpace: 'pre-line' }}>{s.pic_kontak}</div>}</td>
                      <td rowSpan={rs} style={{ ...td, maxWidth: 200 }}>{[s.kategori, s.jenis_kategori].filter(Boolean).join(' · ') || kosong}{s.kode_rekening && <div style={{ ...sub, fontFamily: MONO }}>{s.kode_rekening}</div>}</td>
                    </>}
                    {i ? <>
                      <td style={{ ...td, maxWidth: 200 }}><b>{i.nama_barang}</b>{' '}{i.barang_id !== null ? <Lencana warna="#1D9E75" kecil>{i.barang_nama && i.barang_nama !== i.nama_barang ? `Master: ${i.barang_nama}` : 'Master'}</Lencana> : <Lencana warna="#BA7517" kecil>belum ditautkan</Lencana>}
                        {i.dipakai > 0 && <div style={{ ...sub, color: '#1D9E75' }}>dipakai {i.dipakai} rencana</div>}</td>
                      <td style={td}>{i.merk || kosong}</td>
                      <td style={{ ...td, maxWidth: 220 }}>{i.merk_tipe || (i.spesifikasi ? null : kosong)}
                        {/* Spesifikasi panjang dipotong 3 baris supaya satu barang tidak setinggi layar; teks utuhnya di form surat. */}
                        {i.spesifikasi && <div style={{ ...sub, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{i.spesifikasi}</div>}</td>
                      <td style={td}>{i.satuan || kosong}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }}>{i.harga_satuan ? fmtAngka(i.harga_satuan) : <i style={{ color: c.sub, fontFamily: 'inherit' }}>belum ada harga</i>}</td>
                      <td style={td}>{i.status_pajak ? <Lencana warna={c.sub}>{LABEL_PAJAK[i.status_pajak]}</Lencana> : kosong}</td>
                      <td style={td}>{i.tautan && isSafeHttpUrl(i.tautan) ? <a href={i.tautan} target="_blank" rel="noopener noreferrer" style={{ color: '#7C5CFC', display: 'inline-flex', alignItems: 'center', gap: 3 }}><ExternalLink size={11} />{/inaproc|lkpp/i.test(i.tautan) ? 'e-Katalog' : 'tautan'}</a> : kosong}</td>
                      <td style={{ ...td, maxWidth: 120 }}>{i.garansi || kosong}</td>
                    </> : <td colSpan={8} style={{ ...td, color: c.sub, fontStyle: 'italic' }}>belum ada barang — surat tetap tercatat (jenis surat tanpa harga)</td>}
                    {k === 0 && <>
                      <td rowSpan={rs} style={{ ...td, fontFamily: MONO, whiteSpace: 'nowrap', color: berlaku ? c.text : '#BA7517' }}>
                        {s.berlaku_sampai ? fmtTanggal(s.berlaku_sampai) : <i style={{ fontFamily: 'inherit', color: c.sub }}>tanpa batas</i>}
                        {(s.masa_berlaku_teks || !berlaku) && <div style={{ ...sub, color: berlaku ? c.sub : '#BA7517' }}>{[s.masa_berlaku_teks, berlaku ? null : 'kedaluwarsa'].filter(Boolean).join(' · ')}</div>}
                      </td>
                      <td rowSpan={rs} style={{ ...td, maxWidth: 200 }}>
                        {s.status_tindak_lanjut ? <Lencana warna={WARNA_TL[s.status_tindak_lanjut]}>{LABEL_TL_PENDEK[s.status_tindak_lanjut]}</Lencana> : kosong}
                        {s.catatan && <div style={{ ...sub, marginTop: 4 }}>{s.catatan}</div>}
                        {s.file_id && <div style={{ marginTop: 4 }}><a href={unduhBerkas(s.file_id)} target="_blank" rel="noopener noreferrer" style={{ color: '#7C5CFC', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}><Paperclip size={11} />berkas surat</a></div>}
                      </td>
                      <td rowSpan={rs} style={{ ...td, textAlign: 'right' }}>{bolehUbah && <MenuBaris c={c} label={`Aksi surat ${s.rekanan}`} butir={butirMenu(s)} onPilih={kunci => onMenu(s, kunci)} />}</td>
                    </>}
                  </tr>
                ))}
              </Fragment>
            );
          })}
          {surat.length > 0 && (
            <tr>
              <td colSpan={10} style={{ ...td, textAlign: 'right', fontWeight: 700, background: 'rgba(239,159,39,.12)', borderTop: '2px solid #EF9F27' }}>TOTAL NILAI PENAWARAN HARGA TERDATA (YANG MENCANTUMKAN NOMINAL)</td>
              <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 700, color: '#EF9F27', background: 'rgba(239,159,39,.12)', borderTop: '2px solid #EF9F27', whiteSpace: 'nowrap' }}>{fmtAngka(total)}</td>
              <td colSpan={6} style={{ ...td, background: 'rgba(239,159,39,.12)', borderTop: '2px solid #EF9F27', color: c.sub, fontSize: 11 }}>{surat.filter(suratBerharga).length} dari {surat.length} surat · barang tanpa harga tidak ikut Bandingkan &amp; &ldquo;Ambil dari penawaran&rdquo;</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Bandingkan({ c, banding, onBukaSurat }: { c: WarnaBba; banding: ReturnType<typeof bandingkanPenawaran>; onBukaSurat: (id: number) => void }) {
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', background: c.card };
  const lengket: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1, background: c.card };
  if (banding.baris.length === 0 && banding.belumDitautkan.length === 0) return <div style={{ border: `1px dashed ${c.border}`, borderRadius: 10, padding: 24, textAlign: 'center', color: c.sub, fontSize: 13 }}>Belum ada penawaran berharga untuk dibandingkan.</div>;
  return (<>
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead><tr>
          <th style={{ ...th, ...lengket }}>Barang (satuan)</th>
          {banding.rekanan.map(r => <th key={r} style={{ ...th, textAlign: 'right' }}>{r}</th>)}
          <th style={{ ...th, textAlign: 'right' }}>Rata-rata berlaku</th><th style={{ ...th, textAlign: 'right' }}>Penawaran</th>
        </tr></thead>
        <tbody>
          {banding.baris.map(b => (
            <tr key={`${b.barang_id}|${b.satuan}`}>
              <td style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, fontWeight: 600, whiteSpace: 'nowrap', ...lengket }}>{b.barang_nama} <span style={{ color: c.sub, fontWeight: 400 }}>({b.satuan})</span></td>
              {banding.rekanan.map(r => {
                const s = b.sel[r];
                return (
                  <td key={r} style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s ? <button type="button" onClick={() => onBukaSurat(s.item.penawaran_id)}
                      data-tooltip={[gabungMerkTipe(s.item.merk, s.item.merk_tipe), s.item.status_pajak ? LABEL_PAJAK[s.item.status_pajak] : null, s.item.nomor_surat ? `No. ${s.item.nomor_surat}` : null, `surat ${fmtTanggal(s.item.tgl_surat)}`, s.berlaku ? null : 'kedaluwarsa'].filter(Boolean).join(' · ')}
                      style={{ fontFamily: MONO, fontSize: 12.5, background: s.termurah ? 'rgba(29,158,117,.15)' : 'transparent', color: s.termurah ? '#1D9E75' : s.berlaku ? c.text : c.sub,
                        border: `1px solid ${s.termurah ? '#1D9E75' : 'transparent'}`, borderRadius: 6, padding: '2px 6px', cursor: 'pointer', textDecoration: s.berlaku ? 'none' : 'line-through' }}>
                      {fmtRp(s.item.harga_satuan)}{s.item.status_pajak === 'BELUM' && <sup style={{ color: '#BA7517' }}> +PPN</sup>}
                    </button> : <span style={{ color: c.sub }}>—</span>}
                  </td>
                );
              })}
              <td style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }}>{b.rata === null ? '—' : fmtRp(b.rata)}</td>
              <td style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, textAlign: 'right', fontFamily: MONO }}>{b.jumlah}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div style={{ fontSize: 11.5, color: c.sub, marginTop: 6 }}>Hijau = termurah yang masih berlaku. Dicoret = kedaluwarsa (tidak ikut rata-rata). &ldquo;+PPN&rdquo; = harga belum termasuk PPN. Satuan berbeda dibandingkan di baris terpisah. Barang tanpa harga tidak dibandingkan.</div>
    {banding.belumDitautkan.length > 0 && (
      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(186,117,23,.45)', background: 'rgba(186,117,23,.08)', fontSize: 12.5 }}>
        <b style={{ color: '#BA7517' }}>{banding.belumDitautkan.length} barang belum ditautkan ke Master Barang</b> — tidak ikut dibandingkan. Buka suratnya, lalu pilih barangnya:
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {banding.belumDitautkan.slice(0, 12).map(i => <button key={i.id} type="button" onClick={() => onBukaSurat(i.penawaran_id)} style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, color: c.text, cursor: 'pointer' }}>{i.nama_barang} · {i.rekanan}</button>)}
        </div>
      </div>
    )}
  </>);
}

// ─── Panel form surat ─────────────────────────────────────────────────────────

type IsianItem = {
  kunci: number; id: number | null; barang: PilihanBarang; nama_barang: string; merk: string; tipe: string; spesifikasi: string; satuan: string;
  harga: number | null; pajak: StatusPajak | ''; tautan: string; garansi: string; buka: boolean;
};
let nomorItem = 0;
const itemKosong = (pajak: StatusPajak | '' = ''): IsianItem => ({ kunci: ++nomorItem, id: null, barang: null, nama_barang: '', merk: '', tipe: '', spesifikasi: '', satuan: '', harga: null, pajak, tautan: '', garansi: '', buka: false });
const isianDariItem = (i: ItemPenawaran): IsianItem => ({
  kunci: ++nomorItem, id: i.id, barang: i.barang_id ? { id: i.barang_id, nama: i.barang_nama ?? i.nama_barang } : null, nama_barang: i.nama_barang,
  merk: i.merk ?? '', tipe: i.merk_tipe ?? '', spesifikasi: i.spesifikasi ?? '', satuan: i.satuan ?? '', harga: i.harga_satuan, pajak: i.status_pajak ?? '',
  tautan: i.tautan ?? '', garansi: i.garansi ?? '', buka: false,
});

type ModeBerlaku = { mode: 'durasi'; d: Durasi } | { mode: 'tanggal'; tgl: string } | { mode: 'tanpa' };
const DURASI_CEPAT: Durasi[] = [{ n: 14, satuan: 'hari' }, { n: 30, satuan: 'hari' }, { n: 1, satuan: 'bulan' }, { n: 3, satuan: 'bulan' }];
const GARANSI_CEPAT = ['1 Tahun', '2 Tahun', '3 Tahun', '5 Tahun'];

type Kepala = {
  rekanan: string; pic: string; picOtomatis: boolean; jenis: string; nomor: string; tgl: string; berlaku: ModeBerlaku; masaTeks: string;
  file_id: string | null; nama_berkas: string | null; syarat: string; status: StatusTindakLanjut | '';
  kat: NilaiKategori; katAsal: NilaiKategori | null; teksKategori: string | null;
};
const berlakuDari = (k: Kepala): string | null => (k.berlaku.mode === 'durasi' ? tambahDurasi(k.tgl, k.berlaku.d) : k.berlaku.mode === 'tanggal' ? k.berlaku.tgl || null : null);

function kepalaDari(s: SuratPenawaran | null, master: MasterKategoriData): Kepala {
  const kat: NilaiKategori = { ...(s ? pilihanDariBaris(master, s) : { kategori_id: null, jenis_kategori_id: null }), kode_rekening: s?.kode_rekening ?? '', jenis_teks: '' };
  if (s && !kat.jenis_kategori_id && s.jenis_kategori) kat.jenis_teks = s.jenis_kategori;
  const tgl = s?.tgl_surat ?? tanggalHariIniWIB();
  const d = durasiDariTeks(s?.masa_berlaku_teks);
  const berlaku: ModeBerlaku = !s ? { mode: 'durasi', d: { n: 30, satuan: 'hari' } }
    : d && s.berlaku_sampai === tambahDurasi(tgl, d) ? { mode: 'durasi', d } : s.berlaku_sampai ? { mode: 'tanggal', tgl: s.berlaku_sampai } : { mode: 'tanpa' };
  return {
    rekanan: s?.rekanan ?? '', pic: s?.pic_kontak ?? '', picOtomatis: false, jenis: s ? s.jenis_surat ?? '' : JENIS_SURAT[0], nomor: s?.nomor_surat ?? '', tgl, berlaku,
    masaTeks: s?.masa_berlaku_teks ?? '', file_id: s?.file_id ?? null, nama_berkas: s?.file_id ? 'berkas tersimpan' : null, syarat: s?.catatan ?? '',
    status: s?.status_tindak_lanjut ?? '', kat, katAsal: s ? kat : null, teksKategori: s?.jenis_kategori ?? s?.kategori ?? null,
  };
}

/** L87: kategori hanya dikirim kalau berubah — surat lama yang cuma punya teks kategori tidak dikosongkan diam-diam. */
function kepalaBody(k: Kepala) {
  const berubah = k.katAsal ? JSON.stringify(k.kat) !== JSON.stringify(k.katAsal) : !!k.kat.kategori_id || !!k.kat.kode_rekening.trim() || !!k.kat.jenis_teks?.trim();
  const berlaku = berlakuDari(k);
  return {
    rekanan: k.rekanan.trim(), pic_kontak: k.pic.trim() || null, nomor_surat: k.nomor.trim() || null, tgl_surat: k.tgl, berlaku_sampai: berlaku,
    masa_berlaku_teks: (k.masaTeks.trim() || (k.berlaku.mode === 'durasi' ? teksDurasi(k.berlaku.d) : '')) || null,
    jenis_surat: k.jenis.trim() || null, file_id: k.file_id, catatan: k.syarat.trim() || null, status_tindak_lanjut: k.status || null,
    ...(berubah ? {
      kategori_id: k.kat.kategori_id, jenis_kategori_id: k.kat.jenis_kategori_id, kode_rekening: k.kat.kode_rekening.trim() || null,
      ...(!k.kat.jenis_kategori_id ? { jenis_kategori: k.kat.jenis_teks?.trim() || null } : {}),
    } : {}),
  };
}
const itemBody = (i: IsianItem) => ({
  id: i.id, nama_barang: (i.nama_barang.trim() || (i.barang && ('id' in i.barang ? i.barang.nama : i.barang.baru)) || '').slice(0, 255),
  ...(i.barang ? ('id' in i.barang ? { barang_id: i.barang.id } : { barang_baru: i.barang.baru }) : {}),
  merk: i.merk.trim() || null, merk_tipe: i.tipe.trim() || null, spesifikasi: i.spesifikasi.trim() || null, satuan: i.satuan.trim() || null,
  harga_satuan: i.harga && i.harga > 0 ? i.harga : null, status_pajak: i.pajak || null, tautan: i.tautan.trim() || null, garansi: i.garansi.trim() || null,
});

/** Tempel baris dari Excel (Tab antar sel): Nama · Merk · Tipe · Satuan · Harga. */
function itemDariTempel(teks: string, pajak: StatusPajak | ''): IsianItem[] {
  return teks.replace(/\r/g, '').split('\n').map(b => b.split('\t').map(x => x.trim())).filter(b => b[0]).slice(0, 200).map(([nama, merk = '', tipe = '', satuan = '', harga = '']) => {
    const h = Number(harga.replace(/rp/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return { ...itemKosong(pajak), nama_barang: nama.slice(0, 255), merk: merk.slice(0, 80), tipe: tipe.slice(0, 160), satuan: satuan.slice(0, 40), harga: Number.isFinite(h) && h > 0 ? h : null };
  });
}

function PanelSurat({ c, awal, semua, rekanan, barang, merkAda, kategori, hariIni, onTutup, onTersimpan }: {
  c: WarnaBba; awal: SuratPenawaran | null; semua: SuratPenawaran[]; rekanan: SaranRekanan[]; barang: BarangPilih[]; merkAda: string[];
  kategori: MasterKategoriData; hariIni: string; onTutup: () => void; onTersimpan: () => void;
}) {
  const [k, setK] = useState<Kepala>(() => kepalaDari(awal, kategori));
  const [item, setItem] = useState<IsianItem[]>(() => (awal ? (awal.item.length ? awal.item.map(isianDariItem) : []) : [itemKosong()]));
  const [dasar] = useState(() => JSON.stringify([kepalaDari(awal, kategori), (awal?.item ?? []).map(isianDariItem).map(itemBody)]));
  const [sibuk, setSibuk] = useState(false);
  const [unggah, setUnggah] = useState(false);
  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 12.5, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box', minHeight: 32 };
  const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: c.sub, minWidth: 0 };
  const tagOtomatis = (t: string) => <span style={{ fontSize: 9.5, fontWeight: 700, color: '#1D9E75', border: '1px solid #1D9E75', borderRadius: 10, padding: '0 6px', whiteSpace: 'nowrap' }}>{t}</span>;
  const tagMaster = tagOtomatis('dari Master');
  const chipKecil = (aktif: boolean): React.CSSProperties => ({ fontSize: 11.5, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', border: `1px solid ${aktif ? '#EF9F27' : c.border}`, color: aktif ? '#EF9F27' : c.sub, background: aktif ? 'rgba(239,159,39,.14)' : 'transparent', fontWeight: aktif ? 600 : 400 });
  const bagian: React.CSSProperties = { background: c.canvas, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 };
  const judulBagian = (n: string, t: string, ket?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
      <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(239,159,39,.18)', color: '#EF9F27', display: 'grid', placeItems: 'center', fontSize: 11.5, fontWeight: 700 }}>{n}</span>
      <b style={{ fontSize: 13 }}>{t}</b>{ket}
    </div>
  );

  const ubahItem = (kunci: number, x: Partial<IsianItem>) => setItem(xs => xs.map(v => (v.kunci === kunci ? { ...v, ...x } : v)));
  const terisi = item.filter(i => i.nama_barang.trim() || i.barang);
  const berlakuSampai = berlakuDari(k);
  const sebab = !k.rekanan.trim() ? 'Nama rekanan wajib.' : !k.tgl ? 'Tanggal surat wajib.'
    : berlakuSampai && berlakuSampai < k.tgl ? 'Tanggal berlaku tidak boleh sebelum tanggal surat.'
    : terisi.some(i => i.tautan.trim() && !isSafeHttpUrl(i.tautan.trim())) ? 'Link e-Katalog harus alamat http/https yang utuh.'
    : syaratSurat(k.jenis, terisi.map(i => ({ harga_satuan: i.harga })));
  const berubah = JSON.stringify([k, terisi.map(itemBody)]) !== dasar;

  async function tutup() {
    if (berubah && !(await confirmDialog({ title: 'Buang isian?', message: 'Isian surat ini belum disimpan. Tutup tanpa menyimpan?', confirmLabel: 'Buang isian', variant: 'danger' }))) return;
    onTutup();
  }

  async function simpan() {
    setSibuk(true);
    try {
      const body = { ...(awal ? { id: awal.id, expected_version: awal.version } : {}), kepala: kepalaBody(k), item: terisi.map(itemBody) };
      const d = await fetchJson<unknown>('/api/buku-besar-aset/penawaran', { method: awal ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan'); return; }
      toast.success(`Surat ${rapikanNamaRekanan(k.rekanan)} tersimpan — ${terisi.length} barang`); onTersimpan();
    } finally { setSibuk(false); }
  }

  // Penawaran lain per barang (bukan surat ini) — "terakhir … dari …" & pembanding cepat.
  const lainPerBarang = useMemo(() => {
    const m = new Map<number, Array<ItemPenawaran>>();
    for (const s of semua) if (s.id !== awal?.id) for (const i of s.item) if (i.barang_id && (i.harga_satuan ?? 0) > 0) m.set(i.barang_id, [...(m.get(i.barang_id) ?? []), i]);
    return m;
  }, [semua, awal]);
  const barangPer = useMemo(() => new Map(barang.map(b => [b.id, b])), [barang]);
  const total = terisi.reduce((t, i) => t + (i.harga ?? 0), 0);
  const berharga = terisi.filter(i => (i.harga ?? 0) > 0);
  const kedaluwarsa = !!berlakuSampai && berlakuSampai < hariIni;

  const opsiRekanan = rekanan.map(r => ({ kunci: r.nama, label: r.nama, sub: r.pic_kontak }));
  const opsiJenis = JENIS_SURAT.map(j => ({ kunci: j, label: j }));
  const opsiMerk = merkAda.map(m => ({ kunci: m, label: m }));
  const pajakSemua = (p: StatusPajak) => setItem(xs => xs.map(v => ({ ...v, pajak: p })));

  return (
    <Bingkai c={c} judul={awal ? 'Ubah surat penawaran' : 'Catat surat penawaran'} sub="Isi berurutan seperti kolom Matriks. Yang bertanda hijau terisi otomatis (dari Master / surat terakhir) dan tetap bisa diubah." lebar={1360} onTutup={() => void tutup()}
      kaki={<>
        <span style={{ marginRight: 'auto', fontSize: 11.5, color: c.sub }}>Satu Simpan menulis surat + semua barangnya. Barang baru dibuat saat Simpan.</span>
        <PrimaButton variant="ghost" onClick={() => void tutup()}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || !!sebab} data-tooltip={sebab ?? undefined} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : `Simpan surat · ${terisi.length} barang`}</PrimaButton>
      </>}>
      <style>{`
.bba-panel-surat { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 330px); gap: 14px; align-items: start; }
.bba-panel-surat > aside { position: sticky; top: 0; }
@media (max-width: 900px) { .bba-panel-surat { grid-template-columns: minmax(0, 1fr); } .bba-panel-surat > aside { position: static; order: -1; } }
`}</style>
      <div className="bba-panel-surat">
        <div style={{ minWidth: 0 }}>
          <div style={bagian}>
            {judulBagian('I', 'Identitas surat & rekanan')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div style={label}>Nama rekanan / vendor *
                <CariPilih c={c} inp={inp} teks={k.rekanan} ariaLabel="Nama rekanan" placeholder="cari rekanan yang pernah dicatat atau ketik nama baru" judul={`Rekanan yang pernah dicatat — ${rekanan.length}`}
                  onTeks={t => setK({ ...k, rekanan: t })} opsi={opsiRekanan} manual={t => `Rekanan baru: “${rapikanNamaRekanan(t)}”`}
                  onPilih={o => { const r = rekanan.find(x => x.nama === o.kunci); setK({ ...k, rekanan: o.kunci, ...(r?.pic_kontak && (!k.pic.trim() || k.picOtomatis) ? { pic: r.pic_kontak, picOtomatis: true } : {}) }); }} />
              </div>
              <label style={label}><span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>PIC &amp; kontak {k.picOtomatis && tagOtomatis('dari surat terakhir')}</span>
                <input value={k.pic} maxLength={255} placeholder="nama · telepon · email" onChange={e => setK({ ...k, pic: e.target.value, picOtomatis: false })} style={inp} />
              </label>
              <div style={label}>Jenis surat
                <CariPilih c={c} inp={inp} teks={k.jenis} ariaLabel="Jenis surat" judul="Jenis surat (Matriks)" onTeks={t => setK({ ...k, jenis: t })} opsi={opsiJenis}
                  onPilih={o => setK({ ...k, jenis: o.kunci })} manual={t => `Pakai “${t}”`} />
                <span style={{ fontSize: 10.5 }}>{syaratSurat(k.jenis, [{ harga_satuan: 1 }]) === null && syaratSurat(k.jenis, []) !== null ? 'Surat penawaran harga: minimal satu barang berharga.' : 'Boleh tanpa barang / tanpa harga.'}</span>
              </div>
              <label style={label}>No. surat rekanan<textarea rows={1} value={k.nomor} maxLength={120} placeholder="satu nomor per baris" onChange={e => setK({ ...k, nomor: e.target.value })} style={{ ...inp, fontFamily: MONO, resize: 'vertical' }} /></label>
              <label style={label}>Tanggal surat *<input type="date" value={k.tgl} onChange={e => setK({ ...k, tgl: e.target.value })} style={{ ...inp, fontFamily: MONO }} /></label>
              <div style={label}>Berkas surat (PDF/foto)
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.text, border: `1px dashed ${c.border}`, borderRadius: 6, padding: '5px 8px', minHeight: 32 }}>
                  {k.file_id ? <><Paperclip size={12} />{k.nama_berkas ?? 'terlampir'} <button type="button" onClick={() => setK({ ...k, file_id: null, nama_berkas: null })} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 11.5 }}>lepas</button></>
                    : <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={unggah} style={{ fontSize: 11.5, maxWidth: '100%' }}
                        onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setUnggah(true); try { const u = await unggahBerkas(f); if (u) setK(x => ({ ...x, file_id: u.fileId, nama_berkas: u.filename })); } finally { setUnggah(false); } }} />}
                </span>
              </div>
            </div>
            <div style={{ ...label, marginTop: 10 }}>
              <span>Masa berlaku SPH {berlakuSampai ? <b style={{ color: kedaluwarsa ? '#BA7517' : c.text, fontFamily: MONO }}>= s.d. {fmtTanggal(berlakuSampai)}{kedaluwarsa ? ' · sudah lewat' : ''}</b> : <b style={{ color: c.text }}>= tanpa batas</b>}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {DURASI_CEPAT.map(d => <button key={teksDurasi(d)} type="button" style={chipKecil(k.berlaku.mode === 'durasi' && teksDurasi(k.berlaku.d) === teksDurasi(d))} onClick={() => setK({ ...k, berlaku: { mode: 'durasi', d }, masaTeks: '' })}>{teksDurasi(d)}</button>)}
                <button type="button" style={chipKecil(k.berlaku.mode === 'tanpa')} onClick={() => setK({ ...k, berlaku: { mode: 'tanpa' }, masaTeks: '' })}>tanpa batas</button>
                <button type="button" style={chipKecil(k.berlaku.mode === 'tanggal')} onClick={() => setK({ ...k, berlaku: { mode: 'tanggal', tgl: berlakuSampai ?? k.tgl } })}>pilih tanggal</button>
                {k.berlaku.mode === 'tanggal' && <input type="date" value={k.berlaku.tgl} min={k.tgl} onChange={e => setK({ ...k, berlaku: { mode: 'tanggal', tgl: e.target.value } })} style={{ ...inp, width: 160, fontFamily: MONO }} />}
                <input value={k.masaTeks} maxLength={60} placeholder={k.berlaku.mode === 'durasi' ? `bunyi di surat (bawaan "${teksDurasi(k.berlaku.d)}")` : 'bunyi di surat, mis. "14 (empat belas) hari"'}
                  onChange={e => { const t = e.target.value; const d = durasiDariTeks(t); setK({ ...k, masaTeks: t, ...(d ? { berlaku: { mode: 'durasi', d } } : {}) }); }} style={{ ...inp, width: 260 }} />
              </div>
              <span style={{ fontSize: 10.5 }}>Durasi dihitung dari tanggal surat dan ikut bergeser bila tanggal surat diubah.</span>
            </div>
          </div>

          <div style={bagian}>
            {judulBagian('II', 'Detail barang / jasa & spesifikasi', <span style={{ fontSize: 11, color: c.sub }}>Tab pindah isian · tempel beberapa baris dari Excel (Nama · Merk · Tipe · Satuan · Harga) di kotak Nama barang = beberapa barang</span>)}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead><tr>{['#', 'Nama barang (Master Barang)', 'Merk', 'Tipe', 'Satuan', 'Harga satuan (Rp)', 'Status pajak', ''].map((h, i) => <th key={i} style={{ fontSize: 10.5, color: c.sub, textAlign: i === 5 ? 'right' : 'left', padding: '4px 5px', borderBottom: `1px solid ${c.border}`, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {item.length === 0 && <tr><td colSpan={8} style={{ padding: 12, fontSize: 12, color: c.sub, textAlign: 'center' }}>Belum ada barang. Surat jenis permohonan/company profile boleh tanpa barang.</td></tr>}
                  {item.map((it, n) => {
                    const brg = it.barang && 'id' in it.barang ? barangPer.get(it.barang.id) : undefined;
                    const lain = brg ? (lainPerBarang.get(brg.id) ?? []).sort((a, b) => (a.tgl_surat < b.tgl_surat ? 1 : -1)) : [];
                    const td: React.CSSProperties = { padding: '5px', verticalAlign: 'top', borderBottom: it.buka ? 'none' : `1px solid ${c.border}` };
                    return (
                      <Fragment key={it.kunci}>
                        <tr>
                          <td style={{ ...td, fontFamily: MONO, color: c.sub, fontSize: 11.5, paddingTop: 11 }}>{n + 1}</td>
                          <td style={{ ...td, minWidth: 260 }}>
                            <input value={it.nama_barang} placeholder="nama barang di surat" maxLength={255} aria-label="Nama barang di surat" style={inp}
                              onChange={e => ubahItem(it.kunci, { nama_barang: e.target.value })}
                              onPaste={e => {
                                const t = e.clipboardData.getData('text/plain');
                                if (!/[\t\n]/.test(t.trim())) return;
                                e.preventDefault();
                                const baru = itemDariTempel(t, it.pajak);
                                setItem(xs => { const i = xs.findIndex(v => v.kunci === it.kunci); const kosongIni = !xs[i].nama_barang.trim() && !xs[i].barang; return [...xs.slice(0, kosongIni ? i : i + 1), ...baru, ...xs.slice(i + 1)]; });
                                toast.success(`${baru.length} barang ditempel dari Excel`);
                              }} />
                            <div style={{ marginTop: 4 }}>
                              <PilihBarang daftar={barang} nilai={it.barang} saran={null} c={c} inp={inp}
                                onUbah={p => {
                                  const b = p && 'id' in p ? barangPer.get(p.id) : undefined;
                                  ubahItem(it.kunci, { barang: p, ...(p && !it.nama_barang.trim() ? { nama_barang: 'id' in p ? p.nama : p.baru } : {}), ...(b?.satuan && !it.satuan.trim() ? { satuan: b.satuan } : {}) });
                                }} />
                            </div>
                            {brg && <div style={{ fontSize: 10.5, color: c.sub, marginTop: 3 }}>{[brg.kategori, brg.jenis_kategori].filter(Boolean).join(' › ')}{brg.kode_rekening && <span style={{ fontFamily: MONO }}> · {brg.kode_rekening}</span>}
                              {lain.length > 0 ? <div style={{ color: '#BA7517' }}>terakhir {fmtRp(lain[0].harga_satuan ?? 0)} · {lain[0].rekanan} · {fmtTanggal(lain[0].tgl_surat)}{lain.length > 1 ? ` · ${lain.length - 1} penawaran lain` : ''}</div> : <div>belum pernah ditawarkan rekanan lain</div>}</div>}
                          </td>
                          <td style={{ ...td, width: 130 }}><CariPilih c={c} inp={inp} teks={it.merk} ariaLabel="Merk" judul="Merk yang pernah dicatat" opsi={opsiMerk} onTeks={t => ubahItem(it.kunci, { merk: t.slice(0, 80) })} onPilih={o => ubahItem(it.kunci, { merk: o.kunci })} manual={null} /></td>
                          <td style={{ ...td, width: 170 }}><input value={it.tipe} maxLength={160} placeholder="tipe / model" aria-label="Tipe" onChange={e => ubahItem(it.kunci, { tipe: e.target.value })} style={inp} /></td>
                          <td style={{ ...td, width: 110 }}><SatuanCombobox value={it.satuan} onChange={v => ubahItem(it.kunci, { satuan: v.slice(0, 40) })} style={inp} placeholder="Unit" />
                            {brg?.satuan && it.satuan === brg.satuan && <div style={{ marginTop: 3 }}>{tagMaster}</div>}</td>
                          <td style={{ ...td, width: 160 }}><InputNominal nullable value={it.harga} placeholder="belum ada harga" onChange={v => ubahItem(it.kunci, { harga: v })} style={{ ...inp, fontFamily: MONO, textAlign: 'right' }} /></td>
                          <td style={{ ...td, width: 150 }}>
                            <select value={it.pajak} aria-label="Status pajak" onChange={e => ubahItem(it.kunci, { pajak: e.target.value as StatusPajak | '' })} style={inp}>
                              <option value="">—</option>{STATUS_PAJAK.map(p => <option key={p} value={p}>{LABEL_PAJAK[p]}</option>)}
                            </select>
                          </td>
                          <td style={{ ...td, width: 58, whiteSpace: 'nowrap', paddingTop: 9 }}>
                            <button type="button" aria-label={it.buka ? 'Tutup rincian' : 'Buka rincian: spesifikasi, link, garansi'} aria-expanded={it.buka} onClick={() => ubahItem(it.kunci, { buka: !it.buka })} style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer' }}>{it.buka ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                            <button type="button" aria-label="Buang barang" onClick={() => setItem(xs => xs.filter(v => v.kunci !== it.kunci))} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer' }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                        {it.buka && (
                          <tr><td style={{ borderBottom: `1px solid ${c.border}` }} /><td colSpan={7} style={{ padding: '4px 5px 10px', borderBottom: `1px solid ${c.border}` }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: 10, borderRadius: 8, background: 'rgba(124,92,252,.07)' }}>
                              <label style={label}>Spesifikasi<textarea rows={2} value={it.spesifikasi} maxLength={500} onChange={e => ubahItem(it.kunci, { spesifikasi: e.target.value })} style={{ ...inp, resize: 'vertical' }} /></label>
                              <label style={label}>Link e-Katalog / referensi
                                <input value={it.tautan} maxLength={500} placeholder="https://katalog.inaproc.id/…" onChange={e => ubahItem(it.kunci, { tautan: e.target.value })} style={{ ...inp, borderColor: it.tautan.trim() && !isSafeHttpUrl(it.tautan.trim()) ? '#E24B4A' : c.border }} />
                                <span style={{ fontSize: 10.5 }}>Dengan link, referensi rencana yang menyalinnya sah walau tanpa berkas surat.</span>
                              </label>
                              <div style={label}>Garansi
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{GARANSI_CEPAT.map(g => <button key={g} type="button" style={chipKecil(it.garansi === g)} onClick={() => ubahItem(it.kunci, { garansi: it.garansi === g ? '' : g })}>{g}</button>)}</div>
                                <input value={it.garansi} maxLength={120} placeholder="atau ketik sendiri" onChange={e => ubahItem(it.kunci, { garansi: e.target.value })} style={inp} />
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <PrimaButton variant="ghost" size="sm" onClick={() => setItem(xs => [...xs, itemKosong(xs[xs.length - 1]?.pajak ?? '')])}>+ Barang</PrimaButton>
              {item.length > 1 && <select value="" aria-label="Samakan status pajak semua barang" onChange={e => { if (e.target.value) pajakSemua(e.target.value as StatusPajak); }} style={{ ...inp, width: 'auto' }}>
                <option value="">Samakan status pajak semua barang…</option>{STATUS_PAJAK.map(p => <option key={p} value={p}>{LABEL_PAJAK[p]}</option>)}
              </select>}
            </div>
          </div>

          <div style={bagian}>
            {judulBagian('III', 'Kategori, syarat & tindak lanjut')}
            <PilihKategori c={c} master={kategori} inp={inp} nilai={k.kat} teksLama={k.teksKategori} manual onChange={kat => setK({ ...k, kat })} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 10 }}>
              <label style={label}>Syarat &amp; pengecualian<textarea rows={2} value={k.syarat} maxLength={1000} placeholder="mis. belum termasuk kabel jaringan / lisensi DICOM" onChange={e => setK({ ...k, syarat: e.target.value })} style={{ ...inp, resize: 'vertical' }} /></label>
              <div style={label}>Status tindak lanjut
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {STATUS_TINDAK_LANJUT.map(st => <button key={st} type="button" style={chipKecil(k.status === st)} onClick={() => setK({ ...k, status: k.status === st ? '' : st })}>{LABEL_TL_PENDEK[st]}</button>)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...bagian, marginBottom: 0, borderColor: 'rgba(239,159,39,.5)' }}>
            <div style={{ fontSize: 10.5, color: c.sub, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Ringkasan surat</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4, wordBreak: 'break-word' }}>{k.rekanan.trim() ? rapikanNamaRekanan(k.rekanan) : '—'}</div>
            <div style={{ fontSize: 11.5, color: c.sub }}>{[k.nomor.trim() || null, k.tgl ? fmtTanggal(k.tgl) : null].filter(Boolean).join(' · ')}</div>
            <div style={{ fontSize: 11, color: c.sub, marginTop: 8 }}>Total nilai berharga</div>
            <div style={{ fontFamily: MONO, fontSize: 19, fontWeight: 700, color: '#EF9F27', wordBreak: 'break-all' }}>{fmtRp(total)}</div>
            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', marginTop: 4 }}><span style={{ color: c.sub }}>Barang</span><span style={{ fontFamily: MONO }}>{terisi.length} · {berharga.length} berharga</span></div>
            <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}><span style={{ color: c.sub }}>Berlaku</span><span style={{ fontFamily: MONO }}>{berlakuSampai ? fmtTanggal(berlakuSampai) : 'tanpa batas'}</span></div>
          </div>
          <div style={{ ...bagian, marginBottom: 0 }}>
            <div style={{ fontSize: 10.5, color: c.sub, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 6 }}>Kelengkapan</div>
            {[
              sebab ? { ok: false, t: sebab } : { ok: true, t: 'Siap disimpan' },
              { ok: !!k.file_id, t: k.file_id ? 'Berkas surat terlampir' : 'Belum ada berkas surat — referensi dari barang tanpa link e-Katalog belum dihitung sah' },
              ...(berharga.length ? [{ ok: berharga.every(i => k.file_id || isSafeHttpUrl(i.tautan.trim())), t: berharga.every(i => k.file_id || isSafeHttpUrl(i.tautan.trim())) ? 'Semua barang berharga bisa jadi referensi rencana yang sah' : 'Sebagian barang berharga belum bisa jadi referensi sah (perlu berkas atau link)' }] : []),
              ...(terisi.length > berharga.length ? [{ ok: false, t: `${terisi.length - berharga.length} barang belum berharga — tetap tersimpan, tidak ikut Bandingkan & "Ambil dari penawaran"` }] : []),
              ...(kedaluwarsa ? [{ ok: false, t: 'Masa berlaku sudah lewat — harganya tidak ikut rata-rata & termurah' }] : []),
              ...(terisi.some(i => !i.barang) ? [{ ok: false, t: 'Ada barang belum ditautkan ke Master Barang — tidak ikut Bandingkan' }] : []),
            ].map((x, i) => <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12, padding: '3px 0', lineHeight: 1.35 }}><b style={{ color: x.ok ? '#1D9E75' : '#BA7517' }}>{x.ok ? '✓' : '!'}</b><span>{x.t}</span></div>)}
          </div>
          {berharga.some(i => i.barang && 'id' in i.barang) && (
            <div style={{ ...bagian, marginBottom: 0 }}>
              <div style={{ fontSize: 10.5, color: c.sub, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 6 }}>Pembanding cepat</div>
              {berharga.filter(i => i.barang && 'id' in i.barang).slice(0, 5).map(i => {
                const id = (i.barang as { id: number }).id;
                const lain = (lainPerBarang.get(id) ?? []).filter(x => masihBerlaku(x.berlaku_sampai, hariIni) && kunciSatuan(x.satuan) === kunciSatuan(i.satuan));
                const min = lain.reduce<ItemPenawaran | null>((m, x) => (!m || (x.harga_satuan ?? 0) < (m.harga_satuan ?? 0) ? x : m), null);
                const lebihMurah = !min || (i.harga ?? 0) <= (min.harga_satuan ?? 0);
                return (
                  <div key={i.kunci} style={{ fontSize: 12, padding: '3px 0', borderBottom: `1px solid ${c.border}` }}>
                    <div>{i.nama_barang || (i.barang as { nama: string }).nama} <span style={{ color: c.sub }}>({i.satuan || 'unit'})</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO }}><span style={{ color: c.sub, fontFamily: 'inherit' }}>surat ini</span><span style={{ color: lebihMurah ? '#1D9E75' : c.text }}>{fmtRp(i.harga ?? 0)}</span></div>
                    {min ? <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO }}><span style={{ color: c.sub, fontFamily: 'inherit' }}>termurah lain · {min.rekanan}</span><span>{fmtRp(min.harga_satuan ?? 0)}</span></div>
                      : <div style={{ color: c.sub, fontSize: 11 }}>belum ada penawaran berlaku lain untuk barang & satuan ini</div>}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </Bingkai>
  );
}

// ─── Impor ────────────────────────────────────────────────────────────────────

type SuratImpor = {
  kunci: string; baris: number[]; sudahAda: boolean; masalah: string | null; catatan: string[];
  kepala: { rekanan: string; nomor_surat: string | null; tgl_surat: string; jenis_surat: string | null; berlaku_sampai: string | null; pic_kontak: string | null };
  jenis_kategori: string | null; jenis_kategori_id: number | null;
  item: Array<{ baris: number; nama_barang: string; harga_satuan: number | null; barang_id: number | null; barang_nama: string | null }>;
};
type PratinjauImpor =
  | { mode: 'matriks'; surat: SuratImpor[]; dilewati: string[] }
  | { mode: 'satu'; item: Array<{ baris: number; nama_barang: string; merk_tipe: string | null; satuan: string | null; harga_satuan: number; barang_id: number | null; barang_nama: string | null }>; dilewati: string[] };

function ModalImporPenawaran({ c, rekanan, onTutup, onTersimpan }: { c: WarnaBba; rekanan: SaranRekanan[]; onTutup: () => void; onTersimpan: () => void }) {
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pr, setPr] = useState<PratinjauImpor | null>(null);
  const [kp, setKp] = useState({ rekanan: '', nomor: '', tgl: tanggalHariIniWIB(), jenis: JENIS_SURAT[0] as string });
  const [sibuk, setSibuk] = useState(false);
  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 12.5, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  async function kirim(step: 'pratinjau' | 'simpan') {
    if (!berkas) return;
    setSibuk(true);
    try {
      const fd = new FormData(); fd.append('file', berkas);
      if (step === 'simpan' && pr?.mode === 'satu') fd.append('kepala', JSON.stringify({ rekanan: kp.rekanan.trim(), nomor_surat: kp.nomor.trim() || null, tgl_surat: kp.tgl, jenis_surat: kp.jenis.trim() || null }));
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/penawaran/impor?step=${step}`, { method: 'POST', body: fd });
      if (!d.ok) { toast.error(d.message || 'Berkas belum bisa diimpor'); return; }
      if (step === 'pratinjau') { setPr(d as unknown as PratinjauImpor); return; }
      const h = d as unknown as { mode: string; surat?: number; item?: number; lewat?: number };
      toast.success(h.mode === 'matriks' ? `${h.surat} surat (${h.item} barang) tercatat${h.lewat ? ` · ${h.lewat} dilewati` : ''}` : `Surat ${kp.rekanan} tersimpan — ${h.item} barang`);
      onTersimpan();
    } finally { setSibuk(false); }
  }
  const siap = pr?.mode === 'matriks' ? pr.surat.filter(s => !s.sudahAda && !s.masalah) : [];
  const sebab = !pr ? 'Baca berkasnya dulu.' : pr.mode === 'matriks' ? (siap.length ? null : 'Tidak ada surat baru yang bisa dicatat.')
    : !kp.rekanan.trim() ? 'Nama rekanan wajib.' : !kp.tgl ? 'Tanggal surat wajib.' : null;
  const th: React.CSSProperties = { fontSize: 10.5, color: c.sub, textAlign: 'left', padding: '5px 8px', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { fontSize: 12, padding: '6px 8px', borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' };
  return (
    <Bingkai c={c} judul="Impor Matriks penawaran" sub="Berkas Matriks: satu baris per barang, banyak surat sekaligus. Surat yang sudah tercatat (rekanan + nomor + tanggal sama) dilewati." lebar={1000} onTutup={onTutup}
      kaki={<>
        <a href="/api/buku-besar-aset/penawaran/impor" style={{ marginRight: 'auto', fontSize: 12.5, color: '#7C5CFC', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={13} />Unduh templat Matriks</a>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || !!sebab} data-tooltip={sebab ?? undefined} onClick={() => void kirim('simpan')}>{sibuk ? 'Menyimpan…' : pr?.mode === 'matriks' ? `Catat ${siap.length} surat` : 'Simpan surat'}</PrimaButton>
      </>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <FileSpreadsheet size={16} color={c.sub} />
        <input type="file" accept=".xlsx" onChange={e => { setBerkas(e.target.files?.[0] ?? null); setPr(null); }} style={{ fontSize: 12 }} />
        <PrimaButton variant="ghost" size="sm" disabled={!berkas || sibuk} onClick={() => void kirim('pratinjau')}>Baca berkas</PrimaButton>
      </div>
      {pr?.mode === 'matriks' && (<>
        <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>{pr.surat.length} surat terbaca</b> · {siap.length} siap dicatat · {pr.surat.filter(s => s.sudahAda).length} sudah tercatat · {pr.surat.filter(s => s.masalah).length} bermasalah</div>
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, maxHeight: 380, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Baris</th><th style={th}>Rekanan · surat</th><th style={th}>Jenis · kategori</th><th style={th}>Barang</th><th style={{ ...th, textAlign: 'right' }}>Nilai</th><th style={th}>Keadaan</th></tr></thead>
            <tbody>{pr.surat.map(s => (
              <tr key={s.kunci} style={{ opacity: s.sudahAda ? .6 : 1 }}>
                <td style={{ ...td, fontFamily: MONO }}>{s.baris.join(', ')}</td>
                <td style={td}><b>{s.kepala.rekanan}</b><div style={{ fontSize: 11, color: c.sub }}>{[s.kepala.nomor_surat, fmtTanggal(s.kepala.tgl_surat), s.kepala.berlaku_sampai ? `berlaku s.d. ${fmtTanggal(s.kepala.berlaku_sampai)}` : null].filter(Boolean).join(' · ')}</div></td>
                <td style={td}>{s.kepala.jenis_surat || '—'}<div style={{ fontSize: 11, color: c.sub }}>{s.jenis_kategori ? `${s.jenis_kategori} (ketik sendiri)` : s.jenis_kategori_id ? 'kategori dari Master' : ''}</div></td>
                <td style={td}>{s.item.length ? s.item.map(i => <div key={i.baris}>{i.nama_barang} {i.barang_id ? <span style={{ color: '#1D9E75' }}>→ {i.barang_nama}</span> : <span style={{ color: '#BA7517' }}>· belum ditautkan</span>}</div>) : <i style={{ color: c.sub }}>tanpa barang</i>}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtAngka(s.item.reduce((t, i) => t + (i.harga_satuan ?? 0), 0))}</td>
                <td style={td}>{s.sudahAda ? <span style={{ color: c.sub }}>sudah tercatat — dilewati</span> : s.masalah ? <span style={{ color: '#E24B4A' }}>{s.masalah}</span> : <span style={{ color: '#1D9E75' }}>siap</span>}
                  {s.catatan.map((x, i) => <div key={i} style={{ fontSize: 11, color: '#BA7517' }}>{x}</div>)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {pr.dilewati.length > 0 && <div style={{ fontSize: 11.5, color: '#BA7517', marginTop: 6 }}>{pr.dilewati.length} baris dilewati: {pr.dilewati.slice(0, 4).join(' ')}</div>}
      </>)}
      {pr?.mode === 'satu' && (<>
        <div style={{ fontSize: 12.5, marginBottom: 8 }}>Berkas ini berbentuk templat lama (item satu surat, tanpa kolom rekanan). Isi kepala suratnya:</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: c.sub, display: 'grid', gap: 4 }}>Rekanan *<CariPilih c={c} inp={inp} teks={kp.rekanan} onTeks={t => setKp({ ...kp, rekanan: t })} opsi={rekanan.map(r => ({ kunci: r.nama, label: r.nama, sub: r.pic_kontak }))} onPilih={o => setKp({ ...kp, rekanan: o.kunci })} manual={t => `Rekanan baru: “${rapikanNamaRekanan(t)}”`} /></div>
          <label style={{ fontSize: 11, color: c.sub, display: 'grid', gap: 4 }}>No. surat<input value={kp.nomor} onChange={e => setKp({ ...kp, nomor: e.target.value })} style={inp} /></label>
          <label style={{ fontSize: 11, color: c.sub, display: 'grid', gap: 4 }}>Tanggal surat *<input type="date" value={kp.tgl} onChange={e => setKp({ ...kp, tgl: e.target.value })} style={inp} /></label>
          <div style={{ fontSize: 11, color: c.sub, display: 'grid', gap: 4 }}>Jenis surat<CariPilih c={c} inp={inp} teks={kp.jenis} onTeks={t => setKp({ ...kp, jenis: t })} opsi={JENIS_SURAT.map(j => ({ kunci: j, label: j }))} onPilih={o => setKp({ ...kp, jenis: o.kunci })} manual={t => `Pakai “${t}”`} /></div>
        </div>
        <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>{pr.item.length} barang terbaca</b> · {pr.item.filter(i => i.barang_id).length} cocok dengan Master Barang.</div>
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, maxHeight: 240, overflow: 'auto' }}>
          {pr.item.map(i => (
            <div key={i.baris} style={{ display: 'flex', gap: 10, padding: '5px 10px', fontSize: 12, borderBottom: `1px solid ${c.border}` }}>
              <span style={{ flex: 1 }}>{i.nama_barang}{i.merk_tipe ? ` · ${i.merk_tipe}` : ''} {i.barang_id ? <span style={{ color: '#1D9E75' }}>→ {i.barang_nama}</span> : <span style={{ color: '#BA7517' }}>· belum ditautkan</span>}</span>
              <span style={{ color: c.sub }}>{i.satuan || 'unit'}</span><span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtRp(i.harga_satuan)}</span>
            </div>
          ))}
        </div>
        {pr.dilewati.length > 0 && <div style={{ fontSize: 11.5, color: '#BA7517', marginTop: 6 }}>{pr.dilewati.length} baris dilewati: {pr.dilewati.slice(0, 3).join(' ')}</div>}
      </>)}
    </Bingkai>
  );
}
