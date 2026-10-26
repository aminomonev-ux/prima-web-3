'use client';
// Modal item Buku Besar Aset — tiga kolom: daftar item | kartu item | tab Data item / Referensi
// harga / Bukti dukung. Desain terpilih: docs/CONCEPT-bba-perencanaan.md §4.4.
// Menggantikan form tambah/edit yang dulu tertanam di buku-besar-aset-client.tsx: satu modal,
// satu tombol yang menulis Data item + referensi (L78). Bukti ditulis per aksi (§4.2).

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ExternalLink, Link2, Paperclip, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import DeleteButton from '@/components/ui/DeleteButton';
import Tip from '@/components/ui/Tip';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { InputNominal } from '@/components/ui/input-nominal';
import SatuanCombobox from '@/components/shared/SatuanCombobox';
import { fetchJson } from '@/lib/shared/api';
import { isSafeHttpUrl, safeHref, safeFileHref } from '@/lib/shared/url';
import {
  SUMBER_REFERENSI, LABEL_SUMBER, JENIS_BUKTI, LABEL_JENIS_BUKTI, MAKS_REFERENSI, MAKS_BUKTI,
  tebakSumber, ringkasHarga, selisihAtasTertinggi, slotDariUsulan, rapikanReferensi, referensiSama,
  referensiSah, perluReferensi, kelengkapanBukti, buktiBelumLengkap,
  type ReferensiIsian, type JenisBukti, type KelengkapanBukti,
} from '@/lib/bba/referensi';
import { saranBarang, type BarangRingan } from '@/lib/bba/barang';
import type { BbaStatus } from '@/lib/bba/status';
import type { BbaRow, BbaBukti, BbaDetail, BbaBarang } from '@/lib/data/buku-besar-aset';
import PilihBarang, { type PilihanBarang } from './PilihBarang';
import KartuBarang from './KartuBarang';

export type TabItem = 'data' | 'ref' | 'bukti';
export type Warna = { card: string; text: string; sub: string; border: string; input: string; canvas: string; rowOdd: string };

const SUMBER_ANGGARAN = ['BLUD', 'APBD', 'DAK', 'LAINNYA'] as const;
// DIPROSES = token `info` (#378ADD) — DESIGN-SYSTEM, bukan warna baru.
export const STATUS_COLOR: Record<BbaStatus, string> = {
  DIRENCANAKAN: '#7C5CFC', DIPROSES: '#378ADD', REALISASI_PENUH: '#1D9E75', REALISASI_SEBAGIAN: '#BA7517', TIDAK_TEREALISASI: '#E24B4A',
};
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtAngka = (n: number) => Math.round(n).toLocaleString('id-ID');
const fmtVol = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
const BERKAS_DITERIMA = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx';

// ─── Lencana bersama tabel & daftar modal ─────────────────────────────────────
const WARNA_TINGKAT = { LENGKAP: '#1D9E75', SEBAGIAN: '#BA7517', KOSONG: '#E24B4A', TAUTAN_USULAN: '#7C5CFC' } as const;

export function LencanaRef({ row }: { row: BbaRow }) {
  if (row.usulan_keputusan === 'DITOLAK') return <span style={{ opacity: .6 }}>—</span>;
  const { ref } = row;
  const warna = WARNA_TINGKAT[ref.tingkat];
  const isi = ref.tingkat === 'TAUTAN_USULAN'
    ? <><Link2 size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />{row.tautan_usulan.length} usulan</>
    : `${ref.n}/${ref.target}`;
  return <span style={{ border: `1px solid ${warna}`, color: warna, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, fontFamily: MONO, whiteSpace: 'nowrap' }}>{isi}</span>;
}

export function LencanaBukti({ bukti }: { bukti: KelengkapanBukti | null }) {
  if (!bukti) return <span style={{ opacity: .6 }}>—</span>;
  const warna = bukti.n >= bukti.target ? WARNA_TINGKAT.LENGKAP : bukti.n > 0 ? WARNA_TINGKAT.SEBAGIAN : WARNA_TINGKAT.KOSONG;
  return <span style={{ border: `1px solid ${warna}`, color: warna, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, fontFamily: MONO }}>{bukti.n}/{bukti.target}</span>;
}

// ─── Isian Data item ──────────────────────────────────────────────────────────
// Status sengaja TIDAK di sini — satu pintu: modal Proses & Realisasi (§5.2).
type IsianItem = {
  tahun_anggaran: number; uraian: string; kode_rekening: string; kategori_aset: string; sumber_anggaran: string;
  vol: number; satuan: string; harga: number; penanggung_jawab: string; keterangan: string; barang: PilihanBarang;
};

const isianKosong = (tahun: number): IsianItem => ({
  tahun_anggaran: tahun, uraian: '', kode_rekening: '', kategori_aset: '', sumber_anggaran: 'BLUD',
  vol: 0, satuan: '', harga: 0, penanggung_jawab: '', keterangan: '', barang: null,
});

const isianDari = (r: BbaRow): IsianItem => ({
  tahun_anggaran: r.tahun_anggaran, uraian: r.uraian, kode_rekening: r.kode_rekening || '', kategori_aset: r.kategori_aset || '',
  sumber_anggaran: r.sumber_anggaran, vol: r.vol, satuan: r.satuan || '', harga: r.harga,
  penanggung_jawab: r.penanggung_jawab || '', keterangan: r.keterangan || '',
  barang: r.barang_id ? { id: r.barang_id, nama: r.barang_nama ?? '' } : null,
});

/** Isian barang → isi body Simpan. Barang baru dibuat server di transaksi Simpan yang sama (L78). */
const bodyBarang = (p: PilihanBarang) => !p ? { barang_id: null } : 'id' in p ? { barang_id: p.id } : { barang_baru: p.baru };

type Muatan = { item: BbaRow; referensiTersimpan: number };
type Dasar = { isian: IsianItem; refs: ReferensiIsian[] };

