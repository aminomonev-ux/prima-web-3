'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardCheck, Copy, FileText, FolderDown, Plus, LayoutGrid, RefreshCw } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import type { IkiListRow, IkiVarian } from './_lib/types';

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
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    tahun: String(new Date().getFullYear()),
    varian: 'STANDAR' as IkiVarian,
    nama: '',
    nip: '',
    jabatan: '',
  });

  const tahunList = [...new Set(rows.map(r => r.tahun))].sort().reverse();
  const [filterTahun, setFilterTahun] = useState<string>('');
  const shown = filterTahun ? rows.filter(r => r.tahun === filterTahun) : rows;

  const [dupTarget, setDupTarget] = useState<IkiListRow | null>(null);
  const [dupTahun, setDupTahun] = useState('');
  const [dupBusy, setDupBusy] = useState(false);

  const [showZip, setShowZip] = useState(false);
  const [zipTahun, setZipTahun] = useState('');
  const [zipOnlyFinal, setZipOnlyFinal] = useState(true);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState('');

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
      .filter(r => r.tahun === tahun && (!zipOnlyFinal || r.status === 'FINAL'))
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
      a.href = url; a.download = `IKI_${tahun}.zip`; a.click();
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
            <h1 className="iki-h1"><ClipboardCheck size={22} /> Dokumen IKI</h1>
            <p className="iki-sub">Indikator Kinerja Individu per pejabat per tahun · {shown.length} dokumen</p>
          </div>
          <div className="iki-head-actions">
            {tahunList.length > 1 && (
              <select className="iki-filter" value={filterTahun} onChange={e => setFilterTahun(e.target.value)}>
                <option value="">Semua tahun</option>
                {tahunList.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {rows.length > 0 && (
              <PrimaButton variant="success" iconLeft={<FolderDown size={16} />}
                onClick={() => { setZipTahun(filterTahun || tahunList[0] || ''); setShowZip(true); }}>
                Unduh Semua (Zip)
              </PrimaButton>
            )}
            <PrimaButton variant="purple" iconLeft={<Plus size={16} />} onClick={() => setShowCreate(true)}>Buat IKI</PrimaButton>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="iki-empty"><FileText size={28} /><p>Belum ada dokumen IKI.</p><span>Klik <b>Buat IKI</b> untuk mulai menyusun.</span></div>
        ) : (
          <div className="iki-grid">
            {shown.map(d => (
              <div key={d.id} className="iki-card" onClick={() => router.push(`/iki/${d.id}`)}>
                <div className="iki-card-top">
                  <span className="iki-year">{d.tahun}</span>
                  <div className="iki-badges">
                    {d.varian === 'DIREKTUR' && <span className="iki-badge dir">DIREKTUR</span>}
                    <span className={`iki-badge ${d.status === 'FINAL' ? 'final' : 'draft'}`}>{d.status}</span>
                  </div>
                </div>
                <div className="iki-card-jabatan">{d.jabatan}</div>
                <div className="iki-card-nama">{d.nama}</div>
                <div className="iki-card-meta">NIP {d.nip} · {d.jumlah_rhk} RHK</div>
                <div className="iki-card-actions" onClick={e => e.stopPropagation()}>
                  <button className="iki-act" data-tooltip="Duplikat ke tahun lain" data-tooltip-pos="above"
                    onClick={() => { setDupTarget(d); setDupTahun(String(Number(d.tahun) + 1)); }}>
                    <Copy size={15} />
                  </button>
                  {d.status !== 'FINAL' && (
                    <button className="iki-act danger" data-tooltip="Hapus dokumen" data-tooltip-pos="above" onClick={() => handleDelete(d)}><DeleteIcon size={15} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <FloatingDock isLight={isLight} limelight
        nav={[
          { icon: <ClipboardCheck size={17} />, label: 'IKI', onClick: () => {}, current: true },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => router.push('/menu') },
        ]}
        actions={[
          { icon: <Plus size={17} />, label: 'Buat', onClick: () => setShowCreate(true) },
          { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: () => void load() },
        ]}
      />

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
              <span>Nama Pejabat (+ gelar)</span>
              <input value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))} placeholder="dr. FULAN, M.Kes" />
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
  .iki-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
  .iki-card { background: #042C53; border: 1px solid #0C447C; border-radius: 12px; padding: 16px; cursor: pointer; transition: transform .12s, border-color .12s, box-shadow .12s; position: relative; }
  .iki-card:hover { transform: translateY(-3px); border-color: #185FA5; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
  .iki-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .iki-year { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 800; color: #EF9F27; }
  .iki-badges { display: flex; gap: 6px; }
  .iki-badge { font-size: 10px; font-weight: 800; letter-spacing: .07em; padding: 3px 9px; border-radius: 99px; }
  .iki-badge.draft { background: rgba(124,92,252,0.16); color: #B9A6FF; border: 1px solid rgba(124,92,252,0.4); }
  .iki-badge.final { background: rgba(29,158,117,0.16); color: #7BE0BD; border: 1px solid rgba(29,158,117,0.4); }
  .iki-badge.dir { background: rgba(239,159,39,0.14); color: #F5C77E; border: 1px solid rgba(239,159,39,0.4); }
  .iki-card-jabatan { font-size: 13.5px; font-weight: 700; line-height: 1.4; margin-bottom: 4px; }
  .iki-card-nama { font-size: 12.5px; color: #B5D4F4; margin-bottom: 6px; }
  .iki-card-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #85B7EB; }
  .iki-card-actions { display: flex; gap: 6px; margin-top: 14px; min-height: 32px; }
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
  [data-theme="light"] .iki-card-jabatan { color: #0F0F12; }
  [data-theme="light"] .iki-card-nama { color: #4B5563; }
  [data-theme="light"] .iki-year { color: #B26B00; }
  [data-theme="light"] .iki-act { background: #F3F4F6; border-color: rgba(0,0,0,.1); color: #4B5563; }
  [data-theme="light"] .iki-act:hover { border-color: #8B5CF6; color: #0F0F12; background: #EDE9FE; }
  [data-theme="light"] .iki-empty { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .iki-empty p { color: #374151; }
  [data-theme="light"] .iki-modal { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .iki-field, [data-theme="light"] .iki-hint { color: #6B7280; }
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
