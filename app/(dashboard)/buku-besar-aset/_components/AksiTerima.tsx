'use client';
// Barang diterima → buku aset (docs/CONCEPT-bba-buku-aset.md §7.5–7.6, §15): antrean "diterima, belum
// dicatat", tempatkan jadi register "belum teregister", rehab selesai, isi register dari sistem provinsi,
// hapus dengan SK, dan koreksi salah input (§20). Antrean dihitung server tiap dibuka — tidak disimpan.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Inbox, Paperclip } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import DeleteIcon from '@/components/ui/DeleteIcon';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { GOLONGAN, NAMA_GOLONGAN, LABEL_KONDISI, KONDISI, type Golongan, type Kondisi } from '@/lib/bba/kib';
import { bolehBerRuang, punyaKondisi, fmtTanggal } from '@/lib/bba/kondisi';
import { namaTampil, type AsetRingan } from '@/lib/bba/aset';
import { alasanTakBisaBatalTempatkan } from '@/lib/bba/koreksi';
import type { AntreanTerima, AntreanRehab } from '@/lib/data/bba-penerimaan';
import type { BbaLokasi } from '@/lib/data/buku-besar-aset';
import { Bingkai, DaftarAlasan, muatRegister } from './AksiAset';
import { unggahBerkas, unduhBerkas } from './ModalItem';
import type { WarnaBba } from './BbaShell';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
type Balasan = { ok: boolean; message?: string; code?: string; alasan?: string[] };
type Antrean = { terima: AntreanTerima[]; rehab: AntreanRehab[] };

const gayaInput = (c: WarnaBba): React.CSSProperties => ({ border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' });
const gayaLabel = (c: WarnaBba): React.CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub });

/** Panel di atas Buku Aset — tampil hanya kalau ada yang menunggu. `kunciMuat` berganti = muat ulang. */
export function PanelAntrean({ c, bolehUbah, kunciMuat, onTersimpan }: { c: WarnaBba; bolehUbah: boolean; kunciMuat: number; onTersimpan: () => void }) {
  const [a, setA] = useState<Antrean | null>(null);
  const [tempat, setTempat] = useState<AntreanTerima | null>(null);
  const [rehab, setRehab] = useState<AntreanRehab | null>(null);
  const [lokasi, setLokasi] = useState<BbaLokasi[]>([]);

  async function muat() {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/antrean');
    if (d.ok) setA(d as unknown as Antrean);
  }
  useEffect(() => {
    void Promise.resolve().then(muat);
  }, [kunciMuat]);
  useEffect(() => {
    if (!bolehUbah) return;
    void Promise.resolve().then(async () => {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/lokasi');
      if (d.ok) setLokasi((d as unknown as { data: BbaLokasi[] }).data);
    });
  }, [bolehUbah]);

  if (!a || (a.terima.length === 0 && a.rehab.length === 0)) return null;
  const selesai = () => { setTempat(null); setRehab(null); void muat(); onTersimpan(); };
  const unit = a.terima.reduce((t, x) => t + x.sisa, 0);
  return (
    <div style={{ background: c.card, border: '1px solid #EF9F27', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>
        <Inbox size={16} color="#EF9F27" /> Barang diterima, belum dicatat
        <span style={{ fontSize: 12, fontWeight: 500, color: c.sub }}>· {unit} unit dari {a.terima.length} penerimaan{a.rehab.length ? ` · ${a.rehab.length} rehab selesai` : ''}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
        {a.terima.map(x => (
          <div key={`t${x.penerimaan_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, padding: '6px 0', borderBottom: `1px dashed ${c.border}` }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: c.sub, whiteSpace: 'nowrap' }}>{x.canonical_id}</span>
            <span style={{ flex: '1 1 220px', minWidth: 0 }}>
              <b>{x.barang_nama ?? x.uraian}</b>
              <span style={{ color: c.sub }}> · diterima {fmtTanggal(x.tgl)} · {fmtRp(x.harga_satuan)}/unit{x.merk_tipe ? ` · ${x.merk_tipe}` : ''}</span>
            </span>
            <span style={{ fontFamily: MONO, whiteSpace: 'nowrap' }}>{x.sisa} dari {x.vol} unit</span>
            {bolehUbah && <PrimaButton variant="success" size="sm" onClick={() => setTempat(x)}>Tempatkan</PrimaButton>}
          </div>
        ))}
        {a.rehab.map(x => (
          <div key={`r${x.rencana_id}-${x.aset_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, padding: '6px 0', borderBottom: `1px dashed ${c.border}` }}>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: c.sub, whiteSpace: 'nowrap' }}>{x.canonical_id}</span>
            <span style={{ flex: '1 1 220px', minWidth: 0 }}>
              <b>Rehab selesai — perbarui kondisi {x.aset_nama}</b>
              <span style={{ color: c.sub }}>{x.register ? ` · reg. ${x.register}` : ''}{x.tgl ? ` · diterima ${fmtTanggal(x.tgl)}` : ''}</span>
            </span>
            {bolehUbah && <PrimaButton variant="success" size="sm" onClick={() => setRehab(x)}>Catat rehab</PrimaButton>}
          </div>
        ))}
      </div>
      {tempat && <ModalTempatkan c={c} p={tempat} lokasi={lokasi} onTutup={() => setTempat(null)} onTersimpan={selesai} />}
      {rehab && <ModalRehab c={c} r={rehab} onTutup={() => setRehab(null)} onTersimpan={selesai} />}
    </div>
  );
}

