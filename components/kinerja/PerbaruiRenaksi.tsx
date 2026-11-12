'use client';
// Pemberitahuan "Rencana Aksi berubah" + dialog Perbarui di tab Master & Rekening E-Anggaran.
// Konsep: docs/CONCEPT-renaksi-terhubung.md §5.4–5.5. Pembandingnya murni
// (lib/kinerja/banding-renaksi.ts); tampilannya komponen bersama components/renaksi/SelarasRenaksi.
// Yang menulis tetap jalur lama: Edit Master yang menjalar (ganti nama), Init Renaksi (baru),
// dan route asal (tanda). Tidak ada pintu tulis kedua.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import { SpandukSelaras, DialogSelaras, type BagianSelaras } from '@/components/renaksi/SelarasRenaksi';
import {
  jumlahPerubahan, kalimatSpanduk, type HasilBanding, type ItemEntri,
} from '@/lib/kinerja/banding-renaksi';
import { jumlahJalaran, kalimatJalaran, labelTipeMaster, type DampakData } from '@/lib/kinerja/master-ubah';

const JEDA_MUAT_ULANG_MS = 15 * 60 * 1000;

/**
 * Dimuat saat dibuka / ganti tahun, dan lagi saat tab peramban kembali aktif sesudah 15 menit
 * (pola pengingat LKJIP). Gagal memuat = diam: pemberitahuan bukan syarat bekerja.
 */
export function useBandingRenaksi(tahun: string) {
  // Ditandai tahunnya: hasil tahun sebelumnya tidak ikut tampil selama tahun baru dimuat.
  const [muatan, setMuatan] = useState<{ tahun: string; hasil: HasilBanding | null }>({ tahun, hasil: null });
  const hasil = muatan.tahun === tahun ? muatan.hasil : null;
  const terakhir = useRef(0);
  const giliran = useRef(0);

  const muat = useCallback(async () => {
    const ke = ++giliran.current;
    terakhir.current = Date.now();
    const d = await fetchJson<unknown>(`/api/kinerja/master/banding-renaksi?tahun=${encodeURIComponent(tahun)}`);
    if (ke !== giliran.current) return;
    setMuatan({ tahun, hasil: d.ok ? (d as unknown as HasilBanding) : null });
  }, [tahun]);

  useEffect(() => {
    void muat();
    const saatTampil = () => {
      if (document.visibilityState === 'visible' && Date.now() - terakhir.current >= JEDA_MUAT_ULANG_MS) void muat();
    };
    document.addEventListener('visibilitychange', saatTampil);
    return () => document.removeEventListener('visibilitychange', saatTampil);
  }, [muat]);

  return { hasil, muat, jumlah: hasil ? jumlahPerubahan(hasil) : 0 };
}

export function SpandukRenaksi({ hasil, tahun, onBuka }: {
  hasil: HasilBanding | null; tahun: string; onBuka: () => void;
}) {
  const kalimat = hasil && jumlahPerubahan(hasil) > 0 ? kalimatSpanduk(hasil, tahun) : null;
  return <SpandukSelaras kalimat={kalimat} onBuka={onBuka} />;
}

interface HasilUbah { berubah: boolean; gabung_ke: string | null; anak: number; data: DampakData }
type Pratinjau = { ok: true; hasil: HasilUbah } | { ok: false; pesan: string };

const kunciGanti = (id: number) => `g${id}`;
const kunciBaru = (kunci: string) => `b${kunci}`;
const kunciHilang = (id: number) => `h${id}`;
const kunciTanda = (id: number) => `t${id}`;

function jalurTeks(e: { program_ref: string | null; kegiatan_ref: string | null }): string {
  return [e.program_ref, e.kegiatan_ref].filter(Boolean).join(' › ');
}

/**
 * Bawaan: ganti nama & baru tercentang (memang perubahan Renaksi), "jadikan manual" & "tandai"
 * tidak (pilihan, bukan perubahan). Diterapkan berurutan: ganti nama (program → kegiatan →
 * sub), lalu baru, lalu tanda. Yang gagal disebut, yang berhasil tetap.
 */
