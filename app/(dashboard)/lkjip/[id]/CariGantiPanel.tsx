'use client';

// Cari & Ganti seluruh dokumen (konsep daftar-word §11). Panel, bukan modal: naskahnya tetap terbaca di sampingnya.
// Mencari di klien pada isi tersimpan; mengganti lewat satu tombol ke server, yang memakai aturan yang sama.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Replace, ReplaceAll, Search, X } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { cariDiDokumen, type DataDokumen, type OpsiCari, type Temuan } from '@/lib/lkjip/cari-ganti';

const BATAS_TAMPIL = 300;
export const kunciTemuan = (t: Temuan) => `${JSON.stringify(t.tempat)}#${t.ke}`;

interface Props {
  data: DataDokumen;
  readOnly: boolean;
  busy: boolean;
  /** Dipanggil tiap kata berubah, untuk menyorot di narasi yang terbuka. */
  onOpsi: (o: OpsiCari | null) => void;
  onBuka: (t: Temuan) => void;
  onGanti: (o: OpsiCari, dengan: string, sasaran?: Temuan) => void;
  onTutup: () => void;
}

export default function CariGantiPanel({ data, readOnly, busy, onOpsi, onBuka, onGanti, onTutup }: Props) {
  const [kata, setKata] = useState('');
  const [dengan, setDengan] = useState('');
  const [hurufBesar, setHurufBesar] = useState(false);
  const [seluruhKata, setSeluruhKata] = useState(false);
  const [aktif, setAktif] = useState(0);
  const masukRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { masukRef.current?.focus(); }, []);

  const opsi = useMemo<OpsiCari>(() => ({ kata, hurufBesar, seluruhKata }), [kata, hurufBesar, seluruhKata]);
  useEffect(() => { onOpsi(kata ? opsi : null); }, [kata, opsi, onOpsi]);
  const temuan = useMemo(() => cariDiDokumen(data, opsi), [data, opsi]);
  const bisaGanti = useMemo(() => temuan.filter(t => !t.alasan).length, [temuan]);
  const indeks = temuan.length ? Math.min(aktif, temuan.length - 1) : 0;

  const pindah = (arah: 1 | -1) => {
    if (!temuan.length) return;
    const i = (indeks + arah + temuan.length) % temuan.length;
    setAktif(i);
    onBuka(temuan[i]);
  };

  return (
    <aside className="lk-cg" role="search" aria-label="Cari dan ganti" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onTutup(); } }}>
      <div className="lk-cg-head">
        <span><Search size={14} /> Cari &amp; Ganti</span>
        <button type="button" className="lk-cg-x" aria-label="Tutup cari dan ganti" onClick={onTutup}><X size={15} /></button>
      </div>
      <label className="lk-cg-label">Cari
        <input ref={masukRef} value={kata} aria-label="Kata yang dicari" onChange={e => { setKata(e.target.value); setAktif(0); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); pindah(e.shiftKey ? -1 : 1); } }} />
      </label>
      {!readOnly && (
        <label className="lk-cg-label">Ganti dengan
          <input value={dengan} aria-label="Teks pengganti" onChange={e => setDengan(e.target.value)} />
        </label>
      )}
      <div className="lk-cg-opsi">
        <label><input type="checkbox" checked={hurufBesar} onChange={e => { setHurufBesar(e.target.checked); setAktif(0); }} /> Huruf besar/kecil sama persis</label>
        <label><input type="checkbox" checked={seluruhKata} onChange={e => { setSeluruhKata(e.target.checked); setAktif(0); }} /> Seluruh kata</label>
      </div>
      <div className="lk-cg-aksi">
        <span className="lk-cg-jumlah" aria-live="polite">{kata ? `${temuan.length ? indeks + 1 : 0} dari ${temuan.length}` : 'Ketik untuk mencari'}</span>
        <button type="button" className="lk-cg-nav" aria-label="Sebelumnya" disabled={!temuan.length} onClick={() => pindah(-1)}><ChevronLeft size={15} /></button>
        <button type="button" className="lk-cg-nav" aria-label="Berikutnya" disabled={!temuan.length} onClick={() => pindah(1)}><ChevronRight size={15} /></button>
      </div>
      {!readOnly && (
        <div className="lk-cg-tombol">
          <PrimaButton menulis variant="ghost" size="sm" iconLeft={<Replace size={14} />} disabled={busy || !temuan[indeks] || !!temuan[indeks].alasan} onClick={() => onGanti(opsi, dengan, temuan[indeks])}>Ganti</PrimaButton>
          <PrimaButton menulis variant="primary" size="sm" iconLeft={<ReplaceAll size={14} />} disabled={busy || !bisaGanti} onClick={() => onGanti(opsi, dengan)}>Ganti semua ({bisaGanti})</PrimaButton>
        </div>
      )}
      <ul className="lk-cg-daftar">
        {temuan.slice(0, BATAS_TAMPIL).map((t, i) => (
          <li key={kunciTemuan(t)}>
            <button type="button" className={i === indeks ? 'aktif' : undefined} onClick={() => { setAktif(i); onBuka(t); }}>
              <span className="lk-cg-letak">{t.letak}</span>
              <span className="lk-cg-teks">{t.sebelum}<mark>{t.cocok}</mark>{t.sesudah}</span>
              {t.alasan && <span className="lk-cg-alasan">{t.alasan}</span>}
            </button>
          </li>
        ))}
      </ul>
      {temuan.length > BATAS_TAMPIL && <div className="lk-cg-catatan">{BATAS_TAMPIL} pertama dari {temuan.length} ditampilkan. Ganti semua tetap mengenai semuanya.</div>}
      <div className="lk-cg-catatan">Mencari isi yang sudah disimpan. Ketikan yang belum disimpan belum terbaca.</div>
    </aside>
  );
}