function ModalTempatkan({ c, p, lokasi, onTutup, onTersimpan }: { c: WarnaBba; p: AntreanTerima; lokasi: BbaLokasi[]; onTutup: () => void; onTersimpan: () => void }) {
  const [f, setF] = useState({ golongan: 'B' as Golongan, nama_resmi: (p.barang_nama ?? p.uraian).toUpperCase().slice(0, 255), nama: '', jumlah: p.sisa, lokasi: '', kondisi: 'B' as Kondisi, catatan: '' });
  const [sibuk, setSibuk] = useState(false);
  const inp = gayaInput(c), label = gayaLabel(c);

  async function simpan() {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/antrean', {
        method: 'POST',
        body: JSON.stringify({
          aksi: 'TEMPATKAN', penerimaan_id: p.penerimaan_id, jumlah: f.jumlah, golongan: f.golongan, nama_resmi: f.nama_resmi.trim(),
          nama: f.nama.trim() || null, lokasi_id: bolehBerRuang(f.golongan) && f.lokasi ? Number(f.lokasi) : null, kondisi: f.kondisi, catatan: f.catatan.trim() || null,
        }),
      }) as unknown as Balasan & { ditempatkan?: number };
      if (!d.ok) { toast.error(d.message || 'Gagal menempatkan'); return; }
      toast.success(`${d.ditempatkan} register dicatat — belum teregister. Isi kode & register sesudah keluar dari sistem provinsi.`);
      onTersimpan();
    } finally { setSibuk(false); }
  }

  return (
    <Bingkai c={c} judul="Tempatkan barang diterima" sub={`${p.canonical_id} · ${p.uraian}`} lebar={560} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="success" disabled={sibuk || !f.nama_resmi.trim() || f.jumlah < 1 || f.jumlah > p.sisa} onClick={() => void simpan()}>
          {sibuk ? 'Menyimpan…' : `Catat ${f.jumlah} register`}
        </PrimaButton>
      </>}>
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 12, lineHeight: 1.5 }}>
        Satu unit = satu register, harga <b style={{ fontFamily: MONO, color: c.text }}>{fmtRp(p.harga_satuan)}</b>, perolehan <b style={{ fontFamily: MONO, color: c.text }}>{p.tgl.slice(0, 4)}</b>.
        Kode barang & register diisi sesudah dicatat di sistem provinsi (atau cocok otomatis saat Impor KIB).
        {p.merk_tipe && <> Golongan B membawa merk/tipe <b style={{ color: c.text }}>{p.merk_tipe}</b> ke kolom Merk/Type KIB.</>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        <label style={label}>Golongan KIB
          <select value={f.golongan} onChange={e => setF({ ...f, golongan: e.target.value as Golongan })} style={inp}>
            {GOLONGAN.map(g => <option key={g} value={g}>{g} · {NAMA_GOLONGAN[g]}</option>)}
          </select>
        </label>
        <label style={label}>Jumlah register (tersisa {p.sisa})
          <input type="number" min={1} max={p.sisa} value={f.jumlah} onChange={e => setF({ ...f, jumlah: Math.floor(Number(e.target.value)) })} style={{ ...inp, fontFamily: MONO }} />
        </label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>Nama barang (seperti di KIB)
          <input value={f.nama_resmi} maxLength={255} onChange={e => setF({ ...f, nama_resmi: e.target.value })} style={inp} />
        </label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>Nama sehari-hari (opsional)
          <input value={f.nama} maxLength={255} placeholder="mis. Kursi roda IGD" onChange={e => setF({ ...f, nama: e.target.value })} style={inp} />
        </label>
        {bolehBerRuang(f.golongan) && (
          <label style={label}>Ruangan
            <select value={f.lokasi} onChange={e => setF({ ...f, lokasi: e.target.value })} style={inp}>
              <option value="">— belum ditempatkan —</option>
              {lokasi.map(l => <option key={l.id} value={l.id}>{l.nama}{l.gedung_nama ? ` · ${l.gedung_nama}` : ''}</option>)}
            </select>
          </label>
        )}
        {punyaKondisi(f.golongan) && (
          <label style={label}>Kondisi saat diterima
            <select value={f.kondisi} onChange={e => setF({ ...f, kondisi: e.target.value as Kondisi })} style={inp}>
              {KONDISI.map(k => <option key={k} value={k}>{LABEL_KONDISI[k]}</option>)}
            </select>
          </label>
        )}
        <label style={{ ...label, gridColumn: '1 / -1' }}>Catatan
          <input value={f.catatan} maxLength={500} placeholder="mis. No. BAST" onChange={e => setF({ ...f, catatan: e.target.value })} style={inp} />
        </label>
      </div>
    </Bingkai>
  );
}

