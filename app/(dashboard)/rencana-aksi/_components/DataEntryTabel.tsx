'use client';
// Tabel Data Entry Renaksi: cari, saring, kelompok per induk, tampilan Lengkap/Ringkas, kartu di ponsel.
// Hanya tampilan — form & jalur simpan tetap di DataEntryForm (panel samping). Aturan saring di
// lib/renaksi/tabel-data-entry.ts. Konsep: docs/konsep/renaksi/CONCEPT-renaksi-tabel-data-entry.md.

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Edit, FolderOpen, Search, X } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import SoftSelect from '@/components/ui/SoftSelect';
import Tip from '@/components/ui/Tip';
import { tulisDesimal } from '@/lib/shared/desimal';
import { paguSendiri, tulisPerSumber } from '@/lib/renaksi/pagu';
import {
  LABEL_KEADAAN, SARINGAN_KOSONG, hitungKeadaan, keadaanBerlaku, kelompokkan, lolosSaringan, namaEntitasBaris, opsiInduk,
  type Keadaan, type Saringan,
} from '@/lib/renaksi/tabel-data-entry';
import type { RaLevel, RaRow } from '../_lib/types';
import { usePenanda } from '../_lib/penanda';
import { BULAN_LABELS, outcomeOf, tulisRealisasi } from '../_lib/types';

type Tampilan = 'lengkap' | 'ringkas';
const KUNCI_TAMPILAN = 'ra-data-entry-tampilan';
const MONO = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

const JUDUL_ENTITAS: Record<RaLevel, string> = {
  tujuan: 'Tujuan', sasaran: 'Sasaran', program: 'Program', kegiatan: 'Kegiatan', 'sub-kegiatan': 'Sub Kegiatan',
};
const WARNA_ENTITAS: Record<RaLevel, string> = {
  tujuan: 'text-[#7C5CFC]', sasaran: 'text-[#10B981]', program: 'text-[#378ADD]', kegiatan: 'text-[#EC4899]', 'sub-kegiatan': 'text-[#F59E0B]',
};
const JUDUL_INDUK: Partial<Record<RaLevel, [string, string?]>> = {
  sasaran: ['Tujuan'], program: ['Sasaran'], kegiatan: ['Program'], 'sub-kegiatan': ['Program', 'Kegiatan'],
};

function bacaTampilan(): Tampilan {
  if (typeof window === 'undefined') return 'lengkap';
  try { return window.localStorage.getItem(KUNCI_TAMPILAN) === 'ringkas' ? 'ringkas' : 'lengkap'; } catch { return 'lengkap'; }
}

interface Props {
  level: RaLevel;
  rows: RaRow[];
  busy: boolean;
  onEdit: (row: RaRow) => void;
  onHapus: (row: RaRow) => void;
  /** Tombol kepala (Tambah, Import, Excel, PDF) — milik form, tabel hanya menempatkannya. */
  aksiKepala: ReactNode;
}

