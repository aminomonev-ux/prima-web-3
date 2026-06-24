// PERF-C2 Tahap 10a: SemuaPanel — daftar semua usulan dengan filter penuh + Telaah trigger.
// Similar pola dengan DataUsulanPanel tapi tambah:
// - PaguKpiBar di atas (admin/super admin view perlu monitor pagu)
// - Status filter pakai `hide` berdasarkan role (SUPER_ADMIN lihat semua, lain hide BIDANG)
// - Telaah trigger button untuk admin saat status DIAJUKAN

'use client';

import { RefreshCw, Eye, Edit3 } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import { SUBBIDANG_ROLES } from '@/lib/constants';
import type { Role } from '@/types';
import type { UsulanHeader, KPIData } from '../_types';
import { fmtRp, fmtTgl, HIDE_BIDANG_STATUSES } from '../_types';
import { StatusBadgesCell, StatusOptions, PaguKpiBar, Pagination } from '../_utils';

interface Props {
  role: Role;
  isAdmin: boolean;
  kpi: KPIData | null;
  kpiLoading: boolean;
  tahunList: string[];
  filterTahun: string;    setFilterTahun: (v: string) => void;
  filterBidang: string;   setFilterBidang: (v: string) => void;
  filterStatus: string;   setFilterStatus: (v: string) => void;
  filterJenis: string;    setFilterJenis: (v: string) => void;
  filterSearch: string;   onSearchChange: (v: string) => void;
  data: UsulanHeader[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  setPage: (p: number) => void;
  openDetail: (u: UsulanHeader) => void;
  openTelaah: (u: UsulanHeader) => void;
  onExportExcel: (rows: UsulanHeader[], filename: string) => void;
  onExportPdf:   (title: string, rows: UsulanHeader[]) => void;
  exportName?: string;
  exportTitle?: string;
  statusOnly?: readonly string[];
  statusHide?: readonly string[];
  isLight?: boolean;
}

export function SemuaPanel({
  role, isAdmin, kpi, kpiLoading, tahunList,
  filterTahun, setFilterTahun, filterBidang, setFilterBidang,
  filterStatus, setFilterStatus, filterJenis, setFilterJenis,
  filterSearch, onSearchChange,
  data, loading, page, totalPages, total, setPage,
  openDetail, openTelaah, onExportExcel, onExportPdf,
  exportName = 'semua-usulan', exportTitle = 'Semua Usulan',
  statusOnly, statusHide,
  isLight = false,
}: Props) {
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
          <option value="">Semua Status</option>
          <StatusOptions only={statusOnly} hide={statusHide ?? (role !== 'SUPER_ADMIN' ? HIDE_BIDANG_STATUSES : undefined)}/>
        </select>
        <select className="filter-select" value={filterJenis} onChange={e => setFilterJenis(e.target.value)}>
          <option value="">Semua Jenis</option>
          <option value="MURNI">Murni</option>
          <option value="PERUBAHAN">Perubahan</option>
        </select>
        <input className="filter-input" placeholder="Cari no./pengusul..." value={filterSearch}
          onChange={e => onSearchChange(e.target.value)} style={{flex:1,minWidth:140}}/>
        <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={13}/>} onClick={() => setPage(page)}>Refresh</PrimaButton>
        <DownloadButton variant="excel" label="Excel" size="sm" onClick={() => onExportExcel(data, exportName)} />
        <DownloadButton variant="pdf" label="PDF" size="sm" onClick={() => onExportPdf(exportTitle, data)} />
      </div>
      <div className="ua-table-wrap">
        {loading ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af'}}>Memuat...</div>
        : data.length === 0 ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Belum ada data</div>
        : (
          <table className="ua-table">
            <thead><tr>
              <th>No. Usulan</th><th>Tanggal</th><th>Pengusul</th><th>Sub Bidang</th>
              <th>Jenis Belanja</th><th style={{textAlign:'center'}}>Item</th>
              <th>Total Est.</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>{data.map(u => {
              const jenis = (u as { jenis_usulan?: string }).jenis_usulan || 'MURNI';
              const showTelaah = isAdmin && ((u.status_counts?.['DIAJUKAN'] ?? 0) > 0 || (!u.status_counts && u.status_ringkas === 'DIAJUKAN'));
              return (
                <tr key={u.id}>
                  <td style={{fontWeight:700,color:isLight?'#7C3AED':'#EF9F27',fontFamily:'monospace',fontSize:12,whiteSpace:'nowrap'}}>
                    {u.no_usulan}
                    <span style={{marginLeft:5,background:jenis==='PERUBAHAN'?(isLight?'rgba(186,117,23,.12)':'rgba(186,117,23,.15)'):(isLight?'rgba(55,138,221,.12)':'rgba(55,138,221,.15)'),color:jenis==='PERUBAHAN'?(isLight?'#B45309':'#FAC775'):(isLight?'#1D6FA8':'#7DD3FC'),padding:'1px 6px',borderRadius:99,fontSize:10,fontWeight:700,verticalAlign:'middle',letterSpacing:'0.02em'}}>
                      {jenis}
                    </span>
                  </td>
                  <td style={{whiteSpace:'nowrap',color:isLight?'#374151':'inherit'}}>{fmtTgl(u.tanggal)}</td>
                  <td style={{color:isLight?'#374151':'inherit'}}>{u.pembuat || u.pengusul}</td>
                  <td><span style={{background:isLight?'rgba(16,185,129,.14)':'rgba(29,158,117,.12)',color:isLight?'#047857':'#6EE7B7',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600}}>{u.sub_bidang}</span></td>
                  <td style={{fontSize:11,color:isLight?'#4B5563':'#85B7EB',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.jenis_belanja || '-'}</td>
                  <td style={{textAlign:'center',fontWeight:600,color:isLight?'#374151':'inherit'}}>{role === 'ADMIN' ? (u.jumlah_item_admin ?? u.jumlah_item) : u.jumlah_item}</td>
                  <td style={{whiteSpace:'nowrap',color:isLight?'#374151':'inherit'}}>{fmtRp(role === 'ADMIN' ? (u.total_nilai_admin ?? u.total_nilai) : u.total_nilai)}</td>
                  <td><StatusBadgesCell u={u} hideStatuses={role === 'SUPER_ADMIN' ? undefined : HIDE_BIDANG_STATUSES}/></td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openDetail(u)}><Eye size={12}/></button>
                      {showTelaah && (
                        <button className="btn btn-purple btn-sm" onClick={() => openTelaah(u)}><Edit3 size={12}/> Telaah</button>
                      )}
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
