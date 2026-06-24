'use client';
/* eslint-disable react-hooks/set-state-in-effect */

// SA review panel — tab "Promotion Requests" di Admin Panel.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §9D.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Clock, AlertCircle } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { ROLE_LABELS } from '@/lib/constants';

type Status = 'PENDING' | 'COOLDOWN' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';
type Tab = 'PENDING' | 'COOLDOWN' | 'HISTORY';

interface PromotionRow {
  id: number;
  user_id: number;
  from_role: string;
  to_role: string;
  reason: string;
  status: Status;
  approved_by: number | null;
  approved_at: string | null;
  cooldown_until: string | null;
  completed_at: string | null;
  rejected_reason: string | null;
  is_bootstrap: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  username: string;
  email: string | null;
  nama_lengkap: string | null;
  approver_username: string | null;
}

const STATUS_COLORS: Record<Status, { color: string; bg: string; label: string }> = {
  PENDING:   { color: '#BA7517', bg: 'rgba(186,117,23,0.15)', label: 'Pending' },
  COOLDOWN:  { color: '#7C5CFC', bg: 'rgba(124,92,252,0.15)', label: 'Cooldown' },
  COMPLETED: { color: '#1D9E75', bg: 'rgba(29,158,117,0.15)', label: 'Completed' },
  REJECTED:  { color: '#E24B4A', bg: 'rgba(226,75,74,0.15)',  label: 'Rejected' },
  EXPIRED:   { color: '#8A8A95', bg: 'rgba(138,138,149,0.15)', label: 'Expired' },
  CANCELLED: { color: '#8A8A95', bg: 'rgba(138,138,149,0.15)', label: 'Cancelled' },
};

function StatusBadge({ s }: { s: Status }) {
  const m = STATUS_COLORS[s];
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: m.bg, color: m.color, whiteSpace: 'nowrap',
    }}>{m.label}</span>
  );
}

