'use client';
// Kisi kepala tabel di modal "Tabel dari Modul" — docs/CONCEPT-lkjip-tabel-excel.md §4.
// Kepala disusun langsung di sini (jumlah baris, gabung, pisah, ketik) sampai persis seperti yang
// akan tercetak. Pilihan sel memakai hook yang SAMA dengan editor tabel; gabung/pisah/sel milik
// kolom memakai fungsi lib/lkjip/tabel.ts yang sama (E5). Berhenti di FORM: hanya `onUbah`.

import { useRef } from 'react';
import { Combine, Split, ArrowDownToLine } from 'lucide-react';
import { confirmDialog, pilihDialog } from '@/components/ui/ConfirmDialog';
import {
  colLabel, unmergeAt, sisipBarisSel, hapusBarisSel, rapikanLetak, rencanaGabungKepala, gabungKepala, rapikanKepala,
  BATAS_BARIS_KEPALA, type TabelCell,
} from '@/lib/lkjip/tabel';
import { usePilihanSel } from '@/components/tabel/usePilihanSel';

interface Props {
  kepala: TabelCell[][];
  /** Baris tempat judul tiap kolom (lengket, §4.4). */
  letak: (number | null)[];
  lebar: number[];
  onUbah: (kepala: TabelCell[][], letak: (number | null)[]) => void;
}

