'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabAttackMonitor.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { type ChartSlot, type LogRow } from './_shared';

export const AM_FILTERS = [
  { id:'',             label:'SEMUA',   dot:'#5a8ea8' },
  { id:'BLOCKED',      label:'BLOCKED', dot:'#ff4466' },
  { id:'FAILED',       label:'FAILED',  dot:'#ffcc00' },
  { id:'LOGIN',        label:'LOGIN',   dot:'#00ffc8' },
  { id:'LOGOUT',       label:'LOGOUT',  dot:'#5a8ea8' },
  { id:'WARN',         label:'WARN',    dot:'#f59e0b' },
];



export function amDot(ev: string): string {
  if (ev === 'LOGIN_SUCCESS') return '#00ffc8';
  if (ev === 'LOGOUT')        return '#5a8ea8';
  if (ev.includes('BLOCKED') || ev.includes('LOCKED')) return '#ff4466';
  if (ev.includes('FAILED'))  return '#ffcc00';
  return '#00d4ff';
}

export function amMatchFilter(ev: string, f: string): boolean {
  if (!f) return true;
  if (f === 'BLOCKED') return ev.includes('BLOCKED') || ev.includes('LOCKED');
  if (f === 'FAILED')  return ev.includes('FAILED');
  if (f === 'LOGIN')   return ev === 'LOGIN_SUCCESS';
  if (f === 'LOGOUT')  return ev === 'LOGOUT';
  if (f === 'WARN')    return !['LOGIN_SUCCESS','LOGIN_FAILED','LOGIN_BLOCKED','ACCOUNT_LOCKED','LOGOUT'].includes(ev);
  return true;
}

export function TabAttackMonitor() {
  const [chart,   setChart]   = useState<ChartSlot[]>([]);
  const [totals,  setTotals]  = useState<Record<string,number>>({});
  const [logs,    setLogs]    = useState<LogRow[]>([]);
  const [loading, setLoad]    = useState(false);
  const [filter,  setFilter]  = useState('');

  const load = useCallback(async()=>{
    setLoad(true);
    try {
      const r = await fetchJson('/api/admin/attack-monitor');
      if (r.ok) {
        const a = r as { chart?: ChartSlot[]; totals?: Record<string,number>; logs?: LogRow[] };
        setChart(a.chart ?? []); setTotals(a.totals ?? {}); setLogs(a.logs ?? []);
      }
    } finally { setLoad(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  const maxVal     = Math.max(...chart.flatMap(s=>[s.login,s.failed,s.blocked]), 1);
  const filtered   = logs.filter(l=>amMatchFilter(l.event_type, filter));

  const STATS = [
    { label:'BRUTE FORCE',   val:totals.total_locked??0,  color:'red',    sub:'Akun dikunci' },
    { label:'LOGIN GAGAL',   val:totals.total_failed??0,  color:'yellow', sub:'Password salah' },
    { label:'LOGIN SUKSES',  val:totals.total_login??0,   color:'green',  sub:'Berhasil masuk' },
    { label:'WARNING',       val:totals.total_warn??0,    color:'cyan',   sub:'Event lain' },
    { label:'TOTAL LOG',     val:totals.total_all??0,     color:'cyan',   sub:'24 jam terakhir' },
  ];

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div className="ap-section-title" style={{margin:0}}>ATTACK MONITOR</div>
        <button className="ap-btn ap-btn-cyan" onClick={load} disabled={loading}><RefreshCw size={12}/> REFRESH</button>
      </div>

      <div className="ap-grid5" style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:20}}>
        {STATS.map(({label,val,color,sub})=>(
          <div key={label} className="ap-kpi">
            <div className="ap-kpi-label">{label}</div>
            <div className={`ap-kpi-value ${color}`}>{val}</div>
            <div className="ap-kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="ap-card" style={{marginBottom:16}}>
        <div className="ap-card-title">AKTIVITAS LOGIN PER JAM — 12 JAM TERAKHIR</div>
        {loading ? (
          <div style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</div>
        ) : chart.length === 0 ? (
          <div style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Belum ada data</div>
        ) : (
          <>
            <div style={{display:'flex',gap:14,marginBottom:10}}>
              {[['#00ffc8','LOGIN SUCCESS'],['#ff4466','LOGIN FAILED'],['#ffcc00','BLOCKED']].map(([c,l])=>(
                <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'#5a8ea8'}}>
                  <div style={{width:10,height:10,background:c,borderRadius:2}}/>
                  {l}
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:3,alignItems:'flex-end',height:110,padding:'0 2px'}}>
              {chart.map((slot,i)=>(
                <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                  <div style={{display:'flex',gap:1,alignItems:'flex-end',width:'100%',height:90}}>
                    {[{v:slot.login,c:'#00ffc8'},{v:slot.failed,c:'#ff4466'},{v:slot.blocked,c:'#ffcc00'}].map((b,bi)=>(
                      <div key={bi} style={{flex:1,height:`${(b.v/maxVal)*86+2}px`,background:b.c,borderRadius:'2px 2px 0 0',minHeight:2,opacity:.85}}/>
                    ))}
                  </div>
                  <div style={{fontSize:8,color:'#5a8ea8',whiteSpace:'nowrap'}}>{slot.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        {AM_FILTERS.map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)}
            style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:5,
              border:`1px solid ${filter===f.id?f.dot:'rgba(90,142,168,.3)'}`,
              background:filter===f.id?`rgba(${f.dot==='#00ffc8'?'0,255,200':f.dot==='#ff4466'?'255,68,102':f.dot==='#ffcc00'?'255,204,0':f.dot==='#00d4ff'?'0,212,255':'90,142,168'},.1)`:'transparent',
              color:filter===f.id?f.dot:'#5a8ea8',cursor:'pointer',fontSize:10,fontWeight:700,
              letterSpacing:.8,fontFamily:"var(--font-jakarta),sans-serif",transition:'all .15s'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:f.dot,display:'inline-block',flexShrink:0}}/>
            {f.label}
          </button>
        ))}
        <span style={{fontSize:10,color:'#5a8ea8',alignSelf:'center',marginLeft:4}}>
          {filtered.length} entri
        </span>
      </div>

      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr>
            <th>WAKTU</th><th>USERNAME</th><th>STATUS</th><th>IP</th><th>DETAIL</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada log</td></tr>
            ) : filtered.map(row=>(
              <tr key={row.id}>
                <td className="mono" style={{fontSize:11,color:'#5a8ea8',whiteSpace:'nowrap'}}>{row.created_at}</td>
                <td style={{fontWeight:700,color:'#e0f7ff'}}>{row.username??'-'}</td>
                <td>
                  <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,
                    color:amDot(row.event_type),fontFamily:"var(--font-jakarta),sans-serif"}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:amDot(row.event_type),
                      display:'inline-block',flexShrink:0,
                      boxShadow:row.event_type==='LOGIN_SUCCESS'?`0 0 6px ${amDot(row.event_type)}`:'none'}}/>
                    {row.event_type}
                  </span>
                </td>
                <td className="mono" style={{fontSize:11,color:'#5a8ea8'}}>{row.ip_address??'-'}</td>
                <td style={{fontSize:11,color:'#a0cfe0',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.detail??'-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
