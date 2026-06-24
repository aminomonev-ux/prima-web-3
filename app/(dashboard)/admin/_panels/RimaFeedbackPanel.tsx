'use client';
/* eslint-disable react-hooks/set-state-in-effect */

// Admin Panel — tab "Rima Feedback". Tambang pertanyaan Rima yang gagal dijawab
// classifier (#2 fail-log mining) → bahan tumbuh KB. READ-ONLY: konsumsi GET
// /api/rima/feedback (agregat, admin-only). Teks sudah di-redaksi PII (R4/G27).

import { useCallback, useEffect, useState } from 'react';
import { MessageSquareWarning, RefreshCw } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';

interface FeedbackRow { question: string; jumlah: number; terakhir: string }

export function RimaFeedbackPanel() {
  const [rows, setRows]       = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    let res: Response;
    try {
      res = await fetch('/api/rima/feedback');
    } catch {
      setError('Gagal menghubungi server.'); setLoading(false); return;
    }
    let json: { ok?: boolean; data?: FeedbackRow[]; message?: string } | null = null;
    try {
      json = await res.json();
    } catch {
      setError('Jawaban server tidak terbaca.'); setLoading(false); return;
    }
    if (!res.ok || !json?.ok) setError(json?.message || 'Akses ditolak.');
    else setRows(Array.isArray(json.data) ? json.data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MessageSquareWarning size={18} style={{ color: '#00d4ff' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e0f7ff', letterSpacing: 0.5 }}>Pertanyaan Rima Tak Terjawab</div>
            <div style={{ fontSize: 11, color: '#5a8ea8', marginTop: 2 }}>Bahan tumbuh pengetahuan Rima — sudah diredaksi privasi</div>
          </div>
        </div>
        <PrimaButton variant="ghost" onClick={load} disabled={loading}>
          <RefreshCw size={14} style={{ marginRight: 6 }} /> Muat Ulang
        </PrimaButton>
      </div>

      {error && <div style={{ padding: 14, borderRadius: 8, background: 'rgba(226,75,74,0.12)', color: '#E24B4A', fontSize: 13 }}>{error}</div>}
      {!error && loading && <div style={{ padding: 24, color: '#5a8ea8', fontSize: 13 }}>Memuat…</div>}
      {!error && !loading && rows.length === 0 && (
        <div style={{ padding: 24, color: '#5a8ea8', fontSize: 13 }}>Belum ada pertanyaan tak terjawab yang tercatat 🎉</div>
      )}

      {!error && !loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(0,212,255,0.18)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(0,212,255,0.06)', textAlign: 'left' }}>
                <th style={{ padding: '10px 14px', color: '#7fb8d0', fontWeight: 600, letterSpacing: 0.5 }}>Pertanyaan</th>
                <th style={{ padding: '10px 14px', color: '#7fb8d0', fontWeight: 600, width: 90, textAlign: 'right' }}>Jumlah</th>
                <th style={{ padding: '10px 14px', color: '#7fb8d0', fontWeight: 600, width: 180 }}>Terakhir</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(0,212,255,0.1)' }}>
                  <td style={{ padding: '10px 14px', color: '#dceefa' }}>{r.question}</td>
                  <td style={{ padding: '10px 14px', color: '#00ffc8', fontWeight: 700, fontFamily: 'monospace', textAlign: 'right' }}>{r.jumlah}</td>
                  <td style={{ padding: '10px 14px', color: '#8fb3c8', fontFamily: 'monospace', fontSize: 12 }}>
                    {r.terakhir ? new Date(r.terakhir).toLocaleString('id-ID') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
