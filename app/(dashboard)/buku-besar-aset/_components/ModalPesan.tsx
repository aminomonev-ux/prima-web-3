'use client';
// Dua modal kecil pengganti modal Proses lama (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §3.3): "Tandai dipesan"
// (tanggal kontrak/SPK) dan "Catat barang datang" (penerimaan bertahap + unggah BAST/foto langsung). Route tetap
// yang lama — PATCH /proses dan POST /pengadaan — dan pagarnya aturan bersama (`alasanTolakProses`,
// `alasanTolakPenerimaan`). Muatan rencana diambil segar saat modal dibuka: angka kuncinya milik muatan itu (L77).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { InputNominal } from '@/components/ui/input-nominal';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { alasanTolakProses, type StatusProses } from '@/lib/bba/status';
import { alasanTolakPenerimaan, salinanYangDibeli } from '@/lib/bba/penerimaan';
import { fmtTanggal } from '@/lib/bba/kondisi';
import type { ReferensiIsian, JenisBukti } from '@/lib/bba/referensi';
import type { BbaRow } from '@/lib/data/buku-besar-aset';
import type { BarisPenerimaan } from '@/lib/data/bba-penerimaan';
import { Bingkai } from './AksiAset';
import { unggahBerkas } from './ModalItem';
import type { WarnaBba } from './BbaShell';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtAngka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
const BERKAS = '.pdf,.jpg,.jpeg,.png,.webp';

export type MuatanPesan = { item: BbaRow; referensi: ReferensiIsian[]; penerimaan: BarisPenerimaan[] };

export async function muatRencana(id: number): Promise<MuatanPesan | null> {
  const d = await fetchJson<unknown>(`/api/buku-besar-aset/pengadaan?rencana=${id}`);
  if (!d.ok) { toast.error(d.message || 'Gagal memuat rencana'); return null; }
  return d as unknown as MuatanPesan;
}

/** Status pesanan satu langkah. `true` = tersimpan. 409 = sudah diubah orang lain → pemanggil memuat ulang. */
export async function ubahStatusPesanan(item: Pick<BbaRow, 'id' | 'version'>, status: StatusProses, tgl: string | null): Promise<boolean> {
  const d = await fetchJson<unknown>('/api/buku-besar-aset/proses', {
    method: 'PATCH', body: JSON.stringify({ id: item.id, expected_version: item.version, status, tgl_proses: status === 'DIPROSES' ? tgl : null }),
  });
  if (d.ok) return true;
  toast.error((d as { code?: string }).code === 'VERSION_CONFLICT' ? 'Rencana ini baru saja diubah orang lain — daftar dimuat ulang, coba lagi.' : d.message || 'Gagal menyimpan');
  return false;
}

/** "Tidak jadi dibeli" / "Batalkan pesanan" — satu langkah dengan konfirmasi; rencana dimuat segar dulu (L77). */
export async function langkahMundur(id: number, ke: 'TIDAK_TEREALISASI' | 'DIRENCANAKAN'): Promise<boolean> {
  const m = await muatRencana(id);
  if (!m) return false;
  const alasan = alasanTolakProses(m.item, ke, m.penerimaan.length);
  if (alasan) { toast.error(alasan); return false; }
  const [judul, pesan, label] = ke === 'TIDAK_TEREALISASI'
    ? ['Tidak jadi dibeli?', `"${m.item.uraian}" (${m.item.canonical_id}) ditandai batal dibeli tahun ini. Bisa dipesan lagi nanti lewat tombol Pesan lagi.`, 'Tidak jadi dibeli']
    : ['Batalkan pesanan?', `Pesanan "${m.item.uraian}" (${m.item.canonical_id}) dibatalkan — kembali ke Siap dipesan, tanggal pesan dikosongkan, referensi harga terbuka lagi.`, 'Batalkan pesanan'];
  if (!(await confirmDialog({ title: judul, message: pesan, confirmLabel: label, variant: ke === 'TIDAK_TEREALISASI' ? 'danger' : 'warning' }))) return false;
  return ubahStatusPesanan(m.item, ke, null);
}

