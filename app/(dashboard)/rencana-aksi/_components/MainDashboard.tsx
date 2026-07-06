'use client';

import { useState, useMemo, useEffect } from 'react';
import { Eye, Pencil, Save, Grid3x3 } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import SoftSelect from '@/components/ui/SoftSelect';
import Tip from '@/components/ui/Tip';
import type { RaRow, RaLevel, RaJenis } from '../_lib/types';
import { LEVEL_LABELS, quartersOf, realisasiAkhirTahun, outcomeOf, deriveQuartersFromMonthly, hitungCapaianPct, BULAN_LABELS } from '../_lib/types';

interface Props {
  level: RaLevel;
  rows: RaRow[];
  selectedYear: number;
  selectedSasaran: string;
  selectedProgram: string;
  selectedKegiatan: string;
  selectedSubKegiatan: string;
  selectedIndicator: string;
  setSelectedSasaran: (v: string) => void;
  setSelectedProgram: (v: string) => void;
  setSelectedKegiatan: (v: string) => void;
  setSelectedSubKegiatan: (v: string) => void;
  setSelectedIndicator: (v: string) => void;
  onOpenQuarterModal: (quarter: { id: 1 | 2 | 3 | 4; target: number; realisasi: number; name: string }) => void;
  onOpenTargetsModal: () => void;
  onOpenDetailModal: () => void;
  onChangeJenis: (jenis: RaJenis) => void;
  onSaveBulanRealisasi: (months: (number | null)[]) => Promise<void>;
  anggaran: number | null;
  onOpenMatrix?: () => void;
}

function getColors(pct: number) {
  if (pct >= 100) return { text: 'text-[#1D9E75]', badge: 'bg-[#1D9E75] text-white', progress: 'bg-[#1D9E75]' };
  if (pct > 0)    return { text: 'text-[#E24B4A]', badge: 'bg-[#E24B4A] text-white', progress: 'bg-[#E24B4A]' };
  return { text: 'text-[#78909C]', badge: 'bg-[#78909C] text-white', progress: 'bg-[#BDC3C7]' };
}