function ModalRehab({ c, r, onTutup, onTersimpan }: { c: WarnaBba; r: AntreanRehab; onTutup: () => void; onTersimpan: () => void }) {
  const [kondisi, setKondisi] = useState<Kondisi>('B');
  const [tgl, setTgl] = useState(tanggalHariIniWIB());
  const [catatan, setCatatan] = useState('');
  const [foto, setFoto] = useState<{ fileId: string; filename: string } | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const inp = gayaInput(c), label = gayaLabel(c);

  async function simpan() {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/antrean', {
        method: 'POST',
        body: JSON.stringify({ aksi: 'REHAB', aset_id: r.aset_id, expected_version: r.aset_version, rencana_id: r.rencana_id, kondisi, tgl, catatan: catatan.trim() || null, file_id: foto?.fileId ?? null }),
      }) as unknown as Balasan;
      if (!d.ok) { toast.error(d.message || 'Gagal mencatat rehab'); return; }
      toast.success('Rehab dicatat di riwayat gedung');
      onTersimpan();
    } finally { setSibuk(false); }
  }

  return (
    <Bingkai c={c} judul="Rehab selesai" sub={`${r.canonical_id} · ${r.aset_nama}`} lebar={480} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="success" disabled={sibuk} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Catat rehab'}</PrimaButton>
      </>}>
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 12 }}>Rehab tidak menambah register baru — kondisi {punyaKondisi(r.aset_golongan) ? 'dan riwayat ' : ''}aset sasaran yang diperbarui.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {punyaKondisi(r.aset_golongan) && (
          <label style={label}>Kondisi sesudah rehab
            <select value={kondisi} onChange={e => setKondisi(e.target.value as Kondisi)} style={inp}>{KONDISI.map(k => <option key={k} value={k}>{LABEL_KONDISI[k]}</option>)}</select>
          </label>
        )}
        <label style={label}>Tanggal<input type="date" value={tgl} max={tanggalHariIniWIB()} onChange={e => setTgl(e.target.value)} style={inp} /></label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>Catatan<input value={catatan} maxLength={500} onChange={e => setCatatan(e.target.value)} style={inp} /></label>
      </div>
      <BerkasPilih c={c} label="Foto sesudah rehab (opsional)" nilai={foto} onUbah={setFoto} />
    </Bingkai>
  );
}

