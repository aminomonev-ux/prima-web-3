'use client';
// Pratinjau + isian ukuran gambar LKJIP (konsep ukuran-gambar §6). Blok Gambar & Grafik bersumber gambar.
// Aturan & hitungannya di lib/lkjip/ukuran-gambar.ts, sama dengan yang dipakai Word.
import { useState } from 'react';
import PrimaButton from '@/components/ui/PrimaButton';
import PrimaNumberField from '@/components/ui/PrimaNumberField';
import { tulisDesimal } from '@/lib/shared/desimal';
import {
  EMU_PER_PX, LEBAR_MAKS_CM, LEBAR_MIN_CM, cmDariEmu, emuDariCm, gayaPratinjau, kembalikanProporsi,
  proporsiMenyimpang, ubahLebar, ukuranTampilEmu, type UkuranAlami, type UkuranGambar,
} from '@/lib/lkjip/ukuran-gambar';

const isianDari = (u: UkuranGambar): number | '' => (u.lebarEmu ? cmDariEmu(u.lebarEmu) : '');

export function IsianLebar({ ukuran, onUbah, alami, readOnly, petunjuk }: {
  ukuran: UkuranGambar; onUbah: (u: UkuranGambar) => void; alami: UkuranAlami | null; readOnly: boolean; petunjuk?: string;
}) {
  const [isian, setIsian] = useState<number | ''>(() => isianDari(ukuran));
  const tampil = alami ? ukuranTampilEmu(ukuran, alami) : null;
  return (
    <div className="lk-gbr-isian">
      {!readOnly && (
        <label>Lebar (cm)
          <PrimaNumberField
            size="sm" desimal={2} min={LEBAR_MIN_CM} max={LEBAR_MAKS_CM} step={0.5} placeholder="Otomatis" className="lk-gbr-lebar"
            value={isian}
            onChange={e => {
              const v = e.target.value;
              setIsian(v === '' ? '' : Number(v));
              // Kosong baru berlaku saat keluar: menghapus angka sebelum mengetik yang baru tidak boleh melepas proporsi.
              if (v !== '') onUbah(ubahLebar(ukuran, emuDariCm(Number(v))));
            }}
            onBlur={() => {
              if (isian === '') { if (ukuran.lebarEmu) onUbah(ubahLebar(ukuran, null)); return; }
              setIsian(isianDari(ukuran));
            }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
          />
        </label>
      )}
      {tampil
        ? <span>Di Word: <b className="lk-gbr-angka">{tulisDesimal(cmDariEmu(tampil.wEmu))} × {tulisDesimal(cmDariEmu(tampil.hEmu))} cm</b></span>
        : petunjuk && <span>{petunjuk}</span>}
    </div>
  );
}

function PratinjauGambar({ fileId, ukuran, alami, onAlami, alt }: {
  fileId: string; ukuran: UkuranGambar; alami: UkuranAlami | null; onAlami: (a: UkuranAlami) => void; alt: string;
}) {
  const [gagal, setGagal] = useState(false);
  const g = alami ? gayaPratinjau(ukuran, alami) : null;
  const selesai = (el: HTMLImageElement) => {
    if (el.naturalWidth) onAlami({ wEmu: el.naturalWidth * EMU_PER_PX, hEmu: el.naturalHeight * EMU_PER_PX });
    else setGagal(true);
  };
  return (
    <div className="lk-gbr-lembar">
      {gagal
        ? <div className="lk-gbr-pesan">Gambar tidak bisa dimuat.</div>
        : (
          <div className="lk-gbr-bingkai" style={g ? { width: `${g.lebarPct}%`, aspectRatio: g.rasio } : { width: '100%', minHeight: 80 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- berkas Drive lewat /api/upload/download (sesi + izin per berkas), tidak bisa lewat optimasi next/image */}
            <img
              src={`/api/upload/download?id=${encodeURIComponent(fileId)}`} alt={alt} loading="lazy" decoding="async"
              style={g
                ? { left: `${g.gambar.leftPct}%`, top: `${g.gambar.topPct}%`, width: `${g.gambar.widthPct}%`, height: `${g.gambar.heightPct}%` }
                : { opacity: 0, width: '100%' }}
              // Blok ikut HTML server: gambar dari cache bisa selesai sebelum hidrasi, dan onLoad-nya tak pernah datang.
              ref={el => { if (el?.complete && !alami) selesai(el); }}
              onLoad={e => selesai(e.currentTarget)}
              onError={() => setGagal(true)}
            />
            {!g && <div className="lk-gbr-pesan">Memuat gambar…</div>}
          </div>
        )}
    </div>
  );
}

/** Pemanggil memberi `key={fileId}`: berkas lain = ukuran alami lain, jadi state di sini harus mulai ulang. */
export default function GambarBerukuran({ fileId, ukuran, onUbah, readOnly, alt }: {
  fileId: string; ukuran: UkuranGambar; onUbah: (u: UkuranGambar) => void; readOnly: boolean; alt: string;
}) {
  const [alami, setAlami] = useState<UkuranAlami | null>(null);
  return (
    <div className="lk-gbr">
      <PratinjauGambar fileId={fileId} ukuran={ukuran} alami={alami} onAlami={setAlami} alt={alt} />
      <IsianLebar ukuran={ukuran} onUbah={onUbah} alami={alami} readOnly={readOnly} />
      {alami && proporsiMenyimpang(ukuran, alami) && (
        <div className="lk-grafik-basi lk-gbr-gepeng">
          <span>Bentuk gambar ini tidak sesuai aslinya (tampak gepeng atau memanjang), persis seperti di berkas Word asalnya.</span>
          {!readOnly && <PrimaButton variant="ghost" size="sm" onClick={() => onUbah(kembalikanProporsi(ukuran))}>Kembalikan proporsi</PrimaButton>}
        </div>
      )}
    </div>
  );
}
