'use client';
// Buku Aset (docs/CONCEPT-bba-buku-aset.md §5, §7.2–7.3, §14): daftar per golongan, dikelompokkan
// sejenis-setahun-seruangan; data tetap per register. Klik kelompok → register-registernya;
// klik register → kartu aset. Centang kelompok → catat kondisi / pindah ruangan / tautkan barang.
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, RefreshCw, ChevronDown, ChevronRight, ClipboardCheck, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { GOLONGAN, NAMA_GOLONGAN, LABEL_KONDISI, type Golongan } from '@/lib/bba/kib';
import { namaTampil, rentangRegister, type AsetRingan } from '@/lib/bba/aset';
import type { DaftarAset, SaringanKondisi, GedungPilihan } from '@/lib/data/bba-aset';
import type { InfoBeku } from '@/lib/security/beku';
import BbaShell, { type WarnaBba } from '../_components/BbaShell';
import type { PetaIzinLayar } from '../_components/BbaNav';
import KartuAset from '../_components/KartuAset';
import ModalImporKib from '../_components/ModalImporKib';
import { ModalKondisi, ModalPindah, ModalTautkanAset } from '../_components/AksiAset';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const WARNA_KONDISI = { B: '#1D9E75', RR: '#BA7517', RB: '#E24B4A' } as const;

type Props = {
  username: string; role: string; themePreference: 'dark' | 'light'; beku: InfoBeku; izin: PetaIzinLayar; awal: DaftarAset;
  ruangan: { id: number; nama: string }[]; gedung: GedungPilihan[];
  /** Dari kartu barang (?barang=) — saringan barang aktif sejak awal. */
  barangAwal: { id: number; nama: string } | null;
};
type Kelompok = DaftarAset['kelompok'][number];
type Aksi = { jenis: 'opname' } | { jenis: 'kondisi' | 'pindah' | 'barang'; ids: number[] };

