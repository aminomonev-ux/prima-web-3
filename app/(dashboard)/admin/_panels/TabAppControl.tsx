'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pola muat-awal lama, dipindah apa adanya dari admin-client.tsx */
// app/(dashboard)/admin/_panels/TabAppControl.tsx
//
// Tahap 4 — layar sakelar digambar ulang dari registry.
//
// Dulu ia merender `Object.entries(APP_STATUS_LABELS)` sebagai satu hamparan kartu
// datar: sub-sakelar Realisasi BLUD berdiri sejajar dengan modul induknya, dan tidak
// ada apa pun di layar yang menyatakan bahwa mematikan BLUD ikut mematikannya. Sekarang
// susunannya mengikuti `SAKELAR_INFO` — induk di atas, turunannya menjorok di bawahnya.
//
// Dua hal yang benar-benar baru:
//
//   1. **Lencana Terjaga / Belum terjaga.** Ia menjawab pertanyaan yang selama ini
//      hanya bisa dijawab dengan membaca kode: apakah mematikan sakelar ini menutup
//      sesuatu di server, atau cuma menyembunyikan tombol? T-1 dan T-5 dua-duanya
//      lahir dari pertanyaan itu tidak punya jawaban yang terlihat. Jawabannya
//      DITURUNKAN dari registry — daftar yang sama yang dipakai gate G di CI.
//
//   2. **Pesan & tenggat (P6).** Sakelar tanpa kalimat sama saja dengan menutup pintu
//      tanpa menempel kertas. Yang ditulis di sini muncul di `/maintenance` dan di
//      kartu `/menu` — dan hanya selama sakelarnya memang mati.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, ShieldCheck, ShieldAlert, Save, X } from 'lucide-react';
import { fetchJson } from '@/lib/shared/api';
import { SAKELAR_INFO, formatSampai } from '@/lib/registry/apps';
import { type AppStatus } from './_shared';

const PESAN_MAKS = 300;

type Teks = Record<string, string>;
type Draf = { pesan: string; sampai: string };

