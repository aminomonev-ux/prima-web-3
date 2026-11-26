'use client';
// Pita alur di bawah tab BBA (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.1): rencanakan → putuskan → pesan →
// terima → catat. Angkanya dari GET /ringkas-alur (dihitung `tahapRencana`), tiap kotak tautan ke tab yang tepat.
// Kotak yang punya pekerjaan untuk pembaca (izin EDIT bagian itu + angka > 0) diberi warna; sisanya netral.
import Link from 'next/link';
import { useEffect, useState, type MouseEvent } from 'react';
import { fetchJson } from '@/lib/shared/api';
import type { RingkasAlur } from '@/lib/bba/tahap';
import type { MenuBba } from '@/lib/bba/peran';
import type { PetaIzinLayar } from './BbaNav';

type Warna = { text: string; sub: string; border: string };
/** Dipanggil sebelum pindah; `true` = sudah ditangani di halaman ini (mis. ganti tab Rencana tanpa navigasi). */
export type PindahPita = (halaman: MenuBba, tab: string) => boolean;

const MONO = "'JetBrains Mono', ui-monospace, monospace";

export default function PitaAlur({ tahun, peta, c, segarkan = 0, pindah }: { tahun: number; peta: PetaIzinLayar; c: Warna; segarkan?: number; pindah?: PindahPita }) {
  const [h, setH] = useState<RingkasAlur | null>(null);
  useEffect(() => {
    if (tahun < 2020 || tahun > 2100) return;
    let batal = false;
    void fetchJson<unknown>(`/api/buku-besar-aset/ringkas-alur?tahun=${tahun}`).then(d => {
      if (!batal && d.ok) setH(d as unknown as RingkasAlur);
    });
    return () => { batal = true; };
  }, [tahun, segarkan]);
  if (!h) return null;

  const kotak: Array<{ no: number; judul: string; isi: string; n: number; bagian: MenuBba; href: string; tab: string }> = [
    { no: 1, judul: 'Rencana', isi: `${h.perluDilengkapi} perlu dilengkapi`, n: h.perluDilengkapi, bagian: 'rencana', href: `/buku-besar-aset?tab=perlu&tahun=${tahun}`, tab: 'perlu' },
    { no: 2, judul: 'Anggaran', isi: `${h.menungguKeputusan} menunggu keputusan`, n: h.menungguKeputusan, bagian: 'rencana', href: `/buku-besar-aset?tab=siap&tahun=${tahun}`, tab: 'siap' },
    { no: 3, judul: 'Pengadaan', isi: [h.siapDipesan || !h.menungguBarang ? `${h.siapDipesan} siap dipesan` : '', h.menungguBarang ? `${h.menungguBarang} menunggu barang` : ''].filter(Boolean).join(' · '), n: h.siapDipesan + h.menungguBarang, bagian: 'pengadaan',
      href: `/buku-besar-aset/pengadaan?tab=${h.siapDipesan > 0 || h.menungguBarang === 0 ? 'siap' : 'dipesan'}&tahun=${tahun}`, tab: h.siapDipesan > 0 || h.menungguBarang === 0 ? 'siap' : 'dipesan' },
    { no: 4, judul: 'Buku Aset', isi: `${h.belumDicatat} unit belum dicatat`, n: h.belumDicatat, bagian: 'aset', href: '/buku-besar-aset/aset', tab: 'antrean' },
  ];

  return (
    <div aria-label={`Alur Buku Besar Aset ${tahun}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '-6px 0 16px' }}>
      {kotak.filter(k => peta[k.bagian] !== 'TIDAK').map(k => {
        const kerja = k.n > 0 && peta[k.bagian] === 'EDIT';
        const klik = (e: MouseEvent) => { if (pindah?.(k.bagian, k.tab)) e.preventDefault(); };
        return (
          <Link key={k.no} href={k.href} onClick={klik}
            style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, padding: '6px 10px', borderRadius: 10, textDecoration: 'none', fontSize: 12,
              border: `1px solid ${kerja ? '#EF9F27' : c.border}`, background: kerja ? 'rgba(239,159,39,.10)' : 'transparent', color: kerja ? c.text : c.sub }}>
            <b style={{ fontFamily: MONO, color: kerja ? '#EF9F27' : c.sub }}>{k.no}</b>
            <b style={{ color: kerja ? c.text : c.sub }}>{k.judul}:</b>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.isi}</span>
          </Link>
        );
      })}
    </div>
  );
}
