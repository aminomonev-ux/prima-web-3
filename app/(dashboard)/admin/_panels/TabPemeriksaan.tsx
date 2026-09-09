'use client';
// app/(dashboard)/admin/_panels/TabPemeriksaan.tsx — P10 Pemeriksaan Mandiri.
//
// Tujuh pertanyaan yang selama ini butuh SQL manual, jadi tidak pernah ditanyakan
// sampai ada yang salah. Yang ditampilkan cuma temuan + jumlah + ke mana harus pergi.
//
// TIDAK ADA tombol perbaiki, dan itu keputusan, bukan kekurangan: perbaikan otomatis
// atas wewenang adalah cara tercepat membuat orang kehilangan akses tanpa ada yang
// tahu kenapa. Yang aman diperbaiki mesin (grant mubazir) pun tetap diserahkan ke
// manusia — kalau tidak, layar ini berhenti bisa dipercaya sebagai laporan.
import { RefreshCw, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import type { Temuan } from '@/lib/admin/pemeriksaan';

const IKON = {
  merah:  <AlertCircle size={15}/>,
  kuning: <AlertTriangle size={15}/>,
  aman:   <CheckCircle2 size={15}/>,
} as const;

const KELAS = { merah: 'red', kuning: 'yellow', aman: 'green' } as const;

/**
 * Datanya dipegang `admin-client.tsx`, bukan komponen ini. Sebabnya lencana angka di
 * rel: ia harus menyala tanpa tabnya dibuka. Dua pemuat untuk satu fakta akan berarti
 * lencana dan isi layar bisa menyebut jumlah yang berbeda (L88).
 */
export function TabPemeriksaan(
  { temuan, loading, jam, err, onMuat }:
  { temuan: Temuan[]; loading: boolean; jam: string; err: string; onMuat: () => void },
) {
  const perluDilihat = temuan.filter(t => t.keparahan !== 'aman').length;

  return (
    <div>
      <div className="ap-pm-kepala">
        <div className="ap-section-title" style={{margin:0,border:'none',padding:0}}>PEMERIKSAAN MANDIRI</div>
        <div className="ap-row" style={{gap:10}}>
          {jam && <span className="ap-pm-jam">data per {jam}</span>}
          <PrimaButton variant="ghost" size="sm" iconLeft={<RefreshCw size={12}/>} onClick={onMuat} disabled={loading}>
            {loading ? 'MEMERIKSA…' : 'PERIKSA ULANG'}
          </PrimaButton>
        </div>
      </div>

      {/* Tetap sebaris, BUKAN toast: kalau pemuatannya gagal, layarnya kosong — dan
          pesan yang menghilang sendiri membuat orang menatap halaman kosong tanpa tahu
          kenapa. Toast untuk yang lewat, spanduk untuk yang bertahan. */}
      {err && <div className="ap-sk-ingat" style={{marginBottom:12}}>{err}</div>}

      {!err && temuan.length > 0 && (
        <div className={perluDilihat ? 'ap-sk-ingat' : 'ap-pm-bersih'}>
          {perluDilihat
            ? <>{IKON.kuning}<span>{perluDilihat} dari {temuan.length} pemeriksaan menemukan sesuatu. Tidak ada yang diperbaiki otomatis — semuanya keputusan Anda.</span></>
            : <>{IKON.aman}<span>Ketujuh pemeriksaan bersih.</span></>}
        </div>
      )}

      <div className="ap-pm-daftar">
        {temuan.map(t => (
          <div key={t.id} className={`ap-card ap-pm ${t.keparahan}`}>
            <div className="ap-pm-atas">
              <span className={`ap-pm-ikon ${KELAS[t.keparahan]}`}>{IKON[t.keparahan]}</span>
              <div className="ap-pm-judul">{t.judul}</div>
              <span className={`ap-badge ${t.keparahan==='merah'?'badge-red':t.keparahan==='kuning'?'badge-yellow':'badge-green'}`}>
                {t.jumlah}
              </span>
            </div>
            <div className="ap-pm-ringkas">{t.ringkas}</div>
            {t.contoh.length > 0 && (
              <ul className="ap-pm-contoh">
                {t.contoh.map((c,i)=><li key={i}>{c}</li>)}
              </ul>
            )}
            {t.jumlah > 0 && <div className="ap-pm-tindakan">{t.tindakan}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
