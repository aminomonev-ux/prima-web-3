'use client';
// app/(dashboard)/admin/_panels/TabTinjauan.tsx — Tinjauan Akses Berkala (P3 + P11).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P3 & P11 (Tahap 8).
//
// CLAUDE.md (AUTHZ-02/V5) sudah menuntut akses direview berkala. Tidak ada alatnya,
// tidak ada catatannya, dan karena itu tidak pernah terjadi — dan kalau SPI bertanya
// "kapan terakhir ditinjau", tidak ada jawaban sama sekali.
//
// Yang menentukan apakah tinjauan itu SELESAI bukan fiturnya, melainkan bentuknya:
//
//   1. **Satu tabel yang dibaca dari atas ke bawah.** Tinjauan yang menuntut membuka 40
//      halaman satu per satu tidak akan pernah selesai.
//   2. **Aksinya di baris yang sama.** "Sudah saya tinjau" tepat di sebelah barisnya.
//   3. **Penyaring "belum ditinjau"** yang membuat kunjungan kedua hanya menampilkan
//      yang belum — tanpa itu, tinjauan yang terpotong harus diulang dari awal.
//
// Mencabut akses TIDAK dikerjakan di sini. Ia perubahan wewenang: butuh alasan (P9),
// transaksi yang sama dengan pembersihan perkecualian menunya (L69), dan pemeriksaan
// bentrok dua admin — semuanya sudah berdiri di Pusat Akses. Baris ini menautkan ke
// sana, dan itu SATU klik lebih jauh yang menukar kelengkapan dengan satu aturan yang
// tidak punya dua salinan.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FileSpreadsheet, RefreshCw, ArrowRight } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import { ROLE_LABELS } from '@/lib/constants';
import {
  MODUL_TINJAUAN, tinjauanKeAoa, type BarisTinjauan,
} from '@/lib/admin/tinjauan-baris';

const tgl = (v: string | null) => v
  ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  : null;

/** Lambang sel: yang DIBERIKAN tebal, yang datang dari peran redup. */
const LAMBANG = { grant: '✓', peran: '·', semua: '·' } as const;

