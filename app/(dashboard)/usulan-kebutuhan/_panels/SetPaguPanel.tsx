// PERF-C2 Tahap 8: SetPaguPanel — admin config: set Pagu BLUD.
// State nominal/loading/ok/err self-contained. Shell pass pagu per tahun (read)
// dan onSaved callback (untuk update shell state + refresh KPI).
// B5 (audit 2026-09-29): pagu disimpan PER TAHUN ANGGARAN (`pagu_blud_{tahun}`).

'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { kunciPaguBlud } from '@/lib/shared/pagu-blud';
import { InputNominal } from '@/components/ui/input-nominal';
import PrimaButton from '@/components/ui/PrimaButton';
import { fmtRp } from '../_types';

interface Props {
  paguPerTahun: Record<string, number>;
  tahunList: string[];
  onSaved: (tahun: string, newPagu: number) => void;
}

export function SetPaguPanel({ paguPerTahun, tahunList, onSaved }: Props) {
  const [tahun, setTahun] = useState(() => String(new Date().getFullYear()));
  const [nominal, setNominal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const paguTahunIni = paguPerTahun[tahun] ?? 0;
  const tahunTerisi = Object.keys(paguPerTahun).filter(t => paguPerTahun[t] > 0).sort().reverse();

  function gantiTahun(t: string) {
    setTahun(t); setOk(''); setErr('');
  }

  async function doSave() {
    setErr(''); setOk(''); setLoading(true);
    try {
      const value = nominal || 0;
      const d = await fetchJson('/api/config', {
        method: 'POST',
        body: JSON.stringify({ key: kunciPaguBlud(tahun), value: String(value) }),
      });
      if (d.ok) {
        setOk(`Pagu BLUD TA ${tahun} berhasil disimpan.`);
        setNominal(0);
        onSaved(tahun, value);
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
        <div className="form-group">
          <label className="form-label">Tahun Anggaran</label>
          <select className="form-control" value={tahun} onChange={e => gantiTahun(e.target.value)}>
            {tahunList.map(y => <option key={y} value={y}>TA {y}</option>)}
          </select>
          <div style={{fontSize:12,color:'#4b7a5a',marginTop:4}}>
            Pagu berlaku untuk satu tahun anggaran; batang pagu di layar Usulan membandingkannya dengan usulan tahun yang sama.
          </div>
        </div>
        {paguTahunIni > 0 ? (
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'12px 16px',marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:'#4b7a5a',textTransform:'uppercase',letterSpacing:.4,marginBottom:4}}>Pagu BLUD TA {tahun} Saat Ini</div>
            <div style={{fontSize:22,fontWeight:800,color:'#0d7a3a'}}>{fmtRp(paguTahunIni)}</div>
          </div>
        ) : (
          <div className="msg-err" style={{marginBottom:16}}><AlertCircle size={16}/><span>Pagu BLUD TA {tahun} belum diatur.</span></div>
        )}
        <div className="form-group">
          <label className="form-label">Nominal Pagu Baru TA {tahun} (Rp)</label>
          <InputNominal className="form-control" value={nominal}
            onChange={v => setNominal(v)} placeholder="Contoh: 5000000000"/>
          {nominal > 0 && (
            <div style={{fontSize:12,color:'#4b7a5a',marginTop:4}}>= {fmtRp(nominal)}</div>
          )}
        </div>
        <PrimaButton menulis variant="primary" iconLeft={<Save size={14}/>} onClick={doSave} disabled={loading || !nominal || nominal <= 0}>
          {loading ? 'Menyimpan...' : `Simpan Pagu TA ${tahun}`}
        </PrimaButton>
      </div>
      {tahunTerisi.length > 0 && (
        <div className="ua-table-wrap" style={{marginTop:16}}>
          <table className="ua-table">
            <thead><tr><th>Tahun Anggaran</th><th>Pagu BLUD</th></tr></thead>
            <tbody>{tahunTerisi.map(t => (
              <tr key={t}><td style={{fontWeight:600}}>TA {t}</td><td>{fmtRp(paguPerTahun[t])}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
