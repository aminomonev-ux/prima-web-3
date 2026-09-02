'use client';
// components/kinerja/ImportRekeningModal.tsx — Import tabel Rekening per sumber.
//
// Unggah .xlsx → server membacanya (/api/kinerja/rekening/import) → pratinjau
// membandingkannya dengan tabel yang sedang dibuka lewat lib/kinerja/gabung-rekening
// (PURE, diuji terpisah) → Terapkan mengisi tabel; yang MENULIS tetap tombol Simpan
// di tab Rekening. Satu-satunya yang ditulis langsung dari sini entri Master yang
// belum ada — tab Master layar lain, tidak bisa dititipkan ke Simpan tab ini, dan
// tanpa entri itu keempat dropdown baris hasil impor kosong.

import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { FileSpreadsheet, X, AlertTriangle, Upload } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { uiTheme } from '@/lib/theme';
import {
  bandingkanRekening, ringkasImpor, terapkanTambah, terapkanTimpa, masterKurang,
  type BarisRekening, type BarisImpor, type EntriMaster, type MasterTersedia, type StatusImpor,
} from '@/lib/kinerja/gabung-rekening';

interface HasilBaca {
  rows: BarisRekening[];
  warnings: string[];
  sumberSheet: string | null;
  source: string;
}

interface Props {
  tahun: string;
  sumber: string;
  /** Isi tabel yang sedang dibuka — pembanding "sudah ada atau belum". */
  rowsSekarang: BarisRekening[];
  tersedia: MasterTersedia;
  isLight?: boolean;
  onApply: (rows: BarisRekening[], masterDibuat: number) => void;
  onClose: () => void;
}

type Mode = 'timpa' | 'tambah';

const WARNA: Record<StatusImpor, string> = {
  baru: '#1D9E75', sama: '#94A3B8', berubah: '#BA7517', kembar: '#E24B4A',
};
const LABEL: Record<StatusImpor, string> = {
  baru: 'baru', sama: 'sudah ada', berubah: 'berubah', kembar: 'kembar di berkas',
};
const LABEL_TIPE: Record<string, string> = {
  program: 'Program', kegiatan: 'Kegiatan', subkegiatan: 'Sub Kegiatan',
  uraian_ssk: 'Uraian SSK', sumber_anggaran: 'Sumber Anggaran',
};

