'use client';

// Matriks Realisasi Bulanan (sub-kegiatan) — grid baris=indikator × kolom=Jan–Des.
// - Ketik langsung / paste blok sel dari Excel (TSV clipboard)
// - Unduh Excel (template + data) & Import Excel (match via kolom ID)
// - Simpan massal via PATCH action=bulan-bulk (per-baris CAS + cek Kunci Periode)
// R3: sel kosong = belum diisi (null), "0" = nol nyata.

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Save, Download, Upload, Lock } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import type { RaRow, MonthVal } from '../_lib/types';
import { BULAN_LABELS, hitungCapaianPct } from '../_lib/types';
import { apiUpdateBulanBulk, VersionConflictError, apiGetLock } from '../_lib/api';
import { exportMatrixBulananXlsx, parseMatrixBulananXlsx } from '../_lib/exports';

const MONO = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' as const };

interface Props {
  isOpen: boolean;
  tahun: number;
  rows: RaRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

const baseMonths = (r: RaRow): MonthVal[] =>
  Array.isArray(r.bulan_realisasi) && r.bulan_realisasi.length === 12
    ? r.bulan_realisasi.slice() : Array(12).fill(null);

const sameMonths = (a: MonthVal[], b: MonthVal[]): boolean =>
  a.every((v, i) => (v ?? null) === (b[i] ?? null));

// Heatmap: warna sel dari capaian bulan vs target bulanan (ambang default
// ≥100 hijau · 80–99,9 kuning · <80 merah; arah Progres Negatif ikut terbalik
// via hitungCapaianPct). null = belum diisi (abu), tanpa target = netral.
const heatCell = (pct: number | null, filled: boolean): { bg: string; fg: string } => {
  if (!filled) return { bg: '#F1F5F9', fg: '#CBD5E1' };
  if (pct == null) return { bg: '#FFFFFF', fg: '#475569' };
  if (pct >= 100) return { bg: 'rgba(29,158,117,.20)', fg: '#0F5C44' };
  if (pct >= 80) return { bg: 'rgba(239,159,39,.22)', fg: '#7A4D0A' };
  return { bg: 'rgba(226,75,74,.18)', fg: '#B91C1C' };
};

export default function MatrixBulananModal({ isOpen, tahun, rows, onClose, onSaved, notify }: Props) {
  const [grid, setGrid] = useState<Map<number, MonthVal[]>>(new Map());
  const [lockBulan, setLockBulan] = useState(0);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'angka' | 'warna'>('angka');
  const fileRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGrid(new Map(rows.map(r => [r.id, baseMonths(r)])));
    let alive = true;
    void apiGetLock(tahun).then(b => { if (alive) setLockBulan(b); }).catch(() => { /* anggap terbuka */ });
    return () => { alive = false; };
  }, [isOpen, rows, tahun]);

  const setCell = useCallback((id: number, monthIdx: number, val: MonthVal) => {
    setGrid(prev => {
      const next = new Map(prev);
      const arr = (next.get(id) ?? Array(12).fill(null)).slice();
      arr[monthIdx] = val;
      next.set(id, arr);
      return next;
    });
  }, []);

  if (!isOpen) return null;

  const dirtyRows = rows.filter(r => {
    const g = grid.get(r.id);
    return g ? !sameMonths(g, baseMonths(r)) : false;
  });

  const parseVal = (s: string): MonthVal => {
    if (s.trim() === '') return null;
    const n = parseFloat(s.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  // Paste blok Excel: TSV multi-sel diisi mulai dari sel yang di-paste;
  // bulan terkunci & sel di luar grid dilewati.
  const handlePaste = (e: React.ClipboardEvent, rowIdx: number, monthIdx: number) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\t') && !text.includes('\n')) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.length > 0);
    setGrid(prev => {
      const next = new Map(prev);
      lines.forEach((line, dr) => {
        const row = rows[rowIdx + dr];
        if (!row) return;
        const arr = (next.get(row.id) ?? Array(12).fill(null)).slice();
        line.split('\t').forEach((cell, dc) => {
          const m = monthIdx + dc;
          if (m > 11 || m < lockBulan) return;
          arr[m] = parseVal(cell);
        });
        next.set(row.id, arr);
      });
      return next;
    });
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = await parseMatrixBulananXlsx(file);
      let applied = 0;
      setGrid(prev => {
        const next = new Map(prev);
        for (const r of rows) {
          const months = parsed.get(r.id);
          if (!months) continue;
          // Bulan terkunci dipertahankan dari nilai grid saat ini
          const cur = next.get(r.id) ?? baseMonths(r);
          next.set(r.id, months.map((v, i) => (i < lockBulan ? cur[i] : v)));
          applied++;
        }
        return next;
      });
      notify(`Import terbaca: ${applied} baris cocok dari ${parsed.size} baris file. Periksa lalu klik Simpan.`, applied > 0 ? 'success' : 'warning');
    } catch (e) {
      notify((e as Error).message || 'Gagal membaca file', 'error');
    }
  };

  const handleSave = async () => {
    if (submittingRef.current || dirtyRows.length === 0) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const items = dirtyRows.map(r => ({
        id: r.id,
        bulan_realisasi: grid.get(r.id) ?? Array(12).fill(null),
        expected_version: r.version,
      }));
      const { saved, failed } = await apiUpdateBulanBulk(items);
      if (failed.length === 0) {
        notify(`${saved} baris realisasi bulanan tersimpan`, 'success');
        await onSaved();
        onClose();
      } else {
        notify(`${saved} tersimpan, ${failed.length} gagal: ${failed[0].error}${failed.length > 1 ? ` (+${failed.length - 1} lainnya)` : ''}`, 'warning');
        await onSaved();
      }
    } catch (e) {
      if (e instanceof VersionConflictError) {
        notify('⚠️ Data sudah diubah pengguna lain. Memuat versi terbaru…', 'warning');
        await onSaved();
      } else {
        notify((e as Error).message || 'Gagal menyimpan', 'error');
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0f172a]/75" onClick={onClose} />
      <div className="relative w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#7C5CFC] to-[#378ADD] shrink-0" />

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Matriks Realisasi Bulanan — {tahun}</h3>
            <p className="text-xs text-slate-400">
              {rows.length} indikator sub kegiatan · ketik langsung atau paste blok sel dari Excel · sel kosong = belum diisi, 0 = nol nyata
              {lockBulan > 0 && (
                <span className="ml-1.5 inline-flex items-center gap-1 font-semibold text-[#BA7517]">
                  <Lock className="h-3 w-3" /> terkunci s.d. {BULAN_LABELS[lockBulan - 1]}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-bold">
              {(['angka', 'warna'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1.5 cursor-pointer transition-colors ${view === v ? 'bg-[#7C5CFC] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                  {v === 'angka' ? 'Angka' : 'Warna'}
                </button>
              ))}
            </div>
            <PrimaButton variant="success" size="sm" iconLeft={<Download size={13} />}
              onClick={() => { void exportMatrixBulananXlsx(rows, tahun); }}>
              Unduh Excel
            </PrimaButton>
            <PrimaButton variant="purple" size="sm" iconLeft={<Upload size={13} />}
              onClick={() => fileRef.current?.click()}>
              Import Excel
            </PrimaButton>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
                e.target.value = '';
              }} />
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-left font-bold uppercase tracking-wider sticky left-0 bg-slate-50 min-w-[260px] border-b border-slate-200">Indikator (Sub Kegiatan)</th>
                {BULAN_LABELS.map((b, i) => (
                  <th key={b} className={`px-1.5 py-2 text-center font-bold uppercase tracking-wider border-b border-slate-200 min-w-[64px] ${i < lockBulan ? 'text-[#BA7517]' : ''}`}>
                    {i < lockBulan ? '🔒 ' : ''}{b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, rowIdx) => {
                const g = grid.get(r.id) ?? baseMonths(r);
                const dirty = !sameMonths(g, baseMonths(r));
                return (
                  <tr key={r.id} className={dirty ? 'bg-[#EF9F27]/5' : ''}>
                    <td className="px-3 py-1.5 sticky left-0 bg-white border-r border-slate-100">
                      <div className="font-semibold text-slate-700 leading-snug line-clamp-2">{r.indikator}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">{r.sub_kegiatan ?? r.program} · {r.satuan}{dirty ? ' · belum disimpan' : ''}</div>
                    </td>
                    {g.map((v, m) => {
                      if (view === 'warna') {
                        const t = r.bulan_target?.[m];
                        const pct = v != null && t != null && t > 0 ? hitungCapaianPct(t, v, r.jenis) : null;
                        const c = heatCell(pct, v != null);
                        return (
                          <td key={m} className="px-0.5 py-1">
                            <div className="rounded px-1 py-1 text-right text-[11px] font-bold"
                              style={{ ...MONO, background: c.bg, color: c.fg }}>
                              {v == null ? '—' : v}
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td key={m} className="px-0.5 py-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={m < lockBulan}
                            value={v == null ? '' : String(v)}
                            placeholder="—"
                            onChange={(e) => setCell(r.id, m, parseVal(e.target.value))}
                            onPaste={(e) => handlePaste(e, rowIdx, m)}
                            className={`w-full rounded border px-1 py-1 text-right focus:outline-none focus:border-[#7C5CFC] ${m < lockBulan ? 'bg-slate-100 border-slate-100 text-slate-400 cursor-not-allowed' : 'border-slate-200 text-slate-800'}`}
                            style={MONO}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-10 text-center text-slate-400">Belum ada indikator sub kegiatan untuk tahun {tahun}.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            {view === 'warna' ? (
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: 'rgba(29,158,117,.45)' }} /> ≥100%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: 'rgba(239,159,39,.5)' }} /> 80–99%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: 'rgba(226,75,74,.45)' }} /> &lt;80%</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm inline-block bg-[#F1F5F9] border border-slate-200" /> belum diisi</span>
                <span className="text-slate-400">· capaian vs target bulanan (Progres Negatif otomatis dibalik)</span>
              </span>
            ) : dirtyRows.length > 0 ? `${dirtyRows.length} baris berubah — belum disimpan` : 'Tidak ada perubahan'}
          </span>
          <div className="flex items-center gap-2.5">
            <PrimaButton variant="ghost" size="sm" onClick={onClose}>Tutup</PrimaButton>
            <PrimaButton variant="primary" size="sm" iconLeft={<Save size={14} />}
              disabled={busy || dirtyRows.length === 0} onClick={() => { void handleSave(); }}>
              {busy ? 'Menyimpan…' : `Simpan (${dirtyRows.length})`}
            </PrimaButton>
          </div>
        </div>
      </div>
    </div>
  );
}
