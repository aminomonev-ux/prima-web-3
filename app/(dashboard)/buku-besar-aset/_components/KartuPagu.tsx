'use client';
// Kartu pagu di atas lembar keputusan anggaran (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §4). Pagu diambil dari
// DPA/Pergeseran BLUD (total belanja modal) atau diketik; pilihan sumber & angka ketikan diingat per peramban —
// pagu ini alat bantu memutuskan, bukan data anggaran, jadi tidak disimpan ke server. Melebihi pagu = PERINGATAN.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { InputNominal } from '@/components/ui/input-nominal';
import { fetchJson } from '@/lib/shared/api';
import {
  hitungKartuPagu, paguBisaDariBlud, SUMBER_PAGU, LABEL_SUMBER_PAGU, SUMBER_DANA_PAGU,
  type SumberPaguBba, type SumberDanaPagu,
} from '@/lib/bba/pagu';
import type { Anggaran } from '@/lib/bba/rencana';
import type { BbaRow } from '@/lib/data/buku-besar-aset';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const fmtRp = (n: number) => (n < 0 ? '−Rp ' : 'Rp ') + Math.round(Math.abs(n)).toLocaleString('id-ID');
type Warna = { card: string; text: string; sub: string; border: string; input: string };
type Ingat = { sumber: SumberPaguBba; dana: SumberDanaPagu; ketik: number | null };
type JawabPagu = { tersedia: true; nilai: number; label: string } | { tersedia: false; alasan: string };

const kunciIngat = (tahun: number) => `prima.bba.pagu.${tahun}`;
const BAWAAN: Ingat = { sumber: 'berlaku', dana: 'BLUD', ketik: null };

function uraiIngat(teks: string | null): Ingat {
  try {
    const x = JSON.parse(teks ?? 'null') as Partial<Ingat> | null;
    if (!x) return BAWAAN;
    return {
      sumber: SUMBER_PAGU.includes(x.sumber as SumberPaguBba) ? x.sumber as SumberPaguBba : 'berlaku',
      dana: SUMBER_DANA_PAGU.includes(x.dana as SumberDanaPagu) ? x.dana as SumberDanaPagu : 'BLUD',
      ketik: typeof x.ketik === 'number' && x.ketik >= 0 ? x.ketik : null,
    };
  } catch { return BAWAAN; }
}
// Teks mentah localStorage sebagai "toko luar" — server & hidrasi pertama memakai bawaan, jadi tidak ada beda isi.
const PERISTIWA = 'prima-bba-pagu';
const dengar = (f: () => void) => { window.addEventListener(PERISTIWA, f); window.addEventListener('storage', f); return () => { window.removeEventListener(PERISTIWA, f); window.removeEventListener('storage', f); }; };
const bacaTeks = (tahun: number) => () => { try { return localStorage.getItem(kunciIngat(tahun)); } catch { return null; } };
function simpanIngat(tahun: number, x: Ingat) {
  try { localStorage.setItem(kunciIngat(tahun), JSON.stringify(x)); } catch { /* peramban menolak penyimpanan — tetap jalan tanpa diingat */ }
  window.dispatchEvent(new Event(PERISTIWA));
}

/**
 * `tersaring` = daftar yang dimuat bukan seluruh rencana tahun itu (saringan sumber/asal/jenis/cari, atau terpotong batas
 * muat). "Sudah didanai" dihitung dari baris yang dimuat, jadi saat itu angkanya kurang dan sisa pagu tampil lebih longgar.
 */
