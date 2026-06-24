// PERF-C2 Tahap 2: Presentational + utility components extracted dari usulan-client.tsx.
// Semua yang ada di sini: pure components (React.memo) + small helpers.
// Tidak ada state global, tidak ada side effect non-trivial.

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { BIDANG_ROLES, SUBBIDANG_ROLES, SATUAN_OPTIONS } from '@/lib/constants';
import type { Role } from '@/types';
import {
  STATUS_BADGE, STATUS_GROUPS, fmtRp,
  type KPIData, type UsulanHeader, type UsulanItem, type ItemForm, type Panel,
} from './_types';

// ─── Constants ──────────────────────────────────────────────────────────────

// Re-export SATUAN dari sentral lib/constants.ts (sebelumnya 10 item hardcoded).
// Single source of truth — selaras dgn DPA BLUD. Pakai SatuanCombobox utk
// searchable UI di BuatPanel. Backward-compat: nama SATUAN_LIST dipertahankan.
export const SATUAN_LIST = SATUAN_OPTIONS;

export const JENIS_BELANJA_LIST = [
  'Belanja Pegawai', 'Belanja Barang', 'Belanja Jasa', 'Belanja Pemeliharaan', 'Belanja Perjalanan Dinas',
  'Belanja Uang dan/atau Jasa untuk Diberikan Kepada Pihak Ketiga/Pihak Lain/Masyarakat',
  'Belanja Modal Alat Besar', 'Belanja Modal Alat Kantor dan Rumah Tangga',
  'Belanja Modal Alat Studio, Komunikasi, dan Pemancar',
  'Belanja Modal Alat Kedokteran dan Kesehatan',
  'Belanja Modal Komputer', 'Belanja Modal Bangunan Gedung Tempat Kerja',
  'Belanja Modal Aset Tetap Lainnya BLUD', 'Lainnya',
];

// ─── Pure helpers ───────────────────────────────────────────────────────────

// O4 (Tahap 10): crypto.randomUUID() ganti Math.random() — collision-free.
export function newItem(): ItemForm {
  return {
    id: crypto.randomUUID(), nama_barang: '', spesifikasi: '', qty: 1, satuan: '',
    harga_est: 0, prioritas: 'SEDANG', alasan: '',
    url_merk1: '', url_merk2: '', url_merk3: '', file_url: '', sub_bidang: '', jenis_belanja: '',
  };
}

export function getPanels(role: Role): Panel[] {
  const isBidang    = (BIDANG_ROLES as readonly string[]).includes(role);
  const isSubBidang = (SUBBIDANG_ROLES as readonly string[]).includes(role);
  if (role === 'SUPER_ADMIN') return ['dashboard','buat','milik','tracking','semua','data-admin','rekap','antrian','data-usulan','rekap-verif','bidang-antrian','bidang-data','kelola-user','batas-waktu','set-pagu','hapus-usulan'];
  if (role === 'ADMIN')       return ['dashboard','semua','data-admin','rekap','kelola-user','batas-waktu','set-pagu','hapus-usulan'];
  if (role === 'ADMIN_KASUBAG' || role === 'ADMIN_KABAG') return ['dashboard','antrian','data-usulan','rekap-verif'];
  if (isBidang)    return ['dashboard','bidang-antrian','bidang-data'];
  if (isSubBidang) return ['dashboard','buat','milik','tracking'];
  return ['dashboard'];
}

// ─── Components (React.memo for stable refs) ────────────────────────────────

export const StatusOptions = React.memo(function StatusOptions({ only, hide }: { only?: readonly string[]; hide?: readonly string[] }) {
  return <>{STATUS_GROUPS.map(g => {
    const opts = g.statuses.filter(s => (!only || only.includes(s)) && (!hide || !hide.includes(s)));
    if (!opts.length) return null;
    return <optgroup key={g.label} label={g.label}>
      {opts.map(s => <option key={s} value={s}>{STATUS_BADGE[s]?.label ?? s}</option>)}
    </optgroup>;
  })}</>;
});

export const StatusBadge = React.memo(function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, bg: '#f3f4f6', color: '#6b7280' };
  return <span style={{background:s.bg,color:s.color,padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>{s.label}</span>;
});

