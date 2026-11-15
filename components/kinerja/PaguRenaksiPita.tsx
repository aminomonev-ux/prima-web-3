'use client';
// Pita "pagu Rencana Aksi vs RKO" di layar RKO (docs/CONCEPT-renaksi-pagu-rko.md Tahap B,
// docs/CONCEPT-renaksi-rko-murni-perubahan.md). Hanya menampilkan. Tab yang sedang dibuka dihitung
// dari ISI LAYAR (ketikan belum tersimpan ikut), tab lain dari server — aturannya satu:
// lib/kinerja/pagu-renaksi.ts. Versi murni dibandingkan dengan pagu murni Renaksi, versi perubahan
// dengan pagu yang berlaku.

import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/lib/shared/api';
import { uiTheme } from '@/lib/theme';
import {
  agregatRko, bandingDua, kalimatBelumPerubahan, kalimatLebih, kunciSub, melampaui, seragam,
  type AgregatRko, type BahanBandingPagu, type RekeningSumberDana,
} from '@/lib/kinerja/pagu-renaksi';
import { tulisPerSumber } from '@/lib/renaksi/pagu';
import { rapikanNamaEntitas } from '@/lib/shared/nama-resmi';
import type { SskRow } from '@/app/(dashboard)/kinerja/_types';

export type BahanPita = BahanBandingPagu & { rekening: RekeningSumberDana[] };

/** Bahan pita dari server — dipakai juga dialog Buat Perubahan (apakah Renaksi sudah perubahan). */
export function useBahanPaguRenaksi(tahun: string, muatUlang: number): BahanPita | null {
  const [bahan, setBahan] = useState<BahanPita | null>(null);
  useEffect(() => {
    let batal = false;
    void (async () => {
      const d = await fetchJson<unknown>(`/api/kinerja/pagu-renaksi?tahun=${tahun}`);
      if (!batal) setBahan(d.ok ? d as unknown as BahanPita : null);
    })();
    return () => { batal = true; };
  }, [tahun, muatUlang]);
  return bahan;
}

interface Props {
  tahun: string;
  tab: string;
  rows: SskRow[];
  bahan: BahanPita | null;
  /** Jenis versi yang dibuka di layar. */
  versiTipe: 'MURNI' | 'PERUBAHAN';
  /** Layar membuka versi TERBARU tab ini — hanya saat itu isi layar menggantikan angka server. */
  layarTerbaru: boolean;
  isLight: boolean;
}

const rp = (n: number | null | undefined) => (n == null ? '—' : `Rp ${n.toLocaleString('id-ID')}`);
const ganti = (xs: AgregatRko[], tab: string, layar: AgregatRko[]) => [...xs.filter(a => a.tab !== tab), ...layar];

export default function PaguRenaksiPita({ tahun, tab, rows, bahan, versiTipe, layarTerbaru, isLight }: Props) {
  const t = uiTheme(isLight);

  const hasil = useMemo(() => {
    if (!bahan) return null;
    const layar = layarTerbaru ? agregatRko(rows.map(r => ({ ...r, tab })), bahan.rekening) : [];
    // Versi terbaru yang dibuka menggantikan angka server tab ini: kalau ia MURNI, ia sekaligus versi
    // murni dan versi yang berlaku tab ini.
    const h = bandingDua({
      ...bahan,
      rkoMurni: layarTerbaru && versiTipe === 'MURNI' ? ganti(bahan.rkoMurni, tab, layar) : bahan.rkoMurni,
      rkoTerbaru: layarTerbaru ? ganti(bahan.rkoTerbaru, tab, layar) : bahan.rkoTerbaru,
    });
    const satu = seragam(h);
    const utama = versiTipe === 'MURNI' && !satu ? h.murni : h.perubahan;
    const kunciLayar = new Set(rows.map(r => kunciSub(r.program, r.kegiatan, r.subkegiatan)));
    // Versi murni yang masih terbaru, sesudah Renaksi memasuki anggaran perubahan: pembanding
    // perubahan hanya diberitahukan (tidak menahan Simpan).
    const infoPerubahan = versiTipe === 'MURNI' && layarTerbaru && h.renaksiPerubahan
      ? new Map(h.perubahan.sub.filter(melampaui).map(b => [b.kunci, b])) : new Map();
    return {
      satu, renaksiPerubahan: h.renaksiPerubahan,
      sub: utama.sub.filter(b => kunciLayar.has(b.kunci)),
      diLuar: utama.diLuarRenaksi.filter(d => kunciLayar.has(kunciSub(d.program, d.kegiatan, d.sub_kegiatan))),
      infoPerubahan,
    };
  }, [bahan, rows, tab, layarTerbaru, versiTipe]);

  if (!hasil || (hasil.sub.length === 0 && hasil.diLuar.length === 0)) return null;
  const lewat = hasil.sub.filter(melampaui).length;
  const murni = versiTipe === 'MURNI';
  const pembanding = hasil.satu ? 'pagu Rencana Aksi'
    : murni || !hasil.renaksiPerubahan ? 'pagu murni Rencana Aksi' : 'pagu perubahan Rencana Aksi';
  const sumberRko = hasil.satu ? 'versi terbaru semua tab' : murni ? 'versi murni semua tab' : 'versi yang berlaku di semua tab';

  return (
    <div style={{ background: t.card, border: `1px solid ${lewat ? '#E24B4A' : t.hairline}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, boxShadow: t.shadow }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 6 }}>
        Pagu Rencana Aksi {tahun} per sub kegiatan
        <span style={{ fontWeight: 400, color: t.textSub }}>
          {' '}— dibandingkan dengan {pembanding}; RKO dari {sumberRko}{layarTerbaru ? `, tab ${tab} dari isi layar` : ''}
        </span>
      </div>
      {!murni && !hasil.satu && !hasil.renaksiPerubahan && (
        <div style={{ fontSize: 11, color: '#BA7517', marginBottom: 6, lineHeight: 1.5 }}>{kalimatBelumPerubahan(tahun)}</div>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {hasil.sub.map(b => {
          const lebih = melampaui(b);
          const rkoTanpaSumber = b.rko.perSumber.find(s => s.sumber === '')?.nilai ?? 0;
          const info = hasil.infoPerubahan.get(b.kunci);
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
              {lebih && <div style={{ color: '#E24B4A', fontWeight: 700 }}>Melebihi {pembanding}: {kalimatLebih(b)}</div>}
              {info && (
                <div style={{ color: '#BA7517' }}>
                  Pagu perubahan Rencana Aksi lebih kecil dari RKO yang berlaku sekarang ({kalimatLebih(info)}).
                  Buat versi perubahan RKO {tab}, lalu sesuaikan pagunya.
                </div>
              )}
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
