'use client';

// Penggaris blok narasi — konsep `docs/CONCEPT-lkjip-penggaris-narasi.md`. Seperti Word: menampilkan indent
// PARAGRAF yang kursornya di situ (bukan setelan dokumen), empat penanda bisa diseret, dan selama diseret
// hanya garis panduan yang bergerak — teks berubah saat dilepas, jadi satu seret = satu langkah Undo.
// Bidang tulis A4 dalam skala Word: posisi penanda = persentase lebar kolom, sama dengan yang dipakai teks.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Eye, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import {
  CM_TULIS, LEBAR_DXA, PX_TULIS, TWIPS_PER_CM, LANGKAH_DXA, LANGKAH_BESAR_DXA, BUTIR_GANTUNG_DXA,
  bidangBerubah, cmTeks, geserPenanda, posisiPenanda, ringkasInden,
  type Inden, type JenisInden, type Penanda,
} from '@/lib/lkjip/halaman';

const KUNCI_SEMBUNYI = 'lk.penggaris.narasi';
const PERISTIWA_SEMBUNYI = 'lk-penggaris-sembunyi';

// Selera tampilan, bukan isi dokumen — diingat per peramban, berlaku untuk SEMUA blok di halaman.
const bacaSembunyi = () => { try { return localStorage.getItem(KUNCI_SEMBUNYI) === '1'; } catch { return false; } };
const langgananSembunyi = (ubah: () => void) => {
  window.addEventListener('storage', ubah);
  window.addEventListener(PERISTIWA_SEMBUNYI, ubah);
  return () => { window.removeEventListener('storage', ubah); window.removeEventListener(PERISTIWA_SEMBUNYI, ubah); };
};
const aturSembunyi = (v: boolean) => {
  try { localStorage.setItem(KUNCI_SEMBUNYI, v ? '1' : '0'); } catch { /* mode privat */ }
  window.dispatchEvent(new Event(PERISTIWA_SEMBUNYI));
};

const NAMA_PENANDA: Record<Penanda, string> = {
  pertama: 'Indent baris pertama',
  gantung: 'Indent gantung',
  kiri: 'Indent kiri',
  kanan: 'Indent kanan',
};
const persen = (dxa: number) => `${(dxa / LEBAR_DXA) * 100}%`;
const angkaCm = (dxa: number) => Math.round((dxa / TWIPS_PER_CM) * 100) / 100;
const dxaDariCm = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * TWIPS_PER_CM) : 0; };

interface Props {
  /** Indent paragraf di kursor (paragraf pertama bila yang dipilih beberapa). */
  inden: Inden;
  jenis: JenisInden;
  /** Paragraf terpilih berbeda-beda: penanda kelabu, menggesernya menyamakan bidang itu. */
  campur?: boolean;
  /** Ada paragraf terpilih yang punya isian sendiri → tombol "Ikuti bawaan" hidup. */
  punyaIsian?: boolean;
  /** Tinggi kotak teks, untuk panjang garis panduan saat menyeret. */
  tinggiTeks: () => number;
  onUbah: (ubah: Partial<Inden>) => void;
  onBawaan: () => void;
}

