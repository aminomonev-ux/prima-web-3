'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabBroadcast.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { ALL_ROLES, fmtTs, type BroadcastRow } from './_shared';

export function TabBroadcast() {
  const [history, setHistory] = useState<BroadcastRow[]>([]);
  const [pesan,   setPesan]   = useState('');
  const [target,  setTarget]  = useState('');
  const [loading, setLoad]    = useState(false);

  const loadHistory = useCallback(async()=>{
    const r = await fetchJson<BroadcastRow[]>('/api/admin/broadcast');
    if (r.ok && r.data) setHistory(r.data);
  },[]);

  useEffect(()=>{ loadHistory(); },[loadHistory]);

  async function kirim() {
    if (!pesan.trim()) return;
    setLoad(true);
    try {
      const j = await fetchJson('/api/admin/broadcast',{method:'POST',body:JSON.stringify({pesan,targetRole:target||undefined})});
      if (j.ok) {
        const sent = (j as { sent?: number }).sent ?? 0;
        toast.success(`Broadcast terkirim ke ${sent} user.`); setPesan(''); setTarget(''); loadHistory();
      }
      else toast.error(j.message);
    } finally { setLoad(false); }
  }

  return (
    <div>
      <div className="ap-section-title">KIRIM BROADCAST</div>
      <div className="ap-card" style={{marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 200px',gap:10,marginBottom:10}}>
          <textarea className="ap-input" rows={3} placeholder="Tulis pesan broadcast..." value={pesan} onChange={e=>setPesan(e.target.value)} style={{resize:'vertical'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <select className="ap-select" style={{width:'100%'}} value={target} onChange={e=>setTarget(e.target.value)}>
              <option value="">Semua Role</option>
              {ALL_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            <PrimaButton variant="success" size="sm" iconLeft={<Send size={12}/>}
              onClick={kirim} disabled={loading||!pesan.trim()}>
              {loading ? 'KIRIM...' : 'KIRIM'}
            </PrimaButton>
          </div>
        </div>
        <div style={{fontSize:10,color:'var(--ap-dim)'}}>{pesan.length}/500 karakter</div>
      </div>

      <div className="ap-section-title">RIWAYAT BROADCAST</div>
      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr><th>WAKTU</th><th>PENERIMA</th><th>PESAN</th></tr></thead>
          <tbody>
            {history.length === 0 ? (
              <tr><td colSpan={3} style={{textAlign:'center',padding:24,color:'var(--ap-dim)'}}>Belum ada broadcast</td></tr>
            ) : history.map(h=>(
              <tr key={h.id}>
                <td style={{fontSize:11,color:'var(--ap-dim)',whiteSpace:'nowrap'}}>{fmtTs(h.created_at)}</td>
                <td><span className="ap-badge badge-cyan">{h.recipient}</span></td>
                <td style={{fontSize:12,color:'var(--ap-fg2)',maxWidth:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.pesan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
