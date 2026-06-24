// PERF-C2 Tahap 5: PutusanModal extracted dari usulan-client.tsx.
// Self-contained — branching Kasubag vs Kabag di internal.
// Mempertahankan BUG-C5 guard: kalau tidak ada item siap diputuskan,
// modal langsung close + toast (bukan fallback ke allItems).

'use client';

import { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { InputNominal } from '@/components/ui/input-nominal';
import PrimaButton from '@/components/ui/PrimaButton';
import type { Role } from '@/types';
import type { UsulanHeader, UsulanItem, PutusanDecision } from '../_types';
import { STATUS_BADGE, fmtRp, fmtNum, parseNum } from '../_types';
import { StatusBadge } from '../_utils';

interface Props {
  header: UsulanHeader;
  role: Role;
  onClose: () => void;
  onSuccess: () => void;
  showToast: (text: string, isErr?: boolean) => void;
}

export function PutusanModal({ header, role, onClose, onSuccess, showToast }: Props) {
  const [items, setItems] = useState<UsulanItem[]>([]);
  const [decisions, setDecisions] = useState<Record<number, PutusanDecision>>({});
  const [kabagGroup, setKabagGroup] = useState<{ status: 'DISETUJUI' | 'DITOLAK'; catatan: string }>({ status: 'DISETUJUI', catatan: '' });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Load items relevant on mount. BUG-C5 guard: kalau kosong, abort + toast.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(''); setItems([]); setDecisions({});
      const d = await fetchJson<{ items: UsulanItem[] }>(`/api/usulan/${header.id}`);
      if (cancelled) return;
      if (!d.ok) { setErr(d.message || 'Gagal memuat data.'); return; }
      if (!d.data) { setErr('Data putusan tidak valid'); return; }

      const allItems: UsulanItem[] = d.data.items;
      const isKasubag = role === 'ADMIN_KASUBAG' || (role === 'SUPER_ADMIN' && header.status_ringkas === 'DITELAAH');
      const relevantStatuses = isKasubag ? ['DITELAAH', 'DIREVISI_ADMIN'] : ['DIPROSES', 'DIREVISI_KASUBAG'];
      const its = allItems.filter(i => relevantStatuses.includes(i.status));

      // BUG-C5: JANGAN fallback ke allItems — bisa kirim putusan ke item yang sudah final.
      if (its.length === 0) {
        showToast(isKasubag
          ? 'Tidak ada item siap diputuskan Kasubag (status DITELAAH/DIREVISI_ADMIN).'
          : 'Tidak ada item siap diputuskan Kabag (status DIPROSES/DIREVISI_KASUBAG).', true);
        onClose();
        return;
      }

      setItems(its);
      const defaultStatus: PutusanDecision['status'] = isKasubag ? 'DIPROSES' : 'DISETUJUI';
      const init: Record<number, PutusanDecision> = {};
      its.forEach(i => {
        const defNominal = i.status === 'DIREVISI_ADMIN'
          ? (Number(i.admin_qty) || Number(i.qty)) * (Number(i.admin_harga) || Number(i.harga_est))
          : Number(i.nominal_disetujui) || Number(i.harga_est) * Number(i.qty);
        init[i.id] = { status: defaultStatus, nominal: defNominal, catatan: '' };
      });
      setDecisions(init);
    })();
    return () => { cancelled = true; };
  }, [header.id, header.status_ringkas, role, onClose, showToast]);

  async function doSubmit() {
    setErr(''); setLoading(true);
    const isKabagRole = role === 'ADMIN_KABAG' || (role === 'SUPER_ADMIN' && header.status_ringkas === 'DIPROSES');
    try {
      let payload;
      if (isKabagRole) {
        payload = items.map(it => ({
          item_id: it.id,
          status: kabagGroup.status,
          nominal_disetujui: kabagGroup.status === 'DITOLAK' ? 0 : Number(it.nominal_disetujui) || 0,
          catatan_kasubag: kabagGroup.catatan,
        }));
      } else {
        // Validasi qty >= 1 untuk DIREVISI_KASUBAG (allow 0 di edit, reject di submit).
        const badRevisi = Object.values(decisions).find(d =>
          d.status === 'DIREVISI_KASUBAG' && (!d.kasubag_qty || d.kasubag_qty < 1)
        );
        if (badRevisi) {
          setErr('Qty revisi harus minimal 1. Periksa kembali item revisi.');
          setLoading(false);
          return;
        }
        payload = Object.entries(decisions).map(([id, d]) => ({
          item_id: Number(id),
          status: d.status,
          nominal_disetujui: d.nominal,
          kasubag_qty: d.kasubag_qty,
          kasubag_harga: d.kasubag_harga,
          catatan_kasubag: d.catatan,
        }));
      }
      const d = await fetchJson(`/api/usulan/${header.id}/putusan`, {
        method: 'POST',
        body: JSON.stringify({ decisions: payload }),
      });
      if (d.ok) { onSuccess(); onClose(); }
      else setErr(d.message || 'Gagal menyimpan putusan');
    } finally {
      setLoading(false);
    }
  }

  const isKasubagModal = role === 'ADMIN_KASUBAG' || (role === 'SUPER_ADMIN' && header.status_ringkas === 'DITELAAH');
  const isKabagModal   = role === 'ADMIN_KABAG'   || (role === 'SUPER_ADMIN' && header.status_ringkas === 'DIPROSES');
  const title = role === 'ADMIN_KASUBAG' ? 'Kasubag' : role === 'ADMIN_KABAG' ? 'Kabag' : header.status_ringkas === 'DITELAAH' ? 'Kasubag' : 'Kabag';

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="modal-title">⚖️ Putusan {title}</div>
            <div className="modal-sub">
              {header.no_usulan} · {header.sub_bidang}{header.jenis_belanja ? ` · ${header.jenis_belanja}` : ''} · {items.length} item
            </div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280'}}><X size={18}/></button>
        </div>
        <div className="modal-body">
          {err && <div className="msg-err"><AlertCircle size={14}/><span>{err}</span></div>}
          {items.length === 0 ? <div style={{textAlign:'center',padding:'40px',color:'#9ca3af'}}>Memuat item...</div>
          : isKabagModal ? renderKabag(items, kabagGroup, setKabagGroup)
          : renderKasubag(items, decisions, setDecisions, isKasubagModal)}
        </div>
        <div className="modal-footer">
          <PrimaButton variant="ghost" onClick={onClose}>Batal</PrimaButton>
          <PrimaButton variant="primary" iconLeft={<CheckCircle2 size={14}/>} onClick={doSubmit} disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan Putusan'}
          </PrimaButton>
        </div>
      </div>
    </div>
  );
}

