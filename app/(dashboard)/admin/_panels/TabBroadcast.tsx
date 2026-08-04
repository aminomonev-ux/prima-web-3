'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabBroadcast.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { ALL_ROLES, fmtTs, type BroadcastRow } from './_shared';

export function TabBroadcast() {
  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [pesan,   setPesan]   = useState('');
  const [target,  setTarget]  = useState('');
  const [loading, setLoad]    = useState(false);
  const [ok,      setOk]      = useState('');
  const [err,     setErr]     = useState('');

  const loadHistory = useCallback(async()=>{
    const r = await fetchJson<BroadcastRow[]>('/api/admin/broadcast');
    if (r.ok && r.data) setHistory(r.data);
  },[]);

  useEffect(()=>{ loadHistory(); },[loadHistory]);

  async function kirim() {
    if (!pesan.trim()) return;
    setLoad(true); setOk(''); setErr('');
    try {
      const j = await fetchJson('/api/admin/broadcast',{method:'POST',body:JSON.stringify({pesan,targetRole:target||undefined})});
      if (j.ok) {
        const sent = (j as { sent?: number }).sent ?? 0;
        setOk(`Broadcast terkirim ke ${sent} user.`); setPesan(''); setTarget(''); loadHistory();
      }
      else setErr(j.message);
    } finally { setLoad(false); }
  }

  return (
    <div>
      <div className="ap-section-title">KIRIM BROADCAST</div>
      {ok  && <div className="msg-ok"  style={{marginBottom:12}}>{ok}</div>}
      {err && <div className="msg-err" style={{marginBottom:12}}>{err}</div>}
      <div className="ap-card" style={{marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 200px',gap:10,marginBottom:10}}>
          <textarea className="ap-input" rows={3} placeholder="Tulis pesan broadcast..." value={pesan} onChange={e=>setPesan(e.target.value)} style={{resize:'vertical'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <select className="ap-select" style={{width:'100%'}} value={target} onChange={e=>setTarget(e.target.value)}>
              <option value="">Semua Role</option>
              {ALL_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <button className="ap-btn ap-btn-green" onClick={kirim} disabled={loading||!pesan.trim()}>
              <Send size={12}/>{loading?'KIRIM...':'KIRIM'}
            </button>
          </div>
        </div>
        <div style={{fontSize:10,color:'#5a8ea8'}}>{pesan.length}/500 karakter</div>
      </div>

      <div className="ap-section-title">RIWAYAT BROADCAST</div>
      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr><th>WAKTU</th><th>PENERIMA</th><th>PESAN</th></tr></thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={3} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Belum ada broadcast</td></tr>
            ) : history.map(h=>(
              <tr key={h.id}>
                <td style={{fontSize:11,color:'#5a8ea8',whiteSpace:'nowrap'}}>{fmtTs(h.created_at)}</td>
                <td><span className="ap-badge badge-cyan">{h.recipient}</span></td>
                <td style={{fontSize:12,color:'#a0cfe0',maxWidth:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.pesan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
