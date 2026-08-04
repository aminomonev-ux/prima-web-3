'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabAuditTrail.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { fmtTs, type AuditRow } from './_shared';

export function TabAuditTrail() {
  const [rows,   setRows]   = useState<AuditRow[]>([]);
  const [loading,setLoad]   = useState(false);
  const [event,  setEvent]  = useState('');
  const [user,   setUser]   = useState('');
  const [page,   setPage]   = useState(1);
  const [pages,  setPages]  = useState(1);
  const [total,  setTotal]  = useState(0);

  const load = useCallback(async(pg=1)=>{
    setLoad(true);
    try {
      const p = new URLSearchParams({page:String(pg),limit:'50'});
      if (event) p.set('event',event);
      if (user)  p.set('username',user);
      const r = await fetchJson<AuditRow[]>(`/api/admin/audit-log?${p}`);
      if (r.ok && r.data) {
        const pg2 = (r as { pagination?: { page: number; totalPages: number; total: number } }).pagination;
        setRows(r.data);
        if (pg2) { setPage(pg2.page); setPages(pg2.totalPages); setTotal(pg2.total); }
      }
    } finally { setLoad(false); }
  },[event,user]);

  useEffect(()=>{ load(1); },[load]);

  function eventBadge(ev:string) {
    if (ev==='LOGIN_SUCCESS') return <span className="ap-badge badge-green">{ev}</span>;
    if (ev==='LOGOUT')        return <span className="ap-badge badge-gray">{ev}</span>;
    if (ev.includes('FAILED')||ev.includes('BLOCKED')||ev.includes('LOCKED')) return <span className="ap-badge badge-red">{ev}</span>;
    return <span className="ap-badge badge-yellow">{ev}</span>;
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div className="ap-section-title" style={{margin:0}}>AUDIT TRAIL — {total} ENTRI</div>
        <div className="ap-row">
          <select className="ap-select" value={event} onChange={e=>{setEvent(e.target.value);load(1);}}>
            <option value="">Semua Event</option>
            {['LOGIN_SUCCESS','LOGIN_FAILED','LOGIN_BLOCKED','ACCOUNT_LOCKED','LOGOUT','SIGNUP','PASSWORD_RESET','SESSION_EXPIRED','BROADCAST','BRUTE_FORCE'].map(e=><option key={e} value={e}>{e}</option>)}
          </select>
          <input className="ap-input" style={{width:160}} placeholder="Filter username..." value={user} onChange={e=>setUser(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')load(1);}}/>
          <button className="ap-btn ap-btn-cyan" onClick={()=>load(1)} disabled={loading}><RefreshCw size={12}/></button>
        </div>
      </div>
      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr><th>WAKTU</th><th>EVENT</th><th>USERNAME</th><th>IP</th><th>DETAIL</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada data</td></tr>
            ) : rows.map(r=>(
              <tr key={r.id}>
                <td style={{fontSize:11,color:'#5a8ea8',whiteSpace:'nowrap'}}>{fmtTs(r.created_at)}</td>
                <td>{eventBadge(r.event_type)}</td>
                <td style={{fontWeight:700,color:'#e0f7ff'}}>{r.username??'-'}</td>
                <td style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#5a8ea8'}}>{r.ip_address??'-'}</td>
                <td style={{fontSize:11,color:'#a0cfe0'}}>{r.detail??'-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:12}}>
          <button className="ap-btn ap-btn-cyan" disabled={page<=1} onClick={()=>load(page-1)}><ChevronLeft size={12}/></button>
          <span style={{fontSize:11,color:'#5a8ea8',alignSelf:'center'}}>Hal {page}/{pages}</span>
          <button className="ap-btn ap-btn-cyan" disabled={page>=pages} onClick={()=>load(page+1)}><ChevronRight size={12}/></button>
        </div>
      )}
    </div>
  );
}
