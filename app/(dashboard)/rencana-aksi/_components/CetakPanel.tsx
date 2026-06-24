'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Printer, Eye, X, Loader2, Download, Filter, RotateCcw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import SoftSelect from '@/components/ui/SoftSelect';
import type { RaRow, RaLevel, HierarchyRow } from '../_lib/types';
import { LEVEL_LABELS, realisasiAkhirTahun, outcomeOf, anggaranRollup } from '../_lib/types';
import type { CetakFilter, ColMode } from '../_lib/cetak-filter';
import { DEFAULT_CETAK_FILTER, ALL_LEVELS, buildCetakRows, cetakRollupBase } from '../_lib/cetak-filter';
import { apiListAll } from '../_lib/api';
import { buildCombinedPdf, exportCombinedPdf, exportCombinedXlsx } from '../_lib/exports';

interface Props {
  tahun: number;
  notify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

const moneyFont = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' as const };

const LEVEL_COLORS: Record<RaRow['level'], string> = {
  'tujuan':       '#7C5CFC',
  'sasaran':      '#10B981',
  'program':      '#378ADD',
  'kegiatan':     '#EC4899',
  'sub-kegiatan': '#F59E0B',
};

export default function CetakPanel({ tahun, notify }: Props) {
  const [allRows, setAllRows] = useState<RaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filter, setFilter] = useState<CetakFilter>(DEFAULT_CETAK_FILTER);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');
    void apiListAll(tahun)
      .then(data => { if (!cancelled) { setAllRows(data); setLoading(false); } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message || 'Gagal memuat data'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tahun]);

  const counts = {
    tujuan:         allRows.filter(r => r.level === 'tujuan').length,
    sasaran:        allRows.filter(r => r.level === 'sasaran').length,
    program:        allRows.filter(r => r.level === 'program').length,
    kegiatan:       allRows.filter(r => r.level === 'kegiatan').length,
    'sub-kegiatan': allRows.filter(r => r.level === 'sub-kegiatan').length,
  };
  const totalRows = allRows.length;

  const hier = useMemo(() => buildCetakRows(allRows, filter), [allRows, filter]);
  const rollup = useMemo(() => cetakRollupBase(allRows, filter), [allRows, filter]);

  const handlePdf = async () => {
    if (submittingRef.current || !hier.length) return;
    submittingRef.current = true;
    try { await exportCombinedPdf(allRows, tahun, filter); notify('PDF gabungan berhasil diunduh', 'success'); }
    catch (err) { notify((err as Error).message || 'Gagal unduh PDF', 'error'); }
    finally { submittingRef.current = false; }
  };

