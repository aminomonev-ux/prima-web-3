// PERF-C2 Tahap 9: DashboardPanel — KPI cards + chart per sub bidang.
// Pure presentational, no internal state. Data dari KPI swr di shell.

'use client';

import { RefreshCw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { SUBBIDANG_ROLES, BIDANG_ROLES, ROLE_LABELS } from '@/lib/constants';
import type { Role } from '@/types';
import type { KPIData } from '../_types';
import { fmtRp } from '../_types';
import { ClockCard } from '../_utils';

interface Props {
  kpi: KPIData | null;
  kpiLoading: boolean;
  role: Role;
  username: string;
  bwAktif: boolean;
  bwMulai: string;
  bwSelesai: string;
  bwPesan: string;
  onRefresh: () => void;
  isLight?: boolean;
}

export function DashboardPanel({
  kpi, kpiLoading, role, username,
  bwAktif, bwMulai, bwSelesai, bwPesan, onRefresh, isLight,
}: Props) {
  return (
    <div>
      {/* Clock + batas waktu — semua role */}
      <ClockCard bwAktif={bwAktif} bwMulai={bwMulai} bwSelesai={bwSelesai} bwPesan={bwPesan} isLight={isLight}/>
      {kpi && (
        <>
          <div className="pagu-bar-wrap">
            <div className="pagu-kpi-grid">
              {(() => {
                const showLabel = (SUBBIDANG_ROLES as readonly string[]).includes(role) || (BIDANG_ROLES as readonly string[]).includes(role);
                const bidangLabel = showLabel ? `${ROLE_LABELS[role] ?? role} · ${username}` : null;
                return [
                  {label:'Pagu BLUD',       val:kpi.pagu,             bg:'rgba(167,139,250,.12)', lc:'#A78BFA', vc:'#C4B5FD', sub:null},
                  {label:'Nilai Aktif',     val:kpi.nilai_aktif,      bg:'rgba(244,114,182,.12)', lc:'#F472B6', vc:'#F9A8D4', sub:bidangLabel},
                  {label:'Sedang Ditelaah', val:kpi.nilai_telaah,     bg:'rgba(239,159,39,.12)',  lc:'#EF9F27', vc:'#FAC775', sub:null},
                  {label:'Disetujui Kabag', val:kpi.nilai_disetujui,  bg:'rgba(74,222,128,.12)',  lc:'#4ADE80', vc:'#86EFAC', sub:null},
                ].map((c,i) => (
                  <div key={i} className="pagu-kpi-card" style={{background:c.bg}}>
                    <div className="pagu-kpi-label" style={{color:c.lc}}>{c.label}</div>
                    <div className="pagu-kpi-val" style={{color:c.vc}}>{fmtRp(c.val ?? 0)}</div>
                    {c.sub && <div style={{fontSize:10,color:c.lc,marginTop:2,fontWeight:600}}>{c.sub}</div>}
                  </div>
                ));
              })()}
            </div>
            {(() => {
              const pct = kpi.pagu > 0 ? Math.min(100, (kpi.nilai_aktif / kpi.pagu) * 100) : 0;
              const ok = kpi.nilai_aktif <= kpi.pagu;
              return (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#0a2e18'}}>Pagu BLUD</span>
                    <span style={{fontSize:12,fontWeight:800,color:ok?'#0d7a3a':'#dc2626'}}>{pct.toFixed(1)}%</span>
                  </div>
                  <div className="pagu-bar-track"><div className="pagu-bar-fill" style={{width:`${pct}%`,background:ok?undefined:'linear-gradient(90deg,#ef4444,#dc2626)'}}/></div>
                  <div className="pagu-bar-meta">
                    <span>Pagu: {fmtRp(kpi.pagu)}</span>
                    <span>|</span>
                    <span>Nilai Aktif: {fmtRp(kpi.nilai_aktif)}</span>
                    <span style={{fontWeight:700,color:ok?'#4ADE80':'#FCA5A5'}}>{ok?'✓ Dalam batas pagu':'⚠ Melebihi pagu'}</span>
                  </div>
                </>
              );
            })()}
          </div>
          <div className="kpi-grid">
            {[
              {label:'Total Item',        bg:'',         val:kpi?.total ?? 0,          sub:'Semua status',       color:''},
              {label:'Disetujui',         bg:'#22c55e',  val:kpi?.disetujui ?? 0,      sub:'Final disetujui',    color:'#16a34a'},
              {label:'Ditolak',           bg:'#ef4444',  val:kpi?.ditolak ?? 0,        sub:'Item ditolak',       color:'#dc2626'},
              {label:'Diverifikasi',      bg:'#7c3aed',  val:kpi?.proses ?? 0,         sub:'Ditelaah/Diproses',  color:'#7c3aed'},
              {label:'Menunggu Admin',    bg:'#2563eb',  val:kpi?.menunggu_admin ?? 0, sub:'Belum ditelaah',     color:'#2563eb'},
              {label:'Nominal Disetujui', bg:'#0d7a3a',  val:null, nom:kpi?.nominal ?? 0, sub:'Total nominal acc', color:'#0d7a3a'},
            ].map((k,i) => (
              <div key={i} className="kpi-card" style={k.bg ? {borderTop:`3px solid ${k.bg}`} : {}}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={k.color ? {color:k.color, fontSize: k.nom !== undefined ? 15 : undefined} : {}}>
                  {kpiLoading ? '...' : (k.nom !== undefined ? fmtRp(k.nom) : k.val)}
                </div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>
          <div className="ua-table-wrap">
            <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(13,122,58,.08)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontWeight:700,fontSize:13}}>Per Sub Bidang</span>
              <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={12}/>} onClick={onRefresh}>Refresh</PrimaButton>
            </div>
            {kpi?.chartBidang?.length ? (
              <table className="ua-table">
                <thead><tr><th>Sub Bidang</th><th>Jml Item</th><th>Total Est.</th><th>Total Disetujui</th></tr></thead>
                <tbody>{kpi.chartBidang.map(r => (
                  <tr key={r.sub_bidang}>
                    <td style={{fontWeight:600}}>{r.sub_bidang}</td>
                    <td>{r.cnt}</td>
                    <td>{fmtRp(r.total_est)}</td>
                    <td style={{color:'#16a34a',fontWeight:600}}>{Number(r.nominal_disetujui) > 0 ? fmtRp(Number(r.nominal_disetujui)) : '-'}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Belum ada data usulan</div>}
          </div>
        </>
      )}
    </div>
  );
}
