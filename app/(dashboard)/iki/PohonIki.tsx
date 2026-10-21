'use client';
// Tabel pohon jabatan beranda IKI (docs/CONCEPT-iki-beranda.md §4). Susunannya dihitung
// `susunPohon` (lib/iki/beranda.ts); komponen ini hanya menggambar dan meneruskan klik.
// Gaya ada di LIST_CSS iki-client.tsx (satu blok <style> per halaman).

import type { CSSProperties, ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Lock, Plus } from 'lucide-react';
import DeleteIcon from '@/components/ui/DeleteIcon';
import type { BarisPohon } from '@/lib/iki/beranda';
import { labelJumlahIsi, type IkiListRow } from './_lib/types';

export type AksiPohon = {
  buka: (d: IkiListRow) => void;
  pilih: (id: number) => void;
  lipat: (kunci: string) => void;
  salinDariSumber: (b: BarisPohon<IkiListRow>) => void;
  buatMurni: (b: BarisPohon<IkiListRow>) => void;
  buatPerubahan: (b: BarisPohon<IkiListRow>) => void;
  duplikat: (d: IkiListRow) => void;
  hapus: (d: IkiListRow) => void;
};

type Props = {
  baris: BarisPohon<IkiListRow>[];
  tahun: string;
  terlipat: ReadonlySet<string>;
  sedangCari: boolean;
  modePilih: boolean;
  terpilih: ReadonlySet<number>;
  sibuk: string | null;
  aksi: AksiPohon;
};

export default function PohonIki({ baris, tahun, terlipat, sedangCari, modePilih, terpilih, sibuk, aksi }: Props) {
  let lewatiDiBawah = -1;
  let judulLepas = false;
  const tampil: { b: BarisPohon<IkiListRow>; judul: boolean }[] = [];
  for (const b of baris) {
    if (lewatiDiBawah >= 0 && b.kedalaman > lewatiDiBawah) continue;
    lewatiDiBawah = !sedangCari && terlipat.has(b.kunci) ? b.kedalaman : -1;
    const judul = b.lepas && b.kedalaman === 0 && !judulLepas;
    if (judul) judulLepas = true;
    tampil.push({ b, judul });
  }

  return (
    <div className="iki-pohon" role="table" aria-label={`Dokumen IKI ${tahun} per jabatan`}>
      <div className="iki-prow iki-phead" role="row">
        <span role="columnheader">Jabatan</span>
        <span role="columnheader" className="c">Murni</span>
        <span role="columnheader" className="c">Perubahan</span>
      </div>
      {tampil.map(({ b, judul }) => (
        <div key={b.kunci} role="rowgroup">
          {judul && (
            <div className="iki-plepas" role="row">
              <span role="cell">Belum tertaut ke atasan — tautkan lewat isian Atasan di editor supaya masuk ke pohon</span>
            </div>
          )}
          <BarisJabatan b={b} terlipat={terlipat.has(b.kunci)} sedangCari={sedangCari}
            modePilih={modePilih} terpilih={terpilih} sibuk={sibuk === b.kunci} aksi={aksi} tahun={tahun} />
        </div>
      ))}
    </div>
  );
}

