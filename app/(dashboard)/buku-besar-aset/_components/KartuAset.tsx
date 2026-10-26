'use client';
// Kartu aset (docs/CONCEPT-bba-buku-aset.md §5.2, §14): kolom KIB apa adanya + tambahan PRIMA
// (nama sehari-hari, barang) + kaitan tanah ↔ bangunan + riwayat. Kolom KIB hanya berubah lewat
// impor; yang disunting di sini hanya tambahan PRIMA (satu Simpan, angka kunci dari muatan segar — L77).
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { KOLOM_KIB, NAMA_GOLONGAN, LABEL_KONDISI, KOLOM_POKOK } from '@/lib/bba/kib';
import { namaTampil } from '@/lib/bba/aset';
import type { DetailAset } from '@/lib/data/bba-aset';
import type { BbaBarang } from '@/lib/data/buku-besar-aset';
import type { BarangRingan } from '@/lib/bba/barang';
import PilihBarang, { type PilihanBarang } from './PilihBarang';
import type { WarnaBba } from './BbaShell';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
const JENIS_RIWAYAT: Record<string, string> = {
  IMPOR: 'Impor KIB', UBAH: 'Diubah', KONDISI: 'Kondisi', PINDAH: 'Pindah ruangan', TERIMA: 'Diterima',
  REGISTER: 'Register', REHAB: 'Rehab', HAPUS: 'Dihapus',
};

type Props = { id: number; c: WarnaBba; bolehUbah: boolean; onTutup: () => void; onPindah: (id: number) => void; onTersimpan: () => void };

function ringkasPerubahan(sebelum: Record<string, unknown> | null, sesudah: Record<string, unknown> | null): string {
  const kunci = Object.keys(sesudah ?? {});
  if (kunci.length === 0) return '';
  if (!sebelum || Object.keys(sebelum).length === 0) return kunci.map(k => `${k}: ${String(sesudah![k] ?? '—')}`).join(' · ');
  return kunci.map(k => `${k}: ${String(sebelum[k] ?? '—')} → ${String(sesudah![k] ?? '—')}`).join(' · ');
}