export default function DataEntryTabel({ level, rows, busy, onEdit, onHapus, aksiKepala }: Props) {
  const penanda = usePenanda();
  const isSub = level === 'sub-kegiatan';
  const [tampilan, setTampilan] = useState<Tampilan>(bacaTampilan);
  const [saring, setSaring] = useState<Saringan>(SARINGAN_KOSONG);
  const [terlipat, setTerlipat] = useState<ReadonlySet<string>>(new Set());

  const tersaring = useMemo(() => rows.filter(r => lolosSaringan(r, saring)), [rows, saring]);
  const kelompok = useMemo(() => kelompokkan(tersaring), [tersaring]);
  // Nomor urut bersambung antarkelompok (kelompok terlipat tetap memakai nomornya).
  const awalNomor = useMemo(() => kelompok.map((_, i) => kelompok.slice(0, i).reduce((n, g) => n + g.baris.length, 0)), [kelompok]);
  const hitung = useMemo(() => hitungKeadaan(rows, saring), [rows, saring]);
  const opsi1 = useMemo(() => opsiInduk(rows, 0), [rows]);
  const opsi2 = useMemo(() => (isSub ? opsiInduk(rows, 1, saring.induk1) : []), [rows, isSub, saring.induk1]);
  const judulInduk = JUDUL_INDUK[level];
  const berkelompok = level !== 'tujuan';
  const adaSaringan = saring.cari.trim() !== '' || saring.induk1 !== '' || saring.induk2 !== '' || saring.keadaan.length > 0;

  function gantiTampilan(t: Tampilan) {
    setTampilan(t);
    try { window.localStorage.setItem(KUNCI_TAMPILAN, t); } catch { /* kenyamanan saja */ }
  }
  const toggleKeadaan = (k: Keadaan) =>
    setSaring(s => ({ ...s, keadaan: s.keadaan.includes(k) ? s.keadaan.filter(x => x !== k) : [...s.keadaan, k] }));
  const toggleLipat = (kunci: string) =>
    setTerlipat(prev => { const n = new Set(prev); if (n.has(kunci)) n.delete(kunci); else n.add(kunci); return n; });
  const semuaTerlipat = kelompok.length > 0 && kelompok.every(g => terlipat.has(g.kunci));

  const namaBaris = (r: RaRow) => penanda.nama(namaEntitasBaris(r), level) || '—';
  const kepalaKelompok = (g: (typeof kelompok)[number]) =>
    g.bagian.map(b => penanda.nama(b.nama, b.level) || `(${JUDUL_ENTITAS[b.level]} kosong)`).join(' › ');

  const paguSel = (r: RaRow) => {
    const p = paguSendiri(r);
    const rinci = tulisPerSumber(p);
    const tanpa = p?.perSumber.some(s => s.sumber === '') && p.perSumber.length > 0;
    return (
      <>
        {r.anggaran_nominal != null ? `Rp ${r.anggaran_nominal.toLocaleString('id-ID')}` : <span className="text-slate-300 font-normal">—</span>}
        {rinci
          ? <span className="block text-[10px] font-normal text-slate-500 whitespace-normal">{rinci}</span>
          : tanpa ? <span className="block text-[10px] font-normal text-[#BA7517] whitespace-normal">tanpa sumber — atur lewat ✎</span> : null}
      </>
    );
  };

  const tombolAksi = (r: RaRow) => (
    <div className="flex items-center justify-end gap-1">
      <Tip label="Ubah"><button type="button" onClick={() => onEdit(r)} aria-label={`Ubah ${r.indikator}`}
        className="p-1.5 text-slate-500 hover:text-[#EF9F27] hover:bg-[#EF9F27]/20 rounded-lg transition-all">
        <Edit className="h-4 w-4" />
      </button></Tip>
      <Tip label="Hapus"><button type="button" onClick={() => onHapus(r)} disabled={busy} aria-label={`Hapus ${r.indikator}`}
        className="p-1.5 text-slate-500 hover:text-[#E24B4A] hover:bg-[#E24B4A]/20 rounded-lg transition-all disabled:opacity-40">
        <DeleteIcon size={16} />
      </button></Tip>
    </div>
  );

  const twBaris = (r: RaRow) => [
    { t: r.q1_target, r: r.q1_realisasi }, { t: r.q2_target, r: r.q2_realisasi },
    { t: r.q3_target, r: r.q3_realisasi }, { t: r.q4_target, r: r.q4_realisasi },
  ];
  const warnaReal = (v: number | null) => (v == null ? 'text-slate-300' : v > 0 ? 'text-[#1D9E75]' : 'text-slate-500');

  // Jumlah kolom per tampilan — dipakai colSpan kepala kelompok.
  const adaOutcome = level !== 'tujuan' && level !== 'sasaran';
  const jumlahKolom = tampilan === 'ringkas'
    ? 5 + (isSub ? 1 : 0)
    : 2 + (isSub ? 1 : 0) + 1 + (adaOutcome ? 1 : 0) + 4 + (isSub ? 12 : 0) + 8 + 1;

  const stickyNo = 'sticky left-0 z-[2]';
  const stickyNama = 'sticky left-[44px] z-[2]';
  const stickyAksi = 'sticky right-0 z-[2]';

  const barisTabel = (r: RaRow, nomor: number) => {
    if (tampilan === 'ringkas') {
      return (
        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors align-top">
          <td className="px-3 py-3 font-semibold text-slate-400 w-[44px]">{nomor}</td>
          <td className="px-3 py-3 min-w-[260px] max-w-[460px]">
            <Tip label={namaBaris(r)}>
              <span className={`block text-[11px] font-bold line-clamp-2 ${WARNA_ENTITAS[level]}`}>{namaBaris(r)}</span>
            </Tip>
            <span className="mt-0.5 block text-xs font-semibold text-slate-700 leading-snug">{penanda.indikator(r)}</span>
            {r.kode && <span className="mt-0.5 block text-[10px] text-slate-400" style={MONO}>{r.kode}</span>}
          </td>
          <td className="px-3 py-3 whitespace-nowrap">
            <span className="font-bold text-[#1D9E75]" style={MONO}>{tulisDesimal(r.target_tahunan)}</span>{' '}
            <span className="text-[10px] font-bold text-[#378ADD]">{r.satuan}</span>
            <span className="block text-[10px] text-slate-400">{r.jenis}</span>
          </td>
          {isSub && <td className="px-3 py-3 text-right font-bold text-slate-700 min-w-[150px]" style={MONO}>{paguSel(r)}</td>}
          <td className="px-3 py-3">
            <div className="grid grid-cols-4 gap-1 min-w-[230px]">
              {twBaris(r).map((q, i) => (
                <div key={i} className="rounded border border-slate-100 bg-slate-50 px-1 py-0.5 text-center text-[10px]" style={MONO}>
                  <span className="block text-[9px] font-semibold text-slate-400">TW{i + 1}</span>
                  <span className="text-slate-500">{tulisDesimal(q.t)}</span>
                  <span className="text-slate-300"> / </span>
                  <span className={`font-bold ${warnaReal(q.r)}`}>{tulisRealisasi(q.r)}</span>
                </div>
              ))}
            </div>
          </td>
          <td className="px-3 py-3 text-right w-[84px]">{tombolAksi(r)}</td>
        </tr>
      );
    }
    const bulan = Array.isArray(r.bulan_target) && r.bulan_target.length === 12 ? r.bulan_target : Array<number | null>(12).fill(null);
    return (
      <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/70 transition-colors align-top">
        <td className={`${stickyNo} bg-white px-3 py-3 font-semibold text-slate-400 w-[44px] min-w-[44px]`}>{nomor}</td>
        <td className={`${stickyNama} bg-white px-3 py-3 w-[220px] min-w-[220px] max-w-[220px] border-r border-slate-100`}>
          <Tip label={namaBaris(r)}>
            <span className={`block text-[11px] font-bold leading-relaxed line-clamp-2 ${WARNA_ENTITAS[level]}`}>{namaBaris(r)}</span>
          </Tip>
          {r.kode && <span className="block text-[10px] text-slate-400" style={MONO}>{r.kode}</span>}
        </td>
        {isSub && <td className="px-3 py-3 text-right font-bold text-slate-700 min-w-[150px] max-w-[190px]" style={MONO}>{paguSel(r)}</td>}
        <td className="px-3 py-3 font-bold text-slate-700 leading-normal min-w-[200px] max-w-[260px]">{penanda.indikator(r)}</td>
        {adaOutcome && (
          <td className="px-3 py-3 italic text-slate-600 leading-normal min-w-[180px] max-w-[240px] text-[11px]">
            {outcomeOf(r) || <span className="text-slate-300 not-italic">—</span>}
          </td>
        )}
        <td className="px-3 py-3 text-center font-bold text-slate-700 whitespace-nowrap" style={MONO}>{tulisDesimal(r.target_rpjmd)}</td>
        <td className="px-3 py-3 text-center font-bold text-[#1D9E75] whitespace-nowrap" style={MONO}>{tulisDesimal(r.target_tahunan)}</td>
        <td className="px-3 py-3 text-center">
          <span className="bg-[#378ADD]/10 text-[#378ADD] px-2 py-0.5 rounded-sm text-[9.5px] font-bold inline-block">{r.satuan}</span>
        </td>
        <td className="px-3 py-3 text-center text-[10px] text-slate-500 font-medium whitespace-nowrap" style={MONO}>{r.jenis}</td>
        {isSub && bulan.map((v, i) => (
          <td key={`b${i}`} className={`px-1.5 py-3 text-center text-slate-500 ${i === 0 ? 'border-l border-slate-100' : ''}`} style={MONO}>
            {v != null && v > 0 ? tulisDesimal(v) : <span className="text-slate-300">—</span>}
          </td>
        ))}
        {twBaris(r).map((q, i) => [
          <td key={`t${i}`} className="px-2 py-3 text-center text-slate-500 border-l border-slate-100" style={MONO}>{tulisDesimal(q.t)}</td>,
          <td key={`r${i}`} className={`px-2 py-3 text-center font-bold ${warnaReal(q.r)}`} style={MONO}>{tulisRealisasi(q.r)}</td>,
        ])}
        <td className={`${stickyAksi} bg-white px-3 py-3 w-[84px] border-l border-slate-100`}>{tombolAksi(r)}</td>
      </tr>
    );
  };

  const kepalaTabel = tampilan === 'ringkas' ? (
    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
      <th className="px-3 py-3 w-[44px] bg-slate-50">No</th>
      <th className="px-3 py-3 bg-slate-50">{JUDUL_ENTITAS[level]} / Indikator</th>
      <th className="px-3 py-3 bg-slate-50">Target Tahunan</th>
      {isSub && <th className="px-3 py-3 text-right bg-slate-50">Pagu (Rp)</th>}
      <th className="px-3 py-3 bg-slate-50">Triwulan (target / realisasi)</th>
      <th className="px-3 py-3 text-right bg-slate-50">Aksi</th>
    </tr>
  ) : (
    <>
      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
        <th rowSpan={2} className={`${stickyNo} bg-slate-50 px-3 py-3 w-[44px]`}>No</th>
        <th rowSpan={2} className={`${stickyNama} bg-slate-50 px-3 py-3 border-r border-slate-100`}>{JUDUL_ENTITAS[level]}</th>
        {isSub && <th rowSpan={2} className="px-3 py-3 text-right">Anggaran (Rp)</th>}
        <th rowSpan={2} className="px-3 py-3">Indikator</th>
        {adaOutcome && <th rowSpan={2} className="px-3 py-3">Sasaran (Outcome)</th>}
        <th rowSpan={2} className="px-3 py-3 text-center">Target RPJMD</th>
        <th rowSpan={2} className="px-3 py-3 text-center">Target Tahunan</th>
        <th rowSpan={2} className="px-3 py-3 text-center">Satuan</th>
        <th rowSpan={2} className="px-3 py-3 text-center">Jenis</th>
        {isSub && <th colSpan={12} className="px-3 py-2 text-center border-l border-slate-200 text-[#7C5CFC]">Target Bulanan</th>}
        {[1, 2, 3, 4].map(q => <th key={q} colSpan={2} className="px-3 py-2 text-center border-l border-slate-200">TW{q}</th>)}
        <th rowSpan={2} className={`${stickyAksi} bg-slate-50 px-3 py-3 text-right border-l border-slate-100`}>Aksi</th>
      </tr>
      <tr className="bg-slate-50 border-b border-slate-100 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
        {isSub && BULAN_LABELS.map((b, i) => (
          <th key={`bl${i}`} className={`px-1.5 py-1.5 text-center ${i === 0 ? 'border-l border-slate-200' : ''}`}>{b}</th>
        ))}
        {[1, 2, 3, 4].map(q => [
          <th key={`t${q}`} className="px-2 py-1.5 text-center border-l border-slate-200">T</th>,
          <th key={`r${q}`} className="px-2 py-1.5 text-center">R</th>,
        ])}
      </tr>
    </>
  );

  const badan = kelompok.flatMap((g, gi) => {
    const lipat = terlipat.has(g.kunci);
    const nomorAwal = awalNomor[gi];
    const kepala = berkelompok ? (
      <tr key={`g-${g.kunci}`} className="bg-slate-100 border-b border-slate-200">
        <td colSpan={jumlahKolom} className="p-0">
          <button type="button" onClick={() => toggleLipat(g.kunci)} aria-expanded={!lipat}
            className="sticky left-0 flex max-w-[min(900px,85vw)] items-center gap-2 px-3 py-2 text-left text-[11px] font-bold text-slate-700">
            {lipat ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{kepalaKelompok(g)}</span>
            <span className="shrink-0 font-normal text-slate-500">· {g.baris.length} indikator</span>
          </button>
        </td>
      </tr>
    ) : null;
    return [kepala, ...(lipat ? [] : g.baris.map((r, i) => barisTabel(r, nomorAwal + i + 1)))];
  });

  return (
    <div className="rounded-2xl bg-white shadow-xs border border-slate-100 overflow-hidden">
      <div className="relative z-20 px-4 py-3 border-b border-slate-100 bg-slate-50/50 space-y-3 md:px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <span className="text-sm font-bold text-slate-700">Data Entry {JUDUL_ENTITAS[level]}</span>
            <p className="text-[11px] text-slate-400 font-medium">
              {adaSaringan ? `Menampilkan ${tersaring.length} dari ${rows.length} indikator.` : `${rows.length} indikator tersimpan.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{aksiKepala}</div>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex min-w-[200px] flex-1 items-center md:max-w-[340px]">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
              <input type="search" value={saring.cari} onChange={e => setSaring(s => ({ ...s, cari: e.target.value }))}
                placeholder="Cari nama, indikator, kode, sasaran…" aria-label="Cari di tabel"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-xs text-slate-700 focus:border-[#EF9F27] focus:outline-none" />
            </label>
            {judulInduk && opsi1.length > 1 && (
              <SoftSelect value={saring.induk1} minWidth={170}
                options={[{ value: '', label: `Semua ${judulInduk[0]}` }, ...opsi1.map(n => ({ value: n, label: penanda.nama(n, level === 'sasaran' ? 'tujuan' : level === 'program' ? 'sasaran' : 'program') }))]}
                onChange={v => setSaring(s => ({ ...s, induk1: v, induk2: '' }))} />
            )}
            {isSub && judulInduk?.[1] && opsi2.length > 1 && (
              <SoftSelect value={saring.induk2} minWidth={170}
                options={[{ value: '', label: 'Semua Kegiatan' }, ...opsi2.map(n => ({ value: n, label: penanda.nama(n, 'kegiatan') }))]}
                onChange={v => setSaring(s => ({ ...s, induk2: v }))} />
            )}
            {/* Ponsel selalu kartu, jadi pilihan kolom tidak berarti di sana. */}
            <div className="ml-auto hidden rounded-lg border border-slate-200 p-0.5 sm:flex" role="group" aria-label="Tampilan kolom">
              {(['lengkap', 'ringkas'] as const).map(t => (
                <button key={t} type="button" onClick={() => gantiTampilan(t)} aria-pressed={tampilan === t}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${tampilan === t ? 'bg-[#EF9F27] text-[#020F1C]' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {t === 'lengkap' ? 'Lengkap' : 'Ringkas'}
                </button>
              ))}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {keadaanBerlaku(level).map(k => {
              const aktif = saring.keadaan.includes(k);
              return (
                <button key={k} type="button" onClick={() => toggleKeadaan(k)} aria-pressed={aktif}
                  disabled={!aktif && hitung[k] === 0}
                  className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold transition-colors disabled:opacity-40 ${aktif
                    ? 'border-[#BA7517] bg-[#BA7517] text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {LABEL_KEADAAN[k]} <span style={MONO}>{hitung[k]}</span>
                </button>
              );
            })}
            {adaSaringan && (
              <button type="button" onClick={() => setSaring(SARINGAN_KOSONG)}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-[#E24B4A] hover:underline">
                <X className="h-3 w-3" /> Hapus saringan
              </button>
            )}
            {berkelompok && kelompok.length > 1 && (
              <button type="button" onClick={() => setTerlipat(semuaTerlipat ? new Set() : new Set(kelompok.map(g => g.kunci)))}
                className="ml-auto text-[10.5px] font-bold text-slate-500 hover:underline">
                {semuaTerlipat ? 'Buka semua kelompok' : 'Lipat semua kelompok'}
              </button>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-12 text-center text-slate-400 space-y-3">
          <FolderOpen className="h-12 w-12 text-slate-300 mx-auto" />
          <p className="text-xs font-semibold">Belum ada indikator di level ini.</p>
          <p className="text-[11px] leading-normal text-slate-400 max-w-sm mx-auto">Tekan Tambah Data atau Import untuk mulai.</p>
        </div>
      ) : tersaring.length === 0 ? (
        <div className="p-10 text-center text-xs font-semibold text-slate-400">
          Tidak ada indikator yang cocok dengan saringan ini.
        </div>
      ) : (
        <>
          <div className="ra-de-tabel hidden overflow-auto sm:block" style={{ maxHeight: 'max(360px, calc(100vh - 300px))' }}>
            <table className="w-full text-left text-xs text-slate-600 border-separate border-spacing-0">
              <thead className="sticky top-0 z-[3]">{kepalaTabel}</thead>
              <tbody>{badan}</tbody>
            </table>
          </div>
          <div className="space-y-3 p-3 sm:hidden">
            {kelompok.map(g => (
              <div key={g.kunci} className="space-y-2">
                {berkelompok && <p className="text-[11px] font-bold text-slate-500">{kepalaKelompok(g)}</p>}
                {g.baris.map(r => (
                  <div key={r.id} className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`block text-[11px] font-bold ${WARNA_ENTITAS[level]}`}>{namaBaris(r)}</span>
                        <span className="block text-xs font-semibold text-slate-700">{penanda.indikator(r)}</span>
                      </div>
                      {tombolAksi(r)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      <span>Target <b className="text-[#1D9E75]" style={MONO}>{tulisDesimal(r.target_tahunan)}</b> {r.satuan}</span>
                      {isSub && <span style={MONO}>{r.anggaran_nominal != null ? `Rp ${r.anggaran_nominal.toLocaleString('id-ID')}` : 'Pagu —'}</span>}
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      {twBaris(r).map((q, i) => (
                        <div key={i} className="rounded border border-slate-100 bg-slate-50 px-1 py-0.5 text-center text-[10px]" style={MONO}>
                          <span className="block text-[9px] text-slate-400">TW{i + 1}</span>
                          {tulisDesimal(q.t)} / <span className={`font-bold ${warnaReal(q.r)}`}>{tulisRealisasi(q.r)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
