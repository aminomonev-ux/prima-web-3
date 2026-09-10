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
import { MessageSquare, ShieldCheck, ShieldAlert, Save, X, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import PrimaButton from '@/components/ui/PrimaButton';
import { fetchJson } from '@/lib/shared/api';
import {
  SAKELAR_INFO, formatSampai, bacaKeadaan, KEADAAN_SAKELAR, LABEL_KEADAAN,
  SEBAB_TAK_BISA_BEKU, type KeadaanSakelar,
} from '@/lib/registry/apps';
import { type AppStatus } from './_shared';

const PESAN_MAKS = 300;

type Teks = Record<string, string>;
type Draf = { pesan: string; sampai: string };

export function TabAppControl({ isSA }: { isSA:boolean }) {
  const [status, setStatus] = useState<AppStatus>({});
  const [pesan,  setPesan]  = useState<Teks>({});
  const [sampai, setSampai] = useState<Teks>({});
  const [loading, setLoad]  = useState(false);
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
    setLoad(true);
    const r = await fetchJson('/api/admin/app-status', {
      method: 'POST', body: JSON.stringify({ key: kunci, ...body }),
    });
    setLoad(false);
    // Hasil aksi lewat toast; yang BERTAHAN (lantai peran) tetap spanduk sebaris.
    // Pesan yang menghilang sendiri tidak boleh dipakai menjelaskan kenapa sebuah
    // tombol mati — orangnya akan menatap tombol mati tanpa keterangan.
    if (r.ok) { toast.success(kabar); await load(); }
    else { toast.error((r as { message?: string }).message ?? 'Gagal menyimpan.'); await load(); }
  }

  async function pilihKeadaan(kunci: string, label: string, baru: KeadaanSakelar) {
    if (!isSA) return;
    if (bacaKeadaan(status[kunci]) === baru) return;
    setStatus(p=>({...p,[kunci]:baru}));
    await kirim(kunci, { value: baru }, `${label} → ${LABEL_KEADAAN[baru]}`);
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
      <div className="ap-section-title">SAKELAR APLIKASI</div>
      {!isSA && <div className="ap-sk-ingat">Hanya SUPER_ADMIN yang dapat mengubah status aplikasi.</div>}

      {/* Ditulis di layar, bukan cuma di konsep. SUPER_ADMIN menembus ketiga keadaan —
          kalau tidak disebut, orang yang baru saja membekukan modul lalu masih bisa
          menyimpan akan menyimpulkan pembekuannya tidak bekerja. */}
      <div className="ap-sk-ingat">
        <Snowflake size={14}/>
        <span>
          <b>BEKU</b> menutup penyimpanan tapi membiarkan modul dibuka, dibaca, dan dicetak —
          untuk tutup buku &amp; rekonsiliasi, saat &ldquo;jangan diubah dulu ya&rdquo; di grup
          WhatsApp bukan kontrol. <b>MAINTENANCE</b> menutup modulnya sama sekali.
          SUPER_ADMIN tetap bisa menembus keduanya, jadi ujilah dengan akun lain.
        </span>
      </div>

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
          const val      = bacaKeadaan(status[s.kunci]);
          const isOnline = val === 'online';
          const indukVal = s.induk ? bacaKeadaan(status[s.induk]) : 'online';
          const d        = draf[s.kunci];
          const adaTeks  = Boolean(pesan[s.kunci] || sampai[s.kunci]);
          const bolehIsi = isSA && (!isOnline || adaTeks);

          return (
            <div key={s.kunci} className={`ap-card ap-sk${s.induk ? ' anak' : ''}`}>
              <div className="ap-sk-atas">
                <div className="ap-sk-kiri">
                  <div className="ap-sk-label">{s.label}</div>
                  <div className="ap-row" style={{gap:6}}>
                    <span className={`ap-badge ${val === 'online' ? 'badge-green' : val === 'readonly' ? 'badge-cyan' : 'badge-yellow'}`}>
                      {LABEL_KEADAAN[val]}
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
                  {/* Sakelar berjenjang: induk mati ikut mematikan, induk beku ikut
                      membekukan — dan kalimatnya harus menyebut yang MANA, kalau tidak
                      orang mengira turunannya masih bisa ditulis. */}
                  {indukVal !== 'online' && val === 'online' && (
                    <div className="ap-sk-sebab">
                      {indukVal === 'readonly'
                        ? 'Sudah ikut beku karena induknya dibekukan.'
                        : 'Sudah ikut mati karena induknya dimatikan.'}
                    </div>
                  )}
                </div>
                {/* Sakelar tiga keadaan, jadi bukan lagi tuas dua posisi. Tuas yang
                    dipaksa menampung tiga keadaan selalu menyembunyikan yang ketiga di
                    balik klik kedua — dan yang tersembunyi itu justru yang paling sering
                    dibutuhkan. */}
                {isSA && (
                  <div className="ap-sk-seg" role="group" aria-label={`Keadaan ${s.label}`}>
                    {KEADAAN_SAKELAR.map(k => {
                      // Tombol mati WAJIB menyebut sebabnya (L79c). Yang dilarang cuma
                      // BEKU pada sakelar baca — dan kalimatnya sama persis dengan yang
                      // dipulangkan API, supaya keduanya tidak pernah berbeda bunyi.
                      const dilarang = k === 'readonly' && !s.bisaBeku;
                      return (
                        <button key={k} type="button" disabled={loading || dilarang}
                          className={`ap-sk-seg-btn${val === k ? ' aktif' : ''} k-${k}`}
                          data-tooltip={dilarang ? SEBAB_TAK_BISA_BEKU : ''}
                          onClick={()=>pilihKeadaan(s.kunci, s.label, k)}>
                          {LABEL_KEADAAN[k]}
                        </button>
                      );
                    })}
                  </div>
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
                    <PrimaButton variant="ghost" size="sm" style={{marginTop:8}}
                      iconLeft={<MessageSquare size={12}/>} onClick={()=>bukaDraf(s.kunci)}>
                      {pesan[s.kunci] ? 'UBAH KETERANGAN' : 'TULIS KETERANGAN'}
                    </PrimaButton>
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
                    <PrimaButton variant="primary" size="sm" iconLeft={<Save size={12}/>}
                      disabled={loading} onClick={()=>simpanDraf(s.kunci, s.label)}>SIMPAN</PrimaButton>
                    <PrimaButton variant="ghost" size="sm" iconLeft={<X size={12}/>}
                      onClick={()=>tutupDraf(s.kunci)}>BATAL</PrimaButton>
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
