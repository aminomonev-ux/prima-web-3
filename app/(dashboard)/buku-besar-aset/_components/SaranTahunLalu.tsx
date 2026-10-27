'use client';
// Saran dari rencana tahun lalu yang tidak didanai (docs/CONCEPT-bba-buku-aset.md §14): spanduk di
// daftar Rencana tahun T + modal pilih → salin ke T. Salinan membawa jenis, alasan, barang, angka,
// referensi (tanggal cek lama), dan aset sasaran; tanda anggaran mulai dari "Belum ditandai".

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { LABEL_JENIS } from '@/lib/bba/rencana';
import type { BbaRow } from '@/lib/data/buku-besar-aset';
import type { Warna } from './ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

export default function SaranTahunLalu({ tahun, c, bolehUbah, segarkan, onDisalin }: { tahun: number; c: Warna; bolehUbah: boolean; segarkan: number; onDisalin: () => void }) {
  const [saran, setSaran] = useState<{ tahun: number; rows: BbaRow[] } | null>(null);
  const [buka, setBuka] = useState(false);
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [sibuk, setSibuk] = useState(false);
  const nomor = useRef(0);

  useEffect(() => {
    if (tahun < 2021 || tahun > 2100) return;
    const n = ++nomor.current;
    void Promise.resolve().then(async () => {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/salin-tahun-lalu?tahun=${tahun}`);
      if (n !== nomor.current || !d.ok) return;
      setSaran({ tahun, rows: (d as unknown as { rows: BbaRow[] }).rows });
    });
  }, [tahun, segarkan]);

  if (!saran || saran.tahun !== tahun || saran.rows.length === 0) return null;
  const rows = saran.rows;

  async function salin() {
    if (pilih.size === 0) { toast.error('Pilih rencana yang disalin'); return; }
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/salin-tahun-lalu', { method: 'POST', body: JSON.stringify({ tahun, ids: [...pilih] }) }) as unknown as { ok: boolean; message?: string; disalin?: number; dilewati?: number };
      if (!d.ok) { toast.error(d.message || 'Gagal menyalin'); return; }
      toast.success(`${d.disalin} rencana disalin ke ${tahun}${d.dilewati ? ` · ${d.dilewati} sudah pernah disalin` : ''}`);
      setBuka(false); setPilih(new Set()); onDisalin();
    } finally { setSibuk(false); }
  }

  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(124,92,252,.45)', background: 'rgba(124,92,252,.08)', fontSize: 12.5 }}>
      <span style={{ color: '#7C5CFC', fontWeight: 600 }}>{rows.length} rencana {tahun - 1} tidak didanai</span>
      <span style={{ color: c.sub, flex: 1, minWidth: 200 }}>— bisa diajukan lagi tahun ini tanpa mengetik ulang.</span>
      <PrimaButton variant="purple" size="sm" onClick={() => { setPilih(new Set(rows.map(r => r.id))); setBuka(true); }}>{bolehUbah ? 'Lihat & salin' : 'Lihat'}</PrimaButton>
    </div>
    {buka && (
      <div onClick={() => setBuka(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
        <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Rencana tahun lalu yang tidak didanai"
          style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: 'min(720px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Rencana {tahun - 1} yang tidak didanai</div>
              <div style={{ fontSize: 11.5, color: c.sub }}>Disalin ke {tahun} dengan kode yang sama; referensi harga ikut beserta tanggal ceknya yang lama — cek ulang harganya.</div>
            </div>
            <button type="button" aria-label="Tutup" onClick={() => setBuka(false)} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
          </div>
          <div style={{ padding: 12, overflow: 'auto', flex: 1 }}>
            {rows.map(r => (
              <label key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 4px', borderTop: `1px solid ${c.border}`, cursor: bolehUbah ? 'pointer' : 'default', fontSize: 12.5 }}>
                {bolehUbah && <input type="checkbox" checked={pilih.has(r.id)} style={{ marginTop: 3 }}
                  onChange={e => setPilih(p => { const x = new Set(p); if (e.target.checked) x.add(r.id); else x.delete(r.id); return x; })} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: c.sub }}>{r.canonical_id}</span> {r.uraian}
                  <span style={{ display: 'block', fontSize: 11, color: c.sub }}>
                    {[r.jenis_rencana ? LABEL_JENIS[r.jenis_rencana] : 'belum digolongkan', r.barang_nama, r.alasan].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtRp(r.nilai_rencana)}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '10px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
            <PrimaButton variant="ghost" onClick={() => setBuka(false)}>Tutup</PrimaButton>
            {bolehUbah && <PrimaButton menulis variant="purple" disabled={sibuk || pilih.size === 0} onClick={() => void salin()}>{sibuk ? 'Menyalin…' : `Salin ${pilih.size} ke ${tahun}`}</PrimaButton>}
          </div>
        </div>
      </div>
    )}
  </>);
}
