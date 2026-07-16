'use client';
/* Editor dokumen IKI — Data Pribadi + grup RHK (4 baris TW per RHK) +
   import Renaksi / IKI Atasan + export PDF/Excel (lib/iki). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ClipboardCheck, ArrowLeft, Save, Lock, Unlock, Plus, Download,
  FileSpreadsheet, FileText, Import, LayoutGrid, X,
} from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteIcon from '@/components/ui/DeleteIcon';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import ThemeToggle from '@/components/ui/ThemeToggle';
import UserBadge from '@/components/ui/UserBadge';
import FloatingDock from '@/components/ui/FloatingDock';
import {
  type IkiDokumen, type IkiRhk, type IkiListRow, type PejabatSuggest,
  type RenaksiImportRow, type AtasanRhkRow,
  ASPEK_B_OPTIONS, ASPEK_C_OPTIONS, emptyRhk, emptyTriwulan,
} from '../_lib/types';

interface Props {
  username: string;
  role: string;
  themePreference: 'dark' | 'light';
  initialDoc: IkiDokumen;
}

export default function EditorClient({ username, role, themePreference, initialDoc }: Props) {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>(themePreference);
  const isLight = theme === 'light';
  const [doc, setDoc] = useState<IkiDokumen>(initialDoc);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [pejabat, setPejabat] = useState<PejabatSuggest[]>([]);
  const [atasanCandidates, setAtasanCandidates] = useState<IkiListRow[]>([]);

  const readOnly = doc.status === 'FINAL';
  const isDir = doc.varian === 'DIREKTUR';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/iki/pejabat?tahun=${doc.tahun}`);
        const json = await res.json();
        if (alive && json.ok) setPejabat(json.rows);
      } catch { /* suggest opsional — form tetap manual */ }
      try {
        const res = await fetch(`/api/iki?tahun=${doc.tahun}`);
        const json = await res.json();
        if (alive && json.ok) setAtasanCandidates((json.data as IkiListRow[]).filter(r => r.id !== doc.id));
      } catch { /* dropdown atasan opsional */ }
    })();
    return () => { alive = false; };
  }, [doc.tahun, doc.id]);

  function patchDoc(patch: Partial<IkiDokumen>) {
    setDoc(d => ({ ...d, ...patch }));
    setDirty(true);
  }
  function patchRhk(index: number, patch: Partial<IkiRhk>) {
    setDoc(d => ({ ...d, rhk: d.rhk.map((r, i) => i === index ? { ...r, ...patch } : r) }));
    setDirty(true);
  }
  function patchTw(rhkIndex: number, twIndex: number, patch: Partial<IkiRhk['triwulan'][number]>) {
    setDoc(d => ({
      ...d,
      rhk: d.rhk.map((r, i) => i !== rhkIndex ? r : {
        ...r,
        triwulan: r.triwulan.map((t, ti) => ti === twIndex ? { ...t, ...patch } : t),
      }),
    }));
    setDirty(true);
  }

  const groups = useMemo(() => {
    const map = new Map<number, { rhk: IkiRhk; index: number }[]>();
    doc.rhk.forEach((r, index) => {
      const list = map.get(r.no_urut) ?? [];
      list.push({ rhk: r, index });
      map.set(r.no_urut, list);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [doc.rhk]);

  function nextNoUrut() {
    return doc.rhk.length ? Math.max(...doc.rhk.map(r => r.no_urut)) + 1 : 1;
  }
  function addGroup(prefill?: Partial<IkiRhk>) {
    const no = nextNoUrut();
    setDoc(d => ({ ...d, rhk: [...d.rhk, { ...emptyRhk(no), ...prefill, no_urut: no }] }));
    setDirty(true);
  }
  function addRhkToGroup(noUrut: number) {
    setDoc(d => {
      const group = d.rhk.filter(r => r.no_urut === noUrut);
      const proto = group[0];
      const fresh = { ...emptyRhk(noUrut), rhk_intervensi: proto?.rhk_intervensi ?? null };
      const lastIdx = d.rhk.map(r => r.no_urut).lastIndexOf(noUrut);
      const next = [...d.rhk];
      next.splice(lastIdx + 1, 0, fresh);
      return { ...d, rhk: next };
    });
    setDirty(true);
  }
  async function removeRhk(index: number) {
    const r = doc.rhk[index];
    if (r.rhk.trim() || r.indikator.trim()) {
      if (!(await confirmDialog({
        title: 'Hapus baris RHK',
        message: `Hapus RHK "${r.rhk || '(kosong)'}" beserta 4 baris triwulannya?`,
        variant: 'danger',
      }))) return;
    }
    setDoc(d => {
      const next = d.rhk.filter((_, i) => i !== index);
      // Renumber grup agar No. tetap berurutan 1..n
      const order = [...new Set(next.map(x => x.no_urut))].sort((a, b) => a - b);
      const renum = new Map(order.map((no, i) => [no, i + 1]));
      return { ...d, rhk: next.map(x => ({ ...x, no_urut: renum.get(x.no_urut) ?? x.no_urut })) };
    });
    setDirty(true);
  }

  function applyPejabat(p: PejabatSuggest, target: 'diri' | 'atasan') {
    if (target === 'diri') {
      patchDoc({ nama: p.nama, nip: p.nip ?? '', jabatan: p.jabatan, pangkat: p.pangkat });
    } else {
      patchDoc({ nama_atasan: p.nama, nip_atasan: p.nip ?? '', jabatan_atasan: p.jabatan, pangkat_atasan: p.pangkat });
    }
  }

  async function handleSave(silent = false): Promise<boolean> {
    setBusy(true);
    try {
      const payload = {
        expected_version: doc.version,
        varian: doc.varian,
        opd: doc.opd,
        nama: doc.nama,
        nip: doc.nip,
        jabatan: doc.jabatan,
        pangkat: doc.pangkat,
        ikhtisar: doc.ikhtisar,
        nama_atasan: doc.nama_atasan,
        nip_atasan: doc.nip_atasan,
        jabatan_atasan: doc.jabatan_atasan,
        pangkat_atasan: doc.pangkat_atasan,
        kota_ttd: doc.kota_ttd,
        tanggal_ttd: doc.tanggal_ttd,
        atasan_dokumen_id: doc.atasan_dokumen_id,
        rhk: doc.rhk,
      };
      const res = await fetch(`/api/iki/${doc.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.code === 'VERSION_CONFLICT') {
          toast.error('Dokumen diubah pengguna lain — muat ulang halaman.');
        } else {
          toast.error(json.message ?? 'Gagal menyimpan');
        }
        return false;
      }
      setDoc(d => ({ ...d, version: json.version }));
      setDirty(false);
      if (!silent) toast.success('Dokumen tersimpan');
      return true;
    } catch {
      toast.error('Gagal terhubung ke server');
      return false;
    } finally { setBusy(false); }
  }

  async function handleFinalize() {
    if (dirty && !(await handleSave(true))) return;
    if (!(await confirmDialog({
      title: 'Finalisasi dokumen',
      message: 'Dokumen FINAL tidak bisa diubah lagi (hanya SUPER_ADMIN yang bisa membuka kembali). Lanjutkan?',
      variant: 'danger',
    }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/iki/${doc.id}/finalize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_version: doc.version }),
      });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal finalisasi'); return; }
      setDoc(d => ({ ...d, status: 'FINAL', version: d.version + 1 }));
      toast.success('Dokumen difinalisasi');
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBusy(false); }
  }

  async function handleUnfinalize() {
    if (!(await confirmDialog({
      title: 'Buka dokumen FINAL',
      message: 'Kembalikan dokumen ke DRAFT agar bisa diedit lagi?',
      variant: 'warning',
    }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/iki/${doc.id}/finalize`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) { toast.error(json.message ?? 'Gagal membuka dokumen'); return; }
      router.refresh();
      setDoc(d => ({ ...d, status: 'DRAFT', version: d.version + 1 }));
      toast.success('Dokumen kembali DRAFT');
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setBusy(false); }
  }

  async function handleExport(format: 'pdf' | 'xlsx') {
    if (dirty && !readOnly && !(await handleSave(true))) return;
    setBusy(true);
    try {
      if (format === 'pdf') {
        const { exportIkiPdf } = await import('@/lib/iki/export-pdf');
        await exportIkiPdf(doc, doc.tahun);
      } else {
        const { exportIkiExcel } = await import('@/lib/iki/export-excel');
        await exportIkiExcel(doc, doc.tahun);
      }
      toast.success(format === 'pdf' ? 'PDF diunduh' : 'Excel diunduh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal export');
    } finally { setBusy(false); }
  }

  return (
    <div className={`iki-ed-body${isLight ? ' light' : ''}`}>
      <style>{ED_CSS}</style>

      <header className="iki-topbar">
        <div className="iki-brand">
          <button className="iki-back" onClick={() => router.push('/iki')} data-tooltip="Kembali ke daftar" data-tooltip-pos="below"><ArrowLeft size={17} /></button>
          <ClipboardCheck size={18} /> IKI {doc.tahun}
          <span className="iki-brand-sub">{doc.jabatan || '—'}</span>
          <span className={`iki-badge ${readOnly ? 'final' : 'draft'}`}>{doc.status}</span>
          {isDir && <span className="iki-badge dir">DIREKTUR</span>}
        </div>
        <div className="iki-topbar-right">
          <ThemeToggle initialTheme={themePreference} onThemeChange={setTheme} />
          <UserBadge username={username} role={role} isLight={isLight} />
        </div>
      </header>

      <main className="iki-ed-main">
        {readOnly && (
          <div className="iki-final-banner">
            <Lock size={15} /> Dokumen FINAL — hanya baca.
            {role === 'SUPER_ADMIN' && (
              <PrimaButton variant="warning" size="sm" iconLeft={<Unlock size={14} />} onClick={handleUnfinalize} disabled={busy}>Buka Kembali</PrimaButton>
            )}
          </div>
        )}

        {/* ── I. DATA PRIBADI ── */}
        <section className="iki-sec">
          <h2 className="iki-sec-title">I · Data Pribadi</h2>
          <div className="iki-form-grid">
            <label className="iki-f wide"><span>OPD</span>
              <input value={doc.opd} disabled={readOnly} onChange={e => patchDoc({ opd: e.target.value })} />
            </label>
            <label className="iki-f"><span>Varian Form</span>
              <select value={doc.varian} disabled={readOnly} onChange={e => patchDoc({ varian: e.target.value as IkiDokumen['varian'] })}>
                <option value="STANDAR">STANDAR (11 kolom)</option>
                <option value="DIREKTUR">DIREKTUR (8 kolom)</option>
              </select>
            </label>
            <label className="iki-f"><span>Nama (+ gelar)</span>
              <input value={doc.nama} disabled={readOnly} list="iki-pejabat-nama" onChange={e => {
                const p = pejabat.find(x => x.nama === e.target.value);
                if (p) applyPejabat(p, 'diri'); else patchDoc({ nama: e.target.value });
              }} />
              <datalist id="iki-pejabat-nama">
                {pejabat.map((p, i) => <option key={i} value={p.nama}>{p.jabatan}</option>)}
              </datalist>
            </label>
            <label className="iki-f"><span>NIP</span>
              <input value={doc.nip} disabled={readOnly} className="mono" onChange={e => patchDoc({ nip: e.target.value })} />
            </label>
            <label className="iki-f"><span>Jabatan</span>
              <input value={doc.jabatan} disabled={readOnly} onChange={e => patchDoc({ jabatan: e.target.value })} />
            </label>
            <label className="iki-f"><span>Pangkat</span>
              <input value={doc.pangkat ?? ''} disabled={readOnly} placeholder="Pembina Tingkat I" onChange={e => patchDoc({ pangkat: e.target.value || null })} />
            </label>
            <label className="iki-f wide"><span>Ikhtisar Jabatan</span>
              <textarea rows={2} value={doc.ikhtisar ?? ''} disabled={readOnly} onChange={e => patchDoc({ ikhtisar: e.target.value || null })} />
            </label>
          </div>
        </section>

        {/* ── Atasan + TTD ── */}
        <section className="iki-sec">
          <h2 className="iki-sec-title">{isDir ? 'Tanda Tangan' : 'Atasan (blok "Mengetahui") & Tanda Tangan'}</h2>
          <div className="iki-form-grid">
            {!isDir && (<>
              <label className="iki-f"><span>Dokumen IKI Atasan (kaskade)</span>
                <select value={doc.atasan_dokumen_id ?? ''} disabled={readOnly}
                  onChange={e => patchDoc({ atasan_dokumen_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— tidak ditautkan —</option>
                  {atasanCandidates.map(a => <option key={a.id} value={a.id}>{a.jabatan} · {a.nama}</option>)}
                </select>
              </label>
              <label className="iki-f"><span>Nama Atasan</span>
                <input value={doc.nama_atasan ?? ''} disabled={readOnly} list="iki-pejabat-atasan" onChange={e => {
                  const p = pejabat.find(x => x.nama === e.target.value);
                  if (p) applyPejabat(p, 'atasan'); else patchDoc({ nama_atasan: e.target.value || null });
                }} />
                <datalist id="iki-pejabat-atasan">
                  {pejabat.map((p, i) => <option key={i} value={p.nama}>{p.jabatan}</option>)}
                </datalist>
              </label>
              <label className="iki-f"><span>NIP Atasan</span>
                <input value={doc.nip_atasan ?? ''} disabled={readOnly} className="mono" onChange={e => patchDoc({ nip_atasan: e.target.value || null })} />
              </label>
              <label className="iki-f"><span>Jabatan Atasan</span>
                <input value={doc.jabatan_atasan ?? ''} disabled={readOnly} onChange={e => patchDoc({ jabatan_atasan: e.target.value || null })} />
              </label>
              <label className="iki-f"><span>Pangkat Atasan</span>
                <input value={doc.pangkat_atasan ?? ''} disabled={readOnly} onChange={e => patchDoc({ pangkat_atasan: e.target.value || null })} />
              </label>
            </>)}
            <label className="iki-f"><span>Kota TTD</span>
              <input value={doc.kota_ttd} disabled={readOnly} onChange={e => patchDoc({ kota_ttd: e.target.value })} />
            </label>
            <label className="iki-f"><span>Tanggal TTD</span>
              <input type="date" value={doc.tanggal_ttd ?? ''} disabled={readOnly} onChange={e => patchDoc({ tanggal_ttd: e.target.value || null })} />
            </label>
          </div>
        </section>

        {/* ── II. FORM RHK ── */}
        <section className="iki-sec">
          <div className="iki-sec-head">
            <h2 className="iki-sec-title">II · Form Indikator Kinerja Individu</h2>
            {!readOnly && (
              <div className="iki-sec-actions">
                <PrimaButton variant="success" size="sm" iconLeft={<Import size={15} />} onClick={() => setShowImport(true)}>Ambil dari Renaksi / Atasan</PrimaButton>
                <PrimaButton variant="purple" size="sm" iconLeft={<Plus size={15} />} onClick={() => addGroup()}>Tambah Grup RHK</PrimaButton>
              </div>
            )}
          </div>

          {groups.length === 0 && (
            <div className="iki-empty-rhk">Belum ada baris RHK. Tambahkan manual atau ambil dari Rencana Aksi / IKI Atasan.</div>
          )}

          {groups.map(([noUrut, items]) => (
            <div key={noUrut} className="iki-group">
              <div className="iki-group-head">
                <span className="iki-group-no">{noUrut}</span>
                {!isDir && (
                  <label className="iki-f grow"><span>Rencana Hasil Kerja yang diintervensi (RHK atasan)</span>
                    <textarea rows={2} value={items[0].rhk.rhk_intervensi ?? ''} disabled={readOnly}
                      onChange={e => {
                        // RHKI dishare 1 grup — update semua RHK dalam grup
                        const v = e.target.value || null;
                        setDoc(d => ({ ...d, rhk: d.rhk.map(r => r.no_urut === noUrut ? { ...r, rhk_intervensi: v } : r) }));
                        setDirty(true);
                      }} />
                  </label>
                )}
                {!readOnly && (
                  <PrimaButton variant="ghost" size="sm" iconLeft={<Plus size={14} />} onClick={() => addRhkToGroup(noUrut)}>RHK</PrimaButton>
                )}
              </div>

              {items.map(({ rhk: r, index }) => (
                <div key={index} className="iki-rhk">
                  <div className="iki-rhk-grid">
                    <label className="iki-f wide"><span>Rencana Hasil Kerja</span>
                      <textarea rows={2} value={r.rhk} disabled={readOnly} onChange={e => patchRhk(index, { rhk: e.target.value })} />
                    </label>
                    <label className="iki-f wide"><span>Indikator Kinerja Individu</span>
                      <textarea rows={2} value={r.indikator} disabled={readOnly} onChange={e => patchRhk(index, { indikator: e.target.value })} />
                    </label>
                    <label className="iki-f"><span>Aspek a</span>
                      <input value={r.aspek_a} disabled={readOnly} onChange={e => patchRhk(index, { aspek_a: e.target.value })} />
                    </label>
                    <label className="iki-f"><span>Aspek b (cara hitung)</span>
                      <select value={r.aspek_b} disabled={readOnly} onChange={e => patchRhk(index, { aspek_b: e.target.value as IkiRhk['aspek_b'] })}>
                        {ASPEK_B_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <label className="iki-f"><span>Aspek c</span>
                      <select value={r.aspek_c} disabled={readOnly} onChange={e => patchRhk(index, { aspek_c: e.target.value as IkiRhk['aspek_c'] })}>
                        {ASPEK_C_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </label>
                    <label className="iki-f"><span>Target Tahunan</span>
                      <input value={r.target_tahunan} disabled={readOnly} className="mono" placeholder="100% / 1 Dok / 2 keg" onChange={e => patchRhk(index, { target_tahunan: e.target.value })} />
                    </label>
                    <label className="iki-f wide"><span>Formulasi</span>
                      <textarea rows={2} value={r.formulasi ?? ''} disabled={readOnly} onChange={e => patchRhk(index, { formulasi: e.target.value || null })} />
                    </label>
                    {!isDir && (
                      <label className="iki-f wide"><span>Ekspektasi Pimpinan</span>
                        <textarea rows={2} value={r.ekspektasi ?? ''} disabled={readOnly} onChange={e => patchRhk(index, { ekspektasi: e.target.value || null })} />
                      </label>
                    )}
                  </div>

                  <table className="iki-tw">
                    <thead>
                      <tr><th>TW</th><th>Target TW</th><th>Rencana Aksi — Uraian</th><th>Target Aksi</th></tr>
                    </thead>
                    <tbody>
                      {r.triwulan.map((t, ti) => (
                        <tr key={t.triwulan}>
                          <td className="iki-tw-rom">{['I', 'II', 'III', 'IV'][t.triwulan - 1]}</td>
                          <td><input value={t.target_tw} disabled={readOnly} className="mono" onChange={e => patchTw(index, ti, { target_tw: e.target.value })} /></td>
                          <td><input value={t.uraian ?? ''} disabled={readOnly} onChange={e => patchTw(index, ti, { uraian: e.target.value || null })} /></td>
                          <td><input value={t.target_aksi} disabled={readOnly} className="mono" onChange={e => patchTw(index, ti, { target_aksi: e.target.value })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!readOnly && (
                    <div className="iki-rhk-foot">
                      {r.renaksi_id && <span className="iki-src">↳ dari Renaksi #{r.renaksi_id}</span>}
                      {r.atasan_rhk_id && <span className="iki-src">↳ dari IKI Atasan #{r.atasan_rhk_id}</span>}
                      <button className="iki-act danger" data-tooltip="Hapus baris RHK" data-tooltip-pos="above" onClick={() => removeRhk(index)}><DeleteIcon size={15} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>

        {/* ── Aksi bawah ── */}
        <div className="iki-actions-bar">
          <div className="iki-actions-left">
            <PrimaButton variant="success" size="sm" iconLeft={<FileText size={15} />} onClick={() => handleExport('pdf')} disabled={busy}>Unduh PDF</PrimaButton>
            <PrimaButton variant="success" size="sm" iconLeft={<FileSpreadsheet size={15} />} onClick={() => handleExport('xlsx')} disabled={busy}>Unduh Excel</PrimaButton>
          </div>
          {!readOnly && (
            <div className="iki-actions-right">
              <PrimaButton variant="warning" size="sm" iconLeft={<Lock size={15} />} onClick={handleFinalize} disabled={busy}>Finalisasi</PrimaButton>
              <PrimaButton variant="primary" iconLeft={<Save size={16} />} onClick={() => handleSave()} disabled={busy || !dirty}>
                {busy ? 'Menyimpan…' : dirty ? 'Simpan' : 'Tersimpan'}
              </PrimaButton>
            </div>
          )}
        </div>
      </main>

      <FloatingDock isLight={isLight} limelight
        nav={[
          { icon: <ClipboardCheck size={17} />, label: 'Daftar IKI', onClick: () => router.push('/iki') },
          { icon: <LayoutGrid size={17} />, label: 'Menu', onClick: () => router.push('/menu') },
        ]}
        actions={[
          { icon: <Download size={17} />, label: 'PDF', onClick: () => void handleExport('pdf') },
          { icon: <FileSpreadsheet size={17} />, label: 'Excel', onClick: () => void handleExport('xlsx') },
        ]}
      />

      {showImport && !readOnly && (
        <ImportModal
          tahun={doc.tahun}
          atasanDokumenId={doc.atasan_dokumen_id}
          atasanCandidates={atasanCandidates}
          onClose={() => setShowImport(false)}
          onImport={(rows) => {
            for (const r of rows) addGroup(r);
            setShowImport(false);
            toast.success(`${rows.length} grup RHK ditambahkan`);
          }}
        />
      )}
    </div>
  );
}

/* ── Modal import: 2 tab (Renaksi / IKI Atasan) ─────────────────────────────── */

function ImportModal({ tahun, atasanDokumenId, atasanCandidates, onClose, onImport }: {
  tahun: string;
  atasanDokumenId: number | null;
  atasanCandidates: IkiListRow[];
  onClose: () => void;
  onImport: (rows: Partial<IkiRhk>[]) => void;
}) {
  const [tab, setTab] = useState<'renaksi' | 'atasan'>('renaksi');
  const [loading, setLoading] = useState(false);
  const [renaksiRows, setRenaksiRows] = useState<RenaksiImportRow[] | null>(null);
  const [atasanRows, setAtasanRows] = useState<AtasanRhkRow[] | null>(null);
  const [atasanId, setAtasanId] = useState<number | ''>(atasanDokumenId ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const loadRenaksi = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/iki/import-renaksi?tahun=${tahun}`);
      const json = await res.json();
      if (json.ok) setRenaksiRows(json.rows);
      else toast.error(json.message ?? 'Gagal memuat Renaksi');
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setLoading(false); }
  }, [tahun]);

  const loadAtasan = useCallback(async (dokumenId: number) => {
    setLoading(true);
    setAtasanRows(null);
    try {
      const res = await fetch(`/api/iki/import-atasan?dokumen_id=${dokumenId}`);
      const json = await res.json();
      if (json.ok) setAtasanRows(json.rows);
      else toast.error(json.message ?? 'Gagal memuat IKI atasan');
    } catch { toast.error('Gagal terhubung ke server'); }
    finally { setLoading(false); }
  }, []);

  // Fetch-on-open modal (preseden menu-client/lkjip): setLoading di awal loader
  // memang sinkron — aman, hanya sekali per perubahan tab/dokumen.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'renaksi' && renaksiRows === null) void loadRenaksi();
  }, [tab, renaksiRows, loadRenaksi]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'atasan' && atasanId) void loadAtasan(atasanId);
  }, [tab, atasanId, loadAtasan]);

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function submit() {
    const out: Partial<IkiRhk>[] = [];
    if (tab === 'renaksi') {
      for (const r of renaksiRows ?? []) {
        if (!selected.has(`r${r.renaksi_id}`)) continue;
        out.push({
          rhk_intervensi: r.sasaran_induk || r.parent || null,
          rhk: r.rhk,
          indikator: r.indikator,
          aspek_b: r.jenis,
          target_tahunan: r.target_tahunan,
          renaksi_id: r.renaksi_id,
          triwulan: emptyTriwulan().map((t, i) => ({ ...t, target_tw: r.target_tw[i] ?? '0' })),
        });
      }
    } else {
      for (const a of atasanRows ?? []) {
        if (!selected.has(`a${a.atasan_rhk_id}`)) continue;
        out.push({
          rhk_intervensi: a.rhk,
          atasan_rhk_id: a.atasan_rhk_id,
          aspek_b: a.aspek_b,
        });
      }
    }
    if (out.length === 0) { toast.error('Belum ada baris dipilih'); return; }
    onImport(out);
  }

  const q = search.trim().toLowerCase();
  const shownRenaksi = (renaksiRows ?? []).filter(r =>
    r.level !== 'tujuan' &&
    (!q || r.rhk.toLowerCase().includes(q) || r.indikator.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q)));
  const shownAtasan = (atasanRows ?? []).filter(a =>
    !q || a.rhk.toLowerCase().includes(q) || a.indikator.toLowerCase().includes(q));

  return (
    <div className="iki-modal-bg" onClick={onClose}>
      <div className="iki-modal iki-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="iki-modal-head">
          <h3>Ambil Rencana Hasil Kerja</h3>
          <button className="iki-act" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="iki-tabs">
          <button className={`iki-tab${tab === 'renaksi' ? ' on' : ''}`} onClick={() => { setTab('renaksi'); setSelected(new Set()); }}>Dari Rencana Aksi</button>
          <button className={`iki-tab${tab === 'atasan' ? ' on' : ''}`} onClick={() => { setTab('atasan'); setSelected(new Set()); }}>Dari IKI Atasan</button>
        </div>

        {tab === 'atasan' && (
          <select className="iki-modal-select" value={atasanId} onChange={e => setAtasanId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">— pilih dokumen IKI atasan —</option>
            {atasanCandidates.map(a => <option key={a.id} value={a.id}>{a.jabatan} · {a.nama} ({a.tahun})</option>)}
          </select>
        )}

        <input className="iki-modal-search" placeholder="Cari…" value={search} onChange={e => setSearch(e.target.value)} />

        <div className="iki-modal-list">
          {loading && <div className="iki-modal-info">Memuat…</div>}
          {!loading && tab === 'renaksi' && shownRenaksi.length === 0 && (
            <div className="iki-modal-info">Tidak ada data Renaksi tahun {tahun}.</div>
          )}
          {!loading && tab === 'renaksi' && shownRenaksi.map(r => (
            <label key={r.renaksi_id} className="iki-modal-row">
              <input type="checkbox" checked={selected.has(`r${r.renaksi_id}`)} onChange={() => toggle(`r${r.renaksi_id}`)} />
              <div>
                <div className="iki-modal-row-title"><span className={`iki-lvl lvl-${r.level}`}>{r.level}</span> {r.rhk}</div>
                <div className="iki-modal-row-sub">{r.indikator} · <b className="mono">{r.target_tahunan}</b> · {r.jenis}</div>
              </div>
            </label>
          ))}
          {!loading && tab === 'atasan' && !atasanId && (
            <div className="iki-modal-info">Pilih dokumen IKI atasan dulu. RHK atasan menjadi kolom &quot;RHK yang diintervensi&quot;.</div>
          )}
          {!loading && tab === 'atasan' && atasanId !== '' && shownAtasan.length === 0 && atasanRows !== null && (
            <div className="iki-modal-info">Dokumen atasan belum punya baris RHK.</div>
          )}
          {!loading && tab === 'atasan' && shownAtasan.map(a => (
            <label key={a.atasan_rhk_id} className="iki-modal-row">
              <input type="checkbox" checked={selected.has(`a${a.atasan_rhk_id}`)} onChange={() => toggle(`a${a.atasan_rhk_id}`)} />
              <div>
                <div className="iki-modal-row-title"><span className="iki-lvl lvl-atasan">No.{a.no_urut}</span> {a.rhk}</div>
                <div className="iki-modal-row-sub">{a.indikator} · <b className="mono">{a.target_tahunan}</b></div>
              </div>
            </label>
          ))}
        </div>

        <p className="iki-hint">
          {tab === 'renaksi'
            ? 'Tiap baris terpilih menjadi 1 grup RHK: teks RHK/indikator/cara hitung/target TW terisi otomatis — tetap bisa diedit.'
            : 'RHK atasan terpilih menjadi kolom "RHK yang diintervensi" grup baru — isi RHK Anda sendiri setelahnya.'}
        </p>
        <div className="iki-modal-actions">
          <PrimaButton variant="ghost" size="sm" onClick={onClose}>Batal</PrimaButton>
          <PrimaButton variant="success" size="sm" iconLeft={<Import size={14} />} onClick={submit}>Tambahkan ({selected.size})</PrimaButton>
        </div>
      </div>
    </div>
  );
}

const ED_CSS = `
  .iki-ed-body { min-height: 100vh; background: #020F1C; color: #E6F1FB; font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; padding-bottom: 120px; }
  .iki-topbar { position: sticky; top: 0; z-index: 200; display: flex; align-items: center; justify-content: space-between; padding: 10px 22px; min-height: 56px; background: rgba(4,44,83,0.92); backdrop-filter: blur(16px); border-bottom: 1px solid #0C447C; }
  .iki-brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 800; font-size: 15px; color: #EF9F27; flex-wrap: wrap; }
  .iki-brand-sub { font-weight: 500; font-size: 11.5px; color: #85B7EB; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .iki-back { background: rgba(255,255,255,0.06); border: 1px solid #0C447C; color: #B5D4F4; width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .iki-back:hover { border-color: #185FA5; color: #E6F1FB; }
  .iki-topbar-right { display: flex; align-items: center; gap: 12px; }
  .iki-badge { font-size: 10px; font-weight: 800; letter-spacing: .07em; padding: 3px 9px; border-radius: 99px; }
  .iki-badge.draft { background: rgba(124,92,252,0.16); color: #B9A6FF; border: 1px solid rgba(124,92,252,0.4); }
  .iki-badge.final { background: rgba(29,158,117,0.16); color: #7BE0BD; border: 1px solid rgba(29,158,117,0.4); }
  .iki-badge.dir { background: rgba(239,159,39,0.14); color: #F5C77E; border: 1px solid rgba(239,159,39,0.4); }
  .iki-ed-main { max-width: 1120px; margin: 0 auto; padding: 26px 22px; }
  .iki-final-banner { display: flex; align-items: center; gap: 10px; background: rgba(29,158,117,0.1); border: 1px solid rgba(29,158,117,0.4); color: #7BE0BD; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; font-weight: 600; margin-bottom: 18px; }
  .iki-sec { background: #042C53; border: 1px solid #0C447C; border-radius: 12px; padding: 18px; margin-bottom: 18px; }
  .iki-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
  .iki-sec-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .iki-sec-title { font-size: 14px; font-weight: 800; margin: 0 0 14px; color: #EF9F27; letter-spacing: .02em; }
  .iki-sec-head .iki-sec-title { margin-bottom: 10px; }
  .iki-form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .iki-f { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: #85B7EB; }
  .iki-f.wide { grid-column: 1 / -1; }
  .iki-f.grow { flex: 1; }
  .iki-f input, .iki-f textarea, .iki-f select { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 8px 10px; color: #E6F1FB; font-size: 12.5px; font-family: inherit; resize: vertical; }
  .iki-f input:focus, .iki-f textarea:focus, .iki-f select:focus { outline: none; border-color: #185FA5; }
  .iki-f input:disabled, .iki-f textarea:disabled, .iki-f select:disabled { opacity: .55; cursor: not-allowed; }
  .iki-f .mono, .iki-tw .mono { font-family: 'JetBrains Mono', monospace; }
  .iki-empty-rhk { border: 1px dashed #0C447C; border-radius: 10px; padding: 26px; text-align: center; color: #85B7EB; font-size: 12.5px; }
  .iki-group { border: 1px solid #0C447C; border-radius: 10px; padding: 14px; margin-bottom: 14px; background: rgba(2,15,28,0.45); }
  .iki-group-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
  .iki-group-no { flex: none; width: 30px; height: 30px; border-radius: 8px; background: rgba(239,159,39,0.14); border: 1px solid rgba(239,159,39,0.4); color: #F5C77E; font-family: 'JetBrains Mono', monospace; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; margin-top: 18px; }
  .iki-rhk { border: 1px solid rgba(12,68,124,.6); border-radius: 8px; padding: 12px; margin-bottom: 10px; background: rgba(4,44,83,0.35); }
  .iki-rhk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; }
  .iki-rhk-grid .iki-f.wide { grid-column: span 2; }
  .iki-tw { width: 100%; border-collapse: collapse; font-size: 12px; }
  .iki-tw th { text-align: left; font-size: 10.5px; letter-spacing: .05em; color: #85B7EB; padding: 4px 6px; border-bottom: 1px solid #0C447C; }
  .iki-tw td { padding: 3px 4px; }
  .iki-tw td input { width: 100%; background: #020F1C; border: 1px solid #0C447C; border-radius: 5px; padding: 6px 8px; color: #E6F1FB; font-size: 12px; }
  .iki-tw td input:focus { outline: none; border-color: #185FA5; }
  .iki-tw td input:disabled { opacity: .55; }
  .iki-tw-rom { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #F5C77E; width: 34px; text-align: center; }
  .iki-tw td:nth-child(2) { width: 120px; }
  .iki-tw td:nth-child(4) { width: 130px; }
  .iki-rhk-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px; }
  .iki-src { font-size: 10.5px; color: #7BE0BD; font-family: 'JetBrains Mono', monospace; margin-right: auto; }
  .iki-act { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; }
  .iki-act:hover { border-color: #185FA5; color: #E6F1FB; }
  .iki-act.danger:hover { border-color: #E24B4A; color: #FCA5A5; background: rgba(226,75,74,0.1); }
  .iki-actions-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
  .iki-actions-left, .iki-actions-right { display: flex; gap: 8px; flex-wrap: wrap; }
  .iki-modal-bg { position: fixed; inset: 0; background: rgba(2,15,28,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .iki-modal { background: #042C53; border: 1px solid #0C447C; border-radius: 14px; padding: 20px; width: 430px; max-width: 94vw; max-height: 88vh; overflow-y: auto; display: flex; flex-direction: column; }
  .iki-modal-lg { width: 640px; }
  .iki-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .iki-modal h3 { margin: 0; font-size: 15px; font-weight: 800; }
  .iki-tabs { display: flex; gap: 6px; margin-bottom: 12px; }
  .iki-tab { flex: 1; background: #020F1C; border: 1px solid #0C447C; color: #B5D4F4; border-radius: 8px; padding: 8px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
  .iki-tab.on { border-color: #1D9E75; color: #7BE0BD; background: rgba(29,158,117,0.1); }
  .iki-modal-select, .iki-modal-search { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; padding: 8px 10px; color: #E6F1FB; font-size: 12.5px; margin-bottom: 10px; width: 100%; }
  .iki-modal-select:focus, .iki-modal-search:focus { outline: none; border-color: #185FA5; }
  .iki-modal-list { flex: 1; min-height: 180px; max-height: 44vh; overflow-y: auto; border: 1px solid rgba(12,68,124,.6); border-radius: 8px; padding: 6px; margin-bottom: 10px; }
  .iki-modal-info { color: #85B7EB; font-size: 12px; text-align: center; padding: 30px 10px; }
  .iki-modal-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: 6px; cursor: pointer; }
  .iki-modal-row:hover { background: rgba(255,255,255,0.04); }
  .iki-modal-row input { margin-top: 3px; }
  .iki-modal-row-title { font-size: 12.5px; font-weight: 600; line-height: 1.4; }
  .iki-modal-row-sub { font-size: 11px; color: #85B7EB; margin-top: 2px; }
  .iki-lvl { font-size: 9px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding: 2px 6px; border-radius: 5px; background: rgba(55,138,221,0.15); color: #8FC1F2; border: 1px solid rgba(55,138,221,0.4); margin-right: 4px; }
  .iki-lvl.lvl-sasaran { background: rgba(239,159,39,0.14); color: #F5C77E; border-color: rgba(239,159,39,0.4); }
  .iki-lvl.lvl-atasan { background: rgba(124,92,252,0.15); color: #B9A6FF; border-color: rgba(124,92,252,0.4); }
  .iki-hint { font-size: 11px; color: #85B7EB; line-height: 1.5; margin: 0 0 14px; }
  .iki-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

  /* ── LIGHT THEME ── */
  [data-theme="light"] .iki-ed-body { background: #F5F5F7; color: #0F0F12; }
  [data-theme="light"] .iki-topbar { background: rgba(255,255,255,0.92); border-bottom-color: rgba(0,0,0,.1); box-shadow: 0 2px 12px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-brand { color: #B26B00; }
  [data-theme="light"] .iki-brand-sub { color: #6B7280; }
  [data-theme="light"] .iki-back { background: #F3F4F6; border-color: rgba(0,0,0,.1); color: #4B5563; }
  [data-theme="light"] .iki-sec { background: #FFFFFF; border-color: rgba(0,0,0,.1); box-shadow: 0 1px 3px rgba(15,15,18,.06); }
  [data-theme="light"] .iki-sec-title { color: #B26B00; }
  [data-theme="light"] .iki-f { color: #6B7280; }
  [data-theme="light"] .iki-f input, [data-theme="light"] .iki-f textarea, [data-theme="light"] .iki-f select { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-group { background: #FAFAFB; border-color: rgba(0,0,0,.09); }
  [data-theme="light"] .iki-rhk { background: #FFFFFF; border-color: rgba(0,0,0,.09); }
  [data-theme="light"] .iki-tw th { color: #6B7280; border-bottom-color: rgba(0,0,0,.1); }
  [data-theme="light"] .iki-tw td input { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-empty-rhk { border-color: rgba(0,0,0,.12); color: #6B7280; }
  [data-theme="light"] .iki-act { background: #F3F4F6; border-color: rgba(0,0,0,.1); color: #4B5563; }
  [data-theme="light"] .iki-modal { background: #FFFFFF; border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .iki-tab { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #4B5563; }
  [data-theme="light"] .iki-tab.on { border-color: #1D9E75; color: #067154; background: rgba(29,158,117,0.08); }
  [data-theme="light"] .iki-modal-select, [data-theme="light"] .iki-modal-search { background: #F9FAFB; border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .iki-modal-list { border-color: rgba(0,0,0,.1); }
  [data-theme="light"] .iki-modal-row:hover { background: #F3F4F6; }
  [data-theme="light"] .iki-modal-row-sub, [data-theme="light"] .iki-modal-info, [data-theme="light"] .iki-hint { color: #6B7280; }
  [data-theme="light"] .iki-src { color: #067154; }
`;