export default function MainDashboard({
  level, rows, selectedYear,
  selectedSasaran, selectedProgram, selectedKegiatan, selectedSubKegiatan, selectedIndicator,
  setSelectedSasaran, setSelectedProgram, setSelectedKegiatan, setSelectedSubKegiatan, setSelectedIndicator,
  onOpenQuarterModal, onOpenTargetsModal, onOpenDetailModal, onChangeJenis, onSaveBulanRealisasi, anggaran, onOpenMatrix,
}: Props) {
  const [isEditingJenis, setIsEditingJenis] = useState(false);

  const menuName = LEVEL_LABELS[level];
  const levelRows = useMemo(() => rows.filter(r => r.level === level), [rows, level]);
  const isSub = level === 'sub-kegiatan';

  // Sasaran dropdown options (level=program only) — distinct sasaran values dari row level=program
  const displaySasarans = useMemo(() => {
    if (level !== 'program') return [] as string[];
    return Array.from(new Set(levelRows.map(r => r.sasaran).filter((s): s is string => !!s)));
  }, [levelRows, level]);

  const displayPrograms = useMemo(() => {
    // Untuk level=program, filter programs by selectedSasaran (cascade)
    const filtered = level === 'program' && selectedSasaran
      ? levelRows.filter(r => r.sasaran === selectedSasaran)
      : levelRows;
    return Array.from(new Set(filtered.map(r => r.program).filter(Boolean)));
  }, [levelRows, level, selectedSasaran]);
  const displayKegiatans = useMemo(() => {
    const f = levelRows.filter(r => !selectedProgram || r.program === selectedProgram);
    const list = Array.from(new Set(f.map(r => r.kegiatan).filter(Boolean))) as string[];
    return list.length ? list : (Array.from(new Set(levelRows.map(r => r.kegiatan).filter(Boolean))) as string[]);
  }, [levelRows, selectedProgram]);
  const displaySubKegiatans = useMemo(() => {
    const f = levelRows.filter(r =>
      (!selectedProgram || r.program === selectedProgram) &&
      (!selectedKegiatan || r.kegiatan === selectedKegiatan));
    const list = Array.from(new Set(f.map(r => r.sub_kegiatan).filter(Boolean))) as string[];
    return list.length ? list : (Array.from(new Set(levelRows.map(r => r.sub_kegiatan).filter(Boolean))) as string[]);
  }, [levelRows, selectedProgram, selectedKegiatan]);
  const displayIndicators = useMemo(() => {
    const f = levelRows.filter(r => {
      const okSas = level !== 'program' || !selectedSasaran || r.sasaran === selectedSasaran;
      const okProg = !selectedProgram || r.program === selectedProgram;
      const okKeg = !selectedKegiatan || (level !== 'kegiatan' && level !== 'sub-kegiatan') || r.kegiatan === selectedKegiatan;
      const okSub = !selectedSubKegiatan || level !== 'sub-kegiatan' || r.sub_kegiatan === selectedSubKegiatan;
      return okSas && okProg && okKeg && okSub;
    });
    const list = Array.from(new Set(f.map(r => r.indikator).filter(Boolean)));
    return list.length ? list : Array.from(new Set(levelRows.map(r => r.indikator).filter(Boolean)));
  }, [levelRows, selectedSasaran, selectedProgram, selectedKegiatan, selectedSubKegiatan, level]);

  const activeRow = useMemo(() =>
    levelRows.find(r => r.indikator === selectedIndicator) ?? null,
  [levelRows, selectedIndicator]);

  // Realisasi bulanan (sub-kegiatan, Opsi A) — sync dari activeRow saat ganti indikator.
  // Pola "adjust state on prop change" saat render (bukan useEffect) → hindari cascading
  // render + lint set-state-in-effect. Ref: react.dev/learn/you-might-not-need-an-effect
  // R3: null = belum diisi, 0 = nol nyata
  const [bulanRealisasi, setBulanRealisasi] = useState<(number | null)[]>(() => Array(12).fill(null));
  const [savingBulan, setSavingBulan] = useState(false);
  const [syncedRow, setSyncedRow] = useState(activeRow);
  if (activeRow !== syncedRow) {
    setSyncedRow(activeRow);
    const src = activeRow?.bulan_realisasi;
    setBulanRealisasi(Array.isArray(src) && src.length === 12 ? src.slice() : Array(12).fill(null));
  }

  // L49: cascading dropdown reset child ke '' saat parent berubah. TIDAK auto-pick
  // first row — biarkan user explicit pilih (UX: avoid implicit state, lebih jelas).
  useEffect(() => {
    // Level=program: sasaran adalah root parent. Kalau sasaran kosong/berubah, reset semua child.
    if (level === 'program' && selectedSasaran) {
      const programValid = !selectedProgram || levelRows.some(r => r.sasaran === selectedSasaran && r.program === selectedProgram);
      if (!programValid) {
        setSelectedProgram(''); setSelectedIndicator('');
        return;
      }
    }
    if (level === 'program' && !selectedSasaran && (selectedProgram || selectedIndicator)) {
      if (selectedProgram) setSelectedProgram('');
      if (selectedIndicator) setSelectedIndicator('');
      return;
    }
    // Kalau parent kosong, semua child wajib kosong
    if (!selectedProgram) {
      if (selectedKegiatan) setSelectedKegiatan('');
      if (selectedSubKegiatan) setSelectedSubKegiatan('');
      if (selectedIndicator) setSelectedIndicator('');
      return;
    }
    // Kalau kegiatan terisi tapi tidak match program -> reset
    const kegiatanValid = !selectedKegiatan || levelRows.some(r =>
      r.program === selectedProgram && r.kegiatan === selectedKegiatan,
    );
    if (!kegiatanValid) {
      setSelectedKegiatan(''); setSelectedSubKegiatan(''); setSelectedIndicator('');
      return;
    }
    // Kalau sub-kegiatan terisi tapi tidak match -> reset
    const subValid = !selectedSubKegiatan || levelRows.some(r =>
      r.program === selectedProgram &&
      (!selectedKegiatan || r.kegiatan === selectedKegiatan) &&
      r.sub_kegiatan === selectedSubKegiatan,
    );
    if (!subValid) {
      setSelectedSubKegiatan(''); setSelectedIndicator('');
      return;
    }
    // Kalau indikator terisi tapi tidak match -> reset
    const indikatorValid = !selectedIndicator || levelRows.some(r =>
      r.program === selectedProgram &&
      ((level !== 'kegiatan' && level !== 'sub-kegiatan') || !selectedKegiatan || r.kegiatan === selectedKegiatan) &&
      (level !== 'sub-kegiatan' || !selectedSubKegiatan || r.sub_kegiatan === selectedSubKegiatan) &&
      r.indikator === selectedIndicator,
    );
    if (!indikatorValid) {
      setSelectedIndicator('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSasaran, selectedProgram, selectedKegiatan, selectedSubKegiatan, level, levelRows]);

  const data = activeRow ?? {
    indikator: selectedIndicator || '— Pilih indikator —',
    jenis: 'Akumulatif' as RaJenis,
    satuan: 'Persen',
    sasaran: null,
    outcome_program: null,
    outcome_kegiatan: null,
    outcome_sub_kegiatan: null,
    target_rpjmd: 0,
    target_tahunan: 0,
    q1_target: 0, q1_realisasi: 0,
    q2_target: 0, q2_realisasi: 0,
    q3_target: 0, q3_realisasi: 0,
    q4_target: 0, q4_realisasi: 0,
    version: 0,
  } as RaRow;

  const realAkhir = activeRow ? realisasiAkhirTahun(activeRow) : 0;
  // R4: Progres Negatif dibalik via hitungCapaianPct — over-target tampil merah
  const nilaiAkhirTahun = hitungCapaianPct(data.target_tahunan, realAkhir, data.jenis);
  const nilaiRpjmd      = hitungCapaianPct(data.target_rpjmd, realAkhir, data.jenis);
  const colorAkhirTahun = getColors(nilaiAkhirTahun);
  const colorRpjmd      = getColors(nilaiRpjmd);

  const derivedRealisasi = deriveQuartersFromMonthly(bulanRealisasi, data.jenis);
  const bulanDirty = (() => {
    const src = activeRow?.bulan_realisasi;
    const base: (number | null)[] = Array.isArray(src) && src.length === 12 ? src : Array(12).fill(null);
    return bulanRealisasi.some((v, i) => (v ?? null) !== (base[i] ?? null));
  })();

  const handleSaveBulan = async () => {
    if (!activeRow || savingBulan) return;
    setSavingBulan(true);
    try { await onSaveBulanRealisasi(bulanRealisasi); }
    finally { setSavingBulan(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#EEF2F6] px-4 py-8 md:px-8">
      {/* Title */}
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 md:text-3xl">
            {menuName}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Pemantauan target, realisasi, dan evaluasi berkala untuk periode tahun {selectedYear}.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start rounded-xl bg-white p-2.5 shadow-xs border border-slate-200">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EF9F27]/10 text-[#EF9F27]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Realisasi</div>
            <div className="text-sm font-bold text-slate-800" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              {realAkhir} <span className="text-[11px] font-normal text-slate-500">{data.satuan}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main indicator card */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
        <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-[#EF9F27] via-[#7C5CFC] to-[#378ADD]" />

        <div className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="space-y-2 flex-1 max-w-2xl">
              {level === 'program' && (
                <div className="flex items-baseline gap-2 text-sm md:text-base">
                  <span className="font-bold text-slate-700 w-32 shrink-0 whitespace-nowrap">Sasaran</span>
                  <span className="text-slate-400">:</span>
                  <span className="font-semibold text-slate-800 leading-snug">{selectedSasaran || '-'}</span>
                </div>
              )}
              {(level === 'kegiatan' || level === 'sub-kegiatan') && (
                <div className="flex items-baseline gap-2 text-sm md:text-base">
                  <span className="font-bold text-slate-700 w-32 shrink-0 whitespace-nowrap">Program</span>
                  <span className="text-slate-400">:</span>
                  <span className="font-semibold text-slate-800 leading-snug">{selectedProgram || '-'}</span>
                </div>
              )}
              {level === 'sub-kegiatan' && (
                <div className="flex items-baseline gap-2 text-sm md:text-base">
                  <span className="font-bold text-slate-700 w-32 shrink-0 whitespace-nowrap">Kegiatan</span>
                  <span className="text-slate-400">:</span>
                  <span className="font-semibold text-slate-800 leading-snug">{selectedKegiatan || '-'}</span>
                </div>
              )}
              {(() => {
                const primaryLabel =
                  level === 'tujuan' ? 'Tujuan' :
                  level === 'sasaran' ? 'Sasaran' :
                  level === 'program' ? 'Program' :
                  level === 'kegiatan' ? 'Kegiatan' : 'Sub Kegiatan';
                const primaryValue =
                  level === 'kegiatan' ? selectedKegiatan :
                  level === 'sub-kegiatan' ? selectedSubKegiatan :
                  selectedProgram;
                const outcome = activeRow ? outcomeOf(activeRow) : '';
                const outcomeLabel =
                  level === 'program'      ? 'Sasaran Program' :
                  level === 'kegiatan'     ? 'Sasaran Kegiatan' :
                  level === 'sub-kegiatan' ? 'Sasaran Sub Kegiatan' : '';
                return (
                  <>
                    <div className="flex items-baseline gap-2 text-sm md:text-base">
                      <span className="font-bold text-slate-700 w-32 shrink-0 whitespace-nowrap">{primaryLabel}</span>
                      <span className="text-slate-400">:</span>
                      <span className="font-semibold text-slate-800 leading-snug">{primaryValue || '-'}</span>
                    </div>
                    {outcome && outcomeLabel && (
                      <div className="flex items-baseline gap-2 text-sm md:text-base">
                        <span className="font-bold text-slate-700 w-32 shrink-0 whitespace-nowrap">{outcomeLabel}</span>
                        <span className="text-slate-400">:</span>
                        <span className="italic text-slate-600 leading-snug">{outcome}</span>
                      </div>
                    )}
                    <div className="flex items-baseline gap-2 text-sm md:text-base">
                      <span className="font-bold text-slate-700 w-32 shrink-0 whitespace-nowrap">Indikator</span>
                      <span className="text-slate-400">:</span>
                      <span className="font-semibold text-slate-800 leading-snug">{selectedIndicator || '-'}</span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
              <div className="ra-anggaran-chip text-right mr-[2cm]">
                <span className="ra-anggaran-label block text-[9.5px] font-bold uppercase tracking-widest text-[#FAC775]">Anggaran</span>
                <span className="ra-anggaran-val block font-bold text-white text-base md:text-lg leading-tight"
                      style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                  {anggaran != null ? `Rp ${anggaran.toLocaleString('id-ID')}` : 'Rp —'}
                </span>
              </div>
              <PrimaButton
                variant="primary"
                size="md"
                iconLeft={<Eye size={14} />}
                onClick={onOpenDetailModal}
                disabled={!activeRow}
                className="shrink-0"
              >
                Detail
              </PrimaButton>
            </div>
          </div>

          {/* Cascading selectors — grid 2 kolom, sequential disable.
              Sub-kegiatan (4 field) → 2x2 simetris. Kegiatan (3 field) → row terakhir col-span-2.
              Sasaran/Program (2 field) → 1 row 2 col. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-100 w-full">
            {level === 'tujuan' ? (
              <>
                <Selector label="Tujuan" value={selectedProgram} options={displayPrograms} onChange={setSelectedProgram} />
                <Selector label="Indikator Tujuan" value={selectedIndicator} options={displayIndicators} onChange={setSelectedIndicator} disabled={!selectedProgram} />
              </>
            ) : level === 'sasaran' ? (
              <>
                <Selector label="Sasaran" value={selectedProgram} options={displayPrograms} onChange={setSelectedProgram} />
                <Selector label="Indikator Sasaran" value={selectedIndicator} options={displayIndicators} onChange={setSelectedIndicator} disabled={!selectedProgram} />
              </>
            ) : level === 'program' ? (
              <>
                <Selector label="Sasaran" value={selectedSasaran} options={displaySasarans} onChange={setSelectedSasaran} />
                <Selector label="Program" value={selectedProgram} options={displayPrograms} onChange={setSelectedProgram} disabled={!selectedSasaran} />
                <div className="md:col-span-2">
                  <Selector label="Indikator Program" value={selectedIndicator} options={displayIndicators} onChange={setSelectedIndicator} disabled={!selectedProgram} />
                </div>
              </>
            ) : level === 'kegiatan' ? (
              <>
                <Selector label="Program" value={selectedProgram} options={displayPrograms} onChange={setSelectedProgram} />
                <Selector label="Kegiatan" value={selectedKegiatan} options={displayKegiatans} onChange={setSelectedKegiatan} disabled={!selectedProgram} />
                <div className="md:col-span-2">
                  <Selector label="Indikator Kegiatan" value={selectedIndicator} options={displayIndicators} onChange={setSelectedIndicator} disabled={!selectedKegiatan} />
                </div>
              </>
            ) : (
              <>
                <Selector label="Program" value={selectedProgram} options={displayPrograms} onChange={setSelectedProgram} />
                <Selector label="Kegiatan" value={selectedKegiatan} options={displayKegiatans} onChange={setSelectedKegiatan} disabled={!selectedProgram} />
                <Selector label="Sub Kegiatan" value={selectedSubKegiatan} options={displaySubKegiatans} onChange={setSelectedSubKegiatan} disabled={!selectedKegiatan} />
                <Selector label="Indikator Sub Kegiatan" value={selectedIndicator} options={displayIndicators} onChange={setSelectedIndicator} disabled={!selectedSubKegiatan} />
              </>
            )}
          </div>
        </div>

        {/* Meta grid */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 block font-medium">Jenis</span>
              <Tip label="Ubah Jenis Indikator"><button
                onClick={() => setIsEditingJenis(!isEditingJenis)}
                disabled={!activeRow}
                className="text-[#EF9F27] hover:text-[#D17A0A] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Pencil className="h-3 w-3" />
              </button></Tip>
            </div>
            {isEditingJenis && activeRow ? (
              <select
                value={data.jenis}
                onChange={(e) => { onChangeJenis(e.target.value as RaJenis); setIsEditingJenis(false); }}
                onBlur={() => setIsEditingJenis(false)}
                autoFocus
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:border-[#EF9F27]"
                style={{ colorScheme: 'light' }}
              >
                <option value="Akumulatif">Akumulatif</option>
                <option value="Progres Positif">Progres Positif</option>
                <option value="Progres Negatif">Progres Negatif</option>
                <option value="Pengulangan">Pengulangan</option>
              </select>
            ) : (
              <span className="font-semibold text-slate-700 text-sm md:text-base block">{data.jenis}</span>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-400 block font-medium">Satuan</span>
            <span className="font-semibold text-slate-700 text-sm md:text-base">{data.satuan}</span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 block font-medium">Target Tahunan</span>
              <Tip label="Ubah Target"><button
                onClick={onOpenTargetsModal}
                disabled={!activeRow}
                className="text-[#EF9F27] hover:text-[#D17A0A] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Pencil className="h-3 w-3" />
              </button></Tip>
            </div>
            <span className="font-bold text-[#EF9F27] text-lg md:text-xl block pt-0.5"
                  style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              {data.target_tahunan}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-slate-400 block font-medium">Target RPJMD</span>
            <span className="font-bold text-[#378ADD] text-lg md:text-xl block pt-0.5"
                  style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              {data.target_rpjmd}
            </span>
          </div>
        </div>
      </div>

      {/* Evaluation cards */}
      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <EvalCard
          title="Kondisi Akhir Tahun"
          badge={`Laporan ${selectedYear}`}
          badgeClass="bg-slate-50 text-slate-500 border-slate-100"
          target={data.target_tahunan}
          realisasi={realAkhir}
          nilai={nilaiAkhirTahun}
          progressLabel="Progress Capaian Tahunan"
          colorText={colorAkhirTahun.text}
          colorProgress={colorAkhirTahun.progress}
        />
        <EvalCard
          title="Kondisi Akhir RPJMD"
          badge="Pilar Jangka Panjang"
          badgeClass="bg-[#378ADD]/10 text-[#378ADD] border-[#378ADD]/20"
          target={data.target_rpjmd}
          realisasi={realAkhir}
          nilai={nilaiRpjmd}
          progressLabel="Progress Capaian Jangka Panjang"
          colorText={colorRpjmd.text}
          colorProgress={colorRpjmd.progress}
        />
      </div>

      {/* Realisasi Bulanan (sub-kegiatan, Opsi A) — sumber derive realisasi TW */}
      {isSub && (
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-xs border border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-50 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-[#7C5CFC]" />
                Realisasi Bulanan
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">
                Isi realisasi tiap bulan — Triwulan terhitung otomatis sesuai jenis (<strong>{data.jenis}</strong>).
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onOpenMatrix && (
                <PrimaButton variant="purple" size="sm" iconLeft={<Grid3x3 size={13} />} onClick={onOpenMatrix}>
                  Matriks Bulanan
                </PrimaButton>
              )}
              <PrimaButton
                variant="success"
                size="sm"
                iconLeft={<Save size={13} />}
                disabled={!activeRow || savingBulan || !bulanDirty}
                onClick={handleSaveBulan}
              >
                {savingBulan ? 'Menyimpan…' : 'Simpan Realisasi'}
              </PrimaButton>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {BULAN_LABELS.map((bln, i) => (
              <div key={bln} className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{bln}</label>
                <PrimaNumberField
                  size="sm"
                  min={0}
                  disabled={!activeRow}
                  value={bulanRealisasi[i] == null ? '' : bulanRealisasi[i]}
                  placeholder="—"
                  inputClassName="text-right"
                  onChange={(e) => {
                    // R3: kosong = belum diisi (null); "0" = nol nyata. R6: desimal boleh.
                    const v = e.target.value === '' ? null : (parseFloat(e.target.value) || 0);
                    setBulanRealisasi(prev => prev.map((x, idx) => (idx === i ? v : x)));
                  }}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-[#7C5CFC]/20 bg-[#7C5CFC]/5 p-3">
            <span className="text-[9.5px] font-bold text-[#7C5CFC] uppercase tracking-widest block mb-2">
              Pratinjau Realisasi Triwulan (otomatis)
            </span>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(['TW I', 'TW II', 'TW III', 'TW IV'] as const).map((lbl, i) => (
                <div key={lbl}>
                  <span className="text-[9px] font-semibold text-slate-400 block">{lbl}</span>
                  <span className="text-sm font-bold text-slate-700" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                    {derivedRealisasi[i]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quarter section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-700">{isSub ? 'Rekap Triwulan (otomatis):' : 'Input Target Triwulan:'}</h3>
          <span className="inline-flex items-center gap-1 rounded-md bg-[#1D9E75]/10 px-2.5 py-0.5 text-xs font-bold text-[#1D9E75]">
            Sesuai
          </span>
        </div>
        <span className="text-[11px] text-slate-400 italic">
          {isSub
            ? 'Triwulan dihitung dari realisasi bulanan di atas.'
            : 'Tekan tombol "Input" di salah satu kotak Triwulan untuk mengubah data.'}
        </span>
      </div>

      {/* Quarter cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quartersOf(data).map((q) => {
          // R4: Progres Negatif dibalik (2 − real/target) — over-target = merah
          const pct = hitungCapaianPct(q.target, q.realisasi, data.jenis);
          const c = getColors(pct);
          return (
            <div key={q.id} className="group relative rounded-2xl bg-white p-5 shadow-xs hover:shadow-md transition-all duration-300 border border-slate-100 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-3">
                <h4 className="font-bold text-[#EF9F27] text-sm">{q.name}</h4>
                {isSub ? (
                  <span className="rounded-md bg-[#7C5CFC]/10 px-2 py-0.5 text-[10px] font-bold text-[#7C5CFC]">Auto</span>
                ) : (
                  <Tip label={`Ubah data ${q.name}`}><button
                    onClick={() => onOpenQuarterModal(q)}
                    disabled={!activeRow}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-bold text-[#EF9F27] border border-[#EF9F27]/40 bg-[#EF9F27]/5 hover:border-[#EF9F27] hover:bg-[#EF9F27]/15 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Input</span>
                  </button></Tip>
                )}
              </div>

              <div className="space-y-2.5 mb-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Target</span>
                  <span className="font-bold text-slate-700" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{q.target}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Realisasi</span>
                  <span className="font-bold text-slate-700" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{q.realisasi}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Nilai</span>
                  <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold ${c.badge}`}
                        style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                    Nilai {pct.toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="w-full h-1 bg-slate-50 rounded-full overflow-hidden">
                <div style={{ width: `${Math.min(pct, 100)}%` }} className={`h-full ${c.progress}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Operational log */}
      <div className="mt-8 rounded-2xl bg-white p-5 border border-slate-100 shadow-xs">
        <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-3">
          Status &amp; Riwayat Sinkronisasi (Log Operasional)
        </h3>
        <div className="rounded-xl bg-slate-50/50 border border-slate-100 p-3 text-xs text-slate-600 space-y-1.5"
             style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
          <div className="flex items-start gap-2">
            <span className="text-[#1D9E75]">🟢 ONLINE</span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-800">Menampilkan RKPD periode {selectedYear}. Data tersimpan di server.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#378ADD]">ℹ️ INFO</span>
            <span className="text-slate-400">|</span>
            <span className="text-[#1D9E75]">Modul Renaksi & Kinerja aktif untuk {menuName}.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Selector({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean;
}) {
  // DESIGN-SYSTEM rule (baris 455): native <select> di dark theme WAJIB migrate ke <SoftSelect>.
  // Adapter: string[] options jadi {value,label}[], prepend opsi kosong sbg "— Pilih —" eksplisit.
  const softOptions = [{ value: '', label: '— Pilih —' }, ...options.map(o => ({ value: o, label: o }))];
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0 ra-cascade-cell">
      <label className={`text-[9px] font-bold uppercase tracking-wider ${disabled ? 'text-slate-300' : 'text-slate-400'}`}>{label}</label>
      <SoftSelect
        value={value}
        options={softOptions}
        onChange={onChange}
        placeholder="— Pilih —"
        disabled={disabled}
      />
    </div>
  );
}

function EvalCard({ title, badge, badgeClass, target, realisasi, nilai, progressLabel, colorText, colorProgress }: {
  title: string; badge: string; badgeClass: string;
  target: number; realisasi: number; nilai: number;
  progressLabel: string; colorText: string; colorProgress: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-sm md:text-base">{title}</h3>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold border ${badgeClass}`}>{badge}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-slate-50 pb-4 mb-4">
          <Stat label="Target" value={target} />
          <Stat label="Realisasi" value={realisasi} />
          <Stat label="Nilai" value={`${nilai.toFixed(2)}%`} colorClass={colorText} align="right" />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center text-[11px] mb-1.5">
          <span className="text-slate-400 font-medium">{progressLabel}</span>
          <span className={`font-bold ${colorText}`}>{nilai >= 100 ? '✓ Selesai' : `${nilai.toFixed(1)}%`}</span>
        </div>
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden relative">
          <div style={{ width: `${Math.min(nilai, 100)}%` }} className={`h-full rounded-full transition-all duration-1000 ease-out ${colorProgress}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, colorClass = 'text-slate-800', align = 'left' }: {
  label: string; value: number | string; colorClass?: string; align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <span className="text-xs text-slate-400 block">{label}</span>
      <span className={`text-xl font-bold ${colorClass}`} style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{value}</span>
    </div>
  );
}
