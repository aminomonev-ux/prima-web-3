'use client';
// Tautkan sekaligus item tahun T yang belum punya barang (CONCEPT-bba-perencanaan §5.1). Tiap item
// diberi saran (`saranBarang` — nama barang yang jadi awalan uraiannya); tanpa saran = dilewati
// sampai orangnya memilih. Server hanya mengisi item yang MASIH kosong (`tautkanBarang`).

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { saranBarang, namaDasarUraian, rapikanNamaBarang } from '@/lib/bba/barang';
import type { BbaBarang, BelumDitautkan, PerBarangTahun } from '@/lib/data/buku-besar-aset';
import type { Warna } from './ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

type Pilihan = { k: 'lewati' } | { k: 'ada'; id: number } | { k: 'baru'; nama: string };

type Props = { tahun: number; c: Warna; onTutup: () => void; onSelesai: () => void };

export default function ModalTautkan({ tahun, c, onTutup, onSelesai }: Props) {
  const [barang, setBarang] = useState<BbaBarang[] | null>(null);
  const [item, setItem] = useState<BelumDitautkan[]>([]);
  const [lebih, setLebih] = useState(0);
  const [pilihan, setPilihan] = useState<Record<number, Pilihan>>({});
  const [galat, setGalat] = useState('');
  const [mengirim, setMengirim] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const [dB, dR] = await Promise.all([
        fetchJson<unknown>('/api/buku-besar-aset/barang'),
        fetchJson<unknown>(`/api/buku-besar-aset/barang?ringkas=1&tahun=${tahun}`),
      ]);
      if (!dB.ok || !dR.ok) { setGalat((dB.ok ? dR : dB).message || 'Gagal memuat'); return; }
      const daftar = (dB as unknown as { data: BbaBarang[] }).data;
      const r = dR as unknown as PerBarangTahun;
      setBarang(daftar);
      setItem(r.belum.daftar);
      setLebih(Math.max(0, r.belum.item - r.belum.daftar.length));
      setPilihan(Object.fromEntries(r.belum.daftar.map(it => {
        const s = saranBarang(it.uraian, daftar);
        return [it.id, (s ? { k: 'ada', id: s.id } : { k: 'lewati' }) as Pilihan] as const;
      })));
    });
  }, [tahun]);

  const saranPer = useMemo(() => new Map(item.map(it => [it.id, barang ? saranBarang(it.uraian, barang) : null])), [item, barang]);
  const dipilih = item.filter(it => (pilihan[it.id]?.k ?? 'lewati') !== 'lewati');

  async function kirim() {
    const pasangan = dipilih.map(it => {
      const p = pilihan[it.id];
      return p.k === 'ada' ? { aset_id: it.id, barang_id: p.id } : { aset_id: it.id, barang_baru: rapikanNamaBarang((p as { nama: string }).nama) };
    });
    if (pasangan.some(p => 'barang_baru' in p && !p.barang_baru)) { toast.error('Nama barang baru belum diisi'); return; }
    setMengirim(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/barang/tautkan', { method: 'POST', body: JSON.stringify({ pasangan }) });
      if (!d.ok) { toast.error(d.message || 'Gagal menautkan'); return; }
      const h = d as unknown as { ditautkan: number; dilewati: number; barang_baru: number };
      toast.success(`${h.ditautkan} item ditautkan${h.barang_baru ? `, ${h.barang_baru} barang baru` : ''}${h.dilewati ? ` · ${h.dilewati} dilewati (sudah ditautkan orang lain)` : ''}`);
      onSelesai();
    } finally { setMengirim(false); }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12.5, color: c.text, background: c.input, minWidth: 0, width: '100%', boxSizing: 'border-box' };

  return (
    <div onClick={onTutup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: 'min(860px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Tautkan item ke barang — {tahun}</div>
          <button type="button" aria-label="Tutup" onClick={onTutup} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '10px 16px', fontSize: 12, color: c.sub, borderBottom: `1px solid ${c.border}` }}>
          Barang = jenis barang di tingkat perencanaan (“Laptop”, “Kursi Roda”); spesifikasi tetap di uraian item. Dengan barang, riwayat
          beli & yang sedang diproses terlihat saat merencanakan. Saran diambil dari nama barang yang jadi awal uraian; yang tanpa saran dilewati sampai dipilih.
        </div>
        <div style={{ overflow: 'auto', flex: 1, padding: '6px 16px' }}>
          {galat && <div style={{ fontSize: 12.5, color: '#E24B4A', padding: 8 }}>{galat}</div>}
          {!galat && !barang && <div style={{ fontSize: 12.5, color: c.sub, padding: 8 }}>Memuat…</div>}
          {barang && item.length === 0 && <div style={{ fontSize: 12.5, color: c.sub, padding: 8 }}>Semua item {tahun} sudah tertaut ke barang.</div>}
          {barang && item.map(it => {
            const p = pilihan[it.id] ?? { k: 'lewati' as const };
            const saran = saranPer.get(it.id);
            const nilaiSelect = p.k === 'ada' ? String(p.id) : p.k;
            return (
              <div key={it.id} className="bba-tk-baris" style={{ borderBottom: `1px solid ${c.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.uraian}</div>
                  <div style={{ fontSize: 10.5, color: c.sub, fontFamily: MONO }}>{it.canonical_id} · {fmtRp(it.nilai_rencana)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <select value={nilaiSelect} aria-label={`Barang untuk ${it.canonical_id}`} style={inp}
                    onChange={e => {
                      const v = e.target.value;
                      setPilihan(ps => ({ ...ps, [it.id]: v === 'lewati' ? { k: 'lewati' } : v === 'baru' ? { k: 'baru', nama: namaDasarUraian(it.uraian) } : { k: 'ada', id: Number(v) } }));
                    }}>
                    <option value="lewati">— Lewati —</option>
                    {saran && <option value={String(saran.id)}>{saran.nama} (saran)</option>}
                    <option value="baru">+ Buat barang baru…</option>
                    {barang.filter(b => b.id !== saran?.id).map(b => <option key={b.id} value={String(b.id)}>{b.nama}</option>)}
                  </select>
                  {p.k === 'baru' && (
                    <input value={p.nama} maxLength={160} placeholder="Nama barang baru" aria-label="Nama barang baru" style={inp}
                      onChange={e => setPilihan(ps => ({ ...ps, [it.id]: { k: 'baru', nama: e.target.value } }))} />
                  )}
                </div>
              </div>
            );
          })}
          {lebih > 0 && <div style={{ fontSize: 11.5, color: c.sub, padding: 8 }}>Ditampilkan {item.length} item pertama; {lebih} sisanya muncul lagi sesudah yang ini ditautkan.</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
          <PrimaButton variant="ghost" size="sm" disabled={!barang || item.every(it => !saranPer.get(it.id))}
            onClick={() => setPilihan(ps => ({ ...ps, ...Object.fromEntries(item.flatMap(it => { const s = saranPer.get(it.id); return s ? [[it.id, { k: 'ada', id: s.id } as Pilihan] as const] : []; })) }))}>
            Pakai semua saran
          </PrimaButton>
          <span style={{ flex: 1, fontSize: 11.5, color: c.sub }}>{dipilih.length} dari {item.length} item akan ditautkan</span>
          <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
          <PrimaButton menulis variant="primary" disabled={mengirim || dipilih.length === 0} onClick={() => void kirim()}>
            {mengirim ? 'Menautkan…' : `Tautkan ${dipilih.length} item`}
          </PrimaButton>
        </div>
      </div>
      <style>{`
.bba-tk-baris { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 10px; align-items: center; padding: 8px 0; }
@media (max-width: 640px) { .bba-tk-baris { grid-template-columns: 1fr; } }
`}</style>
    </div>
  );
}
