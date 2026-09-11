'use client';
// components/akses/MintaAksesModal.tsx — kotak "Minta akses" di kartu /menu (P4, Tahap 11).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P4.
//
// SATU isian, dan itu memang seluruh rancangannya. Alur promosi punya kata sandi ulang,
// kode rahasia, cooldown, dan probation — sepadan untuk kenaikan tingkat wewenang, tapi
// untuk membuka satu pintu modul yang sehari-hari, gesekan sebesar itu melanggar aturan
// 11.4: yang terjadi bukan keamanan, melainkan orang kembali mengirim WhatsApp.
//
// Kelas `.promo-*` dipinjam dari modal promosi, bukan disalin jadi kelas baru: keduanya
// kotak kecil di atas kanvas gelap yang sama, dan dua salinan gaya untuk satu bentuk
// akan mulai berbeda begitu salah satunya disunting (aturan 11.5, dan gate E ikut aman
// karena tidak ada satu pun warna baru yang dikarang).

import { useState } from 'react';
import { X, KeyRound } from 'lucide-react';
import PrimaButton from '@/components/ui/PrimaButton';
import { MAKS_ALASAN, MIN_ALASAN } from '@/lib/admin/permintaan-baris';

interface Props {
  appKey: string;
  label: string;
  onClose: () => void;
  onSuccess: (pesan: string) => void;
}

export function MintaAksesModal({ appKey, label, onClose, onSuccess }: Props) {
  const [alasan, setAlasan] = useState('');
  const [kirim, setKirim]   = useState(false);
  const [galat, setGalat]   = useState('');

  const kurang = MIN_ALASAN - alasan.trim().length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setGalat('');
    if (kurang > 0) { setGalat(`Ceritakan sedikit keperluannya — kurang ${kurang} huruf.`); return; }
    setKirim(true);
    try {
      // `fetch` dan `.json()` dipisah, keduanya di dalam try — balasan proxy yang bukan
      // JSON (mis. halaman login saat sesi habis) kalau tidak akan meledak sebagai
      // galat parser yang tidak menerangkan apa pun.
      const res = await fetch('/api/akses/permintaan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_key: appKey, alasan: alasan.trim() }),
      });
      let j: { ok: boolean; message?: string };
      try { j = await res.json(); } catch { j = { ok: false, message: `HTTP ${res.status}` }; }
      if (!res.ok || !j.ok) { setGalat(j.message ?? 'Gagal mengirim permintaan.'); return; }
      onSuccess(j.message ?? 'Permintaan terkirim.');
    } catch (err) {
      setGalat(err instanceof Error ? err.message : 'Jaringan bermasalah.');
    } finally {
      setKirim(false);
    }
  }

  return (
    <div className="promo-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="promo-modal-box compact">
        <div className="promo-modal-header">
          <KeyRound size={20} color="#EF9F27" />
          <h2 className="promo-modal-title">Minta akses {label}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="promo-modal-close">
            <X size={18} />
          </button>
        </div>

        {/* Menyebut siapa yang akan membacanya, bukan cuma "akan diproses". Orang yang
            tahu permintaannya sampai ke meja tertentu tidak perlu mengirim WhatsApp
            susulan untuk memastikan — dan susulan itu persis yang sedang dibuang. */}
        <p style={{ fontSize: 13, color: '#85B7EB', marginTop: 0, marginBottom: 14 }}>
          Permintaan ini masuk ke antrean Super Admin beserta alasannya. Anda akan
          diberi tahu lewat notifikasi, baik saat dibuka maupun saat belum bisa dipenuhi.
        </p>

        <form onSubmit={submit} className="promo-modal-form">
          <div>
            <label className="promo-label" htmlFor="minta-alasan">Untuk keperluan apa?</label>
            <textarea
              id="minta-alasan" className="promo-textarea" rows={3} maxLength={MAKS_ALASAN}
              value={alasan} onChange={(e) => setAlasan(e.target.value)} disabled={kirim}
              placeholder="Mis. diminta Bu Sari menyiapkan laporan pergeseran triwulan III"
              autoFocus
            />
            {/* Sisa huruf disebut, bukan cuma batasnya: batas 140 itu bukan kekikiran —
                kalimat ini dipakai ulang apa adanya sebagai alasan di jejak audit saat
                permintaannya disetujui, dan kolom itu memang selebar itu. */}
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
              {alasan.trim().length}/{MAKS_ALASAN} huruf
              {kurang > 0 && ` · kurang ${kurang} lagi`}
            </div>
          </div>

          {galat && (
            <div style={{ fontSize: 12.5, color: '#E24B4A', fontWeight: 600 }}>{galat}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <PrimaButton type="button" variant="ghost" size="sm" onClick={onClose} disabled={kirim}>
              Batal
            </PrimaButton>
            <PrimaButton type="submit" variant="primary" size="sm" disabled={kirim || kurang > 0}>
              {kirim ? 'Mengirim…' : 'Kirim permintaan'}
            </PrimaButton>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MintaAksesModal;
