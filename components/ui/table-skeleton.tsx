// ─── PRIMA — Table & KPI Skeleton Loaders ─────────────────────────────────────
// O9: replace "Memuat..." text dengan shimmer skeleton supaya UX terlihat
// load-state yang lebih premium. Pakai dark-canvas palette PRIMA + animasi
// pulse subtle via CSS keyframes.
//
// Usage:
//   {loading ? <TableSkeleton rows={5} cols={7} /> : <table>...</table>}
//   {loadingKpi ? <KpiSkeleton count={6} /> : <KpiCards/>}

import React from 'react';

interface TableSkeletonProps {
  /** Jumlah baris dummy. Default 5. */
  rows?: number;
  /** Jumlah kolom dummy. Default 6. */
  cols?: number;
  /** Tinggi tiap baris (px). Default 36. */
  rowHeight?: number;
}

/** Shimmer skeleton untuk tabel — gantikan "Memuat..." spinner text. */
export function TableSkeleton({ rows = 5, cols = 6, rowHeight = 36 }: TableSkeletonProps) {
  return (
    <div style={{ padding: 0 }}>
      <style>{`
        @keyframes prima-skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .prima-skeleton-cell {
          background: linear-gradient(90deg, rgba(12,68,124,.25) 0%, rgba(24,95,165,.35) 50%, rgba(12,68,124,.25) 100%);
          background-size: 200% 100%;
          animation: prima-skeleton-pulse 1.4s ease-in-out infinite;
          border-radius: 4px;
        }
      `}</style>
      <div style={{ display:'flex', flexDirection:'column', gap:'6px', padding:'12px' }}>
        {/* Header row */}
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:'8px', marginBottom:'8px' }}>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={`h-${i}`} className="prima-skeleton-cell" style={{ height: 14, opacity: 0.7 }} />
          ))}
        </div>
        {/* Body rows */}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:'8px' }}>
            {Array.from({ length: cols }).map((_, c) => (
              <div key={`c-${r}-${c}`} className="prima-skeleton-cell" style={{ height: rowHeight - 12 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface KpiSkeletonProps {
  /** Jumlah KPI card. Default 6. */
  count?: number;
  /** Grid kolom CSS. Default 'repeat(3, 1fr)'. */
  columns?: string;
}

/** Shimmer skeleton untuk grid KPI cards (Dashboard, Laporan). */
export function KpiSkeleton({ count = 6, columns = 'repeat(3, 1fr)' }: KpiSkeletonProps) {
  return (
    <div>
      <style>{`
        @keyframes prima-kpi-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.85; }
        }
      `}</style>
      <div style={{ display:'grid', gridTemplateColumns: columns, gap:'14px' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{
            borderRadius: 14,
            padding: '16px 18px',
            background: 'rgba(12,68,124,.15)',
            border: '1px solid rgba(12,68,124,.4)',
            animation: 'prima-kpi-pulse 1.4s ease-in-out infinite',
            animationDelay: `${i * 80}ms`,
            minHeight: 90,
          }}>
            <div style={{ width: '50%', height: 10, borderRadius: 3, background:'rgba(133,183,235,.25)', marginBottom: 10 }} />
            <div style={{ width: '70%', height: 22, borderRadius: 4, background:'rgba(133,183,235,.35)', marginBottom: 8 }} />
            <div style={{ width: '40%', height: 10, borderRadius: 3, background:'rgba(133,183,235,.2)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
