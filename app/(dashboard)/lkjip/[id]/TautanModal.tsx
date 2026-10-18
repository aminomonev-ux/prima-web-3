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
import { DAFTAR_SUMBER, type IdSumber } from '@/lib/lkjip/sumber';
import { GagalTarik } from '@/lib/lkjip/sumber/umum';
import { DAFTAR_TEMPLAT, type TemplatTabel } from '@/lib/lkjip/sumber/templat';
import {
  bangunBadan, pasangBadan, periksaRumusKolom, petakanRumusKolom, formatBawaan, jumlahBarisKepala, pesanLewatBatas, jumlahIsianTangan, judulIkutSetelan, BATAS_KOLOM,
  type KolomTaut, type KolomSumber, type PayloadTabel, type Tautan, type FormatKolom,
} from '@/lib/lkjip/tautan';
import {
  displayValue, buildTableMeta, colLabel, pastikanKepalaSel, namaKolomDariKepala, letakAwal, rapikanLetak, selMilikKolom,
  sisipKolom, hapusKolom as hapusKolomTabel, tukarKolomSel, kolomSegabung, type TabelCell, type TabelAlign, type BentukTabel,
} from '@/lib/lkjip/tabel';
import SetelanSumber, { type HasilSetelan } from './SetelanSumber';
import KisiKepala from './KisiKepala';
import { TAUT_CSS } from './taut-css';

interface Props {
  payload: PayloadTabel;
  tahunDokumen: number;
  onTerapkan: (p: PayloadTabel) => void;
  onTutup: () => void;
}

/**
 * `tanganAsal`: isian tangan kolom ini saat modal dibuka — kembali kalau isinya diganti lalu dipilih tangan lagi.
 * `nama`: nama kolom lama — hanya cadangan kalau kolomnya tak punya sel judul. JUDUL kolom tinggal
 * di kisi kepala (E4: satu judul, satu tempat), bukan di sini.
 */
type KolomForm = { nama: string; taut: KolomTaut | null; align: TabelAlign; lebar?: number; asal: number | null; tanganAsal?: Record<string, string> };
/** Kolom + kisi kepala + letak judul tiap kolom — selalu diubah BERSAMA supaya tak pernah tidak sejajar. */
type BentukModal = { kolom: KolomForm[]; kepala: TabelCell[][]; letak: (number | null)[] };
type HasilModal = HasilSetelan;

const LEBAR_BAWAAN = 140;
const judulBawaan = (s: string) => s.trim() === '' || /^Kolom \d+$/.test(s.trim());
const alignJenis = (k: KolomSumber | undefined): TabelAlign => (k && k.jenis !== 'teks' ? 'right' : 'left');
const BARIS_PRATINJAU = 25;

/** Tabel yang belum diisi apa pun (kepala cuma judul bawaan "Kolom N") — boleh diberi kolom bawaan sumber. */
function tabelKosong(p: PayloadTabel): boolean {
  const pk = pastikanKepalaSel(p);
  const hr = jumlahBarisKepala(pk);
  return hr <= 1 && pk.kolom.every(judulBawaan)
    && pk.rows.slice(0, hr).every(r => r.every(c => judulBawaan(c.v)))
    && pk.rows.slice(hr).every(r => r.every(c => !c.v.trim()));
}

const kepalaSatuBaris = (judul: string[]): TabelCell[][] => [judul.map(v => ({ v }))];
const bentukKepala = (b: BentukModal): BentukTabel =>
  ({ rows: b.kepala, kolom: b.kolom.map(k => k.nama), align: b.kolom.map(k => k.align), colWidths: b.kolom.map(k => k.lebar ?? LEBAR_BAWAAN), headerRows: b.kepala.length });
