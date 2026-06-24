// PERF-C2 Tahap 8: SetPaguPanel — admin config: set Pagu BLUD.
// State nominal/loading/ok/err self-contained. Shell pass currentPagu (read)
// dan onSaved callback (untuk update shell state + refresh KPI).

'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { InputNominal } from '@/components/ui/input-nominal';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtRp } from '../_types';

interface Props {
  currentPagu: number;
  onSaved: (newPagu: number) => void;
}

export function SetPaguPanel({ currentPagu, onSaved }: Props) {
  const [nominal, setNominal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  async function doSave() {
    setErr(''); setOk(''); setLoading(true);
    try {
      const value = nominal || 0;
      const d = await fetchJson('/api/config', {
        method: 'POST',
        body: JSON.stringify({ key: 'pagu_blud', value: String(value) }),
      });
      if (d.ok) {
        setOk('Pagu BLUD berhasil disimpan.');
        setNominal(0);
        onSaved(value);
      } else {
        setErr(d.message || 'Gagal menyimpan.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {err && <div className="msg-err"><AlertCircle size={16}/><span>{err}</span></div>}
      {ok  && <div className="msg-ok"><CheckCircle2 size={16}/><span>{ok}</span></div>}
      <div className="form-card">
        <div className="form-card-title">💰 Set Pagu BLUD</div>
        {currentPagu > 0 && (
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'12px 16px',marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:'#4b7a5a',textTransform:'uppercase',letterSpacing:.4,marginBottom:4}}>Pagu BLUD Saat Ini</div>
            <div style={{fontSize:22,fontWeight:800,color:'#0d7a3a'}}>{fmtRp(currentPagu)}</div>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Nominal Pagu Baru (Rp)</label>
          <InputNominal className="form-control" value={nominal}
            onChange={v => setNominal(v)} placeholder="Contoh: 5000000000"/>
          {nominal > 0 && (
            <div style={{fontSize:12,color:'#4b7a5a',marginTop:4}}>= {fmtRp(nominal)}</div>
          )}
        </div>
        <PrimaButton variant="primary" iconLeft={<Save size={14}/>} onClick={doSave} disabled={loading || !nominal || nominal <= 0}>
          {loading ? 'Menyimpan...' : 'Simpan Pagu'}
        </PrimaButton>
      </div>
    </div>
  );
}
