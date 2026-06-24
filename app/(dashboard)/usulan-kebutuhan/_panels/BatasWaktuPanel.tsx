// PERF-C2 Tahap 8: BatasWaktuPanel — admin config: batas waktu pengajuan.
// Controlled component karena bwMulai/bwSelesai/bwAktif/bwPesan juga dipakai
// ClockCard di shell. Internal: loading/ok/err state + doSave handler.

'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtTgl } from '../_types';

interface Props {
  bwMulai: string;     setBwMulai: (v: string) => void;
  bwSelesai: string;   setBwSelesai: (v: string) => void;
  bwPesan: string;     setBwPesan: (v: string) => void;
  bwAktif: boolean;    setBwAktif: (v: boolean) => void;
  onSaved: () => void;
}

export function BatasWaktuPanel({
  bwMulai, setBwMulai, bwSelesai, setBwSelesai,
  bwPesan, setBwPesan, bwAktif, setBwAktif, onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  async function doSave() {
    setErr(''); setOk(''); setLoading(true);
    try {
      const saveConfig = (key: string, value: string) =>
        fetchJson('/api/config', { method: 'POST', body: JSON.stringify({ key, value }) });
      const results = await Promise.all([
        saveConfig('batas_mulai',   bwMulai),
        saveConfig('batas_selesai', bwSelesai),
        saveConfig('batas_pesan',   bwPesan),
        saveConfig('batas_aktif',   String(bwAktif)),
      ]);
      const firstFail = results.find(r => !r.ok);
      if (firstFail && !firstFail.ok) {
        setErr(firstFail.message || 'Gagal menyimpan.');
        return;
      }
      setOk('Batas waktu berhasil disimpan.');
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {err && <div className="msg-err"><AlertCircle size={16}/><span>{err}</span></div>}
      {ok  && <div className="msg-ok"><CheckCircle2 size={16}/><span>{ok}</span></div>}
      <div className="form-card">
        <div className="form-card-title">⏰ Konfigurasi Batas Waktu Usulan</div>
        <div style={{marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,fontWeight:600}}>
            <input type="checkbox" checked={bwAktif} onChange={e => setBwAktif(e.target.checked)} style={{width:16,height:16}}/>
            Aktifkan pembatasan waktu pengajuan
          </label>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tanggal Mulai</label>
            <input type="date" className="form-control" value={bwMulai}
              onChange={e => setBwMulai(e.target.value)} disabled={!bwAktif}/>
          </div>
          <div className="form-group">
            <label className="form-label">Tanggal Selesai</label>
            <input type="date" className="form-control" value={bwSelesai}
              onChange={e => setBwSelesai(e.target.value)} disabled={!bwAktif}/>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Pesan kepada Pengusul (opsional)</label>
          <textarea className="form-control" rows={3} value={bwPesan}
            onChange={e => setBwPesan(e.target.value)}
            placeholder="Contoh: Pengajuan usulan kebutuhan dibuka s.d. 31 Desember 2025."
            disabled={!bwAktif}
            style={{resize:'vertical'}}/>
        </div>
        {bwAktif && bwMulai && bwSelesai && (
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 14px',fontSize:13,color:'#0a2e18',marginBottom:12}}>
            Periode aktif: <strong>{fmtTgl(bwMulai)}</strong> — <strong>{fmtTgl(bwSelesai)}</strong>
          </div>
        )}
        <PrimaButton variant="primary" iconLeft={<Save size={14}/>} onClick={doSave} disabled={loading}>
          {loading ? 'Menyimpan...' : 'Simpan Konfigurasi'}
        </PrimaButton>
      </div>
    </div>
  );
}
