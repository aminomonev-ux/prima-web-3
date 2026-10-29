'use client';
// Aksi borongan Buku Aset (docs/CONCEPT-bba-buku-aset.md §7.2–7.3): catat kondisi (opname per ruangan /
// gedung, atau register terpilih), pindah ruangan, tautkan barang. Register SELALU dimuat segar dari
// server saat modal dibuka — angka kuncinya milik muatan itu, bukan milik daftar yang dilihat (L77).
// Server menulis semua atau tidak sama sekali; 409 = muat ulang angka kunci, pilihan di layar tetap.

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Paperclip } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { LABEL_KONDISI, type Kondisi } from '@/lib/bba/kib';
import { namaTampil, type AsetRingan } from '@/lib/bba/aset';
import { bolehBerRuang, fmtTanggal, punyaKondisi } from '@/lib/bba/kondisi';
import type { BbaBarang, BbaLokasi } from '@/lib/data/buku-besar-aset';
import type { GedungPilihan } from '@/lib/data/bba-aset';
import type { BarangRingan } from '@/lib/bba/barang';
import PilihBarang, { type PilihanBarang } from './PilihBarang';
import { unggahBerkas, unduhBerkas } from './ModalItem';
import type { WarnaBba } from './BbaShell';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const WARNA: Record<Kondisi, string> = { B: '#1D9E75', RR: '#BA7517', RB: '#E24B4A' };
type Register = AsetRingan & { lokasi_nama?: string | null };

