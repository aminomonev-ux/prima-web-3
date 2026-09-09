'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabSessions.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, X } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteButton from '@/components/ui/DeleteButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
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

  // Memutus sesi orang lain sebelumnya terjadi pada SATU klik, tanpa ditanya apa pun —
  // dan barisnya berdempetan di tabel yang bisa digulir cepat. `confirmDialog` di sini
  // bukan gesekan kosong: yang ditanyakan menyebut NAMA orangnya, jadi salah baris
  // ketahuan sebelum terjadi, bukan sesudah.
  async function forceLogout(sid: string, username: string) {
    const ya = await confirmDialog({
      title: `Putuskan sesi ${username}?`,
      message: 'Ia akan diminta masuk lagi pada permintaan berikutnya. Akun & perannya tidak berubah.',
      confirmLabel: 'Putuskan sesi',
    });
    if (!ya) return;
    const j = await fetchJson(`/api/admin/sessions/${sid}`, { method:'DELETE' });
    if (j.ok) { toast.success(`Sesi ${username} dihentikan.`); load(); } else toast.error(j.message);
  }

  async function doEmergency() {
    setEmErr(''); setEmLoad(true);
    try {
      const j = await fetchJson('/api/admin/sessions', { method:'DELETE', body:JSON.stringify({password:emPw}) });
      if (j.ok) {
        const deleted = (j as { deleted?: number }).deleted ?? 0;
        toast.success(`Emergency logout: ${deleted} sesi dihapus.`); setEmModal(false); setEmPw(''); load();
      }
      else setEmErr(j.message);
    } finally { setEmLoad(false); }
  }

  const s = stats?.sessions;
  return (
    <div>
      <div className="ap-grid4" style={{marginBottom:16}}>
        {[
          {label:'USER STATUS',  rows:[['Total User',stats?.users?.total??'-','cyan'],['Aktif',stats?.users?.aktif??'-','green'],['Blocked',stats?.users?.locked??'-','red'],['Menunggu',stats?.users?.menunggu??'-','yellow']]},
          {label:'SESSION STATUS',rows:[['Total Row',s?.total??'-','cyan'],['Aktif',s?.aktif??'-','green'],['Idle >30m',s?.idle??'-','yellow'],['Expired',s?.expired??'-','red']]},
        ].map((c,i)=>(
          <div key={i} className="ap-card">
            <div className="ap-card-title">{c.label}</div>
            {c.rows.map(([k,v,cl])=>(
              <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--ap-line-tipis)',fontSize:12}}>
                <span style={{color:'var(--ap-dim)'}}>{k}</span>
                <span className={cl as string} style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="ap-card">
          <div className="ap-card-title">SYSTEM INFO</div>
          {[['Session Inactive',`60 menit`,'cyan'],['Keepalive Interval','25 menit','cyan'],['Password Min','8 char + A-Z+0-9','green']].map(([k,v,cl])=>(
            <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--ap-line-tipis)',fontSize:12}}>
              <span style={{color:'var(--ap-dim)'}}>{k}</span>
              <span className={cl as string} style={{fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{v as string}</span>
            </div>
          ))}
        </div>
        <div className="ap-card" style={{display:'flex',flexDirection:'column',justifyContent:'space-between'}}>
          <div className="ap-card-title">QUICK STATS</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[['TOTAL',s?.total??0,'cyan'],['AKTIF',s?.aktif??0,'green'],['IDLE',s?.idle??0,'yellow'],['UNIK',s?.unik??0,'cyan']].map(([l,v,c])=>(
              <div key={l as string} style={{textAlign:'center',padding:8,background:'var(--ap-aksen-bg)',borderRadius:6,border:'1px solid var(--ap-line-tipis)'}}>
                <div style={{fontSize:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}} className={c as string}>{v as number}</div>
                <div style={{fontSize:9,color:'var(--ap-dim)',letterSpacing:1}}>{l as string}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,gap:10,flexWrap:'wrap'}}>
        <div className="ap-section-title" style={{margin:0}}>DAFTAR SESI AKTIF</div>
        <div className="ap-row">
          <input className="ap-input" style={{width:220}} placeholder="Cari username atau IP..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={12}/>} onClick={load} disabled={loading}>REFRESH</PrimaButton>
          {isSA && (
            <PrimaButton variant="danger" size="sm" iconLeft={<AlertTriangle size={12}/>}
              onClick={()=>{setEmModal(true);setEmErr('');}}>EMERGENCY LOGOUT</PrimaButton>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,color:'var(--ap-dim)',letterSpacing:2}}>LOADING...</div>
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
                <tr><td colSpan={8} style={{textAlign:'center',padding:24,color:'var(--ap-dim)'}}>Tidak ada sesi aktif</td></tr>
              ) : filtered.map(r => {
                const isSelf  = r.session_id === selfSessionId;
                const idleSec = r.idle_seconds;
                const isIdle  = idleSec > 1800;
                return (
                  <tr key={r.session_id}>
                    <td style={{fontWeight:700,color:isSelf?'var(--ap-ok-fg)':'var(--ap-fg)'}}>{r.username}{isSelf&&<span style={{fontSize:9,marginLeft:4,color:'var(--ap-dim)'}}>(ANDA)</span>}</td>
                    <td><span className="ap-badge badge-cyan">{r.role}</span></td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{r.ip_address??'-'}</td>
                    <td style={{fontSize:11,color:'var(--ap-dim)'}}>{fmtTs(r.created_at)}</td>
                    <td style={{fontSize:11,color:'var(--ap-dim)'}}>{fmtTs(r.last_active)}</td>
                    <td className={isIdle?'yellow':'green'} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{fmtIdle(idleSec)}</td>
                    <td><span className={`ap-badge ${isIdle?'badge-yellow':'badge-green'}`}><span className={isIdle?'dot-idle':'dot-active'}/>{isIdle?'IDLE':'AKTIF'}</span></td>
                    <td>
                      {!isSelf ? (
                        <DeleteButton
                          onClick={()=>{ void forceLogout(r.session_id, r.username); }}
                          data-tooltip={`Putuskan sesi ${r.username}`}
                          aria-label={`Putuskan sesi ${r.username}`}
                        />
                      ) : (
                        <span style={{fontSize:10,color:'var(--ap-dim)',fontStyle:'italic'}}>Sesi Anda</span>
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
              <div className="ap-modal-title" style={{color:'var(--ap-bad-fg)'}}><AlertTriangle size={16}/> EMERGENCY LOGOUT</div>
              <button style={{background:'none',border:'none',color:'var(--ap-dim)',cursor:'pointer'}} onClick={()=>{setEmModal(false);setEmPw('');}}><X size={18}/></button>
            </div>
            <p style={{fontSize:12,color:'var(--ap-fg2)',marginBottom:16,lineHeight:1.6}}>
              Aksi ini akan <span style={{color:'var(--ap-bad-fg)',fontWeight:700}}>menghapus semua sesi aktif</span> kecuali sesi Anda. Konfirmasi dengan password Anda.
            </p>
            {/* Tetap sebaris, bukan toast: modalnya tidak tertutup saat gagal, dan
                alasannya harus terbaca tepat di atas kotak kata sandi yang salah. */}
            {emErr && <div className="ap-sk-ingat">{emErr}</div>}
            <input className="ap-input" type="password" placeholder="Password Anda..." value={emPw} onChange={e=>setEmPw(e.target.value)} style={{marginBottom:14}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <PrimaButton variant="ghost" size="sm" onClick={()=>{setEmModal(false);setEmPw('');}}>Batal</PrimaButton>
              <PrimaButton variant="danger" size="sm" iconLeft={<AlertTriangle size={11}/>}
                onClick={doEmergency} disabled={emLoading||!emPw}>
                {emLoading ? 'Proses...' : 'KONFIRMASI'}
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
