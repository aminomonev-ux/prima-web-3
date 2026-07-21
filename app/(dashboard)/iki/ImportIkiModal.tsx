'use client';
// Modal Import Dokumen IKI dari Excel (format VERSI BPSDMD) — upload → preview
// (kartu pemutakhiran pejabat/atasan dari Master PK + ringkasan grup RHK +
// warnings) → tulis via jalur existing: POST /api/iki (create) + PUT /api/iki/[id]
// (save replace-all). Dikalibrasi 20 file asli 2026-07-20.

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, FileUp, Upload } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { stripGolongan } from '@/lib/iki/layout';
import { matchPejabatByJabatan, pejabatOptionValue } from './_lib/types';
import type { IkiListRow, IkiVarian, PejabatSuggest } from './_lib/types';

interface ImpTw { triwulan: 1 | 2 | 3 | 4; target_tw: string; uraian: string | null; target_aksi: string }
interface ImpRhk {
  rhk: string; aspek_a: string; aspek_b: string; aspek_c: string;
  indikator: string; target_tahunan: string; formulasi: string | null; ekspektasi: string | null;
  triwulan: ImpTw[];
}
interface ImpGroup { rhk_intervensi: string | null; rhkList: ImpRhk[] }
interface ImpColReport { field: string; col: number | null; header: string; sample: string; source: 'anchor' | 'header' | 'manual' | 'fallback' }
interface ImpColOption { col: number; header: string; sample: string }
interface Parsed {
  varian: IkiVarian; opd: string; nama: string; nip: string; jabatan: string;
  ikhtisar: string | null; atasanJabatanHint: string | null;
  groups: ImpGroup[]; columns: ImpColReport[]; columnOptions: ImpColOption[];
  warnings: string[]; source: string;
}

const COL_FIELD_LABEL: Record<string, string> = {
  no: 'No',
  rhk_intervensi: 'RHK yang Diintervensi',
  rhk: 'Rencana Hasil Kerja',
  aspek: 'Aspek (a/b/c)',
  indikator: 'Indikator Kinerja',
  target_tahunan: 'Target Tahunan',
  formulasi: 'Formulasi & Ekspektasi',
  romawi: 'Triwulan (romawi)',
  target_tw: 'Target Triwulan',
  uraian: 'Uraian Rencana Aksi',
  target_aksi: 'Target Rencana Aksi',
};
const COL_SOURCE_BADGE: Record<ImpColReport['source'], { label: string; warn: boolean }> = {
  anchor:   { label: 'auto · nomor kolom', warn: false },
  header:   { label: 'auto · header',      warn: false },
  manual:   { label: 'manual',             warn: false },
  fallback: { label: 'perlu cek',          warn: true },
};
interface Identity { nama: string; nip: string; jabatan: string; pangkat: string | null }

interface Props {
  rows: IkiListRow[];
  onClose(): void;
  onDone(id: number): void;
}