export default function PenggarisNarasi({ inden, jenis, campur = false, punyaIsian = false, tinggiTeks, onUbah, onBawaan }: Props) {
  const sembunyi = useSyncExternalStore(langgananSembunyi, bacaSembunyi, () => false);
  const [seret, setSeret] = useState<{ penanda: Penanda; tinggi: number; draf: Inden } | null>(null);
  const [panel, setPanel] = useState(false);
  const [skala, setSkala] = useState(1);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Hanya lencana skala yang butuh ukuran nyata; posisi penanda persentase, jadi tak bisa meleset.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const w = el.getBoundingClientRect().width; if (w > 0) setSkala(w / PX_TULIS); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sembunyi]);

  if (sembunyi) {
    return (
      <div className="lk-pg-sembunyi">
        <style>{PG_CSS}</style>
        <button type="button" className="lk-pg-tombol" onClick={() => aturSembunyi(false)} aria-label="Tampilkan penggaris">
          <Eye size={12} /> Penggaris
        </button>
      </div>
    );
  }

  const xDari = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    return r && r.width ? ((clientX - r.left) / r.width) * LEBAR_DXA : 0;
  };
  const mulaiSeret = (p: Penanda) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSeret({ penanda: p, tinggi: tinggiTeks(), draf: geserPenanda(inden, p, xDari(e.clientX), jenis) });
  };
  const gerakSeret = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (seret) setSeret({ ...seret, draf: geserPenanda(inden, seret.penanda, xDari(e.clientX), jenis) });
  };
  const lepasSeret = () => {
    if (!seret) return;
    const ubah = bidangBerubah(inden, seret.draf);
    setSeret(null);
    if (Object.keys(ubah).length) onUbah(ubah);
  };
  const tekanTombol = (p: Penanda) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape' && seret) { setSeret(null); return; }
    const arah = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!arah) return;
    e.preventDefault();
    const baru = geserPenanda(inden, p, posisiPenanda(inden, p) + arah * (e.shiftKey ? LANGKAH_BESAR_DXA : LANGKAH_DXA), jenis);
    const ubah = bidangBerubah(inden, baru);
    if (Object.keys(ubah).length) onUbah(ubah);
  };

  const tampil = seret?.draf ?? inden;
  const jumlahCm = Math.floor(CM_TULIS);
  // Di kartu sempit angka tiap 1 cm berdesakan — cukup tiap 5 cm.
  const jarakAngka = skala < 0.75 ? 5 : 1;
  const garis: number[] = [];
  for (let i = 0; i <= jumlahCm * 2 + 1; i++) if (i * 0.5 <= CM_TULIS) garis.push(i * 0.5);
  const penanda = (p: Penanda, kelas: string) => (
    <span key={p} className={`lk-pg-p ${kelas}`} style={{ left: persen(posisiPenanda(tampil, p)) }}
      role="slider" tabIndex={0} aria-label={NAMA_PENANDA[p]} aria-orientation="horizontal"
      aria-valuemin={0} aria-valuemax={angkaCm(LEBAR_DXA)} aria-valuenow={angkaCm(posisiPenanda(tampil, p))}
      aria-valuetext={`${cmTeks(posisiPenanda(tampil, p))} cm`}
      data-tooltip={NAMA_PENANDA[p]} data-tooltip-pos="below"
      onMouseDown={e => e.preventDefault()} onPointerDown={mulaiSeret(p)} onPointerMove={gerakSeret}
      onPointerUp={lepasSeret} onPointerCancel={() => setSeret(null)} onKeyDown={tekanTombol(p)}>
      <span className="lk-pg-bentuk" aria-hidden="true" />
    </span>
  );

  // Isian angka: butir daftar selalu gantung, nomornya memang di kiri teks.
  const khusus = tampil.pertama > 0 ? 'pertama' : tampil.pertama < 0 ? 'gantung' : 'tanpa';
  const ubahKhusus = (nilai: string, besar: number) => {
    if (nilai === 'tanpa') onUbah({ pertama: 0 });
    else if (nilai === 'pertama') onUbah({ pertama: besar || 720 });
    // Seperti dialog Paragraf Word: gantung mendorong kiri, supaya baris pertama tidak keluar margin.
    else { const b = besar || BUTIR_GANTUNG_DXA; onUbah({ kiri: Math.max(tampil.kiri, b), pertama: -b }); }
  };

  return (
    <div className={`lk-pg${campur ? ' campur' : ''}`}>
      <style>{PG_CSS}</style>
      <div className="lk-pg-kepala">
        <span className="lk-pg-baca" aria-live="polite">
          {campur ? 'Paragraf terpilih berbeda-beda — geser penanda untuk menyamakan' : ringkasInden(tampil)}
        </span>
        {skala < 0.99 && (
          <span className="lk-pg-skala" data-tooltip="Kartu ini lebih sempit dari 15,5 cm — angka cm tetap benar, ukuran di layar diperkecil" data-tooltip-pos="below">
            {Math.round(skala * 100)}%
          </span>
        )}
        <span className="lk-pg-aksi">
          <button type="button" className={`lk-pg-tombol${panel ? ' on' : ''}`} aria-expanded={panel} onMouseDown={e => e.preventDefault()} onClick={() => setPanel(v => !v)}>
            <SlidersHorizontal size={12} /> Angka
          </button>
          <button type="button" className="lk-pg-tombol" disabled={!punyaIsian} onMouseDown={e => e.preventDefault()} onClick={onBawaan}
            data-tooltip="Hapus indent khusus paragraf ini, kembali ke setelan dokumen" data-tooltip-pos="below">
            <RotateCcw size={12} /> Bawaan
          </button>
          <button type="button" className="lk-pg-tombol" onMouseDown={e => e.preventDefault()} onClick={() => aturSembunyi(true)} aria-label="Sembunyikan penggaris"
            data-tooltip="Sembunyikan penggaris" data-tooltip-pos="below">
            <EyeOff size={12} />
          </button>
        </span>
      </div>
      <div className="lk-pg-track" ref={trackRef}>
        <span className="lk-pg-pita" aria-hidden="true" />
        <span className="lk-pg-tepi" style={{ left: 0, width: persen(tampil.kiri) }} aria-hidden="true" />
        <span className="lk-pg-tepi" style={{ right: 0, width: persen(tampil.kanan) }} aria-hidden="true" />
        {garis.map(cm => (
          <span key={cm} className={`lk-pg-garis${Number.isInteger(cm) ? ' besar' : ''}`} style={{ left: `${(cm / CM_TULIS) * 100}%` }} aria-hidden="true" />
        ))}
        {garis.filter(cm => Number.isInteger(cm) && cm % jarakAngka === 0).map(cm => (
          <span key={cm} className="lk-pg-angka" style={{ left: `${(cm / CM_TULIS) * 100}%` }} aria-hidden="true">{cm}</span>
        ))}
        {penanda('pertama', 'lk-pg-p-pertama')}
        {penanda('gantung', 'lk-pg-p-gantung')}
        {penanda('kiri', 'lk-pg-p-kiri')}
        {penanda('kanan', 'lk-pg-p-kanan')}
        {seret && <span className="lk-pg-panduan" style={{ left: persen(posisiPenanda(seret.draf, seret.penanda)), height: seret.tinggi }} aria-hidden="true" />}
      </div>
      {panel && (
        <div className="lk-pg-panel">
          <label>Kiri (cm)
            <PrimaNumberField size="sm" desimal={2} min={0} step={0.05} value={angkaCm(tampil.kiri)} onChange={e => onUbah({ kiri: dxaDariCm(e.target.value) })} />
          </label>
          <label>Kanan (cm)
            <PrimaNumberField size="sm" desimal={2} min={0} step={0.05} value={angkaCm(tampil.kanan)} onChange={e => onUbah({ kanan: dxaDariCm(e.target.value) })} />
          </label>
          <label>Khusus
            <select value={khusus} disabled={jenis === 'butir'} onChange={e => ubahKhusus(e.target.value, Math.abs(tampil.pertama))}>
              <option value="tanpa">Tanpa</option>
              <option value="pertama">Baris pertama</option>
              <option value="gantung">Gantung</option>
            </select>
          </label>
          <label>Sebesar (cm)
            <PrimaNumberField size="sm" desimal={2} min={0} step={0.05} disabled={khusus === 'tanpa'} value={angkaCm(Math.abs(tampil.pertama))}
              onChange={e => ubahKhusus(khusus, dxaDariCm(e.target.value))} />
          </label>
        </div>
      )}
    </div>
  );
}

