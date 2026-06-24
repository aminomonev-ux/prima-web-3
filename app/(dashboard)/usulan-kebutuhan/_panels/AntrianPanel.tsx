// PERF-C2 Tahap 9d: AntrianPanel — antrian verif untuk role Kasubag/Kabag.
// Tambahan: tombol Bulk Modal (ACC Semua / Proses Semua → Kabag).

'use client';

import { RefreshCw, Eye, CheckSquare, CheckCircle2 } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import Tip from '@/components/ui/Tip';
import { SUBBIDANG_ROLES } from '@/lib/constants';
import type { Role } from '@/types';
import type { UsulanHeader, KPIData } from '../_types';
import { fmtRp, fmtTgl, HIDE_BIDANG_STATUSES } from '../_types';
import { StatusBadgesCell, StatusOptions, PaguKpiBar, Pagination } from '../_utils';

interface Props {
  role: Role;
  kpi: KPIData | null;
  kpiLoading: boolean;
  tahunList: string[];
  filterTahun: string;    setFilterTahun: (v: string) => void;
  filterBidang: string;   setFilterBidang: (v: string) => void;
  filterStatus: string;   setFilterStatus: (v: string) => void;
  data: UsulanHeader[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  setPage: (p: number) => void;
  openDetail: (u: UsulanHeader) => void;
  openPutusan: (u: UsulanHeader) => void;
  openBulkModal: () => void;
  isLight?: boolean;
}

export function AntrianPanel({
  role, kpi, kpiLoading, tahunList,
  filterTahun, setFilterTahun, filterBidang, setFilterBidang, filterStatus, setFilterStatus,
  data, loading, page, totalPages, total, setPage,
  openDetail, openPutusan, openBulkModal,
  isLight = false,
}: Props) {
  const isBulkEligible = role === 'ADMIN_KASUBAG' || role === 'ADMIN_KABAG' || role === 'SUPER_ADMIN';
  return (
    <div>
      <PaguKpiBar kpi={kpi} loading={kpiLoading}/>
      <div className="filter-bar">
        <select className="filter-select" value={filterTahun} onChange={e => setFilterTahun(e.target.value)}>
          <option value="">Semua Tahun Anggaran</option>
          {tahunList.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="filter-select" value={filterBidang} onChange={e => setFilterBidang(e.target.value)}>
          <option value="">Semua Sub Bidang</option>
          {(SUBBIDANG_ROLES as readonly string[]).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">{role === 'ADMIN_KASUBAG' ? 'Ditelaah (default)' : 'Diputus Kasubag (default)'}</option>
          {role === 'ADMIN_KASUBAG'
            ? <StatusOptions only={['DITELAAH','DITOLAK_ADMIN','DIREVISI_ADMIN','DIPROSES','DIREVISI_KASUBAG','DISETUJUI','DITOLAK']}/>
            : <StatusOptions only={['DIPROSES','DIREVISI_KASUBAG','DISETUJUI','DITOLAK']}/>
          }
        </select>
        <div style={{marginLeft:'auto'}}>
          <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={13}/>} onClick={() => setPage(1)}>Refresh</PrimaButton>
        </div>
        {isBulkEligible && (
          <PrimaButton variant="primary" size="sm" iconLeft={<CheckCircle2 size={13}/>} onClick={openBulkModal}>
            {role === 'ADMIN_KABAG' ? 'ACC Semua Final' : 'Proses Semua → Kabag'}
          </PrimaButton>
        )}
      </div>
      <div className="ua-table-wrap">
        {loading ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af'}}>Memuat...</div>
        : data.length === 0 ? (
          <div style={{padding:'48px 20px',textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:12}}>✅</div>
            <div style={{fontWeight:700,color:isLight?'#0F0F12':'#E6F1FB',marginBottom:6}}>Tidak ada antrian</div>
            <div style={{fontSize:13,color:isLight?'#6B7280':'#85B7EB'}}>Semua usulan sudah diproses</div>
          </div>
        ) : (
          <table className="ua-table">
            <thead><tr>
              <th>No. Usulan</th><th>Tanggal</th><th>Pengusul</th><th>Sub Bidang</th>
              <th>Jenis Belanja</th><th style={{textAlign:'center'}}>Item</th>
              <th>Total Est.</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>{data.map(u => {
              const jenis = (u as { jenis_usulan?: string }).jenis_usulan || 'MURNI';
              return (
                <tr key={u.id}>
                  <td style={{fontWeight:700,color:isLight?'#7C3AED':'#EF9F27',fontFamily:'monospace',fontSize:12,whiteSpace:'nowrap'}}>
                    {u.no_usulan}
                    <span style={{marginLeft:5,background:jenis==='PERUBAHAN'?(isLight?'rgba(186,117,23,.12)':'rgba(186,117,23,.15)'):jenis==='PERGESERAN'?(isLight?'rgba(124,92,252,.12)':'rgba(124,92,252,.15)'):(isLight?'rgba(55,138,221,.12)':'rgba(55,138,221,.15)'),color:jenis==='PERUBAHAN'?(isLight?'#B45309':'#FAC775'):jenis==='PERGESERAN'?(isLight?'#6D4AFF':'#C4B5FD'):(isLight?'#1D6FA8':'#7DD3FC'),padding:'1px 6px',borderRadius:99,fontSize:10,fontWeight:700,verticalAlign:'middle',letterSpacing:'0.02em'}}>
                      {jenis}
                    </span>
                  </td>
                  <td style={{whiteSpace:'nowrap',color:isLight?'#374151':'inherit'}}>{fmtTgl(u.tanggal)}</td>
                  <td style={{color:isLight?'#374151':'inherit'}}>{u.pembuat || u.pengusul}</td>
                  <td><span style={{background:isLight?'rgba(16,185,129,.14)':'rgba(29,158,117,.12)',color:isLight?'#047857':'#6EE7B7',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600}}>{u.sub_bidang}</span></td>
                  <td style={{fontSize:11,color:isLight?'#4B5563':'#85B7EB',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.jenis_belanja || '-'}</td>
                  <td style={{textAlign:'center',fontWeight:600}}>{u.jumlah_item_admin ?? u.jumlah_item}</td>
                  <td style={{whiteSpace:'nowrap'}}>{fmtRp(u.total_nilai_admin ?? u.total_nilai)}</td>
                  <td><StatusBadgesCell u={u} hideStatuses={HIDE_BIDANG_STATUSES}/></td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <Tip label="Detail"><button className="btn btn-secondary btn-sm" onClick={() => openDetail(u)}><Eye size={12}/></button></Tip>
                      <Tip label="Beri Putusan"><button className="btn btn-primary btn-sm" onClick={() => openPutusan(u)}><CheckSquare size={12}/> Putusan</button></Tip>
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={totalPages} total={total} onPage={setPage}/>
    </div>
  );
}
