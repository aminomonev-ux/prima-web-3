'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabUserMgmt.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { RefreshCw, ChevronLeft, ChevronRight, X, Unlock, Undo2 } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import Tip from '@/components/ui/Tip';
import { MenuAccessModal } from './MenuAccessPanel';
import { ALL_ROLES, type UserRow } from './_shared';

// Hanya panel ini yang memakainya — SDL-L4: whitelist app_access key, cocok dengan
// `APP_CARDS.id` di menu-client.tsx.
const APP_ACCESS_LIST = [
  { id:'dashboard',          name:'Dashboard' },
  { id:'usulan_aset',        name:'Usulan Kebutuhan' },
  { id:'blud',               name:'BLUD' },
  { id:'perjanjian_kinerja', name:'Perjanjian Kinerja' },
  { id:'rencana_aksi',       name:'Renaksi & Kinerja' },
  { id:'new_econtrolling',   name:'E-Anggaran' },
  { id:'buku_besar_aset',    name:'Buku Besar Aset' },
  { id:'lkjip',              name:'LKJIP' },
  { id:'iki',                name:'IKI (Indikator Kinerja Individu)' },
];

export function TabUserMgmt({ isSA }: { isSA:boolean }) {
  const [users,        setUsers]   = useState<UserRow[]>([]);
  const [loading,      setLoad]    = useState(false);
  const [search,       setSearch]  = useState('');
  const [filterStatus, setFS]      = useState('');
  const [page,         setPage]    = useState(1);
  const [totalPages,   setTP]      = useState(1);
  const [ok,           setOk]      = useState('');
  const [err,          setErr]     = useState('');
  const [roleModal,    setRM]      = useState<UserRow|null>(null);
  const [newRole,      setNR]      = useState('');
  const [pwModal,      setPW]      = useState<UserRow|null>(null);
  const [newPw,        setNP]      = useState('');
  const [pwErr,        setPwErr]   = useState('');
  const [accessModal,  setAM]      = useState<UserRow|null>(null);
  const [menuModal,    setMenuModal] = useState<UserRow|null>(null);
  const [selAccess,    setSel]     = useState<string[]>([]);
  const [accessAll,    setAccAll]  = useState(true);
  const [accLoading,   setAccLoad] = useState(false);
  const [delModal,     setDM]      = useState<UserRow|null>(null);
  const [delLoading,   setDelLoad] = useState(false);
  // Quota stats untuk counter di dropdown role (migration 037)
  const [quotaStats,   setQS]      = useState<Record<string,{count:number;quota:number;full:boolean}>>({});
  // Tick per 30 detik untuk auto-hide tombol UNLOCK/REVOKE saat lock/probation lewat (React 19 purity).
  const [now,          setNow]     = useState(() => Date.now());
  // INTRANET (D10): form Tambah User — registrasi publik mati, SA buat akun di sini.
  const [createOpen,   setCO]      = useState(false);
  const [cuU, setCuU] = useState(''); const [cuN, setCuN] = useState('');
  const [cuE, setCuE] = useState(''); const [cuP, setCuP] = useState('');
  const [cuR, setCuR] = useState(''); const [cuErr, setCuErr] = useState(''); const [cuLd, setCuLd] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/admin/role-quota-stats');
        const j = await r.json() as { ok: boolean; data?: Array<{role:string;count:number;quota:number;full:boolean}> };
        if (j.ok && j.data) {
          const map: Record<string,{count:number;quota:number;full:boolean}> = {};
          for (const s of j.data) map[s.role] = { count: s.count, quota: s.quota, full: s.full };
          setQS(map);
        }
      } catch { /* silent */ }
    })();
  }, [roleModal?.id]); // refresh saat buka modal role berbeda

  const load = useCallback(async(pg=1)=>{
    setLoad(true);
    try {
      const p = new URLSearchParams({page:String(pg),limit:'20'});
      if (search) p.set('search',search);
      if (filterStatus) p.set('status',filterStatus);
      const r = await fetchJson<UserRow[]>(`/api/admin/users?${p}`);
      if (r.ok && r.data) {
        const pg2 = (r as { pagination?: { page: number; totalPages: number } }).pagination;
        setUsers(r.data);
        if (pg2) { setPage(pg2.page); setTP(pg2.totalPages); }
      }
    } finally { setLoad(false); }
  },[search,filterStatus]);

  useEffect(()=>{ load(1); },[load]);

  /** `app_access` kosong/null = akses semua modul (lihat /api/user/access). */
  function punyaBlud(u: UserRow) {
    return !u.app_access || u.app_access.length === 0 || u.app_access.includes('blud');
  }

  function openAccessModal(u: UserRow) {
    setAM(u);
    if (!u.app_access || u.app_access.length === 0) {
      setAccAll(true); setSel(APP_ACCESS_LIST.map(a=>a.id));
    } else {
      setAccAll(false); setSel(u.app_access);
    }
  }

  async function doAction(id:number, action:string, role?:string) {
    setOk(''); setErr('');
    const j = await fetchJson('/api/admin/users',{method:'PATCH',body:JSON.stringify({id,action,role})});
    if (j.ok) { setOk(j.message ?? ''); load(page); setRM(null); }
    else setErr(j.message);
  }

  async function doDelete() {
    if (!delModal) return;
    setDelLoad(true); setOk(''); setErr('');
    try {
      const j = await fetchJson(`/api/admin/users?id=${delModal.id}`, { method:'DELETE' });
      if (j.ok) { setOk(j.message ?? ''); setDM(null); load(page); }
      else setErr(j.message);
    } finally { setDelLoad(false); }
  }

  async function doCreate() {
    setCuErr('');
    if (cuU.trim().length < 3) { setCuErr('Username minimal 3 karakter'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cuE.trim())) { setCuErr('Format email tidak valid'); return; }
    if (cuP.length < 8) { setCuErr('Password minimal 8 karakter'); return; }
    if (!cuR) { setCuErr('Pilih role'); return; }
    setCuLd(true);
    try {
      const j = await fetchJson('/api/admin/users',{method:'POST',body:JSON.stringify({username:cuU.trim(),email:cuE.trim(),password:cuP,role:cuR,nama_lengkap:cuN.trim()||undefined})});
      if (j.ok) { setOk(j.message ?? 'Akun dibuat.'); setCO(false); setCuU('');setCuN('');setCuE('');setCuP('');setCuR(''); load(1); }
      else setCuErr(j.message);
    } finally { setCuLd(false); }
  }

  async function doResetPw() {
    if (!pwModal||!newPw) return;
    setPwErr('');
    const j = await fetchJson('/api/admin/users',{method:'PATCH',body:JSON.stringify({id:pwModal.id,action:'reset-password',password:newPw})});
    if (j.ok) { setOk(j.message ?? ''); setPW(null); setNP(''); }
    else setPwErr(j.message);
  }

  async function doSaveAccess() {
    if (!accessModal) return;
    setAccLoad(true);
    // "Semua app" simpan list eksplisit — guard server (isBludRole/isKinerjaRole/dll)
    // menafsirkan null = TANPA grant (default deny), bukan "semua"
    const payload = accessAll ? APP_ACCESS_LIST.map(a => a.id) : selAccess;
    const j = await fetchJson('/api/admin/users',{method:'PATCH',
      body:JSON.stringify({id:accessModal.id, action:'set-app-access', app_access:payload})});
    setAccLoad(false);
    if (j.ok) { setOk(j.message ?? ''); setAM(null); load(page); }
    else setErr(j.message);
  }

  function toggleApp(id:string) {
    setSel(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  }

  function statusBadge(s:string) {
    if (s==='AKTIF')    return <span className="ap-badge badge-green">AKTIF</span>;
    if (s==='NONAKTIF') return <span className="ap-badge badge-red">NONAKTIF</span>;
    if (s==='MENUNGGU') return <span className="ap-badge badge-yellow">MENUNGGU</span>;
    return <span className="ap-badge badge-gray">{s}</span>;
  }

  function accessSummary(u: UserRow) {
    if (u.role === 'SUPER_ADMIN') return <span style={{fontSize:10,color:'#5a8ea8'}}>Semua</span>;
    if (!u.app_access || u.app_access.length === 0)
      return <span style={{fontSize:10,color:'#5a8ea8'}}>Default role</span>;
    return <span style={{fontSize:10,color:'#ffcc00'}}>{u.app_access.length} app</span>;
  }

  return (
    <div>
      {ok  && <div className="msg-ok" style={{marginBottom:12}}>{ok}</div>}
      {err && <div className="msg-err" style={{marginBottom:12}}>{err}</div>}

      <div className="ap-row" style={{marginBottom:14}}>
        <input className="ap-input" style={{width:220}} placeholder="Cari username / nama / email..." value={search} onChange={e=>setSearch(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')load(1);}}/>
        <select className="ap-select" value={filterStatus} onChange={e=>{setFS(e.target.value);load(1);}}>
          <option value="">Semua Status</option>
          <option value="AKTIF">AKTIF</option>
          <option value="NONAKTIF">NONAKTIF</option>
          <option value="MENUNGGU">MENUNGGU</option>
        </select>
        <button className="ap-btn ap-btn-cyan" onClick={()=>load(1)} disabled={loading}><RefreshCw size={12}/> CARI</button>
        {isSA && <button className="ap-btn ap-btn-green" onClick={()=>{setCO(true);setCuErr('');}} style={{marginLeft:'auto'}}>+ TAMBAH USER</button>}
      </div>

      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead><tr>
            <th>USERNAME</th><th>NAMA</th><th>ROLE</th><th>STATUS</th><th>AKSES APP</th><th>AKSI</th>
          </tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>LOADING...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} style={{textAlign:'center',padding:24,color:'#5a8ea8'}}>Tidak ada data</td></tr>
            ) : users.map(u=>(
              <tr key={u.id}>
                <td style={{fontWeight:700,color:'#e0f7ff'}}>{u.username}<br/><span style={{fontSize:10,color:'#5a8ea8',fontWeight:400}}>{u.nama_lengkap??''}</span></td>
                <td style={{fontSize:11,color:'#5a8ea8'}}>{u.email}</td>
                <td><span className="ap-badge badge-cyan">{u.role}</span></td>
                <td>{statusBadge(u.status)}</td>
                <td style={{textAlign:'center'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    {accessSummary(u)}
                    {u.role !== 'SUPER_ADMIN' && (
                      <button className="ap-btn ap-btn-cyan" style={{padding:'2px 8px',fontSize:9}} onClick={()=>openAccessModal(u)}>
                        ATUR
                      </button>
                    )}
                    {/* Akses per-menu hanya berarti bagi yang memang bisa masuk modulnya. */}
                    {u.role !== 'SUPER_ADMIN' && punyaBlud(u) && (
                      <button className="ap-btn ap-btn-cyan" style={{padding:'2px 8px',fontSize:9}} onClick={()=>setMenuModal(u)}>
                        MENU
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    {u.status==='AKTIF'  && <button className="ap-btn ap-btn-red"   style={{padding:'3px 8px',fontSize:10}} onClick={()=>doAction(u.id,'nonaktif')}>NONAKTIF</button>}
                    {u.status!=='AKTIF'  && <button className="ap-btn ap-btn-green" style={{padding:'3px 8px',fontSize:10}} onClick={()=>doAction(u.id,'aktifkan')}>AKTIFKAN</button>}
                    {isSA && <button className="ap-btn ap-btn-cyan" style={{padding:'3px 8px',fontSize:10}} onClick={()=>{setRM(u);setNR(u.role);}}>ROLE</button>}
                    {isSA && <button className="ap-btn ap-btn-cyan" style={{padding:'3px 8px',fontSize:10}} onClick={()=>{setPW(u);setNP('');setPwErr('');}}>PW</button>}
                    {isSA && u.promotion_locked_until && new Date(u.promotion_locked_until).getTime() > now && (
                      <Tip label="Reset lock 24 jam promotion"><button
                        className="ap-btn ap-btn-cyan"
                        style={{padding:'3px 8px',fontSize:10}}
                        onClick={async()=>{
                          if(!(await confirmDialog({ title: 'Reset Lock Promotion', message: `Reset lock promotion ${u.username}?`, confirmLabel: 'Reset', variant: 'warning' }))) return;
                          const r=await fetch(`/api/admin/users/${u.id}/unlock-promotion`,{method:'POST'});
                          const j=await r.json(); toast(j.message ?? 'OK');
                          if(j.ok) location.reload();
                        }}
                      ><Unlock size={10} style={{display:'inline',marginRight:3}}/>UNLOCK</button></Tip>
                    )}
                    {isSA && u.probationary_until && new Date(u.probationary_until).getTime() > now && (
                      <Tip label={`Probation aktif (rollback ke ${u.probationary_from_role ?? '?'})`}><button
                        className="ap-btn ap-btn-red"
                        style={{padding:'3px 8px',fontSize:10}}
                        onClick={async()=>{
                          if(!(await confirmDialog({ title: 'Revoke Probation', message: `Revoke probation ${u.username}? Role akan kembali ke ${u.probationary_from_role}.`, confirmLabel: 'Revoke', variant: 'danger' }))) return;
                          const r=await fetch(`/api/admin/users/${u.id}/revoke-probation`,{method:'POST'});
                          const j=await r.json(); toast(j.message ?? 'OK');
                          if(j.ok) location.reload();
                        }}
                      ><Undo2 size={10} style={{display:'inline',marginRight:3}}/>REVOKE</button></Tip>
                    )}
                    {isSA && u.role !== 'SUPER_ADMIN' && <button className="ap-btn ap-btn-red" style={{padding:'3px 8px',fontSize:10}} onClick={()=>setDM(u)}>HAPUS</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:12}}>
          <button className="ap-btn ap-btn-cyan" disabled={page<=1} onClick={()=>load(page-1)}><ChevronLeft size={12}/></button>
          <span style={{fontSize:11,color:'#5a8ea8',alignSelf:'center'}}>Hal {page}/{totalPages}</span>
          <button className="ap-btn ap-btn-cyan" disabled={page>=totalPages} onClick={()=>load(page+1)}><ChevronRight size={12}/></button>
        </div>
      )}

      {menuModal && (
        <MenuAccessModal
          userId={menuModal.id}
          username={menuModal.username}
          onClose={()=>setMenuModal(null)}
        />
      )}

      {/* Modal: Atur Akses Aplikasi */}
      {accessModal && (
        <div className="ap-modal-bg" onClick={e=>{if(e.target===e.currentTarget)setAM(null);}}>
          <div className="ap-modal-box" style={{maxWidth:480}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <div className="ap-modal-title">AKSES APLIKASI</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setAM(null)}><X size={18}/></button>
            </div>
            <div style={{fontSize:11,color:'#5a8ea8',marginBottom:16}}>
              User: <span style={{color:'#00d4ff',fontWeight:700}}>{accessModal.username}</span>
            </div>

            <div style={{padding:'10px 14px',background:'rgba(0,212,255,.05)',border:'1px solid rgba(0,212,255,.15)',borderRadius:8,marginBottom:14}}>
              <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13,fontWeight:700,color:'#00ffc8'}}>
                <input type="checkbox" checked={accessAll} onChange={e=>{setAccAll(e.target.checked); if(e.target.checked) setSel(APP_ACCESS_LIST.map(a=>a.id));}}
                  style={{width:15,height:15,accentColor:'#00ffc8'}}/>
                Akses Semua Aplikasi (default)
              </label>
              <div style={{fontSize:10,color:'#5a8ea8',marginTop:4,marginLeft:25}}>Centang ini jika tidak ada pembatasan khusus</div>
            </div>

            {!accessAll && (
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,color:'#5a8ea8',letterSpacing:1,marginBottom:8}}>PILIH APLIKASI YANG DAPAT DIAKSES:</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {APP_ACCESS_LIST.map(app=>(
                    <label key={app.id} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',
                      padding:'8px 12px',borderRadius:6,
                      background:selAccess.includes(app.id)?'rgba(0,212,255,.08)':'rgba(0,212,255,.02)',
                      border:`1px solid ${selAccess.includes(app.id)?'rgba(0,212,255,.3)':'rgba(0,212,255,.1)'}`,
                      transition:'all .15s',fontSize:12,color:selAccess.includes(app.id)?'#e0f7ff':'#5a8ea8'}}>
                      <input type="checkbox" checked={selAccess.includes(app.id)} onChange={()=>toggleApp(app.id)}
                        style={{width:13,height:13,accentColor:'#00d4ff',flexShrink:0}}/>
                      {app.name}
                    </label>
                  ))}
                </div>
                {selAccess.length === 0 && (
                  <div style={{fontSize:10,color:'#ff4466',marginTop:8}}>⚠ Pilih minimal 1 aplikasi</div>
                )}
              </div>
            )}

            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setAM(null)}>Batal</button>
              <button className="ap-btn ap-btn-green" onClick={doSaveAccess}
                disabled={accLoading||(!accessAll&&selAccess.length===0)}>
                {accLoading?'Menyimpan...':'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ubah Role */}
      {/* Modal: Tambah User (INTRANET D10) */}
      {createOpen && (
        <div className="ap-modal-bg" onClick={e=>{if(e.target===e.currentTarget)setCO(false);}}>
          <div className="ap-modal-box">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="ap-modal-title">TAMBAH USER</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setCO(false)}><X size={18}/></button>
            </div>
            {cuErr && <div className="msg-err" style={{marginBottom:10}}>{cuErr}</div>}
            <input className="ap-input" placeholder="Username (min 3 — huruf/angka/_-.)" value={cuU} onChange={e=>setCuU(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <input className="ap-input" placeholder="Nama lengkap (opsional)" value={cuN} onChange={e=>setCuN(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <input className="ap-input" type="email" placeholder="Email" value={cuE} onChange={e=>setCuE(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <input className="ap-input" type="password" placeholder="Password (min 8, A-Z, a-z, 0-9)" value={cuP} onChange={e=>setCuP(e.target.value)} style={{marginBottom:10,width:'100%'}}/>
            <select className="ap-select" value={cuR} onChange={e=>setCuR(e.target.value)} style={{width:'100%',marginBottom:12}}>
              <option value="">-- Pilih Role --</option>
              {ALL_ROLES.filter(r=>r!=='SUPER_ADMIN').map(r=>{
                const q = quotaStats[r];
                const suffix = q && q.quota > 0 ? ` (${q.count}/${q.quota})` : '';
                const disabled = q?.full === true;
                return <option key={r} value={r} disabled={disabled}>{r}{suffix}{disabled?' — penuh':''}</option>;
              })}
            </select>
            <div style={{fontSize:10,color:'#5a8ea8',marginBottom:14}}>Akun dibuat langsung AKTIF (edisi intranet — tanpa verifikasi email).</div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setCO(false)} disabled={cuLd}>Batal</button>
              <button className="ap-btn ap-btn-green" onClick={doCreate} disabled={cuLd}>{cuLd?'Menyimpan...':'Buat Akun'}</button>
            </div>
          </div>
        </div>
      )}

      {roleModal && (
        <div className="ap-modal-bg" onClick={e=>{if(e.target===e.currentTarget)setRM(null);}}>
          <div className="ap-modal-box">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="ap-modal-title">UBAH ROLE — {roleModal.username}</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setRM(null)}><X size={18}/></button>
            </div>
            <select className="ap-select" style={{width:'100%',marginBottom:14}} value={newRole} onChange={e=>setNR(e.target.value)}>
              {ALL_ROLES.filter(r=>r!=='SUPER_ADMIN').map(r=>{
                const q = quotaStats[r];
                const isCurrent = r === roleModal.role;
                const suffix = q && q.quota > 0 ? ` (${q.count}/${q.quota})` : '';
                const disabled = q?.full === true && !isCurrent; // tidak disable role saat ini
                return (
                  <option key={r} value={r} disabled={disabled}>
                    {r}{suffix}{disabled ? ' — penuh' : ''}
                  </option>
                );
              })}
            </select>

            {/* Perkecualian akses menu diberikan dalam konteks jabatan tertentu.
                Ikut terhapus saat perannya berubah — disampaikan SEBELUM disetujui,
                bukan diberitahukan sesudah terjadi. */}
            {!!roleModal.menu_exceptions && newRole !== roleModal.role && (
              <div style={{padding:'10px 12px',marginBottom:14,borderRadius:6,fontSize:11,lineHeight:1.7,
                background:'rgba(255,153,68,.06)',border:'1px solid rgba(255,153,68,.25)',color:'#ffb066'}}>
                <b>{roleModal.username}</b> sekarang punya <b>{roleModal.menu_exceptions} pengaturan menu khusus</b> yang
                dibuat waktu dia masih {roleModal.role}. Begitu rolenya diganti, pengaturan itu ikut
                terhapus. Kalau di jabatan barunya masih dibutuhkan, atur lagi lewat tombol MENU.
              </div>
            )}

            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setRM(null)}>Batal</button>
              <button className="ap-btn ap-btn-green" onClick={()=>doAction(roleModal.id,'ubah-role',newRole)}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {pwModal && (
        <div className="ap-modal-bg" onClick={e=>{if(e.target===e.currentTarget){setPW(null);setNP('');}}}>
          <div className="ap-modal-box">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="ap-modal-title">RESET PASSWORD — {pwModal.username}</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>{setPW(null);setNP('');}}><X size={18}/></button>
            </div>
            {pwErr && <div className="msg-err">{pwErr}</div>}
            <input className="ap-input" type="password" placeholder="Password baru (min 8, A-Z, a-z, 0-9)..." value={newPw} onChange={e=>setNP(e.target.value)} style={{marginBottom:14}}/>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>{setPW(null);setNP('');}}>Batal</button>
              <button className="ap-btn ap-btn-red" onClick={doResetPw} disabled={!newPw}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Konfirmasi Hapus Akun */}
      {delModal && (
        <div className="ap-modal-bg" onClick={e=>{if(e.target===e.currentTarget)setDM(null);}}>
          <div className="ap-modal-box" style={{maxWidth:420}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div className="ap-modal-title" style={{color:'#ff6b6b'}}>⚠️ HAPUS AKUN</div>
              <button style={{background:'none',border:'none',color:'#5a8ea8',cursor:'pointer'}} onClick={()=>setDM(null)}><X size={18}/></button>
            </div>
            <p style={{fontSize:13,color:'#a0cfe0',marginBottom:8}}>
              Anda akan menghapus akun:
            </p>
            <div style={{background:'#0d1f2d',border:'1px solid #1e3a4a',borderRadius:6,padding:'10px 14px',marginBottom:16}}>
              <div style={{fontWeight:700,color:'#e0f7ff',fontSize:14}}>{delModal.username}</div>
              <div style={{fontSize:11,color:'#5a8ea8'}}>{delModal.email}</div>
              <div style={{fontSize:11,color:'#5a8ea8',marginTop:4}}>Role: <span style={{color:'#00ffc8'}}>{delModal.role}</span></div>
            </div>
            <p style={{fontSize:12,color:'#ff6b6b',marginBottom:16}}>
              Akun akan dihapus permanen. Semua sesi aktif user ini akan dihentikan. Slot kuota role akan dibebaskan.
            </p>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button className="ap-btn ap-btn-cyan" onClick={()=>setDM(null)} disabled={delLoading}>Batal</button>
              <button className="ap-btn ap-btn-red" onClick={doDelete} disabled={delLoading}>
                {delLoading ? 'Menghapus...' : 'Ya, Hapus Akun'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
