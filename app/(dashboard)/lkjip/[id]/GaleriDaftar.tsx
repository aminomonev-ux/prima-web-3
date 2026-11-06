'use client';

// Galeri format daftar — satu komponen untuk popover bilah alat dan sub-menu klik kanan. Konsep `docs/CONCEPT-lkjip-daftar-word.md`.
// Aksi di onMouseDown: fokus & pilihan teks harus tetap di editor, dan menu klik kanan menutup diri saat mouse ditekan di luar kotaknya.

import { Ban } from 'lucide-react';
import { SUSUNAN, URUTAN_SUSUNAN, GAYA_BULLET, teksNomor, type KodeBullet, type KodeGaya, type KodeNomor, type KodeSusunan } from '@/lib/lkjip/gaya-daftar';
import { MODE_HURUF, STABILO, type KodeStabilo, type ModeHuruf } from '@/lib/lkjip/format-teks';

const GALERI_NOMOR: readonly KodeNomor[] = ['1.', '1)', '(1)', 'a.', 'a)', '(a)', 'A.', 'I.', 'i.'];
const NAMA_SUSUNAN: Record<KodeSusunan, string> = {
  naskah: 'Naskah dinas: 1. a. 1) a) (1) (a)',
  word: 'Bawaan Word: 1. a. i.',
  desimal: 'Desimal: 1. 1.1. 1.1.1.',
  romawi: 'Romawi: I. A. 1. a.',
  kurung: 'Kurung: 1) a) i)',
  bullet: 'Bullet: • ○ ▪',
};

const tekan = (aksi: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); aksi(); };

function TanpaTile({ onTanpa, label }: { onTanpa: () => void; label: string }) {
  return (
    <button type="button" className="lk-gl-tile lk-gl-tanpa" aria-label={label} data-tooltip={label} data-tooltip-pos="below" onMouseDown={tekan(onTanpa)}>
      <Ban size={16} />
    </button>
  );
}

export function GaleriBullet({ aktif, onPilih, onTanpa }: { aktif: KodeGaya | null; onPilih: (k: KodeBullet) => void; onTanpa?: () => void }) {
  return (
    <div className="lk-gl lk-gl-4" role="group" aria-label="Pilih bullet">
      {onTanpa && <TanpaTile onTanpa={onTanpa} label="Tanpa bullet" />}
      {GAYA_BULLET.map(k => (
        <button key={k} type="button" className={`lk-gl-tile lk-gl-simbol${aktif === k ? ' on' : ''}`} aria-pressed={aktif === k} aria-label={`Bullet ${k}`} onMouseDown={tekan(() => onPilih(k))}>
          {k}
        </button>
      ))}
    </div>
  );
}

export function GaleriNomor({ aktif, onPilih, onTanpa }: { aktif: KodeGaya | null; onPilih: (k: KodeNomor) => void; onTanpa?: () => void }) {
  return (
    <div className="lk-gl" role="group" aria-label="Pilih penomoran">
      {onTanpa && <TanpaTile onTanpa={onTanpa} label="Tanpa nomor" />}
      {GALERI_NOMOR.map(k => (
        <button key={k} type="button" className={`lk-gl-tile${aktif === k ? ' on' : ''}`} aria-pressed={aktif === k} aria-label={`Penomoran ${teksNomor(k, 1)} ${teksNomor(k, 2)} ${teksNomor(k, 3)}`} onMouseDown={tekan(() => onPilih(k))}>
          {[1, 2, 3].map(n => <span key={n} className="lk-gl-baris">{teksNomor(k, n)}<i /></span>)}
        </button>
      ))}
    </div>
  );
}

export function GaleriTingkat({ aktif, onPilih }: { aktif: KodeSusunan | null; onPilih: (k: KodeSusunan) => void }) {
  return (
    <div className="lk-gl" role="group" aria-label="Pilih daftar bertingkat">
      {URUTAN_SUSUNAN.map(k => {
        const s = SUSUNAN[k];
        return (
          <button key={k} type="button" className={`lk-gl-tile${aktif === k ? ' on' : ''}`} aria-pressed={aktif === k} aria-label={NAMA_SUSUNAN[k]} data-tooltip={NAMA_SUSUNAN[k]} data-tooltip-pos="below" onMouseDown={tekan(() => onPilih(k))}>
            <span className="lk-gl-baris">{teksNomor(s[0], 1)}<i /></span>
            <span className="lk-gl-baris lk-gl-t2">{teksNomor(s[1], 1, [1])}<i /></span>
            <span className="lk-gl-baris lk-gl-t3">{teksNomor(s[2], 1, [1, 1])}<i /></span>
          </button>
        );
      })}
    </div>
  );
}

