'use client';
// Pita "pagu Rencana Aksi vs RKO" di layar RKO (docs/CONCEPT-renaksi-pagu-rko.md Tahap B).
// Hanya menampilkan. Tab yang sedang dibuka dihitung dari ISI LAYAR (ketikan belum tersimpan ikut),
// tab lain dari server — aturannya satu: lib/kinerja/pagu-renaksi.ts.

import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/shared/api';
import { uiTheme } from '@/lib/theme';
import {
  agregatRko, bandingPaguRenaksi, kalimatLebih, kunciSub, melampaui,
  type AgregatRko, type RekeningSumberDana,
} from '@/lib/kinerja/pagu-renaksi';
import { tulisPerSumber, type PaguSubRenaksi } from '@/lib/renaksi/pagu';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import type { SskRow } from '@/app/(dashboard)/kinerja/_types';

interface Bahan { renaksi: PaguSubRenaksi[]; rko: AgregatRko[]; rekening: RekeningSumberDana[] }

interface Props {
  tahun: string;
  tab: string;
  rows: SskRow[];
  /** Layar membuka versi TERBARU tab ini — hanya saat itu isi layar menggantikan angka server. */
  layarTerbaru: boolean;
  /** Berganti tiap simpanan tersimpan → muat ulang angka tab lain. */
  muatUlang: number;
  isLight: boolean;
}

const rp = (n: number | null | undefined) => (n == null ? '—' : `Rp ${n.toLocaleString('id-ID')}`);

export default function PaguRenaksiPita({ tahun, tab, rows, layarTerbaru, muatUlang, isLight }: Props) {
  const [bahan, setBahan] = useState<Bahan | null>(null);
  const t = uiTheme(isLight);

  useEffect(() => {
    let batal = false;
    void (async () => {
      const d = await fetchJson<unknown>(`/api/kinerja/pagu-renaksi?tahun=${tahun}`);
      if (!batal) setBahan(d.ok ? d as unknown as Bahan : null);
    })();
    return () => { batal = true; };
  }, [tahun, muatUlang]);

  const hasil = useMemo(() => {
    if (!bahan) return null;
    const layar = layarTerbaru
      ? agregatRko(rows.map(r => ({ ...r, tab })), bahan.rekening)
      : [];
    const rko = layarTerbaru ? [...bahan.rko.filter(a => a.tab !== tab), ...layar] : bahan.rko;
    const kunciLayar = new Set(rows.map(r => kunciSub(r.program, r.kegiatan, r.subkegiatan)));
    const h = bandingPaguRenaksi(bahan.renaksi, rko);
    return {
      sub: h.sub.filter(b => kunciLayar.has(b.kunci)),
      diLuar: h.diLuarRenaksi.filter(d => kunciLayar.has(kunciSub(d.program, d.kegiatan, d.sub_kegiatan))),
    };
  }, [bahan, rows, tab, layarTerbaru]);

  if (!hasil || (hasil.sub.length === 0 && hasil.diLuar.length === 0)) return null;
  const lewat = hasil.sub.filter(melampaui).length;

  return (
    <div style={{ background: t.card, border: `1px solid ${lewat ? '#E24B4A' : t.hairline}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, boxShadow: t.shadow }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>
        Pagu Rencana Aksi {tahun} per sub kegiatan
        <span style={{ fontWeight: 400, color: t.textSub }}>
          {' '}— RKO dihitung dari versi terbaru semua tab{layarTerbaru ? `, tab ${tab} dari isi layar` : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {hasil.sub.map(b => {
          const lebih = melampaui(b);
          const rkoTanpaSumber = b.rko.perSumber.find(s => s.sumber === '')?.nilai ?? 0;
          return (
            <div key={b.kunci} style={{ fontSize: 11, color: t.text, lineHeight: 1.5 }}>
              <b>{rapikanNamaEntitas(b.sub_kegiatan)}</b>
              <span style={{ color: t.textSub }}> · {rapikanNamaEntitas(b.kegiatan)}</span>
              <div style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
                Pagu Renaksi {rp(b.renaksi?.total)} · RKO semua tab {rp(b.rko.total)} · sisa{' '}
                <b style={{ color: b.sisa == null ? t.textSub : b.sisa < 0 ? '#E24B4A' : '#1D9E75' }}>{b.sisa == null ? 'tanpa batas' : rp(b.sisa)}</b>
              </div>
              {(b.renaksi?.perSumber.some(s => s.sumber) || b.rko.perSumber.some(s => s.sumber)) && (
                <div style={{ color: t.textSub }}>
                  Renaksi: {tulisPerSumber(b.renaksi) || '—'} · RKO: {tulisPerSumber(b.rko) || '—'}
                </div>
              )}
              {lebih && <div style={{ color: '#E24B4A', fontWeight: 700 }}>Melampaui pagu Rencana Aksi: {kalimatLebih(b)}</div>}
              {b.renaksi && !b.cekPerSumber && (
                <div style={{ color: '#BA7517' }}>
                  Sebagian pagu Renaksi belum bersumber dana — hanya total yang dibandingkan (atur lewat ✎ di Data Entry Renaksi).
                </div>
              )}
              {b.cekPerSumber && rkoTanpaSumber > 0 && (
                <div style={{ color: '#BA7517' }}>
                  {rp(rkoTanpaSumber)} RKO berasal dari rekening yang sumber dananya belum diisi — isi kolom Sumber Anggaran di menu Rekening supaya ikut dibandingkan per sumber.
                </div>
              )}
            </div>
          );
        })}
        {hasil.diLuar.map(d => (
          <div key={kunciSub(d.program, d.kegiatan, d.sub_kegiatan)} style={{ fontSize: 11, color: t.textSub }}>
            <b style={{ color: t.text }}>{rapikanNamaEntitas(d.sub_kegiatan)}</b> — di luar Rencana Aksi {tahun} (tidak diperiksa), RKO {rp(d.rko.total)}
          </div>
        ))}
      </div>
    </div>
  );
}