function useMuatan(id: number) {
  const [m, setM] = useState<MuatanPesan | null>(null);
  useEffect(() => {
    let batal = false;
    void muatRencana(id).then(x => { if (!batal) setM(x); });
    return () => { batal = true; };
  }, [id]);
  return m;
}

const gaya = (c: WarnaBba) => ({
  inp: { border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub } as React.CSSProperties,
});

function Ringkas({ item, c, sudah }: { item: BbaRow; c: WarnaBba; sudah?: number }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, marginBottom: 12 }}>
      <span>Rencana <b style={{ fontFamily: MONO }}>{fmtAngka(item.vol)} {item.satuan || 'unit'}</b> · <b style={{ fontFamily: MONO }}>{fmtRp(item.anggaran_nilai ?? item.nilai_rencana)}</b></span>
      {sudah !== undefined && <span>Sudah datang <b style={{ fontFamily: MONO }}>{fmtAngka(sudah)} dari {fmtAngka(item.vol)}</b></span>}
      {item.tgl_proses && <span style={{ color: c.sub }}>dipesan {fmtTanggal(item.tgl_proses)}</span>}
    </div>
  );
}

export function ModalTandaiDipesan({ c, rencanaId, onTutup, onTersimpan }: { c: WarnaBba; rencanaId: number; onTutup: () => void; onTersimpan: () => void }) {
  const m = useMuatan(rencanaId);
  const hariIni = tanggalHariIniWIB();
  const [tgl, setTgl] = useState(hariIni);
  const [sibuk, setSibuk] = useState(false);
  const { inp, label } = gaya(c);
  const alasan = m ? alasanTolakProses(m.item, 'DIPROSES', m.penerimaan.length) ?? (tgl > hariIni ? 'Tanggal pesan/kontrak tidak boleh sesudah hari ini.' : null) : null;

  async function simpan() {
    if (!m) return;
    setSibuk(true);
    try {
      if (await ubahStatusPesanan(m.item, 'DIPROSES', tgl || null)) { toast.success(`${m.item.canonical_id} ditandai dipesan`); onTersimpan(); }
      else onTersimpan();
    } finally { setSibuk(false); }
  }

  return (
    <Bingkai c={c} judul="Tandai dipesan" sub={m ? `${m.item.canonical_id} · ${m.item.uraian}` : undefined} lebar={520} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="success" data-rima="bba.realisasi-simpan" disabled={!m || sibuk || !!alasan} data-tooltip={alasan ?? undefined} onClick={() => void simpan()}>
          {sibuk ? 'Menyimpan…' : 'Tandai dipesan'}
        </PrimaButton>
      </>}>
      {!m ? <div style={{ fontSize: 12.5, color: c.sub }}>Memuat rencana…</div> : (<>
        <Ringkas item={m.item} c={c} />
        <label style={label}>Tanggal kontrak / SPK
          <input type="date" value={tgl} max={hariIni} onChange={e => setTgl(e.target.value)} style={inp} />
        </label>
        <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8 }}>Sesudah dipesan, referensi harga dibekukan jadi catatan &ldquo;dulu dibandingkan dengan apa&rdquo;. Begitu barang datang, tekan <b>Catat barang datang</b>.</div>
        {alasan && <div style={{ fontSize: 12, color: '#BA7517', marginTop: 8 }}>{alasan}</div>}
      </>)}
    </Bingkai>
  );
}

type BerkasBukti = { jenis: JenisBukti; file: File };

