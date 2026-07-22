'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardCheck, Copy, FileText, FolderDown, Plus, LayoutGrid, RefreshCw, CheckSquare, Check, Trash2, Search, List, Lock, Folder, ArrowRight, ChevronLeft } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import { stripGolongan } from '@/lib/iki/layout';
import ImportIkiModal from './ImportIkiModal';
import { pejabatOptionValue, resolvePejabat, nameInitials } from './_lib/types';
import type { IkiJenisDokumen, IkiListRow, IkiVarian, PejabatSuggest } from './_lib/types';

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialRows: IkiListRow[];
}

export default function IkiClient({ username, role, themePreference, initialRows }: Props) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const [rows, setRows] = useState<IkiListRow[]>(initialRows);
  const [showCreate, setShowCreate] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    tahun: String(new Date().getFullYear()),
    varian: 'STANDAR' as IkiVarian,
    jenis: 'MURNI' as IkiJenisDokumen,
    nama: '',
    nip: '',
    jabatan: '',
    pangkat: '',
  });

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
      varian: p.jabatan?.trim().toUpperCase() === 'DIREKTUR' ? 'DIREKTUR' : f.varian,
    }));
  }

  const tahunList = [...new Set(rows.map(r => r.tahun))].sort().reverse();
  const [filterTahun, setFilterTahun] = useState<string>('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [folder, setFolder] = useState<IkiJenisDokumen | null>(null);

  const byYear = filterTahun ? rows.filter(r => r.tahun === filterTahun) : rows;
  const byFolder = folder ? byYear.filter(r => r.jenis === folder) : byYear;
  const q = search.trim().toLowerCase();
  const shown = q
    ? byFolder.filter(r => r.jabatan.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q) || r.nip.toLowerCase().includes(q))
    : byFolder;
  const kpi = {
    total: byFolder.length,
    draft: byFolder.filter(r => r.status === 'DRAFT').length,
    final: byFolder.filter(r => r.status === 'FINAL').length,
  };
  const folderStat = (j: IkiJenisDokumen) => {
    const s = byYear.filter(r => r.jenis === j);
    return { total: s.length, draft: s.filter(r => r.status === 'DRAFT').length, final: s.filter(r => r.status === 'FINAL').length };
  };
  function openFolder(j: IkiJenisDokumen) { setFolder(j); setSearch(''); exitSelect(); }
  function backToFolders() { setFolder(null); setSearch(''); exitSelect(); }
  function openCreate() { setForm(f => ({ ...f, jenis: folder ?? 'MURNI' })); setShowCreate(true); }

  const [dupTarget, setDupTarget] = useState<IkiListRow | null>(null);
  const [dupTahun, setDupTahun] = useState('');
  const [dupBusy, setDupBusy] = useState(false);

  const [showZip, setShowZip] = useState(false);
  const [zipTahun, setZipTahun] = useState('');
  const [zipOnlyFinal, setZipOnlyFinal] = useState(true);
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

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    const chosen = rows.filter(r => selected.has(r.id));
    const isSA = role === 'SUPER_ADMIN';
    const finalCount = chosen.filter(r => r.status === 'FINAL').length;
    const finalNote = finalCount === 0 ? '' : isSA
      ? ` Termasuk ${finalCount} dokumen FINAL.`
      : ` ${finalCount} dokumen FINAL akan DILEWATI — hanya SUPER_ADMIN yang bisa menghapus FINAL.`;
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
      // Cocokkan penghapusan lokal dgn logika server: non-SA melewati FINAL.
      const removed = new Set(chosen.filter(r => isSA || r.status !== 'FINAL').map(r => r.id));
      setRows(prev => prev.filter(r => !removed.has(r.id)));
      toast.success(`${json.deleted} dokumen dihapus${json.skippedFinal ? `, ${json.skippedFinal} FINAL dilewati` : ''}`);
      exitSelect();
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBulkBusy(false); }
  }

  async function load() {
    try {
      const res = await fetch('/api/iki');
      const json = await res.json();
      if (json.ok) setRows(json.data);
    } catch { toast.error('Gagal memuat'); }
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
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal membuat dokumen'); return; }
      toast.success('Dokumen IKI dibuat');
      router.push(`/iki/${json.id}`);
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBusy(false); }
  }

  async function handleDelete(d: IkiListRow) {
    if (!(await confirmDialog({
      title: 'Hapus dokumen IKI',
      message: `Hapus IKI ${d.jabatan} (${d.nama}) tahun ${d.tahun}? Seluruh isi terhapus permanen.`,
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

  async function handleDuplicate() {
    if (!dupTarget) return;
    if (!/^\d{4}$/.test(dupTahun)) { toast.error('Tahun tujuan 4 digit'); return; }
    setDupBusy(true);
    try {
      const res = await fetch(`/api/iki/${dupTarget.id}/duplicate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahun_target: dupTahun }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal menduplikasi'); return; }
      toast.success(`Dokumen diduplikasi ke tahun ${dupTahun}`);
      setDupTarget(null);
      router.push(`/iki/${json.id}`);
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setDupBusy(false); }
  }

  const MAX_ZIP = 100;

  async function handleZipExport() {
    const tahun = zipTahun || tahunList[0];
    if (!tahun) return;
    const list = rows
      .filter(r => r.tahun === tahun && (!folder || r.jenis === folder) && (!zipOnlyFinal || r.status === 'FINAL'))
      .slice(0, MAX_ZIP);
    if (list.length === 0) { toast.error(`Tidak ada dokumen${zipOnlyFinal ? ' FINAL' : ''} di tahun ${tahun}`); return; }
    setZipBusy(true);
    try {
      const [{ default: PizZip }, { buildIkiPdfBytes }, { ikiFilename }] = await Promise.all([
        import('pizzip'),
        import('@/lib/iki/export-pdf'),
        import('@/lib/iki/layout'),
      ]);
      const zip = new PizZip();
      let done = 0, skipped = 0;
      for (const r of list) {
        setZipProgress(`${done + skipped + 1}/${list.length} — ${r.jabatan}`);
        try {
          const res = await fetch(`/api/iki/${r.id}`);
          const json = await res.json();
          if (!json.ok || !json.data?.rhk?.length) { skipped++; continue; }
          const bytes = await buildIkiPdfBytes(json.data);
          zip.file(`${r.status === 'DRAFT' ? 'DRAFT_' : ''}${ikiFilename(json.data, r.tahun, 'pdf')}`, bytes);
          done++;
        } catch { skipped++; }
      }
      if (done === 0) { toast.error('Tidak ada dokumen yang bisa di-export (RHK kosong?)'); return; }
      const blob = zip.generate({ type: 'blob', compression: 'DEFLATE' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `IKI_${folder ? `${folder}_` : ''}${tahun}.zip`; a.click();
      URL.revokeObjectURL(url);
      fetch('/api/iki/export-log', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'pdf', mode: 'massal', tahun, jumlah: done }),
      }).catch(() => {});
      toast.success(`${done} PDF di-zip${skipped ? `, ${skipped} dilewati (RHK kosong/gagal)` : ''}`);
      setShowZip(false);
    } catch { toast.error('Gagal membuat zip'); }
    finally { setZipBusy(false); setZipProgress(''); }
  }

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
        <div className="iki-main-head">
          <div>
            {folder === null ? (
              <>
                <h1 className="iki-h1"><ClipboardCheck size={22} /> Dokumen IKI</h1>
                <p className="iki-sub">Beranda · pilih jenis dokumen untuk mulai</p>
              </>
            ) : (
              <div className="iki-back-row">
                <button className="iki-backbtn" onClick={backToFolders} data-tooltip="Kembali ke pilihan jenis" data-tooltip-pos="below" aria-label="Kembali ke pilihan jenis"><ChevronLeft size={18} /></button>
                <div>
                  <h1 className="iki-h1">IKI {folder === 'PERUBAHAN' ? 'Perubahan' : 'Murni'}</h1>
                  <p className="iki-sub">{shown.length} dokumen{filterTahun ? ` · tahun ${filterTahun}` : ''}</p>
                </div>
              </div>
            )}
          </div>
          <div className="iki-head-actions">
            {folder === null ? (
              tahunList.length > 1 && (
                <select className="iki-filter" value={filterTahun} onChange={e => setFilterTahun(e.target.value)}>
                  <option value="">Semua tahun</option>
                  {tahunList.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )
            ) : (
              <>
                {byFolder.length > 0 && !selectMode && (
                  <PrimaButton variant="ghost" iconLeft={<CheckSquare size={16} />} onClick={() => setSelectMode(true)}>Pilih</PrimaButton>
                )}
                {byFolder.length > 0 && (
                  <PrimaButton variant="success" iconLeft={<FolderDown size={16} />}
                    onClick={() => { setZipTahun(filterTahun || tahunList[0] || ''); setShowZip(true); }}>
                    Unduh Zip
                  </PrimaButton>
                )}
                <PrimaButton variant="success" iconLeft={<FileText size={16} />} onClick={() => setShowImportExcel(true)}>Import Excel</PrimaButton>
                <PrimaButton variant="purple" iconLeft={<Plus size={16} />} onClick={openCreate}>Buat IKI</PrimaButton>
              </>
            )}
          </div>
        </div>

        {folder === null ? (
          <div className="iki-folders">
            {(['MURNI', 'PERUBAHAN'] as const).map(j => {
              const st = folderStat(j);
              return (
                <button key={j} className={`iki-folder ${j === 'PERUBAHAN' ? 'ubah' : 'murni'}`} onClick={() => openFolder(j)}>
                  <div className="iki-folder-top">
                    <span className="iki-folder-ic"><Folder size={26} /></span>
                    <ArrowRight size={20} className="iki-folder-arrow" />
                  </div>
                  <div className="iki-folder-name">
                    IKI {j === 'PERUBAHAN' ? 'Perubahan' : 'Murni'}
                    {j === 'PERUBAHAN' && <span className="iki-badge ubah">PERUBAHAN</span>}
                  </div>
                  <div className="iki-folder-sub">{j === 'PERUBAHAN' ? 'Dokumen revisi — judul + kata "PERUBAHAN"' : 'Dokumen indikator kinerja awal tahun'}</div>
                  <div className="iki-folder-stat">
                    <span><b>{st.total}</b> dokumen</span>
                    <span className="d"><b>{st.draft}</b> draft</span>
                    <span className="f"><b>{st.final}</b> final</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
        <>
        <div className="iki-kpi kpi3">
          <div className="iki-kpi-tile"><span className="iki-kpi-lbl total"><FileText size={13} /> Total</span><b>{kpi.total}</b></div>
          <div className="iki-kpi-tile"><span className="iki-kpi-lbl draft"><FileText size={13} /> Draft</span><b>{kpi.draft}</b></div>
          <div className="iki-kpi-tile"><span className="iki-kpi-lbl final"><Lock size={13} /> Final</span><b>{kpi.final}</b></div>
        </div>

        <div className="iki-toolbar">
          <div className="iki-searchbox">
            <Search size={15} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari jabatan, nama, atau NIP…" />
            {search && <button className="iki-search-clear" onClick={() => setSearch('')} aria-label="Kosongkan pencarian">×</button>}
          </div>
          {tahunList.length > 1 && (
            <select className="iki-filter" value={filterTahun} onChange={e => setFilterTahun(e.target.value)}>
              <option value="">Semua tahun</option>
              {tahunList.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <div className="iki-viewtoggle" role="group" aria-label="Tampilan">
            <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} data-tooltip="Kartu" data-tooltip-pos="above"><LayoutGrid size={15} /></button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} data-tooltip="Daftar" data-tooltip-pos="above"><List size={15} /></button>
          </div>
        </div>

        {selectMode && (
          <div className="iki-selbar">
            <span>{selected.size} dipilih</span>
            <button className="iki-sellink" onClick={() => setSelected(new Set(shown.map(r => r.id)))}>Pilih semua ({shown.length})</button>
            <button className="iki-sellink" onClick={() => setSelected(new Set())}>Kosongkan</button>
            <span className="iki-sel-spacer" />
            <PrimaButton variant="danger" size="sm" iconLeft={<Trash2 size={15} />}
              disabled={selected.size === 0 || bulkBusy} onClick={handleBulkDelete}>
              {bulkBusy ? 'Menghapus…' : `Hapus Terpilih (${selected.size})`}
            </PrimaButton>
            <PrimaButton variant="ghost" size="sm" onClick={exitSelect} disabled={bulkBusy}>Selesai</PrimaButton>
          </div>
        )}

        {shown.length === 0 ? (
          byFolder.length === 0 ? (
            <div className="iki-empty"><FileText size={28} /><p>Belum ada dokumen {folder === 'PERUBAHAN' ? 'Perubahan' : 'Murni'}.</p><span>Klik <b>Buat IKI</b> untuk mulai menyusun.</span></div>
          ) : (
            <div className="iki-empty"><Search size={28} /><p>Tidak ada dokumen yang cocok.</p><span>Ubah kata kunci atau filter tahun.</span></div>
          )
        ) : view === 'grid' ? (
          <div className="iki-grid">
            {shown.map(d => (
              <div key={d.id} className={`iki-card${selectMode ? ' selectable' : ''}${selected.has(d.id) ? ' selected' : ''}`}
                onClick={() => selectMode ? toggleSelect(d.id) : router.push(`/iki/${d.id}`)}>
                <div className="iki-card-top">
                  <span className={`iki-avatar${d.varian === 'DIREKTUR' ? ' dir' : ''}`}>{nameInitials(d.nama)}</span>
                  <span className="iki-cyear">{d.tahun}</span>
                  <div className="iki-badges">
                    {selectMode && <span className={`iki-check${selected.has(d.id) ? ' on' : ''}`}>{selected.has(d.id) && <Check size={13} strokeWidth={3} />}</span>}
                    {d.varian === 'DIREKTUR' && <span className="iki-badge dir">DIREKTUR</span>}
                    {d.jenis === 'PERUBAHAN' && <span className="iki-badge ubah">PERUBAHAN</span>}
                    <span className={`iki-badge ${d.status === 'FINAL' ? 'final' : 'draft'}`}>{d.status}</span>
                  </div>
                </div>
                <div className="iki-card-jabatan">{d.jabatan}</div>
                <div className="iki-card-nama">{d.nama}</div>
                <div className="iki-card-foot">
                  <span className="iki-cnip">NIP {d.nip}</span>
                  <span className="iki-rhk">{d.jumlah_rhk} RHK</span>
                </div>
                {!selectMode && (
                  <div className="iki-card-actions" onClick={e => e.stopPropagation()}>
                    <button className="iki-act" data-tooltip="Duplikat ke tahun lain" data-tooltip-pos="above"
                      onClick={() => { setDupTarget(d); setDupTahun(String(Number(d.tahun) + 1)); }}>
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
        ) : (
          <div className="iki-list">
            <div className="iki-list-head">
              <span>Pejabat</span><span>NIP</span><span className="c">RHK</span><span>Status</span><span className="r">{selectMode ? '' : 'Aksi'}</span>
            </div>
            {shown.map(d => (
              <div key={d.id} className={`iki-row${selectMode ? ' selectable' : ''}${selected.has(d.id) ? ' selected' : ''}`}
                onClick={() => selectMode ? toggleSelect(d.id) : router.push(`/iki/${d.id}`)}>
                <div className="iki-row-pej">
                  {selectMode && <span className={`iki-check${selected.has(d.id) ? ' on' : ''}`}>{selected.has(d.id) && <Check size={12} strokeWidth={3} />}</span>}
                  <span className={`iki-avatar sm${d.varian === 'DIREKTUR' ? ' dir' : ''}`}>{nameInitials(d.nama)}</span>
                  <div className="iki-row-txt">
                    <div className="jab">{d.jabatan}</div>
                    <div className="nm">{d.nama}</div>
                  </div>
                </div>
                <span className="iki-cnip mono">{d.nip}</span>
                <span className="c mono">{d.jumlah_rhk}</span>
                <span className="iki-row-badges">
                  {d.varian === 'DIREKTUR' && <span className="iki-badge dir">DIREKTUR</span>}
                  {d.jenis === 'PERUBAHAN' && <span className="iki-badge ubah">PERUBAHAN</span>}
                  <span className={`iki-badge ${d.status === 'FINAL' ? 'final' : 'draft'}`}>{d.status}</span>
                </span>
                {!selectMode ? (
                  <span className="iki-row-act" onClick={e => e.stopPropagation()}>
                    <button className="iki-act" data-tooltip="Duplikat ke tahun lain" data-tooltip-pos="above"
                      onClick={() => { setDupTarget(d); setDupTahun(String(Number(d.tahun) + 1)); }}>
                      <Copy size={14} />
                    </button>
                    {d.status !== 'FINAL'
                      ? <button className="iki-act danger" data-tooltip="Hapus dokumen" data-tooltip-pos="above" onClick={() => handleDelete(d)}><DeleteIcon size={14} /></button>
                      : <span className="iki-act locked" data-tooltip="FINAL — terkunci" data-tooltip-pos="above"><Lock size={13} /></span>}
                  </span>
                ) : <span className="iki-row-act" />}
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </main>

      <FloatingDock isLight={isLight} limelight
        nav={[
          { icon: <ClipboardCheck size={17} />, label: 'IKI', onClick: () => {}, current: true },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => router.push('/menu') },
        ]}
        actions={[
          { icon: <Plus size={17} />, label: 'Buat', onClick: openCreate },
          { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: () => void load() },
        ]}
      />

      {showImportExcel && (
        <ImportIkiModal
          rows={rows}
          initialJenis={folder ?? 'MURNI'}
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
              <div className="iki-tpl">
                <button type="button" className={`iki-tpl-opt${form.varian === 'STANDAR' ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, varian: 'STANDAR' }))}>
                  <b>Standar</b><span>11 kolom + RHK diintervensi (Wadir/Kabid/Kabag/Kasubag)</span>
                </button>
                <button type="button" className={`iki-tpl-opt${form.varian === 'DIREKTUR' ? ' on' : ''}`} onClick={() => setForm(f => ({ ...f, varian: 'DIREKTUR' }))}>
                  <b>Direktur</b><span>8 kolom, ttd tunggal (pejabat puncak)</span>
                </button>
              </div>
            </label>
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
              <PrimaButton variant="purple" size="sm" onClick={handleCreate} disabled={busy}>{busy ? 'Membuat…' : 'Buat'}</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {dupTarget && (
        <div className="iki-modal-bg" onClick={() => !dupBusy && setDupTarget(null)}>
          <div className="iki-modal" onClick={e => e.stopPropagation()}>
            <h3>Duplikat ke Tahun Lain</h3>
            <p className="iki-hint">
              Menyalin seluruh isi <b>{dupTarget.jabatan}</b> ({dupTarget.nama}) tahun {dupTarget.tahun}:
              data pribadi, atasan, dan semua RHK + target triwulan. Hasil duplikat berstatus DRAFT,
              tanggal ttd dikosongkan — tinggal sesuaikan target tahun baru.
            </p>
            <label className="iki-field">
              <span>Tahun Tujuan</span>
              <input value={dupTahun} inputMode="numeric" maxLength={4}
                onChange={e => setDupTahun(e.target.value.replace(/\D/g, ''))} />
            </label>
            <div className="iki-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setDupTarget(null)} disabled={dupBusy}>Batal</PrimaButton>
              <PrimaButton variant="purple" size="sm" onClick={handleDuplicate} disabled={dupBusy}>{dupBusy ? 'Menduplikasi…' : 'Duplikat'}</PrimaButton>
            </div>
          </div>
        </div>
      )}

      {showZip && (
        <div className="iki-modal-bg" onClick={() => !zipBusy && setShowZip(false)}>
          <div className="iki-modal" onClick={e => e.stopPropagation()}>
            <h3>Unduh Semua PDF (Zip)</h3>
            <label className="iki-field">
              <span>Tahun</span>
              <select className="iki-filter" value={zipTahun} onChange={e => setZipTahun(e.target.value)} disabled={zipBusy}>
                {tahunList.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
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
  .iki-main { max-width: 1080px; margin: 0 auto; padding: 30px 22px; }
  .iki-main-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
  .iki-head-actions { display: flex; align-items: center; gap: 10px; }
  .iki-filter { background: #042C53; border: 1px solid #0C447C; color: #E6F1FB; border-radius: 6px; padding: 8px 10px; font-size: 12.5px; }
  .iki-h1 { display: inline-flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 900; margin: 0; letter-spacing: -.4px; }
  .iki-sub { font-size: 13px; color: #85B7EB; margin: 5px 0 0; }
  .iki-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #85B7EB; padding: 80px 20px; border: 1px dashed #0C447C; border-radius: 14px; }
  .iki-empty p { font-size: 15px; font-weight: 600; margin: 4px 0 0; color: #B5D4F4; }
  .iki-empty span { font-size: 12.5px; }
  .iki-back-row { display: flex; align-items: center; gap: 12px; }
  .iki-backbtn { width: 38px; height: 38px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; flex-shrink: 0; }
  .iki-backbtn:hover { border-color: #185FA5; color: #E6F1FB; background: rgba(255,255,255,0.09); }
  .iki-folders { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .iki-folder { text-align: left; background: #042C53; border: 1px solid #0C447C; border-radius: 14px; padding: 22px; cursor: pointer; color: #E6F1FB; font-family: inherit; transition: transform .12s, border-color .12s, box-shadow .12s; }
  .iki-folder:hover { transform: translateY(-3px); border-color: #185FA5; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
  .iki-folder-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .iki-folder-ic { width: 52px; height: 52px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; background: rgba(239,159,39,0.14); color: #F5C77E; }
  .iki-folder.ubah .iki-folder-ic { background: rgba(186,117,23,0.16); color: #FAC775; }
  .iki-folder-arrow { color: #85B7EB; }
  .iki-folder-name { font-size: 17px; font-weight: 800; margin-bottom: 3px; display: flex; align-items: center; gap: 8px; }
  .iki-folder-sub { font-size: 12px; color: #85B7EB; margin-bottom: 14px; }
  .iki-folder-stat { display: flex; gap: 16px; font-size: 11.5px; border-top: 1px solid rgba(12,68,124,0.6); padding-top: 12px; color: #B5D4F4; }
  .iki-folder-stat b { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 800; color: #E6F1FB; margin-right: 3px; }
  .iki-folder-stat .d b { color: #B9A6FF; }
  .iki-folder-stat .f b { color: #7BE0BD; }
  .iki-kpi { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .iki-kpi.kpi3 { grid-template-columns: repeat(3, 1fr); }
  .iki-kpi-tile { background: #042C53; border: 1px solid #0C447C; border-radius: 10px; padding: 12px 14px; }
  .iki-kpi-tile b { display: block; font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 800; margin-top: 3px; color: #E6F1FB; }
  .iki-kpi-lbl { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; }
  .iki-kpi-lbl.total { color: #85B7EB; }
  .iki-kpi-lbl.draft { color: #B9A6FF; }
  .iki-kpi-lbl.final { color: #7BE0BD; }
  .iki-kpi-lbl.ubah { color: #FAC775; }
  .iki-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .iki-searchbox { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 8px; background: #042C53; border: 1px solid #0C447C; border-radius: 8px; padding: 0 11px; height: 38px; color: #85B7EB; }
  .iki-searchbox input { flex: 1; background: none; border: none; outline: none; color: #E6F1FB; font-size: 12.5px; font-family: 'Inter', sans-serif; }
  .iki-searchbox input::placeholder { color: #5f86ad; }
  .iki-search-clear { background: none; border: none; color: #85B7EB; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .iki-search-clear:hover { color: #E6F1FB; }
  .iki-viewtoggle { display: flex; background: #042C53; border: 1px solid #0C447C; border-radius: 8px; padding: 3px; gap: 2px; }
  .iki-viewtoggle button { background: none; border: none; color: #85B7EB; width: 32px; height: 30px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; }
  .iki-viewtoggle button:hover { color: #E6F1FB; }
  .iki-viewtoggle button.on { background: #185FA5; color: #fff; }
  .iki-list { background: #042C53; border: 1px solid #0C447C; border-radius: 12px; overflow: hidden; }
  .iki-list-head, .iki-row { display: grid; grid-template-columns: minmax(0,2.5fr) 1.3fr 52px 1.4fr 74px; gap: 12px; align-items: center; padding: 11px 16px; }
  .iki-list-head { background: rgba(12,68,124,0.35); font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #85B7EB; }
  .iki-list-head .c { text-align: center; }
  .iki-list-head .r { text-align: right; }
  .iki-row { border-top: 1px solid rgba(12,68,124,0.5); cursor: pointer; transition: background .12s; }
  .iki-row:nth-child(even) { background: rgba(255,255,255,0.015); }
  .iki-row:hover { background: rgba(24,95,165,0.16); }
  .iki-row.selected { background: rgba(124,92,252,0.14); }
  .iki-row-pej { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .iki-row-txt { min-width: 0; }
  .iki-row-txt .jab { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-row-txt .nm { font-size: 11px; color: #B5D4F4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-row .mono { font-family: 'JetBrains Mono', monospace; }
  .iki-row .iki-cnip { font-size: 11px; color: #85B7EB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-row .c { text-align: center; font-size: 12px; }
  .iki-row-badges { display: flex; gap: 5px; flex-wrap: wrap; }
  .iki-row-act { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
  .iki-act.locked { color: #5f86ad; cursor: default; background: none; border-color: transparent; }
  .iki-act.locked:hover { color: #5f86ad; background: none; border-color: transparent; }
  @media (max-width: 640px) { .iki-kpi { grid-template-columns: repeat(2, 1fr); } .iki-folders { grid-template-columns: 1fr; } }
  .iki-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
  .iki-card { background: #042C53; border: 1px solid #0C447C; border-radius: 12px; padding: 16px; cursor: pointer; transition: transform .12s, border-color .12s, box-shadow .12s; position: relative; display: flex; flex-direction: column; min-height: 176px; }
  .iki-card:hover { transform: translateY(-3px); border-color: #185FA5; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
  .iki-card.selected { border-color: #7C5CFC; box-shadow: 0 0 0 2px rgba(124,92,252,.4); }
  .iki-check { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid #185FA5; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.04); color: #fff; flex-shrink: 0; }
  .iki-check.on { background: #7C5CFC; border-color: #7C5CFC; }
  .iki-selbar { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; padding: 10px 14px; background: #042C53; border: 1px solid #0C447C; border-radius: 10px; flex-wrap: wrap; position: sticky; top: 66px; z-index: 100; }
  .iki-selbar > span:first-child { font-size: 13px; font-weight: 700; color: #E6F1FB; }
  .iki-sellink { background: none; border: none; color: #85B7EB; font-size: 12px; cursor: pointer; text-decoration: underline; padding: 0; }
  .iki-sellink:hover { color: #E6F1FB; }
  .iki-sel-spacer { flex: 1; }
  .iki-card-top { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
  .iki-avatar { width: 40px; height: 40px; border-radius: 10px; background: rgba(239,159,39,0.14); color: #F5C77E; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .iki-avatar.dir { background: rgba(29,158,117,0.14); color: #7BE0BD; }
  .iki-avatar.sm { width: 32px; height: 32px; border-radius: 8px; font-size: 11.5px; }
  .iki-cyear { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 700; color: #EF9F27; }
  .iki-badges { display: flex; gap: 6px; margin-left: auto; align-items: center; }
  .iki-badge { font-size: 10px; font-weight: 800; letter-spacing: .07em; padding: 3px 9px; border-radius: 99px; }
  .iki-badge.draft { background: rgba(124,92,252,0.16); color: #B9A6FF; border: 1px solid rgba(124,92,252,0.4); }
  .iki-badge.final { background: rgba(29,158,117,0.16); color: #7BE0BD; border: 1px solid rgba(29,158,117,0.4); }
  .iki-badge.dir { background: rgba(239,159,39,0.14); color: #F5C77E; border: 1px solid rgba(239,159,39,0.4); }
  .iki-badge.ubah { background: rgba(186,117,23,0.16); color: #FAC775; border: 1px solid rgba(186,117,23,0.45); }
  .iki-card-jabatan { font-size: 13px; font-weight: 700; line-height: 1.35; margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 35px; }
  .iki-card-nama { font-size: 12px; color: #B5D4F4; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(12,68,124,0.55); }
  .iki-cnip { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: #85B7EB; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .iki-rhk { font-size: 10.5px; color: #7BE0BD; background: rgba(29,158,117,0.12); padding: 2px 8px; border-radius: 99px; white-space: nowrap; flex-shrink: 0; }
  .iki-card-actions { display: flex; gap: 6px; margin-top: 10px; min-height: 32px; }
  .iki-act { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; }
  .iki-act:hover { border-color: #185FA5; color: #E6F1FB; background: rgba(255,255,255,0.09); }
  .iki-act.danger:hover { border-color: #E24B4A; color: #FCA5A5; background: rgba(226,75,74,0.1); }
  .iki-modal-bg { position: fixed; inset: 0; background: rgba(2,15,28,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .iki-modal { background: #042C53; border: 1px solid #0C447C; border-radius: 14px; padding: 22px; width: 430px; max-width: 92vw; max-height: 90vh; overflow-y: auto; }
  .iki-modal h3 { margin: 0 0 16px; font-size: 16px; font-weight: 800; }
  .iki-field { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #B5D4F4; margin-bottom: 12px; }
  .iki-field input { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 9px 11px; color: #E6F1FB; font-size: 13px; }
  .iki-field input:focus { outline: none; border-color: #185FA5; }
  .iki-hint { font-size: 11.5px; color: #85B7EB; line-height: 1.5; margin: 0 0 18px; }
  .iki-suggest-hint { font-size: 10.5px; color: #7BE0BD; line-height: 1.4; }
  .iki-tpl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .iki-tpl-opt { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left; padding: 9px 11px; background: #020F1C; border: 1px solid #0C447C; border-radius: 8px; color: #B5D4F4; cursor: pointer; transition: border-color .15s, background .15s; }
  .iki-tpl-opt b { font-size: 12.5px; color: #E6F1FB; }
  .iki-tpl-opt span { font-size: 10.5px; color: #85B7EB; }
  .iki-tpl-opt:hover { border-color: #185FA5; }
  .iki-tpl-opt.on { border-color: #7C5CFC; background: rgba(124,92,252,0.14); }
  .iki-tpl-opt.on b { color: #C9BCFF; }
  .iki-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

  /* ── LIGHT THEME ── */
  [data-theme="light"] .iki-list-body { background: #F5F5F7; color: #0F0F12; }
  [data-theme="light"] .iki-topbar { background: rgba(255,255,255,0.92); border-bottom-color: rgba(0,0,0,.1); box-shadow: 0 2px 12px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-brand { color: #B26B00; }
  [data-theme="light"] .iki-brand-sub, [data-theme="light"] .iki-sub, [data-theme="light"] .iki-card-meta, [data-theme="light"] .iki-empty { color: #6B7280; }
  [data-theme="light"] .iki-filter { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-card { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-card:hover { border-color: #8B5CF6; box-shadow: 0 12px 28px rgba(15,15,18,.12); }
  [data-theme="light"] .iki-card.selected { border-color: #7C5CFC; box-shadow: 0 0 0 2px rgba(124,92,252,.3); }
  [data-theme="light"] .iki-selbar { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-selbar > span:first-child { color: #0F0F12; }
  [data-theme="light"] .iki-sellink { color: #6B7280; }
  [data-theme="light"] .iki-sellink:hover { color: #0F0F12; }
  [data-theme="light"] .iki-check { border-color: rgba(0,0,0,.2); background: #F3F4F6; }
  [data-theme="light"] .iki-check.on { background: #7C5CFC; border-color: #7C5CFC; }
  [data-theme="light"] .iki-kpi-tile { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-kpi-tile b { color: #0F0F12; }
  [data-theme="light"] .iki-searchbox, [data-theme="light"] .iki-viewtoggle { background: #FFFFFF; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .iki-searchbox input { color: #0F0F12; }
  [data-theme="light"] .iki-searchbox input::placeholder { color: #9aa3af; }
  [data-theme="light"] .iki-viewtoggle button { color: #6B7280; }
  [data-theme="light"] .iki-viewtoggle button.on { background: #185FA5; color: #fff; }
  [data-theme="light"] .iki-avatar { background: rgba(178,107,0,.12); color: #B26B00; }
  [data-theme="light"] .iki-avatar.dir { background: rgba(15,138,99,.12); color: #0F8A63; }
  [data-theme="light"] .iki-cyear { color: #B26B00; }
  [data-theme="light"] .iki-cnip { color: #6B7280; }
  [data-theme="light"] .iki-card-foot { border-top-color: rgba(0,0,0,.08); }
  [data-theme="light"] .iki-list { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .iki-list-head { background: #F3F4F6; color: #6B7280; }
  [data-theme="light"] .iki-row { border-top-color: rgba(0,0,0,.07); }
  [data-theme="light"] .iki-row:nth-child(even) { background: rgba(0,0,0,.012); }
  [data-theme="light"] .iki-row:hover { background: #EEF4FB; }
  [data-theme="light"] .iki-row-txt .nm, [data-theme="light"] .iki-row .iki-cnip { color: #6B7280; }
  [data-theme="light"] .iki-backbtn { background: #F3F4F6; border-color: rgba(0,0,0,.1); color: #4B5563; }
  [data-theme="light"] .iki-backbtn:hover { border-color: #8B5CF6; color: #0F0F12; background: #EDE9FE; }
  [data-theme="light"] .iki-folder { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); color: #0F0F12; }
  [data-theme="light"] .iki-folder:hover { border-color: #8B5CF6; box-shadow: 0 12px 28px rgba(15,15,18,.12); }
  [data-theme="light"] .iki-folder-ic { background: rgba(178,107,0,.12); color: #B26B00; }
  [data-theme="light"] .iki-folder.ubah .iki-folder-ic { background: rgba(186,117,23,.14); color: #8a5a12; }
  [data-theme="light"] .iki-folder-sub, [data-theme="light"] .iki-folder-stat { color: #6B7280; }
  [data-theme="light"] .iki-folder-stat b { color: #0F0F12; }
  [data-theme="light"] .iki-card-jabatan { color: #0F0F12; }
  [data-theme="light"] .iki-card-nama { color: #4B5563; }
  [data-theme="light"] .iki-year { color: #B26B00; }
  [data-theme="light"] .iki-act { background: #F3F4F6; border-color: rgba(0,0,0,.1); color: #4B5563; }
  [data-theme="light"] .iki-act:hover { border-color: #8B5CF6; color: #0F0F12; background: #EDE9FE; }
  [data-theme="light"] .iki-empty { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .iki-empty p { color: #374151; }
  [data-theme="light"] .iki-modal { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .iki-field, [data-theme="light"] .iki-hint { color: #6B7280; }
  [data-theme="light"] .iki-suggest-hint { color: #0F8A63; }
  [data-theme="light"] .iki-field input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-tpl-opt { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .iki-tpl-opt b { color: #111827; }
  [data-theme="light"] .iki-tpl-opt span { color: #6B7280; }
  [data-theme="light"] .iki-tpl-opt.on { border-color: #7C5CFC; background: rgba(124,92,252,0.1); }
  [data-theme="light"] .iki-tpl-opt.on b { color: #6D28D9; }
  [data-theme="light"] .iki-list-body .btn-prima { border-color: rgba(15,15,18,.18); }
  [data-theme="light"] .iki-list-body .btn-prima[data-variant="purple"] { background: #EDE7FE; border-color: rgba(124,92,252,.55); color: #5B21B6; }
  [data-theme="light"] .iki-list-body .btn-prima[data-variant="purple"]:hover:not(:disabled) { background: #E2D8FC; }
`;
