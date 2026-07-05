'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Database, Plus, Edit, Sliders, Tag, AlertCircle, FolderOpen,
} from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import DeleteIcon from '@/components/ui/DeleteIcon';
import DownloadButton from '@/components/ui/DownloadButton';
import { toast } from 'sonner';
import SoftSelect from '@/components/ui/SoftSelect';
import Tip from '@/components/ui/Tip';
import { InputNominal } from '@/components/ui/input-nominal';
import type { RaRow, RaLevel, RaJenis } from '../_lib/types';
import { outcomeOf, deriveQuartersFromMonthly, BULAN_LABELS } from '../_lib/types';
import { apiUpsert, apiDelete, apiList, VersionConflictError } from '../_lib/api';
import { exportListPdf, exportListXlsx } from '../_lib/exports';

interface Props {
  level: RaLevel;
  rows: RaRow[];
  selectedYear: number;
  onReload: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export default function DataEntryForm({ level, rows, selectedYear, onReload, notify }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  const [sasaran, setSasaran]       = useState('');
  const [tujuan, setTujuan]         = useState('');
  const [outcomeProgram, setOutcomeProgram]       = useState('');
  const [outcomeKegiatan, setOutcomeKegiatan]     = useState('');
  const [outcomeSubKegiatan, setOutcomeSubKegiatan] = useState('');
  const [program, setProgram]       = useState('');
  const [kegiatan, setKegiatan]     = useState('');
  const [subKegiatan, setSubKeg]    = useState('');
  const [indikator, setIndikator]   = useState('');
  const [satuan, setSatuan]         = useState('Persen');
  const [jenis, setJenis]           = useState<RaJenis>('Akumulatif');
  const [targetRpjmd, setTargetRpjmd]   = useState(100);
  const [targetTahunan, setTargetTahunan] = useState(100);
  const [q1, setQ1] = useState(25); const [q2, setQ2] = useState(25);
  const [q3, setQ3] = useState(25); const [q4, setQ4] = useState(25);
  const [anggaranNominal, setAnggaranNominal] = useState(0);
  // R3: null = belum diisi, 0 = nol nyata
  const [bulanTarget, setBulanTarget] = useState<(number | null)[]>(() => Array(12).fill(null));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RaRow | null>(null);

  // Parent rows utk dropdown (fetch sesuai kebutuhan level)
  const [parentTujuans, setParentTujuans] = useState<string[]>([]);
  const [parentSasarans, setParentSasarans] = useState<string[]>([]);
  const [parentPrograms, setParentPrograms] = useState<string[]>([]);
  const [parentKegiatans, setParentKegiatans] = useState<RaRow[]>([]);

  const levelRows = rows.filter(r => r.level === level);
  const isSub = level === 'sub-kegiatan';
  // Opsi A: untuk sub-kegiatan, q1-q4 di-derive dari target bulanan (preview live).
  const derivedQ = deriveQuartersFromMonthly(bulanTarget, jenis);

  useEffect(() => {
    resetForm();
  }, [level]);

  // Fetch parent dropdown options sesuai level
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (level === 'sasaran') {
          const tujuans = await apiList(selectedYear, 'tujuan');
          if (!cancelled) setParentTujuans(Array.from(new Set(tujuans.map(r => r.program).filter(Boolean))));
        } else if (level === 'program') {
          const sasarans = await apiList(selectedYear, 'sasaran');
          if (!cancelled) setParentSasarans(Array.from(new Set(sasarans.map(r => r.program).filter(Boolean))));
        } else if (level === 'kegiatan') {
          const programs = await apiList(selectedYear, 'program');
          if (!cancelled) setParentPrograms(Array.from(new Set(programs.map(r => r.program).filter(Boolean))));
        } else if (level === 'sub-kegiatan') {
          const [programs, kegiatans] = await Promise.all([
            apiList(selectedYear, 'program'),
            apiList(selectedYear, 'kegiatan'),
          ]);
          if (!cancelled) {
            setParentPrograms(Array.from(new Set(programs.map(r => r.program).filter(Boolean))));
            setParentKegiatans(kegiatans);
          }
        }
      } catch (err) {
        if (!cancelled) notify((err as Error).message || 'Gagal muat opsi parent', 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [level, selectedYear, notify]);

  // Untuk sub-kegiatan: kegiatans difilter berdasarkan program yg dipilih
  const filteredKegiatans = level === 'sub-kegiatan' && program
    ? Array.from(new Set(parentKegiatans.filter(r => r.program === program).map(r => r.kegiatan).filter((k): k is string => !!k)))
    : Array.from(new Set(parentKegiatans.map(r => r.kegiatan).filter((k): k is string => !!k)));

  function resetForm() {
    setSasaran(''); setTujuan(''); setProgram(''); setKegiatan(''); setSubKeg(''); setIndikator('');
    setOutcomeProgram(''); setOutcomeKegiatan(''); setOutcomeSubKegiatan('');
    setSatuan('Persen'); setJenis('Akumulatif');
    setTargetRpjmd(100); setTargetTahunan(100);
    setQ1(25); setQ2(25); setQ3(25); setQ4(25);
    setAnggaranNominal(0);
    setBulanTarget(Array(12).fill(0));
    setEditingId(null);
    setEditingVersion(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nm = indikator.trim();
    if (!nm) { toast.error('Nama indikator tidak boleh kosong!'); return; }
    if (!program.trim()) {
      toast.error(level === 'sasaran' ? 'Nama sasaran tidak boleh kosong!' : 'Nama program tidak boleh kosong!');
      return;
    }
    if (level === 'sasaran' && !tujuan.trim()) {
      toast.error('Tujuan wajib diisi untuk Sasaran!'); return;
    }
    if (level === 'program' && !sasaran.trim()) {
      toast.error('Sasaran wajib diisi untuk Program!'); return;
    }
    if ((level === 'kegiatan' || level === 'sub-kegiatan') && !kegiatan.trim()) {
      toast.error('Nama kegiatan tidak boleh kosong!'); return;
    }
    if (level === 'sub-kegiatan' && !subKegiatan.trim()) {
      toast.error('Nama sub kegiatan tidak boleh kosong!'); return;
    }

    setBusy(true);
    try {
      await apiUpsert({
        id: editingId,
        expected_version: editingVersion,
        tahun: selectedYear,
        level,
        sasaran: level === 'program' ? sasaran.trim() : null,
        tujuan: level === 'sasaran' ? tujuan.trim() : null,
        outcome_program:      level === 'program'      ? (outcomeProgram.trim()    || null) : null,
        outcome_kegiatan:     level === 'kegiatan'     ? (outcomeKegiatan.trim()   || null) : null,
        outcome_sub_kegiatan: level === 'sub-kegiatan' ? (outcomeSubKegiatan.trim()|| null) : null,
        program: program.trim(),
        kegiatan: (level === 'kegiatan' || level === 'sub-kegiatan') ? kegiatan.trim() : null,
        sub_kegiatan: level === 'sub-kegiatan' ? subKegiatan.trim() : null,
        indikator: nm,
        jenis, satuan: satuan.trim(),
        target_rpjmd: targetRpjmd, target_tahunan: targetTahunan,
        q1_target: q1, q2_target: q2, q3_target: q3, q4_target: q4,
        anggaran_nominal: level === 'sub-kegiatan' ? (anggaranNominal || null) : null,
        bulan_target: isSub ? bulanTarget : null,
      });
      notify(editingId ? `Berhasil memperbarui data entry: ${nm}` : `Berhasil menambah data entry baru: ${nm}`, 'success');
      resetForm();
      await onReload();
    } catch (err) {
      notify((err as Error).message || 'Gagal menyimpan', 'error');
      // L51: versi baris berubah di server — refresh list; form dibiarkan terisi
      // supaya user bisa banding & terapkan ulang perubahannya.
      if (err instanceof VersionConflictError) await onReload();
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (row: RaRow) => {
    setEditingId(row.id);
    setEditingVersion(row.version);
    setSasaran(row.sasaran ?? '');
    setTujuan(row.tujuan ?? '');
    setOutcomeProgram(row.outcome_program ?? '');
    setOutcomeKegiatan(row.outcome_kegiatan ?? '');
    setOutcomeSubKegiatan(row.outcome_sub_kegiatan ?? '');
    setProgram(row.program);
    setKegiatan(row.kegiatan ?? '');
    setSubKeg(row.sub_kegiatan ?? '');
    setIndikator(row.indikator);
    setSatuan(row.satuan); setJenis(row.jenis);
    setTargetRpjmd(row.target_rpjmd); setTargetTahunan(row.target_tahunan);
    setQ1(row.q1_target); setQ2(row.q2_target);
    setQ3(row.q3_target); setQ4(row.q4_target);
    setAnggaranNominal(row.anggaran_nominal ?? 0);
    setBulanTarget(Array.isArray(row.bulan_target) && row.bulan_target.length === 12
      ? row.bulan_target.slice() : Array(12).fill(null));
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleDelete = async (row: RaRow) => {
    setBusy(true);
    try {
      await apiDelete(row.id);
      notify('Berhasil menghapus entri.', 'warning');
      if (editingId === row.id) resetForm();
      await onReload();
    } catch (err) {
      notify((err as Error).message || 'Gagal hapus', 'error');
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#EEF2F6] px-4 py-8 md:px-8">
      {/* View Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EF9F27]/10 text-[#EF9F27]">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 md:text-3xl uppercase">
              Renaksi & Kinerja Data Entry {selectedYear}: {level.replace('-', ' ')}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Form input terstruktur untuk penyesuaian target tahunan, RPJMD, dan rincian realisasi triwulan.
            </p>
          </div>
        </div>
      </div>

      {/* Grid form + table */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Form */}
        <div className="xl:col-span-1">
          <form ref={formRef} onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-xs border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-[#EF9F27]" />
                {editingId ? 'Mode Edit Data' : 'Form Entri Target & Triwulan'}
              </span>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[10px] font-bold text-[#E24B4A] hover:underline"
                >
                  Batal Edit
                </button>
              )}
            </div>

            {/* Sasaran — dropdown utk level=program (parent reference dari menu Sasaran) */}
            {level === 'program' && (
              <div className="space-y-1 ra-cascade-cell">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Sasaran (Pilih dari Menu Sasaran)
                </label>
                <SoftSelect
                  value={sasaran}
                  options={[{ value: '', label: '— Pilih Sasaran —' }, ...parentSasarans.map(s => ({ value: s, label: s }))]}
                  onChange={(v) => { setSasaran(v); }}
                  placeholder="— Pilih Sasaran —"
                />
                {!parentSasarans.length && (
                  <p className="text-[10px] text-[#E24B4A] font-medium">Belum ada data Sasaran. Isi menu Data Entry Sasaran dulu.</p>
                )}
              </div>
            )}

            {/* Tujuan (level=tujuan) input manual — nama tujuan disimpan di kolom program (mirror sasaran) */}
            {level === 'tujuan' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Tujuan (Input Manual)
                </label>
                <input
                  type="text"
                  required
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Ketik nama tujuan..."
                />
              </div>
            )}

            {/* Tujuan — dropdown induk utk level=sasaran (parent reference dari menu Tujuan) */}
            {level === 'sasaran' && (
              <div className="space-y-1 ra-cascade-cell">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Tujuan (Pilih dari Menu Tujuan)
                </label>
                <SoftSelect
                  value={tujuan}
                  options={[{ value: '', label: '— Pilih Tujuan —' }, ...parentTujuans.map(t => ({ value: t, label: t }))]}
                  onChange={(v) => { setTujuan(v); }}
                  placeholder="— Pilih Tujuan —"
                />
                {!parentTujuans.length && (
                  <p className="text-[10px] text-[#E24B4A] font-medium">Belum ada data Tujuan. Isi menu Data Entry Tujuan dulu.</p>
                )}
              </div>
            )}

            {/* Sasaran (level=sasaran) input manual */}
            {level === 'sasaran' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Sasaran (Input Manual)
                </label>
                <input
                  type="text"
                  required
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Ketik nama sasaran..."
                />
              </div>
            )}

            {/* Program — input manual utk level=program, dropdown utk kegiatan/sub-kegiatan */}
            {level === 'program' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Program (Input Manual)
                </label>
                <input
                  type="text"
                  required
                  value={program}
                  onChange={(e) => setProgram(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Ketik nama program..."
                />
              </div>
            )}

            {/* Sasaran Program — outcome statement (level=program). Dipakai oleh Import Renaksi → PK Master Sasaran. */}
            {level === 'program' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Sasaran Program (Outcome)
                </label>
                <input
                  type="text"
                  value={outcomeProgram}
                  onChange={(e) => setOutcomeProgram(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Mis: Meningkatnya kualitas pelayanan administrasi..."
                />
              </div>
            )}

            {(level === 'kegiatan' || level === 'sub-kegiatan') && (
              <div className="space-y-1 ra-cascade-cell">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Program (Pilih dari Menu Program)
                </label>
                <SoftSelect
                  value={program}
                  options={[{ value: '', label: '— Pilih Program —' }, ...parentPrograms.map(p => ({ value: p, label: p }))]}
                  onChange={(v) => { setProgram(v); if (level === 'sub-kegiatan') setKegiatan(''); }}
                  placeholder="— Pilih Program —"
                />
                {!parentPrograms.length && (
                  <p className="text-[10px] text-[#E24B4A] font-medium">Belum ada data Program. Isi menu Data Entry Program dulu.</p>
                )}
              </div>
            )}

            {/* Kegiatan — input manual utk level=kegiatan, dropdown utk sub-kegiatan */}
            {level === 'kegiatan' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Kegiatan (Input Manual)
                </label>
                <input
                  type="text"
                  required
                  value={kegiatan}
                  onChange={(e) => setKegiatan(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Ketik nama kegiatan..."
                />
              </div>
            )}

            {/* Sasaran Kegiatan — outcome statement (level=kegiatan). */}
            {level === 'kegiatan' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Sasaran Kegiatan (Outcome)
                </label>
                <input
                  type="text"
                  value={outcomeKegiatan}
                  onChange={(e) => setOutcomeKegiatan(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Mis: Tersedianya layanan administrasi yang tepat waktu..."
                />
              </div>
            )}

            {level === 'sub-kegiatan' && (
              <div className="space-y-1 ra-cascade-cell">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Kegiatan (Pilih dari Menu Kegiatan)
                </label>
                <SoftSelect
                  value={kegiatan}
                  options={[{ value: '', label: '— Pilih Kegiatan —' }, ...filteredKegiatans.map(k => ({ value: k, label: k }))]}
                  onChange={setKegiatan}
                  placeholder="— Pilih Kegiatan —"
                  disabled={!program}
                />
                {program && !filteredKegiatans.length && (
                  <p className="text-[10px] text-[#E24B4A] font-medium">Belum ada Kegiatan untuk Program ini.</p>
                )}
              </div>
            )}

            {level === 'sub-kegiatan' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Sub Kegiatan (Input Manual)
                </label>
                <input
                  type="text"
                  required
                  value={subKegiatan}
                  onChange={(e) => setSubKeg(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Ketik nama sub kegiatan..."
                />
              </div>
            )}

            {/* Sasaran Sub Kegiatan — outcome statement (level=sub-kegiatan). */}
            {level === 'sub-kegiatan' && (
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Sasaran Sub Kegiatan (Outcome)
                </label>
                <input
                  type="text"
                  value={outcomeSubKegiatan}
                  onChange={(e) => setOutcomeSubKegiatan(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                  placeholder="Mis: Terlaksananya pengelolaan ATK..."
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Nama Indikator Kinerja (Input Manual)
              </label>
              <input
                type="text"
                required
                value={indikator}
                onChange={(e) => setIndikator(e.target.value)}
                className="w-full rounded border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 focus:border-[#EF9F27] focus:outline-none"
                placeholder="Ketik nama indikator..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Satuan Kinerja</label>
                <input
                  type="text"
                  required
                  value={satuan}
                  onChange={(e) => setSatuan(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  placeholder="Contoh: Dokumen, Laporan, %"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Jenis Evaluasi</label>
                <select
                  value={jenis}
                  onChange={(e) => setJenis(e.target.value as RaJenis)}
                  className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                  style={{ colorScheme: 'light' }}
                >
                  <option value="Akumulatif">Akumulatif</option>
                  <option value="Progres Positif">Progres Positif</option>
                  <option value="Progres Negatif">Progres Negatif</option>
                  <option value="Pengulangan">Pengulangan</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5 pt-1.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target RPJMD</label>
                <PrimaNumberField
                  size="sm"
                  min={0}
                  required
                  value={targetRpjmd === 0 ? '' : targetRpjmd}
                  placeholder="0"
                  onChange={(e) => setTargetRpjmd(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Tahunan</label>
                <PrimaNumberField
                  size="sm"
                  min={0}
                  required
                  value={targetTahunan === 0 ? '' : targetTahunan}
                  placeholder="0"
                  onChange={(e) => setTargetTahunan(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                />
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
              <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1">
                📅 TARGET TRIWULANAN{isSub && <span className="ml-1 text-[#7C5CFC] normal-case tracking-normal">— otomatis dari target bulanan</span>}
              </span>
              <div className="grid grid-cols-2 gap-3.5">
                {isSub
                  ? (['TW I', 'TW II', 'TW III', 'TW IV'] as const).map((lbl, i) => (
                      <div key={lbl} className="space-y-1">
                        <span className="text-[10px] font-semibold text-slate-500 block">{lbl}</span>
                        <div
                          className="w-full rounded border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 text-center"
                          style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
                        >
                          {derivedQ[i]}
                        </div>
                      </div>
                    ))
                  : [
                      { lbl: 'TW I', val: q1, set: setQ1 },
                      { lbl: 'TW II', val: q2, set: setQ2 },
                      { lbl: 'TW III', val: q3, set: setQ3 },
                      { lbl: 'TW IV', val: q4, set: setQ4 },
                    ].map(({ lbl, val, set }) => (
                      <div key={lbl} className="space-y-1">
                        <span className="text-[10px] font-semibold text-slate-500 block">{lbl}</span>
                        <PrimaNumberField
                          size="sm"
                          min={0}
                          value={val === 0 ? '' : val}
                          placeholder="0"
                          onChange={(e) => set(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0))}
                        />
                      </div>
                    ))}
              </div>
            </div>

            {level === 'sub-kegiatan' && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
                <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-widest block border-b border-slate-100 pb-1">
                  💰 ANGGARAN (INFO PAGU)
                </span>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Anggaran Nominal (Rp)</label>
                  <InputNominal
                    value={anggaranNominal}
                    onChange={(v) => setAnggaranNominal(v)}
                    className="w-full rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-700 bg-white text-right focus:ring-1 focus:ring-[#EF9F27] focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400">Pagu anggaran sub-kegiatan ini (informasi). Kosongkan jika belum ada.</p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3">
              <PrimaButton
                type="submit"
                variant={editingId ? 'primary' : 'purple'}
                size="md"
                iconLeft={<Plus size={14} />}
                disabled={busy}
              >
                {editingId ? 'Simpan' : 'Tambah Data'}
              </PrimaButton>
            </div>
          </form>
        </div>

        {/* Table */}
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-2xl bg-white shadow-xs border border-slate-100 overflow-hidden">
            <div className="relative z-20 px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Tag className="h-4 w-4 text-[#1D9E75]" />
                  Basis Data Kertas Kinerja: {level.toUpperCase()}
                </span>
                <p className="text-[11px] text-slate-400 font-medium">
                  Menampilkan {levelRows.length} entri konfigurasi yang tersimpan di sistem.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <DownloadButton
                  variant="excel"
                  label="Excel"
                  disabled={!levelRows.length}
                  onClick={async () => {
                    try { await exportListXlsx(levelRows, selectedYear, level); notify('Excel diunduh', 'success'); }
                    catch (e) { notify((e as Error).message, 'error'); }
                  }}
                />
                <DownloadButton
                  variant="pdf"
                  label="PDF"
                  disabled={!levelRows.length}
                  onClick={async () => {
                    try { await exportListPdf(levelRows, selectedYear, level); notify('PDF diunduh', 'success'); }
                    catch (e) { notify((e as Error).message, 'error'); }
                  }}
                />
                <span className="text-[9.5px] font-mono rounded-full bg-slate-200 text-slate-700 px-2.5 py-0.5 font-bold uppercase">
                  {level}
                </span>
              </div>
            </div>

            {levelRows.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-3">
                <FolderOpen className="h-12 w-12 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold">Tidak ada kertas kerja indikator untuk level ini.</p>
                <p className="text-[11px] leading-normal text-slate-400 max-w-sm mx-auto">
                  Gunakan form di sebelah kiri untuk membuat entri indikator baru dan mengaitkannya dengan rincian triwulan.
                </p>
              </div>
            ) : (
              <div className="overflow-auto" style={levelRows.length > 5 ? { maxHeight: 'calc((5 * 4.75rem + 5rem) * 0.6375)' } : undefined}>
                <table className="w-full text-left text-xs text-slate-600 border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <th rowSpan={2} className="px-5 py-3.5 w-12">No</th>
                      {level === 'tujuan' && (
                        <th rowSpan={2} className="px-5 py-3.5 max-w-[200px]">Tujuan</th>
                      )}
                      {level === 'sasaran' && (
                        <>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[180px]">Tujuan</th>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[180px]">Sasaran</th>
                        </>
                      )}
                      {level === 'program' && (
                        <>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[180px]">Sasaran</th>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[180px]">Program</th>
                        </>
                      )}
                      {level === 'kegiatan' && (
                        <>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[180px]">Program</th>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[180px]">Kegiatan</th>
                        </>
                      )}
                      {level === 'sub-kegiatan' && (
                        <>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[160px]">Program</th>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[160px]">Kegiatan</th>
                          <th rowSpan={2} className="px-5 py-3.5 max-w-[160px]">Sub Kegiatan</th>
                          <th rowSpan={2} className="px-5 py-3.5 text-right max-w-[140px]">Anggaran (Rp)</th>
                        </>
                      )}
                      <th rowSpan={2} className="px-5 py-3.5">Indikator</th>
                      {level !== 'sasaran' && level !== 'tujuan' && (
                        <th rowSpan={2} className="px-5 py-3.5 max-w-[220px]">Sasaran (Outcome)</th>
                      )}
                      <th rowSpan={2} className="px-5 py-3.5 text-center">Target RPJMD</th>
                      <th rowSpan={2} className="px-5 py-3.5 text-center">Target Tahunan</th>
                      <th rowSpan={2} className="px-5 py-3.5 text-center">Satuan</th>
                      <th rowSpan={2} className="px-5 py-3.5 text-center">Jenis</th>
                      {level === 'sub-kegiatan' && (
                        <th colSpan={12} className="px-3 py-2 text-center border-l border-slate-200 text-[#7C5CFC]">Target Bulanan</th>
                      )}
                      {[1, 2, 3, 4].map(q => (
                        <th key={q} colSpan={2} className="px-3 py-2 text-center border-l border-slate-200">TW{q}</th>
                      ))}
                      <th rowSpan={2} className="px-5 py-3.5 text-right w-24 border-l border-slate-200">Aksi</th>
                    </tr>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      {level === 'sub-kegiatan' && BULAN_LABELS.map((b, i) => (
                        <th key={`bln${i}`} className={`px-1.5 py-1.5 text-center ${i === 0 ? 'border-l border-slate-200' : ''}`}>{b}</th>
                      ))}
                      {[1, 2, 3, 4].map(q => [
                        <th key={`t${q}`} className="px-2 py-1.5 text-center border-l border-slate-200">T</th>,
                        <th key={`r${q}`} className="px-2 py-1.5 text-center">R</th>,
                      ])}
                    </tr>
                  </thead>
                  <tbody>
                    {levelRows.map((row, idx) => (
                      <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-4 font-semibold text-slate-400">{idx + 1}</td>
                        {level === 'tujuan' && (
                          <td className="px-5 py-4 max-w-[200px] leading-relaxed">
                            <span className="font-bold text-[#7C5CFC] text-[11px] block" title={row.program}>
                              {row.program}
                            </span>
                          </td>
                        )}
                        {level === 'sasaran' && (
                          <>
                            <td className="px-5 py-4 max-w-[180px] leading-relaxed">
                              <span className="font-semibold text-[#7C5CFC] text-[11px] block" title={row.tujuan ?? ''}>
                                {row.tujuan || <span className="text-slate-300 font-normal">—</span>}
                              </span>
                            </td>
                            <td className="px-5 py-4 max-w-[180px] leading-relaxed">
                              <span className="font-bold text-[#10B981] text-[11px] block" title={row.program}>
                                {row.program}
                              </span>
                            </td>
                          </>
                        )}
                        {level === 'program' && (
                          <>
                            <td className="px-5 py-4 max-w-[180px] leading-relaxed">
                              <span className="font-semibold text-[#10B981] text-[11px] block" title={row.sasaran ?? ''}>
                                {row.sasaran || <span className="text-slate-300 font-normal">—</span>}
                              </span>
                            </td>
                            <td className="px-5 py-4 max-w-[180px] leading-relaxed">
                              <span className="font-bold text-[#378ADD] text-[11px] block" title={row.program}>
                                {row.program}
                              </span>
                            </td>
                          </>
                        )}
                        {level === 'kegiatan' && (
                          <>
                            <td className="px-5 py-4 max-w-[180px] leading-relaxed">
                              <span className="font-semibold text-[#378ADD] text-[11px] block" title={row.program}>
                                {row.program}
                              </span>
                            </td>
                            <td className="px-5 py-4 max-w-[180px] leading-relaxed">
                              <span className="font-bold text-[#EC4899] text-[11px] block" title={row.kegiatan ?? ''}>
                                {row.kegiatan || <span className="text-slate-300 font-normal">—</span>}
                              </span>
                            </td>
                          </>
                        )}
                        {level === 'sub-kegiatan' && (
                          <>
                            <td className="px-5 py-4 max-w-[160px] leading-relaxed">
                              <span className="font-semibold text-[#378ADD] text-[11px] block" title={row.program}>
                                {row.program}
                              </span>
                            </td>
                            <td className="px-5 py-4 max-w-[160px] leading-relaxed">
                              <span className="font-semibold text-[#EC4899] text-[11px] block" title={row.kegiatan ?? ''}>
                                {row.kegiatan || <span className="text-slate-300 font-normal">—</span>}
                              </span>
                            </td>
                            <td className="px-5 py-4 max-w-[160px] leading-relaxed">
                              <span className="font-bold text-[#F59E0B] text-[11px] block" title={row.sub_kegiatan ?? ''}>
                                {row.sub_kegiatan || <span className="text-slate-300 font-normal">—</span>}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right font-bold text-slate-700 whitespace-nowrap max-w-[140px]"
                                style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                              {row.anggaran_nominal != null
                                ? `Rp ${row.anggaran_nominal.toLocaleString('id-ID')}`
                                : <span className="text-slate-300 font-normal">—</span>}
                            </td>
                          </>
                        )}
                        <td className="px-5 py-4 font-bold text-slate-700 leading-normal max-w-[220px]">
                          {row.indikator}
                        </td>
                        {level !== 'sasaran' && level !== 'tujuan' && (
                          <td className="px-5 py-4 italic text-slate-600 leading-normal max-w-[220px] text-[11px]">
                            {outcomeOf(row) || <span className="text-slate-300 not-italic">—</span>}
                          </td>
                        )}
                        <td className="px-5 py-4 text-center font-bold text-slate-700 whitespace-nowrap"
                            style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                          {row.target_rpjmd}
                        </td>
                        <td className="px-5 py-4 text-center font-bold text-[#1D9E75] whitespace-nowrap"
                            style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                          {row.target_tahunan}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className="bg-[#378ADD]/10 text-[#378ADD] px-2 py-0.5 rounded-sm text-[9.5px] font-bold inline-block">
                            {row.satuan}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center text-[10px] text-slate-500 font-medium"
                            style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                          {row.jenis}
                        </td>
                        {level === 'sub-kegiatan' && (Array.isArray(row.bulan_target) && row.bulan_target.length === 12
                          ? row.bulan_target
                          : Array(12).fill(0)
                        ).map((v: number, i: number) => (
                          <td key={`bln${i}`} className={`px-1.5 py-4 text-center text-slate-500 ${i === 0 ? 'border-l border-slate-100' : ''}`}
                              style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                            {v > 0 ? v : <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                        {[
                          { t: row.q1_target, r: row.q1_realisasi },
                          { t: row.q2_target, r: row.q2_realisasi },
                          { t: row.q3_target, r: row.q3_realisasi },
                          { t: row.q4_target, r: row.q4_realisasi },
                        ].map((q, i) => [
                          <td key={`t${i}`} className="px-2 py-4 text-center text-slate-500 border-l border-slate-100"
                              style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{q.t}</td>,
                          <td key={`r${i}`} className={`px-2 py-4 text-center font-bold ${q.r > 0 ? 'text-[#1D9E75]' : 'text-slate-500'}`}
                              style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{q.r}</td>,
                        ])}
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Tip label="Edit Kertas Kerja"><button
                              onClick={() => handleEdit(row)}
                              className="p-1.5 text-slate-500 hover:text-[#EF9F27] hover:bg-[#EF9F27]/20 rounded-lg transition-all"
                            >
                              <Edit className="h-4 w-4" />
                            </button></Tip>
                            <Tip label="Hapus Kertas Kerja"><button
                              onClick={() => setConfirmDelete(row)}
                              disabled={busy}
                              className="p-1.5 text-slate-500 hover:text-[#E24B4A] hover:bg-[#E24B4A]/20 rounded-lg transition-all disabled:opacity-40"
                            >
                              <DeleteIcon size={16} />
                            </button></Tip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form Target Bulanan (L-shape, sub-kegiatan saja) — sumber derive q1-q4 */}
          {isSub && (
            <div className="rounded-2xl bg-white shadow-xs border border-slate-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-[#7C5CFC]/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Tag className="h-4 w-4 text-[#7C5CFC]" />
                    Target Bulanan {editingId ? '(Mode Edit)' : '(Entri Baru)'}
                  </span>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Isi target tiap bulan — TW I–IV otomatis terhitung sesuai jenis evaluasi (<strong>{jenis}</strong>). Tahunan/RPJMD tetap manual.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBulanTarget(Array(12).fill(null))}
                  className="text-[10px] font-bold text-[#E24B4A] hover:underline self-start sm:self-auto"
                >
                  Kosongkan
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {BULAN_LABELS.map((bln, i) => (
                    <div key={bln} className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{bln}</label>
                      <PrimaNumberField
                        size="sm"
                        min={0}
                        value={bulanTarget[i] == null ? '' : bulanTarget[i]}
                        placeholder="—"
                        inputClassName="text-right"
                        onChange={(e) => {
                          // R3: kosong = belum diisi (null); "0" = nol nyata. R6: desimal boleh.
                          const v = e.target.value === '' ? null : (parseFloat(e.target.value) || 0);
                          setBulanTarget(prev => prev.map((x, idx) => (idx === i ? v : x)));
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-[#7C5CFC]/20 bg-[#7C5CFC]/5 p-3">
                  <span className="text-[9.5px] font-bold text-[#7C5CFC] uppercase tracking-widest block mb-2">
                    Pratinjau Triwulan (otomatis)
                  </span>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {(['TW I', 'TW II', 'TW III', 'TW IV'] as const).map((lbl, i) => (
                      <div key={lbl}>
                        <span className="text-[9px] font-semibold text-slate-400 block">{lbl}</span>
                        <span className="text-sm font-bold text-slate-700" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                          {derivedQ[i]}
                        </span>
                      </div>
                    ))}
                    <div className="border-l border-[#7C5CFC]/20">
                      <span className="text-[9px] font-semibold text-[#7C5CFC] block">
                        {jenis === 'Akumulatif' ? 'TOTAL' : 'AKHIR'}
                      </span>
                      <span className="text-sm font-bold text-[#7C5CFC]" style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                        {jenis === 'Akumulatif'
                          ? derivedQ.reduce((a, b) => a + b, 0)
                          : (() => { for (let i = 11; i >= 0; i--) { const v = bulanTarget[i]; if (v != null) return v; } return 0; })()}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    {jenis === 'Akumulatif'
                      ? 'Akumulatif: TW = jumlah 3 bulan. Tekan Simpan/Tambah di form kiri untuk menyimpan.'
                      : 'Progres/Pengulangan: TW = bulan terakhir terisi di triwulan itu (snapshot). Tekan Simpan/Tambah di form kiri untuk menyimpan.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info board */}
          <div className="rounded-2xl bg-[#378ADD]/5 p-4 border border-[#378ADD]/20 flex gap-3 text-[#1F3F73]">
            <AlertCircle className="h-5 w-5 text-[#378ADD] mt-0.5 shrink-0" />
            <div className="text-xs space-y-1">
              <strong className="block text-slate-900">Hubungan Data Kinerja:</strong>
              <p className="leading-relaxed">
                Setiap data yang Anda tambahkan/edit di sini otomatis terhubung ke menu <strong>Realisasi Kinerja</strong>. Ketika Anda buka tab Kinerja dan memilih Indikator yang sudah Anda tambahkan, angka realisasi, target tahunan, target RPJMD, hingga triwulanan yang ditampilkan adalah data kustomisasi Anda.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0f172a]/70" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#EF9F27] to-[#E24B4A]" />
            <div className="p-6 space-y-4">
              <h3 className="font-bold text-slate-800 text-base">Hapus Indikator?</h3>
              <p className="text-xs text-slate-600">
                Indikator <strong>&quot;{confirmDelete.indikator}&quot;</strong> beserta seluruh target & realisasi triwulan akan dihapus permanen.
              </p>
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <PrimaButton variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Batal</PrimaButton>
                <PrimaButton variant="danger" size="sm" iconLeft={<DeleteIcon size={12} />} onClick={() => handleDelete(confirmDelete)}>
                  Ya, Hapus
                </PrimaButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
