'use client';
// Pendataan kondisi eksisting per lokasi (CONCEPT-bba-perencanaan §6.1): pilih lokasi + tanggal →
// barang yang pernah tercatat di lokasi itu (+ tambah barang) dengan 3 kotak angka → satu Simpan.
// Angka terakhir ditampilkan sebagai pembanding, TIDAK disalin diam-diam: kotak kosong = barang itu
// tidak didata kali ini. "Isi sama seperti terakhir" ada, tapi harus ditekan.

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import Tip from '@/components/ui/Tip';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { fmtTanggal, isianTerisi, MAKS_UNIT, type IsianPendataan } from '@/lib/bba/eksisting';
import type { BbaBarang, BbaLokasi, BarisFormPendataan } from '@/lib/data/buku-besar-aset';
import { unggahBerkas, unduhBerkas, type Warna } from './ModalItem';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const BERKAS_FOTO = '.jpg,.jpeg,.png,.webp,.pdf';
const KOTAK = ['baik', 'rusak_ringan', 'rusak_berat'] as const;
const LABEL_KOTAK = { baik: 'Baik', rusak_ringan: 'Rusak ringan', rusak_berat: 'Rusak berat' } as const;

type Baris = BarisFormPendataan & { isian: IsianPendataan; catatan: string; file_id: string | null; ditambah: boolean };
const kosong = (): IsianPendataan => ({ baik: null, rusak_ringan: null, rusak_berat: null });

type Props = {
  c: Warna;
  /** Dari kartu barang: barang ini langsung ada di form (pendataan per barang, satu lokasi). */
  barangAwal?: { id: number; nama: string; satuan: string | null } | null;
  onTutup: () => void;
  onTersimpan: () => void;
};

