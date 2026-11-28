'use client';
// Perubahan laporan di Google Drive yang menunggu, ditampilkan di baris & form tempat orangnya sedang bekerja
// (docs/konsep/bba/CONCEPT-bba-drive-dua-arah.md U2). "Pakai nilai Drive" hanya MENGISI form — yang menulis tetap Simpan
// biasa (L78). "Tetap nilai PRIMA" dicatat server supaya tinjauan tidak menanyakannya lagi.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CloudAlert } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import type { MenungguBerkas } from '@/lib/data/bba-drive-balik';
import type { SelMenunggu } from '@/lib/bba/drive-menunggu';
import type { LembarBalik } from '@/lib/bba/laporan-excel';
import type { WarnaBba } from './BbaShell';

export type SelBerkas = SelMenunggu & { kunci: string; revisi: string; oleh: string | null; pada: string | null;
  /** Sel lain yang isinya SAMA dan diputuskan bersama (kolom kepala surat yang berulang di tiap baris barang). */
  kembar?: SelBerkas[] };
export type DataMenunggu = { sel: SelBerkas[]; bolehLembar: Partial<Record<LembarBalik, boolean>>; terpotong: boolean };

const KUNING = '#BA7517', MERAH = '#E24B4A';

/** Satu muatan untuk satu layar; jawaban yang datang terlambat (ganti tahun) dibuang. */
export function useDriveMenunggu(tahun?: number): { data: DataMenunggu | null; muat: () => Promise<void> } {
  const [data, setData] = useState<DataMenunggu | null>(null);
  const giliran = useRef(0);
  const muat = useCallback(async () => {
    const n = ++giliran.current;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/drive-balik?step=menunggu${tahun ? `&tahun=${tahun}` : ''}`);
    if (n !== giliran.current || !d.ok) return;
    const berkas = (d.berkas ?? []) as MenungguBerkas[];
    setData({
      sel: berkas.flatMap(b => b.sel.map(s => ({ ...s, kunci: b.kunci, revisi: b.revisi, oleh: b.oleh, pada: b.pada }))),
      bolehLembar: (d.bolehLembar ?? {}) as DataMenunggu['bolehLembar'],
      terpotong: berkas.some(b => b.terpotong),
    });
  }, [tahun]);
  useEffect(() => { void muat(); }, [muat]);
  return { data, muat };
}

/** Sel menunggu milik satu catatan (rencana id, item penawaran id …). */
export function selUntuk(data: DataMenunggu | null, lembar: readonly LembarBalik[], id: number | readonly number[]): SelBerkas[] {
  if (!data) return [];
  const ids = new Set(typeof id === 'number' ? [id] : id);
  return data.sel.filter(s => lembar.includes(s.l) && ids.has(s.id));
}

const waktu = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '');

/** Sel berisi SAMA (kolom & isi Drive & isi PRIMA) digabung jadi satu baris tampilan; sisanya ikut di `kembar`. */
export function gabungKembar(sel: readonly SelBerkas[], kunciTampil: (s: SelBerkas) => string): SelBerkas[] {
  const per = new Map<string, SelBerkas>();
  for (const s of sel) {
    const k = `${kunciTampil(s)}|${s.teks.drive}|${s.teks.prima}`;
    const ada = per.get(k);
    if (ada) ada.kembar = [...(ada.kembar ?? []), s];
    else per.set(k, { ...s, kembar: [] });
  }
  return [...per.values()];
}

/** Lencana kecil di baris daftar. Merah = ada benturan (PRIMA juga sudah diubah ke nilai lain). */
export function LencanaDrive({ sel }: { sel: readonly SelBerkas[] }) {
  if (!sel.length) return null;
  const benturan = sel.some(s => s.jenis === 'benturan');
  const warna = benturan ? MERAH : KUNING;
  const tip = sel.slice(0, 6).map(s => `${s.judul}: ${s.teks.drive}${s.jenis === 'benturan' ? ` (PRIMA: ${s.teks.prima})` : ''}`).join(' · ') + (sel.length > 6 ? ` · +${sel.length - 6} lagi` : '');
  return (
    <span data-tooltip={`Diubah di Google Drive, belum diputuskan — ${tip}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: warna, border: `1px solid ${warna}`, borderRadius: 10, padding: '0 6px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
      <CloudAlert size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />{benturan ? 'Benturan Drive' : 'Diubah di Drive'}
    </span>
  );
}

/**
 * Kotak di form: tiap sel yang diubah di Drive dengan nilai asal → Drive → PRIMA. `bisaPakai(k)` = kolom itu ada di form ini
 * (selain itu hanya bisa ditolak di sini, dipakai lewat tinjauan). `onPakai` mengisi form; Simpan yang menulis.
 * Izin: "Pakai" ikut izin form (`bolehPakai`); "Tetap" ikut izin lembar pemilik kolom (= Terapkan; server memeriksa lagi).
 */
export function KotakDrive({ c, sel, bolehPakai, bolehLembar, bisaPakai, onPakai, onBerubah }: {
  c: WarnaBba; sel: readonly SelBerkas[]; bolehPakai: boolean; bolehLembar: DataMenunggu['bolehLembar'];
  bisaPakai: (s: SelBerkas) => boolean; onPakai: (s: SelBerkas) => void; onBerubah: () => void;
}) {
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [dipakai, setDipakai] = useState<Set<string>>(() => new Set());
  const daftar = useMemo(() => sel.filter(s => !dipakai.has(`${s.l}:${s.id}:${s.k}`)), [sel, dipakai]);
  if (!daftar.length) return null;
  const pertama = daftar[0];

  async function tetap(s: SelBerkas) {
    const k = `${s.l}:${s.id}:${s.k}`;
    setSibuk(k);
    try {
      for (const x of [s, ...(s.kembar ?? [])]) {
        const d = await fetchJson<unknown>('/api/buku-besar-aset/drive-balik?step=tetap', { method: 'POST',
          body: JSON.stringify({ kunci: x.kunci, revisi: x.revisi, lembar: x.l, id: x.id, kolom: x.k }) });
        if (!d.ok) { toast.error(d.message); onBerubah(); return; }
      }
      toast.success(`${s.judul}: tetap nilai PRIMA — isi Drive tidak ditanyakan lagi`);
      onBerubah();
    } finally { setSibuk(null); }
  }

  return (
    <div style={{ border: `1px solid ${daftar.some(s => s.jenis === 'benturan') ? MERAH : KUNING}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: 'rgba(186,117,23,.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: c.text }}>
        <CloudAlert size={14} />Diubah di Google Drive, belum diputuskan
        <span style={{ fontWeight: 400, color: c.sub, fontSize: 11.5 }}>{pertama.oleh ? `oleh ${pertama.oleh}` : ''} {waktu(pertama.pada)}</span>
      </div>
      {daftar.map(s => {
        const k = `${s.l}:${s.id}:${s.k}`;
        const pakai = bolehPakai && bisaPakai(s);
        const bolehTetap = !!bolehLembar[s.l];
        return (
          <div key={k} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, padding: '5px 0', borderTop: `1px solid ${c.border}` }}>
            <span style={{ minWidth: 0, flex: '1 1 260px', color: c.text }}>
              <b>{s.judul}</b>{' '}
              {s.jenis === 'benturan'
                ? <span>· semula {s.teks.asal} · <b style={{ color: KUNING }}>Drive {s.teks.drive}</b> · <b style={{ color: MERAH }}>PRIMA {s.teks.prima}</b> <span style={{ color: MERAH }}>(diubah di dua tempat)</span></span>
                : <span>· PRIMA {s.teks.prima} → <b style={{ color: KUNING }}>Drive {s.teks.drive}</b></span>}
            </span>
            {(pakai || bolehTetap) && (
              <span style={{ display: 'flex', gap: 6 }}>
                {pakai && <PrimaButton size="sm" variant="warning" disabled={!!sibuk} onClick={() => { onPakai(s); setDipakai(x => new Set(x).add(k)); }}>Pakai nilai Drive</PrimaButton>}
                {bolehTetap && <PrimaButton size="sm" variant="ghost" menulis disabled={!!sibuk} onClick={() => void tetap(s)}>{sibuk === k ? 'Menyimpan…' : 'Tetap nilai PRIMA'}</PrimaButton>}
              </span>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: c.sub, marginTop: 4 }}>
        &ldquo;Pakai nilai Drive&rdquo; mengisi form — tekan Simpan untuk menyimpannya. Yang belum diputuskan tetap muncul di tinjauan perubahan Drive.
      </div>
    </div>
  );
}