const refBaru = (): ReferensiIsian => ({ sumber: 'LAINNYA', nama_penyedia: null, url: null, harga: null, tgl_cek: null, file_id: null });
const unduhBerkas = (fileId: string) => `/api/upload/download?id=${encodeURIComponent(fileId)}`;

/** SATU jalur unggah untuk referensi & bukti — berkasnya ber-context `buku_besar_aset` (aturan unduh BBA, §4.3). */
async function unggahBerkas(file: File): Promise<{ fileId: string; filename: string } | null> {
  if (file.size > 10 * 1024 * 1024) { toast.error('Ukuran berkas maksimal 10 MB'); return null; }
  const fd = new FormData(); fd.append('file', file); fd.append('modul', 'buku_besar_aset');
  const d = await fetchJson<unknown>('/api/upload', { method: 'POST', body: fd });
  if (!d.ok) { toast.error(d.message || 'Gagal mengunggah berkas'); return null; }
  const r = d as unknown as { fileId: string; filename: string };
  return { fileId: r.fileId, filename: r.filename };
}

type Props = {
  c: Warna;
  /** Daftar kiri — dipotret saat modal dibuka. `null` = Tambah item (tanpa daftar). */
  daftar: BbaRow[] | null;
  awalId: number | null;
  tabAwal: TabItem;
  saringanAwal: 'BELUM' | 'SEMUA';
  tahun: number;
  kategori: string[];
  onTutup: () => void;
  /** Ada yang tertulis ke server (item/referensi/bukti) — tabel induk memuat ulang. */
  onTersimpan: () => void;
};

