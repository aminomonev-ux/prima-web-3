'use client';

// Pintu masuk menu Sub Kegiatan — dua tampilan sederajat, bukan satu tampilan
// dengan tombol yang membuka "tempat kedua".
//
// Kenapa pilihannya TIDAK diingat: begitu pengguna pindah menu atau keluar, ia
// kembali ke halaman ini. Ongkosnya satu klik tiap masuk; imbalannya tidak
// pernah ada orang yang mengetik di tampilan yang salah tanpa sadar. Matriks
// dulu berupa modal, dan modal itulah yang membuat orang merasa ada dua tempat
// mengisi realisasi.
//
// Hanya Sub Kegiatan yang punya dua tampilan — realisasi BULANAN memang cuma ada
// di level ini, level lain berbasis triwulan. Itu alasan data, bukan kesewenangan,
// jadi disebutkan langsung di layar supaya tidak perlu ditebak.

import { ListChecks, Grid3x3, ArrowRight } from 'lucide-react';

interface Props {
  tahun: number;
  jumlahIndikator: number;
  onPilih: (v: 'detail' | 'matriks') => void;
}

interface KartuProps {
  icon: React.ElementType;
  warna: string;
  judul: string;
  ringkas: string;
  butir: string[];
  onClick: () => void;
}

function Kartu({ icon: Icon, warna, judul, ringkas, butir, onClick }: KartuProps) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full flex-col rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-xs transition-all hover:border-slate-300 hover:shadow-md cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${warna} 14%, transparent)`, color: warna }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800">{judul}</h3>
          <p className="text-xs text-slate-500">{ringkas}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        {butir.map(b => (
          <li key={b} className="flex items-start gap-2 text-[12.5px] text-slate-600">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: warna }} />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <span
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-bold transition-transform group-hover:translate-x-0.5"
        style={{ color: warna }}
      >
        Buka <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

export default function PilihTampilanSub({ tahun, jumlahIndikator, onPilih }: Props) {
  return (
    <div className="flex-1 overflow-y-auto bg-[#EEF2F6] px-4 py-8 md:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="text-xl font-bold tracking-tight text-slate-800 md:text-2xl">
          Indikator Sub Kegiatan
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Dua cara mengisi realisasi tahun {tahun} — ada {jumlahIndikator} indikator.
          Cuma Sub Kegiatan yang punya realisasi per bulan; level lain diisi per triwulan.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Kartu
            icon={ListChecks}
            warna="#378ADD"
            judul="Detail Indikator"
            ringkas="Satu indikator saja"
            butir={[
              'Isi realisasi tiap bulan, targetnya kelihatan di bawah kotaknya',
              'Rekap triwulan dan grafik setahun ikut terhitung sendiri',
              'Pilih ini kalau cuma mau mengurus satu indikator',
            ]}
            onClick={() => onPilih('detail')}
          />
          <Kartu
            icon={Grid3x3}
            warna="#7C5CFC"
            judul="Matriks Semua Indikator"
            ringkas="Semua indikator × 12 bulan"
            butir={[
              'Semua indikator dalam satu tabel — bisa diketik atau ditempel dari Excel',
              'Tombol Warna membantu mencari bulan yang capaiannya kurang',
              'Pilih ini kalau mau mengisi banyak indikator sekaligus',
            ]}
            onClick={() => onPilih('matriks')}
          />
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-slate-400">
          Datanya sama, jadi apa pun yang dipilih hasilnya tersimpan di tempat yang sama.
          Halaman ini muncul lagi tiap kali Anda masuk dari menu samping.
        </p>
      </div>
    </div>
  );
}