const potong = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function KisiKepala({ kepala, letak, lebar, onUbah }: Props) {
  const ncol = kepala[0]?.length ?? 0;
  const hr = kepala.length;
  const pil = usePilihanSel(kepala, ncol);
  const k = pil.kotak;
  const awalKetik = useRef('');
  const judulDi = new Map(letak.flatMap((r, c) => (r == null ? [] : [[`${r}:${c}`, c] as const])));
  const totalLebar = lebar.reduce((a, b) => a + b, 0) || 1;
  const asal = k ? kepala[k.r1]?.[k.c1] : undefined;
  const bisaGabung = !!k && (k.r1 !== k.r2 || k.c1 !== k.c2);
  const bisaPisah = !!asal && ((asal.cs ?? 1) > 1 || (asal.rs ?? 1) > 1);

  const tulisSel = (r: number, c: number, v: string) =>
    onUbah(kepala.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? { ...cell, v } : cell)) : row)), letak);

  async function gantiJumlah(n: number) {
    if (n === hr) return;
    if (n > hr) { onUbah(sisipBarisSel(kepala, hr, n - hr, ncol), letak); return; }
    let kp = hapusBarisSel(kepala, n, hr - 1, ncol);
    const lt = rapikanLetak(kp, letak.map(r => (r != null && r >= n ? null : r)));
    // Judul yang barisnya dibuang naik ke sel miliknya yang masih kosong; sisanya ditanyakan.
    const hilang: string[] = [];
    letak.forEach((r, c) => {
      const teks = r == null || r < n ? '' : kepala[r][c].v;
      if (!teks.trim()) return;
      const t = lt[c];
      if (t != null && !kp[t][c].v.trim()) kp = kp.map((row, i) => (i === t ? row.map((cell, j) => (j === c ? { ...cell, v: teks } : cell)) : row));
      else hilang.push(teks.trim());
    });
    for (let r = n; r < hr; r++) {
      kepala[r].forEach((cell, c) => { if (!cell.h && cell.v.trim() && letak[c] !== r) hilang.push(cell.v.trim()); });
    }
    if (hilang.length && !(await confirmDialog({
      title: `Kepala jadi ${n} baris?`,
      message: `Ikut terbuang: ${hilang.slice(0, 5).map(t => `"${potong(t)}"`).join(', ')}${hilang.length > 5 ? ', …' : ''}.`,
      confirmLabel: 'Buang', variant: 'warning',
    }))) return;
    pil.setSel(null);
    onUbah(kp, lt);
  }

  async function gabung() {
    if (!k) return;
    const rencana = rencanaGabungKepala(kepala, letak, k);
    const kk = rencana.kotak;
    if (kk.r1 === kk.r2 && kk.c1 === kk.c2) return;
    const melebar = kk.c2 > kk.c1;
    let tambahBaris = false;
    if (rencana.tanpaTempat.length) {
      const nama = rencana.tanpaTempat.map(c => `"${potong(kepala[letak[c]!][c].v)}" (${colLabel(c)})`).join(', ');
      if (melebar && hr < BATAS_BARIS_KEPALA) {
        const p = await pilihDialog({
          title: 'Judul kolom tidak punya tempat turun',
          message: `Judul ${nama} tertutup gabungan, dan sel di bawahnya sudah berisi atau sudah baris kepala terakhir.\n\n`
            + 'Tambah 1 baris kepala: judulnya turun ke baris baru di bawah gabungan.\nGabung saja: seperti Excel, yang tersisa hanya isi sel kiri-atas.',
          confirmLabel: 'Tambah 1 baris kepala & gabung', altLabel: 'Gabung saja', variant: 'primary', altVariant: 'warning',
        });
        if (p === null) return;
        tambahBaris = p === 'utama';
      } else if (!(await confirmDialog({
        title: 'Gabung saja?',
        message: `Judul ${nama} tertutup gabungan dan tidak punya tempat${melebar ? ` — kepala sudah ${BATAS_BARIS_KEPALA} baris` : ''}. Seperti Excel, yang tersisa hanya isi sel kiri-atas.`,
        confirmLabel: 'Gabung saja', variant: 'warning',
      }))) return;
    }
    if (rencana.terbuang.length && !(await confirmDialog({
      title: 'Teks lain ikut terbuang',
      message: `Seperti Excel, yang tersisa hanya isi sel kiri-atas. Ikut terbuang: ${rencana.terbuang.slice(0, 5).map(t => `"${potong(t)}"`).join(', ')}${rencana.terbuang.length > 5 ? ', …' : ''}.`,
      confirmLabel: 'Gabung', variant: 'warning',
    }))) return;
    const hasil = gabungKepala(kepala, letak, rencana, tambahBaris);
    onUbah(hasil.kepala, hasil.letak);
    pil.setSel({ ar: kk.r1, ac: kk.c1, fr: kk.r1, fc: kk.c1 });
  }

  function pisah() {
    if (!k || !bisaPisah) return;
    const kp = unmergeAt(kepala, k.r1, k.c1, ncol);
    // Judul TIDAK berpindah saat dipisah (§4.4) — rapikanLetak hanya mengisi kolom yang belum punya tempat.
    onUbah(kp, rapikanLetak(kp, letak));
  }

  return (
    <div className="lk-kisi">
      <div className="lk-kisi-alat">
        <label className="lk-taut-inline">
          Kepala tabel:
          <select value={hr} aria-label="Jumlah baris kepala" onChange={e => void gantiJumlah(Number(e.target.value))}>
            {Array.from({ length: BATAS_BARIS_KEPALA }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} baris</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void gabung()} disabled={!bisaGabung} data-tooltip="Gabung sel terpilih — judul kolom yang tertutup turun ke sel di bawahnya" data-tooltip-pos="below"><Combine size={13} /> Gabung</button>
        <button type="button" onClick={pisah} disabled={!bisaPisah} data-tooltip="Pisah sel gabungan — judul kolom tetap di tempatnya" data-tooltip-pos="below"><Split size={13} /> Pisah</button>
        <button type="button" onClick={() => onUbah(rapikanKepala(kepala, letak), letak)} disabled={hr < 2} data-tooltip="Tiap judul kolom digabung ke bawah melewati sel kosong" data-tooltip-pos="below"><ArrowDownToLine size={13} /> Rapikan ↓</button>
      </div>
      <table className="lk-kisi-tabel">
        <colgroup>
          <col style={{ width: 26 }} />
          {lebar.map((w, i) => <col key={i} style={{ width: `${(w / totalLebar) * 100}%` }} />)}
        </colgroup>
        <thead>
          <tr><th />{Array.from({ length: ncol }, (_, c) => <th key={c}>{colLabel(c)}</th>)}</tr>
        </thead>
        <tbody>
          {kepala.map((row, r) => (
            <tr key={r}>
              <th>{r + 1}</th>
              {row.map((cell, c) => {
                if (cell.h) return null;
                const pilih = !!k && r >= k.r1 && r <= k.r2 && c >= k.c1 && c <= k.c2;
                const milik = judulDi.get(`${r}:${c}`);
                return (
                  <td key={c} colSpan={cell.cs ?? 1} rowSpan={cell.rs ?? 1} className={[pilih ? 'pilih' : '', milik !== undefined ? 'judul' : ''].filter(Boolean).join(' ') || undefined}
                    onMouseDown={e => { if (e.button === 0) { if (e.shiftKey) e.preventDefault(); pil.pilihSel(r, c, e.shiftKey); } }}
                    onMouseEnter={() => pil.seretSel(r, c)}>
                    {milik !== undefined && <span className="lk-kisi-tanda" aria-hidden>judul {colLabel(milik)}</span>}
                    <input value={cell.v} aria-label={`Sel kepala ${colLabel(c)}${r + 1}`}
                      onFocus={() => { awalKetik.current = cell.v; }}
                      onChange={e => tulisSel(r, c, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                        // Esc membatalkan ketikan sel ini saja — modalnya tidak ikut tertutup.
                        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); tulisSel(r, c, awalKetik.current); e.currentTarget.blur(); }
                      }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lk-hint">
        Seret atau Shift+klik untuk memblok. Sel bertanda <b>judul A</b> adalah judul kolom A (sama dengan isian di daftar bawah).
        Menggabung sel yang berisi judul kolom menurunkan judulnya ke sel kosong di bawahnya.
      </p>
    </div>
  );
}
