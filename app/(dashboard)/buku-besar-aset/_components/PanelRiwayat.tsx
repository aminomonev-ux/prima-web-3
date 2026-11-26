'use client';
// Panel "Riwayat dan batalkan" per rencana (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5.1) — tangga tahap, langkah
// terbaru di atas. Tombol yang belum boleh menyebut langkah yang harus dibatalkan lebih dulu. Panel ini menyatukan
// TAMPILAN; aturannya tetap yang lama (`alasanTolakProses`, hapus penerimaan, `alasanTakBisaBatalTempatkan`,
// `alasanTakBisaHapus`, `alasanTakBisaUbahAnggaran`) dan route-nya juga. Hapus berantai (§5.2) khusus Admin.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, Paperclip } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { alasanTakBisaHapus, alasanTolakProses } from '@/lib/bba/status';
import { alasanTakBisaUbahAnggaran, LABEL_ANGGARAN, LABEL_JENIS } from '@/lib/bba/rencana';
import { alasanTakBisaBatalTempatkan } from '@/lib/bba/koreksi';
import { tahapRencana } from '@/lib/bba/tahap';
import { fmtTanggal } from '@/lib/bba/kondisi';
import type { RiwayatRencana, BarisPenerimaan } from '@/lib/data/bba-penerimaan';
import { Bingkai } from './AksiAset';
import { ModalBatalTempatkan } from './AksiTerima';
import { muatRencana, ubahStatusPesanan, type MuatanPesan } from './ModalPesan';
import GarisTahap from './GarisTahap';
import type { WarnaBba } from './BbaShell';
import type { PetaIzinLayar } from './BbaNav';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtAngka = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

type Muatan = MuatanPesan & { riwayat: RiwayatRencana };
type Aksi = { label: string; mati: string | null; jalan: () => void; varian?: 'warning' | 'danger' };
type Anak = { teks: ReactNode; aksi?: Aksi };

type Props = {
  c: WarnaBba; rencanaId: number; izin: PetaIzinLayar;
  /** Admin (PERAN_PEMBATAL_FINAL): hapus penerimaan dari Diterima penuh / data pindahan, dan hapus berantai. */
  bolehAdmin: boolean;
  onTutup: () => void; onTersimpan: () => void;
  onBukaBukti?: () => void;
};

