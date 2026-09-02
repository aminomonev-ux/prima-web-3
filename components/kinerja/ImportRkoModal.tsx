'use client';
// components/kinerja/ImportRkoModal.tsx — Import tabel RKO (tab SSK) per sumber.
//
// Unggah .xlsx → server membacanya (/api/kinerja/ssk/import) → pratinjau
// membandingkannya dengan tabel RKO yang sedang dibuka DAN tabel Rekening sumber
// yang sama, lewat lib/kinerja/gabung-rko (PURE, diuji terpisah) → Terapkan
// mengisi tabel; yang MENULIS tetap tombol "Simpan Semua" di tab RKO, sehingga
// kunci optimistik dan penolakan versi terkunci berlaku tanpa endpoint baru.

import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { FileSpreadsheet, X, AlertTriangle, Upload } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { uiTheme } from '@/lib/theme';
import {
  bandingkanRko, ringkasRko, terapkanTambahRko, terapkanTimpaRko, hilangKalauTimpa,
  type BarisRko, type BarisImporRko, type StatusRko,
} from '@/lib/kinerja/gabung-rko';
import type { SskRow, RekeningRow } from '@/app/(dashboard)/kinerja/_types';

interface HasilBaca {
  rows: BarisRko[];
  warnings: string[];
  sumberSheet: string | null;
  source: string;
}

interface Props {
  tahun: string;
  sumber: string;
  versiLabel: string;
  rowsSekarang: SskRow[];
  rekeningRows: RekeningRow[];
  isLight?: boolean;
  onApply: (rows: SskRow[]) => void;
  onClose: () => void;
}

type Mode = 'timpa' | 'tambah';

const WARNA: Record<StatusRko, string> = {
  baru: '#1D9E75', sama: '#94A3B8', berubah: '#BA7517', kembar: '#E24B4A', ditahan: '#E24B4A',
};
const LABEL: Record<StatusRko, string> = {
  baru: 'baru', sama: 'sudah sama', berubah: 'berubah', kembar: 'kembar di berkas',
  ditahan: 'ditahan',
};

