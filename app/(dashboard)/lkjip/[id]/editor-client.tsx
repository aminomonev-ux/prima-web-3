'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  Download, CornerDownRight, Plus, ChevronUp, ChevronDown,
  IndentIncrease, IndentDecrease, Pencil, Save, Table2, Image as ImageIcon, Type, Settings,
  BookText, LayoutGrid, CheckCircle2, History, RotateCcw, Download as DownloadIcon,
  GripVertical, Upload, BarChart3, HelpCircle, MoreVertical, Lock, RefreshCw,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from 'recharts';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteIcon from '@/components/ui/DeleteIcon';
import { confirmDialog, pilihDialog } from '@/components/ui/ConfirmDialog';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import type { LkjipDetail } from '@/lib/lkjip/data';
import { nomorObjek, type SectionNode, type BlockNode, type JenisObjek } from '@/lib/lkjip/numbering';
import type { VersiMeta } from '@/lib/lkjip/versi';
import SpandukBeku from '@/components/ui/SpandukBeku';
import type { InfoBeku } from '@/lib/security/beku';
import { FONT_CHOICES } from '@/lib/lkjip/style-constants';
import type { StyleConfig } from '@/lib/lkjip/schemas';
import { putusanPindah, putusanHapus, type BagianRingkas, type Putusan } from '@/lib/lkjip/aturan-bab';
import { normalizeRows, angkaSel } from '@/lib/lkjip/tabel';
import { sidikGrafik } from '@/lib/lkjip/tautan';
import { kumpulkanTabelTertaut, kumpulkanNarasiTertaut, kumpulkanSelGalat, periksaSemua, type HasilPeriksa, type ItemPeriksa } from '@/lib/lkjip/kesegaran';
import type { ResepAngka } from '@/lib/lkjip/angka';
import { fetchJson } from '@/lib/shared/api';
import TabelEditor from './TabelEditor';

const TiptapNarasi = dynamic(() => import('./TiptapNarasi'), {
  ssr: false,
  loading: () => <div style={{ color: '#85B7EB', fontSize: 12.5, padding: 10 }}>Memuat editor…</div>,
});

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialDetail: LkjipDetail;
  /** P5 — keterangan pembekuan, diselesaikan di page.tsx. */
  beku: InfoBeku;
}

type FlatNode = { node: SectionNode; parentId: number | null; index: number; siblings: SectionNode[] };
type Tujuan = { parent: number | null; index: number };

/** Ringkasan blok yang ikut hilang bersama bagiannya — ditulis di dialog Hapus. */
function ringkasIsi(blocks: BlockNode[]): string {
  const jumlah: Record<BlockNode['tipe'], number> = { NARASI: 0, TABEL: 0, GAMBAR: 0, GRAFIK: 0 };
  for (const b of blocks) jumlah[b.tipe]++;
  const daftar = ([['narasi', jumlah.NARASI], ['tabel', jumlah.TABEL], ['gambar', jumlah.GAMBAR], ['grafik', jumlah.GRAFIK]] as const)
    .filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  return daftar.length ? `Ikut terhapus: ${daftar.join(', ')}.` : 'Bagian ini belum berisi blok.';
}

function flatten(tree: SectionNode[]): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (arr: SectionNode[], parentId: number | null) => {
    arr.forEach((node, index) => {
      out.push({ node, parentId, index, siblings: arr });
      walk(node.children, node.id);
    });
  };
  walk(tree, null);
  return out;
}

