'use client';
// Spanduk "laporan di Drive diubah di luar PRIMA" + modal tinjauan (docs/konsep/bba/CONCEPT-bba-drive-balik.md §2, §6A).
// Modal hanya MEMILIH: tidak ada yang ditulis sebelum Terapkan; server menghitung ulang pratinjau dari revisi yang sama dan
// menulis lewat jalur simpan tiap menu. Benturan wajib dipilih; baris "mungkin kembar" & barang baru tidak dicentang sendiri.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { fetchJson } from '@/lib/shared/api';
import { LABEL_ANGGARAN, LABEL_JENIS, type Anggaran, type JenisRencana } from '@/lib/bba/rencana';
import { kunciNamaBarang } from '@/lib/bba/barang';
import type { Pratinjau } from '@/lib/data/bba-drive-balik';
import type { NilaiBaku, UsulUbah, UsulBaru, PetaLembar } from '@/lib/bba/drive-balik';
import type { LembarBalik } from '@/lib/bba/laporan-excel';
import type { PerubahanLuar } from '@/lib/bba/drive-kirim';
import { Bingkai } from './AksiAset';
import type { WarnaBba } from './BbaShell';

const LEMBAR: LembarBalik[] = ['rencana', 'pengadaan', 'penerimaan', 'penawaran'];
const NAMA: Record<LembarBalik, string> = { rencana: 'Rencana', pengadaan: 'Pengadaan', penerimaan: 'Penerimaan', penawaran: 'Penawaran' };
const KUNING = '#BA7517', MERAH = '#E24B4A', HIJAU = '#1D9E75';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const waktu = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : '—');
function tampil(kunci: string, v: NilaiBaku | undefined): string {
  if (v === null || v === undefined || v === '') return '(kosong)';
  if (kunci === 'keputusan') return v === 'DITOLAK' ? 'Usulan ditolak' : LABEL_ANGGARAN[v as Anggaran] ?? String(v);
  if (kunci === 'jenis') return LABEL_JENIS[v as JenisRencana] ?? String(v);
  return typeof v === 'number' ? v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) : String(v);
}

type Menunggu = { kunci: string; tahun: number; luar: PerubahanLuar };

/** Spanduk di atas semua halaman BBA. Hanya membaca status dari DB — membuka BBA tidak menunggu Google. */
export function SpandukDrive({ c }: { c: WarnaBba }) {
  const [daftar, setDaftar] = useState<Menunggu[]>([]);
  const [bolehTinjau, setBolehTinjau] = useState(false);
  const [buka, setBuka] = useState<string | null>(null);
  const muat = useCallback(async () => {
    const d = await fetchJson<unknown>('/api/buku-besar-aset/drive-balik');
    if (d.ok) { const x = d as unknown as { menunggu: Menunggu[]; bolehTinjau: boolean }; setDaftar(x.menunggu); setBolehTinjau(x.bolehTinjau); }
  }, []);
  useEffect(() => { void Promise.resolve().then(muat); }, [muat]);
  if (!daftar.length) return null;
  return (<>
    {daftar.map(m => (
      <div key={m.kunci} role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: `1px solid ${KUNING}`, background: 'rgba(186,117,23,.12)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
        <AlertTriangle size={18} color={KUNING} style={{ flexShrink: 0 }} />
        <span style={{ flex: '1 1 320px', minWidth: 0 }}>
          <b>Laporan BBA {m.tahun} di Google Drive diubah di luar PRIMA</b>{m.luar.oleh ? <> oleh <b>{m.luar.oleh}</b></> : null} · {waktu(m.luar.pada)}.
          {m.luar.tertimpa && ' Suntingan itu sempat tertimpa salinan otomatis, tapi isinya masih bisa ditinjau dari riwayat Drive.'}
          <span style={{ color: c.sub }}> Salinan otomatis untuk berkas ini ditahan sampai perubahannya ditinjau.</span>
        </span>
        {bolehTinjau
          ? <PrimaButton variant="warning" size="sm" onClick={() => setBuka(m.kunci)}>Tinjau perubahan</PrimaButton>
          : <span style={{ fontSize: 12, color: c.sub }}>Menunggu ditinjau pemegang bagian Rencana atau Pengadaan.</span>}
      </div>
    ))}
    {buka && <TinjauDrive c={c} kunci={buka} onTutup={() => setBuka(null)} onSelesai={() => { setBuka(null); window.location.reload(); }} />}
  </>);
}