export default function ImportRekeningModal({
  tahun, sumber, rowsSekarang, tersedia, isLight = false, onApply, onClose,
}: Props) {
  const t = uiTheme(isLight);
  const cBorder = isLight ? 'rgba(139,92,246,.2)' : '#0C447C';
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy]         = useState(false);
  const [namaFile, setNamaFile] = useState('');
  const [baca, setBaca]         = useState<HasilBaca | null>(null);
  const [mode, setMode]         = useState<Mode>(rowsSekarang.length === 0 ? 'tambah' : 'timpa');
  const [lepas, setLepas]       = useState<Set<number>>(new Set());
  const [buatMaster, setBuatMaster] = useState(true);

  const kosong = rowsSekarang.length === 0;

  const hasil: BarisImpor[] = useMemo(() => {
    if (!baca) return [];
    const dasar = bandingkanRekening(rowsSekarang, baca.rows);
    return dasar.map((h, i) => (lepas.has(i) ? { ...h, ikut: false } : h));
  }, [baca, rowsSekarang, lepas]);

  const ringkas = useMemo(() => ringkasImpor(hasil), [hasil]);

  const kurang: EntriMaster[] = useMemo(
    () => (baca ? masterKurang(baca.rows, tersedia) : []),
    [baca, tersedia],
  );

  async function pilihBerkas(file: File) {
    setBusy(true); setBaca(null); setLepas(new Set()); setNamaFile(file.name);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/kinerja/rekening/import', { method: 'POST', body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { toast.error(j?.message || 'Gagal membaca berkas Excel'); return; }
      setBaca(j as HasilBaca);
    } catch {
      toast.error('Gagal mengunggah berkas');
    } finally { setBusy(false); }
  }

  async function terapkan() {
    if (!baca) return;
    setBusy(true);
    try {
      let dibuat = 0;
      if (buatMaster && kurang.length > 0) {
        // Berurutan, bukan Promise.all: `urut` entri Master dihitung MAX(urut)+1,
        // jadi penulisan serentak melahirkan beberapa baris ber-urut sama.
        for (const m of kurang) {
          const res = await fetch('/api/kinerja/master', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tahun, tipe: m.tipe, nama: m.nama, sumber: null,
              program_ref: m.program_ref, kegiatan_ref: m.kegiatan_ref, subkegiatan_ref: m.subkegiatan_ref,
            }),
          });
          const j = await res.json().catch(() => null);
          if (res.ok && j?.ok) dibuat++;
          else toast.error(`Gagal membuat master ${m.tipe}: ${m.nama.slice(0, 40)}`);
        }
      }
      const rows = mode === 'timpa' ? terapkanTimpa(hasil) : terapkanTambah(rowsSekarang, hasil);
      onApply(rows, dibuat);
      onClose();
    } finally { setBusy(false); }
  }

  const salahTab = baca?.sumberSheet && baca.sumberSheet !== sumber;
  const th: React.CSSProperties = { padding: '7px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: t.textSub, textAlign: 'left', borderBottom: `1px solid ${cBorder}`, position: 'sticky', top: 0, background: t.card };
  const td: React.CSSProperties = { padding: '6px 9px', fontSize: 11, color: t.text, borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.08)' : 'rgba(51,65,85,.4)'}`, verticalAlign: 'top' };
  const optStyle = (aktif: boolean): React.CSSProperties => ({
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
    padding: '9px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
    background: aktif ? (isLight ? 'rgba(139,92,246,.12)' : 'rgba(124,92,252,.18)') : 'transparent',
    border: `1px solid ${aktif ? '#7C5CFC' : cBorder}`,
    color: aktif ? t.text : t.textSub,
  });

  return createPortal(
    <div role="dialog" aria-label="Import Rekening dari Excel"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,15,28,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(900px,96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: t.card, border: `1px solid ${cBorder}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${cBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.text, fontSize: 14 }}>
            <FileSpreadsheet size={18} color={isLight ? '#7C3AED' : '#C4B5FD'} />
            Import Rekening {sumber} — {tahun}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" disabled={busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Pemilih berkas */}
          <div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) pilihBerkas(f); e.target.value = ''; }} />
            <PrimaButton variant="purple" size="sm" iconLeft={<Upload size={14} />}
              onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy && !baca ? 'Membaca…' : 'Pilih Berkas Excel'}
            </PrimaButton>
            <span style={{ marginLeft: 10, fontSize: 11.5, color: t.textSub }}>
              {namaFile || 'Berkas .xlsx — kolom Program · Kegiatan · Sub Kegiatan · Uraian SSK · Rekening Belanja · Sumber'}
            </span>
          </div>

          {baca && (
            <>
              {salahTab && (
                <div style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(226,75,74,.12)', border: '1px solid rgba(226,75,74,.4)', color: isLight ? '#B91C1C' : '#FCA5A5', fontSize: 12, lineHeight: 1.55 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Berkas ini bertuliskan <strong>{baca.sumberSheet}</strong>, sedangkan tab yang terbuka <strong>{sumber}</strong>. Kalau diteruskan, barisnya masuk ke tab {sumber}.</span>
                </div>
              )}

              {/* Mode */}
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
                    Tabel {sumber} masih kosong — kedua pilihan menghasilkan hal yang sama.
                  </p>
                )}
              </div>

              {/* Ringkasan */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: t.text }}>
                {(['baru', 'sama', 'berubah', 'kembar'] as StatusImpor[]).map(s => (
                  <span key={s}>
                    <b style={{ color: WARNA[s], fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{ringkas[s]}</b>
                    {' '}{LABEL[s]}
                  </span>
                ))}
                <span style={{ color: t.textSub }}>· {baca.rows.length} baris dibaca dari {baca.source}</span>
              </div>

              {baca.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11.5, color: isLight ? '#854F0B' : '#FAC775' }}>⚠ {w}</div>
              ))}

              {/* Master yang akan dibuat */}
              {kurang.length > 0 && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 10, background: isLight ? 'rgba(139,92,246,.07)' : 'rgba(124,92,252,.12)', border: `1px solid ${cBorder}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={buatMaster} onChange={e => setBuatMaster(e.target.checked)} disabled={busy} style={{ marginTop: 2 }} />
                  <span style={{ fontSize: 12, lineHeight: 1.55, color: t.text }}>
                    Buat <b>{kurang.length}</b> entri Master yang belum ada
                    {' '}({Object.keys(LABEL_TIPE)
                      .map(tp => ({ tp, n: kurang.filter(k => k.tipe === tp).length }))
                      .filter(x => x.n > 0).map(x => `${x.n} ${LABEL_TIPE[x.tp]}`).join(' · ')}).
                    <br />
                    <span style={{ color: t.textSub }}>
                      Tanpa ini, baris hasil impor tersimpan tapi keempat dropdown-nya kosong saat disunting.
                      Master ditulis <b>langsung</b> saat Terapkan; baris Rekening baru tersimpan setelah Anda menekan Simpan.
                    </span>
                  </span>
                </label>
              )}

              {/* Daftar baris */}
              <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${cBorder}`, borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 34 }}>{mode === 'tambah' ? '✓' : ''}</th>
                      <th style={th}>Rekening Belanja</th>
                      <th style={th}>Uraian SSK</th>
                      <th style={{ ...th, width: 150 }}>Sumber</th>
                      <th style={{ ...th, width: 120 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasil.map((h, i) => (
                      <tr key={i}>
                        <td style={td}>
                          {mode === 'tambah' && (h.status === 'baru' || h.status === 'berubah') ? (
                            <input type="checkbox" checked={h.ikut} disabled={busy}
                              onChange={() => setLepas(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                          ) : null}
                        </td>
                        <td style={td}>{h.baris.uraian}</td>
                        <td style={{ ...td, color: t.textSub }}>{h.baris.uraian_ssk ?? '—'}</td>
                        <td style={td}>
                          {h.status === 'berubah'
                            ? <span><s style={{ color: t.textSub }}>{h.lamaSumber || '—'}</s> → <b style={{ color: WARNA.berubah }}>{h.baris.sumber_anggaran || '—'}</b></span>
                            : (h.baris.sumber_anggaran || '—')}
                        </td>
                        <td style={{ ...td, color: WARNA[h.status], fontWeight: 700 }}>{LABEL[h.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: `1px solid ${cBorder}` }}>
          <PrimaButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>Batal</PrimaButton>
          <PrimaButton variant="success" size="sm" onClick={terapkan} disabled={busy || !baca}>
            {busy && baca ? 'Menerapkan…' : 'Terapkan'}
          </PrimaButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