export default function ModalPendataan({ c, barangAwal = null, onTutup, onTersimpan }: Props) {
  const hariIni = tanggalHariIniWIB();
  const [lokasiList, setLokasiList] = useState<BbaLokasi[] | null>(null);
  const [barangList, setBarangList] = useState<BbaBarang[]>([]);
  const [lokasiId, setLokasiId] = useState<number | null>(null);
  const [tgl, setTgl] = useState(hariIni);
  const [baris, setBaris] = useState<Baris[] | null>(null);
  const [dasar, setDasar] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [unggahKe, setUnggahKe] = useState<number | null>(null);
  const pilihFoto = useRef<HTMLInputElement>(null);
  const nomor = useRef(0);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const [dL, dB] = await Promise.all([fetchJson<unknown>('/api/buku-besar-aset/lokasi'), fetchJson<unknown>('/api/buku-besar-aset/barang')]);
      if (dL.ok) setLokasiList((dL as unknown as { data: BbaLokasi[] }).data);
      else { setLokasiList([]); toast.error(dL.message || 'Gagal memuat lokasi'); }
      if (dB.ok) setBarangList((dB as unknown as { data: BbaBarang[] }).data);
    });
  }, []);

  async function muatForm(lok: number, tanggal: string) {
    const n = ++nomor.current;
    setMemuat(true);
    try {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/eksisting?lokasi_id=${lok}&tgl=${tanggal}`);
      if (n !== nomor.current) return; // lokasi/tanggal sudah diganti lagi
      if (!d.ok) { toast.error(d.message || 'Gagal memuat form'); setBaris([]); return; }
      const form = (d as unknown as { baris: BarisFormPendataan[] }).baris;
      // Tanggal yang sama sudah didata → form berisi angka itu (Simpan = koreksi/menimpa).
      const isi: Baris[] = form.map(f => ({
        ...f, ditambah: false,
        isian: f.tanggal_ini ? { baik: f.tanggal_ini.baik, rusak_ringan: f.tanggal_ini.rusak_ringan, rusak_berat: f.tanggal_ini.rusak_berat } : kosong(),
        catatan: f.tanggal_ini?.catatan ?? '', file_id: f.tanggal_ini?.file_id ?? null,
      }));
      if (barangAwal && !isi.some(b => b.barang_id === barangAwal.id)) {
        isi.push({ barang_id: barangAwal.id, nama: barangAwal.nama, satuan: barangAwal.satuan, terakhir: null, tanggal_ini: null, ditambah: true, isian: kosong(), catatan: '', file_id: null });
      }
      setBaris(isi);
      setDasar(JSON.stringify(isi.map(b => [b.barang_id, b.isian, b.catatan, b.file_id])));
    } finally { if (n === nomor.current) setMemuat(false); }
  }

  const belumTersimpan = baris !== null && JSON.stringify(baris.map(b => [b.barang_id, b.isian, b.catatan, b.file_id])) !== dasar;
  const terisi = useMemo(() => (baris ?? []).filter(b => isianTerisi(b.isian)), [baris]);
  const bisaDisalin = (baris ?? []).filter(b => b.terakhir && !isianTerisi(b.isian));

  async function bolehBuang(): Promise<boolean> {
    if (!belumTersimpan) return true;
    return confirmDialog({ title: 'Pendataan belum disimpan', message: 'Angka yang sudah diketik akan dibuang. Lanjutkan?', confirmLabel: 'Buang', variant: 'warning' });
  }
  async function ganti(lok: number | null, tanggal: string) {
    if (!(await bolehBuang())) return;
    setLokasiId(lok); setTgl(tanggal); setBaris(null);
    if (lok && tanggal && tanggal <= hariIni) void muatForm(lok, tanggal);
  }
  async function tutup() { if (await bolehBuang()) onTutup(); }

  const ubah = (id: number, f: (b: Baris) => Baris) => setBaris(bs => bs && bs.map(b => b.barang_id === id ? f(b) : b));

  async function unggah(file: File) {
    const id = unggahKe;
    if (id === null) return;
    const h = await unggahBerkas(file);
    if (h) ubah(id, b => ({ ...b, file_id: h.fileId }));
    setUnggahKe(null);
  }

  async function simpan() {
    if (!lokasiId || terisi.length === 0) return;
    setMenyimpan(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/eksisting', {
        method: 'POST',
        body: JSON.stringify({
          lokasi_id: lokasiId, tgl_cek: tgl,
          // Baris terisi: kotak yang dibiarkan kosong = 0 (mis. hanya "Baik" yang diisi).
          baris: terisi.map(b => ({ barang_id: b.barang_id, baik: b.isian.baik ?? 0, rusak_ringan: b.isian.rusak_ringan ?? 0, rusak_berat: b.isian.rusak_berat ?? 0, catatan: b.catatan.trim() || null, file_id: b.file_id })),
        }),
      });
      if (!d.ok) { toast.error(d.message || 'Gagal menyimpan pendataan'); return; }
      const h = d as unknown as { lokasi: string; disimpan: number; ditimpa: number };
      toast.success(`Pendataan ${h.lokasi} (${fmtTanggal(tgl)}) tersimpan: ${h.disimpan} barang${h.ditimpa ? ` · ${h.ditimpa} menimpa pendataan tanggal yang sama` : ''}`);
      onTersimpan();
    } finally { setMenyimpan(false); }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, color: c.text, background: c.input, minWidth: 0, boxSizing: 'border-box' };
  const angka: React.CSSProperties = { ...inp, width: '100%', fontFamily: MONO, textAlign: 'right' };
  const ikonBtn: React.CSSProperties = { background: 'transparent', border: `1px solid ${c.border}`, color: c.sub, borderRadius: 6, width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
  const sisaBarang = barangList.filter(g => !(baris ?? []).some(b => b.barang_id === g.id));

  return (
    <div onClick={() => void tutup()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: 'min(920px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>Pendataan kondisi eksisting{barangAwal ? ` — ${barangAwal.nama}` : ''}</div>
          <button type="button" aria-label="Tutup" onClick={() => void tutup()} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${c.border}`, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 220px' }}>
            <span style={{ fontSize: 11, color: c.sub }}>Lokasi / ruangan</span>
            <select value={lokasiId ?? ''} onChange={e => void ganti(e.target.value ? Number(e.target.value) : null, tgl)} style={inp} aria-label="Lokasi">
              <option value="">— pilih lokasi —</option>
              {(lokasiList ?? []).map(l => <option key={l.id} value={l.id}>{l.nama}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, color: c.sub }}>Tanggal cek</span>
            <input type="date" value={tgl} max={hariIni} onChange={e => void ganti(lokasiId, e.target.value)} style={inp} aria-label="Tanggal cek" />
          </label>
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: '8px 16px' }}>
          {lokasiList?.length === 0 && (
            <div style={{ fontSize: 12.5, color: c.sub, padding: 8 }}>
              Belum ada lokasi. Tambahkan dulu di <a href="/buku-besar-aset/master?tab=lokasi" style={{ color: '#7C5CFC' }}>Master → Lokasi</a>.
            </div>
          )}
          {!lokasiId && !!lokasiList?.length && <div style={{ fontSize: 12.5, color: c.sub, padding: 8 }}>Pilih lokasi yang sedang didata. Barang yang pernah tercatat di sana akan muncul; barang lain bisa ditambahkan.</div>}
          {tgl > hariIni && <div style={{ fontSize: 12.5, color: '#E24B4A', padding: 8 }}>Tanggal cek tidak boleh sesudah hari ini.</div>}
          {memuat && <div style={{ fontSize: 12.5, color: c.sub, padding: 8 }}>Memuat…</div>}
          {baris && !memuat && <>
            {baris.length === 0 && <div style={{ fontSize: 12.5, color: c.sub, padding: 8 }}>Belum ada barang yang pernah didata di lokasi ini — tambahkan barangnya di bawah.</div>}
            {baris.map(b => (
              <div key={b.barang_id} className="bba-pd-baris" style={{ borderBottom: `1px solid ${c.border}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.nama}</div>
                  <div style={{ fontSize: 11, color: c.sub }}>
                    {b.terakhir
                      ? <>terakhir {fmtTanggal(b.terakhir.tgl_cek)}: <span style={{ fontFamily: MONO }}>{b.terakhir.baik} baik · {b.terakhir.rusak_ringan} RR · {b.terakhir.rusak_berat} RB</span></>
                      : 'belum pernah didata di sini'}
                    {b.tanggal_ini && <span style={{ color: '#BA7517' }}> · sudah didata tanggal ini — Simpan menimpanya</span>}
                  </div>
                </div>
                {KOTAK.map(k => (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, color: c.sub }}>{LABEL_KOTAK[k]}</span>
                    <input type="number" min={0} max={MAKS_UNIT} step={1} inputMode="numeric" value={b.isian[k] ?? ''} placeholder={b.terakhir ? String(b.terakhir[k]) : '0'}
                      aria-label={`${LABEL_KOTAK[k]} ${b.nama}`} style={angka}
                      onChange={e => { const v = e.target.value; ubah(b.barang_id, x => ({ ...x, isian: { ...x.isian, [k]: v === '' ? null : Math.max(0, Math.floor(Number(v))) } })); }} />
                  </label>
                ))}
                <input value={b.catatan} maxLength={500} placeholder="Catatan" aria-label={`Catatan ${b.nama}`} style={{ ...inp, width: '100%' }}
                  onChange={e => ubah(b.barang_id, x => ({ ...x, catatan: e.target.value }))} />
                <div style={{ display: 'flex', gap: 4 }}>
                  {b.file_id
                    ? <Tip label="Buka foto"><a href={unduhBerkas(b.file_id)} target="_blank" rel="noopener noreferrer" style={{ ...ikonBtn, color: '#1D9E75', borderColor: '#1D9E75', textDecoration: 'none' }} aria-label="Buka foto"><Paperclip size={14} /></a></Tip>
                    : <Tip label="Unggah foto (opsional)"><button type="button" style={ikonBtn} onClick={() => { setUnggahKe(b.barang_id); pilihFoto.current?.click(); }} aria-label="Unggah foto"><Paperclip size={14} /></button></Tip>}
                  {b.ditambah && <Tip label="Keluarkan dari form"><button type="button" style={ikonBtn} onClick={() => setBaris(bs => bs && bs.filter(x => x.barang_id !== b.barang_id))} aria-label="Keluarkan barang"><X size={14} /></button></Tip>}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, padding: '10px 0', flexWrap: 'wrap', alignItems: 'center' }}>
              <select value="" onChange={e => { const g = barangList.find(x => x.id === Number(e.target.value)); if (g) setBaris(bs => [...(bs ?? []), { barang_id: g.id, nama: g.nama, satuan: g.satuan, terakhir: null, tanggal_ini: null, ditambah: true, isian: kosong(), catatan: '', file_id: null }]); }}
                style={{ ...inp, maxWidth: 280 }} aria-label="Tambah barang ke pendataan" disabled={sisaBarang.length === 0}>
                <option value="">+ Tambah barang…</option>
                {sisaBarang.map(g => <option key={g.id} value={g.id}>{g.nama}</option>)}
              </select>
              <PrimaButton variant="ghost" size="sm" disabled={bisaDisalin.length === 0}
                data-tooltip="Untuk barang yang dicek dan kondisinya tidak berubah — kotak kosong diisi angka terakhir"
                onClick={() => setBaris(bs => bs && bs.map(b => b.terakhir && !isianTerisi(b.isian) ? { ...b, isian: { baik: b.terakhir.baik, rusak_ringan: b.terakhir.rusak_ringan, rusak_berat: b.terakhir.rusak_berat } } : b))}>
                Isi sama seperti terakhir ({bisaDisalin.length})
              </PrimaButton>
            </div>
          </>}
        </div>
        <input ref={pilihFoto} type="file" accept={BERKAS_FOTO} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void unggah(f); else setUnggahKe(null); }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 11.5, color: c.sub, minWidth: 200 }}>
            {baris ? `${terisi.length} dari ${baris.length} barang akan dicatat — kotak kosong semua = barang itu tidak didata kali ini.` : ''}
          </span>
          <PrimaButton variant="ghost" onClick={() => void tutup()}>Batal</PrimaButton>
          <PrimaButton menulis variant="primary" disabled={menyimpan || !lokasiId || terisi.length === 0 || tgl > hariIni} onClick={() => void simpan()}>
            {menyimpan ? 'Menyimpan…' : 'Simpan pendataan'}
          </PrimaButton>
        </div>
      </div>
      <style>{`
.bba-pd-baris { display: grid; grid-template-columns: minmax(0, 1.6fr) 78px 78px 78px minmax(0, 1fr) auto; gap: 8px; align-items: end; padding: 8px 0; }
@media (max-width: 760px) {
  .bba-pd-baris { grid-template-columns: 1fr 1fr 1fr; }
  .bba-pd-baris > :first-child, .bba-pd-baris > input { grid-column: 1 / -1; }
}
`}</style>
    </div>
  );
}
