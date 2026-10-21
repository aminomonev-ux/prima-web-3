'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardCheck, Copy, FileText, FolderDown, Plus, LayoutGrid, RefreshCw, CheckSquare, Check, Trash2, Search, ListTree, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog, pilihDialog } from '@/components/ui/ConfirmDialog';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import { useKunciTulis } from '@/components/ui/KunciTulis';
import { stripGolongan } from '@/lib/iki/layout';
import { susunPohon, ringkasPohon, saringPohon, dokumenZip, jalurZip, type BarisPohon, type JenisIki } from '@/lib/iki/beranda';
import ImportIkiModal from './ImportIkiModal';
import PohonIki, { type AksiPohon } from './PohonIki';
import { pejabatOptionValue, resolvePejabat, nameInitials, labelJumlahIsi } from './_lib/types';
import type { IkiJenisDokumen, IkiListRow, IkiTemplat, IkiVarian, PejabatSuggest } from './_lib/types';
import { bolehBatalkanFinal } from '@/lib/constants';
import SpandukBeku from '@/components/ui/SpandukBeku';
import type { InfoBeku } from '@/lib/security/beku';

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialRows: IkiListRow[];
  /** P5 — keterangan pembekuan, diselesaikan di page.tsx. */
  beku: InfoBeku;
  /** `?tahun=` — supaya Kembali dari editor pulang ke tahun yang sama. */
  tahunAwal: string | null;
  tahunSekarang: string;
}

type BentukAwal = 'STANDAR' | 'DIREKTUR' | 'KOSONG';
type FormBuat = { tahun: string; varian: IkiVarian; jenis: IkiJenisDokumen; nama: string; nip: string; jabatan: string; pangkat: string; templat_id: number | null; bentuk_awal: BentukAwal };

const labelJenis = (j: JenisIki) => (j === 'PERUBAHAN' ? 'Perubahan' : 'Murni');
const MAX_ZIP = 100;
const SIBUK_SEMUA = '*semua*';