const judulKolom = (b: BentukModal, i: number): string => { const r = b.letak[i]; return r == null ? '' : b.kepala[r]?.[i]?.v ?? ''; };
/** Judul kolom ditulis ke SEL miliknya di kisi kepala. Kolom yang tertutup gabungan tak punya sel → dibiarkan. */
function denganJudul(b: BentukModal, i: number, v: string): BentukModal {
  const r = b.letak[i];
  if (r == null) return b;
  return { ...b, kepala: b.kepala.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === i ? { ...cell, v } : cell)) : row)) };
}
/** T4: rumus kolom mengikuti kolomnya saat dipindah/dihapus (`peta[lama]` = indeks baru, null = dihapus). */
const petakanRumus = (ks: KolomForm[], peta: (number | null)[]): KolomForm[] =>
  ks.map(k => (k.taut?.isi.jenis === 'rumus' ? { ...k, taut: { ...k.taut, isi: { jenis: 'rumus' as const, ekspresi: petakanRumusKolom(k.taut.isi.ekspresi, peta) } } } : k));
function ikutSetelan(b: BentukModal, lama: readonly KolomSumber[], baru: readonly KolomSumber[]): BentukModal {
  const sebelum = b.kolom.map((k, i) => ({ judul: judulKolom(b, i), taut: k.taut }));
  const sesudah = judulIkutSetelan(sebelum, lama, baru);
  if (sesudah === sebelum) return b;
  return sesudah.reduce((acc, k, i) => (k.judul === sebelum[i].judul ? acc : denganJudul(acc, i, k.judul)), b);
}

function bentukAwal(p: PayloadTabel, sumberId: IdSumber, setelan: Record<string, unknown>): BentukModal {
  const katalog = DAFTAR_SUMBER[sumberId].kolom(setelan);
  const perKunci = new Map(katalog.map(k => [k.kunci, k]));
  if (!p.tautan && tabelKosong(p)) {
    const kunci = DAFTAR_SUMBER[sumberId].kolomBawaan(setelan);
    const judul = kunci.map(k => perKunci.get(k)?.label ?? k);
    return {
      kolom: kunci.map((k, i) => ({ nama: judul[i], taut: { isi: { jenis: 'sumber', kunci: k } }, align: alignJenis(perKunci.get(k)), asal: null })),
      kepala: kepalaSatuBaris(judul), letak: kunci.map(() => 0),
    };
  }
  // E1: kepala selalu berupa sel — tabel lama ber-headerRows 0 dapat 1 baris kepala berisi nama kolom.
  const pk = pastikanKepalaSel(p);
  const hr = jumlahBarisKepala(pk);
  const kepala = hr > 0 ? pk.rows.slice(0, hr).map(r => r.map(c => ({ ...c }))) : kepalaSatuBaris(p.kolom);
  const letak = letakAwal(kepala, p.kolom);
  if (p.tautan) {
    return {
      kolom: p.kolom.map((nama, i) => {
        const taut = p.tautan!.kolom[i] ?? null;
        return {
          nama, taut, align: (p.align[i] as TabelAlign) ?? 'left', lebar: p.colWidths?.[i], asal: i,
          tanganAsal: taut?.isi.jenis === 'tangan' ? taut.isi.nilai : undefined,
        };
      }),
      kepala, letak,
    };
  }
  // Tabel yang sudah dibentuk sendiri: kepalanya dipertahankan, isinya ditebak dari judul
  // yang sama persis dengan judul kolom sumber — sisanya dipilih orangnya.
  const perJudul = new Map(katalog.map(k => [k.label.trim().toLowerCase(), k]));
  return {
    kolom: p.kolom.map((nama, i) => {
      const cocok = perJudul.get(nama.trim().toLowerCase());
      return {
        nama, taut: cocok ? { isi: { jenis: 'sumber', kunci: cocok.kunci } } : null,
        align: (p.align[i] as TabelAlign) ?? 'left', lebar: p.colWidths?.[i], asal: i,
      };
    }),
    kepala, letak,
  };
}

const nilaiIsi = (t: KolomTaut | null): string =>
  !t ? '' : t.isi.jenis === 'sumber' ? `s:${t.isi.kunci}` : t.isi.jenis;