// ─── Render: Kabag bulk view (review semua putusan Kasubag, approve/reject all) ───
function renderKabag(
  items: UsulanItem[],
  kabagGroup: { status: 'DISETUJUI' | 'DITOLAK'; catatan: string },
  setKabagGroup: (fn: (prev: { status: 'DISETUJUI' | 'DITOLAK'; catatan: string }) => { status: 'DISETUJUI' | 'DITOLAK'; catatan: string }) => void,
) {
  const totalNominal = items.reduce((s, it) => s + Number(it.nominal_disetujui), 0);
  const selClass = kabagGroup.status === 'DISETUJUI' ? 's-ok' : 's-err';
  return (
    <div>
      <div className="ua-table-wrap" style={{marginBottom:16}}>
        <table className="ua-table">
          <thead><tr><th>#</th><th>Nama Barang</th><th>Putusan Kasubag</th><th>Nominal Kasubag</th></tr></thead>
          <tbody>{items.map(it => (
            <tr key={it.id}>
              <td style={{textAlign:'center',fontWeight:600}}>{it.no_item}</td>
              <td>
                <div style={{fontWeight:600,fontSize:12}}>{it.nama_barang}</div>
                {it.kasubag_catatan && <div style={{fontSize:10,color:'#6b7280',fontStyle:'italic'}}>{it.kasubag_catatan}</div>}
              </td>
              <td><StatusBadge status={it.status}/></td>
              <td style={{fontWeight:700,color:'#0d7a3a'}}>{fmtRp(Number(it.nominal_disetujui))}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr style={{background:'#f0fdf4'}}>
            <td colSpan={3} style={{fontWeight:800,padding:'8px 12px'}}>Total Nominal Kasubag</td>
            <td style={{fontWeight:800,color:'#0d7a3a',padding:'8px 12px'}}>{fmtRp(totalNominal)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div className="dec-row">
        <div className="dec-row-bottom">
          <div>
            <div className="dec-label">Putusan Kabag (semua item)</div>
            <select className={`dec-select ${selClass}`} value={kabagGroup.status}
              onChange={e => setKabagGroup(prev => ({ ...prev, status: e.target.value as 'DISETUJUI' | 'DITOLAK' }))}>
              <option value="DISETUJUI">✅ Setujui Final</option>
              <option value="DITOLAK">❌ Tolak Semua</option>
            </select>
          </div>
          <div>
            <div className="dec-label">Total Disetujui</div>
            <input className="dec-input" readOnly
              value={kabagGroup.status === 'DITOLAK' ? 'Rp 0' : fmtRp(totalNominal)}
              style={{background:'#f9fafb',color:'#6b7280',cursor:'not-allowed'}}/>
          </div>
          <div style={{flex:2}}>
            <div className="dec-label">Catatan Kabag</div>
            <input className="dec-input" value={kabagGroup.catatan}
              onChange={e => setKabagGroup(prev => ({ ...prev, catatan: e.target.value }))}
              placeholder="Catatan..."/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Render: Kasubag (per-item decision dengan revisi qty/harga) ───
function renderKasubag(
  items: UsulanItem[],
  decisions: Record<number, PutusanDecision>,
  setDecisions: (fn: (prev: Record<number, PutusanDecision>) => Record<number, PutusanDecision>) => void,
  isKasubagModal: boolean,
) {
  const defaultSt: PutusanDecision['status'] = isKasubagModal ? 'DIPROSES' : 'DISETUJUI';
  return <>{items.map(it => {
    const dec = decisions[it.id] ?? { status: defaultSt, nominal: Number(it.nominal_disetujui) || Number(it.harga_est) * Number(it.qty), catatan: '' };
    const selClass = (dec.status === 'DIPROSES' || dec.status === 'DISETUJUI') ? 's-ok' : dec.status === 'DITOLAK' ? 's-err' : 's-warn';
    const isRevisiAdmin = it.status === 'DIREVISI_ADMIN';
    const adminQty   = Number(it.admin_qty)   || Number(it.qty);
    const adminHarga = Number(it.admin_harga) || Number(it.harga_est);
    return (
      <div key={it.id} className="dec-row">
        <div className="dec-row-top">
          <div className="dec-item-no">{it.no_item}</div>
          <div className="dec-item-info">
            <div className="dec-item-name">{it.nama_barang}</div>
            <div className="dec-item-meta">
              <span style={{color:'#6b7280'}}>Asal: {Number(it.qty)} {it.satuan} × {fmtRp(Number(it.harga_est))} = {fmtRp(Number(it.harga_est)*Number(it.qty))}</span>
              {isRevisiAdmin && (
                <span style={{marginLeft:6,color:'#7c3aed',fontWeight:600}}>
                  · Revisi Admin: {adminQty} {it.satuan} × {fmtRp(adminHarga)} = <strong>{fmtRp(adminQty*adminHarga)}</strong>
                </span>
              )}
              {it.admin_catatan && <><br/><em style={{color:'#6b7280',fontSize:10}}>Catatan Admin: {it.admin_catatan}</em></>}
              {!isKasubagModal && Number(it.nominal_disetujui)>0 && (() => {
                const isRevisiKasubag = it.kasubag_putusan === 'DIREVISI_KASUBAG';
                const ksQty   = Number(it.kasubag_qty)   || 0;
                const ksHarga = Number(it.kasubag_harga) || 0;
                return (
                  <span style={{marginLeft:6,color:'#0d7a3a',fontWeight:700}}>
                    {isRevisiKasubag && ksQty>0
                      ? <>· Revisi Kasubag: {ksQty} {it.satuan} × {fmtRp(ksHarga)} = <strong>{fmtRp(ksQty*ksHarga)}</strong></>
                      : <>· Kasubag: <strong>{fmtRp(Number(it.nominal_disetujui))}</strong></>
                    }
                    {it.kasubag_putusan && <span style={{marginLeft:4,fontSize:10,fontWeight:400,color:'#6b7280'}}>({STATUS_BADGE[it.kasubag_putusan]?.label??it.kasubag_putusan})</span>}
                  </span>
                );
              })()}
              {!isKasubagModal && it.kasubag_catatan && <><br/><em style={{color:'#0d7a3a',fontSize:10}}>Catatan Kasubag: {it.kasubag_catatan}</em></>}
            </div>
          </div>
          <StatusBadge status={it.status}/>
        </div>
        <div className="dec-row-bottom">
          <div>
            <div className="dec-label">Putusan {isKasubagModal ? 'Kasubag' : 'Kabag'}</div>
            <select className={`dec-select ${selClass}`} value={dec.status}
              onChange={e => {
                const st = e.target.value as PutusanDecision['status'];
                const autoNominal = st === 'DITOLAK' ? 0 : adminQty * adminHarga;
                setDecisions(prev => ({ ...prev, [it.id]: { ...dec, status: st, nominal: autoNominal, kasubag_qty: adminQty, kasubag_harga: adminHarga } }));
              }}>
              {isKasubagModal ? (
                <>
                  <option value="DIPROSES">✅ Setuju → Teruskan ke Kabag</option>
                  <option value="DIREVISI_KASUBAG">🔄 Revisi</option>
                  <option value="DITOLAK">❌ Tolak</option>
                </>
              ) : (
                <>
                  <option value="DISETUJUI">✅ Setujui Final</option>
                  <option value="DITOLAK">❌ Tolak</option>
                </>
              )}
            </select>
          </div>
          {dec.status === 'DIREVISI_KASUBAG' ? (
            <>
              <div>
                <div className="dec-label">Qty</div>
                <input className="dec-input" type="text" inputMode="numeric"
                  value={fmtNum(dec.kasubag_qty ?? adminQty)}
                  onChange={e => {
                    // Fix UX: jangan `|| 1` clamp — bikin backspace stuck di 1.
                    // Allow 0 selama edit; validasi qty >= 1 di submit handler.
                    const q = parseNum(e.target.value);
                    const h = dec.kasubag_harga ?? adminHarga;
                    setDecisions(prev => ({ ...prev, [it.id]: { ...dec, kasubag_qty: q, kasubag_harga: h, nominal: q * h } }));
                  }}/>
              </div>
              <div>
                <div className="dec-label">Harga Est. (Rp)</div>
                <InputNominal className="dec-input"
                  value={dec.kasubag_harga ?? adminHarga}
                  onChange={h => {
                    const q = dec.kasubag_qty ?? adminQty;
                    setDecisions(prev => ({ ...prev, [it.id]: { ...dec, kasubag_harga: h, kasubag_qty: q, nominal: q * h } }));
                  }}/>
              </div>
              <div>
                <div className="dec-label">Total Est.</div>
                <input className="dec-input" readOnly value={fmtRp(dec.nominal)} style={{background:'#f0fdf4',color:'#0d7a3a',fontWeight:700}}/>
              </div>
            </>
          ) : (
            <div>
              <div className="dec-label">Nominal (Rp)</div>
              <input className="dec-input" readOnly
                value={dec.status === 'DITOLAK' ? 'Rp 0' : fmtRp(dec.nominal)}
                style={{background:'#f9fafb',color:'#6b7280',cursor:'not-allowed'}}/>
            </div>
          )}
          <div>
            <div className="dec-label">Catatan</div>
            <input className="dec-input" value={dec.catatan}
              onChange={e => setDecisions(prev => ({ ...prev, [it.id]: { ...dec, catatan: e.target.value } }))}
              placeholder="Catatan..."/>
          </div>
        </div>
      </div>
    );
  })}</>;
}