export default function IkiClient({ username, role, themePreference, initialRows, beku, tahunAwal, tahunSekarang }: Props) {
  const router = useRouter();
  const kunciTulis = useKunciTulis();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const [rows, setRows] = useState<IkiListRow[]>(initialRows);
  const [showCreate, setShowCreate] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormBuat>({
    tahun: tahunSekarang, varian: 'STANDAR', jenis: 'MURNI', nama: '', nip: '', jabatan: '', pangkat: '', templat_id: null, bentuk_awal: 'STANDAR',
  });

  // Templat tabel varian Custom (docs/CONCEPT-iki-custom.md §4) — dimuat saat varian itu dipilih.
  const [templat, setTemplat] = useState<IkiTemplat[] | null>(null);
  const [gantiNamaTemplat, setGantiNamaTemplat] = useState<string | null>(null);
  const perluTemplat = showCreate && form.varian === 'CUSTOM';
  useEffect(() => {
    if (!perluTemplat) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/iki/templat');
        const json = await res.json();
        if (alive) setTemplat(json.ok ? json.rows : []);
      } catch { if (alive) setTemplat([]); }
    })();
    return () => { alive = false; };
  }, [perluTemplat]);
  const templatTerpilih = templat?.find(t => t.id === form.templat_id) ?? null;

  async function simpanNamaTemplat() {
    const nama = gantiNamaTemplat?.trim();
    if (!templatTerpilih || !nama) return;
    try {
      const res = await fetch('/api/iki/templat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: templatTerpilih.id, nama }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal mengganti nama'); return; }
      setTemplat(ts => (ts ?? []).map(t => (t.id === templatTerpilih.id ? { ...t, nama } : t)).sort((a, b) => a.nama.localeCompare(b.nama)));
      setGantiNamaTemplat(null);
      toast.success('Nama templat diganti');
    } catch { toast.error('Gagal terhubung ke server'); }
  }
  async function hapusTemplatTerpilih() {
    if (!templatTerpilih) return;
    if (!(await confirmDialog({
      title: 'Hapus templat',
      message: `Hapus templat "${templatTerpilih.nama}"? Dokumen yang sudah dibuat darinya tidak berubah — isinya sudah disalin saat dibuat.`,
      variant: 'danger',
    }))) return;
    try {
      const res = await fetch(`/api/iki/templat?id=${templatTerpilih.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal menghapus templat'); return; }
      setTemplat(ts => (ts ?? []).filter(t => t.id !== templatTerpilih.id));
      setForm(f => ({ ...f, templat_id: null }));
      toast.success('Templat dihapus');
    } catch { toast.error('Gagal terhubung ke server'); }
  }

  // Suggest dari pk_pejabat (Master Pejabat PK) — pola sama dengan editor,
  // best-effort: gagal fetch = form tetap manual.
  const [pejabat, setPejabat] = useState<PejabatSuggest[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!showCreate || !/^\d{4}$/.test(form.tahun)) { if (alive) setPejabat([]); return; }
      try {
        const res = await fetch(`/api/iki/pejabat?tahun=${form.tahun}`);
        const json = await res.json();
        if (alive && json.ok) setPejabat(json.rows ?? []);
      } catch { /* suggest opsional */ }
    })();
    return () => { alive = false; };
  }, [showCreate, form.tahun]);

  function pickPejabat(nama: string) {
    const p = resolvePejabat(nama, pejabat);
    // Non-match = ketik manual → pangkat bawaan suggest sebelumnya di-reset biar tidak nyasar
    if (!p) { setForm(f => ({ ...f, nama, pangkat: '' })); return; }
    setForm(f => ({
      ...f,
      nama: p.nama,
      nip: p.nip ?? f.nip,
      jabatan: p.jabatan || f.jabatan,
      pangkat: stripGolongan(p.pangkat),
      varian: f.varian !== 'CUSTOM' && p.jabatan?.trim().toUpperCase() === 'DIREKTUR' ? 'DIREKTUR' : f.varian,
    }));
  }

  // Rel tahun: tahun yang punya dokumen + tahun berjalan + tahun SESUDAH yang terakhir,
  // supaya tahun baru bisa dibuka (dan disalin isinya) sebelum satu dokumen pun ada.
  const tahunData = useMemo(() => [...new Set(rows.map(r => r.tahun))].sort().reverse(), [rows]);
  const railTahun = useMemo(() => {
    const s = new Set(tahunData);
    s.add(tahunSekarang);
    if (tahunData.length) s.add(String(Number(tahunData[0]) + 1));
    return [...s].sort().reverse();
  }, [tahunData, tahunSekarang]);
  const [tahun, setTahun] = useState(() => (tahunAwal && railTahun.includes(tahunAwal) ? tahunAwal : tahunData[0] ?? tahunSekarang));
  const [search, setSearch] = useState('');
  // Bawaan selalu Pohon dan sengaja tidak diingat: kalau diingat, sekali memilih Kartu
  // membuatnya jadi bawaan bagi orang itu (keputusan pemilik, konsep beranda §7).
  const [view, setView] = useState<'pohon' | 'kartu'>('pohon');
  const [terlipat, setTerlipat] = useState<Set<string>>(new Set());
  const [sibuk, setSibuk] = useState<string | null>(null);

  const pohon = useMemo(() => susunPohon(rows, tahun), [rows, tahun]);
  const ringkasRail = useMemo(
    () => new Map(railTahun.map(y => [y, ringkasPohon(susunPohon(rows, y).baris)])),
    [rows, railTahun],
  );
  const ringkas = ringkasRail.get(tahun) ?? ringkasPohon(pohon.baris);
  const docsDari = (baris: BarisPohon<IkiListRow>[]) =>
    baris.flatMap(b => [b.murni, b.perubahan].filter((d): d is IkiListRow => d !== null));
  const docsTahun = docsDari(pohon.baris);
  const kunciTampil = saringPohon(pohon.baris, search);
  const barisTampil = pohon.baris.filter(b => kunciTampil.has(b.kunci));
  const docsTampil = docsDari(barisTampil);
  const adaBawahan = pohon.baris.some(b => b.anak.length > 0);

  const [dupTarget, setDupTarget] = useState<IkiListRow | null>(null);
  const [dupTahun, setDupTahun] = useState('');
  const [dupJenis, setDupJenis] = useState<IkiJenisDokumen>('MURNI');
  const [dupBusy, setDupBusy] = useState(false);

  const [showZip, setShowZip] = useState(false);
  const [zipFormat, setZipFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [zipOnlyFinal, setZipOnlyFinal] = useState(true);
  const [zipJenis, setZipJenis] = useState<JenisIki | 'SEMUA'>('SEMUA');
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState('');

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }

  function pilihTahun(y: string) {
    setTahun(y);
    setSearch('');
    exitSelect();
    window.history.replaceState(null, '', `/iki?tahun=${y}`);
  }

  function lipat(kunci: string) {
    setTerlipat(prev => {
      const next = new Set(prev);
      if (next.has(kunci)) next.delete(kunci); else next.add(kunci);
      return next;
    });
  }

  /** Tombol tulis di tabel pohon tombol biasa (bukan PrimaButton `menulis`), jadi sebabnya disebut di sini. */
  function tolakBeku(): boolean {
    if (!kunciTulis.dikunci) return false;
    toast.error(kunciTulis.sebab);
    return true;
  }

  function openCreate(isi?: Partial<FormBuat>) {
    setForm({ tahun, varian: 'STANDAR', jenis: 'MURNI', nama: '', nip: '', jabatan: '', pangkat: '', templat_id: null, bentuk_awal: 'STANDAR', ...isi });
    setGantiNamaTemplat(null);
    setShowCreate(true);
  }
  function identitasBaris(b: BarisPohon<IkiListRow>): Partial<FormBuat> {
    const d = b.perubahan ?? b.murni ?? b.sumber;
    if (!d) return {};
    return { varian: d.varian, nama: d.nama, nip: d.nip, jabatan: d.jabatan, pangkat: stripGolongan(d.pangkat) };
  }

  async function load() {
    try {
      const res = await fetch('/api/iki');
      const json = await res.json();
      if (json.ok) setRows(json.data);
    } catch { toast.error('Gagal memuat'); }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const chosen = rows.filter(r => selected.has(r.id));
    // Dulu bernama `isSA` waktu wewenangnya cuma SUPER_ADMIN. Nama peran diganti
    // nama WEWENANG supaya tidak menyesatkan lagi kalau daftarnya berubah lagi.
    const bolehHapusFinal = bolehBatalkanFinal(role);
    const finalCount = chosen.filter(r => r.status === 'FINAL').length;
    const finalNote = finalCount === 0 ? '' : bolehHapusFinal
      ? ` Termasuk ${finalCount} dokumen FINAL.`
      : ` ${finalCount} dokumen FINAL akan DILEWATI — hanya Admin yang bisa menghapus FINAL.`;
    if (!(await confirmDialog({
      title: `Hapus ${ids.length} dokumen IKI`,
      message: `Menghapus ${ids.length} dokumen terpilih beserta seluruh isinya secara permanen.${finalNote} Lanjutkan?`,
      variant: 'danger',
    }))) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/iki', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal menghapus'); return; }
      // Cocokkan penghapusan lokal dgn logika server: tanpa wewenang, FINAL dilewati.
      const removed = new Set(chosen.filter(r => bolehHapusFinal || r.status !== 'FINAL').map(r => r.id));
      setRows(prev => prev.filter(r => !removed.has(r.id)));
      toast.success(`${json.deleted} dokumen dihapus${json.skippedFinal ? `, ${json.skippedFinal} FINAL dilewati` : ''}`);
      exitSelect();
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBulkBusy(false); }
  }

  async function handleCreate() {
    if (!form.nama.trim() || !form.nip.trim() || !form.jabatan.trim()) {
      toast.error('Nama, NIP, dan Jabatan wajib diisi');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/iki', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          templat_id: form.varian === 'CUSTOM' ? form.templat_id : null,
          bentuk_awal: form.varian === 'CUSTOM' && !form.templat_id && form.bentuk_awal !== 'KOSONG' ? form.bentuk_awal : null,
        }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal membuat dokumen'); return; }
      toast.success('Dokumen IKI dibuat');
      router.push(`/iki/${json.id}`);
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBusy(false); }
  }

  async function handleDelete(d: IkiListRow) {
    if (tolakBeku()) return;
    if (!(await confirmDialog({
      title: 'Hapus dokumen IKI',
      message: `Hapus IKI ${labelJenis(d.jenis)} ${d.jabatan} (${d.nama}) tahun ${d.tahun}? Seluruh isi terhapus permanen.`,
      variant: 'danger',
    }))) return;
    try {
      const res = await fetch(`/api/iki?id=${d.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal menghapus'); return; }
      setRows(prev => prev.filter(r => r.id !== d.id));
      toast.success('Dokumen dihapus');
    } catch { toast.error('Gagal terhubung ke server'); }
  }

  /** POST duplikat → muat ulang daftar; dipakai Salin dari tahun lalu & Perubahan dari Murni. */
  async function duplikat(sumber: IkiListRow, tahunTarget: string, jenisTarget: JenisIki): Promise<{ id: number; atasan_lepas: boolean } | null> {
    try {
      const res = await fetch(`/api/iki/${sumber.id}/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahun_target: tahunTarget, jenis_target: jenisTarget }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal menyalin'); return null; }
      await load();
      return { id: json.id, atasan_lepas: json.atasan_lepas === true };
    } catch { toast.error('Gagal terhubung ke server'); return null; }
  }

  async function handleDuplicate() {
    if (!dupTarget) return;
    if (!/^\d{4}$/.test(dupTahun)) { toast.error('Tahun tujuan 4 digit'); return; }
    setDupBusy(true);
    try {
      const hasil = await duplikat(dupTarget, dupTahun, dupJenis);
      if (!hasil) return;
      toast.success(`Dokumen disalin jadi IKI ${labelJenis(dupJenis)} ${dupTahun}`);
      setDupTarget(null);
      router.push(`/iki/${hasil.id}`);
    } finally { setDupBusy(false); }
  }

  const aksiPohon: AksiPohon = {
    buka: d => router.push(`/iki/${d.id}`),
    pilih: toggleSelect,
    lipat,
    async salinDariSumber(b) {
      if (!b.sumber || tolakBeku()) return;
      const sumber = b.sumber;
      setSibuk(b.kunci);
      try {
        const hasil = await duplikat(sumber, tahun, 'MURNI');
        if (!hasil) return;
        toast.success(
          `IKI Murni ${tahun} ${b.jabatan} dibuat dari ${labelJenis(sumber.jenis)} ${sumber.tahun}.`
            + (hasil.atasan_lepas ? ` Atasannya belum punya IKI ${tahun}, jadi tautan atasan masih kosong.` : ''),
          { action: { label: 'Buka', onClick: () => router.push(`/iki/${hasil.id}`) } },
        );
      } finally { setSibuk(null); }
    },
    buatMurni: b => { if (!tolakBeku()) openCreate({ ...identitasBaris(b), jenis: 'MURNI' }); },
    async buatPerubahan(b) {
      if (!b.murni || tolakBeku()) return;
      const murni = b.murni;
      const pilihan = await pilihDialog({
        title: `IKI Perubahan ${tahun}`,
        message: `Buat IKI Perubahan ${b.jabatan} dengan menyalin isi IKI Murni ${tahun}-nya? Isinya tetap bisa disunting sesudahnya.`,
        confirmLabel: 'Salin dari Murni',
        variant: 'purple',
        altLabel: 'Buat kosong',
      });
      if (pilihan === 'lain') { openCreate({ ...identitasBaris(b), jenis: 'PERUBAHAN' }); return; }
      if (pilihan !== 'utama') return;
      setSibuk(b.kunci);
      try {
        const hasil = await duplikat(murni, tahun, 'PERUBAHAN');
        if (hasil) toast.success(`IKI Perubahan ${tahun} ${b.jabatan} dibuat dari Murni-nya.`, {
          action: { label: 'Buka', onClick: () => router.push(`/iki/${hasil.id}`) },
        });
      } finally { setSibuk(null); }
    },
    duplikat: d => {
      if (tolakBeku()) return;
      setDupTarget(d);
      setDupTahun(String(Number(d.tahun) + 1));
      setDupJenis('MURNI');
    },
    hapus: d => void handleDelete(d),
  };

  async function salinSemua() {
    const sumber = pohon.sumber;
    const n = pohon.rencana.length;
    if (!sumber || n === 0) return;
    if (!(await confirmDialog({
      title: `Salin ${n} jabatan dari ${sumber}`,
      message: `${n} jabatan yang punya IKI ${sumber} tapi belum punya IKI Murni ${tahun} akan dibuatkan IKI Murni ${tahun} berstatus DRAFT.\n\n`
        + `Isinya disalin dari IKI Perubahan ${sumber} kalau ada, kalau tidak dari Murni ${sumber}. Penyalinan berjalan dari atasan ke bawahan supaya tautan atasan ikut tersambung.\n\n`
        + 'Nama, NIP, pangkat, dan RHK ikut tersalin apa adanya — kalau ada pejabat yang berganti, ganti di editor.',
      confirmLabel: `Salin ${n} jabatan`,
      variant: 'purple',
    }))) return;
    setSibuk(SIBUK_SEMUA);
    try {
      const res = await fetch('/api/iki/salin-tahun', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahun_sumber: sumber, tahun_target: tahun }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal menyalin'); return; }
      await load();
      const dibuat = json.dibuat as { atasan_lepas: boolean }[];
      const dilewati = json.dilewati as { jabatan: string; alasan: string }[];
      const lepas = dibuat.filter(d => d.atasan_lepas).length;
      const pesan = [`${dibuat.length} IKI Murni ${tahun} dibuat`];
      if (dilewati.length) pesan.push(`${dilewati.length} dilewati`);
      if (lepas) pesan.push(`${lepas} tanpa tautan atasan`);
      if (dilewati.length) {
        toast.warning(`${pesan.join(', ')}.`, { description: dilewati.slice(0, 3).map(d => `${d.jabatan}: ${d.alasan}`).join('\n') });
      } else {
        toast.success(`${pesan.join(', ')}.`);
      }
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setSibuk(null); }
  }

  async function handleZipExport() {
    const pakaiPilihan = selected.size > 0;
    const list = dokumenZip(docsTahun, selected, { jenis: zipJenis, hanyaFinal: zipOnlyFinal }).slice(0, MAX_ZIP);
    if (list.length === 0) {
      toast.error(pakaiPilihan ? 'Tidak ada dokumen terpilih' : `Tidak ada dokumen${zipOnlyFinal ? ' FINAL' : ''} di tahun ${tahun}`);
      return;
    }
    setZipBusy(true);
    try {
      // Hanya pustaka format terpilih yang di-import — exceljs ~600KB, jspdf sekelas;
      // memuat keduanya membuat unduhan PDF ikut menunggu paket yang tak dipakai.
      const [{ default: PizZip }, { ikiFilename, alasanTakBisaCetak }, gen] = await Promise.all([
        import('pizzip'),
        import('@/lib/iki/layout'),
        zipFormat === 'xlsx'
          ? import('@/lib/iki/export-excel').then(m => ({
              bytes: (doc: Parameters<typeof m.buildIkiExcelBytes>[0]) => m.buildIkiExcelBytes(doc, tahun),
            }))
          : import('@/lib/iki/export-pdf').then(m => ({ bytes: m.buildIkiPdfBytes })),
      ]);
      const berkas: { jenis: JenisIki; nama: string; bytes: ArrayBuffer }[] = [];
      let skipped = 0;
      for (const r of list) {
        setZipProgress(`${berkas.length + skipped + 1}/${list.length} — ${r.jabatan}`);
        try {
          const res = await fetch(`/api/iki/${r.id}`);
          const json = await res.json();
          if (!json.ok || alasanTakBisaCetak(json.data)) { skipped++; continue; }
          berkas.push({
            jenis: r.jenis,
            nama: `${r.status === 'DRAFT' ? 'DRAFT_' : ''}${ikiFilename(json.data, r.tahun, zipFormat)}`,
            bytes: await gen.bytes(json.data),
          });
        } catch { skipped++; }
      }
      if (berkas.length === 0) { toast.error('Tidak ada dokumen yang bisa di-export (RHK / tabel kosong?)'); return; }
      const zip = new PizZip();
      jalurZip(berkas).forEach((jalur, i) => zip.file(jalur, berkas[i].bytes));
      const blob = zip.generate({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const labelFormat = zipFormat === 'xlsx' ? 'EXCEL' : 'PDF';
      // Format masuk nama berkas: tanpa itu mengunduh kedua format di tahun yang
      // sama menghasilkan dua zip bernama sama, tinggal " (1)" dari browser.
      const bagian = pakaiPilihan ? `_PILIHAN-${berkas.length}` : zipJenis !== 'SEMUA' ? `_${zipJenis}` : '';
      a.href = url; a.download = `IKI_${tahun}${bagian}_${labelFormat}.zip`; a.click();
      URL.revokeObjectURL(url);
      fetch('/api/iki/export-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: zipFormat, mode: 'massal', tahun, jumlah: berkas.length }),
      }).catch(() => {});
      toast.success(`${berkas.length} ${labelFormat} di-zip${skipped ? `, ${skipped} dilewati (isi kosong/gagal)` : ''}`);
      setShowZip(false);
    } catch { toast.error('Gagal membuat zip'); }
    finally { setZipBusy(false); setZipProgress(''); }
  }

  const terpilihDocs = docsTahun.filter(d => selected.has(d.id));
  const rincianTerpilih = [
    `${terpilihDocs.filter(d => d.jenis === 'MURNI').length} Murni`,
    `${terpilihDocs.filter(d => d.jenis === 'PERUBAHAN').length} Perubahan`,
  ].join(' · ');

  return (
    <div className={`iki-list-body${isLight ? ' light' : ''}`}>
      <style>{LIST_CSS}</style>

      <header className="iki-topbar">
        <div className="iki-brand"><ClipboardCheck size={18} /> IKI <span className="iki-brand-sub">Indikator Kinerja Individu</span></div>
        <div className="iki-topbar-right">
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <main className="iki-main">
        <SpandukBeku {...beku}/>
        <div className="iki-main-head">
          <div>
            <h1 className="iki-h1"><ClipboardCheck size={22} /> Dokumen IKI</h1>
            <p className="iki-sub">Per tahun, disusun mengikuti atasan · Murni dan Perubahan berdampingan</p>
          </div>
          <div className="iki-head-actions">
            {docsTahun.length > 0 && !selectMode && (
              <PrimaButton variant="ghost" iconLeft={<CheckSquare size={16} />} onClick={() => setSelectMode(true)}>Pilih</PrimaButton>
            )}
            {docsTahun.length > 0 && (
              <PrimaButton variant="success" iconLeft={<FolderDown size={16} />} onClick={() => setShowZip(true)}>
                {selected.size > 0 ? `Unduh Zip (${selected.size})` : 'Unduh Zip'}
              </PrimaButton>
            )}
            <PrimaButton variant="success" menulis iconLeft={<FileText size={16} />} onClick={() => setShowImportExcel(true)}>Import Excel</PrimaButton>
            <PrimaButton variant="purple" menulis iconLeft={<Plus size={16} />} onClick={() => openCreate()}>Buat IKI</PrimaButton>
          </div>
        </div>

        <div className="iki-layout">
          <nav className="iki-rail" aria-label="Tahun">
            <p className="iki-rail-lbl">Tahun</p>
            {railTahun.map(y => {
              const r = ringkasRail.get(y);
              const kosong = !r || r.jabatan === 0;
              return (
                <button key={y} type="button" className={`iki-rail-item${y === tahun ? ' on' : ''}${r && r.ada === 0 ? ' baru' : ''}`}
                  onClick={() => pilihTahun(y)} aria-current={y === tahun ? 'true' : undefined}>
                  <b>{y}</b>
                  <span className="sub">{kosong ? 'belum ada' : r.ada === 0 ? `belum dimulai · ${r.jabatan} jabatan` : `${r.ada}/${r.jabatan} jabatan · ${r.final} final`}</span>
                  {!kosong && <span className="iki-rail-bar"><i style={{ width: `${Math.round((r.ada / r.jabatan) * 100)}%` }} /></span>}
                </button>
              );
            })}
          </nav>

          <section className="iki-isi">
            <div className="iki-toolbar">
              <div className="iki-searchbox">
                <Search size={15} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cari jabatan, nama, atau NIP di ${tahun}…`} />
                {search && <button className="iki-search-clear" onClick={() => setSearch('')} aria-label="Kosongkan pencarian">×</button>}
              </div>
              <div className="iki-viewtoggle" role="group" aria-label="Tampilan">
                <button className={view === 'pohon' ? 'on' : ''} onClick={() => setView('pohon')} aria-label="Tampilan pohon" data-tooltip="Pohon jabatan" data-tooltip-pos="above"><ListTree size={15} /></button>
                <button className={view === 'kartu' ? 'on' : ''} onClick={() => setView('kartu')} aria-label="Tampilan kartu" data-tooltip="Kartu" data-tooltip-pos="above"><LayoutGrid size={15} /></button>
              </div>
            </div>

            {selectMode && (
              <div className="iki-selbar">
                <span>{selected.size} dipilih</span>
                <button className="iki-sellink" onClick={() => setSelected(new Set(docsTampil.map(r => r.id)))}>Pilih semua ({docsTampil.length})</button>
                <button className="iki-sellink" onClick={() => setSelected(new Set())}>Kosongkan</button>
                <span className="iki-sel-spacer" />
                <PrimaButton variant="success" size="sm" iconLeft={<FolderDown size={15} />}
                  disabled={selected.size === 0 || bulkBusy} onClick={() => setShowZip(true)}>
                  Unduh Zip ({selected.size})
                </PrimaButton>
                <PrimaButton variant="danger" size="sm" menulis iconLeft={<Trash2 size={15} />}
                  disabled={selected.size === 0 || bulkBusy} onClick={handleBulkDelete}>
                  {bulkBusy ? 'Menghapus…' : `Hapus (${selected.size})`}
                </PrimaButton>
                <PrimaButton variant="ghost" size="sm" onClick={exitSelect} disabled={bulkBusy}>Selesai</PrimaButton>
              </div>
            )}

            <div className="iki-panel">
              <div className="iki-ptitle">
                <b>{tahun}</b>
                <span className="sum">
                  {ringkas.jabatan === 0
                    ? 'Belum ada dokumen'
                    : `${ringkas.ada} dari ${ringkas.jabatan} jabatan sudah punya IKI · ${ringkas.final} dari ${ringkas.dokumen} dokumen FINAL`}
                </span>
                <span className="sp" />
                {pohon.sumber && pohon.rencana.length > 0 && !selectMode && (
                  <PrimaButton variant="purple" size="sm" menulis iconLeft={<Copy size={14} />}
                    disabled={sibuk !== null} onClick={salinSemua}
                    data-tooltip={`Buat IKI Murni ${tahun} untuk tiap jabatan ${pohon.sumber} yang belum punya`}>
                    {sibuk === SIBUK_SEMUA ? 'Menyalin…' : `Salin semua dari ${pohon.sumber} (${pohon.rencana.length})`}
                  </PrimaButton>
                )}
                {view === 'pohon' && adaBawahan && !search && (
                  <span className="iki-plipat-semua">
                    <button type="button" className="iki-act kecil" aria-label="Lipat semua" data-tooltip="Lipat semua" data-tooltip-pos="above"
                      onClick={() => setTerlipat(new Set(pohon.baris.filter(b => b.anak.length > 0).map(b => b.kunci)))}><ChevronsDownUp size={14} /></button>
                    <button type="button" className="iki-act kecil" aria-label="Buka semua" data-tooltip="Buka semua" data-tooltip-pos="above"
                      onClick={() => setTerlipat(new Set())}><ChevronsUpDown size={14} /></button>
                  </span>
                )}
              </div>

              {pohon.baris.length === 0 ? (
                <div className="iki-empty"><FileText size={28} /><p>Belum ada dokumen IKI {tahun}.</p><span>Klik <b>Buat IKI</b> atau <b>Import Excel</b> untuk mulai menyusun.</span></div>
              ) : barisTampil.length === 0 ? (
                <div className="iki-empty"><Search size={28} /><p>Tidak ada jabatan yang cocok.</p><span>Ubah kata kunci pencarian.</span></div>
              ) : view === 'pohon' ? (
                <PohonIki baris={barisTampil} tahun={tahun} terlipat={terlipat} sedangCari={search.trim() !== ''}
                  modePilih={selectMode} terpilih={selected} sibuk={sibuk} aksi={aksiPohon} />
              ) : docsTampil.length === 0 ? (
                <div className="iki-empty"><FileText size={28} /><p>Belum ada dokumen {tahun}.</p><span>{barisTampil.length} jabatan menunggu disalin — lihat tampilan Pohon.</span></div>
              ) : (
                <div className="iki-grid">
                  {docsTampil.map(d => (
                    <div key={d.id} className={`iki-card${selectMode ? ' selectable' : ''}${selected.has(d.id) ? ' selected' : ''}`}
                      onClick={() => selectMode ? toggleSelect(d.id) : router.push(`/iki/${d.id}`)}>
                      <div className="iki-card-top">
                        <span className={`iki-avatar${d.varian === 'DIREKTUR' ? ' dir' : ''}`}>{nameInitials(d.nama)}</span>
                        <div className="iki-badges">
                          {selectMode && <span className={`iki-check${selected.has(d.id) ? ' on' : ''}`}>{selected.has(d.id) && <Check size={13} strokeWidth={3} />}</span>}
                          {d.varian === 'DIREKTUR' && <span className="iki-badge dir">DIREKTUR</span>}
                          {d.varian === 'CUSTOM' && <span className="iki-badge custom">CUSTOM</span>}
                          {d.jenis === 'PERUBAHAN' && <span className="iki-badge ubah">PERUBAHAN</span>}
                          <span className={`iki-badge ${d.status === 'FINAL' ? 'final' : 'draft'}`}>{d.status}</span>
                        </div>
                      </div>
                      <div className="iki-card-jabatan">{d.jabatan}</div>
                      <div className="iki-card-nama">{d.nama}</div>
                      <div className="iki-card-foot">
                        <span className="iki-cnip">NIP {d.nip}</span>
                        <span className="iki-rhk">{labelJumlahIsi(d)}</span>
                      </div>
                      {!selectMode && (
                        <div className="iki-card-actions" onClick={e => e.stopPropagation()}>
                          <button className="iki-act" data-tooltip="Duplikat ke tahun lain" data-tooltip-pos="above" onClick={() => aksiPohon.duplikat(d)}>
                            <Copy size={15} />
                          </button>
                          {d.status !== 'FINAL' && (
                            <button className="iki-act danger" data-tooltip="Hapus dokumen" data-tooltip-pos="above" onClick={() => handleDelete(d)}><DeleteIcon size={15} /></button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <FloatingDock isLight={isLight} limelight
        nav={[
          { icon: <ClipboardCheck size={17} />, label: 'IKI', onClick: () => {}, current: true },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => router.push('/menu') },
        ]}
        actions={[
          { icon: <Plus size={17} />, label: 'Buat', onClick: () => openCreate() },
          { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: () => void load() },
        ]}
      />

      {showImportExcel && (
        <ImportIkiModal
          rows={rows}
          initialJenis="MURNI"
          onClose={() => setShowImportExcel(false)}
          onDone={(id) => { setShowImportExcel(false); router.push(`/iki/${id}`); }}
        />
      )}

      {showCreate && (
        <div className="iki-modal-bg" onClick={() => !busy && setShowCreate(false)}>
          <div className="iki-modal" onClick={e => e.stopPropagation()}>
            <h3>Buat Dokumen IKI</h3>
            <label className="iki-field">
              <span>Tahun</span>
              <input value={form.tahun} inputMode="numeric" maxLength={4}
                onChange={e => setForm(f => ({ ...f, tahun: e.target.value.replace(/\D/g, '') }))} />
            </label>
            <label className="iki-field">
              <span>Varian Form</span>
              <div className="iki-tpl tiga">
                <button type="button" className={`iki-tpl-opt${form.varian === 'STANDAR' ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, varian: 'STANDAR' }))}>
                  <b>Standar</b><span>11 kolom + RHK diintervensi (Wadir/Kabid/Kabag/Kasubag)</span>
                </button>
                <button type="button" className={`iki-tpl-opt${form.varian === 'DIREKTUR' ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, varian: 'DIREKTUR' }))}>
                  <b>Direktur</b><span>8 kolom, ttd tunggal (pejabat puncak)</span>
                </button>
                <button type="button" className={`iki-tpl-opt${form.varian === 'CUSTOM' ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, varian: 'CUSTOM' }))}>
                  <b>Custom</b><span>Tabel dirancang sendiri — sampai 24 kolom, gabung sel bebas</span>
                </button>
              </div>
            </label>
            {form.varian === 'CUSTOM' && (
              <div className="iki-field">
                <span>Bentuk tabel awal</span>
                <select value={form.templat_id ?? `bawaan:${form.bentuk_awal}`}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => (v.startsWith('bawaan:') ? { ...f, templat_id: null, bentuk_awal: v.slice(7) as BentukAwal } : { ...f, templat_id: Number(v) }));
                    setGantiNamaTemplat(null);
                  }}>
                  <option value="bawaan:STANDAR">Seperti STANDAR (11 kolom) — bisa ditambah kolom</option>
                  <option value="bawaan:DIREKTUR">Seperti DIREKTUR (8 kolom) — bisa ditambah kolom</option>
                  <option value="bawaan:KOSONG">Tabel kosong (4 kolom: No., RHK, Indikator, Target)</option>
                  {templat === null && <option disabled>Memuat templat tersimpan…</option>}
                  {(templat ?? []).map(t => <option key={t.id} value={t.id}>{t.nama} — {t.ncol} kolom</option>)}
                </select>
                {templatTerpilih && (gantiNamaTemplat === null ? (
                  <span className="iki-tpl-kelola">
                    <button type="button" onClick={() => setGantiNamaTemplat(templatTerpilih.nama)}>Ganti nama</button>
                    <button type="button" className="bahaya" onClick={() => void hapusTemplatTerpilih()}>Hapus templat</button>
                    <span>diubah {templatTerpilih.updated_at}</span>
                  </span>
                ) : (
                  <span className="iki-tpl-kelola">
                    <input value={gantiNamaTemplat} maxLength={150} aria-label="Nama templat baru" autoFocus
                      onChange={e => setGantiNamaTemplat(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void simpanNamaTemplat(); } else if (e.key === 'Escape') setGantiNamaTemplat(null); }} />
                    <button type="button" onClick={() => void simpanNamaTemplat()}>Simpan</button>
                    <button type="button" onClick={() => setGantiNamaTemplat(null)}>Batal</button>
                  </span>
                ))}
                <span className="iki-suggest-hint">&ldquo;Seperti STANDAR/DIREKTUR&rdquo; = kepala & kolom persis form bawaan dengan peran kolom sudah ditandai, jadi Ambil dari Renaksi / Atasan langsung jalan; kolom bisa ditambah sesudahnya. Tabel DISALIN ke dokumen — mengubah atau menghapus templat sesudahnya tidak menyentuh dokumen ini. Templat dibuat dari editor dokumen Custom (tombol &ldquo;Simpan sebagai templat&rdquo;).</span>
              </div>
            )}
            <label className="iki-field">
              <span>Jenis Dokumen</span>
              <select value={form.jenis} onChange={e => setForm(f => ({ ...f, jenis: e.target.value as IkiJenisDokumen }))}>
                <option value="MURNI">Murni — judul &quot;INDIKATOR KINERJA INDIVIDU&quot;</option>
                <option value="PERUBAHAN">Perubahan — judul + &quot;PERUBAHAN&quot;</option>
              </select>
            </label>
            <label className="iki-field">
              <span>Nama Pejabat (+ gelar)</span>
              <input value={form.nama} list="iki-create-pejabat"
                onChange={e => pickPejabat(e.target.value)}
                placeholder={pejabat.length > 0 ? 'ketik nama — pilih dari Master Pejabat PK' : 'dr. FULAN, M.Kes'} />
              <datalist id="iki-create-pejabat">
                {pejabat.map((p, i) => <option key={i} value={pejabatOptionValue(p)} />)}
              </datalist>
              {pejabat.length > 0 && (
                <span className="iki-suggest-hint">✦ {pejabat.length} pejabat tersedia dari Master Pejabat PK tahun {form.tahun} — pilih nama untuk isi NIP + jabatan otomatis</span>
              )}
            </label>
            <label className="iki-field">
              <span>NIP</span>
              <input value={form.nip} onChange={e => setForm(f => ({ ...f, nip: e.target.value }))} placeholder="19690211 200701 1 007" />
            </label>
            <label className="iki-field">
              <span>Jabatan</span>
              <input value={form.jabatan} onChange={e => setForm(f => ({ ...f, jabatan: e.target.value }))} placeholder="KEPALA BAGIAN ..." />
            </label>
            <p className="iki-hint">Data Pribadi lengkap (ikhtisar, pangkat, atasan, tanggal ttd) diisi di editor setelah dokumen dibuat.</p>
            <div className="iki-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={busy}>Batal</PrimaButton>
              <PrimaButton variant="purple" size="sm" menulis onClick={handleCreate} disabled={busy}>{busy ? 'Membuat…' : 'Buat'}</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {dupTarget && (
        <div className="iki-modal-bg" onClick={() => !dupBusy && setDupTarget(null)}>
          <div className="iki-modal" onClick={e => e.stopPropagation()}>
            <h3>Duplikat ke Tahun Lain</h3>
            <p className="iki-hint">
              Menyalin seluruh isi IKI {labelJenis(dupTarget.jenis)} <b>{dupTarget.jabatan}</b> ({dupTarget.nama}) tahun {dupTarget.tahun}:
              data pribadi, atasan, dan semua RHK + target triwulan. Hasil duplikat berstatus DRAFT,
              tanggal ttd dikosongkan — tinggal sesuaikan target tahun baru.
            </p>
            <label className="iki-field">
              <span>Tahun Tujuan</span>
              <input value={dupTahun} inputMode="numeric" maxLength={4}
                onChange={e => setDupTahun(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="iki-field">
              <span>Jadi dokumen</span>
              <div className="iki-tpl">
                <button type="button" className={`iki-tpl-opt${dupJenis === 'MURNI' ? ' on' : ''}`} onClick={() => setDupJenis('MURNI')} disabled={dupBusy}>
                  <b>Murni</b><span>pembuka tahun tujuan</span>
                </button>
                <button type="button" className={`iki-tpl-opt${dupJenis === 'PERUBAHAN' ? ' on' : ''}`} onClick={() => setDupJenis('PERUBAHAN')} disabled={dupBusy}>
                  <b>Perubahan</b><span>judul + &quot;PERUBAHAN&quot;</span>
                </button>
              </div>
            </label>
            <div className="iki-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setDupTarget(null)} disabled={dupBusy}>Batal</PrimaButton>
              <PrimaButton variant="purple" size="sm" menulis onClick={handleDuplicate} disabled={dupBusy}>{dupBusy ? 'Menduplikasi…' : 'Duplikat'}</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {showZip && (
        <div className="iki-modal-bg" onClick={() => !zipBusy && setShowZip(false)}>
          <div className="iki-modal" onClick={e => e.stopPropagation()}>
            <h3>{selected.size > 0 ? `Unduh ${selected.size} Dokumen Terpilih (Zip)` : `Unduh Dokumen ${tahun} (Zip)`}</h3>
            {selected.size > 0 && (
              <p className="iki-hint">
                Hanya dokumen yang dicentang: {rincianTerpilih}. Dokumen DRAFT diberi awalan DRAFT_.
                {terpilihDocs.some(d => d.jenis === 'MURNI') && terpilihDocs.some(d => d.jenis === 'PERUBAHAN') && ' Murni dan Perubahan masuk folder masing-masing di dalam zip.'}
              </p>
            )}
            <label className="iki-field">
              <span>Format berkas</span>
              <div className="iki-tpl">
                <button type="button" className={`iki-tpl-opt${zipFormat === 'pdf' ? ' on' : ''}`} onClick={() => setZipFormat('pdf')} disabled={zipBusy}>
                  <b>PDF</b><span>siap cetak, tata letak terkunci</span>
                </button>
                <button type="button" className={`iki-tpl-opt${zipFormat === 'xlsx' ? ' on' : ''}`} onClick={() => setZipFormat('xlsx')} disabled={zipBusy}>
                  <b>Excel</b><span>masih bisa disunting di Excel</span>
                </button>
              </div>
            </label>
            {selected.size === 0 && (
              <>
                <label className="iki-field">
                  <span>Jenis</span>
                  <div className="iki-tpl tiga">
                    {(['SEMUA', 'MURNI', 'PERUBAHAN'] as const).map(j => (
                      <button key={j} type="button" className={`iki-tpl-opt${zipJenis === j ? ' on' : ''}`} onClick={() => setZipJenis(j)} disabled={zipBusy}>
                        <b>{j === 'SEMUA' ? 'Keduanya' : labelJenis(j)}</b>
                        <span>{docsTahun.filter(d => j === 'SEMUA' || d.jenis === j).length} dokumen</span>
                      </button>
                    ))}
                  </div>
                </label>
                <label className="iki-field">
                  <span>Dokumen yang diikutkan</span>
                  <div className="iki-tpl">
                    <button type="button" className={`iki-tpl-opt${zipOnlyFinal ? ' on' : ''}`} onClick={() => setZipOnlyFinal(true)} disabled={zipBusy}>
                      <b>Hanya FINAL</b><span>dokumen resmi yang sudah dikunci</span>
                    </button>
                    <button type="button" className={`iki-tpl-opt${!zipOnlyFinal ? ' on' : ''}`} onClick={() => setZipOnlyFinal(false)} disabled={zipBusy}>
                      <b>Semua</b><span>DRAFT ikut, diberi prefix DRAFT_</span>
                    </button>
                  </div>
                </label>
                <p className="iki-hint">Mau sebagian saja? Tutup, klik <b>Pilih</b>, centang dokumennya, lalu Unduh Zip.</p>
              </>
            )}
            {zipBusy && <p className="iki-hint">Menyusun… {zipProgress}</p>}
            <div className="iki-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setShowZip(false)} disabled={zipBusy}>Batal</PrimaButton>
              <PrimaButton variant="success" size="sm" onClick={handleZipExport} disabled={zipBusy}>{zipBusy ? 'Memproses…' : 'Unduh Zip'}</PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const LIST_CSS = `
  .iki-list-body { min-height: 100vh; background: #020F1C; color: #E6F1FB; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; padding-bottom: 110px; }
  .iki-topbar { position: sticky; top: 0; z-index: 200; display: flex; align-items: center; justify-content: space-between; padding: 10px 22px; min-height: 56px; background: rgba(4,44,83,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid #0C447C; }
  .iki-brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 800; font-size: 16px; color: #EF9F27; }
  .iki-brand-sub { font-weight: 500; font-size: 11.5px; color: #85B7EB; }
  .iki-topbar-right { display: flex; align-items: center; gap: 12px; }
  .iki-main { max-width: 1200px; margin: 0 auto; padding: 30px 22px; }
  .iki-main-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 22px; gap: 16px; flex-wrap: wrap; }
  .iki-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .iki-h1 { display: inline-flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 900; margin: 0; letter-spacing: -.4px; }
  .iki-sub { font-size: 13px; color: #85B7EB; margin: 5px 0 0; }
  .iki-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #85B7EB; padding: 64px 20px; text-align: center; }
  .iki-empty p { font-size: 15px; font-weight: 600; margin: 4px 0 0; color: #B5D4F4; }
  .iki-empty span { font-size: 12.5px; }

  .iki-layout { display: grid; grid-template-columns: 176px minmax(0, 1fr); gap: 18px; align-items: start; }
  .iki-rail { position: sticky; top: 76px; display: flex; flex-direction: column; gap: 6px; }
  .iki-rail-lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #85B7EB; margin: 0 0 2px 4px; }
  .iki-rail-item { text-align: left; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 9px 11px; color: #B5D4F4; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; gap: 4px; transition: background .12s, border-color .12s; }
  .iki-rail-item:hover { background: rgba(255,255,255,0.04); }
  .iki-rail-item.on { background: #042C53; border-color: #185FA5; color: #E6F1FB; }
  .iki-rail-item b { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 800; color: #E6F1FB; }
  .iki-rail-item .sub { font-size: 11px; line-height: 1.35; }
  .iki-rail-item.baru .sub { color: #FAC775; }
  .iki-rail-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; }
  .iki-rail-bar i { display: block; height: 100%; background: #7BE0BD; }
  .iki-isi { min-width: 0; }

  .iki-panel { background: #042C53; border: 1px solid #0C447C; border-radius: 12px; overflow: hidden; }
  .iki-ptitle { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 14px; border-bottom: 1px solid #0C447C; }
  .iki-ptitle > b { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 800; }
  .iki-ptitle .sum { font-size: 12px; color: #85B7EB; }
  .iki-ptitle .sp { flex: 1; }
  .iki-plipat-semua { display: inline-flex; gap: 4px; }
  .iki-prow { display: grid; grid-template-columns: minmax(0, 1fr) 196px 196px; gap: 8px; align-items: center; padding: 6px 12px 6px 0; border-top: 1px solid rgba(12,68,124,0.5); }
  .iki-phead { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #85B7EB; background: rgba(12,68,124,0.35); border-top: none; padding: 9px 12px 9px 14px; }
  .iki-phead .c { text-align: center; }
  .iki-prow:not(.iki-phead):hover { background: rgba(24,95,165,0.12); }
  .iki-pjab { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .iki-plipat { width: 22px; height: 22px; border-radius: 6px; border: none; background: none; color: #85B7EB; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; padding: 0; }
  .iki-plipat:hover { background: rgba(255,255,255,0.08); color: #E6F1FB; }
  .iki-plipat-ruang { width: 22px; flex-shrink: 0; }
  .iki-ptxt { min-width: 0; }
  .iki-ptxt .jab { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-ptxt .nm { font-size: 11px; color: #B5D4F4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-ptxt .nip { font-family: 'JetBrains Mono', monospace; color: #85B7EB; }
  .iki-prow.hantu .jab { color: #85B7EB; font-weight: 500; }
  .iki-prow.hantu .nm { color: #5f86ad; font-style: italic; }
  .iki-pcell { display: flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; }
  .iki-pdok { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.04); border: 1px solid #0C447C; border-radius: 8px; padding: 4px 8px; color: #E6F1FB; cursor: pointer; font-family: inherit; }
  .iki-pdok:hover { border-color: #185FA5; background: rgba(255,255,255,0.08); }
  .iki-pcell.on .iki-pdok { border-color: #7C5CFC; background: rgba(124,92,252,0.14); }
  .iki-prhk { font-size: 11px; color: #7BE0BD; font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
  .iki-pakt { display: inline-flex; gap: 3px; }
  .iki-pbuat { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px dashed #185FA5; border-radius: 8px; padding: 4px 10px; color: #85B7EB; font-size: 11.5px; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .iki-pbuat:hover:not(:disabled) { border-style: solid; color: #E6F1FB; }
  .iki-psalin { display: inline-flex; align-items: center; gap: 5px; background: rgba(124,92,252,0.14); border: 1px solid rgba(124,92,252,0.45); border-radius: 8px; padding: 4px 10px; color: #B9A6FF; font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
  .iki-psalin:hover:not(:disabled) { background: rgba(124,92,252,0.24); color: #E6F1FB; }
  .iki-psalin:disabled, .iki-pbuat:disabled { opacity: .6; cursor: progress; }
  .iki-pkosong-aksi { display: inline-flex; align-items: center; gap: 4px; }
  .iki-pstrip { color: #5f86ad; font-size: 12px; }
  .iki-plepas { padding: 10px 14px 7px; font-size: 11px; font-weight: 700; color: #FAC775; border-top: 1px solid #0C447C; background: rgba(186,117,23,0.08); }

  .iki-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .iki-searchbox { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 8px; background: #042C53; border: 1px solid #0C447C; border-radius: 8px; padding: 0 11px; height: 38px; color: #85B7EB; }
  .iki-searchbox input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: #E6F1FB; font-size: 12.5px; font-family: 'Inter', sans-serif; }
  .iki-searchbox input::placeholder { color: #5f86ad; }
  .iki-search-clear { background: none; border: none; color: #85B7EB; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .iki-search-clear:hover { color: #E6F1FB; }
  .iki-viewtoggle { display: flex; background: #042C53; border: 1px solid #0C447C; border-radius: 8px; padding: 3px; gap: 2px; }
  .iki-viewtoggle button { background: none; border: none; color: #85B7EB; width: 32px; height: 30px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; }
  .iki-viewtoggle button:hover { color: #E6F1FB; }
  .iki-viewtoggle button.on { background: #185FA5; color: #fff; }
  .iki-act.locked { color: #5f86ad; cursor: default; background: none; border-color: transparent; }
  .iki-act.locked:hover { color: #5f86ad; background: none; border-color: transparent; }
  .iki-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; padding: 16px; }
  .iki-card { background: #042C53; border: 1px solid #0C447C; border-radius: 12px; padding: 16px; cursor: pointer; transition: transform .12s, border-color .12s, box-shadow .12s; position: relative; display: flex; flex-direction: column; min-height: 168px; }
  .iki-card:hover { transform: translateY(-3px); border-color: #185FA5; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
  .iki-card.selected { border-color: #7C5CFC; box-shadow: 0 0 0 2px rgba(124,92,252,.4); }
  .iki-check { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid #185FA5; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.04); color: #fff; flex-shrink: 0; }
  .iki-pdok .iki-check { width: 17px; height: 17px; border-radius: 5px; }
  .iki-check.on { background: #7C5CFC; border-color: #7C5CFC; }
  .iki-selbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 10px 14px; background: #042C53; border: 1px solid #0C447C; border-radius: 10px; flex-wrap: wrap; position: sticky; top: 66px; z-index: 100; }
  .iki-selbar > span:first-child { font-size: 13px; font-weight: 700; color: #E6F1FB; }
  .iki-sellink { background: none; border: none; color: #85B7EB; font-size: 12px; cursor: pointer; text-decoration: underline; padding: 0; }
  .iki-sellink:hover { color: #E6F1FB; }
  .iki-sel-spacer { flex: 1; }
  .iki-card-top { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
  .iki-avatar { width: 40px; height: 40px; border-radius: 10px; background: rgba(239,159,39,0.14); color: #F5C77E; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .iki-avatar.dir { background: rgba(29,158,117,0.14); color: #7BE0BD; }
  .iki-badges { display: flex; gap: 6px; margin-left: auto; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .iki-badge { font-size: 10px; font-weight: 800; letter-spacing: .07em; padding: 3px 9px; border-radius: 99px; }
  .iki-badge.draft { background: rgba(124,92,252,0.16); color: #B9A6FF; border: 1px solid rgba(124,92,252,0.4); }
  .iki-badge.final { background: rgba(29,158,117,0.16); color: #7BE0BD; border: 1px solid rgba(29,158,117,0.4); }
  .iki-badge.dir { background: rgba(239,159,39,0.14); color: #F5C77E; border: 1px solid rgba(239,159,39,0.4); }
  .iki-badge.custom { background: rgba(55,138,221,0.15); color: #8FC1F2; border: 1px solid rgba(55,138,221,0.4); }
  .iki-badge.ubah { background: rgba(186,117,23,0.16); color: #FAC775; border: 1px solid rgba(186,117,23,0.45); }
  .iki-card-jabatan { font-size: 13px; font-weight: 700; line-height: 1.35; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 35px; }
  .iki-card-nama { font-size: 12px; color: #B5D4F4; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(12,68,124,0.55); }
  .iki-cnip { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #85B7EB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-rhk { font-size: 10.5px; color: #7BE0BD; background: rgba(29,158,117,0.12); padding: 2px 8px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
  .iki-card-actions { display: flex; gap: 6px; margin-top: 10px; min-height: 32px; }
  .iki-act { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; flex-shrink: 0; }
  .iki-act.kecil { width: 26px; height: 26px; border-radius: 7px; }
  .iki-act:hover { border-color: #185FA5; color: #E6F1FB; background: rgba(255,255,255,0.09); }
  .iki-act.danger:hover { border-color: #E24B4A; color: #FCA5A5; background: rgba(226,75,74,0.1); }
  .iki-modal-bg { position: fixed; inset: 0; background: rgba(2,15,28,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .iki-modal { background: #042C53; border: 1px solid #0C447C; border-radius: 14px; padding: 22px; width: 430px; max-width: 92vw; max-height: 90vh; overflow-y: auto; }
  .iki-modal h3 { margin: 0 0 16px; font-size: 16px; font-weight: 800; }
  .iki-field { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #B5D4F4; margin-bottom: 12px; }
  .iki-field input { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 9px 11px; color: #E6F1FB; font-size: 13px; }
  .iki-field input:focus { outline: none; border-color: #185FA5; }
  .iki-field select { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 9px 11px; color: #E6F1FB; font-size: 13px; font-family: inherit; }
  .iki-tpl-kelola { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11px; color: #85B7EB; }
  .iki-tpl-kelola button { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 11.5px; }
  .iki-tpl-kelola button:hover { border-color: #185FA5; color: #E6F1FB; }
  .iki-tpl-kelola button.bahaya { color: #FCA5A5; }
  .iki-tpl-kelola button.bahaya:hover { border-color: #E24B4A; }
  .iki-tpl-kelola input { flex: 1 1 160px; min-width: 0; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 5px 8px; color: #E6F1FB; font-size: 12px; }
  .iki-hint { font-size: 11.5px; color: #85B7EB; line-height: 1.5; margin: 0 0 18px; }
  .iki-suggest-hint { font-size: 10.5px; color: #7BE0BD; line-height: 1.4; }
  .iki-tpl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .iki-tpl.tiga { grid-template-columns: 1fr 1fr 1fr; }
  .iki-tpl-opt { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left; padding: 9px 11px; background: #020F1C; border: 1px solid #0C447C; border-radius: 8px; color: #B5D4F4; cursor: pointer; transition: border-color .15s, background .15s; }
  .iki-tpl-opt b { font-size: 12.5px; color: #E6F1FB; }
  .iki-tpl-opt span { font-size: 10.5px; color: #85B7EB; }
  .iki-tpl-opt:hover { border-color: #185FA5; }
  .iki-tpl-opt.on { border-color: #7C5CFC; background: rgba(124,92,252,0.14); }
  .iki-tpl-opt.on b { color: #C9BCFF; }
  .iki-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

  @media (max-width: 760px) {
    .iki-layout { grid-template-columns: minmax(0, 1fr); }
    .iki-rail { position: static; flex-direction: row; overflow-x: auto; gap: 6px; padding-bottom: 2px; }
    .iki-rail-lbl { display: none; }
    .iki-rail-item { flex: 0 0 auto; min-width: 118px; }
    .iki-selbar { top: 60px; }
  }
  @media (max-width: 560px) {
    .iki-topbar { padding: 10px 14px; }
    .iki-brand-sub { display: none; }
    .iki-main { padding: 20px 14px; }
    .iki-prow { grid-template-columns: minmax(0, 1fr) 76px 76px; gap: 4px; padding-right: 6px; }
    .iki-pjab { padding-left: calc(4px + var(--dalam) * 10px) !important; gap: 2px; }
    .iki-ptxt .jab { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.3; }
    .iki-pakt, .iki-ptxt .nip, .iki-pkosong-aksi .iki-act, .iki-prhk, .iki-pbuat .lp, .iki-psalin .lp { display: none; }
    .iki-psalin, .iki-pbuat { padding: 4px 7px; font-size: 11px; }
    .iki-pdok { padding: 4px 6px; }
    .iki-ptitle .sum { flex-basis: 100%; order: 3; }
  }

  /* ── LIGHT THEME ── */
  [data-theme="light"] .iki-list-body { background: #F5F5F7; color: #0F0F12; }
  [data-theme="light"] .iki-topbar { background: rgba(255,255,255,0.92); border-bottom-color: rgba(0,0,0,.1); box-shadow: 0 2px 12px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-brand { color: #B26B00; }
  [data-theme="light"] .iki-brand-sub, [data-theme="light"] .iki-sub, [data-theme="light"] .iki-empty { color: #6B7280; }
  [data-theme="light"] .iki-rail-lbl, [data-theme="light"] .iki-rail-item { color: #6B7280; }
  [data-theme="light"] .iki-rail-item:hover { background: rgba(0,0,0,.04); }
  [data-theme="light"] .iki-rail-item.on { background: #FFFFFF; border-color: #8B5CF6; color: #0F0F12; box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-rail-item b { color: #0F0F12; }
  [data-theme="light"] .iki-rail-item.baru .sub { color: #B26B00; }
  [data-theme="light"] .iki-rail-bar { background: rgba(0,0,0,.08); }
  [data-theme="light"] .iki-rail-bar i { background: #0F8A63; }
  [data-theme="light"] .iki-panel { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-ptitle { border-bottom-color: rgba(0,0,0,.08); }
  [data-theme="light"] .iki-ptitle .sum { color: #6B7280; }
  [data-theme="light"] .iki-prow { border-top-color: rgba(0,0,0,.07); }
  [data-theme="light"] .iki-phead { background: #F3F4F6; color: #6B7280; }
  [data-theme="light"] .iki-prow:not(.iki-phead):hover { background: #EEF4FB; }
  [data-theme="light"] .iki-plipat { color: #6B7280; }
  [data-theme="light"] .iki-plipat:hover { background: #F3F4F6; color: #0F0F12; }
  [data-theme="light"] .iki-ptxt .jab { color: #0F0F12; }
  [data-theme="light"] .iki-ptxt .nm, [data-theme="light"] .iki-ptxt .nip { color: #6B7280; }
  [data-theme="light"] .iki-prow.hantu .jab { color: #6B7280; }
  [data-theme="light"] .iki-prow.hantu .nm { color: #9aa3af; }
  [data-theme="light"] .iki-pdok { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-pdok:hover { border-color: #8B5CF6; background: #EDE9FE; }
  [data-theme="light"] .iki-pcell.on .iki-pdok { border-color: #7C5CFC; background: rgba(124,92,252,0.1); }
  [data-theme="light"] .iki-prhk { color: #0F8A63; }
  [data-theme="light"] .iki-pbuat { border-color: rgba(0,0,0,.2); color: #6B7280; }
  [data-theme="light"] .iki-pbuat:hover:not(:disabled) { color: #0F0F12; border-color: #8B5CF6; }
  [data-theme="light"] .iki-psalin { background: #EDE7FE; border-color: rgba(124,92,252,.55); color: #5B21B6; }
  [data-theme="light"] .iki-psalin:hover:not(:disabled) { background: #E2D8FC; color: #5B21B6; }
  [data-theme="light"] .iki-pstrip { color: #9aa3af; }
  [data-theme="light"] .iki-plepas { color: #B26B00; background: rgba(178,107,0,.06); border-top-color: rgba(0,0,0,.08); }
  [data-theme="light"] .iki-card { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-card:hover { border-color: #8B5CF6; box-shadow: 0 12px 28px rgba(15,15,18,.12); }
  [data-theme="light"] .iki-card.selected { border-color: #7C5CFC; box-shadow: 0 0 0 2px rgba(124,92,252,.3); }
  [data-theme="light"] .iki-selbar { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-selbar > span:first-child { color: #0F0F12; }
  [data-theme="light"] .iki-sellink { color: #6B7280; }
  [data-theme="light"] .iki-sellink:hover { color: #0F0F12; }
  [data-theme="light"] .iki-check { border-color: rgba(0,0,0,.2); background: #F3F4F6; }
  [data-theme="light"] .iki-check.on { background: #7C5CFC; border-color: #7C5CFC; }
  [data-theme="light"] .iki-searchbox, [data-theme="light"] .iki-viewtoggle { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .iki-searchbox input { color: #0F0F12; }
  [data-theme="light"] .iki-searchbox input::placeholder { color: #9aa3af; }
  [data-theme="light"] .iki-viewtoggle button { color: #6B7280; }
  [data-theme="light"] .iki-viewtoggle button.on { background: #185FA5; color: #fff; }
  [data-theme="light"] .iki-avatar { background: rgba(178,107,0,.12); color: #B26B00; }
  [data-theme="light"] .iki-avatar.dir { background: rgba(15,138,99,.12); color: #0F8A63; }
  [data-theme="light"] .iki-cnip { color: #6B7280; }
  [data-theme="light"] .iki-card-foot { border-top-color: rgba(0,0,0,.08); }
  [data-theme="light"] .iki-card-jabatan { color: #0F0F12; }
  [data-theme="light"] .iki-card-nama { color: #4B5563; }
  [data-theme="light"] .iki-act { background: #F3F4F6; border-color: rgba(0,0,0,.1); color: #4B5563; }
  [data-theme="light"] .iki-act:hover { border-color: #8B5CF6; color: #0F0F12; background: #EDE9FE; }
  [data-theme="light"] .iki-act.locked, [data-theme="light"] .iki-act.locked:hover { background: none; border-color: transparent; color: #9aa3af; }
  [data-theme="light"] .iki-empty p { color: #374151; }
  [data-theme="light"] .iki-modal { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .iki-field, [data-theme="light"] .iki-hint { color: #6B7280; }
  [data-theme="light"] .iki-suggest-hint { color: #0F8A63; }
  [data-theme="light"] .iki-field input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-tpl-opt { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .iki-badge.custom { background: #E0EDFB; color: #1E5FA5; border-color: rgba(55,138,221,.45); }
  [data-theme="light"] .iki-field select, [data-theme="light"] .iki-tpl-kelola input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-tpl-kelola { color: #6B7280; }
  [data-theme="light"] .iki-tpl-kelola button { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .iki-tpl-kelola button.bahaya { color: #DC2626; }
  [data-theme="light"] .iki-tpl-opt b { color: #111827; }
  [data-theme="light"] .iki-tpl-opt span { color: #6B7280; }
  [data-theme="light"] .iki-tpl-opt.on { border-color: #7C5CFC; background: rgba(124,92,252,0.1); }
  [data-theme="light"] .iki-tpl-opt.on b { color: #6D28D9; }
  [data-theme="light"] .iki-list-body .btn-prima { border-color: rgba(15,15,18,.18); }
  [data-theme="light"] .iki-list-body .btn-prima[data-variant="purple"] { background: #EDE7FE; border-color: rgba(124,92,252,.55); color: #5B21B6; }
  [data-theme="light"] .iki-list-body .btn-prima[data-variant="purple"]:hover:not(:disabled) { background: #E2D8FC; }
`;
