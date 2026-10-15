'use client';
// Isian sumber + setelan untuk modal Tabel dari Modul DAN modal Angka dari Modul — satu bentuk
// setelan per sumber, supaya dua modal tidak bisa berbeda pendapat soal setelan yang sama (L78).

import { DAFTAR_SUMBER, URUTAN_SUMBER, type IdSumber } from '@/lib/lkjip/sumber';
import { LABEL_KEDALAMAN } from '@/lib/lkjip/sumber/kinerja-rekap';
import { LABEL_LEVEL, type PilihanFokus } from '@/lib/lkjip/sumber/renaksi-cetak';
import { KEDALAMAN_BLUD_MAKS } from '@/lib/lkjip/sumber/blud-realisasi';
import type { HasilTarik } from '@/lib/lkjip/tautan';
import { CRR_BULAN_LABELS, SUMBER_LIST } from '@/app/(dashboard)/kinerja/_utils';
import { ALL_LEVELS } from '@/app/(dashboard)/rencana-aksi/_lib/cetak-filter';
import type { RaLevel } from '@/app/(dashboard)/rencana-aksi/_lib/types';

export type HasilSetelan = HasilTarik & { fokus?: PilihanFokus };

interface Props {
  sumberId:   IdSumber;
  setelan:    Record<string, unknown>;
  hasil:      HasilSetelan | null;
  onSumber:   (id: IdSumber) => void;
  onUbah:     (kunci: string, nilai: unknown) => void;
  /** Tampilan yang mengganti daftar kolom sumber — pemanggil bisa ikut menyusun ulang kolomnya. */
  onTampilan: (nilai: string) => void;
}

