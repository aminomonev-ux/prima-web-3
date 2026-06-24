'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Package, Layers, BarChart3, LayoutGrid } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteButton from '@/components/ui/DeleteButton';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import type { KategoriAset } from '@/lib/data/buku-besar-aset';

type Props = { username: string; role: string; themePreference: 'dark' | 'light'; initialKategori: KategoriAset[] };

export default function MasterClient({ username, role, themePreference, initialKategori }: Props) {
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const c = {
    canvas: isLight ? '#F5F5F7' : '#020F1C', card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB', sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C', rowOdd: isLight ? '#F3F4F6' : 'rgba(4,44,83,.6)',
    input: isLight ? '#FFFFFF' : 'rgba(2,15,28,.6)',
  };

  const [rows, setRows] = useState<KategoriAset[]>(initialKategori);
  const [nama, setNama] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/kategori');
    if (d.ok) setRows((d as unknown as { data: KategoriAset[] }).data);
  }, []);

  async function add() {
    const v = nama.trim();
    if (!v) { toast.error('Nama kategori wajib diisi'); return; }
    setSaving(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/kategori', { method: 'POST', body: JSON.stringify({ nama: v }) });
      if (d.ok) { toast.success('Kategori ditambahkan'); setNama(''); load(); }
      else toast.error(d.message || 'Gagal menambah');
    } finally { setSaving(false); }
  }

  async function del(row: KategoriAset) {
    if (!(await confirmDialog({ title: 'Hapus Kategori', message: `Hapus kategori "${row.nama}"?`, confirmLabel: 'Hapus' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/kategori?id=${row.id}`, { method: 'DELETE' });
    if (d.ok) { toast.success('Dihapus'); load(); } else toast.error(d.message || 'Gagal hapus');
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '7px 10px', fontSize: 13, color: c.text, background: c.input };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: c.text, borderBottom: `1px solid ${c.border}` };

  return (
    <div style={{ minHeight: '100vh', background: c.canvas, color: c.text }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', minHeight: 52, background: isLight ? 'rgba(255,255,255,.92)' : 'rgba(4,44,83,.92)', backdropFilter: 'blur(16px)', borderBottom: `1px solid ${c.border}`, position: 'sticky', top: 0, zIndex: 200 }}>
        <div style={{ fontSize: 13, color: c.sub }}>
          <span style={{ fontWeight: 800, background: 'linear-gradient(135deg,#EF9F27,#FAC775)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Buku Besar Aset</span>
          <span style={{ margin: '0 6px', color: isLight ? '#D1D5DB' : '#185FA5' }}>/</span>
          <span style={{ color: isLight ? '#374151' : '#B5D4F4', fontWeight: 600 }}>Master Kategori</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <div style={{ padding: '24px 28px 100px', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🗂️ Master Kategori Aset</h1>
        <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 18 }}>Daftar kategori untuk dropdown di form item · {rows.length} kategori</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          <input value={nama} onChange={e => setNama(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="Nama kategori baru…" style={{ ...inp, flex: 1 }} />
          <PrimaButton variant="purple" onClick={add} disabled={saving}>{saving ? 'Menyimpan…' : '+ Tambah'}</PrimaButton>
        </div>

        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {rows.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={2}>Belum ada kategori.</td></tr>}
              {rows.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 ? c.rowOdd : 'transparent' }}>
                  <td style={td}>{r.nama}</td>
                  <td style={{ ...td, textAlign: 'right', width: 60 }}>
                    <DeleteButton onClick={() => del(r)} data-tooltip="Hapus" iconSize={12} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FloatingDock isLight={isLight}
        nav={[
          { icon: <Package size={17} />, label: 'Aset', onClick: () => { window.location.href = '/buku-besar-aset'; } },
          { icon: <Layers size={17} />, label: 'Master', onClick: () => {}, current: true },
          { icon: <BarChart3 size={17} />, label: 'Kinerja', onClick: () => { window.location.href = '/kinerja'; } },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => { window.location.href = '/menu'; } },
        ]}
      />
    </div>
  );
}