export default function ModalItem({ c, daftar: daftarAwal, awalId, tabAwal, saringanAwal, tahun, kategori, onTutup, onTersimpan }: Props) {
  const [daftar, setDaftar] = useState<BbaRow[]>(daftarAwal ?? []);
  const [belumSaatBuka] = useState(() => new Set((daftarAwal ?? []).filter(perluReferensi).map(r => r.id)));
  const [saringan, setSaringan] = useState<'BELUM' | 'SEMUA'>(saringanAwal);
  const [aktifId, setAktifId] = useState<number | null>(awalId);
  const [tab, setTab] = useState<TabItem>(tabAwal);
  const [muatan, setMuatan] = useState<Muatan | null>(null);
  const [isian, setIsian] = useState<IsianItem>(() => isianKosong(tahun));
  const [refs, setRefs] = useState<ReferensiIsian[]>([]);
  const [bukti, setBukti] = useState<BbaBukti[]>([]);
  const [dasar, setDasar] = useState<Dasar>(() => ({ isian: isianKosong(tahun), refs: [] }));
  const [galatMuat, setGalatMuat] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [daftarBarang, setDaftarBarang] = useState<BarangRingan[]>([]);
  const nomorMuat = useRef(0);

  async function muatBarang() {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/barang');
    if (d.ok) setDaftarBarang((d as unknown as { data: BbaBarang[] }).data.map(b => ({ id: b.id, nama: b.nama })));
  }

  const modeBaru = aktifId === null;
  const memuat = !modeBaru && muatan?.item.id !== aktifId && !galatMuat;
  const item = !modeBaru && muatan?.item.id === aktifId ? muatan.item : null;
  const isUsulan = item?.origin === 'USULAN';
  // Dihitung dari daftar bukti di layar — bukti ditulis per aksi, jadi ini selalu angka tersimpan terbaru.
  const kBukti = item ? kelengkapanBukti(bukti.map(b => b.jenis), item.status) : null;

  // L79b: dihitung dari isian vs muatan, bukan bendera yang bisa lupa diturunkan.
  const belumTersimpan = JSON.stringify(isian) !== JSON.stringify(dasar.isian) || !referensiSama(refs, dasar.refs);

  const daftarTampil = useMemo(
    () => saringan === 'BELUM' ? daftar.filter(r => belumSaatBuka.has(r.id)) : daftar,
    [daftar, saringan, belumSaatBuka],
  );
  const posisi = aktifId === null ? -1 : daftarTampil.findIndex(r => r.id === aktifId);
  const idBerikut = posisi >= 0 ? daftarTampil[posisi + 1]?.id ?? null : daftarTampil[0]?.id ?? null;
  const idSebelum = posisi > 0 ? daftarTampil[posisi - 1].id : null;

  async function muat(id: number) {
    const nomor = ++nomorMuat.current;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset?id=${id}`);
    if (nomor !== nomorMuat.current) return; // jawaban terlambat untuk item yang sudah ditinggalkan
    if (!d.ok) { setGalatMuat(d.message || 'Gagal memuat item'); return; }
    const det = d as unknown as BbaDetail;
    // Selama belum ada referensi tersimpan, slot diisi dari tautan usulan (§4.1) — dan itu
    // jadi DASAR pembanding, jadi membuka item tanpa mengetik apa pun tidak berbunyi "belum tersimpan".
    const refsAwal = det.referensi.length > 0 ? det.referensi : slotDariUsulan(det.item.tautan_usulan);
    const isianAwal = isianDari(det.item);
    setGalatMuat('');
    setMuatan({ item: det.item, referensiTersimpan: det.referensi.length });
    setIsian(isianAwal);
    setRefs(refsAwal);
    setBukti(det.bukti);
    setDasar({ isian: isianAwal, refs: refsAwal });
    setDaftar(ds => ds.map(r => r.id === det.item.id ? det.item : r));
  }

  // Lewat microtask (pola MenuAccessPanel): `muat` menyetel state, dan memanggilnya langsung
  // di badan effect ditolak react-hooks/set-state-in-effect.
  useEffect(() => {
    if (awalId !== null) void Promise.resolve().then(() => muat(awalId));
    void Promise.resolve().then(muatBarang);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat sekali saat modal dibuka; berpindah item lewat pindahKe
  }, []);

  async function bolehTinggalkan(): Promise<boolean> {
    if (!belumTersimpan) return true;
    return confirmDialog({
      title: 'Perubahan belum disimpan',
      message: 'Isian item ini belum disimpan. Tinggalkan tanpa menyimpan?',
      confirmLabel: 'Tinggalkan', variant: 'warning',
    });
  }

  async function pindahKe(id: number, sudahDitanya = false) {
    if (id === aktifId) return;
    if (!sudahDitanya && !(await bolehTinggalkan())) return;
    setGalatMuat('');
    setAktifId(id);
    void muat(id);
  }

  async function tutup() {
    if (await bolehTinggalkan()) onTutup();
  }

  /** Lencana daftar untuk item yang barusan disimpan — tanpa menyentuh isian item yang sedang dibuka. */
  async function segarkanLencana(id: number) {
    const d = await fetchJson<unknown>(`/api/buku-besar-aset?id=${id}`);
    if (!d.ok) return;
    const det = d as unknown as BbaDetail;
    setDaftar(ds => ds.map(r => r.id === id ? det.item : r));
  }

  async function simpan(lanjut: boolean) {
    if (lanjut && !belumTersimpan) { if (idBerikut !== null) void pindahKe(idBerikut, true); return; }
    if (!isian.uraian.trim()) { setTab('data'); toast.error('Uraian wajib diisi'); return; }
    const rapi = rapikanReferensi(refs);
    const tautanSalah = rapi.findIndex(r => r.url && !isSafeHttpUrl(r.url));
    if (tautanSalah >= 0) { setTab('ref'); toast.error(`Tautan referensi ke-${tautanSalah + 1} harus diawali http:// atau https://`); return; }
    if (rapi.length > MAKS_REFERENSI) { setTab('ref'); toast.error(`Referensi harga paling banyak ${MAKS_REFERENSI}`); return; }

    const dataUmum = {
      kode_rekening: isian.kode_rekening || null, kategori_aset: isian.kategori_aset || null,
      sumber_anggaran: isian.sumber_anggaran, satuan: isian.satuan || null,
      penanggung_jawab: isian.penanggung_jawab || null, keterangan: isian.keterangan || null,
    };
    // L87: referensi & barang hanya dikirim kalau berubah — `undefined` di server = jangan sentuh.
    const refBerubah = !referensiSama(refs, dasar.refs);
    const barangBerubah = JSON.stringify(isian.barang) !== JSON.stringify(dasar.isian.barang);
    const body = modeBaru
      ? { tahun_anggaran: isian.tahun_anggaran, uraian: isian.uraian, vol: isian.vol, harga: isian.harga, ...dataUmum,
          ...(isian.barang ? bodyBarang(isian.barang) : {}), ...(rapi.length ? { referensi: rapi } : {}) }
      : {
          id: item!.id, expected_version: item!.version, ...dataUmum,
          // Baris asal-usulan: uraian/vol/harga terkunci server-side → tidak dikirim (T8).
          ...(isUsulan ? {} : { uraian: isian.uraian, vol: isian.vol, harga: isian.harga }),
          ...(barangBerubah ? bodyBarang(isian.barang) : {}),
          ...(refBerubah ? { referensi: rapi } : {}),
        };

    setMenyimpan(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset', { method: modeBaru ? 'POST' : 'PATCH', body: JSON.stringify(body) });
      if (!d.ok) {
        if (d.code === 'VERSION_CONFLICT' && item) {
          toast.error('Item ini sudah diubah orang lain — memuat versi terbarunya.');
          void muat(item.id);
        } else toast.error(d.message || 'Gagal menyimpan');
        return;
      }
      onTersimpan();
      if (isian.barang && 'baru' in isian.barang) void muatBarang();
      if (modeBaru) {
        toast.success('Item ditambahkan — referensi & bukti dukung bisa dilengkapi di sini.');
        const id = Number((d as unknown as { id: number }).id);
        setDasar({ isian, refs });
        setAktifId(id);
        void muat(id);
        return;
      }
      toast.success('Tersimpan');
      const id = item!.id;
      if (lanjut && idBerikut !== null) {
        void segarkanLencana(id);
        void pindahKe(idBerikut, true);
      } else void muat(id);
    } finally { setMenyimpan(false); }
  }

  const ringkas = ringkasHarga(refs);
  const selisih = selisihAtasTertinggi(isian.harga, ringkas);
  const jumlahSah = refs.filter(referensiSah).length;
  const dariUsulan = (r: ReferensiIsian) => !!muatan && muatan.referensiTersimpan === 0 && !!r.url && (item?.tautan_usulan.includes(r.url) ?? false);

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, minWidth: 0, width: '100%', boxSizing: 'border-box' };
  const num: React.CSSProperties = { ...inp, fontFamily: MONO, textAlign: 'right' };
  const kunci: React.CSSProperties = { opacity: .7, cursor: 'not-allowed' };
  const ikonBtn: React.CSSProperties = { background: 'transparent', border: `1px solid ${c.border}`, color: c.sub, borderRadius: 6, width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };

  const judul = modeBaru ? 'Tambah Item' : item ? item.uraian : 'Memuat item…';
  const tabs: { k: TabItem; label: string; mati?: string }[] = [
    { k: 'data', label: 'Data item' },
    { k: 'ref', label: `Referensi harga (${jumlahSah})` },
    { k: 'bukti', label: `Bukti dukung (${bukti.length})`, mati: modeBaru ? 'Simpan item dulu — bukti menempel pada item yang sudah tersimpan.' : undefined },
  ];
  const tampilDaftar = daftarAwal !== null;

  return (
    <div onClick={tutup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <style>{MI_CSS}</style>
      <div onClick={e => e.stopPropagation()} className="bba-mi-kotak" style={{ background: c.card, color: c.text, border: `1px solid ${c.border}` }}>
        {/* Kepala */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{judul}</div>
            {item && <div style={{ fontSize: 11.5, color: c.sub, fontFamily: MONO }}>{item.canonical_id} · {item.tahun_anggaran} · {fmtVol(item.vol)} {item.satuan || ''}</div>}
          </div>
          {tampilDaftar && daftarTampil.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="bba-mi-pager" style={{ alignItems: 'center', gap: 4 }}>
                <button type="button" aria-label="Item sebelumnya" style={ikonBtn} disabled={idSebelum === null} onClick={() => idSebelum !== null && void pindahKe(idSebelum)}><ChevronLeft size={15} /></button>
                <button type="button" aria-label="Item berikutnya" style={ikonBtn} disabled={idBerikut === null} onClick={() => idBerikut !== null && void pindahKe(idBerikut)}><ChevronRight size={15} /></button>
              </span>
              <span style={{ fontSize: 12, color: c.sub, fontFamily: MONO, whiteSpace: 'nowrap' }}>{posisi >= 0 ? posisi + 1 : '–'} dari {daftarTampil.length}</span>
            </div>
          )}
          <button type="button" aria-label="Tutup" onClick={tutup} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', padding: 4, display: 'flex' }}><X size={18} /></button>
        </div>

        <div className={`bba-mi-badan${tampilDaftar ? '' : ' tanpa-daftar'}`}>
          {/* Kolom kiri — daftar item */}
          {tampilDaftar && (
            <div className="bba-mi-daftar" style={{ borderRight: `1px solid ${c.border}` }}>
              <div style={{ display: 'flex', gap: 6, padding: '10px 10px 8px' }}>
                {(['BELUM', 'SEMUA'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setSaringan(s)}
                    style={{ flex: 1, padding: '4px 8px', fontSize: 11.5, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                      border: `1px solid ${saringan === s ? '#EF9F27' : c.border}`, background: saringan === s ? 'rgba(239,159,39,.15)' : 'transparent', color: saringan === s ? '#EF9F27' : c.sub }}>
                    {s === 'BELUM' ? `Belum (${belumSaatBuka.size})` : `Semua (${daftar.length})`}
                  </button>
                ))}
              </div>
              <div style={{ overflow: 'auto', flex: 1 }}>
                {daftarTampil.length === 0 && <div style={{ fontSize: 12, color: c.sub, padding: 12 }}>Semua item di daftar ini referensinya sudah lengkap saat modal dibuka.</div>}
                {daftarTampil.map(r => {
                  const aktif = r.id === aktifId;
                  return (
                    <button key={r.id} type="button" onClick={() => void pindahKe(r.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', cursor: 'pointer',
                        borderLeft: `3px solid ${aktif ? '#EF9F27' : 'transparent'}`, background: aktif ? 'rgba(239,159,39,.10)' : 'transparent', color: c.text }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.uraian}</span>
                      <LencanaRef row={r} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Kolom tengah — kartu item + kartu barang (§4.4/§5.3; kondisi eksisting menyusul §6) */}
          <div className="bba-mi-kartu" style={{ borderRight: `1px solid ${c.border}` }}>
            {modeBaru ? (
              <div style={{ fontSize: 12.5, color: c.sub, lineHeight: 1.6 }}>
                Item baru tahun <b style={{ color: c.text, fontFamily: MONO }}>{isian.tahun_anggaran}</b>.
                Isi Data item, lalu referensi harga bila sudah ada. Bukti dukung bisa ditambahkan sesudah item tersimpan.
              </div>
            ) : item ? (
              <KartuItem item={item} kBukti={kBukti} c={c} />
            ) : (
              <div style={{ fontSize: 12.5, color: galatMuat ? '#E24B4A' : c.sub }}>{galatMuat || 'Memuat…'}</div>
            )}
            {(modeBaru || item) && (
              <div className="bba-mi-barang" style={{ borderTop: `1px solid ${c.border}`, marginTop: 12, paddingTop: 10 }}>
                {isian.barang && 'id' in isian.barang ? <>
                  <KartuBarang barangId={isian.barang.id} tahun={isian.tahun_anggaran} c={c} tandaiTahun={isian.tahun_anggaran} ringkas />
                  {isian.barang.id !== item?.barang_id && (
                    <div style={{ fontSize: 11, color: '#BA7517', marginTop: 6 }}>Belum disimpan — angka di atas belum memuat item ini.</div>
                  )}
                </> : isian.barang ? (
                  <div style={{ fontSize: 12, color: c.sub, lineHeight: 1.5 }}>Barang baru <b style={{ color: c.text }}>“{isian.barang.baru}”</b> dibuat saat Simpan — belum ada riwayat.</div>
                ) : (
                  <div style={{ fontSize: 12, color: c.sub, lineHeight: 1.5 }}>
                    Belum ditautkan ke barang. Pilih barangnya di <b>Data item</b> supaya riwayat beli dan yang sedang diproses terlihat di sini.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Kolom kanan — tab */}
          <div className="bba-mi-kanan">
            <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0', borderBottom: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
              {tabs.map(t => (
                <button key={t.k} type="button" disabled={!!t.mati} data-tooltip={t.mati} onClick={() => setTab(t.k)}
                  style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 600, background: 'transparent', border: 'none', cursor: t.mati ? 'not-allowed' : 'pointer',
                    borderBottom: `2px solid ${tab === t.k ? '#EF9F27' : 'transparent'}`, color: tab === t.k ? c.text : c.sub, opacity: t.mati ? .5 : 1 }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ padding: 14, overflow: 'auto', flex: 1 }}>
              {memuat ? <div style={{ fontSize: 12.5, color: c.sub }}>Memuat…</div>
                : galatMuat ? <div style={{ fontSize: 12.5, color: '#E24B4A' }}>{galatMuat}</div>
                : tab === 'data' ? (
                  <div className="bba-mi-grid2">
                    {isUsulan && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#7C5CFC', background: 'rgba(124,92,252,.12)', border: '1px solid rgba(124,92,252,.4)', borderRadius: 6, padding: '6px 10px' }}>
                        Baris asal Usulan Kebutuhan — uraian, vol, dan harga terkunci (sumber kebenaran: usulan).
                      </div>
                    )}
                    <Field label="Tahun"><PrimaNumberField value={isian.tahun_anggaran} disabled={!modeBaru} onChange={e => setIsian({ ...isian, tahun_anggaran: Number(e.target.value) })} /></Field>
                    <Field label="Sumber"><select value={isian.sumber_anggaran} onChange={e => setIsian({ ...isian, sumber_anggaran: e.target.value })} style={inp}>{SUMBER_ANGGARAN.map(s => <option key={s}>{s}</option>)}</select></Field>
                    <Field label="Uraian *" full><input value={isian.uraian} readOnly={isUsulan} onChange={e => setIsian({ ...isian, uraian: e.target.value })} style={isUsulan ? { ...inp, ...kunci } : inp} /></Field>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 11, opacity: .8 }}>Barang <span style={{ opacity: .8 }}>— jenis barang untuk riwayat beli (spesifikasi tetap di uraian)</span></span>
                      <PilihBarang daftar={daftarBarang} nilai={isian.barang} saran={isian.barang ? null : saranBarang(isian.uraian, daftarBarang)}
                        onUbah={barang => setIsian({ ...isian, barang })} c={c} inp={inp} />
                    </div>
                    <Field label="Kode Rekening"><input value={isian.kode_rekening} onChange={e => setIsian({ ...isian, kode_rekening: e.target.value })} style={{ ...inp, fontFamily: MONO }} /></Field>
                    <Field label="Kategori Aset"><SatuanCombobox value={isian.kategori_aset} onChange={v => setIsian({ ...isian, kategori_aset: v })} options={kategori} style={inp} placeholder="Pilih / ketik kategori…" /></Field>
                    <Field label="Vol"><PrimaNumberField value={isian.vol} disabled={isUsulan} onChange={e => setIsian({ ...isian, vol: Number(e.target.value) })} /></Field>
                    <Field label="Satuan"><SatuanCombobox value={isian.satuan} onChange={v => setIsian({ ...isian, satuan: v })} style={inp} placeholder="Pilih / ketik satuan…" /></Field>
                    <Field label="Harga satuan">{isUsulan
                      ? <input type="text" readOnly value={fmtRp(isian.harga)} style={{ ...num, ...kunci }} />
                      : <InputNominal value={isian.harga} onChange={v => setIsian({ ...isian, harga: v })} style={num} />}</Field>
                    <Field label={isUsulan ? 'Nilai Rencana (dari putusan usulan)' : 'Nilai Rencana (vol × harga)'}><input type="text" readOnly value={fmtRp(isUsulan ? (item?.nilai_rencana ?? 0) : isian.vol * isian.harga)} style={{ ...num, ...kunci }} /></Field>
                    <Field label="Penanggung Jawab" full><input value={isian.penanggung_jawab} onChange={e => setIsian({ ...isian, penanggung_jawab: e.target.value })} style={inp} /></Field>
                    <Field label="Keterangan" full><textarea value={isian.keterangan} onChange={e => setIsian({ ...isian, keterangan: e.target.value })} style={{ ...inp, minHeight: 54 }} /></Field>
                  </div>
                ) : tab === 'ref' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {refs.length === 0 && <div style={{ fontSize: 12.5, color: c.sub }}>Belum ada referensi harga. Target 3 referensi — e-Katalog, toko daring, atau penawaran toko.</div>}
                    {refs.map((r, i) => (
                      <BarisReferensi key={i} r={r} nomor={i + 1} c={c} inp={inp} num={num} ikonBtn={ikonBtn} dariUsulan={dariUsulan(r)}
                        ubah={baru => setRefs(rs => rs.map((x, j) => j === i ? baru : x))}
                        hapus={() => setRefs(rs => rs.filter((_, j) => j !== i))} />
                    ))}
                    <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: c.sub }}>
                        <span>Ref sah <b style={{ fontFamily: MONO, color: jumlahSah >= 3 ? '#1D9E75' : '#BA7517' }}>{jumlahSah}/3</b></span>
                        {ringkas ? <>
                          <span>Terendah <b style={{ fontFamily: MONO, color: c.text }}>{fmtAngka(ringkas.terendah)}</b></span>
                          <span>Rata-rata <b style={{ fontFamily: MONO, color: c.text }}>{fmtAngka(ringkas.rata)}</b></span>
                          <span>Tertinggi <b style={{ fontFamily: MONO, color: c.text }}>{fmtAngka(ringkas.tertinggi)}</b></span>
                        </> : <span>Ringkasan harga muncul begitu ada referensi berharga dengan tautan atau berkas.</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: c.sub }}>Harga satuan</span>
                        <div style={{ width: 170 }}>{isUsulan
                          ? <input type="text" readOnly value={fmtAngka(isian.harga)} style={{ ...num, ...kunci }} />
                          : <InputNominal value={isian.harga} onChange={v => setIsian({ ...isian, harga: v })} style={num} />}</div>
                        {selisih > 0 && <span style={{ fontSize: 12, color: '#BA7517', fontWeight: 600 }}>Di atas referensi tertinggi (selisih {fmtRp(selisih)})</span>}
                      </div>
                      {isUsulan && <div style={{ fontSize: 11.5, color: c.sub }}>Harga baris usulan terkunci — referensi di sini menjadi pembanding.</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <PrimaButton variant="purple" size="sm" disabled={refs.length >= MAKS_REFERENSI} data-tooltip={refs.length >= MAKS_REFERENSI ? `Paling banyak ${MAKS_REFERENSI} referensi` : undefined} onClick={() => setRefs(rs => [...rs, refBaru()])}>+ Referensi</PrimaButton>
                      {!isUsulan && <>
                        <PrimaButton variant="ghost" size="sm" disabled={!ringkas} onClick={() => ringkas && setIsian({ ...isian, harga: ringkas.terendah })}>Pakai terendah</PrimaButton>
                        <PrimaButton variant="ghost" size="sm" disabled={!ringkas} onClick={() => ringkas && setIsian({ ...isian, harga: ringkas.rata })}>Pakai rata-rata</PrimaButton>
                      </>}
                    </div>
                  </div>
                ) : item ? (
                  <PanelBukti item={item} bukti={bukti} kBukti={kBukti} c={c} inp={inp} ikonBtn={ikonBtn}
                    onBerubah={b => { setBukti(b); onTersimpan(); }} />
                ) : null}
            </div>
          </div>
        </div>

        {/* Kaki */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
          {tampilDaftar && <PrimaButton variant="ghost" disabled={idSebelum === null} onClick={() => idSebelum !== null && void pindahKe(idSebelum)}>← Sebelumnya</PrimaButton>}
          <span style={{ flex: 1, fontSize: 11.5, color: belumTersimpan ? '#BA7517' : c.sub }}>{belumTersimpan ? 'Ada perubahan yang belum disimpan' : ''}</span>
          <PrimaButton menulis variant={tampilDaftar ? 'ghost' : 'primary'} disabled={menyimpan || memuat || !!galatMuat || !belumTersimpan}
            data-tooltip={!belumTersimpan && !menyimpan ? 'Belum ada perubahan' : undefined} onClick={() => void simpan(false)}>
            {menyimpan ? 'Menyimpan…' : 'Simpan'}
          </PrimaButton>
          {tampilDaftar && (
            <PrimaButton menulis variant="primary" disabled={menyimpan || memuat || !!galatMuat || idBerikut === null}
              data-tooltip={idBerikut === null ? 'Ini item terakhir di daftar' : undefined} onClick={() => void simpan(true)}>
              {belumTersimpan ? 'Simpan dan berikutnya →' : 'Berikutnya →'}
            </PrimaButton>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : undefined, minWidth: 0 }}>
    <span style={{ fontSize: 11, opacity: .8 }}>{label}</span>{children}
  </label>;
}

function KartuItem({ item, kBukti, c }: { item: BbaRow; kBukti: KelengkapanBukti | null; c: Warna }) {
  const ditolak = item.usulan_keputusan === 'DITOLAK';
  const baris: [string, React.ReactNode][] = [
    ['Status', ditolak
      ? <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20 }}>DITOLAK</span>
      : <span style={{ background: STATUS_COLOR[item.status], color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20 }}>{item.status}</span>],
    ['Volume', <span key="v" style={{ fontFamily: MONO }}>{fmtVol(item.vol)} {item.satuan || ''}</span>],
    ['Harga satuan', <span key="h" style={{ fontFamily: MONO }}>{fmtRp(item.harga)}</span>],
    ['Nilai rencana', <span key="n" style={{ fontFamily: MONO }}>{fmtRp(item.nilai_rencana)}</span>],
    ['Realisasi', ditolak ? '—' : <span key="r" style={{ fontFamily: MONO }}>{fmtVol(item.vol_realisasi)}/{fmtVol(item.vol)} · {fmtRp(item.nilai_realisasi)}</span>],
    ['Asal', item.origin === 'USULAN'
      ? <span key="a">Usulan <span style={{ fontFamily: MONO }}>{item.usulan_no}</span>{item.sub_bidang ? ` · ${item.sub_bidang}` : ''}</span>
      : 'Manual'],
    ['Referensi', <LencanaRef key="ref" row={item} />],
    ['Bukti', <LencanaBukti key="b" bukti={kBukti} />],
  ];
  return (
    <div className="bba-mi-kartu-isi">
      <div style={{ fontSize: 11, color: c.sub, marginBottom: 2 }}>Ringkasan item</div>
      {baris.map(([k, v]) => (
        <div key={k} className="bba-mi-kv" style={{ borderBottom: `1px solid ${c.border}` }}>
          <span style={{ color: c.sub }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
        </div>
      ))}
      {item.pengusul && <div style={{ fontSize: 11.5, color: c.sub, marginTop: 6 }}>Pengusul: {item.pengusul}</div>}
    </div>
  );
}

type GayaInput = { c: Warna; inp: React.CSSProperties; ikonBtn: React.CSSProperties };

function BarisReferensi({ r, nomor, c, inp, num, ikonBtn, dariUsulan, ubah, hapus }: GayaInput & {
  r: ReferensiIsian; nomor: number; num: React.CSSProperties; dariUsulan: boolean;
  ubah: (r: ReferensiIsian) => void; hapus: () => void;
}) {
  const [mengunggah, setMengunggah] = useState(false);
  const pilihBerkas = useRef<HTMLInputElement>(null);
  const href = safeHref(r.url);
  const sah = referensiSah(r);

  async function unggah(file: File) {
    setMengunggah(true);
    try {
      const h = await unggahBerkas(file);
      if (h) ubah({ ...r, file_id: h.fileId });
    } finally { setMengunggah(false); }
  }

  return (
    <div style={{ border: `1px solid ${sah ? 'rgba(29,158,117,.45)' : c.border}`, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: c.sub }}>
        <span style={{ fontFamily: MONO }}>#{nomor}</span>
        {dariUsulan && <span style={{ color: '#7C5CFC', fontWeight: 600 }}>dari usulan — isi harganya</span>}
        {!sah && !dariUsulan && <span>belum dihitung: perlu harga + tautan atau berkas</span>}
        <span style={{ flex: 1 }} />
        <Tip label="Hapus referensi ini"><DeleteButton iconSize={12} onClick={hapus} /></Tip>
      </div>
      <div className="bba-mi-ref-a">
        <select value={r.sumber} onChange={e => ubah({ ...r, sumber: e.target.value as ReferensiIsian['sumber'] })} style={inp} aria-label="Sumber referensi">
          {SUMBER_REFERENSI.map(s => <option key={s} value={s}>{LABEL_SUMBER[s]}</option>)}
        </select>
        <input value={r.nama_penyedia ?? ''} placeholder="Penyedia / toko" onChange={e => ubah({ ...r, nama_penyedia: e.target.value })} style={inp} aria-label="Nama penyedia" />
        <InputNominal nullable value={r.harga} placeholder="Harga satuan" onChange={v => ubah({ ...r, harga: v })} style={num} />
      </div>
      <div className="bba-mi-ref-b">
        <input value={r.url ?? ''} placeholder="https://… (e-Katalog, Shopee, Tokopedia)"
          onChange={e => { const url = e.target.value; ubah({ ...r, url, sumber: tebakSumber(url) ?? r.sumber }); }}
          style={{ ...inp, borderColor: r.url && !isSafeHttpUrl(r.url) ? '#E24B4A' : c.border }} aria-label="Tautan referensi" />
        <input type="date" value={r.tgl_cek ?? ''} onChange={e => ubah({ ...r, tgl_cek: e.target.value || null })} style={inp} aria-label="Tanggal dicek" />
        <div style={{ display: 'flex', gap: 4 }}>
          {href
            ? <Tip label="Buka tautan"><a href={href} target="_blank" rel="noopener noreferrer" style={{ ...ikonBtn, textDecoration: 'none' }} aria-label="Buka tautan"><ExternalLink size={14} /></a></Tip>
            : <span style={{ ...ikonBtn, opacity: .35, cursor: 'default' }}><ExternalLink size={14} /></span>}
          {r.file_id
            ? <>
                <Tip label="Buka tangkapan layar / nota"><a href={unduhBerkas(r.file_id)} target="_blank" rel="noopener noreferrer" style={{ ...ikonBtn, textDecoration: 'none', color: '#1D9E75', borderColor: '#1D9E75' }} aria-label="Buka berkas"><Paperclip size={14} /></a></Tip>
                <Tip label="Lepas berkas dari referensi"><button type="button" style={ikonBtn} onClick={() => ubah({ ...r, file_id: null })} aria-label="Lepas berkas"><X size={14} /></button></Tip>
              </>
            : <Tip label={mengunggah ? 'Mengunggah…' : 'Unggah tangkapan layar / nota'}>
                <button type="button" style={ikonBtn} disabled={mengunggah} onClick={() => pilihBerkas.current?.click()} aria-label="Unggah berkas"><Paperclip size={14} /></button>
              </Tip>}
          <input ref={pilihBerkas} type="file" accept={BERKAS_DITERIMA} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void unggah(f); }} />
        </div>
      </div>
    </div>
  );
}

