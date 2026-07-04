'use client';
/* eslint-disable react-hooks/set-state-in-effect */

// Admin Panel — tab "Rima Feedback" (RAL-3 labeling workbench,
// CONCEPT-rima-v4-learning.md). Tambang pertanyaan gagal (#2 fail-log mining)
// + beri label intent → dataset training RAL-4 (export JSONL). Aksi label lewat
// PATCH /api/rima/feedback (admin-only, diaudit RIMA_LABEL). Teks sudah
// di-redaksi PII (R4/G27). Daftar intent diambil lazy dari model.json.

import { useCallback, useEffect, useState } from 'react';
import { Download, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';

interface LabelRow {
  question: string; jumlah: number; terakhir: string;
  buruk: number; dipilih: number; usul_intent: string | null;
}

export function RimaFeedbackPanel() {
  const [rows, setRows]       = useState<LabelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [intents, setIntents] = useState<string[]>([]);
  const [draft, setDraft]     = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState<string | null>(null);
  // RAL-7c — auto-saran: classifier Rima mengusulkan intent per pertanyaan
  const [nlu, setNlu]         = useState<{
    classify: typeof import('@/lib/sentinel/nlu/engine.mjs').classify;
    model: import('@/lib/sentinel/nlu/engine.mjs').RimaModel;
    kw: Record<string, string[]>;
  } | null>(null);
  const [suggest, setSuggest] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setError('');
    let res: Response;
    try {
      res = await fetch('/api/rima/feedback?view=label');
    } catch {
      setError('Gagal menghubungi server.'); setLoading(false); return;
    }
    let json: { ok?: boolean; data?: LabelRow[]; message?: string } | null = null;
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

  // Daftar intent (datalist) + otak NLU utk auto-saran — lazy, sekali per buka panel
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      import('@/lib/sentinel/model.json'),
      import('@/lib/sentinel/nlu/engine.mjs'),
      import('@/lib/sentinel/knowledge.mjs'),
    ]).then(([mod, eng, kb]) => {
      if (cancelled) return;
      const model = (mod as { default?: unknown }).default as import('@/lib/sentinel/nlu/engine.mjs').RimaModel;
      setIntents(Object.keys(model?.nb?.classes ?? {}).sort());
      setNlu({ classify: eng.classify, model, kw: kb.kbKeywords() });
    }).catch(() => { /* datalist/saran kosong → input bebas tetap jalan */ });
    return () => { cancelled = true };
  }, []);

  // RAL-7c — hitung saran classifier utk baris tanpa usul dari klik user.
  // deny.* tak pernah disarankan; classifier ragu (null) → biarkan kosong.
  useEffect(() => {
    if (!nlu || rows.length === 0) { setSuggest({}); return; }
    const s: Record<string, string> = {};
    for (const r of rows) {
      if (r.usul_intent) continue;
      const res = nlu.classify(r.question, nlu.model, nlu.kw);
      const intent = res.intent ?? res.candidates[0]?.intent;
      if (intent && !intent.startsWith('deny.')) s[r.question] = intent;
    }
    setSuggest(s);
  }, [nlu, rows]);

  const patchLabel = useCallback(async (question: string, action: 'LABEL' | 'ABAIKAN', intent?: string) => {
    setSaving(question);
    let res: Response;
    try {
      res = await fetch('/api/rima/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, action, intent }),
      });
    } catch {
      toast.error('Gagal menghubungi server.'); setSaving(null); return;
    }
    let json: { ok?: boolean; affected?: number; message?: string } | null = null;
    try {
      json = await res.json();
    } catch {
      toast.error('Jawaban server tidak terbaca.'); setSaving(null); return;
    }
    if (!res.ok || !json?.ok) {
      toast.error(json?.message || 'Gagal menyimpan label.');
    } else {
      toast.success(action === 'LABEL' ? `Dilabeli → ${intent}` : 'Diabaikan.');
      setRows(prev => prev.filter(r => r.question !== question));
    }
    setSaving(null);
  }, []);

  const onLabel = useCallback((r: LabelRow) => {
    const intent = (draft[r.question] ?? r.usul_intent ?? suggest[r.question] ?? '').trim();
    if (!intent) { toast.error('Isi intent tujuan dulu ya.'); return; }
    void patchLabel(r.question, 'LABEL', intent);
  }, [draft, patchLabel, suggest]);

  const onAbaikan = useCallback(async (r: LabelRow) => {
    if (!(await confirmDialog({
      title: 'Abaikan pertanyaan ini?',
      message: `"${r.question}" tidak akan masuk dataset training.`,
      variant: 'danger',
    }))) return;
    void patchLabel(r.question, 'ABAIKAN');
  }, [patchLabel]);

  // Export dataset JSONL (label admin = kuat, klik kandidat = weak) → file unduhan
  const onExport = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch('/api/rima/feedback?view=export');
    } catch {
      toast.error('Gagal menghubungi server.'); return;
    }
    let json: { ok?: boolean; data?: { text: string; intent: string; weak: boolean }[] } | null = null;
    try {
      json = await res.json();
    } catch {
      toast.error('Jawaban server tidak terbaca.'); return;
    }
    const data = json?.ok && Array.isArray(json.data) ? json.data : [];
    if (!data.length) { toast.info('Belum ada data berlabel untuk diexport.'); return; }
    const jsonl = data.map(d => JSON.stringify(d)).join('\n');
    const blob = new Blob([jsonl], { type: 'application/x-ndjson' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `rima-labeled-${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Export ${data.length} baris dataset.`);
  }, []);

  const th = { padding: '10px 14px', color: '#7fb8d0', fontWeight: 600, letterSpacing: 0.5 } as const;
  const td = { padding: '10px 14px' } as const;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MessageSquareWarning size={18} style={{ color: '#00d4ff' }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e0f7ff', letterSpacing: 0.5 }}>Rima Feedback — Labeling Workbench</div>
            <div style={{ fontSize: 11, color: '#5a8ea8', marginTop: 2 }}>
              Label pertanyaan gagal → dataset training (jalankan <code>npm run rima:train</code>). Sudah diredaksi privasi.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <PrimaButton variant="success" onClick={() => { void onExport(); }}>
            <Download size={14} style={{ marginRight: 6 }} /> Export Dataset
          </PrimaButton>
          <PrimaButton variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={14} style={{ marginRight: 6 }} /> Muat Ulang
          </PrimaButton>
        </div>
      </div>

      <datalist id="rima-intent-list">
        {intents.map(i => <option key={i} value={i} />)}
      </datalist>

      {error && <div style={{ padding: 14, borderRadius: 8, background: 'rgba(226,75,74,0.12)', color: '#E24B4A', fontSize: 13 }}>{error}</div>}
      {!error && loading && <div style={{ padding: 24, color: '#5a8ea8', fontSize: 13 }}>Memuat…</div>}
      {!error && !loading && rows.length === 0 && (
        <div style={{ padding: 24, color: '#5a8ea8', fontSize: 13 }}>Tidak ada antrian label — semua feedback sudah diproses 🎉</div>
      )}

      {!error && !loading && rows.length > 0 && (
        <div style={{ overflowX: 'auto', border: '1px solid rgba(0,212,255,0.18)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(0,212,255,0.06)', textAlign: 'left' }}>
                <th style={th}>Pertanyaan</th>
                <th style={{ ...th, width: 70, textAlign: 'right' }}>Jumlah</th>
                <th style={{ ...th, width: 90, textAlign: 'right' }}>👎 / Pick</th>
                <th style={{ ...th, width: 260 }}>Intent tujuan</th>
                <th style={{ ...th, width: 170 }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.question} style={{ borderTop: '1px solid rgba(0,212,255,0.1)' }}>
                  <td style={{ ...td, color: '#dceefa' }}>
                    {r.question}
                    <div style={{ fontSize: 11, color: '#5a8ea8', marginTop: 2 }}>
                      {r.terakhir ? new Date(r.terakhir).toLocaleString('id-ID') : '-'}
                    </div>
                  </td>
                  <td style={{ ...td, color: '#00ffc8', fontWeight: 700, fontFamily: 'monospace', textAlign: 'right' }}>{r.jumlah}</td>
                  <td style={{ ...td, color: '#8fb3c8', fontFamily: 'monospace', textAlign: 'right' }}>{r.buruk} / {r.dipilih}</td>
                  <td style={td}>
                    <input
                      list="rima-intent-list"
                      value={draft[r.question] ?? r.usul_intent ?? suggest[r.question] ?? ''}
                      placeholder="mis. usulan.buat"
                      onChange={e => setDraft(prev => ({ ...prev, [r.question]: e.target.value }))}
                      style={{
                        width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                        fontFamily: 'monospace', background: 'rgba(0,212,255,0.06)',
                        border: '1px solid rgba(0,212,255,0.25)', color: '#e0f7ff',
                      }}
                    />
                    {draft[r.question] === undefined && !r.usul_intent && suggest[r.question] && (
                      <div style={{ fontSize: 10, color: '#5a8ea8', marginTop: 3 }}>✨ saran otomatis Rima — koreksi bila keliru</div>
                    )}
                    {draft[r.question] === undefined && r.usul_intent && (
                      <div style={{ fontSize: 10, color: '#5a8ea8', marginTop: 3 }}>👆 dari pilihan user (klik kandidat)</div>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        disabled={saving === r.question}
                        onClick={() => onLabel(r)}
                        data-tooltip="Simpan label → dataset training"
                        style={{
                          padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          background: '#1D9E75', color: '#fff', border: 'none',
                        }}
                      >✓ Label</button>
                      <button
                        type="button"
                        disabled={saving === r.question}
                        onClick={() => { void onAbaikan(r); }}
                        data-tooltip="Buang dari antrian (bukan bahan training)"
                        style={{
                          padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          background: 'transparent', color: '#8fb3c8', border: '1px solid rgba(143,179,200,0.4)',
                        }}
                      >Abaikan</button>
                    </div>
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
