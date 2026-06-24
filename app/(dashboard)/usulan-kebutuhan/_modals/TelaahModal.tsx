// PERF-C2 Tahap 4: TelaahModal extracted dari usulan-client.tsx.
// Self-contained — state (items, decisions, loading, error) di-manage internal.
// Shell hanya butuh `header` state dan `onSuccess` callback.

'use client';

import { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { InputNominal } from '@/components/ui/input-nominal';
import PrimaButton from '@/components/ui/PrimaButton';
import type { UsulanHeader, UsulanItem, TelaahDecision } from '../_types';
import { fmtRp, fmtNum, parseNum } from '../_types';

interface Props {
  header: UsulanHeader;
  onClose: () => void;
  onSuccess: () => void;
}

export function TelaahModal({ header, onClose, onSuccess }: Props) {
  const [items, setItems] = useState<UsulanItem[]>([]);
  const [decisions, setDecisions] = useState<Record<number, TelaahDecision>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Load items DIAJUKAN saja saat mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(''); setItems([]); setDecisions({});
      const d = await fetchJson<{ items: UsulanItem[] }>(`/api/usulan/${header.id}`);
      if (cancelled) return;
      if (d.ok && d.data) {
        const its: UsulanItem[] = d.data.items.filter(i => i.status === 'DIAJUKAN');
        setItems(its);
        const init: Record<number, TelaahDecision> = {};
        its.forEach(i => {
          init[i.id] = { status: 'DITELAAH', admin_qty: Number(i.qty), admin_harga: Number(i.harga_est), catatan: '' };
        });
        setDecisions(init);
      } else if (!d.ok) {
        setErr(d.message || 'Gagal memuat data.');
      }
    })();
    return () => { cancelled = true; };
  }, [header.id]);

  async function doSubmit() {
    setErr(''); setLoading(true);
    try {
      // Validasi qty >= 1 untuk DIREVISI_ADMIN (allow 0 di edit, reject di submit).
      const badRevisi = Object.values(decisions).find(d =>
        d.status === 'DIREVISI_ADMIN' && (!d.admin_qty || d.admin_qty < 1)
      );
      if (badRevisi) {
        setErr('Qty revisi harus minimal 1. Periksa kembali item revisi.');
        setLoading(false);
        return;
      }
      const payload = Object.entries(decisions).map(([id, d]) => ({
        item_id: Number(id),
        status: d.status,
        admin_qty: d.admin_qty,
        admin_harga: d.admin_harga,
        catatan_admin: d.catatan,
      }));
      const d = await fetchJson(`/api/usulan/${header.id}/telaah`, {
        method: 'POST',
        body: JSON.stringify({ decisions: payload }),
      });
      if (d.ok) { onSuccess(); onClose(); }
      else setErr(d.message || 'Gagal menyimpan telaah');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">🔍 Telaah Usulan — Admin</div>
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
            const dec = decisions[it.id] ?? { status: 'DITELAAH', admin_qty: Number(it.qty), admin_harga: Number(it.harga_est), catatan: '' };
            const selClass = dec.status === 'DITELAAH' ? 's-ok' : dec.status === 'DITOLAK_ADMIN' ? 's-err' : 's-warn';
            const isRevisi = dec.status === 'DIREVISI_ADMIN';
            const revQty   = dec.admin_qty   ?? Number(it.qty);
            const revHarga = dec.admin_harga ?? Number(it.harga_est);
            return (
              <div key={it.id} className="dec-row">
                <div className="dec-row-top">
                  <div className="dec-item-no">{it.no_item}</div>
                  <div className="dec-item-info">
                    <div className="dec-item-name">{it.nama_barang}</div>
                    <div className="dec-item-meta">{it.spesifikasi||''} · {it.qty} {it.satuan} · Est. {fmtRp(Number(it.harga_est)*Number(it.qty))} · <span style={{color:it.prioritas==='TINGGI'?'#dc2626':it.prioritas==='SEDANG'?'#d97706':'#2563eb',fontWeight:700}}>{it.prioritas}</span></div>
                  </div>
                </div>
                <div className="dec-row-bottom">
                  <div>
                    <div className="dec-label">Keputusan</div>
                    <select className={`dec-select ${selClass}`} value={dec.status}
                      onChange={e => setDecisions(prev => ({ ...prev, [it.id]: { ...dec, status: e.target.value as TelaahDecision['status'], admin_qty: Number(it.qty), admin_harga: Number(it.harga_est) } }))}>
                      <option value="DITELAAH">✅ Setuju / Telaah</option>
                      <option value="DIREVISI_ADMIN">🔄 Revisi</option>
                      <option value="DITOLAK_ADMIN">❌ Tolak</option>
                    </select>
                  </div>
                  {isRevisi && (
                    <>
                      <div>
                        <div className="dec-label">Qty Revisi</div>
                        <input className="dec-input" type="text" inputMode="numeric"
                          value={fmtNum(revQty)}
                          onChange={e => {
                            // Fix UX: jangan `|| Number(it.qty)` clamp — bikin backspace stuck.
                            // Allow 0 selama edit; validasi qty >= 1 di submit handler.
                            const q = parseNum(e.target.value);
                            setDecisions(prev => ({ ...prev, [it.id]: { ...dec, admin_qty: q } }));
                          }}/>
                      </div>
                      <div>
                        <div className="dec-label">Harga Revisi (Rp)</div>
                        <InputNominal className="dec-input" value={revHarga}
                          onChange={v => setDecisions(prev => ({ ...prev, [it.id]: { ...dec, admin_harga: v || Number(it.harga_est) } }))}/>
                      </div>
                      <div style={{display:'flex',alignItems:'flex-end'}}>
                        <div style={{fontSize:11,color:'#92400e',fontWeight:600,paddingBottom:4}}>Total: {fmtRp(revQty*revHarga)}</div>
                      </div>
                    </>
                  )}
                  <div>
                    <div className="dec-label">Catatan</div>
                    <input className="dec-input" value={dec.catatan}
                      onChange={e => setDecisions(prev => ({ ...prev, [it.id]: { ...dec, catatan: e.target.value } }))}
                      placeholder="Catatan admin..."/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <PrimaButton variant="ghost" onClick={onClose}>Batal</PrimaButton>
          <PrimaButton variant="primary" iconLeft={<CheckCircle2 size={14}/>} onClick={doSubmit} disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan Telaah'}
          </PrimaButton>
        </div>
      </div>
    </div>
  );
}