export default function ImportRkoModal({
  tahun, sumber, versiLabel, rowsSekarang, rekeningRows, isLight = false, onApply, onClose,
}: Props) {
  const t = uiTheme(isLight);
  const cBorder = isLight ? 'rgba(139,92,246,.2)' : '#0C447C';
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy]         = useState(false);
  const [namaFile, setNamaFile] = useState('');
  const [baca, setBaca]         = useState<HasilBaca | null>(null);
  const [mode, setMode]         = useState<Mode>(rowsSekarang.length === 0 ? 'tambah' : 'timpa');
  const [lepas, setLepas]       = useState<Set<number>>(new Set());

  const kosong = rowsSekarang.length === 0;

  const hasil: BarisImporRko[] = useMemo(() => {
    if (!baca) return [];
    return bandingkanRko(rowsSekarang, rekeningRows, baca.rows)
      .map((h, i) => (lepas.has(i) ? { ...h, ikut: false } : h));
  }, [baca, rowsSekarang, rekeningRows, lepas]);

  const ringkas = useMemo(() => ringkasRko(hasil), [hasil]);
  const akanHilang = useMemo(() => hilangKalauTimpa(rowsSekarang, hasil), [rowsSekarang, hasil]);
  const paguDitahan = useMemo(
    () => hasil.filter(h => h.status === 'ditahan').reduce((s, h) => s + h.asal.pagu, 0),
    [hasil],
  );

  async function pilihBerkas(file: File) {
    setBusy(true); setBaca(null); setLepas(new Set()); setNamaFile(file.name);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/kinerja/ssk/import', { method: 'POST', body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { toast.error(j?.message || 'Gagal membaca berkas Excel'); return; }
      setBaca(j as HasilBaca);
    } catch {
      toast.error('Gagal mengunggah berkas');
    } finally { setBusy(false); }
  }

  function terapkan() {
    if (!baca) return;
    const rows = mode === 'timpa' ? terapkanTimpaRko(hasil) : terapkanTambahRko(rowsSekarang, hasil);
    if (rows.length === 0) { toast.error('Tidak ada baris yang bisa dimasukkan'); return; }
    onApply(rows);
    onClose();
  }

  const salahTab = baca?.sumberSheet && baca.sumberSheet !== sumber;
  const th: React.CSSProperties = { padding: '7px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: t.textSub, textAlign: 'left', borderBottom: `1px solid ${cBorder}`, position: 'sticky', top: 0, background: t.card };
  const td: React.CSSProperties = { padding: '6px 9px', fontSize: 11, color: t.text, borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.08)' : 'rgba(51,65,85,.4)'}`, verticalAlign: 'top' };
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
  const optStyle = (aktif: boolean): React.CSSProperties => ({
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
    padding: '9px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
    background: aktif ? (isLight ? 'rgba(139,92,246,.12)' : 'rgba(124,92,252,.18)') : 'transparent',
    border: `1px solid ${aktif ? '#7C5CFC' : cBorder}`,
    color: aktif ? t.text : t.textSub,
  });

  return createPortal(
    <div role="dialog" aria-label="Import RKO dari Excel"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,15,28,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(960px,96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: t.card, border: `1px solid ${cBorder}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${cBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.text, fontSize: 14 }}>
            <FileSpreadsheet size={18} color={isLight ? '#7C3AED' : '#C4B5FD'} />
            Import RKO {sumber} — {tahun} · {versiLabel}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" disabled={busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) pilihBerkas(f); e.target.value = ''; }} />
            <PrimaButton variant="purple" size="sm" iconLeft={<Upload size={14} />}
              onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy && !baca ? 'Membaca…' : 'Pilih Berkas Excel'}
            </PrimaButton>
            <span style={{ marginLeft: 10, fontSize: 11.5, color: t.textSub }}>
              {namaFile || 'Berkas .xlsx — kolom Uraian · Pagu · target 12 bulan. Persentase & Total dihitung ulang.'}
            </span>
          </div>

          {baca && (
            <>
              {salahTab && (
                <div style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(226,75,74,.12)', border: '1px solid rgba(226,75,74,.4)', color: isLight ? '#B91C1C' : '#FCA5A5', fontSize: 12, lineHeight: 1.55 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Berkas ini bertuliskan <strong>{baca.sumberSheet}</strong>, sedangkan tab yang terbuka <strong>{sumber}</strong>.</span>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: t.textSubAlt, marginBottom: 6 }}>
                  Cara mengisi
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setMode('timpa')} disabled={busy} style={optStyle(mode === 'timpa')}>
                    <b style={{ fontSize: 12.5 }}>Timpa</b>
                    <span style={{ fontSize: 11 }}>isi tab diganti seluruhnya oleh berkas</span>
                  </button>
                  <button type="button" onClick={() => setMode('tambah')} disabled={busy} style={optStyle(mode === 'tambah')}>
                    <b style={{ fontSize: 12.5 }}>Tambahkan</b>
                    <span style={{ fontSize: 11 }}>isi lama dipertahankan, berkas digabungkan</span>
                  </button>
                </div>
                {kosong && (
                  <p style={{ fontSize: 11.5, color: t.textSub, margin: '6px 0 0' }}>
                    Tabel RKO {sumber} masih kosong — kedua pilihan menghasilkan hal yang sama.
                  </p>
                )}
                {mode === 'timpa' && akanHilang > 0 && (
                  <p style={{ fontSize: 12, color: isLight ? '#B91C1C' : '#FCA5A5', margin: '6px 0 0', lineHeight: 1.55 }}>
                    <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                    Timpa akan <strong>menghapus {akanHilang} baris</strong> yang tidak disebut berkas ini.
                    Pakai <strong>Tambahkan</strong> kalau baris itu harus tetap ada.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: t.text }}>
                {(['baru', 'sama', 'berubah', 'ditahan', 'kembar'] as StatusRko[]).map(s => (
                  <span key={s}>
                    <b style={{ color: WARNA[s], fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{ringkas[s]}</b>
                    {' '}{LABEL[s]}
                  </span>
                ))}
                <span style={{ color: t.textSub }}>· {baca.rows.length} baris dibaca dari {baca.source}</span>
              </div>

              {ringkas.ditahan > 0 && (
                <div style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 10, background: isLight ? 'rgba(226,75,74,.08)' : 'rgba(226,75,74,.12)', border: `1px solid ${cBorder}`, fontSize: 12, lineHeight: 1.55, color: t.text }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#E24B4A' }} />
                  <span>
                    <strong>{ringkas.ditahan} baris ditahan</strong> — namanya tidak ada di tabel Rekening {sumber},
                    jadi Uraian SSK dan hierarkinya tidak bisa diambil dari mana pun.
                    Pagu yang tidak ikut masuk: <strong>Rp {fmtNum(paguDitahan)}</strong>.
                    <br />
                    <span style={{ color: t.textSub }}>
                      Jalan keluarnya: tambahkan baris rekening bernama sama di tab Rekening, atau pecah baris itu
                      di berkasnya mengikuti nama rekening yang ada.
                    </span>
                  </span>
                </div>
              )}

              {baca.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11.5, color: isLight ? '#854F0B' : '#FAC775' }}>⚠ {w}</div>
              ))}

              <div style={{ maxHeight: 320, overflowY: 'auto', border: `1px solid ${cBorder}`, borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 34 }}>{mode === 'tambah' ? '✓' : ''}</th>
                      <th style={th}>Uraian</th>
                      <th style={{ ...th, width: 120 }}>Uraian SSK</th>
                      <th style={{ ...th, width: 150, textAlign: 'right' }}>Pagu</th>
                      <th style={{ ...th, width: 130, textAlign: 'right' }}>Jumlah 12 bulan</th>
                      <th style={{ ...th, width: 120 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasil.map((h, i) => {
                      const jumlahBulan = h.hasil?.total ?? 0;
                      const meleset = h.hasil !== null && h.asal.pagu !== jumlahBulan;
                      return (
                        <tr key={i}>
                          <td style={td}>
                            {mode === 'tambah' && (h.status === 'baru' || h.status === 'berubah') ? (
                              <input type="checkbox" checked={h.ikut} disabled={busy}
                                onChange={() => setLepas(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                            ) : null}
                          </td>
                          <td style={td}>{h.asal.uraian}</td>
                          <td style={{ ...td, color: t.textSub }}>{h.hasil?.uraian_ssk || '—'}</td>
                          <td style={tdNum}>
                            {h.status === 'berubah' && h.lamaPagu !== h.asal.pagu
                              ? <span><s style={{ color: t.textSub }}>{fmtNum(h.lamaPagu ?? 0)}</s> → <b style={{ color: WARNA.berubah }}>{fmtNum(h.asal.pagu)}</b></span>
                              : fmtNum(h.asal.pagu)}
                          </td>
                          <td style={{ ...tdNum, color: meleset ? '#E24B4A' : undefined }}>
                            {h.hasil ? fmtNum(jumlahBulan) : '—'}
                            {meleset && <span title="tidak sama dengan pagu"> !</span>}
                          </td>
                          <td style={{ ...td, color: WARNA[h.status], fontWeight: 700 }}>{LABEL[h.status]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: `1px solid ${cBorder}` }}>
          <PrimaButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>Batal</PrimaButton>
          <PrimaButton variant="success" size="sm" onClick={terapkan} disabled={busy || !baca}>
            Terapkan
          </PrimaButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
