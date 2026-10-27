'use client';
// Kartu barang (CONCEPT-bba-perencanaan §5.3, CONCEPT-bba-buku-aset §8): yang dimiliki (register Buku
// Aset yang ditautkan) + pernah dibeli / dalam proses / direncanakan + riwayat per tahun. Angkanya
// dihitung server (detailBarang) — kartu ini hanya menampilkan. Dipakai kolom tengah modal item DAN
// klik baris di tampilan Per Barang.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchJson } from '@/lib/shared/api';
import { LABEL_STATUS, type BbaStatus } from '@/lib/bba/status';
import { fmtTanggal, type Kondisi } from '@/lib/bba/kondisi';
import type { DetailBarang, PembelianLalu, KibLalu } from '@/lib/data/buku-besar-aset';
import { petunjukRencana, type JenisRencana } from '@/lib/bba/rencana';
import { LABEL_SUMBER, LABEL_JENIS_BUKTI, type ReferensiIsian } from '@/lib/bba/referensi';
import { safeHref } from '@/lib/shared/url';
import BarKondisi, { WARNA_KONDISI } from './BarKondisi';
import { unduhBerkas, type Warna } from './ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtVol = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
// Kolom tengah modal cuma 250 px — harga penuh "Rp 13.500.000" memaksa tabel menggulir ke samping.
const fmtJuta = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 })} jt` : Math.round(n).toLocaleString('id-ID');

type Props = {
  barangId: number;
  tahun: number;
  c: Warna;
  /** Baris riwayat tahun ini ditandai "(ini)" — di modal item, tahun item yang sedang dibuka. */
  tandaiTahun?: number;
  /** Ringkas: tanpa tabel riwayat penuh (kolom tengah modal yang sempit). */
  ringkas?: boolean;
  /** Dinaikkan induk sesudah ada yang tertulis — memuat ulang kartu. */
  versi?: number;
  /** Jenis rencana yang sedang diisi — memunculkan petunjuk §8 (bukan larangan). */
  jenis?: JenisRencana | null;
  /** Item yang sedang dibuka tidak ikut "pembelian sebelumnya". */
  kecualiId?: number;
  /** Ada → tombol "Pakai sebagai referensi" di pembelian sebelumnya (§7.7). */
  onPakaiReferensi?: (r: ReferensiIsian) => void;
};

export default function KartuBarang({ barangId, tahun, c, tandaiTahun, ringkas, versi = 0, jenis = null, kecualiId, onPakaiReferensi }: Props) {
  const [detail, setDetail] = useState<DetailBarang | null>(null);
  const [galat, setGalat] = useState('');
  const [beli, setBeli] = useState<{ barang: number; prima: PembelianLalu[]; kib: KibLalu[] } | null>(null);
  const nomor = useRef(0);
  const nomorBeli = useRef(0);

  useEffect(() => {
    const n = ++nomorBeli.current;
    void Promise.resolve().then(async () => {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/pembelian?barang=${barangId}${kecualiId ? `&kecuali=${kecualiId}` : ''}`);
      if (n !== nomorBeli.current || !d.ok) return;
      const x = d as unknown as { prima: PembelianLalu[]; kib: KibLalu[] };
      setBeli({ barang: barangId, prima: x.prima, kib: x.kib });
    });
  }, [barangId, kecualiId, versi]);

  useEffect(() => {
    if (tahun < 2020 || tahun > 2100) return; // tahun setengah diketik di Tambah item
    const n = ++nomor.current;
    void Promise.resolve().then(async () => {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/barang?id=${barangId}&tahun=${tahun}`);
      if (n !== nomor.current) return; // jawaban terlambat untuk barang yang sudah diganti
      if (!d.ok) { setGalat(d.message || 'Gagal memuat barang'); setDetail(null); return; }
      setGalat(''); setDetail(d as unknown as DetailBarang);
    });
  }, [barangId, tahun, versi]);

  if (galat) return <div style={{ fontSize: 12, color: '#E24B4A' }}>{galat}</div>;
  if (!detail || detail.barang.id !== barangId) return <div style={{ fontSize: 12, color: c.sub }}>Memuat barang…</div>;
  const { barang, ringkas: r, riwayat, dimiliki: m, dimiliki_per_ruang } = detail;
  const satuan = barang.satuan || 'unit';
  const angka: [string, React.ReactNode, string?][] = [
    ['Pernah dibeli', r.dibeli > 0
      ? <span key="d" style={{ fontFamily: MONO }}>{fmtVol(r.dibeli)} {satuan}</span>
      : <span key="d" style={{ color: c.sub }}>belum</span>,
      r.tahun_beli_terakhir ? `terakhir ${r.tahun_beli_terakhir}${r.harga_beli_terakhir ? ` · ${fmtRp(r.harga_beli_terakhir)}/${satuan}` : ''}` : undefined],
    ['Dalam proses', <span key="p" style={{ fontFamily: MONO, color: r.diproses > 0 ? '#378ADD' : c.sub }}>{fmtVol(r.diproses)} {satuan}</span>, 's.d. ' + tahun],
    [`Direncanakan ${tahun}`, <span key="r" style={{ fontFamily: MONO }}>{fmtVol(r.direncanakan)} {satuan}</span>],
  ];

  const petunjuk = petunjukRencana(jenis, m.jumlah > 0 ? m : null, satuan);
  const pembelian = beli?.barang === barangId ? beli : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, color: c.sub }}>Barang</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{barang.nama}{barang.kategori_aset ? <span style={{ fontWeight: 400, color: c.sub, fontSize: 11.5 }}> · {barang.kategori_aset}</span> : null}</div>

      {petunjuk.length > 0 && (
        <div role="note" style={{ border: '1px solid rgba(186,117,23,.5)', background: 'rgba(186,117,23,.10)', borderRadius: 8, padding: '6px 9px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {petunjuk.map(p => <span key={p} style={{ fontSize: 11.5, color: '#BA7517', lineHeight: 1.45 }}>{p}</span>)}
        </div>
      )}

      {/* §8: yang dimiliki = register Buku Aset yang ditautkan ke barang ini (dihitung, bukan diketik) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 0', fontSize: 12, borderBottom: `1px solid ${c.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ color: c.sub }}>Dimiliki</span>
          {m.jumlah > 0 && <Link href={`/buku-besar-aset/aset?barang=${barang.id}`} style={{ fontSize: 11, color: '#378ADD' }}>Lihat {m.jumlah} register →</Link>}
        </div>
        {m.jumlah === 0
          ? <span style={{ color: c.sub }}>Belum ada register Buku Aset yang ditautkan ke barang ini</span>
          : <>
              {m.kondisi.total > 0 && <BarKondisi k={m.kondisi} sub={c.sub} satuan={satuan} ringkas={ringkas} />}
              <span style={{ fontSize: 11, color: c.sub }}>
                {m.jumlah.toLocaleString('id-ID')} register{m.kosong > 0 ? ` · ${m.kosong} tanpa kondisi` : ''}
                {m.cekTerakhir ? ` · dicek terakhir ${fmtTanggal(m.cekTerakhir)}` : ''}
              </span>
              {m.perluDicek > 0 && <span style={{ fontSize: 11, color: '#BA7517', fontWeight: 600 }}>{m.perluDicek} perlu dicek (belum pernah / lewat jarak opname)</span>}
              {dimiliki_per_ruang.map(g => (
                <div key={g.lokasi_id ?? 'tanpa'} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: c.sub }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.lokasi ?? 'Tanpa ruangan'} · {g.ringkas.jumlah}</span>
                  <AngkaKondisi k={g.ringkas.kondisi} />
                </div>
              ))}
            </>}
      </div>

      {angka.map(([k, v, ket]) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '6px 0', fontSize: 12, borderBottom: `1px solid ${c.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span style={{ color: c.sub }}>{k}</span><span>{v}</span></div>
          {ket && <span style={{ fontSize: 10.5, color: c.sub, textAlign: 'right' }}>{ket}</span>}
        </div>
      ))}
      <div style={{ fontSize: 11, color: c.sub, marginTop: 6 }}>Riwayat per tahun</div>
      {riwayat.length === 0 && <div style={{ fontSize: 12, color: c.sub }}>Belum ada item lain untuk barang ini.</div>}
      {riwayat.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
            <thead><tr style={{ color: c.sub }}>
              <th style={{ textAlign: 'left', padding: '3px 4px', fontWeight: 600 }}>Tahun</th>
              <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 600 }}>Rencana</th>
              <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 600 }}>Terbeli</th>
              <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 600 }}>{ringkas ? 'Rp' : 'Harga'}/{satuan}</th>
              {!ringkas && <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 600 }}>Ref. rata</th>}
              {!ringkas && <th style={{ textAlign: 'left', padding: '3px 4px', fontWeight: 600 }}>Status</th>}
            </tr></thead>
            <tbody>
              {riwayat.map(w => (
                <tr key={w.tahun} style={{ borderTop: `1px solid ${c.border}`, background: w.tahun === tandaiTahun ? 'rgba(239,159,39,.10)' : 'transparent' }}>
                  <td style={{ padding: '3px 4px', fontFamily: MONO, whiteSpace: 'nowrap' }}>
                    {w.tahun}{w.tahun === tandaiTahun ? <span style={ringkas ? { display: 'block', fontSize: 10, color: c.sub } : undefined}> (ini)</span> : null}
                  </td>
                  <td style={{ padding: '3px 4px', fontFamily: MONO, textAlign: 'right' }}>{fmtVol(w.vol_rencana)}</td>
                  <td style={{ padding: '3px 4px', fontFamily: MONO, textAlign: 'right' }}>{fmtVol(w.vol_realisasi)}</td>
                  <td style={{ padding: '3px 4px', fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>{w.harga_satuan ? (ringkas ? fmtJuta(w.harga_satuan) : fmtRp(w.harga_satuan)) : '—'}</td>
                  {!ringkas && <td style={{ padding: '3px 4px', fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>{w.ref_rata ? fmtRp(w.ref_rata) : '—'}</td>}
                  {!ringkas && <td style={{ padding: '3px 4px', fontSize: 10.5, color: c.sub }}>
                    {(Object.entries(w.status) as [BbaStatus, number][]).map(([s, n]) => `${LABEL_STATUS[s]}${n > 1 ? ` ×${n}` : ''}`).join(', ')}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* §7.7: pembelian sebelumnya barang yang sama — referensi, bukti, dan kondisinya sekarang */}
      {pembelian && (pembelian.prima.length > 0 || pembelian.kib.length > 0) && <>
        <div style={{ fontSize: 11, color: c.sub, marginTop: 10 }}>Pembelian sebelumnya</div>
        {pembelian.prima.map(p => (
          <div key={p.id} style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5 }}>
            <div>
              <b style={{ fontFamily: MONO }}>{p.tahun}</b> · {fmtVol(p.vol_realisasi)} {p.satuan || satuan}
              {p.harga_satuan ? <> · <span style={{ fontFamily: MONO }}>{fmtRp(p.harga_satuan)}</span>/{p.satuan || satuan}</> : null}
              {p.tgl_realisasi ? <span style={{ color: c.sub }}> · diterima {fmtTanggal(p.tgl_realisasi)}</span> : null}
            </div>
            {p.referensi.length > 0 && <div style={{ color: c.sub }}>dibandingkan waktu itu:</div>}
            {p.referensi.map((r, i) => {
              const href = safeHref(r.url);
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ minWidth: 0 }}>
                    {[r.merk_tipe, r.nama_penyedia, LABEL_SUMBER[r.sumber]].filter(Boolean).join(' · ')}
                    {r.harga ? <> · <span style={{ fontFamily: MONO }}>{fmtRp(r.harga)}</span></> : null}
                    {r.tgl_cek ? <span style={{ color: c.sub }}> · dicek {fmtTanggal(r.tgl_cek)}</span> : null}
                  </span>
                  {href && <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#378ADD' }}>tautan</a>}
                  {r.file_id && <a href={unduhBerkas(r.file_id)} target="_blank" rel="noopener noreferrer" style={{ color: '#1D9E75' }}>berkas</a>}
                  {onPakaiReferensi && <button type="button" onClick={() => onPakaiReferensi(r)}
                    style={{ background: 'none', border: 'none', color: '#7C5CFC', cursor: 'pointer', padding: 0, fontSize: 11.5, textDecoration: 'underline' }}>Pakai sebagai referensi</button>}
                </div>
              );
            })}
            {p.bukti.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {p.bukti.map(b => {
                  const href = b.file_id ? unduhBerkas(b.file_id) : safeHref(b.url);
                  return href ? <a key={b.id} href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#1D9E75' }}>{LABEL_JENIS_BUKTI[b.jenis]}</a> : null;
                })}
              </div>
            )}
          </div>
        ))}
        {pembelian.kib.length > 0 && (
          <div style={{ fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ color: c.sub }}>Di Buku Aset per tahun perolehan (termasuk sebelum PRIMA):</span>
            {pembelian.kib.map(k => (
              <span key={k.tahun ?? 'x'}>
                <b style={{ fontFamily: MONO }}>{k.tahun ?? '—'}</b> · {k.jumlah} {satuan}{k.merk.length ? ` · ${k.merk.join(', ')}` : ''}
                <span style={{ color: c.sub }}> · kondisi sekarang </span><AngkaKondisi k={{ baik: k.baik, rusak_ringan: k.rusak_ringan, rusak_berat: k.rusak_berat, total: k.jumlah }} />
              </span>
            ))}
          </div>
        )}
      </>}
    </div>
  );
}

function AngkaKondisi({ k }: { k: Kondisi }) {
  return (
    <span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>
      <span style={{ color: WARNA_KONDISI.baik }}>{k.baik}</span> · <span style={{ color: WARNA_KONDISI.rusak_ringan }}>{k.rusak_ringan}</span> · <span style={{ color: WARNA_KONDISI.rusak_berat }}>{k.rusak_berat}</span>
    </span>
  );
}
