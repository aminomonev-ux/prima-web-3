'use client';
// Halaman Rencana BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.2): tab per TAHAP, satu tombol langkah
// berikutnya per baris (aksi lain di ⋯), dan tab "Siap diputuskan" = lembar keputusan anggaran. Tahap dihitung
// `tahapRencana` (lib/bba/tahap.ts) — aturan yang sama dengan pita alur.

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search, RefreshCw, Download, SlidersHorizontal, Pencil, Paperclip, History, Undo2, CalendarPlus, FileText, Trash2 } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { useIngatkanBelumTersimpan } from '@/lib/shared/belum-tersimpan';
import { buktiBelumLengkap } from '@/lib/bba/referensi';
import { alasanTakBisaHapus } from '@/lib/bba/status';
import { bolehBatalkanFinal } from '@/lib/constants';
import type { BbaRow, BbaListResult, BbaKpi, BbaImportCandidate } from '@/lib/data/buku-besar-aset';
import SpandukBeku from '@/components/ui/SpandukBeku';
import SpandukLihat from '@/components/ui/SpandukLihat';
import type { InfoBeku } from '@/lib/security/beku';
import ModalItem, { LencanaRef, type TabItem } from './_components/ModalItem';
import PerBarang from './_components/PerBarang';
import ModalTautkan from './_components/ModalTautkan';
import SaranTahunLalu from './_components/SaranTahunLalu';
import PanelRiwayat from './_components/PanelRiwayat';
import GarisTahap from './_components/GarisTahap';
import MenuBaris, { type ButirMenu } from './_components/MenuBaris';
import LembarKeputusan, { LABEL_KURANG } from './_components/LembarKeputusan';
import KartuPagu from './_components/KartuPagu';
import { JENIS_RENCANA, LABEL_JENIS, LABEL_ANGGARAN, alasanTakBisaUbahAnggaran, type Anggaran } from '@/lib/bba/rencana';
import {
  tahapRencana, kurangPertama, masukTabRencana, hitungTabRencana, TAB_RENCANA, LABEL_TAB_RENCANA, type TabRencana, type Kurang,
} from '@/lib/bba/tahap';
import BbaNav, { navDockBba, type PetaIzinLayar } from './_components/BbaNav';

const SUMBER = ['BLUD', 'APBD', 'DAK', 'LAINNYA'] as const;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtVol = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
/** Rencana setahun dimuat utuh: tab tahap & angkanya dihitung di layar dari baris yang sama. */
const BATAS_MUAT = 1000;

type Props = { username: string; role: string; themePreference: 'dark' | 'light'; initialTahun: number; initialResult: BbaListResult; initialKpi: BbaKpi; kategori: string[];
  /** Tab dari ?tab= (pita alur) — `null` = pilih sendiri dari isi. */
  initialTab: TabRencana | null;
  /** P5 — keterangan pembekuan, diselesaikan di page.tsx. */
  beku: InfoBeku;
  /** Izin lima bagian (lib/bba/peran.ts) — hanya menyembunyikan tombol; pagarnya di route. */
  izin: PetaIzinLayar };

type ImportGroup   = { count: number; total: number; items: BbaImportCandidate[] };
type ImportPreview = { tahun: number; disetujui: ImportGroup; ditolak: ImportGroup };
/** Modal item (§4.4): `daftar` null = Tambah item, tanpa daftar kiri. */
type BukaModal = { daftar: BbaRow[] | null; id: number | null; tab: TabItem; saringan: 'BELUM' | 'SEMUA' };

const DITOLAK_LABEL: Record<string, string> = { ADMIN: 'Ditolak Admin', KASUBAG: 'Ditolak Kasubag', KABAG: 'Ditolak Kabag' };
const TAB_KURANG: Record<Kurang, TabItem> = { BARANG: 'data', JENIS: 'data', REFERENSI: 'ref' };

/** Tab pembuka bila tidak dipilih lewat alamat: pekerjaan yang paling depan dulu. */
function tabAwal(rows: BbaRow[]): TabRencana {
  const n = hitungTabRencana(rows);
  return n.perlu > 0 ? 'perlu' : n.siap > 0 ? 'siap' : 'semua';
}

