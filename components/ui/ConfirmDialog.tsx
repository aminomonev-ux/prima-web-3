'use client';
// confirmDialog — pengganti native window.confirm dgn dialog design-system.
// Imperative + promise-based: if (!(await confirmDialog({ message }))) return;
// Mount portal sendiri (createRoot) → tak perlu hook / render manual di komponen.
// Tema dideteksi dari <html data-theme>. Esc / klik luar / Batal = false.

import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import PrimaButton from './PrimaButton';

type Variant = 'danger' | 'primary' | 'warning' | 'success' | 'purple';

export interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
}

function ConfirmUI({ opts, onDone }: { opts: ConfirmOpts; onDone: (v: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone(false);
      if (e.key === 'Enter') onDone(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDone]);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const c = {
    card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB',
    sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C',
  };

  return (
    <div onClick={() => onDone(false)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true"
        style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, padding: 22, width: 'min(420px,94vw)', boxShadow: isLight ? '0 24px 60px rgba(0,0,0,.18)' : '0 24px 60px rgba(0,0,0,.6)' }}>
        {opts.title && <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>{opts.title}</h2>}
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.sub, whiteSpace: 'pre-line', marginBottom: 18 }}>{opts.message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <PrimaButton variant="ghost" onClick={() => onDone(false)}>{opts.cancelLabel ?? 'Batal'}</PrimaButton>
          <PrimaButton variant={opts.variant ?? 'danger'} onClick={() => onDone(true)}>{opts.confirmLabel ?? 'Hapus'}</PrimaButton>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (val: boolean) => {
      root.unmount();
      host.remove();
      resolve(val);
    };
    root.render(<ConfirmUI opts={opts} onDone={done} />);
  });
}

// ─── promptDialog — konfirmasi yang MEMINTA satu kalimat ─────────────────────
// P9 (Tahap 7): pemberian/pencabutan akses, ubah peran, dan hapus permanen wajib
// menyebut ALASANNYA. Audit hari ini menjawab *apa* dan *siapa*, tidak pernah *kenapa* —
// dan enam bulan kemudian tidak ada yang ingat kenapa seorang staf gudang punya akses
// BLUD.
//
// Tinggal di berkas yang SAMA dengan `confirmDialog`, bukan komponen dialog kedua: dua
// dialog dengan dua tampilan akan berbeda bunyi begitu salah satunya disunting (L78),
// dan yang paling gampang berbeda justru bagian yang paling perlu terbaca sama — tombol
// mana yang membatalkan.
//
// `confirmDialog` TIDAK diubah bentuk balasannya. Ia dipakai 30-an tempat yang
// mengharapkan `boolean`; menambah field ke sana berarti menyentuh semuanya untuk
// keperluan tiga layar.

export interface PromptOpts extends ConfirmOpts {
  /** Label di atas kotak isian. */
  label: string;
  placeholder?: string;
  maxLength?: number;
  /**
   * Kosong tidak boleh diterima. Alasan opsional = alasan yang tidak pernah diisi;
   * kalau memang boleh kosong, jangan tanyakan sama sekali.
   */
  minLength?: number;
  /**
   * Isian awal — dipakai saat alasannya SUDAH ADA dan tinggal disetujui: persetujuan
   * permintaan akses membawa kalimat yang ditulis pemohon (P4/§12 P9, "di sana
   * alasannya sudah ditulis pemohon").
   *
   * Sengaja mengisi, bukan melewati dialognya: yang dilepas adalah keharusan MENGARANG
   * kalimat (aturan 11.4), bukan kesempatan melihat pintu mana yang akan dibuka dan
   * ditutup — dan satu simpanan bisa membawa perubahan lain yang tidak diminta pemohon.
   */
  nilaiAwal?: string;
}

/** `null` = dibatalkan. String = alasan yang diketik (sudah di-trim). */
export type HasilPrompt = string | null;

function PromptUI({ opts, onDone }: { opts: PromptOpts; onDone: (v: HasilPrompt) => void }) {
  const [teks, setTeks] = useState(opts.nilaiAwal ?? '');
  const maks = opts.maxLength ?? 140;
  const min = opts.minLength ?? 4;
  const cukup = teks.trim().length >= min;

  useEffect(() => {
    // Enter TIDAK menyetujui di sini — kursornya ada di kotak isian, dan menekan Enter
    // sambil mengetik alasan akan mengirim kalimat setengah jadi.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDone]);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const c = {
    card: isLight ? '#FAFAFA' : '#042C53',
    text: isLight ? '#0F0F12' : '#E6F1FB',
    sub: isLight ? '#6B7280' : '#85B7EB',
    border: isLight ? 'rgba(0,0,0,.1)' : '#0C447C',
    field: isLight ? '#FFFFFF' : '#020F1C',
  };

  return (
    <div onClick={() => onDone(null)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true"
        style={{ background: c.card, color: c.text, border: `1px solid ${c.border}`, borderRadius: 14, padding: 22, width: 'min(460px,94vw)', boxShadow: isLight ? '0 24px 60px rgba(0,0,0,.18)' : '0 24px 60px rgba(0,0,0,.6)' }}>
        {opts.title && <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>{opts.title}</h2>}
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: c.sub, whiteSpace: 'pre-line', marginBottom: 16 }}>{opts.message}</div>

        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: c.sub, marginBottom: 6 }}>
          {opts.label}
        </label>
        <textarea
          autoFocus rows={2} maxLength={maks} value={teks}
          onChange={e => setTeks(e.target.value)}
          placeholder={opts.placeholder}
          style={{ width: '100%', background: c.field, color: c.text, border: `1px solid ${c.border}`, borderRadius: 6, padding: '9px 11px', fontSize: 13, lineHeight: 1.55, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: c.sub }}>
            {cukup ? 'Tersimpan di jejak audit dan garis waktu orang ini.' : `Minimal ${min} huruf.`}
          </span>
          <span style={{ fontSize: 11, color: c.sub, fontFamily: "'JetBrains Mono',monospace" }}>{teks.length}/{maks}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <PrimaButton variant="ghost" onClick={() => onDone(null)}>{opts.cancelLabel ?? 'Batal'}</PrimaButton>
          <PrimaButton variant={opts.variant ?? 'warning'} disabled={!cukup} onClick={() => onDone(teks.trim())}>
            {opts.confirmLabel ?? 'Lanjut'}
          </PrimaButton>
        </div>
      </div>
    </div>
  );
}

export function promptDialog(opts: PromptOpts): Promise<HasilPrompt> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise<HasilPrompt>(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (val: HasilPrompt) => {
      root.unmount();
      host.remove();
      resolve(val);
    };
    root.render(<PromptUI opts={opts} onDone={done} />);
  });
}