export function PerbaruiRenaksiModal({ tahun, hasil, isLight, canEdit, onTutup, onSelesai }: {
  tahun: string; hasil: HasilBanding; isLight?: boolean; canEdit: boolean;
  onTutup: () => void; onSelesai: () => void;
}) {
  const [pratinjau, setPratinjau] = useState<Record<number, Pratinjau>>({});

  useEffect(() => {
    let batal = false;
    (async () => {
      for (const g of hasil.gantiNama) {
        const d = await fetchJson<unknown>(`/api/kinerja/master/${g.id}`, { method: 'PUT', body: JSON.stringify({ nama: g.ke, dry: true }) });
        if (batal) return;
        setPratinjau(p => ({ ...p, [g.id]: d.ok ? { ok: true, hasil: d as unknown as HasilUbah } : { ok: false, pesan: d.message || 'Tidak bisa diperiksa' } }));
      }
    })();
    return () => { batal = true; };
  }, [hasil.gantiNama]);

  async function terapkan(pilih: Set<string>) {
    const gagal: string[] = [];
    let ganti = 0, baru = 0, manual = 0, tanda = 0;
    const urut = { program: 0, kegiatan: 1, subkegiatan: 2 } as const;
    const daftar = hasil.gantiNama.filter(g => pilih.has(kunciGanti(g.id))).sort((a, b) => urut[a.tipe] - urut[b.tipe]);
    for (const g of daftar) {
      const p = pratinjau[g.id];
      const gabung = !!(p && p.ok && p.hasil.gabung_ke);
      const d = await fetchJson<unknown>(`/api/kinerja/master/${g.id}`, { method: 'PUT', body: JSON.stringify({ nama: g.ke, gabung }) });
      if (d.ok) ganti++; else gagal.push(`${labelTipeMaster(g.tipe)} "${g.nama}": ${d.message || 'gagal'}`);
    }
    const pilihBaru = hasil.baru.filter(b => pilih.has(kunciBaru(b.kunci))).map(b => b.kunci);
    if (pilihBaru.length > 0) {
      const d = await fetchJson<unknown>('/api/kinerja/master/init-renaksi', { method: 'POST', body: JSON.stringify({ tahun, pilih: pilihBaru }) });
      if (d.ok) {
        const r = d as unknown as { programInserted: number; kegiatanInserted: number; subkegiatanInserted: number };
        baru = r.programInserted + r.kegiatanInserted + r.subkegiatanInserted;
      } else gagal.push(`Entri baru: ${d.message || 'gagal'}`);
    }
    const kirimAsal = async (ids: number[], asal: 'MANUAL' | 'RENAKSI') => {
      if (ids.length === 0) return 0;
      const d = await fetchJson<unknown>('/api/kinerja/master/asal', { method: 'POST', body: JSON.stringify({ tahun, ids, asal }) });
      if (!d.ok) { gagal.push(`${asal === 'MANUAL' ? 'Jadikan manual' : 'Tandai dari Renaksi'}: ${d.message || 'gagal'}`); return 0; }
      return (d as unknown as { diubah: number }).diubah;
    };
    manual = await kirimAsal(hasil.hilang.filter(e => pilih.has(kunciHilang(e.id))).map(e => e.id), 'MANUAL');
    tanda = await kirimAsal(hasil.belumBertanda.filter(e => pilih.has(kunciTanda(e.id))).map(e => e.id), 'RENAKSI');

    const ringkas = [
      ganti ? `${ganti} berganti nama` : '', baru ? `${baru} entri baru` : '',
      manual ? `${manual} dijadikan manual` : '', tanda ? `${tanda} ditandai dari Renaksi` : '',
    ].filter(Boolean).join(', ');
    if (gagal.length) toast.error(`${ringkas ? `Sebagian diterapkan (${ringkas}). ` : ''}Gagal:\n${gagal.join('\n')}`, { duration: 12000 });
    else toast.success(`Master diperbarui dari Rencana Aksi ${tahun}: ${ringkas}.`);
    onSelesai();
  }

  const sub = isLight ? '#6B7280' : '#85B7EB';
  const entri = (e: ItemEntri) => (
    <><b>{labelTipeMaster(e.tipe)}</b> {e.nama}{jalurTeks(e) && <span style={{ color: sub }}> — {jalurTeks(e)}</span>}</>
  );
  const bagian: BagianSelaras[] = [
    {
      judul: 'Berganti nama', ket: 'Diganti lewat Edit Master yang menjalar.',
      items: hasil.gantiNama.map(g => {
        const p = pratinjau[g.id];
        const ket = !p ? 'Memeriksa dampak…'
          : !p.ok ? `Tidak bisa diterapkan: ${p.pesan}`
          : [
            p.hasil.gabung_ke ? `"${p.hasil.gabung_ke}" sudah ada di Master — entri ini akan digabung ke sana.` : '',
            p.hasil.anak ? `${p.hasil.anak} entri di bawahnya ikut pindah.` : '',
            jumlahJalaran(p.hasil.data) ? `Ikut berganti nama:\n${kalimatJalaran(p.hasil.data)}` : '',
          ].filter(Boolean).join('\n');
        return {
          kunci: kunciGanti(g.id), bawaan: true, mati: !!p && !p.ok, ket: ket || undefined,
          isi: <><b>{labelTipeMaster(g.tipe)}</b> {g.nama} → <b>{g.ke}</b></>,
        };
      }),
    },
    {
      judul: 'Baru di Rencana Aksi', ket: 'Ditambahkan ke Master dengan tanda Renaksi. Induk yang juga baru ikut dibuat.',
      items: hasil.baru.map(b => ({
        kunci: kunciBaru(b.kunci), bawaan: true,
        isi: <><b>{labelTipeMaster(b.tipe)}</b> {b.nama}{jalurTeks(b) && <span style={{ color: sub }}> — {jalurTeks(b)}</span>}</>,
      })),
    },
    {
      judul: 'Tidak ada lagi di Rencana Aksi', ket: 'Tidak dihapus dari E-Anggaran. Centang untuk melepas tanda Renaksi (jadikan manual).',
      items: hasil.hilang.map(e => ({ kunci: kunciHilang(e.id), bawaan: false, isi: entri(e) })),
    },
    {
      judul: 'Sudah ada, belum bertanda', ket: 'Diketik tangan di Master, jalurnya ada di Rencana Aksi. Centang untuk menandainya.',
      items: hasil.belumBertanda.map(e => ({ kunci: kunciTanda(e.id), bawaan: false, isi: entri(e) })),
    },
  ];

  return (
    <DialogSelaras
      judul={`Perbarui dari Rencana Aksi ${tahun}`}
      pengantar="Nama yang ditulis ke Master = nama Rencana Aksi tanpa penanda bintang. Ganti nama ikut mengubah Rekening, RKO (semua versi, termasuk yang terkunci), dan Realisasi — angkanya tidak berubah. Tidak ada entri yang dihapus."
      bagian={bagian} isLight={isLight} canEdit={canEdit} onTutup={onTutup} onTerapkan={terapkan}
    />
  );
}