export default function BukuBesarAsetClient({ username, role, themePreference, initialTahun, initialResult, initialKpi, kategori, initialTab, beku, izin }: Props) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const searchRef = useRef<HTMLInputElement>(null);
  const c = {
    canvas: isLight ? '#F5F5F7' : '#020F1C', card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB', sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C', rowOdd: isLight ? '#F3F4F6' : 'rgba(4,44,83,.6)',
    input: isLight ? '#FFFFFF' : 'rgba(2,15,28,.6)',
  };

  const [rows, setRows] = useState<BbaRow[]>(initialResult.rows);
  const [total, setTotal] = useState(initialResult.total);
  // A1: KPI dari server (SUM SQL seluruh data ter-filter) — bukan dihitung dari page
  const [kpi, setKpi] = useState<BbaKpi>(initialKpi);
  const [loading, setLoading] = useState(false);
  const [tahun, setTahun] = useState(initialTahun);
  const [tab, setTab] = useState<TabRencana>(initialTab ?? tabAwal(initialResult.rows));
  const [fSumber, setFSumber] = useState('');
  const [fOrigin, setFOrigin] = useState('');
  const [fJenis, setFJenis] = useState('');
  const [q, setQ] = useState('');
  const [fBukti, setFBukti] = useState(false);
  const [saringanBuka, setSaringanBuka] = useState(false);
  /** Keputusan anggaran yang dipilih di lembar keputusan tapi belum disimpan — id → pilihan. */
  const [pilihan, setPilihan] = useState<Map<number, Anggaran>>(new Map());
  const [menyimpan, setMenyimpan] = useState(false);
  const [modal, setModal] = useState<BukaModal | null>(null);
  const [tampilan, setTampilan] = useState<'ITEM' | 'BARANG'>('ITEM');
  const [segarkanBarang, setSegarkanBarang] = useState(0);
  const [tautkanBuka, setTautkanBuka] = useState(false);
  const [riwayatId, setRiwayatId] = useState<number | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | 'EMPTY' | null>(null);
  const [detailRow, setDetailRow] = useState<BbaRow | null>(null);
  const [saving, setSaving] = useState(false);
  // Rencana: tambah/ubah/hapus item, referensi, keputusan anggaran, tarik usulan, tautkan barang. Pengadaan:
  // Proses & penerimaan. Bukti dukung dipegang keduanya.
  const bolehRencana = izin.rencana === 'EDIT';
  const bolehPengadaan = izin.pengadaan === 'EDIT';
  const bolehBukti = bolehRencana || bolehPengadaan;

  const jumlahBelum = pilihan.size;
  useIngatkanBelumTersimpan(jumlahBelum > 0 ? `${jumlahBelum} keputusan anggaran belum disimpan. Kalau ditinggalkan, pilihan itu hilang.` : null);

  // Jawaban muatan bisa tiba tidak berurutan (ganti tahun saat muatan lama belum pulang) —
  // hanya muatan TERAKHIR yang boleh mengisi tabel, kalau tidak tabel menampilkan tahun lain.
  const nomorMuat = useRef(0);
  const kunciSaringan = `${tahun}|${fSumber}|${fOrigin}|${fJenis}`;
  const kunciTermuat = useRef(kunciSaringan);
  const load = useCallback(async () => {
    const nomor = ++nomorMuat.current;
    kunciTermuat.current = `${tahun}|${fSumber}|${fOrigin}|${fJenis}`;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tahun: String(tahun), page: '1', limit: String(BATAS_MUAT) });
      if (fSumber) params.set('sumber', fSumber);
      if (fOrigin) params.set('origin', fOrigin);
      if (fJenis)  params.set('jenis', fJenis);
      if (q.trim()) params.set('q', q.trim());
      const d = await fetchJson<unknown>(`/api/buku-besar-aset?${params}`);
      if (nomor !== nomorMuat.current) return;
      if (d.ok) {
        const r = d as unknown as BbaListResult & { kpi?: BbaKpi };
        setRows(r.rows); setTotal(r.total);
        // Pilihan yang belum tersimpan bertahan di atas data terbaru (L77) — kecuali yang barisnya hilang
        // atau yang kini sudah sama dengan yang tersimpan.
        setPilihan(p => {
          if (p.size === 0) return p;
          const per = new Map(r.rows.map(x => [x.id, x]));
          const sisa = new Map([...p].filter(([id, a]) => per.has(id) && per.get(id)!.anggaran !== a));
          return sisa.size === p.size ? p : sisa;
        });
        if (r.kpi) setKpi(r.kpi);
      } else toast.error(d.message || 'Gagal memuat');
    } finally { if (nomor === nomorMuat.current) setLoading(false); }
  }, [tahun, fSumber, fOrigin, fJenis, q]);

  /** Sesudah ada yang tertulis: tabel, tampilan Per Barang, dan pita alur ikut segar. */
  const muatUlang = () => { void load(); setSegarkanBarang(n => n + 1); };

  // Auto-refresh saat ganti tahun/saringan (debounce supaya ketik tahun tak spam).
  // Patokannya saringan yang terakhir DIMUAT, bukan "sudah mount" — efek ganda strict mode
  // dulu menembak muatan tahun awal yang bisa pulang belakangan. Tahun setengah diketik
  // (mis. "208") tidak dimuat. Pencarian teks (q) tetap manual.
  useEffect(() => {
    if (kunciTermuat.current === kunciSaringan || tahun < 2020 || tahun > 2100) return;
    const t = setTimeout(() => { void load(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciSaringan]);

  const rowsSaring = fBukti ? rows.filter(r => buktiBelumLengkap(r.bukti)) : rows;
  const angkaTab = hitungTabRencana(rowsSaring);
  const rowsTampil = rowsSaring.filter(r => masukTabRencana(tab, r));

  async function gantiTab(t: TabRencana) {
    if (t === tab) return;
    if (jumlahBelum > 0 && t !== 'siap') {
      const buang = await confirmDialog({ title: 'Keputusan belum disimpan', message: `${jumlahBelum} keputusan anggaran belum disimpan. Pindah tab membuang pilihan itu.`, confirmLabel: 'Buang & pindah', cancelLabel: 'Tetap di sini', variant: 'danger' });
      if (!buang) return;
      setPilihan(new Map());
    }
    setTab(t);
  }

  const bukaItem = (r: BbaRow, t: TabItem) => setModal({ daftar: rowsTampil, id: r.id, tab: t, saringan: 'SEMUA' });
  const bukaBaru = () => setModal({ daftar: null, id: null, tab: 'data', saringan: 'SEMUA' });
  const lengkapi = (r: BbaRow, k: Kurang) => setModal({ daftar: rowsTampil, id: r.id, tab: TAB_KURANG[k], saringan: 'SEMUA' });

  function pilihAnggaran(id: number, a: Anggaran) {
    const asli = rows.find(r => r.id === id)?.anggaran;
    setPilihan(p => {
      const x = new Map(p);
      if (a === asli) x.delete(id); else x.set(id, a);
      return x;
    });
  }

  /** Satu kiriman, semua-atau-tidak. Angka kunci dari baris yang dimuat — basi = 409, daftar dimuat ulang dan pilihan tetap terpasang (L77). */
  async function simpanKeputusan(daftar: Map<number, Anggaran>): Promise<boolean> {
    const per = new Map(rows.map(r => [r.id, r]));
    const item = [...daftar].flatMap(([id, anggaran]) => {
      const r = per.get(id);
      return r && r.anggaran !== anggaran ? [{ id, expected_version: r.version, anggaran }] : [];
    });
    if (item.length === 0) { setPilihan(new Map()); return true; }
    setMenyimpan(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/anggaran', { method: 'POST', body: JSON.stringify({ item }) }) as unknown as { ok: boolean; code?: string; message?: string; per?: Record<Anggaran, number> };
      if (!d.ok) {
        if (d.code === 'VERSION_CONFLICT') {
          toast.error('Ada rencana yang baru saja diubah orang lain. Daftar dimuat ulang; pilihan Anda yang belum tersimpan tetap terpasang — periksa lalu simpan lagi.');
          void load();
        } else toast.error(d.message || 'Gagal menyimpan keputusan');
        return false;
      }
      const n = d.per ?? { DIDANAI: 0, TIDAK_DIDANAI: 0, BELUM: 0 };
      toast.success(`Keputusan disimpan: ${[n.DIDANAI ? `${n.DIDANAI} didanai` : '', n.TIDAK_DIDANAI ? `${n.TIDAK_DIDANAI} tidak didanai` : '', n.BELUM ? `${n.BELUM} dikembalikan ke belum diputuskan` : ''].filter(Boolean).join(', ')}`);
      setPilihan(p => new Map([...p].filter(([id]) => !daftar.has(id))));
      muatUlang();
      return true;
    } finally { setMenyimpan(false); }
  }

  async function kembalikanKeBelum(r: BbaRow) {
    if (jumlahBelum > 0) { toast.error('Simpan atau batalkan keputusan yang belum tersimpan dulu.'); return; }
    if (!(await confirmDialog({ title: 'Kembalikan ke belum diputuskan?', message: `"${r.uraian}" (${r.canonical_id}) saat ini ${LABEL_ANGGARAN[r.anggaran].toLowerCase()}. Sesudah dikembalikan, rencana ini kembali ke tab Siap diputuskan.`, confirmLabel: 'Kembalikan', variant: 'warning' }))) return;
    await simpanKeputusan(new Map([[r.id, 'BELUM']]));
  }

  async function ajukanTahunDepan(r: BbaRow) {
    const ke = r.tahun_anggaran + 1;
    if (!(await confirmDialog({ title: `Ajukan lagi di ${ke}?`, message: `"${r.uraian}" disalin ke rencana ${ke} — jenis, alasan, barang, angka, referensi, dan aset sasaran ikut; keputusan anggarannya mulai dari belum diputuskan.`, confirmLabel: `Salin ke ${ke}`, variant: 'purple' }))) return;
    const d = await fetchJson<unknown>('/api/buku-besar-aset/salin-tahun-lalu', { method: 'POST', body: JSON.stringify({ tahun: ke, ids: [r.id] }) }) as unknown as { ok: boolean; message?: string; disalin?: number };
    if (!d.ok) { toast.error(d.message || 'Gagal menyalin'); return; }
    toast.success(d.disalin ? `Disalin ke rencana ${ke}.` : `Rencana ini sudah ada di ${ke}.`);
  }

  async function openImportPreview() {
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/import-usulan', { method: 'POST', body: JSON.stringify({ mode: 'preview', tahun }) });
      if (!d.ok) { toast.error(d.message || 'Gagal memuat preview'); return; }
      const p = d as unknown as ImportPreview;
      setImportPreview(p.disetujui.count + p.ditolak.count === 0 ? 'EMPTY' : p);
    } finally { setSaving(false); }
  }

  async function commitImport() {
    if (!importPreview || importPreview === 'EMPTY') return;
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/import-usulan', { method: 'POST', body: JSON.stringify({ mode: 'commit', tahun }) });
      if (d.ok) {
        const h = d as unknown as { inserted: number; tertaut?: number };
        toast.success(`${h.inserted} item ditarik dari Usulan Kebutuhan${h.tertaut ? ` · ${h.tertaut} langsung tertaut ke barang` : ''}`);
        setImportPreview(null); muatUlang();
      } else toast.error(d.message || 'Gagal menarik data');
    } finally { setSaving(false); }
  }

  async function del(row: BbaRow) {
    const ikut = row.ref.n > 0 ? ' Referensi harganya ikut terhapus — item ini belum diproses, jadi belum jadi catatan pembelian.' : '';
    if (!(await confirmDialog({ title: 'Hapus Item', message: `Hapus "${row.uraian}" (${row.canonical_id})?${ikut}`, confirmLabel: 'Hapus' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset?id=${row.id}`, { method: 'DELETE' });
    if (d.ok) { toast.success('Dihapus'); muatUlang(); } else toast.error(d.message || 'Gagal hapus');
  }

  // Item tahun ini (yang dimuat) tanpa barang — usulan ditolak tidak dihitung, seperti KPI & Per Barang.
  const belumBarang = rows.filter(r => r.barang_id === null && r.usulan_keputusan !== 'DITOLAK').length;

  /** Tombol langkah berikutnya (§3.2) — satu per baris, kata kerja + benda. */
  function langkahBerikutnya(r: BbaRow) {
    const t = tahapRencana(r);
    const ke = (href: string, label: string) => <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: c.sub, whiteSpace: 'nowrap', textDecoration: 'none' }}>{label}</Link>;
    switch (t) {
      case 'PERLU_DILENGKAPI': {
        const k = kurangPertama(r)!;
        return bolehRencana ? <PrimaButton variant="warning" size="sm" onClick={() => lengkapi(r, k)}>{LABEL_KURANG[k](r)}</PrimaButton> : <span style={{ fontSize: 11.5, color: c.sub }}>{LABEL_KURANG[k](r).toLowerCase()}</span>;
      }
      case 'SIAP_DIPUTUSKAN':
        return <PrimaButton variant="ghost" size="sm" onClick={() => void gantiTab('siap')}>Putuskan anggaran →</PrimaButton>;
      case 'DIDANAI': case 'DIPESAN': case 'BATAL_DIBELI':
        return ke(`/buku-besar-aset/pengadaan?tahun=${r.tahun_anggaran}`, 'Lihat di Pengadaan →');
      case 'DITERIMA_SEBAGIAN':
        return r.belum_dicatat > 0 ? ke('/buku-besar-aset/aset', 'Lihat di Buku Aset →') : ke(`/buku-besar-aset/pengadaan?tahun=${r.tahun_anggaran}`, 'Lihat di Pengadaan →');
      case 'DITERIMA_PENUH':
        return ke('/buku-besar-aset/aset', 'Lihat di Buku Aset →');
      case 'USULAN_DITOLAK':
        return <PrimaButton variant="ghost" size="sm" onClick={() => setDetailRow(r)}>Detail usulan</PrimaButton>;
      default:
        return <span style={{ color: c.sub }}>—</span>;
    }
  }

  function butirMenu(r: BbaRow): ButirMenu[] {
    const ditolak = r.usulan_keputusan === 'DITOLAK';
    const b: ButirMenu[] = [
      { kunci: 'ubah', label: bolehRencana ? 'Ubah' : 'Lihat', icon: <Pencil size={13} /> },
      { kunci: 'bukti', label: r.jumlah_bukti ? `Bukti dukung (${r.jumlah_bukti})` : 'Bukti dukung', icon: <Paperclip size={13} /> },
    ];
    b.push({ kunci: 'riwayat', label: 'Riwayat dan batalkan', icon: <History size={13} /> });
    if (r.origin === 'USULAN') b.push({ kunci: 'usulan', label: `Detail usulan ${r.usulan_no ?? ''}`, icon: <FileText size={13} /> });
    if (bolehRencana && !ditolak && r.anggaran !== 'BELUM') {
      const alasan = alasanTakBisaUbahAnggaran(r.status, r.anggaran, 'BELUM');
      b.push({ kunci: 'kembalikan', label: 'Kembalikan ke belum diputuskan', icon: <Undo2 size={13} />, pisah: true,
        mati: alasan ? 'Rencana ini sudah dipesan atau diterima — batalkan pesanan dulu di Pengadaan.' : null });
    }
    if (bolehRencana && !ditolak && r.anggaran === 'TIDAK_DIDANAI' && r.tahun_anggaran < 2100)
      b.push({ kunci: 'ajukan', label: `Ajukan lagi di ${r.tahun_anggaran + 1}`, icon: <CalendarPlus size={13} /> });
    if (bolehRencana) {
      b.push(alasanTakBisaHapus(r.status, r.jumlah_bukti)
        ? { kunci: 'cara-hapus', label: 'Cara menghapus…', icon: <Trash2 size={13} />, pisah: true }
        : { kunci: 'hapus', label: 'Hapus', icon: <Trash2 size={13} />, pisah: true, bahaya: true });
    }
    return b;
  }

  function pilihMenu(r: BbaRow, kunci: string) {
    switch (kunci) {
      case 'ubah': bukaItem(r, 'data'); break;
      case 'bukti': bukaItem(r, 'bukti'); break;
      case 'riwayat': case 'cara-hapus': setRiwayatId(r.id); break;
      case 'usulan': setDetailRow(r); break;
      case 'kembalikan': void kembalikanKeBelum(r); break;
      case 'ajukan': void ajukanTahunDepan(r); break;
      case 'hapus': void del(r); break;
    }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input };
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, color: c.text, borderBottom: `1px solid ${c.border}`, verticalAlign: 'middle' };
  const adaSaringan = !!(fSumber || fOrigin || fJenis || q.trim() || fBukti);

  // Ringkas bilah Simpan keputusan: berapa didanai (dan nilainya), berapa tidak.
  const perRow = new Map(rows.map(r => [r.id, r]));
  const ringkasPilihan = [...pilihan].reduce((a, [id, v]) => {
    const r = perRow.get(id);
    if (v === 'DIDANAI') { a.danai++; a.nilai += r?.nilai_rencana ?? 0; } else if (v === 'TIDAK_DIDANAI') a.tidak++; else a.nanti++;
    return a;
  }, { danai: 0, nilai: 0, tidak: 0, nanti: 0 });

  return (
    <div style={{ minHeight: '100vh', background: c.canvas, color: c.text }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', minHeight: 52, background: isLight ? 'rgba(255,255,255,.92)' : 'rgba(4,44,83,.92)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${c.border}`, position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ fontSize: 13, color: c.sub, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 10 }}>
          <span style={{ fontWeight: 800, background: 'linear-gradient(135deg,#EF9F27,#FAC775)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Buku Besar Aset</span>
          <span style={{ margin: '0 6px', color: isLight ? '#D1D5DB' : '#185FA5' }}>/</span>
          <span style={{ color: isLight ? '#374151' : '#B5D4F4', fontWeight: 600 }}>Rencana {tahun}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <div style={{ padding: '24px clamp(16px, 3vw, 28px) 140px' }}>
      <BbaNav aktif="rencana" peta={izin} c={c} tahun={tahun} segarkan={segarkanBarang}
        pindah={(halaman, t) => { if (halaman !== 'rencana' || !(TAB_RENCANA as readonly string[]).includes(t)) return false; void gantiTab(t as TabRencana); return true; }} />
      <SpandukBeku {...beku}/>
      {!bolehBukti && <SpandukLihat label="Rencana" />}
      {!bolehRencana && bolehPengadaan && (
        <div style={{ fontSize: 12.5, color: c.sub, margin: '0 0 14px', padding: '8px 12px', borderRadius: 10, border: `1px solid ${c.border}` }}>
          Anda memegang bagian <b style={{ color: c.text }}>Pengadaan</b>: Proses &amp; penerimaan dan bukti dukung bisa diisi; data rencana, referensi harga, dan keputusan anggaran hanya bisa dilihat.
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Rencana</h1>
          <span data-tooltip={jumlahBelum > 0 ? 'Simpan atau batalkan keputusan anggaran dulu' : undefined}>
            <PrimaNumberField value={tahun} onChange={e => setTahun(Number(e.target.value))} disabled={jumlahBelum > 0} style={{ width: 90 }} aria-label="Tahun rencana" />
          </span>
          <span style={{ fontSize: 12, color: c.sub }}>{total} rencana{rows.length < total ? ` (menampilkan ${rows.length})` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {bolehRencana && <PrimaButton variant="purple" data-rima="bba.tambah-item" onClick={bukaBaru}>+ Tambah rencana</PrimaButton>}
          {bolehRencana && <PrimaButton variant="ghost" data-rima="bba.tarik-usulan" onClick={openImportPreview} disabled={saving}><Download size={14} style={{ marginRight: 5, verticalAlign: -2 }} />Tarik dari Usulan</PrimaButton>}
        </div>
      </div>

      {/* KPI */}
      <div data-rima="bba.kpi-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { l: 'Total Rencana', v: fmtRp(kpi.rencana), col: c.text },
          { l: 'Total Realisasi', v: fmtRp(kpi.realisasi), col: '#1D9E75' },
          { l: '% Terakomodir', v: kpi.pct + '%', col: '#EF9F27' },
          { l: 'Belum Terealisasi (item)', v: String(kpi.backlog), col: '#BA7517' },
          { l: 'Unit Terealisasi', v: `${kpi.volReal} / ${kpi.volRencana}`, col: '#7C5CFC' },
        ].map(k => (
          <div key={k.l} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: c.sub, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: MONO, color: k.col }}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* Tab tahap (§3.2) + Per Item | Per Barang + Saringan */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {tampilan === 'ITEM' && (
          <div role="tablist" aria-label="Tahap rencana" data-rima="bba.tab-keputusan" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TAB_RENCANA.map(t => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => void gantiTab(t)}
                style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${tab === t ? '#EF9F27' : c.border}`, background: tab === t ? 'rgba(239,159,39,.15)' : 'transparent', color: tab === t ? '#EF9F27' : c.sub }}>
                {LABEL_TAB_RENCANA[t]} <span style={{ fontFamily: MONO, opacity: .85 }}>({angkaTab[t]})</span>
              </button>
            ))}
          </div>
        )}
        <span style={{ flex: 1 }} />
        <PrimaButton variant="ghost" size="sm" onClick={() => setSaringanBuka(b => !b)} aria-expanded={saringanBuka}>
          <SlidersHorizontal size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Saringan{adaSaringan ? ' •' : ''}
        </PrimaButton>
        <div style={{ display: 'inline-flex', border: `1px solid ${c.border}`, borderRadius: 20, overflow: 'hidden' }}>
          {([['ITEM', 'Per Item'], ['BARANG', 'Per Barang']] as const).map(([val, label]) => (
            <button key={val} type="button" onClick={() => setTampilan(val)}
              style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: tampilan === val ? 'rgba(239,159,39,.15)' : 'transparent', color: tampilan === val ? '#EF9F27' : c.sub }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {saringanBuka && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', borderRadius: 10, border: `1px solid ${c.border}`, background: c.card }}>
          <select value={fSumber} onChange={e => setFSumber(e.target.value)} style={inp} aria-label="Sumber dana"><option value="">Semua sumber</option>{SUMBER.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <select value={fOrigin} onChange={e => setFOrigin(e.target.value)} style={inp} aria-label="Asal"><option value="">Semua asal</option><option value="MANUAL">Manual</option><option value="USULAN">Dari Usulan</option></select>
          <select value={fJenis} onChange={e => setFJenis(e.target.value)} style={inp} aria-label="Jenis rencana"><option value="">Semua jenis</option>{JENIS_RENCANA.map(j => <option key={j} value={j}>{LABEL_JENIS[j]}</option>)}<option value="KOSONG">Belum digolongkan</option></select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: c.sub, cursor: 'pointer' }}>
            <input type="checkbox" checked={fBukti} onChange={e => setFBukti(e.target.checked)} /> Bukti dukung belum lengkap
          </label>
          <input data-rima="bba.filter-cari" ref={searchRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(); }} placeholder="Cari uraian/kode/no. usulan…" style={{ ...inp, flex: 1, minWidth: 160 }} />
          <PrimaButton variant="primary" size="sm" onClick={() => void load()} disabled={loading}>{loading ? 'Memuat…' : 'Cari'}</PrimaButton>
        </div>
      )}

      {tampilan === 'BARANG' ? (
        <PerBarang tahun={tahun} c={c} segarkan={segarkanBarang} onTautkan={bolehRencana ? () => setTautkanBuka(true) : undefined} />
      ) : (<>
      {/* §5.1: item tanpa barang → riwayat beli tidak bisa dijawab untuknya */}
      {belumBarang > 0 && bolehRencana && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(186,117,23,.45)', background: 'rgba(186,117,23,.08)', fontSize: 12.5 }}>
          <span style={{ color: '#BA7517', fontWeight: 600 }}>{belumBarang} rencana {tahun} belum ditautkan ke barang</span>
          <span style={{ color: c.sub, flex: 1, minWidth: 200 }}>— tanpa barang, riwayat beli dan yang sedang diproses tidak terlihat saat merencanakan.</span>
          <PrimaButton variant="warning" size="sm" onClick={() => setTautkanBuka(true)}>Tautkan</PrimaButton>
        </div>
      )}

      <SaranTahunLalu tahun={tahun} c={c} bolehUbah={bolehRencana} segarkan={segarkanBarang} onDisalin={muatUlang} />

      {tab === 'siap' ? (
        <LembarKeputusan rows={rowsTampil} pilihan={pilihan} c={c} bolehUbah={bolehRencana}
          onPilih={pilihAnggaran} onLengkapi={lengkapi} onBuka={r => bukaItem(r, 'data')}
          atas={<KartuPagu tahun={tahun} rows={rows} pilihan={pilihan} c={c} />} />
      ) : (
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead><tr>
            <th style={th}>Rencana</th>
            <th style={{ ...th, textAlign: 'right', width: 160 }}>Nilai</th>
            <th style={th}>Tahap</th>
            <th style={{ ...th, textAlign: 'right' }}>Langkah berikutnya</th>
          </tr></thead>
          <tbody>
            {rowsTampil.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={4}>{rows.length === 0 ? `Belum ada rencana ${tahun}.` : 'Tidak ada rencana di tab ini.'}</td></tr>}
            {rowsTampil.map((r, i) => {
              const isRejected = r.usulan_keputusan === 'DITOLAK';
              return (
              <tr key={r.id} style={{ background: i % 2 ? c.rowOdd : 'transparent', opacity: isRejected ? .75 : 1 }}>
                <td style={td}>
                  <button type="button" onClick={() => bukaItem(r, 'data')} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: c.text }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.uraian}</div>
                  </button>
                  <div style={{ fontSize: 11, color: c.sub, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontFamily: MONO }}>{r.canonical_id}</span>
                    <span style={{ color: r.jenis_rencana ? c.sub : '#BA7517' }}>· {r.jenis_rencana ? LABEL_JENIS[r.jenis_rencana] : 'jenis belum dipilih'}</span>
                    <span>· {fmtVol(r.vol)} {r.satuan || 'unit'}</span>
                    {r.jumlah_sasaran > 0 && <span>· mengganti {r.jumlah_sasaran} aset</span>}
                    {isRejected && <span style={{ color: '#E24B4A' }}>· {DITOLAK_LABEL[r.ditolak_oleh ?? ''] ?? 'Ditolak'}</span>}
                    <LencanaRef row={r} />
                  </div>
                </td>
                <td style={{ ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap', width: 160 }}>
                  {fmtRp(r.nilai_rencana)}
                  {r.nilai_realisasi > 0 && <div style={{ fontSize: 10.5, color: '#1D9E75' }}>diterima {fmtRp(r.nilai_realisasi)}</div>}
                </td>
                <td style={td}><GarisTahap tahap={tahapRencana(r)} sub={c.sub} /></td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <div data-rima="bba.langkah-berikutnya" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {langkahBerikutnya(r)}
                    <MenuBaris butir={butirMenu(r)} onPilih={k => pilihMenu(r, k)} c={c} label={`Aksi lain ${r.canonical_id}`} />
                  </div>
                </td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      )}
      </>)}

      {/* Bilah Simpan keputusan — lengket di bawah begitu ada pilihan yang belum tersimpan (§3.2). */}
      {jumlahBelum > 0 && (
        <div role="region" aria-label="Keputusan belum disimpan" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 116, zIndex: 450, width: 'min(760px, calc(100vw - 32px))',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10, background: c.card, border: '1px solid #EF9F27', boxShadow: '0 12px 36px rgba(0,0,0,.35)' }}>
          <span style={{ fontSize: 12.5, flex: 1, minWidth: 200 }}>
            <b>{jumlahBelum} keputusan belum disimpan</b>
            <span style={{ color: c.sub }}> · {ringkasPilihan.danai} didanai (<span style={{ fontFamily: MONO }}>{fmtRp(ringkasPilihan.nilai)}</span>), {ringkasPilihan.tidak} tidak{ringkasPilihan.nanti ? `, ${ringkasPilihan.nanti} nanti` : ''}</span>
          </span>
          <PrimaButton variant="ghost" size="sm" disabled={menyimpan} onClick={() => setPilihan(new Map())}>Batal</PrimaButton>
          <PrimaButton menulis variant="primary" size="sm" disabled={menyimpan} onClick={() => void simpanKeputusan(pilihan)}>{menyimpan ? 'Menyimpan…' : `Simpan keputusan (${jumlahBelum})`}</PrimaButton>
        </div>
      )}

      {/* Modal item — Data item / Referensi harga / Bukti dukung (CONCEPT-bba-perencanaan §4.4) */}
      {modal && (
        <ModalItem c={c} daftar={modal.daftar} awalId={modal.id} tabAwal={modal.tab} saringanAwal={modal.saringan}
          tahun={tahun} kategori={kategori} bolehUbah={bolehRencana} bolehBukti={bolehBukti} onTutup={() => setModal(null)} onTersimpan={muatUlang} />
      )}

      {tautkanBuka && <ModalTautkan tahun={tahun} c={c} onTutup={() => setTautkanBuka(false)} onSelesai={() => { setTautkanBuka(false); muatUlang(); }} />}

      {/* Riwayat dan batalkan (§5.1) — komponen yang sama dengan halaman Pengadaan; "Cara menghapus…" membukanya juga. */}
      {riwayatId !== null && (
        <PanelRiwayat c={c} rencanaId={riwayatId} izin={izin} bolehAdmin={bolehBatalkanFinal(role)}
          onTutup={() => setRiwayatId(null)} onTersimpan={muatUlang}
          onBukaBukti={() => { const r = rows.find(x => x.id === riwayatId); setRiwayatId(null); if (r) bukaItem(r, 'bukti'); }} />
      )}

      {/* Modal Tarik dari Usulan — kosong (notif bertema, bukan alert native — L58) */}
      {importPreview === 'EMPTY' && (
        <Modal title="Tarik dari Usulan Kebutuhan" c={c} onClose={() => setImportPreview(null)}>
          <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.6 }}>
            Tidak ada usulan belanja modal final (Disetujui/Ditolak) untuk tahun <b style={{ color: c.text, fontFamily: MONO }}>{tahun}</b> yang belum ditarik.
            Pastikan tahun register sesuai, atau item usulan sudah mencapai putusan final.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <PrimaButton variant="ghost" onClick={() => setImportPreview(null)}>Tutup</PrimaButton>
          </div>
        </Modal>
      )}

      {/* Modal Tarik dari Usulan — preview Disetujui | Ditolak */}
      {importPreview && importPreview !== 'EMPTY' && (
        <Modal title={`Tarik dari Usulan Kebutuhan — ${tahun}`} c={c} onClose={() => setImportPreview(null)}>
          {([['DISETUJUI', importPreview.disetujui, '#1D9E75'], ['DITOLAK', importPreview.ditolak, '#E24B4A']] as const).map(([label, grp, col]) => grp.count > 0 && (
            <div key={label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: col, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>{label}</span>
                <span style={{ fontSize: 12, color: c.sub }}>{grp.count} item · <b style={{ fontFamily: MONO, color: c.text }}>{fmtRp(grp.total)}</b></span>
              </div>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 6, maxHeight: 180, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {grp.items.map(it => (
                      <tr key={it.usulan_item_id}>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 10.5, whiteSpace: 'nowrap' }}>{it.usulan_no}</td>
                        <td style={{ ...td, fontSize: 11.5 }}>{it.uraian}{it.ditolak_oleh ? <span style={{ color: '#E24B4A', fontSize: 10, marginLeft: 6 }}>({DITOLAK_LABEL[it.ditolak_oleh]})</span> : null}</td>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>{it.vol} {it.satuan}</td>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtRp(it.nilai_rencana)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: c.sub, marginBottom: 12 }}>Item yang sudah pernah ditarik dilewati otomatis. Sumber anggaran default BLUD (bisa diedit setelah tarik).</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <PrimaButton variant="ghost" onClick={() => setImportPreview(null)}>Batal</PrimaButton>
            <PrimaButton variant="purple" data-rima="bba.tarik-cmt" onClick={commitImport} disabled={saving}>{saving ? 'Menarik…' : `Tarik ${importPreview.disetujui.count + importPreview.ditolak.count} Item`}</PrimaButton>
          </div>
        </Modal>
      )}

      {/* Modal Detail provenance baris asal-usulan */}
      {detailRow && (
        <Modal title={`Detail Usulan — ${detailRow.usulan_no ?? ''}`} c={c} onClose={() => setDetailRow(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', fontSize: 12.5 }}>
            <span style={{ color: c.sub }}>No. Usulan</span><span style={{ fontFamily: MONO }}>{detailRow.usulan_no || '—'}</span>
            <span style={{ color: c.sub }}>Sub Bidang</span><span>{detailRow.sub_bidang || '—'}</span>
            <span style={{ color: c.sub }}>Pengusul</span><span>{detailRow.pengusul || '—'}</span>
            <span style={{ color: c.sub }}>Uraian</span><span>{detailRow.uraian}</span>
            <span style={{ color: c.sub }}>Vol × Harga</span><span style={{ fontFamily: MONO }}>{detailRow.vol} {detailRow.satuan || ''} × {fmtRp(detailRow.harga)}</span>
            <span style={{ color: c.sub }}>Nilai</span><span style={{ fontFamily: MONO }}>{fmtRp(detailRow.nilai_rencana)}</span>
            <span style={{ color: c.sub }}>Keputusan</span>
            <span>{detailRow.usulan_keputusan === 'DITOLAK'
              ? <span style={{ background: '#E24B4A', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>{DITOLAK_LABEL[detailRow.ditolak_oleh ?? ''] ?? 'Ditolak'}</span>
              : <span style={{ background: '#1D9E75', color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>Disetujui</span>}</span>
            {detailRow.usulan_keputusan === 'DITOLAK' && (<>
              <span style={{ color: c.sub }}>Catatan Penolakan</span><span>{detailRow.catatan_penolakan || '—'}</span>
            </>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <PrimaButton variant="ghost" onClick={() => setDetailRow(null)}>Tutup</PrimaButton>
          </div>
        </Modal>
      )}
      </div>

      <FloatingDock isLight={isLight} limelight
        nav={navDockBba(izin, 'rencana', href => router.push(href))}
        actions={[
          ...(bolehRencana ? [{ icon: <Plus size={17} />, label: 'Tambah', onClick: bukaBaru }] : []),
          { icon: <Search size={17} />, label: 'Saringan', onClick: () => { setSaringanBuka(true); setTimeout(() => searchRef.current?.focus(), 0); } },
          { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: muatUlang },
        ]}
      />
    </div>
  );
}


function Modal({ title, children, c, onClose }: { title: string; children: React.ReactNode; c: { card: string; text: string; border: string }; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, padding: 22, width: 'min(620px,96vw)', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: c.text, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
