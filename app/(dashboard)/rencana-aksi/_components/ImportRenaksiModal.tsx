'use client';
// Modal Import Rencana Aksi dari file (.xlsx/.csv/.pdf digital) — upload →
// preview (pemetaan kolom + level terdeteksi + ringkasan dampak) → simpan.
// Dipakai 2 pintu: tombol Header (file lintas-level) & toolbar tiap halaman
// Data Entry (levelHint = level halaman itu). Modal & perilakunya sama; hint
// hanya mengisi dugaan awal + menyaring baris level lain.

import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileUp, Upload, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { LEVEL_LABELS, type RaLevel } from '../_lib/types';

type ColSource = 'header' | 'isi' | 'manual' | 'tidak-ada';
interface ColReport { field: string; col: number | null; header: string; sample: string; source: ColSource }
interface ColOption { col: number; header: string; sample: string }

interface ImpRow {
  baris: number;
  level: RaLevel;
  level_source: string;
  perlu_cek: boolean;
  kode: string | null;
  nama: string;
  induk_tujuan: string | null;
  induk_sasaran: string | null;
  induk_program: string | null;
  induk_kegiatan: string | null;
  outcome: string | null;
  indikator: string;
  satuan: string;
  jenis: 'Akumulatif' | 'Progres Positif' | 'Progres Negatif' | 'Pengulangan';
  target_tahunan: number;
  q: [number, number, number, number];
  bulan: (number | null)[] | null;
  anggaran: number | null;
  catatan: string[];
}

interface Parsed {
  rows: ImpRow[];
  columns: ColReport[];
  columnOptions: ColOption[];
  levelCount: Record<RaLevel, number>;
  bulanTerbaca: boolean;
  warnings: string[];
  source: string;
  kind: 'xlsx' | 'csv' | 'pdf';
}

type Mode = 'tambah' | 'upsert' | 'ganti';

const COL_LABEL: Record<string, string> = {
  tujuan: 'Tujuan', sasaran: 'Sasaran', kode: 'Kode', program: 'Program',
  kegiatan: 'Kegiatan', sub_kegiatan: 'Sub Kegiatan', outcome: 'Output/Outcome',
  indikator: 'Indikator Kinerja', satuan: 'Satuan', target_tahunan: 'Target Tahunan',
  anggaran: 'Anggaran (Rp)', jenis: 'Jenis Indikator',
};
const SRC_BADGE: Record<ColSource, { label: string; warn: boolean }> = {
  header: { label: 'auto · header', warn: false },
  isi: { label: 'auto · isi', warn: false },
  manual: { label: 'manual', warn: false },
  'tidak-ada': { label: 'tidak ada', warn: true },
};
const LEVELS: RaLevel[] = ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'];

const MODE_INFO: Record<Mode, { judul: string; detail: string }> = {
  upsert: {
    judul: 'Tambah + perbarui yang cocok',
    detail: 'Baris baru ditambahkan; indikator yang sudah ada di tahun ini diperbarui target/strukturnya. Realisasi yang sudah diinput tidak tersentuh.',
  },
  tambah: {
    judul: 'Tambah yang belum ada saja',
    detail: 'Indikator yang sudah ada dilewati — data lama sama sekali tidak diubah.',
  },
  ganti: {
    judul: 'Ganti semua (per level di file)',
    detail: 'Baris pada level yang ada di file DIHAPUS lalu diisi ulang, termasuk realisasinya. Level lain tidak tersentuh.',
  },
};

