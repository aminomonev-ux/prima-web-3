'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Save, AlertTriangle, Sparkles, RotateCcw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import type { RaRow } from '../_lib/types';
import { quartersOf, realisasiAkhirTahun, LEVEL_LABELS, outcomeOf } from '../_lib/types';
import { apiUpdateQuarter, apiUpdateTargets, apiResetRealisasi, VersionConflictError } from '../_lib/api';

const moneyFont = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' as const };

// ─── QuarterModal ──────────────────────────────────────────────────────────

interface QuarterModalProps {
  row: RaRow | null;
  quarterId: 1 | 2 | 3 | 4 | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function QuarterModal({ row, quarterId, onClose, onSaved, notify }: QuarterModalProps) {
  const [target, setTarget] = useState('0');
  const [realisasi, setRealisasi] = useState('0');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!row || !quarterId) return;
    const q = quartersOf(row).find(x => x.id === quarterId);
    submittingRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) { setTarget(String(q.target)); setRealisasi(String(q.realisasi)); setErrorMsg(''); setBusy(false); }
  }, [row, quarterId]);

  if (!row || !quarterId) return null;
  const qName = `Triwulan ${quarterId}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const targetNum = parseInt(target) || 0;
    const realisasiNum = parseInt(realisasi) || 0;
    if (targetNum < 0 || realisasiNum < 0) { setErrorMsg('Nilai Target dan Realisasi tidak boleh negatif.'); return; }
    submittingRef.current = true;
    setBusy(true);
    try {
      await apiUpdateQuarter(row.id, quarterId, targetNum, realisasiNum, row.version);
      notify(`Berhasil memperbarui ${qName}`, 'success');
      await onSaved();
    } catch (err) {
      if (err instanceof VersionConflictError) {
        notify('⚠️ Data sudah diubah pengguna lain. Memuat versi terbaru…', 'warning');
        await onSaved();
      } else {
        notify((err as Error).message || 'Gagal simpan', 'error');
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0f172a]/70" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#EF9F27] to-[#BA7517]" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Input Data {qName}</h3>
            <p className="text-xs text-slate-400">Ubah rincian target dan realisasi triwulan berjalan.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-[#E24B4A]/5 border border-[#E24B4A]/20 p-3 text-xs text-[#E24B4A] font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">Target ({qName})</label>
            <PrimaNumberField
              min={0} required value={target}
              onChange={(e) => setTarget(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Contoh: 12"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">Realisasi ({qName})</label>
            <PrimaNumberField
              min={0} required value={realisasi}
              onChange={(e) => setRealisasi(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Contoh: 7"
            />
          </div>

          <div className="rounded-xl bg-[#378ADD]/5 border border-[#378ADD]/20 p-3 text-xs text-[#1F3F73] leading-normal">
            <strong>Informasi Kinerja:</strong> Nilai capaian triwulan dihitung otomatis berdasarkan rasio Realisasi terhadap Target.
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <PrimaButton type="button" variant="ghost" size="sm" onClick={onClose}>Batal</PrimaButton>
            <PrimaButton type="submit" variant="primary" size="sm" iconLeft={<Save size={14} />} disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan Perubahan'}
            </PrimaButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── TargetsModal ──────────────────────────────────────────────────────────

interface TargetsModalProps {
  row: RaRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function TargetsModal({ row, isOpen, onClose, onSaved, notify }: TargetsModalProps) {
  const [rpjmd, setRpjmd] = useState('60');
  const [tahunan, setTahunan] = useState('12');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    submittingRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOpen && row) { setRpjmd(String(row.target_rpjmd)); setTahunan(String(row.target_tahunan)); setErrorMsg(''); setBusy(false); }
  }, [isOpen, row]);

  if (!isOpen || !row) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    const rpjmdNum = parseInt(rpjmd) || 0;
    const tahunanNum = parseInt(tahunan) || 0;
    if (rpjmdNum <= 0 || tahunanNum <= 0) { setErrorMsg('Target Jangka Panjang dan Tahunan harus lebih dari 0.'); return; }
    submittingRef.current = true;
    setBusy(true);
    try {
      await apiUpdateTargets(row.id, rpjmdNum, tahunanNum, row.version);
      notify(`Target tersimpan untuk indikator ${row.indikator}`, 'success');
      await onSaved();
    } catch (err) {
      if (err instanceof VersionConflictError) {
        notify('⚠️ Data sudah diubah pengguna lain. Memuat versi terbaru…', 'warning');
        await onSaved();
      } else {
        notify((err as Error).message || 'Gagal simpan', 'error');
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0f172a]/70" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#1D9E75] to-[#157758]" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Konfigurasi Target Strategis</h3>
            <p className="text-xs text-slate-400">Kelola batas Target Kinerja Tahunan dan RPJMD.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-[#E24B4A]/5 border border-[#E24B4A]/20 p-3 text-xs text-[#E24B4A] font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">Target Kinerja Tahunan</label>
            <PrimaNumberField
              min={1} required value={tahunan}
              onChange={(e) => setTahunan(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600 block">Target Jangka Panjang RPJMD</label>
            <PrimaNumberField
              min={1} required value={rpjmd}
              onChange={(e) => setRpjmd(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>

          <div className="rounded-xl bg-[#1D9E75]/5 border border-[#1D9E75]/20 p-3.5 text-xs text-[#0F5C44] space-y-1">
            <strong className="block">💡 Informasi Target Acuan:</strong>
            <p>Nilai capaian akhir tahun = total realisasi triwulan ÷ target tahunan. Nilai RPJMD = total realisasi ÷ target RPJMD.</p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <PrimaButton type="button" variant="ghost" size="sm" onClick={onClose}>Batal</PrimaButton>
            <PrimaButton type="submit" variant="success" size="sm" iconLeft={<Save size={14} />} disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan Target'}
            </PrimaButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── DetailModal ───────────────────────────────────────────────────────────

interface DetailModalProps {
  row: RaRow | null;
  isOpen: boolean;
  onClose: () => void;
  anggaran?: number | null;
}

export function DetailModal({ row, isOpen, onClose, anggaran }: DetailModalProps) {
  if (!isOpen || !row) return null;
  const menuName = LEVEL_LABELS[row.level];
  const realAkhir = realisasiAkhirTahun(row);
  const outcome = outcomeOf(row);
  const outcomeLabel =
    row.level === 'program'      ? 'Sasaran Program' :
    row.level === 'kegiatan'     ? 'Sasaran Kegiatan' :
    row.level === 'sub-kegiatan' ? 'Sasaran Sub Kegiatan' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0f172a]/75" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
        <div className="h-2 w-full bg-gradient-to-r from-[#E24B4A] via-[#EF9F27] to-[#1D9E75]" />

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Detail {menuName}</h3>
            <p className="text-xs text-slate-400">Surat Keterangan dan Analisis Rinci Evaluasi Kinerja.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="space-y-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Identitas Kinerja ({menuName})
            </h4>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <span className="text-slate-400 font-medium">Nama Indikator:</span>
              <span className="col-span-2 font-semibold text-slate-800">{row.indikator}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <span className="text-slate-400 font-medium">
                {row.level === 'sasaran' ? 'Sasaran:' : 'Program:'}
              </span>
              <span className="col-span-2 text-slate-700 leading-normal">{row.program}</span>
            </div>

            {row.kegiatan && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-slate-400 font-medium">Kegiatan:</span>
                <span className="col-span-2 text-slate-700">{row.kegiatan}</span>
              </div>
            )}

            {row.sub_kegiatan && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-slate-400 font-medium">Sub Kegiatan:</span>
                <span className="col-span-2 text-slate-700">{row.sub_kegiatan}</span>
              </div>
            )}

            {outcome && outcomeLabel && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-slate-400 font-medium">{outcomeLabel}:</span>
                <span className="col-span-2 text-slate-700 italic leading-normal">{outcome}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs">
              <span className="text-slate-400 font-medium">Jenis Evaluasi:</span>
              <span className="col-span-2 font-semibold text-slate-700">{row.jenis}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <span className="text-slate-400 font-medium">Satuan:</span>
              <span className="col-span-2 text-slate-700">{row.satuan}</span>
            </div>

            {anggaran != null && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-slate-400 font-medium">Anggaran:</span>
                <span className="col-span-2 font-bold text-[#1D9E75]" style={moneyFont}>
                  Rp {anggaran.toLocaleString('id-ID')}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Alur Evaluasi Capaian (Sistem {row.jenis})
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-100 p-3 bg-white">
                <span className="text-slate-400 block font-medium">Tahunan ({row.tahun})</span>
                <span className="text-lg font-bold text-slate-800" style={moneyFont}>
                  {realAkhir} dari {row.target_tahunan} {row.satuan}
                </span>
              </div>
              <div className="rounded-xl border border-slate-100 p-3 bg-white">
                <span className="text-slate-400 block font-medium">RPJMD</span>
                <span className="text-lg font-bold text-slate-800" style={moneyFont}>
                  {realAkhir} dari {row.target_rpjmd} {row.satuan}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 rounded-xl bg-[#EF9F27]/5 border border-[#EF9F27]/20 p-3.5 text-xs text-[#7A4D0A]">
            <Sparkles className="h-4 w-4 shrink-0 text-[#EF9F27] mt-0.5" />
            <p className="leading-relaxed">
              <strong>Rekomendasi Evaluasi:</strong> Diperlukan koordinasi intensif pada triwulan berjalan agar realisasi akhir tahun untuk {menuName} dapat memenuhi target {row.target_tahunan} {row.satuan} secara maksimal.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <PrimaButton variant="ghost" size="sm" onClick={onClose}>Tutup Informasi</PrimaButton>
        </div>
      </div>
    </div>
  );
}

// ─── ResetRealisasiModal ───────────────────────────────────────────────────

interface ResetModalProps {
  row: RaRow | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmed: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function ResetRealisasiModal({ row, isOpen, onClose, onConfirmed, notify }: ResetModalProps) {
  const [expectedCode, setExpectedCode] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpectedCode(String(Math.floor(1000 + Math.random() * 9000)));
      setInput('');
    }
  }, [isOpen, row?.id]);

  if (!isOpen || !row) return null;
  const menuName = LEVEL_LABELS[row.level];

  const handleConfirm = async () => {
    if (submittingRef.current || busy || input !== expectedCode) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      await apiResetRealisasi(row.id, input, expectedCode);
      notify(`Realisasi direset untuk: ${row.indikator}`, 'warning');
      await onConfirmed();
    } catch (err) {
      notify((err as Error).message || 'Gagal reset', 'error');
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0f172a]/70" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-[#E24B4A]/20">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#EF9F27] to-[#E24B4A]" />

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E24B4A]/10 text-[#E24B4A]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Konfirmasi Reset Realisasi</h3>
              <p className="text-xs text-slate-400">Tindakan penyetelan ulang realisasi triwulan indikator aktif.</p>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs space-y-2.5 text-slate-600 leading-relaxed">
            <p>
              Anda akan mereset <strong>realisasi triwulan</strong> (TW I–IV) pada indikator yang tersinkronisasi di dropdown yang aktif sekarang:
            </p>
            <div className="space-y-1.5 border-l-2 border-[#EF9F27] pl-3 py-0.5 bg-[#EF9F27]/5 rounded-r-lg">
              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Tingkatan Menu:</span>
                <span className="font-semibold text-slate-700">{menuName}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Indikator Aktif:</span>
                <span className="font-semibold text-slate-700 line-clamp-2">{row.indikator}</span>
              </div>
            </div>
            <p className="text-[#E24B4A] font-medium">
              ⚠️ Realisasi TW I–IV akan dikembalikan ke 0. Target tahunan, RPJMD, dan target triwulan tetap. Tindakan ini permanen.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Ketik kode konfirmasi di bawah ini
            </div>
            <div className="rounded-xl p-3 text-center bg-[#EF9F27]/5 border border-dashed border-[#EF9F27]">
              <span className="text-2xl font-bold tracking-widest text-[#EF9F27]" style={moneyFont}>
                {expectedCode}
              </span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={input}
              onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Ketik 4 digit di atas"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-center text-lg font-bold tracking-widest text-slate-800 focus:border-[#EF9F27] focus:outline-none"
              style={moneyFont}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <PrimaButton variant="ghost" size="sm" onClick={onClose}>Batal</PrimaButton>
            <PrimaButton
              variant="warning"
              size="sm"
              iconLeft={<RotateCcw size={14} />}
              disabled={busy || input !== expectedCode}
              onClick={handleConfirm}
            >
              {busy ? 'Memproses…' : 'Reset Realisasi'}
            </PrimaButton>
          </div>
        </div>
      </div>
    </div>
  );
}