function PanelBukti({ item, bukti, kBukti, c, inp, ikonBtn, onBerubah }: GayaInput & {
  item: BbaRow; bukti: BbaBukti[]; kBukti: KelengkapanBukti | null; onBerubah: (b: BbaBukti[]) => void;
}) {
  const [jenis, setJenis] = useState<JenisBukti>('BUKTI_BELI');
  const [nama, setNama] = useState('');
  const [url, setUrl] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [berkas, setBerkas] = useState<File | null>(null);
  const [mengirim, setMengirim] = useState(false);
  const pilihBerkas = useRef<HTMLInputElement>(null);
  const lampiranUsulan = safeFileHref(item.lampiran_usulan);

  async function tambah() {
    if (!berkas && !url.trim()) { toast.error('Pilih berkas atau isi tautan bukti'); return; }
    if (url.trim() && !isSafeHttpUrl(url)) { toast.error('Tautan harus diawali http:// atau https://'); return; }
    const namaAkhir = nama.trim() || berkas?.name || '';
    if (!namaAkhir) { toast.error('Nama bukti wajib diisi'); return; }
    setMengirim(true);
    try {
      // Berkas diunggah saat Tambah ditekan, bukan saat dipilih: memilih lalu batal tidak meninggalkan berkas yatim di Drive.
      const h = berkas ? await unggahBerkas(berkas) : null;
      if (berkas && !h) return;
      const d = await fetchJson<unknown>('/api/buku-besar-aset/bukti', {
        method: 'POST',
        body: JSON.stringify({ aset_id: item.id, jenis, nama: namaAkhir, url: url.trim() || null, file_id: h?.fileId ?? null, keterangan: keterangan.trim() || null }),
      });
      if (!d.ok) { toast.error(d.message || 'Gagal menambah bukti'); return; }
      toast.success('Bukti ditambahkan');
      setNama(''); setUrl(''); setKeterangan(''); setBerkas(null);
      onBerubah((d as unknown as { bukti: BbaBukti[] }).bukti);
    } finally { setMengirim(false); }
  }

  async function hapus(b: BbaBukti) {
    if (!(await confirmDialog({
      title: 'Hapus bukti',
      message: b.file_id
        ? `Lepas "${b.nama}" dari item ini? Berkasnya tetap tersimpan di Drive sebagai jejak audit.`
        : `Lepas "${b.nama}" dari item ini?`,
      confirmLabel: 'Hapus', variant: 'danger',
    }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/bukti?id=${b.id}`, { method: 'DELETE' });
    if (!d.ok) { toast.error(d.message || 'Gagal menghapus bukti'); return; }
    toast.success('Bukti dilepas');
    onBerubah((d as unknown as { bukti: BbaBukti[] }).bukti);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11.5, color: c.sub, background: 'rgba(124,92,252,.08)', border: '1px solid rgba(124,92,252,.3)', borderRadius: 6, padding: '6px 10px' }}>
        Bukti tersimpan langsung saat ditambah atau dihapus — tidak menunggu tombol Simpan.
      </div>
      {buktiBelumLengkap(kBukti) && (
        <div style={{ fontSize: 12, color: '#BA7517' }}>
          Bukti {kBukti!.n}/{kBukti!.target}: lengkapi bukti beli, BAST, dan foto barang.
        </div>
      )}
      {lampiranUsulan && (
        <div style={{ fontSize: 12, color: c.sub }}>
          Lampiran usulan: <a href={lampiranUsulan} target="_blank" rel="noopener noreferrer" style={{ color: '#7C5CFC' }}>buka berkas dari Usulan Kebutuhan</a>
        </div>
      )}
      {bukti.length === 0 && <div style={{ fontSize: 12.5, color: c.sub }}>Belum ada bukti dukung.</div>}
      {bukti.map(b => {
        const href = b.file_id ? unduhBerkas(b.file_id) : safeHref(b.url);
        return (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${c.border}`, borderRadius: 10, padding: '7px 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, border: `1px solid ${c.border}`, color: c.sub, whiteSpace: 'nowrap' }}>{LABEL_JENIS_BUKTI[b.jenis]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.nama}</div>
              <div style={{ fontSize: 11, color: c.sub }}>{b.keterangan ? `${b.keterangan} · ` : ''}{b.oleh ?? '—'} · <span style={{ fontFamily: MONO }}>{b.created_at}</span></div>
            </div>
            {href && <Tip label={b.file_id ? 'Buka berkas' : 'Buka tautan'}><a href={href} target="_blank" rel="noopener noreferrer" style={{ ...ikonBtn, textDecoration: 'none' }} aria-label="Buka bukti"><ExternalLink size={14} /></a></Tip>}
            <Tip label="Lepas bukti ini"><DeleteButton iconSize={12} onClick={() => void hapus(b)} /></Tip>
          </div>
        );
      })}
      {bukti.length < MAKS_BUKTI ? (
        <div style={{ border: `1px dashed ${c.border}`, borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="bba-mi-ref-a">
            <select value={jenis} onChange={e => setJenis(e.target.value as JenisBukti)} style={inp} aria-label="Jenis bukti">
              {JENIS_BUKTI.map(j => <option key={j} value={j}>{LABEL_JENIS_BUKTI[j]}</option>)}
            </select>
            <input value={nama} placeholder={berkas ? berkas.name : 'Nama bukti (mis. Faktur PT X)'} onChange={e => setNama(e.target.value)} style={inp} aria-label="Nama bukti" />
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
              <button type="button" style={{ ...ikonBtn, width: 'auto', padding: '0 10px', gap: 5, fontSize: 12, color: berkas ? '#1D9E75' : c.sub }} onClick={() => pilihBerkas.current?.click()}>
                <Paperclip size={13} />{berkas ? 'Ganti berkas' : 'Pilih berkas'}
              </button>
              {berkas && <Tip label="Batal pilih berkas"><button type="button" style={ikonBtn} onClick={() => setBerkas(null)} aria-label="Batal pilih berkas"><X size={14} /></button></Tip>}
              <input ref={pilihBerkas} type="file" accept={BERKAS_DITERIMA} style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; setBerkas(f); }} />
            </div>
          </div>
          <div className="bba-mi-grid2">
            <input value={url} placeholder="atau tautan https://…" onChange={e => setUrl(e.target.value)} style={{ ...inp, borderColor: url && !isSafeHttpUrl(url) ? '#E24B4A' : c.border }} aria-label="Tautan bukti" />
            <input value={keterangan} placeholder="Keterangan singkat (opsional)" maxLength={500} onChange={e => setKeterangan(e.target.value)} style={inp} aria-label="Keterangan bukti" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PrimaButton menulis variant="purple" size="sm" disabled={mengirim} onClick={() => void tambah()}>{mengirim ? 'Menyimpan…' : '+ Tambah bukti'}</PrimaButton>
          </div>
        </div>
      ) : <div style={{ fontSize: 12, color: c.sub }}>Batas {MAKS_BUKTI} bukti per item tercapai.</div>}
    </div>
  );
}