type Pilih = Record<string, Record<string, 'drive' | 'prima'>>;
const kunciUbah = (u: { lembar: LembarBalik; id: number }) => `${u.lembar}:${u.id}`;
const kunciBaru = (b: { lembar: LembarBalik; baris: number }) => `${b.lembar}:${b.baris}`;

function pilihanAwal(p: Pratinjau, boleh: Record<string, boolean>): { ubah: Pilih; baru: Set<string> } {
  const ubah: Pilih = {};
  for (const u of p.tinjauan.ubah) {
    if (!boleh[u.lembar]) continue;
    ubah[kunciUbah(u)] = Object.fromEntries(u.sel.filter(s => s.jenis === 'usul').map(s => [s.kunci, 'drive' as const]));
  }
  const baru = new Set(p.tinjauan.baru.filter(b => boleh[b.lembar] && !b.tolak && !b.kembar).map(kunciBaru));
  return { ubah, baru };
}

function TinjauDrive({ c, kunci, onTutup, onSelesai }: { c: WarnaBba; kunci: string; onTutup: () => void; onSelesai: () => void }) {
  const [p, setP] = useState<Pratinjau | null>(null);
  const [boleh, setBoleh] = useState<Record<string, boolean>>({});
  const [galat, setGalat] = useState<string | null>(null);
  const [koreksi, setKoreksi] = useState<Partial<Record<LembarBalik, PetaLembar>>>({});
  const [ubah, setUbah] = useState<Pilih>({});
  const [baru, setBaru] = useState<Set<string>>(new Set());
  const [barangBaru, setBarangBaru] = useState<Set<string>>(new Set());
  const [barangPeta, setBarangPeta] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<{ diterapkan: string[]; ditolak: string[] } | null>(null);
  const [catatanBuka, setCatatanBuka] = useState(false);

  const muat = useCallback(async (peta: Partial<Record<LembarBalik, PetaLembar>>) => {
    setSibuk(true); setGalat(null);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/drive-balik?step=pratinjau', { method: 'POST', body: JSON.stringify({ kunci, peta }) });
      if (!d.ok) { setGalat(d.message || 'Pratinjau gagal dimuat'); return; }
      const x = d as unknown as { pratinjau: Pratinjau; bolehLembar: Record<string, boolean> };
      setP(x.pratinjau); setBoleh(x.bolehLembar);
      const a = pilihanAwal(x.pratinjau, x.bolehLembar);
      setUbah(a.ubah); setBaru(a.baru); setBarangBaru(new Set()); setBarangPeta({});
    } finally { setSibuk(false); }
  }, [kunci]);
  useEffect(() => { void Promise.resolve().then(() => muat({})); }, [muat]);

  const t = p?.tinjauan;
  const benturanSisa = useMemo(() => (t?.ubah ?? []).filter(u => boleh[u.lembar])
    .flatMap(u => u.sel.filter(s => s.jenis === 'benturan' && !ubah[kunciUbah(u)]?.[s.kunci]).map(s => `${u.label} — ${s.judul}`)), [t, ubah, boleh]);
  const jumlahDipilih = useMemo(() => Object.values(ubah).reduce((n, m) => n + Object.values(m).filter(v => v === 'drive').length, 0) + baru.size, [ubah, baru]);

  const setSel = (u: UsulUbah, k: string, v: 'drive' | 'prima' | null) => setUbah(prev => {
    const x = { ...(prev[kunciUbah(u)] ?? {}) };
    if (v) x[k] = v; else delete x[k];
    return { ...prev, [kunciUbah(u)]: x };
  });
  const pakaiPrimaSemua = () => setUbah(prev => {
    const n = { ...prev };
    for (const u of t?.ubah ?? []) for (const s of u.sel) if (s.jenis === 'benturan' && !n[kunciUbah(u)]?.[s.kunci]) n[kunciUbah(u)] = { ...(n[kunciUbah(u)] ?? {}), [s.kunci]: 'prima' };
    return n;
  });

  async function terapkan() {
    if (!p || !t) return;
    const pakaiDrive = Object.values(ubah).reduce((n, m) => n + Object.values(m).filter(v => v === 'drive').length, 0);
    const benturan = t.ubah.flatMap(u => u.sel.filter(s => s.jenis === 'benturan').map(s => ubah[kunciUbah(u)]?.[s.kunci]));
    const tidakDipakai = t.ubah.reduce((n, u) => n + u.sel.filter(s => s.jenis !== 'benturan' && ubah[kunciUbah(u)]?.[s.kunci] !== 'drive').length, 0)
      + t.baru.filter(b => !baru.has(kunciBaru(b))).length;
    const ok = await confirmDialog({
      title: 'Terapkan perubahan dari Drive?',
      message: `${pakaiDrive} perubahan sel dan ${baru.size} baris baru akan ditulis ke PRIMA.`
        + `${benturan.length ? ` Benturan: ${benturan.filter(x => x === 'drive').length} pakai Drive, ${benturan.filter(x => x === 'prima').length} pakai PRIMA.` : ''}`
        + `${tidakDipakai ? ` ${tidakDipakai} perubahan/baris tidak dipakai.` : ''}`
        + ` Sesudah ini salinan otomatis berlanjut dan berkas di Drive ditimpa hasil gabungan — yang tidak dipakai masih ada di riwayat versi Drive.`,
      confirmLabel: 'Terapkan', variant: 'warning',
    });
    if (!ok) return;
    setSibuk(true);
    try {
      const body = {
        kunci, revisi: p.luar.revisi, peta: koreksi,
        ubah: t.ubah.filter(u => boleh[u.lembar] && Object.keys(ubah[kunciUbah(u)] ?? {}).length).map(u => ({ lembar: u.lembar, id: u.id, versi: u.versi, sel: ubah[kunciUbah(u)] })),
        baru: t.baru.filter(b => baru.has(kunciBaru(b))).map(b => ({ lembar: b.lembar, baris: b.baris })),
        barangBaru: p.barangBaru.filter(b => barangBaru.has(b.nama)).map(b => b.nama),
        barangPeta,
      };
      const d = await fetchJson<unknown>('/api/buku-besar-aset/drive-balik?step=terapkan', { method: 'POST', body: JSON.stringify(body) }) as unknown as { ok: boolean; code?: string; message?: string; diterapkan?: string[]; ditolak?: string[] };
      if (!d.ok) {
        toast.error(d.message || 'Gagal menerapkan');
        if (d.code === 'PRATINJAU_BASI' || d.code === 'TIDAK_ADA') void muat(koreksi);
        return;
      }
      setHasil({ diterapkan: d.diterapkan ?? [], ditolak: d.ditolak ?? [] });
    } finally { setSibuk(false); }
  }

  async function abaikan() {
    if (!p) return;
    if (!(await confirmDialog({ title: 'Abaikan perubahan di Drive?', message: 'Tidak ada yang ditulis ke PRIMA. Salinan otomatis berlanjut dan berkas di Drive ditimpa isi PRIMA — suntingan itu tetap ada di riwayat versi Drive.', confirmLabel: 'Abaikan', variant: 'danger' }))) return;
    setSibuk(true);
    try {
      const d = await fetchJson<unknown>('/api/buku-besar-aset/drive-balik?step=abaikan', { method: 'POST', body: JSON.stringify({ kunci, revisi: p.luar.revisi }) });
      if (!d.ok) { toast.error(d.message || 'Gagal'); return; }
      toast.success('Perubahan Drive diabaikan — salinan otomatis berlanjut');
      onSelesai();
    } finally { setSibuk(false); }
  }

  const kotak: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10 };
  const pilihCss: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '3px 6px', fontSize: 12, color: c.text, background: c.input };

  if (hasil) {
    return (
      <Bingkai c={c} judul="Perubahan Drive diterapkan" lebar={760} onTutup={onSelesai} kaki={<PrimaButton variant="primary" onClick={onSelesai}>Selesai</PrimaButton>}>
        <div style={{ fontSize: 13, marginBottom: 8 }}><b style={{ color: HIJAU }}>{hasil.diterapkan.length} diterapkan</b>{hasil.ditolak.length ? <>, <b style={{ color: MERAH }}>{hasil.ditolak.length} tidak bisa diterapkan</b></> : null}. Salinan otomatis berlanjut pada putaran berikutnya.</div>
        {hasil.diterapkan.map((x, i) => <div key={`a${i}`} style={{ fontSize: 12, padding: '3px 0', borderTop: `1px solid ${c.border}` }}>✓ {x}</div>)}
        {hasil.ditolak.map((x, i) => <div key={`b${i}`} style={{ fontSize: 12, padding: '3px 0', borderTop: `1px solid ${c.border}`, color: MERAH }}>✕ {x}</div>)}
      </Bingkai>
    );
  }

  return (
    <Bingkai c={c} judul="Tinjau perubahan dari Google Drive" lebar={980} onTutup={onTutup}
      sub={p ? `Laporan BBA ${p.tahun} · diubah ${p.luar.oleh ? `oleh ${p.luar.oleh} ` : ''}${waktu(p.luar.pada)}` : 'Membaca berkas di Drive…'}
      kaki={<>
        {p && <span style={{ marginRight: 'auto' }}><PrimaButton variant="danger" disabled={sibuk} onClick={() => void abaikan()}>Abaikan perubahan Drive</PrimaButton></span>}
        <PrimaButton variant="ghost" onClick={onTutup}>Tutup</PrimaButton>
        <span data-tooltip={benturanSisa.length ? `Pilih dulu untuk ${benturanSisa.length} benturan` : undefined}>
          <PrimaButton menulis variant="primary" disabled={!p || sibuk || benturanSisa.length > 0 || jumlahDipilih === 0} onClick={() => void terapkan()}>Terapkan ({jumlahDipilih})</PrimaButton>
        </span>
      </>}>
      {galat && <div style={{ color: MERAH, fontSize: 13, marginBottom: 10 }}>{galat}</div>}
      {!p && !galat && <div style={{ fontSize: 13, color: c.sub }}>Membaca berkas di Drive dan membandingkannya dengan PRIMA…</div>}
      {p && t && (<>
        <div style={{ ...kotak, fontSize: 12.5, lineHeight: 1.6 }}>
          {p.asal.ada
            ? <>Dibandingkan dengan salinan yang PRIMA kirim {p.asal.dikirimPada}{p.asal.terbaru ? '' : <b style={{ color: KUNING }}> — bukan salinan terakhir: berkas disunting dari salinan lama. Perubahan PRIMA sesudahnya tetap dipakai.</b>}.</>
            : <b style={{ color: KUNING }}>Tidak ada catatan salinan asal untuk berkas ini, jadi PRIMA tidak bisa membedakan mana yang diubah di Drive dan mana yang diubah di PRIMA. Semua beda ditampilkan tanpa dicentang — pilih sendiri.</b>}
          {t.dipertahankan > 0 && <> {t.dipertahankan} perubahan yang dibuat di PRIMA sesudah salinan itu dibuka dipertahankan.</>}
          {(p.diputuskanWeb ?? 0) > 0 && <> {p.diputuskanWeb} perubahan Drive sudah ditolak di layar (&ldquo;tetap nilai PRIMA&rdquo;) dan tidak ditanyakan lagi.</>}
          {p.revisiHilang && <> <b style={{ color: KUNING }}>Versi yang terdeteksi sudah dipangkas Drive — yang dibaca versi terbaru.</b></>}
          {p.lembarHilang.length > 0 && <> Lembar {p.lembarHilang.map(l => NAMA[l]).join(', ')} tidak ditemukan di berkas.</>}
        </div>

        <PemetaanKolom c={c} p={p} koreksi={koreksi} pilihCss={pilihCss} kotak={kotak} sibuk={sibuk}
          onUbah={k => setKoreksi(k)} onBacaUlang={() => void muat(koreksi)} />

        {benturanSisa.length > 0 && (
          <div style={{ ...kotak, borderColor: MERAH, fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}><b style={{ color: MERAH }}>{benturanSisa.length} benturan</b> — sel yang diubah di Drive DAN di PRIMA dengan nilai berbeda. Pilih salah satu untuk tiap sel.</span>
            <PrimaButton variant="ghost" size="sm" onClick={pakaiPrimaSemua}>Pakai PRIMA untuk semua benturan</PrimaButton>
          </div>
        )}

        {LEMBAR.map(l => {
          const u = t.ubah.filter(x => x.lembar === l), b = t.baru.filter(x => x.lembar === l);
          if (!u.length && !b.length) return null;
          return (
            <section key={l} style={kotak}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>{NAMA[l]} <span style={{ fontWeight: 400, color: c.sub, fontSize: 12 }}>· {u.length} baris berubah · {b.length} baris baru{!boleh[l] ? ' · izin Anda di bagian ini hanya melihat' : ''}</span></div>
              {u.map(x => <BarisUbah key={kunciUbah(x)} c={c} u={x} pilih={ubah[kunciUbah(x)] ?? {}} boleh={!!boleh[l]} onSel={(k, v) => setSel(x, k, v)} />)}
              {b.map(x => <BarisBaru key={kunciBaru(x)} c={c} b={x} judul={p.peta[l]?.judulPrima ?? {}} dipilih={baru.has(kunciBaru(x))} boleh={!!boleh[l]}
                onPilih={v => setBaru(prev => { const s = new Set(prev); if (v) s.add(kunciBaru(x)); else s.delete(kunciBaru(x)); return s; })} />)}
            </section>
          );
        })}

        {p.barangBaru.length > 0 && (
          <section style={kotak}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Barang yang belum ada di Master Barang</div>
            <div style={{ fontSize: 12, color: c.sub, marginBottom: 6 }}>Baris yang memakainya tetap tanpa barang (dan belum bisa didanai) kalau tidak dipetakan atau dibuat.</div>
            {p.barangBaru.map(x => {
              const k = kunciNamaBarang(x.nama);
              const pakai = barangPeta[k];
              return (
                <div key={x.nama} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5, padding: '4px 0', borderTop: `1px solid ${c.border}` }}>
                  <b style={{ flex: '1 1 160px' }}>“{x.nama}”</b>
                  {x.mirip && (
                    <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                      <input type="checkbox" checked={pakai === x.mirip} onChange={e => { setBarangPeta(m => { const n = { ...m }; if (e.target.checked) n[k] = x.mirip!; else delete n[k]; return n; }); if (e.target.checked) setBarangBaru(s => { const n = new Set(s); n.delete(x.nama); return n; }); }} />
                      maksudnya <b>{x.mirip}</b>?
                    </label>
                  )}
                  <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                    <input type="checkbox" checked={barangBaru.has(x.nama)} onChange={e => { setBarangBaru(s => { const n = new Set(s); if (e.target.checked) n.add(x.nama); else n.delete(x.nama); return n; }); if (e.target.checked) setBarangPeta(m => { const n = { ...m }; delete n[k]; return n; }); }} />
                    buat barang baru di Master
                  </label>
                </div>
              );
            })}
          </section>
        )}

        {t.catatan.length > 0 && (
          <section style={kotak}>
            <button type="button" onClick={() => setCatatanBuka(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: c.text, cursor: 'pointer', fontWeight: 700, fontSize: 13, padding: 0 }}>
              {catatanBuka ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Keterangan & yang tidak dibawa balik ({t.catatan.length})
            </button>
            {catatanBuka && t.catatan.map((x, i) => <div key={i} style={{ fontSize: 12, padding: '4px 0', borderTop: `1px solid ${c.border}`, color: c.sub }}><b style={{ color: c.text }}>{NAMA[x.lembar]}</b> · {x.teks}</div>)}
          </section>
        )}
        {!t.ubah.length && !t.baru.length && <div style={{ fontSize: 13, color: c.sub }}>Tidak ada perubahan yang bisa dibawa balik. Abaikan supaya salinan otomatis berlanjut.</div>}
      </>)}
    </Bingkai>
  );
}

