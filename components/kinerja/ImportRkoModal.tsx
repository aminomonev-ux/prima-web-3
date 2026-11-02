'use client';
// components/kinerja/ImportRkoModal.tsx — Import tabel RKO (tab SSK) per sumber.
//
// Unggah .xlsx → server membacanya (/api/kinerja/ssk/import) → pratinjau
// membandingkannya dengan tabel RKO yang sedang dibuka DAN tabel Rekening sumber
// yang sama, lewat lib/kinerja/gabung-rko (PURE, diuji terpisah) → Terapkan
// mengisi tabel; yang MENULIS tetap tombol "Simpan Semua" di tab RKO, sehingga
// kunci optimistik dan penolakan versi terkunci berlaku tanpa endpoint baru.
// Berkas dari sumber lain menulis nama rekening berbeda ("Gaji Pokok" vs "Belanja Gaji
// Pokok PNS") — pasangannya disarankan, bisa dipilih, dan SELALU baris RKO yang sudah ada.
// CONCEPT-kinerja-impor-rko-istilah.md.

import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { FileSpreadsheet, X, AlertTriangle, Upload } from 'lucide-react';
import Tip from '@/components/ui/Tip';
import PrimaButton from '@/components/ui/PrimaButton';
import SoftSelect from '@/components/ui/SoftSelect';
import { fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { uiTheme } from '@/lib/theme';
import {
  bandingkanRko, ringkasRko, terapkanTambahRko, terapkanTimpaRko, hilangKalauTimpa,
  calonRko, dugaSkalaRibuan, kalikanBaris,
  type BarisRko, type BarisImporRko, type StatusRko, type PasanganRko, type PetaRko,
} from '@/lib/kinerja/gabung-rko';
import type { SskRow, RekeningRow } from '@/app/(dashboard)/kinerja/_types';

interface HasilBaca {
  rows: BarisRko[];
  warnings: string[];
  sumberSheet: string | null;
  source: string;
  peta: PetaRko;
  kolom: { indeks: number; label: string; judul: string }[];
  kelompok: { uraian: string; nilai: number }[];
}

interface Props {
  tahun: string;
  sumber: string;
  versiLabel: string;
  rowsSekarang: SskRow[];
  rekeningRows: RekeningRow[];
  isLight?: boolean;
  onApply: (rows: SskRow[]) => void;
  onClose: () => void;
}

type Mode = 'timpa' | 'tambah';

const WARNA: Record<StatusRko, string> = {
  baru: '#1D9E75', sama: '#94A3B8', berubah: '#BA7517', kembar: '#E24B4A', ditahan: '#E24B4A',
};
const LABEL: Record<StatusRko, string> = {
  baru: 'baru', sama: 'sudah sama', berubah: 'berubah', kembar: 'kembar di berkas',
  ditahan: 'belum berpasangan',
};
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const TIDAK = -1;

export default function ImportRkoModal({
  tahun, sumber, versiLabel, rowsSekarang, rekeningRows, isLight = false, onApply, onClose,
}: Props) {
  const t = uiTheme(isLight);
  const cBorder = isLight ? 'rgba(139,92,246,.2)' : '#0C447C';
  const cPeringatan = isLight ? '#854F0B' : '#FAC775';
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy]         = useState(false);
  const [berkas, setBerkas]     = useState<File | null>(null);
  const [baca, setBaca]         = useState<HasilBaca | null>(null);
  // Tambahkan, bukan Timpa: Timpa dengan berkas yang namanya tak cocok mengosongkan tabel,
  // dan baris RKO yang hilang membawa realisasinya jadi yatim.
  const [mode, setMode]         = useState<Mode>('tambah');
  const [lepas, setLepas]       = useState<Set<number>>(new Set());
  const [pasangan, setPasangan] = useState<PasanganRko>({});
  const [kali, setKali]         = useState(false);
  const [draf, setDraf]         = useState<PetaRko | null>(null);

  const kosong = rowsSekarang.length === 0;

  const rowsBerkas = useMemo(() => (baca ? (kali ? kalikanBaris(baca.rows, 1000) : baca.rows) : []), [baca, kali]);
  const hasil: BarisImporRko[] = useMemo(() => {
    if (!baca) return [];
    return bandingkanRko(rowsSekarang, rekeningRows, rowsBerkas, pasangan)
      .map((h, i) => (lepas.has(i) ? { ...h, ikut: false } : h));
  }, [baca, rowsSekarang, rekeningRows, rowsBerkas, pasangan, lepas]);
  // Hanya untuk baris yang pasangannya bisa dipilih — baris "persis" tidak butuh daftar.
  const calon = useMemo(() => hasil.map((h, i) =>
    h.status === 'kembar' || h.status === 'baru' || h.cara === 'persis' ? [] : calonRko(rowsSekarang, hasil, i)),
  [hasil, rowsSekarang]);

  const ringkas = useMemo(() => ringkasRko(hasil), [hasil]);
  const akanHilang = useMemo(() => hilangKalauTimpa(rowsSekarang, hasil), [rowsSekarang, hasil]);
  const paguDitahan = useMemo(
    () => hasil.filter(h => h.status === 'ditahan').reduce((s, h) => s + h.asal.pagu, 0),
    [hasil],
  );
  const nSaran   = hasil.filter(h => h.cara === 'kata').length;
  const nMeleset = hasil.filter(h => h.hasil && h.asal.pagu !== h.hasil.total).length;
  const ribuan   = useMemo(() => !kali && dugaSkalaRibuan(hasil), [hasil, kali]);
  const siap = mode === 'timpa'
    ? terapkanTimpaRko(hasil).length
    : hasil.filter(h => h.ikut && h.hasil && (h.status === 'baru' || h.status === 'berubah')).length;

  async function bacaBerkas(file: File, paksa?: PetaRko) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (paksa) fd.append('peta', JSON.stringify(paksa));
      const res = await fetch('/api/kinerja/ssk/import', { method: 'POST', body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) { toast.error(j?.message || 'Gagal membaca berkas Excel'); return; }
      // Pemetaan baru = baris baru: pasangan & centang lama menunjuk indeks yang sudah tidak berlaku.
      setBerkas(file); setBaca(j as HasilBaca); setDraf((j as HasilBaca).peta);
      setLepas(new Set()); setPasangan({}); setKali(false);
    } catch {
      toast.error('Gagal mengunggah berkas');
    } finally { setBusy(false); }
  }

  function terapkan() {
    if (!baca) return;
    const rows = mode === 'timpa' ? terapkanTimpaRko(hasil) : terapkanTambahRko(rowsSekarang, hasil);
    if (rows.length === 0 || siap === 0) { toast.error('Tidak ada baris yang bisa dimasukkan'); return; }
    onApply(rows);
    onClose();
  }

  const salahTab = baca?.sumberSheet && baca.sumberSheet !== sumber;
  const berkasPerubahan = !!baca && /perubahan/i.test(`${berkas?.name ?? ''} ${baca.source}`);
  const drafBeda = !!draf && !!baca && JSON.stringify(draf) !== JSON.stringify(baca.peta);
  const opsiKolom = (wajib: boolean) => [
    ...(wajib ? [] : [{ value: TIDAK, label: '— tidak ada —' }]),
    ...(baca?.kolom ?? []).map(k => ({ value: k.indeks, label: `${k.label} · ${k.judul}` })),
  ];

  const th: React.CSSProperties = { padding: '7px 9px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: t.textSub, textAlign: 'left', borderBottom: `1px solid ${cBorder}`, position: 'sticky', top: 0, background: t.card, zIndex: 1 };
  const td: React.CSSProperties = { padding: '6px 9px', fontSize: 11, color: t.text, borderBottom: `1px solid ${isLight ? 'rgba(139,92,246,.08)' : 'rgba(51,65,85,.4)'}`, verticalAlign: 'top' };
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
  const lencana = (warna: string): React.CSSProperties => ({ marginLeft: 6, padding: '1px 6px', borderRadius: 6, fontSize: 9.5, fontWeight: 700, color: warna, border: `1px solid ${warna}`, whiteSpace: 'nowrap' });
  const optStyle = (aktif: boolean): React.CSSProperties => ({
    flex: 1, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start',
    padding: '9px 12px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
    background: aktif ? (isLight ? 'rgba(139,92,246,.12)' : 'rgba(124,92,252,.18)') : 'transparent',
    border: `1px solid ${aktif ? '#7C5CFC' : cBorder}`,
    color: aktif ? t.text : t.textSub,
  });
  const kotakPeringatan: React.CSSProperties = { display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 10, background: isLight ? 'rgba(226,75,74,.08)' : 'rgba(226,75,74,.12)', border: `1px solid ${cBorder}`, fontSize: 12, lineHeight: 1.55, color: t.text };

  function selMasukKe(h: BarisImporRko, i: number) {
    if (h.status === 'kembar') return <span style={{ color: t.textSub }}>—</span>;
    if (h.status === 'baru') return <span style={{ color: t.textSub }}>baris baru (namanya ada di tab Rekening)</span>;
    if (h.cara === 'persis') return <span>{rowsSekarang[h.idxLama as number]?.uraian}</span>;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
        <SoftSelect<number>
          value={h.idxLama ?? TIDAK}
          minWidth={230}
          disabled={busy}
          onChange={v => setPasangan(p => ({ ...p, [i]: v === TIDAK ? null : v }))}
          options={[
            { value: TIDAK, label: '— jangan dimasukkan —' },
            ...calon[i].map(c => ({ value: c.idx, label: c.uraian })),
          ]}
        />
        {h.cara === 'kata' && <span style={lencana('#7C5CFC')}>saran</span>}
        {h.cara === 'pilihan' && <span style={lencana('#1D9E75')}>pilihan</span>}
      </span>
    );
  }

  return createPortal(
    <div role="dialog" aria-label="Import RKO dari Excel"
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(2,15,28,.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(1080px,96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: t.card, border: `1px solid ${cBorder}`, borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.45)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${cBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: t.text, fontSize: 14 }}>
            <FileSpreadsheet size={18} color={isLight ? '#7C3AED' : '#C4B5FD'} />
            Import RKO {sumber} — {tahun} · {versiLabel}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" disabled={busy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textSub, padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) bacaBerkas(f); e.target.value = ''; }} />
            <PrimaButton variant="purple" size="sm" iconLeft={<Upload size={14} />}
              onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy && !baca ? 'Membaca…' : 'Pilih Berkas Excel'}
            </PrimaButton>
            <span style={{ marginLeft: 10, fontSize: 11.5, color: t.textSub }}>
              {berkas?.name || 'Berkas .xlsx — kolom nama rekening · pagu · target per bulan. Persentase & Total dihitung ulang.'}
            </span>
          </div>

          {baca && (
            <>
              {salahTab && (
                <div style={{ display: 'flex', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(226,75,74,.12)', border: '1px solid rgba(226,75,74,.4)', color: isLight ? '#B91C1C' : '#FCA5A5', fontSize: 12, lineHeight: 1.55 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Berkas ini bertuliskan <strong>{baca.sumberSheet}</strong>, sedangkan tab yang terbuka <strong>{sumber}</strong>.</span>
                </div>
              )}
              {berkasPerubahan && versiLabel === 'MURNI' && (
                <div style={kotakPeringatan}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#E24B4A' }} />
                  <span>
                    Berkas ini berbunyi <strong>Perubahan</strong>, sedangkan versi yang terbuka <strong>MURNI</strong>.
                    Kalau ini anggaran perubahan, tutup dulu, buka pemilih versi lalu <strong>Buat Perubahan Baru</strong>, baru impor di sana —
                    kalau tidak, isi MURNI yang tertimpa.
                  </span>
                </div>
              )}

              <details style={{ border: `1px solid ${cBorder}`, borderRadius: 10, padding: '8px 12px' }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: t.text }}>
                  <strong>Pemetaan kolom</strong>
                  <span style={{ color: t.textSub }}> — dibaca dari judul kolom {baca.source}. Buka kalau ada yang keliru.</span>
                </summary>
                {draf && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
                      {([['uraian', 'Nama rekening', true], ['pagu', 'Pagu', false], ['kode', 'Kode rekening', false]] as const).map(([kunci, label, wajib]) => (
                        <label key={kunci} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, fontWeight: 700, color: t.textSub }}>
                          {label}
                          <SoftSelect<number>
                            value={draf[kunci] ?? TIDAK}
                            minWidth={220}
                            disabled={busy}
                            onChange={v => setDraf(d => (d ? { ...d, [kunci]: kunci !== 'uraian' && v === TIDAK ? null : v } : d))}
                            options={opsiKolom(wajib)}
                          />
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                      {NAMA_BULAN.map((b, i) => (
                        <label key={b} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, fontWeight: 700, color: t.textSub }}>
                          {b}
                          <SoftSelect<number>
                            value={draf.bulan[i] ?? TIDAK}
                            minWidth={140}
                            disabled={busy}
                            onChange={v => setDraf(d => (d ? { ...d, bulan: d.bulan.map((x, j) => (j === i ? (v === TIDAK ? null : v) : x)) } : d))}
                            options={opsiKolom(false)}
                          />
                        </label>
                      ))}
                    </div>
                    <div>
                      <PrimaButton variant="purple" size="sm" disabled={busy || !drafBeda || !berkas}
                        onClick={() => berkas && draf && bacaBerkas(berkas, draf)}>
                        Baca ulang dengan pemetaan ini
                      </PrimaButton>
                    </div>
                  </div>
                )}
              </details>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: t.textSubAlt, marginBottom: 6 }}>
                  Cara mengisi
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setMode('tambah')} disabled={busy} style={optStyle(mode === 'tambah')}>
                    <b style={{ fontSize: 12.5 }}>Tambahkan</b>
                    <span style={{ fontSize: 11 }}>isi lama dipertahankan, baris yang dipasangkan diperbarui</span>
                  </button>
                  <button type="button" onClick={() => setMode('timpa')} disabled={busy} style={optStyle(mode === 'timpa')}>
                    <b style={{ fontSize: 12.5 }}>Timpa</b>
                    <span style={{ fontSize: 11 }}>isi tab diganti seluruhnya oleh berkas</span>
                  </button>
                </div>
                {kosong && (
                  <p style={{ fontSize: 11.5, color: t.textSub, margin: '6px 0 0' }}>
                    Tabel RKO {sumber} masih kosong — kedua pilihan menghasilkan hal yang sama.
                  </p>
                )}
                {mode === 'timpa' && akanHilang > 0 && (
                  <p style={{ fontSize: 12, color: isLight ? '#B91C1C' : '#FCA5A5', margin: '6px 0 0', lineHeight: 1.55 }}>
                    <AlertTriangle size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                    Timpa akan <strong>menghapus {akanHilang} baris</strong> yang tidak dipasangi baris berkas — realisasi yang sudah
                    tercatat di baris itu ikut kehilangan pasangannya (jadi yatim). Pakai <strong>Tambahkan</strong> kalau baris itu harus tetap ada.
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: t.text }}>
                {(['baru', 'sama', 'berubah', 'ditahan', 'kembar'] as StatusRko[]).map(s => (
                  <span key={s}>
                    <b style={{ color: WARNA[s], fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{ringkas[s]}</b>
                    {' '}{LABEL[s]}
                  </span>
                ))}
                <span style={{ color: t.textSub }}>· {baca.rows.length} baris dibaca dari {baca.source}</span>
              </div>

              {baca.kelompok.length > 0 && (
                <div style={{ fontSize: 11.5, color: t.textSub, lineHeight: 1.55 }}>
                  <strong style={{ color: t.text }}>{baca.kelompok.length} baris kelompok dilewati</strong> — angkanya jumlah baris
                  di bawahnya, jadi memasukkannya menggandakan pagu: {baca.kelompok.map(k => k.uraian).join(' · ')}.
                </div>
              )}

              {nSaran > 0 && (
                <div style={{ fontSize: 12, color: t.text, lineHeight: 1.55 }}>
                  <span style={lencana('#7C5CFC')}>saran</span>{' '}
                  <strong>{nSaran} baris</strong> dipasangkan dari kemiripan nama (semua kata nama di berkas ada di tepat satu baris RKO).
                  Periksa kolom <strong>Masuk ke</strong> — ganti kalau ada yang keliru.
                </div>
              )}

              {ringkas.ditahan > 0 && (
                <div style={kotakPeringatan}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1, color: '#E24B4A' }} />
                  <span>
                    <strong>{ringkas.ditahan} baris belum berpasangan</strong> — namanya tidak cocok dengan baris RKO mana pun.
                    Pilih pasangannya di kolom <strong>Masuk ke</strong>, atau biarkan kalau memang tidak perlu masuk.
                    Pagu yang belum ikut masuk: <strong>Rp {fmtNum(paguDitahan)}</strong>.
                  </span>
                </div>
              )}

              {ribuan && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 12, color: cPeringatan }}>
                  <span>⚠ Angka berkas kira-kira <strong>seperseribu</strong> pagu RKO yang dipasangkan — mungkin ditulis dalam ribuan.</span>
                  <PrimaButton variant="warning" size="sm" onClick={() => setKali(true)} disabled={busy}>Kalikan 1.000</PrimaButton>
                </div>
              )}
              {kali && (
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, fontSize: 12, color: cPeringatan }}>
                  <span>Semua angka berkas sudah dikali 1.000.</span>
                  <PrimaButton variant="ghost" size="sm" onClick={() => setKali(false)} disabled={busy}>Batalkan</PrimaButton>
                </div>
              )}

              {baca.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 11.5, color: cPeringatan }}>⚠ {w}</div>
              ))}
              {nMeleset > 0 && (
                <div style={{ fontSize: 11.5, color: cPeringatan }}>
                  ⚠ {nMeleset} baris jumlah target bulanannya tidak sama dengan pagu (ditandai merah).
                </div>
              )}

              <div style={{ maxHeight: 340, overflow: 'auto', border: `1px solid ${cBorder}`, borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: 34 }}>{mode === 'tambah' ? '✓' : ''}</th>
                      <th style={th}>Baris di berkas</th>
                      <th style={th}>Masuk ke baris RKO</th>
                      <th style={{ ...th, width: 150, textAlign: 'right' }}>Pagu</th>
                      <th style={{ ...th, width: 130, textAlign: 'right' }}>Jumlah 12 bulan</th>
                      <th style={{ ...th, width: 110 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hasil.map((h, i) => {
                      const jumlahBulan = h.hasil?.total ?? 0;
                      const meleset = h.hasil !== null && h.asal.pagu !== jumlahBulan;
                      return (
                        <tr key={i}>
                          <td style={td}>
                            {mode === 'tambah' && (h.status === 'baru' || h.status === 'berubah') ? (
                              <input type="checkbox" checked={h.ikut} disabled={busy} aria-label={`Ikutkan ${h.asal.uraian}`}
                                onChange={() => setLepas(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                            ) : null}
                          </td>
                          <td style={td}>
                            {h.asal.uraian}
                            {h.asal.kode && <div style={{ fontSize: 10, color: t.textSub, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{h.asal.kode}</div>}
                          </td>
                          <td style={td}>{selMasukKe(h, i)}</td>
                          <td style={tdNum}>
                            {h.status === 'berubah' && h.lamaPagu !== h.asal.pagu
                              ? <span><s style={{ color: t.textSub }}>{fmtNum(h.lamaPagu ?? 0)}</s> → <b style={{ color: WARNA.berubah }}>{fmtNum(h.asal.pagu)}</b></span>
                              : fmtNum(h.asal.pagu)}
                          </td>
                          <td style={{ ...tdNum, color: meleset ? '#E24B4A' : undefined }}>
                            {h.hasil ? fmtNum(jumlahBulan) : '—'}
                            {meleset && <Tip label="Jumlah 12 bulan tidak sama dengan pagu"><span> !</span></Tip>}
                          </td>
                          <td style={{ ...td, color: WARNA[h.status], fontWeight: 700 }}>{LABEL[h.status]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '12px 18px', borderTop: `1px solid ${cBorder}` }}>
          {baca && siap === 0 && (
            <span style={{ fontSize: 11.5, color: t.textSub, marginRight: 'auto' }}>
              {ringkas.ditahan > 0
                ? 'Belum ada baris yang siap masuk — pasangkan baris di kolom Masuk ke dulu.'
                : 'Tidak ada yang berubah dibanding RKO yang terbuka.'}
            </span>
          )}
          <PrimaButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>Batal</PrimaButton>
          <PrimaButton variant="success" size="sm" onClick={terapkan} disabled={busy || !baca || siap === 0}>
            Terapkan
          </PrimaButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