export default function AsetClient({ username, role, themePreference, beku, izin, awal, ruangan, gedung, barangAwal }: Props) {
  const bolehUbah = izin.aset === 'EDIT';
  const [data, setData] = useState<DaftarAset>(awal);
  const [golongan, setGolongan] = useState<Golongan | ''>('');
  const [q, setQ] = useState('');
  const [tahun, setTahun] = useState('');
  const [kondisi, setKondisi] = useState<SaringanKondisi | ''>('');
  const [lokasi, setLokasi] = useState('');
  const [gedungF, setGedungF] = useState('');
  const [barang, setBarang] = useState(barangAwal);
  const [memuat, setMemuat] = useState(false);
  const [buka, setBuka] = useState<Record<string, AsetRingan[] | 'memuat'>>({});
  const [kartu, setKartu] = useState<number | null>(null);
  const [impor, setImpor] = useState(false);
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [aksi, setAksi] = useState<Aksi | null>(null);
  const nomor = useRef(0);
  const kunci = `${golongan}|${kondisi}|${tahun}|${lokasi}|${gedungF}|${barang?.id ?? ''}`;
  const kunciTermuat = useRef(`|||||${barangAwal?.id ?? ''}`);

  async function muat() {
    const n = ++nomor.current;
    kunciTermuat.current = kunci;
    setMemuat(true);
    try {
      const p = new URLSearchParams();
      if (golongan) p.set('golongan', golongan);
      if (kondisi) p.set('kondisi', kondisi);
      if (q.trim()) p.set('q', q.trim());
      if (/^\d{4}$/.test(tahun)) p.set('tahun', tahun);
      if (lokasi) p.set('lokasi', lokasi);
      if (gedungF) p.set('gedung', gedungF);
      if (barang) p.set('barang', String(barang.id));
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/aset?${p}`);
      if (n !== nomor.current) return; // jawaban saringan lama yang pulang terlambat
      if (!d.ok) { toast.error(d.message || 'Gagal memuat buku aset'); return; }
      setData(d as unknown as DaftarAset);
      setBuka({});
      setPilih(new Set());
    } finally { if (n === nomor.current) setMemuat(false); }
  }

  // Saringan pilihan langsung memuat; teks pencarian lewat Enter/Terapkan. Tahun dimuat
  // sesudah 4 digit diketik (bukan "198").
  useEffect(() => {
    if (kunciTermuat.current === kunci || (tahun && !/^\d{4}$/.test(tahun))) return;
    const t = setTimeout(() => { void muat(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muat membaca saringan terbaru
  }, [kunci]);

  const selesaiAksi = () => { setAksi(null); void muat(); };
  const idsTampil = data.kelompok.flatMap(k => k.ids);
  const semuaTerpilih = idsTampil.length > 0 && idsTampil.every(id => pilih.has(id));
  function centang(ids: number[], nyala: boolean) {
    setPilih(p => { const x = new Set(p); for (const id of ids) { if (nyala) x.add(id); else x.delete(id); } return x; });
  }

  async function bukaKelompok(k: Kelompok) {
    if (k.ids.length === 1) { setKartu(k.ids[0]); return; }
    if (buka[k.kunci]) { setBuka(b => { const x = { ...b }; delete x[k.kunci]; return x; }); return; }
    setBuka(b => ({ ...b, [k.kunci]: 'memuat' }));
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/aset?ids=${k.ids.slice(0, 500).join(',')}`);
    if (!d.ok) { toast.error(d.message || 'Gagal memuat register'); setBuka(b => { const x = { ...b }; delete x[k.kunci]; return x; }); return; }
    setBuka(b => ({ ...b, [k.kunci]: (d as unknown as { rows: AsetRingan[] }).rows }));
  }

  const kosong = Object.values(data.perGolongan).every(x => x.jumlah === 0);
  const r = data.ringkas;

  return (
    <BbaShell username={username} role={role} themePreference={themePreference} beku={beku} izin={izin} aktif="aset" remah="Buku Aset"
      aksiDock={[
        ...(bolehUbah ? [
          { icon: <ClipboardCheck size={17} />, label: 'Opname', onClick: () => setAksi({ jenis: 'opname' }) },
          { icon: <Upload size={17} />, label: 'Impor KIB', onClick: () => setImpor(true) },
        ] : []),
        { icon: <RefreshCw size={17} />, label: 'Muat Ulang', onClick: () => void muat() },
      ]}>
      {c => {
        const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input };
        const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
        const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, color: c.text, borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' };
        const tdNum: React.CSSProperties = { ...td, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' };
        return (<>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📚 Buku Aset</h1>
              <div style={{ fontSize: 12.5, color: c.sub }}>Semua aset rumah sakit per register KIB — diisi dari ekspor sistem aset provinsi, dilengkapi di PRIMA.</div>
            </div>
            {bolehUbah && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!kosong && <PrimaButton variant="success" onClick={() => setAksi({ jenis: 'opname' })}
                data-tooltip="Periksa kondisi seisi satu ruangan atau satu gedung sekaligus">
                <ClipboardCheck size={14} style={{ marginRight: 5, verticalAlign: -2 }} />Opname
              </PrimaButton>}
              <PrimaButton variant="purple" onClick={() => setImpor(true)}><Upload size={14} style={{ marginRight: 5, verticalAlign: -2 }} />Impor KIB</PrimaButton>
            </div>}
          </div>

          {kosong ? (
            <div style={{ background: c.card, border: `1px dashed ${c.border}`, borderRadius: 10, padding: 28, textAlign: 'center', fontSize: 13, color: c.sub, lineHeight: 1.6 }}>
              Buku aset masih kosong. {bolehUbah
                ? <>Ekspor KIB dari sistem aset provinsi (lembar KIBA … KIBF), lalu tekan <b style={{ color: c.text }}>Impor KIB</b>.</>
                : 'Umum Aset belum mengimpor KIB dari sistem aset provinsi.'}
            </div>
          ) : (<>
            <Kpi c={c} items={[
              { l: 'Register', v: r.jumlah.toLocaleString('id-ID') },
              { l: 'Nilai perolehan', v: fmtRp(r.nilai) },
              { l: 'Baik · Rusak ringan · Rusak berat', v: `${r.kondisi.B} · ${r.kondisi.RR} · ${r.kondisi.RB}` },
              { l: 'Perlu dicek (belum pernah / lewat jarak opname)', v: `${r.belumDicek.toLocaleString('id-ID')} · ${r.lewat.toLocaleString('id-ID')}`, warna: r.belumDicek + r.lewat ? '#BA7517' : undefined },
            ]} />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {([['', 'Semua'], ...GOLONGAN.map(g => [g, `${g} · ${NAMA_GOLONGAN[g]}`])] as [Golongan | '', string][]).map(([g, label]) => {
                const n = g ? data.perGolongan[g].jumlah : Object.values(data.perGolongan).reduce((s, x) => s + x.jumlah, 0);
                const kini = golongan === g;
                return (
                  <button key={label} type="button" onClick={() => setGolongan(g)}
                    style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer',
                      border: `1px solid ${kini ? '#EF9F27' : c.border}`, background: kini ? 'rgba(239,159,39,.15)' : 'transparent', color: kini ? '#EF9F27' : c.sub }}>
                    {label} <span style={{ fontFamily: MONO, opacity: .8 }}>{n.toLocaleString('id-ID')}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void muat(); }} placeholder="Cari nama, kode barang, register, keterangan…" style={{ ...inp, flex: 1, minWidth: 180 }} aria-label="Cari aset" />
              <input value={tahun} onChange={e => setTahun(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Tahun perolehan" inputMode="numeric" style={{ ...inp, width: 130, fontFamily: MONO }} aria-label="Tahun perolehan" />
              <select value={kondisi} onChange={e => setKondisi(e.target.value as SaringanKondisi | '')} style={inp} aria-label="Kondisi">
                <option value="">Semua kondisi</option>
                <option value="B">Baik</option><option value="RR">Rusak ringan</option><option value="RB">Rusak berat</option>
                <option value="BELUM_DICEK">Belum dicek di PRIMA</option>
                <option value="PERLU_DICEK">Perlu dicek (belum / lewat jarak opname)</option>
              </select>
              <select value={lokasi} onChange={e => setLokasi(e.target.value)} style={{ ...inp, maxWidth: 220 }} aria-label="Ruangan">
                <option value="">Semua ruangan</option>
                <option value="0">Peralatan tanpa ruangan</option>
                {ruangan.map(x => <option key={x.id} value={x.id}>{x.nama}</option>)}
              </select>
              {gedung.length > 0 && <select value={gedungF} onChange={e => setGedungF(e.target.value)} style={{ ...inp, maxWidth: 220 }} aria-label="Gedung">
                <option value="">Semua gedung</option>
                {gedung.map(x => <option key={x.id} value={x.id}>{x.nama}</option>)}
              </select>}
              <PrimaButton variant="primary" onClick={() => void muat()} disabled={memuat}>{memuat ? 'Memuat…' : 'Terapkan'}</PrimaButton>
            </div>
            {barang && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12.5 }}>
                <span style={{ border: '1px solid #378ADD', color: '#378ADD', borderRadius: 20, padding: '2px 10px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Barang: {barang.nama}
                  <button type="button" aria-label="Lepas saringan barang" onClick={() => setBarang(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>
                </span>
              </div>
            )}

            {bolehUbah && pilih.size > 0 && (
              <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px',
                background: c.card, border: '1px solid #EF9F27', borderRadius: 10 }}>
                <b style={{ fontSize: 12.5 }}>{pilih.size.toLocaleString('id-ID')} register dipilih</b>
                <span style={{ flex: 1 }} />
                <PrimaButton variant="success" size="sm" onClick={() => setAksi({ jenis: 'kondisi', ids: [...pilih] })}>Catat kondisi</PrimaButton>
                <PrimaButton variant="purple" size="sm" onClick={() => setAksi({ jenis: 'pindah', ids: [...pilih] })}>Pindah ruangan</PrimaButton>
                <PrimaButton variant="purple" size="sm" onClick={() => setAksi({ jenis: 'barang', ids: [...pilih] })}>Tautkan barang</PrimaButton>
                <PrimaButton variant="ghost" size="sm" onClick={() => setPilih(new Set())}>Batal pilih</PrimaButton>
              </div>
            )}

            {data.terpotong && <div style={{ fontSize: 12, color: '#BA7517', marginBottom: 8 }}>Menampilkan 1.500 kelompok pertama — persempit dengan golongan, tahun, atau pencarian.</div>}

            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {bolehUbah && <th style={{ ...th, width: 1 }}>
                    <input type="checkbox" checked={semuaTerpilih} onChange={e => centang(idsTampil, e.target.checked)} aria-label="Pilih semua register yang tampil" />
                  </th>}
                  <th style={th}>Barang</th><th style={th}>Gol.</th><th style={{ ...th, textAlign: 'center' }}>Tahun</th><th style={th}>Ruangan</th>
                  <th style={th}>Register</th><th style={th}>Kondisi</th><th style={{ ...th, textAlign: 'right' }}>Nilai</th>
                </tr></thead>
                <tbody>
                  {data.kelompok.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }} colSpan={bolehUbah ? 8 : 7}>Tidak ada aset yang cocok dengan saringan ini.</td></tr>}
                  {data.kelompok.map((k, i) => {
                    const terbuka = buka[k.kunci];
                    const banyak = k.ids.length > 1;
                    const nTerpilih = k.ids.filter(id => pilih.has(id)).length;
                    return [
                      <tr key={k.kunci} onClick={() => void bukaKelompok(k)} style={{ background: nTerpilih ? 'rgba(239,159,39,.08)' : i % 2 ? c.rowOdd : 'transparent', cursor: 'pointer' }}>
                        {bolehUbah && <td style={td} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={nTerpilih === k.ids.length} ref={el => { if (el) el.indeterminate = nTerpilih > 0 && nTerpilih < k.ids.length; }}
                            onChange={e => centang(k.ids, e.target.checked)} aria-label={`Pilih ${k.nama}`} />
                        </td>}
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            {banyak ? (terbuka ? <ChevronDown size={14} style={{ marginTop: 2, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ marginTop: 2, flexShrink: 0 }} />) : <span style={{ width: 14, flexShrink: 0 }} />}
                            <div>
                              <b>{k.nama}</b>
                              {k.nama !== k.nama_resmi && <div style={{ fontSize: 11, color: c.sub }}>{k.nama_resmi}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, fontFamily: MONO }}>{k.golongan}</td>
                        <td style={{ ...td, fontFamily: MONO, textAlign: 'center' }}>{k.tahun ?? '—'}</td>
                        <td style={td}>{k.lokasi_nama ?? <span style={{ color: c.sub }}>—</span>}</td>
                        <td style={{ ...td, fontFamily: MONO, fontSize: 11.5, whiteSpace: 'nowrap' }}>{banyak ? `${k.ids.length} unit · ` : ''}{rentangRegister(k.register)}</td>
                        <td style={td}><KondisiRingkas k={k} c={c} /></td>
                        <td style={tdNum}>{fmtRp(k.harga)}</td>
                      </tr>,
                      terbuka && (
                        <tr key={`${k.kunci}-isi`}>
                          <td colSpan={bolehUbah ? 8 : 7} style={{ ...td, background: 'rgba(239,159,39,.05)', padding: '6px 10px 10px 34px' }}>
                            {terbuka === 'memuat' ? <span style={{ fontSize: 12, color: c.sub }}>Memuat register…</span> : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {terbuka.map(a => (
                                  <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: `1px solid ${pilih.has(a.id) ? '#EF9F27' : c.border}`, borderRadius: 6, padding: '0 0 0 6px', background: c.card }}>
                                    {bolehUbah && <input type="checkbox" checked={pilih.has(a.id)} onClick={e => e.stopPropagation()} onChange={e => centang([a.id], e.target.checked)} aria-label={`Pilih register ${a.register ?? namaTampil(a)}`} />}
                                    <button type="button" onClick={e => { e.stopPropagation(); setKartu(a.id); }}
                                      style={{ border: 'none', background: 'transparent', color: c.text, padding: '4px 8px 4px 2px', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                      {a.register ?? namaTampil(a)}
                                      {a.kondisi && <span style={{ color: WARNA_KONDISI[a.kondisi], fontWeight: 700 }}>{a.kondisi}</span>}
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8 }}>
              Kondisi bertanda <b>belum dicek</b> berasal dari sistem provinsi dan belum diperiksa di PRIMA; <b>perlu dicek ulang</b> = pemeriksaan
              terakhir lebih lama dari jarak opname (Master → Pengaturan). Kode barang & register milik sistem provinsi.
            </div>
          </>)}

          {kartu !== null && <KartuAset id={kartu} c={c} bolehUbah={bolehUbah} onTutup={() => setKartu(null)} onPindah={setKartu} onTersimpan={() => void muat()} />}
          {impor && <ModalImporKib c={c} onTutup={() => setImpor(false)} onTersimpan={() => { setImpor(false); void muat(); }} />}
          {aksi?.jenis === 'opname' && <ModalKondisi c={c} onTutup={() => setAksi(null)} onTersimpan={selesaiAksi} />}
          {aksi?.jenis === 'kondisi' && <ModalKondisi c={c} ids={aksi.ids} onTutup={() => setAksi(null)} onTersimpan={selesaiAksi} />}
          {aksi?.jenis === 'pindah' && <ModalPindah c={c} ids={aksi.ids} onTutup={() => setAksi(null)} onTersimpan={selesaiAksi} />}
          {aksi?.jenis === 'barang' && <ModalTautkanAset c={c} ids={aksi.ids} onTutup={() => setAksi(null)} onTersimpan={selesaiAksi} />}
        </>);
      }}
    </BbaShell>
  );
}

function Kpi({ c, items }: { c: WarnaBba; items: { l: string; v: string; warna?: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
      {items.map(k => (
        <div key={k.l} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: c.sub, marginBottom: 4 }}>{k.l}</div>
          <div style={{ fontSize: 17, fontWeight: 700, fontFamily: MONO, color: k.warna ?? c.text }}>{k.v}</div>
        </div>
      ))}
    </div>
  );
}

function KondisiRingkas({ k, c }: { k: Kelompok; c: WarnaBba }) {
  if (k.golongan === 'A') return <span style={{ color: c.sub, fontSize: 11.5 }}>—</span>;
  const bagian = (['B', 'RR', 'RB'] as const).filter(x => k.kondisi[x] > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 11.5, flexWrap: 'wrap' }}>
        {bagian.length === 0 && <span style={{ color: c.sub }}>Kosong</span>}
        {bagian.map(x => <span key={x} style={{ color: WARNA_KONDISI[x], fontWeight: 600 }}>{k.ids.length > 1 ? `${k.kondisi[x]} ` : ''}{LABEL_KONDISI[x].toLowerCase()}</span>)}
      </div>
      {k.belumDicek > 0 && <span style={{ fontSize: 10.5, color: '#BA7517' }}>belum dicek{k.ids.length > 1 ? ` (${k.belumDicek})` : ''}</span>}
      {k.lewat > 0 && <span style={{ fontSize: 10.5, color: '#BA7517' }}>perlu dicek ulang{k.ids.length > 1 ? ` (${k.lewat})` : ''}</span>}
    </div>
  );
}
