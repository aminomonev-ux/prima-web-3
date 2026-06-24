// PERF-C2 Tahap 10c: HapusUsulanPanel — admin delete usulan.
// Includes 2 nested confirm modals (hapus 1 + hapus semua dengan 2-step
// text confirmation BUG-W6). Modal state local di panel.

'use client';

import { useState } from 'react';
import { RefreshCw, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import { SUBBIDANG_ROLES } from '@/lib/constants';
import PrimaButton from '@/components/ui/PrimaButton';
import Tip from '@/components/ui/Tip';
import type { UsulanHeader } from '../_types';
import { fmtRp, fmtTgl } from '../_types';
import { StatusBadgesCell, Pagination } from '../_utils';

interface Props {
  filterBidang: string;   setFilterBidang: (v: string) => void;
  filterSearch: string;   onSearchChange: (v: string) => void;
  data: UsulanHeader[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  setPage: (p: number) => void;
  hapusErr: string;       setHapusErr: (v: string) => void;
  hapusOk: string;        setHapusOk: (v: string) => void;
  hapusAllLoading: boolean;
  hapusAllProgress: { done: number; total: number };
  doHapus: (u: UsulanHeader, konfirmText: string) => void | Promise<void>;
  doHapusSemua: (konfirmText: string) => void | Promise<void>;
  isLight?: boolean;
}

export function HapusUsulanPanel({
  filterBidang, setFilterBidang, filterSearch, onSearchChange,
  data, loading, page, totalPages, total, setPage,
  hapusErr, setHapusErr, hapusOk, setHapusOk,
  hapusAllLoading, hapusAllProgress, doHapus, doHapusSemua,
  isLight = false,
}: Props) {
  const [hapusConfirm, setHapusConfirm] = useState<UsulanHeader | null>(null);
  const [hapusKonfirmText, setHapusKonfirmText] = useState('');
  const [hapusAllConfirm, setHapusAllConfirm] = useState(false);
  const [hapusAllText, setHapusAllText] = useState('');

  async function handleConfirmHapus() {
    if (!hapusConfirm) return;
    await doHapus(hapusConfirm, hapusKonfirmText);
    setHapusConfirm(null);
    setHapusKonfirmText('');
  }

  async function handleConfirmHapusSemua() {
    await doHapusSemua(hapusAllText);
    setHapusAllConfirm(false);
    setHapusAllText('');
  }

  return (
    <div>
      {hapusErr && <div className="msg-err"><AlertCircle size={16}/><span>{hapusErr}</span></div>}
      {hapusOk  && <div className="msg-ok"><CheckCircle2 size={16}/><span>{hapusOk}</span></div>}
      <div className="filter-bar">
        <select className="filter-select" value={filterBidang} onChange={e => setFilterBidang(e.target.value)}>
          <option value="">Semua Sub Bidang</option>
          {(SUBBIDANG_ROLES as readonly string[]).map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className="filter-input" placeholder="Cari no. usulan atau pengusul..." value={filterSearch}
          onChange={e => onSearchChange(e.target.value)} style={{flex:1,minWidth:180}}/>
        <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={13}/>} onClick={() => setPage(1)} disabled={loading}>Refresh</PrimaButton>
        <Tip label="Hapus semua usulan sesuai filter aktif"><PrimaButton variant="danger" size="sm" iconLeft={<DeleteIcon size={13}/>}
          onClick={() => { setHapusErr(''); setHapusOk(''); setHapusAllText(''); setHapusAllConfirm(true); }}
          disabled={loading || hapusAllLoading || total === 0}>
          Hapus Semua{total > 0 ? ` (${total})` : ''}
        </PrimaButton></Tip>
      </div>
      <div className="ua-table-wrap">
        {loading ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af'}}>Memuat...</div>
        : data.length === 0 ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Belum ada data</div>
        : (
          <table className="ua-table">
            <thead><tr>
              <th>No. Usulan</th><th>Tanggal</th><th>Pengusul</th><th>Sub Bidang</th>
              <th style={{textAlign:'center'}}>Item</th><th>Total Est.</th><th>Status</th><th></th>
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
                  <td style={{color:isLight?'#374151':'inherit'}}>{u.pembuat || u.pengusul}</td>
                  <td><span style={{background:isLight?'rgba(16,185,129,.14)':'rgba(29,158,117,.12)',color:isLight?'#047857':'#6EE7B7',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:600}}>{u.sub_bidang}</span></td>
                  <td style={{textAlign:'center',fontWeight:600,color:isLight?'#374151':'inherit'}}>{u.jumlah_item}</td>
                  <td style={{whiteSpace:'nowrap',color:isLight?'#374151':'inherit'}}>{fmtRp(u.total_nilai)}</td>
                  <td><StatusBadgesCell u={u}/></td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => {
                      setHapusErr(''); setHapusOk(''); setHapusKonfirmText(''); setHapusConfirm(u);
                    }}>
                      <DeleteIcon size={12}/> Hapus
                    </button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={totalPages} total={total} onPage={setPage}/>

      {/* Confirm hapus — 2-step: ketik "HAPUS" */}
      {hapusConfirm && (
        <div className="modal-overlay">
          <div className="modal-card" style={{maxWidth:440}}>
            <div className="modal-header">
              <div><div className="modal-title">⚠️ Konfirmasi Hapus Permanen</div></div>
              <button onClick={() => { setHapusConfirm(null); setHapusKonfirmText(''); }} style={{background:'none',border:'none',cursor:'pointer',color:'#6b7280'}}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12,color:'#7f1d1d'}}>
                <strong>{hapusConfirm.no_usulan}</strong> · {hapusConfirm.sub_bidang} · {hapusConfirm.jumlah_item} item
              </div>
              <p style={{fontSize:13,color:isLight?'#374151':'#B5D4F4',marginBottom:4}}>
                Tindakan ini <strong>tidak dapat dibatalkan</strong>. Semua item dan riwayat verifikasi akan terhapus permanen.
              </p>
              <p style={{fontSize:13,color:isLight?'#374151':'#B5D4F4',marginBottom:8}}>
                Ketik <strong style={{color:isLight?'#DC2626':'#FCA5A5'}}>HAPUS</strong> untuk konfirmasi:
              </p>
              <input className="form-control" value={hapusKonfirmText}
                onChange={e => setHapusKonfirmText(e.target.value)}
                placeholder="Ketik HAPUS di sini..." autoFocus
                style={{borderColor: hapusKonfirmText === 'HAPUS' ? '#22c55e' : '#e5e7eb', color:'#111827', background:'#fff'}}/>
              {hapusErr && <div className="msg-err" style={{marginTop:10}}><AlertCircle size={13}/><span>{hapusErr}</span></div>}
            </div>
            <div className="modal-footer">
              <PrimaButton variant="ghost" onClick={() => { setHapusConfirm(null); setHapusKonfirmText(''); }}>Batal</PrimaButton>
              <PrimaButton variant="danger" iconLeft={<DeleteIcon size={13}/>}
                disabled={hapusKonfirmText !== 'HAPUS'} onClick={handleConfirmHapus}>
                Hapus Permanen
              </PrimaButton>
            </div>
          </div>
        </div>
      )}

      {/* Confirm hapus SEMUA — ketik "HAPUS SEMUA" */}
      {hapusAllConfirm && (
        <div className="modal-overlay">
          <div className="modal-card" style={{maxWidth:480}}>
            <div className="modal-header">
              <div><div className="modal-title">⚠️ Konfirmasi Hapus SEMUA</div></div>
              <button onClick={() => { if (!hapusAllLoading) { setHapusAllConfirm(false); setHapusAllText(''); } }}
                style={{background:'none',border:'none',cursor: hapusAllLoading ? 'not-allowed' : 'pointer', color:'#6b7280'}}
                disabled={hapusAllLoading}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:12,color:'#7f1d1d'}}>
                Akan menghapus <strong>{total}</strong> usulan
                {filterBidang ? <> dari <strong>{filterBidang}</strong></> : <> (<strong>semua sub bidang</strong>)</>}
                {filterSearch.trim() ? <> dengan pencarian &quot;<strong>{filterSearch.trim()}</strong>&quot;</> : null}.
              </div>
              <p style={{fontSize:13,color:isLight?'#374151':'#B5D4F4',marginBottom:4}}>
                Tindakan ini <strong>tidak dapat dibatalkan</strong>. Semua item dan riwayat verifikasi akan terhapus permanen.
              </p>
              <p style={{fontSize:13,color:isLight?'#374151':'#B5D4F4',marginBottom:8}}>
                Ketik <strong style={{color:isLight?'#DC2626':'#FCA5A5'}}>HAPUS SEMUA</strong> untuk konfirmasi:
              </p>
              <input className="form-control" value={hapusAllText}
                onChange={e => setHapusAllText(e.target.value)}
                placeholder="Ketik HAPUS SEMUA di sini..." autoFocus
                disabled={hapusAllLoading}
                style={{borderColor: hapusAllText === 'HAPUS SEMUA' ? '#22c55e' : '#e5e7eb', color:'#111827', background:'#fff'}}/>
              {hapusAllLoading && hapusAllProgress.total > 0 && (
                <div style={{marginTop:12,fontSize:12,color:'#85B7EB'}}>
                  Menghapus {hapusAllProgress.done} / {hapusAllProgress.total}...
                  <div style={{marginTop:6,height:6,background:'rgba(12,68,124,.4)',borderRadius:99,overflow:'hidden'}}>
                    <div style={{width: `${(hapusAllProgress.done / hapusAllProgress.total) * 100}%`, height:'100%', background:'#E24B4A', transition:'width .2s'}}/>
                  </div>
                </div>
              )}
              {hapusErr && <div className="msg-err" style={{marginTop:10}}><AlertCircle size={13}/><span>{hapusErr}</span></div>}
            </div>
            <div className="modal-footer">
              <PrimaButton variant="ghost" onClick={() => { setHapusAllConfirm(false); setHapusAllText(''); }} disabled={hapusAllLoading}>Batal</PrimaButton>
              <PrimaButton variant="danger" iconLeft={<DeleteIcon size={13}/>}
                disabled={hapusAllText !== 'HAPUS SEMUA' || hapusAllLoading} onClick={handleConfirmHapusSemua}>
                {hapusAllLoading ? 'Menghapus...' : `Hapus Semua (${total})`}
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
