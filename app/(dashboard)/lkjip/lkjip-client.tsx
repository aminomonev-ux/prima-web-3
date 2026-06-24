'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Plus, BookText, LayoutGrid, RefreshCw } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import DownloadButton from '@/components/ui/DownloadButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import type { LkjipDokumen } from '@/lib/lkjip/data';

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialRows: LkjipDokumen[];
}

export default function LkjipClient({ username, role, themePreference, initialRows }: Props) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const [rows, setRows] = useState<LkjipDokumen[]>(initialRows);
  const [showCreate, setShowCreate] = useState(false);
  const [tahun, setTahun] = useState<number>(new Date().getFullYear());
  const [template, setTemplate] = useState<'standar' | 'kosong'>('standar');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/lkjip');
      const json = await res.json();
      if (json.ok) setRows(json.rows);
    } catch { toast.error('Gagal memuat'); }
  }

  async function handleCreate() {
    setBusy(true);
    try {
      const res = await fetch('/api/lkjip', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahun, template }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.msg ?? 'Gagal membuat dokumen'); return; }
      toast.success('Dokumen E-LKJIP dibuat');
      router.push(`/lkjip/${json.id}`);
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBusy(false); }
  }

  async function handleDelete(d: LkjipDokumen) {
    if (!(await confirmDialog({ title: 'Hapus dokumen', message: `Hapus "${d.judul}"? Semua bab & isi ikut terhapus permanen.`, variant: 'danger' }))) return;
    try {
      const res = await fetch(`/api/lkjip?id=${d.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) { toast.error(json.msg ?? 'Gagal menghapus'); return; }
      setRows(prev => prev.filter(r => r.id !== d.id));
      toast.success('Dokumen dihapus');
    } catch { toast.error('Gagal terhubung ke server'); }
  }

  return (
    <div className={`lk-list-body${isLight ? ' light' : ''}`}>
      <style>{LIST_CSS}</style>

      <header className="lk-topbar">
        <div className="lk-brand"><BookText size={18} /> E-LKJIP <span className="lk-brand-sub">Laporan Kinerja Instansi Pemerintah</span></div>
        <div className="lk-topbar-right">
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <main className="lk-main">
        <div className="lk-main-head">
          <div>
            <h1 className="lk-h1"><BookText size={22} /> Dokumen E-LKJIP</h1>
            <p className="lk-sub">Penyusun laporan kinerja tahunan · {rows.length} dokumen</p>
          </div>
          <span data-rima="lkjip.list-buat" style={{ display: 'inline-flex' }}>
            <PrimaButton variant="purple" iconLeft={<Plus size={16} />} onClick={() => setShowCreate(true)}>Buat E-LKJIP</PrimaButton>
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="lk-empty"><FileText size={28} /><p>Belum ada dokumen E-LKJIP.</p><span>Klik <b>Buat E-LKJIP</b> untuk mulai menyusun.</span></div>
        ) : (
          <div className="lk-grid">
            {rows.map(d => (
              <div key={d.id} className="lk-card" onClick={() => router.push(`/lkjip/${d.id}`)}>
                <div className="lk-card-top">
                  <span className="lk-year">{d.tahun}</span>
                  <span className={`lk-badge ${d.status === 'FINAL' ? 'final' : 'draft'}`}>{d.status}</span>
                </div>
                <div className="lk-card-judul">{d.judul}</div>
                <div className="lk-card-meta">{d.canonical_id}</div>
                <div className="lk-card-actions" onClick={e => e.stopPropagation()}>
                  <DownloadButton variant="word" label="Word" size="sm" data-tooltip="Unduh Word" data-tooltip-pos="above" onClick={() => window.open(`/api/lkjip/${d.id}/generate`, '_blank')} />
                  {d.status !== 'FINAL' && (
                    <button className="lk-act danger" data-tooltip="Hapus dokumen" data-tooltip-pos="above" onClick={() => handleDelete(d)}><DeleteIcon size={15} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <FloatingDock isLight={isLight} limelight
        nav={[
          { icon: <BookText size={17} />, label: 'E-LKJIP', onClick: () => {}, current: true },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => router.push('/menu') },
        ]}
        actions={[
          { icon: <Plus size={17} />, label: 'Buat', onClick: () => setShowCreate(true) },
          { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: () => void load() },
        ]}
      />

      {showCreate && (
        <div className="lk-modal-bg" onClick={() => !busy && setShowCreate(false)}>
          <div className="lk-modal" onClick={e => e.stopPropagation()}>
            <h3>Buat Dokumen E-LKJIP</h3>
            <label className="lk-field">
              <span>Tahun Laporan</span>
              <PrimaNumberField value={tahun} min={2015} max={2100} onChange={e => setTahun(Number(e.target.value))} />
            </label>
            <label className="lk-field">
              <span>Struktur Awal</span>
              <div className="lk-tpl">
                <button type="button" className={`lk-tpl-opt${template === 'standar' ? ' on' : ''}`} onClick={() => setTemplate('standar')}>
                  <b>Standar</b><span>BAB I–V otomatis</span>
                </button>
                <button type="button" className={`lk-tpl-opt${template === 'kosong' ? ' on' : ''}`} onClick={() => setTemplate('kosong')}>
                  <b>Kosong</b><span>Susun bab sendiri</span>
                </button>
              </div>
            </label>
            <p className="lk-hint">{template === 'standar'
              ? 'Kerangka BAB I–V dibuat otomatis. Anda bisa menambah/menghapus bab & isi setelahnya.'
              : 'Dokumen dibuat kosong tanpa bab — Anda susun seluruh kerangka sendiri.'}</p>
            <div className="lk-modal-actions">
              <PrimaButton variant="ghost" size="sm" onClick={() => setShowCreate(false)} disabled={busy}>Batal</PrimaButton>
              <PrimaButton variant="purple" size="sm" onClick={handleCreate} disabled={busy}>{busy ? 'Membuat…' : 'Buat'}</PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const LIST_CSS = `
  .lk-list-body { min-height: 100vh; background: #020F1C; color: #E6F1FB; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; padding-bottom: 110px; }
  .lk-topbar { position: sticky; top: 0; z-index: 200; display: flex; align-items: center; justify-content: space-between; padding: 10px 22px; min-height: 56px; background: rgba(4,44,83,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid #0C447C; }
  .lk-brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 800; font-size: 16px; color: #EF9F27; }
  .lk-brand-sub { font-weight: 500; font-size: 11.5px; color: #85B7EB; }
  .lk-topbar-right { display: flex; align-items: center; gap: 12px; }
  .lk-main { max-width: 1080px; margin: 0 auto; padding: 30px 22px; }
  .lk-main-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
  .lk-h1 { display: inline-flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 900; margin: 0; letter-spacing: -.4px; }
  .lk-sub { font-size: 13px; color: #85B7EB; margin: 5px 0 0; }
  .lk-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #85B7EB; padding: 80px 20px; border: 1px dashed #0C447C; border-radius: 14px; }
  .lk-empty p { font-size: 15px; font-weight: 600; margin: 4px 0 0; color: #B5D4F4; }
  .lk-empty span { font-size: 12.5px; }
  .lk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(264px, 1fr)); gap: 18px; }
  .lk-card { background: #042C53; border: 1px solid #0C447C; border-radius: 12px; padding: 16px; cursor: pointer; transition: transform .12s, border-color .12s, box-shadow .12s; position: relative; }
  .lk-card:hover { transform: translateY(-3px); border-color: #185FA5; box-shadow: 0 12px 28px rgba(0,0,0,.35); }
  .lk-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .lk-year { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 800; color: #EF9F27; }
  .lk-badge { font-size: 10px; font-weight: 800; letter-spacing: .07em; padding: 3px 9px; border-radius: 99px; }
  .lk-badge.draft { background: rgba(124,92,252,0.16); color: #B9A6FF; border: 1px solid rgba(124,92,252,0.4); }
  .lk-badge.final { background: rgba(29,158,117,0.16); color: #7BE0BD; border: 1px solid rgba(29,158,117,0.4); }
  .lk-card-judul { font-size: 13.5px; font-weight: 600; line-height: 1.45; margin-bottom: 6px; }
  .lk-card-meta { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #85B7EB; }
  .lk-card-actions { display: flex; gap: 6px; margin-top: 14px; }
  .lk-act { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; }
  .lk-act:hover { border-color: #185FA5; color: #E6F1FB; background: rgba(255,255,255,0.09); }
  .lk-act.danger:hover { border-color: #E24B4A; color: #FCA5A5; background: rgba(226,75,74,0.1); }
  .lk-modal-bg { position: fixed; inset: 0; background: rgba(2,15,28,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .lk-modal { background: #042C53; border: 1px solid #0C447C; border-radius: 14px; padding: 22px; width: 390px; max-width: 92vw; }
  .lk-modal h3 { margin: 0 0 16px; font-size: 16px; font-weight: 800; }
  .lk-field { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: #B5D4F4; margin-bottom: 12px; }
  .lk-field input { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 9px 11px; color: #E6F1FB; font-family: 'JetBrains Mono', monospace; font-size: 14px; }
  .lk-field input:focus { outline: none; border-color: #185FA5; }
  .lk-hint { font-size: 11.5px; color: #85B7EB; line-height: 1.5; margin: 0 0 18px; }
  .lk-tpl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .lk-tpl-opt { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: left; padding: 9px 11px; background: #020F1C; border: 1px solid #0C447C; border-radius: 8px; color: #B5D4F4; cursor: pointer; transition: border-color .15s, background .15s; }
  .lk-tpl-opt b { font-size: 12.5px; color: #E6F1FB; }
  .lk-tpl-opt span { font-size: 10.5px; color: #85B7EB; }
  .lk-tpl-opt:hover { border-color: #185FA5; }
  .lk-tpl-opt.on { border-color: #7C5CFC; background: rgba(124,92,252,0.14); }
  .lk-tpl-opt.on b { color: #C9BCFF; }
  .lk-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

  /* ── LIGHT THEME ── */
  [data-theme="light"] .lk-list-body { background: #F5F5F7; color: #0F0F12; }
  [data-theme="light"] .lk-topbar { background: rgba(255,255,255,0.92); border-bottom-color: rgba(0,0,0,.1); box-shadow: 0 2px 12px rgba(15,15,18,.06); }
  [data-theme="light"] .lk-brand { color: #B26B00; }
  [data-theme="light"] .lk-brand-sub, [data-theme="light"] .lk-sub, [data-theme="light"] .lk-card-meta, [data-theme="light"] .lk-empty { color: #6B7280; }
  [data-theme="light"] .lk-card { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .lk-card:hover { border-color: #8B5CF6; box-shadow: 0 12px 28px rgba(15,15,18,.12); }
  [data-theme="light"] .lk-card-judul { color: #0F0F12; }
  [data-theme="light"] .lk-year { color: #B26B00; }
  [data-theme="light"] .lk-act { background: #F3F4F6; border-color: rgba(0,0,0,.1); color: #4B5563; }
  [data-theme="light"] .lk-act:hover { border-color: #8B5CF6; color: #0F0F12; background: #EDE9FE; }
  [data-theme="light"] .lk-empty { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-empty p { color: #374151; }
  [data-theme="light"] .lk-modal { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .lk-field, [data-theme="light"] .lk-hint { color: #6B7280; }
  [data-theme="light"] .lk-field input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-tpl-opt { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-tpl-opt b { color: #111827; }
  [data-theme="light"] .lk-tpl-opt span { color: #6B7280; }
  [data-theme="light"] .lk-tpl-opt.on { border-color: #7C5CFC; background: rgba(124,92,252,0.1); }
  [data-theme="light"] .lk-tpl-opt.on b { color: #6D28D9; }
  /* PrimaButton kontras di light (bg page terang) */
  [data-theme="light"] .lk-list-body .btn-prima { border-color: rgba(15,15,18,.18); }
  [data-theme="light"] .lk-list-body .btn-prima[data-variant="purple"] { background: #EDE7FE; border-color: rgba(124,92,252,.55); color: #5B21B6; }
  [data-theme="light"] .lk-list-body .btn-prima[data-variant="purple"]:hover:not(:disabled) { background: #E2D8FC; }
`;
