'use client';
// Isian pagu baris sub kegiatan per sumber dana (+ kolom Perubahan bila tahunnya berbabak Perubahan).
// Aturannya di lib/renaksi/pagu.ts — penolakan di sini kalimat yang SAMA dengan server.

import { Plus } from 'lucide-react';
import { InputNominal } from '@/components/ui/input-nominal';
import DeleteButton from '@/components/ui/DeleteButton';
import PrimaButton from '@/components/ui/PrimaButton';
import {
  LABEL_TANPA_SUMBER, alasanTolakRincian, kunciSumber, totalBerlaku, tulisPerSumber, type Pagu, type RincianPagu,
} from '@/lib/renaksi/pagu';

const rupiah = (n: number | null) => (n == null ? '—' : `Rp ${n.toLocaleString('id-ID')}`);

interface Props {
  tahun: number;
  rincian: RincianPagu[];
  onChange: (r: RincianPagu[]) => void;
  /** Rincian tersimpan baris yang sedang disunting — pembanding pembekuan Murni. */
  lama: RincianPagu[];
  perubahanAktif: boolean;
  dimulaiPada: string | null;
  opsiSumber: string[];
  /** Total berlaku seluruh indikator sub kegiatan ini, dengan isian layar menggantikan baris ini. */
  totalSubKegiatan: { total: number | null; indikator: number } | null;
  /** RKO E-Anggaran sub kegiatan ini (versi terbaru semua tab) & kalimat kelebihannya bila ada. */
  terpakaiRko: { rko: Pagu; lebih: string | null } | null;
  onMulaiPerubahan: () => void;
  onBatalPerubahan: () => void;
  sibukPerubahan: boolean;
}

export default function PaguSumberEditor({
  tahun, rincian, onChange, lama, perubahanAktif, dimulaiPada, opsiSumber, totalSubKegiatan, terpakaiRko,
  onMulaiPerubahan, onBatalPerubahan, sibukPerubahan,
}: Props) {
  const ubah = (i: number, isi: Partial<RincianPagu>) => onChange(rincian.map((r, j) => (j === i ? { ...r, ...isi } : r)));
  const murniLama = new Map(lama.map(r => [kunciSumber(r.sumber), r.pagu]));
  const alasan = alasanTolakRincian(rincian, lama, perubahanAktif);
  const berlaku = totalBerlaku(rincian);
  const kelasInput = 'w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 bg-white focus:ring-1 focus:ring-[#EF9F27] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400';

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1">
        <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-widest">
          💰 Pagu per sumber dana
        </span>
        <span className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          {perubahanAktif
            ? <>Babak <b className="text-[#BA7517]">Perubahan</b>{dimulaiPada ? ` sejak ${dimulaiPada}` : ''} — Murni beku</>
            : <>Babak <b>Murni</b></>}
          {perubahanAktif ? (
            <PrimaButton variant="ghost" size="sm" onClick={onBatalPerubahan} disabled={sibukPerubahan}
              data-tooltip="Hanya bisa selama belum ada pagu Perubahan yang terisi">
              Batalkan Perubahan {tahun}
            </PrimaButton>
          ) : (
            <PrimaButton variant="warning" size="sm" onClick={onMulaiPerubahan} disabled={sibukPerubahan}
              data-tooltip={`Pagu Murni ${tahun} dibekukan; perubahan anggaran diisi di kolom Perubahan`}>
              Mulai Pagu Perubahan {tahun}
            </PrimaButton>
          )}
        </span>
      </div>

      <datalist id="ra-opsi-sumber">{opsiSumber.map(s => <option key={s} value={s} />)}</datalist>
      <div className="space-y-2">
        <div className="grid gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider"
          style={{ gridTemplateColumns: perubahanAktif ? 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) 32px' : 'minmax(0,1.3fr) minmax(0,1fr) 32px' }}>
          <span>Sumber dana</span><span className="text-right">Murni (Rp)</span>
          {perubahanAktif && <span className="text-right">Perubahan (Rp)</span>}<span />
        </div>
        {rincian.map((r, i) => {
          const kunci = kunciSumber(r.sumber);
          // Babak Perubahan: Murni tak bisa disunting; nama sumber hanya boleh diisi untuk baris
          // "tanpa sumber" lama (memberi sumber pada pagu lama — jumlah Murni tetap).
          const namaBeku = perubahanAktif && kunci !== '' && (murniLama.get(kunci) ?? null) != null;
          return (
            <div key={i} className="grid gap-2 items-center"
              style={{ gridTemplateColumns: perubahanAktif ? 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) 32px' : 'minmax(0,1.3fr) minmax(0,1fr) 32px' }}>
              <input list="ra-opsi-sumber" value={r.sumber} disabled={namaBeku} maxLength={100}
                placeholder={LABEL_TANPA_SUMBER} aria-label="Sumber dana"
                onChange={e => ubah(i, { sumber: e.target.value })} className={kelasInput} />
              <InputNominal nullable value={r.pagu} disabled={perubahanAktif}
                onChange={v => ubah(i, { pagu: v })} className={`${kelasInput} text-right`} />
              {perubahanAktif && (
                <InputNominal nullable value={r.pagu_perubahan} placeholder="sama dgn Murni"
                  onChange={v => ubah(i, { pagu_perubahan: v })} className={`${kelasInput} text-right`} />
              )}
              <DeleteButton type="button" aria-label="Hapus sumber" data-tooltip="Hapus sumber ini"
                disabled={perubahanAktif && (murniLama.get(kunci) ?? null) != null}
                onClick={() => onChange(rincian.filter((_, j) => j !== i))} />
            </div>
          );
        })}
        <button type="button" onClick={() => onChange([...rincian, { sumber: '', pagu: null, pagu_perubahan: null }])}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7C5CFC] hover:underline">
          <Plus size={12} /> Tambah sumber dana
        </button>
      </div>

      <div className="space-y-0.5 text-[11px] text-slate-600">
        <div>Pagu berlaku indikator ini: <b style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{rupiah(berlaku)}</b></div>
        {totalSubKegiatan && totalSubKegiatan.indikator > 1 && (
          <div>
            Total sub kegiatan: <b style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{rupiah(totalSubKegiatan.total)}</b>
            {' '}({totalSubKegiatan.indikator} indikator)
          </div>
        )}
        {terpakaiRko && (
          <div>
            Terpakai di RKO E-Anggaran (versi terbaru semua tab):{' '}
            <b style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{rupiah(terpakaiRko.rko.total)}</b>
            {tulisPerSumber(terpakaiRko.rko) && <> ({tulisPerSumber(terpakaiRko.rko)})</>}
            {terpakaiRko.lebih && <span className="block font-semibold text-[#E24B4A]">RKO melampaui pagu sub kegiatan ini: {terpakaiRko.lebih}</span>}
          </div>
        )}
        {alasan && <div className="font-semibold text-[#E24B4A]">{alasan}</div>}
      </div>
    </div>
  );
}