function BarisUbah({ c, u, pilih, boleh, onSel }: { c: WarnaBba; u: UsulUbah; pilih: Record<string, 'drive' | 'prima'>; boleh: boolean; onSel: (k: string, v: 'drive' | 'prima' | null) => void }) {
  return (
    <div style={{ borderTop: `1px solid ${c.border}`, padding: '6px 0' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>{u.label}</div>
      {u.sel.map(s => (
        <div key={s.kunci} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, padding: '2px 0 2px 12px' }}>
          {s.jenis === 'benturan' ? (
            <>
              <b style={{ color: MERAH, minWidth: 90 }}>{s.judul}</b>
              <span style={{ color: c.sub }}>asal {tampil(s.kunci, s.asal)}</span>
              {(['drive', 'prima'] as const).map(v => (
                <label key={v} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', border: `1px solid ${pilih[s.kunci] === v ? (v === 'drive' ? KUNING : HIJAU) : c.border}`, borderRadius: 6, padding: '2px 7px', cursor: boleh ? 'pointer' : 'default' }}>
                  <input type="radio" disabled={!boleh} checked={pilih[s.kunci] === v} onChange={() => onSel(s.kunci, v)} />
                  {v === 'drive' ? 'Drive' : 'PRIMA'}: <b style={{ fontFamily: MONO }}>{tampil(s.kunci, v === 'drive' ? s.drive : s.prima)}</b>
                </label>
              ))}
            </>
          ) : (
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: boleh ? 'pointer' : 'default' }}>
              <input type="checkbox" disabled={!boleh} checked={pilih[s.kunci] === 'drive'} onChange={e => onSel(s.kunci, e.target.checked ? 'drive' : null)} />
              <b style={{ minWidth: 90 }}>{s.judul}</b>
              <span style={{ fontFamily: MONO }}>{tampil(s.kunci, s.jenis === 'tanpa-asal' ? s.prima : s.asal)} → {tampil(s.kunci, s.drive)}</span>
              {s.jenis === 'tanpa-asal' && <span style={{ color: KUNING }}>(tanpa salinan asal — periksa sendiri)</span>}
            </label>
          )}
        </div>
      ))}
    </div>
  );
}