export function PromotionRequestsPanel() {
  const [tab, setTab]       = useState<Tab>('PENDING');
  const [rows, setRows]     = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [selected, setSelected] = useState<PromotionRow | null>(null);
  const [rejectingRow, setRejectingRow] = useState<PromotionRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const statusParam = tab === 'HISTORY' ? '' : `?status=${tab}`;
      const res = await fetch(`/api/admin/promotion/list${statusParam}`);
      const json = await res.json() as { ok: boolean; data?: PromotionRow[]; message?: string };
      if (!res.ok || !json.ok) {
        setError(json.message ?? 'Gagal load.');
        setRows([]);
      } else {
        // For HISTORY: filter out PENDING + COOLDOWN.
        const data = json.data ?? [];
        setRows(tab === 'HISTORY' ? data.filter((r) => !['PENDING','COOLDOWN'].includes(r.status)) : data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  async function handleApprove(id: number) {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/promotion/${id}/approve`, { method: 'POST' });
      const json = await res.json() as { ok: boolean; message?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.message ?? 'Gagal approve.');
      } else {
        setSelected(null);
        await load();
      }
    } finally { setActing(false); }
  }

  async function handleReject(id: number, reason: string) {
    if (reason.trim().length < 10) {
      toast.error('Alasan reject minimal 10 karakter.');
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`/api/admin/promotion/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json() as { ok: boolean; message?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.message ?? 'Gagal reject.');
      } else {
        setRejectingRow(null);
        setRejectReason('');
        setSelected(null);
        await load();
      }
    } finally { setActing(false); }
  }

  async function handleCancelCooldown(id: number) {
    if (!(await confirmDialog({ title: 'Batalkan Cooldown', message: 'Batalkan cooldown? User akan diberi notif.', confirmLabel: 'Batalkan', variant: 'warning' }))) return;
    setActing(true);
    try {
      const res = await fetch(`/api/admin/promotion/${id}/cancel-cooldown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by SA' }),
      });
      const json = await res.json() as { ok: boolean; message?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.message ?? 'Gagal cancel cooldown.');
      } else {
        await load();
      }
    } finally { setActing(false); }
  }

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Tab pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['PENDING', 'COOLDOWN', 'HISTORY'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '6px 14px', borderRadius: 999, border: 0, cursor: 'pointer',
              background: tab === t ? '#7C5CFC' : 'rgba(124,92,252,0.15)',
              color: tab === t ? '#fff' : '#7C5CFC',
              fontSize: 12, fontWeight: 600, fontFamily: 'Inter, sans-serif',
            }}
          >
            {t === 'HISTORY' ? 'History' : STATUS_COLORS[t].label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <PrimaButton variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </PrimaButton>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(226,75,74,0.15)', color: '#E24B4A',
          padding: '10px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12,
          border: '1px solid rgba(226,75,74,0.3)',
        }}>
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />{error}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(133,183,235,0.15)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(124,92,252,0.08)' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#85B7EB', fontWeight: 600 }}>Pemohon</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#85B7EB', fontWeight: 600 }}>From → To</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#85B7EB', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#85B7EB', fontWeight: 600 }}>Submitted</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#85B7EB', fontWeight: 600 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#85B7EB' }}>Tidak ada permohonan.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid rgba(133,183,235,0.1)' }}>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 600 }}>{r.nama_lengkap ?? r.username}</div>
                  <div style={{ fontSize: 11, color: '#85B7EB' }}>{r.username}</div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {ROLE_LABELS[r.from_role] ?? r.from_role} → <b>{ROLE_LABELS[r.to_role] ?? r.to_role}</b>
                  {r.is_bootstrap ? <span style={{ marginLeft: 6, fontSize: 10, color: '#BA7517' }}>(BOOTSTRAP)</span> : null}
                </td>
                <td style={{ padding: '10px 12px' }}><StatusBadge s={r.status} /></td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#85B7EB', whiteSpace: 'nowrap' }}>
                  {new Date(r.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <PrimaButton variant="ghost" size="sm" onClick={() => setSelected(r)}>Review</PrimaButton>
                  {r.status === 'COOLDOWN' && (
                    <PrimaButton variant="warning" size="sm" onClick={() => void handleCancelCooldown(r.id)} disabled={acting}>
                      Cancel Cooldown
                    </PrimaButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail modal — portal ke body supaya escape stacking context Admin Panel */}
      {selected && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(2,15,28,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 16,
          }}
        >
          <div style={{
            background: '#042C53', borderRadius: 14, padding: 24,
            width: '100%', maxWidth: 560, color: '#E6F1FB',
            border: '1px solid rgba(124,92,252,0.3)',
            maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Detail Permohonan #{selected.id}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', fontSize: 13, marginBottom: 16 }}>
              <span style={{ color: '#85B7EB' }}>Pemohon</span>
              <span><b>{selected.nama_lengkap ?? selected.username}</b> ({selected.username}){selected.email ? ` · ${selected.email}` : ''}</span>

              <span style={{ color: '#85B7EB' }}>Upgrade</span>
              <span>{ROLE_LABELS[selected.from_role] ?? selected.from_role} → <b>{ROLE_LABELS[selected.to_role] ?? selected.to_role}</b></span>

              <span style={{ color: '#85B7EB' }}>Status</span>
              <span><StatusBadge s={selected.status} /></span>

              <span style={{ color: '#85B7EB' }}>Submitted</span>
              <span>{new Date(selected.created_at).toLocaleString('id-ID')}</span>

              <span style={{ color: '#85B7EB' }}>IP</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{selected.ip_address ?? '-'}</span>

              <span style={{ color: '#85B7EB', alignSelf: 'flex-start' }}>Alasan</span>
              <span style={{ whiteSpace: 'pre-wrap' }}>{selected.reason}</span>

              {selected.rejected_reason && (
                <>
                  <span style={{ color: '#85B7EB', alignSelf: 'flex-start' }}>Alasan tolak</span>
                  <span style={{ color: '#E24B4A', whiteSpace: 'pre-wrap' }}>{selected.rejected_reason}</span>
                </>
              )}
              {selected.approver_username && (
                <>
                  <span style={{ color: '#85B7EB' }}>Approver</span>
                  <span>{selected.approver_username}</span>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => setSelected(null)} disabled={acting}>Tutup</PrimaButton>
              {selected.status === 'PENDING' && (
                <>
                  <PrimaButton variant="danger" onClick={() => setRejectingRow(selected)} disabled={acting} iconLeft={<X size={14} />}>
                    Reject
                  </PrimaButton>
                  <PrimaButton variant="success" onClick={() => void handleApprove(selected.id)} disabled={acting} iconLeft={<Check size={14} />}>
                    {acting ? 'Approving…' : 'Approve'}
                  </PrimaButton>
                </>
              )}
              {selected.status === 'COOLDOWN' && (
                <PrimaButton variant="warning" onClick={() => void handleCancelCooldown(selected.id)} disabled={acting} iconLeft={<Clock size={14} />}>
                  Cancel Cooldown
                </PrimaButton>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Reject modal — portal ke body */}
      {rejectingRow && typeof document !== 'undefined' && createPortal(
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setRejectingRow(null); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(2,15,28,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, padding: 16,
          }}
        >
          <div style={{
            background: '#042C53', borderRadius: 14, padding: 24,
            width: '100%', maxWidth: 440, color: '#E6F1FB',
            border: '1px solid rgba(226,75,74,0.3)',
            maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Reject permohonan #{rejectingRow.id}</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Alasan reject (min 10 karakter)…"
              style={{
                width: '100%', padding: 10, borderRadius: 6,
                background: '#020F1C', color: '#E6F1FB',
                border: '1px solid rgba(133,183,235,0.2)', resize: 'vertical',
                fontFamily: 'Inter, sans-serif', fontSize: 14, marginBottom: 12,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PrimaButton variant="ghost" onClick={() => { setRejectingRow(null); setRejectReason(''); }} disabled={acting}>Batal</PrimaButton>
              <PrimaButton variant="danger" onClick={() => void handleReject(rejectingRow.id, rejectReason)} disabled={acting}>
                {acting ? 'Rejecting…' : 'Reject'}
              </PrimaButton>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