export default function KartuAset({ id, c, bolehUbah, onTutup, onPindah, onTersimpan }: Props) {
  const [d, setD] = useState<DetailAset | null>(null);
  const [galat, setGalat] = useState('');
  const [nama, setNama] = useState('');
  const [barang, setBarang] = useState<PilihanBarang>(null);
  const [daftarBarang, setDaftarBarang] = useState<BarangRingan[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const nomor = useRef(0);

  async function muat() {
    const n = ++nomor.current;
    const r = await fetchJson<unknown>(`/api/buku-besar-aset/aset?id=${id}`);
    if (n !== nomor.current) return;
    if (!r.ok) { setGalat(r.message || 'Gagal memuat aset'); return; }
    const det = r as unknown as DetailAset;
    setGalat(''); setD(det);
    setNama(det.aset.nama ?? '');
    setBarang(det.aset.barang_id ? { id: det.aset.barang_id, nama: det.aset.barang_nama ?? '' } : null);
  }

  useEffect(() => {
    void Promise.resolve().then(muat);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat ulang tiap ganti aset
  }, [id]);
  useEffect(() => {
    if (!bolehUbah) return;
    void Promise.resolve().then(async () => {
      const r = await fetchJson<unknown>('/api/buku-besar-aset/barang');
      if (r.ok) setDaftarBarang((r as unknown as { data: BbaBarang[] }).data.map(b => ({ id: b.id, nama: b.nama })));
    });
  }, [bolehUbah]);

  const a = d?.aset;
  const barangLama = a?.barang_id ? { id: a.barang_id, nama: a.barang_nama ?? '' } : null;
  const namaBerubah = !!a && (nama.trim() || null) !== (a.nama ?? null);
  const barangBerubah = !!a && JSON.stringify(barang) !== JSON.stringify(barangLama);

  async function simpan() {
    if (!a) return;
    setMenyimpan(true);
    try {
      const body: Record<string, unknown> = { id: a.id, expected_version: a.version };
      if (namaBerubah) body.nama = nama.trim() || null;
      if (barangBerubah) Object.assign(body, !barang ? { barang_id: null } : 'id' in barang ? { barang_id: barang.id } : { barang_baru: barang.baru });
      const r = await fetchJson<unknown>('/api/buku-besar-aset/aset', { method: 'PATCH', body: JSON.stringify(body) });
      if (!r.ok) {
        toast.error(r.message || 'Gagal menyimpan');
        if (r.code === 'VERSION_CONFLICT') void muat();
        return;
      }
      toast.success('Tersimpan');
      onTersimpan();
      void muat();
    } finally { setMenyimpan(false); }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  const baris = (label: string, isi: React.ReactNode, mono = false) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 38%) 1fr', gap: 10, padding: '5px 0', borderBottom: `1px solid ${c.border}`, fontSize: 12.5 }}>
      <span style={{ color: c.sub }}>{label}</span><span style={{ fontFamily: mono ? MONO : undefined, wordBreak: 'break-word' }}>{isi}</span>
    </div>
  );

  return (
    <div onClick={onTutup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: 'min(760px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a ? namaTampil(a) : 'Memuat aset…'}</div>
            {a && <div style={{ fontSize: 11.5, color: c.sub }}>KIB {a.golongan} · {NAMA_GOLONGAN[a.golongan]}{a.tahun_perolehan ? ` · perolehan ${a.tahun_perolehan}` : ''}{a.status === 'DIHAPUS' ? ' · DIHAPUS' : ''}</div>}
          </div>
          <button type="button" aria-label="Tutup" onClick={onTutup} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', padding: 4, display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {galat ? <div style={{ color: '#E24B4A', fontSize: 12.5 }}>{galat}</div> : !a ? <div style={{ color: c.sub, fontSize: 12.5 }}>Memuat…</div> : (<>
            <div style={{ fontSize: 11, color: c.sub, marginBottom: 4, fontWeight: 600 }}>DARI KIB PROVINSI</div>
            {baris('Nama resmi', a.nama_resmi)}
            {a.kode_barang && baris('Kode barang', a.kode_barang, true)}
            {a.register && baris('Register', a.register, true)}
            {baris(a.golongan === 'F' ? 'Nilai kontrak' : 'Harga', fmtRp(a.harga), true)}
            {a.asal_usul && baris('Asal usul', a.asal_usul)}
            {KOLOM_KIB[a.golongan].filter(k => !(KOLOM_POKOK as readonly string[]).includes(k.kunci) && a.kib[k.kunci] != null && a.kib[k.kunci] !== '')
              .map(k => <div key={k.kunci}>{baris(k.label, typeof a.kib[k.kunci] === 'number' ? Number(a.kib[k.kunci]).toLocaleString('id-ID') : String(a.kib[k.kunci]), k.tipe !== 'teks')}</div>)}
            {a.keterangan && baris('Keterangan', a.keterangan)}

            {(d!.tanah || d!.diAtasnya.length > 0) && (
              <div style={{ marginTop: 10 }}>
                {d!.tanah && baris('Berdiri di tanah', <Tautan onClick={() => onPindah(d!.tanah!.id)}>{d!.tanah.nama}{d!.tanah.tahun ? ` (perolehan ${d!.tanah.tahun})` : ''}</Tautan>)}
                {d!.diAtasnya.length > 0 && baris(`Bangunan & jaringan di atasnya (${d!.diAtasnya.length})`, (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px' }}>
                    {d!.diAtasnya.map(x => <Tautan key={x.id} onClick={() => onPindah(x.id)}>{x.nama}</Tautan>)}
                  </span>
                ))}
              </div>
            )}

            <div style={{ fontSize: 11, color: c.sub, margin: '14px 0 4px', fontWeight: 600 }}>DI PRIMA</div>
            {a.golongan !== 'A' && baris('Kondisi', a.kondisi
              ? <span>{LABEL_KONDISI[a.kondisi]}{a.kondisi_sumber === 'CEK'
                  ? <span style={{ color: c.sub }}> — dicek {a.kondisi_oleh ?? '—'}{a.kondisi_tgl ? `, ${a.kondisi_tgl}` : ''}</span>
                  : <span style={{ color: '#BA7517' }}> — dari sistem provinsi, belum dicek</span>}</span>
              : <span style={{ color: '#BA7517' }}>Belum dicek</span>)}
            {baris('Ruangan', a.lokasi_nama ?? <span style={{ color: c.sub }}>Belum ditempatkan</span>)}
            <fieldset disabled={!bolehUbah} style={{ border: 0, padding: 0, margin: '8px 0 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: c.sub }}>Nama sehari-hari <span style={{ opacity: .8 }}>— yang dicari orang (&ldquo;Gedung Bangsal I&rdquo;), nama resmi tetap di atas</span></span>
                <input value={nama} onChange={e => setNama(e.target.value)} maxLength={255} style={inp} placeholder={a.nama_resmi} />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: c.sub }}>Barang <span style={{ opacity: .8 }}>— jenis barang di kamus, kunci ringkasan saat merencanakan</span></span>
                {bolehUbah
                  ? <PilihBarang daftar={daftarBarang} nilai={barang} saran={null} onUbah={setBarang} c={c} inp={inp} />
                  : <span style={{ fontSize: 12.5 }}>{a.barang_nama ?? <span style={{ color: c.sub }}>Belum ditautkan</span>}</span>}
              </div>
            </fieldset>

            <div style={{ fontSize: 11, color: c.sub, margin: '16px 0 4px', fontWeight: 600 }}>RIWAYAT</div>
            {d!.riwayat.length === 0 && <div style={{ fontSize: 12, color: c.sub }}>Belum ada riwayat.</div>}
            {d!.riwayat.map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '5px 0', borderBottom: `1px dashed ${c.border}` }}>
                <span style={{ fontFamily: MONO, color: c.sub, whiteSpace: 'nowrap' }}>{r.pada}</span>
                <span style={{ minWidth: 0 }}>
                  <b>{JENIS_RIWAYAT[r.jenis] ?? r.jenis}</b>{r.oleh ? <span style={{ color: c.sub }}> · {r.oleh}</span> : null}
                  {r.catatan && <span style={{ color: c.sub }}> · {r.catatan}</span>}
                  {ringkasPerubahan(r.sebelum, r.sesudah) && <div style={{ color: c.sub, wordBreak: 'break-word' }}>{ringkasPerubahan(r.sebelum, r.sesudah)}</div>}
                </span>
              </div>
            ))}
          </>)}
        </div>
        {bolehUbah && a && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, fontSize: 11.5, color: namaBerubah || barangBerubah ? '#BA7517' : c.sub }}>{namaBerubah || barangBerubah ? 'Ada perubahan yang belum disimpan' : 'Kolom KIB berubah hanya lewat Impor KIB.'}</span>
            <PrimaButton variant="ghost" onClick={onTutup}>Tutup</PrimaButton>
            <PrimaButton menulis variant="primary" disabled={menyimpan || !(namaBerubah || barangBerubah)} onClick={() => void simpan()}>{menyimpan ? 'Menyimpan…' : 'Simpan'}</PrimaButton>
          </div>
        )}
      </div>
    </div>
  );
}

function Tautan({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, color: '#7C5CFC', cursor: 'pointer', textDecoration: 'underline', fontSize: 12.5, textAlign: 'left', fontFamily: 'inherit' }}>{children}</button>;
}
