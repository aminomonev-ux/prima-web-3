'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabAppControl.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '@/lib/shared/api';
import { APP_STATUS_LABELS, type AppStatus } from './_shared';

export function TabAppControl({ isSA }: { isSA:boolean }) {
  const [status, setStatus] = useState<AppStatus>({});
  const [loading, setLoad]  = useState(false);
  const [ok, setOk]         = useState('');

  const load = useCallback(async()=>{
    const r = await fetchJson<AppStatus>('/api/admin/app-status');
    if (r.ok && r.data) setStatus(r.data);
  },[]);

  useEffect(()=>{ load(); },[load]);

  async function toggle(key: string) {
    if (!isSA) return;
    const newVal = status[key] === 'online' ? 'maintenance' : 'online';
    setStatus(p=>({...p,[key]:newVal}));
    setLoad(true);
    const r = await fetchJson('/api/admin/app-status',{method:'POST',body:JSON.stringify({key,value:newVal})});
    setLoad(false);
    if (r.ok) setOk(`${APP_STATUS_LABELS[key]} → ${newVal.toUpperCase()}`); else load();
  }

  return (
    <div>
      {ok && <div className="msg-ok" style={{marginBottom:16}}>{ok}</div>}
      <div className="ap-section-title">STATUS APLIKASI</div>
      {!isSA && <div className="msg-err" style={{marginBottom:12}}>Hanya SUPER_ADMIN yang dapat mengubah status aplikasi.</div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
        {Object.entries(APP_STATUS_LABELS).map(([key,label])=>{
          const val = status[key] ?? 'online';
          const isOnline = val === 'online';
          return (
            <div key={key} className="ap-card" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#e0f7ff',marginBottom:4}}>{label}</div>
                <span className={`ap-badge ${isOnline?'badge-green':'badge-yellow'}`}>
                  {isOnline?'ONLINE':'MAINTENANCE'}
                </span>
              </div>
              {isSA && (
                <label className="ap-toggle" style={{cursor:loading?'wait':'pointer'}}>
                  <input type="checkbox" checked={isOnline} onChange={()=>toggle(key)}/>
                  <div className="ap-toggle-track"/>
                  <div className="ap-toggle-thumb"/>
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