function BerkasPilih({ c, label, nilai, onUbah }: { c: WarnaBba; label: string; nilai: { fileId: string; filename: string } | null; onUbah: (v: { fileId: string; filename: string } | null) => void }) {
  const [unggah, setUnggah] = useState(false);
  // Pola lampiran foto di Catat kondisi (AksiAset): tautan berikon, input berkas tersembunyi.
  return (
    <div style={{ marginTop: 10, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: unggah ? 'wait' : 'pointer', color: '#378ADD' }}>
        <Paperclip size={13} />{unggah ? 'Mengunggah…' : nilai ? 'Ganti berkas' : label}
        <input type="file" accept="image/*,application/pdf" disabled={unggah} style={{ display: 'none' }} onChange={async e => {
          const berkas = e.target.files?.[0]; e.target.value = ''; if (!berkas) return;
          setUnggah(true);
          try { const h = await unggahBerkas(berkas); if (h) onUbah(h); } finally { setUnggah(false); }
        }} />
      </label>
      {nilai && <a href={unduhBerkas(nilai.fileId)} target="_blank" rel="noopener noreferrer" style={{ color: c.sub }}>{nilai.filename}</a>}
      {nilai && <button type="button" onClick={() => onUbah(null)} style={{ background: 'none', border: 'none', color: c.sub, cursor: 'pointer', textDecoration: 'underline', fontSize: 12, padding: 0 }}>lepas</button>}
    </div>
  );
}

/**
 * Kartu aset: kode barang + register dari sistem provinsi untuk aset "belum teregister" (§7.5 butir 3).
 * Dengan `awal` = betulkan register isian PRIMA yang salah ketik, atau kosongkan (§20.2).
 */
export function ModalRegister({ c, id, versi, golongan, awal, onTutup, onTersimpan }: {
  c: WarnaBba; id: number; versi: number; golongan: Golongan; awal?: { kode_barang: string; register: string | null };
  onTutup: () => void; onTersimpan: () => void;
}) {
  const [kode, setKode] = useState(awal?.kode_barang ?? '');
  const [reg, setReg] = useState(awal?.register ?? '');
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const inp = gayaInput(c), label = gayaLabel(c);
  async function kirim(isi: Record<string, unknown>, sukses: string) {
    setSibuk(true); setAlasan([]);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/register', { method: 'PATCH', body: JSON.stringify({ id, expected_version: versi, ...isi }) }) as unknown as Balasan;
      if (!d.ok) { if (d.alasan?.length) setAlasan(d.alasan); else toast.error(d.message || 'Gagal menyimpan'); return; }
      toast.success(sukses);
      onTersimpan();
    } finally { setSibuk(false); }
  }
  const sama = !!awal && kode.trim() === awal.kode_barang && reg.trim() === (awal.register ?? '');
  return (
    <Bingkai c={c} judul={awal ? 'Betulkan register' : 'Isi register dari sistem provinsi'} sub={`KIB ${golongan} · ${NAMA_GOLONGAN[golongan]}`} lebar={480} onTutup={onTutup}
      kaki={<>
        {awal && <PrimaButton menulis variant="warning" disabled={sibuk} onClick={() => void kirim({ kosongkan: true }, 'Register dikosongkan — kembali belum teregister')}
          data-tooltip="Kembali belum teregister: nomor yang benar belum dipegang, atau register ini milik unit lain">Kosongkan</PrimaButton>}
        <span style={{ flex: 1 }} />
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || !kode.trim() || !reg.trim() || sama}
          onClick={() => void kirim({ kode_barang: kode.trim(), register: reg.trim() }, 'Register tersimpan — impor KIB berikutnya mencocokkannya')}>{sibuk ? 'Menyimpan…' : 'Simpan'}</PrimaButton>
      </>}>
      <DaftarAlasan alasan={alasan} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <label style={label}>Kode barang<input value={kode} maxLength={80} placeholder="1.3.2.05.02.06.002" onChange={e => setKode(e.target.value)} style={{ ...inp, fontFamily: MONO }} /></label>
        <label style={label}>Register<input value={reg} maxLength={20} placeholder="000001" onChange={e => setReg(e.target.value)} style={{ ...inp, fontFamily: MONO }} /></label>
      </div>
      <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8, lineHeight: 1.5 }}>
        Salin persis dari sistem aset provinsi. Register angka disimpan 6 digit (1 → 000001).
        {awal && <> Register yang salah ketik membuat Impor KIB berikutnya tidak menemukannya — barang yang sama akan tercatat dua kali.</>}
      </div>
    </Bingkai>
  );
}

