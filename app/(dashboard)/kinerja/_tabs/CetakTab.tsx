'use client';
// ─── PRIMA E-Anggaran — Cetak Tab ──────────────────────────────────────────────
// O2: extract dari kinerja-client.tsx renderCetakPanel (line 1789-2213, ~425 LOC).
// View-only tab: read realisasiRows + realisasiAllRows dari shell via props.
// State lokal: cetakView, cetakBulan, rekapBulan, rekapDepth (filter UI).

import { useState } from 'react';
import { fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import SoftSelect from '@/components/ui/SoftSelect';
import PrimaButton from '@/components/ui/PrimaButton';
import DownloadButton from '@/components/ui/DownloadButton';
import { Printer } from 'lucide-react';
import type { SumberSSK, RealRow } from '../_types';
import { SUMBER_LIST, SSK_THEME, CRR_BULAN_LABELS } from '../_utils';
import { exportRealisasiExcel, exportRealisasiPdf } from '../_exports';
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
              style={{ padding:'6px 16px', borderRadius:'50px', border:`1.5px solid ${active ? SSK_THEME[s].color : (isLight?'rgba(139,92,246,.25)':'rgba(12,68,124,.5)')}`, fontSize:'11px', fontWeight:700, cursor:'pointer', background: active ? SSK_THEME[s].grad : (isLight?'#FFFFFF':'rgba(4,44,83,.5)'), color: active ? 'white': cetakView==='rekap' ? (isLight?'#9CA3AF':'#4B7BA8') : SSK_THEME[s].color, transition:'all .18s', opacity: cetakView==='rekap' ? 0.5 : 1 }}>
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
        const allBulanRekap = [...new Set(realisasiAllRows.map(r => r.bulan))].sort((a,b) => a-b);
        const bulanMaxRekap = allBulanRekap.length > 0 ? Math.max(...allBulanRekap) : 0;
        const selectedBulan = rekapBulan === 0 ? bulanMaxRekap : rekapBulan;
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
                <PrimaButton variant="purple" iconLeft={<Printer size={14} />} onClick={() => window.print()}>
                  Print
                </PrimaButton>
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
        const allBulan = [...new Set(realisasiAllRows.map(r => r.bulan))].sort((a,b) => a-b);
        const bulanMax = allBulan.length > 0 ? Math.max(...allBulan) : 0;
        const bulanTerpilih = rekapBulan === 0 ? bulanMax : rekapBulan;
        if (bulanTerpilih === 0) return (
          <div style={{ padding:'40px', textAlign:'center', color:cTextSub, background:cSurface, borderRadius:'12px', border:`1px solid ${cBorder}` }}>
            {loadingData ? 'Memuat data rekap...' : 'Belum ada data realisasi untuk tahun ' + tahun + '.'}
          </div>
        );

        const rowsBulanMax = realisasiAllRows.filter(r => r.bulan === bulanTerpilih);

        // Build hierarki: program → kegiatan → subkegiatan → uraian_ssk → rekening
        type RekapItem = { keterangan: string; pagu: number; akumTgtPct: number; akumRealFisik: number; akumPctFisik: number; akumKeu: number; akumPctKeu: number; devFisik: number; devKeu: number; };

        // Aggregate by hierarki
        const progMap = new Map<string, Map<string, Map<string, Map<string, RekapItem[]>>>>();
        for (const r of rowsBulanMax) {
          const prog = r.program || '-';
          const keg  = r.kegiatan || '-';
          const sub  = r.subkegiatan || '-';
          const ssk  = r.uraian_ssk || '-';
          if (!progMap.has(prog)) progMap.set(prog, new Map());
          const kegMap = progMap.get(prog)!;
          if (!kegMap.has(keg)) kegMap.set(keg, new Map());
          const subMap = kegMap.get(keg)!;
          if (!subMap.has(sub)) subMap.set(sub, new Map());
          const sskMap = subMap.get(sub)!;
          if (!sskMap.has(ssk)) sskMap.set(ssk, []);
          sskMap.get(ssk)!.push({
            keterangan: r.keterangan,
            pagu: r.pagu_awal,
            akumTgtPct: r.akum_target_fisik,
            akumRealFisik: r.akum_real_fisik,
            akumPctFisik: r.akum_pct_fisik,
            akumKeu: r.akum_keuangan,
            akumPctKeu: r.akum_pct_keuangan,
            devFisik: r.deviasi_fisik,
            devKeu: r.deviasi_keuangan,
          });
        }

        const agg = (items: RekapItem[]) => {
          const pagu          = items.reduce((s,r) => s + r.pagu, 0);
          const akumTgtRp     = items.reduce((s,r) => s + Math.round(r.akumTgtPct / 100 * r.pagu), 0);
          const akumTgtPct    = pagu > 0 ? Math.round(akumTgtRp / pagu * 10000) / 100 : 0;
          const akumRealFisik = items.reduce((s,r) => s + r.akumRealFisik, 0);
          const akumKeu       = items.reduce((s,r) => s + r.akumKeu, 0);
          return { pagu, akumTgtPct, akumTgtRp, akumRealFisik, akumKeu };
        };
        const pct = (val: number, pagu: number) => pagu > 0 ? Math.round(val/pagu*10000)/100 : 0;
        const color = (v: number) => v >= 100 ? '#16a34a' : v >= 50 ? '#f59e0b' : '#dc2626';

        const thR: React.CSSProperties = { padding:'6px 8px', border:`1px solid ${cBorder}`, fontWeight:700, fontSize:'10px', color: isLight?'#5B21B6':'#E6F1FB', background:cTableHeadBg, whiteSpace:'nowrap', textAlign:'center' };
        const tdR = (align: 'left'|'right'|'center' = 'right', extra?: React.CSSProperties): React.CSSProperties => ({ padding:'5px 8px', border:`1px solid ${cBorder}`, fontSize:'11px', color:cTextPrimary, textAlign: align, ...extra });

        let rowNo = 0;
        const rows: React.ReactNode[] = [];

        // Grand total
        const allItems = rowsBulanMax;
        if (allItems.length === 0) return (
          <div style={{ padding:'40px', textAlign:'center', color:cTextSub, background:cSurface, borderRadius:'12px', border:`1px solid ${cBorder}` }}>
            Belum ada data realisasi untuk {realisasiSumber} tahun {tahun}.
          </div>
        );
        const gtPagu    = allItems.reduce((s,r) => s + r.pagu_awal, 0);
        const gtAkumR   = allItems.reduce((s,r) => s + r.akum_real_fisik, 0);
        const gtAkumK   = allItems.reduce((s,r) => s + r.akum_keuangan, 0);
        const gtTgtRp   = allItems.reduce((s,r) => s + Math.round(r.akum_target_fisik / 100 * r.pagu_awal), 0);
        const gtAkumTgt = gtPagu > 0 ? Math.round(gtTgtRp / gtPagu * 10000) / 100 : 0;

        // Row render helper
        const pushRow = (no: number|null, label: string, pagu: number, akumTgt: number, akumR: number, akumK: number, bg: string, indent: number, bold: boolean) => {
          const apf  = pct(akumR, pagu);                              // Real Fisik %
          const apk  = pct(akumK, pagu);                              // Real Keu %
          const tgtKeuRp = pagu > 0 ? Math.round(akumTgt/100*pagu) : 0; // Target Keu (Rp)
          // #5: konvensi deviasi seragam dgn server: realisasi − target
          // (positif = melampaui target) — rumus deviasi umum.
          const devF = Math.round((apf - akumTgt)*100)/100;
          const devK = Math.round((apk - akumTgt)*100)/100;
          rows.push(
            <tr key={`${label}-${no}`} style={{ background: bg }}>
              <td style={{ ...tdR('center'), fontWeight: bold?800:400 }}>{no ?? ''}</td>
              <td style={{ ...tdR('left'), paddingLeft: `${8 + indent*16}px`, fontWeight: bold?700:400 }}>{label}</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400 }}>{fmtNum(pagu)}</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400 }}>{akumTgt.toFixed(2)}%</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400 }}>{fmtNum(akumR)}</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400, color: color(apf) }}>{apf.toFixed(2)}%</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400, color: devF>=0?'#16a34a':'#dc2626' }}>{devF.toFixed(2)}%</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400, color: '#b45309' }}>{fmtNum(tgtKeuRp)}</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400 }}>{fmtNum(akumK)}</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400, color: color(apk) }}>{apk.toFixed(2)}%</td>
              <td style={{ ...tdR(), fontWeight: bold?700:400, color: devK>=0?'#16a34a':'#dc2626' }}>{devK.toFixed(2)}%</td>
            </tr>
          );
        };

        // Grand total row (no 1)
        rowNo++;
        pushRow(rowNo, `RSJD Dr. Amino Gondohutomo`, gtPagu, gtAkumTgt, gtAkumR, gtAkumK, 'rgba(12,68,124,.5)', 0, true);

        for (const [prog, kegMap] of progMap) {
          const progItems = Array.from(kegMap.values()).flatMap(sm => Array.from(sm.values()).flatMap(sk => Array.from(sk.values()).flat()));
          const pa = agg(progItems);
          rowNo++;
          pushRow(rowNo, prog, pa.pagu, pa.akumTgtPct, pa.akumRealFisik, pa.akumKeu, isLight?'rgba(139,92,246,.18)':'rgba(24,95,165,.25)', 1, true);
          if (rekapDepth === 'program') continue;

          for (const [keg, subMap] of kegMap) {
            const kItems = Array.from(subMap.values()).flatMap(sk => Array.from(sk.values()).flat());
            const ka = agg(kItems);
            rowNo++;
            pushRow(rowNo, keg, ka.pagu, ka.akumTgtPct, ka.akumRealFisik, ka.akumKeu, isLight?'rgba(139,92,246,.10)':'rgba(4,44,83,.7)', 2, false);
            if (rekapDepth === 'kegiatan') continue;

            for (const [sub, sskMap] of subMap) {
              const sItems = Array.from(sskMap.values()).flat();
              const sa = agg(sItems);
              rowNo++;
              pushRow(rowNo, `** ${sub}`, sa.pagu, sa.akumTgtPct, sa.akumRealFisik, sa.akumKeu, isLight?'rgba(139,92,246,.06)':'rgba(4,44,83,.4)', 3, false);
              if (rekapDepth === 'subkegiatan') continue;

              for (const [ssk, rItems] of sskMap) {
                const ra = agg(rItems);
                rowNo++;
                pushRow(rowNo, ssk, ra.pagu, ra.akumTgtPct, ra.akumRealFisik, ra.akumKeu, isLight?'rgba(139,92,246,.03)':'rgba(4,44,83,.2)', 4, false);

                if (rekapDepth === 'full') {
                  for (const item of rItems) {
                    rowNo++;
                    pushRow(rowNo, item.keterangan, item.pagu, item.akumTgtPct, item.akumRealFisik, item.akumKeu, cSurface, 5, false);
                  }
                }
              }
            }
          }
        }

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
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'11px' }}>
                <thead>
                  <tr>
                    {['No','Uraian','Anggaran (Rp)','Target s/d Bln Ini (%)','Realisasi Fisik s/d Bln Ini (Rp)','Realisasi Fisik s/d Bln Ini (%)','Deviasi Fisik (%)','Target Keu s/d Bln Ini (Rp)','Realisasi Keu s/d Bln Ini (Rp)','Realisasi Keu s/d Bln Ini (%)','Deviasi Keu (%)'].map((h,i) => (
                      <th key={i} style={{ ...thR, textAlign: i===1?'left':'center' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>{rows}</tbody>
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
            // Totals
            const totPagu    = rows.reduce((s,r) => s + r.pagu_awal, 0);
            // #3: total target % WAJIB weighted by pagu (Σ % antar-item beda pagu
            // tidak valid) — pola sama dgn agg() di view Rekap.
            const totTgtRp   = rows.reduce((s,r) => s + Math.round((r.target_fisik / 100) * r.pagu_awal), 0);
            const totTgt     = totPagu > 0 ? Math.round((totTgtRp / totPagu) * 10000) / 100 : 0;
            const totReal    = rows.reduce((s,r) => s + r.real_fisik, 0);
            const totPctF    = totPagu > 0 ? Math.round((totReal / totPagu) * 10000) / 100 : 0;
            // #4: akum target total = weighted agregat, bukan nilai baris terakhir.
            const totAkumTgtRp = rows.reduce((s,r) => s + Math.round((r.akum_target_fisik / 100) * r.pagu_awal), 0);
            const totAkumTgt   = totPagu > 0 ? Math.round((totAkumTgtRp / totPagu) * 10000) / 100 : 0;
            const totAkumR   = rows.reduce((s,r) => s + r.akum_real_fisik, 0);
            const totAkumPF  = totPagu > 0 ? Math.round((totAkumR / totPagu) * 10000) / 100 : 0;
            const totRealKeu = rows.reduce((s,r) => s + r.real_keuangan, 0);
            const totPctKeu  = totPagu > 0 ? Math.round((totRealKeu / totPagu) * 10000) / 100 : 0;
            const totAkumKeu = rows.reduce((s,r) => s + r.akum_keuangan, 0);
            const totAkumPK  = totPagu > 0 ? Math.round((totAkumKeu / totPagu) * 10000) / 100 : 0;
            // #2/#7: deviasi total satu satuan (%) & satu konvensi (realisasi −
            // target, positif = melampaui) — sebelumnya campur % dgn Rp.
            const totDevF    = Math.round((totAkumPF - totAkumTgt) * 100) / 100;
            const totDevKeu  = Math.round((totAkumPK - totAkumTgt) * 100) / 100;

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
                        <td style={{ ...tdP(), fontWeight:800 }}>{fmtNum(totPagu)}</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{totTgt.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color:'#16a34a' }}>{fmtNum(totReal)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: totPctF>=100?'#16a34a':totPctF>=50?'#f59e0b':'#dc2626' }}>{totPctF.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{totAkumTgt.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{fmtNum(totAkumR)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: totAkumPF>=100?'#16a34a':totAkumPF>=50?'#f59e0b':'#dc2626' }}>{totAkumPF.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color:'#16a34a' }}>{fmtNum(totRealKeu)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: totPctKeu>=100?'#16a34a':totPctKeu>=50?'#f59e0b':'#dc2626' }}>{totPctKeu.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800 }}>{fmtNum(totAkumKeu)}</td>
                        <td style={{ ...tdP(), fontWeight:800, color: totAkumPK>=100?'#16a34a':totAkumPK>=50?'#f59e0b':'#dc2626' }}>{totAkumPK.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color: totDevF>=0?'#16a34a':'#dc2626' }}>{totDevF.toFixed(2)}%</td>
                        <td style={{ ...tdP(), fontWeight:800, color: totDevKeu>=0?'#16a34a':'#dc2626' }}>{totDevKeu.toFixed(2)}%</td>
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
