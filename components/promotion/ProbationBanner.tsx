'use client';

// Banner "⚠ Probationary period — N hari tersisa" — tampil di topbar saat
// user lagi dalam masa probation setelah promotion completed.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §9G.

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/constants';

interface ProbationInfo {
  until: string;      // ISO datetime
  fromRole: string;
  currentRole: string;
}

interface Props {
  /** Kalau provided, banner pakai data ini. Kalau tidak, self-fetch dari /api/auth/me. */
  probation?: ProbationInfo | null;
}

export function ProbationBanner({ probation: initialProbation }: Props) {
  const [probation, setProbation] = useState<ProbationInfo | null>(initialProbation ?? null);
  const [loading, setLoading] = useState(initialProbation === undefined);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (initialProbation !== undefined) return;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const json = await res.json() as {
          ok: boolean;
          role?: string;
          probationaryUntil?: string | null;
          probationaryFromRole?: string | null;
        };
        if (json.ok && json.probationaryUntil && json.probationaryFromRole && json.role) {
          setProbation({
            until:       json.probationaryUntil,
            fromRole:    json.probationaryFromRole,
            currentRole: json.role,
          });
        }
      } catch { /* silent */ } finally {
        setLoading(false);
      }
    })();
  }, [initialProbation]);

  if (loading || !probation) return null;
  const untilMs = new Date(probation.until).getTime();
  if (untilMs <= now) return null;

  const daysLeft = Math.max(0, Math.ceil((untilMs - now) / (24 * 60 * 60 * 1000)));
  const fromLabel = ROLE_LABELS[probation.fromRole] ?? probation.fromRole;
  const curLabel  = ROLE_LABELS[probation.currentRole] ?? probation.currentRole;

  return (
    <div role="status" className="promo-banner">
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <b>Probationary Period</b> · {daysLeft} hari tersisa
        <span style={{ marginLeft: 8, color: '#85B7EB' }}>
          ({fromLabel} → {curLabel})
        </span>
      </div>
    </div>
  );
}
