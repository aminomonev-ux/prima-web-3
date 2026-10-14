'use client';
// Modal tabel tertaut LKJIP — sumber + setelan, pemetaan kolom, baris yang tampil, pratinjau.
// Konsep: docs/CONCEPT-lkjip-tabel-tertaut.md. Berhenti di FORM: modal hanya menyusun payload
// baru lewat `onTerapkan`; yang menulis ke server tetap TabelEditor (simpan blok biasa).

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Plus, ChevronLeft, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib';
import { DAFTAR_SUMBER, URUTAN_SUMBER, type IdSumber } from '@/lib/lkjip/sumber';
import { GagalTarik } from '@/lib/lkjip/sumber/umum';
import { LABEL_KEDALAMAN } from '@/lib/lkjip/sumber/kinerja-rekap';
import { LABEL_LEVEL, type PilihanFokus } from '@/lib/lkjip/sumber/renaksi-cetak';
import { DAFTAR_TEMPLAT, type TemplatTabel } from '@/lib/lkjip/sumber/templat';
import {
  bangunBadan, pasangBadan, periksaRumusKolom, formatBawaan, jumlahBarisKepala, pesanLewatBatas, jumlahIsianTangan, BATAS_KOLOM,
  type HasilTarik, type KolomTaut, type KolomSumber, type PayloadTabel, type Tautan, type FormatKolom,
} from '@/lib/lkjip/tautan';
import { displayValue, buildTableMeta, colLabel, type TabelCell, type TabelAlign } from '@/lib/lkjip/tabel';
import { CRR_BULAN_LABELS, SUMBER_LIST } from '@/app/(dashboard)/kinerja/_utils';
import { ALL_LEVELS } from '@/app/(dashboard)/rencana-aksi/_lib/cetak-filter';
import type { RaLevel } from '@/app/(dashboard)/rencana-aksi/_lib/types';

interface Props {
  payload: PayloadTabel;
  tahunDokumen: number;
  onTerapkan: (p: PayloadTabel) => void;
  onTutup: () => void;
}

/** `tanganAsal`: isian tangan kolom ini saat modal dibuka — kembali kalau isinya diganti lalu dipilih tangan lagi. */
type KolomForm = { judul: string; taut: KolomTaut | null; align: TabelAlign; lebar?: number; asal: number | null; tanganAsal?: Record<string, string> };
type HasilModal = HasilTarik & { fokus?: PilihanFokus };

const LEBAR_BAWAAN = 140;
const judulBawaan = (s: string) => s.trim() === '' || /^Kolom \d+$/.test(s.trim());
const alignJenis = (k: KolomSumber | undefined): TabelAlign => (k && k.jenis !== 'teks' ? 'right' : 'left');
const BARIS_PRATINJAU = 25;

/** Tabel yang belum diisi apa pun — boleh diberi kolom bawaan sumber. */
function tabelKosong(p: PayloadTabel): boolean {
  return (p.headerRows ?? 0) === 0 && p.kolom.every(judulBawaan) && p.rows.every(r => r.every(c => !c.v.trim()));
}

function kolomAwal(p: PayloadTabel, sumberId: IdSumber, setelan: Record<string, unknown>): KolomForm[] {
  const katalog = DAFTAR_SUMBER[sumberId].kolom(setelan);
  const perKunci = new Map(katalog.map(k => [k.kunci, k]));
  if (p.tautan) {
    return p.kolom.map((judul, i) => {
      const taut = p.tautan!.kolom[i] ?? null;
      return {
        judul, taut, align: (p.align[i] as TabelAlign) ?? 'left', lebar: p.colWidths?.[i], asal: i,
        tanganAsal: taut?.isi.jenis === 'tangan' ? taut.isi.nilai : undefined,
      };
    });
  }
  if (tabelKosong(p)) {
    return DAFTAR_SUMBER[sumberId].kolomBawaan(setelan).map(kunci => ({
      judul: perKunci.get(kunci)?.label ?? kunci,
      taut: { isi: { jenis: 'sumber', kunci } },
      align: alignJenis(perKunci.get(kunci)),
      asal: null,
    }));
  }
  // Tabel yang sudah dibentuk sendiri: judul & kepalanya dipertahankan, isinya ditebak dari judul
  // yang sama persis dengan judul kolom sumber — sisanya dipilih orangnya.
  const perJudul = new Map(katalog.map(k => [k.label.trim().toLowerCase(), k]));
  return p.kolom.map((judul, i) => {
    const cocok = perJudul.get(judul.trim().toLowerCase());
    return {
      judul, taut: cocok ? { isi: { jenis: 'sumber', kunci: cocok.kunci } } : null,
      align: (p.align[i] as TabelAlign) ?? 'left', lebar: p.colWidths?.[i], asal: i,
    };
  });
}

