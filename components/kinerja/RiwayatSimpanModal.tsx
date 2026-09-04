'use client';
// components/kinerja/RiwayatSimpanModal.tsx — daftar snapshot tiap klik Simpan.
//
// SATU komponen untuk tiga layar (SSK, Realisasi, Rekening), bukan tiga salinan:
// daftarnya menjelaskan hal yang sama persis di ketiga tempat, dan tiga salinan
// pasti berbeda bunyi begitu salah satunya disunting (alasan yang sama kenapa
// `konfirmasiPenurunan` satu fungsi untuk tiga tombol Simpan).
//
// Memilih satu baris TIDAK menulis apa pun — isinya dipulangkan ke pemanggil,
// yang menaruhnya di layar. Yang menyimpan tetap tombol Simpan biasa.
//
// Konsep: docs/CONCEPT-kinerja-riwayat-simpan.md §7

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { History, X, RotateCcw } from 'lucide-react';
import { uiTheme } from '@/lib/theme';
import { fmtRp } from '@/lib/shared/utils';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { RIWAYAT_RETENSI_KINERJA } from '@/lib/kinerja/riwayat-konstanta';

export type JenisRiwayat = 'SSK' | 'REALISASI' | 'REKENING';

export interface RiwayatItem {
  id:                 number;
  disimpan_pada:      string;
  versi_ke:           number | null;
  jumlah_baris:       number;
  total_nilai:        number;
  disimpan_oleh_nama: string | null;
}

interface Props {
  jenis:      JenisRiwayat;
  tahun:      string;
  sumber:     string;
  /** Hanya untuk SSK — jenis lain tidak berversi. */
  versiTipe?: 'MURNI' | 'PERUBAHAN';
  versiSeq?:  number;
  /** Jumlah baris yang sekarang di layar — dipakai kalimat konfirmasi. */
  barisSekarang: number;
  isLight?:   boolean;
  /** `version` = angka gembok SEGAR dari server, bukan `versi_ke` snapshot (L77). */
  onPulihkan: (isi: unknown[], version: number | null, item: RiwayatItem) => void;
  onClose:    () => void;
}

const NAMA: Record<JenisRiwayat, string> = {
  SSK: 'RKO/SSK', REALISASI: 'Realisasi', REKENING: 'Rekening',
};

/**
 * '2026-09-04 09:15:02' → '4 Sep 2026, 09:15:02'.
 *
 * DETIK ikut, dan itu bukan hiasan: dua klik Simpan dalam satu menit sama sekali
 * lumrah (simpan, lihat ada yang salah, betulkan, simpan lagi), dan tanpa detik
 * kedua barisnya terbaca identik — daftar yang tidak bisa membedakan pilihannya
 * sendiri tidak menolong siapa pun.
 */