interface Props {
  tahun: number;
  levelHint?: RaLevel | null;
  onClose: () => void;
  onDone: () => void;
  notify: (msg: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export default function ImportRenaksiModal({ tahun, levelHint = null, onClose, onDone, notify }: Props) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ovr, setOvr] = useState<Record<string, number>>({});
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mode, setMode] = useState<Mode>('upsert');
  const [levelEdit, setLevelEdit] = useState<Record<number, RaLevel>>({});
  const [ikutLevelLain, setIkutLevelLain] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const levelOf = useCallback(
    (r: ImpRow): RaLevel => levelEdit[r.baris] ?? r.level,
    [levelEdit],
  );

  const terpakai = useMemo(() => {
    if (!parsed) return [];
    if (!levelHint || ikutLevelLain) return parsed.rows;
    return parsed.rows.filter(r => levelOf(r) === levelHint);
  }, [parsed, levelHint, ikutLevelLain, levelOf]);

  const diluarHint = useMemo(() => {
    if (!parsed || !levelHint) return 0;
    return parsed.rows.filter(r => levelOf(r) !== levelHint).length;
  }, [parsed, levelHint, levelOf]);

  const ringkasan = useMemo(() => {
    const out: Partial<Record<RaLevel, number>> = {};
    for (const r of terpakai) { const lv = levelOf(r); out[lv] = (out[lv] ?? 0) + 1; }
    return out;
  }, [terpakai, levelOf]);

  const perluCek = terpakai.filter(r => r.perlu_cek).length;

  async function upload(f: File, overrides?: Record<string, number>) {
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    if (overrides && Object.keys(overrides).length) fd.append('overrides', JSON.stringify(overrides));
    try {
      const res = await fetch('/api/rencana-aksi/import?step=preview', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) { notify(json.error ?? 'Gagal membaca file', 'error'); if (!overrides) setParsed(null); }
      else {
        setParsed(json as Parsed);
        setFile(f);
        if (!overrides) { setOvr({}); setLevelEdit({}); setIkutLevelLain(false); }
      }
    } catch { notify('Gagal terhubung ke server', 'error'); }
    finally { setBusy(false); }
  }

  function remapColumn(field: string, col: number) {
    if (!file) return;
    const next = { ...ovr, [field]: col };
    setOvr(next);
    void upload(file, next);
  }

  async function simpan() {
    if (!parsed || terpakai.length === 0) return;
    setBusy(true);
    try {
      const rows = terpakai.map(r => ({
        level: levelOf(r),
        nama: r.nama,
        induk_tujuan: r.induk_tujuan,
        induk_sasaran: r.induk_sasaran,
        induk_program: r.induk_program,
        induk_kegiatan: r.induk_kegiatan,
        outcome: r.outcome,
        indikator: r.indikator,
        satuan: r.satuan,
        jenis: r.jenis,
        target_tahunan: r.target_tahunan,
        q: r.q,
        bulan: r.bulan,
        anggaran: r.anggaran,
      }));
      const res = await fetch('/api/rencana-aksi/import?step=commit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tahun, mode, rows }),
      });
      const json = await res.json();
      if (!json.ok) { notify(json.error ?? 'Gagal menyimpan', 'error'); return; }

      const pesan = `${json.disimpan} indikator tersimpan (${json.ditambah} baru, ${json.diperbarui} diperbarui`
        + `${json.dilewati ? `, ${json.dilewati} dilewati` : ''})`;
      if (json.ditahan?.length) {
        notify(`${pesan} · ${json.ditahan.length} ditahan: ${json.ditahan[0].alasan}`, 'warning');
      } else {
        notify(pesan, 'success');
      }
      onDone();
    } catch { notify('Gagal terhubung ke server', 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0f172a]/70" onClick={() => !busy && onClose()} />
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#7C5CFC] to-[#378ADD]" />

        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
            <FileUp className="h-4 w-4 text-[#7C5CFC]" />
            Import Rencana Aksi {tahun}
            {levelHint && <span className="rounded-full bg-[#7C5CFC]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#6D28D9]">{LEVEL_LABELS[levelHint]}</span>}
          </h3>
          <button onClick={() => !busy && onClose()} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />

          {!parsed && (
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#7C5CFC]/40 bg-[#7C5CFC]/5 px-4 py-10 text-slate-500 hover:bg-[#7C5CFC]/10">
              <Upload className="h-6 w-6 text-[#7C5CFC]" />
              <b className="text-sm text-slate-700">{busy ? 'Membaca file…' : 'Klik untuk pilih file'}</b>
              <span className="max-w-md text-center text-[11px] leading-relaxed">
                Matriks Rencana Aksi dalam .xlsx, .csv, atau .pdf digital (bukan hasil scan) — maks 8MB.
                Hasil dibaca dulu untuk ditinjau, tidak langsung tersimpan.
              </span>
            </button>
          )}

          {parsed && (
            <>
              <p className="text-[11px] text-slate-500">
                <b className="text-slate-700">{file?.name}</b> · {parsed.source} · {parsed.rows.length} baris terbaca{' '}
                <button type="button" onClick={() => { setParsed(null); setFile(null); setOvr({}); }}
                  className="ml-1 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:border-[#7C5CFC] hover:text-[#7C5CFC]">
                  ganti file
                </button>
              </p>

              <div className="flex flex-wrap gap-1.5">
                {LEVELS.filter(lv => (ringkasan[lv] ?? 0) > 0).map(lv => (
                  <span key={lv} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                    {LEVEL_LABELS[lv]}: {ringkasan[lv]}
                  </span>
                ))}
                {perluCek > 0 && (
                  <span className="rounded-full bg-[#FEF3E2] px-2.5 py-1 text-[10px] font-bold text-[#92610E]">
                    {perluCek} perlu dicek
                  </span>
                )}
              </div>

              {levelHint && diluarHint > 0 && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#BA7517]/35 bg-[#FEF3E2] px-3 py-2.5 text-[11px] leading-relaxed text-[#92610E]">
                  <input type="checkbox" className="mt-0.5" checked={ikutLevelLain}
                    onChange={e => setIkutLevelLain(e.target.checked)} />
                  <span>
                    <b>{diluarHint} baris</b> bukan level {LEVEL_LABELS[levelHint]}. Secara default hanya baris
                    {' '}{LEVEL_LABELS[levelHint]} yang diimpor — centang untuk mengimpor semuanya sekalian.
                  </span>
                </label>
              )}

              <details className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2"
                open={parsed.columns.some(c => c.source === 'tidak-ada')}>
                <summary className="cursor-pointer select-none text-[11.5px] font-bold text-slate-600">
                  Pemetaan kolom
                </summary>
                <div className="mt-2 space-y-1.5">
                  {parsed.columns.map(c => {
                    const badge = SRC_BADGE[c.source];
                    return (
                      <div key={c.field} className="grid grid-cols-[130px_1fr_auto] items-center gap-2">
                        <span className="text-[10.5px] text-slate-500">{COL_LABEL[c.field] ?? c.field}</span>
                        <select value={c.col ?? ''} disabled={busy}
                          onChange={e => { const v = Number(e.target.value); if (v >= 1) remapColumn(c.field, v); }}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-[10.5px] text-slate-700 focus:border-[#7C5CFC] focus:outline-none">
                          {c.col === null && <option value="">— tidak terdeteksi —</option>}
                          {parsed.columnOptions.map(o => (
                            <option key={o.col} value={o.col}>
                              Kol {o.col}{o.header ? ` — ${o.header.slice(0, 38)}` : ''}{o.sample ? ` (${o.sample.slice(0, 22)})` : ''}
                            </option>
                          ))}
                        </select>
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[9.5px] font-bold ${badge.warn ? 'bg-[#FEF3E2] text-[#92610E]' : 'bg-[#E7F6F0] text-[#157A5B]'}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </details>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cara menyimpan</span>
                {(['upsert', 'tambah', 'ganti'] as Mode[]).map(m => (
                  <label key={m} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${mode === m ? 'border-[#7C5CFC] bg-[#7C5CFC]/5' : 'border-slate-200'}`}>
                    <input type="radio" name="ra-import-mode" className="mt-0.5" checked={mode === m} onChange={() => setMode(m)} />
                    <span>
                      <b className="text-slate-700">{MODE_INFO[m].judul}</b>
                      <span className={`block ${m === 'ganti' ? 'text-[#B91C1C]' : 'text-slate-500'}`}>{MODE_INFO[m].detail}</span>
                    </span>
                  </label>
                ))}
              </div>

              {parsed.warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-[#BA7517]/35 bg-[#FEF3E2] px-3 py-2 text-[11px] leading-relaxed text-[#92610E]">
                  {[...new Set(parsed.warnings)].slice(0, 6).map((w, i) => (
                    <div key={i} className="flex gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</div>
                  ))}
                </div>
              )}

              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                <table className="w-full text-[10.5px]">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-bold">Baris</th>
                      <th className="px-2 py-1.5 text-left font-bold">Level</th>
                      <th className="px-2 py-1.5 text-left font-bold">Entitas / Indikator</th>
                      <th className="px-2 py-1.5 text-right font-bold">Tahunan</th>
                      <th className="px-2 py-1.5 text-right font-bold">TW 1–4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terpakai.map(r => (
                      <tr key={r.baris} className="border-t border-slate-100 align-top">
                        <td className="px-2 py-1.5 text-slate-400">{r.baris}</td>
                        <td className="px-2 py-1.5">
                          <select value={levelOf(r)}
                            onChange={e => setLevelEdit({ ...levelEdit, [r.baris]: e.target.value as RaLevel })}
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold focus:outline-none ${r.perlu_cek ? 'border-[#BA7517] bg-[#FEF3E2] text-[#92610E]' : 'border-slate-200 text-slate-600'}`}>
                            {LEVELS.map(lv => <option key={lv} value={lv}>{LEVEL_LABELS[lv]}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="font-semibold text-slate-700">{r.nama}</div>
                          <div className="text-slate-500">{r.indikator}</div>
                          {r.catatan.map((c, i) => <div key={i} className="text-[9.5px] text-[#92610E]">· {c}</div>)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-600">{r.target_tahunan} {r.satuan}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-slate-600">{r.q.join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-3">
          <span className="text-[11px] text-slate-400">
            {parsed ? `${terpakai.length} baris akan disimpan ke tahun ${tahun}` : ''}
          </span>
          <div className="flex gap-2.5">
            <PrimaButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>Batal</PrimaButton>
            {parsed && (
              <PrimaButton variant={mode === 'ganti' ? 'danger' : 'success'} size="sm"
                disabled={busy || terpakai.length === 0} onClick={() => { void simpan(); }}>
                {busy ? 'Menyimpan…' : mode === 'ganti' ? 'Ganti & Simpan' : 'Simpan Import'}
              </PrimaButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