const nilaiIsi = (t: KolomTaut | null): string =>
  !t ? '' : t.isi.jenis === 'sumber' ? `s:${t.isi.kunci}` : t.isi.jenis;

export default function TautanModal({ payload, tahunDokumen, onTerapkan, onTutup }: Props) {
  const awalSumber: IdSumber = payload.tautan?.sumber ?? 'kinerja-rekap';
  const [sumberId, setSumberId] = useState<IdSumber>(awalSumber);
  const [setelan, setSetelan] = useState<Record<string, unknown>>(
    () => DAFTAR_SUMBER[awalSumber].setelan(payload.tautan?.setelan, tahunDokumen));
  const [kolom, setKolom] = useState<KolomForm[]>(
    () => kolomAwal(payload, awalSumber, DAFTAR_SUMBER[awalSumber].setelan(payload.tautan?.setelan, tahunDokumen)));
  const [sembunyi, setSembunyi] = useState<string[]>(payload.tautan?.sembunyi ?? []);
  const [tebalInduk, setTebalInduk] = useState(payload.tautan?.tebalInduk ?? true);
  const [hasil, setHasil] = useState<HasilModal | null>(null);
  const [ditarikDengan, setDitarikDengan] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState('');
  const [judulTemplat, setJudulTemplat] = useState('');
  // Keadaan saat modal DIBUKA — tidak ikut berubah selama modal terbuka.
  const [kosongAwal] = useState(() => tabelKosong(payload) && !payload.tautan);

  const sumber = DAFTAR_SUMBER[sumberId];
  const katalog = hasil?.kolom ?? sumber.kolom(setelan);
  const perKunci = useMemo(() => new Map(katalog.map(k => [k.kunci, k])), [katalog]);
  const grupKatalog = useMemo(() => {
    const g = new Map<string, KolomSumber[]>();
    for (const k of katalog) { const n = k.grup ?? 'Kolom'; g.set(n, [...(g.get(n) ?? []), k]); }
    return [...g.entries()];
  }, [katalog]);

  const sidikSetelan = JSON.stringify([sumberId, setelan]);
  const basi = hasil !== null && ditarikDengan !== sidikSetelan;

  // Argumen eksplisit untuk templat: state sumber/setelan yang baru disetel belum berlaku di klik yang sama.
  async function tarik(id: IdSumber = sumberId, s: Record<string, unknown> = setelan) {
    setMemuat(true); setGalat('');
    try {
      const h = await DAFTAR_SUMBER[id].tarik(s, url => fetchJson<unknown>(url), tahunDokumen);
      setHasil(h);
      setDitarikDengan(JSON.stringify([id, s]));
    } catch (e) {
      setHasil(null);
      setGalat(e instanceof GagalTarik ? e.message : 'Gagal menarik data. Coba lagi.');
    } finally { setMemuat(false); }
  }
  // Atur Bentuk tabel yang sudah tertaut: langsung tarik, supaya pratinjaunya angka terbaru.
  const sudahTarikAwal = useRef(false);
  useEffect(() => {
    if (payload.tautan && !sudahTarikAwal.current) { sudahTarikAwal.current = true; void tarik(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sekali saat modal dibuka
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !memuat) onTutup(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [memuat, onTutup]);

  function gantiSumber(id: IdSumber) {
    if (id === sumberId) return;
    const setelanBaru = DAFTAR_SUMBER[id].setelan(undefined, tahunDokumen);
    const katalogBaru = new Set(DAFTAR_SUMBER[id].kolom(setelanBaru).map(k => k.kunci));
    setSumberId(id);
    setSetelan(setelanBaru);
    setHasil(null); setGalat(''); setSembunyi([]);
    setKolom(kosongAwal
      ? kolomAwal({ ...payload, tautan: undefined }, id, setelanBaru)
      : ks => ks.map(k => (k.taut?.isi.jenis === 'sumber' && !katalogBaru.has(k.taut.isi.kunci) ? { ...k, taut: null } : k)));
  }

  function pakaiTemplat(t: TemplatTabel) {
    const s = DAFTAR_SUMBER[t.sumber].setelan({ ...t.setelan, tahun: tahunDokumen }, tahunDokumen);
    setSumberId(t.sumber); setSetelan(s); setSembunyi([]); setTebalInduk(true);
    setKolom(t.kolom.map(k => ({ judul: k.judul, taut: k.taut, align: k.align, asal: null })));
    setJudulTemplat(`${t.label} Tahun ${tahunDokumen}`);
    void tarik(t.sumber, s);
  }

  const ubahKolom = (i: number, f: (k: KolomForm) => KolomForm) => setKolom(ks => ks.map((k, j) => (j === i ? f(k) : k)));
  function pilihIsi(i: number, nilai: string) {
    ubahKolom(i, k => {
      if (nilai === '') return { ...k, taut: null };
      if (nilai === 'nomor') return { ...k, taut: { isi: { jenis: 'nomor' } }, judul: judulBawaan(k.judul) ? 'No' : k.judul, align: judulBawaan(k.judul) ? 'center' : k.align };
      if (nilai === 'rumus') return { ...k, taut: { isi: { jenis: 'rumus', ekspresi: k.taut?.isi.jenis === 'rumus' ? k.taut.isi.ekspresi : '' } } };
      if (nilai === 'tangan') {
        return {
          ...k, taut: { isi: { jenis: 'tangan', nilai: k.tanganAsal ?? {} } },
          judul: judulBawaan(k.judul) ? 'Keterangan' : k.judul, align: judulBawaan(k.judul) ? 'left' : k.align,
        };
      }
      const kunci = nilai.slice(2);
      const ks = perKunci.get(kunci);
      const judulBaru = judulBawaan(k.judul) || k.asal === null;
      return {
        ...k,
        taut: { isi: { jenis: 'sumber', kunci }, gabungSama: k.taut?.gabungSama, bertingkat: k.taut?.bertingkat },
        judul: judulBaru ? (ks?.label ?? kunci) : k.judul,
        align: judulBaru ? alignJenis(ks) : k.align,
      };
    });
  }
  const ubahTaut = (i: number, ubah: Partial<KolomTaut>) =>
    ubahKolom(i, k => (k.taut ? { ...k, taut: { ...k.taut, ...ubah } } : k));
  const tambahKolom = () => setKolom(ks => (ks.length >= BATAS_KOLOM ? ks
    : [...ks, { judul: `Kolom ${ks.length + 1}`, taut: null, align: 'left', asal: null }]));
  const hapusKolom = (i: number) => setKolom(ks => (ks.length <= 1 ? ks : ks.filter((_, j) => j !== i)));
  const geser = (i: number, arah: -1 | 1) => setKolom(ks => {
    const j = i + arah;
    if (j < 0 || j >= ks.length) return ks;
    const salin = [...ks];
    [salin[i], salin[j]] = [salin[j], salin[i]];
    return salin;
  });

  const lengkap = kolom.every(k => k.taut !== null);
  const resep = lengkap ? { kolom: kolom.map(k => k.taut!), sembunyi, tebalInduk } : null;
  const badan = useMemo(() => (hasil && resep ? bangunBadan(hasil, resep) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `resep` lahir baru tiap render; isinya = kolom/sembunyi/tebalInduk
    [hasil, kolom, sembunyi, tebalInduk]);

  const hr = jumlahBarisKepala(payload);
  const kepalaBaru = useMemo(
    () => payload.rows.slice(0, hr).map(r => kolom.map(k => (k.asal !== null && r[k.asal] ? { ...r[k.asal] } : { v: '' } as TabelCell))),
    [payload.rows, hr, kolom]);
  const dasar: PayloadTabel = {
    ...payload,
    judul: payload.judul.trim() ? payload.judul : judulTemplat,
    kolom: kolom.map(k => k.judul),
    align: kolom.map(k => k.align),
    colWidths: kolom.map(k => k.lebar ?? LEBAR_BAWAAN),
    headerRows: hr,
    rows: kepalaBaru,
  };
  const rowsBaru = badan ? pasangBadan(dasar, badan) : null;

  const masalah: string[] = [];
  if (!hasil) masalah.push('Tarik datanya dulu.');
  else if (basi) masalah.push('Setelan sumber berubah — tarik ulang dulu.');
  if (!lengkap) masalah.push(`Kolom ${kolom.map((k, i) => (k.taut ? null : colLabel(i))).filter(Boolean).join(', ')} belum diberi isi.`);
  if (badan?.galatRumus.length) masalah.push(...badan.galatRumus.map(g => `Kolom ${colLabel(g.kolom)}: ${g.pesan}`));
  if (badan?.kolomHilang.length) masalah.push(`Kolom ${badan.kolomHilang.map(colLabel).join(', ')} menunjuk kolom sumber yang tidak ada lagi — pilih isinya lagi.`);
  if (badan && !rowsBaru) masalah.push(pesanLewatBatas(badan.rows.length, hr));

  // Isian tangan yang kolomnya dihapus atau diganti isinya — ketikan orang, jadi ditanyakan dulu.
  const tanganHilang = (payload.tautan?.kolom ?? []).reduce((n, kt, i) => {
    const tetap = kolom.some(k => k.asal === i && k.taut?.isi.jenis === 'tangan');
    return tetap ? n : n + jumlahIsianTangan(kt);
  }, 0);

  async function masukkan() {
    if (!hasil || !badan || !rowsBaru || !resep || masalah.length) return;
    if (tanganHilang > 0 && !(await confirmDialog({
      title: 'Buang isian tangan?',
      message: `${tanganHilang} isian yang diketik di kolom isian tangan ikut hilang karena kolomnya dihapus atau isinya diganti.`,
      confirmLabel: 'Buang & masukkan', variant: 'warning',
    }))) return;
    const tautan: Tautan = {
      sumber: sumberId, setelan, kolom: resep.kolom, kunciBaris: badan.kunciBaris,
      sembunyi, tebalInduk, ditarikPada: waktuSekarangWIB().slice(0, 16), ringkas: hasil.ringkas, catatan: hasil.catatan,
    };
    onTerapkan({ ...dasar, rows: rowsBaru, tautan });
  }

  const adaTebal = !!hasil?.baris.some(b => b.tebal);
  const adaTingkat = !!hasil?.baris.some(b => (b.indent ?? 0) > 0);
  const sembunyiSet = new Set(sembunyi);
  const setS = (kunci: string, nilai: unknown) => setSetelan(s => ({ ...s, [kunci]: nilai }));
  // Laporan: tampilan per sumber dan per bulan punya kolom berbeda — tabel baru ikut kolom bawaannya.
  function gantiTampilan(v: string) {
    const s = { ...setelan, tampilan: v };
    setSetelan(s); setSembunyi([]);
    if (kosongAwal) setKolom(kolomAwal({ ...payload, tautan: undefined }, sumberId, s));
  }

  return (
    <div className="lk-modal-bg" onClick={() => !memuat && onTutup()}>
      <style>{TAUT_CSS}</style>
      <div className="lk-modal lk-taut" role="dialog" aria-label="Tabel dari modul" onClick={e => e.stopPropagation()}>
        <div className="lk-taut-head">
          <h3>Tabel dari Modul</h3>
          <button className="lk-taut-x" aria-label="Tutup" onClick={onTutup} disabled={memuat}><X size={16} /></button>
        </div>

        <div className="lk-taut-body">
          {kosongAwal && (
            <section className="lk-taut-sec">
              <div className="lk-taut-judul"><Sparkles size={12} style={{ display: 'inline', verticalAlign: '-0.125em' }} /> Mulai cepat dari templat</div>
              <div className="lk-taut-templat">
                {DAFTAR_TEMPLAT.map(t => (
                  <button key={t.id} type="button" onClick={() => pakaiTemplat(t)} disabled={memuat}>
                    <b>{t.label}</b><span>{t.keterangan}</span>
                  </button>
                ))}
              </div>
              <p className="lk-hint">Templat mengisi sumber, setelan, dan kolom di bawah — semuanya masih bisa diubah sebelum dimasukkan.</p>
            </section>
          )}

          <section className="lk-taut-sec">
            <div className="lk-taut-judul">1. Sumber data</div>
            <div className="lk-taut-grid">
              <label>Sumber
                <select value={sumberId} onChange={e => gantiSumber(e.target.value as IdSumber)}>
                  {URUTAN_SUMBER.map(id => <option key={id} value={id}>{DAFTAR_SUMBER[id].label}</option>)}
                </select>
              </label>
              <label>Tahun
                <input type="number" min={2000} max={2100} value={Number(setelan.tahun)} onChange={e => setS('tahun', Number(e.target.value))} />
              </label>
              {sumberId === 'kinerja-rekap' ? (
                <>
                  <label>S/D bulan
                    <select value={Number(setelan.sdBulan)} onChange={e => setS('sdBulan', Number(e.target.value))}>
                      {CRR_BULAN_LABELS.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
                    </select>
                  </label>
                  <label>Versi SSK
                    <select value={String(setelan.versi)} onChange={e => setS('versi', e.target.value)}>
                      <option value="berlaku">Versi Berlaku</option>
                      <option value="murni">Versi Murni (sebelum perubahan)</option>
                    </select>
                  </label>
                  <label>Kedalaman
                    <select value={String(setelan.kedalaman)} onChange={e => setS('kedalaman', e.target.value)}>
                      {Object.entries(LABEL_KEDALAMAN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </label>
                </>
              ) : sumberId === 'kinerja-laporan' ? (
                <>
                  <label>Tampilan
                    <select value={String(setelan.tampilan)} onChange={e => gantiTampilan(e.target.value)}>
                      <option value="sumber">Per sumber dana (+ jumlah)</option>
                      <option value="bulanan">Per bulan, satu sumber dana</option>
                    </select>
                  </label>
                  {setelan.tampilan === 'bulanan' && (
                    <label>Sumber dana
                      <select value={String(setelan.sumber)} onChange={e => setS('sumber', e.target.value)}>
                        {SUMBER_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label>Tampilan
                    <select value={String(setelan.mode)} onChange={e => setS('mode', e.target.value)}>
                      <option value="hirarki">Pohon (bertingkat)</option>
                      <option value="flat">Daftar per level</option>
                    </select>
                  </label>
                  <div className="lk-taut-cek">Level
                    <span>
                      {ALL_LEVELS.map(l => {
                        const lv = setelan.levels as Record<RaLevel, boolean>;
                        return (
                          <label key={l} className="lk-taut-inline">
                            <input type="checkbox" checked={!!lv?.[l]} onChange={e => setS('levels', { ...lv, [l]: e.target.checked })} />
                            {LABEL_LEVEL[l]}
                          </label>
                        );
                      })}
                    </span>
                  </div>
                  {(['fTujuan', 'fSasaran', 'fProgram'] as const).map(f => {
                    const daftar = hasil?.fokus?.[f === 'fTujuan' ? 'tujuan' : f === 'fSasaran' ? 'sasaran' : 'program'] ?? [];
                    return (
                      <label key={f}>Fokus {f.slice(1)}
                        <select value={String(setelan[f] ?? '')} disabled={!hasil?.fokus} onChange={e => setS(f, e.target.value)}>
                          <option value="">{hasil?.fokus ? 'Semua' : 'Tarik data dulu'}</option>
                          {daftar.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </>
              )}
            </div>
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

          <section className="lk-taut-sec">
            <div className="lk-taut-judul">2. Kolom tabel ({kolom.length}/{BATAS_KOLOM})</div>
            {hr > 0 && (
              <p className="lk-hint">Kepala tabel Anda ({hr} baris, termasuk gabungan selnya) dipertahankan. Memindah atau menghapus kolom bisa memotong gabungan judul — periksa lagi sesudahnya.</p>
            )}
            <div className="lk-taut-kolom">
              {kolom.map((k, i) => {
                const isi = k.taut?.isi;
                const ks = isi?.jenis === 'sumber' ? perKunci.get(isi.kunci) : undefined;
                const galatRumus = isi?.jenis === 'rumus' ? periksaRumusKolom(isi.ekspresi, kolom.length, i) : null;
                const formatEfektif: FormatKolom = k.taut?.format ?? (ks ? formatBawaan(ks.jenis) : 'angka');
                return (
                  <div key={i} className={`lk-taut-baris${k.taut ? '' : ' kurang'}`}>
                    <span className="lk-taut-huruf">{colLabel(i)}</span>
                    <input className="lk-taut-nama" value={k.judul} placeholder="Judul kolom" aria-label={`Judul kolom ${colLabel(i)}`}
                      onChange={e => ubahKolom(i, x => ({ ...x, judul: e.target.value }))} />
                    <select className="lk-taut-isi" value={nilaiIsi(k.taut)} aria-label={`Isi kolom ${colLabel(i)}`} onChange={e => pilihIsi(i, e.target.value)}>
                      <option value="">— Isi dari… —</option>
                      {grupKatalog.map(([grup, daftar]) => (
                        <optgroup key={grup} label={grup}>
                          {daftar.map(d => <option key={d.kunci} value={`s:${d.kunci}`}>{d.label}</option>)}
                        </optgroup>
                      ))}
                      <optgroup label="Lainnya">
                        <option value="nomor">Nomor urut</option>
                        <option value="rumus">Rumus (dari kolom lain)…</option>
                        <option value="tangan">Isian tangan (diketik sendiri)</option>
                      </optgroup>
                    </select>
                    {isi?.jenis === 'rumus' && (
                      <input className="lk-taut-rumus" value={isi.ekspresi} placeholder="mis. =C-D atau =D/C" aria-label={`Rumus kolom ${colLabel(i)}`}
                        onChange={e => ubahTaut(i, { isi: { jenis: 'rumus', ekspresi: e.target.value } })} />
                    )}
                    {isi?.jenis === 'tangan' && (
                      <span className="lk-taut-ket">
                        Diketik langsung di tabel; isiannya ikut barisnya saat Perbarui
                        {jumlahIsianTangan(k.taut) > 0 ? ` · ${jumlahIsianTangan(k.taut)} terisi` : ''}.
                      </span>
                    )}
                    {isi && isi.jenis !== 'nomor' && isi.jenis !== 'tangan' && (
                      <>
                        <select value={formatEfektif} aria-label="Format angka" onChange={e => ubahTaut(i, { format: e.target.value as FormatKolom })}>
                          <option value="teks">Teks</option><option value="angka">Angka</option>
                          <option value="rp">Rupiah (Rp)</option><option value="persen">Persen</option>
                        </select>
                        <select value={k.taut?.desimal ?? ''} aria-label="Desimal" disabled={formatEfektif === 'teks'}
                          onChange={e => ubahTaut(i, { desimal: e.target.value === '' ? undefined : Number(e.target.value) })}>
                          <option value="">Desimal otomatis</option>
                          {[0, 1, 2, 3].map(d => <option key={d} value={d}>{d} desimal</option>)}
                        </select>
                      </>
                    )}
                    {isi && isi.jenis !== 'tangan' && (
                      <label className="lk-taut-inline" data-tooltip="Baris berurutan yang isinya sama digabung jadi satu sel (mis. Sasaran yang punya beberapa indikator)" data-tooltip-pos="below">
                        <input type="checkbox" checked={!!k.taut?.gabungSama} onChange={e => ubahTaut(i, { gabungSama: e.target.checked })} />Gabung sama
                      </label>
                    )}
                    {isi?.jenis === 'sumber' && adaTingkat && (
                      <label className="lk-taut-inline" data-tooltip="Uraian menjorok sesuai tingkatnya (program, kegiatan, …)" data-tooltip-pos="below">
                        <input type="checkbox" checked={!!k.taut?.bertingkat} onChange={e => ubahTaut(i, { bertingkat: e.target.checked })} />Bertingkat
                      </label>
                    )}
                    <span className="lk-taut-ctl">
                      <button aria-label="Geser kiri" data-tooltip="Geser ke kiri" data-tooltip-pos="below" disabled={i === 0} onClick={() => geser(i, -1)}><ChevronLeft size={13} /></button>
                      <button aria-label="Geser kanan" data-tooltip="Geser ke kanan" data-tooltip-pos="below" disabled={i === kolom.length - 1} onClick={() => geser(i, 1)}><ChevronRight size={13} /></button>
                      <button aria-label="Hapus kolom" data-tooltip="Hapus kolom" data-tooltip-pos="below" disabled={kolom.length <= 1} onClick={() => hapusKolom(i)}>×</button>
                    </span>
                    {galatRumus && 'galat' in galatRumus && <div className="lk-taut-galat kecil">{galatRumus.galat}</div>}
                  </div>
                );
              })}
            </div>
            <div className="lk-taut-aksi">
              <button className="lk-taut-tambah" onClick={tambahKolom} disabled={kolom.length >= BATAS_KOLOM}><Plus size={13} /> Kolom</button>
              {adaTebal && (
                <label className="lk-taut-inline"><input type="checkbox" checked={tebalInduk} onChange={e => setTebalInduk(e.target.checked)} />Tebalkan baris induk (total &amp; program)</label>
              )}
            </div>
          </section>

          {hasil && (
            <section className="lk-taut-sec">
              <div className="lk-taut-judul">3. Baris yang tampil ({hasil.baris.length - hasil.baris.filter(b => sembunyiSet.has(b.kunci)).length}/{hasil.baris.length})</div>
              <div className="lk-taut-aksi">
                <button className="lk-taut-tambah" onClick={() => setSembunyi([])} disabled={sembunyi.length === 0}>Tampilkan semua</button>
              </div>
              <div className="lk-taut-daftar">
                {hasil.baris.map(b => (
                  <label key={b.kunci} className="lk-taut-inline baris" style={{ paddingLeft: 6 + (b.indent ?? 0) * 14 }}>
                    <input type="checkbox" checked={!sembunyiSet.has(b.kunci)}
                      onChange={e => setSembunyi(s => (e.target.checked ? s.filter(x => x !== b.kunci) : [...s, b.kunci]))} />
                    <span className={b.tebal ? 'tebal' : undefined}>{b.label || '(tanpa uraian)'}</span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {badan && rowsBaru && (
            <section className="lk-taut-sec">
              <div className="lk-taut-judul">4. Pratinjau</div>
              <Pratinjau kolom={dasar.kolom} align={dasar.align as TabelAlign[]} headerRows={hr} rows={rowsBaru} />
            </section>
          )}
        </div>

        {masalah.length > 0 && <ul className="lk-taut-masalah">{masalah.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        <div className="lk-modal-actions">
          <PrimaButton variant="ghost" onClick={onTutup} disabled={memuat}>Batal</PrimaButton>
          <PrimaButton menulis variant="primary" onClick={masukkan} disabled={memuat || masalah.length > 0}>Masukkan ke Tabel</PrimaButton>
        </div>
      </div>
    </div>
  );
}

function Pratinjau({ kolom, align, headerRows, rows }: { kolom: string[]; align: TabelAlign[]; headerRows: number; rows: TabelCell[][] }) {
  const tampil = rows.slice(0, headerRows + BARIS_PRATINJAU);
  const meta = buildTableMeta(tampil, kolom.length);
  return (
    <div className="lk-taut-pratinjau">
      <table>
        {headerRows === 0 && (
          <thead><tr>{kolom.map((k, i) => <th key={i}>{k}</th>)}</tr></thead>
        )}
        <tbody>
          {tampil.map((r, ri) => (
            <tr key={ri} className={ri < headerRows ? 'kepala' : undefined}>
              {r.map((c, ci) => {
                const m = meta[ri][ci];
                if (m.kind === 'skip' || m.kind === 'vcont') return null;
                return (
                  <td key={ci} colSpan={m.cs} rowSpan={m.kind === 'origin' ? Math.min(m.rs, tampil.length - ri) : 1}
                    style={{ textAlign: ri < headerRows ? 'center' : (c.al ?? align[ci] ?? 'left'), fontWeight: c.b || ri < headerRows ? 700 : undefined, whiteSpace: 'pre' }}>
                    {displayValue(tampil, ri, ci)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > tampil.length && <div className="lk-hint">… {rows.length - tampil.length} baris lagi.</div>}
    </div>
  );
}

const TAUT_CSS = `
  .lk-taut { width: min(1120px, 96vw); max-height: 92vh; display: flex; flex-direction: column; padding: 18px 20px; }
  .lk-taut-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .lk-taut-head h3 { margin: 0; }
  .lk-taut-x { background: none; border: none; color: #85B7EB; cursor: pointer; padding: 4px; border-radius: 6px; display: inline-flex; }
  .lk-taut-x:hover { color: #E6F1FB; background: rgba(255,255,255,0.06); }
  .lk-taut-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding-right: 4px; margin: 10px 0; }
  .lk-taut-sec { border: 1px solid #0C447C; border-radius: 10px; padding: 12px; margin-bottom: 12px; }
  .lk-taut-judul { font-size: 12px; font-weight: 800; letter-spacing: .03em; color: #85B7EB; margin-bottom: 10px; }
  .lk-taut-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .lk-taut-grid > label, .lk-taut-cek { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; font-weight: 600; color: #B5D4F4; }
  .lk-taut-cek > span { display: flex; flex-wrap: wrap; gap: 8px; }
  .lk-taut select, .lk-taut .lk-taut-grid input, .lk-taut input.lk-taut-nama, .lk-taut input.lk-taut-rumus { background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #E6F1FB; padding: 6px 8px; font-size: 12.5px; margin: 0; width: auto; }
  .lk-taut .lk-taut-grid input { width: 100%; }
  .lk-taut select:focus, .lk-taut input:focus { outline: none; border-color: #185FA5; }
  .lk-taut select:disabled { opacity: .5; cursor: not-allowed; }
  .lk-taut-aksi { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
  .lk-taut-ok { font-size: 11.5px; color: #7BE0BD; }
  .lk-taut-peringatan { font-size: 11.5px; color: #FBBF24; }
  .lk-taut-galat { margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: 12px; background: rgba(226,75,74,0.14); border: 1px solid #E24B4A; color: #FCA5A5; }
  .lk-taut-galat.kecil { flex-basis: 100%; margin-top: 2px; padding: 4px 8px; }
  .lk-taut-catatan, .lk-taut-masalah { margin: 10px 0 0; padding: 8px 12px 8px 26px; border-radius: 8px; font-size: 11.5px; line-height: 1.5; background: rgba(239,159,39,0.12); border: 1px solid #EF9F27; color: #FBBF24; display: flex; flex-direction: column; gap: 3px; }
  .lk-taut-masalah { margin: 0 0 10px; }
  .lk-taut-kolom { display: flex; flex-direction: column; gap: 6px; }
  .lk-taut-baris { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 6px 8px; border: 1px solid #0C447C; border-radius: 8px; background: #020F1C; }
  .lk-taut-baris.kurang { border-color: #EF9F27; }
  .lk-taut-huruf { font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 12px; color: #EF9F27; min-width: 16px; }
  .lk-taut input.lk-taut-nama { width: 170px; }
  .lk-taut-isi { max-width: 260px; }
  .lk-taut input.lk-taut-rumus { width: 150px; font-family: 'JetBrains Mono', monospace; }
  .lk-taut-inline { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: #B5D4F4; cursor: pointer; user-select: none; }
  .lk-taut .lk-taut-inline input { accent-color: #7C5CFC; margin: 0; width: auto; padding: 0; }
  .lk-taut-ctl { display: inline-flex; gap: 2px; margin-left: auto; }
  .lk-taut-ctl button { background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; border-radius: 6px; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: 14px; }
  .lk-taut-ctl button:disabled { opacity: .35; cursor: not-allowed; }
  .lk-taut-ctl button:hover:not(:disabled) { border-color: #185FA5; color: #E6F1FB; }
  .lk-taut-tambah { display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.05); border: 1px solid #0C447C; color: #B5D4F4; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .lk-taut-tambah:disabled { opacity: .4; cursor: not-allowed; }
  .lk-taut-daftar { max-height: 230px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin-top: 8px; border: 1px solid #0C447C; border-radius: 8px; padding: 6px; background: #020F1C; }
  .lk-taut-inline.baris { padding-top: 2px; padding-bottom: 2px; }
  .lk-taut-inline .tebal { font-weight: 700; color: #E6F1FB; }
  .lk-taut-templat { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
  .lk-taut-templat button { display: flex; flex-direction: column; gap: 3px; text-align: left; background: #020F1C; border: 1px solid #0C447C; border-radius: 10px; padding: 9px 11px; color: #E6F1FB; cursor: pointer; font-size: 12.5px; }
  .lk-taut-templat button span { font-size: 11px; color: #85B7EB; line-height: 1.4; }
  .lk-taut-templat button:hover:not(:disabled) { border-color: #7C5CFC; }
  .lk-taut-templat button:disabled { opacity: .5; cursor: not-allowed; }
  .lk-taut-ket { font-size: 11px; color: #85B7EB; }
  .lk-taut-pratinjau { overflow-x: auto; }
  .lk-taut-pratinjau table { border-collapse: collapse; font-size: 11.5px; min-width: 100%; }
  .lk-taut-pratinjau th, .lk-taut-pratinjau td { border: 1px solid #0C447C; padding: 4px 6px; vertical-align: top; color: #E6F1FB; }
  .lk-taut-pratinjau th, .lk-taut-pratinjau tr.kepala td { background: rgba(133,183,235,0.13); font-weight: 700; text-align: center; }
  @media (max-width: 520px) {
    .lk-taut { padding: 14px 12px; }
    .lk-taut input.lk-taut-nama, .lk-taut .lk-taut-isi, .lk-taut input.lk-taut-rumus { width: 100%; max-width: none; }
  }
  [data-theme="light"] .lk-taut-sec, [data-theme="light"] .lk-taut-baris, [data-theme="light"] .lk-taut-daftar { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-taut-baris, [data-theme="light"] .lk-taut-daftar { background: #F9FAFB; }
  [data-theme="light"] .lk-taut-baris.kurang { border-color: #EF9F27; }
  [data-theme="light"] .lk-taut-judul, [data-theme="light"] .lk-taut-x { color: #6B7280; }
  [data-theme="light"] .lk-taut-grid > label, [data-theme="light"] .lk-taut-cek, [data-theme="light"] .lk-taut-inline { color: #374151; }
  [data-theme="light"] .lk-taut-inline .tebal { color: #0F0F12; }
  [data-theme="light"] .lk-taut select, [data-theme="light"] .lk-taut .lk-taut-grid input, [data-theme="light"] .lk-taut input.lk-taut-nama, [data-theme="light"] .lk-taut input.lk-taut-rumus { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-taut-ctl button, [data-theme="light"] .lk-taut-tambah { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #374151; }
  [data-theme="light"] .lk-taut-templat button { background: #FFFFFF; border-color: rgba(0,0,0,.15); color: #0F0F12; }
  [data-theme="light"] .lk-taut-templat button span, [data-theme="light"] .lk-taut-ket { color: #6B7280; }
  [data-theme="light"] .lk-taut-templat button:hover:not(:disabled) { border-color: #7C5CFC; }
  [data-theme="light"] .lk-taut-ok { color: #0E7A55; }
  [data-theme="light"] .lk-taut-peringatan, [data-theme="light"] .lk-taut-catatan, [data-theme="light"] .lk-taut-masalah { color: #B45309; }
  [data-theme="light"] .lk-taut-galat { color: #B91C1C; }
  [data-theme="light"] .lk-taut-pratinjau th, [data-theme="light"] .lk-taut-pratinjau td { border-color: rgba(0,0,0,.12); color: #0F0F12; }
  [data-theme="light"] .lk-taut-pratinjau th, [data-theme="light"] .lk-taut-pratinjau tr.kepala td { background: #EDEDED; }
`;
