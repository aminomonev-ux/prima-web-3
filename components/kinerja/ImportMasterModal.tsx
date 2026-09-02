'use client';
// components/kinerja/ImportMasterModal.tsx — Import daftar Master E-Anggaran.
//
// Pasangan Unduh Excel tab Master: unggah berkas hasil unduhan itu (satu sheet
// per tipe) → server membacanya → pratinjau menandai mana yang BARU dan mana yang
// SUDAH ADA → Terapkan menulis yang baru saja lewat POST /api/kinerja/master.
//
// Beda dengan Import Rekening yang berhenti di form: Master tidak punya tombol
// Simpan tunggal — tabnya menulis per entri sejak dulu, jadi menahannya di layar
// justru menciptakan keadaan setengah tersimpan yang tidak dikenal tab lain.

import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { FileSpreadsheet, X, Upload } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { uiTheme } from '@/lib/theme';
import { bandingkanMaster, type EntriMaster, type EntriMasterImpor, type MasterTersedia } from '@/lib/kinerja/gabung-rekening';

interface HasilBaca { rows: EntriMaster[]; warnings: string[]; source: string }

interface Props {
  tahun: string;
  tersedia: MasterTersedia;
  isLight?: boolean;
  onSelesai: (dibuat: number) => void;
  onClose: () => void;
}

const LABEL_TIPE: Record<string, string> = {
  program: 'Program', kegiatan: 'Kegiatan', subkegiatan: 'Sub Kegiatan',
  uraian_ssk: 'Uraian SSK', sumber_anggaran: 'Sumber Anggaran',
};
const WARNA = { baru: '#1D9E75', sama: '#94A3B8', kembar: '#E24B4A' } as const;
const LABEL = { baru: 'baru', sama: 'sudah ada', kembar: 'kembar di berkas' } as const;

export default function ImportMasterModal({ tahun, tersedia, isLight = false, onSelesai, onClose }: Props) {
  const t = uiTheme(isLight);
  const cBorder = isLight ? 'rgba(139,92,246,.2)' : '#0C447C';
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy]         = useState(false);
  const [namaFile, setNamaFile] = useState('');
  const [baca, setBaca]         = useState<HasilBaca | null>(null);
  const [lepas, setLepas]       = useState<Set<number>>(new Set());

  const hasil: EntriMasterImpor[] = useMemo(() => {
    if (!baca) return [];
    return bandingkanMaster(baca.rows, tersedia).map((h, i) => (lepas.has(i) ? { ...h, ikut: false } : h));
  }, [baca, tersedia, lepas]);

  const ringkas = useMemo(() => {
    const r = { baru: 0, sama: 0, kembar: 0 };
    for (const h of hasil) r[h.status]++;
    return r;
  }, [hasil]);

  async function pilihBerkas(file: File) {
    setBusy(true); setBaca(null); setLepas(new Set()); setNamaFile(file.name);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/kinerja/master/import', { method: 'POST', body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { toast.error(j?.message || 'Gagal membaca berkas Excel'); return; }
      setBaca(j as HasilBaca);
    } catch {
      toast.error('Gagal mengunggah berkas');
    } finally { setBusy(false); }
  }

  async function terapkan() {
    const ikut = hasil.filter(h => h.ikut);
    if (ikut.length === 0) { toast.error('Tidak ada entri baru untuk dibuat'); return; }
    setBusy(true);
    let dibuat = 0;
    try {
      // Berurutan: `urut` dihitung MAX(urut)+1, penulisan serentak melahirkan
      // beberapa baris ber-urut sama.
      for (const h of ikut) {
        const res = await fetch('/api/kinerja/master', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tahun, tipe: h.entri.tipe, nama: h.entri.nama, sumber: null,
            program_ref: h.entri.program_ref, kegiatan_ref: h.entri.kegiatan_ref, subkegiatan_ref: h.entri.subkegiatan_ref,
          }),
        });
        const j = await res.json().catch(() => null);
        if (res.ok && j?.ok) dibuat++;
        else toast.error(`Gagal: ${LABEL_TIPE[h.entri.tipe]} "${h.entri.nama.slice(0, 40)}"`);
      }
      onSelesai(dibuat);
      onClose();
    } finally { setBusy(false); }
  }

  const th: React.CSSProperties = { padding: '7px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: t.textSub, textAlign: 'left', borderBottom: `1px solid ${cBorder}`, position: 'sticky', top: 0, background: t.card };
  const td: React.CSSProperties = { padding: '6px 9px', fontSize: 11, color: t.text, borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.08)' : 'rgba(51,65,85,.4)'}`, verticalAlign: 'top' };

  return createPortal(
    <div role="dialog" aria-label="Import Master dari Excel"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,15,28,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(880px,96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: t.card, border: `1px solid ${cBorder}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${cBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.text, fontSize: 14 }}>
            <FileSpreadsheet size={18} color={isLight ? '#7C3AED' : '#C4B5FD'} /> Import Master — {tahun}
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
              {namaFile || 'Berkas hasil Unduh Excel tab Master — satu sheet per tipe'}
            </span>
          </div>

          {baca && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: t.text }}>
                {(['baru', 'sama', 'kembar'] as const).map(s => (
                  <span key={s}>
                    <b style={{ color: WARNA[s], fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{ringkas[s]}</b> {LABEL[s]}
                  </span>
                ))}
                <span style={{ color: t.textSub }}>· dibaca dari {baca.source}</span>
              </div>

              {baca.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11.5, color: isLight ? '#854F0B' : '#FAC775' }}>⚠ {w}</div>
              ))}

              <div style={{ maxHeight: 340, overflowY: 'auto', border: `1px solid ${cBorder}`, borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 34 }}>✓</th>
                      <th style={{ ...th, width: 130 }}>Tipe</th>
                      <th style={th}>Nama</th>
                      <th style={{ ...th, width: 120 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasil.map((h, i) => (
                      <tr key={i}>
                        <td style={td}>
                          {h.status === 'baru' && (
                            <input type="checkbox" checked={h.ikut} disabled={busy}
                              onChange={() => setLepas(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                          )}
                        </td>
                        <td style={{ ...td, color: t.textSub }}>{LABEL_TIPE[h.entri.tipe]}</td>
                        <td style={td}>{h.entri.nama}</td>
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
          <PrimaButton variant="success" size="sm" onClick={terapkan} disabled={busy || !baca || ringkas.baru === 0}>
            {busy && baca ? 'Menyimpan…' : `Buat ${hasil.filter(h => h.ikut).length} Entri`}
          </PrimaButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
