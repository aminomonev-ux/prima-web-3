// PERF-C2 Tahap 7: BidangReviewModal extracted dari usulan-client.tsx.
// Self-contained — state items/decisions/loading/err/updatedAt di-manage internal.
// Mempertahankan BUG-W4 optimistic locking via updated_at_check.

'use client';

import { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { InputNominal } from '@/components/ui/input-nominal';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import type { UsulanHeader, UsulanItem } from '../_types';
import { fmtRp } from '../_types';

export type BidangKeputusan = 'APPROVE' | 'TOLAK' | 'KEMBALIKAN' | 'REVISI_LANGSUNG';

export interface BidangRevDecision {
  keputusan: BidangKeputusan;
  catatan: string;
  rev_nama?: string;
  rev_spesifikasi?: string;
  rev_qty?: number;
  rev_harga?: number;
}

interface Props {
  header: UsulanHeader;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function BidangReviewModal({ header, onClose, onSuccess }: Props) {
  const [items, setItems] = useState<UsulanItem[]>([]);
  const [decisions, setDecisions] = useState<Record<number, BidangRevDecision>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  // BUG-W4: Optimistic lock — capture timestamp saat modal dibuka.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(''); setItems([]); setDecisions({}); setUpdatedAt(null);
      const d = await fetchJson<{ header: { updated_at?: string }; items: UsulanItem[] }>(`/api/usulan/${header.id}`);
      if (cancelled) return;
      if (!d.ok) { setErr(d.message || 'Gagal memuat data.'); return; }
      if (!d.data) { setErr('Data review tidak valid'); return; }
      setUpdatedAt(d.data.header?.updated_at ?? null);
      const its: UsulanItem[] = d.data.items.filter(i => i.status === 'DIAJUKAN_REVIEW');
      setItems(its);
      const init: Record<number, BidangRevDecision> = {};
      its.forEach(i => {
        init[i.id] = {
          keputusan: 'APPROVE', catatan: '',
          rev_nama: i.nama_barang, rev_spesifikasi: i.spesifikasi,
          rev_qty: Number(i.qty), rev_harga: Number(i.harga_est),
        };
      });
      setDecisions(init);
    })();
    return () => { cancelled = true; };
  }, [header.id]);

  async function doSubmit() {
    setErr(''); setLoading(true);
    try {
      // Validasi REVISI_LANGSUNG: qty >= 1 + harga >= 1 (server tetap validasi juga).
      const badRevisi = Object.values(decisions).find(d =>
        d.keputusan === 'REVISI_LANGSUNG' && (
          !d.rev_nama?.trim() || !d.rev_qty || d.rev_qty < 1 || !d.rev_harga || d.rev_harga < 1
        )
      );
      if (badRevisi) {
        setErr('Revisi langsung wajib isi: Nama, Qty ≥ 1, Harga ≥ 1.');
        setLoading(false);
        return;
      }
      const payload: Record<string, unknown> = {
        decisions: Object.entries(decisions).map(([id, d]) => ({
          item_id:         Number(id),
          keputusan:       d.keputusan,
          catatan:         d.catatan,
          rev_nama:        d.keputusan === 'REVISI_LANGSUNG' ? d.rev_nama        : undefined,
          rev_spesifikasi: d.keputusan === 'REVISI_LANGSUNG' ? d.rev_spesifikasi : undefined,
          rev_qty:         d.keputusan === 'REVISI_LANGSUNG' ? Number(d.rev_qty)   : undefined,
          rev_harga:       d.keputusan === 'REVISI_LANGSUNG' ? Number(d.rev_harga) : undefined,
        })),
      };
      if (updatedAt) payload.updated_at_check = updatedAt;
      const d = await fetchJson(`/api/usulan/${header.id}/bidang`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (d.ok) {
        onSuccess(d.message || 'Review disimpan.');
        onClose();
      } else {
        setErr(d.message || 'Gagal menyimpan review');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">🏢 Review Bidang</div>
            <div className="modal-sub">
              {header.no_usulan} · {header.sub_bidang}{header.jenis_belanja ? ` · ${header.jenis_belanja}` : ''} · {items.length} item
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280'}}><X size={18}/></button>
        </div>
        <div className="modal-body">
          {err && <div className="msg-err"><AlertCircle size={14}/><span>{err}</span></div>}
          {items.length === 0 ? <div style={{textAlign:'center',padding:'40px',color:'#9ca3af'}}>Memuat item...</div>
          : items.map(it => {
            const dec = decisions[it.id] ?? {
              keputusan: 'APPROVE' as BidangKeputusan, catatan: '',
              rev_nama: it.nama_barang, rev_spesifikasi: it.spesifikasi,
              rev_qty: it.qty, rev_harga: it.harga_est,
            };
            const isRL = dec.keputusan === 'REVISI_LANGSUNG';
            const selClass = dec.keputusan === 'APPROVE' || isRL ? 's-ok' : dec.keputusan === 'TOLAK' ? 's-err' : 's-warn';
            const updDec = (patch: Partial<BidangRevDecision>) => setDecisions(prev => ({ ...prev, [it.id]: { ...dec, ...patch } }));
            return (
              <div key={it.id} className="dec-row">
                <div className="dec-row-top">
                  <div className="dec-item-no">{it.no_item}</div>
                  <div className="dec-item-info">
                    <div className="dec-item-name">{it.nama_barang}</div>
                    <div className="dec-item-meta">{it.spesifikasi||''} · {it.qty} {it.satuan} · Est. {fmtRp(it.harga_est*it.qty)}</div>
                    {it.alasan && <div style={{fontSize:11,color:'#4b7a5a',marginTop:2}}>💬 {it.alasan}</div>}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'180px 1fr',gap:8,alignItems:'end'}}>
                  <div>
                    <div className="dec-label">Keputusan</div>
                    <select className={`dec-select ${selClass}`} value={dec.keputusan}
                      onChange={e => updDec({ keputusan: e.target.value as BidangKeputusan })}>
                      <option value="APPROVE">✅ Setujui → ke Admin</option>
                      <option value="REVISI_LANGSUNG">✏️ Revisi Langsung → ke Admin</option>
                      <option value="KEMBALIKAN">🔄 Kembalikan ke Sub Bidang</option>
                      <option value="TOLAK">❌ Tolak</option>
                    </select>
                  </div>
                  <div>
                    <div className="dec-label">Catatan</div>
                    <input className="dec-input" placeholder="Catatan (opsional)" value={dec.catatan}
                      onChange={e => updDec({ catatan: e.target.value })}/>
                  </div>
                </div>
                {isRL && (
                  <div style={{marginTop:8,padding:'10px 12px',background:'rgba(239,159,39,.08)',border:'1px solid rgba(239,159,39,.3)',borderRadius:8}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#EF9F27',marginBottom:8}}>✏️ Edit data item sebelum diteruskan ke Admin</div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                      <div style={{gridColumn:'1/-1'}}>
                        <div className="dec-label">Nama Barang</div>
                        <input className="dec-input" value={dec.rev_nama ?? ''} onChange={e => updDec({ rev_nama: e.target.value })}/>
                      </div>
                      <div style={{gridColumn:'1/-1'}}>
                        <div className="dec-label">Spesifikasi</div>
                        <input className="dec-input" value={dec.rev_spesifikasi ?? ''} onChange={e => updDec({ rev_spesifikasi: e.target.value })}/>
                      </div>
                      <div>
                        <div className="dec-label">Qty</div>
                        <PrimaNumberField size="sm" min={1} value={dec.rev_qty ?? ''}
                          onChange={e => updDec({ rev_qty: parseFloat(e.target.value) || undefined })}/>
                      </div>
                      <div>
                        <div className="dec-label">Harga Est. (Rp)</div>
                        <InputNominal className="dec-input" value={dec.rev_harga ?? 0}
                          onChange={v => updDec({ rev_harga: v || undefined })}/>
                      </div>
                    </div>
                    {(dec.rev_qty && dec.rev_harga) && (
                      <div style={{marginTop:6,fontSize:11,color:'#EF9F27',fontWeight:600}}>
                        Total baru: {fmtRp((dec.rev_qty || 0) * (dec.rev_harga || 0))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <PrimaButton variant="ghost" onClick={onClose}>Batal</PrimaButton>
          <PrimaButton variant="primary" iconLeft={<CheckCircle2 size={14}/>} onClick={doSubmit} disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan Review'}
          </PrimaButton>
        </div>
      </div>
    </div>
  );
}
