'use client';
// Modal "Angka dari Modul" — satu sel sumber jadi angka sebaris di narasi (konsep §19.1).
// Berhenti di FORM: modal hanya memulangkan teks + resep lewat `onSisipkan`; yang menyimpan tetap
// tombol Simpan narasi. Satu angka = satu sel sumber, tanpa rumus (keputusan pemilik).

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, RefreshCw, Search } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { DAFTAR_SUMBER, type IdSumber } from '@/lib/lkjip/sumber';
import { GagalTarik } from '@/lib/lkjip/sumber/umum';
import type { FormatKolom } from '@/lib/lkjip/tautan';
import { teksAngka, formatBawaanAngka, type ResepAngka } from '@/lib/lkjip/angka';
import SetelanSumber, { type HasilSetelan } from './SetelanSumber';
import { TAUT_CSS } from './taut-css';

interface Props {
  tahunDokumen: number;
  /** Sumber & setelan angka terakhir di narasi ini — modal dibuka di sana dan langsung menarik. */
  awal?: Pick<ResepAngka, 'sumber' | 'setelan'> | null;
  onSisipkan: (teks: string, resep: ResepAngka) => void;
  onTutup: () => void;
}

const BATAS_DAFTAR = 300;
const SUMBER_AWAL: IdSumber = 'kinerja-rekap';

