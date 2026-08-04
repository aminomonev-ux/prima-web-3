'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabSecurityStatus.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { APP_STATUS_LABELS, type AppStatus } from './_shared';

export const SEC_CHECKS = [
  { label:'Cloudflare Turnstile', ok:true,  val:'Widget (CF)' },
  { label:'Brute-force Lock',     ok:true,  val:'5x → 15 menit' },
  { label:'Rate Limit Login',     ok:true,  val:'10 req/60s' },
  { label:'Rate Limit Register',  ok:true,  val:'3 req/300s' },
  { label:'Password Policy',      ok:true,  val:'Min 8 + A-Z+0-9' },
  { label:'Bcrypt Hash',          ok:true,  val:'Cost 12' },
  { label:'JWT HS256',            ok:true,  val:'Cookie HTTP-Only' },
  { label:'Session Timeout',      ok:true,  val:'60 menit idle' },
  { label:'Session Tracking',     ok:true,  val:'DB + invalidate' },
  { label:'CSP Headers',          ok:true,  val:'CF + self only' },
  { label:'Audit Log',            ok:true,  val:'Semua event' },
  { label:'Rate Limit Reset PW',  ok:true,  val:'3 req/10 menit' },
  { label:'HTTPS / HSTS',         ok:true,  val:'max-age=63072000' },
];

export function TabSecurityStatus() {
  const [stats,  setStats]  = useState<{users:Record<string,number>;sessions:Record<string,number>}|null>(null);
  const [appSt,  setAppSt]  = useState<AppStatus>({});
  const [loading,setLoad]   = useState(false);

  const load = useCallback(async()=>{
    setLoad(true);
    try {
      const [ss,as] = await Promise.all([
        fetchJson('/api/admin/system-status'),
        fetchJson<AppStatus>('/api/admin/app-status'),
      ]);
      if (ss.ok) {
        const s = ss as { users?: Record<string,number>; sessions?: Record<string,number> };
        if (s.users && s.sessions) setStats({ users: s.users, sessions: s.sessions });
      }
      if (as.ok && as.data) setAppSt(as.data);
    } finally { setLoad(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const onlineCount  = Object.values(appSt).filter(v=>v==='online').length;
  const totalApps    = Object.keys(APP_STATUS_LABELS).length;
  const passedChecks = SEC_CHECKS.filter(c=>c.ok).length;
  const secLevel     = passedChecks === SEC_CHECKS.length ? 'AMAN' : passedChecks >= SEC_CHECKS.length*0.8 ? 'WASPADA' : 'BAHAYA';
  const secColor     = secLevel==='AMAN' ? '#00ffc8' : secLevel==='WASPADA' ? '#ffcc00' : '#ff4466';

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className="ap-section-title" style={{margin:0}}>SECURITY STATUS OVERVIEW</div>
        <button className="ap-btn ap-btn-cyan" onClick={load} disabled={loading}><RefreshCw size={12}/> REFRESH</button>
      </div>

      {/* Security Level Banner */}
      <div style={{background:`rgba(${secColor==='#00ffc8'?'0,255,200':secColor==='#ffcc00'?'255,204,0':'255,68,102'},.06)`,
        border:`1px solid ${secColor}40`,borderRadius:10,padding:'16px 24px',marginBottom:16,
        display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{width:56,height:56,borderRadius:'50%',border:`3px solid ${secColor}`,
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            background:`${secColor}12`,boxShadow:`0 0 20px ${secColor}40`}}>
            <Shield size={22} color={secColor}/>
          </div>
          <div>
            <div style={{fontSize:11,color:'#5a8ea8',letterSpacing:2,marginBottom:2}}>SECURITY LEVEL</div>
            <div style={{fontSize:22,fontWeight:800,color:secColor,letterSpacing:3,fontFamily:"var(--font-jakarta),sans-serif"}}>{secLevel}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:24,flexWrap:'wrap'}}>
          {[['CHECKS PASSED',`${passedChecks}/${SEC_CHECKS.length}`,'#00ffc8'],
            ['USER AKTIF',stats?.users?.aktif??'-','#00d4ff'],
            ['SESI AKTIF',stats?.sessions?.aktif??'-','#00d4ff'],
            ['APP ONLINE',`${onlineCount}/${totalApps}`,'#00ffc8'],
          ].map(([l,v,c])=>(
            <div key={l as string} style={{textAlign:'center'}}>
              <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:1.5,marginBottom:3}}>{l as string}</div>
              <div style={{fontSize:20,fontWeight:400,color:c as string,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
        {/* Security Checklist */}
        <div className="ap-card" style={{gridColumn:'span 2'}}>
          <div className="ap-card-title">SECURITY CHECKLIST</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 16px'}}>
            {SEC_CHECKS.map(({label,ok,val})=>(
              <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'7px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{width:16,height:16,borderRadius:4,background:ok?'rgba(0,255,200,.15)':'rgba(255,68,102,.15)',
                    border:`1px solid ${ok?'rgba(0,255,200,.4)':'rgba(255,68,102,.4)'}`,
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,
                    color:ok?'#00ffc8':'#ff4466',flexShrink:0,fontWeight:700}}>
                    {ok?'✓':'✗'}
                  </span>
                  <span style={{fontSize:11,color:'#a0cfe0'}}>{label}</span>
                </div>
                <span style={{fontSize:10,color:'#5a8ea8',fontFamily:"'JetBrains Mono',monospace"}}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="ap-card">
            <div className="ap-card-title">STATUS APLIKASI</div>
            {Object.entries(APP_STATUS_LABELS).map(([key,label])=>(
              <div key={key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                <span style={{fontSize:11,color:'#a0cfe0'}}>{label}</span>
                <span className={`ap-badge ${appSt[key]==='online'||!appSt[key]?'badge-green':'badge-yellow'}`} style={{fontSize:9}}>
                  {(appSt[key]??'ONLINE').toUpperCase()}
                </span>
              </div>
            ))}
          </div>
          <div className="ap-card">
            <div className="ap-card-title">SESSION STATS</div>
            {[['Total',stats?.sessions?.total??'-','cyan'],['Aktif',stats?.sessions?.aktif??'-','green'],
              ['Idle >30m',stats?.sessions?.idle??'-','yellow'],['Terkunci',stats?.users?.locked??'-','red'],
              ['Menunggu',stats?.users?.menunggu??'-','yellow'],
            ].map(([k,v,c])=>(
              <div key={k as string} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid rgba(0,212,255,.05)',fontSize:11}}>
                <span style={{color:'#5a8ea8'}}>{k as string}</span>
                <span className={c as string} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v as string}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

