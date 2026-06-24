'use client';
// ─── PRIMA E-Anggaran — Pengaturan Tab ─────────────────────────────────────────
// Destructive operations: reset SSK/Realisasi/keduanya per (tahun, sumber).
// Role: SUPER_ADMIN only (cek di backend & UI).

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchJson } from '@/lib/shared/api';
import type { SumberSSK } from '../_types';
import { SUMBER_LIST, SSK_THEME } from '../_utils';
import PrimaButton from '@/components/ui/PrimaButton';
import Tip from '@/components/ui/Tip';
import DeleteIcon from '@/components/ui/DeleteIcon';
import { uiTheme } from '@/lib/theme';

interface Props {
  tahun:    string;
  isLight?: boolean;
  isSuperAdmin: boolean;
}

type Scope = 'ssk' | 'realisasi' | 'both';

interface Preview {
  ssk_total: number;
  realisasi_total: number;
  versi: { versi_tipe: 'MURNI'|'PERUBAHAN'; versi_seq: number; jumlah: number }[];
  realisasi_per_versi: { versi_tipe: 'MURNI'|'PERUBAHAN'; versi_seq: number; jumlah: number }[];
}

type VersiTarget = 'ALL' | string; // 'ALL' atau 'MURNI:0' / 'PERUBAHAN:1'