function waktuTampil(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return s;
  const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${bln} ${m[1]}, ${m[4]}:${m[5]}:${m[6]}`;
}

export default function RiwayatSimpanModal({
  jenis, tahun, sumber, versiTipe, versiSeq, barisSekarang, isLight = false, onPulihkan, onClose,
}: Props) {
  const t = uiTheme(isLight);
  const cBorder = isLight ? 'rgba(139,92,246,.2)' : '#0C447C';

  const [items,  setItems]  = useState<RiwayatItem[]>([]);
  const [muat,   setMuat]   = useState(true);
  const [ambil,  setAmbil]  = useState<number | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && ambil === null) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [ambil, onClose]);

  useEffect(() => {
    let batal = false;
    (async () => {
      const q = new URLSearchParams({ jenis, tahun, sumber });
      if (jenis === 'SSK') {
        q.set('versi_tipe', versiTipe ?? 'MURNI');
        q.set('versi_seq',  String(versiSeq ?? 0));
      }
      try {
        const res = await fetch(`/api/kinerja/riwayat-simpan?${q}`);
        const j = await res.json().catch(() => null);
        if (batal) return;
        if (res.ok && j?.ok) setItems(j.data as RiwayatItem[]);
        else toast.error(j?.message || 'Riwayat simpan tidak bisa dimuat.');
      } catch { if (!batal) toast.error('Riwayat simpan tidak bisa dimuat — periksa sambungan.'); }
      finally { if (!batal) setMuat(false); }
    })();
    return () => { batal = true; };
  }, [jenis, tahun, sumber, versiTipe, versiSeq]);

  const pulihkan = useCallback(async (it: RiwayatItem) => {
    // Memuat MEMBUANG isian yang sedang di layar, jadi pilihan yang tidak
    // merusak harus jadi bawaan — confirmDialog memulangkan false untuk Esc.
    const lanjut = await confirmDialog({
      title:   'Muat simpanan lama ke layar?',
      message: `Simpanan ${waktuTampil(it.disimpan_pada)} (${it.jumlah_baris} baris) akan menggantikan `
        + `${barisSekarang} baris yang sekarang di layar.\n\n`
        + 'Belum ada yang tersimpan sampai Anda menekan Simpan.',
      confirmLabel: 'Muat ke layar',
      cancelLabel:  'Batal',
      variant:      'warning',
    });
    if (!lanjut) return;
    setAmbil(it.id);
    try {
      const res = await fetch(`/api/kinerja/riwayat-simpan?id=${it.id}`);
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.message || 'Riwayat simpan tidak bisa diambil.');
      onPulihkan(j.data.isi as unknown[], j.version ?? null, it);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Riwayat simpan tidak bisa diambil.');
    } finally { setAmbil(null); }
  }, [barisSekarang, onPulihkan, onClose]);

  const th: React.CSSProperties = { padding: '7px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: t.textSub, textAlign: 'left', borderBottom: `1px solid ${cBorder}`, position: 'sticky', top: 0, background: t.card };
  const td: React.CSSProperties = { padding: '7px 9px', fontSize: 11.5, color: t.text, borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.08)' : 'rgba(51,65,85,.4)'}`, whiteSpace: 'nowrap' };

  const lingkup = jenis === 'SSK'
    ? `${sumber} ${tahun} · ${versiTipe ?? 'MURNI'}${(versiSeq ?? 0) > 0 ? `-${versiSeq}` : ''}`
    : `${sumber} ${tahun}`;

  return createPortal(
    <div role="dialog" aria-label={`Riwayat simpan ${NAMA[jenis]}`}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,15,28,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => ambil === null && onClose()}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(720px,96vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: t.card, border: `1px solid ${cBorder}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${cBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.text, fontSize: 14 }}>
            <History size={18} color={isLight ? '#7C3AED' : '#C4B5FD'} />
            Riwayat Simpan {NAMA[jenis]} — {lingkup}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" disabled={ambil !== null}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '12px 18px', overflowY: 'auto' }}>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, lineHeight: 1.6, color: t.textSub }}>
            Simpan menghapus lalu menulis ulang seluruh isinya, jadi tiap klik Simpan difoto di sini —
            {' '}{RIWAYAT_RETENSI_KINERJA} yang terakhir disimpan. Memuat salah satunya hanya mengisi layar;
            {' '}<strong style={{ color: t.text }}>belum tersimpan sampai Anda menekan Simpan</strong>.
          </p>

          {muat && <div style={{ padding: '18px 0', fontSize: 12, color: t.textSub }}>Memuat riwayat…</div>}

          {!muat && items.length === 0 && (
            <div style={{ padding: '18px 0', fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
              Belum ada simpanan yang terekam untuk {lingkup}. Foto pertama dibuat pada klik Simpan berikutnya.
            </div>
          )}

          {!muat && items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Disimpan</th>
                  <th style={th}>Oleh</th>
                  <th style={{ ...th, textAlign: 'right' }}>Baris</th>
                  <th style={{ ...th, textAlign: 'right' }}>Nilai</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.id}>
                    <td style={td}>
                      {waktuTampil(it.disimpan_pada)}
                      {i === 0 && <span style={{ marginLeft: 7, fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: 'rgba(29,158,117,.16)', color: isLight ? '#0F5C44' : '#34D399' }}>TERAKHIR</span>}
                    </td>
                    <td style={{ ...td, color: t.textSub }}>{it.disimpan_oleh_nama ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{it.jumlah_baris}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                      {jenis === 'REKENING' ? '—' : fmtRp(it.total_nilai)}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button type="button" onClick={() => pulihkan(it)} disabled={ambil !== null}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, cursor: ambil === null ? 'pointer' : 'wait', fontSize: 11, fontWeight: 600, background: 'transparent', border: `1px solid ${cBorder}`, color: t.text }}>
                        <RotateCcw size={12} />{ambil === it.id ? 'Memuat…' : 'Muat'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