export function PilihanHuruf({ onPilih }: { onPilih: (m: ModeHuruf) => void }) {
  return (
    <div className="lk-gl-daftar" role="group" aria-label="Ubah huruf">
      {MODE_HURUF.map(m => <button key={m.kode} type="button" className="lk-gl-opsi" onMouseDown={tekan(() => onPilih(m.kode))}>{m.label}</button>)}
    </div>
  );
}

export function PilihanStabilo({ aktif, onPilih, onTanpa }: { aktif: KodeStabilo | null; onPilih: (k: KodeStabilo) => void; onTanpa: () => void }) {
  return (
    <div className="lk-gl-warna" role="group" aria-label="Warna stabilo">
      {(Object.keys(STABILO) as KodeStabilo[]).map(k => (
        <button key={k} type="button" className={`lk-gl-swatch${aktif === k ? ' on' : ''}`} aria-pressed={aktif === k} aria-label={STABILO[k].label} data-tooltip={STABILO[k].label} data-tooltip-pos="below"
          style={{ background: STABILO[k].css }} onMouseDown={tekan(() => onPilih(k))} />
      ))}
      <TanpaTile onTanpa={onTanpa} label="Tanpa stabilo" />
    </div>
  );
}

export const GALERI_CSS = `
  .lk-gl { display: grid; grid-template-columns: repeat(3, 72px); gap: 6px; }
  .lk-gl-4 { grid-template-columns: repeat(4, 44px); }
  .lk-gl-tile { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-height: 58px; padding: 5px 7px; background: #020F1C; border: 1px solid #0C447C; border-radius: 6px; color: #D6E6F7; cursor: pointer; font-size: 11px; line-height: 1.25; text-align: left; font-family: Arial, sans-serif; }
  .lk-gl-tile:hover { border-color: #7C5CFC; background: rgba(124,92,252,0.20); color: #fff; }
  .lk-gl-tile.on { border-color: #7C5CFC; background: rgba(124,92,252,0.22); color: #C9BCFF; }
  .lk-gl-simbol { align-items: center; min-height: 40px; font-size: 16px; }
  .lk-gl-tanpa { align-items: center; color: #85B7EB; min-height: 40px; }
  .lk-gl-baris { display: flex; align-items: center; gap: 4px; white-space: nowrap; }
  .lk-gl-baris i { flex: 1; height: 1px; min-width: 8px; background: currentColor; opacity: .45; }
  .lk-gl-t2 { padding-left: 7px; }
  .lk-gl-t3 { padding-left: 14px; }
  .lk-gl-daftar { display: flex; flex-direction: column; gap: 1px; min-width: 180px; }
  .lk-gl-opsi { background: none; border: none; color: #D6E6F7; cursor: pointer; font-size: 12.5px; text-align: left; padding: 7px 10px; border-radius: 6px; }
  .lk-gl-opsi:hover { background: rgba(124,92,252,0.20); color: #fff; }
  .lk-gl-warna { display: flex; align-items: center; gap: 6px; }
  .lk-gl-swatch { width: 26px; height: 26px; border: 1px solid #0C447C; border-radius: 5px; cursor: pointer; padding: 0; }
  .lk-gl-swatch.on { outline: 2px solid #7C5CFC; outline-offset: 1px; }
  .lk-gl-warna .lk-gl-tanpa { width: 26px; height: 26px; min-height: 0; padding: 0; justify-content: center; }
  [data-theme="light"] .lk-gl-tile { background: #FFFFFF; border-color: rgba(0,0,0,.12); color: #374151; }
  [data-theme="light"] .lk-gl-tile:hover { background: rgba(124,92,252,0.12); color: #111827; border-color: #7C5CFC; }
  [data-theme="light"] .lk-gl-tile.on { background: rgba(124,92,252,0.12); color: #1E5FA5; border-color: #7C5CFC; }
  [data-theme="light"] .lk-gl-tanpa { color: #6B7280; }
  [data-theme="light"] .lk-gl-opsi { color: #374151; }
  [data-theme="light"] .lk-gl-opsi:hover { background: rgba(124,92,252,0.12); color: #111827; }
  [data-theme="light"] .lk-gl-swatch { border-color: rgba(0,0,0,.2); }
`;
