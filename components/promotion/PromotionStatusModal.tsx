'use client';

// Modal "Status Permohonan" — requester view of own active request.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §9C.

import { useEffect, useState } from 'react';
import { X, Clock, CheckCircle2, XCircle } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { ROLE_LABELS } from '@/lib/constants';

interface ActiveRequest {
  id: number;
  toRole: string;
  status: 'PENDING' | 'COOLDOWN';
  createdAt: string;
  cooldownUntil: string | null;
}

interface Props {
  activeRequest: ActiveRequest;
  onClose: () => void;
  onCancelled: () => void;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; icon: React.ReactNode; label: string }> = {
    PENDING:  { color: '#BA7517', bg: 'rgba(186,117,23,0.15)',  icon: <Clock size={14} />,        label: 'Menunggu Review' },
    COOLDOWN: { color: '#7C5CFC', bg: 'rgba(124,92,252,0.15)',  icon: <CheckCircle2 size={14} />, label: 'Approved — Cooldown' },
  };
  const s = map[status] ?? { color: '#85B7EB', bg: 'rgba(133,183,235,0.15)', icon: null, label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 999,
      background: s.bg, color: s.color, fontSize: 12, fontWeight: 600,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

function fmtRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PromotionStatusModal({ activeRequest, onClose, onCancelled }: Props) {
  const [cancelling, setCancelling] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (activeRequest.status !== 'COOLDOWN' || !activeRequest.cooldownUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeRequest.status, activeRequest.cooldownUntil]);

  async function handleCancel() {
    setErrorMsg('');
    setCancelling(true);
    try {
      const res = await fetch('/api/auth/promotion/cancel', { method: 'POST' });
      let json: { ok: boolean; message?: string };
      try { json = await res.json(); } catch { json = { ok: false, message: `HTTP ${res.status}` }; }
      if (!res.ok || !json.ok) {
        setErrorMsg(json.message ?? 'Gagal membatalkan.');
        return;
      }
      onCancelled();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setCancelling(false);
    }
  }

  const cooldownMs = activeRequest.cooldownUntil
    ? new Date(activeRequest.cooldownUntil).getTime() - now
    : 0;

  return (
    <div
      className="promo-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="promo-modal-box compact">
        <div className="promo-modal-header">
          <h2 className="promo-modal-title">Status Permohonan</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="promo-modal-close">
            <X size={18} />
          </button>
        </div>

        <div className="promo-modal-form">
          <div>
            <div className="promo-label">Status</div>
            <StatusBadge status={activeRequest.status} />
          </div>

          <div>
            <div className="promo-label">Target Role</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {ROLE_LABELS[activeRequest.toRole] ?? activeRequest.toRole}
            </div>
          </div>

          <div>
            <div className="promo-label">Diajukan</div>
            <div style={{ fontSize: 13 }}>
              {new Date(activeRequest.createdAt).toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>

          {activeRequest.status === 'COOLDOWN' && activeRequest.cooldownUntil && (
            <div className="promo-info-cooldown">
              <Clock size={20} color="#7C5CFC" />
              <div style={{ flex: 1 }}>
                <div className="promo-label">Role aktif dalam</div>
                <div className="promo-countdown">{fmtRemaining(cooldownMs)}</div>
              </div>
            </div>
          )}

          {activeRequest.status === 'PENDING' && (
            <div className="promo-info-pending">
              Menunggu Super Admin review. Permohonan otomatis EXPIRED kalau tidak di-review dalam 48 jam.
            </div>
          )}

          {errorMsg && (
            <div className="promo-error">
              <XCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
              {errorMsg}
            </div>
          )}

          <div className="promo-actions">
            <PrimaButton type="button" variant="ghost" onClick={onClose} disabled={cancelling}>
              Tutup
            </PrimaButton>
            <PrimaButton type="button" variant="danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Membatalkan…' : 'Batalkan Permohonan'}
            </PrimaButton>
          </div>
        </div>
      </div>
    </div>
  );
}