export default function AngkaModal({ tahunDokumen, awal, onSisipkan, onTutup }: Props) {
  const [sumberId, setSumberId] = useState<IdSumber>(awal?.sumber ?? SUMBER_AWAL);
  const [setelan, setSetelan] = useState<Record<string, unknown>>(
    () => DAFTAR_SUMBER[awal?.sumber ?? SUMBER_AWAL].setelan(awal?.setelan, tahunDokumen));
  const [hasil, setHasil] = useState<HasilSetelan | null>(null);
  const [ditarikDengan, setDitarikDengan] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [cari, setCari] = useState('');
  const [kunciBaris, setKunciBaris] = useState('');
  const [kolom, setKolom] = useState('');
  /** '' = mengikuti jenis kolom sumber. */
  const [format, setFormat] = useState<FormatKolom | ''>('');
  const [desimal, setDesimal] = useState<number | undefined>(undefined);

  const basi = hasil !== null && ditarikDengan !== JSON.stringify([sumberId, setelan]);

  async function tarik() {
    setMemuat(true); setGalat('');
    try {
      const h = await DAFTAR_SUMBER[sumberId].tarik(setelan, url => fetchJson<unknown>(url), tahunDokumen);
      setHasil(h);
      setDitarikDengan(JSON.stringify([sumberId, setelan]));
      // Pilihan baris & kolom dipertahankan kalau masih ada di tarikan baru.
      if (!h.baris.some(b => b.kunci === kunciBaris)) setKunciBaris('');
      if (!h.kolom.some(k => k.kunci === kolom)) setKolom('');
    } catch (e) {
      setHasil(null);
      setGalat(e instanceof GagalTarik ? e.message : 'Gagal menarik data. Coba lagi.');
    } finally { setMemuat(false); }
  }

  const sudahTarikAwal = useRef(false);
  useEffect(() => {
    if (awal && !sudahTarikAwal.current) { sudahTarikAwal.current = true; void tarik(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sekali saat modal dibuka
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !memuat) onTutup(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [memuat, onTutup]);

  function gantiSumber(id: IdSumber) {
    if (id === sumberId) return;
    setSumberId(id);
    setSetelan(DAFTAR_SUMBER[id].setelan(undefined, tahunDokumen));
    setHasil(null); setGalat(''); setKunciBaris(''); setKolom(''); setFormat(''); setDesimal(undefined);
  }
  const setS = (kunci: string, nilai: unknown) => setSetelan(s => ({ ...s, [kunci]: nilai }));
  // Tampilan berbeda = kolom & baris berbeda — pilihan lama tidak berarti lagi.
  function gantiTampilan(v: string) {
    setSetelan(s => ({ ...s, tampilan: v }));
    setKunciBaris(''); setKolom(''); setFormat('');
  }

  const kolomSumber = hasil?.kolom.find(k => k.kunci === kolom);
  const formatEfektif: FormatKolom = format || (kolomSumber ? formatBawaanAngka(kolomSumber.jenis) : 'angka');
  const barisTerpilih = hasil?.baris.find(b => b.kunci === kunciBaris);

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const semua = hasil?.baris ?? [];
    return q ? semua.filter(b => b.label.toLowerCase().includes(q)) : semua;
  }, [hasil, cari]);

  const nilaiUntuk = (kunci: string) => (hasil && kolom
    ? teksAngka(hasil, { kunciBaris: kunci, kolom, format: formatEfektif, desimal }) : null);
  const teks = barisTerpilih ? nilaiUntuk(barisTerpilih.kunci) : null;

  const masalah: string[] = [];
  if (!hasil) masalah.push('Tarik datanya dulu.');
  else if (basi) masalah.push('Setelan sumber berubah — tarik ulang dulu.');
  else {
    if (!kunciBaris) masalah.push('Pilih barisnya.');
    if (!kolom) masalah.push('Pilih kolomnya.');
  }

  function sisipkan() {
    if (!hasil || !barisTerpilih || !kolomSumber || teks === null || masalah.length) return;
    onSisipkan(teks, {
      sumber: sumberId, setelan, kunciBaris, kolom, format: formatEfektif,
      ...(desimal !== undefined ? { desimal } : {}),
      labelBaris: (barisTerpilih.label || '(tanpa uraian)').slice(0, 500),
      labelKolom: kolomSumber.label.slice(0, 255),
      ringkas: hasil.ringkas.slice(0, 500),
      ditarikPada: waktuSekarangWIB().slice(0, 16),
    });
  }

  return (
    <div className="lk-modal-bg" onClick={() => !memuat && onTutup()}>
      <style>{TAUT_CSS}{ANGKA_CSS}</style>
      <div className="lk-modal lk-taut lk-angka" role="dialog" aria-label="Angka dari modul" onClick={e => e.stopPropagation()}>
        <div className="lk-taut-head">
          <h3>Angka dari Modul</h3>
          <button className="lk-taut-x" aria-label="Tutup" onClick={onTutup} disabled={memuat}><X size={16} /></button>
        </div>

        <div className="lk-taut-body">
          <section className="lk-taut-sec">
            <div className="lk-taut-judul">1. Sumber data</div>
            <SetelanSumber sumberId={sumberId} setelan={setelan} hasil={hasil} onSumber={gantiSumber} onUbah={setS} onTampilan={gantiTampilan} />
            <div className="lk-taut-aksi">
              <PrimaButton variant="purple" size="sm" iconLeft={<RefreshCw size={14} />} onClick={() => void tarik()} disabled={memuat}>
                {memuat ? 'Menarik…' : hasil ? 'Tarik Ulang' : 'Tarik Data'}
              </PrimaButton>
              {hasil && !basi && <span className="lk-taut-ok">{hasil.baris.length} baris · {hasil.ringkas}</span>}
              {basi && <span className="lk-taut-peringatan">Setelan berubah sejak ditarik.</span>}
            </div>
            {galat && <div className="lk-taut-galat">{galat}</div>}
            {hasil && hasil.catatan.length > 0 && (
              <ul className="lk-taut-catatan">{hasil.catatan.map((c, i) => <li key={i}>{c}</li>)}</ul>
            )}
          </section>

          {hasil && !basi && hasil.baris.length > 0 && (
            <section className="lk-taut-sec">
              <div className="lk-taut-judul">2. Kolom &amp; baris</div>
              <div className="lk-taut-grid">
                <label>Kolom
                  <select value={kolom} onChange={e => { setKolom(e.target.value); setFormat(''); }}>
                    <option value="">— Pilih kolom —</option>
                    {hasil.kolom.map(k => <option key={k.kunci} value={k.kunci}>{k.grup ? `${k.grup} · ` : ''}{k.label}</option>)}
                  </select>
                </label>
                <label>Format
                  <select value={formatEfektif} onChange={e => setFormat(e.target.value as FormatKolom)} disabled={!kolom}>
                    <option value="teks">Teks apa adanya</option><option value="angka">Angka</option>
                    <option value="rp">Rupiah (Rp)</option><option value="persen">Persen</option>
                  </select>
                </label>
                <label>Desimal
                  <select value={desimal ?? ''} disabled={!kolom || formatEfektif === 'teks'}
                    onChange={e => setDesimal(e.target.value === '' ? undefined : Number(e.target.value))}>
                    <option value="">Otomatis</option>
                    {[0, 1, 2, 3].map(d => <option key={d} value={d}>{d} desimal</option>)}
                  </select>
                </label>
              </div>
              <div className="lk-angka-cari">
                <Search size={13} />
                <input value={cari} placeholder="Cari baris…" aria-label="Cari baris" onChange={e => setCari(e.target.value)} />
              </div>
              <div className="lk-taut-daftar lk-angka-daftar" role="radiogroup" aria-label="Baris sumber">
                {daftar.slice(0, BATAS_DAFTAR).map(b => {
                  const nilai = nilaiUntuk(b.kunci);
                  return (
                    <label key={b.kunci} className={`lk-angka-baris${b.kunci === kunciBaris ? ' pilih' : ''}`} style={{ paddingLeft: 6 + (b.indent ?? 0) * 14 }}>
                      <input type="radio" name="lk-angka-baris" checked={b.kunci === kunciBaris} onChange={() => setKunciBaris(b.kunci)} />
                      <span className={b.tebal ? 'tebal' : undefined}>{b.label || '(tanpa uraian)'}</span>
                      {nilai !== null && <span className="lk-angka-nilai">{nilai}</span>}
                    </label>
                  );
                })}
                {daftar.length === 0 && <div className="lk-hint">Tidak ada baris yang cocok.</div>}
                {daftar.length > BATAS_DAFTAR && <div className="lk-hint">… {daftar.length - BATAS_DAFTAR} baris lagi — persempit pencarian.</div>}
              </div>
            </section>
          )}

          {teks !== null && kolomSumber && barisTerpilih && (
            <section className="lk-taut-sec">
              <div className="lk-taut-judul">3. Pratinjau</div>
              <p className="lk-angka-pratinjau">
                {kolomSumber.label} · {barisTerpilih.label || '(tanpa uraian)'}: <span className="lk-angka-chip">{teks}</span>
              </p>
              <p className="lk-hint">Angka disisipkan di posisi kursor. Di Word tercetak sebagai teks biasa; di editor bisa diperbarui lewat <b>Perbarui angka</b>.</p>
            </section>
          )}
        </div>

        {masalah.length > 0 && <ul className="lk-taut-masalah">{masalah.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        <div className="lk-modal-actions">
          <PrimaButton variant="ghost" onClick={onTutup} disabled={memuat}>Batal</PrimaButton>
          <PrimaButton variant="primary" onClick={sisipkan} disabled={memuat || masalah.length > 0 || teks === null}>Sisipkan</PrimaButton>
        </div>
      </div>
    </div>
  );
}

const ANGKA_CSS = `
  .lk-taut.lk-angka { width: min(780px, 96vw); }
  .lk-angka-cari { display: flex; align-items: center; gap: 6px; margin-top: 10px; color: #85B7EB; }
  .lk-taut .lk-angka-cari input { flex: 1; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 6px 8px; font-size: 12.5px; margin: 0; }
  .lk-angka-daftar { max-height: 300px; }
  .lk-angka-baris { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #B5D4F4; cursor: pointer; padding-top: 3px; padding-bottom: 3px; padding-right: 6px; border-radius: 5px; }
  .lk-angka-baris:hover { background: rgba(255,255,255,0.04); }
  .lk-angka-baris.pilih { background: rgba(124,92,252,0.16); }
  .lk-taut .lk-angka-baris input { accent-color: #7C5CFC; margin: 0; width: auto; flex: none; }
  .lk-angka-baris .tebal { font-weight: 700; color: #E6F1FB; }
  .lk-angka-nilai { margin-left: auto; padding-left: 12px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #E6F1FB; white-space: nowrap; }
  .lk-angka-pratinjau { margin: 0 0 6px; font-size: 13px; color: #E6F1FB; line-height: 1.6; }
  .lk-angka-chip { font-family: 'JetBrains Mono', monospace; background: rgba(124,92,252,0.16); border: 1px solid rgba(124,92,252,0.45); border-radius: 4px; padding: 1px 5px; white-space: nowrap; }
  [data-theme="light"] .lk-taut .lk-angka-cari input { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-angka-cari { color: #6B7280; }
  [data-theme="light"] .lk-angka-baris { color: #374151; }
  [data-theme="light"] .lk-angka-baris:hover { background: rgba(0,0,0,.04); }
  [data-theme="light"] .lk-angka-baris .tebal, [data-theme="light"] .lk-angka-nilai, [data-theme="light"] .lk-angka-pratinjau { color: #0F0F12; }
`;
