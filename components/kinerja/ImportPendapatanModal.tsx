'use client';
// components/kinerja/ImportPendapatanModal.tsx — IK-1 Import native Pendapatan.
// Unggah Excel → server parse (/api/kinerja/pendapatan/import) → preview Realisasi
// per bulan → "Terapkan ke form" mengisi draft Section 1 (BUKAN simpan). User yang
// klik "Simpan Pendapatan" setelahnya (Model A′ — modul yang menulis, user eksekusi).
// Scope IK-1: isi REALISASI bulanan saja (target dibiarkan apa adanya).

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtRp } from '@/lib/shared/utils';
import { uiTheme } from '@/lib/theme';
import { Upload, FileSpreadsheet, X, AlertTriangle } from 'lucide-react';
import type { ParsedPendMonth } from '@/lib/data/kinerja-import';

interface Props {
  isLight?: boolean;
  /** §23 Lampirkan: hasil parse dari chat Rima — modal langsung tampil tanpa unggah ulang. */
  preload?: { months: ParsedPendMonth[]; warnings: string[] };
  preloadName?: string;
  onApply: (months: ParsedPendMonth[]) => void;
  onClose: () => void;
}

export default function ImportPendapatanModal({ isLight = false, preload, preloadName, onApply, onClose }: Props) {
  const t = uiTheme(isLight);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState(preloadName ?? '');
  const [months, setMonths] = useState<ParsedPendMonth[]>(preload?.months ?? []);
  const [warnings, setWarnings] = useState<string[]>(preload?.warnings ?? []);

  async function handleFile(file: File) {
    setBusy(true); setMonths([]); setWarnings([]); setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/kinerja/pendapatan/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { toast.error(data?.message || 'Gagal membaca file Excel'); return; }
      setMonths(data.months ?? []);
      setWarnings(data.warnings ?? []);
      if ((data.months ?? []).length === 0) toast.error('Tidak ada data pendapatan bulanan yang dikenali di file ini');
    } catch {
      toast.error('Gagal mengunggah file');
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (months.length === 0) return;
    onApply(months);
    toast.success(`${months.length} bulan diisi ke form — periksa lalu klik "Simpan Pendapatan"`);
    onClose();
  }

  const card: React.CSSProperties = {
    width: 'min(560px, 94vw)', maxHeight: '88vh', background: t.card,
    border: `1px solid ${isLight ? 'rgba(139,92,246,.2)' : '#0C447C'}`, borderRadius: '14px',
    boxShadow: '0 24px 60px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column',
  };
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: t.textSub, textAlign: 'left', borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.18)' : '#0C447C'}` };
  const td: React.CSSProperties = { padding: '7px 10px', fontSize: '12px', color: t.text, borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.08)' : 'rgba(51,65,85,.4)'}` };

  return createPortal(
    <div
      role="dialog" aria-label="Import Pendapatan dari Excel"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,15,28,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div style={card} onClick={e => e.stopPropagation()}>
        {/* Head */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.18)' : '#0C447C'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: t.text, fontSize: '14px' }}>
            <FileSpreadsheet size={18} color={isLight ? '#7C3AED' : '#C4B5FD'} />
            Import Pendapatan dari Excel
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px', overflowY: 'auto' }}>
          <p style={{ fontSize: '12px', color: t.textSub, margin: '0 0 14px' }}>
            Unggah laporan pendapatan bulanan (.xlsx). Rima membaca <strong>Realisasi per bulan</strong> dari
            baris PAD (4.1), lalu mengisinya ke form. <strong>Tidak otomatis tersimpan</strong> — periksa dulu,
            lalu klik “Simpan Pendapatan”.
          </p>

          <input
            ref={fileRef} type="file" accept=".xlsx,.xls" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <PrimaButton variant="purple" iconLeft={<Upload size={14} />} onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Membaca…' : 'Pilih File Excel'}
            </PrimaButton>
            {fileName && <span style={{ fontSize: '11px', color: t.textSub }}>{fileName}</span>}
          </div>

          {warnings.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: isLight ? 'rgba(186,117,23,.12)' : 'rgba(186,117,23,.15)', border: '1px solid rgba(186,117,23,.3)', marginBottom: '12px', fontSize: '11px', color: isLight ? '#B45309' : '#FAC775' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
            </div>
          )}

          {months.length > 0 && (
            <div style={{ border: `1px solid ${isLight ? 'rgba(139,92,246,.18)' : '#0C447C'}`, borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Bulan</th>
                  <th style={{ ...th, textAlign: 'right' }}>Realisasi (Rp)</th>
                  <th style={{ ...th, textAlign: 'right' }}>Sumber</th>
                </tr></thead>
                <tbody>
                  {months.map(m => (
                    <tr key={m.bulan_ke}>
                      <td style={{ ...td, fontWeight: 700 }}>{m.label}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: isLight ? '#047857' : '#6EE7B7' }}>{fmtRp(m.realisasi)}</td>
                      <td style={{ ...td, textAlign: 'right', fontSize: '10px', color: t.textSub }}>{m.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Foot */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 18px', borderTop: `1px solid ${isLight ? 'rgba(139,92,246,.18)' : '#0C447C'}` }}>
          <PrimaButton variant="ghost" onClick={onClose}>Batal</PrimaButton>
          <PrimaButton variant="success" onClick={apply} disabled={months.length === 0 || busy}>
            Terapkan ke form ({months.length})
          </PrimaButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
