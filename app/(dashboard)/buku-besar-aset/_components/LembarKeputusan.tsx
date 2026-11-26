'use client';
// Lembar keputusan anggaran = tab "Siap diputuskan" halaman Rencana (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.2).
// Sakelar Danai/Tidak/Nanti hanya mengubah ISI layar (`pilihan`); yang menulis satu tombol "Simpan keputusan"
// di halaman induk (L78). Rencana yang belum lengkap tetap tampil, redup, tanpa sakelar — gantinya tombol
// "Lengkapi …", jadi rencana tanpa referensi tidak bisa terdanai tanpa disadari.
import type { ReactNode } from 'react';
import PrimaButton from '@/components/ui/PrimaButton';
import { LABEL_JENIS, JENIS_RENCANA, type Anggaran, type JenisRencana } from '@/lib/bba/rencana';
import { tahapRencana, kurangPertama, type Kurang } from '@/lib/bba/tahap';
import type { BbaRow } from '@/lib/data/buku-besar-aset';
import GarisTahap from './GarisTahap';
import { LencanaRef } from './ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtVol = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
type Warna = { card: string; text: string; sub: string; border: string; rowOdd: string };

export const LABEL_KURANG: Record<Kurang, (r: BbaRow) => string> = {
  BARANG: () => 'Pilih barang',
  JENIS: () => 'Pilih jenis',
  REFERENSI: r => `Lengkapi referensi ${r.ref.n}/${r.ref.target}`,
};

const POSISI: Array<{ nilai: Anggaran; label: string; warna: string | null }> = [
  { nilai: 'DIDANAI', label: 'Danai', warna: '#1D9E75' },
  { nilai: 'TIDAK_DIDANAI', label: 'Tidak', warna: '#E24B4A' },
  { nilai: 'BELUM', label: 'Nanti', warna: null },
];

function Sakelar({ nilai, ubah, mati, c, label }: { nilai: Anggaran; ubah: (a: Anggaran) => void; mati: boolean; c: Warna; label: string }) {
  return (
    <span role="radiogroup" aria-label={label} style={{ display: 'inline-flex', border: `1px solid ${c.border}`, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
      {POSISI.map(p => {
        const aktif = p.nilai === nilai;
        return (
          <button key={p.nilai} type="button" role="radio" aria-checked={aktif} disabled={mati} onClick={() => ubah(p.nilai)}
            style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, border: 'none', cursor: mati ? 'not-allowed' : 'pointer',
              background: aktif ? (p.warna ?? c.border) : 'transparent', color: aktif ? (p.warna ? '#fff' : c.text) : c.sub }}>
            {p.label}
          </button>
        );
      })}
    </span>
  );
}

type Props = {
  rows: BbaRow[]; pilihan: ReadonlyMap<number, Anggaran>; c: Warna; bolehUbah: boolean;
  onPilih: (id: number, a: Anggaran) => void;
  onLengkapi: (r: BbaRow, k: Kurang) => void;
  onBuka: (r: BbaRow) => void;
  /** Kartu pagu (Tahap 2) — di atas daftar. */
  atas?: ReactNode;
};

export default function LembarKeputusan({ rows, pilihan, c, bolehUbah, onPilih, onLengkapi, onBuka, atas }: Props) {
  const kelompok = [...JENIS_RENCANA, null as JenisRencana | null]
    .map(j => ({ jenis: j, rows: rows.filter(r => r.jenis_rencana === j) }))
    .filter(k => k.rows.length > 0);
  return (
    <div>
      {atas}
      {rows.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: c.sub, fontSize: 13, border: `1px solid ${c.border}`, borderRadius: 10 }}>
          Tidak ada rencana yang menunggu keputusan anggaran.
        </div>
      )}
      {kelompok.map(k => {
        const lengkap = k.rows.filter(r => tahapRencana(r) === 'SIAP_DIPUTUSKAN');
        const total = k.rows.reduce((s, r) => s + r.nilai_rencana, 0);
        const semuaDanai = lengkap.length > 0 && lengkap.every(r => (pilihan.get(r.id) ?? r.anggaran) === 'DIDANAI');
        return (
          <section key={k.jenis ?? 'kosong'} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderBottom: `1px solid ${c.border}` }}>
              <b style={{ fontSize: 13 }}>{k.jenis ? LABEL_JENIS[k.jenis] : 'Belum digolongkan'}</b>
              <span style={{ fontSize: 12, color: c.sub }}>{k.rows.length} rencana · <span style={{ fontFamily: MONO }}>{fmtRp(total)}</span></span>
              <span style={{ flex: 1 }} />
              {bolehUbah && lengkap.length > 0 && (
                <PrimaButton variant="success" size="sm" disabled={semuaDanai} onClick={() => lengkap.forEach(r => onPilih(r.id, 'DIDANAI'))}>
                  Danai semua di kelompok ini
                </PrimaButton>
              )}
            </header>
            {k.rows.map((r, i) => {
              const kurang = kurangPertama(r);
              const nilai = pilihan.get(r.id) ?? r.anggaran;
              const berubah = nilai !== r.anggaran;
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 12px', background: i % 2 ? c.rowOdd : 'transparent',
                  borderTop: i ? `1px solid ${c.border}` : 'none' }}>
                  <span aria-label={berubah ? 'Belum tersimpan' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: berubah ? '#EF9F27' : 'transparent' }} />
                  <button type="button" onClick={() => onBuka(r)} style={{ flex: '1 1 240px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.text, opacity: kurang ? .6 : 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.uraian}</div>
                    <div style={{ fontSize: 11, color: c.sub, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                      <span style={{ fontFamily: MONO }}>{r.canonical_id}</span>
                      <span>· {fmtVol(r.vol)} {r.satuan || 'unit'}</span>
                      {r.jumlah_sasaran > 0 && <span>· mengganti {r.jumlah_sasaran} aset</span>}
                      <span>· {r.sumber_anggaran}</span>
                      <LencanaRef row={r} />
                    </div>
                  </button>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, width: 150, textAlign: 'right', flexShrink: 0, opacity: kurang ? .6 : 1 }}>{fmtRp(r.nilai_rencana)}</span>
                  <GarisTahap tahap={tahapRencana(r)} sub={c.sub} tanpaLabel />
                  {kurang
                    ? (bolehUbah ? <PrimaButton variant="warning" size="sm" onClick={() => onLengkapi(r, kurang)}>{LABEL_KURANG[kurang](r)}</PrimaButton>
                      : <span style={{ fontSize: 11.5, color: c.sub }}>belum lengkap</span>)
                    : <Sakelar nilai={nilai} ubah={a => onPilih(r.id, a)} mati={!bolehUbah} c={c} label={`Keputusan anggaran ${r.canonical_id}`} />}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