// ─── Koreksi salah input (Tahap F, §20) ──────────────────────────────────────

/** Register yang salah ditempatkan dibuang, unitnya kembali ke antrean. `ids` dimuat segar (L77). */
export function ModalBatalTempatkan({ c, ids, onTutup, onTersimpan }: { c: WarnaBba; ids: number[]; onTutup: () => void; onTersimpan: () => void }) {
  const [rows, setRows] = useState<AsetRingan[] | null>(null);
  const [teks, setTeks] = useState('');
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const inp = gayaInput(c), label = gayaLabel(c);

  async function muat() {
    const h = await muatRegister(ids);
    if (typeof h === 'string') { toast.error(h); return; }
    setRows(h);
  }
  useEffect(() => {
    void Promise.resolve().then(muat);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dimuat sekali saat modal dibuka
  }, []);

  // Cermin pagar server tanpa rujukan rencana/ruangan — yang itu hanya server yang tahu.
  const tolakLayar = (rows ?? []).map(a => alasanTakBisaBatalTempatkan(a)).filter((s): s is string => !!s);
  async function simpan() {
    if (!rows) return;
    setSibuk(true); setAlasan([]);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/batal-tempatkan', {
        method: 'POST', body: JSON.stringify({ item: rows.map(a => ({ id: a.id, expected_version: a.version ?? 0 })), alasan: teks.trim() }),
      }) as unknown as Balasan & { dibatalkan?: number };
      if (!d.ok) {
        if (d.alasan?.length) setAlasan(d.alasan); else toast.error(d.message || 'Gagal membatalkan');
        if (d.code === 'VERSION_CONFLICT') void muat();
        return;
      }
      toast.success(`${d.dibatalkan} register dibatalkan — unitnya kembali ke antrean "Barang diterima, belum dicatat"`);
      onTersimpan();
    } finally { setSibuk(false); }
  }

  return (
    <Bingkai c={c} judul="Batalkan penempatan" sub={rows ? `${rows.length} register` : 'Memuat register…'} lebar={560} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="danger" iconLeft={<DeleteIcon size={13} />} disabled={sibuk || !rows || tolakLayar.length > 0 || teks.trim().length < 5}
          onClick={() => void simpan()}>{sibuk ? 'Membatalkan…' : 'Batalkan penempatan'}</PrimaButton>
      </>}>
      {alasan.length ? <DaftarAlasan alasan={alasan} /> : <DaftarAlasan alasan={tolakLayar} judul="Tidak bisa dibatalkan — keluarkan register ini dari pilihan:" />}
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 12, lineHeight: 1.5 }}>
        Untuk penempatan yang <b style={{ color: c.text }}>salah input</b> — golongan atau penerimaan keliru. Registernya dibuang dari Buku Aset beserta riwayatnya,
        dan unitnya kembali ke antrean &ldquo;Barang diterima, belum dicatat&rdquo; untuk ditempatkan ulang. Kalau penerimaannya sendiri yang salah, sesudah ini
        penerimaan itu bisa dihapus di Pengadaan. Barang yang memang keluar dari rumah sakit dihapus dengan SK, bukan di sini.
      </div>
      {rows && (
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12.5, maxHeight: 180, overflow: 'auto' }}>
          {rows.map(a => <li key={a.id}>{namaTampil(a)} <span style={{ fontFamily: MONO, color: c.sub }}>· KIB {a.golongan}{a.tahun_perolehan ? ` · ${a.tahun_perolehan}` : ''} · {fmtRp(a.harga)}</span></li>)}
        </ul>
      )}
      <label style={label}>Alasan (wajib — tercatat di audit)
        <input value={teks} maxLength={500} placeholder="mis. salah golongan, seharusnya KIB E" onChange={e => setTeks(e.target.value)} style={inp} />
      </label>
    </Bingkai>
  );
}

