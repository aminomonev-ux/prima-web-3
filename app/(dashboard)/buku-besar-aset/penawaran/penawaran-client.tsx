'use client';
// Penawaran Rekanan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A): gudang penawaran harga. Dua tampilan dari data yang
// sama — Per surat (tempat mencatat) dan Bandingkan (barang × rekanan, aturan `bandingkanPenawaran`). Catat/ubah/hapus =
// EDIT Rencana atau Pengadaan; yang lain melihat.
import { Fragment, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Paperclip, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { InputNominal } from '@/components/ui/input-nominal';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { bandingkanPenawaran, masihBerlaku, type ItemPenawaran } from '@/lib/bba/penawaran';
import { fmtTanggal } from '@/lib/bba/kondisi';
import type { BarangRingan } from '@/lib/bba/barang';
import type { SuratPenawaran } from '@/lib/data/bba-penawaran';
import type { InfoBeku } from '@/lib/security/beku';
import BbaShell, { type WarnaBba } from '../_components/BbaShell';
import { bolehUbahPenawaran, type PetaIzinLayar } from '../_components/BbaNav';
import { Bingkai } from '../_components/AksiAset';
import PilihBarang, { type PilihanBarang } from '../_components/PilihBarang';
import { unggahBerkas, unduhBerkas } from '../_components/ModalItem';
import MenuBaris from '../_components/MenuBaris';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

type Props = { username: string; role: string; themePreference: 'dark' | 'light'; beku: InfoBeku; izin: PetaIzinLayar; awal: SuratPenawaran[]; rekanan: string[]; barang: BarangRingan[] };
type SaringBerlaku = 'BERLAKU' | 'SEMUA' | 'KEDALUWARSA';
type BukaSurat = { surat: SuratPenawaran | null } | null;

export default function PenawaranClient({ username, role, themePreference, beku, izin, awal, rekanan: rekananAwal, barang: barangAwal }: Props) {
  const bolehUbah = bolehUbahPenawaran(izin);
  const [surat, setSurat] = useState(awal);
  const [rekanan, setRekanan] = useState(rekananAwal);
  const [barang, setBarang] = useState(barangAwal);
  const [tampilan, setTampilan] = useState<'SURAT' | 'BANDING'>('SURAT');
  const [q, setQ] = useState('');
  const [saring, setSaring] = useState<SaringBerlaku>('BERLAKU');
  const [terbuka, setTerbuka] = useState<Set<number>>(new Set());
  const [buka, setBuka] = useState<BukaSurat>(null);
  const [impor, setImpor] = useState(false);
  const nomor = useRef(0);
  const hariIni = tanggalHariIniWIB();

  async function muat() {
    const n = ++nomor.current;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/penawaran?q=${encodeURIComponent(q.trim())}`);
    if (n !== nomor.current) return;
    if (!d.ok) { toast.error(d.message || 'Gagal memuat'); return; }
    const x = d as unknown as { surat: SuratPenawaran[]; rekanan: string[] };
    setSurat(x.surat); setRekanan(x.rekanan);
    const b = await fetchJson<unknown>('/api/buku-besar-aset/barang');
    if (b.ok) setBarang(((b as unknown as { data: BarangRingan[] }).data ?? []).map(x => ({ id: x.id, nama: x.nama })));
  }

  const tampilSurat = surat.filter(s => saring === 'SEMUA' || (saring === 'BERLAKU') === masihBerlaku(s.berlaku_sampai, hariIni));
  const banding = useMemo(() => bandingkanPenawaran(surat.flatMap(s => s.item), hariIni), [surat, hariIni]);

  async function hapus(s: SuratPenawaran) {
    const dipakai = s.item.reduce((t, i) => t + i.dipakai, 0);
    if (!(await confirmDialog({ title: 'Hapus surat penawaran', message: `Hapus surat ${s.rekanan}${s.nomor_surat ? ` No. ${s.nomor_surat}` : ''} beserta ${s.item.length} itemnya?${dipakai ? ` ${dipakai} referensi rencana yang menyalinnya tetap utuh (salinan).` : ''}`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/penawaran?id=${s.id}&v=${s.version}`, { method: 'DELETE' });
    if (!d.ok) { toast.error(d.message || 'Gagal menghapus'); void muat(); return; }
    toast.success('Surat penawaran dihapus'); void muat();
  }

  return (
    <BbaShell username={username} role={role} themePreference={themePreference} beku={beku} izin={izin} aktif="penawaran" remah="Penawaran Rekanan"
      aksiDock={[{ icon: <RefreshCw size={17} />, label: 'Muat ulang', onClick: () => void muat() }]}>
      {c => {
        const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input };
        const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap' };
        const td: React.CSSProperties = { padding: '8px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, verticalAlign: 'top' };
        const chip = (aktif: boolean): React.CSSProperties => ({ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer', border: `1px solid ${aktif ? '#EF9F27' : c.border}`, background: aktif ? 'rgba(239,159,39,.15)' : 'transparent', color: aktif ? '#EF9F27' : c.sub });
        return (<>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Penawaran Rekanan</h1>
              <div style={{ fontSize: 12.5, color: c.sub }}>Gudang harga dari surat penawaran — disalin jadi referensi harga rencana lewat tombol &ldquo;Ambil dari penawaran&rdquo;.</div>
            </div>
            {bolehUbah && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <PrimaButton variant="purple" onClick={() => setBuka({ surat: null })}>+ Catat surat penawaran</PrimaButton>
              <PrimaButton variant="ghost" iconLeft={<Upload size={14} />} onClick={() => setImpor(true)}>Impor Excel</PrimaButton>
            </div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <div role="tablist" aria-label="Tampilan penawaran" style={{ display: 'flex', gap: 6 }}>
              {([['SURAT', 'Per surat'], ['BANDING', 'Bandingkan']] as const).map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={tampilan === v} onClick={() => setTampilan(v)} style={chip(tampilan === v)}>{l}</button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            {tampilan === 'SURAT' && <>
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void muat(); }} placeholder="Cari rekanan, nomor, barang…" aria-label="Cari penawaran" style={{ ...inp, minWidth: 200 }} />
              <select value={saring} onChange={e => setSaring(e.target.value as SaringBerlaku)} style={inp} aria-label="Masa berlaku">
                <option value="BERLAKU">Masih berlaku</option><option value="SEMUA">Semua</option><option value="KEDALUWARSA">Kedaluwarsa</option>
              </select>
            </>}
          </div>

          {tampilan === 'SURAT' ? (
            <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead><tr><th style={{ ...th, width: 28 }} /><th style={th}>Rekanan · nomor · kategori</th><th style={th}>Tanggal surat</th><th style={th}>Berlaku s.d.</th><th style={{ ...th, textAlign: 'right' }}>Item</th><th style={th}>Berkas</th><th style={th} /></tr></thead>
                <tbody>
                  {tampilSurat.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: c.sub, padding: 24 }}>{surat.length ? 'Tidak ada surat yang cocok dengan saringan.' : 'Belum ada surat penawaran.'}</td></tr>}
                  {tampilSurat.map(s => {
                    const lebar = terbuka.has(s.id);
                    const berlaku = masihBerlaku(s.berlaku_sampai, hariIni);
                    return (
                      <Fragment key={s.id}>
                        <tr style={{ opacity: berlaku ? 1 : .65 }}>
                          <td style={td}><button type="button" aria-label={lebar ? 'Tutup item' : 'Buka item'} aria-expanded={lebar} onClick={() => setTerbuka(t => { const x = new Set(t); if (x.has(s.id)) x.delete(s.id); else x.add(s.id); return x; })}
                            style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', padding: 0 }}>{lebar ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                          <td style={td}><b>{s.rekanan}</b><div style={{ fontSize: 11, color: c.sub }}>{[s.nomor_surat ? `No. ${s.nomor_surat}` : null, s.kategori].filter(Boolean).join(' · ') || '—'}</div></td>
                          <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTanggal(s.tgl_surat)}</td>
                          <td style={{ ...td, whiteSpace: 'nowrap', color: berlaku ? c.text : '#BA7517' }}>{s.berlaku_sampai ? fmtTanggal(s.berlaku_sampai) : '—'}{!berlaku && ' · kedaluwarsa'}</td>
                          <td style={{ ...td, fontFamily: MONO, textAlign: 'right' }}>{s.item.length}</td>
                          <td style={td}>{s.file_id ? <a href={unduhBerkas(s.file_id)} target="_blank" rel="noopener noreferrer" style={{ color: '#7C5CFC', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Paperclip size={12} />surat</a> : <span style={{ color: c.sub }}>—</span>}</td>
                          <td style={{ ...td, textAlign: 'right' }}>
                            {bolehUbah && <MenuBaris c={c} label={`Aksi surat ${s.rekanan}`} onPilih={k => { if (k === 'ubah') setBuka({ surat: s }); else void hapus(s); }}
                              butir={[{ kunci: 'ubah', label: 'Ubah surat & item', icon: <Pencil size={13} /> }, { kunci: 'hapus', label: 'Hapus surat', icon: <Trash2 size={13} />, bahaya: true, pisah: true }]} />}
                          </td>
                        </tr>
                        {lebar && (
                          <tr><td colSpan={7} style={{ ...td, background: c.rowOdd, padding: '6px 10px 10px 38px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead><tr>{['Barang · merk/tipe', 'Spesifikasi', 'Satuan', 'Harga satuan', ''].map(h => <th key={h} style={{ ...th, fontSize: 10.5 }}>{h}</th>)}</tr></thead>
                              <tbody>{s.item.map(i => (
                                <tr key={i.id}>
                                  <td style={{ padding: '5px 8px', fontSize: 12 }}><b>{i.barang_nama ?? i.nama_barang}</b>{i.barang_id === null && <span style={{ color: '#BA7517', fontSize: 11 }}> · belum ditautkan</span>}{i.merk_tipe ? <div style={{ fontSize: 11, color: c.sub }}>{i.merk_tipe}</div> : null}</td>
                                  <td style={{ padding: '5px 8px', fontSize: 11.5, color: c.sub }}>{i.spesifikasi || '—'}</td>
                                  <td style={{ padding: '5px 8px', fontSize: 12 }}>{i.satuan || 'unit'}</td>
                                  <td style={{ padding: '5px 8px', fontSize: 12, fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtRp(i.harga_satuan)}</td>
                                  <td style={{ padding: '5px 8px', fontSize: 11 }}>{i.dipakai > 0 && <span style={{ border: '1px solid #1D9E75', color: '#1D9E75', borderRadius: 20, padding: '1px 7px', whiteSpace: 'nowrap' }}>dipakai {i.dipakai} rencana</span>}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Bandingkan c={c} banding={banding} onBukaSurat={id => { const s = surat.find(x => x.id === id); if (s) { setTampilan('SURAT'); setSaring('SEMUA'); setTerbuka(new Set([id])); } }} />
          )}

          {buka && <ModalSurat c={c} awal={buka.surat} rekanan={rekanan} barang={barang} onTutup={() => setBuka(null)} onTersimpan={() => { setBuka(null); void muat(); }} />}
          {impor && <ModalImporPenawaran c={c} rekanan={rekanan} onTutup={() => setImpor(false)} onTersimpan={() => { setImpor(false); void muat(); }} />}
        </>);
      }}
    </BbaShell>
  );
}

function Bandingkan({ c, banding, onBukaSurat }: { c: WarnaBba; banding: ReturnType<typeof bandingkanPenawaran>; onBukaSurat: (id: number) => void }) {
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 11, color: c.sub, textAlign: 'left', borderBottom: `1px solid ${c.border}`, whiteSpace: 'nowrap', background: c.card };
  const lengket: React.CSSProperties = { position: 'sticky', left: 0, zIndex: 1, background: c.card };
  if (banding.baris.length === 0 && banding.belumDitautkan.length === 0) return <div style={{ border: `1px dashed ${c.border}`, borderRadius: 10, padding: 24, textAlign: 'center', color: c.sub, fontSize: 13 }}>Belum ada penawaran untuk dibandingkan.</div>;
  return (<>
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
        <thead><tr>
          <th style={{ ...th, ...lengket }}>Barang (satuan)</th>
          {banding.rekanan.map(r => <th key={r} style={{ ...th, textAlign: 'right' }}>{r}</th>)}
          <th style={{ ...th, textAlign: 'right' }}>Rata-rata berlaku</th><th style={{ ...th, textAlign: 'right' }}>Penawaran</th>
        </tr></thead>
        <tbody>
          {banding.baris.map(b => (
            <tr key={`${b.barang_id}|${b.satuan}`}>
              <td style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, fontWeight: 600, whiteSpace: 'nowrap', ...lengket }}>{b.barang_nama} <span style={{ color: c.sub, fontWeight: 400 }}>({b.satuan})</span></td>
              {banding.rekanan.map(r => {
                const s = b.sel[r];
                return (
                  <td key={r} style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s ? <button type="button" onClick={() => onBukaSurat(s.item.penawaran_id)} data-tooltip={[s.item.merk_tipe, s.item.nomor_surat ? `No. ${s.item.nomor_surat}` : null, `surat ${fmtTanggal(s.item.tgl_surat)}`, s.berlaku ? null : 'kedaluwarsa'].filter(Boolean).join(' · ')}
                      style={{ fontFamily: MONO, fontSize: 12.5, background: s.termurah ? 'rgba(29,158,117,.15)' : 'transparent', color: s.termurah ? '#1D9E75' : s.berlaku ? c.text : c.sub,
                        border: `1px solid ${s.termurah ? '#1D9E75' : 'transparent'}`, borderRadius: 6, padding: '2px 6px', cursor: 'pointer', textDecoration: s.berlaku ? 'none' : 'line-through' }}>
                      {fmtRp(s.item.harga_satuan)}
                    </button> : <span style={{ color: c.sub }}>—</span>}
                  </td>
                );
              })}
              <td style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }}>{b.rata === null ? '—' : fmtRp(b.rata)}</td>
              <td style={{ padding: '7px 10px', fontSize: 12.5, borderBottom: `1px solid ${c.border}`, textAlign: 'right', fontFamily: MONO }}>{b.jumlah}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div style={{ fontSize: 11.5, color: c.sub, marginTop: 6 }}>Hijau = termurah yang masih berlaku. Dicoret = kedaluwarsa (tidak ikut rata-rata). Satuan berbeda dibandingkan di baris terpisah.</div>
    {banding.belumDitautkan.length > 0 && (
      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(186,117,23,.45)', background: 'rgba(186,117,23,.08)', fontSize: 12.5 }}>
        <b style={{ color: '#BA7517' }}>{banding.belumDitautkan.length} item belum ditautkan ke barang</b> — tidak ikut dibandingkan. Tautkan lewat &ldquo;Ubah surat &amp; item&rdquo;:
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {banding.belumDitautkan.slice(0, 12).map(i => <button key={i.id} type="button" onClick={() => onBukaSurat(i.penawaran_id)} style={{ background: 'none', border: `1px solid ${c.border}`, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, color: c.text, cursor: 'pointer' }}>{i.nama_barang} · {i.rekanan}</button>)}
        </div>
      </div>
    )}
  </>);
}

type IsianItem = { id: number | null; barang: PilihanBarang; nama_barang: string; merk_tipe: string; spesifikasi: string; satuan: string; harga: number };
const itemKosong = (): IsianItem => ({ id: null, barang: null, nama_barang: '', merk_tipe: '', spesifikasi: '', satuan: '', harga: 0 });
const isianDariItem = (i: ItemPenawaran): IsianItem => ({ id: i.id, barang: i.barang_id ? { id: i.barang_id, nama: i.barang_nama ?? i.nama_barang } : null, nama_barang: i.nama_barang, merk_tipe: i.merk_tipe ?? '', spesifikasi: i.spesifikasi ?? '', satuan: i.satuan ?? '', harga: i.harga_satuan });

type Kepala = { rekanan: string; nomor_surat: string; tgl_surat: string; berlaku_sampai: string; kategori: string; file_id: string | null; nama_berkas: string | null; catatan: string };
const kepalaBody = (k: Kepala) => ({ rekanan: k.rekanan.trim(), nomor_surat: k.nomor_surat.trim() || null, tgl_surat: k.tgl_surat, berlaku_sampai: k.berlaku_sampai || null, kategori: k.kategori.trim() || null, file_id: k.file_id, catatan: k.catatan.trim() || null });

function IsianKepala({ c, k, setK, rekanan }: { c: WarnaBba; k: Kepala; setK: (k: Kepala) => void; rekanan: string[] }) {
  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub };
  const [unggah, setUnggah] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
      <label style={label}>Rekanan *<input list="bba-rekanan" value={k.rekanan} maxLength={160} onChange={e => setK({ ...k, rekanan: e.target.value })} style={inp} />
        <datalist id="bba-rekanan">{rekanan.map(r => <option key={r} value={r} />)}</datalist></label>
      <label style={label}>Nomor surat<input value={k.nomor_surat} maxLength={120} onChange={e => setK({ ...k, nomor_surat: e.target.value })} style={inp} /></label>
      <label style={label}>Tanggal surat *<input type="date" value={k.tgl_surat} onChange={e => setK({ ...k, tgl_surat: e.target.value })} style={inp} /></label>
      <label style={label}>Berlaku s.d.<input type="date" value={k.berlaku_sampai} min={k.tgl_surat} onChange={e => setK({ ...k, berlaku_sampai: e.target.value })} style={inp} /></label>
      <label style={label}>Kategori<input value={k.kategori} maxLength={80} placeholder="alkes, komputer, mebel…" onChange={e => setK({ ...k, kategori: e.target.value })} style={inp} /></label>
      <label style={label}>Berkas surat (PDF/foto)
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.text }}>
          {k.file_id ? <><Paperclip size={12} />{k.nama_berkas ?? 'terlampir'} <button type="button" onClick={() => setK({ ...k, file_id: null, nama_berkas: null })} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 11.5 }}>lepas</button></>
            : <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={unggah} style={{ fontSize: 11.5, maxWidth: '100%' }}
                onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setUnggah(true); try { const u = await unggahBerkas(f); if (u) setK({ ...k, file_id: u.fileId, nama_berkas: u.filename }); } finally { setUnggah(false); } }} />}
        </span>
        <span style={{ fontSize: 10.5 }}>Tanpa berkas, referensi yang disalin dari surat ini belum dihitung sah.</span>
      </label>
    </div>
  );
}

const kepalaDari = (s: SuratPenawaran | null): Kepala => ({
  rekanan: s?.rekanan ?? '', nomor_surat: s?.nomor_surat ?? '', tgl_surat: s?.tgl_surat ?? tanggalHariIniWIB(), berlaku_sampai: s?.berlaku_sampai ?? '',
  kategori: s?.kategori ?? '', file_id: s?.file_id ?? null, nama_berkas: s?.file_id ? 'berkas tersimpan' : null, catatan: s?.catatan ?? '',
});

function ModalSurat({ c, awal, rekanan, barang, onTutup, onTersimpan }: { c: WarnaBba; awal: SuratPenawaran | null; rekanan: string[]; barang: BarangRingan[]; onTutup: () => void; onTersimpan: () => void }) {
  const [k, setK] = useState<Kepala>(kepalaDari(awal));
  const [item, setItem] = useState<IsianItem[]>(awal ? awal.item.map(isianDariItem) : [itemKosong()]);
  const [sibuk, setSibuk] = useState(false);
  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 12.5, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  const ubahItem = (i: number, x: Partial<IsianItem>) => setItem(xs => xs.map((v, j) => (j === i ? { ...v, ...x } : v)));
  const terisi = item.filter(i => i.nama_barang.trim() || i.barang);
  const sebab = !k.rekanan.trim() ? 'Nama rekanan wajib.' : !k.tgl_surat ? 'Tanggal surat wajib.' : terisi.length === 0 ? 'Minimal satu item.'
    : terisi.some(i => i.harga <= 0) ? 'Harga satuan tiap item harus lebih dari 0.' : null;

  async function simpan() {
    setSibuk(true);
    try {
      const body = {
        ...(awal ? { id: awal.id, expected_version: awal.version } : {}),
        kepala: kepalaBody(k),
        item: terisi.map(i => ({
          id: i.id, nama_barang: (i.nama_barang.trim() || (i.barang && ('id' in i.barang ? i.barang.nama : i.barang.baru)) || '').slice(0, 255),
          ...(i.barang ? ('id' in i.barang ? { barang_id: i.barang.id } : { barang_baru: i.barang.baru }) : {}),
          merk_tipe: i.merk_tipe.trim() || null, spesifikasi: i.spesifikasi.trim() || null, satuan: i.satuan.trim() || null, harga_satuan: i.harga,
        })),
      };
      const d = await fetchJson<unknown>('/api/buku-besar-aset/penawaran', { method: awal ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan'); return; }
      toast.success(`Surat penawaran tersimpan — ${terisi.length} item`); onTersimpan();
    } finally { setSibuk(false); }
  }

  return (
    <Bingkai c={c} judul={awal ? 'Ubah surat penawaran' : 'Catat surat penawaran'} lebar={980} onTutup={onTutup}
      kaki={<><PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton><PrimaButton menulis variant="primary" disabled={sibuk || !!sebab} data-tooltip={sebab ?? undefined} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Simpan'}</PrimaButton></>}>
      <IsianKepala c={c} k={k} setK={setK} rekanan={rekanan} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {item.map((it, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1.4fr) minmax(140px, 1fr) minmax(160px, 1.2fr) 80px 150px 30px', gap: 8, alignItems: 'start', padding: 8, border: `1px solid ${c.border}`, borderRadius: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <input value={it.nama_barang} placeholder="Nama barang di surat" maxLength={255} onChange={e => ubahItem(i, { nama_barang: e.target.value })} style={inp} aria-label="Nama barang di surat" />
              <PilihBarang daftar={barang} nilai={it.barang} saran={null} onUbah={p => ubahItem(i, { barang: p })} c={c} inp={inp} />
            </div>
            <input value={it.merk_tipe} placeholder="Merk / tipe" maxLength={160} onChange={e => ubahItem(i, { merk_tipe: e.target.value })} style={inp} aria-label="Merk / tipe" />
            <input value={it.spesifikasi} placeholder="Spesifikasi" maxLength={500} onChange={e => ubahItem(i, { spesifikasi: e.target.value })} style={inp} aria-label="Spesifikasi" />
            <input value={it.satuan} placeholder="unit" maxLength={40} onChange={e => ubahItem(i, { satuan: e.target.value })} style={inp} aria-label="Satuan" />
            <InputNominal value={it.harga} onChange={v => ubahItem(i, { harga: v })} style={{ ...inp, fontFamily: MONO, textAlign: 'right' }} />
            <button type="button" aria-label="Buang item" onClick={() => setItem(xs => xs.filter((_, j) => j !== i))} disabled={item.length === 1}
              style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', paddingTop: 6 }}><Trash2 size={14} /></button>
          </div>
        ))}
        <div><PrimaButton variant="ghost" size="sm" onClick={() => setItem(xs => [...xs, itemKosong()])}>+ Item</PrimaButton></div>
      </div>
    </Bingkai>
  );
}

type PratinjauImpor = { item: Array<{ baris: number; nama_barang: string; merk_tipe: string | null; satuan: string | null; harga_satuan: number; barang_id: number | null; barang_nama: string | null }>; dilewati: string[] };

function ModalImporPenawaran({ c, rekanan, onTutup, onTersimpan }: { c: WarnaBba; rekanan: string[]; onTutup: () => void; onTersimpan: () => void }) {
  const [berkas, setBerkas] = useState<File | null>(null);
  const [pr, setPr] = useState<PratinjauImpor | null>(null);
  const [k, setK] = useState<Kepala>(kepalaDari(null));
  const [sibuk, setSibuk] = useState(false);
  async function kirim(step: 'pratinjau' | 'simpan') {
    if (!berkas) return;
    setSibuk(true);
    try {
      const fd = new FormData(); fd.append('file', berkas);
      if (step === 'simpan') fd.append('kepala', JSON.stringify(kepalaBody(k)));
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/penawaran/impor?step=${step}`, { method: 'POST', body: fd });
      if (!d.ok) { toast.error(d.message || 'Berkas belum bisa diimpor'); return; }
      if (step === 'pratinjau') setPr(d as unknown as PratinjauImpor);
      else { toast.success(`Surat penawaran ${k.rekanan} tersimpan — ${(d as unknown as { item: number }).item} item`); onTersimpan(); }
    } finally { setSibuk(false); }
  }
  const sebab = !pr ? 'Baca berkasnya dulu.' : !k.rekanan.trim() ? 'Nama rekanan wajib.' : !k.tgl_surat ? 'Tanggal surat wajib.' : null;
  return (
    <Bingkai c={c} judul="Impor Excel penawaran" sub="Satu berkas = item satu surat. Kepala surat diisi di sini." lebar={860} onTutup={onTutup}
      kaki={<>
        <a href="/api/buku-besar-aset/penawaran/impor" style={{ marginRight: 'auto', fontSize: 12.5, color: '#7C5CFC', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Download size={13} />Unduh templat</a>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || !!sebab} data-tooltip={sebab ?? undefined} onClick={() => void kirim('simpan')}>{sibuk ? 'Menyimpan…' : 'Simpan surat'}</PrimaButton>
      </>}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <FileSpreadsheet size={16} color={c.sub} />
        <input type="file" accept=".xlsx" onChange={e => { setBerkas(e.target.files?.[0] ?? null); setPr(null); }} style={{ fontSize: 12 }} />
        <PrimaButton variant="ghost" size="sm" disabled={!berkas || sibuk} onClick={() => void kirim('pratinjau')}>Baca berkas</PrimaButton>
      </div>
      {pr && (<>
        <IsianKepala c={c} k={k} setK={setK} rekanan={rekanan} />
        <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>{pr.item.length} item terbaca</b> · {pr.item.filter(i => i.barang_id).length} cocok dengan Master Barang, sisanya &ldquo;belum ditautkan&rdquo; (bisa ditautkan sesudahnya).</div>
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, maxHeight: 260, overflow: 'auto' }}>
          {pr.item.map(i => (
            <div key={i.baris} style={{ display: 'flex', gap: 10, padding: '5px 10px', fontSize: 12, borderBottom: `1px solid ${c.border}` }}>
              <span style={{ flex: 1 }}>{i.nama_barang}{i.merk_tipe ? ` · ${i.merk_tipe}` : ''} {i.barang_id ? <span style={{ color: '#1D9E75' }}>→ {i.barang_nama}</span> : <span style={{ color: '#BA7517' }}>· belum ditautkan</span>}</span>
              <span style={{ color: c.sub }}>{i.satuan || 'unit'}</span>
              <span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmtRp(i.harga_satuan)}</span>
            </div>
          ))}
        </div>
        {pr.dilewati.length > 0 && <div style={{ fontSize: 11.5, color: '#BA7517', marginTop: 6 }}>{pr.dilewati.length} baris dilewati: {pr.dilewati.slice(0, 3).join(' ')}</div>}
      </>)}
    </Bingkai>
  );
}
