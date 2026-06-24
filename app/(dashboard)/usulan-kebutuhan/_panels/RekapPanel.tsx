// PERF-C2 Tahap 9: RekapPanel — admin rekap usulan (lebih detail dari RekapVerifPanel).
// Pure presentational: kolom tambahan untuk hasil telaah admin (belum_ditelaah,
// ditelaah, direvisi_admin, ditolak_admin, nominal_admin) + total row.

'use client';

import { RefreshCw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtRp } from '../_types';
import type { RekapRow } from './RekapVerifPanel';

interface Props {
  loading: boolean;
  data: RekapRow[];
  onRefresh: () => void;
  isLight?: boolean;
}

export function RekapPanel({ loading, data, onRefresh, isLight = false }: Props) {
  const sumNum = (key: keyof RekapRow) => data.reduce((s, r) => s + Number(r[key] || 0), 0);
  // Color tokens per mode
  const cText      = isLight ? '#0F0F12' : '#E6F1FB';
  const cGreen     = isLight ? '#047857' : '#6EE7B7';
  const cBlue      = isLight ? '#1D6FA8' : '#7DD3FC';
  const cAmber     = isLight ? '#B45309' : '#FAC775';
  const cRed       = isLight ? '#B91C1C' : '#FCA5A5';
  const bgGreen    = isLight ? 'rgba(16,185,129,.10)' : 'rgba(29,158,117,.1)';
  const bgGreenLt  = isLight ? 'rgba(16,185,129,.06)' : 'rgba(29,158,117,.06)';
  const bgBlue     = isLight ? 'rgba(55,138,221,.10)' : 'rgba(55,138,221,.1)';
  const bgBlueLt   = isLight ? 'rgba(55,138,221,.06)' : 'rgba(55,138,221,.06)';
  const bgAmber    = isLight ? 'rgba(186,117,23,.10)' : 'rgba(186,117,23,.1)';
  const bgAmberLt  = isLight ? 'rgba(186,117,23,.06)' : 'rgba(186,117,23,.06)';
  const bgRed      = isLight ? 'rgba(226,75,74,.10)'  : 'rgba(226,75,74,.1)';
  const bgRedLt    = isLight ? 'rgba(226,75,74,.06)'  : 'rgba(226,75,74,.06)';
  const totalBg    = isLight ? 'rgba(0,0,0,.04)' : 'rgba(12,68,124,.5)';
  return (
    <div>
      <div className="filter-bar">
        <span style={{fontSize:13,fontWeight:600,color:cText}}>Rekap Usulan Kebutuhan</span>
        <div style={{marginLeft:'auto'}}>
          <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={13}/>} onClick={onRefresh}>Refresh</PrimaButton>
        </div>
      </div>
      {loading ? <div style={{padding:'32px',textAlign:'center',color:'#9ca3af'}}>Memuat...</div>
      : (
        <div className="ua-table-wrap">
          <table className="rekap-table">
            <thead>
              <tr>
                <th rowSpan={2}>Sub Bidang</th>
                <th style={{textAlign:'center'}} rowSpan={2}>Total Item</th>
                <th style={{textAlign:'right'}} rowSpan={2}>Total Estimasi</th>
                <th style={{textAlign:'center',background:bgGreen,color:cGreen,borderLeft:`2px solid ${bgGreen}`}} colSpan={4}>Hasil Telaah Admin</th>
                <th style={{textAlign:'right',background:bgGreenLt,color:cGreen}} rowSpan={2}>Nominal Rekomendasi</th>
                <th style={{textAlign:'right',background:bgGreenLt,color:cGreen}} rowSpan={2}>Verif Kasubag</th>
                <th style={{textAlign:'right',background:bgGreen,color:cGreen}} rowSpan={2}>Disetujui</th>
              </tr>
              <tr>
                <th style={{textAlign:'center',background:bgBlue,color:cBlue,borderLeft:`2px solid ${bgGreen}`}}>⏳ Belum Ditelaah</th>
                <th style={{textAlign:'center',background:bgGreenLt,color:cGreen}}>✅ Ditelaah</th>
                <th style={{textAlign:'center',background:bgAmber,color:cAmber}}>🔄 Revisi Admin</th>
                <th style={{textAlign:'center',background:bgRed,color:cRed}}>❌ Ditolak Admin</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => (
                <tr key={r.sub_bidang}>
                  <td style={{fontWeight:600,color:cText}}>{r.sub_bidang}</td>
                  <td style={{textAlign:'center',fontWeight:700,color:cText}}>{Number(r.cnt)}</td>
                  <td style={{fontWeight:600,color:cGreen,textAlign:'right'}}>{fmtRp(Number(r.total_est))}</td>
                  <td style={{textAlign:'center',fontWeight:700,color:cBlue,borderLeft:`2px solid ${bgGreen}`,background:bgBlueLt}}>{Number(r.belum_ditelaah) || 0}</td>
                  <td style={{textAlign:'center',fontWeight:700,color:cGreen,background:bgGreenLt}}>{Number(r.ditelaah) || 0}</td>
                  <td style={{textAlign:'center',fontWeight:700,color:cAmber,background:bgAmberLt}}>{Number(r.direvisi_admin) || 0}</td>
                  <td style={{textAlign:'center',fontWeight:700,color:cRed,background:bgRedLt}}>{Number(r.ditolak_admin) || 0}</td>
                  <td style={{fontWeight:600,color:cGreen,textAlign:'right'}}>{fmtRp(Number(r.nominal_admin) || 0)}</td>
                  <td style={{fontWeight:600,color:cGreen,textAlign:'right'}}>{fmtRp(Number(r.nominal_kasubag) || 0)}</td>
                  <td style={{fontWeight:700,color:cGreen,textAlign:'right'}}>{fmtRp(Number(r.nominal_disetujui) || 0)}</td>
                </tr>
              ))}
              {data.length > 0 && (
                <tr style={{background:totalBg,fontWeight:800}}>
                  <td style={{color:cText}}>TOTAL</td>
                  <td style={{textAlign:'center',color:cText}}>{sumNum('cnt')}</td>
                  <td style={{color:cGreen,textAlign:'right'}}>{fmtRp(sumNum('total_est'))}</td>
                  <td style={{textAlign:'center',color:cBlue,borderLeft:`2px solid ${bgGreen}`,background:bgBlue}}>{sumNum('belum_ditelaah')}</td>
                  <td style={{textAlign:'center',color:cGreen,background:bgGreen}}>{sumNum('ditelaah')}</td>
                  <td style={{textAlign:'center',color:cAmber,background:bgAmber}}>{sumNum('direvisi_admin')}</td>
                  <td style={{textAlign:'center',color:cRed,background:bgRed}}>{sumNum('ditolak_admin')}</td>
                  <td style={{color:cGreen,textAlign:'right'}}>{fmtRp(sumNum('nominal_admin'))}</td>
                  <td style={{color:cGreen,textAlign:'right'}}>{fmtRp(sumNum('nominal_kasubag'))}</td>
                  <td style={{color:cGreen,textAlign:'right'}}>{fmtRp(sumNum('nominal_disetujui'))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
