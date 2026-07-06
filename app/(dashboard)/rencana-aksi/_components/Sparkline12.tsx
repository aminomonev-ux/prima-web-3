'use client';

// Sparkline tren realisasi 12 bulan (SVG murni, tanpa library).
// Garis ungu = realisasi, garis putus abu = target bulanan, titik per bulan
// diwarnai capaian vs target (hitungCapaianPct — arah Progres Negatif ikut
// terbalik, R4). Bulan null (belum diisi) = gap di garis, bukan nol.

import type { RaJenis, MonthVal } from '../_lib/types';
import { BULAN_LABELS, hitungCapaianPct } from '../_lib/types';

interface Props {
  realisasi: MonthVal[];
  target: MonthVal[] | null;
  jenis: RaJenis;
}

const W = 640; const H = 92;
const PAD_X = 20; const PAD_TOP = 10; const PAD_BOT = 24;

export default function Sparkline12({ realisasi, target, jenis }: Props) {
  if (!realisasi.some(v => v != null)) return null;

  const vals = [...realisasi, ...(target ?? [])].filter((v): v is number => v != null);
  const max = Math.max(...vals, 1);
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / 11;
  const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP - PAD_BOT);

  const path = (arr: MonthVal[]): string => {
    let d = '';
    let pen = false;
    arr.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Tren realisasi 12 bulan">
      {target && target.some(v => v != null) && (
        <path d={path(target)} fill="none" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      <path d={path(realisasi)} fill="none" stroke="#7C5CFC" strokeWidth={2} strokeLinecap="round" />
      {realisasi.map((v, i) => {
        if (v == null) return null;
        const t = target?.[i];
        const ok = t != null && t > 0 ? hitungCapaianPct(t, v, jenis) >= 100 : null;
        const fill = ok == null ? '#7C5CFC' : ok ? '#1D9E75' : '#E24B4A';
        return <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={fill} stroke="#fff" strokeWidth={1} />;
      })}
      {BULAN_LABELS.map((b, i) => (
        <text key={b} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fontWeight={600} fill="#94A3B8">
          {b}
        </text>
      ))}
    </svg>
  );
}