/** Nomor/tanggal/berkas SK salah ketik — asetnya tetap dihapus (§20.3). */
export function ModalBetulkanSk({ c, id, versi, nama, sk, onTutup, onTersimpan }: {
  c: WarnaBba; id: number; versi: number; nama: string; sk: { nomor: string | null; tgl: string | null }; onTutup: () => void; onTersimpan: () => void;
}) {
  const [nomor, setNomor] = useState(sk.nomor ?? '');
  const [tgl, setTgl] = useState(sk.tgl ?? '');
  const [catatan, setCatatan] = useState('');
  const [berkas, setBerkas] = useState<{ fileId: string; filename: string } | null>(null);
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const inp = gayaInput(c), label = gayaLabel(c);
  const sama = nomor.trim() === (sk.nomor ?? '') && tgl === (sk.tgl ?? '') && !berkas && !catatan.trim();
  async function simpan() {
    setSibuk(true); setAlasan([]);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/hapus', {
        method: 'PATCH', body: JSON.stringify({ id, expected_version: versi, sk_nomor: nomor.trim(), sk_tgl: tgl, catatan: catatan.trim() || null, file_id: berkas?.fileId ?? null }),
      }) as unknown as Balasan;
      if (!d.ok) { if (d.alasan?.length) setAlasan(d.alasan); else toast.error(d.message || 'Gagal menyimpan'); return; }
      toast.success('SK penghapusan dibetulkan');
      onTersimpan();
    } finally { setSibuk(false); }
  }
  return (
    <Bingkai c={c} judul="Betulkan SK penghapusan" sub={nama} lebar={480} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="primary" disabled={sibuk || !nomor.trim() || !tgl || sama} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Simpan'}</PrimaButton>
      </>}>
      <DaftarAlasan alasan={alasan} />
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 12 }}>Untuk nomor, tanggal, atau berkas SK yang salah ketik — asetnya tetap dihapus. SK lama tetap terbaca di riwayat.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <label style={label}>Nomor SK<input value={nomor} maxLength={80} onChange={e => setNomor(e.target.value)} style={inp} /></label>
        <label style={label}>Tanggal SK<input type="date" value={tgl} max={tanggalHariIniWIB()} onChange={e => setTgl(e.target.value)} style={inp} /></label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>Catatan<input value={catatan} maxLength={500} placeholder="mis. salah ketik nomor SK" onChange={e => setCatatan(e.target.value)} style={inp} /></label>
      </div>
      <BerkasPilih c={c} label="Berkas SK yang benar (opsional)" nilai={berkas} onUbah={setBerkas} />
    </Bingkai>
  );
}