const PG_CSS = `
  /* padding 14px + border 1px = tepi kiri teks ProseMirror: angka 0 tepat di huruf pertama. */
  .lk-pg { border: 1px solid #0C447C; border-bottom: none; background: #020F1C; padding: 3px 14px 2px; position: relative; }
  .lk-pg-kepala { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 18px; margin-bottom: 2px; }
  .lk-pg-baca { font-size: 10.5px; color: #B5D4F4; font-variant-numeric: tabular-nums; }
  .lk-pg.campur .lk-pg-baca { color: #85B7EB; font-style: italic; }
  .lk-pg-skala { font-size: 9.5px; font-weight: 700; color: #B5D4F4; background: rgba(124,92,252,0.18); border-radius: 4px; padding: 0 4px; }
  .lk-pg-aksi { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; }
  .lk-pg-tombol { background: none; border: none; color: #85B7EB; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; font-size: 10.5px; padding: 1px 4px; border-radius: 4px; }
  .lk-pg-tombol:hover:not(:disabled) { color: #E6F1FB; background: rgba(255,255,255,.08); }
  .lk-pg-tombol.on { color: #C9BCFF; background: rgba(124,92,252,0.22); }
  .lk-pg-tombol:disabled { opacity: .4; cursor: default; }
  .lk-pg-sembunyi { border: 1px solid #0C447C; border-bottom: none; padding: 2px 14px; display: flex; justify-content: flex-end; background: #020F1C; }
  /* Baris: ▽ baris pertama (0–9) · pita skala (9–23) · △ gantung & kanan (23–32) · ▭ kiri (32–38). */
  .lk-pg-track { position: relative; height: 38px; width: min(${PX_TULIS}px, 100%); }
  .lk-pg-pita { position: absolute; left: 0; right: 0; top: 9px; height: 14px; background: rgba(181,212,244,.12); border-radius: 2px; }
  .lk-pg-tepi { position: absolute; top: 9px; height: 14px; background: rgba(2,15,28,.55); pointer-events: none; }
  .lk-pg-garis { position: absolute; top: 19px; width: 1px; height: 4px; background: rgba(181,212,244,.45); pointer-events: none; }
  .lk-pg-garis.besar { top: 17px; height: 6px; background: rgba(181,212,244,.8); }
  .lk-pg-angka { position: absolute; top: 8px; transform: translateX(-50%); font-size: 8.5px; line-height: 10px; color: #85B7EB; pointer-events: none; user-select: none; }
  /* Sasaran sentuh 18px; yang terlihat elemen anak — ::before & ::after sudah milik tooltip global. */
  .lk-pg-track .lk-pg-p { position: absolute; width: 18px; margin-left: -9px; cursor: ew-resize; touch-action: none; outline: none; z-index: 2; }
  .lk-pg-bentuk { position: absolute; left: 3.5px; top: 0; width: 11px; height: 100%; background: #7C5CFC; pointer-events: none; }
  .lk-pg-p:hover .lk-pg-bentuk { background: #C9BCFF; }
  .lk-pg-p:focus-visible .lk-pg-bentuk { outline: 2px solid #C9BCFF; outline-offset: 1px; }
  .lk-pg.campur .lk-pg-bentuk { background: #5E8BBE; }
  .lk-pg-track .lk-pg-p-pertama { top: 0; height: 9px; }
  .lk-pg-p-pertama .lk-pg-bentuk { clip-path: polygon(0 0, 100% 0, 50% 100%); }
  .lk-pg-track .lk-pg-p-gantung, .lk-pg-track .lk-pg-p-kanan { top: 23px; height: 9px; }
  .lk-pg-p-gantung .lk-pg-bentuk, .lk-pg-p-kanan .lk-pg-bentuk { clip-path: polygon(50% 0, 100% 100%, 0 100%); }
  .lk-pg-track .lk-pg-p-kiri { top: 32px; height: 6px; }
  .lk-pg-p-kiri .lk-pg-bentuk { border-radius: 1px; }
  .lk-pg-panduan { position: absolute; top: 100%; width: 0; border-left: 1px dashed #7C5CFC; pointer-events: none; z-index: 3; }
  .lk-pg-panel { display: flex; flex-wrap: wrap; gap: 6px 10px; padding: 5px 0 4px; border-top: 1px dashed #0C447C; margin-top: 3px; }
  .lk-pg-panel label { display: flex; flex-direction: column; gap: 2px; font-size: 10.5px; color: #B5D4F4; width: 96px; }
  .lk-pg-panel select { height: 28px; background: #020F1C; color: #B5D4F4; border: 1px solid #0C447C; border-radius: 6px; font-size: 11.5px; padding: 0 4px; }
  .lk-pg-panel select option { background: #020F1C; color: #E6F1FB; }
  [data-theme="light"] .lk-pg, [data-theme="light"] .lk-pg-sembunyi { background: #F9FAFB; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-pg-baca, [data-theme="light"] .lk-pg-panel label { color: #374151; }
  [data-theme="light"] .lk-pg.campur .lk-pg-baca { color: #6B7280; }
  [data-theme="light"] .lk-pg-skala { color: #1E5FA5; background: rgba(124,92,252,0.12); }
  [data-theme="light"] .lk-pg-tombol { color: #4B5563; }
  [data-theme="light"] .lk-pg-tombol:hover:not(:disabled) { color: #111827; background: rgba(0,0,0,.06); }
  [data-theme="light"] .lk-pg-tombol.on { color: #1E5FA5; background: rgba(124,92,252,0.12); }
  [data-theme="light"] .lk-pg-pita { background: #FFFFFF; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
  [data-theme="light"] .lk-pg-tepi { background: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-pg-garis { background: rgba(0,0,0,.25); }
  [data-theme="light"] .lk-pg-garis.besar { background: rgba(0,0,0,.45); }
  [data-theme="light"] .lk-pg-angka { color: #4B5563; }
  [data-theme="light"] .lk-pg-p:hover .lk-pg-bentuk { background: #5E8BBE; }
  [data-theme="light"] .lk-pg-panel { border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-pg-panel select { background: #FFFFFF; color: #374151; border-color: rgba(0,0,0,.12); }
  [data-theme="light"] .lk-pg-panel select option { background: #FFFFFF; color: #374151; }
`;