export default function PengaturanTab({ tahun, isLight = false, isSuperAdmin }: Props) {
  const [sumber,       setSumber]       = useState<SumberSSK>('GAJI');
  const [scope,        setScope]        = useState<Scope>('both');
  const [versiTarget,  setVersiTarget]  = useState<VersiTarget>('ALL');
  const [confirmText,  setConfirmText]  = useState('');
  const [preview,      setPreview]      = useState<Preview | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [resetting,    setResetting]    = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  // Surface/teks dari lib/theme; aksen + danger tetap lokal.
  const t = uiTheme(isLight);
  const cSurface     = t.card;
  const cBorder      = isLight ? 'rgba(139,92,246,.18)' : '#0C447C';
  const cTextPrimary = t.text;
  const cTextSub     = t.textSub;
  const cBoxShadow   = t.shadow;
  const cDangerBg    = isLight ? 'rgba(226,75,74,.05)' : 'rgba(226,75,74,.08)';
  const cDangerBor   = isLight ? 'rgba(226,75,74,.25)' : 'rgba(226,75,74,.4)';

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const d = await fetchJson<unknown>(`/api/kinerja/reset?tahun=${tahun}&sumber=${sumber}`);
      if (d.ok) setPreview((d as unknown as { preview: Preview }).preview);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    // Defer ke microtask supaya setState tidak sync di effect body.
    queueMicrotask(() => {
      setVersiTarget('ALL'); // reset versi target setiap ganti sumber
      if (isSuperAdmin) fetchPreview();
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tahun, sumber, isSuperAdmin]);

  async function doReset() {
    if (confirmText !== 'RESET') { toast.error('Ketik "RESET" untuk konfirmasi'); return; }
    setResetting(true);
    try {
      // Parse versiTarget: 'ALL' atau 'MURNI:0' / 'PERUBAHAN:1'
      const versiBody = versiTarget === 'ALL'
        ? {}
        : (() => {
            const [tipe, seq] = versiTarget.split(':');
            return { versi_tipe: tipe as 'MURNI'|'PERUBAHAN', versi_seq: Number(seq) };
          })();
      const d = await fetchJson<unknown>('/api/kinerja/reset', {
        method: 'POST',
        body: JSON.stringify({ tahun, sumber, scope, ...versiBody, confirm: 'RESET' }),
      });
      if (d.ok) {
        const r = d as unknown as { deleted: { ssk: number; realisasi: number } };
        toast.success(`Reset selesai. Dihapus: ${r.deleted.ssk} SSK + ${r.deleted.realisasi} Realisasi.`, { duration: 6000 });
        setShowConfirm(false);
        setConfirmText('');
        fetchPreview();
      } else {
        toast.error(d.message || 'Gagal reset data');
      }
    } finally { setResetting(false); }
  }

  // Daftar opsi versi (gabungan dari SSK & Realisasi versi)
  const versiOptions = (() => {
    if (!preview) return [] as { key: string; label: string; sskCount: number; realCount: number }[];
    const map = new Map<string, { sskCount: number; realCount: number }>();
    for (const v of preview.versi) {
      const k = `${v.versi_tipe}:${v.versi_seq}`;
      const e = map.get(k) ?? { sskCount: 0, realCount: 0 };
      map.set(k, { sskCount: e.sskCount + v.jumlah, realCount: e.realCount });
    }
    for (const v of preview.realisasi_per_versi) {
      const k = `${v.versi_tipe}:${v.versi_seq}`;
      const e = map.get(k) ?? { sskCount: 0, realCount: 0 };
      map.set(k, { sskCount: e.sskCount, realCount: e.realCount + v.jumlah });
    }
    return Array.from(map.entries())
      .map(([key, val]) => {
        const [tipe, seq] = key.split(':');
        return {
          key,
          label: tipe === 'MURNI' ? 'MURNI' : `PERUBAHAN-${seq}`,
          ...val,
        };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  })();

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ background: cDangerBg, border: `1.5px solid ${cDangerBor}`, borderRadius: '12px', padding: '24px', maxWidth: '440px', margin: '0 auto' }}>
          <i className="fas fa-shield-alt" style={{ fontSize: '32px', color: '#E24B4A', marginBottom: '12px' }} />
          <div style={{ fontSize: '14px', fontWeight: 800, color: cTextPrimary, marginBottom: '8px' }}>
            Akses Dibatasi
          </div>
          <div style={{ fontSize: '12px', color: cTextSub, lineHeight: 1.7 }}>
            Halaman Pengaturan hanya bisa diakses oleh role <strong style={{ color: cTextPrimary }}>SUPER_ADMIN</strong>.
            Hubungi administrator kalau butuh akses ke fitur reset data.
          </div>
        </div>
      </div>
    );
  }

  const scopeLabel = scope === 'ssk' ? 'SSK saja' : scope === 'realisasi' ? 'Realisasi saja' : 'SSK + Realisasi (keduanya)';
  const versiLabel = versiTarget === 'ALL' ? 'SEMUA versi' : versiOptions.find(o => o.key === versiTarget)?.label ?? versiTarget;

  // Hitung item-yang-akan-dihapus berdasarkan scope + versi pilihan
  const itemsAfftected = (() => {
    if (!preview) return 0;
    if (versiTarget === 'ALL') {
      if (scope === 'ssk')       return preview.ssk_total;
      if (scope === 'realisasi') return preview.realisasi_total;
      return preview.ssk_total + preview.realisasi_total;
    }
    const opt = versiOptions.find(o => o.key === versiTarget);
    if (!opt) return 0;
    if (scope === 'ssk')       return opt.sskCount;
    if (scope === 'realisasi') return opt.realCount;
    return opt.sskCount + opt.realCount;
  })();

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ background: cSurface, border: `1px solid ${cBorder}`, borderRadius: '14px', padding: '24px', boxShadow: cBoxShadow, maxWidth: '720px' }}>
        <div style={{ fontSize: '15px', fontWeight: 800, color: cTextPrimary, marginBottom: '6px' }}>
          <i className="fas fa-cog" style={{ marginRight: '8px', color: '#7C5CFC' }} />
          Pengaturan E-Anggaran
        </div>
        <div style={{ fontSize: '12px', color: cTextSub, marginBottom: '20px' }}>
          Reset data E-Anggaran per (tahun, sumber). Tindakan ini <strong style={{ color: '#E24B4A' }}>destruktif</strong> dan tidak bisa di-undo.
        </div>

        {/* ─── Section: Reset Data ─────────────────────────────────────────── */}
        <div style={{ background: cDangerBg, border: `1.5px solid ${cDangerBor}`, borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#E24B4A', marginBottom: '4px' }}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px' }} />
            Reset Data
          </div>
          <div style={{ fontSize: '11px', color: cTextSub, marginBottom: '16px', lineHeight: 1.6 }}>
            Hapus seluruh data SSK dan/atau Realisasi (semua versi MURNI + PERUBAHAN) untuk (tahun, sumber) yang dipilih.
            Master Rekening <strong style={{ color: cTextPrimary }}>tidak terpengaruh</strong>.
          </div>

          {/* Form */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: cTextSub, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: '6px' }}>
                Tahun (read-only)
              </label>
              <div style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${cBorder}`, background: isLight ? '#F4F5F8' : 'rgba(12,68,124,.3)', fontSize: '12px', fontWeight: 700, color: cTextPrimary }}>
                {tahun}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: cTextSub, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: '6px' }}>
                Sumber
              </label>
              <select value={sumber} onChange={e => setSumber(e.target.value as SumberSSK)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: `1px solid ${cBorder}`, background: cSurface, fontSize: '12px', fontWeight: 700, color: SSK_THEME[sumber].color, cursor: 'pointer' }}>
                {SUMBER_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: cTextSub, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: '6px' }}>
              Scope yang akan dihapus
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { val: 'ssk',       label: 'SSK saja',         icon: 'fa-table' },
                { val: 'realisasi', label: 'Realisasi saja',   icon: 'fa-chart-bar' },
                { val: 'both',      label: 'Keduanya (full)',  icon: 'fa-exclamation-circle' },
              ].map(opt => (
                <button key={opt.val} onClick={() => setScope(opt.val as Scope)}
                  style={{
                    padding: '8px 14px', borderRadius: '8px',
                    border: scope === opt.val ? '2px solid #E24B4A' : `1.5px solid ${cBorder}`,
                    background: scope === opt.val ? 'rgba(226,75,74,.12)' : cSurface,
                    cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                    color: scope === opt.val ? '#E24B4A' : cTextPrimary,
                  }}>
                  <i className={`fas ${opt.icon}`} style={{ marginRight: '6px' }} /> {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Versi target */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: cTextSub, textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: '6px' }}>
              Versi yang akan dihapus
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button onClick={() => setVersiTarget('ALL')}
                style={{
                  padding: '7px 12px', borderRadius: '8px',
                  border: versiTarget === 'ALL' ? '2px solid #E24B4A' : `1.5px solid ${cBorder}`,
                  background: versiTarget === 'ALL' ? 'rgba(226,75,74,.12)' : cSurface,
                  cursor: 'pointer', fontSize: '11px', fontWeight: 700,
                  color: versiTarget === 'ALL' ? '#E24B4A' : cTextPrimary,
                }}>
                <i className="fas fa-asterisk" style={{ marginRight: '5px' }} /> SEMUA versi
              </button>
              {versiOptions.map(opt => (
                <button key={opt.key} onClick={() => setVersiTarget(opt.key)}
                  style={{
                    padding: '7px 12px', borderRadius: '8px',
                    border: versiTarget === opt.key ? '2px solid #E24B4A' : `1.5px solid ${cBorder}`,
                    background: versiTarget === opt.key ? 'rgba(226,75,74,.12)' : cSurface,
                    cursor: 'pointer', fontSize: '11px', fontWeight: 700,
                    color: versiTarget === opt.key ? '#E24B4A' : cTextPrimary,
                  }}>
                  <i className="fas fa-code-branch" style={{ marginRight: '5px' }} /> {opt.label}
                  <span style={{ marginLeft: '6px', fontSize: '9px', fontWeight: 600, color: cTextSub }}>
                    (SSK={opt.sskCount}, Real={opt.realCount})
                  </span>
                </button>
              ))}
            </div>
            {versiOptions.length === 0 && !loading && (
              <div style={{ fontSize: '11px', color: cTextSub, marginTop: '6px', fontStyle: 'italic' }}>
                Belum ada versi tersimpan untuk {sumber} {tahun}.
              </div>
            )}
          </div>

          {/* Preview data yang akan dihapus */}
          <div style={{ background: cSurface, border: `1px solid ${cBorder}`, borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: cTextSub, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <i className="fas fa-eye" style={{ marginRight: '5px' }} /> Preview: data yang akan terhapus
            </div>
            {loading ? (
              <div style={{ fontSize: '12px', color: cTextSub }}>Memuat...</div>
            ) : !preview ? (
              <div style={{ fontSize: '12px', color: cTextSub }}>—</div>
            ) : (
              <div style={{ fontSize: '12px', color: cTextPrimary, lineHeight: 1.7 }}>
                <div>SSK total: <strong style={{ color: '#E24B4A' }}>{preview.ssk_total} baris</strong> ({preview.versi.length} versi: {preview.versi.map(v => `${v.versi_tipe === 'MURNI' ? 'MURNI' : `P-${v.versi_seq}`}=${v.jumlah}`).join(', ') || 'kosong'})</div>
                <div>Realisasi total: <strong style={{ color: '#E24B4A' }}>{preview.realisasi_total} baris</strong></div>
                <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${cBorder}`, fontWeight: 800 }}>
                  Scope <strong style={{ color: '#E24B4A' }}>{scopeLabel}</strong>: <strong style={{ color: '#E24B4A' }}>{itemsAfftected ?? 0} baris</strong> akan dihapus
                </div>
              </div>
            )}
          </div>

          <Tip label={
              !preview ? 'Memuat preview...'
              : itemsAfftected === 0 ? `Tidak ada baris untuk dihapus (${scopeLabel} · ${versiLabel} = 0 baris). Pilih scope/versi lain yang punya data.`
              : `Reset ${itemsAfftected} baris (${scopeLabel} · ${versiLabel})`
            }><PrimaButton variant="danger" size="lg" iconLeft={<DeleteIcon size={16} />}
            onClick={() => setShowConfirm(true)} disabled={!preview || itemsAfftected === 0}
            style={{ width: '100%', justifyContent: 'center' }}>
            <span>
              Reset {scopeLabel} · {versiLabel} — {sumber} {tahun}
              {preview && itemsAfftected === 0 && (
                <span style={{ display:'block', fontSize:'10px', fontWeight:600, marginTop:'4px', opacity:.85 }}>
                  (0 baris untuk dihapus — pilih kombinasi scope/versi yang punya data)
                </span>
              )}
            </span>
          </PrimaButton></Tip>
        </div>
      </div>

      {/* Modal konfirmasi double */}
      {showConfirm && (
        <div onClick={() => !resetting && setShowConfirm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: cSurface, border: `2px solid #E24B4A`, borderRadius: '14px', padding: '24px', maxWidth: '500px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,.5)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#E24B4A', marginBottom: '10px' }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '8px' }} />
              Konfirmasi Reset Data
            </div>
            <div style={{ fontSize: '12px', color: cTextSub, lineHeight: 1.7, marginBottom: '16px' }}>
              Anda akan menghapus <strong style={{ color: '#E24B4A' }}>{itemsAfftected ?? 0} baris</strong> data
              ({scopeLabel} · {versiLabel}) untuk <strong style={{ color: cTextPrimary }}>{sumber} tahun {tahun}</strong>.
              <br /><br />
              <strong style={{ color: '#E24B4A' }}>Tindakan ini PERMANEN dan tidak bisa di-undo.</strong>
              <br /><br />
              Ketik <strong style={{ color: cTextPrimary, fontFamily: 'JetBrains Mono, monospace', background: cDangerBg, padding: '2px 6px', borderRadius: '4px' }}>RESET</strong> di bawah untuk konfirmasi:
            </div>
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} autoFocus disabled={resetting}
              placeholder='Ketik "RESET"'
              style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: `2px solid ${confirmText === 'RESET' ? '#E24B4A' : cBorder}`, background: cSurface, fontSize: '13px', fontWeight: 700, color: cTextPrimary, fontFamily: 'JetBrains Mono, monospace', marginBottom: '14px', outline: 'none' }} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <PrimaButton variant="ghost"
                onClick={() => { setShowConfirm(false); setConfirmText(''); }} disabled={resetting}>
                Batal
              </PrimaButton>
              <PrimaButton variant="danger" iconLeft={<DeleteIcon size={14} />}
                onClick={doReset} disabled={confirmText !== 'RESET' || resetting}>
                {resetting ? 'Menghapus...' : 'Ya, Reset'}
              </PrimaButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