export function TabTinjauan({ onKeAkses }: { onKeAkses: (userId: number) => void }) {
  const [baris, setBaris]   = useState<BarisTinjauan[]>([]);
  const [bulan, setBulan]   = useState(6);
  const [sibuk, setSibuk]   = useState(false);
  const [belumSaja, setBelumSaja] = useState(true);

  const muat = useCallback(async () => {
    setSibuk(true);
    const j = await fetchJson('/api/admin/tinjauan') as
      { ok: boolean; data?: BarisTinjauan[]; bulan?: number; message?: string };
    setSibuk(false);
    if (!j.ok || !j.data) { toast.error(j.message ?? 'Gagal memuat daftar tinjauan.'); return; }
    setBaris(j.data);
    if (j.bulan) setBulan(j.bulan);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- pemuatan awal; pola yang dipakai seluruh panel di folder ini. */
  useEffect(() => { void muat(); }, [muat]);

  // Penyaringnya bekerja pada bendera dari SERVER (`kedaluwarsa`), bukan dari
  // membandingkan tanggal dengan jam peramban: penyaring yang meleset satu hari membuat
  // baris yang harus ditinjau menghilang tanpa gejala apa pun.
  const tampil = useMemo(
    () => belumSaja ? baris.filter(b => b.kedaluwarsa) : baris,
    [baris, belumSaja],
  );
  const belum = baris.filter(b => b.kedaluwarsa).length;

  async function tandai(b: BarisTinjauan) {
    setSibuk(true);
    const j = await fetchJson('/api/admin/tinjauan', {
      method: 'POST', body: JSON.stringify({ user_id: b.id }),
    }) as { ok: boolean; message?: string };
    setSibuk(false);
    if (!j.ok) { toast.error(j.message ?? 'Gagal menandai.'); return; }
    toast.success(`${b.username} ditandai sudah ditinjau.`);
    await muat();
  }

  async function unduh() {
    setSibuk(true);
    try {
      // Pengekspor menerima baris yang SUDAH DIHITUNG layar — `tampil`, bukan hasil
      // pembacaan ulang. Aturan yang sudah mahal dipelajari di rekap E-Anggaran:
      // dokumen yang diunduh wajib memuat angka yang persis sama dengan yang di layar.
      // Di sini taruhannya lebih besar lagi — berkasnya dilampirkan ke auditor.
      const [{ loadExcelJs, addSheetFromAoa, downloadWorkbook }] = await Promise.all([
        import('@/lib/shared/excel-export'),
      ]);
      const ExcelJS = await loadExcelJs();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Tinjauan Akses');
      addSheetFromAoa(ws, tinjauanKeAoa(tampil), {
        colWidths: [
          { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 11 }, { wch: 13 },
          ...MODUL_TINJAUAN.map(() => ({ wch: 15 })),
          { wch: 10 }, { wch: 14 }, { wch: 16 },
        ],
      });
      const stempel = new Date().toISOString().slice(0, 10);
      await downloadWorkbook(wb, `Tinjauan-Akses-${stempel}.xlsx`);
      toast.success('Berkas tinjauan diunduh.');
    } catch (e) {
      console.error('[Tinjauan export]', e);
      toast.error('Gagal menyusun berkas Excel.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div>
      <div className="ap-pm-kepala">
        <div className="ap-section-title" style={{ margin: 0, border: 'none', padding: 0 }}>TINJAUAN AKSES</div>
        <div className="ap-row" style={{ gap: 10 }}>
          <label className="ap-pa-arsip">
            <input type="checkbox" checked={belumSaja} onChange={e => setBelumSaja(e.target.checked)}/>
            Belum ditinjau {bulan} bulan terakhir ({belum})
          </label>
          <PrimaButton size="sm" variant="ghost" disabled={sibuk}
            iconLeft={<RefreshCw size={12}/>} onClick={() => void muat()}>MUAT ULANG</PrimaButton>
          <PrimaButton size="sm" variant="success" disabled={sibuk || tampil.length === 0}
            iconLeft={<FileSpreadsheet size={13}/>} onClick={() => void unduh()}>EXCEL</PrimaButton>
        </div>
      </div>

      {/* Dibungkus SATU <span>. `.ap-pa-catatan` itu flex row — dibuat untuk ikon + satu
          baris — jadi prosa ber-<b> di dalamnya dipecah jadi kolom-kolom terpisah dan
          kalimatnya berantakan. Ketahuan dari tangkapan layar, bukan dari kodenya. */}
      <div className="ap-pa-catatan" style={{ marginBottom: 12 }}>
        <span>
          Baris ini menjawab satu pertanyaan auditor: <b>kapan wewenang orang ini terakhir
          diperiksa, dan oleh siapa</b>. Tanda <b>✓</b> = akses yang <b>diberikan</b> — itu
          yang perlu diputuskan tiap tinjauan; <b>·</b> = datang dari perannya, dan berubah
          sendiri kalau perannya berubah.
        </span>
      </div>

      {tampil.length === 0 ? (
        <div className="ap-pm-bersih">
          <CheckCircle2 size={15}/>
          <span>{belumSaja ? `Semua akun sudah ditinjau dalam ${bulan} bulan terakhir.` : 'Tidak ada akun.'}</span>
        </div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table ap-tj">
            <thead><tr>
              <th>ORANG</th><th>PERAN</th>
              {MODUL_TINJAUAN.map(m => <th key={m.kunci} className="ap-tj-modul">{m.label}</th>)}
              <th>DIBERI</th><th>DITINJAU</th><th>AKSI</th>
            </tr></thead>
            <tbody>
              {tampil.map(b => (
                <tr key={b.id}>
                  <td>
                    <div className="ap-tj-nama">{b.username}</div>
                    <div className="ap-tj-sub">{b.nama ?? '—'} · {b.status}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{ROLE_LABELS[b.peran] ?? b.peran}</td>
                  {b.akses.map((a, i) => (
                    <td key={MODUL_TINJAUAN[i].kunci} className={`ap-tj-sel${a === 'grant' ? ' beri' : ''}`}>
                      {a ? LAMBANG[a] : ''}
                    </td>
                  ))}
                  <td className="mono" style={{ fontWeight: 700 }}>{b.jumlahGrant}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {tgl(b.ditinjauPada)
                      ? <>
                          <div>{tgl(b.ditinjauPada)}</div>
                          <div className="ap-tj-sub">oleh {b.ditinjauOleh ?? '—'}</div>
                        </>
                      : <span className="ap-badge badge-yellow">BELUM PERNAH</span>}
                  </td>
                  <td>
                    <div className="ap-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <PrimaButton size="sm" variant="success" disabled={sibuk}
                        iconLeft={<CheckCircle2 size={12}/>} onClick={() => void tandai(b)}>
                        SUDAH DITINJAU
                      </PrimaButton>
                      {/* Mengubahnya dikerjakan di Pusat Akses — satu klik lebih jauh,
                          ditukar dengan aturan alasan & pembersihan izin menu yang tidak
                          punya dua salinan. */}
                      <PrimaButton size="sm" variant="ghost" disabled={sibuk}
                        iconRight={<ArrowRight size={12}/>} onClick={() => onKeAkses(b.id)}>
                        ATUR
                      </PrimaButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
