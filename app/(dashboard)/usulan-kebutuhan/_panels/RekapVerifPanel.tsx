// PERF-C2 Tahap 8: RekapVerifPanel — pure presentational, no state.
// Display rekap hasil verifikasi per sub bidang (data dari fetchKPI).

'use client';

import { RefreshCw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtRp } from '../_types';

export interface RekapRow {
  sub_bidang: string;
  cnt: number | string;
  disetujui?: number | string;
  ditolak?: number | string;
  total_est: number | string;
  // Extended fields (dipakai RekapPanel admin):
  belum_ditelaah?: number | string;
  ditelaah?: number | string;
  direvisi_admin?: number | string;
  ditolak_admin?: number | string;
  nominal_admin?: number | string;
  nominal_kasubag?: number | string;
  nominal_disetujui?: number | string;
}

interface Props {
  loading: boolean;
  data: RekapRow[];
  onRefresh: () => void;
  isLight?: boolean;
}

export function RekapVerifPanel({ loading, data, onRefresh, isLight = false }: Props) {
  return (
    <div>
      <div className="ua-table-wrap">
        <div style={{padding:'14px 16px',borderBottom:isLight?'1px solid rgba(0,0,0,.08)':'1px solid #0C447C',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,fontSize:13,color:isLight?'#0F0F12':'#E6F1FB'}}>Rekap Hasil Verifikasi per Sub Bidang</span>
          <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={12}/>} onClick={onRefresh}>Refresh</PrimaButton>
        </div>
        {loading ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af'}}>Memuat...</div>
        : data.length === 0 ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Belum ada data</div>
        : (
          <table className="rekap-table">
            <thead><tr>
              <th>Sub Bidang</th>
              <th style={{textAlign:'center'}}>Total Item</th>
              <th style={{textAlign:'center'}}>Disetujui</th>
              <th style={{textAlign:'center'}}>Ditolak</th>
              <th>Total Estimasi</th>
            </tr></thead>
            <tbody>{data.map(r => (
              <tr key={r.sub_bidang}>
                <td style={{fontWeight:600}}>{r.sub_bidang}</td>
                <td style={{textAlign:'center'}}>{Number(r.cnt)}</td>
                <td style={{textAlign:'center',color:'#16a34a',fontWeight:700}}>{Number(r.disetujui) || 0}</td>
                <td style={{textAlign:'center',color:'#dc2626',fontWeight:700}}>{Number(r.ditolak) || 0}</td>
                <td>{fmtRp(Number(r.total_est))}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