export function ModalCatatDatang({ c, rencanaId, bolehBukti, onTutup, onTersimpan }: { c: WarnaBba; rencanaId: number; bolehBukti: boolean; onTutup: () => void; onTersimpan: () => void }) {
  const m = useMuatan(rencanaId);
  const hariIni = tanggalHariIniWIB();
  const [f, setF] = useState<{ tgl: string; vol: number | null; harga: number | null; ref: number | null; merk: string; penyedia: string; url: string; catatan: string }>(
    { tgl: hariIni, vol: null, harga: null, ref: null, merk: '', penyedia: '', url: '', catatan: '' });
  const [berkas, setBerkas] = useState<BerkasBukti[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const { inp, label } = gaya(c);
  if (!m) {
    return <Bingkai c={c} judul="Catat barang datang" lebar={760} onTutup={onTutup} kaki={<PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>}>
      <div style={{ fontSize: 12.5, color: c.sub }}>Memuat rencana…</div>
    </Bingkai>;
  }
  const { item, referensi, penerimaan } = m;
  const sudah = penerimaan.reduce((t, p) => t + p.vol, 0);
  // Isian bawaan dari muatan (sisa unit, harga rencana, referensi pertama) — `null` = belum disentuh pemakai.
  const vol = f.vol ?? Math.max(0, item.vol - sudah);
  const harga = f.harga ?? item.harga;
  const refUrut = f.ref ?? (referensi.length > 0 ? 1 : 0);
  const ref = refUrut > 0 ? referensi[refUrut - 1] ?? null : null;
  const dibeli = salinanYangDibeli(ref, { merk_tipe: f.merk, penyedia: f.penyedia, url: f.url });
  const alasan = alasanTolakPenerimaan(item, sudah, vol, f.tgl, hariIni);

  async function simpan() {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/pengadaan', {
        method: 'POST',
        body: JSON.stringify({
          rencana_id: item.id, expected_version: item.version, tgl: f.tgl, vol, harga_satuan: harga,
          referensi_urutan: refUrut || null, merk_tipe: f.merk.trim() || null, penyedia: f.penyedia.trim() || null,
          url: f.url.trim() || null, catatan: f.catatan.trim() || null,
        }),
      });
      if (!d.ok) {
        toast.error((d as { code?: string }).code === 'VERSION_CONFLICT' ? 'Rencana ini baru saja diubah orang lain — tutup lalu buka lagi; isian Anda belum tersimpan.' : d.message || 'Gagal mencatat');
        return;
      }
      const h = d as unknown as { status: string; siapDihapus: number };
      // Penerimaan sudah tersimpan; bukti menyusul. Unggahan yang gagal disebut, penerimaannya tidak dibatalkan.
      let gagal = 0;
      for (const b of berkas) {
        const u = await unggahBerkas(b.file);
        const ok = u && (await fetchJson<unknown>('/api/buku-besar-aset/bukti', { method: 'POST', body: JSON.stringify({ aset_id: item.id, jenis: b.jenis, nama: u.filename, file_id: u.fileId, keterangan: `Penerimaan ${f.tgl}` }) })).ok;
        if (!ok) gagal++;
      }
      toast.success(`Barang datang dicatat — ${h.status === 'REALISASI_PENUH' ? 'diterima penuh' : 'diterima sebagian'}${h.siapDihapus ? ` · ${h.siapDihapus} aset lama ditandai siap dihapus` : ''}${berkas.length - gagal > 0 ? ` · ${berkas.length - gagal} bukti terunggah` : ''}`);
      if (gagal) toast.error(`${gagal} bukti gagal diunggah — unggah lagi dari Bukti dukung.`);
      onTersimpan();
    } finally { setSibuk(false); }
  }

  const tambahBerkas = (jenis: JenisBukti, files: FileList | null) => setBerkas(b => [...b, ...Array.from(files ?? []).map(file => ({ jenis, file }))]);

  return (
    <Bingkai c={c} judul="Catat barang datang" sub={`${item.canonical_id} · ${item.uraian}`} lebar={780} onTutup={onTutup}
      kaki={<>
        <PrimaButton variant="ghost" onClick={onTutup}>Batal</PrimaButton>
        <PrimaButton menulis variant="success" disabled={sibuk || !!alasan} data-tooltip={alasan ?? undefined} onClick={() => void simpan()}>{sibuk ? 'Menyimpan…' : 'Catat barang datang'}</PrimaButton>
      </>}>
      <Ringkas item={item} c={c} sudah={sudah} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <label style={label}>Tanggal datang<input type="date" value={f.tgl} max={hariIni} onChange={e => setF({ ...f, tgl: e.target.value })} style={inp} /></label>
        <label style={label}>Jumlah (sisa {fmtAngka(item.vol - sudah)})
          <input type="number" min={0} step="any" value={vol} onChange={e => setF({ ...f, vol: Number(e.target.value) })} style={{ ...inp, fontFamily: MONO }} />
        </label>
        <label style={label}>Harga satuan riil<InputNominal value={harga} onChange={v => setF({ ...f, harga: v })} style={{ ...inp, fontFamily: MONO, textAlign: 'right' }} /></label>
        <div style={{ ...label, justifyContent: 'flex-end' }}>Nilai<div style={{ fontFamily: MONO, fontSize: 13, color: c.text, padding: '6px 0' }}>{fmtRp(vol * harga)}</div></div>
      </div>
      <div style={{ fontSize: 11.5, color: c.sub, margin: '12px 0 6px' }}>Yang benar-benar dibeli — dipakai saat merencanakan barang yang sama tahun berikutnya</div>
      <div role="radiogroup" aria-label="Yang dibeli" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {referensi.map((r, i) => (
          <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, cursor: 'pointer' }}>
            <input type="radio" name="ref-dibeli" checked={refUrut === i + 1} onChange={() => setF({ ...f, ref: i + 1 })} />
            <span>Referensi ke-{i + 1}: <b>{[r.merk_tipe, r.nama_penyedia].filter(Boolean).join(' · ') || r.sumber}</b>
              {r.harga != null && <span style={{ fontFamily: MONO, color: c.sub }}> · {fmtRp(r.harga)}</span>}</span>
          </label>
        ))}
        <label style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5, cursor: 'pointer' }}>
          <input type="radio" name="ref-dibeli" checked={refUrut === 0} onChange={() => setF({ ...f, ref: 0 })} />
          <span>Beli di tempat lain (isi sendiri)</span>
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
        <label style={label}>Merk / tipe<input value={f.merk} maxLength={160} placeholder={ref?.merk_tipe ?? ''} onChange={e => setF({ ...f, merk: e.target.value })} style={inp} /></label>
        <label style={label}>Penyedia<input value={f.penyedia} maxLength={255} placeholder={ref?.nama_penyedia ?? ''} onChange={e => setF({ ...f, penyedia: e.target.value })} style={inp} /></label>
        <label style={label}>Tautan<input value={f.url} maxLength={2048} placeholder={ref?.url ?? 'https://…'} onChange={e => setF({ ...f, url: e.target.value })} style={inp} /></label>
        <label style={label}>Catatan<input value={f.catatan} maxLength={500} placeholder="mis. No. BAST" onChange={e => setF({ ...f, catatan: e.target.value })} style={inp} /></label>
      </div>
      <div style={{ fontSize: 11.5, color: c.sub, marginTop: 8 }}>
        Tersimpan: {[dibeli.merk_tipe, dibeli.penyedia].filter(Boolean).join(' · ') || '—'}{dibeli.url ? ' · dengan tautan' : ''}. Isian kosong mengikuti referensi terpilih.
      </div>
      {bolehBukti && (
        <div style={{ marginTop: 12, padding: '10px 12px', border: `1px dashed ${c.border}`, borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}><Paperclip size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Bukti dukung (boleh menyusul)</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {([['BAST', 'BAST'], ['FOTO', 'Foto barang'], ['BUKTI_BELI', 'Bukti beli']] as const).map(([j, l]) => (
              <label key={j} style={{ ...label, flexDirection: 'row', alignItems: 'center', gap: 6 }}>{l}
                <input type="file" accept={BERKAS} multiple onChange={e => { tambahBerkas(j, e.target.files); e.target.value = ''; }} style={{ fontSize: 11.5, maxWidth: 200 }} />
              </label>
            ))}
          </div>
          {berkas.length > 0 && <div style={{ fontSize: 11.5, color: c.sub, marginTop: 6 }}>{berkas.map(b => `${b.jenis === 'FOTO' ? 'Foto' : b.jenis === 'BAST' ? 'BAST' : 'Bukti beli'}: ${b.file.name}`).join(' · ')}
            {' '}<button type="button" onClick={() => setBerkas([])} style={{ background: 'none', border: 'none', color: '#E24B4A', cursor: 'pointer', fontSize: 11.5 }}>buang</button></div>}
        </div>
      )}
      {alasan && <div style={{ fontSize: 12, color: '#BA7517', marginTop: 8 }}>{alasan}</div>}
    </Bingkai>
  );
}
