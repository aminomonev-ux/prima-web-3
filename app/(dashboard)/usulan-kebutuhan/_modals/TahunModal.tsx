// PERF-C2 Tahap 6: TahunModal (pilih tahun + jenis usulan) extracted dari usulan-client.tsx.
// Controlled component — parent owns tahun + jenis state (karena dipakai oleh form Buat).
// Modal cuma render UI + delegate setters.

'use client';

import PrimaButton from '@/components/ui/PrimaButton';

export type JenisUsulan = 'MURNI' | 'PERUBAHAN' | 'PERGESERAN' | '';

interface Props {
  tahunList: string[];
  tahun: string;
  setTahun: (v: string) => void;
  jenis: JenisUsulan;
  setJenis: (v: JenisUsulan) => void;
  onClose: () => void;
  isLight?: boolean;
}

export function TahunModal({ tahunList, tahun, setTahun, jenis, setJenis, onClose, isLight }: Props) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" style={{maxWidth:400,textAlign:'center'}}>
        <div style={{padding:'32px 28px 24px'}}>
          <div style={{fontSize:40,marginBottom:12}}>📅</div>
          <div style={{fontSize:17,fontWeight:800,color:isLight?'#0F0F12':'#E6F1FB',marginBottom:8}}>Pilih Tahun &amp; Jenis Usulan</div>
          <div style={{fontSize:13,color:isLight?'#6B7280':'#85B7EB',marginBottom:20,lineHeight:1.5}}>
            Pilih tahun anggaran dan jenis usulan terlebih dahulu sebelum mengisi form pengajuan.
          </div>
          {/* Tahun Anggaran */}
          <div style={{textAlign:'left',marginBottom:8}}>
            <label style={{fontSize:12,fontWeight:700,color:isLight?'#374151':'#B5D4F4',marginBottom:4,display:'block'}}>Tahun Anggaran</label>
            <select className="form-control" value={tahun} style={{fontWeight:700,fontSize:14}}
              onChange={e => setTahun(e.target.value)}>
              <option value="">-- Pilih Tahun Anggaran --</option>
              {tahunList.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {/* Jenis Usulan */}
          <div style={{textAlign:'left',marginBottom:20}}>
            <label style={{fontSize:12,fontWeight:700,color:isLight?'#374151':'#B5D4F4',marginBottom:4,display:'block'}}>Jenis Usulan</label>
            <select className="form-control" value={jenis} style={{fontWeight:700,fontSize:14}}
              onChange={e => setJenis(e.target.value as JenisUsulan)}>
              <option value="">-- Pilih Jenis Usulan --</option>
              <option value="MURNI">MURNI</option>
              <option value="PERUBAHAN">PERUBAHAN</option>
              <option value="PERGESERAN">PERGESERAN</option>
            </select>
            {jenis && (
              <div style={{marginTop:6,fontSize:11,color:'#6b7280'}}>
                {jenis === 'MURNI'
                  ? '📋 Usulan kebutuhan baru (anggaran murni)'
                  : jenis === 'PERUBAHAN'
                    ? '🔄 Perubahan/revisi dari usulan yang sudah ada'
                    : '↔️ Usulan kebutuhan dari pergeseran anggaran'}
              </div>
            )}
          </div>
          <div style={{display:'flex',justifyContent:'center'}}>
            <PrimaButton variant="primary" data-rima="usulan.tahun-mulai"
              disabled={!tahun || !jenis}
              onClick={() => { if (tahun && jenis) onClose(); }}>
              Mulai Pengajuan
            </PrimaButton>
          </div>
        </div>
      </div>
    </div>
  );
}