export function TabAppControl({ isSA }: { isSA:boolean }) {
  const [status, setStatus] = useState<AppStatus>({});
  const [pesan,  setPesan]  = useState<Teks>({});
  const [sampai, setSampai] = useState<Teks>({});
  const [loading, setLoad]  = useState(false);
  const [ok, setOk]         = useState('');
  const [err, setErr]       = useState('');
  // Kunci sakelar yang panel pesannya sedang dibuka, beserta isian yang belum disimpan.
  const [draf, setDraf]     = useState<Record<string, Draf>>({});

  const load = useCallback(async()=>{
    const r = await fetchJson<AppStatus>('/api/admin/app-status');
    const j = r as { ok: boolean; data?: AppStatus; pesan?: Teks; sampai?: Teks };
    if (j.ok && j.data) { setStatus(j.data); setPesan(j.pesan ?? {}); setSampai(j.sampai ?? {}); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  // Sakelar yang mati DAN belum punya kalimat. Diangkat ke atas karena inilah keadaan
  // yang paling merugikan: orang menemukan pintu tertutup tanpa keterangan apa pun,
  // lalu menelepon — yang persis dihindari P6.
  const tanpaPesan = useMemo(
    () => SAKELAR_INFO.filter((s) => (status[s.kunci] ?? 'online') !== 'online' && !pesan[s.kunci]),
    [status, pesan],
  );

  async function kirim(kunci: string, body: Record<string, string>, kabar: string) {
    setLoad(true); setErr('');
    const r = await fetchJson('/api/admin/app-status', {
      method: 'POST', body: JSON.stringify({ key: kunci, ...body }),
    });
    setLoad(false);
    if (r.ok) { setOk(kabar); await load(); }
    else { setErr((r as { message?: string }).message ?? 'Gagal menyimpan.'); await load(); }
  }

  async function toggle(kunci: string, label: string) {
    if (!isSA) return;
    const baru = (status[kunci] ?? 'online') === 'online' ? 'maintenance' : 'online';
    setStatus(p=>({...p,[kunci]:baru}));
    await kirim(kunci, { value: baru }, `${label} → ${baru.toUpperCase()}`);
  }

  function bukaDraf(kunci: string) {
    setDraf(p => ({ ...p, [kunci]: { pesan: pesan[kunci] ?? '', sampai: sampai[kunci] ?? '' } }));
  }
  function tutupDraf(kunci: string) {
    setDraf(p => { const n = { ...p }; delete n[kunci]; return n; });
  }
  async function simpanDraf(kunci: string, label: string) {
    const d = draf[kunci];
    if (!d) return;
    await kirim(kunci, { pesan: d.pesan, sampai: d.sampai }, `Pesan pemeliharaan ${label} disimpan`);
    tutupDraf(kunci);
  }

  return (
    <div>
      {ok  && <div className="msg-ok"  style={{marginBottom:12}}>{ok}</div>}
      {err && <div className="msg-err" style={{marginBottom:12}}>{err}</div>}
      <div className="ap-section-title">SAKELAR APLIKASI</div>
      {!isSA && <div className="msg-err" style={{marginBottom:12}}>Hanya SUPER_ADMIN yang dapat mengubah status aplikasi.</div>}

      {tanpaPesan.length > 0 && (
        <div className="ap-sk-ingat">
          <MessageSquare size={14}/>
          <span>
            {tanpaPesan.length} sakelar mati tanpa keterangan: {tanpaPesan.map(s=>s.label).join(', ')}.
            Orang yang menabraknya cuma melihat &ldquo;sedang dipelihara&rdquo; tanpa tahu sampai kapan.
          </span>
        </div>
      )}

      <div className="ap-sk-grid">
        {SAKELAR_INFO.map(s => {
          const val      = status[s.kunci] ?? 'online';
          const isOnline = val === 'online';
          const indukMati = s.induk ? (status[s.induk] ?? 'online') !== 'online' : false;
          const d        = draf[s.kunci];
          const adaTeks  = Boolean(pesan[s.kunci] || sampai[s.kunci]);
          const bolehIsi = isSA && (!isOnline || adaTeks);

          return (
            <div key={s.kunci} className={`ap-card ap-sk${s.induk ? ' anak' : ''}`}>
              <div className="ap-sk-atas">
                <div className="ap-sk-kiri">
                  <div className="ap-sk-label">{s.label}</div>
                  <div className="ap-row" style={{gap:6}}>
                    <span className={`ap-badge ${isOnline?'badge-green':'badge-yellow'}`}>
                      {isOnline?'ONLINE':'MAINTENANCE'}
                    </span>
                    {/* `data-tooltip`, bukan `title=` — kotak putih bawaan peramban
                        dilarang DESIGN-SYSTEM, dan aturan `[data-tooltip]` di
                        globals.css sudah berlaku di sini. */}
                    <span
                      className={`ap-badge ${s.terjaga?'badge-cyan':'badge-red'}`}
                      data-tooltip={s.sebab}
                    >
                      {s.terjaga ? <ShieldCheck size={11}/> : <ShieldAlert size={11}/>}
                      {s.terjaga ? 'TERJAGA' : 'BELUM TERJAGA'}
                    </span>
                  </div>
                  {!s.terjaga && <div className="ap-sk-sebab">{s.sebab}</div>}
                  {indukMati && isOnline && (
                    <div className="ap-sk-sebab">Sudah ikut mati karena induknya dimatikan.</div>
                  )}
                </div>
                {isSA && (
                  <label className="ap-toggle" style={{cursor:loading?'wait':'pointer'}}>
                    <input type="checkbox" checked={isOnline} disabled={loading} onChange={()=>toggle(s.kunci, s.label)}/>
                    <div className="ap-toggle-track"/>
                    <div className="ap-toggle-thumb"/>
                  </label>
                )}
              </div>

              {(adaTeks || !isOnline) && !d && (
                <div className="ap-sk-teks">
                  {pesan[s.kunci]
                    ? <div className="ap-sk-pesan">{pesan[s.kunci]}</div>
                    : <div className="ap-sk-kosong">Belum ada keterangan untuk pemakai.</div>}
                  {formatSampai(sampai[s.kunci] ?? '') && (
                    <div className="ap-sk-sampai">Diperkirakan selesai {formatSampai(sampai[s.kunci] ?? '')}</div>
                  )}
                  {bolehIsi && (
                    <button className="ap-btn ap-btn-cyan" style={{marginTop:8}} type="button" onClick={()=>bukaDraf(s.kunci)}>
                      <MessageSquare size={12}/> {pesan[s.kunci] ? 'UBAH KETERANGAN' : 'TULIS KETERANGAN'}
                    </button>
                  )}
                </div>
              )}

              {d && (
                <div className="ap-sk-teks">
                  <textarea
                    className="ap-input ap-sk-area"
                    maxLength={PESAN_MAKS}
                    rows={3}
                    placeholder="Mis. Perbaikan rumus rekap. Bisa dipakai lagi Senin pagi. Tanya Bagian Program kalau mendesak."
                    value={d.pesan}
                    onChange={e=>setDraf(p=>({...p,[s.kunci]:{...p[s.kunci],pesan:e.target.value}}))}
                  />
                  <div className="ap-sk-baris">
                    <label className="ap-sk-lbl">Perkiraan selesai</label>
                    <input
                      className="ap-input"
                      type="datetime-local"
                      value={d.sampai}
                      onChange={e=>setDraf(p=>({...p,[s.kunci]:{...p[s.kunci],sampai:e.target.value}}))}
                    />
                  </div>
                  <div className="ap-row" style={{marginTop:10}}>
                    <button className="ap-btn ap-btn-green" type="button" disabled={loading} onClick={()=>simpanDraf(s.kunci, s.label)}>
                      <Save size={12}/> SIMPAN
                    </button>
                    <button className="ap-btn ap-btn-cyan" type="button" onClick={()=>tutupDraf(s.kunci)}>
                      <X size={12}/> BATAL
                    </button>
                    <span className="ap-sk-hitung">{d.pesan.length}/{PESAN_MAKS}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