export default function TautanModal({ payload, tahunDokumen, onTerapkan, onTutup }: Props) {
  const awalSumber: IdSumber = payload.tautan?.sumber ?? 'kinerja-rekap';
  const [sumberId, setSumberId] = useState<IdSumber>(awalSumber);
  const [setelan, setSetelan] = useState<Record<string, unknown>>(
    () => DAFTAR_SUMBER[awalSumber].setelan(payload.tautan?.setelan, tahunDokumen));
  const [bentuk, setBentuk] = useState<BentukModal>(
    () => bentukAwal(payload, awalSumber, DAFTAR_SUMBER[awalSumber].setelan(payload.tautan?.setelan, tahunDokumen)));
  const { kolom, kepala, letak } = bentuk;
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
    setBentuk(b => (kosongAwal
      ? bentukAwal({ ...payload, tautan: undefined }, id, setelanBaru)
      : { ...b, kolom: b.kolom.map(k => (k.taut?.isi.jenis === 'sumber' && !katalogBaru.has(k.taut.isi.kunci) ? { ...k, taut: null } : k)) }));
  }

  function pakaiTemplat(t: TemplatTabel) {
    const s = DAFTAR_SUMBER[t.sumber].setelan({ ...t.setelan, tahun: tahunDokumen }, tahunDokumen);
    setSumberId(t.sumber); setSetelan(s); setSembunyi([]); setTebalInduk(true);
    setBentuk({
      kolom: t.kolom.map(k => ({ nama: k.judul, taut: k.taut, align: k.align, asal: null })),
      kepala: kepalaSatuBaris(t.kolom.map(k => k.judul)), letak: t.kolom.map(() => 0),
    });
    setJudulTemplat(`${t.label} Tahun ${tahunDokumen}`);
    void tarik(t.sumber, s);
  }

  const ubahKolom = (i: number, f: (k: KolomForm) => KolomForm) => setBentuk(b => ({ ...b, kolom: b.kolom.map((k, j) => (j === i ? f(k) : k)) }));
  function pilihIsi(i: number, nilai: string) {
    setBentuk(b => {
      const k = b.kolom[i];
      const judul = judulKolom(b, i);
      const pasang = (taut: KolomTaut | null, judulBaru?: string, align?: TabelAlign) => {
        const nb = { ...b, kolom: b.kolom.map((x, j) => (j === i ? { ...x, taut, align: align ?? x.align } : x)) };
        return judulBaru === undefined ? nb : denganJudul(nb, i, judulBaru);
      };
      if (nilai === '') return pasang(null);
      if (nilai === 'nomor') return judulBawaan(judul) ? pasang({ isi: { jenis: 'nomor' } }, 'No', 'center') : pasang({ isi: { jenis: 'nomor' } });
      if (nilai === 'rumus') return pasang({ isi: { jenis: 'rumus', ekspresi: k.taut?.isi.jenis === 'rumus' ? k.taut.isi.ekspresi : '' } });
      if (nilai === 'tangan') {
        const taut: KolomTaut = { isi: { jenis: 'tangan', nilai: k.tanganAsal ?? {} } };
        return judulBawaan(judul) ? pasang(taut, 'Keterangan', 'left') : pasang(taut);
      }
      const kunci = nilai.slice(2);
      const ks = perKunci.get(kunci);
      const taut: KolomTaut = { isi: { jenis: 'sumber', kunci }, gabungSama: k.taut?.gabungSama, bertingkat: k.taut?.bertingkat };
      return judulBawaan(judul) || k.asal === null ? pasang(taut, ks?.label ?? kunci, alignJenis(ks)) : pasang(taut);
    });
  }
  const ubahTaut = (i: number, ubah: Partial<KolomTaut>) =>
    ubahKolom(i, k => (k.taut ? { ...k, taut: { ...k.taut, ...ubah } } : k));
  // Kolom baru: judulnya ditaruh di sel miliknya di kisi kepala (§4.6).
  const tambahKolom = () => setBentuk(b => {
    if (b.kolom.length >= BATAS_KOLOM) return b;
    const n = b.kolom.length;
    const t = sisipKolom(bentukKepala(b), n, 1);
    const judul = `Kolom ${n + 1}`;
    return denganJudul({ kolom: [...b.kolom, { nama: judul, taut: null, align: 'left', asal: null }], kepala: t.rows, letak: [...b.letak, selMilikKolom(t.rows, t.rows.length, n)] }, n, judul);
  });
  // Gabungan judul yang terpotong terlihat langsung di kisi; rumus kolom lain ikut huruf barunya (T4).
  const hapusKolom = (i: number) => setBentuk(b => {
    if (b.kolom.length <= 1) return b;
    const t = hapusKolomTabel(bentukKepala(b), i, i);
    const peta = b.kolom.map((_, c) => (c < i ? c : c === i ? null : c - 1));
    return { kolom: petakanRumus(b.kolom.filter((_, j) => j !== i), peta), kepala: t.rows, letak: rapikanLetak(t.rows, b.letak.filter((_, j) => j !== i)) };
  });
  const geser = (i: number, arah: -1 | 1) => setBentuk(b => {
    const j = i + arah;
    if (j < 0 || j >= b.kolom.length) return b;
    const ks = [...b.kolom]; [ks[i], ks[j]] = [ks[j], ks[i]];
    const lt = [...b.letak]; [lt[i], lt[j]] = [lt[j], lt[i]];
    const kp = tukarKolomSel(b.kepala, i, j, b.kolom.length);
    const peta = b.kolom.map((_, c) => (c === i ? j : c === j ? i : c));
    return { kolom: petakanRumus(ks, peta), kepala: kp, letak: rapikanLetak(kp, lt) };
  });

  const lengkap = kolom.every(k => k.taut !== null);
  const resep = lengkap ? { kolom: kolom.map(k => k.taut!), sembunyi, tebalInduk } : null;
  const badan = useMemo(() => (hasil && resep ? bangunBadan(hasil, resep) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `resep` lahir baru tiap render; isinya = kolom/sembunyi/tebalInduk
    [hasil, kolom, sembunyi, tebalInduk]);

  const hr = kepala.length;
  // E2: nama kolom = judul di sel miliknya (grafik memilih seri lewat nama kolom).
  const dasar: PayloadTabel = {
    ...payload,
    judul: payload.judul.trim() ? payload.judul : judulTemplat,
    kolom: namaKolomDariKepala(kepala, hr, kolom.map(k => k.nama), letak),
    align: kolom.map(k => k.align),
    colWidths: kolom.map(k => k.lebar ?? LEBAR_BAWAAN),
    headerRows: hr,
    rows: kepala,
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
  function setS(kunci: string, nilai: unknown) {
    const s = { ...setelan, [kunci]: nilai };
    setSetelan(s);
    setBentuk(b => ikutSetelan(b, sumber.kolom(setelan), sumber.kolom(s)));
  }
  // Tampilan yang punya kolom berbeda (Laporan, BLUD, PK) — tabel baru ikut kolom bawaannya.
  function gantiTampilan(v: string) {
    const s = { ...setelan, tampilan: v };
    setSetelan(s); setSembunyi([]);
    if (kosongAwal) setBentuk(bentukAwal({ ...payload, tautan: undefined }, sumberId, s));
    else setBentuk(b => ikutSetelan(b, sumber.kolom(setelan), sumber.kolom(s)));
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

          <section className="lk-taut-sec">
            <div className="lk-taut-judul">2. Kolom tabel ({kolom.length}/{BATAS_KOLOM})</div>
            <KisiKepala kepala={kepala} letak={letak} lebar={kolom.map(k => k.lebar ?? LEBAR_BAWAAN)}
              onUbah={(kp, lt) => setBentuk(b => ({ ...b, kepala: kp, letak: lt }))} />
            <div className="lk-taut-kolom">
              {kolom.map((k, i) => {
                const isi = k.taut?.isi;
                const ks = isi?.jenis === 'sumber' ? perKunci.get(isi.kunci) : undefined;
                const galatRumus = isi?.jenis === 'rumus' ? periksaRumusKolom(isi.ekspresi, kolom.length, i) : null;
                const formatEfektif: FormatKolom = k.taut?.format ?? (ks ? formatBawaan(ks.jenis) : 'angka');
                return (
                  <div key={i} className={`lk-taut-baris${k.taut ? '' : ' kurang'}`}>
                    <span className="lk-taut-huruf">{colLabel(i)}</span>
                    <input className="lk-taut-nama" value={judulKolom(bentuk, i)} aria-label={`Judul kolom ${colLabel(i)}`}
                      disabled={letak[i] == null}
                      placeholder={letak[i] == null ? `digabung dengan ${kolomSegabung(kepala, i).map(colLabel).join(', ')} — ubah di kisi` : 'Judul kolom'}
                      onChange={e => { const v = e.target.value; setBentuk(b => denganJudul(b, i, v)); }} />
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