/** Aset yang salah ditandai dihapus kembali aktif — khusus Admin, alasan wajib (§20.3). */
export function ModalBatalHapus({ c, id, versi, nama, sk, onTutup, onTersimpan }: {
  c: WarnaBba; id: number; versi: number; nama: string; sk: string; onTutup: () => void; onTersimpan: () => void;
}) {
  const [teks, setTeks] = useState('');
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const inp = gayaInput(c), label = gayaLabel(c);
  async function simpan() {
    setSibuk(true); setAlasan([]);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/batal-hapus', { method: 'POST', body: JSON.stringify({ id, expected_version: versi, alasan: teks.trim() }) }) as unknown as Balasan;
      if (!d.ok) { if (d.alasan?.length) setAlasan(d.alasan); else toast.error(d.message || 'Gagal membatalkan'); return; }
      toast.success('Penghapusan dibatalkan — aset kembali aktif');
      onTersimpan();
    } finally { setSibuk(false); }
  }
  return (
    <Bingkai c={c} judul="Batalkan penghapusan" sub={nama} lebar={480} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="warning" disabled={sibuk || teks.trim().length < 5} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Batalkan penghapusan'}</PrimaButton>
      </>}>
      <DaftarAlasan alasan={alasan} />
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 12, lineHeight: 1.5 }}>
        Hanya bila aset ini <b style={{ color: c.text }}>tidak termasuk</b> SK {sk} — mis. salah memilih aset. Aset kembali aktif di Buku Aset, nomor & tanggal SK
        dikosongkan; penghapusan dan pembatalannya tetap terbaca di riwayat. Kalau yang salah hanya nomor atau tanggal SK-nya, pakai Betulkan SK.
      </div>
      <label style={label}>Alasan (wajib — tercatat di riwayat & audit)
        <input value={teks} maxLength={500} onChange={e => setTeks(e.target.value)} style={inp} />
      </label>
    </Bingkai>
  );
}

/** Penghapusan dengan SK (§7.6): catatannya tidak lenyap — pindah ke "dihapus". */
export function ModalHapusAset({ c, id, versi, nama, onTutup, onTersimpan }: { c: WarnaBba; id: number; versi: number; nama: string; onTutup: () => void; onTersimpan: () => void }) {
  const [sk, setSk] = useState('');
  const [tgl, setTgl] = useState('');
  const [catatan, setCatatan] = useState('');
  const [berkas, setBerkas] = useState<{ fileId: string; filename: string } | null>(null);
  const [alasan, setAlasan] = useState<string[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const inp = gayaInput(c), label = gayaLabel(c);
  async function simpan() {
    setSibuk(true); setAlasan([]);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/aset/hapus', {
        method: 'POST', body: JSON.stringify({ id, expected_version: versi, sk_nomor: sk.trim(), sk_tgl: tgl, catatan: catatan.trim() || null, file_id: berkas?.fileId ?? null }),
      }) as unknown as Balasan;
      if (!d.ok) { if (d.alasan?.length) setAlasan(d.alasan); else toast.error(d.message || 'Gagal menghapus'); return; }
      toast.success('Aset ditandai dihapus — catatannya tetap ada di saringan "Dihapus"');
      onTersimpan();
    } finally { setSibuk(false); }
  }
  return (
    <Bingkai c={c} judul="Hapus aset dengan SK" sub={nama} lebar={480} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="danger" iconLeft={<DeleteIcon size={13} />} disabled={sibuk || !sk.trim() || !tgl} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Tandai dihapus'}</PrimaButton>
      </>}>
      <DaftarAlasan alasan={alasan} />
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 12 }}>Hanya sesudah ada SK penghapusan. Register tidak lenyap — pindah ke &ldquo;dihapus&rdquo; supaya &ldquo;dulu kita pernah punya berapa&rdquo; tetap terjawab.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <label style={label}>Nomor SK<input value={sk} maxLength={80} onChange={e => setSk(e.target.value)} style={inp} /></label>
        <label style={label}>Tanggal SK<input type="date" value={tgl} max={tanggalHariIniWIB()} onChange={e => setTgl(e.target.value)} style={inp} /></label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>Catatan<input value={catatan} maxLength={500} onChange={e => setCatatan(e.target.value)} style={inp} /></label>
      </div>
      <BerkasPilih c={c} label="Berkas SK (opsional)" nilai={berkas} onUbah={setBerkas} />
    </Bingkai>
  );
}