export default function PanelRiwayat({ c, rencanaId, izin, bolehAdmin, onTutup, onTersimpan, onBukaBukti }: Props) {
  const [m, setM] = useState<Muatan | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [batalTempat, setBatalTempat] = useState<number[] | null>(null);
  const [berantai, setBerantai] = useState(false);
  const [kode, setKode] = useState('');
  const [alasan, setAlasan] = useState('');
  const muat = useCallback(async () => {
    const x = await muatRencana(rencanaId);
    if (x) setM(x as Muatan);
  }, [rencanaId]);
  useEffect(() => { void Promise.resolve().then(muat); }, [muat]);
  const sesudah = () => { onTersimpan(); void muat(); };
  const jalankan = async (f: () => Promise<boolean>) => { setSibuk(true); try { if (await f()) sesudah(); } finally { setSibuk(false); } };

  if (!m) {
    return <Bingkai c={c} judul="Riwayat dan batalkan" lebar={760} onTutup={onTutup} kaki={<PrimaButton variant="ghost" onClick={onTutup}>Tutup</PrimaButton>}>
      <div style={{ fontSize: 12.5, color: c.sub }}>Memuat rencana…</div>
    </Bingkai>;
  }
  const { item, penerimaan, riwayat } = m;
  const tahap = tahapRencana(item);
  const edit = { rencana: izin.rencana === 'EDIT', pengadaan: izin.pengadaan === 'EDIT', aset: izin.aset === 'EDIT' };
  const tanpaIzin = (bagian: string) => `Izin Anda di bagian ${bagian} hanya melihat.`;

  // ── Langkah-langkah, terbaru di atas ──
  const langkah: Array<{ judul: string; ket?: string; aksi?: Aksi; anak?: Anak[] }> = [];
  const regAktif = riwayat.register;
  if (regAktif.length) {
    const bisa = regAktif.filter(a => !alasanTakBisaBatalTempatkan(a));
    langkah.push({
      judul: `Dicatat di Buku Aset (${regAktif.length} register)`,
      ket: regAktif.slice(0, 4).map(a => `${a.nama || a.nama_resmi}${a.register ? ` reg. ${a.register}` : ' · belum teregister'}`).join('; ') + (regAktif.length > 4 ? ' …' : ''),
      aksi: { label: bisa.length === regAktif.length ? 'Batalkan penempatan' : `Batalkan penempatan (${bisa.length})`, varian: 'warning',
        mati: !edit.aset ? tanpaIzin('Buku Aset') : bisa.length === 0 ? alasanTakBisaBatalTempatkan(regAktif[0]) : null,
        jalan: () => setBatalTempat(bisa.map(a => a.id)) },
    });
  }
  if (penerimaan.length) {
    const sudah = penerimaan.reduce((t, p) => t + p.vol, 0);
    langkah.push({
      judul: `Diterima ${fmtAngka(sudah)}/${fmtAngka(item.vol)} ${item.satuan || 'unit'}`,
      anak: penerimaan.map((p: BarisPenerimaan) => {
        const mati = !edit.pengadaan ? tanpaIzin('Pengadaan')
          : p.ditempatkan > 0 ? `Sudah jadi ${p.ditempatkan} register — batalkan penempatannya dulu (langkah di atas).`
          : p.pindahan && !bolehAdmin ? 'Realisasi lama hasil migrasi — penghapusannya hanya oleh Admin.'
          : item.status === 'REALISASI_PENUH' && !bolehAdmin ? 'Sudah diterima penuh — koreksi mundur hanya oleh Admin.' : null;
        return {
          teks: <>{fmtTanggal(p.tgl)} · <span style={{ fontFamily: MONO }}>{fmtAngka(p.vol)} × {fmtRp(p.harga_satuan)}</span>
            {p.pindahan ? ' · realisasi lama' : [p.merk_tipe, p.penyedia].filter(Boolean).length ? ` · ${[p.merk_tipe, p.penyedia].filter(Boolean).join(' · ')}` : ''}{p.catatan ? ` · ${p.catatan}` : ''}</>,
          aksi: { label: 'Hapus penerimaan…', varian: 'danger' as const, mati, jalan: () => void hapusPenerimaan(p) },
        };
      }),
    });
  }
  if (item.status !== 'DIRENCANAKAN') {
    const batal = item.status === 'TIDAK_TEREALISASI';
    const tolak = alasanTolakProses(item, 'DIRENCANAKAN', penerimaan.length);
    langkah.push({
      judul: batal ? 'Batal dibeli' : `Dipesan${item.tgl_proses ? ` (${fmtTanggal(item.tgl_proses)})` : ''}`,
      aksi: { label: batal ? 'Kembalikan ke siap dipesan' : 'Batalkan pesanan', varian: 'warning',
        mati: !edit.pengadaan ? tanpaIzin('Pengadaan') : penerimaan.length ? 'Sudah ada barang yang datang — hapus penerimaannya dulu (langkah di atas).' : tolak,
        jalan: () => void jalankan(async () => {
          if (!(await confirmDialog({ title: batal ? 'Kembalikan ke siap dipesan?' : 'Batalkan pesanan?', message: `${item.canonical_id} kembali ke Siap dipesan; tanggal pesan dikosongkan dan referensi harga terbuka lagi.`, confirmLabel: batal ? 'Kembalikan' : 'Batalkan pesanan', variant: 'warning' }))) return false;
          return ubahStatusPesanan(item, 'DIRENCANAKAN', null);
        }) },
    });
  }
  if (item.anggaran !== 'BELUM' && item.usulan_keputusan !== 'DITOLAK') {
    const tolak = alasanTakBisaUbahAnggaran(item.status, item.anggaran, 'BELUM');
    langkah.push({
      judul: `${LABEL_ANGGARAN[item.anggaran]}${item.anggaran_pada ? ` (${fmtTanggal(item.anggaran_pada.slice(0, 10))}${riwayat.anggaran_oleh ? ` · ${riwayat.anggaran_oleh}` : ''})` : ''}`,
      ket: item.anggaran === 'DIDANAI' && item.anggaran_nilai != null ? `${fmtAngka(item.anggaran_vol ?? item.vol)} ${item.satuan || 'unit'} · ${fmtRp(item.anggaran_nilai)}` : undefined,
      aksi: { label: 'Kembalikan ke belum diputuskan', varian: 'warning',
        mati: !edit.rencana ? tanpaIzin('Rencana') : tolak ? 'Rencana ini sudah dipesan — batalkan pesanannya dulu (langkah di atas).' : null,
        jalan: () => void jalankan(async () => {
          const d = await fetchJson<unknown>('/api/buku-besar-aset/anggaran', { method: 'POST', body: JSON.stringify({ item: [{ id: item.id, expected_version: item.version, anggaran: 'BELUM' }] }) });
          if (!d.ok) toast.error(d.message || 'Gagal'); else toast.success(`${item.canonical_id} kembali ke belum diputuskan`);
          return d.ok;
        }) },
    });
  }
  {
    const tolak = alasanTakBisaHapus(item.status, item.jumlah_bukti);
    langkah.push({
      judul: `Dibuat${riwayat.dibuat_pada ? ` (${fmtTanggal(riwayat.dibuat_pada.slice(0, 10))}${riwayat.dibuat_oleh ? ` · ${riwayat.dibuat_oleh}` : ''})` : ''}`,
      ket: item.origin === 'USULAN' ? `dari usulan ${item.usulan_no ?? ''}` : 'diisi manual',
      aksi: { label: 'Hapus item', varian: 'danger',
        mati: !edit.rencana ? tanpaIzin('Rencana') : item.status !== 'DIRENCANAKAN' ? 'Batalkan pesanannya dulu (langkah di atas).' : tolak,
        jalan: () => void jalankan(async () => {
          if (!(await confirmDialog({ title: 'Hapus item', message: `Hapus "${item.uraian}" (${item.canonical_id})?${item.ref.n ? ' Referensi harganya ikut terhapus.' : ''}`, confirmLabel: 'Hapus', variant: 'danger' }))) return false;
          const d = await fetchJson<unknown>(`/api/buku-besar-aset?id=${item.id}`, { method: 'DELETE' });
          if (!d.ok) { toast.error(d.message || 'Gagal menghapus'); return false; }
          toast.success(`${item.canonical_id} dihapus`); onTersimpan(); onTutup(); return false;
        }) },
    });
  }

  async function hapusPenerimaan(p: BarisPenerimaan) {
    if (!(await confirmDialog({ title: 'Hapus penerimaan', message: `Hapus penerimaan ${fmtAngka(p.vol)} ${item.satuan || 'unit'} tanggal ${fmtTanggal(p.tgl)}? Realisasi rencana dihitung ulang dari penerimaan yang tersisa.`, confirmLabel: 'Hapus', variant: 'danger' }))) return;
    const d = await fetchJson<unknown>(`/api/buku-besar-aset/pengadaan?id=${p.id}`, { method: 'DELETE' });
    if (d.ok) { toast.success('Penerimaan dihapus'); sesudah(); } else toast.error(d.message || 'Gagal menghapus');
  }

  async function hapusBerantai() {
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/hapus-berantai', { method: 'POST', body: JSON.stringify({ id: item.id, expected_version: item.version, kode: kode.trim(), alasan: alasan.trim() }) }) as unknown as { ok: boolean; code?: string; message?: string; alasan?: string[]; penerimaan?: unknown[]; register?: unknown[] };
      if (!d.ok) {
        toast.error(d.alasan?.length ? d.alasan.join(' ') : d.message || 'Gagal menghapus');
        if (d.code === 'VERSION_CONFLICT') void muat();
        return;
      }
      toast.success(`${item.canonical_id} dihapus beserta ${d.penerimaan?.length ?? 0} penerimaan & ${d.register?.length ?? 0} register`);
      onTersimpan(); onTutup();
    } finally { setSibuk(false); }
  }

  // Tiap aturan sudah menolak bila langkah di atasnya belum dibatalkan — jadi yang hidup memang hanya langkah teratas.
  const tombol = (a: Aksi) => (
    <span data-tooltip={a.mati ?? undefined} data-tooltip-pos="left" style={{ flexShrink: 0 }}>
      <PrimaButton menulis variant={a.varian ?? 'warning'} size="sm" disabled={sibuk || !!a.mati} onClick={a.jalan}>{a.label}</PrimaButton>
    </span>
  );

  return (
    <Bingkai c={c} judul={`Riwayat dan batalkan — ${item.canonical_id}`} sub={`${item.uraian}${item.jenis_rencana ? ` · ${LABEL_JENIS[item.jenis_rencana]}` : ''}`} lebar={780} onTutup={onTutup}
      kaki={<>
        {onBukaBukti && <PrimaButton variant="ghost" iconLeft={<Paperclip size={14} />} onClick={onBukaBukti}>Bukti dukung · {item.jumlah_bukti}</PrimaButton>}
        <PrimaButton variant="ghost" onClick={onTutup}>Tutup</PrimaButton>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <GarisTahap tahap={tahap} sub={c.sub} />
        <span style={{ fontSize: 12, color: c.sub }}>Batalkan dari atas ke bawah — tiap tombol yang mati menyebut langkah yang harus dibatalkan dulu.</span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {langkah.map(l => (
          <li key={l.judul} style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '9px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Check size={14} color="#1D9E75" />
              <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{l.judul}</b>
                {l.ket && <div style={{ fontSize: 11.5, color: c.sub }}>{l.ket}</div>}
              </span>
              {l.aksi && tombol(l.aksi)}
            </div>
            {l.anak && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 24 }}>
                {l.anak.map((a, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                    <span style={{ flex: '1 1 220px', minWidth: 0 }}>{a.teks}</span>
                    {a.aksi && tombol(a.aksi)}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      {bolehAdmin && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
          {!berantai ? (
            <PrimaButton variant="ghost" size="sm" onClick={() => setBerantai(true)}>Hapus data salah input sekaligus (Admin)…</PrimaButton>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5 }}>
                Menghapus <b>{item.canonical_id}</b> beserta {penerimaan.length} penerimaan dan {regAktif.length} register hasil penempatan dalam satu langkah.
                Hanya untuk catatan yang belum keluar dari PRIMA — ditolak bila ada register bernomor provinsi, sudah dicek/dipindah, atau data lama hasil migrasi. Berkas di Drive tidak ikut terhapus.
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub }}>Alasan (paling sedikit 10 huruf)
                <textarea value={alasan} maxLength={500} rows={2} onChange={e => setAlasan(e.target.value)} style={{ border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, color: c.sub }}>Ketik <b style={{ fontFamily: MONO, color: c.text }}>{item.canonical_id}</b> untuk memastikan
                <input value={kode} onChange={e => setKode(e.target.value)} style={{ border: `1px solid ${c.border}`, borderRadius: 6, padding: '6px 9px', fontSize: 13, color: c.text, background: c.input, fontFamily: MONO, maxWidth: 220 }} />
              </label>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <PrimaButton variant="ghost" size="sm" onClick={() => setBerantai(false)}>Batal</PrimaButton>
                <PrimaButton menulis variant="danger" size="sm" disabled={sibuk || alasan.trim().length < 10 || kode.trim().toUpperCase() !== item.canonical_id.toUpperCase()} onClick={() => void hapusBerantai()}>Hapus semuanya</PrimaButton>
              </div>
            </div>
          )}
        </div>
      )}

      {batalTempat && <ModalBatalTempatkan c={c} ids={batalTempat} onTutup={() => setBatalTempat(null)} onTersimpan={() => { setBatalTempat(null); sesudah(); }} />}
    </Bingkai>
  );
}