export const StatusBadgesCell = React.memo(function StatusBadgesCell({ u, hideStatuses }: { u: UsulanHeader; hideStatuses?: readonly string[] }) {
  let counts = u.status_counts;
  if (typeof counts === 'string') { try { counts = JSON.parse(counts as unknown as string); } catch { counts = undefined; } }
  if (!counts) return <StatusBadge status={u.status_ringkas}/>;
  const filtered = hideStatuses ? Object.fromEntries(Object.entries(counts).filter(([k]) => !hideStatuses.includes(k))) : counts;
  const entries = Object.entries(filtered);
  if (entries.length <= 1) return <StatusBadge status={entries[0]?.[0] ?? u.status_ringkas}/>;
  return (
    <div style={{display:'flex',flexDirection:'column',gap:3}}>
      {entries.map(([s, cnt]) => {
        const b = STATUS_BADGE[s] ?? { label: s, bg: '#f3f4f6', color: '#6b7280' };
        return <span key={s} style={{background:b.bg,color:b.color,padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:700,whiteSpace:'nowrap'}}>{b.label} <span style={{opacity:.75}}>({cnt})</span></span>;
      })}
    </div>
  );
});

export const StatusBadgesFromItems = React.memo(function StatusBadgesFromItems({ items }: { items: UsulanItem[] }) {
  const counts: Record<string, number> = {};
  items.forEach(it => { counts[it.status] = (counts[it.status] || 0) + 1; });
  if (Object.keys(counts).length <= 1) return <StatusBadge status={items[0]?.status ?? ''}/>;
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
      {Object.entries(counts).map(([s, cnt]) => {
        const b = STATUS_BADGE[s] ?? { label: s, bg: '#f3f4f6', color: '#6b7280' };
        return <span key={s} style={{background:b.bg,color:b.color,padding:'2px 10px',borderRadius:99,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>{b.label} ({cnt})</span>;
      })}
    </div>
  );
});

export const Pagination = React.memo(function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:16,flexWrap:'wrap'}}>
      <span style={{fontSize:12,color:'#6b7280'}}>{total} data</span>
      <button disabled={page<=1} onClick={()=>onPage(page-1)} className="pg-btn"><ChevronLeft size={14}/></button>
      {Array.from({length: Math.min(7, pages)}, (_, i) => {
        let p = i + 1;
        if (pages > 7) { if (page <= 4) p = i + 1; else if (page >= pages - 3) p = pages - 6 + i; else p = page - 3 + i; }
        return <button key={p} onClick={()=>onPage(p)} className={`pg-btn${p===page?' active':''}`}>{p}</button>;
      })}
      <button disabled={page>=pages} onClick={()=>onPage(page+1)} className="pg-btn"><ChevronRight size={14}/></button>
    </div>
  );
});

// PaguKpiBar: ringkasan 4 KPI + progress bar pagu. Dipakai di Dashboard,
// BidangAntrian, BidangData panels (pola repetitif sebelumnya inline 3x).
// Pure presentational.
export const PaguKpiBar = React.memo(function PaguKpiBar({ kpi, loading }: { kpi: KPIData | null; loading?: boolean }) {
  if (!kpi) return null;
  const cards = [
    {label:'Pagu BLUD',       val:kpi.pagu,             bg:'rgba(167,139,250,.12)', lc:'#A78BFA', vc:'#C4B5FD'},
    {label:'Nilai Aktif',     val:kpi.nilai_aktif,      bg:'rgba(244,114,182,.12)', lc:'#F472B6', vc:'#F9A8D4'},
    {label:'Sedang Ditelaah', val:kpi.nilai_telaah,     bg:'rgba(239,159,39,.12)',  lc:'#EF9F27', vc:'#FAC775'},
    {label:'Disetujui Kabag', val:kpi.nilai_disetujui,  bg:'rgba(74,222,128,.12)',  lc:'#4ADE80', vc:'#86EFAC'},
  ];
  const pct = kpi.pagu > 0 ? Math.min(100, (kpi.nilai_aktif / kpi.pagu) * 100) : 0;
  const ok  = kpi.nilai_aktif <= kpi.pagu;
  return (
    <div className="pagu-bar-wrap">
      <div className="pagu-kpi-grid">
        {cards.map((c,i) => (
          <div key={i} className="pagu-kpi-card" style={{background:c.bg}}>
            <div className="pagu-kpi-label" style={{color:c.lc}}>{c.label}</div>
            <div className="pagu-kpi-val" style={{color:c.vc}}>{loading ? '...' : fmtRp(c.val ?? 0).replace('Rp\xa0','Rp ')}</div>
          </div>
        ))}
      </div>
      <div className="pagu-progress-label" style={{display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600,color:'#B5D4F4',marginBottom:4}}>
        <span>Pagu BLUD</span><span>{pct.toFixed(1)}%</span>
      </div>
      <div className="pagu-bar-track">
        <div className="pagu-bar-fill" style={{width:`${pct}%`, background: ok ? undefined : 'linear-gradient(90deg,#ef4444,#dc2626)'}}/>
      </div>
      <div className="pagu-bar-meta">
        <span>Pagu: {fmtRp(kpi.pagu)}</span>
        <span style={{color:'#475569'}}>|</span>
        <span>Nilai Aktif: {fmtRp(kpi.nilai_aktif)}</span>
        {ok
          ? <span style={{color:'#4ADE80',fontWeight:600}}>✓ Dalam batas pagu</span>
          : <span style={{color:'#FCA5A5',fontWeight:600}}>⚠ Melebihi pagu</span>}
      </div>
    </div>
  );
});