const RINGKAS_BARU: Record<LembarBalik, string[]> = {
  rencana: ['barang', 'jenis', 'sumber', 'vol', 'satuan', 'harga', 'keputusan'], pengadaan: [],
  penerimaan: ['harga', 'merk', 'penyedia'], penawaran: ['nomor', 'tgl_surat', 'barang', 'merk', 'satuan', 'harga'],
};
function BarisBaru({ c, b, judul, dipilih, boleh, onPilih }: { c: WarnaBba; b: UsulBaru; judul: Record<string, string>; dipilih: boolean; boleh: boolean; onPilih: (v: boolean) => void }) {
  const ket = RINGKAS_BARU[b.lembar].filter(k => b.nilai[k] !== null && b.nilai[k] !== undefined).map(k => `${judul[k] ?? k} ${tampil(k, b.nilai[k])}`).join(' · ');
  return (
    <div style={{ borderTop: `1px solid ${c.border}`, padding: '6px 0', fontSize: 12.5, opacity: b.tolak ? 0.6 : 1 }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', cursor: boleh && !b.tolak ? 'pointer' : 'default' }}>
        <input type="checkbox" disabled={!boleh || !!b.tolak} checked={dipilih} onChange={e => onPilih(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <b>Baris baru {b.baris}:</b> {b.label}{ket ? <span style={{ color: c.sub }}> · {ket}</span> : null}
          {b.tolak && <div style={{ color: MERAH, fontSize: 12 }}>Tidak bisa ditambahkan: {b.tolak}.</div>}
          {b.kembar && !b.tolak && <div style={{ color: KUNING, fontSize: 12 }}>Mungkin kembar dengan {b.kembar} — tidak dicentang. Centang kalau memang catatan berbeda.</div>}
        </span>
      </label>
    </div>
  );
}

function PemetaanKolom({ c, p, koreksi, pilihCss, kotak, sibuk, onUbah, onBacaUlang }: {
  c: WarnaBba; p: Pratinjau; koreksi: Partial<Record<LembarBalik, PetaLembar>>; pilihCss: React.CSSProperties; kotak: React.CSSProperties; sibuk: boolean;
  onUbah: (k: Partial<Record<LembarBalik, PetaLembar>>) => void; onBacaUlang: () => void;
}) {
  const ada = LEMBAR.filter(l => { const m = p.peta[l]; return m && (m.asing.length || m.ragu.length); });
  if (!ada.length && !Object.keys(koreksi).length) return null;
  return (
    <section style={kotak}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Pemetaan kolom</div>
      <div style={{ fontSize: 12, color: c.sub, marginBottom: 6 }}>Kolom yang judulnya tidak dikenali atau mirip lebih dari satu kolom PRIMA. Yang dibiarkan &quot;tidak dibaca&quot; diabaikan dan hilang saat berkas dikirim ulang.</div>
      {ada.map(l => {
        const m = p.peta[l]!;
        const pilihan = Object.keys(m.peta).filter(k => k !== 'no');
        const kolom = [...m.asing.map(a => ({ ...a, calon: [] as string[] })), ...m.ragu.map(r => ({ ...r, contoh: [] as string[] }))];
        return (
          <div key={l} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{NAMA[l]}</div>
            {kolom.map(k => {
              const nilai = Object.entries(koreksi[l] ?? {}).find(([, i]) => i === k.indeks)?.[0] ?? '';
              return (
                <div key={k.indeks} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, padding: '2px 0 2px 12px' }}>
                  <span style={{ minWidth: 160 }}>“{k.judul}”{k.contoh.length ? <span style={{ color: c.sub }}> mis. {k.contoh.join(', ')}</span> : null}{k.calon.length ? <span style={{ color: KUNING }}> (mirip {k.calon.length} kolom)</span> : null}</span>
                  <select style={pilihCss} value={nilai} aria-label={`Kolom PRIMA untuk ${k.judul}`}
                    onChange={e => {
                      const lama = Object.fromEntries(Object.entries(koreksi[l] ?? {}).filter(([, i]) => i !== k.indeks));
                      onUbah({ ...koreksi, [l]: e.target.value ? { ...lama, [e.target.value]: k.indeks } : lama });
                    }}>
                    <option value="">tidak dibaca (tidak ada di PRIMA)</option>
                    {pilihan.map(x => <option key={x} value={x}>{m.judulPrima[x] ?? x}{m.peta[x] !== null ? ` (sekarang dari “${m.judulBerkas[m.peta[x]!]}”)` : ''}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        );
      })}
      {Object.keys(koreksi).length > 0 && <PrimaButton variant="ghost" size="sm" disabled={sibuk} onClick={onBacaUlang}>Baca ulang dengan pemetaan ini</PrimaButton>}
    </section>
  );
}