export default function SetelanSumber({ sumberId, setelan, hasil, onSumber, onUbah, onTampilan }: Props) {
  const bulan = (
    <label>S/D bulan
      <select value={Number(setelan.sdBulan)} onChange={e => onUbah('sdBulan', Number(e.target.value))}>
        {CRR_BULAN_LABELS.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
      </select>
    </label>
  );
  return (
    <div className="lk-taut-grid">
      <label>Sumber
        <select value={sumberId} onChange={e => onSumber(e.target.value as IdSumber)}>
          {URUTAN_SUMBER.map(id => <option key={id} value={id}>{DAFTAR_SUMBER[id].label}</option>)}
        </select>
      </label>
      <label>Tahun
        <input type="number" min={2000} max={2100} value={Number(setelan.tahun)} onChange={e => onUbah('tahun', Number(e.target.value))} />
      </label>
      {sumberId === 'kinerja-rekap' ? (
        <>
          {bulan}
          <label>Versi SSK
            <select value={String(setelan.versi)} onChange={e => onUbah('versi', e.target.value)}>
              <option value="berlaku">Versi Berlaku</option>
              <option value="murni">Versi Murni (sebelum perubahan)</option>
            </select>
          </label>
          <label>Kedalaman
            <select value={String(setelan.kedalaman)} onChange={e => onUbah('kedalaman', e.target.value)}>
              {Object.entries(LABEL_KEDALAMAN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        </>
      ) : sumberId === 'kinerja-laporan' ? (
        <>
          <label>Tampilan
            <select value={String(setelan.tampilan)} onChange={e => onTampilan(e.target.value)}>
              <option value="sumber">Per sumber dana (+ jumlah)</option>
              <option value="bulanan">Per bulan, satu sumber dana</option>
            </select>
          </label>
          {setelan.tampilan === 'bulanan' && (
            <label>Sumber dana
              <select value={String(setelan.sumber)} onChange={e => onUbah('sumber', e.target.value)}>
                {SUMBER_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
        </>
      ) : sumberId === 'blud-realisasi' ? (
        <>
          {bulan}
          <label>Tampilan
            <select value={String(setelan.tampilan)} onChange={e => onTampilan(e.target.value)}>
              <option value="rekening">Per rekening (bertingkat)</option>
              <option value="pj">Per Penanggung Jawab (+ jumlah)</option>
            </select>
          </label>
          {setelan.tampilan !== 'pj' && (
            <>
              <label>Sampai tingkat
                <select value={Number(setelan.kedalaman)} onChange={e => onUbah('kedalaman', Number(e.target.value))}>
                  {Array.from({ length: KEDALAMAN_BLUD_MAKS }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n === 1 ? 'Tingkat 1 saja (paling atas)' : `Sampai tingkat ${n}`}</option>
                  ))}
                </select>
              </label>
              <div className="lk-taut-cek">Rekening kosong
                <span>
                  <label className="lk-taut-inline">
                    <input type="checkbox" checked={setelan.sembunyikanNol !== false} onChange={e => onUbah('sembunyikanNol', e.target.checked)} />
                    Sembunyikan yang pagu &amp; realisasinya nol
                  </label>
                </span>
              </div>
            </>
          )}
        </>
      ) : sumberId === 'pk' ? (
        <>
          <label>Tampilan
            <select value={String(setelan.tampilan)} onChange={e => onTampilan(e.target.value)}>
              <option value="kinerja">Sasaran, indikator &amp; target</option>
              <option value="anggaran">Anggaran (+ jumlah)</option>
            </select>
          </label>
          <PilihPihak setelan={setelan} hasil={hasil} onUbah={onUbah} />
          <label>Versi PK
            <select value={String(setelan.versi)} onChange={e => onUbah('versi', e.target.value)}>
              <option value="berlaku">Berlaku (Perubahan bila ada)</option>
              <option value="murni">Murni</option>
            </select>
          </label>
        </>
      ) : (
        <>
          <label>Tampilan
            <select value={String(setelan.mode)} onChange={e => onUbah('mode', e.target.value)}>
              <option value="hirarki">Pohon (bertingkat)</option>
              <option value="flat">Daftar per level</option>
            </select>
          </label>
          <div className="lk-taut-cek">Level
            <span>
              {ALL_LEVELS.map(l => {
                const lv = setelan.levels as Record<RaLevel, boolean>;
                return (
                  <label key={l} className="lk-taut-inline">
                    <input type="checkbox" checked={!!lv?.[l]} onChange={e => onUbah('levels', { ...lv, [l]: e.target.checked })} />
                    {LABEL_LEVEL[l]}
                  </label>
                );
              })}
            </span>
          </div>
          {(['fTujuan', 'fSasaran', 'fProgram'] as const).map(f => {
            const daftar = hasil?.fokus?.[f === 'fTujuan' ? 'tujuan' : f === 'fSasaran' ? 'sasaran' : 'program'] ?? [];
            return (
              <label key={f}>Fokus {f.slice(1)}
                <select value={String(setelan[f] ?? '')} disabled={!hasil?.fokus} onChange={e => onUbah(f, e.target.value)}>
                  <option value="">{hasil?.fokus ? 'Semua' : 'Tarik data dulu'}</option>
                  {daftar.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Daftar Pihak Pertama baru diketahui sesudah menarik (dokumen PK FINAL yang bisa dilihat akun ini). */
function PilihPihak({ setelan, hasil, onUbah }: Pick<Props, 'setelan' | 'hasil' | 'onUbah'>) {
  const terpilih = String(setelan.pihak ?? '');
  const daftar = hasil?.pilihan?.pihak ?? [];
  // Pilihan tersimpan tetap tampil walau belum ditarik / tidak ada lagi di daftar.
  const semua = terpilih && !daftar.includes(terpilih) ? [terpilih, ...daftar] : daftar;
  return (
    <label>Pihak Pertama
      <select value={terpilih} disabled={!hasil && !terpilih} onChange={e => onUbah('pihak', e.target.value)}>
        <option value="">{hasil ? (daftar.length ? '— Pilih —' : 'Tidak ada PK FINAL') : 'Tarik data dulu'}</option>
        {semua.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
