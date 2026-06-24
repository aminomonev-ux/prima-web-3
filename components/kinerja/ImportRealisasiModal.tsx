'use client';
// components/kinerja/ImportRealisasiModal.tsx — IK-4 modal ber-tab per sumber.
// Unggah file belanja → server parse + match (peta dulu, lalu fuzzy) → tampilkan
// hasil PER TAB SUMBER untuk user periksa. "Simpan peta" mengajari bot (bulan
// depan auto-cocok). "Terapkan" mengisi DRAFT Realisasi sumber yang sedang dibuka
// (Model A′ — user yang Simpan). Tab '_belum' = baris tak ketemu (dilewati).

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtRp } from '@/lib/shared/utils';
import { uiTheme } from '@/lib/theme';
import { Upload, FileSpreadsheet, X, AlertTriangle } from 'lucide-react';

interface MatchRow {
  keterangan: string; realisasi: number; bulan_ke: number; source: string;
  ssk_canonical_id: string | null; ssk_keterangan: string | null; sumber: string | null;
  score: number; status: 'match' | 'mirip' | 'none';
}
interface ImportData {
  tahun: string; months: number[]; total: number; targetCount: number;
  bySumber: Record<string, MatchRow[]>; warnings: string[];
}
interface Props {
  tahun: string;
  currentSumber: string;
  isLight?: boolean;
  /** §23 Lampirkan: hasil parse dari chat Rima — modal langsung tampil tanpa unggah ulang. */
  preload?: ImportData;
  preloadName?: string;
  onApply: (items: { ssk_canonical_id: string; bulan_ke: number; realisasi: number }[]) => void;
  onClose: () => void;
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const STATUS_C = { match: '#1D9E75', mirip: '#BA7517', none: '#94A3B8' } as const;
const STATUS_L = { match: '✓ cocok', mirip: '~ mirip', none: '✗ belum' } as const;

export default function ImportRealisasiModal({ tahun, currentSumber, isLight = false, preload, preloadName, onApply, onClose }: Props) {
  const t = uiTheme(isLight);
  const cBorder = isLight ? 'rgba(139,92,246,.2)' : '#0C447C';
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState(preloadName ?? '');
  const [data, setData] = useState<ImportData | null>(preload ?? null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (preload) { const tb = Object.keys(preload.bySumber); return tb.includes(currentSumber) ? currentSumber : (tb[0] ?? '_belum'); }
    return currentSumber;
  });