  const handleExcel = async () => {
    if (submittingRef.current || !hier.length) return;
    submittingRef.current = true;
    try { await exportCombinedXlsx(allRows, tahun, filter); notify('Excel gabungan berhasil diunduh', 'success'); }
    catch (err) { notify((err as Error).message || 'Gagal unduh Excel', 'error'); }
    finally { submittingRef.current = false; }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#EEF2F6] px-4 py-6 md:px-8">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C5CFC]/10 text-[#7C5CFC]">
            <Printer className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 md:text-2xl">
              Cetak Renaksi & Kinerja Gabungan
            </h1>
            <p className="text-xs text-slate-500">
              Satu file berisi semua level Indikator (Tujuan / Sasaran / Program / Kegiatan / Sub Kegiatan) periode {tahun}.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky toolbar — solid bg supaya konsisten dark/light (bg-white auto-override
          ke surface-card #042C53 di dark via ra-scope rule). */}
      <div className="sticky top-0 z-20 mb-4 rounded-2xl bg-white px-4 py-3 border border-slate-200 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-semibold text-slate-700">
            Menampilkan <span className="font-bold text-[#7C5CFC]" style={moneyFont}>{hier.length}</span>
            {' '}dari <span className="font-bold text-[#EF9F27]" style={moneyFont}>{totalRows}</span> indikator
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PrimaButton
              variant="purple"
              size="sm"
              iconLeft={<Eye size={14} />}
              onClick={() => setPreviewOpen(true)}
              disabled={!hier.length || loading}
            >
              Preview PDF
            </PrimaButton>
            <DownloadButton variant="pdf" label="PDF" onClick={handlePdf}
              disabled={!hier.length || loading} data-tooltip="Unduh PDF (sesuai filter)" />
            <DownloadButton variant="excel" label="Excel" onClick={handleExcel}
              disabled={!hier.length || loading} data-tooltip="Unduh Excel (sesuai filter)" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center">
          <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin text-[#7C5CFC]" />
          <p className="text-sm text-slate-500">Memuat data semua level…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-[#E24B4A]/5 border border-[#E24B4A]/20 p-6 text-center">
          <p className="text-sm font-semibold text-[#E24B4A]">{error}</p>
        </div>
      ) : (
        <>
          <FilterBar allRows={allRows} filter={filter} setFilter={setFilter} />

          {/* Summary cards */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            {(['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'] as const).map(lvl => (
              <div key={lvl} className="rounded-2xl bg-white p-4 border border-slate-100 shadow-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: LEVEL_COLORS[lvl] }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{LEVEL_LABELS[lvl]}</span>
                </div>
                <div className="text-2xl font-bold text-slate-800" style={moneyFont}>{counts[lvl]}</div>
                <div className="text-[10px] text-slate-400">indikator</div>
              </div>
            ))}
          </div>

          {/* Hierarchical combined table */}
          <HierarchyTable rows={hier} rollupRows={rollup} filter={filter} tahun={tahun} />
        </>
      )}

      {previewOpen && (
        <PdfPreviewModal
          allRows={allRows}
          tahun={tahun}
          filter={filter}
          onClose={() => setPreviewOpen(false)}
          onDownload={handlePdf}
        />
      )}
    </div>
  );
}

// ─── Filter Bar ─────────────────────────────────────────────────────────────

function Seg<T extends string>({ options, value, onChange }: {
  options: { v: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
      {options.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
            value === o.v ? 'bg-[#7C5CFC] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, color, children }: {
  active: boolean; onClick: () => void; color?: string; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
        active ? 'text-white border-transparent' : 'text-slate-500 bg-white border-slate-200 hover:border-slate-300'
      }`}
      style={active ? { background: color ?? '#7C5CFC' } : undefined}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">{children}</span>;
}

function FilterBar({ allRows, filter, setFilter }: {
  allRows: RaRow[]; filter: CetakFilter; setFilter: React.Dispatch<React.SetStateAction<CetakFilter>>;
}) {
  const setF = (patch: Partial<CetakFilter>) => setFilter(prev => ({ ...prev, ...patch }));
  const toggleLevel = (lvl: RaLevel) => setFilter(prev => ({ ...prev, levels: { ...prev.levels, [lvl]: !prev.levels[lvl] } }));

  const tujuanOpts = useMemo(() =>
    Array.from(new Set(allRows.filter(r => r.level === 'tujuan').map(r => r.program).filter(Boolean))).sort(),
  [allRows]);
  const sasaranOpts = useMemo(() => {
    let rows = allRows.filter(r => r.level === 'sasaran');
    if (filter.fTujuan) rows = rows.filter(r => r.tujuan === filter.fTujuan);
    return Array.from(new Set(rows.map(r => r.program).filter(Boolean))).sort();
  }, [allRows, filter.fTujuan]);
  const programOpts = useMemo(() => {
    let rows = allRows.filter(r => r.level === 'program');
    if (filter.fSasaran) rows = rows.filter(r => r.sasaran === filter.fSasaran);
    return Array.from(new Set(rows.map(r => r.program).filter(Boolean))).sort();
  }, [allRows, filter.fSasaran]);

  const focusActive = !!(filter.fTujuan || filter.fSasaran || filter.fProgram);
  const isDefault =
    filter.mode === 'hirarki' && filter.colMode === 'both' &&
    filter.showAnggaran && filter.showOutcome && filter.showTw &&
    ALL_LEVELS.every(l => filter.levels[l]) && !focusActive;

  return (
    <div className="mb-4 rounded-2xl bg-white border border-slate-200 shadow-xs p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <Filter className="h-4 w-4 text-[#7C5CFC]" /> Filter Cetak
        </span>
        {!isDefault && (
          <button
            onClick={() => setFilter(DEFAULT_CETAK_FILTER)}
            className="flex items-center gap-1 text-[11px] font-bold text-[#E24B4A] hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Mode */}
        <div className="flex items-center">
          <FieldLabel>Mode</FieldLabel>
          <Seg
            value={filter.mode}
            onChange={(v) => setF({ mode: v })}
            options={[{ v: 'hirarki', label: 'Hirarki' }, { v: 'flat', label: 'Flat / per-level' }]}
          />
        </div>

        {/* Kolom Target/Realisasi */}
        <div className="flex items-center">
          <FieldLabel>Kolom</FieldLabel>
          <Seg<ColMode>
            value={filter.colMode}
            onChange={(v) => setF({ colMode: v })}
            options={[{ v: 'both', label: 'Target + Realisasi' }, { v: 'target', label: 'Target saja' }, { v: 'realisasi', label: 'Realisasi saja' }]}
          />
        </div>

        {/* Toggle kolom */}
        <div className="flex items-center gap-1.5">
          <FieldLabel>Tampil</FieldLabel>
          <Chip active={filter.showTw} onClick={() => setF({ showTw: !filter.showTw })}>Triwulan</Chip>
          <Chip active={filter.showAnggaran} onClick={() => setF({ showAnggaran: !filter.showAnggaran })}>Anggaran</Chip>
          <Chip active={filter.showOutcome} onClick={() => setF({ showOutcome: !filter.showOutcome })}>Outcome</Chip>
        </div>
      </div>

      {/* Penjelasan mode (hindari kebingungan hirarki vs flat) */}
      <p className="text-[10px] text-slate-400 leading-relaxed">
        <b className="text-slate-500 font-semibold">Hirarki</b>: baris urut mengikuti pohon (induk → anak, anak menjorok ke kanan).{' '}
        <b className="text-slate-500 font-semibold">Flat</b>: daftar dikelompokkan per tingkat.
      </p>

      {/* Level — tingkat mana yang tampil sebagai baris */}
      <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
        <FieldLabel>Level</FieldLabel>
        {ALL_LEVELS.map(lvl => (
          <Chip key={lvl} active={filter.levels[lvl]} color={LEVEL_COLORS[lvl]} onClick={() => toggleLevel(lvl)}>
            {filter.levels[lvl] ? '✓ ' : ''}{LEVEL_LABELS[lvl].replace('Indikator ', '')}
          </Chip>
        ))}
        <span className="text-[10px] text-slate-400 ml-1">klik untuk sembunyikan/tampilkan tingkat baris</span>
      </div>

      {/* Fokus — drill ke 1 cabang saja */}
      <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
        <div className="w-full flex items-center gap-2">
          <FieldLabel>Fokus</FieldLabel>
          <span className="text-[10px] text-slate-400">pilih 1 untuk menampilkan hanya cabangnya (drill-down ke bawah). Kosongkan = tampil semua.</span>
        </div>
        <div className="min-w-[180px] ra-cascade-cell">
          <FieldLabel>Fokus Tujuan</FieldLabel>
          <SoftSelect
            value={filter.fTujuan}
            options={[{ value: '', label: '— Semua —' }, ...tujuanOpts.map(t => ({ value: t, label: t }))]}
            onChange={(v) => setF({ fTujuan: v, fSasaran: '', fProgram: '' })}
            placeholder="— Semua —"
          />
        </div>
        <div className="min-w-[180px] ra-cascade-cell">
          <FieldLabel>Fokus Sasaran</FieldLabel>
          <SoftSelect
            value={filter.fSasaran}
            options={[{ value: '', label: '— Semua —' }, ...sasaranOpts.map(s => ({ value: s, label: s }))]}
            onChange={(v) => setF({ fSasaran: v, fProgram: '' })}
            placeholder="— Semua —"
          />
        </div>
        <div className="min-w-[180px] ra-cascade-cell">
          <FieldLabel>Fokus Program</FieldLabel>
          <SoftSelect
            value={filter.fProgram}
            options={[{ value: '', label: '— Semua —' }, ...programOpts.map(p => ({ value: p, label: p }))]}
            onChange={(v) => setF({ fProgram: v })}
            placeholder="— Semua —"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Hierarchy Table (gabungan 1 tabel tree-style, filter-aware) ────────────

function HierarchyTable({ rows, rollupRows, filter, tahun }: {
  rows: HierarchyRow[]; rollupRows: RaRow[]; filter: CetakFilter; tahun: number;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl bg-white border border-slate-100 p-12 text-center text-sm text-slate-400">
        Tidak ada baris sesuai filter untuk tahun {tahun}.
      </div>
    );
  }

  const showT = filter.colMode !== 'realisasi';
  const showR = filter.colMode !== 'target';
  const showReal = filter.colMode !== 'target';
  const twSpan = (showT && showR) ? 2 : 1;
  const quarters: (1 | 2 | 3 | 4)[] = filter.showTw ? [1, 2, 3, 4] : [];

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-xs overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">
          Renaksi & Kinerja <span className="font-normal text-slate-400">— {rows.length} baris{filter.mode === 'flat' ? ' (flat)' : ''}</span>
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Periode {tahun}</span>
      </div>
      <div className="overflow-auto max-h-[65vh]">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
            <tr className="bg-slate-50">
              <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider">No</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider min-w-[160px]">Tujuan</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider min-w-[160px]">Sasaran</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider min-w-[160px]">Program</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider min-w-[140px]">Kegiatan</th>
              <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider min-w-[140px]">Sub Kegiatan</th>
              {filter.showOutcome && (
                <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider min-w-[200px]">Sasaran (Outcome)</th>
              )}
              <th rowSpan={2} className="px-3 py-2.5 text-left font-bold uppercase tracking-wider min-w-[200px]">Indikator</th>
              <th rowSpan={2} className="px-3 py-2.5 text-center font-bold uppercase tracking-wider">Jenis</th>
              <th rowSpan={2} className="px-3 py-2.5 text-center font-bold uppercase tracking-wider">Satuan</th>
              <th rowSpan={2} className="px-3 py-2.5 text-right font-bold uppercase tracking-wider">RPJMD</th>
              <th rowSpan={2} className="px-3 py-2.5 text-right font-bold uppercase tracking-wider">Tahunan</th>
              {quarters.map(q => (
                <th key={q} colSpan={twSpan} className="px-3 py-2 text-center font-bold uppercase tracking-wider whitespace-nowrap border-l border-slate-200">
                  TW{q}
                </th>
              ))}
              {showReal && (
                <th rowSpan={2} className="px-3 py-2.5 text-right font-bold uppercase tracking-wider whitespace-nowrap border-l border-slate-200">Real Akhir</th>
              )}
              {filter.showAnggaran && (
                <th rowSpan={2} className="px-3 py-2.5 text-right font-bold uppercase tracking-wider whitespace-nowrap">Anggaran (Rp)</th>
              )}
            </tr>
            <tr className="bg-slate-50">
              {quarters.map(q => [
                showT ? <th key={`t${q}`} className="px-2 py-1.5 text-center font-bold uppercase tracking-wider text-[10px] border-l border-slate-200">T</th> : null,
                showR ? <th key={`r${q}`} className="px-2 py-1.5 text-center font-bold uppercase tracking-wider text-[10px]">R</th> : null,
              ])}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(h => {
              const r = h.source;
              const fillColor =
                h.tujuan       ? '#7C5CFC' :
                h.sasaran      ? '#10B981' :
                h.program      ? '#378ADD' :
                h.kegiatan     ? '#EC4899' :
                h.sub_kegiatan ? '#F59E0B' : '#94A3B8';
              const outcome = outcomeOf(r);
              const ang = anggaranRollup(r.level, r, rollupRows);
              // Indentasi pohon (mode hirarki saja) → child makin menjorok; flat = rata.
              const depth = { tujuan: 0, sasaran: 1, program: 2, kegiatan: 3, 'sub-kegiatan': 4 }[r.level];
              const indent = filter.mode === 'hirarki' ? { paddingLeft: 12 + depth * 18 } : undefined;
              return (
                // Key pakai h.no (incremental, unik by construction). BUKAN r.id —
                // beberapa hierarchy rows bisa share source.id kalau parent name duplikat.
                <tr key={h.no} className={`hover:bg-slate-50/50 transition-colors ${h.isOrphan ? 'bg-[#E24B4A]/5' : ''}`}>
                  <td className="px-3 py-2 text-slate-400" style={{ ...moneyFont, boxShadow: `inset 4px 0 0 ${fillColor}` }}>{h.no}</td>
                  <td className="px-3 py-2 font-bold leading-snug" style={{ color: h.tujuan ? fillColor : '#CBD5E1', ...(h.tujuan ? indent : {}) }}>{h.tujuan || ''}</td>
                  <td className="px-3 py-2 font-bold leading-snug" style={{ color: h.sasaran ? fillColor : '#CBD5E1', ...(h.sasaran ? indent : {}) }}>{h.sasaran || ''}</td>
                  <td className="px-3 py-2 font-bold leading-snug" style={{ color: h.program ? fillColor : '#CBD5E1', ...(h.program ? indent : {}) }}>{h.program || ''}</td>
                  <td className="px-3 py-2 font-bold leading-snug" style={{ color: h.kegiatan ? fillColor : '#CBD5E1', ...(h.kegiatan ? indent : {}) }}>{h.kegiatan || ''}</td>
                  <td className="px-3 py-2 font-bold leading-snug" style={{ color: h.sub_kegiatan ? fillColor : '#CBD5E1', ...(h.sub_kegiatan ? indent : {}) }}>{h.sub_kegiatan || ''}</td>
                  {filter.showOutcome && (
                    <td className="px-3 py-2 leading-snug italic text-slate-600">{outcome || ''}</td>
                  )}
                  <td className="px-3 py-2 text-slate-700 leading-snug">
                    {r.indikator}
                    {h.isOrphan && <span className="ml-1.5 text-[10px] text-[#E24B4A] font-semibold">(orphan)</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{r.jenis}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{r.satuan}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-700" style={moneyFont}>{r.target_rpjmd}</td>
                  <td className="px-3 py-2 text-right font-bold text-slate-700" style={moneyFont}>{r.target_tahunan}</td>
                  {quarters.map(q => [
                    showT ? <td key={`t${q}`} className="px-2 py-2 text-center text-slate-500 border-l border-slate-100" style={moneyFont}>{r[`q${q}_target`]}</td> : null,
                    showR ? <td key={`r${q}`} className="px-2 py-2 text-center font-semibold text-slate-700" style={moneyFont}>{r[`q${q}_realisasi`]}</td> : null,
                  ])}
                  {showReal && (
                    <td className="px-3 py-2 text-right font-bold text-[#EF9F27]" style={moneyFont}>{realisasiAkhirTahun(r)}</td>
                  )}
                  {filter.showAnggaran && (
                    <td className="px-3 py-2 text-right font-bold text-[#1D9E75]" style={moneyFont}>{ang != null ? ang.toLocaleString('id-ID') : ''}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PDF Preview Modal ──────────────────────────────────────────────────────
// Pattern mirror PK Riwayat DocxPreviewModal: build blob in-client, render via
// native browser PDF viewer (iframe) — tidak butuh library tambahan.

function PdfPreviewModal({
  allRows, tahun, filter, onClose, onDownload,
}: {
  allRows: RaRow[]; tahun: number; filter: CetakFilter;
  onClose: () => void; onDownload: () => void;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  const [blobUrl, setBlobUrl] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const doc = await buildCombinedPdf(allRows, tahun, filter);
        if (cancelled) return;
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setBlobUrl(url);
        setStatus('ready');
      } catch (e) {
        if (!cancelled) {
          setStatus('error');
          setErrMsg(e instanceof Error ? e.message : 'Render gagal');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [allRows, tahun, filter]);

  useEffect(() => {
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [blobUrl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm"
         style={{ background: 'rgba(2,15,28,.78)' }}>
      <div onClick={e => e.stopPropagation()} className="relative flex h-[92vh] w-[92vw] flex-col overflow-hidden rounded-2xl border shadow-2xl"
           style={{ background: '#042C53', borderColor: 'rgba(24,95,165,.5)' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: '#0C447C', background: 'rgba(12,68,124,.35)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <Eye size={18} color="#A78BFA" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">Preview PDF Gabungan</div>
              <div className="text-[11px] truncate" style={{ color: '#85B7EB', ...moneyFont }}>
                rencana-aksi-{tahun}-gabungan.pdf
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={onDownload}
              data-tooltip="Unduh PDF"
              data-tooltip-pos="left"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:opacity-90"
              style={{ background: '#10B981' }}
            >
              <Download size={14} />
            </button>
            <button
              onClick={onClose}
              data-tooltip="Tutup (Esc)"
              data-tooltip-pos="left"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition-colors hover:opacity-90"
              style={{ background: '#E24B4A' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-hidden" style={{ background: '#1a1f2e' }}>
          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ color: '#85B7EB' }}>
              <Loader2 size={32} className="animate-spin" />
              <div className="text-sm">Membangun PDF gabungan…</div>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <X size={32} color="#E24B4A" />
              <div className="text-sm font-semibold text-[#E24B4A]">Gagal render preview</div>
              <div className="text-xs" style={{ color: '#85B7EB' }}>{errMsg}</div>
            </div>
          )}
          {status === 'ready' && blobUrl && (
            <iframe
              src={blobUrl}
              title="Preview PDF Gabungan"
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