export default function KartuPagu({ tahun, rows, pilihan, c, tersaring = false }: { tahun: number; rows: readonly BbaRow[]; pilihan: ReadonlyMap<number, Anggaran>; c: Warna; tersaring?: boolean }) {
  const ingat = uraiIngat(useSyncExternalStore(dengar, bacaTeks(tahun), () => null));
  const [jawab, setJawab] = useState<{ kunci: string; isi: JawabPagu } | null>(null);
  const setIngat = (x: Ingat) => simpanIngat(tahun, x);

  const dariBlud = paguBisaDariBlud(ingat.dana) && ingat.sumber !== 'ketik';
  const kunci = `${tahun}|${ingat.sumber}`;
  useEffect(() => {
    if (!dariBlud) return;
    let batal = false;
    void fetchJson<unknown>(`/api/buku-besar-aset/pagu-blud?tahun=${tahun}&jenis=${ingat.sumber}`).then(d => {
      if (batal) return;
      setJawab({ kunci, isi: d.ok ? d as unknown as JawabPagu : { tersedia: false, alasan: d.message || 'Pagu BLUD tidak bisa dibaca — ketik pagu sendiri.' } });
    });
    return () => { batal = true; };
  }, [dariBlud, kunci, tahun, ingat.sumber]);

  const isiBlud = dariBlud && jawab?.kunci === kunci ? jawab.isi : null;
  const pagu = dariBlud ? (isiBlud?.tersedia ? isiBlud.nilai : null) : ingat.ketik;
  const label = dariBlud ? (isiBlud?.tersedia ? isiBlud.label : null) : 'Diketik, tidak disimpan';
  const h = hitungKartuPagu(pagu, rows.filter(r => r.usulan_keputusan !== 'DITOLAK'), pilihan, ingat.dana);
  const persen = pagu && pagu > 0 ? Math.min(100, (h.terpakai / pagu) * 100) : 0;
  const pakaiKetik = !dariBlud || (isiBlud !== null && !isiBlud.tersedia);

  const pilihCss: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12.5, color: c.text, background: c.input };
  return (
    <section aria-label="Pagu" style={{ background: c.card, border: `1px solid ${h.lewat ? '#E24B4A' : c.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <b style={{ fontSize: 13 }}>Pagu {tahun}</b>
        <select aria-label="Sumber dana yang dibandingkan" value={ingat.dana} style={pilihCss}
          onChange={e => setIngat({ ...ingat, dana: e.target.value as SumberDanaPagu })}>
          {SUMBER_DANA_PAGU.map(d => <option key={d} value={d}>{d === 'SEMUA' ? 'Semua sumber dana' : `Rencana ${d}`}</option>)}
        </select>
        <select aria-label="Sumber pagu" value={paguBisaDariBlud(ingat.dana) ? ingat.sumber : 'ketik'} disabled={!paguBisaDariBlud(ingat.dana)} style={pilihCss}
          onChange={e => setIngat({ ...ingat, sumber: e.target.value as SumberPaguBba })}>
          {SUMBER_PAGU.map(s => <option key={s} value={s}>{LABEL_SUMBER_PAGU[s]}</option>)}
        </select>
        {pakaiKetik && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <InputNominal nullable value={ingat.ketik} onChange={v => setIngat({ ...ingat, ketik: v })} placeholder="ketik pagu" style={{ ...pilihCss, width: 170, fontFamily: MONO, textAlign: 'right' }} />
          </span>
        )}
        <span style={{ flex: 1 }} />
        {pagu !== null && <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{fmtRp(pagu)}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: c.sub, marginTop: 4 }}>
        {dariBlud && isiBlud === null && 'Membaca pagu BLUD…'}
        {isiBlud && !isiBlud.tersedia && <span style={{ color: '#BA7517' }}>{isiBlud.alasan}</span>}
        {label && <span>{label}{dariBlud ? ' · total belanja modal' : ''}</span>}
        {!paguBisaDariBlud(ingat.dana) && ' · pagu BLUD hanya dibandingkan dengan rencana bersumber BLUD'}
      </div>
      {pagu !== null && (<>
        <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(persen)} aria-label="Pagu terpakai"
          style={{ height: 8, borderRadius: 4, background: c.border, overflow: 'hidden', margin: '10px 0 6px' }}>
          <div style={{ width: `${persen}%`, height: '100%', background: h.lewat ? '#E24B4A' : '#1D9E75' }} />
        </div>
        <div style={{ fontSize: 12.5 }}>
          Sudah didanai <b style={{ fontFamily: MONO }}>{fmtRp(h.sudah)}</b>
          {h.pilihanIni !== 0 && <> {h.pilihanIni > 0 ? '+' : '−'} pilihan ini <b style={{ fontFamily: MONO, color: '#EF9F27' }}>{fmtRp(Math.abs(h.pilihanIni))}</b></>}
          {' · '}
          {h.lewat
            ? <b style={{ color: '#E24B4A' }}>melebihi pagu {fmtRp(-(h.sisa ?? 0))}</b>
            : <>sisa pagu <b style={{ fontFamily: MONO }}>{fmtRp(h.sisa ?? 0)}</b></>}
        </div>
        {h.lewat && <div style={{ fontSize: 11.5, color: c.sub, marginTop: 4 }}>Ini peringatan, bukan penolakan — anggaran bisa ditambah lewat DPA Perubahan.</div>}
        {tersaring && <div style={{ fontSize: 11.5, color: '#BA7517', marginTop: 4 }}>Saringan sedang aktif, jadi &quot;sudah didanai&quot; hanya menghitung rencana yang tampil dan sisa pagu terlihat lebih longgar dari kenyataan. Kosongkan saringan untuk membandingkan seluruh rencana {tahun}.</div>}
      </>)}
    </section>
  );
}