export async function muatRegister(ids: number[]): Promise<Register[] | string> {
  const hasil: Register[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/aset?ids=${ids.slice(i, i + 500).join(',')}`);
    if (!d.ok) return d.message || 'Gagal memuat register';
    hasil.push(...(d as unknown as { rows: Register[] }).rows);
  }
  return hasil;
}

type BalasanTulis = { ok: boolean; message?: string; code?: string; alasan?: string[] };

export function Bingkai({ c, judul, sub, lebar = 760, onTutup, kaki, children }: {
  c: WarnaBba; judul: string; sub?: string; lebar?: number; onTutup: () => void; kaki: React.ReactNode; children: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onTutup(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onTutup]);
  return (
    // stopPropagation: modal ini bisa dibuka dari kartu aset — klik latar tidak boleh ikut menutup kartunya.
    <div onClick={e => { e.stopPropagation(); onTutup(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={judul}
        style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, width: `min(${lebar}px, 96vw)`, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{judul}</div>
            {sub && <div style={{ fontSize: 11.5, color: c.sub }}>{sub}</div>}
          </div>
          <button type="button" aria-label="Tutup" onClick={onTutup} style={{ background: 'none', border: 'none', color: c.text, cursor: 'pointer', padding: 4, display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, overflow: 'auto', flex: 1, minHeight: 0 }}>{children}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: `1px solid ${c.border}`, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{kaki}</div>
      </div>
    </div>
  );
}

export function DaftarAlasan({ alasan, judul = 'Tidak ada yang disimpan:' }: { alasan: string[]; judul?: string }) {
  if (alasan.length === 0) return null;
  return (
    <div role="alert" style={{ border: '1px solid #E24B4A', background: 'rgba(226,75,74,.08)', color: '#E24B4A', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
      {judul}
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{alasan.slice(0, 8).map(a => <li key={a}>{a}</li>)}</ul>
      {alasan.length > 8 && <div>… dan {alasan.length - 8} lagi</div>}
    </div>
  );
}

// ─── Catat kondisi / opname ──────────────────────────────────────────────────

/** `ids` = register terpilih (daftar Buku Aset / kartu aset); tanpa `ids` = opname: pilih ruangan atau gedung dulu. */
export function ModalKondisi({ c, ids, onTutup, onTersimpan }: { c: WarnaBba; ids?: number[]; onTutup: () => void; onTersimpan: () => void }) {
  const [rows, setRows] = useState<Register[] | null>(null);
  const [pilihan, setPilihan] = useState<Record<number, Kondisi>>({});
  const [tgl, setTgl] = useState(() => tanggalHariIniWIB());
  const [catatan, setCatatan] = useState('');
  const [foto, setFoto] = useState<{ fileId: string; filename: string } | null>(null);
  const [cari, setCari] = useState('');
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [ruangan, setRuangan] = useState<BbaLokasi[]>([]);
  const [gedung, setGedung] = useState<GedungPilihan[]>([]);
  const [sasaran, setSasaran] = useState<{ jenis: 'ruang' | 'gedung'; id: number } | null>(null);
  const nomor = useRef(0);

  async function muat(s = sasaran) {
    const n = ++nomor.current;
    let hasil: Register[] | string;
    if (ids) hasil = await muatRegister(ids);
    else if (s) {
      const d = await fetchJson<unknown>(`/api/buku-besar-aset/aset?${s.jenis}=${s.id}`);
      hasil = d.ok ? (d as unknown as { rows: Register[] }).rows : d.message || 'Gagal memuat register';
    } else return;
    if (n !== nomor.current) return;
    if (typeof hasil === 'string') { toast.error(hasil); return; }
    setRows(hasil.filter(a => punyaKondisi(a.golongan) && a.status === 'AKTIF'));
  }

  useEffect(() => {
    void Promise.resolve().then(async () => {
      if (ids) { await muat(); return; }
      const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi');
      if (d.ok) { const x = d as unknown as { data: BbaLokasi[]; gedung: GedungPilihan[] }; setRuangan(x.data); setGedung(x.gedung); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat sekali saat modal dibuka
  }, []);

  function pilihSasaran(nilai: string) {
    const [jenis, id] = nilai.split(':');
    const s = id ? { jenis: jenis as 'ruang' | 'gedung', id: Number(id) } : null;
    setSasaran(s); setRows(null); setPilihan({}); setAlasan([]);
    if (s) void muat(s);
  }

  const tampil = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return !rows ? [] : k ? rows.filter(a => `${namaTampil(a)} ${a.nama_resmi} ${a.register ?? ''} ${a.lokasi_nama ?? ''}`.toLowerCase().includes(k)) : rows;
  }, [rows, cari]);
  const diisi = rows ? rows.filter(a => pilihan[a.id]).length : 0;
  const tanahTerpilih = ids && rows ? ids.length - rows.length : 0;
  const hariIni = tanggalHariIniWIB();

  async function simpan() {
    if (!rows || diisi === 0) { toast.error('Pilih kondisi minimal satu register'); return; }
    if (tgl > hariIni) { toast.error('Tanggal pemeriksaan tidak boleh sesudah hari ini'); return; }
    setSibuk(true); setAlasan([]);
    try {
      const item = rows.filter(a => pilihan[a.id]).map(a => ({ id: a.id, expected_version: a.version ?? 0, kondisi: pilihan[a.id] }));
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/kondisi', {
        method: 'POST', body: JSON.stringify({ tgl, catatan: catatan.trim() || null, file_id: foto?.fileId ?? null, item }),
      }) as unknown as BalasanTulis & { berubah?: number };
      if (!d.ok) {
        if (d.code === 'VERSION_CONFLICT') { toast.error(d.message || 'Ada register yang baru diubah orang lain'); void muat(); return; }
        if (d.alasan?.length) { setAlasan(d.alasan); return; }
        toast.error(d.message || 'Gagal menyimpan'); return;
      }
      toast.success(`${item.length} register dicatat ${fmtTanggal(tgl)}${d.berubah ? ` · ${d.berubah} berubah kondisi` : ''}`);
      onTersimpan();
    } finally { setSibuk(false); }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, boxSizing: 'border-box', minWidth: 0 };
  return (
    <Bingkai c={c} judul={ids ? 'Catat kondisi' : 'Opname kondisi'} onTutup={onTutup}
      sub={ids ? `${ids.length} register terpilih` : 'Per ruangan atau per gedung — register dimuat dengan kondisi tercatat terakhir'}
      kaki={<>
        <span style={{ flex: 1, fontSize: 11.5, color: c.sub }}>{rows ? `${diisi} dari ${rows.length} register diisi — yang tidak diisi tidak dicatat` : ''}</span>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || diisi === 0} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : `Simpan ${diisi || ''}`.trim()}</PrimaButton>
      </>}>
      <DaftarAlasan alasan={alasan} />
      {!ids && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub, marginBottom: 12 }}>Ruangan atau gedung
          <select value={sasaran ? `${sasaran.jenis}:${sasaran.id}` : ''} onChange={e => pilihSasaran(e.target.value)} style={inp} aria-label="Ruangan atau gedung">
            <option value="">— pilih —</option>
            {ruangan.length > 0 && <optgroup label="Ruangan">{ruangan.map(r => <option key={r.id} value={`ruang:${r.id}`}>{r.nama} ({r.jumlah_aset})</option>)}</optgroup>}
            {gedung.length > 0 && <optgroup label="Gedung (beserta isi ruangannya)">{gedung.map(g => <option key={g.id} value={`gedung:${g.id}`}>{g.nama}{g.register ? ` · reg. ${g.register}` : ''}</option>)}</optgroup>}
          </select>
        </label>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub }}>Tanggal pemeriksaan
          <input type="date" value={tgl} max={hariIni} onChange={e => setTgl(e.target.value)} style={{ ...inp, fontFamily: MONO }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub, gridColumn: 'span 2' }}>Catatan (berlaku untuk semua)
          <input value={catatan} onChange={e => setCatatan(e.target.value)} maxLength={500} placeholder="mis. Opname semester I, laporan rusak dari perawat jaga…" style={inp} />
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap', fontSize: 12 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#378ADD' }}>
          <Paperclip size={13} />{foto ? 'Ganti foto' : 'Lampirkan foto (opsional)'}
          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const u = await unggahBerkas(f); if (u) setFoto(u); }} />
        </label>
        {foto && <a href={unduhBerkas(foto.fileId)} target="_blank" rel="noopener noreferrer" style={{ color: c.sub }}>{foto.filename}</a>}
        {foto && <button type="button" onClick={() => setFoto(null)} style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', textDecoration: 'underline', fontSize: 12, padding: 0 }}>lepas</button>}
      </div>

      {rows && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={cari} onChange={e => setCari(e.target.value)} placeholder="Cari di daftar ini…" style={{ ...inp, flex: 1, minWidth: 150 }} aria-label="Cari register" />
          <PrimaButton variant="success" size="sm" onClick={() => setPilihan(p => ({ ...p, ...Object.fromEntries(tampil.map(a => [a.id, 'B' as Kondisi])) }))}>Semua baik</PrimaButton>
          <PrimaButton variant="ghost" size="sm" onClick={() => setPilihan({})}>Kosongkan</PrimaButton>
        </div>
      )}
      {tanahTerpilih > 0 && <div style={{ fontSize: 11.5, color: c.sub, marginBottom: 6 }}>{tanahTerpilih} register tanah / dihapus tidak ikut — tidak punya kondisi.</div>}
      {!rows ? <div style={{ fontSize: 12.5, color: c.sub }}>{ids || sasaran ? 'Memuat register…' : 'Pilih ruangan atau gedung yang diperiksa.'}</div>
        : rows.length === 0 ? <div style={{ fontSize: 12.5, color: c.sub }}>Tidak ada register yang bisa dicek di sini.</div>
        : (
          <div style={{ border: `1px solid ${c.border}`, borderRadius: 8 }}>
            {tampil.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderTop: i ? `1px solid ${c.border}` : 'none', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{namaTampil(a)} <span style={{ fontFamily: MONO, fontWeight: 400, color: c.sub, fontSize: 11 }}>{a.golongan}{a.register ? ` · ${a.register}` : ''}</span></div>
                  <div style={{ fontSize: 11, color: c.sub }}>
                    {a.lokasi_nama ? `${a.lokasi_nama} · ` : ''}
                    {a.kondisi ? `${LABEL_KONDISI[a.kondisi]} ` : 'belum ada kondisi '}
                    {a.kondisi_sumber === 'CEK' ? `(dicek ${fmtTanggal(a.kondisi_tgl)})` : a.kondisi ? '(dari impor, belum dicek)' : ''}
                  </div>
                </div>
                <div style={{ display: 'inline-flex', gap: 4 }} role="group" aria-label={`Kondisi ${namaTampil(a)}`}>
                  {(['B', 'RR', 'RB'] as const).map(k => {
                    const aktif = pilihan[a.id] === k;
                    return (
                      <button key={k} type="button" aria-pressed={aktif}
                        onClick={() => setPilihan(p => { const x = { ...p }; if (aktif) delete x[a.id]; else x[a.id] = k; return x; })}
                        style={{ padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer', fontFamily: MONO,
                          border: `1px solid ${aktif ? WARNA[k] : c.border}`, background: aktif ? WARNA[k] : 'transparent', color: aktif ? '#FFFFFF' : WARNA[k] }}>
                        {k}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
    </Bingkai>
  );
}

// ─── Pindah ruangan ──────────────────────────────────────────────────────────

export function ModalPindah({ c, ids, onTutup, onTersimpan }: { c: WarnaBba; ids: number[]; onTutup: () => void; onTersimpan: () => void }) {
  const [rows, setRows] = useState<Register[] | null>(null);
  const [ruangan, setRuangan] = useState<BbaLokasi[]>([]);
  const [tujuan, setTujuan] = useState('');
  const [catatan, setCatatan] = useState('');
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const r = await muatRegister(ids);
    if (typeof r === 'string') { toast.error(r); return; }
    setRows(r);
  }
  useEffect(() => {
    void Promise.resolve().then(async () => {
      await muat();
      const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi');
      if (d.ok) setRuangan((d as unknown as { data: BbaLokasi[] }).data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat sekali saat modal dibuka
  }, []);

  const bisa = rows?.filter(a => bolehBerRuang(a.golongan) && a.status === 'AKTIF') ?? [];
  const lain = rows ? rows.length - bisa.length : 0;

  async function simpan() {
    if (!tujuan) { toast.error('Pilih ruangan tujuan'); return; }
    if (bisa.length === 0) return;
    setSibuk(true); setAlasan([]);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/pindah', {
        method: 'POST',
        body: JSON.stringify({ lokasi_id: tujuan === 'kosong' ? null : Number(tujuan), catatan: catatan.trim() || null, item: bisa.map(a => ({ id: a.id, expected_version: a.version ?? 0 })) }),
      }) as unknown as BalasanTulis & { dipindah?: number; tetap?: number; ruangan?: string | null };
      if (!d.ok) {
        if (d.code === 'VERSION_CONFLICT') { toast.error(d.message || 'Ada register yang baru diubah orang lain'); void muat(); return; }
        if (d.alasan?.length) { setAlasan(d.alasan); return; }
        toast.error(d.message || 'Gagal memindahkan'); return;
      }
      toast.success(d.dipindah ? `${d.dipindah} register dipindah ke ${d.ruangan ?? '(tanpa ruangan)'}${d.tetap ? ` · ${d.tetap} sudah di sana` : ''}` : 'Semua register sudah di ruangan itu');
      onTersimpan();
    } finally { setSibuk(false); }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  return (
    <Bingkai c={c} judul="Pindah ruangan" sub={`${ids.length} register terpilih`} lebar={520} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || !tujuan || bisa.length === 0} onClick={() => void simpan()}>{sibuk ? 'Memindahkan…' : `Pindahkan ${bisa.length || ''}`.trim()}</PrimaButton>
      </>}>
      <DaftarAlasan alasan={alasan} />
      {!rows ? <div style={{ fontSize: 12.5, color: c.sub }}>Memuat register…</div> : (<>
        <div style={{ fontSize: 12.5, marginBottom: 10 }}>
          <b>{bisa.length}</b> register akan dipindah{lain > 0 && <span style={{ color: c.sub }}> · {lain} lainnya bukan peralatan / aset tetap lainnya (tanah, gedung, jalan tidak ditempatkan di ruangan) — tidak ikut</span>}
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub, marginBottom: 10 }}>Ruangan tujuan
          <select value={tujuan} onChange={e => setTujuan(e.target.value)} style={inp} aria-label="Ruangan tujuan">
            <option value="">— pilih —</option>
            {ruangan.map(r => <option key={r.id} value={r.id}>{r.nama}{r.gedung_nama ? ` · ${r.gedung_nama}` : ''}</option>)}
            <option value="kosong">(Lepas dari ruangan)</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub }}>Catatan
          <input value={catatan} onChange={e => setCatatan(e.target.value)} maxLength={500} placeholder="mis. Pindah karena renovasi bangsal" style={inp} />
        </label>
      </>)}
    </Bingkai>
  );
}

// ─── Tautkan barang ──────────────────────────────────────────────────────────

export function ModalTautkanAset({ c, ids, onTutup, onTersimpan }: { c: WarnaBba; ids: number[]; onTutup: () => void; onTersimpan: () => void }) {
  const [rows, setRows] = useState<Register[] | null>(null);
  const [daftar, setDaftar] = useState<BarangRingan[]>([]);
  const [barang, setBarang] = useState<PilihanBarang>(null);
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);

  async function muat() {
    const r = await muatRegister(ids);
    if (typeof r === 'string') { toast.error(r); return; }
    setRows(r);
  }
  useEffect(() => {
    void Promise.resolve().then(async () => {
      await muat();
      const d = await fetchJson<unknown>('/api/buku-besar-aset/barang');
      if (d.ok) setDaftar((d as unknown as { data: BbaBarang[] }).data.map(b => ({ id: b.id, nama: b.nama })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat sekali saat modal dibuka
  }, []);

  async function simpan() {
    if (!rows || !barang) { toast.error('Pilih barangnya dulu'); return; }
    setSibuk(true); setAlasan([]);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/barang', {
        method: 'POST',
        body: JSON.stringify({ ...('id' in barang ? { barang_id: barang.id } : { barang_baru: barang.baru }), item: rows.map(a => ({ id: a.id, expected_version: a.version ?? 0 })) }),
      }) as unknown as BalasanTulis & { ditautkan?: number; barang?: string };
      if (!d.ok) {
        if (d.code === 'VERSION_CONFLICT') { toast.error(d.message || 'Ada register yang baru diubah orang lain'); void muat(); return; }
        if (d.alasan?.length) { setAlasan(d.alasan); return; }
        toast.error(d.message || 'Gagal menautkan'); return;
      }
      toast.success(d.ditautkan ? `${d.ditautkan} register ditautkan ke "${d.barang}"` : 'Semua register sudah ditautkan ke barang itu');
      onTersimpan();
    } finally { setSibuk(false); }
  }

  const inp: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' };
  const sudahLain = rows?.filter(a => a.barang_id).length ?? 0;
  return (
    <Bingkai c={c} judul="Tautkan ke barang" sub={`${ids.length} register terpilih`} lebar={520} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || !barang || !rows} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Tautkan'}</PrimaButton>
      </>}>
      <DaftarAlasan alasan={alasan} />
      <div style={{ fontSize: 12.5, color: c.sub, marginBottom: 10, lineHeight: 1.5 }}>
        Barang = jenis barang di kamus (Master Barang). Register yang ditautkan dihitung sebagai &ldquo;dimiliki&rdquo; di Per Barang dan kartu barang.
        {sudahLain > 0 && <> <b style={{ color: '#BA7517' }}>{sudahLain}</b> register sudah ditautkan ke barang lain — tautannya diganti.</>}
      </div>
      <PilihBarang daftar={daftar} nilai={barang} saran={null} onUbah={setBarang} c={c} inp={inp} />
    </Bingkai>
  );
}
