'use client';
// ─── PRIMA E-Anggaran — Cetak Tab ──────────────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderCetakPanel (line 1789-2213, ~425 LOC).
// View-only tab: read realisasiRows + realisasiAllRows dari shell via props.
// State lokal: cetakView, cetakBulan, rekapBulan, rekapDepth (filter UI).

import { useMemo, useState } from 'react';
import { fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import SoftSelect from '@/components/ui/SoftSelect';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import { Printer } from 'lucide-react';
import type { SumberSSK, RealRow } from '../_types';
import { SUMBER_LIST, SSK_THEME, CRR_BULAN_LABELS } from '../_utils';
import { hitungRekap, bulanTersedia } from '@/lib/kinerja/rekap';
import { hitungJumlahBulan, bulanBerdata } from '@/lib/kinerja/cetak-detail';
import { exportRealisasiExcel, exportRealisasiPdf, exportRekapExcel, exportRekapPdf,
  exportBundelExcel, exportBundelPdf, type BagianDetail } from '../_exports';
import { uiTheme } from '@/lib/theme';

interface Props {
  realisasiRows: RealRow[];
  realisasiAllRows: RealRow[];
  realisasiSumber: SumberSSK;
  setRealisasiSumber: (s: SumberSSK) => void;
  tahun: string;
  loadingData: boolean;
  onFetchAll: () => void;
  isLight?: boolean;
  // Refactor Versi (Checkpoint C):
  sskVersi?: { tipe: 'MURNI'|'PERUBAHAN'; seq: number };
}

export default function CetakTab({
  realisasiRows, realisasiAllRows, realisasiSumber, setRealisasiSumber,
  tahun, loadingData, onFetchAll,
  isLight = false, sskVersi,
}: Props) {
  const versiLabel = sskVersi
    ? (sskVersi.tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${sskVersi.seq}`)
    : 'MURNI';
  // Surface/teks dari lib/theme; aksen ungu/pink Kinerja tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cSurfaceForm = isLight ? 'rgba(139,92,246,.06)' : 'rgba(4,44,83,.8)';
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cTextSubAlt  = t.textSubAlt;
  const cTableHeadBg = isLight ? 'linear-gradient(135deg,rgba(139,92,246,.14),rgba(236,72,153,.10))' : 'rgba(4,44,83,.9)';
  const theme = SSK_THEME[realisasiSumber];

  // State lokal panel (filter UI)
  const [cetakView, setCetakView] = useState<'detail'|'rekap'>('detail');
  const [cetakBulan, setCetakBulan] = useState<number | 'semua'>('semua');
  const [rekapBulan, setRekapBulan] = useState<number>(0);
  const [rekapDepth, setRekapDepth] = useState<'program'|'kegiatan'|'subkegiatan'|'ssk'|'full'>('ssk');
  // Bundel: sumber yang ikut diunduh + cakupan bulan bagian detailnya.
  const [bundelSumber, setBundelSumber] = useState<SumberSSK[]>([]);
  const [bundelBulan,  setBundelBulan]  = useState<'ikut'|'semua'|number>('ikut');
  const [bukaPilihan,  setBukaPilihan]  = useState(false);

  // Rekap dihitung SEKALI di sini, dipakai bilah alat (unduh) DAN tabel. Dua
  // pemanggilan = dua jawaban kalau salah satunya kelewat disesuaikan, dan yang
  // diunduh wajib memuat angka yang persis sama dengan yang dilihat di layar.
  const bulanRekapAda   = bulanTersedia(realisasiAllRows);
  const bulanRekapPilih = rekapBulan === 0
    ? (bulanRekapAda.length > 0 ? Math.max(...bulanRekapAda) : 0)
    : rekapBulan;
  const rekap = useMemo(
    () => bulanRekapPilih === 0
      ? null
      : hitungRekap(realisasiAllRows, bulanRekapPilih, rekapDepth, 'RSJD Dr. Amino Gondohutomo'),
    [realisasiAllRows, bulanRekapPilih, rekapDepth],
  );

  // Sumber yang benar-benar ada datanya — bawaan pilihan, supaya bundel tidak
  // berisi sheet kosong yang membuat berkasnya lebih sulit dibaca, bukan lebih
  // lengkap. "Semua sumber" tetap tersedia.
  const sumberBerdata = SUMBER_LIST.filter(sm => realisasiAllRows.some(r => r.sumber === sm));

  const bagianDetail = (): BagianDetail[] => bundelSumber.map(sm => {
    const rows = realisasiAllRows.filter(r => r.sumber === sm);
    const ada  = bulanBerdata(rows);
    const bulan = bundelBulan === 'semua' ? ada
      : bundelBulan === 'ikut' ? ada.filter(x => x <= bulanRekapPilih)
      : ada.filter(x => x === bundelBulan);
    return { sumber: sm, rows, bulan };
  });

  const paramRekap = () => ({
    baris: rekap!.baris, yatim: rekap!.yatim, tahun,
    namaBulan: CRR_BULAN_LABELS[bulanRekapPilih-1],
  });
  // Dropdown MENGUBAH hasil dua tombol yang sudah ada — tidak menambah tombol.
  // Tanpa sumber dicentang, hasilnya persis seperti sebelumnya: rekap saja.
  const doExportRekapExcel = () => { if (!rekap) return;
    const d = bagianDetail();
    return d.length ? exportBundelExcel({ ...paramRekap(), detail: d }) : exportRekapExcel(paramRekap()); };
  const doExportRekapPdf = () => { if (!rekap) return;
    const d = bagianDetail();
    return d.length ? exportBundelPdf({ ...paramRekap(), detail: d }) : exportRekapPdf(paramRekap()); };

  // Group rows by bulan
  const grouped: Record<number, RealRow[]> = {};
  for (let b = 1; b <= 12; b++) {
    const rows = realisasiRows.filter(r => r.bulan === b);
    if (rows.length > 0) grouped[b] = rows;
  }
  const bulanAda = Object.keys(grouped).map(Number).sort((a,b) => a-b);

  const bulanTampil = cetakBulan === 'semua'
    ? bulanAda
    : bulanAda.filter(b => b === cetakBulan);

  // Table columns definition
  const tHead = ['No','Uraian Kegiatan','Pagu (Rp)','Target Fisik','Real Fisik','% Fisik',
    'Akum. Target','Akum. Real Fisik','Akum. % Fisik',
    'Real Keuangan (Rp)','% Real Keu','Akum. Keuangan (Rp)','Akum. % Keuangan','Deviasi Fisik %','Deviasi Keuangan %'];

  const thPrint: React.CSSProperties = {
    padding:'5px 7px', border:`1px solid ${cBorder}`,
    fontWeight:700, fontSize:'10px', textTransform:'uppercase',
    color: isLight?'#5B21B6':'#E6F1FB', background:cTableHeadBg, whiteSpace:'nowrap', textAlign:'center',
  };
  const tdP = (align: 'left'|'right'|'center' = 'right'): React.CSSProperties => ({
    padding:'5px 7px', border:`1px solid ${cBorder}`, fontSize:'11px',
    color:cTextPrimary, textAlign: align, verticalAlign:'middle',
  });

  // Export wrappers (pure call to _exports.ts)
  const doExportRealisasiExcel = () => exportRealisasiExcel({ rows: realisasiRows, sumber: realisasiSumber, tahun });
  const doExportRealisasiPdf   = () => exportRealisasiPdf  ({ rows: realisasiRows, sumber: realisasiSumber, tahun });

  return (
    <div id="cetak-area" style={{ padding:'20px' }}>
      {/* Sumber selector + Tab Rekap dalam 1 baris — selalu tampil */}
      <div className="no-print" style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'14px', alignItems:'center' }}>
        {SUMBER_LIST.map(s => {
          const active = cetakView !== 'rekap' && realisasiSumber === s;
          return (
            <button key={s}
              onClick={() => { setRealisasiSumber(s); setCetakView('detail'); }}
              style={{ padding:'6px 16px', borderRadius:'50px', border:`1.5px solid ${active ? SSK_THEME[s].color : (isLight?'rgba(139,92,246,.25)':'rgba(12,68,124,.5)')}`, fontSize:'11px', fontWeight:700, cursor:'pointer', background: active ? SSK_THEME[s].grad : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'), color: active ? 'white': cetakView==='rekap' ? (isLight?'#6B7280':'#4B7BA8') : SSK_THEME[s].color, transition:'all .18s', opacity: cetakView==='rekap' ? 0.5 : 1 }}>
              {SSK_THEME[s].label.replace('SSK ','')}
            </button>
          );
        })}
        {/* Separator */}
        <div style={{ width:'1px', height:'24px', background: isLight?'rgba(139,92,246,.2)':'rgba(12,68,124,.5)', margin:'0 4px' }} />
        <button onClick={() => { const next = cetakView === 'rekap' ? 'detail' : 'rekap'; setCetakView(next); if (next === 'rekap') onFetchAll(); }}
          style={{ padding:'6px 16px', borderRadius:'50px', border:`1.5px solid ${cetakView==='rekap' ? '#0891b2' : (isLight?'rgba(139,92,246,.25)':'rgba(12,68,124,.5)')}`, fontSize:'11px', fontWeight:700, cursor:'pointer', background: cetakView==='rekap' ? 'linear-gradient(135deg,#0891b2,#0e7490)' : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'), color: cetakView==='rekap' ? 'white' : cTextSub, transition:'all .18s' }}>
          📊 Rekap
        </button>
      </div>

      {/* Toolbar */}
      {cetakView === 'rekap' ? (() => {
        const allBulanRekap = bulanRekapAda;
        const selectedBulan = bulanRekapPilih;
        return (
          <div className="no-print" style={{ background:cSurfaceForm, border:'1px solid #0891b2', borderRadius:'12px', padding:'12px 16px', marginBottom:'14px', display:'flex', flexDirection:'column', gap:'8px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'8px' }}>
              <div>
                <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary }}>
                  <i className="fas fa-chart-bar" style={{ marginRight:'6px', color:'#0891b2' }} />
                  Rekap Semua Sumber — {tahun}
                </div>
                <div style={{ fontSize:'11px', color:cTextSub, marginTop:'2px' }}>
                  S/D Bulan {selectedBulan > 0 ? CRR_BULAN_LABELS[selectedBulan-1] : '—'}
                </div>
              </div>
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
                <SoftSelect
                  value={rekapBulan}
                  onChange={(v) => setRekapBulan(v)}
                  minWidth={190}
                  options={[
                    { value: 0, label: 'S/D Bulan Terakhir' },
                    ...allBulanRekap.map(b => ({ value: b, label: `S/D ${CRR_BULAN_LABELS[b-1]}` })),
                  ]}
                />
                <SoftSelect
                  value={rekapDepth}
                  onChange={(v) => setRekapDepth(v as 'program'|'kegiatan'|'subkegiatan'|'ssk'|'full')}
                  minWidth={200}
                  options={[
                    { value: 'program',     label: 'S/D Program' },
                    { value: 'kegiatan',    label: 'S/D Kegiatan' },
                    { value: 'subkegiatan', label: 'S/D Subkegiatan' },
                    { value: 'ssk',         label: 'S/D Uraian SSK' },
                    { value: 'full',        label: 'Termasuk Rekening Belanja' },
                  ]}
                />
                <div style={{ position:'relative' }}>
                  <button type="button" onClick={() => setBukaPilihan(v => !v)}
                    style={{ padding:'7px 14px', borderRadius:'8px', fontSize:'11px', fontWeight:700, cursor:'pointer',
                      border:`1.5px solid ${bundelSumber.length ? '#0891b2' : cBorder}`, color: bundelSumber.length ? '#0891b2' : cTextSub,
                      background: isLight?'#FFFFFF':'rgba(4,44,83,.6)' }}>
                    {bundelSumber.length === 0 ? 'Sertakan detail…' : `Detail: ${bundelSumber.length} sumber`} ▾
                  </button>
                  {bukaPilihan && (
                    <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:30, minWidth:'250px',
                      background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'10px', padding:'10px 12px',
                      boxShadow:'0 8px 24px rgba(0,0,0,.18)' }}>
                      <div style={{ fontSize:'10px', fontWeight:700, color:cTextSubAlt, textTransform:'uppercase', marginBottom:'6px' }}>
                        Sumber yang ikut diunduh
                      </div>
                      {SUMBER_LIST.map(sm => {
                        const kosong = !sumberBerdata.includes(sm);
                        return (
                          <label key={sm} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'3px 0',
                            fontSize:'11px', color: kosong ? cTextSub : cTextPrimary, cursor:'pointer' }}>
                            <input type="checkbox" checked={bundelSumber.includes(sm)}
                              onChange={e => setBundelSumber(p => e.target.checked ? [...p, sm] : p.filter(x => x !== sm))} />
                            {sm}{kosong && <span style={{ fontSize:'10px' }}>(belum ada data)</span>}
                          </label>
                        );
                      })}
                      <div style={{ display:'flex', gap:'6px', margin:'8px 0' }}>
                        <button type="button" onClick={() => setBundelSumber(sumberBerdata)}
                          style={{ fontSize:'10px', padding:'4px 8px', borderRadius:'6px', cursor:'pointer',
                            border:`1px solid ${cBorder}`, background:'transparent', color:cTextSub }}>Yang ada datanya</button>
                        <button type="button" onClick={() => setBundelSumber([])}
                          style={{ fontSize:'10px', padding:'4px 8px', borderRadius:'6px', cursor:'pointer',
                            border:`1px solid ${cBorder}`, background:'transparent', color:cTextSub }}>Kosongkan</button>
                      </div>
                      <div style={{ fontSize:'10px', fontWeight:700, color:cTextSubAlt, textTransform:'uppercase', margin:'8px 0 4px' }}>
                        Bulan bagian detail
                      </div>
                      <SoftSelect
                        value={bundelBulan as string | number}
                        onChange={(v) => setBundelBulan(v === 'ikut' || v === 'semua' ? v : Number(v))}
                        minWidth={220}
                        options={[
                          { value: 'ikut'  as string|number, label: `Ikut rekap (s/d ${CRR_BULAN_LABELS[bulanRekapPilih-1] ?? '—'})` },
                          { value: 'semua' as string|number, label: 'Semua bulan berdata' },
                          ...bulanRekapAda.map(bl => ({ value: bl as string|number, label: `Hanya ${CRR_BULAN_LABELS[bl-1]}` })),
                        ]}
                      />
                    </div>
                  )}
                </div>
                <PrimaButton variant="purple" iconLeft={<Printer size={14} />} onClick={() => window.print()}>
                  Print
                </PrimaButton>
                <DownloadButton variant="excel" label="Excel" onClick={doExportRekapExcel} disabled={!rekap} />
                <DownloadButton variant="pdf"   label="PDF"   onClick={doExportRekapPdf}   disabled={!rekap} />
              </div>
            </div>
          </div>
        );
      })() : (
      <div className="no-print" style={{ background:cSurfaceForm, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'12px 16px', marginBottom:'14px', display:'flex', flexDirection:'column', gap:'8px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'8px' }}>
          <div>
            <div style={{ fontSize:'13px', fontWeight:700, color:cTextPrimary }}>
              <i className="fas fa-print" style={{ marginRight:'6px', color:theme.color }} />
              Cetak Realisasi {realisasiSumber} — {tahun}
              <span style={{ marginLeft:'10px', fontSize:'10px', fontWeight:700, color:'#7C5CFC', background:'rgba(124,92,252,.12)', padding:'2px 8px', borderRadius:'6px', border:'1px solid rgba(124,92,252,.3)' }}>
                <i className="fas fa-code-branch" style={{ marginRight:'4px' }} /> {versiLabel}
              </span>
            </div>
            <div style={{ fontSize:'11px', color:cTextSub, marginTop:'2px' }}>
              {bulanAda.length} bulan memiliki data &nbsp;·&nbsp; Berdasarkan SSK <strong style={{ color:cTextPrimary }}>{versiLabel}</strong>
            </div>
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
            <SoftSelect
              value={typeof cetakBulan === 'number' ? cetakBulan : 'semua'}
              onChange={(v) => setCetakBulan(v === 'semua' ? 'semua' : Number(v))}
              minWidth={150}
              options={[
                { value: 'semua' as string | number, label: 'Semua Bulan' },
                ...bulanAda.map(b => ({ value: b as string | number, label: CRR_BULAN_LABELS[b-1] })),
              ]}
            />
            <PrimaButton variant="primary" iconLeft={<Printer size={14} />} onClick={() => window.print()}>
              Print
            </PrimaButton>
            <DownloadButton variant="excel" label="Excel" onClick={doExportRealisasiExcel} />
            <DownloadButton variant="pdf" label="PDF" onClick={doExportRealisasiPdf} />
          </div>
        </div>
      </div>
      )}

      {cetakView === 'rekap' ? (() => {
        // ── REKAP: semua sumber, S/D bulan yang dipilih ──
        // Seluruh rumusnya pindah ke lib/kinerja/rekap.ts supaya bisa diuji;
        // di sini tinggal menggambar.
        const bulanTerpilih = bulanRekapPilih;
        if (bulanTerpilih === 0 || !rekap) return (
          <div style={{ padding:'40px', textAlign:'center', color:cTextSub, background:cSurface, borderRadius:'12px', border:`1px solid ${cBorder}` }}>
            {loadingData ? 'Memuat data rekap...' : 'Belum ada data realisasi untuk tahun ' + tahun + '.'}
          </div>
        );

        const hasil = rekap;
        if (hasil.baris.length === 0) return (
          <div style={{ padding:'40px', textAlign:'center', color:cTextSub, background:cSurface, borderRadius:'12px', border:`1px solid ${cBorder}` }}>
            Belum ada data realisasi untuk tahun {tahun}.
          </div>
        );

        const warna = (v: number) => v >= 100 ? '#16a34a' : v >= 50 ? '#f59e0b' : '#dc2626';
        const thR: React.CSSProperties = { padding:'6px 8px', border:`1px solid ${cBorder}`, fontWeight:700, fontSize:'10px', color: isLight?'#5B21B6':'#E6F1FB', background:cTableHeadBg, whiteSpace:'nowrap', textAlign:'center' };
        const tdR = (align: 'left'|'right'|'center' = 'right', extra?: React.CSSProperties): React.CSSProperties => ({ padding:'5px 8px', border:`1px solid ${cBorder}`, fontSize:'11px', color:cTextPrimary, textAlign: align, ...extra });
        const latar = (indent: number) => indent === 0 ? 'rgba(12,68,124,.5)'
          : indent === 1 ? (isLight?'rgba(139,92,246,.18)':'rgba(24,95,165,.25)')
          : indent === 2 ? (isLight?'rgba(139,92,246,.10)':'rgba(4,44,83,.7)')
          : indent === 3 ? (isLight?'rgba(139,92,246,.06)':'rgba(4,44,83,.4)')
          : indent === 4 ? (isLight?'rgba(139,92,246,.03)':'rgba(4,44,83,.2)')
          : cSurface;

        return (
          <div style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'20px' }}>
            {/* Kop */}
            <div style={{ textAlign:'center', marginBottom:'14px', borderBottom:`2px solid ${theme.color}`, paddingBottom:'12px' }}>
              <div style={{ fontSize:'13px', fontWeight:800, color:cTextPrimary, textTransform:'uppercase' }}>RUMAH SAKIT JIWA DAERAH DR. AMINO GONDOHUTOMO</div>
              <div style={{ fontSize:'11px', color:cTextSub, marginTop:'2px' }}>PROVINSI JAWA TENGAH</div>
              <div style={{ fontSize:'13px', fontWeight:800, color:theme.color, marginTop:'8px', textTransform:'uppercase' }}>
                LAPORAN PERKEMBANGAN PELAKSANAAN BELANJA — REKAP
              </div>
              <div style={{ fontSize:'12px', fontWeight:600, color:cTextSubAlt, marginTop:'2px' }}>
                S/D BULAN {CRR_BULAN_LABELS[bulanTerpilih-1].toUpperCase()} TAHUN {tahun} — SEMUA SUMBER
              </div>
              {/* Angka pagu tanpa keterangan versi adalah angka yang tidak bisa diperiksa. */}
              <div style={{ fontSize:'10px', color:cTextSub, marginTop:'4px' }}>
                Pagu &amp; target mengacu SSK versi aktif tiap sumber
              </div>
            </div>

            {(hasil.yatim.jumlahBaris > 0 || hasil.dobel.jumlahItem > 0) && (
              <div className="no-print" style={{ marginBottom:'12px', display:'flex', flexDirection:'column', gap:'6px' }}>
                {hasil.yatim.jumlahBaris > 0 && (
                  <div style={{ padding:'8px 12px', borderRadius:'8px', fontSize:'11px', lineHeight:1.5,
                    background: isLight?'#FEF3C7':'rgba(245,158,11,.14)', border:'1px solid #FAC775', color: isLight?'#854F0B':'#FAC775' }}>
                    <strong>{hasil.yatim.jumlahItem} rekening yatim</strong> ({hasil.yatim.jumlahBaris} baris, realisasi keuangan {fmtNum(hasil.yatim.nominal)}) tidak ikut dihitung — rekeningnya sudah tidak ada di SSK acuan, jadi tidak punya pagu sebagai pembagi. {hasil.yatim.contoh.join(' · ')}
                  </div>
                )}
                {hasil.dobel.jumlahItem > 0 && (
                  <div style={{ padding:'8px 12px', borderRadius:'8px', fontSize:'11px', lineHeight:1.5,
                    background: isLight?'#FEE2E2':'rgba(226,75,74,.14)', border:'1px solid #E24B4A', color: isLight?'#991B1B':'#FCA5A5' }}>
                    <strong>{hasil.dobel.jumlahItem} rekening punya baris kembar</strong> di bulan yang sama — realisasinya terhitung dobel. Buka tab Realisasi dan hapus salah satunya. {hasil.dobel.contoh.join(' · ')}
                  </div>
                )}
              </div>
            )}

            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                <thead>
                  <tr>
                    {['No','Uraian','Anggaran (Rp)','Target s/d Bln Ini (%)','Realisasi Fisik s/d Bln Ini (Rp)','Realisasi Fisik s/d Bln Ini (%)','Deviasi Fisik (%)','Tingkat Capaian Fisik (%)','Target Keu s/d Bln Ini (Rp)','Bulan Ini (Rp)','Realisasi Keu s/d Bln Ini (Rp)','Realisasi Keu s/d Bln Ini (%)','Deviasi Keu (%)'].map((h,i) => (
                      <th key={i} style={{ ...thR, textAlign: i===1?'left':'center' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hasil.baris.map(b => (
                    <tr key={`${b.no}-${b.label}`} style={{ background: latar(b.indent) }}>
                      <td style={{ ...tdR('center'), fontWeight: b.tebal?800:400 }}>{b.no}</td>
                      <td style={{ ...tdR('left'), paddingLeft: `${8 + b.indent*16}px`, fontWeight: b.tebal?700:400 }}>{b.label}</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400 }}>{fmtNum(b.pagu)}</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400 }}>{b.targetPct.toFixed(2)}%</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400 }}>{fmtNum(b.realFisik)}</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400, color: warna(b.pctFisik) }}>{b.pctFisik.toFixed(2)}%</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400, color: b.devFisik>=0?'#16a34a':'#dc2626' }}>{b.devFisik.toFixed(2)}%</td>
                      {/* Target 0 -> "—", bukan 0%: "0% dari rencana nol" tidak berarti apa-apa. */}
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400, color: b.capaianFisik === null ? cTextSub : warna(b.capaianFisik) }}>
                        {b.capaianFisik === null ? '—' : b.capaianFisik.toFixed(2) + '%'}
                      </td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400, color: '#b45309' }}>{fmtNum(b.targetRp)}</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400 }}>{fmtNum(b.realKeuBulanIni)}</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400 }}>{fmtNum(b.realKeu)}</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400, color: warna(b.pctKeu) }}>{b.pctKeu.toFixed(2)}%</td>
                      <td style={{ ...tdR(), fontWeight: b.tebal?700:400, color: b.devKeu>=0?'#16a34a':'#dc2626' }}>{b.devKeu.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })() : realisasiRows.length === 0 ? (
        <div style={{ padding:'40px', textAlign:'center', color:cTextSub, background:cSurface, borderRadius:'12px', border:`1px solid ${cBorder}` }}>
          Belum ada data realisasi untuk {realisasiSumber} tahun {tahun}.
        </div>
      ) : (
        <div>
          {bulanTampil.map(b => {
            const rows = grouped[b];
            if (!rows || rows.length === 0) return null;
            // Baris JUMLAH: rumusnya di lib/kinerja/cetak-detail.ts supaya layar,
            // Excel, dan PDF memakai satu definisi. Di situ pula dua cacat yang
            // luput dari audit dibereskan — target dari RUPIAH (bukan persen
            // bulat) dan deviasi dari rasio mentah.
            const jml = hitungJumlahBulan(rows);

            return (
              <div key={b} className="print-page" style={{ background:cSurface, border:`1px solid ${cBorder}`, borderRadius:'12px', padding:'20px', marginBottom:'20px', boxShadow: isLight?'0 4px 16px rgba(0,0,0,.06)':'0 4px 16px rgba(0,0,0,.3)' }}>

                {/* ── Kop surat resmi ── */}
                <div style={{ textAlign:'center', marginBottom:'14px', borderBottom:`2px solid ${theme.color}`, paddingBottom:'12px' }}>
                  <div style={{ fontSize:'13px', fontWeight:800, color:cTextPrimary, textTransform:'uppercase', letterSpacing:'.04em' }}>
                    RUMAH SAKIT JIWA DAERAH DR. AMINO GONDOHUTOMO
                  </div>
                  <div style={{ fontSize:'11px', color:cTextSub, marginTop:'2px' }}>
                    PROVINSI JAWA TENGAH
                  </div>
                  <div style={{ fontSize:'14px', fontWeight:800, color:theme.color, marginTop:'10px', textTransform:'uppercase' }}>
                    LAPORAN REALISASI KINERJA {realisasiSumber}
                  </div>
                  <div style={{ fontSize:'12px', fontWeight:600, color:cTextSubAlt, marginTop:'2px' }}>
                    BULAN {CRR_BULAN_LABELS[b-1].toUpperCase()} TAHUN {tahun}
                  </div>
                </div>

                {/* ── Tabel ── */}
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                    <thead>
                      <tr>
                        {tHead.map((h,hi) => (
                          <th key={hi} style={{ ...thPrint, textAlign: hi === 1 ? 'left' : 'center' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, ri) => {
                        const pctF  = r.pct_fisik >= 100 ? '#16a34a' : r.pct_fisik >= 50 ? '#f59e0b' : '#dc2626';
                        const apctF = r.akum_pct_fisik >= 100 ? '#16a34a' : r.akum_pct_fisik >= 50 ? '#f59e0b' : '#dc2626';
                        const apctK = r.akum_pct_keuangan >= 100 ? '#16a34a' : r.akum_pct_keuangan >= 50 ? '#f59e0b' : '#dc2626';
                        return (
                          <tr key={ri} style={{ background: ri%2===0 ? cSurface : (isLight?'#F8F9FC':'rgba(4,44,83,.6)') }}>
                            <td style={{ ...tdP('center'), width:'30px' }}>{ri+1}</td>
                            <td style={{ ...tdP('left'), minWidth:'200px', fontWeight:500 }}>{r.keterangan||'-'}</td>
                            <td style={tdP()}>{fmtNum(r.pagu_awal)}</td>
                            {/* #7: target_fisik satuannya % — format konsisten dgn baris JUMLAH */}
                            <td style={tdP()}>{r.target_fisik.toFixed(2)}%</td>
                            <td style={{ ...tdP(), color:'#16a34a', fontWeight:700 }}>{fmtNum(r.real_fisik)}</td>
                            <td style={{ ...tdP(), color:pctF, fontWeight:700 }}>{r.pct_fisik.toFixed(2)}%</td>
                            <td style={tdP()}>{r.akum_target_fisik.toFixed(2)}%</td>
                            <td style={tdP()}>{fmtNum(r.akum_real_fisik)}</td>
                            <td style={{ ...tdP(), color:apctF, fontWeight:700 }}>{r.akum_pct_fisik.toFixed(2)}%</td>
                            <td style={{ ...tdP(), color:'#16a34a', fontWeight:700 }}>{fmtNum(r.real_keuangan)}</td>
                            <td style={{ ...tdP(), color: r.pct_keuangan>=100?'#16a34a':r.pct_keuangan>=50?'#f59e0b':'#dc2626', fontWeight:700 }}>{r.pct_keuangan.toFixed(2)}%</td>
                            <td style={tdP()}>{fmtNum(r.akum_keuangan)}</td>
                            <td style={{ ...tdP(), color:apctK, fontWeight:700 }}>{r.akum_pct_keuangan.toFixed(2)}%</td>
                            {/* #12: warna deviasi ikut tanda (positif = melampaui = hijau) */}
                            <td style={{ ...tdP(), color: r.deviasi_fisik >= 0 ? '#16a34a' : '#dc2626', fontWeight:600 }}>{r.deviasi_fisik.toFixed(2)}%</td>
                            <td style={{ ...tdP(), color: r.deviasi_keuangan >= 0 ? '#16a34a' : '#dc2626', fontWeight:600 }}>{r.deviasi_keuangan.toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                      {/* Total row */}
                      <tr style={{ background:'rgba(12,68,124,.4)', fontWeight:800 }}>
                        <td colSpan={2} style={{ ...tdP('center'), fontWeight:800, color:cTextPrimary }}>JUMLAH</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{fmtNum(jml.pagu)}</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{jml.targetPct.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color:'#16a34a' }}>{fmtNum(jml.realFisik)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: jml.pctFisik>=100?'#16a34a':jml.pctFisik>=50?'#f59e0b':'#dc2626' }}>{jml.pctFisik.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{jml.akumTgtPct.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{fmtNum(jml.akumFisik)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: jml.akumPctF>=100?'#16a34a':jml.akumPctF>=50?'#f59e0b':'#dc2626' }}>{jml.akumPctF.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color:'#16a34a' }}>{fmtNum(jml.realKeu)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: jml.pctKeu>=100?'#16a34a':jml.pctKeu>=50?'#f59e0b':'#dc2626' }}>{jml.pctKeu.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{fmtNum(jml.akumKeu)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: jml.akumPctKeu>=100?'#16a34a':jml.akumPctKeu>=50?'#f59e0b':'#dc2626' }}>{jml.akumPctKeu.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color: jml.devFisik>=0?'#16a34a':'#dc2626' }}>{jml.devFisik.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color: jml.devKeu>=0?'#16a34a':'#dc2626' }}>{jml.devKeu.toFixed(2)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* ── Blok tanda tangan ── */}
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'28px', gap:'60px', paddingRight:'20px' }}>
                  <div style={{ textAlign:'center', minWidth:'160px' }}>
                    <div style={{ fontSize:'11px', color:cTextSubAlt }}>
                      Semarang, {CRR_BULAN_LABELS[b-1]} {tahun}
                    </div>
                    <div style={{ fontSize:'11px', fontWeight:600, color:cTextSubAlt, marginTop:'2px' }}>
                      Mengetahui,
                    </div>
                    <div style={{ marginTop:'48px', borderTop:`1px solid ${cBorder}`, paddingTop:'4px', fontSize:'11px', fontWeight:700, color:cTextPrimary }}>
                      Kabag Program &amp; Anggaran
                    </div>
                  </div>
                  <div style={{ textAlign:'center', minWidth:'160px' }}>
                    <div style={{ fontSize:'11px', color:cTextSubAlt }}>
                      Semarang, {CRR_BULAN_LABELS[b-1]} {tahun}
                    </div>
                    <div style={{ fontSize:'11px', fontWeight:600, color:cTextSubAlt, marginTop:'2px' }}>
                      Yang membuat,
                    </div>
                    <div style={{ marginTop:'48px', borderTop:`1px solid ${cBorder}`, paddingTop:'4px', fontSize:'11px', fontWeight:700, color:cTextPrimary }}>
                      Kasubag Program
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
