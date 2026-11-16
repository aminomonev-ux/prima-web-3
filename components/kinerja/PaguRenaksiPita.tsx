'use client';
// Pita "pagu Rencana Aksi vs RKO" di layar RKO (docs/CONCEPT-renaksi-pagu-rko.md Tahap B,
// docs/CONCEPT-renaksi-rko-murni-perubahan.md). Hanya menampilkan. Tab yang sedang dibuka dihitung
// dari ISI LAYAR (ketikan belum tersimpan ikut), tab lain dari server — aturannya satu:
// lib/kinerja/pagu-renaksi.ts. Versi murni dibandingkan dengan pagu murni Renaksi, versi perubahan
// dengan pagu yang berlaku.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  const jenisPagu = hasil.satu ? 'pagu' : murni || !hasil.renaksiPerubahan ? 'pagu murni' : 'pagu perubahan';
  const versiRko = hasil.satu ? '' : murni ? ' versi murni' : ' versi yang sedang berlaku';
  const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

  return (
    <div style={{ background: t.card, border: `1px solid ${lewat ? '#E24B4A' : t.hairline}`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, boxShadow: t.shadow }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>Batas pagu dari Rencana Aksi {tahun}</div>
      <div style={{ fontSize: 11.5, color: t.textSub, lineHeight: 1.55, marginTop: 2, marginBottom: 8 }}>
        Jumlah RKO tiap sub kegiatan tidak boleh melebihi {jenisPagu} yang tercatat di Rencana Aksi.
        {' '}RKO dijumlahkan dari semua tab{versiRko}
        {layarTerbaru ? `; untuk tab ${tab} dipakai angka di layar ini, termasuk yang belum disimpan.` : '.'}
      </div>
      {!murni && !hasil.satu && !hasil.renaksiPerubahan && (
        <div style={{ fontSize: 11.5, color: '#BA7517', marginBottom: 8, lineHeight: 1.55 }}>{kalimatBelumPerubahan(tahun)}</div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {hasil.sub.map(b => {
          const lebih = melampaui(b);
          const rkoTanpaSumber = b.rko.perSumber.find(s => s.sumber === '')?.nilai ?? 0;
          const info = hasil.infoPerubahan.get(b.kunci);
          const angka = (label: string, isi: ReactNode) => (
            <div style={{ minWidth: 150 }}>
              <div style={{ fontSize: 10.5, color: t.textSub }}>{label}</div>
              <div style={{ ...mono, fontSize: 12, fontWeight: 600 }}>{isi}</div>
            </div>
          );
          return (
            <div key={b.kunci} style={{ fontSize: 11.5, color: t.text, lineHeight: 1.55 }}>
              <div>
                <b>{rapikanNamaEntitas(b.sub_kegiatan)}</b>
                <span style={{ color: t.textSub }}> — kegiatan {rapikanNamaEntitas(b.kegiatan)}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 24px', marginTop: 4 }}>
                {angka('Pagu di Rencana Aksi', b.renaksi ? rp(b.renaksi.total) : <span style={{ color: t.textSub, fontFamily: 'inherit', fontWeight: 400 }}>belum diisi</span>)}
                {angka('Sudah dipakai RKO', rp(b.rko.total))}
                {angka('Sisa', (
                  <span style={b.sisa == null
                    ? { color: t.textSub, fontFamily: 'inherit', fontWeight: 400 }
                    : { color: b.sisa < 0 ? '#E24B4A' : '#1D9E75' }}>
                    {b.sisa == null ? 'tidak diperiksa' : b.sisa < 0 ? `lebih ${rp(-b.sisa)}` : rp(b.sisa)}
                  </span>
                ))}
              </div>
              {!b.renaksi && (
                <div style={{ color: t.textSub, marginTop: 2 }}>
                  Pagu sub kegiatan ini belum diisi di Rencana Aksi, jadi RKO-nya belum bisa diperiksa.
                </div>
              )}
              {b.renaksi && (b.renaksi.perSumber.some(s => s.sumber) || b.rko.perSumber.some(s => s.sumber)) && (
                <div style={{ color: t.textSub, marginTop: 2 }}>
                  Per sumber dana — Rencana Aksi: {tulisPerSumber(b.renaksi) || 'belum dirinci'}; RKO: {tulisPerSumber(b.rko) || 'belum dirinci'}
                </div>
              )}
              {lebih && (
                <div style={{ color: '#E24B4A', fontWeight: 700, marginTop: 2 }}>
                  RKO melebihi {jenisPagu} Rencana Aksi ({kalimatLebih(b)}).
                </div>
              )}
              {info && (
                <div style={{ color: '#BA7517', marginTop: 2 }}>
                  Pagu perubahan di Rencana Aksi lebih kecil dari RKO sekarang ({kalimatLebih(info)}).
                  {' '}Buat versi perubahan RKO {tab}, lalu sesuaikan angkanya.
                </div>
              )}
              {b.renaksi && !b.cekPerSumber && (
                <div style={{ color: '#BA7517', marginTop: 2 }}>
                  Sebagian pagu di Rencana Aksi belum diberi sumber dana, jadi yang dibandingkan hanya totalnya.
                  {' '}Lengkapi lewat tombol ✎ di Data Entry Rencana Aksi.
                </div>
              )}
              {b.cekPerSumber && rkoTanpaSumber > 0 && (
                <div style={{ color: '#BA7517', marginTop: 2 }}>
                  {rp(rkoTanpaSumber)} dari RKO ini berasal dari rekening yang sumber dananya belum diisi.
                  {' '}Isi kolom Sumber Anggaran di menu Rekening agar ikut dibandingkan per sumber dana.
                </div>
              )}
            </div>
          );
        })}
        {hasil.diLuar.map(d => (
          <div key={kunciSub(d.program, d.kegiatan, d.sub_kegiatan)} style={{ fontSize: 11.5, color: t.textSub, lineHeight: 1.55 }}>
            <b style={{ color: t.text }}>{rapikanNamaEntitas(d.sub_kegiatan)}</b> tidak ada di Rencana Aksi {tahun}, jadi tidak diperiksa
            {' '}(RKO <span style={mono}>{rp(d.rko.total)}</span>).
          </div>
        ))}
      </div>
    </div>
  );
}
