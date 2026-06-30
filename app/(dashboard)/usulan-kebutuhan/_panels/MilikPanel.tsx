// PERF-C2 Tahap 10b: MilikPanel — daftar usulan milik pengusul.
// Includes nested "Kirim Semua" modal (small confirm dialog).
// Actions: Detail, Edit Draft, Kirim, Hapus, Cancel (BUG-W4).

'use client';

import { useState } from 'react';
import { RefreshCw, Eye, Edit3, Send, Plus, Trash, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import Tip from '@/components/ui/Tip';
import { SUBBIDANG_ROLES, BIDANG_ROLES, ROLE_LABELS, SUBBIDANG_TO_BIDANG } from '@/lib/constants';
import type { Role } from '@/types';
import type { UsulanHeader, KPIData } from '../_types';
import { fmtRp, fmtTgl } from '../_types';
import { StatusBadgesCell, StatusOptions, Pagination } from '../_utils';

interface Props {
  role: Role;
  username: string;
  kpi: KPIData | null;
  kpiLoading: boolean;
  tahunList: string[];
  filterScope: 'milik' | 'satu_bidang';   setFilterScope: (v: 'milik' | 'satu_bidang') => void;
  filterTahun: string;    setFilterTahun: (v: string) => void;
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
  openEditDraft: (u: UsulanHeader) => void;
  doAjukan: (u: UsulanHeader) => void;
  doHapusMilik: (u: UsulanHeader) => void;
  doCancelByCreator: (u: UsulanHeader) => void;
  doKirimSemua: () => void | Promise<void>;
  kirSemLoading: boolean;
  onNewClick: () => void; // setPanel('buat')
  onExportExcel: (rows: UsulanHeader[], filename: string) => void;
  onExportPdf:   (title: string, rows: UsulanHeader[]) => void;
  isLight?: boolean;
}

export function MilikPanel({
  role, username, kpi, kpiLoading, tahunList,
  filterScope, setFilterScope, filterTahun, setFilterTahun,
  filterStatus, setFilterStatus, filterJenis, setFilterJenis,
  filterSearch, onSearchChange,
  data, loading, page, totalPages, total, setPage,
  openDetail, openEditDraft, doAjukan, doHapusMilik, doCancelByCreator,
  doKirimSemua, kirSemLoading, onNewClick, onExportExcel, onExportPdf,
  isLight = false,
}: Props) {
  const [kirSemModal, setKirSemModal] = useState(false);
  const draftCount = data.filter(u => ['DRAFT','REVISI_BIDANG','DIREVISI_ADMIN'].includes(u.status_ringkas)).length;
  const showLabel = (SUBBIDANG_ROLES as readonly string[]).includes(role) || (BIDANG_ROLES as readonly string[]).includes(role);
  const bidangLabel = showLabel ? `${ROLE_LABELS[role] ?? role} · ${username}` : null;

  async function handleKirimSemua() {
    await doKirimSemua();
    setKirSemModal(false);
  }

  return (
    <div>
      {kpi && (
        <div className="pagu-bar-wrap" style={{marginBottom:12}}>
          <div className="pagu-kpi-grid">
            {[
              {label:'Pagu BLUD',       val:kpi.pagu,            bg:'rgba(167,139,250,.12)', lc:'#A78BFA', vc:'#C4B5FD', sub:null},
              {label:'Nilai Aktif',     val:kpi.nilai_aktif,     bg:'rgba(244,114,182,.12)', lc:'#F472B6', vc:'#F9A8D4', sub:bidangLabel},
              {label:'Sedang Ditelaah', val:kpi.nilai_telaah,    bg:'rgba(239,159,39,.12)',  lc:'#EF9F27', vc:'#FAC775', sub:null},
              {label:'Disetujui Kabag', val:kpi.nilai_disetujui, bg:'rgba(74,222,128,.12)',  lc:'#4ADE80', vc:'#86EFAC', sub:null},
            ].map((c,i) => (
              <div key={i} className="pagu-kpi-card" style={{background:c.bg}}>
                <div className="pagu-kpi-label" style={{color:c.lc}}>{c.label}</div>
                <div className="pagu-kpi-val" style={{color:c.vc}}>{fmtRp(c.val ?? 0)}</div>
                {c.sub && <div style={{fontSize:10,color:c.lc,marginTop:2,fontWeight:600}}>{c.sub}</div>}
              </div>
            ))}
          </div>
          {(() => {
            const paguUnset = !kpi.pagu || kpi.pagu <= 0;
            const pct = paguUnset ? 0 : Math.min(100, (kpi.nilai_aktif / kpi.pagu) * 100);
            const ok = !paguUnset && kpi.nilai_aktif <= kpi.pagu;
            return (
              <>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:700,color:'#0a2e18'}}>Pagu BLUD</span>
                  <span style={{fontSize:12,fontWeight:800,color:paguUnset?'#a16207':ok?'#0d7a3a':'#dc2626'}}>{paguUnset?'—':`${pct.toFixed(1)}%`}</span>
                </div>
                <div className="pagu-bar-track"><div className="pagu-bar-fill" style={{width:`${pct}%`, background:paguUnset?'#9ca3af':ok?undefined:'linear-gradient(90deg,#ef4444,#dc2626)'}}/></div>
                <div className="pagu-bar-meta">
                  <span>Pagu: {fmtRp(kpi.pagu)}</span>
                  <span>|</span>
                  <span>Nilai Aktif: {fmtRp(kpi.nilai_aktif)}</span>
                  {paguUnset
                    ? <span style={{fontWeight:700,color:'#ca8a04'}}>ⓘ Pagu belum diatur</span>
                    : <span style={{fontWeight:700,color:ok?'#15803d':'#dc2626'}}>{ok?'✓ Dalam batas pagu':'⚠ Melebihi pagu'}</span>}
                </div>
              </>
            );
          })()}
          {/* Loading indicator (PaguKpiBar prop yang tidak dipakai disini karena render manual untuk subtitle bidangLabel) */}
          {kpiLoading && <div style={{fontSize:10,color:'#85B7EB',marginTop:6,fontStyle:'italic'}}>Memuat KPI...</div>}
        </div>
      )}
      <div className="filter-bar">
        {(SUBBIDANG_ROLES as readonly string[]).includes(role) && SUBBIDANG_TO_BIDANG[role] && (
          <select className="filter-select" value={filterScope} onChange={e => setFilterScope(e.target.value as 'milik'|'satu_bidang')}>
            <option value="milik">Hanya Saya</option>
            <option value="satu_bidang">Satu Bidang ({ROLE_LABELS[SUBBIDANG_TO_BIDANG[role]] ?? SUBBIDANG_TO_BIDANG[role]})</option>
          </select>
        )}
        <select className="filter-select" value={filterTahun} onChange={e => setFilterTahun(e.target.value)}>
          <option value="">Semua Tahun Anggaran</option>
          {tahunList.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Semua Status</option>
          <StatusOptions/>
        </select>
        <select className="filter-select" value={filterJenis} onChange={e => setFilterJenis(e.target.value)}>
          <option value="">Semua Jenis</option>
          <option value="MURNI">Murni</option>
          <option value="PERUBAHAN">Perubahan</option>
        </select>
        <input className="filter-input" placeholder="Cari no. usulan..." value={filterSearch}
          onChange={e => onSearchChange(e.target.value)} style={{flex:1,minWidth:160}}/>
        <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={13}/>} onClick={() => setPage(page)}>Refresh</PrimaButton>
        <DownloadButton variant="excel" label="Excel" size="sm" onClick={() => onExportExcel(data, 'usulan-saya')} />
        <DownloadButton variant="pdf" label="PDF" size="sm" onClick={() => onExportPdf('Usulan Saya', data)} />
        <PrimaButton variant="primary" size="sm" iconLeft={<Send size={13}/>}
          onClick={() => setKirSemModal(true)} disabled={draftCount === 0}>
          Kirim Semua {draftCount > 0 ? `(${draftCount})` : ''}
        </PrimaButton>
        <PrimaButton variant="purple" size="sm" iconLeft={<Plus size={13}/>} onClick={onNewClick}>Baru</PrimaButton>
      </div>
      <div className="ua-table-wrap">
        {loading ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af'}}>Memuat...</div>
        : data.length === 0 ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Belum ada usulan.</div>
        : (
          <table className="ua-table">
            <thead><tr>
              <th>No. Usulan</th><th>Tanggal</th><th>Sub Bidang</th><th>Jenis Belanja</th>
              <th style={{textAlign:'center'}}>Item</th><th>Total Est.</th>
              <th>Status</th><th></th>
            </tr></thead>
            <tbody>{data.map(u => {
              const jenis = (u as { jenis_usulan?: string }).jenis_usulan || 'MURNI';
              return (
                <tr key={u.id}>
                  <td style={{fontWeight:700,color:isLight?'#7C3AED':'#EF9F27',fontFamily:'monospace',fontSize:12,whiteSpace:'nowrap'}}>
                    {u.no_usulan}
                    <span style={{marginLeft:5,background:jenis==='PERUBAHAN'?(isLight?'rgba(186,117,23,.12)':'rgba(186,117,23,.15)'):(isLight?'rgba(55,138,221,.12)':'rgba(55,138,221,.15)'),color:jenis==='PERUBAHAN'?(isLight?'#B45309':'#FAC775'):(isLight?'#1D6FA8':'#7DD3FC'),padding:'1px 6px',borderRadius:99,fontSize:10,fontWeight:700,verticalAlign:'middle',letterSpacing:'0.02em'}}>
                      {jenis}
                    </span>
                  </td>
                  <td style={{whiteSpace:'nowrap',color:isLight?'#374151':'inherit'}}>{fmtTgl(u.tanggal)}</td>
                  <td><span style={{background:isLight?'rgba(16,185,129,.14)':'rgba(29,158,117,.12)',color:isLight?'#047857':'#6EE7B7',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600}}>{u.sub_bidang}</span></td>
                  <td style={{fontSize:11,color:isLight?'#4B5563':'#85B7EB',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.jenis_belanja || '-'}</td>
                  <td style={{textAlign:'center',fontWeight:600}}>{u.jumlah_item}</td>
                  <td style={{whiteSpace:'nowrap'}}>{fmtRp(u.total_nilai)}</td>
                  <td><StatusBadgesCell u={u}/></td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <Tip label="Detail"><button className="btn btn-secondary btn-sm" onClick={() => openDetail(u)}><Eye size={12}/></button></Tip>
                      {u.status_ringkas === 'DRAFT' && (
                        <Tip label="Edit Draft"><button className="btn btn-warning btn-sm" onClick={() => openEditDraft(u)}><Edit3 size={12}/></button></Tip>
                      )}
                      {['DRAFT','REVISI_BIDANG','DIREVISI_ADMIN'].includes(u.status_ringkas) && (
                        <Tip label="Kirim"><button className="btn btn-primary btn-sm" onClick={() => doAjukan(u)}><Send size={12}/></button></Tip>
                      )}
                      {u.status_ringkas === 'DRAFT' && (
                        <Tip label="Hapus"><button className="btn btn-danger btn-sm" onClick={() => doHapusMilik(u)}><Trash size={12}/></button></Tip>
                      )}
                      {/* BUG-W4: tombol Batalkan — pengusul tarik kembali usulan yang sudah DIAJUKAN_REVIEW sebelum Bidang sentuh */}
                      {u.status_ringkas === 'DIAJUKAN_REVIEW' && (
                        <Tip label="Batalkan & kembalikan ke Draft"><button className="btn btn-warning btn-sm" onClick={() => doCancelByCreator(u)}><X size={12}/></button></Tip>
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

      {/* Modal Kirim Semua (internal state) */}
      {kirSemModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
          onClick={e => { if (e.target === e.currentTarget) setKirSemModal(false); }}>
          <div style={{background:isLight?'#FAFAFA':'#042C53',border:isLight?'1px solid rgba(0,0,0,0.1)':'1px solid #0C447C',borderRadius:12,padding:28,maxWidth:440,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
            <div style={{fontSize:16,fontWeight:700,color:isLight?'#0F0F12':'#E6F1FB',marginBottom:12}}>📤 Kirim Semua Usulan</div>
            <p style={{fontSize:13,color:isLight?'#374151':'#B5D4F4',lineHeight:1.6,marginBottom:20}}>
              Terdapat <strong style={{color:'#1D9E75'}}>{draftCount} usulan</strong> yang belum dikirim.
              Apakah Anda yakin ingin mengirim semua usulan tersebut ke atasan sekarang?
            </p>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <PrimaButton variant="ghost" size="sm" onClick={() => setKirSemModal(false)} disabled={kirSemLoading}>Batal</PrimaButton>
              <PrimaButton variant="primary" size="sm" onClick={handleKirimSemua} disabled={kirSemLoading}>
                {kirSemLoading ? 'Mengirim...' : 'Ya, Kirim Sekarang'}
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