function BarisJabatan({ b, terlipat, sedangCari, modePilih, terpilih, sibuk, aksi, tahun }: {
  b: BarisPohon<IkiListRow>; terlipat: boolean; sedangCari: boolean; modePilih: boolean;
  terpilih: ReadonlySet<number>; sibuk: boolean; aksi: AksiPohon; tahun: string;
}) {
  const hantu = !b.murni && !b.perubahan;
  const nama = hantu && b.sumber ? b.sumber.nama : b.nama;
  return (
    <div className={`iki-prow${hantu ? ' hantu' : ''}`} role="row">
      <div className="iki-pjab" role="cell" style={{ paddingLeft: 10 + b.kedalaman * 20, '--dalam': b.kedalaman } as CSSProperties}>
        {b.anak.length > 0 && !sedangCari ? (
          <button type="button" className="iki-plipat" onClick={() => aksi.lipat(b.kunci)}
            aria-label={terlipat ? `Buka bawahan ${b.jabatan}` : `Lipat bawahan ${b.jabatan}`} aria-expanded={!terlipat}>
            {terlipat ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
        ) : <span className="iki-plipat-ruang" />}
        <div className="iki-ptxt">
          <div className="jab">{b.jabatan}</div>
          <div className="nm">
            {hantu ? `Belum ada di ${tahun} · ${nama}` : nama}
            {!hantu && <span className="nip"> · {b.nip}</span>}
            {terlipat && <span className="nip"> · {b.anak.length} bawahan</span>}
          </div>
        </div>
      </div>
      <SelJenis d={b.murni} modePilih={modePilih} terpilih={terpilih} aksi={aksi}>
        {b.sumber ? (
          <span className="iki-pkosong-aksi">
            <button type="button" className="iki-psalin" disabled={sibuk} onClick={() => aksi.salinDariSumber(b)}
              data-tooltip={`Salin ${b.sumber.jenis === 'PERUBAHAN' ? 'Perubahan' : 'Murni'} ${b.sumber.tahun} jadi Murni ${tahun}`} data-tooltip-pos="above">
              <Copy size={13} /> {sibuk ? 'Menyalin…' : <>Salin<span className="lp"> dari</span> {b.sumber.tahun}</>}
            </button>
            <button type="button" className="iki-act kecil" onClick={() => aksi.buatMurni(b)} aria-label="Buat Murni kosong"
              data-tooltip="Buat Murni kosong" data-tooltip-pos="above"><Plus size={13} /></button>
          </span>
        ) : (
          <button type="button" className="iki-pbuat" onClick={() => aksi.buatMurni(b)}><Plus size={13} /> Buat</button>
        )}
      </SelJenis>
      <SelJenis d={b.perubahan} modePilih={modePilih} terpilih={terpilih} aksi={aksi}>
        {b.murni
          ? <button type="button" className="iki-pbuat" disabled={sibuk} onClick={() => aksi.buatPerubahan(b)}
              aria-label={`Buat IKI Perubahan ${b.jabatan}`}><Plus size={13} /> <span className="lp">Perubahan</span></button>
          : <span className="iki-pstrip">—</span>}
      </SelJenis>
    </div>
  );
}

function SelJenis({ d, modePilih, terpilih, aksi, children }: {
  d: IkiListRow | null; modePilih: boolean; terpilih: ReadonlySet<number>; aksi: AksiPohon; children: ReactNode;
}) {
  if (!d) return <div className="iki-pcell" role="cell">{modePilih ? <span className="iki-pstrip">—</span> : children}</div>;
  const on = terpilih.has(d.id);
  return (
    <div className={`iki-pcell ada${on ? ' on' : ''}`} role="cell">
      <button type="button" className="iki-pdok" onClick={() => (modePilih ? aksi.pilih(d.id) : aksi.buka(d))}
        aria-pressed={modePilih ? on : undefined}
        aria-label={`${modePilih ? (on ? 'Batal pilih' : 'Pilih') : 'Buka'} IKI ${d.jenis === 'PERUBAHAN' ? 'Perubahan' : 'Murni'} ${d.jabatan}`}>
        {modePilih && <span className={`iki-check${on ? ' on' : ''}`}>{on && <Check size={12} strokeWidth={3} />}</span>}
        <span className={`iki-badge ${d.status === 'FINAL' ? 'final' : 'draft'}`}>{d.status}</span>
        <span className="iki-prhk">{labelJumlahIsi(d)}</span>
      </button>
      {!modePilih && (
        <span className="iki-pakt">
          <button type="button" className="iki-act kecil" onClick={() => aksi.duplikat(d)} aria-label="Duplikat"
            data-tooltip="Duplikat ke tahun lain" data-tooltip-pos="above"><Copy size={13} /></button>
          {d.status !== 'FINAL'
            ? <button type="button" className="iki-act kecil danger" onClick={() => aksi.hapus(d)} aria-label="Hapus"
                data-tooltip="Hapus dokumen" data-tooltip-pos="above"><DeleteIcon size={13} /></button>
            : <span className="iki-act kecil locked" data-tooltip="FINAL — terkunci" data-tooltip-pos="above"><Lock size={12} /></span>}
        </span>
      )}
    </div>
  );
}
