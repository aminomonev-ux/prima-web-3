'use client';
// Spanduk "Rencana Aksi berubah" + dialog bercentang — SATU tampilan untuk semua modul yang
// menyalin dari Renaksi (E-Anggaran, PK, IKI). Konsep: docs/CONCEPT-renaksi-terhubung.md §5.4.
// Komponen ini hanya menampilkan & mengumpulkan pilihan; yang menulis tetap modulnya sendiri.

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';

/** Prop `isLight` menang; tanpa prop (modul ber-`data-theme` seperti PK) dibaca dari dokumen, pola ConfirmDialog. */
export const temaTerang = (isLight?: boolean): boolean =>
  isLight ?? (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light');

/** Warna mengikuti [data-theme] lewat kelas `.spanduk-selaras` (globals.css). */
export function SpandukSelaras({ kalimat, onBuka, labelTombol = 'Lihat & perbarui' }: {
  kalimat: string | null; onBuka: () => void; labelTombol?: string;
}) {
  if (!kalimat) return null;
  return (
    <div role="status" className="spanduk-selaras">
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: '1 1 240px' }}>{kalimat}</span>
      <PrimaButton variant="warning" size="sm" iconLeft={<RefreshCw size={14} />} onClick={onBuka}>
        {labelTombol}
      </PrimaButton>
    </div>
  );
}

export interface ItemSelaras {
  kunci: string;
  isi: ReactNode;
  ket?: ReactNode;
  /** Tercentang saat dialog dibuka. */
  bawaan: boolean;
  /** Tidak bisa dipilih (mis. pratinjau menolak); `ket` menyebut sebabnya. */
  mati?: boolean;
}

export interface BagianSelaras { judul: string; ket: string; items: ItemSelaras[] }

export function DialogSelaras({
  judul, pengantar, bagian, isLight, canEdit, labelTerapkan = 'Terapkan', onTutup, onTerapkan,
}: {
  judul: string; pengantar: ReactNode; bagian: BagianSelaras[]; isLight?: boolean; canEdit: boolean;
  labelTerapkan?: string; onTutup: () => void; onTerapkan: (pilih: Set<string>) => Promise<void> | void;
}) {
  const [pilih, setPilih] = useState<Set<string>>(() => new Set(bagian.flatMap(b => b.items.filter(i => i.bawaan && !i.mati).map(i => i.kunci))));
  const [jalan, setJalan] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !jalan) onTutup(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [jalan, onTutup]);

  const ubah = (k: string) => setPilih(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const terpilih = [...pilih].filter(k => bagian.some(b => b.items.some(i => i.kunci === k && !i.mati)));

  async function terapkan() {
    setJalan(true);
    try { await onTerapkan(new Set(terpilih)); } finally { setJalan(false); }
  }

  const terang = temaTerang(isLight);
  const c = {
    surface: terang ? '#FFFFFF' : '#042C53',
    border: terang ? 'rgba(139,92,246,.18)' : '#0C447C',
    text: terang ? '#1F2937' : '#E6F1FB',
    sub: terang ? '#6B7280' : '#85B7EB',
    head: terang ? '#5B21B6' : '#FAC775',
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={judul}
      onClick={e => { if (e.target === e.currentTarget && !jalan) onTutup(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: '14px', width: '100%', maxWidth: '720px', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontWeight: 800, fontSize: '15px', color: c.text }}>{judul}</div>
          <button onClick={onTutup} disabled={jalan} aria-label="Tutup" style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '4px 18px 14px', overflowY: 'auto' }}>
          <p style={{ fontSize: '12.5px', color: c.sub, margin: '10px 0 0' }}>{pengantar}</p>
          {bagian.filter(b => b.items.length > 0).map(b => (
            <div key={b.judul}>
              <div style={{ margin: '14px 0 6px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: c.head }}>{b.judul} ({b.items.length})</div>
                <div style={{ fontSize: '12px', color: c.sub }}>{b.ket}</div>
              </div>
              {b.items.map(i => (
                <label key={i.kunci} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 4px', borderBottom: `1px solid ${c.border}`, cursor: canEdit && !i.mati ? 'pointer' : 'default' }}>
                  <input type="checkbox" checked={pilih.has(i.kunci) && !i.mati} disabled={!canEdit || jalan || i.mati} onChange={() => ubah(i.kunci)} style={{ marginTop: '3px' }} />
                  <span style={{ fontSize: '13px', color: c.text, minWidth: 0 }}>
                    {i.isi}
                    {i.ket && <span style={{ display: 'block', fontSize: '12px', color: c.sub, whiteSpace: 'pre-line' }}>{i.ket}</span>}
                  </span>
                </label>
              ))}
            </div>
          ))}
          {!canEdit && <p style={{ fontSize: '12.5px', color: c.sub, marginTop: '12px' }}>Anda hanya bisa melihat — memperbarui butuh hak mengubah menu ini.</p>}
        </div>
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${c.border}`, display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
          <PrimaButton variant="ghost" onClick={onTutup} disabled={jalan}>Batal</PrimaButton>
          {canEdit && (
            <PrimaButton variant="primary" menulis onClick={terapkan} disabled={jalan || terpilih.length === 0}>
              {jalan ? 'Menerapkan…' : `${labelTerapkan} (${terpilih.length})`}
            </PrimaButton>
          )}
        </div>
      </div>
    </div>
  );
}