export const ClockCard = React.memo(function ClockCard({ bwAktif, bwMulai, bwSelesai, bwPesan, isLight }: {
  bwAktif: boolean; bwMulai: string; bwSelesai: string; bwPesan: string; isLight?: boolean;
}) {
  // PERF-W6: self-managed clock state (sebelumnya prop dari root).
  // Setiap setState per-detik hanya re-render ClockCard, BUKAN seluruh
  // UsulanClient tree. Hydration-safe init via new Date(0) lalu effect set.
  const [clockTime, setClockTime] = useState<Date>(new Date(0));
  useEffect(() => {
    setClockTime(new Date());
    const t = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const m = bwMulai   ? new Date(bwMulai)   : null;
  const s = bwSelesai ? new Date(bwSelesai) : null;
  if (m) m.setHours(0, 0, 0, 0);
  if (s) s.setHours(23, 59, 59, 999);
  const isOpen = bwAktif && m && s && clockTime >= m && clockTime <= s;
  const notYet = bwAktif && m && clockTime < m;
  const target = isOpen ? s : (notYet ? m : null);
  const diffMs = target ? Math.max(0, target.getTime() - clockTime.getTime()) : 0;
  const tot    = Math.floor(diffMs / 1000);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const cd     = { d: Math.floor(tot/86400), h: Math.floor((tot%86400)/3600), m: Math.floor((tot%3600)/60), s: tot%60 };
  return (
    <div className="clock-card" style={{background:isLight?'linear-gradient(135deg,#FFFFFF,#F4F4F7)':'linear-gradient(135deg,rgba(4,44,83,.95),rgba(12,68,124,.7))',borderTop:'3px solid #EF9F27',borderRight:isLight?'1.5px solid rgba(0,0,0,0.1)':'1.5px solid rgba(239,159,39,.25)',borderBottom:isLight?'1.5px solid rgba(0,0,0,0.1)':'1.5px solid rgba(239,159,39,.25)',borderLeft:isLight?'1.5px solid rgba(0,0,0,0.1)':'1.5px solid rgba(239,159,39,.25)'}}>
      <div style={{fontSize:10,fontWeight:700,color:'#EF9F27',letterSpacing:1.5,textTransform:'uppercase',marginBottom:4}}>Waktu Sekarang</div>
      <div style={{fontSize:28,fontWeight:800,color:isLight?'#0F0F12':'#E6F1FB',fontFamily:'monospace',letterSpacing:2,display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
        <span style={{fontSize:18}}>🕐</span>
        {clockTime.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}
      </div>
      <div style={{fontSize:12,color:isLight?'#6B7280':'#85B7EB',marginTop:3}}>
        {clockTime.toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'short',year:'numeric'})}
      </div>
      {bwAktif && m && s && (
        <div style={{marginTop:10,padding:'8px 14px',background:isLight?'rgba(0,0,0,0.04)':'rgba(2,15,28,.4)',borderRadius:10,border:isLight?'1px solid rgba(0,0,0,0.08)':'1px solid rgba(12,68,124,.6)'}}>
          <div style={{fontSize:11,color:isLight?'#374151':'#B5D4F4',marginBottom:6}}>
            📅 Pengajuan dibuka: <strong>{m.toLocaleDateString('id-ID',{day:'numeric',month:'numeric',year:'numeric'})}</strong>
            {' s/d '}<strong style={{color:'#EF9F27'}}>{s.toLocaleDateString('id-ID',{day:'numeric',month:'numeric',year:'numeric'})}</strong>
          </div>
          {(isOpen || notYet) ? (
            <>
              <div style={{fontSize:9,fontWeight:700,color:isOpen?(isLight?'#DC2626':'#FCA5A5'):(isLight?'#B45309':'#FAC775'),textTransform:'uppercase',letterSpacing:1.5,marginBottom:4}}>
                {isOpen ? '✅ Sisa Waktu Pengajuan' : '⏳ Pengajuan Dibuka Dalam'}
              </div>
              <div style={{fontSize:26,fontWeight:800,fontFamily:'monospace',backgroundImage:'linear-gradient(90deg,#1D9E75,#7DD3FC)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',letterSpacing:3,lineHeight:1}}>
                {pad(cd.d)} : {pad(cd.h)} : {pad(cd.m)} : {pad(cd.s)}
              </div>
              <div style={{fontSize:9,color:isLight?'#6B7280':'#85B7EB',marginTop:4,letterSpacing:1}}>hari · jam · menit · detik</div>
            </>
          ) : (
            <div style={{fontSize:11,fontWeight:700,color:isLight?'#DC2626':'#FCA5A5'}}>🚫 Pengajuan DITUTUP</div>
          )}
          {bwPesan && <div style={{fontSize:10,color:isLight?'#6B7280':'#85B7EB',marginTop:5,fontStyle:'italic'}}>💬 {bwPesan}</div>}
        </div>
      )}
    </div>
  );
});

// BidangKpiBar: belum dipakai (reserved untuk Bidang dashboard yang sedang dirancang).
 
export const BidangKpiBar = React.memo(function BidangKpiBar({ kpi, loading, onRefresh }: { kpi: KPIData; loading: boolean; onRefresh: () => void }) {
  const cards = [
    {label:'Antrian Review',   val:kpi.bidang_antrian,    bg:'rgba(167,139,250,.12)', lc:'#A78BFA', vc:'#C4B5FD', isNum:true},
    {label:'Diteruskan Admin', val:kpi.bidang_diteruskan, bg:'rgba(244,114,182,.12)', lc:'#F472B6', vc:'#F9A8D4', isNum:true},
    {label:'Dikembalikan',     val:kpi.bidang_revisi,     bg:'rgba(239,159,39,.12)',  lc:'#EF9F27', vc:'#FAC775', isNum:true},
    {label:'Ditolak Bidang',   val:kpi.bidang_ditolak,    bg:'rgba(226,75,74,.12)',   lc:'#FCA5A5', vc:'#FCA5A5', isNum:true},
  ];
  return (
    <div>
      <div className="pagu-kpi-grid">
        {cards.map((c,i)=>(
          <div key={i} className="pagu-kpi-card" style={{background:c.bg}}>
            <div className="pagu-kpi-label" style={{color:c.lc}}>{c.label}</div>
            <div className="pagu-kpi-val" style={{color:c.vc,fontSize:28}}>{loading?'...':c.val}</div>
            <div style={{fontSize:10,color:c.lc,marginTop:2}}>usulan</div>
          </div>
        ))}
      </div>
      <div className="kpi-grid" style={{marginTop:16}}>
        {[
          {label:'Total Direview',   val:kpi.bidang_direview,      sub:'Semua keputusan bidang', color:'#0a2e18', bg:''},
          {label:'Menunggu Review',  val:kpi.bidang_antrian,       sub:'Belum diproses',         color:'#2563eb', bg:'#2563eb'},
          {label:'Diteruskan',       val:kpi.bidang_diteruskan,    sub:'Acc → ke Admin',         color:'#15803d', bg:'#22c55e'},
          {label:'Dikembalikan',     val:kpi.bidang_revisi,        sub:'Perlu revisi pengusul',  color:'#d97706', bg:'#f59e0b'},
          {label:'Ditolak',          val:kpi.bidang_ditolak,       sub:'Ditolak bidang',         color:'#dc2626', bg:'#ef4444'},
          {label:'Nilai Antrian',    val:null, nom:kpi.bidang_nilai_antrian, sub:'Total estimasi menunggu', color:'#0d7a3a', bg:'#0d7a3a'},
        ].map((k,i)=>(
          <div key={i} className="kpi-card" style={k.bg?{borderTop:`3px solid ${k.bg}`}:{}}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={k.color?{color:k.color,fontSize:k.nom!==undefined?15:undefined}:{}}>{loading?'...':(k.nom!==undefined?fmtRp(k.nom):k.val)}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="ua-table-wrap" style={{marginTop:16}}>
        <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(13,122,58,.08)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,fontSize:13}}>Per Sub Bidang</span>
          <button className="btn btn-sm btn-secondary" onClick={onRefresh}><RefreshCw size={12}/> Refresh</button>
        </div>
        {kpi.chartBidang?.length ? (
          <table className="ua-table">
            <thead><tr><th>Sub Bidang</th><th>Jml Item</th><th>Total Est.</th><th>Total Disetujui</th></tr></thead>
            <tbody>{kpi.chartBidang.map(r=>(
              <tr key={r.sub_bidang}>
                <td style={{fontWeight:600}}>{r.sub_bidang}</td>
                <td>{r.cnt}</td>
                <td>{fmtRp(r.total_est)}</td>
                <td style={{color:'#16a34a',fontWeight:600}}>{Number(r.nominal_disetujui)>0?fmtRp(Number(r.nominal_disetujui)):'-'}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Belum ada data</div>}
      </div>
    </div>
  );
});
