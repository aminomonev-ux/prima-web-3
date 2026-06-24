// PERF-C2 Tahap 8: TrackingPanel — self-contained search panel.
// State trackQ/trackRes/trackLd/trackErr di-manage internal.
// Shell hanya provide openDetail callback (untuk Eye button).

'use client';

import { useState } from 'react';
import { Search, AlertCircle, Eye } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import type { UsulanHeader } from '../_types';
import { fmtRp, fmtTgl } from '../_types';
import { StatusBadgesCell } from '../_utils';

interface Props {
  openDetail: (u: UsulanHeader) => void;
}

export function TrackingPanel({ openDetail }: Props) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<UsulanHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function doSearch() {
    if (!q.trim()) { setErr('Masukkan nomor atau nama usulan'); return; }
    setLoading(true); setErr(''); setRes([]);
    try {
      const d = await fetchJson<UsulanHeader[]>(`/api/usulan?search=${encodeURIComponent(q.trim())}&limit=10`);
      if (d.ok) setRes(d.data ?? []);
      else setErr(d.message || 'Tidak ditemukan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="form-card">
        <div className="form-card-title">🔍 Lacak Status Usulan</div>
        <div style={{display:'flex',gap:8}}>
          <input className="form-control" placeholder="Masukkan no. usulan atau nama barang..."
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            style={{flex:1}}/>
          <PrimaButton variant="primary" iconLeft={<Search size={14}/>} onClick={doSearch} disabled={loading}>
            {loading ? 'Mencari...' : 'Lacak'}
          </PrimaButton>
        </div>
        {err && <div className="msg-err" style={{marginTop:10}}><AlertCircle size={14}/><span>{err}</span></div>}
      </div>
      {res.length > 0 && (
        <div className="ua-table-wrap">
          <table className="ua-table">
            <thead><tr>
              <th>No. Usulan</th><th>Tanggal</th><th>Sub Bidang</th><th>Pengusul</th>
              <th>Item</th><th>Total Est.</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>{res.map(u => (
              <tr key={u.id}>
                <td style={{fontWeight:700,color:'#EF9F27',fontFamily:'monospace',fontSize:12}}>
                  {u.no_usulan}
                  {u.matched_items && (
                    <div style={{fontFamily:'inherit',fontWeight:400,fontSize:10,color:'#6b7280',marginTop:3}}>
                      🔍 <span style={{color:'#0d7a3a',fontWeight:600}}>{u.matched_items}</span>
                    </div>
                  )}
                </td>
                <td>{fmtTgl(u.tanggal)}</td>
                <td>{u.sub_bidang}</td>
                <td>{u.pengusul}</td>
                <td style={{textAlign:'center'}}>{u.jumlah_item}</td>
                <td>{fmtRp(u.total_nilai)}</td>
                <td><StatusBadgesCell u={u}/></td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => openDetail(u)}><Eye size={12}/></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