  async function handleFile(file: File) {
    setBusy(true); setData(null); setExcluded(new Set()); setFileName(file.name);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('tahun', tahun);
      const res = await fetch('/api/kinerja/realisasi/import', { method: 'POST', body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { toast.error(j?.message || 'Gagal membaca file Excel'); return; }
      setData(j as ImportData);
      const tabs = Object.keys((j as ImportData).bySumber);
      setActiveTab(tabs.includes(currentSumber) ? currentSumber : (tabs[0] ?? '_belum'));
      if (tabs.length === 0) toast.error('Tidak ada baris belanja yang dikenali');
    } catch { toast.error('Gagal mengunggah file'); }
    finally { setBusy(false); }
  }

  const tabs = data ? Object.keys(data.bySumber) : [];
  const rows = data ? (data.bySumber[activeTab] ?? []) : [];
  const isIncluded = (r: MatchRow) => !!r.ssk_canonical_id && !excluded.has(r.source);
  const toggle = (src: string) => setExcluded(p => { const n = new Set(p); n.has(src) ? n.delete(src) : n.add(src); return n; });
  const includedOf = (sumber: string) => (data?.bySumber[sumber] ?? []).filter(isIncluded);

  async function savePeta() {
    if (!data) return;
    const pairs = tabs.flatMap(s => s === '_belum' ? [] : includedOf(s).map(r => ({ keterangan_excel: r.keterangan, sumber: r.sumber!, ssk_canonical_id: r.ssk_canonical_id! })));
    if (pairs.length === 0) { toast.error('Tidak ada cocokan untuk disimpan'); return; }
    try {
      const res = await fetch('/api/kinerja/realisasi/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save-map', tahun, pairs }) });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) toast.success(`Peta disimpan: ${j.saved} cocokan — bulan depan auto-cocok`);
      else toast.error(j?.message || 'Gagal menyimpan peta');
    } catch { toast.error('Gagal menyimpan peta'); }
  }

  function terapkan() {
    const items = includedOf(currentSumber).map(r => ({ ssk_canonical_id: r.ssk_canonical_id!, bulan_ke: r.bulan_ke, realisasi: r.realisasi }));
    if (items.length === 0) { toast.error(`Tidak ada baris cocok untuk ${currentSumber}`); return; }
    onApply(items);
    toast.success(`${items.length} baris diisi ke Realisasi ${currentSumber} — periksa lalu klik Simpan`);
    onClose();
  }

  const th: React.CSSProperties = { padding: '7px 9px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: t.textSub, textAlign: 'left', borderBottom: `1px solid ${cBorder}`, position: 'sticky', top: 0, background: t.card };
  const td: React.CSSProperties = { padding: '6px 9px', fontSize: '11px', color: t.text, borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.08)' : 'rgba(51,65,85,.4)'}`, verticalAlign: 'top' };

  return createPortal(
    <div role="dialog" aria-label="Import Realisasi Belanja dari Excel"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,15,28,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(820px,96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: t.card, border: `1px solid ${cBorder}`, borderRadius: '14px', boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>
        {/* Head */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${cBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: t.text, fontSize: '14px' }}>
            <FileSpreadsheet size={18} color={isLight ? '#7C3AED' : '#C4B5FD'} /> Import Realisasi Belanja dari Excel
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', overflowY: 'auto' }}>
          <p style={{ fontSize: '12px', color: t.textSub, margin: '0 0 12px' }}>
            Unggah laporan belanja (.xlsx). Rima cocokkan tiap baris ke <strong>keterangan</strong> SSK
            (fuzzy) lalu kelompokkan per sumber. Periksa per tab; <strong>Terapkan</strong> mengisi draft
            Realisasi <strong>{currentSumber}</strong> (kamu yang Simpan). <strong>Simpan peta</strong> = ajari bot untuk bulan depan.
          </p>

          <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <PrimaButton variant="purple" iconLeft={<Upload size={14} />} onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Membaca…' : 'Pilih File Excel'}
            </PrimaButton>
            {fileName && <span style={{ fontSize: '11px', color: t.textSub }}>{fileName}</span>}
            {data && <span style={{ fontSize: '11px', color: t.textSub }}>· {data.total} baris · bulan {data.months.map(m => MONTHS[m]).join(', ')} · {data.targetCount} SSK target</span>}
          </div>

          {data?.warnings && data.warnings.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderRadius: '8px', background: isLight ? 'rgba(186,117,23,.12)' : 'rgba(186,117,23,.15)', border: '1px solid rgba(186,117,23,.3)', marginBottom: '12px', fontSize: '11px', color: isLight ? '#B45309' : '#FAC775' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{data.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
            </div>
          )}

          {data && tabs.length > 0 && (
            <>
              {/* Tabs per sumber */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {tabs.map(s => {
                  const cnt = data.bySumber[s].length;
                  const on = s === activeTab;
                  const isCur = s === currentSumber;
                  const label = s === '_belum' ? 'Belum cocok' : s;
                  return (
                    <button key={s} type="button" onClick={() => setActiveTab(s)}
                      style={{ padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${on ? (isLight ? '#7C3AED' : '#A78BFA') : cBorder}`,
                        background: on ? (isLight ? 'rgba(124,92,252,.12)' : 'rgba(124,92,252,.25)') : 'transparent',
                        color: on ? (isLight ? '#5B21B6' : '#C4B5FD') : t.textSub }}>
                      {label} ({cnt}){isCur && ' ◀'}
                    </button>
                  );
                })}
              </div>

              {/* Tabel match */}
              <div style={{ border: `1px solid ${cBorder}`, borderRadius: '10px', overflow: 'auto', maxHeight: '46vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...th, width: '34px' }}></th>
                    <th style={th}>Keterangan Excel</th>
                    <th style={th}>→ SSK app</th>
                    <th style={{ ...th, width: '74px', textAlign: 'center' }}>Status</th>
                    <th style={{ ...th, width: '120px', textAlign: 'right' }}>Realisasi</th>
                    <th style={{ ...th, width: '44px', textAlign: 'center' }}>Bln</th>
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.source} style={{ opacity: r.ssk_canonical_id && isIncluded(r) ? 1 : 0.5 }}>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input type="checkbox" disabled={!r.ssk_canonical_id} checked={isIncluded(r)} onChange={() => toggle(r.source)} />
                        </td>
                        <td style={td}>{r.keterangan}</td>
                        <td style={{ ...td, color: r.ssk_keterangan ? t.text : t.textSub }}>{r.ssk_keterangan ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{ color: STATUS_C[r.status], fontWeight: 700, fontSize: '10px' }}>{STATUS_L[r.status]}</span>
                          {r.status !== 'none' && <span style={{ display: 'block', fontSize: '8px', color: t.textSub }}>{r.score.toFixed(2)}</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmtRp(r.realisasi)}</td>
                        <td style={{ ...td, textAlign: 'center', color: t.textSub }}>{MONTHS[r.bulan_ke]}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: t.textSub }}>Tidak ada baris di tab ini.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Foot */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '12px 18px', borderTop: `1px solid ${cBorder}` }}>
          <PrimaButton variant="ghost" onClick={savePeta} disabled={!data}>💾 Simpan peta</PrimaButton>
          <div style={{ display: 'flex', gap: '8px' }}>
            <PrimaButton variant="ghost" onClick={onClose}>Tutup</PrimaButton>
            <PrimaButton variant="success" onClick={terapkan} disabled={!data}>Terapkan ke {currentSumber}</PrimaButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
