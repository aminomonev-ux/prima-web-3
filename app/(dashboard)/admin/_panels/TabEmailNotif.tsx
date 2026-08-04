'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabEmailNotif.tsx
// Dipecah dari admin-client.tsx — isinya tidak diubah, cuma dipindah.
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Mail } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';

interface EmailQuota { sentToday:number; sentMonth:number; dailyLimit:number; monthlyLimit:number; provider:string; plan:string; }

function QuotaBar({used,limit,color}:{used:number;limit:number;color:string}) {
  const pct = Math.min((used/limit)*100, 100);
  const dangerColor = pct > 80 ? '#ff4466' : pct > 60 ? '#ffcc00' : color;
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#5a8ea8',marginBottom:4}}>
        <span style={{color:dangerColor,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{used} terkirim</span>
        <span>{limit - used} sisa dari {limit}</span>
      </div>
      <div style={{height:6,borderRadius:3,background:'rgba(0,212,255,.08)',overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,borderRadius:3,
          background:`linear-gradient(90deg,${color},${dangerColor})`,
          transition:'width .5s ease',boxShadow:`0 0 6px ${dangerColor}60`}}/>
      </div>
    </div>
  );
}

interface EmailLogRow {
  id: number; sent_at: string; recipient: string; subject: string;
  event_type: string; status: string; error_msg: string | null;
}

export function TabEmailNotif({ isSA }: { isSA:boolean }) {
  const [settings, setSettings] = useState({
    enabled:false, onUsulanBaru:false, onDisetujui:false, onDitolak:false, onRevisi:false,
    onPromotionNew:false, onPromotionApproved:false, onPromotionRejected:false, onPromotionBootstrap:false,
    recipientAdmin:'',
  });
  const [quota,    setQuota]    = useState<EmailQuota|null>(null);
  const [logRows,  setLogRows]  = useState<EmailLogRow[]>([]);
  const [errTip,   setErrTip]   = useState<{top:number;left:number;text:string}|null>(null);
  const [loading,  setLoad]     = useState(false);
  const [ok,       setOk]       = useState('');
  const [err,      setErr]      = useState('');

  const loadAll = useCallback(async ()=>{
    const [cfg,q,lg] = await Promise.all([
      fetchJson('/api/config'),
      fetchJson('/api/admin/email-quota'),
      fetchJson('/api/admin/email-log?limit=20'),
    ]);
    if (cfg.ok) {
      const c = (cfg as { data?: Record<string,string> }).data;
      if (c) {
        setSettings({
          enabled:              c.email_notif_enabled==='true',
          onUsulanBaru:         c.email_notif_usulan_baru==='true',
          onDisetujui:          c.email_notif_disetujui==='true',
          onDitolak:            c.email_notif_ditolak==='true',
          onRevisi:             c.email_notif_revisi==='true',
          onPromotionNew:       c.email_notif_promotion_new_request==='true',
          onPromotionApproved:  c.email_notif_promotion_approved==='true',
          onPromotionRejected:  c.email_notif_promotion_rejected==='true',
          onPromotionBootstrap: c.email_notif_promotion_bootstrap==='true',
          recipientAdmin:       c.email_notif_recipient??'',
        });
      }
    }
    if (q.ok) setQuota(q as unknown as EmailQuota);
    if (lg.ok) setLogRows((lg as unknown as { rows: EmailLogRow[] }).rows ?? []);
  }, []);

  useEffect(()=>{ void loadAll(); },[loadAll]);

  useEffect(()=>{
    const t = setInterval(()=>{ void loadAll(); }, 30_000);
    return ()=>clearInterval(t);
  },[loadAll]);

  async function save() {
    if (!isSA) return;
    setLoad(true); setOk(''); setErr('');
    try {
      const entries = [
        ['email_notif_enabled',                 String(settings.enabled)],
        ['email_notif_usulan_baru',             String(settings.onUsulanBaru)],
        ['email_notif_disetujui',               String(settings.onDisetujui)],
        ['email_notif_ditolak',                 String(settings.onDitolak)],
        ['email_notif_revisi',                  String(settings.onRevisi)],
        ['email_notif_promotion_new_request',   String(settings.onPromotionNew)],
        ['email_notif_promotion_approved',      String(settings.onPromotionApproved)],
        ['email_notif_promotion_rejected',      String(settings.onPromotionRejected)],
        ['email_notif_promotion_bootstrap',     String(settings.onPromotionBootstrap)],
        ['email_notif_recipient',               settings.recipientAdmin],
      ];
      for (const [key,value] of entries) {
        const j = await fetchJson('/api/config',{method:'POST',body:JSON.stringify({key,value})});
        if (!j.ok) { setErr(j.message); return; }
      }
      setOk('Pengaturan email berhasil disimpan.');
    } finally { setLoad(false); }
  }

  const toggle = (k: keyof typeof settings, v: boolean) => setSettings(p=>({...p,[k]:v}));

  return (
    <div>
      <div className="ap-section-title">PENGATURAN EMAIL NOTIFIKASI</div>
      {!isSA && <div className="msg-err" style={{marginBottom:12}}>Hanya SUPER_ADMIN yang dapat mengubah pengaturan email.</div>}
      {ok  && <div className="msg-ok"  style={{marginBottom:12}}>{ok}</div>}
      {err && <div className="msg-err" style={{marginBottom:12}}>{err}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,alignItems:'start'}}>
        {/* Konfigurasi */}
        <div className="ap-card">
          <div className="ap-card-title">KONFIGURASI NOTIFIKASI</div>
          <div style={{marginBottom:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(0,212,255,.1)'}}>
              <span style={{fontSize:13,color:'#e0f7ff',fontWeight:700}}>Email Notifikasi Aktif</span>
              <label className="ap-toggle">
                <input type="checkbox" checked={settings.enabled} onChange={e=>toggle('enabled',e.target.checked)} disabled={!isSA}/>
                <div className="ap-toggle-track"/><div className="ap-toggle-thumb"/>
              </label>
            </div>
            {!settings.enabled && isSA && (
              <div style={{fontSize:12,fontWeight:600,color:'#FFE08A',letterSpacing:.2,marginTop:12,marginBottom:8,padding:'10px 14px',background:'rgba(186,117,23,.35)',border:'1px solid #FFC857',borderRadius:6,display:'flex',alignItems:'center',gap:10,boxShadow:'0 0 16px rgba(255,200,87,.15)'}}>
                <span style={{fontSize:16,color:'#FFC857'}}>⚠</span>
                <span>Aktifkan master toggle <b style={{color:'#FFF6D6'}}>Email Notifikasi Aktif</b> di atas untuk mengatur per-event.</span>
              </div>
            )}
            <div style={{opacity:!isSA||!settings.enabled?.4:1,transition:'opacity .2s',pointerEvents:!isSA||!settings.enabled?'none':'auto'}}>
              <div style={{fontSize:10,color:'#5a8ea8',letterSpacing:.5,marginTop:14,marginBottom:4}}>USULAN</div>
              {[['onUsulanBaru','Usulan Baru Masuk'],['onDisetujui','Usulan Disetujui'],['onDitolak','Usulan Ditolak'],['onRevisi','Usulan Direvisi']].map(([k,l])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                  <span style={{fontSize:12,color:'#a0cfe0'}}>{l}</span>
                  <label className="ap-toggle">
                    <input type="checkbox" checked={settings[k as keyof typeof settings] as boolean}
                      onChange={e=>toggle(k as keyof typeof settings,e.target.checked)} disabled={!isSA||!settings.enabled}/>
                    <div className="ap-toggle-track"/><div className="ap-toggle-thumb"/>
                  </label>
                </div>
              ))}
              <div style={{fontSize:10,color:'#5a8ea8',letterSpacing:.5,marginTop:14,marginBottom:4}}>PROMOTION ROLE</div>
              {[
                ['onPromotionNew',       'Permohonan Upgrade Baru'],
                ['onPromotionApproved',  'Upgrade di-Approve'],
                ['onPromotionRejected',  'Upgrade di-Reject'],
                ['onPromotionBootstrap', 'Bootstrap SUPER_ADMIN (alert)'],
              ].map(([k,l])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                  <span style={{fontSize:12,color:'#a0cfe0'}}>{l}</span>
                  <label className="ap-toggle">
                    <input type="checkbox" checked={settings[k as keyof typeof settings] as boolean}
                      onChange={e=>toggle(k as keyof typeof settings,e.target.checked)} disabled={!isSA||!settings.enabled}/>
                    <div className="ap-toggle-track"/><div className="ap-toggle-thumb"/>
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:'#5a8ea8',marginBottom:6,letterSpacing:.5}}>EMAIL PENERIMA ADMIN</div>
            <input className="ap-input" type="email" placeholder="admin@example.com" value={settings.recipientAdmin}
              onChange={e=>setSettings(p=>({...p,recipientAdmin:e.target.value}))} disabled={!isSA}/>
          </div>
          {isSA && (
            <button className="ap-btn ap-btn-green" onClick={save} disabled={loading}>
              <FileText size={12}/>{loading?'MENYIMPAN...':'SIMPAN PENGATURAN'}
            </button>
          )}
        </div>

        {/* Email Quota */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="ap-card">
            <div className="ap-card-title">EMAIL QUOTA</div>
            {quota ? (
              <>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,padding:'10px 14px',
                  background:'rgba(0,212,255,.04)',border:'1px solid rgba(0,212,255,.12)',borderRadius:8}}>
                  <Mail size={18} color="#00d4ff"/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'#e0f7ff'}}>{quota.provider}</div>
                    <div style={{fontSize:10,color:'#5a8ea8'}}>Plan: <span style={{color:'#00ffc8',fontWeight:700}}>{quota.plan}</span></div>
                  </div>
                  <div style={{marginLeft:'auto',textAlign:'right'}}>
                    <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:1}}>STATUS</div>
                    <span className="ap-badge badge-green" style={{fontSize:9}}>
                      <span className="dot-active"/>AKTIF
                    </span>
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:11,color:'#a0cfe0',fontWeight:600}}>Hari Ini</span>
                    <span style={{fontSize:10,color:'#5a8ea8'}}>Limit: {quota.dailyLimit}/hari</span>
                  </div>
                  <QuotaBar used={quota.sentToday} limit={quota.dailyLimit} color="#00d4ff"/>
                </div>

                <div style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:11,color:'#a0cfe0',fontWeight:600}}>Bulan Ini</span>
                    <span style={{fontSize:10,color:'#5a8ea8'}}>Limit: {quota.monthlyLimit}/bulan</span>
                  </div>
                  <QuotaBar used={quota.sentMonth} limit={quota.monthlyLimit} color="#00ffc8"/>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  {[
                    ['Terkirim Hari Ini', quota.sentToday, '#00d4ff'],
                    ['Sisa Hari Ini',     quota.dailyLimit-quota.sentToday, '#00ffc8'],
                    ['Terkirim Bulan Ini',quota.sentMonth, '#00d4ff'],
                    ['Sisa Bulan Ini',    quota.monthlyLimit-quota.sentMonth,'#00ffc8'],
                  ].map(([l,v,c])=>(
                    <div key={l as string} style={{textAlign:'center',padding:'8px 6px',
                      background:'rgba(0,212,255,.03)',border:'1px solid rgba(0,212,255,.08)',borderRadius:6}}>
                      <div style={{fontSize:20,fontWeight:400,color:c as string,fontFamily:"'JetBrains Mono',monospace"}}>{v as number}</div>
                      <div style={{fontSize:9,color:'#5a8ea8',letterSpacing:.5,marginTop:2}}>{l as string}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{textAlign:'center',padding:24,color:'#5a8ea8',fontSize:12}}>Memuat data quota...</div>
            )}
          </div>

          <div className="ap-card">
            <div className="ap-card-title">INFO PROVIDER</div>
            {[
              ['Provider',     quota?.provider??'Gmail',   'cyan'],
              ['From Email',   process.env.NEXT_PUBLIC_GMAIL_USER??'admin@example.com', 'cyan'],
              ['Daily Limit',  `${quota?.dailyLimit??500} email`, 'green'],
              ['Monthly Limit',`${quota?.monthlyLimit??15000} email`,'green'],
              ['Status',       quota?'Terhubung':'Memuat...', quota?'green':'yellow'],
            ].map(([k,v,c])=>(
              <div key={k as string} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid rgba(0,212,255,.05)',fontSize:11}}>
                <span style={{color:'#5a8ea8'}}>{k as string}</span>
                <span className={c as string} style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:10}}>{v as string}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ap-card" style={{marginTop:16}}>
        <div className="ap-card-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>RIWAYAT EMAIL TERKIRIM (20 TERAKHIR)</span>
          <span style={{fontSize:9,color:'#5a8ea8',letterSpacing:.5,fontWeight:400}}>AUTO-REFRESH 30s</span>
        </div>
        {logRows.length === 0 ? (
          <div style={{textAlign:'center',padding:24,color:'#5a8ea8',fontSize:12}}>Belum ada riwayat email.</div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead>
                <tr style={{borderBottom:'1px solid rgba(0,212,255,.15)'}}>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>WAKTU</th>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>PENERIMA</th>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>EVENT</th>
                  <th style={{textAlign:'left',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>SUBJECT</th>
                  <th style={{textAlign:'center',padding:'8px 6px',color:'#5a8ea8',fontWeight:600,letterSpacing:.5}}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {logRows.map(r=>{
                  const badgeColor =
                    r.status==='SENT'             ? '#1D9E75' :
                    r.status==='FAILED'           ? '#E24B4A' :
                    r.status==='SKIPPED_TOGGLE'   ? '#BA7517' :
                    '#5a8ea8';
                  const ts = r.sent_at ? new Date(r.sent_at).toLocaleString('id-ID',{hour12:false}) : '-';
                  const hasErr = !!r.error_msg;
                  return (
                    <tr key={r.id} style={{borderBottom:'1px solid rgba(0,212,255,.05)'}}>
                      <td style={{padding:'7px 6px',color:'#a0cfe0',fontFamily:"'JetBrains Mono',monospace",fontSize:10,whiteSpace:'nowrap'}}>{ts}</td>
                      <td style={{padding:'7px 6px',color:'#e0f7ff',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.recipient}</td>
                      <td style={{padding:'7px 6px',color:'#a0cfe0',fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>{r.event_type}</td>
                      <td style={{padding:'7px 6px',color:'#a0cfe0',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.subject}</td>
                      <td style={{padding:'7px 6px',textAlign:'center'}}>
                        <span
                          onMouseEnter={hasErr ? (e)=>{
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setErrTip({ top: rect.top - 6, left: rect.left + rect.width/2, text: r.error_msg! });
                          } : undefined}
                          onMouseLeave={hasErr ? ()=>setErrTip(null) : undefined}
                          style={{display:'inline-block',padding:'2px 8px',borderRadius:4,background:`${badgeColor}22`,
                            color:badgeColor,fontSize:9,fontWeight:700,letterSpacing:.5,fontFamily:"'JetBrains Mono',monospace",
                            cursor:hasErr?'help':'default'}}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {errTip && typeof window !== 'undefined' && createPortal(
        <div className="blud-tip-portal" style={{
          position:'fixed', top:errTip.top, left:errTip.left,
          whiteSpace:'normal', maxWidth:360, textAlign:'left', lineHeight:1.4,
        }}>
          {errTip.text}
        </div>,
        document.body,
      )}
    </div>
  );
}
