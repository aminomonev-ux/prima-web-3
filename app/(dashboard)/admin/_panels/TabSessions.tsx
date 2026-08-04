'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabSessions.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Trash2, X } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { fmtTs, fmtIdle, type SessionRow } from './_shared';

export function TabSessions({ selfSessionId, isSA }: { selfSessionId:string; isSA:boolean }) {
  const [rows,    setRows]    = useState<SessionRow[]>([]);
  const [stats,   setStats]   = useState<{users:Record<string,number>;sessions:Record<string,number>}|null>(null);
  const [loading, setLoad]    = useState(false);
  const [search,  setSearch]  = useState('');
  const [emModal, setEmModal] = useState(false);
  const [emPw,    setEmPw]    = useState('');
  const [emErr,   setEmErr]   = useState('');
  const [emLoading,setEmLoad] = useState(false);
  const [ok,      setOk]      = useState('');
  const [err,     setErr]     = useState('');

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const [sr, ss] = await Promise.all([
        fetchJson<SessionRow[]>('/api/admin/sessions'),
        fetchJson('/api/admin/system-status'),
      ]);
      if (sr.ok && sr.data) setRows(sr.data);
      if (ss.ok) {
        const s = ss as { users?: Record<string,number>; sessions?: Record<string,number> };
        if (s.users && s.sessions) setStats({ users: s.users, sessions: s.sessions });
      }
    } finally { setLoad(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const filtered = rows.filter(r=>!search||r.username.toLowerCase().includes(search.toLowerCase())||(r.ip_address??'').includes(search));

  async function forceLogout(sid: string) {
    setErr(''); setOk('');
    const j = await fetchJson(`/api/admin/sessions/${sid}`, { method:'DELETE' });
    if (j.ok) { setOk('Sesi berhasil dihapus.'); load(); } else setErr(j.message);
  }

  async function doEmergency() {
    setEmErr(''); setEmLoad(true);
    try {
      const j = await fetchJson('/api/admin/sessions', { method:'DELETE', body:JSON.stringify({password:emPw}) });
      if (j.ok) {
        const deleted = (j as { deleted?: number }).deleted ?? 0;
        setOk(`Emergency logout: ${deleted} sesi dihapus.`); setEmModal(false); setEmPw(''); load();
      }
      else setEmErr(j.message);
    } finally { setEmLoad(false); }
  }

  const s = stats?.sessions;
  return (
    <div>
      {ok  && <div className="msg-ok">{ok}</div>}
      {err && <div className="msg-err">{err}</div>}

      <div className="ap-grid4" style={{marginBottom:16}}>
        {[
          {label:'USER STATUS',  rows:[['Total User',stats?.users?.total??'-','cyan'],['Aktif',stats?.users?.aktif??'-','green'],['Blocked',stats?.users?.locked??'-','red'],['Menunggu',stats?.users?.menunggu??'-','yellow']]},
          {label:'SESSION STATUS',rows:[['Total Row',s?.total??'-','cyan'],['Aktif',s?.aktif??'-','green'],['Idle >30m',s?.idle??'-','yellow'],['Expired',s?.expired??'-','red']]},
        ].map((c,i)=>(
          <div key={i} className="ap-card">
            <div className="ap-card-title">{c.label}</div>
            {c.rows.map(([k,v,cl])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,0.06)',fontSize:12}}>
                <span style={{color:'#5a8ea8'}}>{k}</span>
                <span className={cl as string} style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="ap-card">
          <div className="ap-card-title">SYSTEM INFO</div>
          {[['Session Inactive',`60 menit`,'cyan'],['Keepalive Interval','25 menit','cyan'],['Password Min','8 char + A-Z+0-9','green']].map(([k,v,cl])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,0.06)',fontSize:12}}>
              <span style={{color:'#5a8ea8'}}>{k}</span>
              <span className={cl as string} style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</span>
            </div>
          ))}
        </div>
        <div className="ap-card" style={{display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
          <div className="ap-card-title">QUICK STATS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[['TOTAL',s?.total??0,'cyan'],['AKTIF',s?.aktif??0,'green'],['IDLE',s?.idle??0,'yellow'],['UNIK',s?.unik??0,'cyan']].map(([l,v,c])=>(
              <div key={l as string} style={{textAlign:'center',padding:8,background:'rgba(0,212,255,0.04)',borderRadius:6,border:'1px solid rgba(0,212,255,0.1)'}}>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}} className={c as string}>{v as number}</div>
                <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:1}}>{l as string}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div className="ap-section-title" style={{margin:0}}>DAFTAR SESI AKTIF</div>
        <div className="ap-row">
          <input className="ap-input" style={{width:220}} placeholder="Cari username atau IP..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <button className="ap-btn ap-btn-cyan" onClick={load} disabled={loading}><RefreshCw size={12}/> REFRESH</button>
          {isSA && <button className="ap-btn ap-btn-red" onClick={()=>{setEmModal(true);setEmErr('');}}><AlertTriangle size={12}/> EMERGENCY LOGOUT</button>}
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,color:'#5a8ea8',letterSpacing:2}}>LOADING...</div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead><tr>
              <th>USERNAME</th><th>ROLE</th><th>IP ADDRESS</th>
              <th>LOGIN</th><th>LAST ACTIVE</th><th>IDLE</th><th>STATUS</th>
              <th>AKSI</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada sesi aktif</td></tr>
              ) : filtered.map(r => {
                const isSelf  = r.session_id === selfSessionId;
                const idleSec = r.idle_seconds;
                const isIdle  = idleSec > 1800;
                return (
                  <tr key={r.session_id}>
                    <td style={{fontWeight:700,color:isSelf?'#00ffc8':'#e0f7ff'}}>{r.username}{isSelf&&<span style={{fontSize:9,marginLeft:4,color:'#5a8ea8'}}>(ANDA)</span>}</td>
                    <td><span className="ap-badge badge-cyan">{r.role}</span></td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{r.ip_address??'-'}</td>
                    <td style={{fontSize:11,color:'#5a8ea8'}}>{fmtTs(r.created_at)}</td>
                    <td style={{fontSize:11,color:'#5a8ea8'}}>{fmtTs(r.last_active)}</td>
                    <td className={isIdle?'yellow':'green'} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{fmtIdle(idleSec)}</td>
                    <td><span className={`ap-badge ${isIdle?'badge-yellow':'badge-green'}`}><span className={isIdle?'dot-idle':'dot-active'}/>{isIdle?'IDLE':'AKTIF'}</span></td>
                    <td>
                      {!isSelf ? (
                        <button className="ap-btn ap-btn-red" style={{padding:'4px 10px',fontSize:10}} onClick={()=>forceLogout(r.session_id)}>
                          <Trash2 size={10}/> LOGOUT
                        </button>
                      ) : (
                        <span style={{fontSize:10,color:'#5a8ea8',fontStyle:'italic'}}>Sesi Anda</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {emModal && (
        <div className="ap-modal-bg" onClick={e=>{if(e.target===e.currentTarget){setEmModal(false);setEmPw('');}}}>
          <div className="ap-modal-box danger">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="ap-modal-title" style={{color:'#ff4466'}}><AlertTriangle size={16}/> EMERGENCY LOGOUT</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>{setEmModal(false);setEmPw('');}}><X size={18}/></button>
            </div>
            <p style={{fontSize:12,color:'#a0cfe0',marginBottom:16,lineHeight:1.6}}>
              Aksi ini akan <span style={{color:'#ff4444',fontWeight:700}}>menghapus semua sesi aktif</span> kecuali sesi Anda. Konfirmasi dengan password Anda.
            </p>
            {emErr && <div className="msg-err">{emErr}</div>}
            <input className="ap-input" type="password" placeholder="Password Anda..." value={emPw} onChange={e=>setEmPw(e.target.value)} style={{marginBottom:14}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>{setEmModal(false);setEmPw('');}}>Batal</button>
              <button className="ap-btn ap-btn-red" onClick={doEmergency} disabled={emLoading||!emPw}>
                <AlertTriangle size={11}/>{emLoading?'Proses...':'KONFIRMASI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