function fmtDate(s: string): string {
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return s;
  const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${bln[d.getMonth()]} ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function EditorClient({ initialDetail, username, role, themePreference, beku }: Props) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const [detail, setDetail] = useState<LkjipDetail>(initialDetail);
  const [selectedId, setSelectedId] = useState<number | null>(initialDetail.tree[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [addModal, setAddModal] = useState<{ parentId: number | null; label: string } | null>(null);
  const [addJudul, setAddJudul] = useState('');
  const [renameModal, setRenameModal] = useState<{ id: number; judul: string } | null>(null);
  const [styleModal, setStyleModal] = useState(false);
  const [styleForm, setStyleForm] = useState<StyleConfig>(initialDetail.style_config);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versiList, setVersiList] = useState<VersiMeta[]>([]);
  const [panduanOpen, setPanduanOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; f: FlatNode } | null>(null);

  const readOnly = detail.status === 'FINAL';
  const flat = useMemo(() => flatten(detail.tree), [detail.tree]);
  // Nomor Tabel/Gambar/Grafik = fungsi yang sama dengan cache field SEQ di Word (§12.4).
  const nomorBlok = useMemo(() => nomorObjek(detail.tree), [detail.tree]);
  // B12: aturan BAB dinilai dengan fungsi yang SAMA dengan pagar di lib/lkjip/data.ts.
  const bagian = useMemo<BagianRingkas[]>(
    () => flat.map(f => ({ id: f.node.id, parent_id: f.parentId, urutan: f.node.urutan, locked: f.node.locked })),
    [flat],
  );
  const selected = useMemo(() => flat.find(f => f.node.id === selectedId)?.node ?? null, [flat, selectedId]);
  // Tabel & angka sebaris tertaut se-dokumen, dari isi yang TERSIMPAN (sama dengan yang akan difinalkan & dicetak).
  const tertaut = useMemo(() => kumpulkanTabelTertaut(flat.map(f => f.node)), [flat]);
  const narasiTertaut = useMemo(() => kumpulkanNarasiTertaut(flat.map(f => f.node)), [flat]);
  const semuaTertaut = useMemo<ItemPeriksa[]>(() => [...tertaut, ...narasiTertaut], [tertaut, narasiTertaut]);
  const [periksa, setPeriksa] = useState<{ daftar: ItemPeriksa[]; hasil: HasilPeriksa[] | null } | null>(null);
  const [sorotBlok, setSorotBlok] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/lkjip/${detail.id}`);
      const json = await res.json();
      if (json.ok) setDetail(json.dokumen);
    } catch { /* silent */ }
  }, [detail.id]);

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.msg ?? 'Operasi gagal'); return false; }
      return true;
    } catch { toast.error('Gagal terhubung ke server'); return false; }
    finally { setBusy(false); }
  }

  // ── Section ops ──
  async function submitAdd() {
    if (!addModal || !addJudul.trim()) return;
    const ok = await call('/api/lkjip/section', 'POST', { dokumen_id: detail.id, parent_id: addModal.parentId, judul: addJudul.trim() });
    if (ok) { setAddModal(null); setAddJudul(''); await refresh(); toast.success('Section ditambahkan'); }
  }
  async function submitRename() {
    if (!renameModal || !renameModal.judul.trim()) return;
    const ok = await call('/api/lkjip/section', 'PATCH', { action: 'rename', id: renameModal.id, judul: renameModal.judul.trim() });
    if (ok) { setRenameModal(null); await refresh(); }
  }
  async function delSection(f: FlatNode) {
    if (!(await confirmDialog({ title: 'Hapus bagian', message: `Hapus "${f.node.nomor} ${f.node.judul}"?\n\n${ringkasIsi(f.node.blocks)}`, variant: 'danger' }))) return;
    const ok = await call(`/api/lkjip/section?id=${f.node.id}`, 'DELETE');
    if (ok) { if (selectedId === f.node.id) setSelectedId(null); await refresh(); }
  }
  async function move(id: number, newParentId: number | null, newIndex: number) {
    const ok = await call('/api/lkjip/section', 'PATCH', { action: 'move', id, new_parent_id: newParentId, new_index: newIndex });
    if (ok) await refresh();
  }
  // Tujuan tiap aksi pindah — dipakai untuk MENGIRIM dan untuk MENILAI (putusanPindah),
  // jadi tombol yang menyala pasti mengirim pindah yang diterima server.
  const tujuanNaik    = (f: FlatNode): Tujuan | null => (f.index > 0 ? { parent: f.parentId, index: f.index - 1 } : null);
  const tujuanTurun   = (f: FlatNode): Tujuan | null => (f.index < f.siblings.length - 1 ? { parent: f.parentId, index: f.index + 1 } : null);
  const tujuanIndent  = (f: FlatNode): Tujuan | null => {
    if (f.index === 0) return null;
    const prev = f.siblings[f.index - 1];
    return { parent: prev.id, index: prev.children.length };
  };
  const tujuanOutdent = (f: FlatNode): Tujuan | null => {
    if (f.parentId == null) return null;
    const parentFlat = flat.find(x => x.node.id === f.parentId);
    return parentFlat ? { parent: parentFlat.parentId, index: parentFlat.index + 1 } : null;
  };
  const putusanTujuan = (f: FlatNode, t: Tujuan | null): Putusan | null =>
    t ? putusanPindah(bagian, f.node.id, t.parent, t.index) : null;
  function pindahKe(f: FlatNode, t: Tujuan | null) { if (t) void move(f.node.id, t.parent, t.index); }

  // ── Block ops ──
  async function addBlock(tipe: 'NARASI' | 'TABEL' | 'GAMBAR' | 'GRAFIK') {
    if (!selected) return;
    const payload =
      tipe === 'NARASI' ? { html: '' }
      : tipe === 'TABEL' ? { judul: '', kolom: ['Kolom 1', 'Kolom 2'], align: ['left', 'left'], headerRows: 1, rows: [[{ v: 'Kolom 1' }, { v: 'Kolom 2' }], [{ v: '' }, { v: '' }]] }
      : tipe === 'GRAFIK' ? { judul: '', chartType: 'bar', source: 'manual', data: [{ label: 'Kategori 1', value: 10 }, { label: 'Kategori 2', value: 20 }, { label: 'Kategori 3', value: 15 }], tabelBlockId: null, labelCol: 0, valueCol: 1, imageFileId: '', caption: '' }
      : { judul: '', fileId: '', caption: '' };
    const ok = await call('/api/lkjip/block', 'POST', { section_id: selected.id, tipe, payload });
    if (ok) await refresh();
  }
  // Paste gambar dari clipboard (Ctrl+V) → unggah ke Drive → blok GAMBAR baru di section terpilih.
  async function pasteImageBlock(e: React.ClipboardEvent) {
    if (readOnly || !selected) return;
    const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
    const imgItem = items.find(it => it.kind === 'file' && it.type.startsWith('image/'));
    const file = imgItem?.getAsFile();
    if (!file) return;
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('file', file, file.name || 'tempel.png');
      fd.append('modul', 'lkjip');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.ok && json.fileId) {
        const ok = await call('/api/lkjip/block', 'POST', { section_id: selected.id, tipe: 'GAMBAR', payload: { judul: '', fileId: json.fileId, caption: '' } });
        if (ok) { await refresh(); toast.success('Gambar ditempel sebagai blok'); }
      } else toast.error(json.msg ?? 'Gagal mengunggah gambar tempel');
    } catch { toast.error('Gagal terhubung ke server'); }
  }
  async function saveBlock(id: number, payload: unknown) {
    const ok = await call('/api/lkjip/block', 'PATCH', { id, payload });
    if (ok) { await refresh(); toast.success('Blok disimpan'); }
  }
  async function delBlock(id: number) {
    if (!(await confirmDialog({ title: 'Hapus blok', message: 'Hapus blok ini?', variant: 'danger' }))) return;
    const ok = await call(`/api/lkjip/block?id=${id}`, 'DELETE');
    if (ok) await refresh();
  }
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  async function reorderBlocks(sectionId: number, order: number[]) {
    const ok = await call('/api/lkjip/block', 'PATCH', { action: 'reorder', section_id: sectionId, order });
    if (ok) await refresh();
  }

  async function saveVersi() {
    setBusy(true);
    try {
      const res = await fetch(`/api/lkjip/${detail.id}/versi`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.ok) { toast.error(json.msg ?? 'Gagal menyimpan versi'); return; }
      const drive = json.driveConfigured ? (json.driveArchived ? ' + arsip Drive' : ' · Drive dilewati') : '';
      toast.success(`Versi ${json.versi_no} tersimpan${drive}`);
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBusy(false); }
  }

  async function openHistory() {
    setHistoryOpen(true);
    try {
      const res = await fetch(`/api/lkjip/${detail.id}/versi`);
      const json = await res.json();
      if (json.ok) setVersiList(json.rows);
    } catch { toast.error('Gagal memuat riwayat'); }
  }

  async function restoreVersi(v: VersiMeta) {
    if (readOnly) { toast.error('Dokumen final tidak bisa dipulihkan.'); return; }
    if (!(await confirmDialog({ title: 'Pulihkan versi', message: `Pulihkan ke Versi ${v.versi_no}? Seluruh isi editor saat ini akan DIGANTI dengan snapshot versi ini.`, variant: 'warning', confirmLabel: 'Pulihkan' }))) return;
    const ok = await call(`/api/lkjip/${detail.id}/versi/${v.id}/restore`, 'POST', { expected_version: detail.version });
    if (ok) { setHistoryOpen(false); setSelectedId(null); await refresh(); toast.success(`Dipulihkan ke versi ${v.versi_no}`); }
  }

  async function saveStyle() {
    const ok = await call(`/api/lkjip/${detail.id}`, 'PATCH', { expected_version: detail.version, style_config: styleForm });
    if (ok) { setStyleModal(false); await refresh(); toast.success('Pengaturan dokumen disimpan'); }
  }

  // ── Tabel & angka tertaut: periksa kesegaran (hanya membaca; memperbarui lewat tombol di bloknya) ──
  async function jalankanPeriksa(): Promise<HasilPeriksa[]> {
    const { DAFTAR_SUMBER } = await import('@/lib/lkjip/sumber');
    return periksaSemua(tertaut, narasiTertaut, (sumber, setelan) => DAFTAR_SUMBER[sumber].tarik(setelan, url => fetchJson<unknown>(url), detail.tahun));
  }
  async function bukaPeriksa() {
    if (!semuaTertaut.length) { toast.info('Dokumen ini belum punya tabel atau angka yang tertaut ke modul.'); return; }
    setPeriksa({ daftar: semuaTertaut, hasil: null });
    try { setPeriksa({ daftar: semuaTertaut, hasil: await jalankanPeriksa() }); }
    catch { setPeriksa(null); toast.error('Gagal memeriksa data modul. Coba lagi.'); }
  }
  function bukaTabel(t: ItemPeriksa) {
    setPeriksa(null); setSelectedId(t.sectionId); setSorotBlok(t.blockId);
    setTimeout(() => document.getElementById(`lk-blok-${t.blockId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    setTimeout(() => setSorotBlok(b => (b === t.blockId ? null : b)), 2600);
  }

  async function kirimFinal() {
    const ok = await call(`/api/lkjip/${detail.id}/finalize`, 'POST', { id: detail.id, expected_version: detail.version });
    if (ok) { await refresh(); toast.success('Dokumen difinalisasi'); }
  }
  async function finalize() {
    // E7: sel rumus galat dicetak "—" di Word — disebut SEKARANG, bukan ditemukan di dokumen yang sudah dicetak.
    const galat = kumpulkanSelGalat(flat.map(f => f.node));
    if (galat.length) {
      const jumlah = galat.reduce((n, t) => n + t.sel.length, 0);
      const daftar = galat.slice(0, 5).map(t => `• ${t.letak} — ${t.judul}: ${t.sel.slice(0, 6).join(', ')}${t.sel.length > 6 ? ', …' : ''}`).join('\n');
      const pilihan = await pilihDialog({
        title: 'Ada sel rumus yang tidak bisa dihitung',
        message: `${jumlah} sel rumus di ${galat.length} tabel galat (#ERR / #REF!) dan di Word dicetak "—":\n${daftar}${galat.length > 5 ? '\n• …' : ''}`,
        confirmLabel: 'Lihat dulu', altLabel: 'Tetap lanjut', variant: 'warning', altVariant: 'danger',
      });
      if (pilihan === 'utama') { bukaTabel(galat[0]); return; }
      if (pilihan !== 'lain') return;
    }
    // Dokumen FINAL tidak bisa diperbarui lagi — tabel & angka yang sudah tertinggal dari
    // sumbernya ditanyakan SEKARANG, bukan ditemukan sesudah dicetak.
    if (semuaTertaut.length) {
      const tunggu = toast.loading('Memeriksa data modul…');
      let hasil: HasilPeriksa[] = [];
      try { hasil = await jalankanPeriksa(); } catch { /* gagal memeriksa ≠ alasan menahan finalisasi */ } finally { toast.dismiss(tunggu); }
      const beda = hasil.filter(h => h.status !== 'sama');
      if (beda.length) {
        const nama = (id: number) => { const t = semuaTertaut.find(x => x.blockId === id); return t ? `${t.letak} — ${t.judul}` : 'Blok'; };
        const daftar = beda.slice(0, 5).map(h => `• ${nama(h.blockId)}: ${h.status === 'gagal' ? h.pesan : h.status === 'berubah' ? h.ringkas : ''}`).join('\n');
        const pilihan = await pilihDialog({
          title: 'Data modul belum sama dengan sumbernya',
          message: `${beda.length} dari ${semuaTertaut.length} blok tertaut (tabel/angka) berbeda dari modul sumbernya saat ini:\n${daftar}${beda.length > 5 ? '\n• …' : ''}\n\nSesudah final, tabel & angka tidak bisa diperbarui lagi.`,
          confirmLabel: 'Lihat & perbarui dulu', altLabel: 'Tetap finalisasi', variant: 'warning', altVariant: 'danger',
        });
        if (pilihan === 'utama') { setPeriksa({ daftar: semuaTertaut, hasil }); return; }
        if (pilihan === 'lain') await kirimFinal();
        return;
      }
    }
    if (!(await confirmDialog({ title: 'Finalisasi dokumen', message: 'Dokumen akan dikunci dan tidak bisa diubah lagi. Lanjutkan?', variant: 'warning', confirmLabel: 'Finalisasi' }))) return;
    await kirimFinal();
  }

  const dockActions = readOnly
    ? [
        { icon: <Download size={17} />, label: 'Unduh Word', onClick: () => window.open(`/api/lkjip/${detail.id}/generate`, '_blank') },
        { icon: <History size={17} />, label: 'Riwayat', onClick: () => void openHistory() },
        { icon: <HelpCircle size={17} />, label: 'Panduan', onClick: () => setPanduanOpen(true) },
      ]
    : [
        { icon: <Save size={17} />, label: 'Simpan Versi', onClick: () => void saveVersi() },
        { icon: <History size={17} />, label: 'Riwayat', onClick: () => void openHistory() },
        ...(semuaTertaut.length ? [{ icon: <RefreshCw size={17} />, label: 'Periksa Data Modul', onClick: () => void bukaPeriksa() }] : []),
        { icon: <Settings size={17} />, label: 'Pengaturan', onClick: () => { setStyleForm(detail.style_config); setStyleModal(true); } },
        { icon: <Download size={17} />, label: 'Unduh Word', onClick: () => window.open(`/api/lkjip/${detail.id}/generate`, '_blank') },
        { icon: <CheckCircle2 size={17} />, label: 'Finalisasi', onClick: () => void finalize() },
        { icon: <HelpCircle size={17} />, label: 'Panduan', onClick: () => setPanduanOpen(true) },
      ];

  return (
    <div className={`lk-ed-body${isLight ? ' light' : ''}`}>
      <style>{ED_CSS}</style>

      {/* Topbar */}
      <header className="lk-ed-top">
        <div className="lk-ed-title">
          <BookText size={17} /> <span className="lk-ed-judul">{detail.judul}</span>
          <span className={`lk-badge ${readOnly ? 'final' : 'draft'}`}>{detail.status}</span>
        </div>
        <div className="lk-ed-topright">
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      {/* P5 — di atas kisi 3 panel, bukan di dalam panel tengah: panel itu KOSONG
          sampai sebuah bab dipilih, jadi spanduk di sana tidak terlihat saat editor
          baru dibuka. `flexShrink` 0 supaya tidak diperas oleh kisi yang `flex:1`. */}
      {beku.beku && (
        <div style={{ flexShrink: 0, padding: '12px 18px 0' }}><SpandukBeku {...beku}/></div>
      )}

      <div className="lk-ed-grid">
        {/* Outline tree */}
        <aside className="lk-tree" data-rima="lkjip.editor-tree">
          <div className="lk-tree-head">Kerangka</div>
          <div className="lk-tree-list">
            {flat.map(f => (
              <div
                key={f.node.id}
                className={`lk-node${selectedId === f.node.id ? ' active' : ''}`}
                style={{ paddingLeft: 8 + f.node.depth * 14 }}
                onClick={() => setSelectedId(f.node.id)}
              >
                <span className="lk-node-num">{f.node.nomor}</span>
                {f.node.locked ? (
                  <span className="lk-node-lock" data-tooltip="BAB wajib — tidak bisa dipindah, judulnya boleh diubah" data-tooltip-pos="right"><Lock size={11} /></span>
                ) : null}
                <span className="lk-node-judul">{f.node.judul}</span>
                <span className="lk-node-dot">{f.node.blocks.length > 0 ? '●' : '○'}</span>
                {!readOnly && (
                  <button className="lk-node-kebab" data-tooltip="Aksi bagian" data-tooltip-pos="left"
                    onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setRowMenu({ x: r.right + 4, y: r.top, f }); }}>
                    <MoreVertical size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <div className="lk-tree-foot" data-rima="lkjip.editor-tambah-bab">
              <PrimaButton variant="purple" size="sm" iconLeft={<Plus size={14} />} onClick={() => { setAddModal({ parentId: null, label: 'Bab baru' }); setAddJudul(''); }}>Tambah Bab</PrimaButton>
            </div>
          )}
        </aside>

        {/* Section editor */}
        <main className="lk-editor" data-rima="lkjip.editor-blok" onPaste={pasteImageBlock}>
          {!selected ? (
            <div className="lk-editor-empty">Pilih bab/sub-bab di kiri untuk mengisi.</div>
          ) : (
            <>
              <div className="lk-editor-head">
                <span className="lk-editor-num">{selected.nomor}</span> {selected.judul}
              </div>
              {selected.blocks.length === 0 && <div className="lk-noblock">Belum ada blok. Tambah blok di bawah.</div>}
              {selected.blocks.map((b, idx) => (
                <div key={b.id} id={`lk-blok-${b.id}`} className={`lk-block-wrap${dragIdx !== null ? ' dragmode' : ''}${dragIdx === idx ? ' dragging' : ''}${sorotBlok === b.id ? ' sorot' : ''}`}
                  onDragOver={e => { if (dragIdx !== null && dragIdx !== idx) e.preventDefault(); }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); return; }
                    const ids = selected.blocks.map(x => x.id);
                    const [moved] = ids.splice(dragIdx, 1);
                    ids.splice(idx, 0, moved);
                    setDragIdx(null);
                    void reorderBlocks(selected.id, ids);
                  }}>
                  <BlockEditor block={b} readOnly={readOnly} tahunDokumen={detail.tahun} warnaKepalaTabel={detail.style_config.tableHeaderFill} onSave={p => saveBlock(b.id, p)} onDelete={() => delBlock(b.id)} tableBlocks={selected.blocks.filter(x => x.tipe === 'TABEL')}
                    nomor={nomorBlok.get(b.id)} nomorBlok={nomorBlok}
                    dragHandle={!readOnly && (
                      <button className="lk-block-grip" draggable data-tooltip="Seret untuk pindah blok" data-tooltip-pos="below"
                        onDragStart={e => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => setDragIdx(null)}><GripVertical size={14} /></button>
                    )} />
                </div>
              ))}
              {!readOnly && (
                <div className="lk-addblock" data-rima="lkjip.editor-addblock">
                  <span>+ Tambah blok:</span>
                  <button className="lk-ab narasi" onClick={() => addBlock('NARASI')}><Type size={14} /> Narasi</button>
                  <button className="lk-ab tabel" onClick={() => addBlock('TABEL')}><Table2 size={14} /> Tabel</button>
                  <button className="lk-ab gambar" onClick={() => addBlock('GAMBAR')}><ImageIcon size={14} /> Gambar</button>
                  <button className="lk-ab grafik" onClick={() => addBlock('GRAFIK')}><BarChart3 size={14} /> Grafik</button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Add modal */}
      {addModal && (
        <div className="lk-modal-bg" onClick={() => !busy && setAddModal(null)}>
          <div className="lk-modal" onClick={e => e.stopPropagation()}>
            <h3>Tambah Section</h3>
            <p className="lk-hint">Posisi: {addModal.label}</p>
            <input autoFocus value={addJudul} placeholder="Judul section" onChange={e => setAddJudul(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitAdd()} />
            <div className="lk-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setAddModal(null)} disabled={busy}>Batal</PrimaButton>
              <PrimaButton variant="purple" size="sm" onClick={submitAdd} disabled={busy || !addJudul.trim()}>Tambah</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Periksa tabel & angka tertaut */}
      {periksa && (
        <div className="lk-modal-bg" onClick={() => setPeriksa(null)}>
          <div className="lk-modal lk-modal-wide" role="dialog" aria-label="Periksa data modul" onClick={e => e.stopPropagation()}>
            <h3>Periksa Data Modul</h3>
            <p className="lk-hint">Tabel dan angka tertaut yang sudah tersimpan dibandingkan dengan modul sumbernya sekarang. Tidak ada yang diubah — buka bloknya lalu tekan <b>Perbarui</b> (tabel) atau <b>Perbarui angka</b> (narasi).</p>
            {!periksa.hasil ? (
              <div className="lk-hint">Menarik data sumber…</div>
            ) : (
              <ul className="lk-periksa">
                {periksa.daftar.map(t => {
                  const h = periksa.hasil!.find(x => x.blockId === t.blockId);
                  return (
                    <li key={t.blockId} className={h?.status}>
                      <div className="lk-periksa-info">
                        <b>{t.judul}</b>
                        <span>{t.letak} · {t.ringkas}</span>
                        <span className="lk-periksa-status">
                          {h?.status === 'sama' ? 'Sudah sama dengan sumbernya.' : h?.status === 'berubah' ? `Berbeda: ${h.ringkas}.` : h?.pesan}
                        </span>
                      </div>
                      <button onClick={() => bukaTabel(t)}>Buka</button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="lk-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setPeriksa(null)}>Tutup</PrimaButton>
              <PrimaButton variant="purple" size="sm" iconLeft={<RefreshCw size={14} />} disabled={!periksa.hasil} onClick={() => void bukaPeriksa()}>Periksa Ulang</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Rename modal */}
      {renameModal && (
        <div className="lk-modal-bg" onClick={() => !busy && setRenameModal(null)}>
          <div className="lk-modal" onClick={e => e.stopPropagation()}>
            <h3>Ubah Judul</h3>
            <input autoFocus value={renameModal.judul} onChange={e => setRenameModal({ ...renameModal, judul: e.target.value })} onKeyDown={e => e.key === 'Enter' && submitRename()} />
            <div className="lk-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setRenameModal(null)} disabled={busy}>Batal</PrimaButton>
              <PrimaButton menulis variant="primary" size="sm" onClick={submitRename} disabled={busy || !renameModal.judul.trim()}>Simpan</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Pengaturan Dokumen */}
      {styleModal && (
        <div className="lk-modal-bg" onClick={() => !busy && setStyleModal(false)}>
          <div className="lk-modal" onClick={e => e.stopPropagation()}>
            <h3>Pengaturan Dokumen</h3>
            <p className="lk-hint">Berlaku ke seluruh paragraf di Word (font, ukuran, spasi, perataan).</p>
            <div className="lk-sf">
              <label>Font
                <select value={styleForm.fontFamily} onChange={e => setStyleForm({ ...styleForm, fontFamily: e.target.value as StyleConfig['fontFamily'] })}>
                  {FONT_CHOICES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label>Ukuran
                <select value={styleForm.fontSizePt} onChange={e => setStyleForm({ ...styleForm, fontSizePt: Number(e.target.value) })}>
                  {[11, 12, 13].map(s => <option key={s} value={s}>{s} pt</option>)}
                </select>
              </label>
              <label>Spasi baris
                <select value={styleForm.lineSpacing} onChange={e => setStyleForm({ ...styleForm, lineSpacing: Number(e.target.value) })}>
                  {[1, 1.15, 1.5, 2].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Perataan
                <select value={styleForm.align} onChange={e => setStyleForm({ ...styleForm, align: e.target.value as StyleConfig['align'] })}>
                  <option value="both">Justify</option>
                  <option value="left">Kiri</option>
                </select>
              </label>
              <label>Jarak antar-paragraf
                <select value={styleForm.spaceAfterPt} onChange={e => setStyleForm({ ...styleForm, spaceAfterPt: Number(e.target.value) })}>
                  {[0, 6, 12].map(s => <option key={s} value={s}>{s} pt</option>)}
                </select>
              </label>
              <label>Indent baris pertama
                <select value={styleForm.firstLineIndentCm} onChange={e => setStyleForm({ ...styleForm, firstLineIndentCm: Number(e.target.value) })}>
                  <option value={0}>Tanpa</option>
                  <option value={1}>1 cm</option>
                  <option value={1.27}>1,27 cm (default)</option>
                  <option value={1.5}>1,5 cm</option>
                </select>
              </label>
              <label>Nomor halaman
                <select value={styleForm.pageNumber ? '1' : '0'} onChange={e => setStyleForm({ ...styleForm, pageNumber: e.target.value === '1' })}>
                  <option value="1">Aktif</option>
                  <option value="0">Nonaktif</option>
                </select>
              </label>
              <label>Penomoran depan
                <select value={styleForm.romanFront ? '1' : '0'} disabled={!styleForm.pageNumber} onChange={e => setStyleForm({ ...styleForm, romanFront: e.target.value === '1' })}>
                  <option value="1">Romawi (i, ii) lalu Arab (1, 2)</option>
                  <option value="0">Arab semua (1, 2, 3)</option>
                </select>
              </label>
              <label>Teks footer
                <input type="text" value={styleForm.footerText} maxLength={120} placeholder="mis. RSJD Dr. Amino Gondohutomo" disabled={!styleForm.pageNumber} onChange={e => setStyleForm({ ...styleForm, footerText: e.target.value })} />
              </label>
              <label>Warna header tabel
                <select value={styleForm.tableHeaderFill} onChange={e => setStyleForm({ ...styleForm, tableHeaderFill: e.target.value })}>
                  <option value="EDEDED">Abu-abu</option>
                  <option value="F6B26B">Oranye</option>
                  <option value="D9D9D9">Abu tua</option>
                  <option value="DDEBF7">Biru muda</option>
                  <option value="E2EFDA">Hijau muda</option>
                  <option value="FFF2CC">Kuning muda</option>
                </select>
              </label>
            </div>

            <div className="lk-sf-divider">Kata Pengantar &amp; Tanda Tangan (opsional — tampil setelah cover, sebelum Daftar Isi)</div>
            <textarea className="lk-kp-text" rows={6} placeholder="Tulis kata pengantar — satu paragraf per baris…"
              value={kpHtmlToText(styleForm.kataPengantarHtml)}
              onChange={e => setStyleForm({ ...styleForm, kataPengantarHtml: kpTextToHtml(e.target.value) })} />
            <div className="lk-sf">
              <label>Tempat &amp; tanggal
                <input type="text" value={styleForm.ttdTempatTanggal} maxLength={120} placeholder="mis. Semarang, 20 Februari 2026" onChange={e => setStyleForm({ ...styleForm, ttdTempatTanggal: e.target.value })} />
              </label>
              <label>Nama penanda tangan
                <input type="text" value={styleForm.ttdNama} maxLength={120} placeholder="mis. dr. ALEK JUSRAN, M.Kes" onChange={e => setStyleForm({ ...styleForm, ttdNama: e.target.value })} />
              </label>
              <label>Pangkat
                <input type="text" value={styleForm.ttdPangkat} maxLength={120} placeholder="mis. Pembina Utama Muda" onChange={e => setStyleForm({ ...styleForm, ttdPangkat: e.target.value })} />
              </label>
              <label>NIP
                <input type="text" value={styleForm.ttdNip} maxLength={60} placeholder="mis. NIP. 19690211 200701 1 007" onChange={e => setStyleForm({ ...styleForm, ttdNip: e.target.value })} />
              </label>
            </div>
            <label className="lk-sf-full">Jabatan (boleh 2 baris — pisahkan dgn Enter)
              <textarea className="lk-kp-text" rows={2} maxLength={300} placeholder={'DIREKTUR RSJD dr. AMINO GONDOHUTOMO\nPROVINSI JAWA TENGAH'}
                value={styleForm.ttdJabatan} onChange={e => setStyleForm({ ...styleForm, ttdJabatan: e.target.value })} />
            </label>

            <div className="lk-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setStyleModal(false)} disabled={busy}>Batal</PrimaButton>
              <PrimaButton menulis variant="primary" size="sm" onClick={saveStyle} disabled={busy}>Simpan</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Riwayat versi */}
      {historyOpen && (
        <div className="lk-modal-bg" onClick={() => setHistoryOpen(false)}>
          <div className="lk-modal lk-modal-wide" onClick={e => e.stopPropagation()}>
            <h3>Riwayat Versi</h3>
            <p className="lk-hint">Snapshot tersimpan (maks 20 terakhir). Pulihkan untuk mengganti isi editor dengan versi terpilih.</p>
            {versiList.length === 0 ? (
              <p className="lk-hint" style={{ textAlign: 'center', padding: '20px 0' }}>Belum ada versi. Klik <b>Simpan Versi</b> di dock untuk membuat checkpoint.</p>
            ) : (
              <div className="lk-versi-list">
                {versiList.map(v => (
                  <div key={v.id} className="lk-versi-row">
                    <div className="lk-versi-info">
                      <span className="lk-versi-no">Versi {v.versi_no}</span>
                      <span className="lk-versi-meta">{fmtDate(v.created_at)} · {v.created_by_name ?? '—'}{v.label ? ` · ${v.label}` : ''}{v.drive_file_id ? ' · ☁ Drive' : ''}</span>
                    </div>
                    <div className="lk-versi-acts">
                      {v.drive_file_id && (
                        <button className="lk-vact" data-tooltip="Unduh arsip Drive" data-tooltip-pos="above" onClick={() => window.open(`/api/upload/download?id=${v.drive_file_id}`, '_blank')}><DownloadIcon size={14} /></button>
                      )}
                      {!readOnly && (
                        <button className="lk-vact warn" data-tooltip="Pulihkan ke editor" data-tooltip-pos="above" onClick={() => restoreVersi(v)}><RotateCcw size={14} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="lk-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setHistoryOpen(false)}>Tutup</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Menu aksi bagian (popover overlay) */}
      {rowMenu && (() => {
        const f = rowMenu.f;
        const close = () => setRowMenu(null);
        const run = (fn: () => void) => { fn(); close(); };
        // Tombol mati BESERTA sebabnya (data-tooltip). Pagarnya tetap di server (L82).
        const aksiPindah = (t: Tujuan | null) => {
          const p = putusanTujuan(f, t);
          return { disabled: !p || !p.boleh, alasan: p && !p.boleh ? p.alasan : undefined, onClick: () => run(() => pindahKe(f, t)) };
        };
        const pHapus = putusanHapus(bagian, f.node.id);
        const parentNomor = f.parentId == null ? '' : (flat.find(x => x.node.id === f.parentId)?.node.nomor ?? '');
        const items: RowMenuItem[] = [
          { icon: <Pencil size={15} />, label: 'Ubah judul', onClick: () => run(() => setRenameModal({ id: f.node.id, judul: f.node.judul })) },
          { icon: <CornerDownRight size={15} />, label: 'Tambah sub-bab', onClick: () => run(() => { setAddModal({ parentId: f.node.id, label: `di akhir sub-bab ${f.node.nomor}` }); setAddJudul(''); }) },
          // Bagian baru selalu ditaruh DI AKHIR saudaranya (addSection) — bab baru otomatis
          // sesudah BAB wajib. Label lama "setelah ini" tidak pernah benar.
          { icon: <Plus size={15} />, label: f.parentId == null ? 'Tambah bab (di akhir)' : 'Tambah setingkat (di akhir)', onClick: () => run(() => { setAddModal({ parentId: f.parentId, label: f.parentId == null ? 'di akhir daftar bab' : `di akhir sub-bab ${parentNomor}` }); setAddJudul(''); }) },
          { icon: <ChevronUp size={15} />, label: 'Naik', ...aksiPindah(tujuanNaik(f)) },
          { icon: <ChevronDown size={15} />, label: 'Turun', ...aksiPindah(tujuanTurun(f)) },
          { icon: <IndentIncrease size={15} />, label: 'Jadikan sub-bab (indent)', ...aksiPindah(tujuanIndent(f)) },
          { icon: <IndentDecrease size={15} />, label: f.parentId == null ? 'Sudah di tingkat bab' : (f.node.depth === 1 ? 'Jadikan bab' : 'Naikkan satu tingkat'), ...aksiPindah(tujuanOutdent(f)) },
          { icon: <DeleteIcon size={15} />, label: 'Hapus bagian ini', danger: true, disabled: !pHapus.boleh, alasan: pHapus.boleh ? undefined : pHapus.alasan, onClick: () => run(() => delSection(f)) },
        ];
        return <RowMenu x={rowMenu.x} y={rowMenu.y} items={items} onClose={close} />;
      })()}

      {/* Panduan penggunaan */}
      {panduanOpen && (
        <div className="lk-modal-bg" onClick={() => setPanduanOpen(false)}>
          <div className="lk-modal lk-modal-wide lk-panduan" onClick={e => e.stopPropagation()}>
            <h3><HelpCircle size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />Panduan Penyusun LKJIP</h3>
            <p className="lk-hint">Langkah demi langkah memakai editor. Klik tiap bagian untuk membuka.</p>
            <div className="lk-pd-list">
              {PANDUAN.map((s, i) => (
                <details key={i} className="lk-pd-item" open={i === 0}>
                  <summary><span className="lk-pd-no">{i + 1}</span>{s.t}</summary>
                  <div className="lk-pd-body">{s.b}</div>
                </details>
              ))}
            </div>
            <div className="lk-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setPanduanOpen(false)}>Tutup</PrimaButton>
            </div>
          </div>
        </div>
      )}

      <FloatingDock isLight={isLight} limelight
        nav={[
          { icon: <BookText size={17} />, label: 'Daftar', onClick: () => router.push('/lkjip') },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => router.push('/menu') },
        ]}
        actions={dockActions}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Menu aksi bagian — popover (portal), anti-clip scroll, auto-flip
// ════════════════════════════════════════════════════════════════
type RowMenuItem = { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; alasan?: string };
function RowMenu({ x, y, items, onClose }: { x: number; y: number; items: RowMenuItem[]; onClose: () => void }) {
  const MW = 216, ITEM = 33, PAD = 7;
  const h = items.length * ITEM + PAD * 2;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = x + MW > vw - 8 ? Math.max(8, x - MW - 32) : x;       // flip ke kiri kalau mentok kanan
  const top = y + h > vh - 8 ? Math.max(8, vh - h - 8) : y;          // naik kalau mentok bawah
  return createPortal(
    <div className="lk-rowmenu-bg" onMouseDown={onClose}>
      <div className="lk-rowmenu" style={{ left, top, width: MW }} onMouseDown={e => e.stopPropagation()}>
        {items.map((it, i) => (
          <button key={i} type="button"
            className={`lk-rowmenu-item${it.danger ? ' danger' : ''}${it.disabled ? ' disabled' : ''}`}
            aria-disabled={it.disabled}
            data-tooltip={it.disabled ? it.alasan : undefined} data-tooltip-pos="right"
            onClick={() => { if (!it.disabled) it.onClick(); }}>
            <span className="lk-rowmenu-ic">{it.icon}</span>
            <span className="lk-rowmenu-lb">{it.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// ════════════════════════════════════════════════════════════════
// Panduan penggunaan (modal accordion) — step-by-step untuk penyusun
// ════════════════════════════════════════════════════════════════
const PANDUAN: { t: string; b: React.ReactNode }[] = [
  { t: 'Struktur Outline (panel kiri)', b: (
    <ol>
      <li>Panel kiri menampilkan pohon bab. <b>BAB I–IV wajib</b> (ikon gembok): tidak bisa dipindah atau dijadikan sub-bab, tapi <b>judulnya boleh diubah</b>.</li>
      <li><b>Klik</b> judul bab / sub-bab → isinya tampil di panel tengah untuk diedit.</li>
      <li>Semua aksi ada di tombol <b>⋮</b> di ujung kanan baris: <b>Ubah judul</b>, <b>Tambah sub-bab</b>, <b>Naik / Turun</b>, <b>Jadikan sub-bab</b> (mis. 1.3 → 1.2.1) atau <b>Jadikan bab</b>.</li>
      <li><b>Bab tambahan</b> (mis. LAMPIRAN) selalu berada <b>sesudah BAB IV</b>, supaya nomor BAB I–IV tidak bergeser. Sub-bab bebas diatur.</li>
      <li><b>Hapus</b>: bagian yang masih punya sub-bagian tidak bisa dihapus — hapus atau pindahkan sub-bagiannya dulu. Dialog hapus menyebut blok isi yang ikut terhapus.</li>
      <li>Aksi yang sedang tidak boleh tampil redup; arahkan kursor ke sana untuk membaca sebabnya.</li>
      <li>Nomor (1, 1.1, 1.1.1) <b>dihitung otomatis</b> — jangan diketik manual.</li>
    </ol>
  ) },
  { t: 'Menambah Blok Isi (panel tengah)', b: (
    <ol>
      <li>Pilih dulu bab-nya di panel kiri.</li>
      <li>Di atas area isi ada 4 tombol blok: <b>Narasi</b> (teks), <b>Tabel</b>, <b>Gambar</b>, <b>Grafik</b>.</li>
      <li>Klik salah satu → blok baru muncul di bawah.</li>
      <li><b>Pindah urutan</b>: seret ikon <b>grip</b> (titik-titik) di kiri header blok.</li>
      <li><b>Hapus blok</b>: klik ikon <b>tong sampah</b> di kanan header blok.</li>
    </ol>
  ) },
  { t: 'Menulis Narasi & Format Teks', b: (
    <ol>
      <li>Klik di dalam blok <b>Narasi</b> untuk mulai mengetik.</li>
      <li>Toolbar: <b>B</b> tebal, <b>I</b> miring, <b>U</b> garis bawah, <b>S</b> coret.</li>
      <li>Perataan: rata kiri / tengah / kanan / kiri-kanan (justify).</li>
      <li>Warna teks (kotak warna) dan ukuran huruf (<b>A±</b>).</li>
      <li>Sub-judul di dalam blok: tombol <b>H2</b> / <b>H3</b>.</li>
      <li><b>WAJIB</b> klik tombol <b>Simpan</b> (hijau, muncul di kanan bawah blok) — jika tidak, perubahan hilang.</li>
    </ol>
  ) },
  { t: 'Daftar Bernomor (1,2,3) & Huruf (a,b,c)', b: (
    <ol>
      <li>Letakkan kursor di satu baris, atau seleksi beberapa baris.</li>
      <li>Klik <b>1.</b> untuk angka, <b>a,b</b> untuk huruf, atau <b>•</b> untuk bullet.</li>
      <li><b>Enter</b> membuat item berikutnya; <b>Enter 2×</b> untuk keluar dari daftar.</li>
    </ol>
  ) },
  { t: '"Lanjut daftar" — daftar yang terputus tabel/gambar', b: (
    <>
      <p className="lk-pd-note">Masalah: bila satu daftar terpotong blok Tabel/Gambar, tiap blok mulai ulang dari 1 / a. Cara menyambungkannya:</p>
      <ol>
        <li>Buat daftar di <b>blok pertama</b> seperti biasa (jangan dicentang).</li>
        <li>Di tiap blok narasi <b>lanjutan</b> (setelah tabel/gambar), buat daftar dengan <b>jenis yang sama</b>.</li>
        <li>Centang <b>“Lanjut daftar”</b> di header blok lanjutan tersebut.</li>
        <li>Saat <b>Unduh Word</b>, nomor menyambung (1→2→3 / a→b→c) menyeberangi tabel/gambar.</li>
      </ol>
      <p className="lk-pd-note">Syarat: jenis daftar harus sama (angka dengan angka, huruf dengan huruf). Contoh nyata: §2.5 Instrumen Pendukung — 5 aplikasi bernomor <b>1–5</b> meski diselingi 5 gambar.</p>
    </>
  ) },
  { t: 'Tabel', b: (
    <ol>
      <li>Tambah blok <b>Tabel</b>.</li>
      <li>Baris paling atas adalah <b>kepala tabel</b> — ketik judul kolom di sana. Jumlah baris kepala (1–3) diatur di bilah alat; baris disisip/dibuang tepat di atas isi tabel.</li>
      <li>Seperti Excel: <b>seret</b> untuk memblok, panah/Tab/Enter untuk berpindah, langsung mengetik untuk menimpa, <b>F2</b>/dobel-klik untuk menyunting, <b>Esc</b> membatalkan.</li>
      <li><b>Delete</b> mengosongkan isi blok (formatnya tetap). Klik huruf kolom / nomor baris untuk memilih satu kolom/baris penuh, lalu <b>Sisip ▾ / Hapus ▾</b> (atau Ctrl+Shift+= / Ctrl+−) — sebanyak yang dipilih.</li>
      <li><b>Lebar kolom</b>: seret garis di antara huruf kolom (lebarnya tampil dalam cm); dobel-klik garis = paskan ke isi. Garis putus-putus = batas kertas.</li>
      <li><b>Menempel data dari Excel</b> didukung. Rumus (mis. <code>=A2+B2</code>) ikut bergeser saat baris/kolom disisip atau dihapus.</li>
    </ol>
  ) },
  { t: 'Gambar & Grafik', b: (
    <>
      <p className="lk-pd-note"><b>Gambar:</b></p>
      <ol>
        <li>Tambah blok <b>Gambar</b>.</li>
        <li>Unggah file gambar.</li>
        <li>Isi caption (otomatis bernomor “Gambar N”).</li>
      </ol>
      <p className="lk-pd-note"><b>Grafik:</b></p>
      <ol>
        <li>Tambah blok <b>Grafik</b>.</li>
        <li>Pilih jenis: <b>pie / bar / line</b>.</li>
        <li>Isi data manual, atau ambil otomatis dari blok <b>Tabel</b>.</li>
        <li>Isi caption (otomatis “Grafik N”).</li>
      </ol>
    </>
  ) },
  { t: 'Pengaturan Dokumen (ikon ⚙ di dock)', b: (
    <>
      <p className="lk-pd-note">Berlaku untuk <b>seluruh dokumen</b>:</p>
      <ul>
        <li>Font, ukuran, spasi baris, indent baris pertama, dan perataan.</li>
        <li>Kata Pengantar + blok tanda tangan.</li>
        <li>Warna header tabel.</li>
        <li>Nomor halaman dan teks footer.</li>
        <li>Angka romawi (i, ii) untuk halaman depan.</li>
      </ul>
    </>
  ) },
  { t: 'Simpan Versi & Riwayat', b: (
    <ol>
      <li><b>Simpan Versi</b> (dock) = membuat checkpoint seluruh dokumen (disimpan maks 20 terakhir + arsip Drive bila tersedia).</li>
      <li><b>Riwayat</b> (dock) → lihat daftar versi → <b>Pulihkan</b> untuk kembali ke versi lama.</li>
      <li>Beda dengan tombol <b>Simpan</b> di blok (hanya menyimpan 1 blok): Simpan Versi memotret seluruh dokumen.</li>
    </ol>
  ) },
  { t: 'Finalisasi & Unduh Word', b: (
    <ol>
      <li><b>Unduh Word</b> (dock) menghasilkan file .docx kapan saja.</li>
      <li>Buka di Microsoft Word → tekan <b>Ctrl+A lalu F9</b> (atau klik kanan → <b>Update Field</b>) agar Daftar Isi / Tabel / Gambar dan nomor halaman termuat.</li>
      <li><b>Finalisasi</b> mengunci dokumen menjadi status <b>FINAL</b> (tidak bisa diedit lagi) — lakukan hanya jika sudah benar-benar selesai.</li>
    </ol>
  ) },
];

// ════════════════════════════════════════════════════════════════
// Block editor — switch per tipe
// ════════════════════════════════════════════════════════════════
type NomorBlok = Map<number, { jenis: JenisObjek; nomor: number }>;
function BlockEditor({ block, readOnly, tahunDokumen, warnaKepalaTabel, onSave, onDelete, dragHandle, tableBlocks, nomor, nomorBlok }: { block: BlockNode; readOnly: boolean; tahunDokumen: number; warnaKepalaTabel?: string; onSave: (p: unknown) => void; onDelete: () => void; dragHandle?: React.ReactNode; tableBlocks?: BlockNode[]; nomor?: { jenis: JenisObjek; nomor: number }; nomorBlok?: NomorBlok }) {
  const [continueList, setContinueList] = useState<boolean>(block.tipe === 'NARASI' && (block.payload as { continueList?: boolean })?.continueList === true);
  return (
    <div className="lk-block">
      <div className="lk-block-head">
        <span className="lk-block-headl">{dragHandle}<span className="lk-block-tag">{block.tipe}</span>
          {nomor && <span className="lk-block-nomor">{nomor.jenis} {nomor.nomor}</span>}
          {block.tipe === 'NARASI' && !readOnly && (
            <label className="lk-block-cont" data-tooltip="Lanjutkan penomoran daftar (a,b,c / 1,2,3) dari blok narasi sebelumnya — untuk daftar yang terpotong tabel/gambar" data-tooltip-pos="below">
              <input type="checkbox" checked={continueList} onChange={e => { const v = e.target.checked; setContinueList(v); onSave({ ...(block.payload as object), continueList: v }); }} />
              Lanjut daftar
            </label>
          )}
        </span>
        {!readOnly && <button className="lk-block-del" data-tooltip="Hapus blok" data-tooltip-pos="below" onClick={onDelete}><DeleteIcon size={13} /></button>}
      </div>
      {block.tipe === 'NARASI' && (
        <TiptapNarasi initialHtml={(block.payload as { html?: string })?.html ?? ''} initialAngka={(block.payload as { angka?: Record<string, ResepAngka> })?.angka}
          tahunDokumen={tahunDokumen} readOnly={readOnly} onSave={(html, angka) => onSave({ html, continueList, angka })} />
      )}
      {block.tipe === 'TABEL'  && <TabelEditor block={block} readOnly={readOnly} tahunDokumen={tahunDokumen} warnaKepala={warnaKepalaTabel} onSave={onSave} />}
      {block.tipe === 'GAMBAR' && <GambarEditor block={block} readOnly={readOnly} onSave={onSave} />}
      {block.tipe === 'GRAFIK' && <GrafikEditor block={block} readOnly={readOnly} onSave={onSave} tableBlocks={tableBlocks ?? []} nomorBlok={nomorBlok} />}
    </div>
  );
}

function GambarEditor({ block, readOnly, onSave }: { block: BlockNode; readOnly: boolean; onSave: (p: unknown) => void }) {
  const p0 = block.payload as { judul?: string; fileId?: string; caption?: string };
  const [judul, setJudul] = useState(p0.judul ?? '');
  const [caption, setCaption] = useState(p0.caption ?? '');
  const [fileId, setFileId] = useState(p0.fileId ?? '');
  const [uploading, setUploading] = useState(false);
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('modul', 'lkjip');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.ok && json.fileId) { setFileId(json.fileId); toast.success('Gambar terunggah'); }
      else toast.error(json.msg ?? 'Gagal mengunggah gambar');
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setUploading(false); }
  };
  return (
    <div className="lk-gambar-ed">
      <input value={judul} readOnly={readOnly} placeholder="Judul gambar (tanpa nomor — nomor otomatis)" onChange={e => setJudul(e.target.value)} />
      <input value={caption} readOnly={readOnly} placeholder="Keterangan / caption" onChange={e => setCaption(e.target.value)} />
      {!readOnly && (
        <div className="lk-gambar-up">
          <label className="lk-upbtn">
            <Upload size={14} /> {uploading ? 'Mengunggah…' : (fileId ? 'Ganti gambar' : 'Pilih gambar')}
            <input type="file" accept="image/png,image/jpeg,image/gif" hidden disabled={uploading} onChange={onPick} />
          </label>
          {fileId
            ? <span className="lk-upok">✓ Gambar siap — tampil di Word</span>
            : <span className="lk-uphint">Belum ada gambar — placeholder di Word</span>}
        </div>
      )}
      {!readOnly && <div className="lk-save-row"><PrimaButton menulis variant="primary" size="sm" iconLeft={<Save size={14} />} onClick={() => onSave({ judul, caption, fileId })}>Simpan</PrimaButton></div>}
    </div>
  );
}

// ── Grafik (pie/bar/line) — recharts → PNG (html2canvas-pro) → embed Word ──
const GRAFIK_COLORS = ['#7C5CFC', '#EF9F27', '#1D9E75', '#E24B4A', '#3B82F6', '#EC4899', '#14B8A6', '#BA7517', '#06B6D4', '#8B5CF6'];
type GrafikDatum = { label: string; value: number };
type GrafikP = { judul: string; chartType: 'pie' | 'bar' | 'line'; source: 'manual' | 'tabel'; data: GrafikDatum[]; tabelBlockId: number | null; labelCol: number; valueCol: number; imageFileId: string; caption: string; tabelSidik?: string };

function GrafikRender({ type, data }: { type: 'pie' | 'bar' | 'line'; data: GrafikDatum[] }) {
  const W = 520, H = 300;
  const axisTick = { fontSize: 11, fill: '#334155' };
  // Angka sumbu bergaya Indonesia (20.000.000.000, bukan 20000000000) — gambarnya masuk dokumen resmi.
  const sumbuId = (v: number) => Number(v).toLocaleString('id-ID');
  const sumbuLebar = Math.min(110, 14 + 7 * Math.max(...data.map(d => sumbuId(Math.abs(d.value)).length), 1));
  if (type === 'pie') {
    return (
      <PieChart width={W} height={H}>
        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={96} label>
          {data.map((_, i) => <Cell key={i} fill={GRAFIK_COLORS[i % GRAFIK_COLORS.length]} />)}
        </Pie>
        <RTooltip /><Legend />
      </PieChart>
    );
  }
  if (type === 'line') {
    return (
      <LineChart width={W} height={H} data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis dataKey="label" tick={axisTick} /><YAxis tick={axisTick} tickFormatter={sumbuId} width={sumbuLebar} />
        <RTooltip /><Line type="monotone" dataKey="value" name="Nilai" stroke="#7C5CFC" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    );
  }
  return (
    <BarChart width={W} height={H} data={data} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
      <XAxis dataKey="label" tick={axisTick} /><YAxis tick={axisTick} tickFormatter={sumbuId} width={sumbuLebar} />
      <RTooltip />
      <Bar dataKey="value" name="Nilai" radius={[4, 4, 0, 0]}>
        {data.map((_, i) => <Cell key={i} fill={GRAFIK_COLORS[i % GRAFIK_COLORS.length]} />)}
      </Bar>
    </BarChart>
  );
}

// recharts butuh DOM → render client-only (cegah SSR; section pertama auto-terpilih saat load).
const GrafikRenderClient = dynamic(() => Promise.resolve({ default: GrafikRender }), { ssr: false });

function GrafikEditor({ block, readOnly, onSave, tableBlocks, nomorBlok }: { block: BlockNode; readOnly: boolean; onSave: (p: unknown) => void; tableBlocks: BlockNode[]; nomorBlok?: NomorBlok }) {
  const p0 = block.payload as Partial<GrafikP>;
  const [judul, setJudul] = useState(p0.judul ?? '');
  const [caption, setCaption] = useState(p0.caption ?? '');
  const [chartType, setChartType] = useState<'pie' | 'bar' | 'line'>(p0.chartType ?? 'bar');
  const [source, setSource] = useState<'manual' | 'tabel'>(p0.source ?? 'manual');
  const [data, setData] = useState<GrafikDatum[]>(p0.data?.length ? p0.data : [{ label: 'Kategori 1', value: 10 }, { label: 'Kategori 2', value: 20 }]);
  const [tabelBlockId, setTabelBlockId] = useState<number | null>(p0.tabelBlockId ?? (tableBlocks[0]?.id ?? null));
  const [labelCol, setLabelCol] = useState(p0.labelCol ?? 0);
  const [valueCol, setValueCol] = useState(p0.valueCol ?? 1);
  const [saving, setSaving] = useState(false);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const fileIdRef = useRef(p0.imageFileId ?? '');

  const selTable = tableBlocks.find(b => b.id === tabelBlockId);
  const tableKolom = ((selTable?.payload as { kolom?: string[] })?.kolom) ?? [];

  const tableRows = source === 'tabel' && selTable ? normalizeRows((selTable.payload as { rows?: unknown }).rows) : [];
  // Baris kepala (header bertingkat) bukan data — dulu ikut tergambar sebagai batang bernilai 0.
  const kepalaGrafik = Math.max(0, Math.min(Number((selTable?.payload as { headerRows?: number })?.headerRows) || 0, tableRows.length));
  const chartData: GrafikDatum[] = source === 'manual'
    ? data.map(d => ({ label: d.label || '-', value: Number(d.value) || 0 })).filter(d => d.value !== 0 || d.label !== '-')
    : tableRows.slice(kepalaGrafik).map((r, i) => ({
        label: String(r[labelCol]?.v ?? '').trim() || `Baris ${i + 1}`,
        value: angkaSel(tableRows, kepalaGrafik + i, valueCol),
      }));

  const addRow = () => setData(d => [...d, { label: `Kategori ${d.length + 1}`, value: 0 }]);
  const delRow = (i: number) => setData(d => (d.length > 1 ? d.filter((_, j) => j !== i) : d));
  const setRow = (i: number, key: 'label' | 'value', v: string) =>
    setData(d => d.map((row, j) => j === i ? { ...row, [key]: key === 'value' ? (parseFloat(v) || 0) : v } : row));

  const handleSave = async () => {
    setSaving(true);
    try {
      let imageFileId = fileIdRef.current;
      const el = chartRef.current?.querySelector('.lk-grafik-canvas') as HTMLElement | null;
      if (el && chartData.length) {
        try {
          const html2canvas = (await import('html2canvas-pro')).default;
          const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 2 });
          const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
          if (blob) {
            const fd = new FormData();
            fd.append('file', new File([blob], 'grafik.png', { type: 'image/png' }));
            fd.append('modul', 'lkjip');
            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const j = await res.json();
            if (j.ok && j.fileId) { imageFileId = j.fileId; fileIdRef.current = j.fileId; }
            else toast.error(j.msg ?? 'Gagal render grafik ke gambar');
          }
        } catch { toast.error('Gagal membuat gambar grafik'); }
      }
      onSave({ judul, chartType, source, data, tabelBlockId, labelCol, valueCol, imageFileId, caption,
        tabelSidik: source === 'tabel' ? sidikGrafik(chartData) : '' });
    } finally { setSaving(false); }
  };
  // Gambar di Word dibuat saat Simpan — kalau data tabelnya berubah sesudahnya (mis. tabel tertaut
  // diperbarui), gambar itu basi walau pratinjau di sini sudah ikut berubah.
  const gambarBasi = source === 'tabel' && !!p0.imageFileId && !!p0.tabelSidik
    && p0.source === 'tabel' && p0.tabelBlockId === tabelBlockId && p0.tabelSidik !== sidikGrafik(chartData);

  return (
    <div className="lk-grafik-ed">
      <input className="lk-tabel-judul" value={judul} readOnly={readOnly} placeholder="Judul grafik (tanpa nomor — nomor otomatis)" onChange={e => setJudul(e.target.value)} />
      {gambarBasi && (
        <div className="lk-grafik-basi">
          Data tabelnya sudah berubah sejak grafik ini disimpan — gambar di Word masih memakai data lama.
          {!readOnly && ' Tekan Simpan pada grafik ini untuk menggambar ulang.'}
        </div>
      )}
      {!readOnly && (
        <div className="lk-grafik-tools">
          <label>Jenis
            <select value={chartType} onChange={e => setChartType(e.target.value as 'pie' | 'bar' | 'line')}>
              <option value="bar">Bar / Kolom</option><option value="line">Line / Garis</option><option value="pie">Pie / Donat</option>
            </select>
          </label>
          <label>Sumber
            <select value={source} onChange={e => setSource(e.target.value as 'manual' | 'tabel')}>
              <option value="manual">Data manual</option>
              <option value="tabel" disabled={tableBlocks.length === 0}>Dari blok tabel</option>
            </select>
          </label>
          {source === 'tabel' && tableBlocks.length > 0 && (
            <>
              <label>Tabel
                <select value={tabelBlockId ?? ''} onChange={e => setTabelBlockId(e.target.value ? Number(e.target.value) : null)}>
                  {tableBlocks.map((b, i) => {
                    const judul = (b.payload as { judul?: string })?.judul;
                    const label = `Tabel ${nomorBlok?.get(b.id)?.nomor ?? i + 1}`;
                    return <option key={b.id} value={b.id}>{judul ? `${label} · ${judul}` : label}</option>;
                  })}
                </select>
              </label>
              <label>Label
                <select value={labelCol} onChange={e => setLabelCol(Number(e.target.value))}>{tableKolom.map((k, i) => <option key={i} value={i}>{k || `Kolom ${i + 1}`}</option>)}</select>
              </label>
              <label>Nilai
                <select value={valueCol} onChange={e => setValueCol(Number(e.target.value))}>{tableKolom.map((k, i) => <option key={i} value={i}>{k || `Kolom ${i + 1}`}</option>)}</select>
              </label>
            </>
          )}
        </div>
      )}

      {!readOnly && source === 'manual' && (
        <div className="lk-grafik-data">
          {data.map((row, i) => (
            <div key={i} className="lk-grafik-row">
              <input placeholder="Label" value={row.label} onChange={e => setRow(i, 'label', e.target.value)} />
              <input type="number" placeholder="Nilai" value={row.value} onChange={e => setRow(i, 'value', e.target.value)} />
              <button data-tooltip="Hapus baris" data-tooltip-pos="below" onClick={() => delRow(i)} disabled={data.length <= 1}>×</button>
            </div>
          ))}
          <button className="lk-grafik-add" onClick={addRow}>+ Baris data</button>
        </div>
      )}

      <div className="lk-grafik-preview" ref={chartRef}>
        {chartData.length === 0
          ? <div className="lk-grafik-empty">Belum ada data untuk grafik.</div>
          : <div className="lk-grafik-canvas"><GrafikRenderClient type={chartType} data={chartData} /></div>}
      </div>

      {!readOnly && (
        <>
          <input className="lk-tabel-judul" value={caption} placeholder="Keterangan / caption (opsional)" onChange={e => setCaption(e.target.value)} />
          <div className="lk-save-row">
            <PrimaButton menulis variant="primary" size="sm" iconLeft={<Save size={14} />} disabled={saving} onClick={handleSave}>{saving ? 'Menyimpan…' : 'Simpan Grafik'}</PrimaButton>
          </div>
        </>
      )}
    </div>
  );
}

// Konversi kata pengantar: HTML <p> ↔ teks polos (1 paragraf per baris) untuk textarea.
function kpHtmlToText(h: string): string {
  return (h || '').replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}
function kpTextToHtml(t: string): string {
  return t.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('');
}

const ED_CSS = `
  .lk-ed-body { min-height: 100vh; background: #020F1C; color: #E6F1FB; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; display: flex; flex-direction: column; }
  .lk-ed-top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 9px 18px; min-height: 56px; background: rgba(4,44,83,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid #0C447C; }
  .lk-ed-title { display: inline-flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14px; min-width: 0; }
  .lk-ed-judul { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 48vw; }
  .lk-ed-topright { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .lk-badge { font-size: 10px; font-weight: 800; letter-spacing: .08em; padding: 2px 8px; border-radius: 99px; flex-shrink: 0; }
  .lk-badge.draft { background: rgba(124,92,252,0.16); color: #B9A6FF; border: 1px solid rgba(124,92,252,0.4); }
  .lk-badge.final { background: rgba(29,158,117,0.16); color: #7BE0BD; border: 1px solid rgba(29,158,117,0.4); }
  .lk-ed-grid { flex: 1; display: grid; grid-template-columns: 320px 1fr; min-height: 0; }

  .lk-tree { border-right: 1px solid #0C447C; display: flex; flex-direction: column; min-height: 0; background: #02152a; }
  .lk-tree-head { padding: 12px 14px; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #85B7EB; border-bottom: 1px solid #0C447C; }
  .lk-tree-list { flex: 1; overflow-y: auto; padding: 6px 0 100px; }
  .lk-node { display: flex; align-items: center; gap: 6px; padding: 6px 10px 6px 8px; font-size: 12.5px; cursor: pointer; border-left: 2px solid transparent; }
  .lk-node:hover { background: rgba(255,255,255,0.04); }
  .lk-node.active { background: rgba(124,92,252,0.12); border-left-color: #7C5CFC; }
  .lk-node-num { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #EF9F27; font-weight: 700; flex-shrink: 0; }
  .lk-node-judul { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #D6E6F7; }
  .lk-lock { color: #85B7EB; flex-shrink: 0; }
  .lk-node-dot { font-size: 9px; color: #5E8BBE; flex-shrink: 0; }
  .lk-node-lock { display: inline-flex; flex-shrink: 0; color: #85B7EB; opacity: .75; }
  .lk-node-kebab { background: none; border: none; color: #85B7EB; cursor: pointer; padding: 4px; border-radius: 6px; display: inline-flex; flex-shrink: 0; opacity: .42; transition: opacity .15s, background .15s, color .15s; }
  .lk-node:hover .lk-node-kebab, .lk-node.active .lk-node-kebab { opacity: 1; }
  .lk-node-kebab:hover { background: rgba(124,92,252,0.22); color: #C9BCFF; opacity: 1; }

  .lk-rowmenu-bg { position: fixed; inset: 0; z-index: 300; }
  .lk-rowmenu { position: fixed; background: #042C53; border: 1px solid #0C447C; border-radius: 10px; padding: 7px; box-shadow: 0 14px 34px rgba(0,0,0,.5); display: flex; flex-direction: column; gap: 1px; animation: lk-rowmenu-in .14s ease both; }
  @keyframes lk-rowmenu-in { from { opacity: 0; transform: translateY(-5px) scale(.97); } to { opacity: 1; transform: none; } }
  .lk-rowmenu-item { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border: none; background: none; color: #D6E6F7; cursor: pointer; border-radius: 6px; font-size: 12.5px; text-align: left; width: 100%; }
  .lk-rowmenu-item:hover:not(.disabled) { background: rgba(124,92,252,0.20); color: #fff; }
  /* Yang diredupkan isinya, bukan tombolnya: opacity pada tombol ikut meredupkan tooltip alasannya (::after). */
  .lk-rowmenu-item.disabled { cursor: not-allowed; }
  .lk-rowmenu-item.disabled > span { opacity: .4; }
  .lk-rowmenu-item.danger { color: #FCA5A5; border-top: 1px solid #0C447C; margin-top: 3px; padding-top: 9px; border-radius: 0 0 6px 6px; }
  .lk-rowmenu-item.danger:hover:not(.disabled) { background: rgba(226,75,74,0.18); color: #fff; }
  .lk-rowmenu-ic { display: inline-flex; flex-shrink: 0; color: #85B7EB; }
  .lk-rowmenu-item:hover:not(.disabled) .lk-rowmenu-ic, .lk-rowmenu-item.danger .lk-rowmenu-ic { color: inherit; }
  .lk-rowmenu-lb { white-space: nowrap; }
  .lk-tree-foot { padding: 10px 12px; border-top: 1px solid #0C447C; }

  .lk-editor { overflow-y: auto; padding: 22px 26px 120px; min-height: 0; }
  .lk-editor-empty, .lk-noblock { color: #85B7EB; padding: 40px 0; text-align: center; }
  .lk-editor-head { font-size: 17px; font-weight: 800; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid #0C447C; }
  .lk-editor-num { font-family: 'JetBrains Mono', monospace; color: #EF9F27; margin-right: 8px; }

  .lk-block { background: #042C53; border: 1px solid #0C447C; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }
  .lk-block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .lk-block-tag { font-size: 10px; font-weight: 800; letter-spacing: .1em; color: #85B7EB; }
  .lk-block-del { background: none; border: none; color: #85B7EB; cursor: pointer; padding: 3px; }
  .lk-block-del:hover { color: #FCA5A5; }
  .lk-block-headl { display: inline-flex; align-items: center; gap: 8px; }
  .lk-block-cont { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 600; color: #B5D4F4; cursor: pointer; user-select: none; }
  .lk-block-cont input { accent-color: #7C5CFC; cursor: pointer; margin: 0; }
  [data-theme="light"] .lk-block-cont { color: #4B5563; }

  .lk-panduan { width: 760px; max-width: 94vw; max-height: 88vh; display: flex; flex-direction: column; }
  .lk-panduan h3 { flex: 0 0 auto; }
  .lk-panduan > .lk-hint { flex: 0 0 auto; }
  .lk-panduan .lk-modal-actions { flex: 0 0 auto; margin-top: 14px; }
  .lk-panduan .lk-pd-list { display: flex; flex-direction: column; gap: 7px; flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 6px; }
  .lk-pd-item { border: 1px solid #0C447C; border-radius: 8px; background: #020F1C; overflow: hidden; flex: 0 0 auto; }
  .lk-pd-item > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 9px; padding: 11px 13px; font-size: 13px; font-weight: 700; color: #E6F1FB; user-select: none; }
  .lk-pd-item > summary::-webkit-details-marker { display: none; }
  .lk-pd-item > summary:hover { background: rgba(124,92,252,0.10); }
  .lk-pd-no { display: inline-flex; align-items: center; justify-content: center; width: 21px; height: 21px; border-radius: 50%; background: #7C5CFC; color: #fff; font-size: 11px; font-weight: 800; flex: 0 0 auto; }
  .lk-pd-item[open] > summary { border-bottom: 1px solid #0C447C; color: #C9BCFF; }
  .lk-pd-body { padding: 10px 16px 14px 44px; font-size: 12.5px; line-height: 1.7; color: #B5D4F4; }
  .lk-pd-body ol, .lk-pd-body ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
  .lk-pd-body ol { list-style: decimal; }
  .lk-pd-body ul { list-style: disc; }
  .lk-pd-body li { padding-left: 2px; }
  .lk-pd-body li::marker { color: #7C5CFC; font-weight: 700; }
  .lk-pd-note { margin: 0 0 7px; }
  .lk-pd-body ol + .lk-pd-note, .lk-pd-body ul + .lk-pd-note { margin-top: 9px; }
  .lk-pd-body b { color: #E6F1FB; font-weight: 700; }
  [data-theme="light"] .lk-pd-item { border-color: rgba(0,0,0,.12); background: #F9FAFB; }
  [data-theme="light"] .lk-pd-item > summary { color: #111827; }
  [data-theme="light"] .lk-pd-item[open] > summary { border-color: rgba(0,0,0,.10); color: #6D28D9; }
  [data-theme="light"] .lk-pd-body { color: #4B5563; }
  [data-theme="light"] .lk-pd-body b { color: #111827; }
  .lk-block-grip { background: none; border: none; color: #5E8BBE; cursor: grab; padding: 2px; display: inline-flex; }
  .lk-block-grip:active { cursor: grabbing; }
  .lk-block-grip:hover { color: #B5D4F4; }
  .lk-block-wrap { border-radius: 10px; transition: box-shadow .12s; }
  .lk-block-wrap.dragging { opacity: .45; }
  .lk-block-wrap.dragmode:not(.dragging):hover { box-shadow: 0 0 0 2px #7C5CFC; }
  .lk-colresize { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 3; }
  .lk-colresize:hover { background: rgba(239,159,39,0.5); }

  .lk-narasi { width: 100%; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 10px 12px; font-family: inherit; font-size: 13.5px; line-height: 1.6; resize: vertical; }
  .lk-narasi:focus { outline: none; border-color: #185FA5; }
  .lk-save-row { margin-top: 10px; display: flex; justify-content: flex-end; }

  .lk-tabel-judul { width: 100%; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 8px 10px; font-size: 13px; font-weight: 600; margin-bottom: 10px; }
  .lk-tabel-scroll { overflow-x: auto; }
  .lk-tabel { border-collapse: collapse; width: 100%; }
  .lk-tabel th, .lk-tabel td { border: 1px solid #0C447C; padding: 0; vertical-align: top; }
  .lk-tabel th { background: rgba(255,255,255,0.03); }
  .lk-tabel input { width: 100%; min-width: 90px; background: transparent; border: none; color: #E6F1FB; padding: 7px 8px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; }
  .lk-tabel input:focus { outline: 1px solid #185FA5; }
  .lk-tabel th input, .lk-tabel td input { min-width: 0; }
  .lk-tabel tr.lk-hrow td { background: rgba(133,183,235,0.13); }
  .lk-tabel tr.lk-hrow input { font-weight: 700; }
  [data-theme="light"] .lk-tabel tr.lk-hrow td { background: #EDEDED; }
  .lk-sf-divider { margin: 16px 0 8px; font-size: 12px; font-weight: 800; letter-spacing: .03em; color: #85B7EB; border-top: 1px solid #0C447C; padding-top: 12px; }
  .lk-kp-text { width: 100%; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 8px 10px; font-size: 13px; font-family: inherit; line-height: 1.55; resize: vertical; }
  .lk-kp-text:focus { outline: none; border-color: #185FA5; }
  .lk-sf-full { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; font-size: 12px; color: #85B7EB; }
  [data-theme="light"] .lk-kp-text { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-sf-divider { color: #6B7280; border-color: rgba(0,0,0,.12); }
  .lk-gambar-up { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .lk-upbtn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; background: rgba(124,92,252,0.16); border: 1px solid rgba(124,92,252,0.5); color: #B9A6FF; border-radius: 7px; cursor: pointer; font-size: 12px; font-weight: 700; }
  .lk-upbtn:hover { filter: brightness(1.12); }
  .lk-upok { color: #7BE0BD; font-size: 12px; }
  .lk-uphint { color: #85B7EB; font-size: 12px; }
  .lk-grafik-ed { display: flex; flex-direction: column; gap: 10px; }
  .lk-grafik-tools { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid #0C447C; border-radius: 8px; }
  .lk-grafik-tools label { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: #85B7EB; font-weight: 600; }
  .lk-grafik-tools select { background: #020F1C; color: #E6F1FB; border: 1px solid #0C447C; border-radius: 6px; font-size: 12px; padding: 4px 6px; }
  .lk-grafik-data { display: flex; flex-direction: column; gap: 6px; max-width: 440px; }
  .lk-grafik-row { display: flex; gap: 6px; align-items: center; }
  .lk-grafik-row input { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 6px 8px; font-size: 12.5px; }
  .lk-grafik-row input:first-child { flex: 1; }
  .lk-grafik-row input[type=number] { width: 110px; font-family: 'JetBrains Mono', monospace; }
  .lk-grafik-row input:focus { outline: none; border-color: #185FA5; }
  .lk-grafik-row button { background: none; border: none; color: #FCA5A5; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; }
  .lk-grafik-row button:disabled { opacity: .35; cursor: not-allowed; }
  .lk-grafik-add { align-self: flex-start; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-grafik-add:hover { border-color: #185FA5; color: #E6F1FB; }
  .lk-grafik-preview { display: flex; justify-content: center; padding: 10px; background: rgba(255,255,255,0.02); border: 1px solid #0C447C; border-radius: 8px; }
  .lk-grafik-canvas { background: #ffffff; border-radius: 6px; padding: 8px; }
  .lk-grafik-empty { color: #85B7EB; font-size: 12.5px; padding: 40px; text-align: center; }
  .lk-ab.grafik { color: #14B8A6; border-color: #14B8A6; }
  [data-theme="light"] .lk-grafik-tools, [data-theme="light"] .lk-grafik-preview { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-grafik-tools select, [data-theme="light"] .lk-grafik-row input { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-grafik-add { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #374151; }
  .lk-rownum { background: rgba(255,255,255,0.03); color: #85B7EB; font-size: 11px; text-align: center; padding: 4px 6px; white-space: nowrap; }
  .lk-tabel-ctl { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
  .lk-tabel-ctl > button { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-tabel-ctl > button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-tabel-ctl > button:disabled { opacity: .4; cursor: not-allowed; }
  .lk-taut-bar { margin-top: 10px; padding: 8px 10px; border: 1px solid rgba(124,92,252,0.5); border-radius: 8px; background: rgba(124,92,252,0.10); display: flex; flex-direction: column; gap: 6px; font-size: 11.5px; color: #B5D4F4; }
  .lk-taut-bar-info { display: flex; align-items: flex-start; gap: 6px; line-height: 1.5; }
  .lk-taut-bar-info b { color: #E6F1FB; font-weight: 700; }
  .lk-taut-bar-catatan { margin: 0; padding-left: 20px; color: #FBBF24; line-height: 1.5; }
  .lk-taut-bar-aksi { display: flex; gap: 6px; flex-wrap: wrap; }
  .lk-taut-bar-aksi button { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-taut-bar-aksi button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-taut-bar-aksi button:disabled { opacity: .45; cursor: not-allowed; }
  .lk-grafik-basi { padding: 7px 10px; border-radius: 8px; font-size: 11.5px; line-height: 1.5; background: rgba(239,159,39,0.12); border: 1px solid #EF9F27; color: #FBBF24; }
  [data-theme="light"] .lk-taut-bar { background: #EDE7FE; border-color: rgba(124,92,252,.45); color: #374151; }
  [data-theme="light"] .lk-taut-bar-info b { color: #111827; }
  [data-theme="light"] .lk-taut-bar-catatan, [data-theme="light"] .lk-grafik-basi { color: #B45309; }
  [data-theme="light"] .lk-taut-bar-aksi button { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #374151; }
  .lk-tabel-tools { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 8px; padding: 6px; background: rgba(255,255,255,0.03); border: 1px solid #0C447C; border-radius: 8px; }
  .lk-tabel-tools button { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 7px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1; }
  .lk-tabel-tools button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; background: rgba(255,255,255,0.09); }
  .lk-tabel-tools button:disabled { opacity: .38; cursor: not-allowed; }
  .lk-tt-sep { width: 1px; height: 20px; background: #0C447C; margin: 0 3px; }
  .lk-tabel td.lk-cell-sel { background: rgba(239,159,39,0.12); }
  .lk-tabel td.lk-cell-aktif { outline: 2px solid #EF9F27; outline-offset: -2px; }
  .lk-tabel td.lk-cell-galat .lk-sel-isi { color: #FCA5A5; font-weight: 700; }
  .lk-tabel-scroll { position: relative; }
  .lk-tabel-scroll:focus-within .lk-cell-aktif { outline-width: 2px; }
  .lk-tangkap { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; resize: none; border: 0; padding: 0; }
  .lk-tabel-kanvas { position: relative; display: inline-block; min-width: 100%; }
  .lk-sel-isi { padding: 7px 8px; min-height: 31px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: #E6F1FB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: cell; user-select: none; }
  .lk-tabel tr.lk-hrow .lk-sel-isi { font-weight: 700; }
  .lk-tabel th.lk-colhead { position: relative; color: #85B7EB; font-size: 11px; font-weight: 700; text-align: center; padding: 4px 0; cursor: s-resize; user-select: none; }
  .lk-tabel th.lk-colhead.aktif, .lk-tabel td.lk-rownum.aktif { background: rgba(239,159,39,0.18); color: #EF9F27; }
  .lk-tabel .lk-rownum { cursor: e-resize; user-select: none; }
  .lk-tabel th.lk-sudut { cursor: pointer; }
  .lk-colresize { right: -4px; width: 8px; }
  .lk-lebar-tip { position: absolute; top: -26px; right: -4px; z-index: 5; background: #020F1C; border: 1px solid #EF9F27; color: #EF9F27; border-radius: 6px; padding: 2px 6px; font-size: 11px; white-space: nowrap; pointer-events: none; }
  .lk-batas-kertas { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed #85B7EB; opacity: .45; pointer-events: none; }
  .lk-batas-kertas.lewat { border-left-color: #EF9F27; opacity: .9; }
  .lk-tabel-petunjuk { margin-top: 6px; font-size: 11px; color: #85B7EB; line-height: 1.5; }
  .lk-block-nomor { font-size: 11px; font-weight: 700; color: #E6F1FB; }
  .lk-tabel-sumber { width: 100%; margin-top: 6px; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #B5D4F4; padding: 6px 10px; font-size: 12px; font-style: italic; }
  .lk-tabel-atur { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin-top: 8px; }
  .lk-tabel-atur-judul { font-size: 10px; font-weight: 800; letter-spacing: .1em; color: #85B7EB; text-transform: uppercase; }
  .lk-tabel-atur-cek { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: #B5D4F4; cursor: pointer; }
  .lk-sel-isi.tegak { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; min-height: 0; margin: 0 auto; text-overflow: clip; }
  .lk-tabel td.lk-cell-nomor .lk-sel-isi { color: #85B7EB; }
  .lk-tabel-lebar, .lk-tabel-galat { margin-top: 8px; padding: 7px 10px; border-radius: 8px; font-size: 11.5px; line-height: 1.5; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
  .lk-tabel-lebar { background: rgba(239,159,39,0.12); border: 1px solid #EF9F27; color: #FBBF24; }
  .lk-tabel-lebar button { background: rgba(255,255,255,0.05); border: 1px solid #EF9F27; color: #FBBF24; padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-tabel-galat { background: rgba(226,75,74,0.12); border: 1px solid #E24B4A; color: #FCA5A5; }
  /* Kolom isian tangan di tabel tertaut — satu-satunya sel badan yang bisa diketik. */
  .lk-tabel td.lk-cell-tangan { background: rgba(124,92,252,0.08); box-shadow: inset 2px 0 0 rgba(124,92,252,0.55); }
  .lk-block-wrap.sorot { box-shadow: 0 0 0 2px #7C5CFC; }
  .lk-periksa { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 52vh; overflow-y: auto; }
  .lk-periksa li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: #020F1C; border: 1px solid #0C447C; border-left-width: 3px; border-radius: 8px; }
  .lk-periksa li.sama { border-left-color: #1D9E75; }
  .lk-periksa li.berubah { border-left-color: #EF9F27; }
  .lk-periksa li.gagal { border-left-color: #E24B4A; }
  .lk-periksa-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 12px; color: #85B7EB; }
  .lk-periksa-info b { color: #E6F1FB; font-size: 13px; }
  .lk-periksa li.sama .lk-periksa-status { color: #7BE0BD; }
  .lk-periksa li.berubah .lk-periksa-status { color: #FBBF24; }
  .lk-periksa li.gagal .lk-periksa-status { color: #FCA5A5; }
  .lk-periksa button { flex-shrink: 0; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-periksa button:hover { border-color: #185FA5; color: #E6F1FB; }
  [data-theme="light"] .lk-tabel td.lk-cell-tangan { background: rgba(124,92,252,0.07); }
  [data-theme="light"] .lk-periksa li { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-periksa li.sama { border-left-color: #1D9E75; }
  [data-theme="light"] .lk-periksa li.berubah { border-left-color: #EF9F27; }
  [data-theme="light"] .lk-periksa li.gagal { border-left-color: #E24B4A; }
  [data-theme="light"] .lk-periksa-info { color: #6B7280; }
  [data-theme="light"] .lk-periksa-info b { color: #0F0F12; }
  [data-theme="light"] .lk-periksa li.sama .lk-periksa-status { color: #0E7A55; }
  [data-theme="light"] .lk-periksa li.berubah .lk-periksa-status { color: #B45309; }
  [data-theme="light"] .lk-periksa li.gagal .lk-periksa-status { color: #B91C1C; }
  [data-theme="light"] .lk-periksa button { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #374151; }
  /* K1: select tak bisa menggambar ::after — tooltip-nya dipasang di pembungkus. */
  .lk-tt-tip { display: inline-flex; }
  .lk-tt-sel { height: 28px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; border-radius: 6px; font-size: 11px; padding: 0 4px; cursor: pointer; }
  .lk-tt-sel:disabled { opacity: .38; cursor: not-allowed; }
  .lk-tt-sel option { background: #020F1C; color: #E6F1FB; }
  .lk-collabel { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; color: #EF9F27; padding: 0 1px; }
  .lk-fbar { display: flex; align-items: center; margin-bottom: 8px; border: 1px solid #0C447C; border-radius: 6px; overflow: hidden; background: #020F1C; }
  .lk-fbar-ref { min-width: 54px; text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; color: #EF9F27; padding: 6px 8px; border-right: 1px solid #0C447C; }
  .lk-fbar-fx { font-style: italic; font-family: Georgia, 'Times New Roman', serif; color: #85B7EB; padding: 0 10px; border-right: 1px solid #0C447C; font-size: 13px; }
  .lk-fbar-in { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #E6F1FB; padding: 7px 10px; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  .lk-fbar-in:disabled { color: #5E8BBE; }

  .lk-gambar-ed { display: flex; flex-direction: column; gap: 8px; }
  .lk-gambar-ed input { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 8px 10px; font-size: 13px; }
  .lk-gambar-ed input:focus { outline: none; border-color: #185FA5; }

  .lk-addblock { display: flex; align-items: center; gap: 8px; padding: 12px; border: 1px dashed #0C447C; border-radius: 10px; color: #85B7EB; font-size: 12.5px; flex-wrap: wrap; }
  .lk-ab { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 7px; cursor: pointer; font-size: 12px; font-weight: 700; border: 1.5px solid; transition: filter .12s, transform .08s; }
  .lk-ab:hover { filter: brightness(1.18); transform: translateY(-1px); }
  .lk-ab.narasi { background: rgba(124,92,252,0.22); border-color: #7C5CFC; color: #D9CCFF; }
  .lk-ab.tabel  { background: rgba(55,138,221,0.22); border-color: #378ADD; color: #BFE0FF; }
  .lk-ab.gambar { background: rgba(29,158,117,0.22); border-color: #1D9E75; color: #A7ECCF; }

  /* 450: di atas FloatingDock (400) — dulu 100, jadi di ponsel kaki modal yang tinggi (Simpan/Batal) tertutup dock; di bawah confirmDialog (4000). */
  .lk-modal-bg { position: fixed; inset: 0; background: rgba(2,15,28,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 450; }
  .lk-modal { background: #042C53; border: 1px solid #0C447C; border-radius: 14px; padding: 22px; width: 400px; max-width: 92vw; }
  .lk-modal h3 { margin: 0 0 12px; font-size: 16px; font-weight: 800; }
  .lk-modal input { width: 100%; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 9px 11px; color: #E6F1FB; font-size: 14px; margin-bottom: 14px; }
  .lk-modal input:focus { outline: none; border-color: #185FA5; }
  .lk-hint { font-size: 11.5px; color: #85B7EB; line-height: 1.5; margin: 0 0 14px; }
  .lk-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
  .lk-modal-wide { width: 560px; }
  .lk-versi-list { display: flex; flex-direction: column; gap: 8px; max-height: 52vh; overflow-y: auto; margin-bottom: 16px; }
  .lk-versi-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: #020F1C; border: 1px solid #0C447C; border-radius: 8px; }
  .lk-versi-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .lk-versi-no { font-weight: 800; font-size: 13px; color: #E6F1FB; }
  .lk-versi-meta { font-size: 11.5px; color: #85B7EB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lk-versi-acts { display: flex; gap: 6px; flex-shrink: 0; }
  .lk-vact { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; width: 32px; height: 32px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; }
  .lk-vact:hover { border-color: #185FA5; color: #E6F1FB; background: rgba(255,255,255,0.09); }
  .lk-vact.warn { color: #FBBF24; }
  .lk-vact.warn:hover { border-color: #BA7517; background: rgba(186,117,23,0.14); }
  .lk-sf { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .lk-sf label { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; color: #B5D4F4; }
  .lk-sf select, .lk-sf input { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 7px 10px; font-size: 13px; min-width: 200px; max-width: 230px; }
  .lk-sf select:focus, .lk-sf input:focus { outline: none; border-color: #185FA5; }
  .lk-sf select:disabled, .lk-sf input:disabled { opacity: .5; cursor: not-allowed; }

  /* ════ LIGHT THEME ════ */
  [data-theme="light"] .lk-ed-body { background: #F5F5F7; color: #0F0F12; }
  [data-theme="light"] .lk-ed-top { background: rgba(255,255,255,0.92); border-bottom-color: rgba(0,0,0,.1); box-shadow: 0 2px 12px rgba(15,15,18,.06); }
  [data-theme="light"] .lk-tree { background: #FFFFFF; border-right-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-tree-head { color: #6B7280; border-bottom-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-node:hover { background: rgba(0,0,0,0.04); }
  [data-theme="light"] .lk-node.active { background: rgba(124,92,252,0.1); }
  [data-theme="light"] .lk-node-judul { color: #1F2937; }
  [data-theme="light"] .lk-node-num { color: #B26B00; }
  [data-theme="light"] .lk-node-kebab { color: #6B7280; }
  [data-theme="light"] .lk-node-lock { color: #6B7280; }
  [data-theme="light"] .lk-node-kebab:hover { background: rgba(124,92,252,0.14); color: #6D28D9; }
  [data-theme="light"] .lk-rowmenu { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-rowmenu-item { color: #374151; }
  [data-theme="light"] .lk-rowmenu-item:hover:not(.disabled) { background: rgba(124,92,252,0.12); color: #111827; }
  [data-theme="light"] .lk-rowmenu-item.danger { color: #DC2626; border-top-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-rowmenu-item.danger:hover:not(.disabled) { background: rgba(226,75,74,0.12); color: #B91C1C; }
  [data-theme="light"] .lk-rowmenu-ic { color: #6B7280; }
  [data-theme="light"] .lk-tree-foot { border-top-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-editor-head { border-bottom-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-editor-num { color: #B26B00; }
  [data-theme="light"] .lk-editor-empty, [data-theme="light"] .lk-noblock { color: #6B7280; }
  [data-theme="light"] .lk-block { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.05); }
  [data-theme="light"] .lk-block-tag { color: #6B7280; }
  [data-theme="light"] .lk-block-nomor { color: #0F0F12; }
  [data-theme="light"] .lk-tabel-sumber { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tabel-atur-judul { color: #6B7280; }
  [data-theme="light"] .lk-tabel-atur-cek { color: #374151; }
  [data-theme="light"] .lk-tabel td.lk-cell-nomor .lk-sel-isi { color: #6B7280; }
  [data-theme="light"] .lk-tabel-judul, [data-theme="light"] .lk-gambar-ed input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-tabel th { background: #F3F4F6; }
  [data-theme="light"] .lk-tabel th, [data-theme="light"] .lk-tabel td { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tabel input { color: #0F0F12; }
  [data-theme="light"] .lk-rownum { background: #F3F4F6; color: #6B7280; }
  [data-theme="light"] .lk-tabel-ctl > button { background: #F3F4F6; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tabel-tools { background: #F3F4F6; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tabel-tools button { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tabel-tools button:hover:not(:disabled) { border-color: #7C5CFC; color: #111827; background: #F9FAFB; }
  [data-theme="light"] .lk-tt-sep { background: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tabel td.lk-cell-sel { background: rgba(124,92,252,0.12); }
  [data-theme="light"] .lk-tabel td.lk-cell-aktif { outline-color: #7C5CFC; }
  [data-theme="light"] .lk-sel-isi { color: #0F0F12; }
  [data-theme="light"] .lk-tabel td.lk-cell-galat .lk-sel-isi { color: #E24B4A; }
  [data-theme="light"] .lk-tabel th.lk-colhead { color: #6B7280; }
  [data-theme="light"] .lk-tabel th.lk-colhead.aktif, [data-theme="light"] .lk-tabel td.lk-rownum.aktif { background: rgba(124,92,252,0.14); color: #7C5CFC; }
  [data-theme="light"] .lk-lebar-tip { background: #FFFFFF; border-color: #7C5CFC; color: #7C5CFC; }
  [data-theme="light"] .lk-batas-kertas { border-left-color: #6B7280; }
  [data-theme="light"] .lk-tabel-petunjuk { color: #6B7280; }
  [data-theme="light"] .lk-tabel-lebar, [data-theme="light"] .lk-tabel-lebar button { color: #B45309; }
  [data-theme="light"] .lk-tabel-galat { color: #E24B4A; }
  [data-theme="light"] .lk-tt-sel { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-tt-sel option { background: #FFFFFF; color: #374151; }
  [data-theme="light"] .lk-collabel { color: #7C5CFC; }
  [data-theme="light"] .lk-fbar { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-fbar-ref { color: #5B21B6; border-right-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-fbar-fx { color: #6B7280; border-right-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-fbar-in { color: #0F0F12; }
  [data-theme="light"] .lk-addblock { border-color: rgba(0,0,0,.15); color: #6B7280; }
  [data-theme="light"] .lk-ab.narasi { background: #EDE7FE; border-color: #7C5CFC; color: #5B21B6; }
  [data-theme="light"] .lk-ab.tabel  { background: #E0EDFB; border-color: #378ADD; color: #1E5FA5; }
  [data-theme="light"] .lk-ab.gambar { background: #D6F0E6; border-color: #1D9E75; color: #0E7A55; }
  [data-theme="light"] .lk-modal { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-modal input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-hint, [data-theme="light"] .lk-sf label { color: #6B7280; }
  [data-theme="light"] .lk-sf select, [data-theme="light"] .lk-sf input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  /* PrimaButton kontras di light */
  [data-theme="light"] .lk-ed-body .btn-prima { border-color: rgba(15,15,18,.18); }
  [data-theme="light"] .lk-ed-body .btn-prima[data-variant="purple"] { background: #EDE7FE; border-color: rgba(124,92,252,.55); color: #5B21B6; }
  [data-theme="light"] .lk-ed-body .btn-prima[data-variant="purple"]:hover:not(:disabled) { background: #E2D8FC; }
  [data-theme="light"] .lk-versi-row { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-versi-no { color: #0F0F12; }
  [data-theme="light"] .lk-versi-meta { color: #6B7280; }
  [data-theme="light"] .lk-vact { background: #F3F4F6; border-color: rgba(0,0,0,.12); color: #4B5563; }
  [data-theme="light"] .lk-vact:hover { border-color: #8B5CF6; color: #0F0F12; background: #EDE9FE; }
  [data-theme="light"] .lk-vact.warn { color: #B45309; }

  /* Layar sempit: kerangka 320 px dulu menyisakan ± 55 px untuk isi di 375 px. Kerangka naik ke
     atas, tingginya dibatasi & bisa digulir sendiri, isi mendapat seluruh lebar layar. Ditaruh paling
     akhir supaya menang atas aturan berkekhususan sama di atas. */
  @media (max-width: 760px) {
    .lk-ed-grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }
    .lk-tree { border-right: none; border-bottom: 1px solid #0C447C; max-height: 34vh; }
    [data-theme="light"] .lk-tree { border-bottom-color: rgba(0,0,0,.1); }
    .lk-tree-list { padding-bottom: 8px; }
    .lk-editor { padding: 14px 12px 120px; }
    /* Tombol tema + lencana akun memakan ± 266 px — judul dokumen dulu terjepit sampai lebar 0. */
    .lk-ed-top { padding: 8px 12px; flex-wrap: wrap; row-gap: 6px; }
    .lk-ed-title { flex: 1 1 100%; }
    .lk-ed-judul { max-width: none; }
    .lk-ed-topright { margin-left: auto; }
  }
`;