export default function ImportIkiModal({ rows, onClose, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ovr, setOvr] = useState<Record<string, number>>({});
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));
  const [pejabat, setPejabat] = useState<PejabatSuggest[]>([]);
  // null = belum disentuh user → default otomatis (derived, bukan setState di effect);
  // '' = eksplisit "dari file" / belum pilih atasan
  const [pemilikSel, setPemilikSel] = useState<string | null>(null);
  const [atasanSel, setAtasanSel] = useState<string | null>(null);
  const [timpa, setTimpa] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!/^\d{4}$/.test(tahun)) { if (alive) setPejabat([]); return; }
      try {
        const res = await fetch(`/api/iki/pejabat?tahun=${tahun}`);
        const json = await res.json();
        if (alive && json.ok) setPejabat(json.rows ?? []);
      } catch { /* suggest opsional */ }
    })();
    return () => { alive = false; };
  }, [tahun]);

  const pemilikMatch = useMemo(
    () => (parsed ? matchPejabatByJabatan(parsed.jabatan, pejabat) : null),
    [parsed, pejabat],
  );
  const atasanMatch = useMemo(
    () => (parsed?.atasanJabatanHint ? matchPejabatByJabatan(parsed.atasanJabatanHint, pejabat) : null),
    [parsed, pejabat],
  );

  // Default (selama user belum menyentuh dropdown): jabatan match Master PK tapi
  // nama beda (kemungkinan ganti pejabat) → default Master PK; atasan = match hint.
  const namaBeda = !!(parsed && pemilikMatch
    && pemilikMatch.p.nama.trim().toLowerCase() !== parsed.nama.trim().toLowerCase());
  const pemilikSelEff = pemilikSel ?? (namaBeda && pemilikMatch ? pejabatOptionValue(pemilikMatch.p) : '');
  const atasanSelEff = atasanSel ?? (atasanMatch ? pejabatOptionValue(atasanMatch.p) : '');

  async function handleFile(f: File, overrides?: Record<string, number>) {
    setBusy(true);
    setFileName(f.name);
    const fd = new FormData();
    fd.append('file', f);
    if (overrides && Object.keys(overrides).length > 0) fd.append('overrides', JSON.stringify(overrides));
    try {
      const res = await fetch('/api/iki/import-excel', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal membaca file.'); if (!overrides) setParsed(null); }
      else {
        setParsed(json as Parsed);
        setFile(f);
        if (!overrides) { setOvr({}); setPemilikSel(null); setAtasanSel(null); setTimpa(false); }
      }
    } catch { toast.error('Gagal terhubung ke server.'); }
    finally { setBusy(false); }
  }

  function remapColumn(field: string, col: number) {
    if (!file) return;
    const next = { ...ovr, [field]: col };
    setOvr(next);
    void handleFile(file, next);
  }

  const fromCombo = (combo: string): Identity | null => {
    const p = pejabat.find(x => pejabatOptionValue(x) === combo);
    if (!p) return null;
    return { nama: p.nama, nip: p.nip ?? '', jabatan: p.jabatan, pangkat: stripGolongan(p.pangkat) || null };
  };
  const pemilik: Identity | null = parsed
    ? (pemilikSelEff ? fromCombo(pemilikSelEff) : { nama: parsed.nama, nip: parsed.nip, jabatan: parsed.jabatan, pangkat: null })
    : null;
  const atasan: Identity | null = atasanSelEff ? fromCombo(atasanSelEff) : null;

  const dupRow = parsed && pemilik
    ? rows.find(r => r.tahun === tahun && r.nip === pemilik.nip && r.jabatan === pemilik.jabatan)
    : undefined;

  const totalRhk = parsed?.groups.reduce((s, g) => s + g.rhkList.length, 0) ?? 0;
  const canApply = !!parsed && !!pemilik && !!pemilik.nama && !!pemilik.nip && /^\d{4}$/.test(tahun)
    && (parsed.varian !== 'STANDAR' || !!atasan)
    && (!dupRow || (dupRow.status === 'DRAFT' && timpa));

  async function apply() {
    if (!parsed || !pemilik) return;
    setBusy(true);
    try {
      let id: number;
      if (dupRow && timpa) {
        id = dupRow.id;
      } else {
        const res = await fetch('/api/iki', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tahun, varian: parsed.varian, nama: pemilik.nama, nip: pemilik.nip, jabatan: pemilik.jabatan, pangkat: pemilik.pangkat }),
        });
        const json = await res.json();
        if (!json.ok) { toast.error(json.message ?? 'Gagal membuat dokumen'); return; }
        id = json.id;
      }

      const dRes = await fetch(`/api/iki/${id}`);
      const dJson = await dRes.json();
      if (!dJson.ok) { toast.error('Gagal memuat dokumen tujuan'); return; }
      const version: number = dJson.data.version;

      // '-' placeholder utk field wajib yang kosong di file — warning parser sudah
      // menandai, user rapikan di editor (dokumen tetap DRAFT).
      const rhk: unknown[] = [];
      let no = 0;
      for (const g of parsed.groups) {
        no += 1;
        for (const r of g.rhkList) {
          rhk.push({
            no_urut: no,
            rhk_intervensi: parsed.varian === 'STANDAR' ? (g.rhk_intervensi || '-') : null,
            rhk: r.rhk || '-',
            aspek_a: r.aspek_a || 'Kuantitatif',
            aspek_b: r.aspek_b,
            aspek_c: r.aspek_c,
            indikator: r.indikator || '-',
            target_tahunan: r.target_tahunan || '',
            formulasi: r.formulasi,
            ekspektasi: parsed.varian === 'STANDAR' ? r.ekspektasi : null,
            renaksi_id: null,
            atasan_rhk_id: null,
            triwulan: r.triwulan,
          });
        }
      }

      const putRes = await fetch(`/api/iki/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_version: version,
          varian: parsed.varian,
          opd: parsed.opd || 'RSJD dr. Amino Gondohutomo Provinsi Jawa Tengah',
          nama: pemilik.nama, nip: pemilik.nip, jabatan: pemilik.jabatan, pangkat: pemilik.pangkat,
          ikhtisar: parsed.ikhtisar,
          nama_atasan: atasan?.nama ?? null,
          nip_atasan: atasan?.nip ?? null,
          jabatan_atasan: atasan?.jabatan ?? null,
          pangkat_atasan: atasan?.pangkat ?? null,
          kota_ttd: 'Semarang',
          tanggal_ttd: null,
          atasan_dokumen_id: null,
          rhk,
        }),
      });
      const putJson = await putRes.json();
      if (!putJson.ok) { toast.error(putJson.message ?? putJson.error ?? 'Gagal menyimpan isi dokumen'); return; }

      toast.success(`Import selesai: ${parsed.groups.length} grup / ${totalRhk} RHK — dokumen DRAFT, rapikan lalu Simpan/Finalisasi.`);
      onDone(id);
    } catch { toast.error('Gagal terhubung ke server.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="iki-modal-bg" onClick={() => !busy && onClose()}>
      <div className="iki-modal" style={{ width: 760 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileUp size={17} /> Import Dokumen IKI dari Excel</h3>

        <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }} />

        {!parsed && (
          <button type="button" className="iki-imp-drop" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={24} />
            <b>{busy ? 'Membaca file…' : 'Klik untuk pilih file .xlsx'}</b>
            <span>Format IKI &quot;VERSI BPSDMD&quot; (Data Pribadi + Form RHK) — maks 5MB. Hasil parse ditinjau dulu, tidak langsung tersimpan.</span>
          </button>
        )}

        {parsed && (
          <>
            <p className="iki-hint" style={{ marginBottom: 10 }}>
              <b>{fileName}</b> · {parsed.source} · varian {parsed.varian} · {parsed.groups.length} grup / {totalRhk} RHK
              {' '}<button type="button" className="iki-imp-relink" onClick={() => { setParsed(null); setFile(null); setOvr({}); }}>ganti file</button>
            </p>

            <label className="iki-field">
              <span>Tahun Dokumen</span>
              <input value={tahun} inputMode="numeric" maxLength={4} style={{ maxWidth: 120 }}
                onChange={e => setTahun(e.target.value.replace(/\D/g, ''))} />
            </label>

            <label className="iki-field">
              <span>Pejabat Pemilik Dokumen</span>
              <select value={pemilikSelEff} onChange={e => setPemilikSel(e.target.value)}>
                <option value="">Dari file: {parsed.nama} — {parsed.jabatan}</option>
                {pejabat.map((p, i) => <option key={i} value={pejabatOptionValue(p)}>Master PK: {pejabatOptionValue(p)}</option>)}
              </select>
              {pemilikMatch && pemilikMatch.p.nama.trim().toLowerCase() !== parsed.nama.trim().toLowerCase() && (
                <span className="iki-imp-warn">
                  ⚠ Nama di file berbeda dengan Master PK {tahun} untuk jabatan ini
                  ({parsed.nama} → {pemilikMatch.p.nama}) — kemungkinan sudah ganti pejabat.
                </span>
              )}
            </label>

            {parsed.varian === 'STANDAR' && (
              <label className="iki-field">
                <span>Atasan Penandatangan (blok &quot;Mengetahui&quot;) — wajib</span>
                <select value={atasanSelEff} onChange={e => setAtasanSel(e.target.value)}>
                  <option value="">— pilih dari Master Pejabat PK —</option>
                  {pejabat.map((p, i) => <option key={i} value={pejabatOptionValue(p)}>{pejabatOptionValue(p)}</option>)}
                </select>
                {parsed.atasanJabatanHint && (
                  <span className="iki-imp-note">Di file: &quot;{parsed.atasanJabatanHint}&quot;{atasanMatch ? '' : ' — tidak ketemu padanan otomatis, pilih manual.'}</span>
                )}
              </label>
            )}

            {dupRow && (
              <div className={`iki-imp-box ${dupRow.status === 'FINAL' ? 'err' : 'warn'}`}>
                <AlertCircle size={14} />
                {dupRow.status === 'FINAL' ? (
                  <span>Dokumen {dupRow.jabatan} ({dupRow.nama}) tahun {tahun} sudah <b>FINAL</b> — tidak bisa ditimpa. Buka kunci dulu atau batalkan.</span>
                ) : (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                    <input type="checkbox" checked={timpa} onChange={e => setTimpa(e.target.checked)} />
                    <span>Dokumen DRAFT untuk pejabat ini sudah ada ({dupRow.jumlah_rhk} RHK) — <b>timpa seluruh isinya</b> dengan hasil import.</span>
                  </label>
                )}
              </div>
            )}

            <details className="iki-imp-cols" open={parsed.columns.some(c => c.source === 'fallback' && c.col !== null)}>
              <summary>
                Pemetaan kolom
                {parsed.columns.some(c => c.source === 'fallback' && c.col !== null)
                  ? <span className="iki-imp-colbadge warn">perlu dicek</span>
                  : <span className="iki-imp-colbadge">otomatis OK</span>}
              </summary>
              <div className="iki-imp-colgrid">
                {parsed.columns
                  .filter(c => parsed.varian === 'STANDAR' || c.field !== 'rhk_intervensi')
                  .map(c => {
                    const badge = COL_SOURCE_BADGE[c.source];
                    return (
                      <div key={c.field} className="iki-imp-colrow">
                        <span className="iki-imp-colname">{COL_FIELD_LABEL[c.field] ?? c.field}</span>
                        <select
                          value={c.col ?? ''}
                          disabled={busy}
                          onChange={e => { const v = Number(e.target.value); if (v >= 1) remapColumn(c.field, v); }}
                        >
                          {c.col === null && <option value="">— tidak terdeteksi —</option>}
                          {parsed.columnOptions.map(o => (
                            <option key={o.col} value={o.col}>
                              Kol {o.col}{o.header ? ` — ${o.header.slice(0, 40)}` : ''}{o.sample ? ` (${o.sample.slice(0, 25)})` : ''}
                            </option>
                          ))}
                        </select>
                        <span className={`iki-imp-colbadge${badge.warn && c.col !== null ? ' warn' : ''}`}>{badge.label}</span>
                      </div>
                    );
                  })}
              </div>
            </details>

            {parsed.warnings.length > 0 && (
              <div className="iki-imp-box warn" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                {[...new Set(parsed.warnings)].slice(0, 8).map((w, i) => <span key={i}>⚠ {w}</span>)}
                {new Set(parsed.warnings).size > 8 && <span>… dan {new Set(parsed.warnings).size - 8} warning lain</span>}
              </div>
            )}

            <div className="iki-imp-groups">
              {parsed.groups.map((g, gi) => (
                <div key={gi} className="iki-imp-group">
                  <div className="iki-imp-group-head">
                    <span className="iki-imp-no">{gi + 1}</span>
                    {parsed.varian === 'STANDAR' && <span className="iki-imp-interv">{g.rhk_intervensi ?? <em>(intervensi kosong)</em>}</span>}
                  </div>
                  {g.rhkList.map((r, ri) => (
                    <div key={ri} className="iki-imp-rhk">
                      <b>{r.rhk || <em>(RHK kosong)</em>}</b>
                      <span>{r.indikator} · target {r.target_tahunan || '-'} · {r.aspek_b}/{r.aspek_c}</span>
                      <span className="iki-imp-tw">TW: {r.triwulan.map(t => t.target_tw).join(' · ')}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="iki-modal-actions" style={{ marginTop: 14 }}>
          <PrimaButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>Batal</PrimaButton>
          {parsed && (
            <PrimaButton variant="success" size="sm" onClick={() => void apply()} disabled={busy || !canApply}>
              {busy ? 'Memproses…' : (dupRow && timpa ? 'Timpa & Import' : 'Import sebagai DRAFT')}
            </PrimaButton>
          )}
        </div>

        <style>{IMP_CSS}</style>
      </div>
    </div>
  );
}

const IMP_CSS = `
  .iki-field select { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 9px 11px; color: #E6F1FB; font-size: 12.5px; }
  .iki-field select:focus { outline: none; border-color: #185FA5; }
  [data-theme="light"] .iki-field select { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  .iki-imp-drop { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 7px; padding: 34px 14px; border-radius: 10px; border: 2px dashed rgba(124,92,252,.45); background: rgba(124,92,252,.06); color: #B5D4F4; cursor: pointer; font-family: inherit; }
  .iki-imp-drop b { color: #E6F1FB; font-size: 13px; }
  .iki-imp-drop span { font-size: 11px; color: #85B7EB; max-width: 420px; line-height: 1.5; }
  .iki-imp-relink { background: transparent; border: 1px solid rgba(181,212,244,.35); color: #B5D4F4; border-radius: 12px; font-size: 10.5px; padding: 1px 8px; cursor: pointer; }
  .iki-imp-warn { font-size: 10.5px; color: #FAC775; line-height: 1.5; }
  .iki-imp-note { font-size: 10.5px; color: #85B7EB; line-height: 1.5; }
  .iki-imp-cols { border: 1px solid rgba(12,68,124,.6); border-radius: 8px; padding: 7px 11px; margin-bottom: 10px; background: rgba(2,15,28,.3); }
  .iki-imp-cols summary { cursor: pointer; font-size: 11.5px; font-weight: 700; color: #B5D4F4; display: flex; align-items: center; gap: 8px; user-select: none; }
  .iki-imp-colgrid { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
  .iki-imp-colrow { display: grid; grid-template-columns: 150px 1fr auto; align-items: center; gap: 8px; }
  .iki-imp-colname { font-size: 11px; color: #85B7EB; }
  .iki-imp-colrow select { width: 100%; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 5px 8px; color: #E6F1FB; font-size: 11px; }
  .iki-imp-colbadge { font-size: 9.5px; font-weight: 700; letter-spacing: .03em; border-radius: 10px; padding: 1px 8px; white-space: nowrap; background: rgba(29,158,117,.14); border: 1px solid rgba(29,158,117,.4); color: #4CC39A; }
  .iki-imp-colbadge.warn { background: rgba(186,117,23,.13); border-color: rgba(186,117,23,.4); color: #FAC775; }
  [data-theme="light"] .iki-imp-cols { border-color: rgba(0,0,0,.1); background: #F9FAFB; }
  [data-theme="light"] .iki-imp-cols summary { color: #374151; }
  [data-theme="light"] .iki-imp-colname { color: #6B7280; }
  [data-theme="light"] .iki-imp-colrow select { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-imp-colbadge { background: #E7F6F0; border-color: rgba(29,158,117,.35); color: #157A5B; }
  [data-theme="light"] .iki-imp-colbadge.warn { background: #FEF3E2; border-color: rgba(186,117,23,.35); color: #92610E; }
  .iki-imp-box { display: flex; align-items: center; gap: 7px; font-size: 11.5px; border-radius: 8px; padding: 8px 11px; margin-bottom: 10px; line-height: 1.5; }
  .iki-imp-box.warn { background: rgba(186,117,23,.13); border: 1px solid rgba(186,117,23,.4); color: #FAC775; }
  .iki-imp-box.err { background: rgba(226,75,74,.14); border: 1px solid rgba(226,75,74,.4); color: #FCA5A5; }
  .iki-imp-groups { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; border: 1px solid rgba(12,68,124,.6); border-radius: 8px; padding: 8px; background: rgba(2,15,28,.3); }
  .iki-imp-group { border: 1px solid rgba(12,68,124,.6); border-radius: 8px; padding: 8px 10px; }
  .iki-imp-group-head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
  .iki-imp-no { font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #EF9F27; background: rgba(239,159,39,.12); border: 1px solid rgba(239,159,39,.35); border-radius: 6px; padding: 1px 8px; font-size: 11px; }
  .iki-imp-interv { font-size: 11px; color: #B5D4F4; line-height: 1.45; }
  .iki-imp-rhk { display: flex; flex-direction: column; gap: 2px; padding: 6px 0 6px 10px; border-top: 1px dashed rgba(12,68,124,.6); }
  .iki-imp-rhk b { font-size: 11.5px; color: #E6F1FB; line-height: 1.4; }
  .iki-imp-rhk span { font-size: 10.5px; color: #85B7EB; line-height: 1.4; }
  .iki-imp-tw { font-family: 'JetBrains Mono', monospace; }
  [data-theme="light"] .iki-imp-drop { border-color: rgba(124,92,252,.45); background: rgba(124,92,252,.06); color: #4B5563; }
  [data-theme="light"] .iki-imp-drop b { color: #111827; }
  [data-theme="light"] .iki-imp-warn { color: #92610E; }
  [data-theme="light"] .iki-imp-box.warn { background: #FEF3E2; border-color: rgba(186,117,23,.35); color: #92610E; }
  [data-theme="light"] .iki-imp-box.err { background: #FDEBEB; border-color: rgba(226,75,74,.35); color: #B91C1C; }
  [data-theme="light"] .iki-imp-groups, [data-theme="light"] .iki-imp-group { border-color: rgba(0,0,0,.1); background: #F9FAFB; }
  [data-theme="light"] .iki-imp-rhk b { color: #111827; }
  [data-theme="light"] .iki-imp-no { color: #B26B00; }
  [data-theme="light"] .iki-imp-interv, [data-theme="light"] .iki-imp-rhk span { color: #6B7280; }
  [data-theme="light"] .iki-imp-relink { border-color: rgba(0,0,0,.2); color: #4B5563; }
`;