// Tata letak saja; warna tetap sebaris (tema dari induk). ≤ 760 px: daftar kiri diganti
// tombol ‹ › di kepala, kartu item pindah ke atas jadi satu blok ringkas (§4.4).
const MI_CSS = `
.bba-mi-kotak { border-radius: 14px; width: min(1100px, 96vw); height: min(720px, 90vh); display: flex; flex-direction: column; overflow: hidden; }
.bba-mi-badan { flex: 1; min-height: 0; display: grid; grid-template-columns: 230px 250px minmax(0, 1fr); }
.bba-mi-badan.tanpa-daftar { grid-template-columns: 250px minmax(0, 1fr); }
.bba-mi-daftar { display: flex; flex-direction: column; min-height: 0; }
.bba-mi-kartu { padding: 14px; overflow: auto; min-height: 0; }
.bba-mi-kanan { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.bba-mi-pager { display: none; }
.bba-mi-kv { display: flex; justify-content: space-between; gap: 10px; padding: 6px 0; font-size: 12px; }
.bba-mi-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.bba-mi-ref-a { display: grid; grid-template-columns: 130px minmax(0, 1fr) 140px; gap: 6px; }
.bba-mi-ref-b { display: grid; grid-template-columns: minmax(0, 1fr) 140px auto; gap: 6px; }
@media (max-width: 760px) {
  .bba-mi-kotak { width: 100%; height: 94vh; }
  .bba-mi-badan, .bba-mi-badan.tanpa-daftar { display: flex; flex-direction: column; overflow: auto; }
  .bba-mi-daftar { display: none; }
  .bba-mi-pager { display: inline-flex; }
  /* flex-shrink 0: tanpa itu kartu menyusut di bawah tinggi isinya begitu tab memanjang, lalu tertimpa bilah tab. */
  .bba-mi-kartu { border-right: none !important; overflow: visible; padding: 10px 14px; flex-shrink: 0; }
  .bba-mi-kartu-isi { display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .bba-mi-kartu-isi .bba-mi-kv { border-bottom: none !important; padding: 0; gap: 6px; }
  .bba-mi-kanan { min-height: auto; flex-shrink: 0; }
  .bba-mi-grid2 { grid-template-columns: 1fr; }
  .bba-mi-ref-a, .bba-mi-ref-b { grid-template-columns: 1fr 1fr; }
  .bba-mi-ref-a > :nth-child(2), .bba-mi-ref-b > :first-child { grid-column: 1 / -1; }
}
`;
